const express = require('express')
const { createSlot, listSlots, updateSlot, deleteSlot, listAvailableSlots } = require('../controllers/slot.controller')
const { jwtAuthMiddleware, deviceAuthMiddleware } = require('../middleware/auth.middleware')
const { parsePayload } = require('../middleware/payload.middleware')

const router = express.Router()

router.post('/create', jwtAuthMiddleware, parsePayload(), deviceAuthMiddleware, createSlot)
router.post('/list', jwtAuthMiddleware, parsePayload(), deviceAuthMiddleware, listSlots)
router.post('/update', jwtAuthMiddleware, parsePayload(), deviceAuthMiddleware, updateSlot)
router.post('/delete', jwtAuthMiddleware, parsePayload(), deviceAuthMiddleware, deleteSlot)
// "Select Time Slot": a salon's slots on one date, grouped Morning / Afternoon / Evening (both customer types)
router.post('/available', jwtAuthMiddleware, parsePayload(), deviceAuthMiddleware, listAvailableSlots)

module.exports = router
