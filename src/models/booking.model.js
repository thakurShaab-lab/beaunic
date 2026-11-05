const { eq, and, sql } = require("drizzle-orm")
const db = require("../config/drizzle")
const { wlBookingSlots } = require("../schema/wl-booking-slots")
const { wlBookings } = require("../schema/wl-bookings")

// Books one place in a slot, or reports why it can't. One transaction with the slot row locked,
// so two people can't both take the last place.
//   salonId: the service's salon; the slot must be one of its active slots
//   checkSlot(slot): an error code for a slot that can't be booked (e.g. already started), or null
//   buildBooking(slot): the wl_bookings row to save
// Returns { error: 'not_found' | 'full' | 'already_booked' | <checkSlot code> } or { booking }
const bookSlot = async ({ slotId, salonId, customerId, checkSlot, buildBooking }) =>
    db.transaction(async (tx) => {
        const [slot] = await tx
            .select()
            .from(wlBookingSlots)
            .where(
                and(
                    eq(wlBookingSlots.slotId, slotId),
                    eq(wlBookingSlots.customerId, salonId),
                    eq(wlBookingSlots.status, "1")
                )
            )
            .limit(1)
            .for("update")

        if (!slot) return { error: "not_found" }

        const slotError = checkSlot(slot)
        if (slotError) return { error: slotError }

        // One active booking per customer per slot (checked first, so they hear "already booked", not "full")
        const [existing] = await tx
            .select({ bookingId: wlBookings.bookingId })
            .from(wlBookings)
            .where(
                and(
                    eq(wlBookings.slotId, slotId),
                    eq(wlBookings.customerId, customerId),
                    eq(wlBookings.orderStatus, "Booked")
                )
            )
            .limit(1)

        if (existing) return { error: "already_booked" }

        if (slot.bookedCount >= slot.maxBookings) return { error: "full" }

        const booking = buildBooking(slot)
        const [result] = await tx.insert(wlBookings).values(booking)
        const bookingId = result.insertId
        // As in wl_orders, the invoice number is the ID
        const invoiceNumber = String(bookingId)

        await tx.update(wlBookings).set({ invoiceNumber }).where(eq(wlBookings.bookingId, bookingId))
        await tx
            .update(wlBookingSlots)
            .set({ bookedCount: sql`${wlBookingSlots.bookedCount} + 1` })
            .where(eq(wlBookingSlots.slotId, slotId))

        return { booking: { ...booking, bookingId, invoiceNumber }, slot: { ...slot, bookedCount: slot.bookedCount + 1 } }
    })

module.exports = { bookSlot }
