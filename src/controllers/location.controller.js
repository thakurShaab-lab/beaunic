const { z } = require('zod')
const { sendValidationError } = require('../utils/validationError')
const locationModel = require('../models/location.model')
const addressModel = require('../models/address.model')
const authModel = require('../models/auth.model')
const { validateRequestDevice } = require('./device&app.controller')
const { findLoggedInCustomer } = require('./profile.controller')
const { convertNulls } = require('../utils/convertNulls')
const locationAddress = require('../services/locationAddress.service')

const SEARCH_LIMIT = 20

const deviceFields = {
    app_id: z.union([z.string(), z.number()]),
    device_id: z.string().trim().min(1, 'Device ID is required'),
    location_id: z.union([z.string(), z.number()]).optional().default(''),
}

const locationIdFilter = z.coerce.number({ error: 'Location ID must be a number' }).int().positive('Location ID must be a number').optional()

// locationId is optional: blank, null or missing lists every location. location_id is accepted too.
const locationsSchema = z.object({
    ...deviceFields,
    locationId: locationIdFilter,
    location_id: locationIdFilter,
}).strict()

const latitude = z.coerce.number({ error: 'Latitude must be a number' })
    .min(-90, 'Latitude must be between -90 and 90').max(90, 'Latitude must be between -90 and 90')
const longitude = z.coerce.number({ error: 'Longitude must be a number' })
    .min(-180, 'Longitude must be between -180 and 180').max(180, 'Longitude must be between -180 and 180')

// Two ways of choosing, one per request: locationId (the serviceable locations dropdown / search) or
// latitude + longitude (Use Current Location). The address itself (address, city, state, PIN code, country) is
// worked out on the server, so it isn't accepted from the app.
const saveLocationSchema = z.object({
    ...deviceFields,
    locationId: z.coerce.number({ error: 'Location ID must be a number' }).int('Location ID must be a number').positive('Location ID must be a number').optional(),
    latitude: latitude.optional(),
    longitude: longitude.optional(),
}).strict().superRefine((d, ctx) => {
    const hasPoint = d.latitude !== undefined || d.longitude !== undefined
    if (d.locationId !== undefined && hasPoint) {
        ctx.addIssue({ code: 'custom', path: ['locationId'], message: 'Send either a location or your current location, not both.' })
        return
    }
    // The current location is a pair
    if (d.latitude !== undefined && d.longitude === undefined) ctx.addIssue({ code: 'custom', path: ['longitude'], message: 'Longitude is required' })
    if (d.longitude !== undefined && d.latitude === undefined) ctx.addIssue({ code: 'custom', path: ['latitude'], message: 'Latitude is required' })
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
        const locationId = parsed.data.locationId ?? parsed.data.location_id

        // One location by ID
        if (locationId !== undefined) {
            const location = await locationModel.findActiveLocationById(locationId)

            if (!location) {
                return res.status(200).json({
                    success: false,
                    message: 'Service location not found or not available.',
                })
            }

            return res.status(200).json({
                success: true,
                message: 'Location fetched successfully',
                data: convertNulls({ location: formatLocation(location) }),
            })
        }

        const rows = await locationModel.findActiveLocations()

        return res.status(200).json({
            success: true,
            message: rows.length
                ? 'Locations fetched successfully'
                : 'No locations available',
            data: convertNulls({
                locations: rows.map(formatLocation),
            }),
        })
    } catch (err) {
        console.error('Get locations error:', err)

        return res.status(200).json({
            success: false,
            message: 'Something went wrong',
        })
    }
}


const saveLocation = async (req, res) => {
    if (!(await validateRequestDevice(req, res))) return

    const parsed = saveLocationSchema.safeParse(req.body)

    if (!parsed.success) return sendValidationError(res, parsed.error)

    const d = parsed.data

    if (d.locationId === undefined && d.latitude === undefined) {
        return res.status(200).json({ success: false, message: 'Please select a location or share your current location.' })
    }

    try {
        const customer = await findUser(req, res, d)
        if (!customer) return

        // The whole address, from our tables (locationId) or from the map (latitude + longitude). Nothing is saved
        // when the location isn't available or no address is found at the position.
        const result = d.locationId !== undefined
            ? await locationAddress.addressFromLocation(d.locationId)
            : await locationAddress.addressFromCoordinates(d.latitude, d.longitude)

        if (result.error) {
            return res.status(200).json({ success: false, message: result.message, field: result.field })
        }

        // The new location replaces the customer's default address completely, so nothing of an older one is left
        const addressId = await saveSelectedLocation(customer, result.values)

        return res.status(200).json({
            success: true,
            message: result.place.locationFound
                ? 'Location saved successfully'
                : 'Location saved successfully, but it could not be found on the map',
            data: convertNulls({ addressId, ...result.place }),
        })
    } catch (err) {
        console.error('Save location error:', err)
        return res.status(200).json({ success: false, message: 'Something went wrong' })
    }
}

module.exports = { getLocations, saveLocation }
