const { z } = require('zod')
const { sendValidationError } = require('../utils/validationError')
const authModel = require('../models/auth.model')
const walletModel = require('../models/wallet.model')
const { validateRequestDevice } = require('./device&app.controller')
const { findLoggedInCustomer } = require('./profile.controller')
const { rupees } = require('./service.controller')
const { convertNulls } = require('../utils/convertNulls')

const DEFAULT_PAGE_SIZE = 10
const MAX_PAGE_SIZE = 50

// Add Money sheet
const QUICK_AMOUNTS = [500, 1000, 2000, 5000]
const MIN_TOPUP = 10
const MAX_TOPUP = 50000

// How each kind of transaction shows in Transaction History
const CATEGORIES = {
    cashback: { title: 'Cashback', typeLabel: 'Cashback', icon: 'gift' },
    refund: { title: 'Refund received', typeLabel: 'Credit', icon: 'arrow_down' },
    topup: { title: 'Money added', typeLabel: 'Credit', icon: 'arrow_down' },
    order_payment: { title: 'Paid for order', typeLabel: 'Debit', icon: 'arrow_up' },
    booking_payment: { title: 'Paid for booking', typeLabel: 'Debit', icon: 'arrow_up' },
}

// The filter chips, in screen order
const FILTER_LABELS = { cashback: 'Cashback', credits: 'Credits', debits: 'Debits' }

const deviceFields = {
    app_id: z.union([z.string(), z.number()]),
    device_id: z.string().trim().min(1, 'Device ID is required'),
}

const walletDetailsSchema = z.object({
    ...deviceFields,
    // "All", blank, null or missing means every transaction; "credit"/"debit" work too
    filter: z.preprocess(
        (value) => {
            if (typeof value !== 'string') return value
            const key = value.trim().toLowerCase()
            if (key === 'all') return undefined
            return { credit: 'credits', debit: 'debits' }[key] ?? key
        },
        z.enum(walletModel.TRANSACTION_FILTER_KEYS, { error: 'Filter must be one of: all, cashback, credits, debits' }).optional()
    ),
    page: z.coerce.number({ error: 'Page must be a number' }).int('Page must be a whole number').min(1, 'Page must be 1 or more').optional(),
    limit: z.coerce.number({ error: 'Limit must be a number' })
        .int('Limit must be a whole number')
        .min(1, 'Limit must be 1 or more')
        .max(MAX_PAGE_SIZE, `Limit can be at most ${MAX_PAGE_SIZE}`)
        .optional(),
}).strict()

const addMoneySchema = z.object({
    ...deviceFields,
    // "₹1,000" or "1000"
    amount: z.preprocess(
        (value) => (typeof value === 'string' ? value.replace(/[₹,\s]/g, '') : value),
        z.coerce.number({ error: 'Please enter an amount' })
            .min(MIN_TOPUP, `Minimum amount is ${rupees(MIN_TOPUP)}`)
            .max(MAX_TOPUP, `Maximum amount is ${rupees(MAX_TOPUP)}`)
            .refine((value) => Number.isInteger(Math.round(value * 100 * 1e6) / 1e6), 'Amount can have at most 2 decimal places')
    ),
    paymentMethod: z.string().trim().max(100, 'Payment method can be up to 100 characters').optional(),
}).strict()

// Saved times are UTC (authModel.nowString); shown as the salon-time date: "05 Oct 2026"
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const dateLabel = (utcDateTime) => {
    const date = new Date(`${String(utcDateTime).replace(' ', 'T')}Z`)
    if (Number.isNaN(date.getTime())) return null
    const parts = Object.fromEntries(
        new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' })
            .formatToParts(date).map((part) => [part.type, part.value])
    )
    return `${parts.day} ${MONTHS[Number(parts.month) - 1]} ${parts.year}`
}

// Received / Paid once completed, otherwise Pending / Failed
const statusText = (row) => {
    if (row.status === '0') return 'Pending'
    if (row.status === '2') return 'Failed'
    return row.transactionType === 'credit' ? 'Received' : 'Paid'
}

// paise, so sums never drift
const toPaise = (value) => Math.round(Number(value) * 100)

