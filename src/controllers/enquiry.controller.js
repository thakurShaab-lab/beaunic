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

module.exports = { getEnquiryForm, sendEnquiry }
