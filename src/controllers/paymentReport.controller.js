const { z } = require('zod')
const { sendValidationError } = require('../utils/validationError')
const paymentReportModel = require('../models/paymentReport.model')
const { validateRequestDevice } = require('./device&app.controller')
const { findLoggedInCustomer } = require('./profile.controller')
const { salonNow } = require('./slot.controller')
const { rupees } = require('./service.controller')
const { convertNulls } = require('../utils/convertNulls')
const { istDateLabels } = require('../utils/istDateLabels')

const DEFAULT_PAGE_SIZE = 10
const MAX_PAGE_SIZE = 50

// The tabs, in screen order
const PERIODS = [
    { key: 'this_week', label: 'This week' },
    { key: 'this_month', label: 'This month' },
    { key: 'all', label: 'All' },
]

// "Sort: Newest" / "Sort: Amount"
const SORTS = [
    { key: 'newest', label: 'Newest' },
    { key: 'amount', label: 'Amount' },
]

const MODES = {
    online: { label: 'Online', icon: 'online' },
    cash: { label: 'Cash', icon: 'cash' },
}

const lowerKey = (value) => (typeof value === 'string' ? value.trim().toLowerCase().replace(/[\s-]+/g, '_') : value)

const deviceFields = {
    app_id: z.union([z.string(), z.number()]),
    device_id: z.string().trim().min(1, 'Device ID is required'),
}

// period and sortBy are optional: This month, Newest first, page 1 of 10 by default
const paymentReportSchema = z.object({
    ...deviceFields,
    period: z.preprocess(lowerKey, z.enum(PERIODS.map((p) => p.key), { error: 'Period must be this_week, this_month or all' }).optional()),
    sortBy: z.preprocess(lowerKey, z.enum(SORTS.map((s) => s.key), { error: 'Sort must be newest or amount' }).optional()),
    page: z.coerce.number({ error: 'Page must be a number' }).int('Page must be a whole number').min(1, 'Page must be 1 or more').optional(),
    limit: z.coerce.number({ error: 'Limit must be a number' })
        .int('Limit must be a whole number')
        .min(1, 'Limit must be 1 or more')
        .max(MAX_PAGE_SIZE, `Limit can be at most ${MAX_PAGE_SIZE}`)
        .optional(),
}).strict()

// Salon Partners only (customer_type 1)
const findSalonPartner = async (req, res, data) => {
    const customer = await findLoggedInCustomer(req, res, data)
    if (!customer) return null

    if (customer.customerType !== '1') {
        res.status(200).json({ success: false, message: 'This feature is only available for Salon Partners.' })
        return null
    }

    return customer
}

// Midnight in Indian time on an Indian date ("2026-10-05"), as the UTC datetime the database stores
const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000
const istMidnightAsUtc = (isoDate) => {
    const [year, month, day] = isoDate.split('-').map(Number)
    return new Date(Date.UTC(year, month - 1, day) - IST_OFFSET_MS).toISOString().slice(0, 19).replace('T', ' ')
}

// Where the period starts (UTC), by the salon's calendar: the week starts on Monday, the month on the 1st.
// All: undefined (no start).
const periodStart = (period) => {
    if (period === 'all') return undefined

    const today = salonNow().date
    if (period === 'this_month') return istMidnightAsUtc(`${today.slice(0, 8)}01`)

    const [year, month, day] = today.split('-').map(Number)
    const date = new Date(Date.UTC(year, month - 1, day))
    const daysSinceMonday = (date.getUTCDay() + 6) % 7
    date.setUTCDate(date.getUTCDate() - daysSinceMonday)
    return istMidnightAsUtc(date.toISOString().slice(0, 10))
}

const percent = (part, total) => (total > 0 ? Math.round((part / total) * 100) : 0)

