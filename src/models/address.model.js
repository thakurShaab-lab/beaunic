const { eq, desc, sql } = require("drizzle-orm")
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

module.exports = {
    findDefaultAddress,
    updateAddress,
    createAddress,
    deleteAddress,
}
