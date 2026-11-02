const express = require('express')
const { addService, updateService, listServices, updateServiceStatus } = require('../controllers/service.controller')
const { jwtAuthMiddleware, deviceAuthMiddleware } = require('../middleware/auth.middleware')
const { parsePayload } = require('../middleware/payload.middleware')

const router = express.Router()

// Image tiles: the Cover, plus up to two more sent as "images"
const SERVICE_IMAGES = ['coverImage', { name: 'images', maxCount: 5 }]

// "Leave blank if not configured": an empty price means no price, so on edit it clears the saved one
const servicePayload = parsePayload(SERVICE_IMAGES, { emptyAsNull: ['price'] })

router.post('/add', jwtAuthMiddleware, servicePayload, deviceAuthMiddleware, addService)
router.post('/update', jwtAuthMiddleware, servicePayload, deviceAuthMiddleware, updateService)
router.post('/list', parsePayload(), deviceAuthMiddleware, listServices)
router.post('/status', jwtAuthMiddleware, parsePayload(), deviceAuthMiddleware, updateServiceStatus)

module.exports = router