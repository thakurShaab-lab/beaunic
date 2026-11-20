const recentLocationModel = require('../models/recentLocation.model')
const { fullAddress } = require('./locationAddress.service')

// "Recent Locations": every location a User saves with /location/save is remembered here (one entry per place),
// and choosing one of them again sets it without another lookup.

const placeKeyOf = (source, place, label) =>
    (source === 'manual' && place.locationId
        ? `location:${place.locationId}`
        // GPS: the same town / area is one entry, whatever the exact position
        : `place:${[label.title, label.subtitle].filter(Boolean).join('|')}`.toLowerCase().replace(/\s+/g, ' ').trim()
    ).slice(0, 191)

// Remembers a saved location (result of locationAddress.addressFromLocation / addressFromCoordinates, or a
// recent location chosen again). Never fails the save: an error is only logged.
const rememberLocation = async (customerId, { values, place, label }, now) => {
    try {
        await recentLocationModel.saveRecentLocation({
            customerId,
            placeKey: placeKeyOf(place.source, place, label),
            source: place.source,
            locationId: place.locationId ?? null,
            title: label.title || place.city || place.address || 'Location',
            subtitle: label.subtitle || null,
            address: values.address ?? null,
            city: values.city ?? null,
            state: values.state ?? null,
            country: values.country ?? null,
            zipcode: values.zipcode ?? null,
            cityId: place.cityId ?? null,
            countryId: place.countryId ?? null,
            stateName: place.state ? String(place.state).slice(0, 50) : null,
            countryName: place.country ? String(place.country).slice(0, 80) : null,
            latitude: values.latitude ?? null,
            longitude: values.longitude ?? null,
            createdDate: now,
            lastUsedDate: now,
        })
        await recentLocationModel.pruneRecentLocations(customerId)
    } catch (err) {
        console.error(`Recent location for customer ${customerId} not saved:`, err)
    }
}

const toNumber = (value) => (value === null || value === undefined ? null : Number(value))

// A recent location as a /location/save result: the address book values exactly as saved before
const resultFromRecent = (row) => {
    const latitude = toNumber(row.latitude)
    const longitude = toNumber(row.longitude)

    return {
        values: {
            address: row.address,
            city: row.city,
            state: row.state,
            country: row.country,
            zipcode: row.zipcode,
            latitude: row.latitude,
            longitude: row.longitude,
        },
        place: {
            source: row.source,
            locationId: row.locationId,
            address: row.address,
            cityId: row.cityId,
            city: row.city,
            state: row.stateName,
            pinCode: row.zipcode,
            countryId: row.countryId,
            country: row.countryName,
            latitude,
            longitude,
            locationFound: latitude !== null && longitude !== null,
            fullAddress: fullAddress([row.address, row.city, row.stateName, row.zipcode, row.countryName]),
        },
        label: { title: row.title, subtitle: row.subtitle },
    }
}

const formatRecentLocation = (row) => ({
    recentLocationId: row.recentLocationId,
    title: row.title,
    subtitle: row.subtitle,
    source: row.source,
    locationId: row.locationId,
    address: row.address,
    city: row.city,
    state: row.stateName,
    pinCode: row.zipcode,
    country: row.countryName,
    latitude: toNumber(row.latitude),
    longitude: toNumber(row.longitude),
    lastUsedDate: row.lastUsedDate,
})

module.exports = { rememberLocation, resultFromRecent, formatRecentLocation, placeKeyOf }
