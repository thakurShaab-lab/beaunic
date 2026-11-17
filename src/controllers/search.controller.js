const { z } = require('zod')
const env = require('../config/env')
const { sendValidationError } = require('../utils/validationError')
const searchModel = require('../models/search.model')
const serviceModel = require('../models/service.model')
const { validateRequestDevice } = require('./device&app.controller')
const { findLoggedInCustomer } = require('./profile.controller')
const { withImageUrls, rupees } = require('./service.controller')
const { convertNulls } = require('../utils/convertNulls')
const { formatDate } = require('../utils/formatDate')
const { resolveMediaUrl } = require('../utils/mediaUrl')

// One search API for both apps (/api/search).
//   scope "customer": services, salons and products across Beaunic — for Users and Salon Partners
//   scope "partner":  the partner's own services, products, and their salon's bookings and customers — Salon Partners only
// A User can only use the customer scope; asking for the partner scope or a partner section is refused.

const SALON_LOGO_FOLDER = 'salon_logos'
const PRODUCT_IMAGE_FOLDER = 'packages'
const DEFAULT_LIMIT = 10
const MAX_LIMIT = 20
const SERVICE_TYPE_LABELS = { salon: 'Salon', home_service: 'Home Service' }

const SECTION_LABELS = {
    services: 'Services',
    salons: 'Salons',
    products: 'Products',
    bookings: 'Bookings',
    customers: 'Customers',
}

// The sections of each scope, in display order
const SCOPES = {
    customer: ['services', 'salons', 'products'],
    partner: ['services', 'products', 'bookings', 'customers'],
}

// "service", "Bookings", "booking id", "customer name" ... -> the section key
const SECTION_ALIASES = {
    service: 'services', services: 'services',
    salon: 'salons', salons: 'salons',
    product: 'products', products: 'products',
    booking: 'bookings', bookings: 'bookings', bookingid: 'bookings',
    customer: 'customers', customers: 'customers', customername: 'customers', customeremail: 'customers',
}

const toSectionList = (value) => {
    if (value === undefined) return undefined
    const parts = Array.isArray(value) ? value : String(value).split(',')
    return [...new Set(parts.map((part) => {
        const key = String(part).trim().toLowerCase().replace(/[^a-z]/g, '')
        return SECTION_ALIASES[key] ?? key
    }).filter(Boolean))]
}

const searchSchema = z.object({
    app_id: z.union([z.string(), z.number()]),
    device_id: z.string().trim().min(1, 'Device ID is required'),
    // Partial text: "ha", "hair", "BK-24", "anjali@", ...
    keyword: z.string({ error: 'Please enter something to search' })
        .trim()
        .min(1, 'Please enter something to search')
        .max(100, 'Search can be up to 100 characters'),
    // Default: "partner" for a Salon Partner, "customer" for a User
    scope: z.preprocess(
        (value) => (typeof value === 'string' ? value.trim().toLowerCase() : value),
        z.enum(Object.keys(SCOPES), { error: 'Scope must be customer or partner' }).optional()
    ),
    // Optional: only these sections ("services,salons" or ["bookings"]); default every section of the scope
    types: z.preprocess(
        toSectionList,
        z.array(z.enum(Object.keys(SECTION_LABELS), { error: 'Types can be: services, salons, products, bookings, customers' })).optional()
    ),
    // Results per section
    limit: z.coerce.number({ error: 'Limit must be a number' }).int().min(1, 'Limit must be at least 1').max(MAX_LIMIT, `Limit can be at most ${MAX_LIMIT}`).optional(),
}).strict()

const fullName = (first, last) => [first, last].filter(Boolean).join(' ').trim() || null
const initials = (name) => (name ? name.split(/\s+/).slice(0, 2).map((part) => part[0].toUpperCase()).join('') : null)

// "17:30:00" -> "05:30 PM"
const timeLabel = (value) => {
    if (!value) return null
    const [hour, minute] = String(value).split(':').map(Number)
    return `${String(hour % 12 || 12).padStart(2, '0')}:${String(minute).padStart(2, '0')} ${hour < 12 ? 'AM' : 'PM'}`
}

// Same tabs as the bookings list
const bookingStatus = (row) => {
    if (row.isCancel === '1' || row.orderStatus === 'Cancelled') return { status: 'cancelled', statusLabel: 'Cancelled' }
    if (['Completed', 'No Show'].includes(row.orderStatus)) return { status: 'completed', statusLabel: row.orderStatus }
    return { status: 'upcoming', statusLabel: 'Upcoming' }
}

