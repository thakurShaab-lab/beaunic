const express = require('express')
const { getSupportDetails } = require('../controllers/support.controller')
const { deviceAuthMiddleware } = require('../middleware/auth.middleware')
const { parsePayload } = require('../middleware/payload.middleware')

const router = express.Router()

router.post('/details', parsePayload(), deviceAuthMiddleware, getSupportDetails)

module.exports = router