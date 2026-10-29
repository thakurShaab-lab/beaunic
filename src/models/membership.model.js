const { eq, and, gte, notInArray } = require("drizzle-orm")
const db = require("../config/drizzle")
const { wlMembership } = require("../schema/wl-memberships")
// wl-order.js exports the wl_order table as wlOrders, which clashes with wl_orders - alias it here
const { wlOrders: wlOrder } = require("../schema/wl-order")

// wl_memberships.status: 0=Inactive, 1=Active, 2=Deleted
const planFields = {
    membershipId: wlMembership.membership_id,
    title: wlMembership.title,
    planName: wlMembership.plan_name,
    duration: wlMembership.duration,
    price: wlMembership.price,
    description: wlMembership.description,
    buyLeadCount: wlMembership.buy_lead_count,
    isCost: wlMembership.is_cost,
    type: wlMembership.type,
    projectCount: wlMembership.project_count,
    propertyCount: wlMembership.property_count,
    propertyCountRent: wlMembership.property_count_rent,
    propertyCountLand: wlMembership.property_count_land,
}

const todayString = () => new Date().toISOString().slice(0, 10)

const findActivePlans = async () =>
    db
        .select(planFields)
        .from(wlMembership)
        .where(eq(wlMembership.status, "1"))
        .orderBy(wlMembership.price)

const findActivePlanById = async (membershipId) => {
    const rows = await db
        .select(planFields)
        .from(wlMembership)
        .where(
            and(
                eq(wlMembership.membership_id, membershipId),
                eq(wlMembership.status, "1")
            )
        )
        .limit(1)

    return rows[0] || null
}

// A membership is active once paid and enabled, until its pkg_end_date has passed
const findActiveMembership = async (customerId) => {
    const rows = await db
        .select({
            orderId: wlOrder.order_id,
            membershipName: wlOrder.mship_name,
            endDate: wlOrder.pkg_end_date,
        })
        .from(wlOrder)
        .where(
            and(
                eq(wlOrder.customers_id, customerId),
                eq(wlOrder.order_type, 1),
                eq(wlOrder.status, "1"),
                eq(wlOrder.payment_status, "Paid"),
                eq(wlOrder.membership_status, "1"),
                // the live column spells it "Cancelled"; the schema file has "Canceled"
                notInArray(wlOrder.order_status, ["Deleted", "Cancelled", "Canceled", "Rejected"]),
                gte(wlOrder.pkg_end_date, todayString())
            )
        )
        .limit(1)

    return rows[0] || null
}

const createOrder = async (values) => {
    // Only the newest membership order for a customer is flagged is_latest = 1
    await db
        .update(wlOrder)
        .set({ is_latest: 0 })
        .where(
            and(
                eq(wlOrder.customers_id, values.customers_id),
                eq(wlOrder.order_type, 1)
            )
        )

    const [result] = await db.insert(wlOrder).values({ ...values, is_latest: 1 })

    return result.insertId
}

const updateOrderAddress = async (orderId, { address, state }) => {
    const [result] = await db
        .update(wlOrder)
        .set({ address, state })
        .where(eq(wlOrder.order_id, orderId))

    return result.affectedRows
}

module.exports = {
    updateOrderAddress,
    findActivePlans,
    findActivePlanById,
    findActiveMembership,
    createOrder,
    todayString,
}
