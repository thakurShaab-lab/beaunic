const { z } = require('zod')
const { sendValidationError } = require('../utils/validationError')
const authModel = require('../models/auth.model')
const reviewModel = require('../models/review.model')
const { validateRequestDevice } = require('./device&app.controller')
const { findLoggedInCustomer } = require('./profile.controller')
const { noMarkup } = require('./address.controller')
const { convertNulls } = require('../utils/convertNulls')
const { formatDate } = require('../utils/formatDate')
const { istDateLabels } = require('../utils/istDateLabels')
const { resolveMediaUrl } = require('../utils/mediaUrl')
const env = require('../config/env')

// The tabs on the Feedback screen, as stored in wl_reviews.review_type
const REVIEW_TYPES = {
    salon: 'Salon Feedback',
    service: 'Service Feedback',
    employee: 'Employee Feedback',
    product: 'Product Feedback',
}

// Each type's lookups. Employee and product have no tables yet, so they can't be reviewed until those exist.
const REVIEWABLE = {
    salon: { findOne: reviewModel.findReviewableSalon, notFound: 'Salon not found.' },
    service: { findOne: reviewModel.findReviewableService, notFound: 'Service not found.' },
}

const deviceFields = {
    app_id: z.union([z.string(), z.number()]),
    device_id: z.string().trim().min(1, 'Device ID is required'),
}

// Accepts "service", "Service" or the tab label "Service Feedback"
const reviewType = z.preprocess(
    (value) => (typeof value === 'string' ? value.trim().toLowerCase().replace(/\s*feedback$/, '') : value),
    z.enum(Object.keys(REVIEW_TYPES), { error: 'Review type must be one of: salon, service, employee, product' })
)

const addReviewSchema = z.object({
    ...deviceFields,
    reviewType,
    // Optional: blank, null or missing saves general feedback for the review type
    reviewForId: z.coerce.number({ error: 'Review for ID must be a number' }).int().positive('Review for ID must be a number').optional(),
    rating: z.coerce.number({ error: 'Please tap a star to rate' })
        .int('Rating must be a whole number from 1 to 5')
        .min(1, 'Please tap a star to rate')
        .max(5, 'Rating must be from 1 to 5'),
    review: z.string({ error: 'Please write your review' })
        .trim()
        .min(1, 'Please write your review')
        .max(1000, 'Review can be up to 1000 characters')
        .refine(noMarkup, 'Invalid characters'),
}).strict()

const listReviewsSchema = z.object({
    ...deviceFields,
    reviewType: reviewType.optional(),
}).strict()

const findUser = async (req, res, data) => {
    const customer = await findLoggedInCustomer(req, res, data)
    if (!customer) return null

    if (customer.customerType !== '2') {
        res.status(200).json({ success: false, message: 'This feature is only available for Users.' })
        return null
    }

    return customer
}

const notAvailable = (type) => `${REVIEW_TYPES[type].replace(' Feedback', '')} reviews are not available yet.`

// "Spa Pedicure · Glow Studio" for a service, the salon name for a salon
const itemTitle = (itemName, salonName) => [itemName, salonName].filter(Boolean).filter((v, i, all) => all.indexOf(v) === i).join(' · ')

const formatReview = (review) => ({
    reviewId: review.reviewId,
    reviewType: review.reviewType,
    reviewTypeLabel: REVIEW_TYPES[review.reviewType],
    // 0 = general feedback, not about a particular salon or service
    reviewForId: review.reviewForId || null,
    salonId: review.salonId || null,
    salonName: review.salonName,
    title: (review.reviewType === 'service' ? itemTitle(review.serviceName, review.salonName) : itemTitle(review.salonName))
        || REVIEW_TYPES[review.reviewType],
    rating: Number(review.rating),
    review: review.reviewText,
    reviewDate: formatDate(review.reviewAddedDate),
    reviewAddedDate: review.reviewAddedDate,
})

