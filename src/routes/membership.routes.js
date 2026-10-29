const express = require('express')
const { listMemberships, purchaseMembership } = require('../controllers/membership.controller')
const { deviceAuthMiddleware } = require('../middleware/auth.middleware')

const router = express.Router()

router.post('/plans', deviceAuthMiddleware, listMemberships)
router.post('/purchase', deviceAuthMiddleware, purchaseMembership)

module.exports = router
