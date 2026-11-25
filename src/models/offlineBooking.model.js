const { eq, and, ne, desc, count, sql } = require("drizzle-orm")
const db = require("../config/drizzle")
const { wlBookings } = require("../schema/wl-bookings")
const { wlBookingSlots } = require("../schema/wl-booking-slots")
const { wlServices } = require("../schema/wl-services")
const { DRAFT_STATUS, OFFLINE_CUSTOMER_TYPE } = require("./bookingScope")

// Offline Client Order: the partner's bookings for walk-in clients, kept in wl_bookings (customer_type 'Offline',
// customer_id NULL). Step 1 saves a row with order_status 'Draft'; steps 2-3 fill in the service and slot; step 4
// (Confirm) turns that same row into a real booking (order_status 'Booked'). Its booking_id is the offline booking ID.
//
// Results keep the shape the offline booking API has always used (offlineBooking):
//   { offlineBookingId, salonId, clientName, mobileNumber, serviceId, slotId, paymentMode,
//     bookingId (once confirmed, else null), status ('draft' | 'confirmed'), offlineBookingAddedDate, offlineBookingUpdatedDate }

const b = wlBookings

// Every query is limited to the partner's own salon and its offline bookings
const ownOffline = (salonId) => and(eq(b.salonId, salonId), eq(b.customerType, OFFLINE_CUSTOMER_TYPE))
const isDraft = eq(b.orderStatus, DRAFT_STATUS)
const statusCondition = (status) => (status === "draft" ? isDraft : status === "confirmed" ? ne(b.orderStatus, DRAFT_STATUS) : undefined)

const clientNameOf = (row) => [row.firstName, row.lastName].filter(Boolean).join(" ")

// "Rahul Kumar Sharma" -> first_name "Rahul", last_name "Kumar Sharma" (as a confirmed booking always stored it)
const splitName = (clientName) => {
    const [firstName, ...rest] = clientName.split(" ")
    return { firstName, lastName: rest.join(" ") || null }
}

// A wl_bookings row as the API's offlineBooking
const toOfflineBooking = (row) => {
    const confirmed = row.orderStatus !== DRAFT_STATUS
    return {
        offlineBookingId: row.bookingId,
        salonId: row.salonId,
        clientName: clientNameOf(row),
        mobileNumber: row.mobileNumber,
        serviceId: row.serviceId,
        slotId: row.slotId,
        paymentMode: row.paymentMode,
        bookingId: confirmed ? row.bookingId : null,
        status: confirmed ? "confirmed" : "draft",
        offlineBookingAddedDate: row.orderReceivedDate,
        offlineBookingUpdatedDate: row.bookingUpdatedDate,
    }
}

// The API's draft fields as wl_bookings columns
const toColumns = (values) => ({
    ...(values.clientName !== undefined && splitName(values.clientName)),
    ...(values.mobileNumber !== undefined && { mobileNumber: values.mobileNumber }),
    ...(values.serviceId !== undefined && { serviceId: values.serviceId }),
    ...(values.slotId !== undefined && { slotId: values.slotId }),
    ...(values.offlineBookingUpdatedDate !== undefined && { bookingUpdatedDate: values.offlineBookingUpdatedDate }),
})

// The partner's own offline booking (null when missing, another salon's, or not an offline booking)
const findSalonOfflineBooking = async (salonId, offlineBookingId) => {
    const rows = await db
        .select()
        .from(b)
        .where(and(ownOffline(salonId), eq(b.bookingId, offlineBookingId)))
        .limit(1)

    return rows[0] ? toOfflineBooking(rows[0]) : null
}

// The partner's offline bookings, newest change first, for the resume list.
//   status: 'draft' | 'confirmed' | undefined (both)
// A confirmed booking shows what it was booked with (service, date, time, amount); a draft the service / slot chosen so far.
const findSalonOfflineBookings = async (salonId, { status, limit, offset }) => {
    const rows = await db
        .select({
            booking: b,
            chosenServiceName: wlServices.serviceName,
            chosenServicePrice: wlServices.servicePrice,
            chosenSlotDate: wlBookingSlots.slotDate,
            chosenStartTime: wlBookingSlots.startTime,
            chosenEndTime: wlBookingSlots.endTime,
        })
        .from(b)
        .leftJoin(wlServices, eq(wlServices.serviceId, b.serviceId))
        .leftJoin(wlBookingSlots, eq(wlBookingSlots.slotId, b.slotId))
        .where(and(ownOffline(salonId), statusCondition(status)))
        .orderBy(desc(b.bookingUpdatedDate), desc(b.bookingId))
        .limit(limit)
        .offset(offset)

    return rows.map(({ booking, chosenServiceName, chosenServicePrice, chosenSlotDate, chosenStartTime, chosenEndTime }) => {
        const confirmed = booking.orderStatus !== DRAFT_STATUS
        return {
            offlineBooking: toOfflineBooking(booking),
            serviceName: confirmed ? booking.serviceName ?? chosenServiceName : chosenServiceName,
            slotDate: confirmed ? booking.slotDate ?? chosenSlotDate : chosenSlotDate,
            startTime: confirmed ? booking.startTime ?? chosenStartTime : chosenStartTime,
            endTime: confirmed ? booking.endTime ?? chosenEndTime : chosenEndTime,
            // The payment on the booking: Paid / Unpaid and cash / online (a draft isn't paid)
            paymentStatus: confirmed ? booking.paymentStatus : null,
            bookingPaymentMode: confirmed ? booking.paymentMode : null,
            // Price: what the confirmed booking charged, or (draft) the chosen service's current price
            bookingAmount: confirmed ? booking.totalAmount : null,
            servicePrice: chosenServicePrice,
        }
    })
}