const formatTransaction = (row) => {
    const category = CATEGORIES[row.category]
    const credit = row.transactionType === 'credit'
    const amount = Number(row.amount)
    const date = dateLabel(row.transactionAddedDate)

    return {
        transactionId: row.transactionId,
        title: category.title,
        icon: category.icon,
        category: row.category,
        transactionType: row.transactionType,
        typeLabel: category.typeLabel,
        status: row.status,
        statusText: statusText(row),
        referenceNumber: row.referenceNumber,
        description: row.description,
        // "Cashback · Received · ORD-71842 · 05 Oct 2026"
        subtitle: [category.typeLabel, statusText(row), row.referenceNumber || row.description, date].filter(Boolean).join(' · '),
        amount,
        // "+ ₹150" / "− ₹548"
        amountLabel: `${credit ? '+' : '−'} ${rupees(amount)}`,
        date,
        transactionAddedDate: row.transactionAddedDate,
    }
}

const balanceOf = (summary) => (toPaise(summary.cashback) + toPaise(summary.credits) - toPaise(summary.debits)) / 100

// "Beaunic Wallet": balance, the three summary boxes and one page of Transaction History
const getWalletDetails = async (req, res) => {
    if (!(await validateRequestDevice(req, res))) return

    const parsed = walletDetailsSchema.safeParse(req.body)

    if (!parsed.success) return sendValidationError(res, parsed.error)

    const { filter } = parsed.data
    const page = parsed.data.page ?? 1
    const limit = parsed.data.limit ?? DEFAULT_PAGE_SIZE

    try {
        // The wallet of the logged-in customer only (ID from the token)
        const customer = await findLoggedInCustomer(req, res, parsed.data)
        if (!customer) return

        const [summary, total, rows] = await Promise.all([
            walletModel.findWalletSummary(customer.customerId),
            walletModel.countTransactions(customer.customerId, { filter }),
            walletModel.findTransactions(customer.customerId, { filter, limit, offset: (page - 1) * limit }),
        ])

        const balance = balanceOf(summary)
        const totalPages = Math.ceil(total / limit)

        return res.status(200).json({
            success: true,
            message: rows.length
                ? 'Wallet details fetched successfully'
                : total ? 'No more transactions' : 'No transactions yet',
            data: convertNulls({
                balance,
                balanceLabel: rupees(balance),
                summary: {
                    cashback: summary.cashback,
                    cashbackLabel: rupees(summary.cashback),
                    credits: summary.credits,
                    creditsLabel: rupees(summary.credits),
                    debits: summary.debits,
                    debitsLabel: rupees(summary.debits),
                },
                filters: [
                    { key: 'all', label: 'All', isSelected: !filter },
                    ...walletModel.TRANSACTION_FILTER_KEYS.map((key) => ({ key, label: FILTER_LABELS[key], isSelected: key === filter })),
                ],
                selectedFilter: filter ?? 'all',
                transactions: rows.map(formatTransaction),
                pagination: { page, limit, total, totalPages, hasNextPage: page < totalPages },
                // The Add Money sheet
                addMoney: { quickAmounts: QUICK_AMOUNTS, minAmount: MIN_TOPUP, maxAmount: MAX_TOPUP },
            }),
        })
    } catch (err) {
        console.error('Wallet details error:', err)
        return res.status(200).json({ success: false, message: 'Something went wrong' })
    }
}

// "Add Money": tops up the logged-in customer's wallet
const addMoney = async (req, res) => {
    if (!(await validateRequestDevice(req, res))) return

    const parsed = addMoneySchema.safeParse(req.body)

    if (!parsed.success) return sendValidationError(res, parsed.error)

    const amount = toPaise(parsed.data.amount) / 100

    try {
        const customer = await findLoggedInCustomer(req, res, parsed.data)
        if (!customer) return

        // No payment gateway is connected yet, so the top-up is credited straight away
        const values = {
            customerId: customer.customerId,
            transactionType: 'credit',
            category: 'topup',
            amount: amount.toFixed(2),
            referenceNumber: null,
            referenceId: 0,
            description: 'Wallet top-up',
            paymentMethod: parsed.data.paymentMethod || null,
            status: '1',
            transactionAddedDate: authModel.nowString(),
        }
        const transactionId = await walletModel.addTransaction(values)
        const balance = balanceOf(await walletModel.findWalletSummary(customer.customerId))

        return res.status(200).json({
            success: true,
            message: `${rupees(amount)} added to your wallet`,
            data: convertNulls({
                transaction: formatTransaction({ ...values, transactionId }),
                balance,
                balanceLabel: rupees(balance),
            }),
        })
    } catch (err) {
        console.error('Add money error:', err)
        return res.status(200).json({ success: false, message: 'Something went wrong' })
    }
}

module.exports = { getWalletDetails, addMoney, dateLabel }
