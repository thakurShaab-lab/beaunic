const express = require('express')
const { getHomePage } = require('../controllers/home.controller')
const { jwtAuthMiddleware, deviceAuthMiddleware } = require('../middleware/auth.middleware')
const { parsePayload } = require('../middleware/payload.middleware')

const router = express.Router()

router.post('/', jwtAuthMiddleware, parsePayload(), deviceAuthMiddleware, getHomePage)

module.exports = router
