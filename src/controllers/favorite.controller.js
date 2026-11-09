const { z } = require('zod')
const { sendValidationError } = require('../utils/validationError')
const authModel = require('../models/auth.model')
const serviceModel = require('../models/service.model')
const favoriteModel = require('../models/favorite.model')
const { validateRequestDevice } = require('./device&app.controller')
const { findLoggedInCustomer } = require('./profile.controller')
const { withImageUrls } = require('./service.controller')
const { convertNulls } = require('../utils/convertNulls')

const favoriteSchema = z.object({
    app_id: z.union([z.string(), z.number()]),
    device_id: z.string().trim().min(1, 'Device ID is required'),
    serviceId: z.coerce.number({ error: 'Service ID is required' }).int().positive('Service ID is required'),
}).strict()

const DEFAULT_PAGE_SIZE = 10
const MAX_PAGE_SIZE = 50

// page and limit are optional: blank, null or missing means page 1 of 10
const listFavoritesSchema = z.object({
    app_id: z.union([z.string(), z.number()]),
    device_id: z.string().trim().min(1, 'Device ID is required'),
    page: z.coerce.number({ error: 'Page must be a number' }).int('Page must be a whole number').min(1, 'Page must be 1 or more').optional(),
    limit: z.coerce.number({ error: 'Limit must be a number' })
        .int('Limit must be a whole number')
        .min(1, 'Limit must be 1 or more')
        .max(MAX_PAGE_SIZE, `Limit can be at most ${MAX_PAGE_SIZE}`)
        .optional(),
}).strict()

const countFavoritesSchema = z.object({
    app_id: z.union([z.string(), z.number()]),
    device_id: z.string().trim().min(1, 'Device ID is required'),
}).strict()

const SERVICE_TYPE_LABELS ={ salon: 'At Salon', home_service: 'At Home' }

// Favorites are for Users (customer_type 2)
const findUser = async (req, res, data) => {
    const customer = await findLoggedInCustomer(req, res, data)
    if (!customer) return null

    if (customer.customerType !== '2') {
        res.status(200).json({ success: false, message: 'This feature is only available for Users.' })
        return null
    }

    return customer
}

// "♡" on a service: saves it to the User's favorites
const addFavorite = async (req, res) => {
    if (!(await validateRequestDevice(req, res))) return

    const parsed = favoriteSchema.safeParse(req.body)

    if (!parsed.success) return sendValidationError(res, parsed.error)

    const { serviceId } = parsed.data

    try {
        const customer = await findUser(req, res, parsed.data)
        if (!customer) return

        // Only an active service of an active, approved salon can be saved
        const service = await serviceModel.findActiveServiceWithSalon(serviceId)
        if (!service || service.salonCustomerType !== '1' || service.salonStatus !== '1') {
            return res.status(200).json({ success: false, message: 'Service not found.' })
        }

        if (await favoriteModel.findFavorite(customer.customerId, serviceId)) {
            return res.status(200).json({ success: false, message: 'This service is already in your favorites.' })
        }

        const now = authModel.nowString()
        const favoriteId = await favoriteModel.addFavorite({
            customerId: customer.customerId,
            serviceId,
            favoriteAddedDate: now,
        })

        return res.status(200).json({
            success: true,
            message: 'Service added to favorites',
            data: convertNulls({
                favoriteId,
                serviceId,
                serviceName: service.serviceName,
                salonId: service.customerId,
                salonName: service.salonName,
                isFavorite: true,
                favoriteAddedDate: now,
            }),
        })
    } catch (err) {
        // Two taps at once: the unique key lets only one through
        const code = err.code || err.cause?.code
        if (code === 'ER_DUP_ENTRY') {
            return res.status(200).json({ success: false, message: 'This service is already in your favorites.' })
        }
        console.error('Add favorite error:', err)
        return res.status(200).json({ success: false, message: 'Something went wrong' })
    }
}

