const express = require('express')
const {
    createBooking,
    getBookingSummary,
    cancelBooking,
    rescheduleBooking,
    listBookings,
    getBookingDetails,
    listBookingRequests,
    respondBookingRequest,
    recordBookingPayment,
    listSalonBookings,
} = require('../controllers/booking.controller')
const { jwtAuthMiddleware, deviceAuthMiddleware } = require('../middleware/auth.middleware')
const { parsePayload } = require('../middleware/payload.middleware')

const router = express.Router()

// Users (customer_type 2)
router.post('/summary', jwtAuthMiddleware, parsePayload(), deviceAuthMiddleware, getBookingSummary)
router.post('/cancel', jwtAuthMiddleware, parsePayload(), deviceAuthMiddleware, cancelBooking)
router.post('/reschedule', jwtAuthMiddleware, parsePayload(), deviceAuthMiddleware, rescheduleBooking)
router.post('/create', jwtAuthMiddleware, parsePayload(), deviceAuthMiddleware, createBooking)
router.post('/list', jwtAuthMiddleware, parsePayload(), deviceAuthMiddleware, listBookings)
router.post('/details', jwtAuthMiddleware, parsePayload(), deviceAuthMiddleware, getBookingDetails)

// Salon Partners (customer_type 1)
router.post('/requests', jwtAuthMiddleware, parsePayload(), deviceAuthMiddleware, listBookingRequests)
router.post('/request/respond', jwtAuthMiddleware, parsePayload(), deviceAuthMiddleware, respondBookingRequest)
router.post('/payment', jwtAuthMiddleware, parsePayload(), deviceAuthMiddleware, recordBookingPayment)
router.post('/partner/list', jwtAuthMiddleware, parsePayload(), deviceAuthMiddleware, listSalonBookings)

module.exports = router
