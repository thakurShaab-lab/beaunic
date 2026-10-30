const express = require('express')
const { getLocations, saveLocation } = require('../controllers/location.controller')
const { jwtAuthMiddleware, deviceAuthMiddleware } = require('../middleware/auth.middleware')
const { parsePayload } = require('../middleware/payload.middleware')

const router = express.Router()

router.post('/list', parsePayload(), deviceAuthMiddleware, getLocations)
router.post('/save', jwtAuthMiddleware, parsePayload(), deviceAuthMiddleware, saveLocation)

module.exports = router