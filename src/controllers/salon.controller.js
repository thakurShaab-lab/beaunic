const { z } = require('zod')
const { sendValidationError } = require('../utils/validationError')
const { validateRequestDevice } = require('./device&app.controller')
const { findLoggedInCustomer } = require('./profile.controller')
const { convertNulls } = require('../utils/convertNulls')
const nearbySalonService = require('../services/nearbySalon.service')
const salonModel = require('../models/salon.model')

const DEFAULT_RADIUS_KM = 5
const MAX_RADIUS_KM = 50
const DEFAULT_PAGE_SIZE = 10
const MAX_PAGE_SIZE = 50

const deviceFields = {
    app_id: z.union([z.string(), z.number()]),
    device_id: z.string().trim().min(1, 'Device ID is required'),
}

const latitude = z.coerce.number({ error: 'Latitude must be a number' })
    .refine(Number.isFinite, 'Latitude must be a number')
    .min(-90, 'Latitude must be between -90 and 90')
    .max(90, 'Latitude must be between -90 and 90')
const longitude = z.coerce.number({ error: 'Longitude must be a number' })
    .refine(Number.isFinite, 'Longitude must be a number')
    .min(-180, 'Longitude must be between -180 and 180')
    .max(180, 'Longitude must be between -180 and 180')
const addressId = z.coerce.number({ error: 'Address ID must be a number' }).int('Address ID must be a number').positive('Address ID must be a number')

// Where the customer is: latitude + longitude (live GPS) or addressId (a saved address) — one of the two
const searchPointFields = {
    latitude: latitude.optional(),
    longitude: longitude.optional(),
    addressId: addressId.optional(),
}

const checkSearchPoint = (required) => (d, ctx) => {
    const hasPoint = d.latitude !== undefined || d.longitude !== undefined
    if (d.addressId !== undefined && hasPoint) {
        ctx.addIssue({ code: 'custom', path: ['addressId'], message: 'Send either latitude and longitude or a saved address, not both.' })
        return
    }
    if (d.addressId !== undefined) return
    if (!hasPoint) {
        if (required) ctx.addIssue({ code: 'custom', path: [], message: 'Please share your location or select a saved address.' })
        return
    }
    if (d.latitude === undefined) ctx.addIssue({ code: 'custom', path: ['latitude'], message: 'Latitude is required' })
    else if (d.longitude === undefined) ctx.addIssue({ code: 'custom', path: ['longitude'], message: 'Longitude is required' })
}

const allAsUndefined = (value) => (typeof value === 'string' && value.trim().toLowerCase() === 'all' ? undefined : value)

const pageFields = {
    page: z.coerce.number({ error: 'Page must be a number' }).int('Page must be a whole number').min(1, 'Page must be 1 or more').optional(),
    limit: z.coerce.number({ error: 'Limit must be a number' })
        .int('Limit must be a whole number')
        .min(1, 'Limit must be 1 or more')
        .max(MAX_PAGE_SIZE, `Limit can be at most ${MAX_PAGE_SIZE}`)
        .optional(),
}

const salonIdField = z.coerce.number({ error: 'Salon ID is required' }).int('Salon ID is required').positive('Salon ID is required')

const nearbySalonsSchema = z.object({
    ...deviceFields,
    ...searchPointFields,
    radius: z.coerce.number({ error: 'Radius must be a number' })
        .refine(Number.isFinite, 'Radius must be a number')
        .min(0.1, `Radius must be between 0.1 and ${MAX_RADIUS_KM} km`)
        .max(MAX_RADIUS_KM, `Radius must be between 0.1 and ${MAX_RADIUS_KM} km`)
        .optional(),
    // The filter chips; "all" (or blank / missing) means no filter
    area: z.preprocess(allAsUndefined, z.string().trim().min(1).max(50, 'Location can be up to 50 characters').optional()),
    categoryId: z.preprocess(allAsUndefined, z.coerce.number({ error: 'Service must be a category ID' }).int('Service must be a category ID').positive('Service must be a category ID').optional()),
    minRating: z.preprocess(allAsUndefined, z.coerce.number({ error: 'Rating must be a number' }).min(0, 'Rating must be between 0 and 5').max(5, 'Rating must be between 0 and 5').optional()),
    ...pageFields,
}).strict().superRefine(checkSearchPoint(true))

// The location is optional here: with it the distance is shown
const salonDetailsSchema = z.object({
    ...deviceFields,
    salonId: salonIdField,
    ...searchPointFields,
}).strict().superRefine(checkSearchPoint(false))

