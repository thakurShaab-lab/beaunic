const { eq, and, ne, gt, lt, gte, asc, count } = require("drizzle-orm")
const db = require("../config/drizzle")
const { wlBookingSlots } = require("../schema/wl-booking-slots")

// wl_booking_slots.status: 1=Active, 0=Inactive, 2=Deleted; a partner can only reach their own slots
const ownSlots = (customerId) => and(eq(wlBookingSlots.customerId, customerId), ne(wlBookingSlots.status, "2"))

// activeOnly: a User viewing a salon's slots sees only active ones (status 1); the partner also sees inactive ones
const salonSlots = (customerId, activeOnly) =>
    activeOnly ? and(eq(wlBookingSlots.customerId, customerId), eq(wlBookingSlots.status, "1")) : ownSlots(customerId)

const findCustomerSlot = async (customerId, slotId, { activeOnly = false } = {}) => {
    const rows = await db
        .select()
        .from(wlBookingSlots)
        .where(and(salonSlots(customerId, activeOnly), eq(wlBookingSlots.slotId, slotId)))
        .limit(1)

    return rows[0] || null
}

// A partner's slots by date, then start time.
// Optional filters: slotDate (one day) and fromDate (that day onwards); unset ones are ignored.
const findCustomerSlots = async (customerId, { slotDate, fromDate, activeOnly = false } = {}) =>
    db
        .select()
        .from(wlBookingSlots)
        .where(
            and(
                salonSlots(customerId, activeOnly),
                slotDate !== undefined ? eq(wlBookingSlots.slotDate, slotDate) : undefined,
                fromDate !== undefined ? gte(wlBookingSlots.slotDate, fromDate) : undefined
            )
        )
        .orderBy(asc(wlBookingSlots.slotDate), asc(wlBookingSlots.startTime))

// Dates that have slots, for the date strip
const countSlotsByDate = async (customerId, fromDate, { activeOnly = false } = {}) =>
    db
        .select({ slotDate: wlBookingSlots.slotDate, total: count() })
        .from(wlBookingSlots)
        .where(and(salonSlots(customerId, activeOnly), gte(wlBookingSlots.slotDate, fromDate)))
        .groupBy(wlBookingSlots.slotDate)
        .orderBy(asc(wlBookingSlots.slotDate))

// A slot on the same day whose time range overlaps start-end (touching ends don't overlap). Locks the
// partner's slots for that day so two requests can't both pass the check.
const findOverlappingSlot = async (tx, customerId, { slotDate, startTime, endTime }, excludeSlotId) => {
    const rows = await tx
        .select()
        .from(wlBookingSlots)
        .where(
            and(
                ownSlots(customerId),
                eq(wlBookingSlots.slotDate, slotDate),
                lt(wlBookingSlots.startTime, endTime),
                gt(wlBookingSlots.endTime, startTime),
                excludeSlotId !== undefined ? ne(wlBookingSlots.slotId, excludeSlotId) : undefined
            )
        )
        .limit(1)
        .for("update")

    return rows[0] || null
}

// Saves the slot unless it overlaps another; returns { slotId } or { overlap }
const createSlotIfFree = async (values) =>
    db.transaction(async (tx) => {
        const overlap = await findOverlappingSlot(tx, values.customerId, values)
        if (overlap) return { overlap }

        const [result] = await tx.insert(wlBookingSlots).values(values)
        return { slotId: result.insertId }
    })

// slot: the saved slot merged with the changes; returns { updated: true } or { overlap }
const updateSlotIfFree = async (slot, values) =>
    db.transaction(async (tx) => {
        const overlap = await findOverlappingSlot(tx, slot.customerId, slot, slot.slotId)
        if (overlap) return { overlap }

        await tx.update(wlBookingSlots).set(values).where(eq(wlBookingSlots.slotId, slot.slotId))
        return { updated: true }
    })

const deleteSlot = async (slotId, now) => {
    await db
        .update(wlBookingSlots)
        .set({ status: "2", slotUpdatedDate: now })
        .where(eq(wlBookingSlots.slotId, slotId))
}

module.exports = {
    findCustomerSlot,
    findCustomerSlots,
    countSlotsByDate,
    createSlotIfFree,
    updateSlotIfFree,
    deleteSlot,
}
