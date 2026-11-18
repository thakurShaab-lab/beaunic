// Service Enquiry chat (Users and Salon Partners), over plain REST:
//   /enquiry/chat       opens the chat; while it's open the app calls it every few seconds with afterMessageId
//                       (the newest messageId it has) to get new messages
//   /enquiry/chat/send  sends a message
//   /enquiry/my-list    the User's enquiries
const { z } = require('zod')
const { sendValidationError } = require('../utils/validationError')
const authModel = require('../models/auth.model')
const chatModel = require('../models/enquiryChat.model')
const { validateRequestDevice } = require('./device&app.controller')
const { findLoggedInCustomer } = require('./profile.controller')
const { noMarkup } = require('./address.controller')
const { convertNulls } = require('../utils/convertNulls')
const { istDateLabels } = require('../utils/istDateLabels')
const { sendMail, escapeHtml } = require('../utils/sendMail')

const DEFAULT_MESSAGES = 30
const MAX_MESSAGES = 100
const DEFAULT_PAGE_SIZE = 10
const MAX_PAGE_SIZE = 50
// How often the app should check for new messages while the chat is open
const POLL_SECONDS = 5

const deviceFields = {
    app_id: z.union([z.string(), z.number()]),
    device_id: z.string().trim().min(1, 'Device ID is required'),
}

const idField = (label) => z.coerce.number({ error: `${label} must be a number` }).int(`${label} must be a number`).positive(`${label} must be a number`)
const enquiryIdField = z.coerce.number({ error: 'Enquiry ID is required' }).int('Enquiry ID is required').positive('Enquiry ID is required')

const chatSchema = z.object({
    ...deviceFields,
    enquiryId: enquiryIdField,
    // New messages: the messageId of the newest message the app has
    afterMessageId: idField('After message ID').optional(),
    // Older messages: the messageId of the oldest message the app has
    beforeMessageId: idField('Before message ID').optional(),
    limit: z.coerce.number({ error: 'Limit must be a number' }).int().min(1, 'Limit must be at least 1').max(MAX_MESSAGES, `Limit can be at most ${MAX_MESSAGES}`).optional(),
}).strict().refine((d) => !(d.afterMessageId && d.beforeMessageId), { message: 'Send either afterMessageId or beforeMessageId, not both', path: ['afterMessageId'] })

const sendSchema = z.object({
    ...deviceFields,
    enquiryId: enquiryIdField,
    // "Write your reply..."
    message: z.string({ error: 'Please write your message' })
        .trim()
        .min(1, 'Please write your message')
        .max(2000, 'Message can be up to 2000 characters')
        .refine(noMarkup, 'Invalid characters'),
}).strict()

const myEnquiriesSchema = z.object({
    ...deviceFields,
    page: z.coerce.number({ error: 'Page must be a number' }).int().min(1, 'Page must be at least 1').optional(),
    limit: z.coerce.number({ error: 'Limit must be a number' }).int().min(1, 'Limit must be at least 1').max(MAX_PAGE_SIZE, `Limit can be at most ${MAX_PAGE_SIZE}`).optional(),
}).strict()

const NOT_FOUND = 'Enquiry not found.'
const CLOSED = 'This enquiry has been closed by the salon. You can no longer send messages.'

// The status badge: New (waiting for the salon) / Replied
const STATUS_LABELS = { new: 'New', replied: 'Replied' }
const statusOf = (replyStatus) => (replyStatus === 'Y' ? 'replied' : 'new')

const customerNameOf = (enquiry) => [enquiry.firstName, enquiry.lastName].map((part) => part && part.trim()).filter(Boolean).join(' ') || 'Customer'
const salonNameOf = (enquiry) => enquiry.salonName || enquiry.salonFirstName || 'Salon'

// "Shalini Verma" -> "SV"
const initialsOf = (name) => String(name || '').split(/\s+/).filter(Boolean).slice(0, 2).map((word) => word[0]).join('').toUpperCase()

// The logged-in account's side of the chat ('salon' / 'customer'), or null when it isn't theirs:
//   Salon Partner: enquiries sent to their own salon that they haven't deleted
//   User: enquiries they sent from the app
const openChat = async (customer, enquiryId) => {
    const enquiry = await chatModel.findChatEnquiry(enquiryId)
    if (!enquiry) return null

    if (customer.customerType === '1' && enquiry.salonId === customer.customerId && enquiry.salonDeleted === '0') return { enquiry, role: 'salon' }
    if (customer.customerType === '2' && enquiry.customerId === customer.customerId) return { enquiry, role: 'customer' }
    return null
}

