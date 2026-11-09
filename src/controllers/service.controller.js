const fs = require('fs/promises')
const path = require('path')
const crypto = require('crypto')
const { z } = require('zod')
const { sendValidationError } = require('../utils/validationError')
const env = require('../config/env')
const authModel = require('../models/auth.model')
const categoryModel = require('../models/category.model')
const serviceModel = require('../models/service.model')
const membershipModel = require('../models/membership.model')
const reviewModel = require('../models/review.model')
const addressModel = require('../models/address.model')
const favoriteModel = require('../models/favorite.model')
const complaintModel = require('../models/complaint.model')
const { validateRequestDevice } = require('./device&app.controller')
const { detectImageExt } = require('./auth.controller')
const { findLoggedInCustomer } = require('./profile.controller')
const { noMarkup } = require('./address.controller')
const { convertNulls } = require('../utils/convertNulls')
const { formatDate } = require('../utils/formatDate')
const { resolveMediaUrl } = require('../utils/mediaUrl')

const SERVICE_IMAGE_FOLDER = 'services'
// UPLOAD_DIR is the folder served at /uploaded_files, so images are saved straight under it
const SERVICE_IMAGE_DIR = path.join(env.uploadDir, SERVICE_IMAGE_FOLDER)

// Image tiles on the screen: Cover plus up to two more, saved in wl_services_media
const MAX_IMAGES = 3

// Blank form fields are ignored, so an edit clears a saved value by naming it here
const REMOVABLE_FIELDS = ['price', 'description', 'duration']

// Longest service: 24 hours, in minutes
const MAX_DURATION_MINUTES = 1440

// 45 -> "45 min", 60 -> "1 hr", 75 -> "1 hr 15 min", 120 -> "2 hrs"
const durationLabel = (minutes) => {
    if (minutes === null || minutes === undefined) return null
    const hours = Math.floor(minutes / 60)
    const rest = minutes % 60
    return [hours ? `${hours} ${hours === 1 ? 'hr' : 'hrs'}` : null, rest ? `${rest} min` : null].filter(Boolean).join(' ')
}

// The app's toggle may send 1/0, true/false or active/inactive
const STATUS_VALUES = { '1': '1', true: '1', active: '1', '0': '0', false: '0', inactive: '0' }
const toStatus = (value) => {
    const key = typeof value === 'boolean' ? String(value) : typeof value === 'string' ? value.trim().toLowerCase() : value
    return STATUS_VALUES[key] ?? value
}

const deviceFields = {
    app_id: z.union([z.string(), z.number()]),
    device_id: z.string().trim().min(1, 'Device ID is required'),
}

const serviceName = z.string().trim().min(2, 'Enter at least 2 characters').max(100).refine(noMarkup, 'Invalid characters')
const categoryId = z.coerce.number({ error: 'Category is required' }).int().positive('Category is required')

// Shared by add and update; all optional ("Price · optional, if configured")
const optionalServiceFields = {
    description: z.string().trim().max(1000, 'Description can be up to 1000 characters').refine(noMarkup, 'Invalid characters').optional(),
    // An empty price arrives as null (see service.routes.js) and means "Price not set"
    price: z.coerce.number({ error: 'Price must be a number' })
        .min(0, 'Price cannot be negative')
        .max(99999999.99, 'Price is too large')
        .nullable()
        .optional(),
    // Minutes, e.g. 75 for "1 hr 15 min"; empty means "Duration not set"
    duration: z.coerce.number({ error: 'Duration must be a number of minutes' })
        .int('Duration must be a whole number of minutes')
        .min(1, 'Duration must be at least 1 minute')
        .max(MAX_DURATION_MINUTES, `Duration can be at most ${MAX_DURATION_MINUTES} minutes (24 hours)`)
        .nullable()
        .optional(),
    status: z.preprocess(
        toStatus,
        z.enum(['1', '0'], { error: 'Status must be 1 (Active) or 0 (Inactive)' }).optional()
    ),
}

