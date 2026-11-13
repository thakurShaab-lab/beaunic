const { z } = require('zod')
const { sendValidationError } = require('../utils/validationError')
const authModel = require('../models/auth.model')
const enquiryModel = require('../models/enquiry.model')
const complaintModel = require('../models/complaint.model')
const serviceModel = require('../models/service.model')
const { validateRequestDevice } = require('./device&app.controller')
const { findLoggedInCustomer } = require('./profile.controller')
const { noMarkup } = require('./address.controller')
const { convertNulls } = require('../utils/convertNulls')
const { sendMail, escapeHtml } = require('../utils/sendMail')

const INTRO = 'Ask about services, availability or bridal packages. The salon replies by email.'

// wl_enquiries.type 1 = Contact Us; salon enquiries are told apart by inquiry_type
const ENQUIRY_TYPE = '1'
const INQUIRY_TYPE = 'Salon Enquiry'

const deviceFields = {
    app_id: z.union([z.string(), z.number()]),
    device_id: z.string().trim().min(1, 'Device ID is required'),
}

const enquiryFormSchema = z.object(deviceFields).strict()

const sendEnquirySchema = z.object({
    ...deviceFields,
    salonId: z.coerce.number({ error: 'Please select a salon' }).int().positive('Please select a salon'),
    // Optional: a service of that salon
    serviceId: z.coerce.number({ error: 'Service ID must be a number' }).int().positive('Service ID must be a number').optional(),
    name: z.string({ error: 'Please enter your name' })
        .trim()
        .min(2, 'Please enter your name')
        .max(60, 'Name can be up to 60 characters')
        .regex(/^[\p{L}\p{M} .'-]+$/u, 'Invalid characters in name'),
    phone: z.string({ error: 'Please enter your phone number' }).trim().regex(/^\d{10}$/, 'Phone must be a 10-digit mobile number'),
    email: z.string({ error: 'Please enter your email' }).trim().toLowerCase().max(80, 'Email can be up to 80 characters').email('Invalid email'),
    message: z.string({ error: 'Please write your message' })
        .trim()
        .min(5, 'Please write your message')
        .max(1000, 'Message can be up to 1000 characters')
        .refine(noMarkup, 'Invalid characters'),
}).strict()

// Salon enquiries are for Users (customer_type 2)
const findUser = async (req, res, data) => {
    const customer = await findLoggedInCustomer(req, res, data)
    if (!customer) return null

    if (customer.customerType !== '2') {
        res.status(200).json({ success: false, message: 'This feature is only available for Users.' })
        return null
    }

    return customer
}

// "Salon Enquiry" screen: the Salon / Service dropdown and the details for "Use my profile details"
const getEnquiryForm = async (req, res) => {
    if (!(await validateRequestDevice(req, res))) return

    const parsed = enquiryFormSchema.safeParse(req.body)

    if (!parsed.success) return sendValidationError(res, parsed.error)

    try {
        const customer = await findUser(req, res, parsed.data)
        if (!customer) return

        const rows = await enquiryModel.findEnquirySalons()

        // One entry per salon, its services inside
        const salons = []
        for (const row of rows) {
            let salon = salons[salons.length - 1]
            if (!salon || salon.salonId !== row.salonId) {
                salon = { salonId: row.salonId, salonName: row.salonName, services: [] }
                salons.push(salon)
            }
            if (row.serviceId) salon.services.push({ serviceId: row.serviceId, serviceName: row.serviceName })
        }

        return res.status(200).json({
            success: true,
            message: 'Enquiry form fetched successfully',
            data: convertNulls({
                intro: INTRO,
                salons,
                // "Use my profile details"
                profile: {
                    name: customer.firstName,
                    phone: customer.mobileNumber,
                    email: customer.userName,
                },
            }),
        })
    } catch (err) {
        console.error('Enquiry form error:', err)
        return res.status(200).json({ success: false, message: 'Something went wrong' })
    }
}

// "Send Enquiry": saved to wl_enquiries for the salon to reply by email
const sendEnquiry = async (req, res) => {
    if (!(await validateRequestDevice(req, res))) return

    const parsed = sendEnquirySchema.safeParse(req.body)

    if (!parsed.success) return sendValidationError(res, parsed.error)

    const d = parsed.data

    try {
        const customer = await findUser(req, res, d)
        if (!customer) return

        const salon = await complaintModel.findActiveSalon(d.salonId)
        if (!salon) return res.status(200).json({ success: false, message: 'Salon not found.', field: 'salonId' })

        let service = null
        if (d.serviceId !== undefined) {
            service = await serviceModel.findActiveServiceWithSalon(d.serviceId)
            if (!service || service.customerId !== salon.salonId) {
                return res.status(200).json({ success: false, message: 'This service is not offered by the selected salon.', field: 'serviceId' })
            }
        }

        // wl_enquiries keeps first and last name separately (30 characters each)
        const [firstName, ...rest] = d.name.split(/\s+/)
        const now = authModel.nowString()
        const enquiryId = await enquiryModel.createEnquiry({
            type: ENQUIRY_TYPE,
            inquiryType: INQUIRY_TYPE,
            entityName: [salon.salonName, service && service.serviceName].filter(Boolean).join(' · ').slice(0, 255),
            entityId: salon.salonId,
            centerId: 0,
            firstName: firstName.slice(0, 30),
            lastName: rest.join(' ').slice(0, 30),
            email: d.email,
            mobileNumber: d.phone,
            requirement: service ? service.serviceName : null,
            message: d.message,
            status: '1',
            replyStatus: 'N',
            receiveDate: now,
        })

        return res.status(200).json({
            success: true,
            message: 'Your enquiry has been sent. The salon will reply by email.',
            data: convertNulls({
                enquiryId,
                salonId: salon.salonId,
                salonName: salon.salonName,
                serviceId: service ? service.serviceId : null,
                serviceName: service ? service.serviceName : null,
                name: d.name,
                phone: d.phone,
                email: d.email,
                message: d.message,
                enquiryDate: now,
            }),
        })
    } catch (err) {
        console.error('Send enquiry error:', err)
        return res.status(200).json({ success: false, message: 'Something went wrong' })
    }
}

// ---------------------------------------------------------------------------------------------------------------
// Salon Partner: "Service Enquiries" list — enquiries customers sent to the partner's own salon

const DEFAULT_PAGE_SIZE = 10
const MAX_PAGE_SIZE = 50

const lowerText = (value) => (typeof value === 'string' ? value.trim().toLowerCase() : value)

const salonEnquiriesSchema = z.object({
    ...deviceFields,
    // Filter chip: all (default), new or replied
    status: z.preprocess(
        lowerText,
        z.enum(['all', ...enquiryModel.ENQUIRY_STATUS_KEYS], { error: 'Status must be all, new or replied' }).optional()
    ),
    // "Search name, email, service"
    search: z.string({ error: 'Search must be text' }).trim().max(100, 'Search can be up to 100 characters').optional(),
    sortBy: z.preprocess(lowerText, z.enum(['newest', 'oldest'], { error: 'Sort must be newest or oldest' }).optional()),
    page: z.coerce.number({ error: 'Page must be a number' }).int().min(1, 'Page must be at least 1').optional(),
    limit: z.coerce.number({ error: 'Limit must be a number' }).int().min(1, 'Limit must be at least 1').max(MAX_PAGE_SIZE, `Limit can be at most ${MAX_PAGE_SIZE}`).optional(),
}).strict()

const ENQUIRY_STATUS_LABELS = { new: 'New', replied: 'Replied' }
const STATUS_FILTERS = [
    { key: 'all', label: 'All' },
    { key: 'new', label: 'New' },
    { key: 'replied', label: 'Replied' },
]

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// Saved times are UTC (authModel.nowString); shown in Indian time.
// "2026-10-06 20:00:00" -> { date: "07 Oct 2026", dateTime: "07 Oct 2026 · 01:30 AM" }
const istLabels = (utcDateTime) => {
    const date = new Date(`${String(utcDateTime).replace(' ', 'T')}Z`)
    if (Number.isNaN(date.getTime())) return { date: null, dateTime: null }
    const p = Object.fromEntries(
        new Intl.DateTimeFormat('en-CA', {
            timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
        }).formatToParts(date).map((part) => [part.type, part.value])
    )
    const hour = Number(p.hour)
    const day = `${p.day} ${MONTHS[Number(p.month) - 1]} ${p.year}`
    return { date: day, dateTime: `${day} · ${String(hour % 12 || 12).padStart(2, '0')}:${p.minute} ${hour < 12 ? 'AM' : 'PM'}` }
}

// "Shalini Verma" -> "SV"
const initialsOf = (name) => String(name || '').split(/\s+/).filter(Boolean).slice(0, 2).map((word) => word[0]).join('').toUpperCase() || null

// Salon Partners only (customer_type 1)
const findSalonPartner = async (req, res, data) => {
    const customer = await findLoggedInCustomer(req, res, data)
    if (!customer) return null

    if (customer.customerType !== '1') {
        res.status(200).json({ success: false, message: 'This feature is only available for Salon Partners.' })
        return null
    }

    return customer
}

// One enquiry card
const formatEnquiryCard = (row) => {
    const name = [row.firstName, row.lastName].map((part) => part && part.trim()).filter(Boolean).join(' ') || null
    const status = row.replyStatus === 'Y' ? 'replied' : 'new'
    const received = istLabels(row.receiveDate)

    return {
        enquiryId: row.enquiryId,
        customerName: name,
        initials: initialsOf(name),
        email: row.email,
        mobileNumber: row.mobileNumber,
        // The service asked about ("Bridal Makeup"); blank when the customer didn't pick one
        serviceName: row.serviceName,
        message: row.message,
        status,
        statusLabel: ENQUIRY_STATUS_LABELS[status],
        isReplied: status === 'replied' ? 1 : 0,
        enquiryDate: row.receiveDate,
        enquiryDateLabel: received.date,
        enquiryDateTimeLabel: received.dateTime,
        // When the partner replied from the app ("" when not replied, or replied from the admin panel)
        replyDate: row.replyDate,
        replyDateLabel: row.replyDate ? istLabels(row.replyDate).date : null,
    }
}

// "Service Enquiries": the logged-in Salon Partner's enquiries, newest first, with search, status filter and pages.
// The salon is always the partner from the token; other salons' enquiries are never included.
const listSalonEnquiries = async (req, res) => {
    if (!(await validateRequestDevice(req, res))) return

    const parsed = salonEnquiriesSchema.safeParse(req.body)

    if (!parsed.success) return sendValidationError(res, parsed.error)

    const d = parsed.data
    const selectedStatus = d.status ?? 'all'
    const page = d.page ?? 1
    const limit = d.limit ?? DEFAULT_PAGE_SIZE
    const search = d.search || undefined

    try {
        const partner = await findSalonPartner(req, res, d)
        if (!partner) return

        const salonId = partner.customerId
        const status = selectedStatus === 'all' ? undefined : selectedStatus
        const [rows, counts] = await Promise.all([
            enquiryModel.findSalonEnquiries(salonId, { status, search, sortBy: d.sortBy, limit, offset: (page - 1) * limit }),
            enquiryModel.countSalonEnquiries(salonId, { search }),
        ])

        const total = status ? counts[status] : counts.total
        const totalPages = Math.ceil(total / limit)

        return res.status(200).json({
            success: true,
            message: rows.length
                ? 'Enquiries fetched successfully'
                : search ? 'No enquiries match your search'
                    : status ? `No ${ENQUIRY_STATUS_LABELS[status].toLowerCase()} enquiries`
                        : 'No enquiries yet',
            data: convertNulls({
                filters: STATUS_FILTERS.map((filter) => ({
                    ...filter,
                    count: filter.key === 'all' ? counts.total : counts[filter.key],
                    isSelected: filter.key === selectedStatus,
                })),
                selectedStatus,
                search: search || null,
                sortBy: d.sortBy ?? 'newest',
                newCount: counts.new,
                enquiries: rows.map(formatEnquiryCard),
                pagination: { page, limit, total, totalPages, hasNextPage: page < totalPages },
            }),
        })
    } catch (err) {
        console.error('Salon enquiries error:', err)
        return res.status(200).json({ success: false, message: 'Something went wrong' })
    }
}

// ---------------------------------------------------------------------------------------------------------------
// View / Reply / Reply to Selected / Delete (Salon Partners, own salon's enquiries only)

const MAX_SELECTED = 50

// One enquiry ID, or several for "Reply to Selected" / bulk delete: 12, "12", "12,15,18" or [12, 15]
const enquiryIdsField = z.preprocess(
    (value) => {
        if (typeof value === 'number') return [value]
        if (typeof value === 'string') return value.split(',').map((part) => part.trim()).filter(Boolean)
        return value
    },
    z.array(
        z.coerce.number({ error: 'Enquiry ID must be a number' }).int('Enquiry ID must be a number').positive('Enquiry ID must be a number'),
        { error: 'Enquiry ID is required' }
    )
        .min(1, 'Enquiry ID is required')
        .max(MAX_SELECTED, `You can select up to ${MAX_SELECTED} enquiries at a time`)
        .transform((ids) => [...new Set(ids)])
)

// wl_enquiries is utf8mb3, which can't store emojis and other 4-byte characters
const noFourByteChars = (value) => !/[\u{10000}-\u{10FFFF}]/u.test(value)

const enquiryDetailsSchema = z.object({
    ...deviceFields,
    enquiryId: z.coerce.number({ error: 'Enquiry ID is required' }).int().positive('Enquiry ID is required'),
}).strict()

const replyEnquirySchema = z.object({
    ...deviceFields,
    enquiryIds: enquiryIdsField,
    // Optional; defaults to "Re: Your enquiry about {service} - {salon}"
    subject: z.string({ error: 'Subject must be text' })
        .trim()
        .max(200, 'Subject can be up to 200 characters')
        .refine(noMarkup, 'Invalid characters')
        .refine(noFourByteChars, 'Emojis are not supported')
        .optional(),
    message: z.string({ error: 'Please write your reply' })
        .trim()
        .min(2, 'Please write your reply')
        .max(2000, 'Reply can be up to 2000 characters')
        .refine(noMarkup, 'Invalid characters')
        .refine(noFourByteChars, 'Emojis are not supported'),
}).strict()

const deleteEnquirySchema = z.object({
    ...deviceFields,
    enquiryIds: enquiryIdsField,
}).strict()

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// All the IDs must be the partner's own (not deleted) enquiries; otherwise nothing is done
const findOwnEnquiries = async (res, salonId, enquiryIds) => {
    const rows = await enquiryModel.findSalonEnquiriesByIds(salonId, enquiryIds)
    if (rows.length !== enquiryIds.length) {
        res.status(200).json({
            success: false,
            message: enquiryIds.length === 1 ? 'Enquiry not found.' : 'Some of the selected enquiries were not found. Please refresh and try again.',
            field: 'enquiryIds',
        })
        return null
    }
    return rows
}

// The reply email: the partner's message, then the customer's enquiry quoted below it
const replyEmail = ({ row, salonName, subject, message }) => {
    const name = [row.firstName, row.lastName].filter(Boolean).join(' ').trim() || 'there'
    const html = `<p>Hi ${escapeHtml(name)},</p>
<p>${escapeHtml(message).replace(/\r?\n/g, '<br>')}</p>
<p>Regards,<br>${escapeHtml(salonName)}</p>
<hr>
<p style="color:#666">Your enquiry${row.serviceName ? ` about ${escapeHtml(row.serviceName)}` : ''} on ${escapeHtml(istLabels(row.receiveDate).date)}:<br>
${escapeHtml(row.message).replace(/\r?\n/g, '<br>')}</p>`
    const text = `Hi ${name},\n\n${message}\n\nRegards,\n${salonName}\n\n---\nYour enquiry${row.serviceName ? ` about ${row.serviceName}` : ''}:\n${row.message}`
    return { to: row.email, subject, html, text }
}

// "View": one enquiry with the customer's details and the partner's reply (if any)
const getSalonEnquiryDetails = async (req, res) => {
    if (!(await validateRequestDevice(req, res))) return

    const parsed = enquiryDetailsSchema.safeParse(req.body)

    if (!parsed.success) return sendValidationError(res, parsed.error)

    try {
        const partner = await findSalonPartner(req, res, parsed.data)
        if (!partner) return

        const [row] = await enquiryModel.findSalonEnquiriesByIds(partner.customerId, [parsed.data.enquiryId])
        if (!row) return res.status(200).json({ success: false, message: 'Enquiry not found.' })

        const card = formatEnquiryCard(row)

        return res.status(200).json({
            success: true,
            message: 'Enquiry fetched successfully',
            data: convertNulls({
                ...card,
                // The partner's reply sent from the app; replied from the admin panel shows isReplied 1 without it
                reply: row.replyDate
                    ? {
                        subject: row.replySubject,
                        message: row.replyMessage,
                        replyDate: row.replyDate,
                        replyDateLabel: istLabels(row.replyDate).date,
                        replyDateTimeLabel: istLabels(row.replyDate).dateTime,
                    }
                    : null,
                // Replying again sends a new email and replaces the saved reply
                canReply: 1,
                canDelete: 1,
            }),
        })
    } catch (err) {
        console.error('Salon enquiry details error:', err)
        return res.status(200).json({ success: false, message: 'Something went wrong' })
    }
}

// "Reply" (one enquiryId) and "Reply to Selected" (several): emails the reply to each customer and marks the
// enquiries Replied. The reply is saved even when the email can't be sent (emailSent tells the app).
const replySalonEnquiries = async (req, res) => {
    if (!(await validateRequestDevice(req, res))) return

    const parsed = replyEnquirySchema.safeParse(req.body)

    if (!parsed.success) return sendValidationError(res, parsed.error)

    const d = parsed.data

    try {
        const partner = await findSalonPartner(req, res, d)
        if (!partner) return

        const rows = await findOwnEnquiries(res, partner.customerId, d.enquiryIds)
        if (!rows) return

        const salon = await complaintModel.findActiveSalon(partner.customerId)
        const salonName = (salon && salon.salonName) || partner.firstName || 'Your salon'
        const now = authModel.nowString()

        // One subject for all; the default names the service when every selected enquiry is about the same one
        const services = [...new Set(rows.map((row) => row.serviceName).filter(Boolean))]
        const subject = d.subject || `Re: Your enquiry${services.length === 1 ? ` about ${services[0]}` : ''} - ${salonName}`

        await enquiryModel.saveSalonReply(partner.customerId, d.enquiryIds, { subject, message: d.message, now })

        // Each customer gets their own email (never one email to everyone)
        const replyTo = EMAIL_PATTERN.test(partner.userName || '') ? partner.userName : undefined
        const results = await Promise.all(rows.map((row) =>
            sendMail({ ...replyEmail({ row, salonName, subject, message: d.message }), fromName: salonName, replyTo })
        ))
        const emailsSent = results.filter((result) => result.sent).length

        return res.status(200).json({
            success: true,
            message: emailsSent === rows.length
                ? (rows.length === 1 ? 'Reply sent successfully' : `Reply sent to ${rows.length} enquiries`)
                : emailsSent === 0
                    ? 'Reply saved, but the email could not be sent to the customer.'
                    : `Reply saved. Email sent to ${emailsSent} of ${rows.length} customers.`,
            data: convertNulls({
                repliedCount: rows.length,
                emailsSent,
                // 0 when email isn't set up on the server (SMTP) or sending failed; the reply is saved either way
                emailSent: emailsSent === rows.length ? 1 : 0,
                subject,
                message: d.message,
                replyDate: now,
                replyDateLabel: istLabels(now).date,
                enquiries: rows.map((row, i) => ({
                    enquiryId: row.enquiryId,
                    customerName: [row.firstName, row.lastName].filter(Boolean).join(' ').trim() || null,
                    status: 'replied',
                    statusLabel: ENQUIRY_STATUS_LABELS.replied,
                    emailSent: results[i].sent ? 1 : 0,
                })),
            }),
        })
    } catch (err) {
        console.error('Reply salon enquiries error:', err)
        return res.status(200).json({ success: false, message: 'Something went wrong' })
    }
}

// The bin icon (one enquiryId) and "Delete" in selection mode (several). Removed from the partner's list only.
const deleteSalonEnquiries = async (req, res) => {
    if (!(await validateRequestDevice(req, res))) return

    const parsed = deleteEnquirySchema.safeParse(req.body)

    if (!parsed.success) return sendValidationError(res, parsed.error)

    const d = parsed.data

    try {
        const partner = await findSalonPartner(req, res, d)
        if (!partner) return

        const rows = await findOwnEnquiries(res, partner.customerId, d.enquiryIds)
        if (!rows) return

        const deleted = await enquiryModel.deleteSalonEnquiries(partner.customerId, d.enquiryIds, authModel.nowString())

        return res.status(200).json({
            success: true,
            message: deleted === 1 ? 'Enquiry deleted successfully' : `${deleted} enquiries deleted successfully`,
            data: { deletedCount: deleted, enquiryIds: rows.map((row) => row.enquiryId) },
        })
    } catch (err) {
        console.error('Delete salon enquiries error:', err)
        return res.status(200).json({ success: false, message: 'Something went wrong' })
    }
}

module.exports = { getEnquiryForm, sendEnquiry, listSalonEnquiries, getSalonEnquiryDetails, replySalonEnquiries, deleteSalonEnquiries }
