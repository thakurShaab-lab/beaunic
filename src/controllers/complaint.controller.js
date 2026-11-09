const { z } = require('zod')
const { sendValidationError } = require('../utils/validationError')
const authModel = require('../models/auth.model')
const complaintModel = require('../models/complaint.model')
const { validateRequestDevice } = require('./device&app.controller')
const { findLoggedInCustomer } = require('./profile.controller')
const { noMarkup } = require('./address.controller')
const { convertNulls } = require('../utils/convertNulls')
const { formatDate } = require('../utils/formatDate')

// wl_complaints.status
const STATUS = { PENDING: '1', IN_PROGRESS: '2', RESOLVED: '3', CLOSED: '4' }
const STATUS_LABELS = { '1': 'Pending', '2': 'In Progress', '3': 'Resolved', '4': 'Closed' }

// Status names the app may send: 1-4, "pending", "In Progress", "in_progress", "resolved", "closed"
const STATUS_NAMES = { pending: '1', inprogress: '2', resolved: '3', closed: '4' }
const toStatus = (value) => {
    if (typeof value === 'number') return String(value)
    if (typeof value !== 'string') return value
    const key = value.trim().toLowerCase().replace(/[^a-z0-9]/g, '')
    return STATUS_NAMES[key] ?? key
}

// The list tabs: Open = Pending + In Progress, Resolved = Resolved + Closed; a single status filters exactly
const OPEN_STATUSES = [STATUS.PENDING, STATUS.IN_PROGRESS]
const DONE_STATUSES = [STATUS.RESOLVED, STATUS.CLOSED]
const LIST_FILTERS = { open: OPEN_STATUSES, resolved: DONE_STATUSES, pending: ['1'], inprogress: ['2'], closed: ['4'] }

const deviceFields = {
    app_id: z.union([z.string(), z.number()]),
    device_id: z.string().trim().min(1, 'Device ID is required'),
}

const complaintId = z.coerce.number({ error: 'Complaint ID is required' }).int().positive('Complaint ID is required')

const message = (label, max) =>
    z.string({ error: `Please enter your ${label}` })
        .trim()
        .min(1, `Please enter your ${label}`)
        .max(max, `${label[0].toUpperCase() + label.slice(1)} can be up to ${max} characters`)
        .refine(noMarkup, 'Invalid characters')

const addComplaintSchema = z.object({
    ...deviceFields,
    salonId: z.coerce.number({ error: 'Please select a salon' }).int().positive('Please select a salon'),
    // "Order / Booking": a booking ID from wl_bookings (bookingId is accepted too)
    orderId: z.coerce.number({ error: 'Please select a booking' }).int().positive('Please select a booking').optional(),
    bookingId: z.coerce.number({ error: 'Please select a booking' }).int().positive('Please select a booking').optional(),
    subject: z.string({ error: 'Please enter a subject' })
        .trim()
        .min(3, 'Subject must be at least 3 characters')
        .max(150, 'Subject can be up to 150 characters')
        .refine(noMarkup, 'Invalid characters'),
    complaint: message('complaint', 2000),
}).strict().superRefine((d, ctx) => {
    if (d.orderId === undefined && d.bookingId === undefined) {
        ctx.addIssue({ code: 'custom', path: ['orderId'], message: 'Please select a booking' })
    }
})

// Both filters are optional: blank, null or missing means "don't filter by it"
const listComplaintsSchema = z.object({
    ...deviceFields,
    complaintId: complaintId.optional(),
    status: z.preprocess(
        (value) => (typeof value === 'string' ? value.trim().toLowerCase().replace(/[^a-z]/g, '') : value),
        z.enum(Object.keys(LIST_FILTERS), { error: 'Status must be one of: open, resolved, pending, in progress, closed' }).optional()
    ),
}).strict()

const conversationSchema = z.object({
    ...deviceFields,
    complaintId,
}).strict()

const replySchema = z.object({
    ...deviceFields,
    complaintId,
    message: message('message', 2000),
}).strict()

const statusSchema = z.object({
    ...deviceFields,
    complaintId,
    status: z.preprocess(
        toStatus,
        z.enum(Object.values(STATUS), { error: 'Status must be one of: pending, in progress, resolved, closed' })
    ),
}).strict()

