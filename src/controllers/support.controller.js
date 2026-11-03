const { z } = require('zod')
const { sendValidationError } = require('../utils/validationError')
const supportModel = require('../models/support.model')
const { validateRequestDevice } = require('./device&app.controller')
const { buildContactDetails } = require('../utils/contactDetails')
const { convertNulls } = require('../utils/convertNulls')

const supportSchema = z.object({
    app_id: z.union([z.string(), z.number()]),
    device_id: z.string().trim().min(1, 'Device ID is required'),
}).strict()

const getSupportDetails = async (req, res) => {
    if (!(await validateRequestDevice(req, res))) return

    const parsed = supportSchema.safeParse(req.body)

    if (!parsed.success) return sendValidationError(res, parsed.error)

    try {
        const admin = await supportModel.findSupportDetails()
        if (!admin) {
            return res.status(200).json({ success: false, message: 'Support details are not available right now.' })
        }

        return res.status(200).json({
            success: true,
            message: 'Support details fetched successfully',
            data: convertNulls(buildContactDetails(admin)),
        })
    } catch (err) {
        console.error('Get support details error:', err)
        return res.status(200).json({ success: false, message: 'Something went wrong' })
    }
}

module.exports = { getSupportDetails }