const { z } = require('zod')
const { sendValidationError } = require('../utils/validationError')
const refundModel = require('../models/refund.model')
const { validateRequestDevice } = require('./device&app.controller')
const { findLoggedInCustomer } = require('./profile.controller')
const { rupees } = require('./service.controller')
const { convertNulls } = require('../utils/convertNulls')
const { istDateLabels } = require('../utils/istDateLabels')
const env = require('../config/env')
const fs = require('fs/promises')
const path = require('path')
const crypto = require('crypto')
const authModel = require('../models/auth.model')
const { detectImageExt } = require('./auth.controller')
const { noMarkup } = require('./address.controller')

// Transaction slips are saved in uploaded_files/refund_slips
const SLIP_FOLDER = 'refund_slips'
const SLIP_DIR = path.join(env.uploadDir, SLIP_FOLDER)

const DEFAULT_PAGE_SIZE = 10
const MAX_PAGE_SIZE = 50

// The tabs, in screen order
const TABS = [
    { key: 'all', label: 'All' },
    { key: 'pending', label: 'Pending' },
    { key: 'processed', label: 'Processed' },
]

const STATUS_LABELS = { pending: 'Pending', processed: 'Processed' }

// "Refund to Wallet / Bank Account / Back to Source", with the icon the app shows
const REFUND_TO = {
    wallet: { label: 'Wallet', icon: 'wallet' },
    bank_account: { label: 'Bank Account', icon: 'bank' },
    source: { label: 'Back to Source', icon: 'source' },
}

const deviceFields = {
    app_id: z.union([z.string(), z.number()]),
    device_id: z.string().trim().min(1, 'Device ID is required'),
}

// tab, page and limit are optional: all refunds, page 1 of 10 by default
const listRefundsSchema = z.object({
    ...deviceFields,
    tab: z.preprocess(
        (value) => (typeof value === 'string' ? value.trim().toLowerCase() : value),
        z.enum(TABS.map((tab) => tab.key), { error: 'Tab must be one of: all, pending, processed' }).optional()
    ),
    page: z.coerce.number({ error: 'Page must be a number' }).int('Page must be a whole number').min(1, 'Page must be 1 or more').optional(),
    limit: z.coerce.number({ error: 'Limit must be a number' })
        .int('Limit must be a whole number')
        .min(1, 'Limit must be 1 or more')
        .max(MAX_PAGE_SIZE, `Limit can be at most ${MAX_PAGE_SIZE}`)
        .optional(),
}).strict()

const refundIdField = z.coerce.number({ error: 'Refund ID is required' }).int('Refund ID is required').positive('Refund ID is required')

// The slip image comes in the "transactionSlip" file field (required for Bank Account refunds)
const processRefundSchema = z.object({
    ...deviceFields,
    refundId: refundIdField,
    // UTR / transaction ID, optional
    transactionReference: z.string().trim().max(100, 'Transaction reference can be up to 100 characters').refine(noMarkup, 'Invalid characters').optional(),
    refundNote: z.string().trim().max(500, 'Note can be up to 500 characters').refine(noMarkup, 'Invalid characters').optional(),
}).strict()

const refundDetailsSchema = z.object({
    ...deviceFields,
    refundId: refundIdField,
}).strict()

const PROCESS_ERRORS = {
    not_found: 'Refund not found.',
    processed: 'This refund has already been processed.',
    slip_required: 'Please upload the transaction slip for a bank account refund.',
}

// Refunds are paid by Salon Partners (customer_type 1)
const findSalonPartner = async (req, res, data) => {
    const customer = await findLoggedInCustomer(req, res, data)
    if (!customer) return null

    if (customer.customerType !== '1') {
        res.status(200).json({ success: false, message: 'This feature is only available for Salon Partners.' })
        return null
    }

    return customer
}

const slipUrl = (fileName) => (fileName ? `${env.staticFileBaseUrl.replace(/\/+$/, '')}/${SLIP_FOLDER}/${fileName}` : null)

