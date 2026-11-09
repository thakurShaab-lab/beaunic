const { eq, desc, sql, count } = require("drizzle-orm")
const db = require("../config/drizzle")
const { wlReferralCodes } = require("../schema/wl-referral-codes")
const { wlReferrals } = require("../schema/wl-referrals")
const { wlCustomers } = require("../schema/wl-customers")
const { wlBookings } = require("../schema/wl-bookings")

const findReferralCode = async (customerId) => {
    const rows = await db.select().from(wlReferralCodes).where(eq(wlReferralCodes.customerId, customerId)).limit(1)

    return rows[0] || null
}

// Saves a new code; a code already taken by someone else fails with ER_DUP_ENTRY (unique key)
const createReferralCode = async (values) => {
    await db.insert(wlReferralCodes).values(values)
}

// The owner of a code, in any letter case ("beau-as4821" finds "BEAU-AS4821")
const findReferralCodeOwner = async (referralCode) => {
    const rows = await db
        .select({ customerId: wlReferralCodes.customerId, referralCode: wlReferralCodes.referralCode })
        .from(wlReferralCodes)
        .where(sql`UPPER(${wlReferralCodes.referralCode}) = ${referralCode.toUpperCase()}`)
        .limit(1)

    return rows[0] || null
}

// The referral a customer joined with, if any
const findReferralOf = async (referredId) => {
    const rows = await db.select().from(wlReferrals).where(eq(wlReferrals.referredId, referredId)).limit(1)

    return rows[0] || null
}

// A second referral for the same customer fails with ER_DUP_ENTRY (unique key)
const createReferral = async (values) => {
    const [result] = await db.insert(wlReferrals).values(values)

    return result.insertId
}

// People who joined with the customer's code, newest first, with their names
const findReferralsByReferrer = async (referrerId, limit) =>
    db
        .select({
            referralId: wlReferrals.referralId,
            referredId: wlReferrals.referredId,
            firstName: wlCustomers.firstName,
            lastName: wlCustomers.lastName,
            cashbackAmount: wlReferrals.cashbackAmount,
            status: wlReferrals.status,
            referralAddedDate: wlReferrals.referralAddedDate,
            referralCreditedDate: wlReferrals.referralCreditedDate,
        })
        .from(wlReferrals)
        .leftJoin(wlCustomers, eq(wlCustomers.customerId, wlReferrals.referredId))
        .where(eq(wlReferrals.referrerId, referrerId))
        .orderBy(desc(wlReferrals.referralAddedDate), desc(wlReferrals.referralId))
        .limit(limit)

// Any booking at all (cancelled ones too): a referral code is for new customers only
const countCustomerBookings = async (customerId) => {
    const [row] = await db.select({ total: count() }).from(wlBookings).where(eq(wlBookings.customerId, customerId))

    return Number(row.total)
}

module.exports = {
    findReferralCode,
    createReferralCode,
    findReferralCodeOwner,
    findReferralOf,
    createReferral,
    findReferralsByReferrer,
    countCustomerBookings,
}
