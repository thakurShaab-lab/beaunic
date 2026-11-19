const { eq, and, asc, avg, count, between, inArray, isNotNull, gte, lte, sql } = require("drizzle-orm")
const db = require("../config/drizzle")
const { wlCustomers } = require("../schema/wl-customers")
const { wlCustomersAddressBook } = require("../schema/wl-customers-address-book")
const { wlReviews } = require("../schema/wl-reviews")
const { wlServices } = require("../schema/wl-services")
const { wlCategories } = require("../schema/wl-categories")
const { wlBookingSlots } = require("../schema/wl-booking-slots")
const { wlDurations } = require("../schema/wl-durations")

const c = wlCustomers
const a = wlCustomersAddressBook

// A salon customers can find: a Salon Partner (customer_type 1) whose account is active (status 1; 0 = pending /
// inactive, 2 = deleted) and not blocked, with a salon name
const activeSalon = and(eq(c.customerType, "1"), eq(c.status, "1"), eq(c.isBlocked, "0"), isNotNull(c.salonName))

// The address a salon is found at: its default address book entry, else its newest
// (the same choice as addressModel.findDefaultAddress, which the rest of the app shows)
const isSalonAddress = sql`${a.addressId} = (
    SELECT a2.address_id FROM wl_customers_address_book a2
    WHERE a2.customer_id = ${a.customerId}
    ORDER BY a2.default_status = 'Y' DESC, a2.address_id DESC
    LIMIT 1
)`

const hasCoordinates = and(isNotNull(a.latitude), isNotNull(a.longitude))

// Metres between the salon and the search point. MySQL POINT takes longitude first, then latitude.
// The search point goes in as parameters.
const distanceMetres = ({ latitude, longitude }) =>
    sql`ST_Distance_Sphere(POINT(${a.longitude}, ${a.latitude}), POINT(${longitude}, ${latitude}))`

// Average stars of the salon's active reviews (its own and its services'); NULL when none
const salonAverageRating = sql`(SELECT AVG(r.rating) FROM wl_reviews r WHERE r.salon_id = ${c.customerId} AND r.status = '1')`

// The screen's filter chips, all optional:
//   area: "Location" (the address book locality, e.g. "Main Market, Dildarnagar"; case and spaces ignored)
//   categoryId: "Service" (an active service in that category or one of its sub-categories)
//   minRating: "Rating 4.7+"
const filterCondition = ({ area, categoryId, minRating } = {}) =>
    and(
        area !== undefined ? sql`LOWER(TRIM(${a.city})) = ${area.trim().toLowerCase()}` : undefined,
        categoryId !== undefined
            ? sql`EXISTS (
                SELECT 1 FROM wl_services s
                WHERE s.customer_id = ${c.customerId} AND s.status = '1'
                  AND s.category_id IN (SELECT ct.category_id FROM wl_categories ct WHERE ct.category_id = ${categoryId} OR ct.parent_id = ${categoryId})
            )`
            : undefined,
        minRating !== undefined ? sql`${salonAverageRating} >= ${minRating}` : undefined
    )

// Salons within radiusMetres of the point. box (from the service) first narrows rows by the
// idx_address_book_coordinates index, so the exact distance is only worked out for the few rows inside it.
const nearbyCondition = ({ latitude, longitude, radiusMetres, box, filters }) =>
    and(
        activeSalon,
        hasCoordinates,
        between(a.latitude, box.minLatitude.toFixed(7), box.maxLatitude.toFixed(7)),
        box.minLongitude !== undefined ? between(a.longitude, box.minLongitude.toFixed(7), box.maxLongitude.toFixed(7)) : undefined,
        isSalonAddress,
        sql`${distanceMetres({ latitude, longitude })} <= ${radiusMetres}`,
        filterCondition(filters)
    )

const salonColumns = {
    salonId: c.customerId,
    salonName: c.salonName,
    serviceType: c.serviceType,
    logo: c.customerPhoto,
    addressId: a.addressId,
    address: a.address,
    city: a.city,
    state: a.state,
    zipcode: a.zipcode,
    country: a.country,
    latitude: a.latitude,
    longitude: a.longitude,
}

// One page of nearby salons, nearest first, with the total (COUNT(*) OVER () — one query for both)
const findNearbySalons = async ({ latitude, longitude, radiusMetres, box, filters, limit, offset }) =>
    db
        .select({
            ...salonColumns,
            distanceMetres: distanceMetres({ latitude, longitude }).mapWith(Number),
            total: sql`COUNT(*) OVER ()`.mapWith(Number),
        })
        .from(a)
        .innerJoin(c, eq(c.customerId, a.customerId))
        .where(nearbyCondition({ latitude, longitude, radiusMetres, box, filters }))
        .orderBy(asc(distanceMetres({ latitude, longitude })), asc(c.customerId))
        .limit(limit)
        .offset(offset)

// The total on its own, for a page past the last one (no rows to carry COUNT(*) OVER ())
const countNearbySalons = async (query) => {
    const [row] = await db
        .select({ total: count() })
        .from(a)
        .innerJoin(c, eq(c.customerId, a.customerId))
        .where(nearbyCondition(query))

    return Number(row.total)
}

// "Location" chip options: the localities of the salons in the radius (other filters ignored), most salons first
const findNearbyAreas = async (query) =>
    db
        .select({ area: sql`TRIM(${a.city})`.mapWith(String), total: count() })
        .from(a)
        .innerJoin(c, eq(c.customerId, a.customerId))
        .where(and(nearbyCondition({ ...query, filters: {} }), sql`TRIM(${a.city}) <> ''`))
        .groupBy(sql`TRIM(${a.city})`)
        .orderBy(sql`COUNT(*) DESC`, sql`TRIM(${a.city})`)

