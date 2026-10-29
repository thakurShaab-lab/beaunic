const { eq } = require("drizzle-orm")
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

module.exports = {
    createAddress,
    deleteAddress,
}
