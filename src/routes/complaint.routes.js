const express = require('express')
const { addComplaint, listComplaints, listPartnerComplaints, getConversation, replyToComplaint, updateComplaintStatus } = require('../controllers/complaint.controller')
const { jwtAuthMiddleware, deviceAuthMiddleware } = require('../middleware/auth.middleware')
const { parsePayload } = require('../middleware/payload.middleware')

const router = express.Router()

router.post('/add', jwtAuthMiddleware, parsePayload(), deviceAuthMiddleware, addComplaint)
router.post('/list', jwtAuthMiddleware, parsePayload(), deviceAuthMiddleware, listComplaints)
// Salon Partners: the 'Complaints' screen (Open / Resolved tabs)
router.post('/partner/list', jwtAuthMiddleware, parsePayload(), deviceAuthMiddleware, listPartnerComplaints)
router.post('/conversation', jwtAuthMiddleware, parsePayload(), deviceAuthMiddleware, getConversation)
router.post('/reply', jwtAuthMiddleware, parsePayload(), deviceAuthMiddleware, replyToComplaint)
router.post('/status', jwtAuthMiddleware, parsePayload(), deviceAuthMiddleware, updateComplaintStatus)

module.exports = router
