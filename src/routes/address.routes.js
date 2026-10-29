const express = require('express')
const { addAddress } = require('../controllers/address.controller')
const { deviceAuthMiddleware } = require('../middleware/auth.middleware')

const router = express.Router()

router.post('/add', deviceAuthMiddleware, addAddress)

module.exports = router
