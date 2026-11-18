const express = require('express')
const { listRefunds, processRefund, getRefundDetails } = require('../controllers/refund.controller')
const { jwtAuthMiddleware, deviceAuthMiddleware } = require('../middleware/auth.middleware')
const { parsePayload } = require('../middleware/payload.middleware')

const router = express.Router()

// Salon Partners only: the "Refunds" screen (All / Pending / Processed)
router.post('/list', jwtAuthMiddleware, parsePayload(), deviceAuthMiddleware, listRefunds)

// "Upload Slip & Mark Processed" / "Mark as Processed": slip image in the "transactionSlip" file field
router.post('/process', jwtAuthMiddleware, parsePayload('transactionSlip'), deviceAuthMiddleware, processRefund)

// "Transaction Slip" details
router.post('/details', jwtAuthMiddleware, parsePayload(), deviceAuthMiddleware, getRefundDetails)

module.exports = router
