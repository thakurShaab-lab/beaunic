const crypto = require('crypto')
const env = require('../config/env')

// Share links: {base}/share/service/{serviceId}-{slug}?ref={token}. Only the ID is used to find the service, so a
// link stays valid (and points to the same service) even after the service is renamed. Nothing is stored for a link.
const SHARE_PATH = '/share/service'

// "Hair & Care" -> "hair-and-care"
const slugify = (text) =>
    String(text || '')
        .toLowerCase()
        .replace(/&/g, ' and ')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 60) || 'service'

// SHARE_BASE_URL, else the address the request came in on
const shareBaseUrl = (req) => (env.shareBaseUrl || `${req.protocol}://${req.get('host')}`).replace(/\/+$/, '')

// Deterministic share token: the same service always gets the same 12-character token (SHA-256 of "service:{id}")
const serviceShareToken = (serviceId) =>
    crypto.createHash('sha256').update(`service:${serviceId}`).digest('hex').substring(0, 12)

// The service's share code, the {code} in /share/service/{code}: "12-hair-and-care"
const serviceShareCode = ({ serviceId, serviceName }) => `${serviceId}-${slugify(serviceName)}`

// The permanent, public link to a service: one link for every platform
const serviceShareUrl = (req, service) =>
    `${shareBaseUrl(req)}${SHARE_PATH}/${serviceShareCode(service)}?ref=${serviceShareToken(service.serviceId)}`

// The exact address this request was made to (protocol, host and path with its query string). Behind Apache the
// app is served under a path (/beaunic) that Node never sees, so SHARE_BASE_URL (which includes it) is used when set.
const requestUrl = (req) => `${shareBaseUrl(req)}${req.originalUrl}`

// Shown when a service has no image
const noImageUrl = () => `${env.staticFileBaseUrl.replace(/\/+$/, '')}/no-image.png`

// "12-hair-and-care", "12" -> 12; anything else -> null
const SHARE_CODE = /^(\d{1,10})(?:-[a-z0-9-]{0,120})?$/
const serviceIdFromShareCode = (code) => {
    const match = SHARE_CODE.exec(String(code || '').toLowerCase())
    return match ? Number(match[1]) : null
}

module.exports = { serviceShareUrl, serviceShareToken, serviceShareCode, serviceIdFromShareCode, requestUrl, noImageUrl, slugify }
