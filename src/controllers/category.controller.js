const { z } = require('zod')
const { sendValidationError } = require('../utils/validationError')
const categoryModel = require('../models/category.model')
const { validateRequestDevice } = require('./device&app.controller')
const { convertNulls } = require('../utils/convertNulls')

const categoriesSchema = z.object({
    app_id: z.union([z.string(), z.number()]),
    device_id: z.string().trim().min(1, 'Device ID is required'),
}).strict()

const getCategories = async (req, res) => {
    if (!(await validateRequestDevice(req, res))) return

    const parsed = categoriesSchema.safeParse(req.body)

    if (!parsed.success) return sendValidationError(res, parsed.error)

    try {
        const rows = await categoryModel.findActiveCategoriesWithServiceCount()

        return res.status(200).json({
            success: true,
            message: rows.length ? 'Categories fetched successfully' : 'No categories available',
            data: convertNulls({
                categories: rows.map((row) => ({
                    categoryId: row.categoryId,
                    categoryName: row.categoryName,
                    serviceCount: Number(row.serviceCount),
                })),
            }),
        })
    } catch (err) {
        console.error('Get categories error:', err)
        return res.status(200).json({ success: false, message: 'Something went wrong' })
    }
}

module.exports = { getCategories }
