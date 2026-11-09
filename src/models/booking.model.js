const { eq, and, sql, inArray, asc, desc, count } = require("drizzle-orm")
const { alias } = require("drizzle-orm/mysql-core")
const db = require("../config/drizzle")
const { wlBookingSlots } = require("../schema/wl-booking-slots")
const { wlBookings } = require("../schema/wl-bookings")
const { wlCustomers } = require("../schema/wl-customers")
const { wlServices } = require("../schema/wl-services")

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

// The Salon Partner of a booking
const salon = alias(wlCustomers, "salon")

// One of the customer's own bookings, with the salon's name and type and the service's own type
const findCustomerBooking = async (customerId, bookingId) => {
    const rows = await db
        .select({
            booking: wlBookings,
            salonName: salon.salonName,
            salonType: salon.serviceType,
            serviceType: wlServices.serviceType,
            serviceDuration: wlServices.serviceDuration,
        })
        .from(wlBookings)
        .leftJoin(salon, eq(salon.customerId, wlBookings.salonId))
        .leftJoin(wlServices, eq(wlServices.serviceId, wlBookings.serviceId))
        .where(and(eq(wlBookings.bookingId, bookingId), eq(wlBookings.customerId, customerId)))
        .limit(1)

    if (!rows[0]) return null
    const { booking, ...extra } = rows[0]
    return { ...booking, ...extra }
}

// Saves the coupon (or its removal) and the amount now payable on a booking
const updateBookingCoupon = async (bookingId, values) => {
    await db.update(wlBookings).set(values).where(eq(wlBookings.bookingId, bookingId))
}

// The customer's own booking, locked for the rest of the transaction
const lockCustomerBooking = async (tx, customerId, bookingId) => {
    const [booking] = await tx
        .select()
        .from(wlBookings)
        .where(and(eq(wlBookings.bookingId, bookingId), eq(wlBookings.customerId, customerId)))
        .limit(1)
        .for("update")

    return booking || null
}

// Frees one place in a slot (never below 0)
const releaseSlotPlace = (tx, slotId) =>
    tx
        .update(wlBookingSlots)
        .set({ bookedCount: sql`GREATEST(${wlBookingSlots.bookedCount} - 1, 0)` })
        .where(eq(wlBookingSlots.slotId, slotId))

// Cancels the customer's booking and frees its place in the slot, in one transaction.
//   checkBooking(booking): an error code when it can't be cancelled, or null
//   cancellation(booking): { cancelReason, cancelReasonNote, refundMethod } to save with it
// Returns { error: 'not_found' | <checkBooking code> } or { booking } (the booking as cancelled)
const cancelBooking = async ({ bookingId, customerId, checkBooking, cancellation, now }) =>
    db.transaction(async (tx) => {
        const booking = await lockCustomerBooking(tx, customerId, bookingId)
        if (!booking) return { error: "not_found" }

        const bookingError = checkBooking(booking)
        if (bookingError) return { error: bookingError }

        const values = {
            orderStatus: "Cancelled",
            isCancel: "1",
            ...cancellation(booking),
            bookingCancelledDate: now,
            bookingUpdatedDate: now,
        }
        await tx.update(wlBookings).set(values).where(eq(wlBookings.bookingId, bookingId))
        await releaseSlotPlace(tx, booking.slotId)

        return { booking: { ...booking, ...values } }
    })

// Moves the customer's booking to another slot of the same salon, in one transaction: the old slot gets its
// place back, the new one loses one, and the booking takes the new slot's date and time.
//   checkBooking(booking) / checkSlot(slot): error codes when the booking can't move or the slot can't take it
// Returns { error: 'not_found' | 'same_slot' | 'slot_not_found' | 'already_booked' | 'full' | <check codes> }
// or { booking, previous: { slotId, slotDate, startTime, endTime }, slot }
const rescheduleBooking = async ({ bookingId, customerId, newSlotId, checkBooking, checkSlot, now }) =>
    db.transaction(async (tx) => {
        const booking = await lockCustomerBooking(tx, customerId, bookingId)
        if (!booking) return { error: "not_found" }

        const bookingError = checkBooking(booking)
        if (bookingError) return { error: bookingError }

        if (booking.slotId === newSlotId) return { error: "same_slot" }

        // Lock both slots in ID order, so two reschedules between the same slots can't deadlock
        const slots = await tx
            .select()
            .from(wlBookingSlots)
            .where(inArray(wlBookingSlots.slotId, [booking.slotId, newSlotId].sort((a, b) => a - b)))
            .orderBy(asc(wlBookingSlots.slotId))
            .for("update")

        const slot = slots.find((row) => row.slotId === newSlotId)
        if (!slot || slot.customerId !== booking.salonId || slot.status !== "1") return { error: "slot_not_found" }

        const slotError = checkSlot(slot)
        if (slotError) return { error: slotError }

        // The customer can't hold two bookings in the same slot
        const [existing] = await tx
            .select({ bookingId: wlBookings.bookingId })
            .from(wlBookings)
            .where(
                and(
                    eq(wlBookings.slotId, newSlotId),
                    eq(wlBookings.customerId, customerId),
                    eq(wlBookings.orderStatus, "Booked")
                )
            )
            .limit(1)

        if (existing) return { error: "already_booked" }

        if (slot.bookedCount >= slot.maxBookings) return { error: "full" }

        const values = {
            slotId: slot.slotId,
            slotDate: slot.slotDate,
            startTime: slot.startTime,
            endTime: slot.endTime,
            bookingUpdatedDate: now,
        }
        await tx.update(wlBookings).set(values).where(eq(wlBookings.bookingId, bookingId))
        await releaseSlotPlace(tx, booking.slotId)
        await tx
            .update(wlBookingSlots)
            .set({ bookedCount: sql`${wlBookingSlots.bookedCount} + 1` })
            .where(eq(wlBookingSlots.slotId, newSlotId))

        return {
            booking: { ...booking, ...values },
            previous: { slotId: booking.slotId, slotDate: booking.slotDate, startTime: booking.startTime, endTime: booking.endTime },
            slot: { ...slot, bookedCount: slot.bookedCount + 1 },
        }
    })