const addServiceSchema = z.object({
    ...deviceFields,
    serviceName,
    categoryId,
    ...optionalServiceFields,
}).strict()

const updateServiceSchema = z.object({
    ...deviceFields,
    serviceId: z.coerce.number({ error: 'Service ID is required' }).int().positive('Service ID is required'),
    serviceName: serviceName.optional(),
    categoryId: categoryId.optional(),
    ...optionalServiceFields,
    // Lists, or comma-separated strings when sent as form data: "price,description", "12,13"
    removeMediaIds: z.preprocess(
        (value) => (typeof value === 'string' ? value.split(',').map((v) => v.trim()).filter(Boolean) : value),
        z.array(z.coerce.number({ error: 'Image ID must be a number' }).int().positive('Image ID must be a number')).optional()
    ),
    removeFields: z.preprocess(
        (value) => (typeof value === 'string' ? value.split(',').map((v) => v.trim()).filter(Boolean) : value),
        z.array(z.enum(REMOVABLE_FIELDS, { error: `Can only remove: ${REMOVABLE_FIELDS.join(', ')}` })).optional()
    ),
}).strict().superRefine((d, ctx) => {
    for (const field of REMOVABLE_FIELDS) {
        if (d.removeFields?.includes(field) && d[field] !== undefined && d[field] !== null) {
            ctx.addIssue({ code: 'custom', path: ['removeFields'], message: `Send ${field} or remove it, not both` })
        }
    }
})

// The Active toggle: status is required here (1/0, true/false or active/inactive)
const serviceStatusSchema = z.object({
    ...deviceFields,
    serviceId: z.coerce.number({ error: 'Service ID is required' }).int().positive('Service ID is required'),
    status: z.preprocess(
        toStatus,
        z.enum(['1', '0'], { error: 'Status must be 1 (Active) or 0 (Inactive)' })
    ),
}).strict()

// Both filters are optional: blank, null or missing means "don't filter by it"
// Filters sheet: price chips. Keys are the chip text with only letters and digits kept, so "Under ₹500",
// "under_500" and "₹500 – ₹1,500" all work. "Above ₹5,000" starts just above 5000 (prices have 2 decimals).
const PRICE_RANGES = {
    under500: { key: 'under_500', label: 'Under ₹500', maxPrice: 500, maxPriceExclusive: true },
    '5001500': { key: '500_1500', label: '₹500 – ₹1,500', minPrice: 500, maxPrice: 1500, maxPriceExclusive: true },
    '15005000': { key: '1500_5000', label: '₹1,500 – ₹5,000', minPrice: 1500, maxPrice: 5000 },
    above5000: { key: 'above_5000', label: 'Above ₹5,000', minPrice: 5000.01 },
}

// Sort by sheet; the chip text works too ("Price: Low to High")
const SORT_OPTIONS = {
    popularity: 'popularity',
    ratinghightolow: 'rating_desc', ratingdesc: 'rating_desc', rating: 'rating_desc',
    pricelowtohigh: 'price_asc', priceasc: 'price_asc',
    pricehightolow: 'price_desc', pricedesc: 'price_desc',
    nearest: 'nearest',
}

const lettersAndDigits = (value) => (typeof value === 'string' ? value.toLowerCase().replace(/[^a-z0-9]/g, '') : value)

