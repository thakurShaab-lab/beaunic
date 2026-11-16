const { z } = require('zod')
const { sendValidationError } = require('../utils/validationError')
const authModel = require('../models/auth.model')
const disputeModel = require('../models/dispute.model')
const { validateRequestDevice } = require('./device&app.controller')
const { findLoggedInCustomer } = require('./profile.controller')
const { noMarkup } = require('./address.controller')
const { convertNulls } = require('../utils/convertNulls')
const { istDateLabels } = require('../utils/istDateLabels')

// Salon Partners raise disputes with Beaunic Admin ("Raise a Dispute") and track them ("Dispute History").
// Admin answers from the admin panel (wl_disputes.status, admin_response).

// wl_disputes.status
const STATUS = { OPEN: '1', IN_REVIEW: '2', RESOLVED: '3', REJECTED: '4' }
const STATUS_LABELS = { '1': 'Open', '2': 'In Review', '3': 'Resolved', '4': 'Rejected' }
const ACTIVE_STATUSES = [STATUS.OPEN, STATUS.IN_REVIEW]

// History filters: all (default), open = Open + In Review, resolved, rejected
const LIST_FILTERS = { all: null, open: ACTIVE_STATUSES, resolved: [STATUS.RESOLVED], rejected: [STATUS.REJECTED] }
const FILTER_LABELS = { all: 'All', open: 'Open', resolved: 'Resolved', rejected: 'Rejected' }

const DEFAULT_PAGE_SIZE = 10
const MAX_PAGE_SIZE = 50
const MAX_OPTIONS = 50
const MAX_DESCRIPTION = 500

const deviceFields = {
    app_id: z.union([z.string(), z.number()]),
    device_id: z.string().trim().min(1, 'Device ID is required'),
}

const relatedTypeField = z.preprocess(
    (value) => (typeof value === 'string' ? value.trim().toLowerCase() : value),
    z.enum(['booking', 'order'], { error: 'Related type must be booking or order' })
)

const disputeId = z.coerce.number({ error: 'Dispute ID is required' }).int().positive('Dispute ID is required')

const optionsSchema = z.object({
    ...deviceFields,
    // Only bookings, only orders, or both (default)
    type: relatedTypeField.optional(),
}).strict()

const addDisputeSchema = z.object({
    ...deviceFields,
    // "Related Booking / Order": optional; send both or neither (values from /dispute/related-options)
    relatedType: relatedTypeField.optional(),
    relatedId: z.coerce.number({ error: 'Please select a booking or order' }).int().positive('Please select a booking or order').optional(),
    subject: z.string({ error: 'Please enter the issue summary' })
        .trim()
        .min(3, 'Issue summary must be at least 3 characters')
        .max(150, 'Issue summary can be up to 150 characters')
        .refine(noMarkup, 'Invalid characters'),
    description: z.string({ error: 'Please describe the issue' })
        .trim()
        .min(10, 'Description must be at least 10 characters')
        .max(MAX_DESCRIPTION, `Description can be up to ${MAX_DESCRIPTION} characters`)
        .refine(noMarkup, 'Invalid characters'),
}).strict().superRefine((d, ctx) => {
    if ((d.relatedType === undefined) !== (d.relatedId === undefined)) {
        ctx.addIssue({ code: 'custom', path: [d.relatedType === undefined ? 'relatedType' : 'relatedId'], message: 'Please select a booking or order' })
    }
})

const listDisputesSchema = z.object({
    ...deviceFields,
    status: z.preprocess(
        (value) => (typeof value === 'string' ? value.trim().toLowerCase() : value),
        z.enum(Object.keys(LIST_FILTERS), { error: 'Status must be one of: all, open, resolved, rejected' }).optional()
    ),
    page: z.coerce.number({ error: 'Page must be a number' }).int().min(1, 'Page must be at least 1').optional(),
    limit: z.coerce.number({ error: 'Limit must be a number' }).int().min(1, 'Limit must be at least 1').max(MAX_PAGE_SIZE, `Limit can be at most ${MAX_PAGE_SIZE}`).optional(),
}).strict()

const detailsSchema = z.object({
    ...deviceFields,
    disputeId,
}).strict()

// Disputes are for Salon Partners only
const findPartner = async (req, res, data) => {
    const customer = await findLoggedInCustomer(req, res, data)
    if (!customer) return null

    if (customer.customerType !== '1') {
        res.status(200).json({ success: false, message: 'This feature is only available for Salon Partners.' })
        return null
    }

    return customer
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// "2026-10-06" -> "06 Oct 2026" (a date with no time, e.g. the booking's slot date)
const dayLabel = (value) => {
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value || '')
    if (!match || match[1] === '0000') return null
    return `${match[3]} ${MONTHS[Number(match[2]) - 1]} ${match[1]}`
}

// 32 -> "DSP-032"
const disputeNumber = (id) => `DSP-${String(id).padStart(3, '0')}`

