const express = require('express')
const { addAddress } = require('../controllers/address.controller')
const { deviceAuthMiddleware } = require('../middleware/auth.middleware')
const { parsePayload } = require('../middleware/payload.middleware')

const router = express.Router()

router.post('/add', parsePayload(), deviceAuthMiddleware, addAddress)

module.exports = router
