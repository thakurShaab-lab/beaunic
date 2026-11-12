const { z } = require('zod')
const { sendValidationError } = require('../utils/validationError')
const env = require('../config/env')
const authModel = require('../models/auth.model')
const walletModel = require('../models/wallet.model')
const partnerHomeModel = require('../models/partnerHome.model')
const { validateRequestDevice } = require('./device&app.controller')
const { findLoggedInCustomer } = require('./profile.controller')
const { salonNow, timeLabel, dateParts } = require('./slot.controller')
const { rupees } = require('./service.controller')
const { dateLabel: utcDateLabel } = require('./wallet.controller')
const { resolveMediaUrl } = require('../utils/mediaUrl')
const { convertNulls } = require('../utils/convertNulls')

const LOGO_FOLDER = 'salon_logos'
const LIST_LIMIT = 5
const PAYMENT_DAYS = 30

const partnerHomeSchema = z.object({
    app_id: z.union([z.string(), z.number()]),
    device_id: z.string().trim().min(1, 'Device ID is required'),
}).strict()

// Quick Actions and Manage: fixed shortcuts; key tells the app which screen to open
const QUICK_ACTIONS = [
    { key: 'add_service', label: 'Add Service', icon: 'scissors' },
    { key: 'create_slot', label: 'Create Slot', icon: 'clock' },
    { key: 'add_employee', label: 'Add Employee', icon: 'users' },
    { key: 'view_bookings', label: 'View Bookings', icon: 'calendar' },
]

const MANAGE_ITEMS = [
    { key: 'slots', label: 'Slots', icon: 'clock' },
    { key: 'refunds', label: 'Refunds', icon: 'refresh' },
    { key: 'commission', label: 'Commission', icon: 'percent' },
    { key: 'wallet', label: 'Wallet', icon: 'wallet' },
    { key: 'employees', label: 'Employees', icon: 'users' },
    { key: 'reviews', label: 'Reviews', icon: 'star' },
    { key: 'complaints', label: 'Complaints', icon: 'alert' },
    { key: 'raise_dispute', label: 'Raise Dispute', icon: 'flag' },
]

const STATUS_LABELS = { upcoming: 'Upcoming', completed: 'Completed', cancelled: 'Cancelled' }

// The Home screen is for Salon Partners (customer_type 1)
const findSalonPartner = async (req, res, data) => {
    const customer = await findLoggedInCustomer(req, res, data)
    if (!customer) return null

    if (customer.customerType !== '1') {
        res.status(200).json({ success: false, message: 'This feature is only available for Salon Partners.' })
        return null
    }

    return customer
}

// "Aura Unisex Salon" -> "AU", "Priya Sharma" -> "PS"
const initialsOf = (name) => {
    const words = String(name || '').trim().split(/\s+/).filter(Boolean)
    return (words.length >= 2 ? words[0][0] + words[1][0] : (words[0] || '').slice(0, 2)).toUpperCase() || null
}

const fullName = (row) => [row.firstName, row.lastName].filter(Boolean).join(' ').trim() || null

// Good Morning / Afternoon / Evening by salon time
const greetingFor = (time) => {
    const hour = Number(time.slice(0, 2))
    return hour < 12 ? 'Good Morning,' : hour < 17 ? 'Good Afternoon,' : 'Good Evening,'
}

// "2026-09-28" -> "28 Sep 2026"
const shortDate = (date) => {
    const parts = dateParts(String(date).slice(0, 10))
    return `${parts.dayNumber} ${parts.month} ${String(date).slice(0, 4)}`
}

// UTC "YYYY-MM-DD HH:MM:SS" for N days ago (stored dates are UTC, see authModel.nowString)
const utcDaysAgo = (days) => new Date(Date.now() - days * 86400000).toISOString().slice(0, 19).replace('T', ' ')

const percent = (part, total) => (total > 0 ? Math.round((part / total) * 100) : 0)

