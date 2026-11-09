const { eq, and, ne, count, sql, desc } = require("drizzle-orm")
const db = require("../config/drizzle")
const { wlCoupons } = require("../schema/wl-coupons")
const { wlCouponCustomers } = require("../schema/wl-coupon-customers")
const { wlBookings } = require("../schema/wl-bookings")

// A coupon by its code, whatever its status or dates; the caller decides whether it can be used.
// Any letter case matches ("njeqiuvf" finds "NjeqIuVF"; the column itself compares case-sensitively).
// Deleted coupons (status 2) are treated as missing.
const findCouponByCode = async (couponCode) => {
    const rows = await db
        .select()
        .from(wlCoupons)
        .where(and(sql`LOWER(${wlCoupons.couponCode}) = ${couponCode.toLowerCase()}`, ne(wlCoupons.status, "2")))
        .orderBy(desc(wlCoupons.couponId))
        .limit(1)

    return rows[0] || null
}

// coupon_for 1 ("for members"): only customers the coupon was sent to (wl_coupon_customers) can use it
const isCouponSentToCustomer = async (couponId, customerId) => {
    const rows = await db
        .select({ id: wlCouponCustomers.id })
        .from(wlCouponCustomers)
        .where(and(eq(wlCouponCustomers.couponId, couponId), eq(wlCouponCustomers.customerId, customerId)))
        .limit(1)

    return rows.length > 0
}

// How many of the customer's other bookings (not cancelled) used this coupon;
// excludeBookingId leaves out the booking it is being applied to, so re-applying it doesn't count twice
const countCustomerCouponUses = async (couponId, customerId, excludeBookingId) => {
    const rows = await db
        .select({ total: count() })
        .from(wlBookings)
        .where(
            and(
                eq(wlBookings.discountCouponId, couponId),
                eq(wlBookings.customerId, customerId),
                ne(wlBookings.orderStatus, "Cancelled"),
                excludeBookingId !== undefined ? ne(wlBookings.bookingId, excludeBookingId) : undefined
            )
        )

    return Number(rows[0].total)
}

module.exports = { findCouponByCode, isCouponSentToCustomer, countCustomerCouponUses }