// The salon can always reply; the customer can't once the salon has deleted the enquiry
const canReplyIn = ({ enquiry, role }) => role === 'salon' || enquiry.salonDeleted === '0'

// One chat bubble: name above it, time below ("09:12 AM", Indian time); isMine for the viewer's side
const formatMessage = (row, enquiry, viewer) => {
    const sent = istDateLabels(row.messageAddedDate)
    return {
        messageId: row.messageId,
        senderType: row.senderType,
        senderName: row.senderType === 'salon' ? salonNameOf(enquiry) : customerNameOf(enquiry),
        message: row.message,
        isMine: row.senderType === viewer ? 1 : 0,
        isRead: row.isRead === '1' ? 1 : 0,
        sentAt: row.messageAddedDate,
        dateLabel: sent.date,
        timeLabel: sent.time,
    }
}

// The top of the screen. Salon Partner: the customer ("Shalini Verma", email, "SV"); User: the salon.
// Then "Service: Bridal Makeup", "Date: 07 Oct 2026" and the status badge.
const formatHeader = (enquiry, viewer) => {
    const status = statusOf(enquiry.replyStatus)
    const title = viewer === 'salon' ? customerNameOf(enquiry) : salonNameOf(enquiry)

    return {
        enquiryId: enquiry.enquiryId,
        title,
        subtitle: viewer === 'salon' ? enquiry.email : enquiry.serviceName,
        initials: initialsOf(title),
        serviceName: enquiry.serviceName,
        enquiryDateLabel: istDateLabels(enquiry.receiveDate).date,
        status,
        statusLabel: STATUS_LABELS[status],
    }
}

// Salon Partners and Users only
const findChatAccount = async (req, res, data) => {
    const customer = await findLoggedInCustomer(req, res, data)
    if (!customer) return null

    if (customer.customerType !== '1' && customer.customerType !== '2') {
        res.status(200).json({ success: false, message: 'This feature is not available for your account.' })
        return null
    }
    return customer
}

// Website / admin enquiries have no app User, so the salon's message is also emailed to the customer
const emailCustomer = async (enquiry, text) => {
    const salonName = salonNameOf(enquiry)
    const name = customerNameOf(enquiry)
    const result = await sendMail({
        to: enquiry.email,
        subject: `Re: Your enquiry${enquiry.serviceName ? ` about ${enquiry.serviceName}` : ''} - ${salonName}`,
        html: `<p>Hi ${escapeHtml(name)},</p><p>${escapeHtml(text).replace(/\r?\n/g, '<br>')}</p><p>Regards,<br>${escapeHtml(salonName)}</p>`,
        text: `Hi ${name},\n\n${text}\n\nRegards,\n${salonName}`,
        fromName: salonName,
    }).catch(() => ({ sent: false }))
    return result.sent ? 1 : 0
}

// The chat screen: header and messages, oldest first. Without beforeMessageId (opening the chat, or checking for
// new messages) the other side's messages are marked as read.
const getChat = async (req, res) => {
    if (!(await validateRequestDevice(req, res))) return

    const parsed = chatSchema.safeParse(req.body)

    if (!parsed.success) return sendValidationError(res, parsed.error)

    const d = parsed.data

    try {
        const customer = await findChatAccount(req, res, d)
        if (!customer) return

        const chat = await openChat(customer, d.enquiryId)
        if (!chat) return res.status(200).json({ success: false, message: NOT_FOUND })

        const { enquiry, role } = chat
        const other = role === 'salon' ? 'customer' : 'salon'

        if (!d.beforeMessageId) await chatModel.markRead(enquiry.enquiryId, other, authModel.nowString())

        const [{ messages, hasMore }, lastReadMessageId] = await Promise.all([
            chatModel.findMessages(enquiry.enquiryId, { afterMessageId: d.afterMessageId, beforeMessageId: d.beforeMessageId, limit: d.limit ?? DEFAULT_MESSAGES }),
            chatModel.findLastReadMessageId(enquiry.enquiryId, role),
        ])
        const canReply = canReplyIn(chat)

        return res.status(200).json({
            success: true,
            message: 'Chat fetched successfully',
            data: convertNulls({
                viewerType: role,
                header: formatHeader(enquiry, role),
                messages: messages.map((row) => formatMessage(row, enquiry, role)),
                // With afterMessageId: more new messages are waiting (call again); otherwise: older messages exist
                hasMore: hasMore ? 1 : 0,
                oldestMessageId: messages.length ? messages[0].messageId : null,
                newestMessageId: messages.length ? messages[messages.length - 1].messageId : d.afterMessageId ?? null,
                // Your messages up to this ID have been read by the other side (read ticks)
                lastReadMessageId,
                pollSeconds: POLL_SECONDS,
                canReply: canReply ? 1 : 0,
                closedMessage: canReply ? null : CLOSED,
                // The bin icon (Salon Partner): /enquiry/partner/delete
                canDelete: role === 'salon' ? 1 : 0,
            }),
        })
    } catch (err) {
        console.error('Enquiry chat error:', err)
        return res.status(200).json({ success: false, message: 'Something went wrong' })
    }
}