// Every filter is optional: blank, null or missing means "don't filter by it"
const listServicesSchema = z.object({
    ...deviceFields,
    // User only: one salon's services; unset lists every active salon's. A Salon Partner always gets their own.
    salonId: z.coerce.number({ error: 'Salon ID must be a number' }).int().positive('Salon ID must be a number').optional(),
    serviceId: z.coerce.number({ error: 'Service ID must be a number' }).int().positive('Service ID must be a number').optional(),
    categoryId: z.coerce.number({ error: 'Category ID must be a number' }).int().positive('Category ID must be a number').optional(),
    priceRange: z.preprocess(
        lettersAndDigits,
        z.enum(Object.keys(PRICE_RANGES), { error: 'Price range must be one of: under_500, 500_1500, 1500_5000, above_5000' }).optional()
    ),
    // A Services chip: part of the service name, any case; "All" means no filter
    serviceName: z.preprocess(
        (value) => (typeof value === 'string' && value.trim().toLowerCase() === 'all' ? undefined : value),
        z.string().trim().max(100, 'Service name can be up to 100 characters').optional()
    ),
    // A Rating chip: "4.5", "4.5+" or "★ 4.5+"
    minRating: z.preprocess(
        (value) => (typeof value === 'string' ? value.replace(/[^\d.]/g, '') || value : value),
        z.coerce.number({ error: 'Rating must be a number from 0 to 5' })
            .min(0, 'Rating must be a number from 0 to 5')
            .max(5, 'Rating must be a number from 0 to 5')
            .optional()
    ),
    sortBy: z.preprocess(
        (value) => (typeof value === 'string' ? SORT_OPTIONS[lettersAndDigits(value)] ?? value : value),
        z.enum(['popularity', 'rating_desc', 'price_asc', 'price_desc', 'nearest'], {
            error: 'Sort by must be one of: popularity, rating_desc, price_asc, price_desc, nearest',
        }).optional()
    ),
}).strict()

// Services are only for Salon Partners (customer_type 1)
const findSalonPartner = async (req, res, data) => {
    const customer = await findLoggedInCustomer(req, res, data)
    if (!customer) return null

    if (customer.customerType !== '1') {
        res.status(200).json({ success: false, message: 'This feature is only available for Salon Partners.' })
        return null
    }

    return customer
}

// Checks every uploaded image and gives it a stored file name; returns null (after replying) on a bad file
const prepareImages = (req, res) => {
    const check = (file, label) => {
        const ext = detectImageExt(file.buffer)
        if (!ext) {
            res.status(200).json({ success: false, message: `${label} must be a PNG, JPG, WEBP or HEIC image` })
            return null
        }
        return { name: crypto.randomBytes(12).toString('hex') + ext, buffer: file.buffer }
    }

    const coverFile = req.files?.coverImage?.[0]
    const cover = coverFile ? check(coverFile, 'Cover image') : null
    if (coverFile && !cover) return null

    const extras = []
    for (const file of req.files?.images || []) {
        const image = check(file, 'Image')
        if (!image) return null
        extras.push(image)
    }

    return { cover, extras, all: [cover, ...extras].filter(Boolean) }
}

const writeImages = async (images) => {
    if (!images.length) return

    await fs.mkdir(SERVICE_IMAGE_DIR, { recursive: true })
    await Promise.all(images.map((image) => fs.writeFile(path.join(SERVICE_IMAGE_DIR, image.name), image.buffer)))
}

const deleteImageFiles = (names) =>
    Promise.all(names.filter(Boolean).map((name) => fs.unlink(path.join(SERVICE_IMAGE_DIR, name)).catch(() => { })))

const mediaRow = (image, isDefault, now) => ({ mediaType: 'photo', media: image.name, isDefault, mediaDateAdded: now })

// Adds each image's url (null when the file is missing), checking them all at once
const withImageUrls = (req, media) =>
    Promise.all(media.map(async (row) => ({
        ...row,
        url: await resolveMediaUrl(req, SERVICE_IMAGE_FOLDER, row.media, null, env.staticFileBaseUrl),
    })))