// Any logged-in, active account; returns null (after replying) otherwise
const findCustomer = async (req, res, data, allowedType) => {
    const customer = await findLoggedInCustomer(req, res, data)
    if (!customer) return null

    if (allowedType && customer.customerType !== allowedType) {
        res.status(200).json({
            success: false,
            message: allowedType === '1' ? 'This feature is only available for Salon Partners.' : 'This feature is only available for Users.',
        })
        return null
    }

    if (!['1', '2'].includes(customer.customerType)) {
        res.status(200).json({ success: false, message: 'This feature is not available for your account.' })
        return null
    }

    return customer
}

const sendNotFound = (res) => res.status(200).json({ success: false, message: 'Complaint not found.' })

const fullName = (complaint) => [complaint.customerFirstName, complaint.customerLastName].filter(Boolean).join(' ').trim() || null

// "Anjali Singh" -> "AS"
const initials = (name) => (name ? name.split(/\s+/).slice(0, 2).map((part) => part[0].toUpperCase()).join('') : null)

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// "2026-10-06 18:10:00" -> "06 Oct · 06:10 PM", shown under each message
const messageTime = (value) => {
    const match = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})/.exec(value || '')
    if (!match) return null
    const hour = Number(match[4])
    return `${match[3]} ${MONTHS[Number(match[2]) - 1]} · ${String(hour % 12 || 12).padStart(2, '0')}:${match[5]} ${hour < 12 ? 'AM' : 'PM'}`
}

const senderName = (complaint, senderType) => (senderType === '1' ? complaint.salonName : fullName(complaint))

const formatComplaint = (complaint, summary) => {
    const customerName = fullName(complaint)
    const lastReply = summary?.lastReply

    return {
        complaintId: complaint.complaintId,
        complaintNumber: `CMP-${complaint.complaintId}`,
        orderId: complaint.orderId,
        // The booking number, from wl_bookings ("BK-12")
        orderNumber: complaint.orderId ? `BK-${complaint.orderId}` : null,
        bookingId: complaint.orderId || null,
        order: complaint.orderId
            ? {
                orderId: complaint.orderId,
                invoiceNumber: complaint.invoiceNumber,
                orderStatus: complaint.orderStatus,
                serviceName: complaint.serviceName,
                paymentStatus: complaint.paymentStatus,
                totalAmount: complaint.totalAmount,
                orderDate: formatDate(complaint.orderReceivedDate),
            }
            : null,
        subject: complaint.complaintSubject,
        description: complaint.complaintDescription,
        status: complaint.status,
        statusLabel: STATUS_LABELS[complaint.status],
        isOpen: OPEN_STATUSES.includes(complaint.status),
        canReply: complaint.status !== STATUS.CLOSED,
        customer: { customerId: complaint.customerId, name: customerName, initials: initials(customerName) },
        salon: { salonId: complaint.salonId, salonName: complaint.salonName },
        // The complaint itself is the first message
        messageCount: 1 + (summary?.replyCount || 0),
        lastMessage: lastReply
            ? { message: lastReply.replyMessage, senderType: lastReply.customerType, senderName: senderName(complaint, lastReply.customerType), addedAt: lastReply.replyAddedDate }
            : { message: complaint.complaintDescription, senderType: '2', senderName: customerName, addedAt: complaint.complaintAddedDate },
        openedDate: formatDate(complaint.complaintAddedDate),
        addedAt: complaint.complaintAddedDate,
        updatedAt: complaint.complaintUpdatedDate,
        resolvedAt: complaint.complaintResolvedDate,
        closedAt: complaint.complaintClosedDate,
    }
}

const formatMessage = (customer, { replyId, senderId, senderType, senderName: name, message: text, addedAt }) => ({
    replyId,
    senderId,
    senderType,
    senderRole: senderType === '1' ? 'salon' : 'customer',
    senderName: name,
    isMine: senderId === customer.customerId,
    message: text,
    addedAt,
    timeLabel: messageTime(addedAt),
})

const buildMessages = (customer, complaint, replies) => [
    formatMessage(customer, {
        replyId: null,
        senderId: complaint.customerId,
        senderType: '2',
        senderName: fullName(complaint),
        message: complaint.complaintDescription,
        addedAt: complaint.complaintAddedDate,
    }),
    ...replies.map((reply) =>
        formatMessage(customer, {
            replyId: reply.replyId,
            senderId: reply.customerId,
            senderType: reply.customerType,
            senderName: senderName(complaint, reply.customerType),
            message: reply.replyMessage,
            addedAt: reply.replyAddedDate,
        })
    ),
]

