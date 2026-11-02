const express = require('express')
const { getCategories } = require('../controllers/category.controller')
const { deviceAuthMiddleware } = require('../middleware/auth.middleware')
const { parsePayload } = require('../middleware/payload.middleware')

const router = express.Router()

router.post('/list', parsePayload(), deviceAuthMiddleware, getCategories)

module.exports = router