const addReview = async (req, res) => {
    if (!(await validateRequestDevice(req, res))) return

    const parsed = addReviewSchema.safeParse(req.body)

    if (!parsed.success) return sendValidationError(res, parsed.error)

    const d = parsed.data

    try {
        const customer = await findUser(req, res, d)
        if (!customer) return

        // Without reviewForId the review is general feedback for its type, saved with review_for_id / salon_id 0.
        // With one, the salon or service must exist; employees and products can't be looked up yet.
        let item = null
        if (d.reviewForId !== undefined) {
            if (!REVIEWABLE[d.reviewType]) {
                return res.status(200).json({ success: false, message: notAvailable(d.reviewType) })
            }

            item = await REVIEWABLE[d.reviewType].findOne(d.reviewForId)
            if (!item) {
                return res.status(200).json({ success: false, message: REVIEWABLE[d.reviewType].notFound })
            }
        }

        const now = authModel.nowString()
        const review = {
            customerId: customer.customerId,
            reviewType: d.reviewType,
            reviewForId: item ? item.itemId : 0,
            salonId: item ? item.salonId : 0,
            rating: d.rating,
            reviewText: d.review,
            status: '1',
            reviewAddedDate: now,
            reviewUpdatedDate: now,
        }

        const reviewId = await reviewModel.createReview(review)

        return res.status(200).json({
            success: true,
            message: 'Review submitted successfully',
            data: convertNulls(formatReview({
                ...review,
                reviewId,
                salonName: item ? item.salonName : null,
                serviceName: item && d.reviewType === 'service' ? item.itemName : null,
            })),
        })
    } catch (err) {
        console.error('Add review error:', err)
        return res.status(200).json({ success: false, message: 'Something went wrong' })
    }
}

// "My Reviews"
const listReviews = async (req, res) => {
    if (!(await validateRequestDevice(req, res))) return

    const parsed = listReviewsSchema.safeParse(req.body)

    if (!parsed.success) return sendValidationError(res, parsed.error)

    try {
        const customer = await findUser(req, res, parsed.data)
        if (!customer) return

        const reviews = await reviewModel.findCustomerReviews(customer.customerId, { reviewType: parsed.data.reviewType })

        return res.status(200).json({
            success: true,
            message: reviews.length ? 'Reviews fetched successfully' : 'No reviews yet',
            data: convertNulls({
                total: reviews.length,
                reviews: reviews.map(formatReview),
            }),
        })
    } catch (err) {
        console.error('List reviews error:', err)
        return res.status(200).json({ success: false, message: 'Something went wrong' })
    }
}

// ---------------------------------------------------------------------------------------------------------------
// Salon Partner: "Reviews & Feedback" — what customers wrote about the partner's salon, services, employees and
// products. Only the logged-in partner's own reviews (wl_reviews.salon_id = the partner) are ever returned.

const DEFAULT_PAGE_SIZE = 10
const MAX_PAGE_SIZE = 50

// Customer photos are saved with the salon logos (as on /service/details)
const PROFILE_PHOTO_FOLDER = 'salon_logos'

// The tabs, in screen order: key = wl_reviews.review_type
const PARTNER_TABS = [
    { key: 'salon', label: 'Salon' },
    { key: 'service', label: 'Services' },
    { key: 'employee', label: 'Employees' },
    { key: 'product', label: 'Orders' },
]

// wl_reviews.status: 1 = Active, 0 = Inactive (hidden by the admin); 2 = Deleted is never shown
const REVIEW_STATUSES = { active: '1', inactive: '0' }
const REVIEW_STATUS_LABELS = { 1: 'Active', 0: 'Inactive' }

const lowerText = (value) => (typeof value === 'string' ? value.trim().toLowerCase() : value)

// The tab: "salon", "service" / "services", "employee" / "employees", "product" / "products" / "orders",
// or a tab label like "Service Feedback"; "all" (or not sent) = every type
const TAB_ALIASES = { services: 'service', employees: 'employee', products: 'product', order: 'product', orders: 'product' }
const partnerReviewType = z.preprocess(
    (value) => {
        if (typeof value !== 'string') return value
        const key = value.trim().toLowerCase().replace(/\s*feedback$/, '')
        return TAB_ALIASES[key] || key
    },
    z.enum(['all', ...Object.keys(REVIEW_TYPES)], { error: 'Review type must be one of: all, salon, service, employee, product' })
)

// Star filter: 5, "5", "4,5" or [4, 5]
const ratingsField = z.preprocess(
    (value) => {
        if (typeof value === 'number') return [value]
        if (typeof value === 'string') return value.split(',').map((part) => part.trim()).filter(Boolean)
        return value
    },
    z.array(
        z.coerce.number({ error: 'Rating must be from 1 to 5' }).int('Rating must be from 1 to 5').min(1, 'Rating must be from 1 to 5').max(5, 'Rating must be from 1 to 5'),
        { error: 'Rating must be from 1 to 5' }
    )
        .max(5, 'Rating must be from 1 to 5')
        .transform((ratings) => [...new Set(ratings)].sort((a, b) => b - a))
)

