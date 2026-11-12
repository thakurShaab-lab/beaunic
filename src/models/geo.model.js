const { eq, and, asc, like, count } = require("drizzle-orm")
const db = require("../config/drizzle")
const { wlCountries } = require("../schema/wl-countries")
const { wlCities } = require("../schema/wl-cities")

// wl_countries.status / wl_cities.status: 1=Active, 0=Inactive, 2=Deleted. Only active ones are listed.

// "50%_off" -> "50\%\_off", so LIKE matches the text literally
const escapeLike = (value) => value.replace(/[\\%_]/g, (ch) => `\\${ch}`)

// Active countries A-Z, each with how many active cities it has. search: part of the name (optional).
const findActiveCountries = async ({ search } = {}) =>
    db
        .select({
            countryId: wlCountries.id,
            countryName: wlCountries.countryName,
            isoCode2: wlCountries.countryIsoCode2,
            isoCode3: wlCountries.countryIsoCode3,
            cityCount: count(wlCities.cityId),
        })
        .from(wlCountries)
        .leftJoin(wlCities, and(eq(wlCities.countryId, wlCountries.id), eq(wlCities.status, "1")))
        .where(and(eq(wlCountries.status, "1"), search ? like(wlCountries.countryName, `%${escapeLike(search)}%`) : undefined))
        .groupBy(wlCountries.id, wlCountries.countryName, wlCountries.countryIsoCode2, wlCountries.countryIsoCode3)
        .orderBy(asc(wlCountries.countryName))

const findActiveCountry = async (countryId) => {
    const rows = await db
        .select({ countryId: wlCountries.id, countryName: wlCountries.countryName })
        .from(wlCountries)
        .where(and(eq(wlCountries.id, countryId), eq(wlCountries.status, "1")))
        .limit(1)

    return rows[0] || null
}

// Active cities of one country (wl_cities.country_id -> wl_countries.id) A-Z. search: part of the name (optional).
const findActiveCitiesByCountry = async (countryId, { search } = {}) =>
    db
        .select({ cityId: wlCities.cityId, cityName: wlCities.title, countryId: wlCities.countryId })
        .from(wlCities)
        .where(
            and(
                eq(wlCities.countryId, countryId),
                eq(wlCities.status, "1"),
                search ? like(wlCities.title, `%${escapeLike(search)}%`) : undefined
            )
        )
        .orderBy(asc(wlCities.title))

const findActiveCity = async (cityId) => {
    const rows = await db
        .select({ cityId: wlCities.cityId, cityName: wlCities.title, countryId: wlCities.countryId })
        .from(wlCities)
        .where(and(eq(wlCities.cityId, cityId), eq(wlCities.status, "1")))
        .limit(1)

    return rows[0] || null
}

// Names for a saved country ID and city ID (whatever their status now), for showing a saved address
const findCountryAndCityNames = async (countryId, cityId) => {
    const [country, city] = await Promise.all([
        countryId
            ? db.select({ name: wlCountries.countryName }).from(wlCountries).where(eq(wlCountries.id, countryId)).limit(1)
            : [],
        cityId
            ? db.select({ name: wlCities.title, countryId: wlCities.countryId }).from(wlCities).where(eq(wlCities.cityId, cityId)).limit(1)
            : [],
    ])

    return { countryName: country[0]?.name ?? null, cityName: city[0]?.name ?? null }
}

module.exports = { findActiveCountries, findActiveCountry, findActiveCitiesByCountry, findActiveCity, findCountryAndCityNames }
