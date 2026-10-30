const { eq, and, asc } = require("drizzle-orm")
const db = require("../config/drizzle")
const { tblAdmin } = require("../schema/tbl-admin")

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

module.exports = { findSupportDetails }
