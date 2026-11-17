const express = require('express')
const { search } = require('../controllers/search.controller')
const { jwtAuthMiddleware, deviceAuthMiddleware } = require('../middleware/auth.middleware')
const { parsePayload } = require('../middleware/payload.middleware')

const router = express.Router()

// One search for both apps: customer scope (services, salons, products) and, for Salon Partners only,
// partner scope (own services, products, bookings, customers)
router.post('/', jwtAuthMiddleware, parsePayload(), deviceAuthMiddleware, search)

module.exports = router