const bookingItem = (booking) => {
    const customerName = [booking.firstName, booking.lastName].filter(Boolean).join(' ').trim() || null
    const date = dayLabel(booking.slotDate)
    const number = `BK-${booking.bookingId}`

    return {
        relatedType: 'booking',
        relatedId: booking.bookingId,
        number,
        title: booking.serviceName,
        subtitle: [customerName, date].filter(Boolean).join(' · ') || null,
        // "BK-16 · Spa and Facial · 13 Nov 2026", for the dropdown
        label: [number, booking.serviceName, date].filter(Boolean).join(' · '),
        customerName,
        date,
        amount: booking.totalAmount,
        status: booking.orderStatus,
        paymentStatus: booking.paymentStatus,
    }
}

const orderItem = (order) => {
    const date = istDateLabels(order.orderDate).date
    const number = `ORD-${order.orderId}`
    const title = order.membershipName ? `${order.membershipName} Membership` : 'Membership'

    return {
        relatedType: 'order',
        relatedId: order.orderId,
        number,
        title,
        subtitle: [order.invoiceNumber ? `Invoice ${order.invoiceNumber}` : null, date].filter(Boolean).join(' · ') || null,
        label: [number, title, date].filter(Boolean).join(' · '),
        customerName: null,
        date,
        amount: order.totalPrice,
        status: order.orderStatus,
        paymentStatus: order.paymentStatus,
    }
}

const formatDispute = (dispute, related) => {
    const added = istDateLabels(dispute.disputeAddedDate)
    const resolved = istDateLabels(dispute.disputeResolvedDate)
    const relatedNumber = dispute.relatedType === 'booking' ? `BK-${dispute.relatedId}`
        : dispute.relatedType === 'order' ? `ORD-${dispute.relatedId}` : null

    return {
        disputeId: dispute.disputeId,
        disputeNumber: disputeNumber(dispute.disputeId),
        subject: dispute.disputeSubject,
        description: dispute.disputeDescription,
        status: dispute.status,
        // The chip: Open / In Review / Resolved / Rejected
        statusLabel: STATUS_LABELS[dispute.status],
        isOpen: ACTIVE_STATUSES.includes(dispute.status) ? 1 : 0,
        // "Related: ORD-5009"
        relatedType: dispute.relatedType,
        relatedId: dispute.relatedId || null,
        relatedNumber,
        relatedLabel: relatedNumber ? `Related: ${relatedNumber}` : 'Related: General',
        related: related || null,
        adminResponse: dispute.adminResponse,
        // "06 Oct 2026" (Indian time)
        raisedDate: added.date,
        raisedTime: added.time,
        raisedDateTime: added.dateTime,
        resolvedDateTime: resolved.dateTime,
        addedAt: dispute.disputeAddedDate,
        updatedAt: dispute.disputeUpdatedDate,
        resolvedAt: dispute.disputeResolvedDate,
    }
}

// Each dispute with its booking / order details, when it still exists
const withRelated = async (salonId, disputes) => {
    const { bookings, orders } = await disputeModel.findRelatedItems(salonId, disputes)

    return disputes.map((dispute) => {
        const booking = dispute.relatedType === 'booking' && bookings.find((row) => row.bookingId === dispute.relatedId)
        const order = dispute.relatedType === 'order' && orders.find((row) => row.orderId === dispute.relatedId)
        return formatDispute(dispute, booking ? bookingItem(booking) : order ? orderItem(order) : null)
    })
}

// "Select booking or order": the partner's latest bookings and membership orders
const getRelatedOptions = async (req, res) => {
    if (!(await validateRequestDevice(req, res))) return

    const parsed = optionsSchema.safeParse(req.body)

    if (!parsed.success) return sendValidationError(res, parsed.error)

    const { type } = parsed.data

    try {
        const partner = await findPartner(req, res, parsed.data)
        if (!partner) return

        const [bookings, orders] = await Promise.all([
            type === 'order' ? [] : disputeModel.findSalonBookings(partner.customerId, MAX_OPTIONS),
            type === 'booking' ? [] : disputeModel.findPartnerOrders(partner.customerId, MAX_OPTIONS),
        ])

        const bookingOptions = bookings.map(bookingItem)
        const orderOptions = orders.map(orderItem)

        return res.status(200).json({
            success: true,
            message: bookingOptions.length || orderOptions.length ? 'Options fetched successfully' : 'No bookings or orders found',
            data: convertNulls({
                placeholder: 'Select booking or order',
                groups: [
                    ...(type === 'order' ? [] : [{ key: 'booking', label: 'Bookings', options: bookingOptions }]),
                    ...(type === 'booking' ? [] : [{ key: 'order', label: 'Orders', options: orderOptions }]),
                ],
            }),
        })
    } catch (err) {
        console.error('Dispute options error:', err)
        return res.status(200).json({ success: false, message: 'Something went wrong' })
    }
}

