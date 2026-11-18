const { eq, and, desc, count } = require("drizzle-orm")
const db = require("../config/drizzle")
const { wlRefunds } = require("../schema/wl-refunds")
const { wlWalletTransactions } = require("../schema/wl-wallet-transactions")

// The refund for a paid booking that has just been cancelled, inside the cancelling transaction.
// Nothing for an unpaid or free booking; a second call for the same booking is ignored.
//   booking: the wl_bookings row (refundMethod: 'wallet' | 'original' | null)
const createBookingRefund = async (tx, booking, now) => {
    if (booking.paymentStatus !== "Paid" || !(Number(booking.totalAmount) > 0)) return

    await tx
        .insert(wlRefunds)
        .values({
            salonId: booking.salonId,
            customerId: booking.customerId || 0,
            sourceType: "booking",
            sourceId: booking.bookingId,
            referenceNumber: `BK-${booking.bookingId}`,
            customerName: [booking.firstName, booking.lastName].filter(Boolean).join(" ").trim() || null,
            refundAmount: booking.totalAmount,
            // The customer's choice on Cancel Booking; a salon cancellation goes back to the source
            refundTo: booking.refundMethod === "wallet" ? "wallet" : "source",
            status: "pending",
            refundAddedDate: now,
            refundUpdatedDate: now,
        })
        .onDuplicateKeyUpdate({ set: { refundUpdatedDate: now } })
}

// One page of the salon's refunds, newest first. status: 'pending' | 'processed' | undefined (all)
const findSalonRefunds = async (salonId, { status, limit, offset }) =>
    db
        .select()
        .from(wlRefunds)
        .where(and(eq(wlRefunds.salonId, salonId), status ? eq(wlRefunds.status, status) : undefined))
        .orderBy(desc(wlRefunds.refundAddedDate), desc(wlRefunds.refundId))
        .limit(limit)
        .offset(offset)

// How many of the salon's refunds are pending / processed, for the tabs
const countSalonRefunds = async (salonId) => {
    const rows = await db
        .select({ status: wlRefunds.status, total: count() })
        .from(wlRefunds)
        .where(eq(wlRefunds.salonId, salonId))
        .groupBy(wlRefunds.status)

    const counts = { pending: 0, processed: 0 }
    for (const row of rows) counts[row.status] = Number(row.total)
    return { ...counts, all: counts.pending + counts.processed }
}

// One of the salon's refunds (a partner never reaches another salon's refunds)
const findSalonRefund = async (salonId, refundId) => {
    const rows = await db
        .select()
        .from(wlRefunds)
        .where(and(eq(wlRefunds.salonId, salonId), eq(wlRefunds.refundId, refundId)))
        .limit(1)

    return rows[0] || null
}

// Marks a pending refund as processed. A wallet refund is also credited to the customer's Beaunic Wallet.
//   values: { transactionSlip, transactionReference, refundNote } (null = not sent)
// Returns { error } or { refund }. errors: not_found, processed, slip_required
const processRefund = async ({ salonId, refundId, values, now }) =>
    db.transaction(async (tx) => {
        const [refund] = await tx
            .select()
            .from(wlRefunds)
            .where(and(eq(wlRefunds.salonId, salonId), eq(wlRefunds.refundId, refundId)))
            .limit(1)
            .for("update")

        if (!refund) return { error: "not_found" }
        if (refund.status === "processed") return { error: "processed" }
        if (refund.refundTo === "bank_account" && !values.transactionSlip) return { error: "slip_required" }

        const changes = {
            status: "processed",
            transactionSlip: values.transactionSlip ?? refund.transactionSlip,
            transactionReference: values.transactionReference ?? refund.transactionReference,
            refundNote: values.refundNote ?? refund.refundNote,
            refundProcessedDate: now,
            refundUpdatedDate: now,
        }
        await tx.update(wlRefunds).set(changes).where(eq(wlRefunds.refundId, refundId))

        if (refund.refundTo === "wallet" && refund.customerId > 0 && Number(refund.refundAmount) > 0) {
            await tx.insert(wlWalletTransactions).values({
                customerId: refund.customerId,
                transactionType: "credit",
                category: "refund",
                amount: refund.refundAmount,
                referenceNumber: refund.referenceNumber,
                referenceId: refund.sourceId,
                description: `Refund for ${refund.referenceNumber}`,
                status: "1",
                transactionAddedDate: now,
            })
        }

        return { refund: { ...refund, ...changes } }
    })

module.exports = { createBookingRefund, findSalonRefunds, countSalonRefunds, findSalonRefund, processRefund }
