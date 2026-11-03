const { eq, and, ne, isNotNull, desc, avg, count } = require("drizzle-orm")
const { alias } = require("drizzle-orm/mysql-core")
const db = require("../config/drizzle")
const { wlReviews } = require("../schema/wl-reviews")
const { wlServices } = require("../schema/wl-services")
const { wlCustomers } = require("../schema/wl-customers")

// The Salon Partner that owns a reviewed item
const salon = alias(wlCustomers, "salon")

// A salon can be reviewed while its partner account is active
const activeSalon = and(eq(salon.customerType, "1"), eq(salon.status, "1"), isNotNull(salon.salonName))

const reviewableServicesQuery = (condition) =>
    db
        .select({
            itemId: wlServices.serviceId,
            itemName: wlServices.serviceName,
            salonId: salon.customerId,
            salonName: salon.salonName,
        })
        .from(wlServices)
        .innerJoin(salon, eq(salon.customerId, wlServices.customerId))
        .where(and(eq(wlServices.status, "1"), activeSalon, condition))

const reviewableSalonsQuery = (condition) =>
    db
        .select({
            itemId: salon.customerId,
            itemName: salon.salonName,
            salonId: salon.customerId,
            salonName: salon.salonName,
        })
        .from(salon)
        .where(and(activeSalon, condition))

const findReviewableService = async (serviceId) =>
    (await reviewableServicesQuery(eq(wlServices.serviceId, serviceId)).limit(1))[0] || null

const findReviewableSalon = async (salonId) =>
    (await reviewableSalonsQuery(eq(salon.customerId, salonId)).limit(1))[0] || null

const createReview = async (values) => {
    const [result] = await db.insert(wlReviews).values(values)

    return result.insertId
}

// A user's own reviews, newest first, with the names shown on each card; deleted ones are left out.
// reviewType is optional; unset means every type.
const findCustomerReviews = async (customerId, { reviewType } = {}) =>
    db
        .select({
            reviewId: wlReviews.reviewId,
            reviewType: wlReviews.reviewType,
            reviewForId: wlReviews.reviewForId,
            salonId: wlReviews.salonId,
            salonName: salon.salonName,
            serviceName: wlServices.serviceName,
            rating: wlReviews.rating,
            reviewText: wlReviews.reviewText,
            status: wlReviews.status,
            reviewAddedDate: wlReviews.reviewAddedDate,
        })
        .from(wlReviews)
        .leftJoin(salon, eq(salon.customerId, wlReviews.salonId))
        .leftJoin(
            wlServices,
            and(eq(wlReviews.reviewType, "service"), eq(wlServices.serviceId, wlReviews.reviewForId))
        )
        .where(
            and(
                eq(wlReviews.customerId, customerId),
                ne(wlReviews.status, "2"),
                reviewType !== undefined ? eq(wlReviews.reviewType, reviewType) : undefined
            )
        )
        .orderBy(desc(wlReviews.reviewId))

// The User who wrote a review
const reviewer = alias(wlCustomers, "reviewer")

// Active reviews of one service at one salon
const serviceReviewCondition = (serviceId, salonId) =>
    and(
        eq(wlReviews.reviewType, "service"),
        eq(wlReviews.reviewForId, serviceId),
        eq(wlReviews.salonId, salonId),
        eq(wlReviews.status, "1")
    )

// Average stars and number of reviews, counted in the database
const findServiceRatingSummary = async (serviceId, salonId) => {
    const rows = await db
        .select({ averageRating: avg(wlReviews.rating), totalReviews: count() })
        .from(wlReviews)
        .where(serviceReviewCondition(serviceId, salonId))

    return rows[0]
}

// The service's reviews with each reviewer's name and photo, newest first
const findServiceReviews = async (serviceId, salonId) =>
    db
        .select({
            reviewId: wlReviews.reviewId,
            customerId: wlReviews.customerId,
            firstName: reviewer.firstName,
            lastName: reviewer.lastName,
            customerPhoto: reviewer.customerPhoto,
            rating: wlReviews.rating,
            reviewText: wlReviews.reviewText,
            reviewAddedDate: wlReviews.reviewAddedDate,
        })
        .from(wlReviews)
        .leftJoin(reviewer, eq(reviewer.customerId, wlReviews.customerId))
        .where(serviceReviewCondition(serviceId, salonId))
        .orderBy(desc(wlReviews.reviewId))

module.exports = {
    findServiceRatingSummary,
    findServiceReviews,
    findReviewableService,
    findReviewableSalon,
    createReview,
    findCustomerReviews,
}
