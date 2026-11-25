const path = require('path')
const fs = require('fs/promises')
const crypto = require('crypto')
const { z } = require('zod')
const env = require('../config/env')
const { sendValidationError } = require('../utils/validationError')
const { convertNulls } = require('../utils/convertNulls')
const { validateRequestDevice } = require('./device&app.controller')
const { findLoggedInCustomer } = require('./profile.controller')
const { rupees } = require('./service.controller')
const authModel = require('../models/auth.model')
const commissionModel = require('../models/commission.model')
const { buildCommissionInvoicePdf } = require('../utils/commissionInvoicePdf')

// Commission (Salon Partners only): what the partner owes the admin for each paid booking.
//   /commission/list             "Commission": booking value, the entries (booking, amount, %, commission, Paid / Unpaid)
//   /commission/invoices         "Commission Invoices": one invoice per month (CINV-2026-09), Paid / Unpaid
//   /commission/invoice/details  one invoice with its entries and the PDF ("View Invoice")
// The % is set per booking by the admin; until then the entry shows "Set by Admin" and no amount.

const DEFAULT_PAGE_SIZE = 10
const MAX_PAGE_SIZE = 50
const SET_BY_ADMIN = 'Set by Admin'

const STATUS_LABELS = { paid: 'Paid', unpaid: 'Unpaid' }
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

const deviceFields = {
    app_id: z.union([z.string(), z.number()]),
    device_id: z.string().trim().min(1, 'Device ID is required'),
}

const blankToUndefined = (value) => (typeof value === 'string' && !value.trim() ? undefined : value ?? undefined)

const pageFields = {
    page: z.coerce.number({ error: 'Page must be a number' }).int('Page must be a whole number').min(1, 'Page must be 1 or more').optional(),
    limit: z.coerce.number({ error: 'Limit must be a number' })
        .int('Limit must be a whole number')
        .min(1, 'Limit must be 1 or more')
        .max(MAX_PAGE_SIZE, `Limit can be at most ${MAX_PAGE_SIZE}`)
        .optional(),
}

const monthField = z.preprocess(
    blankToUndefined,
    z.string().trim().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Month must be in YYYY-MM format').optional()
)

// No filters: every commission entry of every month and year, newest first; only page / limit
const listSchema = z.object({
    ...deviceFields,
    ...pageFields,
}).strict()

// No filters: every invoice of every month and year, latest first; only page / limit
const invoicesSchema = z.object({
    ...deviceFields,
    ...pageFields,
}).strict()

// One invoice: by its number ("CINV-2026-09") or its month ("2026-09")
const invoiceDetailsSchema = z.object({
    ...deviceFields,
    invoiceNumber: z.preprocess(
        (value) => (typeof value === 'string' ? value.trim().toUpperCase() || undefined : value ?? undefined),
        z.string().regex(/^CINV-\d{4}-(0[1-9]|1[0-2])$/, 'Invoice number must be like CINV-2026-09').optional()
    ),
    month: monthField,
}).strict().superRefine((d, ctx) => {
    if (d.invoiceNumber === undefined && d.month === undefined) {
        ctx.addIssue({ code: 'custom', path: ['invoiceNumber'], message: 'Invoice number is required' })
    }
})

const fail = (res, message, extra = {}) => res.status(200).json({ success: false, message, ...extra })

// Salon Partners only (customer_type 1)
const findSalonPartner = async (req, res, data) => {
    const customer = await findLoggedInCustomer(req, res, data)
    if (!customer) return null

    if (customer.customerType !== '1') {
        fail(res, 'This feature is only available for Salon Partners.')
        return null
    }

    return customer
}

const handle = (label, schema, work) => async (req, res) => {
    if (!(await validateRequestDevice(req, res))) return

    const parsed = schema.safeParse(req.body)
    if (!parsed.success) return sendValidationError(res, parsed.error)

    try {
        const partner = await findSalonPartner(req, res, parsed.data)
        if (!partner) return

        return await work(req, res, partner, parsed.data)
    } catch (err) {
        console.error(`${label} error:`, err)
        return fail(res, 'Something went wrong')
    }
}

// "2026-10-07" -> "07 Oct 2026"
const dateLabel = (value) => {
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value || '')
    return match && match[1] !== '0000' ? `${match[3]} ${MONTHS[Number(match[2]) - 1].slice(0, 3)} ${match[1]}` : null
}

// "2026-09" -> "CINV-2026-09", "September 2026", last day "2026-09-30"
const invoiceNumberOf = (month) => `CINV-${month}`
const periodLabelOf = (month) => `${MONTHS[Number(month.slice(5, 7)) - 1]} ${month.slice(0, 4)}`
const monthEndOf = (month) => {
    const [year, monthNumber] = month.split('-').map(Number)
    return new Date(Date.UTC(year, monthNumber, 0)).toISOString().slice(0, 10)
}

const amountLabel = (value) => rupees(value || 0)