const countSalonOfflineBookings = async (salonId, { status }) => {
    const [row] = await db
        .select({ total: count() })
        .from(b)
        .where(and(ownOffline(salonId), statusCondition(status)))

    return Number(row.total)
}

// Step 1 on a new offline booking: a Draft row in wl_bookings. values: { salonId, clientName, mobileNumber,
// offlineBookingAddedDate, offlineBookingUpdatedDate }. Returns its booking_id (the offline booking ID).
const createOfflineBooking = async (values) => {
    const [result] = await db.insert(b).values({
        ...toColumns(values),
        customerId: null,
        customerType: OFFLINE_CUSTOMER_TYPE,
        salonId: values.salonId,
        orderStatus: DRAFT_STATUS,
        orderReceivedDate: values.offlineBookingAddedDate,
        paymentStatus: "Unpaid",
    })

    return result.insertId
}

// Steps 1-3 on an existing offline booking; only the partner's own and only while it is a draft.
// values: any of { clientName, mobileNumber, serviceId, slotId, offlineBookingUpdatedDate }.
// Returns false when nothing was changed (missing, another salon's or already confirmed).
const updateDraft = async (salonId, offlineBookingId, values) => {
    const [result] = await db
        .update(b)
        .set(toColumns(values))
        .where(and(ownOffline(salonId), eq(b.bookingId, offlineBookingId), isDraft))

    return result.affectedRows > 0
}

// Step 4 "CREATE ORDER": one transaction with the draft and the slot locked, so it can't be confirmed twice and two
// bookings can't both take the last place in a slot. The draft row itself becomes the booking.
//   checkSlot(slot): an error code for a slot that can't be booked (e.g. already started), or null
//   buildBooking(offlineBooking, service, slot): the wl_bookings values of the confirmed booking
// Returns { error } or { offlineBooking, booking, slot }.
//   errors: not_found, confirmed, incomplete, service_unavailable, slot_not_found, already_booked, full, <checkSlot code>
const confirmOfflineBooking = async ({ salonId, offlineBookingId, paymentMode, checkSlot, buildBooking, now }) =>
    db.transaction(async (tx) => {
        const [row] = await tx
            .select()
            .from(b)
            .where(and(ownOffline(salonId), eq(b.bookingId, offlineBookingId)))
            .limit(1)
            .for("update")

        if (!row) return { error: "not_found" }
        const draft = toOfflineBooking(row)
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
            .select({ bookingId: b.bookingId })
            .from(b)
            .where(
                and(
                    eq(b.salonId, salonId),
                    eq(b.slotId, slot.slotId),
                    eq(b.mobileNumber, draft.mobileNumber),
                    eq(b.orderStatus, "Booked"),
                    ne(b.bookingId, offlineBookingId)
                )
            )
            .limit(1)

        if (existing) return { error: "already_booked" }
        if (slot.bookedCount >= slot.maxBookings) return { error: "full" }

        // As in wl_orders, the invoice number is the ID
        const invoiceNumber = String(offlineBookingId)
        const booking = { ...buildBooking(draft, service, slot), invoiceNumber, paymentMode, bookingUpdatedDate: now }
        await tx.update(b).set(booking).where(eq(b.bookingId, offlineBookingId))
        await tx
            .update(wlBookingSlots)
            .set({ bookedCount: sql`${wlBookingSlots.bookedCount} + 1` })
            .where(eq(wlBookingSlots.slotId, slot.slotId))

        return {
            offlineBooking: { ...draft, paymentMode, bookingId: offlineBookingId, status: "confirmed", offlineBookingUpdatedDate: now },
            booking: { ...booking, bookingId: offlineBookingId },
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