// ---- Each section: run the search (limit + 1 rows, to know if there are more) and shape the rows ----

const SECTIONS = {
    services: async ({ req, keyword, limit, scope, customer }) => {
        const rows = await searchModel.searchServices(keyword, { ownerId: scope === 'partner' ? customer.customerId : undefined, limit })
        const firstPhotos = Object.values((await serviceModel.findMediaForServices(rows.map((row) => row.serviceId)))
            .filter((row) => row.mediaType === 'photo')
            .reduce((first, row) => (first[row.serviceId] ? first : { ...first, [row.serviceId]: row }), {}))
        const images = await withImageUrls(req, firstPhotos)

        return rows.map((row) => ({
            type: 'service',
            id: row.serviceId,
            serviceId: row.serviceId,
            title: row.serviceName,
            subtitle: [row.salonName, row.categoryName].filter(Boolean).join(' · ') || null,
            image: images.find((image) => image.serviceId === row.serviceId)?.url || null,
            price: row.servicePrice,
            priceLabel: row.servicePrice !== null ? rupees(row.servicePrice) : 'Price not set',
            categoryId: row.categoryId,
            categoryName: row.categoryName,
            serviceType: row.serviceType,
            serviceTypeLabel: SERVICE_TYPE_LABELS[row.serviceType] || null,
            salonId: row.salonId,
            salonName: row.salonName,
            averageRating: Number(row.averageRating.toFixed(1)),
            reviewCount: row.reviewCount,
            // The partner's own services include inactive ones
            ...(scope === 'partner' && { status: row.status, statusLabel: row.status === '1' ? 'Active' : 'Inactive' }),
        }))
    },

    salons: async ({ req, keyword, limit }) => {
        const rows = await searchModel.searchSalons(keyword, { limit })
        const [serviceCounts, logos] = await Promise.all([
            searchModel.countActiveServices(rows.map((row) => row.salonId)),
            Promise.all(rows.map((row) => resolveMediaUrl(req, SALON_LOGO_FOLDER, row.logo, null, env.staticFileBaseUrl))),
        ])

        return rows.map((row, index) => {
            const serviceCount = Number(serviceCounts.find((item) => item.salonId === row.salonId)?.total || 0)
            return {
                type: 'salon',
                id: row.salonId,
                salonId: row.salonId,
                title: row.salonName,
                subtitle: [SERVICE_TYPE_LABELS[row.serviceType], `${serviceCount} service${serviceCount === 1 ? '' : 's'}`].filter(Boolean).join(' · '),
                image: logos[index],
                serviceType: row.serviceType,
                serviceTypeLabel: SERVICE_TYPE_LABELS[row.serviceType] || null,
                serviceCount,
            }
        })
    },

    products: async ({ req, keyword, limit }) => {
        const rows = await searchModel.searchProducts(keyword, { limit })
        const photos = await searchModel.findProductPhotos(rows.map((row) => row.productId))
        const images = await Promise.all(rows.map((row) =>
            resolveMediaUrl(req, PRODUCT_IMAGE_FOLDER, photos.find((photo) => photo.productId === row.productId)?.media, null, env.staticFileBaseUrl)))

        return rows.map((row, index) => {
            const price = Number(row.price)
            const discounted = Number(row.discountedPrice)
            const hasDiscount = discounted > 0 && discounted < price
            return {
                type: 'product',
                id: row.productId,
                productId: row.productId,
                title: row.productName,
                subtitle: row.categoryName,
                image: images[index],
                price,
                discountedPrice: hasDiscount ? discounted : null,
                priceLabel: rupees(hasDiscount ? discounted : price),
                originalPriceLabel: hasDiscount ? rupees(price) : null,
                categoryId: row.categoryId,
                categoryName: row.categoryName,
                serviceTypeLabel: row.productType === '2' ? 'Home Service' : 'Salon',
            }
        })
    },

    bookings: async ({ keyword, limit, customer }) => {
        const rows = await searchModel.searchSalonBookings(customer.customerId, keyword, { limit })

        return rows.map((row) => {
            const customerName = fullName(row.firstName, row.lastName) || fullName(row.accountFirstName, row.accountLastName)
            const date = formatDate(row.slotDate)
            return {
                type: 'booking',
                id: row.bookingId,
                bookingId: row.bookingId,
                bookingNumber: `BK-${row.bookingId}`,
                title: `BK-${row.bookingId} · ${customerName || 'Customer'}`,
                subtitle: [row.serviceName, date, timeLabel(row.startTime)].filter(Boolean).join(' · ') || null,
                customerId: row.customerId,
                customerName,
                customerEmail: row.email || row.accountEmail,
                serviceName: row.serviceName,
                slotDate: row.slotDate,
                dateLabel: date,
                timeLabel: timeLabel(row.startTime),
                totalAmount: row.totalAmount,
                amountLabel: rupees(row.totalAmount),
                paymentStatus: row.paymentStatus,
                ...bookingStatus(row),
            }
        })
    },

    customers: async ({ req, keyword, limit, customer }) => {
        const rows = await searchModel.searchSalonCustomers(customer.customerId, keyword, { limit })
        const photos = await Promise.all(rows.map((row) => resolveMediaUrl(req, SALON_LOGO_FOLDER, row.photo, null, env.staticFileBaseUrl)))

        return rows.map((row, index) => {
            const name = fullName(row.firstName, row.lastName)
            const bookingCount = Number(row.bookingCount)
            return {
                type: 'customer',
                id: row.customerId,
                customerId: row.customerId,
                title: name,
                subtitle: row.email,
                image: photos[index],
                initials: initials(name),
                customerName: name,
                customerEmail: row.email,
                mobileNumber: row.mobileNumber,
                bookingCount,
                bookingCountLabel: `${bookingCount} booking${bookingCount === 1 ? '' : 's'}`,
                lastBookingDate: row.lastBookingDate,
                lastBookingDateLabel: formatDate(row.lastBookingDate),
            }
        })
    },
}

