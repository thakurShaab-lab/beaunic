const express = require('express')
const { getProfile, getPartnerProfile, updateProfile, changePassword } = require('../controllers/profile.controller')
const { jwtAuthMiddleware, deviceAuthMiddleware } = require('../middleware/auth.middleware')
const { parsePayload } = require('../middleware/payload.middleware')

const router = express.Router()

router.post('/details', jwtAuthMiddleware, parsePayload(), deviceAuthMiddleware, getProfile)
// Salon Partners: 'My Salon Profile'
router.post('/partner/details', jwtAuthMiddleware, parsePayload(), deviceAuthMiddleware, getPartnerProfile)
router.post('/update', jwtAuthMiddleware, parsePayload('logo'), deviceAuthMiddleware, updateProfile)
router.post('/change-password', jwtAuthMiddleware, parsePayload(), deviceAuthMiddleware, changePassword)

module.exports = router