// "Send Reply": saves the message. A salon message marks the enquiry Replied, a customer message marks it New.
const sendChatMessage = async (req, res) => {
    if (!(await validateRequestDevice(req, res))) return

    const parsed = sendSchema.safeParse(req.body)

    if (!parsed.success) return sendValidationError(res, parsed.error)

    const d = parsed.data

    try {
        const customer = await findChatAccount(req, res, d)
        if (!customer) return

        const chat = await openChat(customer, d.enquiryId)
        if (!chat) return res.status(200).json({ success: false, message: NOT_FOUND })
        if (!canReplyIn(chat)) return res.status(200).json({ success: false, message: CLOSED })

        const { enquiry, role } = chat
        const row = await chatModel.addMessage({
            enquiryId: enquiry.enquiryId,
            senderType: role,
            senderId: customer.customerId,
            message: d.message,
            now: authModel.nowString(),
        })
        const status = role === 'salon' ? 'replied' : 'new'
        const emailSent = role === 'salon' && !enquiry.customerId ? await emailCustomer(enquiry, d.message) : null

        return res.status(200).json({
            success: true,
            message: 'Message sent',
            data: convertNulls({
                enquiryId: enquiry.enquiryId,
                status,
                statusLabel: STATUS_LABELS[status],
                message: formatMessage(row, enquiry, role),
                // Only for enquiries without an app User: 1 = also emailed to the customer
                emailSent,
            }),
        })
    } catch (err) {
        console.error('Send enquiry message error:', err)
        return res.status(200).json({ success: false, message: 'Something went wrong' })
    }
}

// "My Enquiries" (User): latest activity first, with the last message and unread salon messages
const listMyEnquiries = async (req, res) => {
    if (!(await validateRequestDevice(req, res))) return

    const parsed = myEnquiriesSchema.safeParse(req.body)

    if (!parsed.success) return sendValidationError(res, parsed.error)

    const page = parsed.data.page ?? 1
    const limit = parsed.data.limit ?? DEFAULT_PAGE_SIZE

    try {
        const customer = await findLoggedInCustomer(req, res, parsed.data)
        if (!customer) return

        if (customer.customerType !== '2') {
            return res.status(200).json({ success: false, message: 'This feature is only available for Users.' })
        }

        const [rows, total] = await Promise.all([
            chatModel.findCustomerEnquiries(customer.customerId, { limit, offset: (page - 1) * limit }),
            chatModel.countCustomerEnquiries(customer.customerId),
        ])
        const totalPages = Math.ceil(total / limit)

        return res.status(200).json({
            success: true,
            message: rows.length ? 'Enquiries fetched successfully' : 'No enquiries yet',
            data: convertNulls({
                enquiries: rows.map((row) => {
                    const status = statusOf(row.replyStatus)
                    const salonName = salonNameOf(row)
                    const last = istDateLabels(row.lastMessageDate || row.receiveDate)
                    return {
                        enquiryId: row.enquiryId,
                        salonId: row.salonId,
                        salonName,
                        initials: initialsOf(salonName),
                        serviceName: row.serviceName,
                        status,
                        statusLabel: STATUS_LABELS[status],
                        lastMessage: row.lastMessage,
                        lastMessageIsMine: row.lastSenderType === 'customer' ? 1 : 0,
                        lastMessageDateLabel: last.date,
                        lastMessageTimeLabel: last.time,
                        unreadCount: row.unreadCount,
                        enquiryDateLabel: istDateLabels(row.receiveDate).date,
                        isClosed: row.salonDeleted === '1' ? 1 : 0,
                    }
                }),
                pagination: { page, limit, total, totalPages, hasNextPage: page < totalPages },
            }),
        })
    } catch (err) {
        console.error('My enquiries error:', err)
        return res.status(200).json({ success: false, message: 'Something went wrong' })
    }
}

module.exports = { getChat, sendChatMessage, listMyEnquiries }
