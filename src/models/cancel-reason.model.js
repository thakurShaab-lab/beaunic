const { eq, and, asc } = require("drizzle-orm")
const db = require("../config/drizzle")
const { wlCancelReasons } = require("../schema/wl-cancel-reasons")

const reasonFields = {
    reasonId: wlCancelReasons.reasonId,
    reasonKey: wlCancelReasons.reasonKey,
    reasonTitle: wlCancelReasons.reasonTitle,
    requiresNote: wlCancelReasons.requiresNote,
}

// "Reason for cancellation" options the customer can pick, in screen order
const findActiveReasons = async () =>
    db
        .select(reasonFields)
        .from(wlCancelReasons)
        .where(eq(wlCancelReasons.status, "1"))
        .orderBy(asc(wlCancelReasons.sortOrder), asc(wlCancelReasons.reasonId))

// One active reason by ID, or undefined
const findActiveReason = async (reasonId) => {
    const [row] = await db
        .select(reasonFields)
        .from(wlCancelReasons)
        .where(and(eq(wlCancelReasons.reasonId, reasonId), eq(wlCancelReasons.status, "1")))
        .limit(1)
    return row
}

// Every reason, switched off or deleted ones too, so bookings that used them still show their reason
const findAllReasons = async () => db.select(reasonFields).from(wlCancelReasons)

module.exports = { findActiveReasons, findActiveReason, findAllReasons }
