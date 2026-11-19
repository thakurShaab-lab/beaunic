const addressModel = require('../models/address.model')
const authModel = require('../models/auth.model')
const geoModel = require('../models/geo.model')
const { geocodeAddress } = require('./geocoding.service')

// Coordinates of wl_customers_address_book rows: geocoded when an address is saved (never during a search),
// or the customer's own GPS position. Nothing here throws: a failed lookup leaves the coordinates empty.

// A country / city ID saved in the address book, or null when it holds text (e.g. "India")
const savedId = (value) => (/^\d+$/.test(String(value ?? '').trim()) ? Number(value) : null)

// wl_cities titles carry a state hint, e.g. "Ghazipur (UP)"
const cityTitle = (title) => (title ? title.replace(/\s*\(.*?\)\s*/g, ' ').trim() : null)

// The row as address parts. The partner's form saves country / state as wl_countries / wl_cities IDs and the
// locality in "city"; customer locations save plain text. Both are handled.
const addressParts = async (row) => {
    const countryId = savedId(row.country)
    const cityId = savedId(row.state)
    const names = countryId || cityId ? await geoModel.findCountryAndCityNames(countryId, cityId) : {}

    return {
        address: row.address,
        area: row.city,
        city: cityId ? cityTitle(names.cityName) : null,
        state: cityId ? null : row.state,
        pinCode: row.zipcode,
        country: countryId ? names.countryName : row.country,
    }
}

// Geocodes a saved address and stores the result. When it can't be found the coordinates are cleared, so a
// changed address never keeps the old position. Returns { latitude, longitude } or { error, message }.
const updateAddressCoordinates = async (addressId) => {
    try {
        const row = await addressModel.findAddressById(addressId)
        if (!row) return { error: 'not_found', message: 'Address not found' }

        const result = await geocodeAddress(await addressParts(row))
        if (result.error) {
            console.warn(`Geocoding address ${addressId} failed (${result.error}): ${result.message}`)
            await addressModel.setAddressCoordinates(addressId, { latitude: null, longitude: null })
            return result
        }

        await addressModel.setAddressCoordinates(addressId, result)
        return { latitude: result.latitude, longitude: result.longitude }
    } catch (err) {
        console.error(`Geocoding address ${addressId} error:`, err)
        return { error: 'failed', message: err.message }
    }
}

// A saved address's coordinates, geocoding it once if it was saved before coordinates were kept.
// Returns { latitude, longitude } or { error }.
const coordinatesOf = async (row) => {
    if (row.latitude !== null && row.longitude !== null) return { latitude: Number(row.latitude), longitude: Number(row.longitude) }
    return updateAddressCoordinates(row.addressId)
}

const sameCoordinate = (saved, value) => saved !== null && saved !== undefined && Number(saved).toFixed(7) === Number(value).toFixed(7)

// The User's live GPS position, kept on their default address entry (made if they have none).
// Skipped when it hasn't moved, so repeated searches don't write.
const saveGpsLocation = async (customer, { latitude, longitude }) => {
    try {
        const existing = await addressModel.findDefaultAddressWithCoordinates(customer.customerId)
        if (existing) {
            if (sameCoordinate(existing.latitude, latitude) && sameCoordinate(existing.longitude, longitude)) return
            await addressModel.setAddressCoordinates(existing.addressId, { latitude, longitude })
            return
        }

        await addressModel.createAddress({
            customerId: customer.customerId,
            name: customer.firstName ? customer.firstName.slice(0, 32) : null,
            latitude: addressModel.toCoordinate(latitude),
            longitude: addressModel.toCoordinate(longitude),
            addressType: 'Bill',
            defaultStatus: 'Y',
            recivDate: authModel.nowString(),
        })
    } catch (err) {
        // The search still works without saving the position
        console.error('Save GPS location error:', err)
    }
}

module.exports = { updateAddressCoordinates, coordinatesOf, saveGpsLocation, addressParts, cityTitle, savedId }
