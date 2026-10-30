const { z } = require('zod')
const authModel = require('../models/auth.model')
const addressModel = require('../models/address.model')
const membershipModel = require('../models/membership.model')
const { validateRequestDevice } = require('./device&app.controller')
const { findSalonPartner } = require('./membership.controller')
const { convertNulls } = require('../utils/convertNulls')

const noMarkup = (v) => !/[<>]/.test(v)

const MAX_ADDITIONAL_NUMBERS = 5

const optionalText = (max) => z.preprocess(
    (value) => typeof value === 'string' && !value.trim() ? undefined : value,
    z.string().trim().max(max).refine(noMarkup, 'Invalid characters').optional()
)

const normalisePhone = (value) => typeof value === 'string' ? value.replace(/[\s-]/g, '') : value

const mobileNumber = z.string().regex(/^\d{10}$/, 'Must be a 10-digit mobile number')

const optionalMobile = z.preprocess(
    (value) => normalisePhone(value) || undefined,
    mobileNumber.optional()
)

const optionalSupportNumber = z.preprocess(
    (value) => normalisePhone(value) || undefined,
    z.string().regex(/^\+?\d{8,15}$/, 'Enter a valid phone number').optional()
)

const contactAndAddressFields = {
    contactNumber: optionalMobile,
    additionalContactNumbers: z.preprocess(
        (value) => {
            const list = typeof value === 'string' ? value.split(',') : value
            if (!Array.isArray(list)) return list
            // A blank list counts as "not filled in", like every other optional field
            const numbers = list.map(normalisePhone).filter(Boolean)
            return numbers.length ? numbers : undefined
        },
        z.array(mobileNumber).max(MAX_ADDITIONAL_NUMBERS, `Up to ${MAX_ADDITIONAL_NUMBERS} additional numbers allowed`).optional()
    ),
    customerSupportNumber: optionalSupportNumber,
    address: optionalText(200),
    country: optionalText(80),
    state: optionalText(50),
    location: optionalText(50),
    pinCode: z.preprocess(
        (value) => typeof value === 'string' && !value.trim() ? undefined : value,
        z.string().trim().regex(/^\d{6}$/, 'Must be a 6-digit PIN code').optional()
    ),
}

const addAddressSchema = z.object({
    app_id: z.union([z.string(), z.number()]),
    device_id: z.string().trim().min(1, 'Device ID is required'),
    customerId: z.coerce.number({ error: 'Customer ID is required' }).int().positive('Customer ID is required'),
    ...contactAndAddressFields,
}).strict()

const FORM_FIELDS = Object.keys(contactAndAddressFields)

const toAddressColumns = (d) => ({
    mobile: d.contactNumber,
    additionalNumbers: d.additionalContactNumbers && (d.additionalContactNumbers.join(',') || null),
    supportNumber: d.customerSupportNumber,
    address: d.address,
    city: d.location,
    state: d.state,
    zipcode: d.pinCode,
    country: d.country,
})

const sendValidationError = (res, error) =>
    res.status(200).json({
        success: false,
        message: 'Validation failed',
        errors: error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
    })

const formatOrderAddress = ({ address, location, pinCode, country }) =>
    [address, [location, pinCode].filter(Boolean).join(' - '), country].filter(Boolean).join(', ')

const addAddress = async (req, res) => {
    if (!(await validateRequestDevice(req, res))) return

    const parsed = addAddressSchema.safeParse(req.body)

    if (!parsed.success) return sendValidationError(res, parsed.error)

    const d = parsed.data

    const hasAnyField = FORM_FIELDS.some((field) =>
        Array.isArray(d[field]) ? d[field].length > 0 : d[field] !== undefined
    )
    if (!hasAnyField) {
        return res.status(200).json({ success: false, message: 'Please fill in at least one field.' })
    }

    let addressId = null

    try {
        const customer = await findSalonPartner(res, d)
        if (!customer) return

        const order = await membershipModel.findActiveMembership(customer.customerId)
        if (!order) {
            return res.status(200).json({
                success: false,
                message: 'Please purchase a membership before adding your address.',
            })
        }

        const isFirstAddress = !(await authModel.hasAddress(customer.customerId))
        const additionalNumbers = d.additionalContactNumbers?.length ? d.additionalContactNumbers : null

        addressId = await addressModel.createAddress({
            customerId: customer.customerId,
            name: customer.firstName ? customer.firstName.slice(0, 32) : null,
            ...toAddressColumns(d),
            addressType: 'Bill',
            defaultStatus: isFirstAddress ? 'Y' : 'N',
            recivDate: authModel.nowString(),
        })

        const orderAddress = formatOrderAddress(d)
        if (orderAddress || d.state) {
            await membershipModel.updateOrderAddress(order.orderId, {
                ...(orderAddress && { address: orderAddress }),
                ...(d.state && { state: d.state }),
            })
        }

        return res.status(200).json({
            success: true,
            message: 'Address added successfully',
            data: convertNulls({
                addressId,
                orderId: order.orderId,
                emailId: customer.userName,
                contactNumber: d.contactNumber ?? null,
                additionalContactNumbers: additionalNumbers || [],
                customerSupportNumber: d.customerSupportNumber ?? null,
                address: d.address ?? null,
                country: d.country ?? null,
                state: d.state ?? null,
                location: d.location ?? null,
                pinCode: d.pinCode ?? null,
                isDefault: isFirstAddress,
            }),
        })
    } catch (err) {
        if (addressId) await addressModel.deleteAddress(addressId).catch(() => { })
        console.error('Add address error:', err)
        return res.status(200).json({ success: false, message: 'Something went wrong' })
    }
}

module.exports = {
    addAddress,
    contactAndAddressFields,
    toAddressColumns,
    formatOrderAddress,
    optionalText,
    noMarkup,
}