const partnerReviewsSchema = z.object({
    ...deviceFields,
    reviewType: partnerReviewType.optional(),
    rating: ratingsField.optional(),
    // Reviews of one of the partner's services (Services tab)
    serviceId: z.coerce.number({ error: 'Service ID must be a number' }).int('Service ID must be a number').positive('Service ID must be a number').optional(),
    // active (default), inactive or all
    status: z.preprocess(lowerText, z.enum(['all', ...Object.keys(REVIEW_STATUSES)], { error: 'Status must be all, active or inactive' }).optional()),
    sortBy: z.preprocess(lowerText, z.enum(['newest', 'oldest', 'highest', 'lowest'], { error: 'Sort must be newest, oldest, highest or lowest' }).optional()),
    page: z.coerce.number({ error: 'Page must be a number' }).int().min(1, 'Page must be at least 1').optional(),
    limit: z.coerce.number({ error: 'Limit must be a number' }).int().min(1, 'Limit must be at least 1').max(MAX_PAGE_SIZE, `Limit can be at most ${MAX_PAGE_SIZE}`).optional(),
}).strict().superRefine((d, ctx) => {
    if (d.serviceId !== undefined && d.reviewType !== undefined && !['all', 'service'].includes(d.reviewType)) {
        ctx.addIssue({ code: 'custom', path: ['serviceId'], message: 'Service filter is only for service reviews' })
    }
})

// Salon Partners only (customer_type 1)
const findSalonPartner = async (req, res, data) => {
    const customer = await findLoggedInCustomer(req, res, data)
    if (!customer) return null

    if (customer.customerType !== '1') {
        res.status(200).json({ success: false, message: 'This feature is only available for Salon Partners.' })
        return null
    }

    return customer
}

// The chip under each review: what was reviewed
const reviewTag = (row) => {
    if (row.reviewType === 'salon') return 'Salon visit'
    if (row.reviewType === 'service') return row.serviceName || 'Service'
    if (row.reviewType === 'employee') return row.employeeName || 'Employee'
    return 'Product order'
}

// The reviewed item: the salon itself, one of its services / employees, or a product (no products table yet)
const reviewedItem = (row, salon) => {
    const id = row.reviewForId || null
    if (row.reviewType === 'salon') return { type: 'salon', id: salon.salonId, name: salon.salonName }
    if (row.reviewType === 'service') return { type: 'service', id, name: row.serviceName }
    if (row.reviewType === 'employee') return { type: 'employee', id, name: row.employeeName, designation: row.employeeDesignation }
    return { type: 'product', id, name: null }
}

const formatPartnerReview = (row, photoUrl, salon) => {
    const customerName = [row.firstName, row.lastName].map((part) => part && part.trim()).filter(Boolean).join(' ') || 'Customer'
    const added = istDateLabels(row.reviewAddedDate)

    return {
        reviewId: row.reviewId,
        reviewType: row.reviewType,
        reviewTypeLabel: REVIEW_TYPES[row.reviewType],
        customerId: row.customerId,
        customerName,
        // "PS" for the avatar when there's no photo
        initials: customerName.split(/\s+/).filter(Boolean).slice(0, 2).map((word) => word[0]).join('').toUpperCase(),
        profileImage: photoUrl,
        rating: Number(row.rating),
        review: row.reviewText,
        tag: reviewTag(row),
        item: reviewedItem(row, salon),
        status: row.status === '1' ? 'active' : 'inactive',
        statusLabel: REVIEW_STATUS_LABELS[row.status],
        reviewDate: added.date,
        reviewTime: added.time,
        reviewDateTime: added.dateTime,
        reviewAddedDate: row.reviewAddedDate,
    }
}

