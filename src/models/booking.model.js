const { eq, and, sql, asc, desc, count } = require("drizzle-orm")
const { alias } = require("drizzle-orm/mysql-core")
const db = require("../config/drizzle")
const { wlBookingSlots } = require("../schema/wl-booking-slots")
const { wlBookings } = require("../schema/wl-bookings")
const { wlCustomers } = require("../schema/wl-customers")
const { wlServices } = require("../schema/wl-services")
const { wlDurations } = require("../schema/wl-durations")
const { wlEmployees } = require("../schema/wl-employees")

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

// The assigned employee (whatever their status now, so a booking keeps showing who was assigned)
const employeeColumns = {
    employeeName: wlEmployees.employeeName,
    employeeDesignation: wlEmployees.designation,
    employeeImage: wlEmployees.employeeImage,
}
const employeeJoin = eq(wlEmployees.employeeId, wlBookings.employeeId)

// One booking with the salon's name and type, the service's own type and duration, and the assigned employee.
// owner: the condition that makes it the caller's own (the customer's or the salon's)
const findBookingWithDetails = async (bookingId, owner) => {
    const rows = await db
        .select({
            booking: wlBookings,
            salonName: salon.salonName,
            salonType: salon.serviceType,
            serviceType: wlServices.serviceType,
            serviceDuration: wlServices.serviceDuration,
            durationName: wlDurations.durationName,
            ...employeeColumns,
        })
        .from(wlBookings)
        .leftJoin(salon, eq(salon.customerId, wlBookings.salonId))
        .leftJoin(wlServices, eq(wlServices.serviceId, wlBookings.serviceId))
        .leftJoin(wlDurations, eq(wlDurations.durationId, wlServices.serviceDuration))
        .leftJoin(wlEmployees, employeeJoin)
        .where(and(eq(wlBookings.bookingId, bookingId), owner))
        .limit(1)

    if (!rows[0]) return null
    const { booking, ...extra } = rows[0]
    return { ...booking, ...extra }
}

// One of the customer's own bookings
const findCustomerBooking = (customerId, bookingId) => findBookingWithDetails(bookingId, eq(wlBookings.customerId, customerId))

// Partner: one of the salon's own bookings
const findSalonBooking = (salonId, bookingId) => findBookingWithDetails(bookingId, eq(wlBookings.salonId, salonId))

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

// ----- Cancellation / reschedule requests -----
// The customer asks (status pending); the Salon Partner approves or rejects. Only one request at a time per booking.

// Checks the slot a booking would move to, inside the transaction (slot row locked).
// Returns { error } or { slot }
const checkRequestedSlot = async (tx, booking, newSlotId, checkSlot) => {
    if (booking.slotId === newSlotId) return { error: "same_slot" }

    const [slot] = await tx.select().from(wlBookingSlots).where(eq(wlBookingSlots.slotId, newSlotId)).limit(1).for("update")
    if (!slot || slot.customerId !== booking.salonId || slot.status !== "1") return { error: "slot_not_found" }

    const slotError = checkSlot(slot)
    if (slotError) return { error: slotError }

    // The customer can't hold two bookings in the same slot
    const [existing] = await tx
        .select({ bookingId: wlBookings.bookingId })
        .from(wlBookings)
        .where(and(eq(wlBookings.slotId, newSlotId), eq(wlBookings.customerId, booking.customerId), eq(wlBookings.orderStatus, "Booked")))
        .limit(1)
    if (existing) return { error: "already_booked" }

    if (slot.bookedCount >= slot.maxBookings) return { error: "full" }

    return { slot }
}

// A request still waiting for the partner blocks a new one
const pendingRequestError = (booking) => {
    if (booking.cancelStatus === "pending") return "cancel_pending"
    if (booking.rescheduleStatus === "pending") return "reschedule_pending"
    return null
}

// Customer: asks to cancel. The booking stays as it is until the partner approves.
//   checkBooking(booking): an error code when it can't be cancelled, or null
//   cancellation(booking): { cancelReason, cancelReasonNote, refundMethod }
// Returns { error } or { booking } (with the request saved)
const requestCancellation = async ({ bookingId, customerId, checkBooking, cancellation, now }) =>
    db.transaction(async (tx) => {
        const booking = await lockCustomerBooking(tx, customerId, bookingId)
        if (!booking) return { error: "not_found" }

        const bookingError = checkBooking(booking) || pendingRequestError(booking)
        if (bookingError) return { error: bookingError }

        const values = {
            ...cancellation(booking),
            cancelStatus: "pending",
            cancelRequestedDate: now,
            cancelRespondedDate: null,
            cancelResponseNote: null,
            bookingUpdatedDate: now,
        }
        await tx.update(wlBookings).set(values).where(eq(wlBookings.bookingId, bookingId))

        return { booking: { ...booking, ...values } }
    })

