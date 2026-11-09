const express = require('express')
const { getEnquiryForm, sendEnquiry } = require('../controllers/enquiry.controller')
const { jwtAuthMiddleware, deviceAuthMiddleware } = require('../middleware/auth.middleware')
const { parsePayload } = require('../middleware/payload.middleware')

const router = express.Router()

router.post('/form', jwtAuthMiddleware, parsePayload(), deviceAuthMiddleware, getEnquiryForm)
router.post('/send', jwtAuthMiddleware, parsePayload(), deviceAuthMiddleware, sendEnquiry)

module.exports = router
