const express = require('express')
const { getHomePage } = require('../controllers/home.controller')
const { getPartnerHome } = require('../controllers/partnerHome.controller')
const { jwtAuthMiddleware, deviceAuthMiddleware } = require('../middleware/auth.middleware')
const { parsePayload } = require('../middleware/payload.middleware')

const router = express.Router()

router.post('/', jwtAuthMiddleware, parsePayload(), deviceAuthMiddleware, getHomePage)
// Salon Partner (customer_type 1) home
router.post('/partner', jwtAuthMiddleware, parsePayload(), deviceAuthMiddleware, getPartnerHome)

module.exports = router