// The button under the card:
//   pending, bank account: "Upload Slip & Mark Processed"; pending, wallet / source: "Mark as Processed";
//   processed with a slip: "View Transaction Slip"; processed without one: no button
const actionOf = (refund) => {
    if (refund.status === 'pending') {
        return refund.refundTo === 'bank_account'
            ? { key: 'upload_slip_and_process', label: 'Upload Slip & Mark Processed', requiresSlip: 1 }
            : { key: 'mark_processed', label: 'Mark as Processed', requiresSlip: 0 }
    }
    return refund.transactionSlip ? { key: 'view_slip', label: 'View Transaction Slip', requiresSlip: 0 } : null
}

// One card: "BK-24019 · Processed", "Pooja Rai", "04 Oct 2026", "₹3,000", "Refund to Wallet" and the button
const formatRefund = (refund) => {
    const refundTo = REFUND_TO[refund.refundTo]

    return {
        refundId: refund.refundId,
        // "BK-24019" / "ORD-5007"
        referenceNumber: refund.referenceNumber,
        sourceType: refund.sourceType,
        sourceId: refund.sourceId,
        status: refund.status,
        statusLabel: STATUS_LABELS[refund.status],
        customerId: refund.customerId || null,
        customerName: refund.customerName,
        // The day the refund was raised (Indian time): "04 Oct 2026"
        dateLabel: istDateLabels(refund.refundAddedDate).date,
        amount: Number(refund.refundAmount),
        amountLabel: rupees(refund.refundAmount),
        refundTo: refund.refundTo,
        refundToLabel: refundTo.label,
        refundToIcon: refundTo.icon,
        transactionSlipUrl: slipUrl(refund.transactionSlip),
        action: actionOf(refund),
    }
}

// "Refunds" (Salon Partner): the refunds the salon owes its customers, with All / Pending / Processed tabs.
// Only the logged-in partner's own refunds.
const listRefunds = async (req, res) => {
    if (!(await validateRequestDevice(req, res))) return

    const parsed = listRefundsSchema.safeParse(req.body)

    if (!parsed.success) return sendValidationError(res, parsed.error)

    const tab = parsed.data.tab ?? 'all'
    const page = parsed.data.page ?? 1
    const limit = parsed.data.limit ?? DEFAULT_PAGE_SIZE

    try {
        const partner = await findSalonPartner(req, res, parsed.data)
        if (!partner) return

        const [refunds, counts] = await Promise.all([
            refundModel.findSalonRefunds(partner.customerId, {
                status: tab === 'all' ? undefined : tab,
                limit,
                offset: (page - 1) * limit,
            }),
            refundModel.countSalonRefunds(partner.customerId),
        ])
        const total = counts[tab]
        const totalPages = Math.ceil(total / limit)

        return res.status(200).json({
            success: true,
            message: refunds.length ? 'Refunds fetched successfully' : 'No refunds found',
            data: convertNulls({
                title: 'Refunds',
                selectedTab: tab,
                // "All · 4", "Pending · 2", "Processed · 2"
                tabs: TABS.map((item) => ({
                    key: item.key,
                    label: item.label,
                    count: counts[item.key],
                    title: `${item.label} · ${counts[item.key]}`,
                    isSelected: item.key === tab ? 1 : 0,
                })),
                refunds: refunds.map(formatRefund),
                pagination: { page, limit, total, totalPages, hasNextPage: page < totalPages },
            }),
        })
    } catch (err) {
        console.error('List refunds error:', err)
        return res.status(200).json({ success: false, message: 'Something went wrong' })
    }
}

// The uploaded slip with a stored file name; undefined when none was sent, null (after replying) when it isn't an image
const prepareSlip = (req, res) => {
    if (!req.file) return undefined

    const ext = detectImageExt(req.file.buffer)
    if (!ext) {
        res.status(200).json({ success: false, message: 'Transaction slip must be a PNG, JPG, WEBP or HEIC image' })
        return null
    }

    return { name: crypto.randomBytes(12).toString('hex') + ext, buffer: req.file.buffer }
}

