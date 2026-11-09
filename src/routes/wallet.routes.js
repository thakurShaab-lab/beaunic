const express = require('express')
const { getWalletDetails, addMoney } = require('../controllers/wallet.controller')
const { jwtAuthMiddleware, deviceAuthMiddleware } = require('../middleware/auth.middleware')
const { parsePayload } = require('../middleware/payload.middleware')

const router = express.Router()

router.post('/details', jwtAuthMiddleware, parsePayload(), deviceAuthMiddleware, getWalletDetails)
router.post('/add-money', jwtAuthMiddleware, parsePayload(), deviceAuthMiddleware, addMoney)

module.exports = router
