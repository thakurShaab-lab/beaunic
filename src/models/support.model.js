const { eq, and, asc, sql, count } = require("drizzle-orm")
const db = require("../config/drizzle")
const { tblAdmin } = require("../schema/tbl-admin")
const { wlFaq } = require("../schema/wl-faq")

const findSupportDetails = async () => {
    const rows = await db
        .select({
            adminEmail: tblAdmin.adminEmail,
            contactEmail: tblAdmin.contactEmail,
            phone: tblAdmin.phone,
            mobile: tblAdmin.mobile,
            whatsappNumber: tblAdmin.whatsappNumber,
            website: tblAdmin.website,
            address: tblAdmin.address,
            corporateAddress: tblAdmin.corporateAddress,
            facebookLink: tblAdmin.facebookLink,
            instagramLink: tblAdmin.instagramLink,
            youtubeLink: tblAdmin.youtubeLink,
            twitterLink: tblAdmin.twitterLink,
            linkedinLink: tblAdmin.linkedinLink,
        })
        .from(tblAdmin)
        .where(and(eq(tblAdmin.adminType, "1"), eq(tblAdmin.status, "1")))
        .orderBy(asc(tblAdmin.adminId))
        .limit(1)

    return rows[0] || null
}

// Active FAQs (status 1) of one Help & Support tab, in the admin's sort order
const findFaqs = async (faqCategory) =>
    db
        .select({
            faqId: wlFaq.faqId,
            question: wlFaq.faqQuestion,
            answer: wlFaq.faqAnswer,
            faqCategory: wlFaq.faqCategory,
        })
        .from(wlFaq)
        .where(and(eq(wlFaq.status, "1"), eq(wlFaq.faqCategory, faqCategory)))
        .orderBy(sql`${wlFaq.sortOrder} IS NULL`, asc(wlFaq.sortOrder), asc(wlFaq.faqId))

// How many active FAQs each tab has
const countFaqsByCategory = async () =>
    db
        .select({ faqCategory: wlFaq.faqCategory, total: count() })
        .from(wlFaq)
        .where(eq(wlFaq.status, "1"))
        .groupBy(wlFaq.faqCategory)

module.exports = { findSupportDetails, findFaqs, countFaqsByCategory }
