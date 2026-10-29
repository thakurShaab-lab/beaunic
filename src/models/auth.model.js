
const crypto = require("crypto")
const { eq, or, and, desc } = require("drizzle-orm")
const db = require("../config/drizzle")
const { wlCustomers } = require("../schema/wl-customers")
const { wlCustomersAddressBook } = require("../schema/wl-customers-address-book")

const LOGIN_TYPE = {
    "1": "salon_partner",
    "2": "salon_user",
}

const nowString = () =>
    new Date().toISOString().slice(0, 19).replace("T", " ")

const findByEmailOrMobile = async (userName, mobileNumber) => {
    const rows = await db
        .select({
            customerId: wlCustomers.customerId,
        })
        .from(wlCustomers)
        .where(
            or(
                eq(wlCustomers.userName, userName),
                eq(wlCustomers.mobileNumber, mobileNumber)
            )
        )
        .limit(1)

    return rows[0] || null
}

const create = async ({ deviceId, appId, appType, userName, passwordHash, firstName, mobileNumber, customerPhoto, customerType, serviceType, salonName, ipAddress,
}) => {
    const [result] = await db.insert(wlCustomers).values({
        appId,
        deviceId,
        appType,
        userName,
        password: passwordHash,
        firstName,
        mobileNumber,
        customerPhoto,
        customerType,
        serviceType,
        salonName,
        loginType: LOGIN_TYPE[customerType],
        isVerified: "1",
        actkey: crypto.randomBytes(16).toString("hex"),
        ipAddress: String(ipAddress || "").slice(0, 25),
        accountCreatedDate: nowString(),
    })

    return result.insertId
}

const loginFields = {
    customerId: wlCustomers.customerId,
    userName: wlCustomers.userName,
    firstName: wlCustomers.firstName,
    mobileNumber: wlCustomers.mobileNumber,
    customerType: wlCustomers.customerType,
    serviceType: wlCustomers.serviceType,
    salonName: wlCustomers.salonName,
    loginType: wlCustomers.loginType,
    status: wlCustomers.status,
    isVerified: wlCustomers.isVerified,
    isBlocked: wlCustomers.isBlocked,
    blockTime: wlCustomers.blockTime,
    numberOfLoginTry: wlCustomers.numberOfLoginTry,
    currentLogin: wlCustomers.currentLogin,
}

const findByEmail = async (email) => {
    const rows = await db
        .select({
            ...loginFields,
            password: wlCustomers.password,
        })
        .from(wlCustomers)
        .where(eq(wlCustomers.userName, email))
        .limit(1)

    return rows[0] || null
}

const findByMobile = async (mobileNumber) => {
    const rows = await db
        .select({
            ...loginFields,
            loginOtp: wlCustomers.loginOtp,
            isOtpVerified: wlCustomers.isOtpVerified,
            loginDateTime: wlCustomers.loginDateTime,
        })
        .from(wlCustomers)
        .where(eq(wlCustomers.mobileNumber, mobileNumber))
        .limit(1)

    return rows[0] || null
}

const saveLoginOtp = async (mobileNumber, otp) => {
    const [result] = await db
        .update(wlCustomers)
        .set({
            loginOtp: otp,
            isOtpVerified: "0",
            loginDateTime: nowString(),
        })
        .where(eq(wlCustomers.mobileNumber, mobileNumber))

    return result.affectedRows
}

const verifyLoginOtp = async (mobileNumber, otp) => {
    const [result] = await db
        .update(wlCustomers)
        .set({
            isOtpVerified: "1",
            isVerifiedMobile: "1",
            loginOtp: null,
        })
        .where(
            and(
                eq(wlCustomers.mobileNumber, mobileNumber),
                eq(wlCustomers.loginOtp, otp),
                eq(wlCustomers.isOtpVerified, "0")
            )
        )

    return result.affectedRows
}

const recordFailedLogin = async (customerId, numberOfLoginTry, block) => {
    await db
        .update(wlCustomers)
        .set({
            numberOfLoginTry,
            isBlocked: block ? "1" : "0",
            ...(block && { blockTime: nowString() }),
        })
        .where(eq(wlCustomers.customerId, customerId))
}

const recordSuccessfulLogin = async (customerId, previousLogin) => {
    await db
        .update(wlCustomers)
        .set({
            numberOfLoginTry: 0,
            isBlocked: "0",
            lastLoginDate: previousLogin,
            currentLogin: nowString(),
        })
        .where(eq(wlCustomers.customerId, customerId))
}

// register doesn't stop two accounts sharing a device, so prefer the most recently registered one
const findByDevice = async (appId, deviceId) => {
    const rows = await db
        .select({
            customerId: wlCustomers.customerId,
            customerType: wlCustomers.customerType,
            status: wlCustomers.status,
            firstName: wlCustomers.firstName,
            userName: wlCustomers.userName,
            mobileNumber: wlCustomers.mobileNumber,
        })
        .from(wlCustomers)
        .where(
            and(
                eq(wlCustomers.appId, appId),
                eq(wlCustomers.deviceId, deviceId)
            )
        )
        .orderBy(desc(wlCustomers.customerId))
        .limit(1)

    return rows[0] || null
}

const hasAddress = async (customerId) => {
    const rows = await db
        .select({ addressId: wlCustomersAddressBook.addressId })
        .from(wlCustomersAddressBook)
        .where(eq(wlCustomersAddressBook.customerId, customerId))
        .limit(1)

    return rows.length > 0
}

module.exports = {
    findByDevice,
    hasAddress,
    findByEmailOrMobile,
    create,
    findByEmail,
    findByMobile,
    saveLoginOtp,
    verifyLoginOtp,
    recordFailedLogin,
    recordSuccessfulLogin,
    nowString,
}
