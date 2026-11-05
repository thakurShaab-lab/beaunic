const express = require('express')
const { createBooking } = require('../controllers/booking.controller')
const { jwtAuthMiddleware, deviceAuthMiddleware } = require('../middleware/auth.middleware')
const { parsePayload } = require('../middleware/payload.middleware')

const router = express.Router()

router.post('/create', jwtAuthMiddleware, parsePayload(), deviceAuthMiddleware, createBooking)

module.exports = router
