const express = require('express')
const { getSharedService, showSharedServicePage } = require('../controllers/share.controller')

// Public share links (no login): opened from WhatsApp, email, social apps or a browser
const pageRouter = express.Router()
pageRouter.get('/service/:code', showSharedServicePage)

// The same, as JSON for the app: /api/share/service/:code
const apiRouter = express.Router()
apiRouter.get('/service/:code', getSharedService)

module.exports = { pageRouter, apiRouter }