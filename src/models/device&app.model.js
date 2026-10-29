const db = require('../config/drizzle')
const { eq, and } = require('drizzle-orm')
const { wlCustomers } = require('../schema/wl-customers')


const validateDevice = async (appId, deviceId) => {
    const result = await db
        .select({ customersId: wlCustomers.customerId })
        .from(wlCustomers)
        .where(
            and(
                eq(wlCustomers.appId, appId),
                eq(wlCustomers.deviceId, deviceId)
            )
        )
        .limit(1)

    return result.length > 0
}

module.exports = {
    validateDevice
}