const { eq, and, desc, count, inArray } = require("drizzle-orm")
const { alias } = require("drizzle-orm/mysql-core")
const db = require("../config/drizzle")
const { wlFavoriteServices } = require("../schema/wl-favorite-services")
const { wlServices } = require("../schema/wl-services")
const { wlCategories } = require("../schema/wl-categories")
const { wlCustomers } = require("../schema/wl-customers")
const { serviceRatings, averageRating, reviewCount } = require("./service.model")

const findFavorite = async (customerId, serviceId) => {
    const rows = await db
        .select()
        .from(wlFavoriteServices)
        .where(and(eq(wlFavoriteServices.customerId, customerId), eq(wlFavoriteServices.serviceId, serviceId)))
        .limit(1)

    return rows[0] || null
}

// Returns the new favorite_id. A second save of the same service fails with ER_DUP_ENTRY (unique key).
const addFavorite = async (values) => {
    const [result] = await db.insert(wlFavoriteServices).values(values)

    return result.insertId
}

// Returns how many rows were removed (0 when the service wasn't saved)
const removeFavorite = async (customerId, serviceId) => {
    const [result] = await db
        .delete(wlFavoriteServices)
        .where(and(eq(wlFavoriteServices.customerId, customerId), eq(wlFavoriteServices.serviceId, serviceId)))

    return result.affectedRows
}

// The salon offering a saved service
const salon = alias(wlCustomers, "salon")

// One page of the customer's favorites, newest first, with the service, its category, salon and rating.
// Services that were later deactivated or deleted are still listed (the app shows them as unavailable).
const findCustomerFavorites = async (customerId, { limit, offset }) =>
    db
        .select({
            favoriteId: wlFavoriteServices.favoriteId,
            favoriteAddedDate: wlFavoriteServices.favoriteAddedDate,
            serviceId: wlServices.serviceId,
            serviceName: wlServices.serviceName,
            serviceDescription: wlServices.serviceDescription,
            servicePrice: wlServices.servicePrice,
            serviceType: wlServices.serviceType,
            serviceStatus: wlServices.status,
            categoryId: wlServices.categoryId,
            categoryName: wlCategories.categoryName,
            salonId: salon.customerId,
            salonName: salon.salonName,
            salonType: salon.serviceType,
            salonStatus: salon.status,
            averageRating: averageRating.mapWith(Number),
            reviewCount: reviewCount.mapWith(Number),
        })
        .from(wlFavoriteServices)
        .innerJoin(wlServices, eq(wlServices.serviceId, wlFavoriteServices.serviceId))
        .leftJoin(wlCategories, eq(wlCategories.categoryId, wlServices.categoryId))
        .leftJoin(salon, eq(salon.customerId, wlServices.customerId))
        .leftJoin(serviceRatings, eq(serviceRatings.serviceId, wlServices.serviceId))
        .where(eq(wlFavoriteServices.customerId, customerId))
        // Same second for two saves: the later ID first
        .orderBy(desc(wlFavoriteServices.favoriteAddedDate), desc(wlFavoriteServices.favoriteId))
        .limit(limit)
        .offset(offset)

// How many favorites the customer has (for the pagination totals)
const countCustomerFavorites = async (customerId) => {
    const rows = await db
        .select({ total: count() })
        .from(wlFavoriteServices)
        .innerJoin(wlServices, eq(wlServices.serviceId, wlFavoriteServices.serviceId))
        .where(eq(wlFavoriteServices.customerId, customerId))

    return Number(rows[0].total)
}

// Which of these services the customer saved, in one query: a Set of service IDs
const findFavoriteServiceIds = async (customerId, serviceIds) => {
    if (!serviceIds.length) return new Set()

    const rows = await db
        .select({ serviceId: wlFavoriteServices.serviceId })
        .from(wlFavoriteServices)
        .where(and(eq(wlFavoriteServices.customerId, customerId), inArray(wlFavoriteServices.serviceId, serviceIds)))

    return new Set(rows.map((row) => row.serviceId))
}

module.exports = { findFavorite, addFavorite, removeFavorite, findCustomerFavorites, countCustomerFavorites, findFavoriteServiceIds }
