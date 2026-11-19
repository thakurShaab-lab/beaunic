const { eq, and, desc, sql } = require("drizzle-orm")
const db = require("../config/drizzle")
const { wlCustomersAddressBook } = require("../schema/wl-customers-address-book")

const createAddress = async (values) => {
    const [result] = await db.insert(wlCustomersAddressBook).values(values)

    return result.insertId
}

const deleteAddress = async (addressId) => {
    await db
        .delete(wlCustomersAddressBook)
        .where(eq(wlCustomersAddressBook.addressId, addressId))
}

const findDefaultAddress = async (customerId) => {
    const rows = await db
        .select({
            addressId: wlCustomersAddressBook.addressId,
            mobile: wlCustomersAddressBook.mobile,
            additionalNumbers: wlCustomersAddressBook.additionalNumbers,
            supportNumber: wlCustomersAddressBook.supportNumber,
            address: wlCustomersAddressBook.address,
            city: wlCustomersAddressBook.city,
            state: wlCustomersAddressBook.state,
            zipcode: wlCustomersAddressBook.zipcode,
            country: wlCustomersAddressBook.country,
        })
        .from(wlCustomersAddressBook)
        .where(eq(wlCustomersAddressBook.customerId, customerId))
        .orderBy(desc(sql`${wlCustomersAddressBook.defaultStatus} = 'Y'`), desc(wlCustomersAddressBook.addressId))
        .limit(1)

    return rows[0] || null
}

const updateAddress = async (addressId, values) => {
    await db
        .update(wlCustomersAddressBook)
        .set(values)
        .where(eq(wlCustomersAddressBook.addressId, addressId))
}

const addressWithCoordinates = {
    addressId: wlCustomersAddressBook.addressId,
    customerId: wlCustomersAddressBook.customerId,
    address: wlCustomersAddressBook.address,
    city: wlCustomersAddressBook.city,
    state: wlCustomersAddressBook.state,
    zipcode: wlCustomersAddressBook.zipcode,
    country: wlCustomersAddressBook.country,
    defaultStatus: wlCustomersAddressBook.defaultStatus,
    latitude: wlCustomersAddressBook.latitude,
    longitude: wlCustomersAddressBook.longitude,
}

const findAddressById = async (addressId) => {
    const rows = await db.select(addressWithCoordinates).from(wlCustomersAddressBook).where(eq(wlCustomersAddressBook.addressId, addressId)).limit(1)

    return rows[0] || null
}

// One of the customer's own saved addresses; another customer's address is never found
const findCustomerAddress = async (customerId, addressId) => {
    const rows = await db
        .select(addressWithCoordinates)
        .from(wlCustomersAddressBook)
        .where(and(eq(wlCustomersAddressBook.addressId, addressId), eq(wlCustomersAddressBook.customerId, customerId)))
        .limit(1)

    return rows[0] || null
}

// The customer's default address (else newest) with its coordinates
const findDefaultAddressWithCoordinates = async (customerId) => {
    const rows = await db
        .select(addressWithCoordinates)
        .from(wlCustomersAddressBook)
        .where(eq(wlCustomersAddressBook.customerId, customerId))
        .orderBy(desc(sql`${wlCustomersAddressBook.defaultStatus} = 'Y'`), desc(wlCustomersAddressBook.addressId))
        .limit(1)

    return rows[0] || null
}

// null clears them (address not found), so an old position never stays on a changed address
const toCoordinate = (value) => (value === null || value === undefined ? null : Number(value).toFixed(7))
const setAddressCoordinates = async (addressId, { latitude, longitude }) => {
    await db
        .update(wlCustomersAddressBook)
        .set({ latitude: toCoordinate(latitude), longitude: toCoordinate(longitude) })
        .where(eq(wlCustomersAddressBook.addressId, addressId))
}

module.exports = {
    findAddressById,
    findCustomerAddress,
    findDefaultAddressWithCoordinates,
    setAddressCoordinates,
    toCoordinate,
    findDefaultAddress,
    updateAddress,
    createAddress,
    deleteAddress,
}