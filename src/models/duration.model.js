const { eq, and } = require("drizzle-orm")
const db = require("../config/drizzle")
const { wlDurations } = require("../schema/wl-durations")

// wl_durations.status: 1=Active, 0=Inactive, 2=Deleted.
// activeOnly: a service can only be *given* an active duration; showing a saved one works whatever its status.
const findDuration = async (durationId, { activeOnly = false } = {}) => {
    const rows = await db
        .select({ durationId: wlDurations.durationId, durationName: wlDurations.durationName })
        .from(wlDurations)
        .where(and(eq(wlDurations.durationId, durationId), activeOnly ? eq(wlDurations.status, "1") : undefined))
        .limit(1)

    return rows[0] || null
}

const findActiveDuration = (durationId) => findDuration(durationId, { activeOnly: true })

module.exports = { findDuration, findActiveDuration }
