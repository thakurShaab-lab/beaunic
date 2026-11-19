const express = require('express')
const { getNearbySalons, getSalonDetails, getSalonReviews } = require('../controllers/salon.controller')
const { jwtAuthMiddleware, deviceAuthMiddleware } = require('../middleware/auth.middleware')
const { parsePayload, normaliseObject } = require('../middleware/payload.middleware')

const router = express.Router()

// GET requests carry everything in the query string (app_id and device_id too, or the x-app-id / x-device-id
// headers); it is handled exactly like a POST body
const queryAsBody = (req, res, next) => {
    req.body = normaliseObject({
        ...req.query,
        ...(req.body?.app_id === undefined && req.headers['x-app-id'] && { app_id: req.headers['x-app-id'] }),
        ...(req.body?.device_id === undefined && req.headers['x-device-id'] && { device_id: req.headers['x-device-id'] }),
    })
    next()
}

// "Nearby Salons": latitude + longitude (live GPS) or addressId (a saved address); radius, area, categoryId,
// minRating, page, limit optional
router.get('/nearby', jwtAuthMiddleware, queryAsBody, deviceAuthMiddleware, getNearbySalons)
router.post('/nearby', jwtAuthMiddleware, parsePayload(), deviceAuthMiddleware, getNearbySalons)
// The selected salon: salonId, and optionally the same location fields (for the distance)
router.get('/details', jwtAuthMiddleware, queryAsBody, deviceAuthMiddleware, getSalonDetails)
router.post('/details', jwtAuthMiddleware, parsePayload(), deviceAuthMiddleware, getSalonDetails)
// The Reviews tab, further pages: salonId, page, limit
router.get('/reviews', jwtAuthMiddleware, queryAsBody, deviceAuthMiddleware, getSalonReviews)
router.post('/reviews', jwtAuthMiddleware, parsePayload(), deviceAuthMiddleware, getSalonReviews)

module.exports = router
