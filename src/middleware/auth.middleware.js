const db = require('../config/drizzle')
const { eq, and } = require('drizzle-orm')
const jwt = require('jsonwebtoken')
const crypto = require('crypto')
const { wlCustomers } = require('../schema/wl-customers')


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

const LOGIN_ROUTES = new Set(['/api/auth/login', '/api/auth/verify-otp', '/api/auth/resend-otp'])

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

    // Logging in is how a new phone gets saved to an account, so these routes only need app_id and device_id sent
    if (LOGIN_ROUTES.has(req.baseUrl + req.path)) {
      req.device = { id: null, app_id: appId.trim(), device_id: deviceId.trim(), app_type: appType }
      return next()
    }

    const [customer] = await db
      .select({
        customersId: wlCustomers.customerId,
        appId: wlCustomers.appId,
        deviceId: wlCustomers.deviceId,
        appType: wlCustomers.appType,
      })
      .from(wlCustomers)
      .where(
        and(
          eq(wlCustomers.appId, appId.trim()),
          eq(wlCustomers.deviceId, deviceId.trim()),
          appType !== undefined ? eq(wlCustomers.appType, appType.trim()) : undefined,
        )
      )
      .limit(1)

    if (!customer) {
      return res.status(200).json({
        success: false,
        message: 'Invalid app_id or device_id, or account is inactive.',
      })
    }

    req.device = {
      id: customer.customersId,
      app_id: customer.appId,
      device_id: customer.deviceId,
      app_type: customer.appType,
    }

    next()
  } catch (error) {
    console.error('Device authentication error:', error)

    return res.status(200).json({
      success: false,
      message: 'Internal server error.',
    })
  }
}

module.exports = { deviceAuthMiddleware, jwtAuthMiddleware, LOGIN_ROUTES }