const express = require('express')
const { addReview, listReviews } = require('../controllers/review.controller')
const { jwtAuthMiddleware, deviceAuthMiddleware } = require('../middleware/auth.middleware')
const { parsePayload } = require('../middleware/payload.middleware')

const router = express.Router()

router.post('/add', jwtAuthMiddleware, parsePayload(), deviceAuthMiddleware, addReview)
router.post('/list', jwtAuthMiddleware, parsePayload(), deviceAuthMiddleware, listReviews)

module.exports = router
