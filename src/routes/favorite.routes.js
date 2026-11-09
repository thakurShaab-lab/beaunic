const express = require('express')
const { addFavorite, removeFavorite, listFavorites, countFavorites } = require('../controllers/favorite.controller')
const { jwtAuthMiddleware, deviceAuthMiddleware } = require('../middleware/auth.middleware')
const { parsePayload } = require('../middleware/payload.middleware')

const router = express.Router()

router.post('/add', jwtAuthMiddleware, parsePayload(), deviceAuthMiddleware, addFavorite)
router.post('/remove', jwtAuthMiddleware, parsePayload(), deviceAuthMiddleware, removeFavorite)
router.post('/list', jwtAuthMiddleware, parsePayload(), deviceAuthMiddleware, listFavorites)
router.post('/count', jwtAuthMiddleware, parsePayload(), deviceAuthMiddleware, countFavorites)

module.exports = router