// Shaped like the Add/Edit Service screen and the service card; media rows come from withImageUrls
const formatService = (service, media, category, membershipName) => {
    const images = media.map((row) => ({ mediaId: row.mediaId, url: row.url, isCover: row.isDefault === 'Y' }))
    const cover = images.find((image) => image.isCover)

    return {
        serviceId: service.serviceId,
        serviceName: service.serviceName,
        membershipId: service.membershipId,
        membershipName,
        categoryId: service.categoryId,
        categoryName: category ? category.categoryName : null,
        description: service.serviceDescription,
        imageUrl: cover ? cover.url : null,
        images,
        price: service.servicePrice,
        priceLabel: service.servicePrice !== null ? `₹${service.servicePrice}` : 'Price not set',
        // Minutes, and the same as text ("1 hr 15 min")
        duration: service.serviceDuration ?? null,
        durationLabel: service.serviceDuration != null ? durationLabel(service.serviceDuration) : 'Duration not set',
        status: service.status,
        statusLabel: service.status === '1' ? 'Active' : 'Inactive',
    }
}

const addService = async (req, res) => {
    if (!(await validateRequestDevice(req, res))) return

    const parsed = addServiceSchema.safeParse(req.body)

    if (!parsed.success) return sendValidationError(res, parsed.error)

    const d = parsed.data

    const images = prepareImages(req, res)
    if (!images) return

    let written = false

    try {
        const customer = await findSalonPartner(req, res, d)
        if (!customer) return

        // Each service is linked to the plan the partner holds when adding it
        const membership = await membershipModel.findActiveMembership(customer.customerId)
        if (!membership) {
            return res.status(200).json({ success: false, message: 'Please purchase a membership before adding services.' })
        }

        const category = await categoryModel.findActiveCategoryById(d.categoryId)
        if (!category) {
            return res.status(200).json({ success: false, message: 'Category not found or not available.' })
        }

        await writeImages(images.all)
        written = true

        const now = authModel.nowString()
        const service = {
            customerId: customer.customerId,
            membershipId: membership.membershipId || 0,
            categoryId: category.categoryId,
            serviceName: d.serviceName,
            serviceDescription: d.description ?? null,
            servicePrice: d.price != null ? d.price.toFixed(2) : null,
            serviceDuration: d.duration ?? null,
            status: d.status ?? '1',
            serviceAddedDate: now,
            serviceUpdatedDate: now,
        }

        // Without a cover upload, the first image becomes the cover
        const mediaRows = images.all.map((image, i) => mediaRow(image, i === 0 ? 'Y' : 'N', now))

        const serviceId = await serviceModel.createServiceWithMedia(service, mediaRows)
        const media = await serviceModel.findServiceMedia(serviceId)

        return res.status(200).json({
            success: true,
            message: 'Service added successfully',
            data: convertNulls(formatService({ ...service, serviceId }, await withImageUrls(req, media), category, membership.membershipName)),
        })
    } catch (err) {
        if (written) await deleteImageFiles(images.all.map((image) => image.name))
        console.error('Add service error:', err)
        return res.status(200).json({ success: false, message: 'Something went wrong' })
    }
}