// "Service" chip options: the categories (top level) of the active services of the salons in the radius
const findNearbyCategories = async (query) =>
    db
        .select({
            categoryId: sql`COALESCE(NULLIF(${wlCategories.parentId}, 0), ${wlCategories.categoryId})`.mapWith(Number),
            total: sql`COUNT(DISTINCT ${wlServices.customerId})`.mapWith(Number),
        })
        .from(a)
        .innerJoin(c, eq(c.customerId, a.customerId))
        .innerJoin(wlServices, and(eq(wlServices.customerId, c.customerId), eq(wlServices.status, "1")))
        .innerJoin(wlCategories, eq(wlCategories.categoryId, wlServices.categoryId))
        .where(nearbyCondition({ ...query, filters: {} }))
        .groupBy(sql`COALESCE(NULLIF(${wlCategories.parentId}, 0), ${wlCategories.categoryId})`)

const findCategoryNames = async (categoryIds) => {
    if (!categoryIds.length) return []

    return db
        .select({ categoryId: wlCategories.categoryId, categoryName: wlCategories.categoryName })
        .from(wlCategories)
        .where(and(inArray(wlCategories.categoryId, categoryIds), eq(wlCategories.status, "1")))
        .orderBy(sql`${wlCategories.sortOrder} IS NULL`, asc(wlCategories.sortOrder), asc(wlCategories.categoryName))
}

// One active salon with its address and contact details; distanceMetres when a point is given and the salon has
// coordinates
const findActiveSalon = async (salonId, point) => {
    const rows = await db
        .select({
            ...salonColumns,
            email: c.userName,
            accountMobile: c.mobileNumber,
            addressMobile: a.mobile,
            distanceMetres: point
                ? sql`CASE WHEN ${hasCoordinates} THEN ${distanceMetres(point)} END`.mapWith(Number)
                : sql`NULL`,
        })
        .from(c)
        .leftJoin(a, and(eq(a.customerId, c.customerId), isSalonAddress))
        .where(and(eq(c.customerId, salonId), activeSalon))
        .limit(1)

    return rows[0] || null
}

// Average stars and number of active reviews (the salon's and its services'), for several salons in one query
const findSalonRatings = async (salonIds) => {
    if (!salonIds.length) return []

    return db
        .select({ salonId: wlReviews.salonId, averageRating: avg(wlReviews.rating).mapWith(Number), reviewCount: count() })
        .from(wlReviews)
        .where(and(inArray(wlReviews.salonId, salonIds), eq(wlReviews.status, "1")))
        .groupBy(wlReviews.salonId)
}

// Each salon's first `perSalon` active services (popular ones first), for the tags on the cards
const findTopServices = async (salonIds, perSalon) => {
    if (!salonIds.length) return []

    const ranked = db
        .select({
            salonId: wlServices.customerId,
            serviceId: wlServices.serviceId,
            serviceName: wlServices.serviceName,
            position: sql`ROW_NUMBER() OVER (PARTITION BY ${wlServices.customerId} ORDER BY ${wlServices.isPopular} = '1' DESC, ${wlServices.serviceId} ASC)`.as("position"),
        })
        .from(wlServices)
        .where(and(inArray(wlServices.customerId, salonIds), eq(wlServices.status, "1")))
        .as("ranked")

    return db.select().from(ranked).where(lte(ranked.position, perSalon)).orderBy(ranked.salonId, ranked.position)
}

// The salon's active services for the Services tab, popular first, with the duration name
const findSalonServices = async (salonId) =>
    db
        .select({
            serviceId: wlServices.serviceId,
            serviceName: wlServices.serviceName,
            categoryId: wlServices.categoryId,
            categoryName: wlCategories.categoryName,
            parentCategoryId: wlCategories.parentId,
            servicePrice: wlServices.servicePrice,
            serviceDiscountedPrice: wlServices.serviceDiscountedPrice,
            serviceDuration: wlServices.serviceDuration,
            durationName: wlDurations.durationName,
        })
        .from(wlServices)
        .leftJoin(wlCategories, eq(wlCategories.categoryId, wlServices.categoryId))
        .leftJoin(wlDurations, eq(wlDurations.durationId, wlServices.serviceDuration))
        .where(and(eq(wlServices.customerId, salonId), eq(wlServices.status, "1")))
        .orderBy(sql`${wlServices.isPopular} = '1' DESC`, asc(wlServices.serviceId))

// The salons' active slots from fromDate to toDate (YYYY-MM-DD), one row per salon and day with the last end time,
// for "Open · Mon–Sun"
const findSlotDays = async (salonIds, fromDate, toDate) => {
    if (!salonIds.length) return []

    return db
        .select({
            salonId: wlBookingSlots.customerId,
            slotDate: wlBookingSlots.slotDate,
            lastEndTime: sql`MAX(${wlBookingSlots.endTime})`.mapWith(String),
        })
        .from(wlBookingSlots)
        .where(
            and(
                inArray(wlBookingSlots.customerId, salonIds),
                eq(wlBookingSlots.status, "1"),
                gte(wlBookingSlots.slotDate, fromDate),
                lte(wlBookingSlots.slotDate, toDate)
            )
        )
        .groupBy(wlBookingSlots.customerId, wlBookingSlots.slotDate)
}

module.exports = {
    findNearbySalons,
    countNearbySalons,
    findNearbyAreas,
    findNearbyCategories,
    findCategoryNames,
    findActiveSalon,
    findSalonRatings,
    findTopServices,
    findSalonServices,
    findSlotDays,
}
