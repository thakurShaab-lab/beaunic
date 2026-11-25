const { sql } = require("drizzle-orm")
const { wlBookings } = require("../schema/wl-bookings")

// An offline booking is saved in wl_bookings as soon as the partner starts it (/booking/offline/client), with
// order_status 'Draft' until step 4 confirms it. A draft is not a booking yet: salon-side lists, counts, reports,
// details and status changes leave it out with this condition. (Customer-side queries never see drafts: a draft has
// no customer_id.)
const isBooking = sql`${wlBookings.orderStatus} <> 'Draft'`

const DRAFT_STATUS = "Draft"
const OFFLINE_CUSTOMER_TYPE = "Offline"

module.exports = { isBooking, DRAFT_STATUS, OFFLINE_CUSTOMER_TYPE }
