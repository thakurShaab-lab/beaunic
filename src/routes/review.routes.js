const express = require('express')
const { addReview, listReviews, listPartnerReviews } = require('../controllers/review.controller')
const { jwtAuthMiddleware, deviceAuthMiddleware } = require('../middleware/auth.middleware')
const { parsePayload } = require('../middleware/payload.middleware')

const router = express.Router()

router.post('/add', jwtAuthMiddleware, parsePayload(), deviceAuthMiddleware, addReview)
router.post('/list', jwtAuthMiddleware, parsePayload(), deviceAuthMiddleware, listReviews)
// Salon Partners: 'Reviews & Feedback' about their own salon, services, employees and products
router.post('/partner/list', jwtAuthMiddleware, parsePayload(), deviceAuthMiddleware, listPartnerReviews)

module.exports = router