const sendComplaint = async (res, message, complaintId, customer) => {
    const complaint = await complaintModel.findComplaint(customer, complaintId)
    const [summary] = await complaintModel.findReplySummaries([complaintId])

    return res.status(200).json({
        success: true,
        message,
        data: convertNulls({ complaint: formatComplaint(complaint, summary) }),
    })
}

// "Add Complaint" (Users only)
const addComplaint = async (req, res) => {
    if (!(await validateRequestDevice(req, res))) return

    const parsed = addComplaintSchema.safeParse(req.body)

    if (!parsed.success) return sendValidationError(res, parsed.error)

    const d = parsed.data

    try {
        const customer = await findCustomer(req, res, d, '2')
        if (!customer) return

        const [salon, order] = await Promise.all([
            complaintModel.findActiveSalon(d.salonId),
            complaintModel.findCustomerOrder(customer.customerId, d.bookingId ?? d.orderId),
        ])

        if (!salon) {
            return res.status(200).json({ success: false, message: 'Salon not found.' })
        }

        // The booking must be the customer's own, at the salon the complaint is against
        if (!order || order.salonId !== salon.salonId) {
            return res.status(200).json({ success: false, message: 'Booking not found for this salon.' })
        }

        const now = authModel.nowString()
        const complaintId = await complaintModel.createComplaint({
            customerId: customer.customerId,
            salonId: salon.salonId,
            orderId: order.orderId,
            complaintSubject: d.subject,
            complaintDescription: d.complaint,
            status: STATUS.PENDING,
            complaintAddedDate: now,
            complaintUpdatedDate: now,
        })

        return await sendComplaint(res, 'Complaint submitted successfully', complaintId, customer)
    } catch (err) {
        console.error('Add complaint error:', err)
        return res.status(200).json({ success: false, message: 'Something went wrong' })
    }
}

// "My Complaints" for Users, the Open / Resolved tabs for Salon Partners; complaintId gives one complaint
const listComplaints = async (req, res) => {
    if (!(await validateRequestDevice(req, res))) return

    const parsed = listComplaintsSchema.safeParse(req.body)

    if (!parsed.success) return sendValidationError(res, parsed.error)

    const { complaintId: id, status } = parsed.data

    try {
        const customer = await findCustomer(req, res, parsed.data)
        if (!customer) return

        if (id !== undefined) {
            const complaint = await complaintModel.findComplaint(customer, id)
            if (!complaint) return sendNotFound(res)

            const [summary] = await complaintModel.findReplySummaries([id])

            return res.status(200).json({
                success: true,
                message: 'Complaint fetched successfully',
                data: convertNulls({ complaint: formatComplaint(complaint, summary) }),
            })
        }

        const [complaints, statusCounts] = await Promise.all([
            complaintModel.findComplaints(customer, { statuses: status && LIST_FILTERS[status] }),
            complaintModel.countComplaintsByStatus(customer),
        ])

        const summaries = await complaintModel.findReplySummaries(complaints.map((complaint) => complaint.complaintId))
        const countOf = (statuses) => statusCounts.filter((row) => statuses.includes(row.status)).reduce((sum, row) => sum + Number(row.total), 0)

        return res.status(200).json({
            success: true,
            message: complaints.length ? 'Complaints fetched successfully' : 'No complaints found',
            data: convertNulls({
                total: complaints.length,
                counts: {
                    all: countOf(Object.values(STATUS)),
                    open: countOf(OPEN_STATUSES),
                    resolved: countOf(DONE_STATUSES),
                },
                complaints: complaints.map((complaint) =>
                    formatComplaint(complaint, summaries.find((row) => row.complaintId === complaint.complaintId))),
            }),
        })
    } catch (err) {
        console.error('List complaints error:', err)
        return res.status(200).json({ success: false, message: 'Something went wrong' })
    }
}

