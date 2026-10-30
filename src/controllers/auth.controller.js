const fs = require('fs/promises')
const path = require('path')
const crypto = require('crypto')
const { z } = require('zod')
const bcrypt = require('bcryptjs')
const authModel = require('../models/auth.model')
const membershipModel = require('../models/membership.model')
const { validateRequestDevice } = require('./device&app.controller')
const env = require('../config/env')
const { generateToken } = require('../config/jwtToken')
const { sendOtp } = require('../utils/sendOtp')
const { convertNulls } = require('../utils/convertNulls')

const noMarkup = (v) => !/[<>]/.test(v)

const UPLOAD_DIR = path.join(__dirname, `${env.uploadDir}`, 'salon_logos')

const OTP_EXPIRY_MINUTES = 5
const OTP_RESEND_COOLDOWN_SECONDS = 60
const MAX_LOGIN_TRIES = 5
const LOGIN_BLOCK_MINUTES = 30

const ACCOUNT_STATUS_ERRORS = {
    '0': 'Your account is inactive. Please contact support to activate it.',
    '2': 'This account has been deleted. Please contact support.',
    '3': 'Guest accounts cannot log in. Please register to continue.',
}

const detectImageExt = (buf) => {
    if (!Buffer.isBuffer(buf)) return null

    const png = Buffer.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a
    ])
    if (buf.length >= 8 && buf.subarray(0, 8).equals(png)) {
        return '.png'
    }

    if (
        buf.length >= 3 &&
        buf[0] === 0xff &&
        buf[1] === 0xd8 &&
        buf[2] === 0xff
    ) {
        return '.jpg'
    }

    if (
        buf.length >= 12 &&
        buf.toString('ascii', 0, 4) === 'RIFF' &&
        buf.toString('ascii', 8, 12) === 'WEBP'
    ) {
        return '.webp'
    }

    if (
        buf.length >= 12 &&
        buf.toString('ascii', 4, 8) === 'ftyp'
    ) {
        const brand = buf.toString('ascii', 8, 12)

        if (['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'mif1', 'msf1'].includes(brand)) {
            return '.heic'
        }
    }

    return null
}

