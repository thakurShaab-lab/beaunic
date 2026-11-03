const { z } = require('zod')
const { sendValidationError } = require('../utils/validationError')
const authModel = require('../models/auth.model')
const reviewModel = require('../models/review.model')
const { validateRequestDevice } = require('./device&app.controller')
const { findLoggedInCustomer } = require('./profile.controller')
const { noMarkup } = require('./address.controller')
const { convertNulls } = require('../utils/convertNulls')
const { formatDate } = require('../utils/formatDate')

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
    reviewForId: z.coerce.number({ error: 'Please select what you are reviewing' }).int().positive('Please select what you are reviewing').optional(),
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
    reviewForId: review.reviewForId,
    salonId: review.salonId || null,
    salonName: review.salonName,
    title: review.reviewType === 'service' ? itemTitle(review.serviceName, review.salonName) : itemTitle(review.salonName),
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

        if (!REVIEWABLE[d.reviewType]) {
            return res.status(200).json({ success: false, message: notAvailable(d.reviewType) })
        }

        const item = await REVIEWABLE[d.reviewType].findOne(d.reviewForId)
        if (!item) {
            return res.status(200).json({ success: false, message: REVIEWABLE[d.reviewType].notFound })
        }

        const now = authModel.nowString()
        const review = {
            customerId: customer.customerId,
            reviewType: d.reviewType,
            reviewForId: item.itemId,
            salonId: item.salonId,
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
                salonName: item.salonName,
                serviceName: d.reviewType === 'service' ? item.itemName : null,
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

module.exports = { addReview, listReviews }
