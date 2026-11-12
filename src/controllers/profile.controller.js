const fs = require('fs/promises')
const path = require('path')
const crypto = require('crypto')
const { z } = require('zod')
const { sendValidationError } = require('../utils/validationError')
const bcrypt = require('bcryptjs')
const env = require('../config/env')
const authModel = require('../models/auth.model')
const addressModel = require('../models/address.model')
const membershipModel = require('../models/membership.model')
const bankDetailsModel = require('../models/bankDetails.model')
const geoModel = require('../models/geo.model')
const { validateRequestDevice } = require('./device&app.controller')
const { detectImageExt, UPLOAD_DIR } = require('./auth.controller')
const { contactAndAddressFields, toAddressColumns, formatOrderAddress, optionalText, noMarkup, checkCountryAndCity, savedId } = require('./address.controller')
const { convertNulls } = require('../utils/convertNulls')
const { resolveMediaUrl } = require('../utils/mediaUrl')

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
    // wl_customers.gender; "male" / "FEMALE" are accepted too
    gender: z.preprocess(
        (value) => typeof value === 'string' ? value.trim().charAt(0).toUpperCase() + value.trim().slice(1).toLowerCase() : value,
        z.enum(['Male', 'Female'], { error: 'Gender must be Male or Female' }).optional()
    ),
    serviceType: z.preprocess(
        (value) => value === '' ? undefined : value,
        z.enum(['salon', 'home_service']).optional()
    ),
}

// Blank / null / missing = "not sent", like the other profile fields
const blankToUndefined = (value) => (typeof value === 'string' && !value.trim() ? undefined : value)

