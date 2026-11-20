const express = require('express')
const { getLocations, saveLocation, getRecentLocations } = require('../controllers/location.controller')
const { listCountries, listCities } = require('../controllers/geo.controller')
const { jwtAuthMiddleware, optionalJwtAuthMiddleware, deviceAuthMiddleware } = require('../middleware/auth.middleware')
const { parsePayload } = require('../middleware/payload.middleware')

const router = express.Router()

router.post('/list', parsePayload(), deviceAuthMiddleware, getLocations)
// Login optional: saved to the logged-in User, or (no token) to the User of this app_id + device_id, created if new
router.post('/save', optionalJwtAuthMiddleware, parsePayload(), deviceAuthMiddleware, saveLocation)
// "Recent Locations" (Users): the customer's last chosen locations, newest first
router.post('/recent', jwtAuthMiddleware, parsePayload(), deviceAuthMiddleware, getRecentLocations)
// Country and city dropdowns: Salon Partners only (logged in)
router.post('/countries', jwtAuthMiddleware, parsePayload(), deviceAuthMiddleware, listCountries)
router.post('/cities', jwtAuthMiddleware, parsePayload(), deviceAuthMiddleware, listCities)

module.exports = router