// One transaction row: "Priya Sharma", "PAY-8841 · Online · 07 Oct 2026", "₹8,500" and Paid / Unpaid.
// Unpaid bookings are paid at the salon, so they show as Cash.
const formatPayment = (row) => {
    const paid = row.paymentStatus === 'Paid'
    const mode = !paid || row.isCash ? 'cash' : 'online'
    const reference = `PAY-${row.bookingId}`
    const dateLabel = istDateLabels(row.paidOn).date

    return {
        paymentReference: reference,
        bookingId: row.bookingId,
        bookingNumber: `BK-${row.bookingId}`,
        customerName: [row.firstName, row.lastName].filter(Boolean).join(' ').trim() || null,
        serviceName: row.serviceName,
        paymentMode: mode,
        paymentModeLabel: MODES[mode].label,
        icon: MODES[mode].icon,
        // When it was paid (unpaid: when the booking was made), Indian time
        paymentDate: row.paidOn,
        dateLabel,
        subtitle: [reference, MODES[mode].label, dateLabel].filter(Boolean).join(' · '),
        amount: Number(row.amount),
        amountLabel: rupees(row.amount),
        status: paid ? 'paid' : 'unpaid',
        statusLabel: paid ? 'Paid' : 'Unpaid',
        isPaid: paid ? 1 : 0,
    }
}

// "Payment Report" (Salon Partner): total received in the period, Online vs Cash, and the transactions.
// Only the logged-in partner's own salon.
const getPaymentReport = async (req, res) => {
    if (!(await validateRequestDevice(req, res))) return

    const parsed = paymentReportSchema.safeParse(req.body)

    if (!parsed.success) return sendValidationError(res, parsed.error)

    const period = parsed.data.period ?? 'this_month'
    const sortBy = parsed.data.sortBy ?? 'newest'
    const page = parsed.data.page ?? 1
    const limit = parsed.data.limit ?? DEFAULT_PAGE_SIZE

    try {
        const partner = await findSalonPartner(req, res, parsed.data)
        if (!partner) return

        const since = periodStart(period)
        const [summary, rows] = await Promise.all([
            paymentReportModel.findPaymentSummary(partner.customerId, { since }),
            paymentReportModel.findPayments(partner.customerId, { since, sortBy, limit, offset: (page - 1) * limit }),
        ])

        // Online + Cash = Total received, worked out in paise so the parts always add up
        const totalPaise = Math.round(summary.receivedAmount * 100)
        const cashPaise = Math.round(summary.cashAmount * 100)
        const total = totalPaise / 100
        const cash = cashPaise / 100
        const online = (totalPaise - cashPaise) / 100
        const onlinePercent = percent(online, total)
        const cashPercent = total > 0 ? 100 - onlinePercent : 0

        const totalTransactions = summary.receivedCount + summary.unpaidCount
        const totalPages = Math.ceil(totalTransactions / limit)

        return res.status(200).json({
            success: true,
            message: rows.length ? 'Payment report fetched successfully' : 'No payments found',
            data: convertNulls({
                title: 'Payment Report',
                selectedPeriod: period,
                periods: PERIODS.map((item) => ({ ...item, isSelected: item.key === period ? 1 : 0 })),
                // "TOTAL RECEIVED ₹16,000", "6 received · 1 unpaid"
                summary: {
                    label: 'Total received',
                    totalReceived: total,
                    totalReceivedLabel: rupees(total),
                    receivedCount: summary.receivedCount,
                    unpaidCount: summary.unpaidCount,
                    countsLabel: `${summary.receivedCount} received · ${summary.unpaidCount} unpaid`,
                    // "Online · 75%  ₹12,100" and "Cash · 25%  ₹3,900"
                    online: {
                        amount: online,
                        amountLabel: rupees(online),
                        percent: onlinePercent,
                        count: summary.receivedCount - summary.cashCount,
                        label: `Online · ${onlinePercent}%`,
                        icon: MODES.online.icon,
                    },
                    cash: {
                        amount: cash,
                        amountLabel: rupees(cash),
                        percent: cashPercent,
                        count: summary.cashCount,
                        label: `Cash · ${cashPercent}%`,
                        icon: MODES.cash.icon,
                    },
                },
                selectedSort: sortBy,
                sortLabel: `Sort: ${SORTS.find((s) => s.key === sortBy).label}`,
                sortOptions: SORTS.map((item) => ({ ...item, isSelected: item.key === sortBy ? 1 : 0 })),
                transactions: rows.map(formatPayment),
                pagination: { page, limit, total: totalTransactions, totalPages, hasNextPage: page < totalPages },
            }),
        })
    } catch (err) {
        console.error('Payment report error:', err)
        return res.status(200).json({ success: false, message: 'Something went wrong' })
    }
}

module.exports = { getPaymentReport, periodStart }