// Customer: asks to move to another slot of the same salon. The slot is checked now and again on approval;
// nothing moves until the partner approves.
// Returns { error } or { booking, slot }
const requestReschedule = async ({ bookingId, customerId, newSlotId, checkBooking, checkSlot, now }) =>
    db.transaction(async (tx) => {
        const booking = await lockCustomerBooking(tx, customerId, bookingId)
        if (!booking) return { error: "not_found" }

        const bookingError = checkBooking(booking) || pendingRequestError(booking)
        if (bookingError) return { error: bookingError }

        const { error, slot } = await checkRequestedSlot(tx, booking, newSlotId, checkSlot)
        if (error) return { error }

        const values = {
            rescheduleStatus: "pending",
            requestedSlotId: slot.slotId,
            requestedSlotDate: slot.slotDate,
            requestedStartTime: slot.startTime,
            requestedEndTime: slot.endTime,
            rescheduleRequestedDate: now,
            rescheduleRespondedDate: null,
            rescheduleResponseNote: null,
            bookingUpdatedDate: now,
        }
        await tx.update(wlBookings).set(values).where(eq(wlBookings.bookingId, bookingId))

        return { booking: { ...booking, ...values }, slot }
    })

// Partner: approves or rejects the pending request of one of the salon's bookings, in one transaction.
//   requestType: 'cancel' | 'reschedule'; action: 'approve' | 'reject'
//   checkSlot(slot): for an approved reschedule, an error code when the requested slot can't take it any more
// Approve cancel: the booking is cancelled and its slot place freed.
// Approve reschedule: the booking moves to the requested slot (old slot freed, new one taken).
// Reject: only the request status changes; the booking keeps its date, time and status.
// Returns { error: 'not_found' | 'no_pending_request' | 'booking_closed' | <slot codes> } or { booking }
const respondToRequest = async ({ bookingId, salonId, requestType, action, note, checkSlot, now }) =>
    db.transaction(async (tx) => {
        const [booking] = await tx
            .select()
            .from(wlBookings)
            .where(and(eq(wlBookings.bookingId, bookingId), eq(wlBookings.salonId, salonId)))
            .limit(1)
            .for("update")
        if (!booking) return { error: "not_found" }

        const isCancel = requestType === "cancel"
        const statusField = isCancel ? "cancelStatus" : "rescheduleStatus"
        if (booking[statusField] !== "pending") return { error: "no_pending_request" }

        const decision = {
            [statusField]: action === "approve" ? "approved" : "rejected",
            [isCancel ? "cancelRespondedDate" : "rescheduleRespondedDate"]: now,
            [isCancel ? "cancelResponseNote" : "rescheduleResponseNote"]: note ?? null,
            bookingUpdatedDate: now,
        }

        if (action === "reject") {
            await tx.update(wlBookings).set(decision).where(eq(wlBookings.bookingId, bookingId))
            return { booking: { ...booking, ...decision } }
        }

        // Only a booking that's still active can be cancelled or moved
        if (booking.isCancel === "1" || booking.orderStatus !== "Booked") return { error: "booking_closed" }

        if (isCancel) {
            const values = { ...decision, orderStatus: "Cancelled", isCancel: "1", bookingCancelledDate: now, cancelledBy: "customer" }
            await tx.update(wlBookings).set(values).where(eq(wlBookings.bookingId, bookingId))
            await releaseSlotPlace(tx, booking.slotId)
            return { booking: { ...booking, ...values } }
        }

        // Reschedule: the requested slot is checked again, as it may have filled up since the request
        const { error, slot } = await checkRequestedSlot(tx, booking, booking.requestedSlotId, checkSlot)
        if (error) return { error }

        const values = {
            ...decision,
            previousSlotId: booking.slotId,
            previousSlotDate: booking.slotDate,
            previousStartTime: booking.startTime,
            previousEndTime: booking.endTime,
            slotId: slot.slotId,
            slotDate: slot.slotDate,
            startTime: slot.startTime,
            endTime: slot.endTime,
        }
        await tx.update(wlBookings).set(values).where(eq(wlBookings.bookingId, bookingId))
        await releaseSlotPlace(tx, booking.slotId)
        await tx
            .update(wlBookingSlots)
            .set({ bookedCount: sql`${wlBookingSlots.bookedCount} + 1` })
            .where(eq(wlBookingSlots.slotId, slot.slotId))

        return { booking: { ...booking, ...values }, slot: { ...slot, bookedCount: slot.bookedCount + 1 } }
    })

