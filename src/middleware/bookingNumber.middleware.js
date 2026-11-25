// Every JSON response: wherever an object has a bookingId, a bkNumber ("BK-<bookingId>") is added right after it,
// at any depth (data, nested objects, lists). Nothing else is changed: existing keys and values stay as they are,
// and an object that already has a bkNumber keeps it. An empty bookingId ("" / null) gets an empty bkNumber ("").

const BOOKING_ID = 'bookingId'
const BK_NUMBER = 'bkNumber'

const isPlainObject = (value) => {
    if (value === null || typeof value !== 'object') return false
    const proto = Object.getPrototypeOf(value)
    return proto === Object.prototype || proto === null
}

const bkNumberOf = (bookingId) =>
    (bookingId === null || bookingId === undefined || bookingId === '' ? '' : `BK-${bookingId}`)

// A copy of the value with bkNumber added (the original objects are never changed)
const withBookingNumbers = (value) => {
    if (Array.isArray(value)) return value.map(withBookingNumbers)
    if (!isPlainObject(value)) return value

    const result = {}
    for (const [key, item] of Object.entries(value)) {
        result[key] = withBookingNumbers(item)
        // Right after bookingId, so it reads naturally in the response
        if (key === BOOKING_ID && !Object.prototype.hasOwnProperty.call(value, BK_NUMBER)) {
            result[BK_NUMBER] = bkNumberOf(item)
        }
    }
    return result
}

const bookingNumberMiddleware = (req, res, next) => {
    const json = res.json.bind(res)
    res.json = (body) => json(withBookingNumbers(body))
    next()
}

module.exports = { bookingNumberMiddleware, withBookingNumbers }