// The My Bookings tabs, worked out from the stored status and the slot's end time (salon time):
//   cancelled: is_cancel 1 or status Cancelled
//   completed: status Completed / No Show, or still Booked but the slot has ended
//   upcoming:  Booked and the slot hasn't ended yet
const isCancelled = sql`(${wlBookings.isCancel} = '1' OR ${wlBookings.orderStatus} = 'Cancelled')`
const slotEnded = (today, nowTime) =>
    sql`(${wlBookings.slotDate} < ${today} OR (${wlBookings.slotDate} = ${today} AND ${wlBookings.endTime} <= ${nowTime}))`

const BOOKING_TABS = {
    cancelled: () => isCancelled,
    completed: (today, nowTime) =>
        sql`(NOT ${isCancelled} AND (${wlBookings.orderStatus} IN ('Completed', 'No Show') OR (${wlBookings.orderStatus} = 'Booked' AND ${slotEnded(today, nowTime)})))`,
    upcoming: (today, nowTime) =>
        sql`(NOT ${isCancelled} AND ${wlBookings.orderStatus} = 'Booked' AND NOT ${slotEnded(today, nowTime)})`,
}

// Which tab a booking is in, as a column ('upcoming' | 'completed' | 'cancelled'; anything else 'other')
const bookingTab = (today, nowTime) => sql`CASE
    WHEN ${BOOKING_TABS.cancelled()} THEN 'cancelled'
    WHEN ${BOOKING_TABS.completed(today, nowTime)} THEN 'completed'
    WHEN ${BOOKING_TABS.upcoming(today, nowTime)} THEN 'upcoming'
    ELSE 'other' END`

// One page of the customer's bookings with the service's current duration and type and the salon.
// tab: one of BOOKING_TABS, or undefined for all. Upcoming shows the soonest first; the rest the latest first.
const findCustomerBookings = async (customerId, { tab, today, nowTime, limit, offset }) =>
    db
        .select({
            booking: wlBookings,
            tab: bookingTab(today, nowTime).mapWith(String),
            salonName: salon.salonName,
            salonType: salon.serviceType,
            serviceType: wlServices.serviceType,
            serviceDuration: wlServices.serviceDuration,
        })
        .from(wlBookings)
        .leftJoin(salon, eq(salon.customerId, wlBookings.salonId))
        .leftJoin(wlServices, eq(wlServices.serviceId, wlBookings.serviceId))
        .where(and(eq(wlBookings.customerId, customerId), tab ? BOOKING_TABS[tab](today, nowTime) : undefined))
        .orderBy(
            ...(tab === "upcoming"
                ? [asc(wlBookings.slotDate), asc(wlBookings.startTime), asc(wlBookings.bookingId)]
                : [desc(wlBookings.slotDate), desc(wlBookings.startTime), desc(wlBookings.bookingId)])
        )
        .limit(limit)
        .offset(offset)
        .then((rows) => rows.map(({ booking, ...extra }) => ({ ...booking, ...extra })))

// How many of the customer's bookings are in each tab (the numbers next to the tab names)
const countCustomerBookingsByTab = async (customerId, { today, nowTime }) => {
    const [row] = await db
        .select({
            upcoming: sql`COALESCE(SUM(${BOOKING_TABS.upcoming(today, nowTime)}), 0)`.mapWith(Number),
            completed: sql`COALESCE(SUM(${BOOKING_TABS.completed(today, nowTime)}), 0)`.mapWith(Number),
            cancelled: sql`COALESCE(SUM(${BOOKING_TABS.cancelled()}), 0)`.mapWith(Number),
            total: count(),
        })
        .from(wlBookings)
        .where(eq(wlBookings.customerId, customerId))

    return row
}

module.exports = {
    bookSlot,
    findCustomerBooking,
    updateBookingCoupon,
    cancelBooking,
    rescheduleBooking,
    findCustomerBookings,
    countCustomerBookingsByTab,
    // In the order the tabs appear on My Bookings
    BOOKING_TAB_KEYS: ["upcoming", "completed", "cancelled"],
}
