const express = require('express')
const { createBooking, getBookingSummary, getPaymentMethods, payForBooking, cancelBooking, rescheduleBooking, listBookings, getBookingDetails, listBookingRequests, respondBookingRequest, recordBookingPayment, listSalonBookings, getSalonBookingDetails, updateSalonBookingStatus, listCancellationRequests } = require('../controllers/booking.controller')
const { jwtAuthMiddleware, deviceAuthMiddleware } = require('../middleware/auth.middleware')
const { parsePayload } = require('../middleware/payload.middleware')

const router = express.Router()

// Users (customer_type 2)
router.post('/summary', jwtAuthMiddleware, parsePayload(), deviceAuthMiddleware, getBookingSummary)
// Step 4 'Payment Method': wallet balance, payment options and the amount; then 'PAY NOW'
router.post('/payment-methods', jwtAuthMiddleware, parsePayload(), deviceAuthMiddleware, getPaymentMethods)
router.post('/pay', jwtAuthMiddleware, parsePayload(), deviceAuthMiddleware, payForBooking)
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
router.post('/partner/details', jwtAuthMiddleware, parsePayload(), deviceAuthMiddleware, getSalonBookingDetails)
router.post('/partner/status', jwtAuthMiddleware, parsePayload(), deviceAuthMiddleware, updateSalonBookingStatus)
// 'Cancellation Requests': the customers' cancellation requests for the partner's own salon
router.post('/partner/cancellation-requests', jwtAuthMiddleware, parsePayload(), deviceAuthMiddleware, listCancellationRequests)

module.exports = router