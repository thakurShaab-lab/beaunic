const express = require('express')
const { getCategories } = require('../controllers/category.controller')
const { jwtAuthMiddleware, deviceAuthMiddleware } = require('../middleware/auth.middleware')
const { parsePayload } = require('../middleware/payload.middleware')

const router = express.Router()

// The list works without logging in; a token, when sent, adds service counts in the customer's location
const optionalJwt = (req, res, next) => (req.headers.authorization ? jwtAuthMiddleware(req, res, next) : next())

router.post('/list', optionalJwt, parsePayload(), deviceAuthMiddleware, getCategories)

module.exports = router
