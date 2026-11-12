const { z } = require('zod')
const { sendValidationError } = require('../utils/validationError')
const authModel = require('../models/auth.model')
const addressModel = require('../models/address.model')
const membershipModel = require('../models/membership.model')
const geoModel = require('../models/geo.model')
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

// An optional ID: blank / null / missing means "not sent"
const optionalId = (message) => z.preprocess(
    (value) => (typeof value === 'string' && !value.trim() ? undefined : value),
    z.coerce.number({ error: message }).int(message).positive(message).optional()
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
    // country: a wl_countries ID; state: a wl_cities ID, which must be a city of that country (see checkCountryAndCity)
    country: optionalId('Country must be a country ID'),
    state: optionalId('State must be a city ID'),
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
    // Saved as text in the address book's varchar columns
    country: d.country !== undefined ? String(d.country) : undefined,
    state: d.state !== undefined ? String(d.state) : undefined,
})

// A country / city ID saved in the address book, or null when it holds older free text (e.g. "India")
const savedId = (value) => (/^\d+$/.test(String(value ?? '').trim()) ? Number(value) : null)

// country (country ID) and state (city ID): the country must be active, and the city must be an active city
// whose country_id is that country. Returns { error, field } or { country, city }.
const checkCountryAndCity = async (countryId, cityId) => {
    if (cityId != null && countryId == null) return { error: 'Please select a country first.', field: 'country' }

    const [country, city] = await Promise.all([
        countryId != null ? geoModel.findActiveCountry(countryId) : null,
        cityId != null ? geoModel.findActiveCity(cityId) : null,
    ])

    if (countryId != null && !country) return { error: 'Country not found.', field: 'country' }
    if (cityId != null && !city) return { error: 'City not found.', field: 'state' }
    if (city && city.countryId !== country.countryId) {
        return { error: 'The selected city does not belong to the selected country.', field: 'state' }
    }

    return { country, city }
}

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

        const place = await checkCountryAndCity(d.country, d.state)
        if (place.error) return res.status(200).json({ success: false, message: place.error, field: place.field })

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

        const orderAddress = formatOrderAddress({ ...d, country: place.country?.countryName })
        if (orderAddress || place.city) {
            await membershipModel.updateOrderAddress(order.orderId, {
                ...(orderAddress && { address: orderAddress }),
                ...(place.city && { state: place.city.cityName }),
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
                countryName: place.country?.countryName ?? null,
                state: d.state ?? null,
                stateName: place.city?.cityName ?? null,
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
    checkCountryAndCity,
    savedId,
}
