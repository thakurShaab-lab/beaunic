const { eq, and, or, like, asc } = require("drizzle-orm")
const db = require("../config/drizzle")
const { wlLocalities } = require("../schema/wl-localities")
const { wlCities } = require("../schema/wl-cities")
const { wlCountries } = require("../schema/wl-countries")

const activeLocationsQuery = (condition) =>
    db
        .select({
            locationId: wlLocalities.locationId,
            locationName: wlLocalities.title,
            cityId: wlCities.cityId,
            cityName: wlCities.title,
        })
        .from(wlLocalities)
        .innerJoin(wlCities, eq(wlCities.cityId, wlLocalities.cityId))
        .where(and(eq(wlLocalities.status, "1"), eq(wlCities.status, "1"), condition))
        .orderBy(asc(wlCities.title), asc(wlLocalities.title))

const findActiveLocations = async () => activeLocationsQuery()

const escapeLike = (value) => value.replace(/[\\%_]/g, (ch) => `\\${ch}`)

const searchActiveLocations = async (term, limit) => {
    const text = `%${escapeLike(term)}%`

    return activeLocationsQuery(or(like(wlLocalities.title, text), like(wlCities.title, text))).limit(limit)
}

const findActiveLocationById = async (locationId) => {
    const rows = await activeLocationsQuery(eq(wlLocalities.locationId, locationId)).limit(1)
    return rows[0] || null
}

// A locality with its city (wl_localities.city_id) and that city's country (wl_cities.country_id), whatever their
// status, so the caller can say which one is missing or unavailable. null when the locality doesn't exist.
const findLocationWithPlace = async (locationId) => {
    const rows = await db
        .select({
            locationId: wlLocalities.locationId,
            locationName: wlLocalities.title,
            locationStatus: wlLocalities.status,
            cityId: wlLocalities.cityId,
            cityName: wlCities.title,
            cityStatus: wlCities.status,
            countryId: wlCountries.id,
            countryName: wlCountries.countryName,
            countryCode: wlCountries.countryIsoCode2,
            countryStatus: wlCountries.status,
        })
        .from(wlLocalities)
        .leftJoin(wlCities, eq(wlCities.cityId, wlLocalities.cityId))
        .leftJoin(wlCountries, eq(wlCountries.id, wlCities.countryId))
        .where(eq(wlLocalities.locationId, locationId))
        .limit(1)

    return rows[0] || null
}

module.exports = { findActiveLocations, searchActiveLocations, findActiveLocationById, findLocationWithPlace }
