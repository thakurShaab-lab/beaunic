const express = require('express')
const { register, login, verifyOtp, resendOtp, accountStatus } = require('../controllers/auth.controller')
const { jwtAuthMiddleware, deviceAuthMiddleware} = require('../middleware/auth.middleware')
const { parsePayload } = require('../middleware/payload.middleware')

const router = express.Router()

router.post('/register', parsePayload('logo'), register)
router.post('/login', parsePayload(), deviceAuthMiddleware, login)
router.post('/verify-otp', parsePayload(), deviceAuthMiddleware, verifyOtp)
router.post('/resend-otp', parsePayload(), deviceAuthMiddleware, resendOtp)
router.post('/account-status', parsePayload(), deviceAuthMiddleware, accountStatus)

module.exports = router
