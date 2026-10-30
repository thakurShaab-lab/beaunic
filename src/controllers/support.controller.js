const { z } = require('zod')
const supportModel = require('../models/support.model')
const { validateRequestDevice } = require('./device&app.controller')
const { convertNulls } = require('../utils/convertNulls')

const COUNTRY_CODE = '+91'

const supportSchema = z.object({
    app_id: z.union([z.string(), z.number()]),
    device_id: z.string().trim().min(1, 'Device ID is required'),
}).strict()

const sendValidationError = (res, error) =>
    res.status(200).json({
        success: false,
        message: 'Validation failed',
        errors: error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
    })

const clean = (value) => (typeof value === 'string' && value.trim() ? value.trim() : null)

const digitsOnly = (value) => (clean(value) ? value.replace(/\D/g, '') : null)

const displayPhone = (value) => {
    const digits = digitsOnly(value)
    if (!digits) return null
    return digits.length === 10 ? `${COUNTRY_CODE} ${digits}` : `+${digits}`
}

const dialPhone = (value) => {
    const digits = digitsOnly(value)
    if (!digits) return null
    return digits.length === 10 ? `${COUNTRY_CODE}${digits}` : `+${digits}`
}

const singleLine = (value) =>
    clean(value) ? value.split(/\r?\n/).map((line) => line.trim().replace(/\s*,$/, '')).filter(Boolean).join(', ') : null

const websiteUrl = (value) => {
    const site = clean(value)
    if (!site) return null
    return /^https?:\/\//i.test(site) ? site : `https://${site}`
}

const getSupportDetails = async (req, res) => {
    if (!(await validateRequestDevice(req, res))) return

    const parsed = supportSchema.safeParse(req.body)

    if (!parsed.success) return sendValidationError(res, parsed.error)

    try {
        const admin = await supportModel.findSupportDetails()
        if (!admin) {
            return res.status(200).json({ success: false, message: 'Support details are not available right now.' })
        }

        const phone = clean(admin.phone) || clean(admin.mobile)
        const website = clean(admin.website)
        const whatsapp = clean(admin.whatsappNumber)
        const email = clean(admin.contactEmail) || clean(admin.adminEmail)

        return res.status(200).json({
            success: true,
            message: 'Support details fetched successfully',
            data: convertNulls({
                title: 'BEAUNIC SALON ACADEMY',
                availability: 'Support available Monday - Sunday',
                call: {
                    label: 'Call',
                    number: displayPhone(phone),
                    link: phone && `tel:${dialPhone(phone)}`,
                },
                email: {
                    label: 'Email',
                    address: email,
                    link: email && `mailto:${email}`,
                },
                website: {
                    label: 'Website',
                    name: website,
                    link: websiteUrl(website),
                },
                address: {
                    label: 'Address',
                    address: singleLine(admin.corporateAddress) || singleLine(admin.address),
                },
                whatsapp: {
                    number: displayPhone(whatsapp),
                    link: whatsapp && `https://wa.me/${dialPhone(whatsapp).slice(1)}`,
                },
                socialLinks: {
                    facebook: clean(admin.facebookLink),
                    instagram: clean(admin.instagramLink),
                    youtube: clean(admin.youtubeLink),
                    twitter: clean(admin.twitterLink),
                    linkedin: clean(admin.linkedinLink),
                },
            }),
        })
    } catch (err) {
        console.error('Get support details error:', err)
        return res.status(200).json({ success: false, message: 'Something went wrong' })
    }
}

module.exports = { getSupportDetails }
