const validationController = require('../models/device&app.model')
const { LOGIN_ROUTES } = require('../middleware/auth.middleware')

const validateRequestDevice = async (req, res) => {
    const { app_id, device_id } = req.body || {}

    if (
        (typeof app_id !== 'string' && typeof app_id !== 'number') ||
        !String(app_id).trim() ||
        typeof device_id !== 'string' ||
        !device_id.trim()
    ) {
        res.status(400).json({
            success: false,
            message: 'app_id and device_id are required'
        })
        return false
    }

    // Logging in is how a new phone gets saved to an account, so these routes only need app_id and device_id sent
    if (LOGIN_ROUTES.has(req.baseUrl + req.path)) return true

    const isValid = await validationController.validateDevice(
        app_id,
        device_id.trim()
    )

    if (!isValid) {
        res.status(401).json({
            success: false,
            message: 'Invalid app_id or device_id'
        })
        return false
    }

    return true
}

module.exports = { validateRequestDevice }