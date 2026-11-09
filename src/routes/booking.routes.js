const express = require('express')
const { createBooking, getBookingSummary } = require('../controllers/booking.controller')
const { jwtAuthMiddleware, deviceAuthMiddleware } = require('../middleware/auth.middleware')
const { parsePayload } = require('../middleware/payload.middleware')

const router = express.Router()

router.post('/summary', jwtAuthMiddleware, parsePayload(), deviceAuthMiddleware, getBookingSummary)
router.post('/create', jwtAuthMiddleware, parsePayload(), deviceAuthMiddleware, createBooking)

module.exports = router