// The chat screen: the complaint and every message, oldest first
const getConversation = async (req, res) => {
    if (!(await validateRequestDevice(req, res))) return

    const parsed = conversationSchema.safeParse(req.body)

    if (!parsed.success) return sendValidationError(res, parsed.error)

    try {
        const customer = await findCustomer(req, res, parsed.data)
        if (!customer) return

        const complaint = await complaintModel.findComplaint(customer, parsed.data.complaintId)
        if (!complaint) return sendNotFound(res)

        const replies = await complaintModel.findReplies(complaint.complaintId)
        const lastReply = replies[replies.length - 1] || null

        return res.status(200).json({
            success: true,
            message: 'Conversation fetched successfully',
            data: convertNulls({
                complaint: formatComplaint(complaint, { replyCount: replies.length, lastReply }),
                messages: buildMessages(customer, complaint, replies),
            }),
        })
    } catch (err) {
        console.error('Complaint conversation error:', err)
        return res.status(200).json({ success: false, message: 'Something went wrong' })
    }
}

// Either side can reply until the complaint is closed
const replyToComplaint = async (req, res) => {
    if (!(await validateRequestDevice(req, res))) return

    const parsed = replySchema.safeParse(req.body)

    if (!parsed.success) return sendValidationError(res, parsed.error)

    const d = parsed.data

    try {
        const customer = await findCustomer(req, res, d)
        if (!customer) return

        const complaint = await complaintModel.findComplaint(customer, d.complaintId)
        if (!complaint) return sendNotFound(res)

        if (complaint.status === STATUS.CLOSED) {
            return res.status(200).json({ success: false, message: 'This complaint is closed. No more replies can be added.' })
        }

        const now = authModel.nowString()
        const complaintValues = { complaintUpdatedDate: now }

        // The salon's first reply moves it to In Progress; a User replying to a resolved complaint reopens it
        if (customer.customerType === '1' && complaint.status === STATUS.PENDING) {
            complaintValues.status = STATUS.IN_PROGRESS
        } else if (customer.customerType === '2' && complaint.status === STATUS.RESOLVED) {
            complaintValues.status = STATUS.IN_PROGRESS
            complaintValues.complaintResolvedDate = null
        }

        await complaintModel.addReply({
            complaintId: complaint.complaintId,
            customerId: customer.customerId,
            customerType: customer.customerType,
            replyMessage: d.message,
            replyAddedDate: now,
        }, complaintValues)

        const replies = await complaintModel.findReplies(complaint.complaintId)
        const updated = { ...complaint, ...complaintValues }

        return res.status(200).json({
            success: true,
            message: 'Reply sent successfully',
            data: convertNulls({
                complaint: formatComplaint(updated, { replyCount: replies.length, lastReply: replies[replies.length - 1] }),
                messages: buildMessages(customer, updated, replies),
            }),
        })
    } catch (err) {
        console.error('Complaint reply error:', err)
        return res.status(200).json({ success: false, message: 'Something went wrong' })
    }
}

// "Mark Resolved", and any other status change (Salon Partners only)
const updateComplaintStatus = async (req, res) => {
    if (!(await validateRequestDevice(req, res))) return

    const parsed = statusSchema.safeParse(req.body)

    if (!parsed.success) return sendValidationError(res, parsed.error)

    const d = parsed.data

    try {
        const customer = await findCustomer(req, res, d, '1')
        if (!customer) return

        const complaint = await complaintModel.findComplaint(customer, d.complaintId)
        if (!complaint) return sendNotFound(res)

        if (complaint.status === STATUS.CLOSED) {
            return res.status(200).json({ success: false, message: 'This complaint is closed and can no longer be changed.' })
        }

        if (complaint.status === d.status) {
            return res.status(200).json({ success: false, message: `Complaint is already ${STATUS_LABELS[d.status].toLowerCase()}.` })
        }

        const now = authModel.nowString()
        const values = { status: d.status, complaintUpdatedDate: now }

        if (d.status === STATUS.RESOLVED) values.complaintResolvedDate = now
        if (d.status === STATUS.CLOSED) {
            values.complaintClosedDate = now
            values.complaintResolvedDate = complaint.complaintResolvedDate || now
        }
        if (OPEN_STATUSES.includes(d.status)) values.complaintResolvedDate = null

        await complaintModel.updateComplaint(complaint.complaintId, values)

        return await sendComplaint(res, `Complaint marked as ${STATUS_LABELS[d.status].toLowerCase()}`, complaint.complaintId, customer)
    } catch (err) {
        console.error('Complaint status error:', err)
        return res.status(200).json({ success: false, message: 'Something went wrong' })
    }
}

module.exports = { addComplaint, listComplaints, getConversation, replyToComplaint, updateComplaintStatus }
