const crypto = require('crypto')
const { z } = require('zod')
const authModel = require('../models/auth.model')
const membershipModel = require('../models/membership.model')
const { validateRequestDevice } = require('./device&app.controller')
const { convertNulls } = require('../utils/convertNulls')

const deviceFields = {
    app_id: z.union([z.string(), z.number()]),
    device_id: z.string().trim().min(1, 'Device ID is required'),
}

const listMembershipsSchema = z.object(deviceFields).strict()

const purchaseMembershipSchema = z.object({
    ...deviceFields,
    membershipId: z.coerce.number().int().positive('Membership ID is required'),
}).strict()

const sendValidationError = (res, error) =>
    res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
    })

const isFreePlan = (plan) => plan.isCost === 0 || plan.price === 0

const formatPlan = (plan) => convertNulls({
    membershipId: plan.membershipId,
    title: plan.title,
    planName: plan.planName,
    durationMonths: plan.duration,
    price: plan.price,
    isFree: isFreePlan(plan),
    description: plan.description,
    buyLeadCount: plan.buyLeadCount,
})

// wl_order.duration is stored in months
const addMonths = (dateString, months) => {
    const date = new Date(`${dateString}T00:00:00Z`)
    date.setUTCMonth(date.getUTCMonth() + months)
    return date.toISOString().slice(0, 10)
}

const generateInvoiceNumber = () =>
    `MEM-${membershipModel.todayString().replace(/-/g, '')}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`

const findSalonPartner = async (res, { app_id, device_id }) => {
    const customer = await authModel.findByDevice(String(app_id).trim(), device_id)
    if (!customer) {
        res.status(404).json({ success: false, message: 'Account not found for this device.' })
        return null
    }

    if (customer.customerType !== '1') {
        res.status(403).json({ success: false, message: 'This feature is only available for Salon Partners.' })
        return null
    }

    if (customer.status !== '1') {
        res.status(403).json({
            success: false,
            message: customer.status === '0'
                ? 'Your account is awaiting admin approval.'
                : 'Your account is not active. Please contact support.',
        })
        return null
    }

    return customer
}

const listMemberships = async (req, res) => {
    if (!(await validateRequestDevice(req, res))) return

    const parsed = listMembershipsSchema.safeParse(req.body)

    if (!parsed.success) return sendValidationError(res, parsed.error)

    try {
        const customer = await findSalonPartner(res, parsed.data)
        if (!customer) return

        const [plans, activeMembership] = await Promise.all([
            membershipModel.findActivePlans(),
            membershipModel.findActiveMembership(customer.customerId),
        ])

        return res.status(200).json({
            success: true,
            message: 'Membership plans fetched successfully',
            data: {
                activeMembership: activeMembership && convertNulls(activeMembership),
                plans: plans.map(formatPlan),
            },
        })
    } catch (err) {
        console.error('List memberships error:', err)
        return res.status(500).json({ success: false, message: 'Something went wrong' })
    }
}

const purchaseMembership = async (req, res) => {
    if (!(await validateRequestDevice(req, res))) return

    const parsed = purchaseMembershipSchema.safeParse(req.body)

    if (!parsed.success) return sendValidationError(res, parsed.error)

    try {
        const customer = await findSalonPartner(res, parsed.data)
        if (!customer) return

        const plan = await membershipModel.findActivePlanById(parsed.data.membershipId)
        if (!plan) {
            return res.status(404).json({ success: false, message: 'Membership plan not found.' })
        }

        const activeMembership = await membershipModel.findActiveMembership(customer.customerId)
        if (activeMembership) {
            return res.status(409).json({
                success: false,
                message: `You already have an active membership (${activeMembership.membershipName}) valid until ${activeMembership.endDate}.`,
            })
        }

        // Every purchase is saved as Paid and activated straight away (no payment gateway yet)
        const startDate = membershipModel.todayString()
        const endDate = addMonths(startDate, plan.duration)
        const invoiceNumber = generateInvoiceNumber()

        const orderId = await membershipModel.createOrder({
            order_type: 1,
            customers_id: customer.customerId,
            invoice_number: invoiceNumber,
            first_name: customer.firstName,
            email: customer.userName,
            phone: customer.mobileNumber,
            mship_id: plan.membershipId,
            mship_name: plan.title,
            mship_price: plan.price,
            duration: plan.duration,
            view_leads_count: plan.buyLeadCount,
            description: plan.description,
            pkg_start_date: startDate,
            pkg_end_date: endDate,
            currency_code: 'INR',
            currency_value: '1',
            currency_symbol: '0',
            total_price: plan.price,
            order_status: 'Completed',
            status: '1',
            payment_status: 'Paid',
            payment_method: isFreePlan(plan) ? 'Free' : null,
            project_count: plan.projectCount,
            property_count: plan.propertyCount,
            property_count_rent: plan.propertyCountRent,
            property_count_land: plan.propertyCountLand,
            receive_date: authModel.nowString(),
            membership_status: '1',
        })

        return res.status(201).json({
            success: true,
            message: 'Membership activated successfully',
            data: convertNulls({
                orderId,
                invoiceNumber,
                membershipId: plan.membershipId,
                membershipName: plan.title,
                price: plan.price,
                durationMonths: plan.duration,
                paymentStatus: 'Paid',
                isActive: true,
                startDate,
                endDate,
            }),
        })
    } catch (err) {
        console.error('Purchase membership error:', err)
        return res.status(500).json({ success: false, message: 'Something went wrong' })
    }
}

module.exports = { listMemberships, purchaseMembership, findSalonPartner }