// "Reviews" tab, more pages
const salonReviewsSchema = z.object({
    ...deviceFields,
    salonId: salonIdField,
    ...pageFields,
}).strict()

const fail = (res, message, field) => res.status(200).json({ success: false, message, ...(field && { field }) })

// "Nearby Salons": active salons within the radius of the customer's location, nearest first.
// GET /api/salons/nearby?latitude=28.5355&longitude=77.3910&radius=5&page=1&limit=10 (or addressId=12)
const getNearbySalons = async (req, res) => {
    if (!(await validateRequestDevice(req, res))) return

    const parsed = nearbySalonsSchema.safeParse(req.body)

    if (!parsed.success) return sendValidationError(res, parsed.error)

    const d = parsed.data
    const radiusKm = d.radius ?? DEFAULT_RADIUS_KM
    const page = d.page ?? 1
    const limit = d.limit ?? DEFAULT_PAGE_SIZE

    try {
        const customer = await findLoggedInCustomer(req, res, d)
        if (!customer) return

        const point = await nearbySalonService.resolveSearchPoint(customer, d)
        if (point.error) return fail(res, nearbySalonService.SEARCH_ERRORS[point.error], 'addressId')

        const filters = { area: d.area, categoryId: d.categoryId, minRating: d.minRating }
        const result = await nearbySalonService.searchNearbySalons(req, point, { radiusKm, filters, page, limit })

        return res.status(200).json({
            success: true,
            message: result.salons.length
                ? 'Nearby salons fetched successfully'
                : result.pagination.total ? 'No more salons' : `No salons found within ${radiusKm} km`,
            data: convertNulls({
                title: 'Nearby Salons',
                // "4 salons near Dildarnagar"
                subtitle: result.subtitle,
                searchLocation: point,
                radius: radiusKm,
                // Location / Service / Rating chips (page 1 only)
                filters: result.filters,
                salons: result.salons,
                pagination: result.pagination,
            }),
        })
    } catch (err) {
        console.error('Nearby salons error:', err)
        return res.status(200).json({ success: false, message: 'Something went wrong' })
    }
}

// The selected salon's details (from the nearby list)
const getSalonDetails = async (req, res) => {
    if (!(await validateRequestDevice(req, res))) return

    const parsed = salonDetailsSchema.safeParse(req.body)

    if (!parsed.success) return sendValidationError(res, parsed.error)

    const d = parsed.data

    try {
        const customer = await findLoggedInCustomer(req, res, d)
        if (!customer) return

        let point = null
        if (d.addressId !== undefined || d.latitude !== undefined) {
            point = await nearbySalonService.resolveSearchPoint(customer, d)
            if (point.error) return fail(res, nearbySalonService.SEARCH_ERRORS[point.error], 'addressId')
        }

        const details = await nearbySalonService.getSalonDetails(req, d.salonId, point)
        if (!details) return fail(res, 'Salon not found.')

        return res.status(200).json({
            success: true,
            message: 'Salon details fetched successfully',
            data: convertNulls({ ...details, searchLocation: point }),
        })
    } catch (err) {
        console.error('Salon details error:', err)
        return res.status(200).json({ success: false, message: 'Something went wrong' })
    }
}

// More reviews of an active salon (the details screen shows the first page)
const getSalonReviews = async (req, res) => {
    if (!(await validateRequestDevice(req, res))) return

    const parsed = salonReviewsSchema.safeParse(req.body)

    if (!parsed.success) return sendValidationError(res, parsed.error)

    const d = parsed.data

    try {
        const customer = await findLoggedInCustomer(req, res, d)
        if (!customer) return

        if (!(await salonModel.findActiveSalon(d.salonId, null))) return fail(res, 'Salon not found.')

        const reviews = await nearbySalonService.salonReviews(d.salonId, { page: d.page ?? 1, limit: d.limit ?? DEFAULT_PAGE_SIZE })

        return res.status(200).json({
            success: true,
            message: reviews.reviews.length ? 'Reviews fetched successfully' : reviews.reviewCount ? 'No more reviews' : 'No reviews yet',
            data: convertNulls(reviews),
        })
    } catch (err) {
        console.error('Salon reviews error:', err)
        return res.status(200).json({ success: false, message: 'Something went wrong' })
    }
}

module.exports = { getNearbySalons, getSalonDetails, getSalonReviews }
