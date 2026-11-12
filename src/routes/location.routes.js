const express = require('express')
const { getLocations, saveLocation } = require('../controllers/location.controller')
const { listCountries, listCities } = require('../controllers/geo.controller')
const { jwtAuthMiddleware, deviceAuthMiddleware } = require('../middleware/auth.middleware')
const { parsePayload } = require('../middleware/payload.middleware')

const router = express.Router()

router.post('/list', parsePayload(), deviceAuthMiddleware, getLocations)
router.post('/save', jwtAuthMiddleware, parsePayload(), deviceAuthMiddleware, saveLocation)
// Country and city dropdowns: Salon Partners only (logged in)
router.post('/countries', jwtAuthMiddleware, parsePayload(), deviceAuthMiddleware, listCountries)
router.post('/cities', jwtAuthMiddleware, parsePayload(), deviceAuthMiddleware, listCities)

module.exports = router