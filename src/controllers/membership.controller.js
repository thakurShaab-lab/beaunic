const crypto = require('crypto')
const { z } = require('zod')
const { sendValidationError } = require('../utils/validationError')
const authModel = require('../models/auth.model')
const membershipModel = require('../models/membership.model')
const { validateRequestDevice } = require('./device&app.controller')
const { convertNulls } = require('../utils/convertNulls')

const deviceFields = {
    app_id: z.union([z.string(), z.number()]),
    device_id: z.string().trim().min(1, 'Device ID is required'),
    customerId: z.coerce.number({ error: 'Customer ID is required' }).int().positive('Customer ID is required'),
}

const listMembershipsSchema = z.object(deviceFields).strict()

const purchaseMembershipSchema = z.object({
    ...deviceFields,
    membershipId: z.coerce.number().int().positive('Membership ID is required'),
}).strict()

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

const addMonths = (dateString, months) => {
    const date = new Date(`${dateString}T00:00:00Z`)
    date.setUTCMonth(date.getUTCMonth() + months)
    return date.toISOString().slice(0, 10)
}

const generateInvoiceNumber = () =>
    `MEM-${membershipModel.todayString().replace(/-/g, '')}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`

const findSalonPartner = async (res, { app_id, device_id, customerId }) => {
    const customer = await authModel.findByIdAndDevice(customerId, String(app_id).trim(), device_id)
    if (!customer) {
        res.status(200).json({ success: false, message: 'Account not found for this device.' })
        return null
    }

    if (customer.customerType !== '1') {
        res.status(200).json({ success: false, message: 'This feature is only available for Salon Partners.' })
        return null
    }

    if (customer.status !== '1') {
        res.status(200).json({
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
        return res.status(200).json({ success: false, message: 'Something went wrong' })
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
            return res.status(200).json({ success: false, message: 'Membership plan not found.' })
        }

        const activeMembership = await membershipModel.findActiveMembership(customer.customerId)
        if (activeMembership) {
            return res.status(200).json({
                success: false,
                message: `You already have an active membership (${activeMembership.membershipName}) valid until ${activeMembership.endDate}.`,
            })
        }

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

        return res.status(200).json({
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
        return res.status(200).json({ success: false, message: 'Something went wrong' })
    }
}

// ---------------------------------------------------------------------------------------------------------------
// Salon Partner: "My Membership" — the logged-in partner's current (or last) membership with its features

const myMembershipSchema = z.object({
    app_id: z.union([z.string(), z.number()]),
    device_id: z.string().trim().min(1, 'Device ID is required'),
}).strict()

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// "2027-10-12" -> "12 Oct 2027"
const dateLabel = (value) => {
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value || '')
    if (!match || match[1] === '0000') return null
    return `${match[3]} ${MONTHS[Number(match[2]) - 1]} ${match[1]}`
}

// 5999 -> "₹5,999", 499.5 -> "₹499.50"
const rupees = (amount) =>
    `₹${Number(amount).toLocaleString('en-IN', Number.isInteger(Number(amount)) ? {} : { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

// 12 -> "Year", 1 -> "Month", 24 -> "2 Years", 6 -> "6 Months" (the "/ Year" after the price)
const periodLabel = (months) => {
    if (!months) return null
    if (months % 12 === 0) return months === 12 ? 'Year' : `${months / 12} Years`
    return months === 1 ? 'Month' : `${months} Months`
}

const decodeEntities = (text) =>
    text.replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&amp;/g, '&')

// The plan's features, saved from the admin editor: "<ul><li>Wallet Management</li>...</ul>" -> ["Wallet Management", ...].
// Plain text is split into lines.
const featureList = (html) => {
    if (!html) return []
    const items = [...String(html).matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)].map((match) => match[1])
    const lines = items.length ? items : String(html).replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div)>/gi, '\n').split(/\r?\n/)
    return lines.map((line) => decodeEntities(line.replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim()).filter(Boolean)
}

// Whole days from today (UTC, as findActiveMembership) to the end date; negative once it has ended
const daysUntil = (endDate) => Math.round((Date.parse(`${endDate}T00:00:00Z`) - Date.parse(`${membershipModel.todayString()}T00:00:00Z`)) / 86400000)

const myMembership = async (req, res) => {
    if (!(await validateRequestDevice(req, res))) return

    const parsed = myMembershipSchema.safeParse(req.body)

    if (!parsed.success) return sendValidationError(res, parsed.error)

    try {
        // The partner from the login token (same checks as findSalonPartner, which takes customerId from the body)
        const customer = await findSalonPartner(res, { ...parsed.data, customerId: req.user.customerId })
        if (!customer) return

        const [membership, profile] = await Promise.all([
            membershipModel.findLatestMembership(customer.customerId),
            authModel.findProfile(customer.customerId),
        ])
        const memberName = (profile && (profile.salonName || profile.firstName)) || null

        if (!membership) {
            return res.status(200).json({
                success: true,
                message: 'You have no membership yet',
                data: convertNulls({ title: 'My Membership', hasMembership: 0, memberName, membership: null, features: [] }),
            })
        }

        const today = membershipModel.todayString()
        const status = membership.startDate && membership.startDate > today ? 'upcoming'
            : membership.endDate && membership.endDate >= today ? 'active' : 'expired'
        const statusLabel = { active: 'Active', expired: 'Expired', upcoming: 'Upcoming' }[status]
        const daysLeft = membership.endDate ? Math.max(daysUntil(membership.endDate), 0) : null
        const price = Number(membership.price ?? membership.totalPrice ?? 0)
        const period = periodLabel(membership.duration)
        const isFree = price === 0
        const features = featureList(membership.features || membership.planDescription)
        const validity = dateLabel(membership.endDate)

        return res.status(200).json({
            success: true,
            message: status === 'expired' ? 'Your membership has expired' : 'Membership details fetched successfully',
            data: convertNulls({
                title: 'My Membership',
                hasMembership: 1,
                // Card: "CURRENT MEMBERSHIP", "₹5,999 / Year", "Professional Plan", Member, Validity, Active
                membership: {
                    orderId: membership.orderId,
                    invoiceNumber: membership.invoiceNumber,
                    membershipId: membership.membershipId,
                    cardLabel: status === 'expired' ? 'LAST MEMBERSHIP' : 'CURRENT MEMBERSHIP',
                    planName: membership.membershipName,
                    // The plan's tag in the admin panel ("Popular")
                    planTag: membership.planTag,
                    price,
                    priceLabel: isFree ? 'Free' : rupees(price),
                    period,
                    // "₹5,999 / Year"
                    priceWithPeriod: isFree ? 'Free' : [rupees(price), period].filter(Boolean).join(' / '),
                    isFree: isFree ? 1 : 0,
                    memberName,
                    validity,
                    validityLabel: validity ? validity.toUpperCase() : null,
                    // Details: Membership Status, Duration, Start Date, Expiry Date
                    status,
                    statusLabel,
                    isActive: status === 'active' ? 1 : 0,
                    durationMonths: membership.duration,
                    durationLabel: membership.duration ? `${membership.duration} ${membership.duration === 1 ? 'Month' : 'Months'}` : null,
                    startDate: membership.startDate,
                    startDateLabel: dateLabel(membership.startDate),
                    expiryDate: membership.endDate,
                    expiryDateLabel: validity,
                    daysLeft,
                    paymentStatus: membership.paymentStatus,
                    purchasedOn: membership.purchasedOn,
                },
                // "PACKAGE FEATURES"
                featuresTitle: 'PACKAGE FEATURES',
                features,
            }),
        })
    } catch (err) {
        console.error('My membership error:', err)
        return res.status(200).json({ success: false, message: 'Something went wrong' })
    }
}

module.exports = { listMemberships, purchaseMembership, myMembership, findSalonPartner }