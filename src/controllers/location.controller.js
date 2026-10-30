const { z } = require('zod')
const locationModel = require('../models/location.model')
const addressModel = require('../models/address.model')
const authModel = require('../models/auth.model')
const { validateRequestDevice } = require('./device&app.controller')
const { findLoggedInCustomer } = require('./profile.controller')
const { optionalText, noMarkup } = require('./address.controller')
const { convertNulls } = require('../utils/convertNulls')

const SEARCH_LIMIT = 20

const deviceFields = {
    app_id: z.union([z.string(), z.number()]),
    device_id: z.string().trim().min(1, 'Device ID is required'),
}

const locationsSchema = z.object(deviceFields).strict()

const latitude = z.coerce.number({ error: 'Latitude must be a number' })
    .min(-90, 'Latitude must be between -90 and 90').max(90, 'Latitude must be between -90 and 90')
const longitude = z.coerce.number({ error: 'Longitude must be a number' })
    .min(-180, 'Longitude must be between -180 and 180').max(180, 'Longitude must be between -180 and 180')

// One body for both ways of choosing: locationId from the dropdown/search, and/or the current location details.
// Every field is optional. Lengths follow the wl_customers_address_book columns.
const saveLocationSchema = z.object({
    ...deviceFields,
    locationId: z.coerce.number({ error: 'Location ID must be a number' }).int().positive('Location ID must be a number').optional(),
    latitude: latitude.optional(),
    longitude: longitude.optional(),
    address: optionalText(200),
    city: optionalText(50),
    state: optionalText(50),
    pinCode: z.string().trim().regex(/^\d{6}$/, 'Must be a 6-digit PIN code').optional(),
}).strict()

const sendValidationError = (res, error) =>
    res.status(200).json({
        success: false,
        message: 'Validation failed',
        errors: error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
    })

// wl_cities titles carry a state hint, e.g. "Ghazipur (UP)" - show just "Ghazipur"
const cityLabel = (title) => (title ? title.replace(/\s*\(.*?\)\s*/g, ' ').trim() : null)

const formatLocation = (row) => ({
    locationId: row.locationId,
    locationName: row.locationName,
    cityId: row.cityId,
    cityName: cityLabel(row.cityName),
    label: [row.locationName, cityLabel(row.cityName)].filter(Boolean).join(', '),
})

// Location selection is only for Users (customer_type 2)
const findUser = async (req, res, data) => {
    const customer = await findLoggedInCustomer(req, res, data)
    if (!customer) return null

    if (customer.customerType !== '2') {
        res.status(200).json({ success: false, message: 'This feature is only available for Users.' })
        return null
    }

    return customer
}

// The selected location becomes the customer's default address. All location columns are
// written together so details from a previously selected place don't linger.
const saveSelectedLocation = async (customer, values) => {
    const existing = await addressModel.findDefaultAddress(customer.customerId)

    if (existing) {
        await addressModel.updateAddress(existing.addressId, values)
        return existing.addressId
    }

    return addressModel.createAddress({
        customerId: customer.customerId,
        name: customer.firstName ? customer.firstName.slice(0, 32) : null,
        ...values,
        addressType: 'Bill',
        defaultStatus: 'Y',
        recivDate: authModel.nowString(),
    })
}

const getLocations = async (req, res) => {
    if (!(await validateRequestDevice(req, res))) return

    const parsed = locationsSchema.safeParse(req.body)

    if (!parsed.success) return sendValidationError(res, parsed.error)

    try {
        const rows = await locationModel.findActiveLocations()

        return res.status(200).json({
            success: true,
            message: rows.length ? 'Locations fetched successfully' : 'No locations available',
            data: convertNulls({ locations: rows.map(formatLocation) }),
        })
    } catch (err) {
        console.error('Get locations error:', err)
        return res.status(200).json({ success: false, message: 'Something went wrong' })
    }
}


const saveLocation = async (req, res) => {
    if (!(await validateRequestDevice(req, res))) return

    const parsed = saveLocationSchema.safeParse(req.body)

    if (!parsed.success) return sendValidationError(res, parsed.error)

    const d = parsed.data

    // Coordinates alone can't be stored (no latitude/longitude columns), so something else must be sent
    if (!d.locationId && [d.address, d.city, d.state, d.pinCode].every((v) => v === undefined)) {
        return res.status(200).json({ success: false, message: 'Please select a location or share your current location.' })
    }

    try {
        const customer = await findUser(req, res, d)
        if (!customer) return

        let location = null

        if (d.locationId) {
            location = await locationModel.findActiveLocationById(d.locationId)
            if (!location) {
                return res.status(200).json({ success: false, message: 'Location not found or not available.' })
            }
        }

        // The selected locality fills in the address and city, and anything sent in the body takes priority.
        // A new location replaces the old one, so fields not sent are cleared rather than left from an older address.
        // wl_customers_address_book has no latitude/longitude columns, so the coordinates are validated but not stored.
        const values = {
            address: d.address ?? (location ? location.locationName : null),
            city: d.city ?? (location ? cityLabel(location.cityName) : null),
            state: d.state ?? null,
            zipcode: d.pinCode ?? null,
        }

        const addressId = await saveSelectedLocation(customer, values)

        // Answer with what is now stored in wl_customers_address_book
        const saved = (await addressModel.findDefaultAddress(customer.customerId)) || { addressId, country: null, ...values }

        return res.status(200).json({
            success: true,
            message: 'Location saved successfully',
            data: convertNulls({
                addressId: saved.addressId,
                source: location ? 'manual' : 'current',
                locationId: location ? location.locationId : null,
                address: saved.address,
                city: saved.city,
                state: saved.state,
                pinCode: saved.zipcode,
                country: saved.country,
                latitude: d.latitude ?? null,
                longitude: d.longitude ?? null,
            }),
        })
    } catch (err) {
        console.error('Save location error:', err)
        return res.status(200).json({ success: false, message: 'Something went wrong' })
    }
}

module.exports = { getLocations, saveLocation }
