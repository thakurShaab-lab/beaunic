const { eq, and, desc, sql } = require('drizzle-orm')
const db = require('../config/drizzle')
const { wlCustomerRecentLocations } = require('../schema/wl-customer-recent-locations')

const r = wlCustomerRecentLocations

// How many recent locations are kept per customer; older ones are removed
const KEEP_PER_CUSTOMER = 10

// Adds the place, or (same customer + place_key) refreshes it and moves it to the top
const saveRecentLocation = async (values) => {
    const { customerId, placeKey, createdDate, ...changes } = values
    await db.insert(r).values(values).onDuplicateKeyUpdate({ set: changes })
}

// Keeps only the customer's newest KEEP_PER_CUSTOMER entries
const pruneRecentLocations = async (customerId) => {
    await db.execute(sql`
        DELETE FROM wl_customer_recent_locations
        WHERE customer_id = ${customerId}
          AND recent_location_id NOT IN (
              SELECT recent_location_id FROM (
                  SELECT recent_location_id FROM wl_customer_recent_locations
                  WHERE customer_id = ${customerId}
                  ORDER BY last_used_date DESC, recent_location_id DESC
                  LIMIT ${KEEP_PER_CUSTOMER}
              ) newest
          )`)
}

// The customer's recent locations, newest first
const findRecentLocations = async (customerId, limit) =>
    db
        .select()
        .from(r)
        .where(eq(r.customerId, customerId))
        .orderBy(desc(r.lastUsedDate), desc(r.recentLocationId))
        .limit(limit)

// One of the customer's own recent locations, or null
const findRecentLocation = async (customerId, recentLocationId) => {
    const rows = await db
        .select()
        .from(r)
        .where(and(eq(r.customerId, customerId), eq(r.recentLocationId, recentLocationId)))
        .limit(1)

    return rows[0] || null
}

module.exports = { KEEP_PER_CUSTOMER, saveRecentLocation, pruneRecentLocations, findRecentLocations, findRecentLocation }