// "Salon Partner" Home: header, wallet, stats, quick actions, requests, today's schedule, recent bookings,
// latest enquiries, payment overview, latest reviews and Manage, in that order
const getPartnerHome = async (req, res) => {
    if (!(await validateRequestDevice(req, res))) return

    const parsed = partnerHomeSchema.safeParse(req.body)

    if (!parsed.success) return sendValidationError(res, parsed.error)

    try {
        const customer = await findSalonPartner(req, res, parsed.data)
        if (!customer) return

        const salonId = customer.customerId
        const now = salonNow()
        const clock = { today: now.date, nowTime: `${now.time}:00` }

        // Everything in one round of parallel queries
        const [profile, wallet, stats, schedule, recent, pendingEnquiries, enquiries, reviewSummary, reviews] = await Promise.all([
            authModel.findProfile(salonId),
            walletModel.findWalletSummary(salonId),
            partnerHomeModel.findBookingStats(salonId, { ...clock, since: utcDaysAgo(PAYMENT_DAYS) }),
            partnerHomeModel.findTodaySchedule(salonId, { ...clock, limit: LIST_LIMIT }),
            partnerHomeModel.findRecentBookings(salonId, { ...clock, limit: LIST_LIMIT }),
            partnerHomeModel.countPendingEnquiries(salonId),
            partnerHomeModel.findLatestEnquiries(salonId, LIST_LIMIT),
            partnerHomeModel.findReviewSummary(salonId),
            partnerHomeModel.findLatestReviews(salonId, LIST_LIMIT),
        ])

        const salonName = profile?.salonName || profile?.firstName || null
        const logoUrl = await resolveMediaUrl(req, LOGO_FOLDER, profile?.customerPhoto, null, env.staticFileBaseUrl)
        const balance = (Math.round(wallet.cashback * 100) + Math.round(wallet.credits * 100) - Math.round(wallet.debits * 100)) / 100
        // Online + Cash = Total, worked out in paise so the parts always add up
        const totalPaise = Math.round(stats.paymentsTotal * 100)
        const cashPaise = Math.round(stats.paymentsCash * 100)
        const cash = cashPaise / 100
        const online = (totalPaise - cashPaise) / 100
        const total = totalPaise / 100
        const onlinePercent = percent(online, total)
        const cashPercent = total > 0 ? 100 - onlinePercent : 0
        const averageRating = Number(reviewSummary.averageRating.toFixed(1))

        return res.status(200).json({
            success: true,
            message: 'Home page fetched successfully',
            data: convertNulls({
                // 1. Header
                header: {
                    salonId,
                    salonName,
                    roleLabel: 'Salon Partner',
                    initials: initialsOf(salonName),
                    logoUrl,
                    // No notifications are stored yet
                    notificationCount: 0,
                    greeting: greetingFor(now.time),
                    dateLabel: dateParts(now.date).label,
                },
                // 2. Wallet balance card
                wallet: { balance, balanceLabel: rupees(balance) },
                // 3. Stat cards
                stats: [
                    { key: 'today_bookings', label: "Today's Bookings", icon: 'calendar', value: stats.today, valueLabel: String(stats.today) },
                    { key: 'upcoming_bookings', label: 'Upcoming Bookings', icon: 'clock', value: stats.upcoming, valueLabel: String(stats.upcoming) },
                    { key: 'completed_bookings', label: 'Completed Bookings', icon: 'check', value: stats.completed, valueLabel: String(stats.completed) },
                    { key: 'pending_enquiries', label: 'Pending Enquiries', icon: 'message', value: pendingEnquiries, valueLabel: String(pendingEnquiries) },
                    // Bookings made at the salon (wl_bookings, not cancelled); wl_orders isn't used
                    { key: 'orders', label: 'Orders', icon: 'bag', value: stats.totalBookings, valueLabel: String(stats.totalBookings) },
                    { key: 'payments', label: `Payments · ${PAYMENT_DAYS} days`, icon: 'card', value: total, valueLabel: rupees(total) },
                ],
                // 4. Quick actions
                quickActions: QUICK_ACTIONS,
                // 5. Requests waiting for the salon
                // (opened with /booking/requests, requestType reschedule / cancel)
                requests: [
                    { key: 'reschedule_requests', requestType: 'reschedule', label: 'Reschedule Requests', count: stats.pendingReschedules, subtitle: 'Pending action' },
                    { key: 'cancellation_requests', requestType: 'cancel', label: 'Cancellation Requests', count: stats.pendingCancellations, subtitle: 'Pending action' },
                ],
                // 6. Today's schedule
                todaySchedule: {
                    title: "Today's Schedule",
                    bookings: schedule.map((row) => ({
                        bookingId: row.bookingId,
                        startTimeLabel: timeLabel(row.startTime),
                        // "to 11:00 AM"
                        endTimeLabel: `to ${timeLabel(row.endTime)}`,
                        customerName: fullName(row),
                        serviceName: row.serviceName,
                        employeeName: row.employeeName || null,
                        // "Rohit Kumar · Hair Stylist", or "Employee not assigned"
                        employeeLabel: row.employeeName ? [row.employeeName, row.employeeDesignation].filter(Boolean).join(' · ') : 'Employee not assigned',
                        status: row.tab,
                        statusLabel: STATUS_LABELS[row.tab] || null,
                    })),
                },
                // 7. Recent bookings
                recentBookings: {
                    title: 'Recent Bookings',
                    bookings: recent.map((row) => ({
                        bookingId: row.bookingId,
                        customerName: fullName(row),
                        initials: initialsOf(fullName(row)),
                        serviceName: row.serviceName,
                        dateLabel: shortDate(row.slotDate),
                        // "Bridal Makeup · 28 Sep 2026"
                        subtitle: [row.serviceName, shortDate(row.slotDate)].filter(Boolean).join(' · '),
                        status: row.tab,
                        statusLabel: STATUS_LABELS[row.tab] || null,
                    })),
                },
                // 8. Latest enquiries
                latestEnquiries: {
                    title: 'Latest Enquiries',
                    pendingCount: pendingEnquiries,
                    enquiries: enquiries.map((row) => ({
                        enquiryId: row.enquiryId,
                        customerName: fullName(row),
                        serviceName: row.serviceName,
                        message: row.message,
                        isReplied: row.replyStatus === 'Y',
                        dateLabel: utcDateLabel(row.receiveDate),
                    })),
                },
                // 9. Payment overview: paid bookings in the last 30 days, Online vs Cash and the combined total
                paymentOverview: {
                    title: 'Payment Overview',
                    periodLabel: `Received · last ${PAYMENT_DAYS} days`,
                    total,
                    totalLabel: rupees(total),
                    totalBookings: stats.paidCount,
                    online: {
                        amount: online,
                        amountLabel: rupees(online),
                        percent: onlinePercent,
                        bookings: stats.paidCount - stats.cashCount,
                        label: `Online · ${onlinePercent}%`,
                    },
                    cash: {
                        amount: cash,
                        amountLabel: rupees(cash),
                        percent: cashPercent,
                        bookings: stats.cashCount,
                        label: `Cash · ${cashPercent}%`,
                    },
                },
                // 10. Latest reviews
                latestReviews: {
                    title: 'Latest Reviews',
                    averageRating,
                    totalReviews: reviewSummary.total,
                    // "★ 4.6 · 5"
                    ratingLabel: reviewSummary.total ? `★ ${averageRating} · ${reviewSummary.total}` : null,
                    reviews: reviews.map((row) => ({
                        reviewId: row.reviewId,
                        customerName: fullName(row),
                        rating: Number(row.rating),
                        review: row.reviewText,
                        // "Salon visit · 27 Sep 2026" / "Hair Spa · 27 Sep 2026"
                        subtitle: [row.reviewType === 'service' ? row.serviceName || 'Service' : 'Salon visit', utcDateLabel(row.reviewAddedDate)].filter(Boolean).join(' · '),
                    })),
                },
                // 11. Manage
                manage: MANAGE_ITEMS,
            }),
        })
    } catch (err) {
        console.error('Partner home error:', err)
        return res.status(200).json({ success: false, message: 'Something went wrong' })
    }
}

module.exports = { getPartnerHome }
