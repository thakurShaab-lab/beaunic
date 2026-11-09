const { eq, and, asc, isNotNull } = require("drizzle-orm")
const db = require("../config/drizzle")
const { wlEnquiries } = require("../schema/wl-enquiries")
const { wlCustomers } = require("../schema/wl-customers")
const { wlServices } = require("../schema/wl-services")

// Active, approved salons with their active services, for the Salon / Service dropdown (one row per salon + service)
const findEnquirySalons = async () =>
    db
        .select({
            salonId: wlCustomers.customerId,
            salonName: wlCustomers.salonName,
            serviceId: wlServices.serviceId,
            serviceName: wlServices.serviceName,
        })
        .from(wlCustomers)
        .leftJoin(wlServices, and(eq(wlServices.customerId, wlCustomers.customerId), eq(wlServices.status, "1")))
        .where(and(eq(wlCustomers.customerType, "1"), eq(wlCustomers.status, "1"), isNotNull(wlCustomers.salonName)))
        .orderBy(asc(wlCustomers.salonName), asc(wlServices.serviceName))

// Saves the enquiry in wl_enquiries (the same table as website enquiries); returns its ID
const createEnquiry = async (values) => {
    const [result] = await db.insert(wlEnquiries).values(values)

    return result.insertId
}

module.exports = { findEnquirySalons, createEnquiry }
