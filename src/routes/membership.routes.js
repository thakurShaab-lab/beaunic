const express = require('express')
const { listMemberships, purchaseMembership, myMembership } = require('../controllers/membership.controller')
const { jwtAuthMiddleware, deviceAuthMiddleware } = require('../middleware/auth.middleware')
const { parsePayload } = require('../middleware/payload.middleware')

const router = express.Router()

router.post('/plans', parsePayload(), deviceAuthMiddleware, listMemberships)
router.post('/purchase', parsePayload(), deviceAuthMiddleware, purchaseMembership)
// Salon Partners (logged in): 'My Membership'
router.post('/details', jwtAuthMiddleware, parsePayload(), deviceAuthMiddleware, myMembership)

module.exports = router
