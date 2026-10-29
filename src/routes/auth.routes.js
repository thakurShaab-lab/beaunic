const express = require('express')
const { register, login, verifyOtp, resendOtp, accountStatus } = require('../controllers/auth.controller')
const { jwtAuthMiddleware, deviceAuthMiddleware} = require('../middleware/auth.middleware')
const upload = require('../utils/imageUpload')

const router = express.Router()

router.post('/register', upload.single('logo'), register)
router.post('/login', deviceAuthMiddleware, login)
router.post('/verify-otp', deviceAuthMiddleware, verifyOtp)
router.post('/resend-otp', deviceAuthMiddleware, resendOtp)
router.post('/account-status', deviceAuthMiddleware, accountStatus)

module.exports = router