// Partner: the salon's cancellation and reschedule requests, newest first.
//   requestType: 'cancel' | 'reschedule' | undefined (both); status: 'pending' | 'approved' | 'rejected' | undefined (all)
// A booking with both kinds of request appears once per kind.
const findSalonRequests = async (salonId, { requestType, status, limit }) => {
    const kinds = requestType ? [requestType] : ["cancel", "reschedule"]
    const lists = await Promise.all(kinds.map((kind) => {
        const statusColumn = kind === "cancel" ? wlBookings.cancelStatus : wlBookings.rescheduleStatus
        const requestedColumn = kind === "cancel" ? wlBookings.cancelRequestedDate : wlBookings.rescheduleRequestedDate
        return db
            .select()
            .from(wlBookings)
            .where(and(eq(wlBookings.salonId, salonId), status ? eq(statusColumn, status) : sql`${statusColumn} <> 'none'`))
            .orderBy(desc(requestedColumn), desc(wlBookings.bookingId))
            .limit(limit)
            .then((rows) => rows.map((row) => ({ ...row, requestType: kind, requestedDate: (kind === "cancel" ? row.cancelRequestedDate : row.rescheduleRequestedDate) || "" })))
    }))

    return lists.flat().sort((a, b) => (a.requestedDate < b.requestedDate ? 1 : a.requestedDate > b.requestedDate ? -1 : 0)).slice(0, limit)
}

// Partner: one page of the salon's cancellation requests, latest request first.
//   status: 'pending' | 'approved' | 'rejected' | undefined (all)
const salonCancellations = (salonId, status) =>
    and(eq(wlBookings.salonId, salonId), status ? eq(wlBookings.cancelStatus, status) : sql`${wlBookings.cancelStatus} <> 'none'`)

const findSalonCancellationRequests = async (salonId, { status, limit, offset }) =>
    db
        .select()
        .from(wlBookings)
        .where(salonCancellations(salonId, status))
        .orderBy(desc(wlBookings.cancelRequestedDate), desc(wlBookings.bookingId))
        .limit(limit)
        .offset(offset)

// The salon's cancellation requests per status (the filter chips)
const countSalonCancellationRequests = async (salonId) => {
    const [row] = await db
        .select({
            pending: sql`COALESCE(SUM(${wlBookings.cancelStatus} = 'pending'), 0)`.mapWith(Number),
            approved: sql`COALESCE(SUM(${wlBookings.cancelStatus} = 'approved'), 0)`.mapWith(Number),
            rejected: sql`COALESCE(SUM(${wlBookings.cancelStatus} = 'rejected'), 0)`.mapWith(Number),
            total: count(),
        })
        .from(wlBookings)
        .where(salonCancellations(salonId))

    return row
}

// Pending requests per kind, for the partner Home cards
const countPendingRequests = async (salonId) => {
    const [row] = await db
        .select({
            cancel: sql`COALESCE(SUM(${wlBookings.cancelStatus} = 'pending'), 0)`.mapWith(Number),
            reschedule: sql`COALESCE(SUM(${wlBookings.rescheduleStatus} = 'pending'), 0)`.mapWith(Number),
        })
        .from(wlBookings)
        .where(eq(wlBookings.salonId, salonId))

    return row
}

// Partner: records that a booking was paid, online or in cash. Returns { error } or { booking }
const recordPayment = async ({ bookingId, salonId, paymentMode, paymentMethod, now }) =>
    db.transaction(async (tx) => {
        const [booking] = await tx
            .select()
            .from(wlBookings)
            .where(and(eq(wlBookings.bookingId, bookingId), eq(wlBookings.salonId, salonId)))
            .limit(1)
            .for("update")
        if (!booking) return { error: "not_found" }
        if (booking.isCancel === "1" || booking.orderStatus === "Cancelled") return { error: "cancelled" }
        if (booking.paymentStatus === "Paid") return { error: "already_paid" }

        const values = { paymentStatus: "Paid", paymentMode, paymentMethod, paymentReceivedDate: now, bookingUpdatedDate: now }
        await tx.update(wlBookings).set(values).where(eq(wlBookings.bookingId, bookingId))

        return { booking: { ...booking, ...values } }
    })