// One booking's commission line ("BK-24031 · 07 Oct 2026 · ₹8,500 · 10 % · ₹850 · Pending")
const formatEntry = (row) => {
    const isSet = row.commission !== null && row.commission !== undefined
    return {
        bookingId: row.bookingId,
        bookingNumber: `BK-${row.bookingId}`,
        date: row.slotDate,
        dateLabel: dateLabel(row.slotDate),
        clientName: [row.firstName, row.lastName].filter(Boolean).join(' ') || null,
        serviceName: row.serviceName,
        // Online = booked in the app, Offline = made by the partner
        bookingType: row.customerType === 'Offline' ? 'Offline' : 'Online',
        bookingAmount: Number(row.totalAmount),
        bookingAmountLabel: amountLabel(row.totalAmount),
        isCommissionSet: isSet,
        commissionPercent: isSet ? Number(row.commission) : null,
        commissionPercentLabel: isSet ? `${Number(row.commission)} %` : SET_BY_ADMIN,
        commissionAmount: isSet ? Number(row.commissionAmount) : null,
        commissionAmountLabel: isSet ? amountLabel(row.commissionAmount) : SET_BY_ADMIN,
        commissionStatus: row.commissionStatus,
        commissionStatusLabel: STATUS_LABELS[row.commissionStatus],
        commissionPaidDate: row.commissionPaidDate,
        commissionPaidDateLabel: dateLabel(row.commissionPaidDate),
    }
}

// The note under the breakdown (Invoice Details screen and PDF)
const BREAKDOWN_NOTE = 'Commission amounts are calculated at the rate configured by Beaunic Admin.'

// One row of a month's booking breakdown: "BK-24031 · ₹8,500 · ₹850" (Booking · Amount · Commission)
const breakdownRow = (entry) => ({
    bookingId: entry.bookingId,
    bookingNumber: entry.bookingNumber,
    amount: entry.bookingAmount,
    amountLabel: entry.bookingAmountLabel,
    commission: entry.commissionAmount,
    commissionLabel: entry.commissionAmountLabel,
})

// A month with its bookings: the Commission Invoices card, plus the breakdown (Booking / Amount / Commission) and
// every entry in full. The breakdown's commission adds up to the card's amount (entries without a % add nothing).
const monthWithBookings = (invoice, entries) => ({
    ...invoice,
    breakdownHeaders: { booking: 'Booking', amount: 'Amount', commission: 'Commission' },
    breakdown: entries.map(breakdownRow),
    note: BREAKDOWN_NOTE,
    commissions: entries,
})

// "Commission": the header totals and note, then every booking's commission card (all months and years, latest
// service date first): BK-24031 · 07 Oct 2026 · Booking Amount · Commission % · Commission · Paid / Unpaid
const listCommissions = handle('Commission list', listSchema, async (req, res, partner, d) => {
    const page = d.page ?? 1
    const limit = d.limit ?? DEFAULT_PAGE_SIZE

    const [summary, rows] = await Promise.all([
        commissionModel.findCommissionSummary(partner.customerId, {}),
        commissionModel.findCommissionEntries(partner.customerId, {}, { limit, offset: (page - 1) * limit }),
    ])

    const total = summary.totalEntries
    const totalPages = Math.ceil(total / limit)

    return res.status(200).json({
        success: true,
        message: rows.length ? 'Commission fetched successfully' : total ? 'No more commission entries' : 'No commission entries yet',
        data: convertNulls({
            title: 'Commission',
            invoicesLabel: 'Invoices',
            summary: {
                // "Booking Value ₹12,400": the paid bookings counted for commission
                bookingValue: summary.bookingValue,
                bookingValueLabel: amountLabel(summary.bookingValue),
                // "Commission Rate · Set by Admin"
                commissionRateLabel: SET_BY_ADMIN,
                totalCommission: summary.totalCommission,
                totalCommissionLabel: amountLabel(summary.totalCommission),
                paidCommission: summary.paidCommission,
                paidCommissionLabel: amountLabel(summary.paidCommission),
                unpaidCommission: summary.unpaidCommission,
                unpaidCommissionLabel: amountLabel(summary.unpaidCommission),
                totalEntries: summary.totalEntries,
                paidEntries: summary.paidEntries,
                unpaidEntries: summary.unpaidEntries,
                // Entries whose % the admin hasn't set yet
                notSetEntries: summary.totalEntries - summary.configuredEntries,
            },
            // "Commission percentage and amount appear once configured by Beaunic Admin. 2 entries pending."
            note: `Commission percentage and amount appear once configured by Beaunic Admin. ${summary.unpaidEntries} ${summary.unpaidEntries === 1 ? 'entry' : 'entries'} pending.`,
            commissions: rows.map(formatEntry),
            pagination: { page, limit, total, totalPages, hasNextPage: page < totalPages },
        }),
    })
})

