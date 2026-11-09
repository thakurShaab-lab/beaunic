const crypto = require('crypto')
const { z } = require('zod')
const { sendValidationError } = require('../utils/validationError')
const authModel = require('../models/auth.model')
const referralModel = require('../models/referral.model')
const walletModel = require('../models/wallet.model')
const { validateRequestDevice } = require('./device&app.controller')
const { findLoggedInCustomer } = require('./profile.controller')
const { rupees } = require('./service.controller')
const { dateLabel } = require('./wallet.controller')
const { convertNulls } = require('../utils/convertNulls')

const CODE_PREFIX = 'BEAU-'
const HISTORY_LIMIT = 20

const HOW_IT_WORKS = [
    { step: 1, text: 'Share your code with friends and family.' },
    { step: 2, text: 'They sign up and complete their first booking or order.' },
    { step: 3, text: 'Cashback is credited to your Beaunic Wallet as per the referral terms.' },
]

const CASHBACK_NOTE = 'Cashback amounts and eligibility are set by Beaunic and shown here once configured. Cashback can be used at checkout.'

const HISTORY_STATUS_LABELS = { pending: 'Pending', credited: 'Credited', cancelled: 'Cancelled' }

const deviceFields = {
    app_id: z.union([z.string(), z.number()]),
    device_id: z.string().trim().min(1, 'Device ID is required'),
}

const referralDetailsSchema = z.object(deviceFields).strict()

const applyReferralSchema = z.object({
    ...deviceFields,
    referralCode: z.string({ error: 'Please enter a referral code' })
        .trim()
        .min(1, 'Please enter a referral code')
        .max(20, 'Invalid referral code.')
        .regex(/^[A-Za-z0-9-]+$/, 'Invalid referral code.'),
}).strict()

// "Gulshan Mudgal" -> "GM", "Asha" -> "AS"; letters only, "BU" (Beaunic) when there are none
const initialsOf = (name) => {
    const words = String(name || '').toUpperCase().replace(/[^A-Z\s]/g, '').split(/\s+/).filter(Boolean)
    if (words.length >= 2) return words[0][0] + words[1][0]
    if (words.length === 1) return words[0].slice(0, 2).padEnd(2, 'X')
    return 'BU'
}

// The customer's code, made (and saved) the first time it's needed: "BEAU-GM4821"
const getOrCreateReferralCode = async (customer) => {
    const existing = await referralModel.findReferralCode(customer.customerId)
    if (existing) return existing.referralCode

    const initials = initialsOf(customer.firstName)
    for (let attempt = 0; attempt < 10; attempt += 1) {
        const referralCode = `${CODE_PREFIX}${initials}${crypto.randomInt(1000, 10000)}`
        try {
            await referralModel.createReferralCode({
                customerId: customer.customerId,
                referralCode,
                referralCodeAddedDate: authModel.nowString(),
            })
            return referralCode
        } catch (err) {
            if ((err.code || err.cause?.code) !== 'ER_DUP_ENTRY') throw err
            // Opened twice at once: the other request already saved this customer's code
            const saved = await referralModel.findReferralCode(customer.customerId)
            if (saved) return saved.referralCode
            // Otherwise the code belongs to someone else; try another number
        }
    }

    throw new Error('Could not create a unique referral code')
}

const amountLabel = (amount) => (amount !== null && amount !== undefined ? rupees(amount) : '₹ —')

