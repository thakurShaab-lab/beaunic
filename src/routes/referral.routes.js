const express = require('express')
const { getReferralDetails, applyReferralCode } = require('../controllers/referral.controller')
const { jwtAuthMiddleware, deviceAuthMiddleware } = require('../middleware/auth.middleware')
const { parsePayload } = require('../middleware/payload.middleware')

const router = express.Router()

router.post('/details', jwtAuthMiddleware, parsePayload(), deviceAuthMiddleware, getReferralDetails)
router.post('/apply', jwtAuthMiddleware, parsePayload(), deviceAuthMiddleware, applyReferralCode)

module.exports = router
