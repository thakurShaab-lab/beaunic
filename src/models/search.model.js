const { eq, and, or, ne, sql, asc, desc, isNotNull, inArray, max, count } = require("drizzle-orm")
const { alias } = require("drizzle-orm/mysql-core")
const db = require("../config/drizzle")
const { wlServices } = require("../schema/wl-services")
const { wlCustomers } = require("../schema/wl-customers")
const { wlCategories } = require("../schema/wl-categories")
const { wlPackages } = require("../schema/wl-packages")
const { wlPackagesMedia } = require("../schema/wl-packages-media")
const { wlBookings } = require("../schema/wl-bookings")
const { isBooking } = require("./bookingScope")
const { serviceRatings, averageRating, reviewCount } = require("./service.model")

// Search (/api/search): partial, case-insensitive matching on the keyword ("hai" finds "Hair & Care").
// Each search returns up to `limit` rows; callers ask for one more to know whether there are more.

// "50%_off" -> "50\%\_off", so LIKE matches the text literally
const escapeLike = (value) => value.replace(/[\\%_]/g, (ch) => `\\${ch}`)
const contains = (keyword) => `%${escapeLike(keyword)}%`
const startsWith = (keyword) => `${escapeLike(keyword)}%`

// Rows whose name starts with the keyword come before rows that only contain it
const prefixFirst = (column, keyword) => asc(sql`CASE WHEN ${column} LIKE ${startsWith(keyword)} THEN 0 ELSE 1 END`)

const salon = alias(wlCustomers, "salon")
const effectiveType = sql`COALESCE(${wlServices.serviceType}, ${salon.serviceType})`

// Services by name or category name.
//   ownerId undefined: the marketplace — active services of active salons (what customers can book)
//   ownerId set: that partner's own services, active and inactive (deleted ones never)
const searchServices = async (keyword, { ownerId, limit }) =>
    db
        .select({
            serviceId: wlServices.serviceId,
            serviceName: wlServices.serviceName,
            servicePrice: wlServices.servicePrice,
            serviceType: effectiveType.mapWith(String),
            status: wlServices.status,
            categoryId: wlServices.categoryId,
            categoryName: wlCategories.categoryName,
            salonId: salon.customerId,
            salonName: salon.salonName,
            averageRating: averageRating.mapWith(Number),
            reviewCount: reviewCount.mapWith(Number),
        })
        .from(wlServices)
        .innerJoin(salon, eq(salon.customerId, wlServices.customerId))
        .leftJoin(wlCategories, eq(wlCategories.categoryId, wlServices.categoryId))
        .leftJoin(serviceRatings, eq(serviceRatings.serviceId, wlServices.serviceId))
        .where(
            and(
                ownerId !== undefined
                    ? and(eq(wlServices.customerId, ownerId), ne(wlServices.status, "2"))
                    : and(eq(wlServices.status, "1"), eq(salon.customerType, "1"), eq(salon.status, "1"), isNotNull(salon.salonName)),
                or(
                    sql`${wlServices.serviceName} LIKE ${contains(keyword)}`,
                    sql`${wlCategories.categoryName} LIKE ${contains(keyword)}`
                )
            )
        )
        .orderBy(prefixFirst(wlServices.serviceName, keyword), asc(wlServices.serviceName), desc(wlServices.serviceId))
        .limit(limit)

// Active Salon Partners by salon name
const searchSalons = async (keyword, { limit }) =>
    db
        .select({
            salonId: wlCustomers.customerId,
            salonName: wlCustomers.salonName,
            serviceType: wlCustomers.serviceType,
            logo: wlCustomers.customerPhoto,
        })
        .from(wlCustomers)
        .where(
            and(
                eq(wlCustomers.customerType, "1"),
                eq(wlCustomers.status, "1"),
                isNotNull(wlCustomers.salonName),
                sql`${wlCustomers.salonName} LIKE ${contains(keyword)}`
            )
        )
        .orderBy(prefixFirst(wlCustomers.salonName, keyword), asc(wlCustomers.salonName))
        .limit(limit)

// How many active services each salon has, for the salon results
const countActiveServices = async (salonIds) => {
    if (!salonIds.length) return []

    return db
        .select({ salonId: wlServices.customerId, total: count() })
        .from(wlServices)
        .where(and(inArray(wlServices.customerId, salonIds), eq(wlServices.status, "1")))
        .groupBy(wlServices.customerId)
}

// Products: the active items of the Beaunic catalogue (wl_packages), by name or category name
const searchProducts = async (keyword, { limit }) =>
    db
        .select({
            productId: wlPackages.packageId,
            productName: wlPackages.packageName,
            price: wlPackages.packagePrice,
            discountedPrice: wlPackages.packageDiscountedPrice,
            productType: wlPackages.packageType,
            categoryId: wlPackages.categoryId,
            categoryName: wlCategories.categoryName,
        })
        .from(wlPackages)
        .leftJoin(wlCategories, eq(wlCategories.categoryId, wlPackages.categoryId))
        .where(
            and(
                eq(wlPackages.status, "1"),
                or(
                    sql`${wlPackages.packageName} LIKE ${contains(keyword)}`,
                    sql`${wlCategories.categoryName} LIKE ${contains(keyword)}`
                )
            )
        )
        .orderBy(prefixFirst(wlPackages.packageName, keyword), asc(wlPackages.packageName))
        .limit(limit)

