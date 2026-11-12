const { z } = require('zod')
const { sendValidationError } = require('../utils/validationError')
const geoModel = require('../models/geo.model')
const { validateRequestDevice } = require('./device&app.controller')
const { findLoggedInCustomer } = require('./profile.controller')
const { convertNulls } = require('../utils/convertNulls')

// Countries and cities are for Salon Partners (customer_type 1)
const findSalonPartner = async (req, res, data) => {
    const customer = await findLoggedInCustomer(req, res, data)
    if (!customer) return null

    if (customer.customerType !== '1') {
        res.status(200).json({ success: false, message: 'This feature is only available for Salon Partners.' })
        return null
    }

    return customer
}

const deviceFields = {
    app_id: z.union([z.string(), z.number()]),
    device_id: z.string().trim().min(1, 'Device ID is required'),
}

// Optional: part of the name; blank, null or missing lists everything
const search = z.string().trim().max(80, 'Search can be up to 80 characters').optional()

const countriesSchema = z.object({ ...deviceFields, search }).strict()

const countryIdField = z.coerce.number({ error: 'Country ID must be a number' }).int().positive('Country ID must be a number').optional()

// countryId is required; country_id is accepted too
const citiesSchema = z.object({
    ...deviceFields,
    countryId: countryIdField,
    country_id: countryIdField,
    search,
}).strict().superRefine((d, ctx) => {
    if (d.countryId === undefined && d.country_id === undefined) {
        ctx.addIssue({ code: 'custom', path: ['countryId'], message: 'Please select a country' })
    }
})

// Country dropdown: every active country A-Z
const listCountries = async (req, res) => {
    if (!(await validateRequestDevice(req, res))) return

    const parsed = countriesSchema.safeParse(req.body)

    if (!parsed.success) return sendValidationError(res, parsed.error)

    try {
        if (!(await findSalonPartner(req, res, parsed.data))) return

        const countries = await geoModel.findActiveCountries({ search: parsed.data.search || undefined })

        return res.status(200).json({
            success: true,
            message: countries.length ? 'Countries fetched successfully' : 'No countries found',
            data: convertNulls({
                total: countries.length,
                countries: countries.map((row) => ({
                    countryId: row.countryId,
                    countryName: row.countryName,
                    isoCode2: row.isoCode2,
                    isoCode3: row.isoCode3,
                    cityCount: Number(row.cityCount),
                    hasCities: Number(row.cityCount) > 0,
                })),
            }),
        })
    } catch (err) {
        console.error('List countries error:', err)
        return res.status(200).json({ success: false, message: 'Something went wrong' })
    }
}

// City dropdown: the active cities of the selected country only
const listCities = async (req, res) => {
    if (!(await validateRequestDevice(req, res))) return

    const parsed = citiesSchema.safeParse(req.body)

    if (!parsed.success) return sendValidationError(res, parsed.error)

    const countryId = parsed.data.countryId ?? parsed.data.country_id

    try {
        if (!(await findSalonPartner(req, res, parsed.data))) return

        const country = await geoModel.findActiveCountry(countryId)
        if (!country) {
            return res.status(200).json({ success: false, message: 'Country not found.', field: 'countryId' })
        }

        const cities = await geoModel.findActiveCitiesByCountry(country.countryId, { search: parsed.data.search || undefined })

        return res.status(200).json({
            success: true,
            message: cities.length ? 'Cities fetched successfully' : 'No cities found for this country',
            data: convertNulls({
                country,
                total: cities.length,
                cities: cities.map((row) => ({ cityId: row.cityId, cityName: row.cityName, countryId: row.countryId })),
            }),
        })
    } catch (err) {
        console.error('List cities error:', err)
        return res.status(200).json({ success: false, message: 'Something went wrong' })
    }
}

module.exports = { listCountries, listCities }
