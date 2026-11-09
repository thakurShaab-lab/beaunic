const express = require('express')
const { listEmployees } = require('../controllers/employee.controller')
const { jwtAuthMiddleware, deviceAuthMiddleware } = require('../middleware/auth.middleware')
const { parsePayload } = require('../middleware/payload.middleware')

const router = express.Router()

router.post('/list', jwtAuthMiddleware, parsePayload(), deviceAuthMiddleware, listEmployees)

module.exports = router