// The booking status (the tabs), from the stored status only. A booking stays Upcoming until the Salon Partner
// marks it Completed or Cancelled (or approves the customer's cancellation); the clock never moves it.
//   cancelled: is_cancel 1 or status Cancelled
//   completed: status Completed / No Show
//   upcoming:  status Booked
// today / nowTime are no longer used; callers still pass them, so the signatures stay.
const isCancelled = sql`(${wlBookings.isCancel} = '1' OR ${wlBookings.orderStatus} = 'Cancelled')`

const BOOKING_TABS = {
    cancelled: () => isCancelled,
    completed: () => sql`(NOT ${isCancelled} AND ${wlBookings.orderStatus} IN ('Completed', 'No Show'))`,
    upcoming: () => sql`(NOT ${isCancelled} AND ${wlBookings.orderStatus} = 'Booked')`,
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
            durationName: wlDurations.durationName,
        })
        .from(wlBookings)
        .leftJoin(salon, eq(salon.customerId, wlBookings.salonId))
        .leftJoin(wlServices, eq(wlServices.serviceId, wlBookings.serviceId))
        .leftJoin(wlDurations, eq(wlDurations.durationId, wlServices.serviceDuration))
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

// ----- Salon Partner: the salon's own bookings -----

// "50%_off" -> "50\%\_off", so LIKE matches the text literally
const escapeLike = (value) => value.replace(/[\\%_]/g, (ch) => `\\${ch}`)

// Everything that narrows the partner's list except the tab. salonId always comes from the logged-in partner.
//   search: "BK-24031" / "24031" (booking ID), or part of the customer's name or the service name
//   date: one slot date (YYYY-MM-DD); paymentStatus: 'Paid' | 'Unpaid'
const salonBookingsCondition = (salonId, { search, date, paymentStatus }) => {
    let searchCondition
    if (search) {
        const id = /^(?:bk-?)?(\d+)$/i.exec(search.replace(/\s+/g, ''))
        const pattern = `%${escapeLike(search)}%`
        searchCondition = sql`(${id ? sql`${wlBookings.bookingId} = ${Number(id[1])} OR ` : sql``}CONCAT_WS(' ', ${wlBookings.firstName}, ${wlBookings.lastName}) LIKE ${pattern} OR ${wlBookings.serviceName} LIKE ${pattern})`
    }

    return and(
        eq(wlBookings.salonId, salonId),
        searchCondition,
        date ? eq(wlBookings.slotDate, date) : undefined,
        paymentStatus ? eq(wlBookings.paymentStatus, paymentStatus) : undefined
    )
}

// One page of the salon's bookings for a tab (undefined = All). Upcoming shows the soonest first; the rest the latest first.
const findSalonBookings = async (salonId, { tab, search, date, paymentStatus, today, nowTime, limit, offset }) =>
    db
        .select({ booking: wlBookings, tab: bookingTab(today, nowTime).mapWith(String), ...employeeColumns })
        .from(wlBookings)
        .leftJoin(wlEmployees, employeeJoin)
        .where(and(salonBookingsCondition(salonId, { search, date, paymentStatus }), tab ? BOOKING_TABS[tab](today, nowTime) : undefined))
        .orderBy(
            ...(tab === "upcoming"
                ? [asc(wlBookings.slotDate), asc(wlBookings.startTime), asc(wlBookings.bookingId)]
                : [desc(wlBookings.slotDate), desc(wlBookings.startTime), desc(wlBookings.bookingId)])
        )
        .limit(limit)
        .offset(offset)
        .then((rows) => rows.map(({ booking, ...extra }) => ({ ...booking, ...extra })))

