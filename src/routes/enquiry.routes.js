const express = require('express')
const { getEnquiryForm, sendEnquiry, listSalonEnquiries, getSalonEnquiryDetails, replySalonEnquiries, deleteSalonEnquiries } = require('../controllers/enquiry.controller')
const { jwtAuthMiddleware, deviceAuthMiddleware } = require('../middleware/auth.middleware')
const { parsePayload } = require('../middleware/payload.middleware')

const router = express.Router()

router.post('/form', jwtAuthMiddleware, parsePayload(), deviceAuthMiddleware, getEnquiryForm)
router.post('/send', jwtAuthMiddleware, parsePayload(), deviceAuthMiddleware, sendEnquiry)
// Salon Partners: 'Service Enquiries' sent to their own salon
router.post('/partner/list', jwtAuthMiddleware, parsePayload(), deviceAuthMiddleware, listSalonEnquiries)
router.post('/partner/details', jwtAuthMiddleware, parsePayload(), deviceAuthMiddleware, getSalonEnquiryDetails)
// 'Reply' (one enquiryIds) and 'Reply to Selected' (comma-separated enquiryIds)
router.post('/partner/reply', jwtAuthMiddleware, parsePayload(), deviceAuthMiddleware, replySalonEnquiries)
// The bin icon (one) and 'Delete' in selection mode (several)
router.post('/partner/delete', jwtAuthMiddleware, parsePayload(), deviceAuthMiddleware, deleteSalonEnquiries)

module.exports = router