const updateService = async (req, res) => {
    if (!(await validateRequestDevice(req, res))) return

    const parsed = updateServiceSchema.safeParse(req.body)

    if (!parsed.success) return sendValidationError(res, parsed.error)

    const d = parsed.data
    const remove = new Set(d.removeFields || [])

    const images = prepareImages(req, res)
    if (!images) return

    const removeMediaIds = [...new Set(d.removeMediaIds || [])]

    // Only what was sent is changed; undefined values are skipped by the update
    const values = {
        serviceName: d.serviceName,
        categoryId: d.categoryId,
        serviceDescription: remove.has('description') ? null : d.description,
        servicePrice: remove.has('price') || d.price === null ? null : d.price?.toFixed(2),
        serviceDuration: remove.has('duration') || d.duration === null ? null : d.duration,
        status: d.status,
    }

    if (Object.values(values).every((value) => value === undefined) && !images.all.length && !removeMediaIds.length) {
        return res.status(200).json({ success: false, message: 'Please change at least one field.' })
    }

    let written = false

    try {
        const customer = await findSalonPartner(req, res, d)
        if (!customer) return

        const existing = await serviceModel.findCustomerService(customer.customerId, d.serviceId)
        if (!existing) {
            return res.status(200).json({ success: false, message: 'Service not found.' })
        }

        const category = await categoryModel.findActiveCategoryById(d.categoryId ?? existing.categoryId)
        if (d.categoryId !== undefined && !category) {
            return res.status(200).json({ success: false, message: 'Category not found or not available.' })
        }

        const media = await serviceModel.findServiceMedia(existing.serviceId)

        if (removeMediaIds.some((id) => !media.some((row) => row.mediaId === id))) {
            return res.status(200).json({ success: false, message: 'Image not found for this service.' })
        }

        // A new cover replaces the current one
        const removing = new Set(removeMediaIds)
        const oldCover = media.find((row) => row.isDefault === 'Y' && !removing.has(row.mediaId))
        if (images.cover && oldCover) removing.add(oldCover.mediaId)

        // New images that don't fit replace the oldest non-cover images; removeMediaIds picks exactly which ones go
        const overflow = media.filter((row) => !removing.has(row.mediaId)).length + images.all.length - MAX_IMAGES
        if (overflow > 0) {
            media
                .filter((row) => row.isDefault !== 'Y' && !removing.has(row.mediaId))
                .sort((a, b) => a.mediaId - b.mediaId)
                .slice(0, overflow)
                .forEach((row) => removing.add(row.mediaId))
        }

        const kept = media.filter((row) => !removing.has(row.mediaId))
        if (kept.length + images.all.length > MAX_IMAGES) {
            return res.status(200).json({
                success: false,
                message: `A service can have up to ${MAX_IMAGES} images. Remove one before adding another.`,
            })
        }

        // Keep exactly one cover: the new upload, the current cover, or else the first image left
        const now = authModel.nowString()
        const hasCover = Boolean(images.cover) || kept.some((row) => row.isDefault === 'Y')
        const promoteMediaId = !hasCover && kept.length ? kept[0].mediaId : null
        const newMedia = images.all.map((image, i) =>
            mediaRow(image, image === images.cover || (!hasCover && !kept.length && i === 0) ? 'Y' : 'N', now))

        await writeImages(images.all)
        written = true

        values.serviceUpdatedDate = now
        await serviceModel.updateServiceWithMedia(existing.serviceId, values, {
            removeMediaIds: [...removing],
            newMedia,
            promoteMediaId,
        })

        // Files of removed or replaced images are no longer referenced
        await deleteImageFiles(media.filter((row) => removing.has(row.mediaId)).map((row) => row.media))

        const updated = { ...existing }
        for (const [key, value] of Object.entries(values)) {
            if (value !== undefined) updated[key] = value
        }

        const savedMedia = await serviceModel.findServiceMedia(existing.serviceId)

        // Name the plan only while it is still the partner's active one
        const membership = await membershipModel.findActiveMembership(customer.customerId)
        const membershipName = membership && membership.membershipId === updated.membershipId ? membership.membershipName : null

        return res.status(200).json({
            success: true,
            message: 'Service updated successfully',
            data: convertNulls(formatService(updated, await withImageUrls(req, savedMedia), category, membershipName)),
        })
    } catch (err) {
        if (written) await deleteImageFiles(images.all.map((image) => image.name))
        console.error('Update service error:', err)
        return res.status(200).json({ success: false, message: 'Something went wrong' })
    }
}

