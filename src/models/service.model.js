const { eq, and, ne, inArray, asc, desc, sql } = require("drizzle-orm")
const { alias } = require("drizzle-orm/mysql-core")
const db = require("../config/drizzle")
const { wlServices } = require("../schema/wl-services")
const { wlCustomers } = require("../schema/wl-customers")
const { wlServicesMedia } = require("../schema/wl-services-media")
const { wlCategories } = require("../schema/wl-categories")

// wl_services.status: 1=Active, 0=Inactive, 2=Deleted; a partner can only reach their own services
const findCustomerService = async (customerId, serviceId) => {
    const rows = await db
        .select()
        .from(wlServices)
        .where(
            and(
                eq(wlServices.serviceId, serviceId),
                eq(wlServices.customerId, customerId),
                ne(wlServices.status, "2")
            )
        )
        .limit(1)

    return rows[0] || null
}

// A partner's services with their category name, newest first; deleted ones are left out.
// Optional filters: serviceId (one service) and categoryId (one category); unset ones are ignored.
const findCustomerServicesWithCategory = async (customerId, { serviceId, categoryId } = {}) =>
    db
        .select({
            serviceId: wlServices.serviceId,
            customerId: wlServices.customerId,
            membershipId: wlServices.membershipId,
            categoryId: wlServices.categoryId,
            categoryName: wlCategories.categoryName,
            serviceName: wlServices.serviceName,
            serviceDescription: wlServices.serviceDescription,
            servicePrice: wlServices.servicePrice,
            status: wlServices.status,
            serviceAddedDate: wlServices.serviceAddedDate,
            serviceUpdatedDate: wlServices.serviceUpdatedDate,
        })
        .from(wlServices)
        .leftJoin(wlCategories, eq(wlCategories.categoryId, wlServices.categoryId))
        .where(
            and(
                eq(wlServices.customerId, customerId),
                ne(wlServices.status, "2"),
                serviceId !== undefined ? eq(wlServices.serviceId, serviceId) : undefined,
                categoryId !== undefined ? eq(wlServices.categoryId, categoryId) : undefined
            )
        )
        .orderBy(desc(wlServices.serviceId))

// Images for several services in one query, cover first
const findMediaForServices = async (serviceIds) => {
    if (!serviceIds.length) return []

    return db
        .select({
            mediaId: wlServicesMedia.id,
            serviceId: wlServicesMedia.serviceId,
            mediaType: wlServicesMedia.mediaType,
            media: wlServicesMedia.media,
            isDefault: wlServicesMedia.isDefault,
        })
        .from(wlServicesMedia)
        .where(inArray(wlServicesMedia.serviceId, serviceIds))
        .orderBy(desc(sql`${wlServicesMedia.isDefault} = 'Y'`), asc(wlServicesMedia.id))
}

// Cover image (is_default 'Y') first, then the rest in the order they were added.
// is_default is an enum, which MySQL sorts by position ('Y' before 'N'), so compare the value instead
const findServiceMedia = async (serviceId) =>
    db
        .select({
            mediaId: wlServicesMedia.id,
            mediaType: wlServicesMedia.mediaType,
            media: wlServicesMedia.media,
            isDefault: wlServicesMedia.isDefault,
        })
        .from(wlServicesMedia)
        .where(eq(wlServicesMedia.serviceId, serviceId))
        .orderBy(desc(sql`${wlServicesMedia.isDefault} = 'Y'`), asc(wlServicesMedia.id))

// The service and its images are saved together, or not at all
const createServiceWithMedia = async (service, mediaRows) =>
    db.transaction(async (tx) => {
        const [result] = await tx.insert(wlServices).values(service)
        const serviceId = result.insertId

        if (mediaRows.length) {
            await tx.insert(wlServicesMedia).values(mediaRows.map((row) => ({ ...row, serviceId })))
        }

        return serviceId
    })

// values: wl_services columns to change (undefined ones are skipped)
// removeMediaIds: images to delete; newMedia: images to add; promoteMediaId: an existing image to make the cover
const updateServiceWithMedia = async (serviceId, values, { removeMediaIds = [], newMedia = [], promoteMediaId = null }) =>
    db.transaction(async (tx) => {
        await tx.update(wlServices).set(values).where(eq(wlServices.serviceId, serviceId))

        if (removeMediaIds.length) {
            await tx
                .delete(wlServicesMedia)
                .where(and(eq(wlServicesMedia.serviceId, serviceId), inArray(wlServicesMedia.id, removeMediaIds)))
        }

        if (newMedia.length) {
            await tx.insert(wlServicesMedia).values(newMedia.map((row) => ({ ...row, serviceId })))
        }

        if (promoteMediaId) {
            await tx
                .update(wlServicesMedia)
                .set({ isDefault: "Y" })
                .where(and(eq(wlServicesMedia.serviceId, serviceId), eq(wlServicesMedia.id, promoteMediaId)))
        }
    })

const updateServiceStatus = async (serviceId, status, now) => {
    await db
        .update(wlServices)
        .set({ status, serviceUpdatedDate: now })
        .where(eq(wlServices.serviceId, serviceId))
}

// The Salon Partner offering a service
const salon = alias(wlCustomers, "salon")

// The category a service's category sits under (wl_categories.parent_id), if any
const parentCategory = alias(wlCategories, "parent_category")

// An active service with its category and salon, for the Service Details page
const findActiveServiceWithSalon = async (serviceId) => {
    const rows = await db
        .select({
            serviceId: wlServices.serviceId,
            customerId: wlServices.customerId,
            categoryId: wlServices.categoryId,
            categoryName: wlCategories.categoryName,
            parentCategoryId: parentCategory.categoryId,
            parentCategoryName: parentCategory.categoryName,
            serviceName: wlServices.serviceName,
            serviceDescription: wlServices.serviceDescription,
            servicePrice: wlServices.servicePrice,
            salonName: salon.salonName,
            salonType: salon.serviceType,
            salonCustomerType: salon.customerType,
            salonStatus: salon.status,
        })
        .from(wlServices)
        .leftJoin(wlCategories, eq(wlCategories.categoryId, wlServices.categoryId))
        .leftJoin(parentCategory, eq(parentCategory.categoryId, wlCategories.parentId))
        .leftJoin(salon, eq(salon.customerId, wlServices.customerId))
        .where(and(eq(wlServices.serviceId, serviceId), eq(wlServices.status, "1")))
        .limit(1)

    return rows[0] || null
}

module.exports = {
    findActiveServiceWithSalon,
    updateServiceStatus,
    findCustomerService,
    findCustomerServicesWithCategory,
    findServiceMedia,
    findMediaForServices,
    createServiceWithMedia,
    updateServiceWithMedia,
}