const search = async (req, res) => {
    if (!(await validateRequestDevice(req, res))) return

    const parsed = searchSchema.safeParse(req.body)

    if (!parsed.success) return sendValidationError(res, parsed.error)

    const d = parsed.data
    const limit = d.limit ?? DEFAULT_LIMIT

    try {
        const customer = await findLoggedInCustomer(req, res, d)
        if (!customer) return

        const isPartner = customer.customerType === '1'
        if (!isPartner && customer.customerType !== '2') {
            return res.status(200).json({ success: false, message: 'Search is not available for your account.' })
        }

        // Role check: the partner scope (and every partner-only section) is for Salon Partners only
        const scope = d.scope ?? (isPartner ? 'partner' : 'customer')
        if (scope === 'partner' && !isPartner) {
            return res.status(200).json({ success: false, message: 'This search is only available for Salon Partners.', field: 'scope' })
        }

        const allowed = SCOPES[scope]
        const notAllowed = (d.types || []).filter((type) => !allowed.includes(type))
        if (notAllowed.length) {
            const partnerOnly = notAllowed.filter((type) => !SCOPES.customer.includes(type))
            return res.status(200).json({
                success: false,
                message: !isPartner && partnerOnly.length
                    ? 'This search is only available for Salon Partners.'
                    : `In ${scope} search you can search: ${allowed.join(', ')}.`,
                field: 'types',
            })
        }

        const keys = allowed.filter((key) => !d.types?.length || d.types.includes(key))
        const context = { req, keyword: d.keyword, limit: limit + 1, scope, customer }

        const sections = await Promise.all(keys.map(async (key) => {
            const items = await SECTIONS[key](context)
            return { key, label: SECTION_LABELS[key], count: Math.min(items.length, limit), hasMore: items.length > limit ? 1 : 0, items: items.slice(0, limit) }
        }))

        const totalResults = sections.reduce((sum, section) => sum + section.count, 0)

        return res.status(200).json({
            success: true,
            message: totalResults ? 'Search results fetched successfully' : 'No results found',
            data: convertNulls({
                keyword: d.keyword,
                scope,
                // Partners can switch between their own search and the customer (marketplace) search
                availableScopes: isPartner ? ['partner', 'customer'] : ['customer'],
                totalResults,
                sections,
            }),
        })
    } catch (err) {
        console.error('Search error:', err)
        return res.status(200).json({ success: false, message: 'Something went wrong' })
    }
}

module.exports = { search }