const listServices = async (req, res) => {
    if (!(await validateRequestDevice(req, res))) return

    const parsed = listServicesSchema.safeParse(req.body)

    if (!parsed.success) return sendValidationError(res, parsed.error)

    const { serviceId, categoryId, serviceName, minRating, sortBy } = parsed.data
    const priceRange = parsed.data.priceRange !== undefined ? PRICE_RANGES[parsed.data.priceRange] : null
    const isFiltered = Boolean(priceRange) || Boolean(serviceName) || minRating !== undefined

    try {
        const customer = await findLoggedInCustomer(req, res, parsed.data)
        if (!customer) return

        // A Salon Partner sees their own services (active and inactive); a User sees active services of
        // active salons: one salon's when salonId is sent, otherwise every salon's
        const isUser = customer.customerType !== '1'
        const salonId = isUser ? parsed.data.salonId : customer.customerId

        if (isUser && salonId !== undefined && !(await complaintModel.findActiveSalon(salonId))) {
            return res.status(200).json({ success: false, message: 'Salon not found.' })
        }

        const [services, membership, favoritesCount] = await Promise.all([
            serviceModel.findCustomerServicesWithCategory(salonId, {
                activeOnly: isUser,
                serviceId,
                categoryId,
                minPrice: priceRange?.minPrice,
                maxPrice: priceRange?.maxPrice,
                maxPriceExclusive: priceRange?.maxPriceExclusive,
                serviceName: serviceName || undefined,
                minRating,
                sortBy,
            }),
            // The membership badge is the partner's own; a User doesn't see it
            isUser ? null : membershipModel.findActiveMembership(customer.customerId),
            // The ♡ badge: how many services the logged-in customer saved (0 when none)
            favoriteModel.countCustomerFavorites(customer.customerId),
        ])

        if (serviceId !== undefined && !services.length) {
            return res.status(200).json({ success: false, message: 'Service not found.' })
        }

        const media = await withImageUrls(req, await serviceModel.findMediaForServices(services.map((service) => service.serviceId)))

        const formatted = services.map((service) => ({
            ...formatService(
                service,
                media.filter((row) => row.serviceId === service.serviceId),
                { categoryName: service.categoryName },
                membership && membership.membershipId === service.membershipId ? membership.membershipName : null
            ),
            averageRating: Number(Number(service.averageRating).toFixed(1)),
            reviewCount: service.reviewCount,
            // A User's list can mix salons, so each service says whose it is (needed for /service/details)
            ...(isUser && { salonId: service.customerId, salonName: service.salonName }),
        }))

        if (serviceId !== undefined) {
            return res.status(200).json({
                success: true,
                message: 'Service details fetched successfully',
                data: convertNulls({ favoritesCount, service: formatted[0] }),
            })
        }

        return res.status(200).json({
            success: true,
            message: formatted.length
                ? 'Services fetched successfully'
                : isFiltered ? 'No services match these filters'
                    : categoryId !== undefined ? 'No services found in this category'
                        : isUser ? 'No services found' : 'No services added yet',
            data: convertNulls({
                total: formatted.length,
                favoritesCount,
                // What was applied, so the sheets can show the selected chips
                filters: {
                    categoryId: categoryId ?? null,
                    priceRange: priceRange ? priceRange.key : null,
                    priceRangeLabel: priceRange ? priceRange.label : null,
                    serviceName: serviceName || null,
                    minRating: minRating ?? null,
                    sortBy: sortBy ?? null,
                },
                services: formatted,
            }),
        })
    } catch (err) {
        console.error('List services error:', err)
        return res.status(200).json({ success: false, message: 'Something went wrong' })
    }
}

const updateServiceStatus = async (req, res) => {
    if (!(await validateRequestDevice(req, res))) return

    const parsed = serviceStatusSchema.safeParse(req.body)

    if (!parsed.success) return sendValidationError(res, parsed.error)

    const { serviceId, status } = parsed.data
    const statusLabel = status === '1' ? 'Active' : 'Inactive'

    try {
        const customer = await findSalonPartner(req, res, parsed.data)
        if (!customer) return

        const existing = await serviceModel.findCustomerService(customer.customerId, serviceId)
        if (!existing) {
            return res.status(200).json({ success: false, message: 'Service not found.' })
        }

        if (existing.status !== status) {
            await serviceModel.updateServiceStatus(existing.serviceId, status, authModel.nowString())
        }

        return res.status(200).json({
            success: true,
            message: existing.status === status
                ? `Service is already ${statusLabel.toLowerCase()}`
                : `Service ${status === '1' ? 'activated' : 'deactivated'} successfully`,
            data: { serviceId: existing.serviceId, status, statusLabel },
        })
    } catch (err) {
        console.error('Update service status error:', err)
        return res.status(200).json({ success: false, message: 'Something went wrong' })
    }
}

