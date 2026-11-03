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
const { validateRequestDevice } = require('./device&app.controller')
const { detectImageExt } = require('./auth.controller')
const { findLoggedInCustomer } = require('./profile.controller')
const { noMarkup } = require('./address.controller')
const { convertNulls } = require('../utils/convertNulls')

const SERVICE_IMAGE_FOLDER = 'services'
// UPLOAD_DIR is the folder served at /uploaded_files, so images are saved straight under it
const SERVICE_IMAGE_DIR = path.join(env.uploadDir, SERVICE_IMAGE_FOLDER)

// Image tiles on the screen: Cover plus up to two more, saved in wl_services_media
const MAX_IMAGES = 3

// Blank form fields are ignored, so an edit clears a saved value by naming it here
const REMOVABLE_FIELDS = ['price', 'description']

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
    for (const field of ['price', 'description']) {
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
const listServicesSchema = z.object({
    ...deviceFields,
    serviceId: z.coerce.number({ error: 'Service ID must be a number' }).int().positive('Service ID must be a number').optional(),
    categoryId: z.coerce.number({ error: 'Category ID must be a number' }).int().positive('Category ID must be a number').optional(),
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

const imageUrl = (name) => (name ? `${env.staticFileBaseUrl}/${SERVICE_IMAGE_FOLDER}/${name}` : null)

// Shaped like the Add/Edit Service screen and the service card
const formatService = (service, media, category, membershipName) => {
    const images = media.map((row) => ({ mediaId: row.mediaId, url: imageUrl(row.media), isCover: row.isDefault === 'Y' }))
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
            data: convertNulls(formatService({ ...service, serviceId }, media, category, membership.membershipName)),
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
            data: convertNulls(formatService(updated, savedMedia, category, membershipName)),
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

    const { serviceId, categoryId } = parsed.data

    try {
        const customer = await findSalonPartner(req, res, parsed.data)
        if (!customer) return

        const [services, membership] = await Promise.all([
            serviceModel.findCustomerServicesWithCategory(customer.customerId, { serviceId, categoryId }),
            membershipModel.findActiveMembership(customer.customerId),
        ])

        if (serviceId !== undefined && !services.length) {
            return res.status(200).json({ success: false, message: 'Service not found.' })
        }

        const media = await serviceModel.findMediaForServices(services.map((service) => service.serviceId))

        const formatted = services.map((service) => formatService(
            service,
            media.filter((row) => row.serviceId === service.serviceId),
            { categoryName: service.categoryName },
            membership && membership.membershipId === service.membershipId ? membership.membershipName : null
        ))

        if (serviceId !== undefined) {
            return res.status(200).json({
                success: true,
                message: 'Service details fetched successfully',
                data: convertNulls({ service: formatted[0] }),
            })
        }

        return res.status(200).json({
            success: true,
            message: formatted.length
                ? 'Services fetched successfully'
                : categoryId !== undefined ? 'No services found in this category' : 'No services added yet',
            data: convertNulls({ total: formatted.length, services: formatted }),
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

module.exports = { addService, updateService, listServices, updateServiceStatus }
