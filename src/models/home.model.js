const { eq, and, asc, desc, sql, isNotNull } = require("drizzle-orm")
const { alias } = require("drizzle-orm/mysql-core")
const db = require("../config/drizzle")
const { wlHeaderImages } = require("../schema/wl-header-images")
const { wlCategories } = require("../schema/wl-categories")
const { wlServices } = require("../schema/wl-services")
const { wlCustomers } = require("../schema/wl-customers")
const { serviceRatings, averageRating, reviewCount } = require("./service.model")

// Active header banners (status 1), in the order they were added
const findHeaderBanners = async () =>
    db
        .select({
            bannerId: wlHeaderImages.id,
            image: wlHeaderImages.headerImage,
            redirectUrl: wlHeaderImages.headerUrl,
            title: wlHeaderImages.lineOne,
            subtitle: wlHeaderImages.lineTwo,
            status: wlHeaderImages.status,
        })
        .from(wlHeaderImages)
        .where(eq(wlHeaderImages.status, "1"))
        .orderBy(asc(wlHeaderImages.id))

// Active categories, admin sort order first (unset ones last), then name
const findHomeCategories = async () =>
    db
        .select({
            categoryId: wlCategories.categoryId,
            categoryName: wlCategories.categoryName,
            categoryImage: wlCategories.categoryImage,
            sortOrder: wlCategories.sortOrder,
            status: wlCategories.status,
        })
        .from(wlCategories)
        .where(eq(wlCategories.status, "1"))
        .orderBy(sql`${wlCategories.sortOrder} IS NULL`, asc(wlCategories.sortOrder), asc(wlCategories.categoryName))

const salon = alias(wlCustomers, "salon")

// A service is home service when its own salon_type says so, or (unset) its salon's does
const effectiveType = sql`COALESCE(${wlServices.serviceType}, ${salon.serviceType})`

const SERVICE_SECTIONS = {
    // Marked popular by the admin
    popular: () => eq(wlServices.isPopular, "1"),
    // Bookable at home
    home: () => sql`${effectiveType} = 'home_service'`,
}

// Active services of active, approved salons for one Home section, with rating, review count, duration and type.
// Most reviewed / best rated first.
const findHomeServices = async (section, limit) =>
    db
        .select({
            serviceId: wlServices.serviceId,
            serviceName: wlServices.serviceName,
            servicePrice: wlServices.servicePrice,
            serviceDuration: wlServices.serviceDuration,
            serviceType: effectiveType.mapWith(String),
            categoryId: wlServices.categoryId,
            salonId: salon.customerId,
            salonName: salon.salonName,
            averageRating: averageRating.mapWith(Number),
            reviewCount: reviewCount.mapWith(Number),
        })
        .from(wlServices)
        .innerJoin(salon, eq(salon.customerId, wlServices.customerId))
        .leftJoin(serviceRatings, eq(serviceRatings.serviceId, wlServices.serviceId))
        .where(
            and(
                eq(wlServices.status, "1"),
                eq(salon.customerType, "1"),
                eq(salon.status, "1"),
                isNotNull(salon.salonName),
                SERVICE_SECTIONS[section]()
            )
        )
        .orderBy(desc(reviewCount), desc(averageRating), desc(wlServices.serviceId))
        .limit(limit)

module.exports = { findHeaderBanners, findHomeCategories, findHomeServices }
