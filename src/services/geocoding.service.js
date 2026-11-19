const env = require('../config/env')

// Address -> coordinates. Reusable: give it the parts of an address, get { latitude, longitude } or { error, message }.
// It never throws, so a failed lookup can't break the request that saved the address.
//   errors: incomplete (not enough of the address to find it), not_configured (no provider / API key),
//           not_found (no match, or only a vague one such as a whole state), failed (provider error, timeout)

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

// Google Geocoding API: https://developers.google.com/maps/documentation/geocoding/requests-geocoding
const googleGeocode = async (line, signal) => {
    if (!env.geocoding.googleApiKey) return { error: 'not_configured', message: 'GOOGLE_MAPS_API_KEY is not set' }

    const url = new URL(GOOGLE_URL)
    url.searchParams.set('address', line)
    url.searchParams.set('key', env.geocoding.googleApiKey)
    if (env.geocoding.region) url.searchParams.set('region', env.geocoding.region)

    const response = await fetch(url, { signal })
    if (!response.ok) return { error: 'failed', message: `Geocoding HTTP ${response.status}` }

    const body = await response.json()
    if (body.status === 'ZERO_RESULTS') return { error: 'not_found', message: 'Address not recognised' }
    if (body.status !== 'OK' || !Array.isArray(body.results) || !body.results.length) {
        // OVER_QUERY_LIMIT, REQUEST_DENIED, INVALID_REQUEST, UNKNOWN_ERROR
        return { error: 'failed', message: `Geocoding ${body.status}${body.error_message ? `: ${body.error_message}` : ''}` }
    }

    const [result] = body.results
    const types = result.types || []
    // A whole state / district, or a partial match that only found the city: not precise enough for "nearby"
    if (types.some((type) => TOO_VAGUE_TYPES.has(type)) || (result.partial_match && types.includes('locality'))) {
        return { error: 'not_found', message: 'Address too vague to locate' }
    }

    const latitude = Number(result.geometry?.location?.lat)
    const longitude = Number(result.geometry?.location?.lng)
    if (!isValidPoint(latitude, longitude)) return { error: 'failed', message: 'Geocoding returned invalid coordinates' }

    return { latitude, longitude, formattedAddress: result.formatted_address || null, accuracy: result.geometry.location_type || null }
}

const PROVIDERS = { google: googleGeocode }

// parts: { address, area, city, state, pinCode, country } (any may be missing)
const geocodeAddress = async (parts) => {
    if (!isComplete(parts)) return { error: 'incomplete', message: 'Address is incomplete' }

    const provider = PROVIDERS[env.geocoding.provider]
    if (!provider) return { error: 'not_configured', message: `Geocoding provider "${env.geocoding.provider}" is not available` }

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), env.geocoding.timeoutMs)
    try {
        return await provider(addressLine(parts), controller.signal)
    } catch (err) {
        return { error: 'failed', message: err.name === 'AbortError' ? 'Geocoding timed out' : err.message }
    } finally {
        clearTimeout(timer)
    }
}

module.exports = { geocodeAddress, addressLine, isComplete, isValidPoint }