const writeSlip = async (slip) => {
    await fs.mkdir(SLIP_DIR, { recursive: true })
    await fs.writeFile(path.join(SLIP_DIR, slip.name), slip.buffer)
}

const deleteSlip = (name) => fs.unlink(path.join(SLIP_DIR, name)).catch(() => { })

// "Upload Slip & Mark Processed" / "Mark as Processed" (Salon Partner).
// The slip is required for a Bank Account refund and optional otherwise. A wallet refund is credited to the customer's wallet.
const processRefund = async (req, res) => {
    if (!(await validateRequestDevice(req, res))) return

    const parsed = processRefundSchema.safeParse(req.body)

    if (!parsed.success) return sendValidationError(res, parsed.error)

    const d = parsed.data
    let slip

    try {
        const partner = await findSalonPartner(req, res, d)
        if (!partner) return

        slip = prepareSlip(req, res)
        if (slip === null) return

        // Checked before saving the file, so a wrong request leaves nothing on disk
        const existing = await refundModel.findSalonRefund(partner.customerId, d.refundId)
        if (!existing) return res.status(200).json({ success: false, message: PROCESS_ERRORS.not_found })
        if (existing.status === 'processed') return res.status(200).json({ success: false, message: PROCESS_ERRORS.processed })
        if (existing.refundTo === 'bank_account' && !slip) return res.status(200).json({ success: false, message: PROCESS_ERRORS.slip_required })

        if (slip) await writeSlip(slip)

        const result = await refundModel.processRefund({
            salonId: partner.customerId,
            refundId: d.refundId,
            values: {
                transactionSlip: slip ? slip.name : null,
                transactionReference: d.transactionReference || null,
                refundNote: d.refundNote || null,
            },
            now: authModel.nowString(),
        })

        if (result.error) {
            if (slip) await deleteSlip(slip.name)
            return res.status(200).json({ success: false, message: PROCESS_ERRORS[result.error] })
        }

        return res.status(200).json({
            success: true,
            message: 'Refund marked as processed',
            data: convertNulls({ refund: formatRefund(result.refund) }),
        })
    } catch (err) {
        if (slip) await deleteSlip(slip.name)
        console.error('Process refund error:', err)
        return res.status(200).json({ success: false, message: 'Something went wrong' })
    }
}

// "Transaction Slip" (Salon Partner): "ORD-5007 · Nidhi Tiwari", the slip image, "Refund method" and "Processed on"
const getRefundDetails = async (req, res) => {
    if (!(await validateRequestDevice(req, res))) return

    const parsed = refundDetailsSchema.safeParse(req.body)

    if (!parsed.success) return sendValidationError(res, parsed.error)

    try {
        const partner = await findSalonPartner(req, res, parsed.data)
        if (!partner) return

        const refund = await refundModel.findSalonRefund(partner.customerId, parsed.data.refundId)
        if (!refund) return res.status(200).json({ success: false, message: PROCESS_ERRORS.not_found })

        return res.status(200).json({
            success: true,
            message: 'Refund details fetched successfully',
            data: convertNulls({
                title: 'Transaction Slip',
                refundId: refund.refundId,
                referenceNumber: refund.referenceNumber,
                customerName: refund.customerName,
                // "ORD-5007 · Nidhi Tiwari"
                subtitle: [refund.referenceNumber, refund.customerName].filter(Boolean).join(' · '),
                status: refund.status,
                transactionSlipUrl: slipUrl(refund.transactionSlip),
                // "Refund method: Bank Account"
                refundMethodLabel: REFUND_TO[refund.refundTo].label,
                // "Processed on: 01 Oct 2026" (Indian time); empty while pending
                processedOnLabel: istDateLabels(refund.refundProcessedDate).date,
            }),
        })
    } catch (err) {
        console.error('Refund details error:', err)
        return res.status(200).json({ success: false, message: 'Something went wrong' })
    }
}

module.exports = { listRefunds, processRefund, getRefundDetails }
