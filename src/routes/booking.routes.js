const express = require('express')
const { createBooking, getBookingSummary, cancelBooking, rescheduleBooking, listBookings, getBookingDetails } = require('../controllers/booking.controller')
const { jwtAuthMiddleware, deviceAuthMiddleware } = require('../middleware/auth.middleware')
const { parsePayload } = require('../middleware/payload.middleware')

const router = express.Router()

router.post('/summary', jwtAuthMiddleware, parsePayload(), deviceAuthMiddleware, getBookingSummary)
router.post('/cancel', jwtAuthMiddleware, parsePayload(), deviceAuthMiddleware, cancelBooking)
router.post('/reschedule', jwtAuthMiddleware, parsePayload(), deviceAuthMiddleware, rescheduleBooking)
router.post('/create', jwtAuthMiddleware, parsePayload(), deviceAuthMiddleware, createBooking)
router.post('/list', jwtAuthMiddleware, parsePayload(), deviceAuthMiddleware, listBookings)
router.post('/details', jwtAuthMiddleware, parsePayload(), deviceAuthMiddleware, getBookingDetails)

module.exports = router