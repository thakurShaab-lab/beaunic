const { z } = require('zod')
const { sendValidationError } = require('../utils/validationError')
const categoryModel = require('../models/category.model')
const addressModel = require('../models/address.model')
const { findLoggedInCustomer } = require('./profile.controller')
const { validateRequestDevice } = require('./device&app.controller')
const { convertNulls } = require('../utils/convertNulls')
const { resolveMediaUrl } = require('../utils/mediaUrl')
const env = require('../config/env')

// wl_categories.category_image files live in uploaded_files/category
const CATEGORY_IMAGE_FOLDER = 'category'

const categoriesSchema = z.object({
    app_id: z.union([z.string(), z.number()]),
    device_id: z.string().trim().min(1, 'Device ID is required'),
}).strict()

const getCategories = async (req, res) => {
    if (!(await validateRequestDevice(req, res))) return

    const parsed = categoriesSchema.safeParse(req.body)

    if (!parsed.success) return sendValidationError(res, parsed.error)

    try {
        // With a login token, services are also counted in the customer's saved city (their default address)
        let location = null
        if (req.user) {
            const customer = await findLoggedInCustomer(req, res, parsed.data)
            if (!customer) return

            const address = await addressModel.findDefaultAddress(customer.customerId)
            if (address?.city?.trim()) location = { city: address.city.trim(), state: address.state }
        }

        const [rows, cityCounts] = await Promise.all([
            categoryModel.findActiveCategoriesWithServiceCount(),
            location ? categoryModel.countServicesInCityByCategory(location.city) : [],
        ])

        // Full image URLs (null when the file is missing), checked all at once
        const imageUrls = await Promise.all(rows.map((row) =>
            resolveMediaUrl(req, CATEGORY_IMAGE_FOLDER, row.categoryImage, null, env.staticFileBaseUrl)))

        // null (sent as "") when the customer's location isn't known
        const countInCity = (categoryId) => {
            if (!location) return null
            const row = cityCounts.find((item) => item.categoryId === categoryId)
            return row ? Number(row.total) : 0
        }

        const categories = rows.map((row, i) => ({
            categoryId: row.categoryId,
            categoryName: row.categoryName,
            categoryImage: imageUrls[i],
            serviceCount: Number(row.serviceCount),
            locationServiceCount: countInCity(row.categoryId),
        }))

        return res.status(200).json({
            success: true,
            message: rows.length ? 'Categories fetched successfully' : 'No categories available',
            data: convertNulls({
                location,
                // Every active service in the customer's city across the listed categories
                locationServiceTotal: location ? categories.reduce((sum, row) => sum + row.locationServiceCount, 0) : null,
                categories,
            }),
        })
    } catch (err) {
        console.error('Get categories error:', err)
        return res.status(200).json({ success: false, message: 'Something went wrong' })
    }
}

module.exports = { getCategories }
