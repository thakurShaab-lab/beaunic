const express = require('express')
const { getPaymentReport } = require('../controllers/paymentReport.controller')
const { jwtAuthMiddleware, deviceAuthMiddleware } = require('../middleware/auth.middleware')
const { parsePayload } = require('../middleware/payload.middleware')

const router = express.Router()

// Salon Partners only: the "Payment Report" screen (This week / This month / All, Sort: Newest / Amount)
router.post('/report', jwtAuthMiddleware, parsePayload(), deviceAuthMiddleware, getPaymentReport)

module.exports = router
