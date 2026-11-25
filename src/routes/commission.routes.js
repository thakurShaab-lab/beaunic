const express = require('express')
const { listCommissions, listCommissionInvoices, getCommissionInvoice } = require('../controllers/commission.controller')
const { jwtAuthMiddleware, deviceAuthMiddleware } = require('../middleware/auth.middleware')
const { parsePayload } = require('../middleware/payload.middleware')

const router = express.Router()

// Salon Partners only: the commission they owe the admin for their paid bookings
router.post('/list', jwtAuthMiddleware, parsePayload(), deviceAuthMiddleware, listCommissions)
router.post('/invoices', jwtAuthMiddleware, parsePayload(), deviceAuthMiddleware, listCommissionInvoices)
router.post('/invoice/details', jwtAuthMiddleware, parsePayload(), deviceAuthMiddleware, getCommissionInvoice)

module.exports = router
