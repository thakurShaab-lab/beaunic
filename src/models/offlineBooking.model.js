const { eq, and, desc, count, sql } = require("drizzle-orm")
const db = require("../config/drizzle")
const { wlOfflineBookings } = require("../schema/wl-offline-bookings")
const { wlBookings } = require("../schema/wl-bookings")
const { wlBookingSlots } = require("../schema/wl-booking-slots")
const { wlServices } = require("../schema/wl-services")

const o = wlOfflineBookings

// Every query is limited to the partner's own salon
const own = (salonId) => eq(o.salonId, salonId)

// The partner's own offline booking (null when missing or another salon's)
const findSalonOfflineBooking = async (salonId, offlineBookingId) => {
    const rows = await db
        .select()
        .from(o)
        .where(and(own(salonId), eq(o.offlineBookingId, offlineBookingId)))
        .limit(1)

    return rows[0] || null
}

// The partner's offline bookings, newest change first, with the service name (for the resume list).
//   status: 'draft' | 'confirmed' | undefined (both)
const findSalonOfflineBookings = async (salonId, { status, limit, offset }) =>
    db
        .select({
            offlineBooking: o,
            serviceName: wlServices.serviceName,
            slotDate: wlBookingSlots.slotDate,
            startTime: wlBookingSlots.startTime,
            endTime: wlBookingSlots.endTime,
        })
        .from(o)
        .leftJoin(wlServices, eq(wlServices.serviceId, o.serviceId))
        .leftJoin(wlBookingSlots, eq(wlBookingSlots.slotId, o.slotId))
        .where(and(own(salonId), status ? eq(o.status, status) : undefined))
        .orderBy(desc(o.offlineBookingUpdatedDate), desc(o.offlineBookingId))
        .limit(limit)
        .offset(offset)

const countSalonOfflineBookings = async (salonId, { status }) => {
    const [row] = await db
        .select({ total: count() })
        .from(o)
        .where(and(own(salonId), status ? eq(o.status, status) : undefined))

    return Number(row.total)
}

// Step 1 on a new offline booking. Returns the new offline_booking_id
const createOfflineBooking = async (values) => {
    const [result] = await db.insert(o).values(values)

    return result.insertId
}

// Steps 1-3 on an existing offline booking; only the partner's own and only while it is a draft.
// Returns false when nothing was changed (missing, another salon's or already confirmed).
const updateDraft = async (salonId, offlineBookingId, values) => {
    const [result] = await db
        .update(o)
        .set(values)
        .where(and(own(salonId), eq(o.offlineBookingId, offlineBookingId), eq(o.status, "draft")))

    return result.affectedRows > 0
}

// Step 4 "CREATE ORDER": one transaction with the offline booking and the slot locked, so it can't be confirmed
// twice and two bookings can't both take the last place in a slot.
//   checkSlot(slot): an error code for a slot that can't be booked (e.g. already started), or null
//   buildBooking(offlineBooking, service, slot): the wl_bookings row to save
// Returns { error } or { offlineBooking, booking, slot }.
//   errors: not_found, confirmed, incomplete, service_unavailable, slot_not_found, already_booked, full, <checkSlot code>
const confirmOfflineBooking = async ({ salonId, offlineBookingId, paymentMode, checkSlot, buildBooking, now }) =>
    db.transaction(async (tx) => {
        const [draft] = await tx
            .select()
            .from(o)
            .where(and(own(salonId), eq(o.offlineBookingId, offlineBookingId)))
            .limit(1)
            .for("update")

        if (!draft) return { error: "not_found" }
        if (draft.status === "confirmed") return { error: "confirmed" }
        if (!draft.serviceId || !draft.slotId) return { error: "incomplete" }

        // The service must still be one of the salon's active services with a price
        const [service] = await tx
            .select()
            .from(wlServices)
            .where(and(eq(wlServices.serviceId, draft.serviceId), eq(wlServices.customerId, salonId), eq(wlServices.status, "1")))
            .limit(1)

        if (!service || service.servicePrice === null) return { error: "service_unavailable" }

        const [slot] = await tx
            .select()
            .from(wlBookingSlots)
            .where(and(eq(wlBookingSlots.slotId, draft.slotId), eq(wlBookingSlots.customerId, salonId), eq(wlBookingSlots.status, "1")))
            .limit(1)
            .for("update")

        if (!slot) return { error: "slot_not_found" }

        const slotError = checkSlot(slot)
        if (slotError) return { error: slotError }

        // The same client (mobile number) already has a booking in this slot at this salon
        const [existing] = await tx
            .select({ bookingId: wlBookings.bookingId })
            .from(wlBookings)
            .where(
                and(
                    eq(wlBookings.salonId, salonId),
                    eq(wlBookings.slotId, slot.slotId),
                    eq(wlBookings.mobileNumber, draft.mobileNumber),
                    eq(wlBookings.orderStatus, "Booked")
                )
            )
            .limit(1)

        if (existing) return { error: "already_booked" }
        if (slot.bookedCount >= slot.maxBookings) return { error: "full" }

        const booking = buildBooking(draft, service, slot)
        const [result] = await tx.insert(wlBookings).values(booking)
        const bookingId = result.insertId
        // As in wl_orders, the invoice number is the ID
        const invoiceNumber = String(bookingId)

        await tx.update(wlBookings).set({ invoiceNumber }).where(eq(wlBookings.bookingId, bookingId))
        await tx
            .update(wlBookingSlots)
            .set({ bookedCount: sql`${wlBookingSlots.bookedCount} + 1` })
            .where(eq(wlBookingSlots.slotId, slot.slotId))

        const changes = { paymentMode, bookingId, status: "confirmed", offlineBookingUpdatedDate: now }
        await tx.update(o).set(changes).where(eq(o.offlineBookingId, offlineBookingId))

        return {
            offlineBooking: { ...draft, ...changes },
            booking: { ...booking, bookingId, invoiceNumber },
            slot: { ...slot, bookedCount: slot.bookedCount + 1 },
        }
    })

module.exports = {
    findSalonOfflineBooking,
    findSalonOfflineBookings,
    countSalonOfflineBookings,
    createOfflineBooking,
    updateDraft,
    confirmOfflineBooking,
}