// "Reviews & Feedback": the header rating, the tabs with counts, the filters and one page of reviews (latest first)
const listPartnerReviews = async (req, res) => {
    if (!(await validateRequestDevice(req, res))) return

    const parsed = partnerReviewsSchema.safeParse(req.body)

    if (!parsed.success) return sendValidationError(res, parsed.error)

    const d = parsed.data
    const page = d.page ?? 1
    const limit = d.limit ?? DEFAULT_PAGE_SIZE
    const sortBy = d.sortBy ?? 'newest'
    const selectedStatus = d.status ?? 'active'
    // A service filter on its own means the Services tab
    const selectedType = d.reviewType ?? (d.serviceId !== undefined ? 'service' : 'all')
    const ratings = d.rating || []

    const status = REVIEW_STATUSES[selectedStatus]
    const reviewType = selectedType === 'all' ? undefined : selectedType

    try {
        const partner = await findSalonPartner(req, res, d)
        if (!partner) return

        const salonId = partner.customerId
        const filters = { status, reviewType, ratings, serviceId: d.serviceId }
        const [salonRow, rows, summary, typeCounts, ratingCounts, services] = await Promise.all([
            reviewModel.findReviewableSalon(salonId),
            reviewModel.findPartnerReviews(salonId, filters, { sortBy, limit, offset: (page - 1) * limit }),
            // Header: every active review of the partner, whatever is selected
            reviewModel.findPartnerRatingSummary(salonId, { status: '1' }),
            // Tab counts: the status filter only
            reviewModel.countPartnerReviewsByType(salonId, { status }),
            // Star counts: the selected tab and service, every rating
            reviewModel.countPartnerReviewsByRating(salonId, { status, reviewType, serviceId: d.serviceId }),
            // Service filter: on the Services tab (or all)
            !reviewType || reviewType === 'service' ? reviewModel.findPartnerReviewedServices(salonId, { status }) : [],
        ])

        // Reviewers' photos, each file checked once (null when missing; the app shows the initials)
        const photoNames = [...new Set(rows.map((row) => row.customerPhoto).filter(Boolean))]
        const photoUrls = new Map(await Promise.all(photoNames.map(async (name) =>
            [name, await resolveMediaUrl(req, PROFILE_PHOTO_FOLDER, name, null, env.staticFileBaseUrl)])))

        const salon = { salonId, salonName: salonRow ? salonRow.salonName : null }
        const total = (ratings.length ? ratings : [1, 2, 3, 4, 5]).reduce((sum, rating) => sum + (ratingCounts[rating] || 0), 0)
        const totalPages = Math.ceil(total / limit)
        const averageRating = summary.totalReviews ? Number(summary.averageRating.toFixed(1)) : 0
        const allCount = Object.values(typeCounts).reduce((sum, n) => sum + n, 0)
        const reviewWord = (n) => (n === 1 ? 'review' : 'reviews')

        return res.status(200).json({
            success: true,
            message: rows.length
                ? 'Reviews fetched successfully'
                : ratings.length || d.serviceId !== undefined ? 'No reviews match the selected filters'
                    : reviewType ? `No ${PARTNER_TABS.find((tab) => tab.key === reviewType).label.toLowerCase()} reviews yet`
                        : 'No reviews yet',
            data: convertNulls({
                title: 'Reviews & Feedback',
                summary: {
                    averageRating,
                    averageRatingLabel: averageRating.toFixed(1),
                    totalReviews: summary.totalReviews,
                    // "Average from 5 reviews"
                    subtitle: summary.totalReviews ? `Average from ${summary.totalReviews} ${reviewWord(summary.totalReviews)}` : 'No reviews yet',
                },
                // "Salon · 3", "Services · 2", ...
                tabs: [{ key: 'all', label: 'All' }, ...PARTNER_TABS].map((tab) => {
                    const tabCount = tab.key === 'all' ? allCount : typeCounts[tab.key] || 0
                    return { ...tab, count: tabCount, title: `${tab.label} · ${tabCount}`, isSelected: tab.key === selectedType }
                }),
                ratingFilters: [5, 4, 3, 2, 1].map((rating) => ({
                    rating,
                    label: `${rating} ★`,
                    count: ratingCounts[rating] || 0,
                    isSelected: ratings.includes(rating),
                })),
                serviceFilters: services.map((service) => ({
                    serviceId: service.serviceId,
                    serviceName: service.serviceName,
                    count: Number(service.total),
                    isSelected: service.serviceId === d.serviceId,
                })),
                statusFilters: ['active', 'inactive', 'all'].map((key) => ({
                    key,
                    label: key === 'all' ? 'All' : REVIEW_STATUS_LABELS[REVIEW_STATUSES[key]],
                    isSelected: key === selectedStatus,
                })),
                selectedType,
                selectedRatings: ratings,
                selectedServiceId: d.serviceId ?? null,
                selectedStatus,
                sortBy,
                reviews: rows.map((row) => formatPartnerReview(row, photoUrls.get(row.customerPhoto) || null, salon)),
                pagination: { page, limit, total, totalPages, hasNextPage: page < totalPages },
            }),
        })
    } catch (err) {
        console.error('Partner reviews error:', err)
        return res.status(200).json({ success: false, message: 'Something went wrong' })
    }
}

module.exports = { addReview, listReviews, listPartnerReviews }
