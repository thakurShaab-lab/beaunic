const { eq, and } = require("drizzle-orm")
const db = require("../config/drizzle")
const { wlCmsPages } = require("../schema/wl-cms-pages")

// wl_cms_pages.status: 1=Active, 0=Inactive, 2=Deleted
// Names only (no content), used to work out which page was asked for
const findActivePageNames = async () =>
    db
        .select({
            pageId: wlCmsPages.pageId,
            pageName: wlCmsPages.pageName,
            friendlyUrl: wlCmsPages.friendlyUrl,
        })
        .from(wlCmsPages)
        .where(eq(wlCmsPages.status, "1"))

const findActivePageById = async (pageId) => {
    const rows = await db
        .select({
            pageId: wlCmsPages.pageId,
            pageName: wlCmsPages.pageName,
            friendlyUrl: wlCmsPages.friendlyUrl,
            pageDescription: wlCmsPages.pageDescription,
            pageShortDescription: wlCmsPages.pageShortDescription,
            image: wlCmsPages.image,
            pageUpdatedDate: wlCmsPages.pageUpdatedDate,
        })
        .from(wlCmsPages)
        .where(and(eq(wlCmsPages.pageId, pageId), eq(wlCmsPages.status, "1")))
        .limit(1)

    return rows[0] || null
}

module.exports = { findActivePageNames, findActivePageById }
