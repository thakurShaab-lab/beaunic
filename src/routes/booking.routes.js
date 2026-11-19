const express = require('express')
const { createBooking, getBookingSummary, getPaymentMethods, payForBooking, getBookingSuccess, getCancelOptions, cancelBooking, rescheduleBooking, listBookings, getBookingDetails, listBookingRequests, respondBookingRequest, recordBookingPayment, listSalonBookings, getSalonBookingDetails, updateSalonBookingStatus, listCancellationRequests, getRescheduleRequestDetails, getCancellationRequestDetails } = require('../controllers/booking.controller')
const { jwtAuthMiddleware, deviceAuthMiddleware } = require('../middleware/auth.middleware')
const { parsePayload } = require('../middleware/payload.middleware')
const offline = require('../controllers/offlineBooking.controller')

const router = express.Router()

// Users (customer_type 2)
router.post('/summary', jwtAuthMiddleware, parsePayload(), deviceAuthMiddleware, getBookingSummary)
// Step 4 'Payment Method': wallet balance, payment options and the amount; then 'PAY NOW'
router.post('/payment-methods', jwtAuthMiddleware, parsePayload(), deviceAuthMiddleware, getPaymentMethods)
router.post('/pay', jwtAuthMiddleware, parsePayload(), deviceAuthMiddleware, payForBooking)
// 'Booking Successful' screen after payment
router.post('/success', jwtAuthMiddleware, parsePayload(), deviceAuthMiddleware, getBookingSuccess)
// The Cancel Booking screen: booking card, reasons, policy, refund methods
router.post('/cancel-options', jwtAuthMiddleware, parsePayload(), deviceAuthMiddleware, getCancelOptions)
router.post('/cancel', jwtAuthMiddleware, parsePayload(), deviceAuthMiddleware, cancelBooking)
router.post('/reschedule', jwtAuthMiddleware, parsePayload(), deviceAuthMiddleware, rescheduleBooking)
router.post('/create', jwtAuthMiddleware, parsePayload(), deviceAuthMiddleware, createBooking)
router.post('/list', jwtAuthMiddleware, parsePayload(), deviceAuthMiddleware, listBookings)
router.post('/details', jwtAuthMiddleware, parsePayload(), deviceAuthMiddleware, getBookingDetails)
// 'Invoice' sheet and 'Download Invoice' (a PDF file)

// Salon Partners (customer_type 1)
router.post('/requests', jwtAuthMiddleware, parsePayload(), deviceAuthMiddleware, listBookingRequests)
router.post('/requests/respond', jwtAuthMiddleware, parsePayload(), deviceAuthMiddleware, respondBookingRequest)
router.post('/payment', jwtAuthMiddleware, parsePayload(), deviceAuthMiddleware, recordBookingPayment)
router.post('/partner/list', jwtAuthMiddleware, parsePayload(), deviceAuthMiddleware, listSalonBookings)
router.post('/partner/details', jwtAuthMiddleware, parsePayload(), deviceAuthMiddleware, getSalonBookingDetails)
router.post('/partner/status', jwtAuthMiddleware, parsePayload(), deviceAuthMiddleware, updateSalonBookingStatus)
// 'Cancellation Requests': the customers' cancellation requests for the partner's own salon
router.post('/partner/cancellation-requests', jwtAuthMiddleware, parsePayload(), deviceAuthMiddleware, listCancellationRequests)
// 'Cancellation Details': one booking's cancellation request (Approved / Rejected via /requests/respond)
router.post('/partner/cancellation-request', jwtAuthMiddleware, parsePayload(), deviceAuthMiddleware, getCancellationRequestDetails)
// 'Reschedule Request': one booking's reschedule request (Approve / Reject via /requests/respond)
router.post('/partner/reschedule-request', jwtAuthMiddleware, parsePayload(), deviceAuthMiddleware, getRescheduleRequestDetails)

// 'Offline Client Order' (Salon Partners only), 4 steps; every response has steps [{ step, status }] and currentStep
const offlineRoute = (path, handler) => router.post(`/offline/${path}`, jwtAuthMiddleware, parsePayload(), deviceAuthMiddleware, handler)
offlineRoute('client', offline.saveClient)            // Step 1: client name + mobile (starts the offline booking)
offlineRoute('services', offline.listServices)        // Step 2: the services to choose from
offlineRoute('service', offline.saveService)          // Step 2: NEXT
offlineRoute('slots', offline.listSlots)              // Step 3: date strip + time slots
offlineRoute('slot', offline.saveSlot)                // Step 3: NEXT
offlineRoute('details', offline.getOfflineBooking)    // Step 4 'Order Summary', or resume at any step
offlineRoute('confirm', offline.confirmBooking)       // Step 4: CREATE ORDER (payment mode)
offlineRoute('list', offline.listOfflineBookings)     // Drafts to resume and confirmed offline bookings

module.exports = router