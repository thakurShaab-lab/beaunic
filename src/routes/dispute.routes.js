const express = require('express')
const { getRelatedOptions, addDispute, listDisputes, getDisputeDetails } = require('../controllers/dispute.controller')
const { jwtAuthMiddleware, deviceAuthMiddleware } = require('../middleware/auth.middleware')
const { parsePayload } = require('../middleware/payload.middleware')

const router = express.Router()

// Salon Partners only: "Raise a Dispute" and "Dispute History"
router.post('/related-options', jwtAuthMiddleware, parsePayload(), deviceAuthMiddleware, getRelatedOptions)
router.post('/add', jwtAuthMiddleware, parsePayload(), deviceAuthMiddleware, addDispute)
router.post('/list', jwtAuthMiddleware, parsePayload(), deviceAuthMiddleware, listDisputes)
router.post('/details', jwtAuthMiddleware, parsePayload(), deviceAuthMiddleware, getDisputeDetails)

module.exports = router
