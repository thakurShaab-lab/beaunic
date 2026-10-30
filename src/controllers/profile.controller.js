const fs = require('fs/promises')
const path = require('path')
const crypto = require('crypto')
const { z } = require('zod')
const bcrypt = require('bcryptjs')
const env = require('../config/env')
const authModel = require('../models/auth.model')
const addressModel = require('../models/address.model')
const membershipModel = require('../models/membership.model')
const { validateRequestDevice } = require('./device&app.controller')
const { detectImageExt, UPLOAD_DIR } = require('./auth.controller')
const { contactAndAddressFields, toAddressColumns, formatOrderAddress, optionalText } = require('./address.controller')
const { convertNulls } = require('../utils/convertNulls')

const SERVICE_TYPE_LABELS = {
    salon: 'Salon',
    home_service: 'Home Service',
}

const deviceFields = {
    app_id: z.union([z.string(), z.number()]),
    device_id: z.string().trim().min(1, 'Device ID is required'),
}

const getProfileSchema = z.object(deviceFields).strict()

const PROFILE_FIELDS = {
    salonName: optionalText(100),
    name: z.preprocess(
        (value) => typeof value === 'string' && !value.trim() ? undefined : value,
        z.string().trim().min(2).max(32).regex(/^[\p{L}\p{M} .'-]+$/u, 'Invalid characters in name').optional()
    ),
    serviceType: z.preprocess(
        (value) => value === '' ? undefined : value,
        z.enum(['salon', 'home_service']).optional()
    ),
}

const updateProfileSchema = z.object({
    ...deviceFields,
    ...PROFILE_FIELDS,
    ...contactAndAddressFields,
}).strict()

const changePasswordSchema = z
    .object({
        ...deviceFields,
        currentPassword: z.string().min(1, 'Current password is required'),
        newPassword: z.string().min(8, 'Minimum 8 characters').max(72),
        confirmPassword: z.string(),
    })
    .strict()
    .superRefine((d, ctx) => {
        if (d.newPassword !== d.confirmPassword) {
            ctx.addIssue({ code: 'custom', path: ['confirmPassword'], message: 'Passwords do not match' })
        }
        if (d.newPassword === d.currentPassword) {
            ctx.addIssue({ code: 'custom', path: ['newPassword'], message: 'New password must be different from the current password' })
        }
    })

const sendValidationError = (res, error) =>
    res.status(200).json({
        success: false,
        message: 'Validation failed',
        errors: error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
    })

const findLoggedInCustomer = async (req, res, { app_id, device_id }) => {
    const customer = await authModel.findByIdAndDevice(req.user.customerId, String(app_id).trim(), device_id)
    if (!customer) {
        res.status(200).json({ success: false, message: 'Account not found for this device.' })
        return null
    }

    if (customer.status !== '1') {
        res.status(200).json({ success: false, message: 'Your account is not active. Please contact support.' })
        return null
    }

    return customer
}

const buildProfile = async (customerId) => {
    const [customer, savedAddress, membership] = await Promise.all([
        authModel.findProfile(customerId),
        addressModel.findDefaultAddress(customerId),
        membershipModel.findActiveMembership(customerId),
    ])

    const address = savedAddress || {
        mobile: null, additionalNumbers: null, supportNumber: null,
        address: null, city: null, state: null, zipcode: null, country: null,
    }

    const contactNumber = address.mobile || customer.mobileNumber
    const additionalContactNumbers = address.additionalNumbers ? address.additionalNumbers.split(',') : []

    const isSalonPartner = customer.customerType === '1'

    const checklist = [
        customer.firstName,
        contactNumber,
        address.address,
        address.city,
        address.state,
        address.zipcode,
        ...(isSalonPartner ? [
            customer.customerPhoto,
            customer.salonName,
            customer.serviceType,
            address.supportNumber,
            membership,
        ] : []),
    ]
    const profileCompletion = Math.round((checklist.filter(Boolean).length / checklist.length) * 100)

    return convertNulls({
        customerId: customer.customerId,
        customerType: customer.customerType,
        logoUrl: customer.customerPhoto ? `${env.staticFileBaseUrl}/salon_logos/${customer.customerPhoto}` : null,
        salonName: customer.salonName,
        ownerName: customer.firstName,
        serviceType: customer.serviceType,
        serviceTypeLabel: SERVICE_TYPE_LABELS[customer.serviceType] || null,
        emailId: customer.userName,
        contactNumber,
        additionalContactNumbers,
        customerSupportNumber: address.supportNumber,
        address: {
            address: address.address,
            location: address.city,
            state: address.state,
            pinCode: address.zipcode,
            country: address.country,
            fullAddress: [address.address, address.city, address.state, address.zipcode].filter(Boolean).join(', '),
        },
        membership: {
            isActive: Boolean(membership),
            planName: membership ? membership.membershipName : null,
            validUntil: membership ? membership.endDate : null,
        },
        profileCompletion,
    })
}

const getProfile = async (req, res) => {
    if (!(await validateRequestDevice(req, res))) return

    const parsed = getProfileSchema.safeParse(req.body)

    if (!parsed.success) return sendValidationError(res, parsed.error)

    try {
        const customer = await findLoggedInCustomer(req, res, parsed.data)
        if (!customer) return

        return res.status(200).json({
            success: true,
            message: 'Profile fetched successfully',
            data: await buildProfile(customer.customerId),
        })
    } catch (err) {
        console.error('Get profile error:', err)
        return res.status(200).json({ success: false, message: 'Something went wrong' })
    }
}

const updateProfile = async (req, res) => {
    if (!(await validateRequestDevice(req, res))) return

    const parsed = updateProfileSchema.safeParse(req.body)

    if (!parsed.success) return sendValidationError(res, parsed.error)

    const d = parsed.data

    let logoName = null
    if (req.file) {
        const ext = detectImageExt(req.file.buffer)
        if (!ext) {
            return res.status(200).json({ success: false, message: 'Logo must be a PNG or JPG image' })
        }
        logoName = crypto.randomBytes(12).toString('hex') + ext
    }

    const customerValues = {
        firstName: d.name,
        salonName: d.salonName,
        serviceType: d.serviceType,
        ...(logoName && { customerPhoto: logoName }),
    }
    const addressValues = toAddressColumns(d)
    const hasValue = (values) => Object.values(values).some((value) => value !== undefined)

    if (!hasValue(customerValues) && !hasValue(addressValues)) {
        return res.status(200).json({ success: false, message: 'Please change at least one field.' })
    }

    try {
        const customer = await findLoggedInCustomer(req, res, d)
        if (!customer) return

        const previous = await authModel.findProfile(customer.customerId)

        if (logoName) {
            await fs.mkdir(UPLOAD_DIR, { recursive: true })
            await fs.writeFile(path.join(UPLOAD_DIR, logoName), req.file.buffer)
        }

        if (hasValue(customerValues)) {
            await authModel.updateProfile(customer.customerId, customerValues)
        }

        if (hasValue(addressValues)) {
            const existing = await addressModel.findDefaultAddress(customer.customerId)

            if (existing) {
                await addressModel.updateAddress(existing.addressId, addressValues)
            } else {
                await addressModel.createAddress({
                    customerId: customer.customerId,
                    name: customer.firstName ? customer.firstName.slice(0, 32) : null,
                    ...addressValues,
                    addressType: 'Bill',
                    defaultStatus: 'Y',
                    recivDate: authModel.nowString(),
                })
            }

            const order = await membershipModel.findActiveMembership(customer.customerId)
            const saved = order && await addressModel.findDefaultAddress(customer.customerId)
            if (saved) {
                const orderAddress = formatOrderAddress({
                    address: saved.address,
                    location: saved.city,
                    pinCode: saved.zipcode,
                    country: saved.country,
                })
                if (orderAddress || saved.state) {
                    await membershipModel.updateOrderAddress(order.orderId, {
                        ...(orderAddress && { address: orderAddress }),
                        ...(saved.state && { state: saved.state }),
                    })
                }
            }
        }

        if (logoName && previous.customerPhoto) {
            await fs.unlink(path.join(UPLOAD_DIR, previous.customerPhoto)).catch(() => { })
        }

        return res.status(200).json({
            success: true,
            message: 'Profile updated successfully',
            data: await buildProfile(customer.customerId),
        })
    } catch (err) {
        if (logoName) await fs.unlink(path.join(UPLOAD_DIR, logoName)).catch(() => { })
        console.error('Update profile error:', err)
        return res.status(200).json({ success: false, message: 'Something went wrong' })
    }
}

const changePassword = async (req, res) => {
    if (!(await validateRequestDevice(req, res))) return

    const parsed = changePasswordSchema.safeParse(req.body)

    if (!parsed.success) return sendValidationError(res, parsed.error)

    const { currentPassword, newPassword } = parsed.data

    try {
        const customer = await findLoggedInCustomer(req, res, parsed.data)
        if (!customer) return

        const passwordHash = await authModel.findPasswordHash(customer.customerId)
        if (!passwordHash || !(await bcrypt.compare(currentPassword, passwordHash))) {
            return res.status(200).json({ success: false, message: 'Current password is incorrect.' })
        }

        await authModel.updatePassword(customer.customerId, await bcrypt.hash(newPassword, 12))

        return res.status(200).json({ success: true, message: 'Password changed successfully' })
    } catch (err) {
        console.error('Change password error:', err)
        return res.status(200).json({ success: false, message: 'Something went wrong' })
    }
}

module.exports = { getProfile, updateProfile, changePassword }
