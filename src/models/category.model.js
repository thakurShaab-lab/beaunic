const { eq, and, asc, count, sql } = require("drizzle-orm")
const db = require("../config/drizzle")
const { wlCategories } = require("../schema/wl-categories")
const { wlServices } = require("../schema/wl-services")

// wl_categories.status / wl_services.status: 1=active, 0=inactive, 2=deleted
// Every active category is listed, with the number of active services in it (0 when none)
const findActiveCategoriesWithServiceCount = async () =>
    db
        .select({
            categoryId: wlCategories.categoryId,
            categoryName: wlCategories.categoryName,
            serviceCount: count(wlServices.serviceId),
        })
        .from(wlCategories)
        .leftJoin(
            wlServices,
            and(eq(wlServices.categoryId, wlCategories.categoryId), eq(wlServices.status, "1"))
        )
        .where(eq(wlCategories.status, "1"))
        .groupBy(wlCategories.categoryId, wlCategories.categoryName, wlCategories.sortOrder)
        // Admin sort order first (unset ones last), then by name
        .orderBy(sql`${wlCategories.sortOrder} IS NULL`, asc(wlCategories.sortOrder), asc(wlCategories.categoryName))

const findActiveCategoryById = async (categoryId) => {
    const rows = await db
        .select({
            categoryId: wlCategories.categoryId,
            categoryName: wlCategories.categoryName,
        })
        .from(wlCategories)
        .where(and(eq(wlCategories.categoryId, categoryId), eq(wlCategories.status, "1")))
        .limit(1)

    return rows[0] || null
}

module.exports = { findActiveCategoriesWithServiceCount, findActiveCategoryById }