// "Raise a Dispute"
const addDispute = async (req, res) => {
    if (!(await validateRequestDevice(req, res))) return

    const parsed = addDisputeSchema.safeParse(req.body)

    if (!parsed.success) return sendValidationError(res, parsed.error)

    const d = parsed.data

    try {
        const partner = await findPartner(req, res, d)
        if (!partner) return

        // The booking must be at the partner's salon; the order must be the partner's own
        if (d.relatedType) {
            const item = d.relatedType === 'booking'
                ? await disputeModel.findSalonBooking(partner.customerId, d.relatedId)
                : await disputeModel.findPartnerOrder(partner.customerId, d.relatedId)

            if (!item) {
                return res.status(200).json({ success: false, message: d.relatedType === 'booking' ? 'Booking not found.' : 'Order not found.' })
            }

            const existing = await disputeModel.findOpenDisputeFor(partner.customerId, d.relatedType, d.relatedId)
            if (existing) {
                return res.status(200).json({
                    success: false,
                    message: `You already have an open dispute (${disputeNumber(existing.disputeId)}) for this ${d.relatedType}.`,
                })
            }
        }

        const now = authModel.nowString()
        const id = await disputeModel.createDispute({
            salonId: partner.customerId,
            relatedType: d.relatedType ?? null,
            relatedId: d.relatedId ?? 0,
            disputeSubject: d.subject,
            disputeDescription: d.description,
            status: STATUS.OPEN,
            disputeAddedDate: now,
            disputeUpdatedDate: now,
        })

        const [dispute] = await withRelated(partner.customerId, [await disputeModel.findDispute(partner.customerId, id)])

        return res.status(200).json({
            success: true,
            message: 'Dispute raised successfully. You can track its status in Dispute History.',
            data: convertNulls({ dispute }),
        })
    } catch (err) {
        console.error('Add dispute error:', err)
        return res.status(200).json({ success: false, message: 'Something went wrong' })
    }
}

// "Dispute History", newest first
const listDisputes = async (req, res) => {
    if (!(await validateRequestDevice(req, res))) return

    const parsed = listDisputesSchema.safeParse(req.body)

    if (!parsed.success) return sendValidationError(res, parsed.error)

    const d = parsed.data
    const status = d.status ?? 'all'
    const page = d.page ?? 1
    const limit = d.limit ?? DEFAULT_PAGE_SIZE

    try {
        const partner = await findPartner(req, res, d)
        if (!partner) return

        const [disputes, statusCounts] = await Promise.all([
            disputeModel.findDisputes(partner.customerId, { statuses: LIST_FILTERS[status], limit, offset: (page - 1) * limit }),
            disputeModel.countDisputesByStatus(partner.customerId),
        ])

        const countOf = (statuses) => statusCounts
            .filter((row) => !statuses || statuses.includes(row.status))
            .reduce((sum, row) => sum + Number(row.total), 0)
        const total = countOf(LIST_FILTERS[status])
        const totalPages = Math.ceil(total / limit)

        return res.status(200).json({
            success: true,
            message: disputes.length ? 'Disputes fetched successfully' : 'No disputes found',
            data: convertNulls({
                title: 'Dispute History',
                newButtonLabel: '+ New',
                selectedStatus: status,
                filters: Object.keys(LIST_FILTERS).map((key) => ({
                    key,
                    label: FILTER_LABELS[key],
                    count: countOf(LIST_FILTERS[key]),
                    isSelected: key === status ? 1 : 0,
                })),
                disputes: (await withRelated(partner.customerId, disputes)).map((dispute) => ({ ...dispute, actionLabel: 'View Details' })),
                pagination: { page, limit, total, totalPages, hasNextPage: page < totalPages },
            }),
        })
    } catch (err) {
        console.error('List disputes error:', err)
        return res.status(200).json({ success: false, message: 'Something went wrong' })
    }
}

// "View Details"
const getDisputeDetails = async (req, res) => {
    if (!(await validateRequestDevice(req, res))) return

    const parsed = detailsSchema.safeParse(req.body)

    if (!parsed.success) return sendValidationError(res, parsed.error)

    try {
        const partner = await findPartner(req, res, parsed.data)
        if (!partner) return

        const row = await disputeModel.findDispute(partner.customerId, parsed.data.disputeId)
        if (!row) return res.status(200).json({ success: false, message: 'Dispute not found.' })

        const [dispute] = await withRelated(partner.customerId, [row])

        return res.status(200).json({
            success: true,
            message: 'Dispute fetched successfully',
            data: convertNulls({
                title: dispute.disputeNumber,
                dispute: {
                    ...dispute,
                    adminResponseLabel: dispute.adminResponse ? 'Response from Beaunic Admin' : 'Awaiting response from Beaunic Admin',
                },
            }),
        })
    } catch (err) {
        console.error('Dispute details error:', err)
        return res.status(200).json({ success: false, message: 'Something went wrong' })
    }
}

module.exports = { getRelatedOptions, addDispute, listDisputes, getDisputeDetails }