// The numbers on the tabs (All / Upcoming / Completed / Cancelled) for the same search and filters,
// and the pending request counts for the Reschedule / Cancellations buttons
const countSalonBookingsByTab = async (salonId, { search, date, paymentStatus, today, nowTime }) => {
    const [row] = await db
        .select({
            upcoming: sql`COALESCE(SUM(${BOOKING_TABS.upcoming(today, nowTime)}), 0)`.mapWith(Number),
            completed: sql`COALESCE(SUM(${BOOKING_TABS.completed(today, nowTime)}), 0)`.mapWith(Number),
            cancelled: sql`COALESCE(SUM(${BOOKING_TABS.cancelled()}), 0)`.mapWith(Number),
            total: count(),
        })
        .from(wlBookings)
        .where(salonBookingsCondition(salonId, { search, date, paymentStatus }))

    return row
}

// ----- Salon Partner: status and employee -----

// The salon's booking, locked for the rest of the transaction
const lockSalonBooking = async (tx, salonId, bookingId) => {
    const [booking] = await tx
        .select()
        .from(wlBookings)
        .where(and(eq(wlBookings.bookingId, bookingId), eq(wlBookings.salonId, salonId)))
        .limit(1)
        .for("update")

    return booking || null
}

// Partner: Upcoming -> Completed or Upcoming -> Cancelled. Completed and Cancelled are final.
//   status: 'completed' | 'cancelled'
// Cancelling frees the slot place. A request still waiting for the salon must be answered first.
// Returns { error: 'not_found' | 'same_status' | 'final' | 'cancel_pending' | 'reschedule_pending' } or { booking }
const updateBookingStatus = async ({ bookingId, salonId, status, now }) =>
    db.transaction(async (tx) => {
        const booking = await lockSalonBooking(tx, salonId, bookingId)
        if (!booking) return { error: "not_found" }

        const cancelled = booking.isCancel === "1" || booking.orderStatus === "Cancelled"
        const completed = ["Completed", "No Show"].includes(booking.orderStatus)
        if ((status === "cancelled" && cancelled) || (status === "completed" && completed)) return { error: "same_status" }
        if (cancelled || completed || booking.orderStatus !== "Booked") return { error: "final" }

        const pending = pendingRequestError(booking)
        if (pending) return { error: pending }

        const values = status === "completed"
            ? { orderStatus: "Completed", bookingCompletedDate: now, bookingUpdatedDate: now }
            : { orderStatus: "Cancelled", isCancel: "1", bookingCancelledDate: now, cancelledBy: "salon", bookingUpdatedDate: now }

        await tx.update(wlBookings).set(values).where(eq(wlBookings.bookingId, bookingId))
        if (status === "cancelled") await releaseSlotPlace(tx, booking.slotId)

        return { booking: { ...booking, ...values } }
    })

// Partner: assigns (or re-assigns) one of the salon's active employees to an upcoming booking.
// Returns { error: 'not_found' | 'employee_not_found' | 'closed' | 'same_employee' } or { booking, employee }
const assignEmployee = async ({ bookingId, salonId, employeeId, now }) =>
    db.transaction(async (tx) => {
        const booking = await lockSalonBooking(tx, salonId, bookingId)
        if (!booking) return { error: "not_found" }

        const [employee] = await tx
            .select()
            .from(wlEmployees)
            .where(and(eq(wlEmployees.employeeId, employeeId), eq(wlEmployees.salonId, salonId), eq(wlEmployees.status, "1")))
            .limit(1)
        if (!employee) return { error: "employee_not_found" }

        if (booking.isCancel === "1" || booking.orderStatus !== "Booked") return { error: "closed" }
        if (booking.employeeId === employeeId) return { error: "same_employee" }

        const values = { employeeId, employeeAssignedDate: now, bookingUpdatedDate: now }
        await tx.update(wlBookings).set(values).where(eq(wlBookings.bookingId, bookingId))

        return { booking: { ...booking, ...values }, employee }
    })

module.exports = {
    findSalonCancellationRequests,
    countSalonCancellationRequests,
    findSalonBooking,
    updateBookingStatus,
    assignEmployee,
    findSalonBookings,
    countSalonBookingsByTab,
    bookSlot,
    findCustomerBooking,
    updateBookingCoupon,
    requestCancellation,
    requestReschedule,
    respondToRequest,
    findSalonRequests,
    countPendingRequests,
    recordPayment,
    findCustomerBookings,
    countCustomerBookingsByTab,
    // In the order the tabs appear on My Bookings
    BOOKING_TAB_KEYS: ["upcoming", "completed", "cancelled"],
    // The same tab rules as SQL, for other screens (Salon Partner home)
    BOOKING_TABS,
    bookingTab,
}