// A month as an invoice: Paid once every entry has its commission set and paid
const formatInvoice = (row) => {
    const isPaid = row.configuredEntries === row.entries && row.paidEntries === row.entries
    const status = isPaid ? 'paid' : 'unpaid'
    const end = monthEndOf(row.month)
    return {
        invoiceNumber: invoiceNumberOf(row.month),
        month: row.month,
        // "September 2026 · 30 Sep 2026"
        periodLabel: periodLabelOf(row.month),
        date: end,
        dateLabel: dateLabel(end),
        amount: row.amount,
        amountLabel: amountLabel(row.amount),
        bookingValue: row.bookingValue,
        bookingValueLabel: amountLabel(row.bookingValue),
        status,
        statusLabel: STATUS_LABELS[status],
        entries: row.entries,
        paidEntries: row.paidEntries,
        // Bookings of the month whose % the admin hasn't set yet (not in the amount)
        notSetEntries: row.entries - row.configuredEntries,
        paidDate: isPaid ? row.paidDate : null,
        paidDateLabel: isPaid ? dateLabel(row.paidDate) : null,
        buttonLabel: 'View Invoice',
    }
}

// "Commission Invoices": one per month, latest first
const listCommissionInvoices = handle('Commission invoices', invoicesSchema, async (req, res, partner, d) => {
    const page = d.page ?? 1
    const limit = d.limit ?? DEFAULT_PAGE_SIZE

    const invoices = (await commissionModel.findCommissionMonths(partner.customerId)).map(formatInvoice)
    const total = invoices.length
    const totalPages = Math.ceil(total / limit)
    const pageInvoices = invoices.slice((page - 1) * limit, page * limit)

    return res.status(200).json({
        success: true,
        message: pageInvoices.length ? 'Commission invoices fetched successfully' : total ? 'No more commission invoices' : 'No commission invoices yet',
        data: convertNulls({
            title: 'Commission Invoices',
            invoices: pageInvoices,
            pagination: { page, limit, total, totalPages, hasNextPage: page < totalPages },
        }),
    })
})

// Commission invoice PDFs are saved in uploaded_files/commission_invoices. As with booking invoices, the file name
// carries a hash only the server can make, so the link opens without logging in but can't be guessed.
const PDF_FOLDER = 'commission_invoices'
const PDF_DIR = path.join(env.uploadDir, PDF_FOLDER)

const pdfFileName = (salonId, invoiceNumber) => {
    const hash = crypto.createHmac('sha256', process.env.JWT_SECRET).update(`commission-invoice:${salonId}:${invoiceNumber}`).digest('hex').slice(0, 24)
    return `${invoiceNumber}-${hash}.pdf`
}

// Writes the PDF (again each time, so it always matches) and returns its direct link
const saveInvoicePdf = async (salonId, pdfInvoice) => {
    const fileName = pdfFileName(salonId, pdfInvoice.invoiceNumber)
    await fs.mkdir(PDF_DIR, { recursive: true })
    await fs.writeFile(path.join(PDF_DIR, fileName), await buildCommissionInvoicePdf(pdfInvoice))
    return `${env.staticFileBaseUrl.replace(/\/+$/, '')}/${PDF_FOLDER}/${fileName}`
}

// One invoice ("View Invoice"): its totals, every entry and the PDF link
const getCommissionInvoice = handle('Commission invoice details', invoiceDetailsSchema, async (req, res, partner, d) => {
    const month = d.month ?? d.invoiceNumber.slice(5)
    if (d.month !== undefined && d.invoiceNumber !== undefined && d.invoiceNumber !== invoiceNumberOf(d.month)) {
        return fail(res, 'Invoice number and month don\'t match.', { field: 'invoiceNumber' })
    }

    const [months, rows, profile] = await Promise.all([
        commissionModel.findCommissionMonths(partner.customerId, { year: month.slice(0, 4) }),
        commissionModel.findMonthEntries(partner.customerId, month),
        authModel.findProfile(partner.customerId),
    ])
    const monthRow = months.find((row) => row.month === month)
    if (!monthRow) return fail(res, 'Commission invoice not found.', { field: 'invoiceNumber' })

    const details = monthWithBookings(formatInvoice(monthRow), rows.map(formatEntry))

    // The PDF is drawn from exactly what this screen shows: number, period, status, breakdown and note
    let downloadUrl = null
    try {
        downloadUrl = await saveInvoicePdf(partner.customerId, details)
    } catch (err) {
        console.error(`Commission invoice ${details.invoiceNumber} PDF error:`, err)
    }

    const { commissions, ...invoice } = details
    return res.status(200).json({
        success: true,
        message: 'Commission invoice fetched successfully',
        data: convertNulls({
            invoice: {
                ...invoice,
                // "DOWNLOAD INVOICE": the PDF of this month
                downloadLabel: 'DOWNLOAD INVOICE',
                downloadUrl,
                downloadFileName: `${invoice.invoiceNumber}.pdf`,
            },
            salon: { salonId: partner.customerId, salonName: profile?.salonName ?? null },
            commissions,
        }),
    })
})

module.exports = { listCommissions, listCommissionInvoices, getCommissionInvoice, formatEntry, formatInvoice }
