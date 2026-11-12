const serviceModel = require('../models/service.model')
const { withImageUrls, rupees } = require('./service.controller')
const { convertNulls } = require('../utils/convertNulls')
const { serviceShareUrl: shareUrlFor, serviceIdFromShareCode: serviceIdFromCode, noImageUrl } = require('../utils/shareUrl')

// The public pages a share link opens (the link itself is share_url in /service/details).
const DESCRIPTION_LENGTH = 160

// One line of plain text for previews: no line breaks, trimmed to 160 characters
const shortDescription = (text) => {
    const plain = String(text || '').replace(/\s+/g, ' ').trim()
    return plain.length > DESCRIPTION_LENGTH ? `${plain.slice(0, DESCRIPTION_LENGTH - 1).trimEnd()}…` : plain
}

// A service that can be shared and opened: active, of an active, approved salon. Returns null otherwise.
const findShareableService = async (req, serviceId) => {
    const service = await serviceModel.findActiveServiceWithSalon(serviceId)
    if (!service || service.salonCustomerType !== '1' || service.salonStatus !== '1') return null

    const media = await withImageUrls(req, await serviceModel.findServiceMedia(serviceId))
    const cover = media.find((row) => row.isDefault === 'Y' && row.url) || media.find((row) => row.url)

    return {
        serviceId: service.serviceId,
        serviceName: service.serviceName,
        title: service.salonName ? `${service.serviceName} at ${service.salonName}` : service.serviceName,
        description: shortDescription(service.serviceDescription) || `Book ${service.serviceName} on Beaunic.`,
        thumbnail: cover ? cover.url : null,
        salonId: service.customerId,
        salonName: service.salonName,
        categoryName: service.categoryName,
        price: service.servicePrice !== null ? Number(service.servicePrice) : null,
        priceLabel: service.servicePrice !== null ? rupees(service.servicePrice) : null,
        durationLabel: service.durationName || null,
    }
}

// Public: what a share link points to, as JSON (the app opens the right service from it). No login needed.
const getSharedService = async (req, res) => {
    const serviceId = serviceIdFromCode(req.params.code)
    if (!serviceId) return res.status(200).json({ success: false, message: 'Invalid share link.' })

    try {
        const service = await findShareableService(req, serviceId)
        if (!service) return res.status(200).json({ success: false, message: 'This service is no longer available.' })

        const shareUrl = shareUrlFor(req, service)

        return res.status(200).json({
            success: true,
            message: 'Service fetched successfully',
            // What the app puts in the share sheet: link, title, description (max 160 characters) and image
            share: {
                url: shareUrl,
                title: service.serviceName,
                description: service.description,
                image: service.thumbnail || noImageUrl(),
            },
            // salonId + serviceId are what /service/details needs
            data: convertNulls({ ...service, shareUrl }),
        })
    } catch (err) {
        console.error('Shared service error:', err)
        return res.status(200).json({ success: false, message: 'Something went wrong' })
    }
}

// Every value placed in the page is escaped
const escapeHtml = (value) =>
    String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]))

const page = ({ title, description, image, url, body }) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(description)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Beaunic">
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(description)}">
${url ? `<meta property="og:url" content="${escapeHtml(url)}">` : ''}
${image ? `<meta property="og:image" content="${escapeHtml(image)}">` : ''}
<meta name="twitter:card" content="${image ? 'summary_large_image' : 'summary'}">
<meta name="twitter:title" content="${escapeHtml(title)}">
<meta name="twitter:description" content="${escapeHtml(description)}">
${image ? `<meta name="twitter:image" content="${escapeHtml(image)}">` : ''}
<style>
body{margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#f7f5f0;color:#1a1a1a}
main{max-width:480px;margin:0 auto;padding:24px 16px}
img{width:100%;border-radius:16px;object-fit:cover;max-height:280px;background:#eee}
h1{font-size:22px;margin:16px 0 4px}
.salon{color:#8a6d2b;font-weight:600;margin:0 0 12px}
.meta{font-weight:600;margin:0 0 12px}
p{line-height:1.5}
.brand{font-weight:700;letter-spacing:2px;color:#8a6d2b;margin-bottom:16px}
</style>
</head>
<body><main><div class="brand">BEAUNIC</div>${body}</main></body>
</html>`

// Public: the page a share link opens (in WhatsApp, a browser, …), with link-preview tags. No login needed.
const showSharedServicePage = async (req, res) => {
    res.set('Cache-Control', 'public, max-age=300')
    // No scripts at all; images from https only (the thumbnail lives on the uploads server); just the inline styles
    res.set('Content-Security-Policy', "default-src 'none'; img-src https: data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'")
    const notFound = (message) =>
        res.status(404).type('html').send(page({
            title: 'Service not available · Beaunic',
            description: message,
            body: `<h1>Service not available</h1><p>${escapeHtml(message)}</p>`,
        }))

    const serviceId = serviceIdFromCode(req.params.code)
    if (!serviceId) return notFound('This share link is not valid.')

    try {
        const service = await findShareableService(req, serviceId)
        if (!service) return notFound('This service has been removed or is no longer available.')

        const meta = [service.priceLabel, service.durationLabel, service.categoryName].filter(Boolean).join(' · ')
        return res.status(200).type('html').send(page({
            title: `${service.title} · Beaunic`,
            description: service.description,
            image: service.thumbnail,
            url: shareUrlFor(req, service),
            body: `${service.thumbnail ? `<img src="${escapeHtml(service.thumbnail)}" alt="${escapeHtml(service.serviceName)}">` : ''}
<h1>${escapeHtml(service.serviceName)}</h1>
${service.salonName ? `<div class="salon">${escapeHtml(service.salonName)}</div>` : ''}
${meta ? `<div class="meta">${escapeHtml(meta)}</div>` : ''}
<p>${escapeHtml(service.description)}</p>
<p>Open the Beaunic app to book this service.</p>`,
        }))
    } catch (err) {
        console.error('Shared service page error:', err)
        return res.status(500).type('html').send(page({ title: 'Beaunic', description: 'Something went wrong', body: '<h1>Something went wrong</h1><p>Please try again later.</p>' }))
    }
}

module.exports = { getSharedService, showSharedServicePage }