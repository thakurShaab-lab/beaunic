const jwt = require('jsonwebtoken')
const crypto = require('crypto')


const jwtAuthMiddleware = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization

    const token = (authHeader || '').trim().replace(/^Bearer\s+/i, '').trim()

    if (!token) {
      return res.status(200).json({
        success: false,
        message: 'Authorization token is required.',
      })
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET, {
      algorithms: ['HS256'],
    })

    req.user = decoded

    return next()
  } catch (error) {
    if (
      error.name === 'JsonWebTokenError' ||
      error.name === 'TokenExpiredError' ||
      error.name === 'NotBeforeError'
    ) {
      return res.status(200).json({
        success: false,
        message: 'Invalid or expired token.',
      })
    }

    console.error('JWT authentication error:', error)

    return res.status(200).json({
      success: false,
      message: 'Internal server error.',
    })
  }
}

const deviceAuthMiddleware = async (req, res, next) => {
  try {
    const rawAppId = req.headers['x-app-id'] || req.body?.app_id
    const appId = typeof rawAppId === 'number' ? String(rawAppId) : rawAppId
    const deviceId = req.headers['x-device-id'] || req.body?.device_id
    const appType = req.headers['x-app-type'] || req.body?.app_type

    if (
      typeof appId !== 'string' ||
      typeof deviceId !== 'string' ||
      !appId.trim() ||
      !deviceId.trim()
    ) {
      return res.status(200).json({
        success: false,
        message: 'app_id and device_id are required.',
      })
    }

    if (appType !== undefined && (typeof appType !== 'string' || !appType.trim())) {
      return res.status(200).json({
        success: false,
        message: 'app_type must be a non-empty string.',
      })
    }

    // Only checks that app_id and device_id are sent; the phone doesn't have to be saved on an account yet
    req.device = { app_id: appId.trim(), device_id: deviceId.trim(), app_type: appType }

    next()
  } catch (error) {
    console.error('Device authentication error:', error)

    return res.status(200).json({
      success: false,
      message: 'Internal server error.',
    })
  }
}

module.exports = { deviceAuthMiddleware, jwtAuthMiddleware }