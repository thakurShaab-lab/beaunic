const express = require('express')
const { addService, updateService, listServices, updateServiceStatus, getServiceDetails } = require('../controllers/service.controller')
const { jwtAuthMiddleware, deviceAuthMiddleware } = require('../middleware/auth.middleware')
const { parsePayload } = require('../middleware/payload.middleware')

const router = express.Router()

const SERVICE_IMAGES = ['coverImage', { name: 'images', maxCount: 5 }]

const servicePayload = parsePayload(SERVICE_IMAGES, { emptyAsNull: ['price', 'duration'] })

router.post('/add', jwtAuthMiddleware, servicePayload, deviceAuthMiddleware, addService)
router.post('/update', jwtAuthMiddleware, servicePayload, deviceAuthMiddleware, updateService)
router.post('/list', jwtAuthMiddleware, parsePayload(), deviceAuthMiddleware, listServices)
router.post('/status', jwtAuthMiddleware, parsePayload(), deviceAuthMiddleware, updateServiceStatus)
router.post('/details', jwtAuthMiddleware, parsePayload(), deviceAuthMiddleware, getServiceDetails)

module.exports = router