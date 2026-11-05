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

    // Only checks that app_id and device_id are sent; the phone doesn't have to be saved on an account yet
    return true
}

module.exports = { validateRequestDevice }