// "Cashback & Refer": the customer's code, how it works and their cashback history
const getReferralDetails = async (req, res) => {
    if (!(await validateRequestDevice(req, res))) return

    const parsed = referralDetailsSchema.safeParse(req.body)

    if (!parsed.success) return sendValidationError(res, parsed.error)

    try {
        const customer = await findLoggedInCustomer(req, res, parsed.data)
        if (!customer) return

        const [referralCode, referrals, cashbacks] = await Promise.all([
            getOrCreateReferralCode(customer),
            referralModel.findReferralsByReferrer(customer.customerId, HISTORY_LIMIT),
            walletModel.findCashbackTransactions(customer.customerId, HISTORY_LIMIT),
        ])

        // People who joined with the code, and cashback credited to the wallet, newest first
        const history = [
            ...referrals.map((row) => ({
                type: 'referral',
                id: row.referralId,
                title: `${[row.firstName, row.lastName].filter(Boolean).join(' ').trim() || 'Someone'} joined using your code`,
                status: row.status,
                statusLabel: HISTORY_STATUS_LABELS[row.status],
                amount: row.cashbackAmount !== null ? Number(row.cashbackAmount) : null,
                amountLabel: amountLabel(row.cashbackAmount),
                sortDate: row.referralAddedDate || '',
                date: dateLabel(row.referralAddedDate),
            })),
            ...cashbacks.map((row) => ({
                type: 'cashback',
                id: row.transactionId,
                title: row.referenceNumber ? `Cashback on ${row.referenceNumber}` : row.description || 'Cashback',
                status: row.status === '1' ? 'credited' : row.status === '0' ? 'pending' : 'cancelled',
                statusLabel: row.status === '1' ? 'Credited' : row.status === '0' ? 'Pending' : 'Failed',
                amount: Number(row.amount),
                amountLabel: amountLabel(row.amount),
                sortDate: row.transactionAddedDate || '',
                date: dateLabel(row.transactionAddedDate),
            })),
        ]
            .sort((a, b) => (a.sortDate < b.sortDate ? 1 : a.sortDate > b.sortDate ? -1 : 0))
            .slice(0, HISTORY_LIMIT)
            .map(({ sortDate, ...item }) => ({ ...item, subtitle: [item.date, item.amountLabel].filter(Boolean).join(' · ') }))

        return res.status(200).json({
            success: true,
            message: 'Referral details fetched successfully',
            data: convertNulls({
                title: 'Share Beaunic, earn cashback together',
                // No referral reward is configured yet
                referralBenefit: null,
                referralBenefitLabel: 'Referral benefit: set by Beaunic',
                referralCode,
                shareMessage: `Join me on Beaunic! Use my referral code ${referralCode} when you sign up.`,
                howItWorks: HOW_IT_WORKS,
                note: CASHBACK_NOTE,
                cashbackHistory: history,
            }),
        })
    } catch (err) {
        console.error('Referral details error:', err)
        return res.status(200).json({ success: false, message: 'Something went wrong' })
    }
}

// A new customer enters a friend's code (before their first booking)
const applyReferralCode = async (req, res) => {
    if (!(await validateRequestDevice(req, res))) return

    const parsed = applyReferralSchema.safeParse(req.body)

    if (!parsed.success) return sendValidationError(res, parsed.error)

    try {
        const customer = await findLoggedInCustomer(req, res, parsed.data)
        if (!customer) return

        const owner = await referralModel.findReferralCodeOwner(parsed.data.referralCode)
        if (!owner) return res.status(200).json({ success: false, message: 'Invalid referral code.', field: 'referralCode' })

        if (owner.customerId === customer.customerId) {
            return res.status(200).json({ success: false, message: 'You can\'t use your own referral code.', field: 'referralCode' })
        }

        if (await referralModel.findReferralOf(customer.customerId)) {
            return res.status(200).json({ success: false, message: 'You have already used a referral code.' })
        }

        if ((await referralModel.countCustomerBookings(customer.customerId)) > 0) {
            return res.status(200).json({ success: false, message: 'Referral codes can only be used before your first booking.' })
        }

        const now = authModel.nowString()
        const referralId = await referralModel.createReferral({
            referrerId: owner.customerId,
            referredId: customer.customerId,
            referralCode: owner.referralCode,
            // Set when Beaunic configures the referral reward
            cashbackAmount: null,
            status: 'pending',
            referralAddedDate: now,
        })

        return res.status(200).json({
            success: true,
            message: 'Referral code applied successfully',
            data: convertNulls({
                referralId,
                referralCode: owner.referralCode,
                status: 'pending',
                statusLabel: 'Pending',
                referralAddedDate: now,
            }),
        })
    } catch (err) {
        // Two requests at once: the unique key lets only one referral through
        if ((err.code || err.cause?.code) === 'ER_DUP_ENTRY') {
            return res.status(200).json({ success: false, message: 'You have already used a referral code.' })
        }
        console.error('Apply referral error:', err)
        return res.status(200).json({ success: false, message: 'Something went wrong' })
    }
}

module.exports = { getReferralDetails, applyReferralCode }
