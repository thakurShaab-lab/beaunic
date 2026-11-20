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
const bookingModel = require('../models/booking.model')
const favoriteModel = require('../models/favorite.model')
const { validateRequestDevice } = require('./device&app.controller')
const { detectImageExt, UPLOAD_DIR } = require('./auth.controller')
const { contactAndAddressFields, toAddressColumns, formatOrderAddress, optionalText, noMarkup, savedId } = require('./address.controller')
const { convertNulls } = require('../utils/convertNulls')
const { updateAddressCoordinates } = require('../services/addressLocation.service')
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

const GENDERS = ['Male', 'Female', 'Other', 'Prefer not to say']

const PROFILE_FIELDS = {
    salonName: optionalText(100),
    name: z.preprocess(
        (value) => typeof value === 'string' && !value.trim() ? undefined : value,
        z.string().trim().min(2).max(32).regex(/^[\p{L}\p{M} .'-]+$/u, 'Invalid characters in name').optional()
    ),
    // wl_customers.gender; "male" / "FEMALE" / "prefer not to say" are accepted too
    gender: z.preprocess(
        (value) => typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').charAt(0).toUpperCase() + value.trim().replace(/\s+/g, ' ').slice(1).toLowerCase() || undefined : value,
        z.enum(GENDERS, { error: `Gender must be one of: ${GENDERS.join(', ')}` }).optional()
    ),
    // "Edit Profile" (Users): the account's login email and mobile number
    email: z.preprocess(
        (value) => (typeof value === 'string' ? value.trim().toLowerCase() || undefined : value),
        z.string().max(80, 'Email can be up to 80 characters').email('Please enter a valid email').optional()
    ),
    mobileNumber: z.preprocess(
        (value) => (typeof value === 'string' ? value.replace(/[\s-]/g, '') || undefined : value),
        z.string().regex(/^\d{10}$/, 'Please enter a valid 10-digit mobile number').optional()
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

// Every field is optional: only the ones sent are changed (blank counts as not sent). Which ones a customer may
// change depends on the account (see USER_FIELDS / PARTNER_ONLY_FIELDS).
const updateProfileSchema = z.object({
    ...deviceFields,
    ...PROFILE_FIELDS,
    ...contactAndAddressFields,
    // The city (wl_cities ID) and its country (wl_countries ID), always sent together.
    // "state" and "country" are the older names for the same two fields.
    cityId: z.preprocess(
        (value) => (typeof value === 'string' && !value.trim() ? undefined : value),
        z.coerce.number({ error: 'City must be a city ID' }).int('City must be a city ID').positive('City must be a city ID').optional()
    ),
    countryId: z.preprocess(
        (value) => (typeof value === 'string' && !value.trim() ? undefined : value),
        z.coerce.number({ error: 'Country must be a country ID' }).int('Country must be a country ID').positive('Country must be a country ID').optional()
    ),
    ...BANK_FIELDS,
}).strict()

// Users (customer_type 2) edit only what the "Edit Profile" screen shows: photo (the logo file), name, phone, email
// and gender. contactNumber is accepted as another name for the phone.
const USER_FIELDS = new Set(['name', 'mobileNumber', 'contactNumber', 'email', 'gender'])
// Login email and account mobile can only be changed by Users here; the partner form keeps its fields
const PARTNER_EXCLUDED_FIELDS = new Set(['email', 'mobileNumber'])
// The ones that move the address on the map (contact numbers don't)
const LOCATION_FIELDS = ['address', 'location', 'pinCode', 'countryId', 'country', 'cityId', 'state']

const sentFields = (d) => Object.keys(d).filter((key) => !(key in deviceFields) && d[key] !== undefined)

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
    const [customer, savedAddress, membership, bank, favoriteCount] = await Promise.all([
        authModel.findProfile(customerId),
        addressModel.findDefaultAddress(customerId),
        membershipModel.findActiveMembership(customerId),
        bankDetailsModel.findBankDetails(customerId),
        // Same count as the favorites list
        favoriteModel.countCustomerFavorites(customerId),
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

    const isSalonPartner = customer.customerType === '1'

    // Partners: the salon's contact number (address book), else the account's. Users: the account mobile, which
    // "Edit Profile" changes.
    const contactNumber = customer.customerType === '2'
        ? customer.mobileNumber || address.mobile
        : address.mobile || customer.mobileNumber
    const additionalContactNumbers = address.additionalNumbers ? address.additionalNumbers.split(',') : []

    // Bookings: a User's own (the "All" tab of My Bookings); a Salon Partner's, the bookings made at their salon
    const bookingCounts = isSalonPartner
        ? await bookingModel.countSalonBookingsByTab(customerId, {})
        : await bookingModel.countCustomerBookingsByTab(customerId, {})

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
        bookings: String(bookingCounts.total),
        favorites: String(favoriteCount),
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
    const fail = (message, field) => res.status(200).json({ success: false, message, ...(field && { field }) })

    // cityId / countryId and their older names "state" / "country" are the same fields
    if (d.cityId !== undefined && d.state !== undefined && d.cityId !== d.state) {
        return fail('Send the city once (cityId).', 'cityId')
    }
    if (d.countryId !== undefined && d.country !== undefined && d.countryId !== d.country) {
        return fail('Send the country once (countryId).', 'countryId')
    }
    const cityId = d.cityId ?? d.state
    const countryId = d.countryId ?? d.country

    let logoName = null
    if (req.file) {
        const ext = detectImageExt(req.file.buffer)
        if (!ext) return fail('Logo must be a PNG or JPG image', 'logo')
        logoName = crypto.randomBytes(12).toString('hex') + ext
    }

    const hasValue = (values) => Object.values(values).some((value) => value !== undefined)

    try {
        const customer = await findLoggedInCustomer(req, res, d)
        if (!customer) return

        const isUser = customer.customerType === '2'
        const sent = sentFields(d)

        // What this account may change: Users only the "Edit Profile" screen's fields, everyone else the full form
        const notAllowed = sent.find((key) => (isUser ? !USER_FIELDS.has(key) : PARTNER_EXCLUDED_FIELDS.has(key)))
        if (notAllowed) {
            return fail(isUser
                ? 'Only your photo, name, phone, email and gender can be changed here.'
                : `${notAllowed === 'email' ? 'Email' : 'Mobile number'} can't be changed here.`, notAllowed)
        }
        if (isUser && d.mobileNumber !== undefined && d.contactNumber !== undefined && d.mobileNumber !== d.contactNumber) {
            return fail('Send the phone number once (mobileNumber).', 'mobileNumber')
        }

        const previous = await authModel.findProfile(customer.customerId)

        // Only what was sent; anything left out keeps its saved value
        const customerValues = isUser
            ? {
                firstName: d.name,
                gender: d.gender,
                mobileNumber: d.mobileNumber ?? d.contactNumber,
                userName: d.email,
                ...(logoName && { customerPhoto: logoName }),
            }
            : {
                firstName: d.name,
                gender: d.gender,
                salonName: d.salonName,
                serviceType: d.serviceType,
                ...(logoName && { customerPhoto: logoName }),
            }
        const addressValues = isUser ? {} : toAddressColumns({ ...d, state: undefined, country: undefined })
        const bankValues = isUser ? {} : Object.fromEntries(Object.keys(BANK_FIELDS).map((key) => [key, d[key]]))

        // The login email and mobile number belong to one account only
        if (customerValues.userName !== undefined) {
            const owner = await authModel.findByEmail(customerValues.userName)
            if (owner && owner.customerId !== customer.customerId) return fail('This email is already registered with another account.', 'email')
        }
        if (customerValues.mobileNumber !== undefined) {
            const owner = await authModel.findByMobile(customerValues.mobileNumber)
            if (owner && owner.customerId !== customer.customerId) {
                return fail('This mobile number is already registered with another account.', d.mobileNumber !== undefined ? 'mobileNumber' : 'contactNumber')
            }
        }

        // City and country come as a pair: the country is looked up in wl_countries, the city in wl_cities, both must
        // be active and the city must be in that country. Both are saved as IDs (state = city, country = country).
        if (!isUser && (cityId !== undefined || countryId !== undefined)) {
            if (countryId === undefined) return fail('Please select a country.', 'countryId')
            if (cityId === undefined) return fail('Please select a city.', 'cityId')

            const [country, city] = await Promise.all([geoModel.findActiveCountry(countryId), geoModel.findActiveCity(cityId)])
            if (!country) return fail('Country not found.', 'countryId')
            if (!city) return fail('City not found.', 'cityId')
            if (city.countryId !== country.countryId) return fail('The selected city does not belong to the selected country.', 'cityId')

            addressValues.state = String(city.cityId)
            addressValues.country = String(country.countryId)
        }

        if (!hasValue(customerValues) && !hasValue(addressValues) && !hasValue(bankValues)) {
            return fail('Please change at least one field.')
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
            let savedAddressId = existing?.addressId

            if (existing) {
                await addressModel.updateAddress(existing.addressId, addressValues)
            } else {
                savedAddressId = await addressModel.createAddress({
                    customerId: customer.customerId,
                    name: customer.firstName ? customer.firstName.slice(0, 32) : null,
                    ...addressValues,
                    addressType: 'Bill',
                    defaultStatus: 'Y',
                    recivDate: authModel.nowString(),
                })
            }

            // A moved address is found on the map again (Nearby Salons); never fails the update. A change of
            // contact numbers alone keeps the saved position.
            if (LOCATION_FIELDS.some((key) => d[key] !== undefined)) await updateAddressCoordinates(savedAddressId)

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

const formatPhone = (value) => {
    const digits = String(value || '').replace(/\D/g, '')
    if (!digits) return null
    if (/^1800\d{7}$/.test(digits)) return `${digits.slice(0, 4)} ${digits.slice(4, 7)} ${digits.slice(7)}`
    if (/^\d{10}$/.test(digits)) return `${digits.slice(0, 5)} ${digits.slice(5)}`
    return String(value).trim()
}

const getPartnerProfile = async (req, res) => {
    if (!(await validateRequestDevice(req, res))) return

    const parsed = getProfileSchema.safeParse(req.body)

    if (!parsed.success) return sendValidationError(res, parsed.error)

    try {
        const customer = await findLoggedInCustomer(req, res, parsed.data)
        if (!customer) return

        if (customer.customerType !== '1') {
            return res.status(200).json({ success: false, message: 'This feature is only available for Salon Partners.' })
        }

        // buildProfile returns "" for anything not saved
        const profile = await buildProfile(req, customer.customerId)

        // Main number first, then the additional ones, each once: "98765 43210 · 91234 56780"
        const contactNumbers = [...new Set([profile.contactNumber, ...profile.additionalContactNumbers]
            .map((number) => String(number || '').trim()).filter(Boolean))]
        const supportNumber = String(profile.customerSupportNumber || '').trim()
        // "Station Road, Dildarnagar, Uttar Pradesh, 232326" (no country on this screen)
        const displayAddress = [profile.address.address, profile.address.location, profile.address.stateName, profile.address.pinCode]
            .map((part) => String(part || '').trim()).filter(Boolean).join(', ')

        const membershipActive = profile.membership.isActive
        const planName = profile.membership.planName || null

        return res.status(200).json({
            success: true,
            message: 'Profile fetched successfully',
            data: convertNulls({
                title: 'My Salon Profile',
                salonId: profile.customerId,
                // Header card
                logoUrl: profile.logoUrl || null,
                salonName: profile.salonName || null,
                // "Aura Beauty Services Pvt. Ltd." — not stored yet (no company name column), so always blank for now
                companyName: null,
                ownerName: profile.ownerName || null,
                // "Membership Active" and "Salon" chips
                badges: [
                    { key: 'membership', label: membershipActive ? 'Membership Active' : 'No Active Membership', isActive: membershipActive ? 1 : 0 },
                    ...(profile.serviceTypeLabel ? [{ key: 'serviceType', label: profile.serviceTypeLabel, isActive: 1 }] : []),
                ],
                serviceType: profile.serviceType || null,
                serviceTypeLabel: profile.serviceTypeLabel || null,
                profileCompletion: profile.profileCompletion,
                profileCompletionLabel: `${profile.profileCompletion}%`,
                // Details card
                emailId: profile.emailId || null,
                contactNumbers,
                contactNumbersLabel: contactNumbers.map(formatPhone).join(' · ') || null,
                customerSupportNumber: supportNumber || null,
                customerSupportNumberLabel: formatPhone(supportNumber),
                address: {
                    ...profile.address,
                    displayAddress: displayAddress || null,
                },
                // "Professional Plan · Active"
                membership: {
                    isActive: membershipActive ? 1 : 0,
                    planName,
                    status: membershipActive ? 'Active' : 'Inactive',
                    validUntil: profile.membership.validUntil || null,
                    label: membershipActive ? [planName, 'Active'].filter(Boolean).join(' · ') : 'No active membership',
                },
            }),
        })
    } catch (err) {
        console.error('Partner profile error:', err)
        return res.status(200).json({ success: false, message: 'Something went wrong' })
    }
}

module.exports = { getProfile, getPartnerProfile, updateProfile, changePassword, findLoggedInCustomer }