// "♥" tapped again: removes the service from the User's favorites
const removeFavorite = async (req, res) => {
    if (!(await validateRequestDevice(req, res))) return

    const parsed = favoriteSchema.safeParse(req.body)

    if (!parsed.success) return sendValidationError(res, parsed.error)

    const { serviceId } = parsed.data

    try {
        const customer = await findUser(req, res, parsed.data)
        if (!customer) return

        // No service check: a saved service can be removed even if it has since been deactivated
        const removed = await favoriteModel.removeFavorite(customer.customerId, serviceId)
        if (!removed) {
            return res.status(200).json({ success: false, message: 'This service is not in your favorites.' })
        }

        return res.status(200).json({
            success: true,
            message: 'Service removed from favorites',
            data: { serviceId, isFavorite: false },
        })
    } catch (err) {
        console.error('Remove favorite error:', err)
        return res.status(200).json({ success: false, message: 'Something went wrong' })
    }
}

// "My Favorites": the User's saved services, newest first, a page at a time
const listFavorites = async (req, res) => {
    if (!(await validateRequestDevice(req, res))) return

    const parsed = listFavoritesSchema.safeParse(req.body)

    if (!parsed.success) return sendValidationError(res, parsed.error)

    const page = parsed.data.page ?? 1
    const limit = parsed.data.limit ?? DEFAULT_PAGE_SIZE

    try {
        // Only the logged-in User's own favorites are read (customer ID from the token, never from the body)
        const customer = await findUser(req, res, parsed.data)
        if (!customer) return

        const [total, favorites] = await Promise.all([
            favoriteModel.countCustomerFavorites(customer.customerId),
            favoriteModel.findCustomerFavorites(customer.customerId, { limit, offset: (page - 1) * limit }),
        ])

        // Cover image first for each service, as on the service cards
        const media = await withImageUrls(req, await serviceModel.findMediaForServices(favorites.map((row) => row.serviceId)))

        const totalPages = Math.ceil(total / limit)

        return res.status(200).json({
            success: true,
            message: favorites.length
                ? 'Favorite services fetched successfully'
                : total ? 'No more favorite services' : 'No favorite services yet',
            data: convertNulls({
                favorites: favorites.map((row) => {
                    const images = media.filter((image) => image.serviceId === row.serviceId)
                    const cover = images.find((image) => image.isDefault === 'Y') || images[0]
                    const typeKey = row.serviceType || row.salonType

                    return {
                        favoriteId: row.favoriteId,
                        favoriteAddedDate: row.favoriteAddedDate,
                        isFavorite: true,
                        serviceId: row.serviceId,
                        serviceName: row.serviceName,
                        description: row.serviceDescription,
                        price: row.servicePrice,
                        priceLabel: row.servicePrice !== null ? `₹${row.servicePrice}` : 'Price not set',
                        serviceType: typeKey,
                        serviceTypeLabel: SERVICE_TYPE_LABELS[typeKey] || null,
                        categoryId: row.categoryId,
                        categoryName: row.categoryName,
                        imageUrl: cover ? cover.url : null,
                        averageRating: Number(Number(row.averageRating).toFixed(1)),
                        reviewCount: row.reviewCount,
                        salonId: row.salonId,
                        salonName: row.salonName,
                        // false once the service or its salon is deactivated: it can't be booked, only removed
                        isAvailable: row.serviceStatus === '1' && row.salonStatus === '1',
                    }
                }),
                pagination: {
                    page,
                    limit,
                    total,
                    totalPages,
                    hasNextPage: page < totalPages,
                },
            }),
        })
    } catch (err) {
        console.error('List favorites error:', err)
        return res.status(200).json({ success: false, message: 'Something went wrong' })
    }
}

// The number on the Favorites badge: how many services the logged-in User saved (0 when none)
const countFavorites = async (req, res) => {
    if (!(await validateRequestDevice(req, res))) return

    const parsed = countFavoritesSchema.safeParse(req.body)

    if (!parsed.success) return sendValidationError(res, parsed.error)

    try {
        const customer = await findUser(req, res, parsed.data)
        if (!customer) return

        // Same count as the favorites list total
        const totalFavorites = await favoriteModel.countCustomerFavorites(customer.customerId)

        return res.status(200).json({
            success: true,
            message: 'Favorite services count fetched successfully',
            data: { totalFavorites },
        })
    } catch (err) {
        console.error('Count favorites error:', err)
        return res.status(200).json({ success: false, message: 'Something went wrong' })
    }
}

module.exports = { addFavorite, removeFavorite, listFavorites, countFavorites }