// Service Details page. serviceId / salonId (service_id / salon_id also accepted) are both required.
const serviceIdField = z.coerce.number({ error: 'Service ID is required' }).int().positive('Service ID is required')
const salonIdField = z.coerce.number({ error: 'Salon ID is required' }).int().positive('Salon ID is required')

const serviceDetailsSchema = z.object({
    ...deviceFields,
    serviceId: serviceIdField.optional(),
    service_id: serviceIdField.optional(),
    salonId: salonIdField.optional(),
    salon_id: salonIdField.optional(),
}).strict().superRefine((d, ctx) => {
    if (d.serviceId === undefined && d.service_id === undefined) {
        ctx.addIssue({ code: 'custom', path: ['serviceId'], message: 'Service ID is required' })
    }
    if (d.salonId === undefined && d.salon_id === undefined) {
        ctx.addIssue({ code: 'custom', path: ['salonId'], message: 'Salon ID is required' })
    }
})

// wl_customers.salon_type of the salon offering the service
const SERVICE_TYPES = {
    salon: { key: 'salon', label: 'Salon Service' },
    home_service: { key: 'home_service', label: 'Home Service' },
}

// Shown under "Nearby Salons"; fixed for now, not read from the database
const NEARBY_SALONS = [
    { salonName: 'Beaunic Salon Academy', address: 'Main Market, Dildarnagar', distance: '0.8 km', rating: 4.9 },
    { salonName: 'Aura Unisex Salon', address: 'Station Road, Dildarnagar', distance: '1.2 km', rating: 4.7 },
    { salonName: 'Glow Studio', address: 'Zamania Road, Zamania', distance: '3.4 km', rating: 4.5 },
]

// 1299 -> "₹1,299", 1299.5 -> "₹1,299.50"
const rupees = (value) =>
    `₹${Number(value).toLocaleString('en-IN', { minimumFractionDigits: Number.isInteger(Number(value)) ? 0 : 2, maximumFractionDigits: 2 })}`

// 2600 -> "2.6k"
const shortCount = (value) => (value >= 1000 ? `${Number((value / 1000).toFixed(1))}k` : String(value))

// Customer photos are saved with the salon logos (see auth.controller UPLOAD_DIR)
const PROFILE_PHOTO_FOLDER = 'salon_logos'

// The description is what the partner typed in "What does this service include?", one item per line
const includedItems = (description) =>
    (description || '').split(/\r?\n/).map((line) => line.replace(/^\s*[-•*✓]\s*/, '').trim()).filter(Boolean)

