const express = require('express')
const { getWalletDetails, addMoney, getPartnerWallet, addPartnerMoney } = require('../controllers/wallet.controller')
const { jwtAuthMiddleware, deviceAuthMiddleware } = require('../middleware/auth.middleware')
const { parsePayload } = require('../middleware/payload.middleware')

const router = express.Router()

router.post('/details', jwtAuthMiddleware, parsePayload(), deviceAuthMiddleware, getWalletDetails)
router.post('/add-money', jwtAuthMiddleware, parsePayload(), deviceAuthMiddleware, addMoney)

// Salon Partners only: "My Wallet" and its Add Money sheet
router.post('/partner/details', jwtAuthMiddleware, parsePayload(), deviceAuthMiddleware, getPartnerWallet)
router.post('/partner/add-money', jwtAuthMiddleware, parsePayload(), deviceAuthMiddleware, addPartnerMoney)

module.exports = router