// Bank details (all optional), saved in wl_customer_bank_details
const BANK_FIELDS = {
    accountHolderName: z.preprocess(
        blankToUndefined,
        z.string().trim().min(2, 'Account holder name must be at least 2 characters').max(100, 'Account holder name can be up to 100 characters')
            .regex(/^[\p{L}\p{M} .'-]+$/u, 'Invalid characters in account holder name').optional()
    ),
    bankName: z.preprocess(
        blankToUndefined,
        z.string().trim().min(2, 'Bank name must be at least 2 characters').max(100, 'Bank name can be up to 100 characters').refine(noMarkup, 'Invalid characters').optional()
    ),
    // Spaces are ignored: "1234 5678 9012" -> "123456789012"
    accountNumber: z.preprocess(
        (value) => (typeof value === 'string' ? value.replace(/\s+/g, '') || undefined : value),
        z.coerce.string().regex(/^\d{9,18}$/, 'Account number must be 9 to 18 digits').optional()
    ),
    ifscCode: z.preprocess(
        (value) => (typeof value === 'string' ? value.trim().toUpperCase() || undefined : value),
        z.string().regex(/^[A-Z]{4}0[A-Z0-9]{6}$/, 'Enter a valid IFSC code (e.g. SBIN0001234)').optional()
    ),
    branchName: z.preprocess(
        blankToUndefined,
        z.string().trim().max(100, 'Branch name can be up to 100 characters').refine(noMarkup, 'Invalid characters').optional()
    ),
    accountType: z.preprocess(
        (value) => (typeof value === 'string' ? value.trim().toLowerCase() || undefined : value),
        z.enum(['savings', 'current'], { error: 'Account type must be savings or current' }).optional()
    ),
    upiId: z.preprocess(
        (value) => (typeof value === 'string' ? value.trim() || undefined : value),
        z.string().regex(/^[a-zA-Z0-9._-]{2,256}@[a-zA-Z]{2,64}$/, 'Enter a valid UPI ID (e.g. name@okhdfcbank)').max(100, 'UPI ID can be up to 100 characters').optional()
    ),
}

const updateProfileSchema = z.object({
    ...deviceFields,
    ...PROFILE_FIELDS,
    ...contactAndAddressFields,
    ...BANK_FIELDS,
}).strict()

const ACCOUNT_TYPE_LABELS = { savings: 'Savings', current: 'Current' }

// "123456789012" -> "XXXXXXXX9012"
const maskAccountNumber = (value) => (value ? `${'X'.repeat(Math.max(value.length - 4, 0))}${value.slice(-4)}` : null)

const formatBankDetails = (bank) => ({
    hasBankDetails: Boolean(bank),
    accountHolderName: bank?.accountHolderName ?? null,
    bankName: bank?.bankName ?? null,
    accountNumber: bank?.accountNumber ?? null,
    accountNumberMasked: maskAccountNumber(bank?.accountNumber),
    ifscCode: bank?.ifscCode ?? null,
    branchName: bank?.branchName ?? null,
    accountType: bank?.accountType ?? null,
    accountTypeLabel: ACCOUNT_TYPE_LABELS[bank?.accountType] ?? null,
    upiId: bank?.upiId ?? null,
})

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

const buildProfile = async (req, customerId) => {
    const [customer, savedAddress, membership, bank] = await Promise.all([
        authModel.findProfile(customerId),
        addressModel.findDefaultAddress(customerId),
        membershipModel.findActiveMembership(customerId),
        bankDetailsModel.findBankDetails(customerId),
    ])

    const address = savedAddress || {
        mobile: null, additionalNumbers: null, supportNumber: null,
        address: null, city: null, state: null, zipcode: null, country: null,
    }

    // country holds a country ID and state a city ID; older addresses may still hold plain text
    const countryId = savedId(address.country)
    const cityId = savedId(address.state)
    const names = await geoModel.findCountryAndCityNames(countryId, cityId)
    const countryName = countryId ? names.countryName : address.country
    const stateName = cityId ? names.cityName : address.state

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
        // null when the file is missing
        logoUrl: await resolveMediaUrl(req, 'salon_logos', customer.customerPhoto, null, env.staticFileBaseUrl),
        bookings: '5',
        favorites: '4',
        notofications: '3',
        salonName: customer.salonName,
        ownerName: customer.firstName,
        gender: customer.gender,
        serviceType: customer.serviceType,
        serviceTypeLabel: SERVICE_TYPE_LABELS[customer.serviceType] || null,
        emailId: customer.userName,
        contactNumber,
        additionalContactNumbers,
        customerSupportNumber: address.supportNumber,
        address: {
            address: address.address,
            location: address.city,
            // City ID (wl_cities) and its name
            state: address.state,
            stateName,
            pinCode: address.zipcode,
            // Country ID (wl_countries) and its name
            country: address.country,
            countryName,
            fullAddress: [address.address, address.city, stateName, address.zipcode, countryName].filter(Boolean).join(', '),
        },
        // Saved separately in wl_customer_bank_details
        bankDetails: formatBankDetails(bank),
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
            data: await buildProfile(req, customer.customerId),
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
        gender: d.gender,
        salonName: d.salonName,
        serviceType: d.serviceType,
        ...(logoName && { customerPhoto: logoName }),
    }
    const addressValues = toAddressColumns(d)
    const bankValues = Object.fromEntries(Object.keys(BANK_FIELDS).map((key) => [key, d[key]]))
    const hasValue = (values) => Object.values(values).some((value) => value !== undefined)

    if (!hasValue(customerValues) && !hasValue(addressValues) && !hasValue(bankValues)) {
        return res.status(200).json({ success: false, message: 'Please change at least one field.' })
    }

    try {
        const customer = await findLoggedInCustomer(req, res, d)
        if (!customer) return

        const previous = await authModel.findProfile(customer.customerId)

        // The city (state) must belong to the country. Whichever of the two isn't sent is taken from the saved address.
        let place = { country: null, city: null }
        if (d.country !== undefined || d.state !== undefined) {
            const saved = await addressModel.findDefaultAddress(customer.customerId)
            const countryId = d.country ?? savedId(saved?.country)
            const cityId = d.state ?? (d.country !== undefined ? savedId(saved?.state) : null)
            place = await checkCountryAndCity(countryId, cityId)
            if (place.error) {
                // A new country with the old city: ask for a city of the new country
                const message = d.state === undefined && place.field === 'state' ? 'Please select a city in the selected country.' : place.error
                return res.status(200).json({ success: false, message, field: place.field })
            }
        }

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
                // The membership order keeps names, not IDs
                const names = await geoModel.findCountryAndCityNames(savedId(saved.country), savedId(saved.state))
                const countryName = savedId(saved.country) ? names.countryName : saved.country
                const stateName = savedId(saved.state) ? names.cityName : saved.state
                const orderAddress = formatOrderAddress({
                    address: saved.address,
                    location: saved.city,
                    pinCode: saved.zipcode,
                    country: countryName,
                })
                if (orderAddress || stateName) {
                    await membershipModel.updateOrderAddress(order.orderId, {
                        ...(orderAddress && { address: orderAddress }),
                        ...(stateName && { state: stateName }),
                    })
                }
            }
        }

        if (hasValue(bankValues)) {
            await bankDetailsModel.saveBankDetails(customer.customerId, bankValues, authModel.nowString())
        }

        if (logoName && previous.customerPhoto) {
            await fs.unlink(path.join(UPLOAD_DIR, previous.customerPhoto)).catch(() => { })
        }

        return res.status(200).json({
            success: true,
            message: 'Profile updated successfully',
            data: await buildProfile(req, customer.customerId),
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

module.exports = { getProfile, updateProfile, changePassword, findLoggedInCustomer }
