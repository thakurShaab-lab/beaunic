const { eq, and, ne, isNotNull, asc, desc, avg, count, inArray } = require("drizzle-orm")
const { alias } = require("drizzle-orm/mysql-core")
const db = require("../config/drizzle")
const { wlReviews } = require("../schema/wl-reviews")
const { wlServices } = require("../schema/wl-services")
const { wlCustomers } = require("../schema/wl-customers")
const { wlEmployees } = require("../schema/wl-employees")

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

// ---------------------------------------------------------------------------------------------------------------
// Salon Partner: "Reviews & Feedback" — reviews customers wrote about the partner's salon, services, employees and
// products. wl_reviews.salon_id is the partner, so a partner only ever gets their own (general feedback, saved with
// salon_id 0, belongs to no partner). Deleted reviews (status 2) are never included.

// The partner's reviews. status: "1" active / "0" inactive / undefined (both). The other filters are optional.
const partnerReviewCondition = (salonId, { status, reviewType, ratings, serviceId } = {}) =>
    and(
        eq(wlReviews.salonId, salonId),
        status !== undefined ? eq(wlReviews.status, status) : inArray(wlReviews.status, ["1", "0"]),
        reviewType !== undefined ? eq(wlReviews.reviewType, reviewType) : undefined,
        ratings && ratings.length ? inArray(wlReviews.rating, ratings) : undefined,
        serviceId !== undefined ? and(eq(wlReviews.reviewType, "service"), eq(wlReviews.reviewForId, serviceId)) : undefined
    )

const PARTNER_REVIEW_ORDER = {
    newest: () => [desc(wlReviews.reviewAddedDate), desc(wlReviews.reviewId)],
    oldest: () => [asc(wlReviews.reviewAddedDate), asc(wlReviews.reviewId)],
    highest: () => [desc(wlReviews.rating), desc(wlReviews.reviewAddedDate), desc(wlReviews.reviewId)],
    lowest: () => [asc(wlReviews.rating), desc(wlReviews.reviewAddedDate), desc(wlReviews.reviewId)],
}

// One page of the partner's reviews with the reviewer and the reviewed service / employee
const findPartnerReviews = async (salonId, filters, { sortBy = "newest", limit, offset }) =>
    db
        .select({
            reviewId: wlReviews.reviewId,
            reviewType: wlReviews.reviewType,
            reviewForId: wlReviews.reviewForId,
            rating: wlReviews.rating,
            reviewText: wlReviews.reviewText,
            status: wlReviews.status,
            reviewAddedDate: wlReviews.reviewAddedDate,
            customerId: wlReviews.customerId,
            firstName: reviewer.firstName,
            lastName: reviewer.lastName,
            customerPhoto: reviewer.customerPhoto,
            serviceName: wlServices.serviceName,
            employeeName: wlEmployees.employeeName,
            employeeDesignation: wlEmployees.designation,
        })
        .from(wlReviews)
        .leftJoin(reviewer, eq(reviewer.customerId, wlReviews.customerId))
        // Only the partner's own service / employee (never another salon's, even with a wrong review_for_id)
        .leftJoin(
            wlServices,
            and(eq(wlReviews.reviewType, "service"), eq(wlServices.serviceId, wlReviews.reviewForId), eq(wlServices.customerId, wlReviews.salonId))
        )
        .leftJoin(
            wlEmployees,
            and(eq(wlReviews.reviewType, "employee"), eq(wlEmployees.employeeId, wlReviews.reviewForId), eq(wlEmployees.salonId, wlReviews.salonId))
        )
        .where(partnerReviewCondition(salonId, filters))
        .orderBy(...PARTNER_REVIEW_ORDER[sortBy]())
        .limit(limit)
        .offset(offset)

// Number of reviews per type, for the tab counts: { salon: 3, service: 2, ... }
const countPartnerReviewsByType = async (salonId, filters) => {
    const rows = await db
        .select({ reviewType: wlReviews.reviewType, total: count() })
        .from(wlReviews)
        .where(partnerReviewCondition(salonId, filters))
        .groupBy(wlReviews.reviewType)

    return Object.fromEntries(rows.map((row) => [row.reviewType, Number(row.total)]))
}

// Number of reviews per star rating, for the rating filter: { 5: 10, 4: 2, ... }
const countPartnerReviewsByRating = async (salonId, filters) => {
    const rows = await db
        .select({ rating: wlReviews.rating, total: count() })
        .from(wlReviews)
        .where(partnerReviewCondition(salonId, filters))
        .groupBy(wlReviews.rating)

    return Object.fromEntries(rows.map((row) => [Number(row.rating), Number(row.total)]))
}

// Average stars and number of reviews (the header: "4.6 · Average from 5 reviews")
const findPartnerRatingSummary = async (salonId, filters) => {
    const [row] = await db
        .select({ averageRating: avg(wlReviews.rating), totalReviews: count() })
        .from(wlReviews)
        .where(partnerReviewCondition(salonId, filters))

    return { averageRating: row && row.averageRating !== null ? Number(row.averageRating) : 0, totalReviews: Number(row ? row.totalReviews : 0) }
}

// The partner's services that have reviews, for the service filter, most reviewed first
const findPartnerReviewedServices = async (salonId, filters) =>
    db
        .select({ serviceId: wlServices.serviceId, serviceName: wlServices.serviceName, total: count() })
        .from(wlReviews)
        .innerJoin(wlServices, and(eq(wlServices.serviceId, wlReviews.reviewForId), eq(wlServices.customerId, wlReviews.salonId)))
        .where(and(partnerReviewCondition(salonId, filters), eq(wlReviews.reviewType, "service")))
        .groupBy(wlServices.serviceId, wlServices.serviceName)
        .orderBy(desc(count()), asc(wlServices.serviceName))

module.exports = {
    findServiceRatingSummary,
    findServiceReviews,
    findReviewableService,
    findReviewableSalon,
    createReview,
    findCustomerReviews,
    findPartnerReviews,
    countPartnerReviewsByType,
    countPartnerReviewsByRating,
    findPartnerRatingSummary,
    findPartnerReviewedServices,
}
