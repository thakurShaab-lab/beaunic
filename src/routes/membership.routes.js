const express = require('express')
const { listMemberships, purchaseMembership } = require('../controllers/membership.controller')
const { deviceAuthMiddleware } = require('../middleware/auth.middleware')
const { parsePayload } = require('../middleware/payload.middleware')

const router = express.Router()

router.post('/plans', parsePayload(), deviceAuthMiddleware, listMemberships)
router.post('/purchase', parsePayload(), deviceAuthMiddleware, purchaseMembership)

module.exports = router
