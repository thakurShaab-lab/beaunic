const locationModel = require('../models/location.model')
const geoModel = require('../models/geo.model')
const addressModel = require('../models/address.model')
const { geocodeAddress, reverseGeocode } = require('./geocoding.service')

// The full address for /location/save, worked out on the server from either
//   a serviceable locality (wl_localities -> wl_cities -> wl_countries, then geocoded for the coordinates and PIN), or
//   the customer's GPS position (reverse geocoded, then matched to our wl_countries / wl_cities).
// Both return { values, place } or { error, message, field }:
//   values: the wl_customers_address_book columns, stored like the profile form does: country = wl_countries ID,
//           state = wl_cities ID, city = the locality / town name. When a reverse-geocoded country or city isn't
//           one of ours, its name is stored instead (every reader of the address book handles both).
//   place:  the same address as names, for the response.

// wl_cities titles carry a state hint, e.g. "Ghazipur (UP)" -> "Ghazipur" and "UP"
const cityTitle = (title) => (title ? title.replace(/\s*\(.*?\)\s*/g, ' ').trim() : null)
const cityHint = (title) => (title && /\(([^)]+)\)/.exec(title)?.[1].trim()) || null

const cut = (value, length) => (value ? String(value).slice(0, length) : null)
const same = (a, b) => Boolean(a && b) && a.trim().toLowerCase() === b.trim().toLowerCase()

const dedupe = (values) => {
    const out = []
    for (const value of values) if (value && !out.some((kept) => same(kept, value))) out.push(value)
    return out
}

const fullAddress = (parts) => dedupe(parts).join(', ')

const LOCATION_ERRORS = {
    location: 'Location not found or not available.',
    city: 'The city of this location is not available.',
    country: 'The country of this location is not available.',
}

// Scenario 1: a locality from the serviceable locations list
const addressFromLocation = async (locationId) => {
    const row = await locationModel.findLocationWithPlace(locationId)

    // The locality, its city and the city's country must all exist and be active
    if (!row || row.locationStatus !== '1') return { error: 'location_not_found', message: LOCATION_ERRORS.location, field: 'locationId' }
    if (!row.cityName || row.cityStatus !== '1') return { error: 'city_not_found', message: LOCATION_ERRORS.city, field: 'locationId' }
    if (!row.countryId || row.countryStatus !== '1') return { error: 'country_not_found', message: LOCATION_ERRORS.country, field: 'locationId' }

    const cityName = cityTitle(row.cityName)
    const hint = cityHint(row.cityName)

    // "Main Market, Dildarnagar, UP, India": coordinates, the state's full name and the PIN code. A customer picks a
    // locality, so a locality-level match is precise enough. If it can't be found the address is still saved
    // (it is complete from our own tables) without coordinates; Nearby Salons tries the lookup again later.
    const geo = await geocodeAddress(
        { address: row.locationName, city: cityName, state: hint, country: row.countryName },
        { allowLocality: true, countryCode: row.countryCode || undefined }
    )
    if (geo.error) console.warn(`Geocoding location ${locationId} failed (${geo.error}): ${geo.message}`)
    const found = !geo.error
    const components = found ? geo.components : {}

    const stateName = components.state || hint
    const pinCode = components.postalCode || null

    return {
        values: {
            address: cut(row.locationName, 200),
            city: cut(cityName, 50),
            state: String(row.cityId),
            country: String(row.countryId),
            zipcode: cut(pinCode, 25),
            latitude: found ? addressModel.toCoordinate(geo.latitude) : null,
            longitude: found ? addressModel.toCoordinate(geo.longitude) : null,
        },
        place: {
            source: 'manual',
            locationId: row.locationId,
            address: row.locationName,
            cityId: row.cityId,
            city: cityName,
            state: stateName,
            pinCode,
            countryId: row.countryId,
            country: row.countryName,
            latitude: found ? geo.latitude : null,
            longitude: found ? geo.longitude : null,
            locationFound: found,
            fullAddress: fullAddress([row.locationName, cityName, stateName, pinCode, row.countryName]),
        },
    }
}

const REVERSE_ERRORS = {
    unavailable: "We couldn't get the address of your current location right now. Please try again or select a location from the list.",
    not_found: "We couldn't find an address for your current location. Please select a location from the list.",
}

// Our city for a reverse-geocoded town: an active wl_cities row of that country named like the town, else its
// district / sub-district (titles like "Ghazipur (UP)" match "Ghazipur")
const matchCity = async (countryId, components) => {
    const names = dedupe([components.locality, components.district, components.subDistrict])
    if (!countryId || !names.length) return null

    const candidates = await geoModel.findActiveCitiesStartingWith(countryId, names)
    for (const name of names) {
        const match = candidates.find((city) => same(cityTitle(city.cityName), name))
        if (match) return match
    }
    return null
}

// Scenario 2: the customer's GPS position
const addressFromCoordinates = async (latitude, longitude) => {
    const geo = await reverseGeocode(latitude, longitude)
    if (geo.error) {
        console.warn(`Reverse geocoding ${latitude},${longitude} failed (${geo.error}): ${geo.message}`)
        const key = geo.error === 'not_found' || geo.error === 'incomplete' ? 'not_found' : 'unavailable'
        return { error: `address_${key}`, message: REVERSE_ERRORS[key], field: 'latitude' }
    }

    const c = geo.components
    // The town (a village / tehsil / district when there is no town) and the country are the least an address needs
    const town = c.locality || c.subDistrict || c.district
    if (!town || !c.country) {
        console.warn(`Reverse geocoding ${latitude},${longitude}: no town or country in "${geo.formattedAddress}"`)
        return { error: 'address_incomplete', message: REVERSE_ERRORS.not_found, field: 'latitude' }
    }

    // House / street / area, without repeating the town: "12, MG Road, Sector 15"
    const street = dedupe([c.premise, [c.streetNumber, c.route].filter(Boolean).join(' '), c.sublocality3, c.sublocality2, c.sublocality1 || c.neighborhood])
        .filter((part) => !same(part, town))
    const address = street.join(', ') || town

    const country = c.countryCode ? await geoModel.findActiveCountryByIsoCode(c.countryCode) : null
    const city = await matchCity(country?.countryId, c)

    return {
        values: {
            address: cut(address, 200),
            city: cut(town, 50),
            // Our city's ID when we have it, else the state's name
            state: city ? String(city.cityId) : cut(c.state, 50),
            country: country ? String(country.countryId) : cut(c.country, 80),
            zipcode: cut(c.postalCode, 25),
            // Where the customer actually is, not the centre of the address found
            latitude: addressModel.toCoordinate(latitude),
            longitude: addressModel.toCoordinate(longitude),
        },
        place: {
            source: 'current',
            locationId: null,
            address,
            cityId: city ? city.cityId : null,
            city: town,
            state: c.state,
            pinCode: c.postalCode,
            countryId: country ? country.countryId : null,
            country: country ? country.countryName : c.country,
            latitude,
            longitude,
            locationFound: true,
            fullAddress: fullAddress([address, town, c.state, c.postalCode, country ? country.countryName : c.country]),
        },
    }
}

module.exports = { addressFromLocation, addressFromCoordinates, cityTitle, cityHint, LOCATION_ERRORS, REVERSE_ERRORS }
