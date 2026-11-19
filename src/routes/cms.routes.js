const express = require('express')
const { getCmsPage } = require('../controllers/cms.controller')
const { deviceAuthMiddleware } = require('../middleware/auth.middleware')
const { parsePayload } = require('../middleware/payload.middleware')

const router = express.Router()

router.post('/page', parsePayload(), deviceAuthMiddleware, getCmsPage)

module.exports = router
