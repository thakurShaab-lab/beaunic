const { z } = require('zod')
const { sendValidationError } = require('../utils/validationError')
const locationModel = require('../models/location.model')
const addressModel = require('../models/address.model')
const authModel = require('../models/auth.model')
const { validateRequestDevice } = require('./device&app.controller')
const { findLoggedInCustomer } = require('./profile.controller')
const { convertNulls } = require('../utils/convertNulls')
const locationAddress = require('../services/locationAddress.service')
const recentLocation = require('../services/recentLocation.service')
const recentLocationModel = require('../models/recentLocation.model')


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
    // Optional search: locations whose name (wl_localities.title) contains it. Blank / missing lists every location.
    keyword: z.preprocess(
        (value) => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() || undefined : value ?? undefined),
        z.string({ error: 'Keyword must be text' }).max(80, 'Keyword can be up to 80 characters').optional()
    ),
}).strict()

const latitude = z.coerce.number({ error: 'Latitude must be a number' })
    .min(-90, 'Latitude must be between -90 and 90').max(90, 'Latitude must be between -90 and 90')
const longitude = z.coerce.number({ error: 'Longitude must be a number' })
    .min(-180, 'Longitude must be between -180 and 180').max(180, 'Longitude must be between -180 and 180')

// Three ways of choosing, one per request: locationId (the serviceable locations dropdown / search),
// latitude + longitude (Use Current Location) or recentLocationId (Recent Locations). The address itself (address,
// city, state, PIN code, country) is worked out on the server, so it isn't accepted from the app.
const saveLocationSchema = z.object({
    ...deviceFields,
    locationId: z.coerce.number({ error: 'Location ID must be a number' }).int('Location ID must be a number').positive('Location ID must be a number').optional(),
    latitude: latitude.optional(),
    longitude: longitude.optional(),
    recentLocationId: z.coerce.number({ error: 'Recent location ID must be a number' }).int('Recent location ID must be a number').positive('Recent location ID must be a number').optional(),
}).strict().superRefine((d, ctx) => {
    const hasPoint = d.latitude !== undefined || d.longitude !== undefined
    const chosen = [d.locationId !== undefined, hasPoint, d.recentLocationId !== undefined].filter(Boolean).length
    if (chosen > 1) {
        ctx.addIssue({ code: 'custom', path: ['locationId'], message: 'Send only one of: a location, your current location or a recent location.' })
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

        // Every active location, or those whose name matches the keyword
        const { keyword } = parsed.data
        const rows = keyword !== undefined
            ? await locationModel.searchActiveLocations(keyword)
            : await locationModel.findActiveLocations()

        return res.status(200).json({
            success: true,
            message: rows.length
                ? 'Locations fetched successfully'
                : keyword !== undefined ? `No locations found for "${keyword}"` : 'No locations available',
            data: convertNulls({
                keyword: keyword ?? null,
                total: rows.length,
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

    if (d.locationId === undefined && d.latitude === undefined && d.recentLocationId === undefined) {
        return res.status(200).json({ success: false, message: 'Please select a location or share your current location.' })
    }

    try {
        // Login is optional. Logged in: the User from the token. Not logged in: the User of this app_id + device_id
        // in wl_customers; when the device has none, one is created below (after the location is found), so the
        // location is always saved to an account. A Salon Partner row on the same device is never used.
        const isGuest = !req.user
        let customer
        if (isGuest) {
            if (d.recentLocationId !== undefined) {
                return res.status(200).json({ success: false, message: 'Please log in to use your recent locations.', field: 'recentLocationId' })
            }
            customer = await authModel.findUserByDevice(String(d.app_id).trim(), d.device_id.trim())
        } else {
            customer = await findUser(req, res, d)
            if (!customer) return
        }

        // The whole address, from our tables (locationId), from the map (latitude + longitude) or as it was saved
        // before (recentLocationId, one of the customer's own). Nothing is saved when the location isn't available or
        // no address is found at the position.
        let result
        if (d.recentLocationId !== undefined) {
            const recent = await recentLocationModel.findRecentLocation(customer.customerId, d.recentLocationId)
            if (!recent) return res.status(200).json({ success: false, message: 'Recent location not found.', field: 'recentLocationId' })
            result = recentLocation.resultFromRecent(recent)
        } else {
            result = d.locationId !== undefined
                ? await locationAddress.addressFromLocation(d.locationId)
                : await locationAddress.addressFromCoordinates(d.latitude, d.longitude)
        }

        if (result.error) {
            return res.status(200).json({ success: false, message: result.message, field: result.field })
        }

        // A device seen for the first time: a User row for it (wl_customers), then its address book entry below
        const isNewCustomer = !customer
        if (isNewCustomer) {
            const customerId = await authModel.createDeviceUser({
                appId: String(d.app_id).trim(),
                deviceId: d.device_id.trim(),
                appType: req.device?.app_type,
                ipAddress: req.ip,
            })
            customer = { customerId, firstName: null }
        }

        // The new location replaces the customer's default address completely, so nothing of an older one is left
        // (an existing entry is updated; one is only added when the customer has none)
        const addressId = await saveSelectedLocation(customer, result.values)

        // ...and goes to the top of Recent Locations
        await recentLocation.rememberLocation(customer.customerId, result, authModel.nowString())

        return res.status(200).json({
            success: true,
            message: result.place.locationFound
                ? 'Location saved successfully'
                : 'Location saved successfully, but it could not be found on the map',
            data: convertNulls({ customerId: customer.customerId, isNewCustomer, addressId, isSaved: true, ...result.place }),
        })
    } catch (err) {
        console.error('Save location error:', err)
        return res.status(200).json({ success: false, message: 'Something went wrong' })
    }
}

const DEFAULT_RECENT_LIMIT = 5

// "Recent Locations": up to `limit` (default 5) of the customer's last chosen locations, newest first.
// Tapping one calls /location/save with its recentLocationId.
const recentLocationsSchema = z.object({
    ...deviceFields,
    limit: z.coerce.number({ error: 'Limit must be a number' })
        .int('Limit must be a whole number')
        .min(1, 'Limit must be 1 or more')
        .max(recentLocationModel.KEEP_PER_CUSTOMER, `Limit can be at most ${recentLocationModel.KEEP_PER_CUSTOMER}`)
        .optional(),
}).strict()

const getRecentLocations = async (req, res) => {
    if (!(await validateRequestDevice(req, res))) return

    const parsed = recentLocationsSchema.safeParse(req.body)

    if (!parsed.success) return sendValidationError(res, parsed.error)

    try {
        const customer = await findUser(req, res, parsed.data)
        if (!customer) return

        const rows = await recentLocationModel.findRecentLocations(customer.customerId, parsed.data.limit ?? DEFAULT_RECENT_LIMIT)

        return res.status(200).json({
            success: true,
            message: rows.length ? 'Recent locations fetched successfully' : 'No recent locations yet',
            data: convertNulls({
                title: 'Recent Locations',
                total: rows.length,
                // The first one is the location in use now
                recentLocations: rows.map((row, index) => ({ ...recentLocation.formatRecentLocation(row), isCurrent: index === 0 })),
            }),
        })
    } catch (err) {
        console.error('Recent locations error:', err)
        return res.status(200).json({ success: false, message: 'Something went wrong' })
    }
}

module.exports = { getLocations, saveLocation, getRecentLocations }
