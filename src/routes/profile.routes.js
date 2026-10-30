const express = require('express')
const { getProfile, updateProfile, changePassword } = require('../controllers/profile.controller')
const { jwtAuthMiddleware, deviceAuthMiddleware } = require('../middleware/auth.middleware')
const { parsePayload } = require('../middleware/payload.middleware')

const router = express.Router()

router.post('/details', jwtAuthMiddleware, parsePayload(), deviceAuthMiddleware, getProfile)
router.post('/update', jwtAuthMiddleware, parsePayload('logo'), deviceAuthMiddleware, updateProfile)
router.post('/change-password', jwtAuthMiddleware, parsePayload(), deviceAuthMiddleware, changePassword)

module.exports = router
