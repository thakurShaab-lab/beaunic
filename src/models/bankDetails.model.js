const { eq } = require("drizzle-orm")
const db = require("../config/drizzle")
const { wlCustomerBankDetails } = require("../schema/wl-customer-bank-details")

const findBankDetails = async (customerId) => {
    const rows = await db.select().from(wlCustomerBankDetails).where(eq(wlCustomerBankDetails.customerId, customerId)).limit(1)

    return rows[0] || null
}

// Creates the customer's bank details or changes the fields sent (undefined ones are left as they are)
const saveBankDetails = async (customerId, values, now) => {
    const existing = await findBankDetails(customerId)

    if (existing) {
        await db
            .update(wlCustomerBankDetails)
            .set({ ...values, bankDetailUpdatedDate: now })
            .where(eq(wlCustomerBankDetails.customerId, customerId))
        return
    }

    await db.insert(wlCustomerBankDetails).values({ customerId, ...values, bankDetailAddedDate: now, bankDetailUpdatedDate: now })
}

module.exports = { findBankDetails, saveBankDetails }