// The cover photo of each product (default first, then the oldest)
const findProductPhotos = async (productIds) => {
    if (!productIds.length) return []

    return db
        .select({ productId: wlPackagesMedia.packageId, media: wlPackagesMedia.media })
        .from(wlPackagesMedia)
        .where(and(inArray(wlPackagesMedia.packageId, productIds), eq(wlPackagesMedia.mediaType, "photo")))
        .orderBy(desc(sql`${wlPackagesMedia.isDefault} = 'Y'`), asc(wlPackagesMedia.id))
}

// "BK-24031", "bk24031", "24031", "240" -> "240..." (booking IDs starting with those digits); null if not an ID
const bookingIdDigits = (keyword) => {
    const match = /^(?:bk-?)?(\d+)$/i.exec(keyword.replace(/\s+/g, ""))
    return match ? match[1] : null
}

const customer = alias(wlCustomers, "booked_by")
const bookingCustomerName = sql`CONCAT_WS(' ', ${wlBookings.firstName}, ${wlBookings.lastName})`
const accountName = sql`CONCAT_WS(' ', ${customer.firstName}, ${customer.lastName})`

// Partner: bookings at their salon only, by booking ID, customer name or customer email
// (the name / email saved on the booking, or the customer's account)
const searchSalonBookings = async (salonId, keyword, { limit }) => {
    const digits = bookingIdDigits(keyword)
    const pattern = contains(keyword)

    return db
        .select({
            bookingId: wlBookings.bookingId,
            invoiceNumber: wlBookings.invoiceNumber,
            customerId: wlBookings.customerId,
            firstName: wlBookings.firstName,
            lastName: wlBookings.lastName,
            email: wlBookings.email,
            accountFirstName: customer.firstName,
            accountLastName: customer.lastName,
            accountEmail: customer.userName,
            serviceName: wlBookings.serviceName,
            slotDate: wlBookings.slotDate,
            startTime: wlBookings.startTime,
            totalAmount: wlBookings.totalAmount,
            orderStatus: wlBookings.orderStatus,
            isCancel: wlBookings.isCancel,
            paymentStatus: wlBookings.paymentStatus,
        })
        .from(wlBookings)
        .leftJoin(customer, eq(customer.customerId, wlBookings.customerId))
        .where(
            and(
                eq(wlBookings.salonId, salonId),
                isBooking,
                or(
                    digits ? sql`CAST(${wlBookings.bookingId} AS CHAR) LIKE ${`${digits}%`}` : undefined,
                    sql`${bookingCustomerName} LIKE ${pattern}`,
                    sql`${wlBookings.email} LIKE ${pattern}`,
                    sql`${accountName} LIKE ${pattern}`,
                    sql`${customer.userName} LIKE ${pattern}`
                )
            )
        )
        // An exact booking ID first, then the newest
        .orderBy(
            ...(digits ? [asc(sql`CASE WHEN ${wlBookings.bookingId} = ${Number(digits)} THEN 0 ELSE 1 END`)] : []),
            desc(wlBookings.bookingId)
        )
        .limit(limit)
}

// Partner: customers who have booked at their salon, by name or email. Customers with no booking at this
// salon are never returned, so a partner can't look up other salons' customers.
const searchSalonCustomers = async (salonId, keyword, { limit }) => {
    const pattern = contains(keyword)

    return db
        .select({
            customerId: customer.customerId,
            firstName: customer.firstName,
            lastName: customer.lastName,
            email: customer.userName,
            mobileNumber: customer.mobileNumber,
            photo: customer.customerPhoto,
            bookingCount: count(),
            lastBookingDate: max(wlBookings.slotDate),
        })
        .from(wlBookings)
        .innerJoin(customer, eq(customer.customerId, wlBookings.customerId))
        .where(
            and(
                eq(wlBookings.salonId, salonId),
                or(
                    sql`${accountName} LIKE ${pattern}`,
                    sql`${customer.userName} LIKE ${pattern}`,
                    sql`${bookingCustomerName} LIKE ${pattern}`,
                    sql`${wlBookings.email} LIKE ${pattern}`
                )
            )
        )
        .groupBy(customer.customerId, customer.firstName, customer.lastName, customer.userName, customer.mobileNumber, customer.customerPhoto)
        .orderBy(prefixFirst(accountName, keyword), asc(accountName))
        .limit(limit)
}

module.exports = {
    searchServices,
    searchSalons,
    countActiveServices,
    searchProducts,
    findProductPhotos,
    searchSalonBookings,
    searchSalonCustomers,
}
