const env = require('../config/env')

// Address <-> coordinates. Reusable and never throws, so a failed lookup can't break the request it serves.
//   geocodeAddress(parts)                -> { latitude, longitude, formattedAddress, accuracy, components } or { error, message }
//   reverseGeocode(latitude, longitude)  -> { formattedAddress, components } or { error, message }
//   errors: incomplete (not enough to look up / no usable address found), not_configured (no provider / API key),
//           not_found (no match, or only a vague one such as a whole state), failed (provider error, timeout)
//   components: { streetNumber, route, premise, neighborhood, sublocality1..3, locality, district (admin 2),
//                 subDistrict (admin 3), state (admin 1), country, countryCode, postalCode }

const GOOGLE_URL = 'https://maps.googleapis.com/maps/api/geocode/json'

// Matches this vague would put a salon at the middle of a country, state or district: never saved
const TOO_VAGUE_TYPES = new Set(['country', 'administrative_area_level_1', 'administrative_area_level_2'])

const clean = (value) => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '')

// "Sector 15, Noida, Uttar Pradesh 201301, India": the parts in order, blanks and repeats left out
const addressLine = ({ address, area, city, state, pinCode, country }) => {
    const seen = new Set()
    const parts = []
    for (const part of [address, area, city, state, pinCode, country].map(clean)) {
        if (!part || seen.has(part.toLowerCase())) continue
        seen.add(part.toLowerCase())
        parts.push(part)
    }
    return parts.join(', ')
}

// Enough to find a place: a PIN code, or an address line with its area / city
const isComplete = ({ address, area, city, pinCode }) =>
    Boolean(clean(pinCode) || (clean(address) && (clean(area) || clean(city))))

const isValidPoint = (latitude, longitude) =>
    Number.isFinite(latitude) && Number.isFinite(longitude) &&
    latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180

const COMPONENT_TYPES = {
    streetNumber: 'street_number',
    route: 'route',
    premise: 'premise',
    neighborhood: 'neighborhood',
    sublocality1: 'sublocality_level_1',
    sublocality2: 'sublocality_level_2',
    sublocality3: 'sublocality_level_3',
    locality: 'locality',
    subDistrict: 'administrative_area_level_3',
    district: 'administrative_area_level_2',
    state: 'administrative_area_level_1',
    country: 'country',
    postalCode: 'postal_code',
}

// Google's address_components as named parts (long names; the country's 2-letter code as countryCode)
const parseComponents = (addressComponents) => {
    const list = Array.isArray(addressComponents) ? addressComponents : []
    const parts = {}
    for (const [key, type] of Object.entries(COMPONENT_TYPES)) {
        const found = list.find((component) => Array.isArray(component.types) && component.types.includes(type))
        parts[key] = found ? clean(found.long_name) || null : null
        if (key === 'country') parts.countryCode = found ? clean(found.short_name).toUpperCase() || null : null
    }
    return parts
}

// One Geocoding API call (https://developers.google.com/maps/documentation/geocoding/requests-geocoding)
// -> { results } or { error, message }
const googleRequest = async (params, signal) => {
    if (!env.geocoding.googleApiKey) return { error: 'not_configured', message: 'GOOGLE_MAPS_API_KEY is not set' }

    const url = new URL(GOOGLE_URL)
    for (const [key, value] of Object.entries(params)) if (value) url.searchParams.set(key, value)
    url.searchParams.set('key', env.geocoding.googleApiKey)

    const response = await fetch(url, { signal })
    if (!response.ok) return { error: 'failed', message: `Geocoding HTTP ${response.status}` }

    const body = await response.json()
    if (body.status === 'ZERO_RESULTS') return { error: 'not_found', message: 'Address not recognised' }
    if (body.status !== 'OK' || !Array.isArray(body.results) || !body.results.length) {
        // OVER_QUERY_LIMIT, REQUEST_DENIED, INVALID_REQUEST, UNKNOWN_ERROR
        return { error: 'failed', message: `Geocoding ${body.status}${body.error_message ? `: ${body.error_message}` : ''}` }
    }

    return { results: body.results }
}

// options.allowLocality: a match that only found the town / locality is good enough (a customer picking a
// serviceable locality); otherwise it is too vague (a salon's own address).
// options.countryCode: only matches in that country (ISO 3166 2-letter code)
const googleGeocode = async (line, signal, { allowLocality = false, countryCode } = {}) => {
    const reply = await googleRequest({
        address: line,
        region: env.geocoding.region,
        components: countryCode ? `country:${countryCode}` : null,
    }, signal)
    if (reply.error) return reply

    const [result] = reply.results
    const types = result.types || []
    // A whole state / district, or (unless allowed) a partial match that only found the city: not precise enough
    if (types.some((type) => TOO_VAGUE_TYPES.has(type)) || (!allowLocality && result.partial_match && types.includes('locality'))) {
        return { error: 'not_found', message: 'Address too vague to locate' }
    }

    const components = parseComponents(result.address_components)
    if (countryCode && components.countryCode && components.countryCode !== countryCode.toUpperCase()) {
        return { error: 'not_found', message: 'Address found in another country' }
    }

    const latitude = Number(result.geometry?.location?.lat)
    const longitude = Number(result.geometry?.location?.lng)
    if (!isValidPoint(latitude, longitude)) return { error: 'failed', message: 'Geocoding returned invalid coordinates' }

    return { latitude, longitude, formattedAddress: result.formatted_address || null, accuracy: result.geometry.location_type || null, components }
}

// The address at a point. Google lists results from most to least precise; the first real address (not a bare
// plus code) is used, and parts it lacks (often the PIN code) are taken from the broader results.
const googleReverseGeocode = async (latitude, longitude, signal) => {
    const reply = await googleRequest({ latlng: `${latitude},${longitude}` }, signal)
    if (reply.error) return reply

    const results = reply.results.filter((result) => !(result.types || []).includes('plus_code'))
    if (!results.length) return { error: 'not_found', message: 'No address at this location' }

    const components = parseComponents(results[0].address_components)
    for (const result of results.slice(1)) {
        const more = parseComponents(result.address_components)
        for (const key of Object.keys(components)) if (!components[key] && more[key]) components[key] = more[key]
    }

    return { formattedAddress: results[0].formatted_address || null, components }
}

const PROVIDERS = { google: { geocode: googleGeocode, reverse: googleReverseGeocode } }

// Runs a provider call with the configured timeout; never throws
const withProvider = async (method, run) => {
    const provider = PROVIDERS[env.geocoding.provider]
    if (!provider) return { error: 'not_configured', message: `Geocoding provider "${env.geocoding.provider}" is not available` }

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), env.geocoding.timeoutMs)
    try {
        return await run(provider[method], controller.signal)
    } catch (err) {
        return { error: 'failed', message: err.name === 'AbortError' ? 'Geocoding timed out' : err.message }
    } finally {
        clearTimeout(timer)
    }
}

// parts: { address, area, city, state, pinCode, country } (any may be missing); options: see googleGeocode
const geocodeAddress = async (parts, options = {}) => {
    if (!isComplete(parts)) return { error: 'incomplete', message: 'Address is incomplete' }
    return withProvider('geocode', (geocode, signal) => geocode(addressLine(parts), signal, options))
}

const reverseGeocode = async (latitude, longitude) => {
    if (!isValidPoint(latitude, longitude)) return { error: 'incomplete', message: 'Invalid coordinates' }
    return withProvider('reverse', (reverse, signal) => reverse(latitude, longitude, signal))
}

module.exports = { geocodeAddress, reverseGeocode, parseComponents, addressLine, isComplete, isValidPoint }