const registerSchema = z
    .object({
        appId: z.string().trim().min(1, 'App ID is required').max(255),
        deviceId: z.string().trim().min(1, 'Device ID is required'),
        appType: z.string().trim().min(1, 'App Type is required').max(255),
        customerType: z.enum(['1', '2']).optional(),
        name: z.string().trim().min(2).max(32).regex(/^[\p{L}\p{M} .'-]+$/u, 'Invalid characters in name'),
        contactNumber: z.string().trim().regex(/^\d{10}$/, 'Must be a 10-digit mobile number'),
        emailId: z.string().trim().toLowerCase().max(80).email('Invalid email'),
        password: z.string().min(8, 'Minimum 8 characters').max(72),
        confirmPassword: z.string(),
        serviceType: z.preprocess(
            (value) => value === '' ? undefined : value,
            z.enum(['salon', 'home_service']).optional()
        ),

        salonName: z.preprocess(
            (value) => value === '' ? undefined : value,
            z.string()
                .trim()
                .min(2)
                .max(100)
                .refine(noMarkup, 'Invalid characters')
                .optional()
        ),
    })
    .strict()
    .superRefine((d, ctx) => {
        const issue = (path, message) => ctx.addIssue({ code: 'custom', path: [path], message })

        if (d.password !== d.confirmPassword) issue('confirmPassword', 'Passwords do not match')

        if (d.customerType === '1') {
            if (!d.serviceType) {
                issue('serviceType', 'Required for Salon Partner')
            }

            if (!d.salonName) {
                issue('salonName', 'Required for Salon Partner')
            }
        }
    })

const loginSchema = z
    .object({
        app_id: z.union([z.string(), z.number()]),
        device_id: z.string().trim().min(1, 'Device ID is required'),
        emailOrMobile: z.string().trim().min(1, "Email or mobile number is required"),
        password: z.string().min(1).optional(),
    })
    .strict()
    .superRefine((data, ctx) => {
        const isEmail = z.string().email().safeParse(
            data.emailOrMobile.toLowerCase()
        ).success

        const isMobile = /^\d{10}$/.test(data.emailOrMobile)

        if (!isEmail && !isMobile) {
            ctx.addIssue({
                code: "custom",
                path: ["emailOrMobile"],
                message: "Enter a valid email or 10-digit mobile number",
            })
        }

        if (isEmail && !data.password) {
            ctx.addIssue({
                code: "custom",
                path: ["password"],
                message: "Password is required for email login",
            })
        }

        if (data.password && data.password.length > 72) {
            ctx.addIssue({
                code: "custom",
                path: ["password"],
                message: "Password cannot exceed 72 characters",
            })
        }
    })

const otpSchema = z.object({
    app_id: z.union([z.string(), z.number()]),
    device_id: z.string().trim().min(1, 'Device ID is required'),
    mobileNumber: z.string().trim().regex(
        /^\d{10}$/,
        "Enter a valid 10-digit mobile number"
    ),
    otp: z.string().regex(/^\d{6}$/, "OTP must be 6 digits"),
}).strict()

const resendOtpSchema = otpSchema.pick({
    app_id: z.union([z.string(), z.number()]),
    device_id: z.string().trim().min(1, 'Device ID is required'),
    mobileNumber: true
})

const accountStatusSchema = z.object({
    app_id: z.union([z.string(), z.number()]),
    device_id: z.string().trim().min(1, 'Device ID is required'),
    customerId: z.coerce.number({ error: 'Customer ID is required' }).int().positive('Customer ID is required'),
}).strict()

const SALON_ONBOARDING_STEPS = [
    { key: 'registration_submitted', title: 'Registration submitted' },
    { key: 'admin_review', title: 'Admin review' },
    { key: 'choose_membership', title: 'Choose membership' },
    { key: 'complete_salon_profile', title: 'Complete salon profile' },
]

const ACCOUNT_STATUS_LABELS = {
    '0': 'Awaiting Admin Approval',
    '1': 'Approved',
}

const sendValidationError = (res, error) =>
    res.status(200).json({
        success: false,
        message: 'Validation failed',
        errors: error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
    })

const parseDbDate = (value) => {
    if (!value) return null
    const date = new Date(`${value.replace(' ', 'T')}Z`)
    return Number.isNaN(date.getTime()) ? null : date
}

const getLockError = (customer) => {
    if (customer.isBlocked !== '1') return null

    const blockedAt = parseDbDate(customer.blockTime)
    if (!blockedAt) {
        return { status: 200, message: 'Your account has been blocked. Please contact support.' }
    }

    const unblockAt = blockedAt.getTime() + LOGIN_BLOCK_MINUTES * 60 * 1000
    if (unblockAt > Date.now()) {
        const minutes = Math.ceil((unblockAt - Date.now()) / 60000)
        return { status: 200, message: `Too many failed attempts. Please try again in ${minutes} minute(s).` }
    }

    return null
}

const getStatusError = (customer) => {
    const message = ACCOUNT_STATUS_ERRORS[customer.status]
    return message ? { status: 200, message } : null
}

const sendError = (res, { status, message }) => res.status(status).json({ success: false, message })

const registerFailedAttempt = async (res, customer, message) => {
    const tries = (customer.isBlocked === '1' ? 0 : customer.numberOfLoginTry) + 1
    const attemptsLeft = MAX_LOGIN_TRIES - tries

    await authModel.recordFailedLogin(customer.customerId, tries, attemptsLeft <= 0)

    return res.status(200).json({
        success: false,
        message: attemptsLeft > 0
            ? `${message} ${attemptsLeft} attempt(s) left.`
            : `Too many failed attempts. Your account is locked for ${LOGIN_BLOCK_MINUTES} minutes.`,
    })
}

const completeLogin = async (res, customer) => {
    await authModel.recordSuccessfulLogin(customer.customerId, customer.currentLogin)

    return res.status(200).json({
        success: true,
        message: 'Login successful',
        data: {
            token: generateToken(customer),
            customer: convertNulls({
                customerId: customer.customerId,
                name: customer.firstName,
                emailId: customer.userName,
                contactNumber: customer.mobileNumber,
                customerType: customer.customerType,
                serviceType: customer.serviceType,
                salonName: customer.salonName,
                loginType: customer.loginType,
            }),
        },
    })
}

const issueOtp = async (res, customer, message) => {
    const sentAt = parseDbDate(customer.loginDateTime)
    if (sentAt) {
        const waitSeconds = Math.ceil((sentAt.getTime() + OTP_RESEND_COOLDOWN_SECONDS * 1000 - Date.now()) / 1000)
        if (waitSeconds > 0) {
            return res.status(429).json({
                success: false,
                message: `Please wait ${waitSeconds} second(s) before requesting a new OTP.`,
            })
        }
    }

    const otp = crypto.randomInt(0, 1000000).toString().padStart(6, '0')
    await authModel.saveLoginOtp(customer.mobileNumber, otp)
    await sendOtp(customer.mobileNumber, otp)

    return res.status(200).json({
        success: true,
        message,
        data: {
            mobileNumber: customer.mobileNumber,
            otp,
            expiresInMinutes: OTP_EXPIRY_MINUTES,
        },
    })
}

const findLoginCustomerByMobile = async (res, mobileNumber) => {
    const customer = await authModel.findByMobile(mobileNumber)
    if (!customer) {
        sendError(res, { status: 200, message: 'No account found with this mobile number. Please register first.' })
        return null
    }

    const error = getLockError(customer) || getStatusError(customer)
    if (error) {
        sendError(res, error)
        return null
    }

    return customer
}

const hasPendingOtp = (customer) => Boolean(customer.loginOtp) && customer.isOtpVerified !== '1'

const register = async (req, res) => {
    const parsed = registerSchema.safeParse(req.body)
    if (!parsed.success) {
        return res.status(200).json({
            success: false,
            message: 'Validation failed',
            errors: parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
        })
    }
    const d = parsed.data

    let logoName = null
    if (req.file) {
        if (d.customerType !== '1') {
            return res.status(200).json({ success: false, message: 'Logo is only allowed for Salon Partner' })
        }
        const ext = detectImageExt(req.file.buffer)
        if (!ext) {
            return res.status(200).json({ success: false, message: 'Logo must be a PNG or JPG image' })
        }
        logoName = crypto.randomBytes(12).toString('hex') + ext
    }

    try {
        if (await authModel.findByEmailOrMobile(d.emailId, d.contactNumber)) {
            return res.status(200).json({
                success: false,
                message: 'An account with this email or mobile number already exists',
            })
        }

        if (logoName) {
            await fs.mkdir(UPLOAD_DIR, { recursive: true })
            await fs.writeFile(path.join(UPLOAD_DIR, logoName), req.file.buffer)
        }

        const customerId = await authModel.create({
            appId: d.appId,
            deviceId: d.deviceId,
            appType: d.appType,
            userName: d.emailId,
            mobileNumber: d.contactNumber,
            firstName: d.name,
            customerPhoto: logoName,
            passwordHash: await bcrypt.hash(d.password, 12),
            isVerified: '1',
            customerType: d.customerType,
            serviceType: d.customerType === '1' ? d.serviceType : null,
            salonName: d.customerType === '1' ? d.salonName : null,
            ipAddress: req.ip,
        })

        return res.status(201).json({
            success: true,
            message: 'Registration successful',
            data: { customerId },
        })
    } catch (err) {
        if (logoName) await fs.unlink(path.join(UPLOAD_DIR, logoName)).catch(() => { })
        const code = err.code || err.cause?.code
        if (code === 'ER_DUP_ENTRY') {
            return res.status(200).json({
                success: false,
                message: 'An account with this email or mobile number already exists',
            })
        }
        console.error('Registration error:', err)
        return res.status(200).json({ success: false, message: 'Something went wrong' })
    }
}

const getProfileProgress = async (customerId) => {
    const [activeMembership, salonAdd] = await Promise.all([
        membershipModel.findActiveMembership(customerId),
        authModel.hasAddress(customerId),
    ])

    return {
        membership: Boolean(activeMembership),
        salonAdd,
    }
}

const getProfileError = async (customer) => {
    if (customer.customerType !== '1') return null

    const { membership, salonAdd } = await getProfileProgress(customer.customerId)

    if (membership && salonAdd) return null

    return { status: 200, message: 'Please complete your profile first.' }
}

const loginWithPassword = async (res, email, password) => {
    const customer = await authModel.findByEmail(email)
    if (!customer) {
        return res.status(200).json({ success: false, message: 'Invalid email or password.' })
    }

    const lockError = getLockError(customer)
    if (lockError) return sendError(res, lockError)

    if (!(await bcrypt.compare(password, customer.password))) {
        return registerFailedAttempt(res, customer, 'Invalid email or password.')
    }

    const statusError = getStatusError(customer)
    if (statusError) return sendError(res, statusError)

    if (customer.isVerified !== '1' && customer.status !== '1') {
        return res.status(200).json({
            success: false,
            message: 'Your account is not verified yet. Please verify your account to continue.',
        })
    }

    const profileError = await getProfileError(customer)
    if (profileError) return sendError(res, profileError)

    return completeLogin(res, customer)
}

const loginWithMobile = async (res, mobileNumber) => {
    const customer = await findLoginCustomerByMobile(res, mobileNumber)
    if (!customer) return

    const profileError = await getProfileError(customer)
    if (profileError) return sendError(res, profileError)

    return issueOtp(res, customer, 'OTP sent to your registered mobile number')
}


const login = async (req, res) => {
    if (!(await validateRequestDevice(req, res))) return

    const parsed = loginSchema.safeParse(req.body)

    if (!parsed.success) return sendValidationError(res, parsed.error)

    const { emailOrMobile, password } = parsed.data

    try {
        if (/^\d{10}$/.test(emailOrMobile)) {
            return await loginWithMobile(res, emailOrMobile)
        }
        return await loginWithPassword(res, emailOrMobile.toLowerCase(), password)
    } catch (err) {
        console.error('Login error:', err)
        return res.status(200).json({ success: false, message: 'Something went wrong' })
    }
}

const verifyOtp = async (req, res) => {
    if (!(await validateRequestDevice(req, res))) return

    const parsed = otpSchema.safeParse(req.body)

    if (!parsed.success) return sendValidationError(res, parsed.error)

    const { mobileNumber, otp } = parsed.data

    try {
        const customer = await findLoginCustomerByMobile(res, mobileNumber)
        if (!customer) return

        if (!hasPendingOtp(customer)) {
            return res.status(200).json({ success: false, message: 'No active OTP found. Please request a new OTP.' })
        }

        const sentAt = parseDbDate(customer.loginDateTime)
        if (!sentAt || Date.now() > sentAt.getTime() + OTP_EXPIRY_MINUTES * 60 * 1000) {
            return res.status(200).json({ success: false, message: 'OTP has expired. Please request a new OTP.' })
        }

        const profileError = await getProfileError(customer)
        if (profileError) return sendError(res, profileError)

        if (otp !== customer.loginOtp || !(await authModel.verifyLoginOtp(mobileNumber, otp))) {
            return registerFailedAttempt(res, customer, 'Invalid OTP.')
        }

        return completeLogin(res, customer)
    } catch (err) {
        console.error('OTP verification error:', err)
        return res.status(200).json({ success: false, message: 'Something went wrong' })
    }
}

const resendOtp = async (req, res) => {
    if (!(await validateRequestDevice(req, res))) return

    const parsed = resendOtpSchema.safeParse(req.body)

    if (!parsed.success) return sendValidationError(res, parsed.error)

    try {
        const customer = await findLoginCustomerByMobile(res, parsed.data.mobileNumber)
        if (!customer) return

        if (!hasPendingOtp(customer)) {
            return res.status(200).json({
                success: false,
                message: 'No pending OTP request found. Please log in with your mobile number first.',
            })
        }

        return await issueOtp(res, customer, 'A new OTP has been sent to your registered mobile number')
    } catch (err) {
        console.error('Resend OTP error:', err)
        return res.status(200).json({ success: false, message: 'Something went wrong' })
    }
}

const accountStatus = async (req, res) => {
    if (!(await validateRequestDevice(req, res))) return

    const parsed = accountStatusSchema.safeParse(req.body)

    if (!parsed.success) return sendValidationError(res, parsed.error)

    const { app_id, device_id, customerId } = parsed.data

    try {
        const customer = await authModel.findByIdAndDevice(customerId, String(app_id).trim(), device_id)
        if (!customer) {
            return res.status(200).json({ success: false, message: 'Account not found for this device.' })
        }

        if (customer.customerType !== '1') {
            return res.status(200).json({ success: false, message: 'Account status is only available for Salon Partners.' })
        }

        const label = ACCOUNT_STATUS_LABELS[customer.status]
        if (!label) {
            return sendError(res, { status: 200, message: ACCOUNT_STATUS_ERRORS[customer.status] })
        }

        const { membership, salonAdd } = await getProfileProgress(customer.customerId)

        const currentStep = customer.status !== '1' ? 2
            : !membership ? 3
            : !salonAdd ? 4
            : 5

        return res.status(200).json({
            success: true,
            message: 'Account status fetched successfully',
            data: {
                customerId: customer.customerId,
                account_status: customer.status,
                membership,
                salon_add: salonAdd,
                accountStatusLabel: label,
                currentStep,
                steps: SALON_ONBOARDING_STEPS.map((step, index) => {
                    const stepNumber = index + 1
                    return {
                        step: stepNumber,
                        ...step,
                        status: stepNumber < currentStep
                            ? 'completed'
                            : stepNumber === currentStep ? 'current' : 'pending',
                    }
                }),
            },
        })
    } catch (err) {
        console.error('Account status error:', err)
        return res.status(200).json({ success: false, message: 'Something went wrong' })
    }
}

module.exports = { register, login, verifyOtp, resendOtp, accountStatus, detectImageExt, UPLOAD_DIR }