const buildSalonLocation = (salonId, salonName, address) => {
    const parts = address ? [address.address, address.city, address.state].map((part) => part && part.trim()).filter(Boolean) : []
    const fullAddress = parts.length ? `${parts.join(', ')}${address.zipcode ? ` ${address.zipcode.trim()}` : ''}` : null

    return {
        salonId,
        salonName,
        address: address ? address.address : null,
        city: address ? address.city : null,
        state: address ? address.state : null,
        pinCode: address ? address.zipcode : null,
        fullAddress,
        mapLink: fullAddress
            ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([salonName, fullAddress].filter(Boolean).join(', '))}`
            : null,
    }
}

const getServiceDetails = async (req, res) => {
    if (!(await validateRequestDevice(req, res))) return

    const parsed = serviceDetailsSchema.safeParse(req.body)

    if (!parsed.success) return sendValidationError(res, parsed.error)

    const serviceId = parsed.data.serviceId ?? parsed.data.service_id
    const salonId = parsed.data.salonId ?? parsed.data.salon_id

    try {
        const customer = await findLoggedInCustomer(req, res, parsed.data)
        if (!customer) return

        const service = await serviceModel.findActiveServiceWithSalon(serviceId)
        if (!service) {
            return res.status(200).json({ success: false, message: 'Service not found.' })
        }

        if (service.customerId !== salonId) {
            return res.status(200).json({ success: false, message: 'This service is not offered by the selected salon.' })
        }

        if (service.salonCustomerType !== '1' || service.salonStatus !== '1') {
            return res.status(200).json({ success: false, message: 'This salon is not available right now.' })
        }

        const [media, summary, reviewRows, address, favorite] = await Promise.all([
            serviceModel.findServiceMedia(serviceId).then((rows) => withImageUrls(req, rows)),
            reviewModel.findServiceRatingSummary(serviceId, salonId),
            reviewModel.findServiceReviews(serviceId, salonId),
            addressModel.findDefaultAddress(salonId),
            // Whether the logged-in customer saved this service (wl_favorite_services)
            favoriteModel.findFavorite(customer.customerId, serviceId),
        ])

        // Reviewers' photos, checked all at once (null when the file is missing)
        const reviews = await Promise.all(reviewRows.map(async (review) => ({
            ...review,
            photoUrl: await resolveMediaUrl(req, PROFILE_PHOTO_FOLDER, review.customerPhoto, null, env.staticFileBaseUrl),
        })))

        const totalReviews = Number(summary?.totalReviews || 0)
        const averageRating = totalReviews ? Number(Number(summary.averageRating).toFixed(1)) : 0
        const ratingSummary = { averageRating, totalReviews, totalReviewsLabel: shortCount(totalReviews) }
        const serviceType = SERVICE_TYPES[service.salonType] || null
        const price = service.servicePrice !== null ? Number(service.servicePrice) : null

        return res.status(200).json({
            success: true,
            message: 'Service details fetched successfully',
            data: convertNulls({
                // 1. Images
                images: media.map((row) => ({ mediaId: row.mediaId, url: row.url, isCover: row.isDefault === 'Y' })),
                // 2. Service type
                serviceType,
                // 3. Category; label is "Parent · Category" when the category has a parent
                category: {
                    categoryId: service.categoryId || null,
                    categoryName: service.categoryName,
                    parentCategoryId: service.parentCategoryId,
                    parentCategoryName: service.parentCategoryName,
                    label: [service.parentCategoryName, service.categoryName].filter(Boolean).join(' · ') || null,
                },
                // 4. Title
                serviceId: service.serviceId,
                title: service.serviceName,
                categoryName: service.categoryName,
                // The ♡ next to the title
                is_favorite: Boolean(favorite),
                // 5. Ratings & reviews summary
                ratingSummary,
                // 6. Price & duration
                pricing: {
                    price,
                    priceLabel: price !== null ? rupees(price) : 'Price not set',
                    // wl_services has no duration yet
                    duration: null,
                    durationLabel: null,
                    serviceType: serviceType ? serviceType.label : null,
                },
                // 7. Description
                description: service.serviceDescription,
                // 8. What's included
                whatsIncluded: includedItems(service.serviceDescription),
                // 9. Nearby salons
                nearbySalons: NEARBY_SALONS,
                // 10. Salon location
                salonLocation: buildSalonLocation(salonId, service.salonName, address),
                // 11. Reviews
                reviews: {
                    ...ratingSummary,
                    items: reviews.map((review) => ({
                        reviewId: review.reviewId,
                        customerName: [review.firstName, review.lastName].filter(Boolean).join(' ').trim() || null,
                        profileImage: review.photoUrl,
                        rating: Number(review.rating),
                        review: review.reviewText,
                        reviewDate: formatDate(review.reviewAddedDate),
                        reviewAddedDate: review.reviewAddedDate,
                    })),
                },
            }),
        })
    } catch (err) {
        console.error('Service details error:', err)
        return res.status(200).json({ success: false, message: 'Something went wrong' })
    }
}

module.exports = { addService, updateService, listServices, updateServiceStatus, getServiceDetails, buildSalonLocation, rupees, withImageUrls, durationLabel }