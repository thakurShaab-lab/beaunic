const { z } = require('zod')
const { sendValidationError } = require('../utils/validationError')
const authModel = require('../models/auth.model')
const serviceModel = require('../models/service.model')
const bookingModel = require('../models/booking.model')
const couponModel = require('../models/coupon.model')
const addressModel = require('../models/address.model')
const { validateRequestDevice } = require('./device&app.controller')
const { findLoggedInCustomer } = require('./profile.controller')
const { noMarkup } = require('./address.controller')
const { salonNow, timeLabel, dateParts, hhmm, formatSlot } = require('./slot.controller')
const { buildSalonLocation, rupees, withImageUrls, durationLabel } = require('./service.controller')
const { convertNulls } = require('../utils/convertNulls')

const SLOT_NOT_AVAILABLE = 'Selected slot is not available.'


// Why a slot can't be booked, as the message the app shows
const BOOKING_ERRORS = {
    // Missing, deleted/inactive, or another salon's slot
    not_found: 'This slot is not offered by the salon providing this service.',
    // Only a full slot is "not available"
    full: SLOT_NOT_AVAILABLE,
    started: 'This slot has already started. Please choose another slot.',
    already_booked: 'You have already booked this slot.',
}

const deviceFields = {
    app_id: z.union([z.string(), z.number()]),
    device_id: z.string().trim().min(1, 'Device ID is required'),
}

const createBookingSchema = z.object({
    ...deviceFields,
    serviceId: z.coerce.number({ error: 'Service ID is required' }).int().positive('Service ID is required'),
    slotId: z.coerce.number({ error: 'Slot ID is required' }).int().positive('Slot ID is required'),
    salonId: z.coerce.number({ error: 'Salon ID must be a number' }).int().positive('Salon ID must be a number').optional(),
    notes: z.string()
        .trim()
        .max(500, 'Notes can be up to 500 characters')
        .refine(noMarkup, 'Invalid characters')
        .optional(),
}).strict()

const bookingSummarySchema = z.object({
    ...deviceFields,
    // The booking made by /booking/create (wl_bookings.booking_id)
    bookingId: z.coerce.number({ error: 'Booking ID is required' }).int().positive('Booking ID is required'),
    // Must be the booking's own service and salon
    serviceId: z.coerce.number({ error: 'Service ID is required' }).int().positive('Service ID is required'),
    salonId: z.coerce.number({ error: 'Salon ID is required' }).int().positive('Salon ID is required'),
    // Optional: blank, null or missing means no coupon
    couponCode: z.string({ error: 'Coupon code must be text' })
        .trim()
        .max(10, 'Invalid coupon code.')
        .regex(/^[A-Za-z0-9]+$/, 'Invalid coupon code.')
        .optional(),
}).strict()

const bookingIdField = z.coerce.number({ error: 'Booking ID is required' }).int().positive('Booking ID is required')

// "Reason for cancellation" options, in screen order
const CANCEL_REASONS = {
    change_of_plans: 'Change of plans',
    booked_by_mistake: 'Booked by mistake',
    better_time_slot: 'Found a better time slot',
    health_reasons: 'Health reasons',
    salon_too_far: 'Salon is too far',
    other: 'Other',
}

// "Refund method (if eligible)"
const REFUND_METHODS = {
    original: { label: 'Original payment method', description: 'Credited to the source you paid from' },
    wallet: { label: 'Beaunic Wallet', description: 'Credited to your Beaunic Wallet' },
}

const CANCELLATION_POLICY = 'Cancellation and refund eligibility are set by the salon. The salon reviews your request, and the outcome appears in Notifications.'

// "Change of plans", "change_of_plans" and "Change Of Plans" are the same; so are "Original payment method" and "original"
const matchOption = (options) => (value) => {
    if (typeof value !== 'string') return value
    const wanted = value.trim().toLowerCase().replace(/[^a-z0-9]/g, '')
    return Object.keys(options).find((key) => {
        const label = typeof options[key] === 'string' ? options[key] : options[key].label
        return [key, label].some((text) => text.toLowerCase().replace(/[^a-z0-9]/g, '') === wanted)
    }) ?? value
}

const cancelBookingSchema = z.object({
    ...deviceFields,
    bookingId: bookingIdField,
    cancelReason: z.preprocess(
        matchOption(CANCEL_REASONS),
        z.enum(Object.keys(CANCEL_REASONS), {
            error: (issue) => (issue.input === undefined
                ? 'Please select a reason for cancellation'
                : `Reason must be one of: ${Object.values(CANCEL_REASONS).join(', ')}`),
        })
    ),
    // Required when the reason is "Other"
    cancelReasonNote: z.string()
        .trim()
        .max(500, 'Reason can be up to 500 characters')
        .refine(noMarkup, 'Invalid characters')
        .optional(),
    // Optional; only used when the booking was paid. Defaults to the original payment method.
    refundMethod: z.preprocess(
        matchOption(REFUND_METHODS),
        z.enum(Object.keys(REFUND_METHODS), { error: 'Refund method must be original or wallet' }).optional()
    ),
}).strict().superRefine((d, ctx) => {
    if (d.cancelReason === 'other' && !d.cancelReasonNote) {
        ctx.addIssue({ code: 'custom', path: ['cancelReasonNote'], message: 'Please tell us why you are cancelling' })
    }
})

// The new date and time are one of the salon's slots (from /slot/list with the booking's salonId)
const rescheduleBookingSchema = z.object({
    ...deviceFields,
    bookingId: bookingIdField,
    slotId: z.coerce.number({ error: 'New slot ID is required' }).int().positive('New slot ID is required'),
}).strict()

// Why a booking can't be cancelled or moved
const CHANGE_ERRORS = {
    not_found: 'Booking not found.',
    cancelled: 'This booking is already cancelled.',
    closed: 'This booking is closed and can no longer be changed.',
    started_cancel: 'This booking has already started and can no longer be cancelled.',
    started_reschedule: 'This booking has already started and can no longer be rescheduled.',
    same_slot: 'Your booking is already in this slot. Please choose a different date or time.',
    slot_not_found: 'This slot is not offered by the salon of this booking.',
    started: 'This slot has already started. Please choose another slot.',
    already_booked: 'You already have a booking in this slot.',
    full: SLOT_NOT_AVAILABLE,
    cancel_pending: 'A cancellation request for this booking is already waiting for the salon.',
    reschedule_pending: 'A reschedule request for this booking is already waiting for the salon.',
}

const DEFAULT_PAGE_SIZE = 10
const MAX_PAGE_SIZE = 50

// The My Bookings tabs; "All" or blank means every booking
const TAB_LABELS = { upcoming: 'Upcoming', completed: 'Completed', cancelled: 'Cancelled' }

// tab, page and limit are optional: blank, null or missing means all tabs, page 1 of 10
const listBookingsSchema = z.object({
    ...deviceFields,
    tab: z.preprocess(
        (value) => (typeof value === 'string' ? (value.trim().toLowerCase() === 'all' ? undefined : value.trim().toLowerCase()) : value),
        z.enum(bookingModel.BOOKING_TAB_KEYS, { error: 'Tab must be one of: upcoming, completed, cancelled' }).optional()
    ),
    page: z.coerce.number({ error: 'Page must be a number' }).int('Page must be a whole number').min(1, 'Page must be 1 or more').optional(),
    limit: z.coerce.number({ error: 'Limit must be a number' })
        .int('Limit must be a whole number')
        .min(1, 'Limit must be 1 or more')
        .max(MAX_PAGE_SIZE, `Limit can be at most ${MAX_PAGE_SIZE}`)
        .optional(),
}).strict()

const bookingDetailsSchema = z.object({
    ...deviceFields,
    bookingId: z.coerce.number({ error: 'Booking ID is required' }).int().positive('Booking ID is required'),
}).strict()

// The badge under the service name and the "Service type" line
const SERVICE_TYPE_LABELS = { salon: 'At Salon', home_service: 'Home Service' }

const SUMMARY_NOTE = 'Final price, discounts and charges are confirmed by the salon. Cancellation and rescheduling follow the salon\'s policy.'

// Booking is for Users (customer_type 2)
const findUser = async (req, res, data) => {
    const customer = await findLoggedInCustomer(req, res, data)
    if (!customer) return null

    if (customer.customerType !== '2') {
        res.status(200).json({ success: false, message: 'This feature is only available for Users.' })
        return null
    }

    return customer
}

// A slot whose start time has passed (Indian time) can't be booked
const hasStarted = (slot) => {
    const now = salonNow()
    return slot.slotDate < now.date || (slot.slotDate === now.date && hhmm(slot.startTime) <= now.time)
}

// The service must be active, offered by an active, approved salon (the one sent, if any) and have a price.
// Replies and returns null when it can't be booked.
const findBookableService = async (res, { serviceId, salonId }) => {
    const service = await serviceModel.findActiveServiceWithSalon(serviceId)
    if (
        !service ||
        service.salonCustomerType !== '1' ||
        service.salonStatus !== '1' ||
        (salonId !== undefined && salonId !== service.customerId)
    ) {
        res.status(200).json({ success: false, message: 'Service not found.' })
        return null
    }

    if (service.servicePrice === null) {
        res.status(200).json({ success: false, message: 'This service can\'t be booked yet because its price is not set.' })
        return null
    }

    return service
}

// Amounts are worked out in paise so rounding never drifts: "1699.00" -> 169900
const toPaise = (value) => Math.round(Number(value) * 100)
const fromPaise = (paise) => Number((paise / 100).toFixed(2))

// coupon_type: p = percentage, a = flat amount, f = free shipping (nothing to ship, so not for bookings)
const COUPON_TYPES = { p: 'percentage', a: 'amount', f: 'free_shipping' }

// Checks a coupon for this customer and price. Returns { error } or { coupon, discountPaise }.
// The discount never exceeds maximum_coupon_discount (when set) or the price itself.
// bookingId: the booking it's applied to, which doesn't count as an earlier use
const applyCoupon = async (couponCode, customerId, pricePaise, bookingId) => {
    const coupon = await couponModel.findCouponByCode(couponCode)
    if (!coupon) return { error: 'Invalid coupon code.' }
    // Found, but switched off in the admin panel (status 0)
    if (coupon.status !== '1') return { error: 'This coupon is not active.' }

    const today = salonNow().date
    if (coupon.startDate && coupon.startDate > today) return { error: 'This coupon is not active yet.' }
    if (coupon.endDate && coupon.endDate < today) return { error: 'This coupon has expired.' }

    if (coupon.couponType === 'f') return { error: 'This coupon can\'t be used for bookings.' }

    const minimumPaise = toPaise(coupon.minimumOrderAmount)
    if (pricePaise < minimumPaise) {
        return { error: `This coupon needs a minimum booking amount of ${rupees(fromPaise(minimumPaise))}.` }
    }

    if (coupon.couponFor === '1' && !(await couponModel.isCouponSentToCustomer(coupon.couponId, customerId))) {
        return { error: 'This coupon is not available for your account.' }
    }

    // single: once per customer; multiple: usage_count times per customer
    const allowedUses = coupon.couponUsage === 'single' ? 1 : Math.max(coupon.usageCount, 1)
    if ((await couponModel.countCustomerCouponUses(coupon.couponId, customerId, bookingId)) >= allowedUses) {
        return { error: 'You have already used this coupon the maximum number of times.' }
    }

    const valuePaise = toPaise(coupon.couponDiscount)
    let discountPaise = coupon.couponType === 'p' ? Math.round((pricePaise * Number(coupon.couponDiscount)) / 100) : valuePaise

    const maximumPaise = toPaise(coupon.maximumCouponDiscount)
    if (maximumPaise > 0) discountPaise = Math.min(discountPaise, maximumPaise)
    discountPaise = Math.min(discountPaise, pricePaise)

    return { coupon, discountPaise }
}

const formatBooking = (booking, salonName) => ({
    bookingId: booking.bookingId,
    invoiceNumber: booking.invoiceNumber,
    bookingStatus: booking.orderStatus,
    salonId: booking.salonId,
    salonName,
    serviceId: booking.serviceId,
    serviceName: booking.serviceName,
    price: booking.servicePrice,
    priceLabel: `₹${booking.servicePrice}`,
    totalAmount: booking.totalAmount,
    slotId: booking.slotId,
    slotDate: booking.slotDate,
    dateLabel: dateParts(booking.slotDate).label,
    startTime: hhmm(booking.startTime),
    endTime: hhmm(booking.endTime),
    timeLabel: `${timeLabel(booking.startTime)} – ${timeLabel(booking.endTime)}`,
    notes: booking.bookingNotes,
    paymentStatus: booking.paymentStatus,
    bookingDate: booking.orderReceivedDate,
})

// "Book Now": one place in a salon's slot for one of its services
const createBooking = async (req, res) => {
    if (!(await validateRequestDevice(req, res))) return

    const parsed = createBookingSchema.safeParse(req.body)

    if (!parsed.success) return sendValidationError(res, parsed.error)

    const d = parsed.data

    try {
        const customer = await findUser(req, res, d)
        if (!customer) return

        const service = await findBookableService(res, d)
        if (!service) return

        const now = authModel.nowString()
        const result = await bookingModel.bookSlot({
            slotId: d.slotId,
            salonId: service.customerId,
            customerId: customer.customerId,
            checkSlot: (slot) => (hasStarted(slot) ? 'started' : null),
            // wl_orders-style order fields first, then the booking fields
            buildBooking: (slot) => ({
                customerId: customer.customerId,
                customerType: 'Member',
                firstName: customer.firstName,
                mobileNumber: customer.mobileNumber,
                email: customer.userName,
                totalAmount: service.servicePrice,
                currencyCode: 'INR',
                currencySymbol: '&#8377;',
                currencyValue: '1.000000',
                orderStatus: 'Booked',
                orderReceivedDate: now,
                paymentStatus: 'Unpaid',
                salonId: service.customerId,
                serviceId: service.serviceId,
                slotId: slot.slotId,
                serviceName: service.serviceName,
                servicePrice: service.servicePrice,
                slotDate: slot.slotDate,
                startTime: slot.startTime,
                endTime: slot.endTime,
                bookingNotes: d.notes || null,
                bookingUpdatedDate: now,
            }),
        })

        if (result.error) {
            return res.status(200).json({ success: false, message: BOOKING_ERRORS[result.error] })
        }

        return res.status(200).json({
            success: true,
            message: 'Service booked successfully',
            data: convertNulls({
                booking: formatBooking(result.booking, service.salonName),
                // The slot after this booking, so the app can refresh its badge
                slot: formatSlot(result.slot),
            }),
        })
    } catch (err) {
        console.error('Create booking error:', err)
        return res.status(200).json({ success: false, message: 'Something went wrong' })
    }
}

// "Booking Summary" (step 3 of 4): a booking from wl_bookings — its service, slot, salon and price — with an
// optional coupon. The coupon (or no coupon) and the amount payable are saved on the booking for the payment step.
const getBookingSummary = async (req, res) => {
    if (!(await validateRequestDevice(req, res))) return

    const parsed = bookingSummarySchema.safeParse(req.body)

    if (!parsed.success) return sendValidationError(res, parsed.error)

    const d = parsed.data

    try {
        const customer = await findUser(req, res, d)
        if (!customer) return

        const booking = await bookingModel.findCustomerBooking(customer.customerId, d.bookingId)
        if (!booking || booking.serviceId !== d.serviceId || booking.salonId !== d.salonId) {
            return res.status(200).json({ success: false, message: 'Booking not found.' })
        }

        // Only a booking still waiting for payment has a summary to pay
        if (booking.orderStatus !== 'Booked') {
            return res.status(200).json({ success: false, message: `This booking is ${booking.orderStatus.toLowerCase()}.` })
        }
        if (booking.paymentStatus === 'Paid') {
            return res.status(200).json({ success: false, message: 'This booking has already been paid.' })
        }

        const salonId = booking.salonId
        // The price saved when the booking was made
        const pricePaise = toPaise(booking.servicePrice)
        let coupon = null
        let discountPaise = 0

        // Only checked when a code is sent; a bad code is an error, never a silent "no discount"
        if (d.couponCode !== undefined) {
            const result = await applyCoupon(d.couponCode, customer.customerId, pricePaise, booking.bookingId)
            if (result.error) {
                return res.status(200).json({ success: false, message: result.error, field: 'couponCode' })
            }
            coupon = result.coupon
            discountPaise = result.discountPaise
        }

        const totalPaise = pricePaise - discountPaise

        // The booking keeps the coupon shown here (or none) and what is payable now
        await bookingModel.updateBookingCoupon(booking.bookingId, {
            discountCouponId: coupon ? coupon.couponId : 0,
            discountCouponCode: coupon ? coupon.couponCode : null,
            couponDiscountAmount: coupon ? fromPaise(discountPaise) : null,
            totalAmount: fromPaise(totalPaise).toFixed(2),
            bookingUpdatedDate: authModel.nowString(),
        })

        const address = await addressModel.findDefaultAddress(salonId)
        const location = buildSalonLocation(salonId, booking.salonName, address)
        const typeKey = booking.serviceType || booking.salonType
        const typeLabel = SERVICE_TYPE_LABELS[typeKey] || null
        const date = dateParts(booking.slotDate)

        return res.status(200).json({
            success: true,
            message: coupon ? 'Coupon applied successfully' : 'Booking summary fetched successfully',
            data: convertNulls({
                step: { current: 3, total: 4 },
                bookingId: booking.bookingId,
                serviceId: booking.serviceId,
                salonId: booking.salonId,
                booking: {
                    bookingId: booking.bookingId,
                    invoiceNumber: booking.invoiceNumber,
                    bookingStatus: booking.orderStatus,
                    paymentStatus: booking.paymentStatus,
                    notes: booking.bookingNotes,
                },
                service: {
                    serviceId: booking.serviceId,
                    serviceName: booking.serviceName,
                    // No duration is stored for services yet
                    duration: null,
                    serviceType: typeKey,
                    serviceTypeLabel: typeLabel,
                    // "1 hr 15 min · At Salon" once a duration exists
                    subtitle: typeLabel,
                },
                schedule: {
                    slotId: booking.slotId,
                    date: booking.slotDate,
                    dateLabel: date.label,
                    startTime: hhmm(booking.startTime),
                    endTime: hhmm(booking.endTime),
                    timeLabel: timeLabel(booking.startTime),
                    timeRangeLabel: `${timeLabel(booking.startTime)} – ${timeLabel(booking.endTime)}`,
                },
                salon: {
                    ...location,
                    // "Main Market, Dildarnagar": the line on the card
                    shortAddress: address ? [address.address, address.city].map((part) => part && part.trim()).filter(Boolean).join(', ') || null : null,
                },
                coupon: coupon
                    ? {
                        applied: true,
                        couponId: coupon.couponId,
                        couponCode: coupon.couponCode,
                        couponTitle: coupon.couponTitle,
                        couponType: COUPON_TYPES[coupon.couponType],
                        couponValue: Number(coupon.couponDiscount),
                        couponValueLabel: coupon.couponType === 'p' ? `${Number(coupon.couponDiscount)}% off` : `${rupees(coupon.couponDiscount)} off`,
                        maximumDiscount: coupon.maximumCouponDiscount > 0 ? Number(coupon.maximumCouponDiscount) : null,
                        discountAmount: fromPaise(discountPaise),
                        label: `Applied (${coupon.couponCode})`,
                    }
                    : { applied: false, couponCode: null, discountAmount: 0, label: 'Not applied' },
                // The "Price Details" card, row by row
                priceDetails: {
                    servicePrice: fromPaise(pricePaise),
                    servicePriceLabel: rupees(fromPaise(pricePaise)),
                    discount: fromPaise(discountPaise),
                    discountLabel: discountPaise > 0 ? `− ${rupees(fromPaise(discountPaise))}` : rupees(0),
                    couponLabel: coupon ? `Applied (${coupon.couponCode})` : 'Not applied',
                    taxesAndCharges: null,
                    taxesAndChargesLabel: 'As applicable',
                    totalPayable: fromPaise(totalPaise),
                    totalPayableLabel: rupees(fromPaise(totalPaise)),
                },
                totalPayable: fromPaise(totalPaise),
                totalPayableLabel: rupees(fromPaise(totalPaise)),
                note: SUMMARY_NOTE,
            }),
        })
    } catch (err) {
        console.error('Booking summary error:', err)
        return res.status(200).json({ success: false, message: 'Something went wrong' })
    }
}

// Only a "Booked" booking whose time hasn't come yet can be cancelled or moved.
// action: 'cancel' | 'reschedule', for the "already started" message
const bookingChangeError = (booking, action) => {
    if (booking.isCancel === '1' || booking.orderStatus === 'Cancelled') return 'cancelled'
    if (booking.orderStatus !== 'Booked') return 'closed'
    if (hasStarted(booking)) return `started_${action}`
    return null
}

const sendChangeError = (res, code) => res.status(200).json({ success: false, message: CHANGE_ERRORS[code] })

// Request status as shown on the cards: Pending / Approved / Rejected
const REQUEST_STATUS_LABELS = { pending: 'Pending', approved: 'Approved', rejected: 'Rejected' }

// "Thu, 10 Dec 2026 · 02:00 PM – 04:00 PM"
const scheduleOf = (slotId, slotDate, startTime, endTime) =>
    slotDate
        ? {
            slotId,
            slotDate,
            dateLabel: dateParts(slotDate).label,
            startTime: hhmm(startTime),
            endTime: hhmm(endTime),
            timeLabel: `${timeLabel(startTime)} – ${timeLabel(endTime)}`,
        }
        : null

// The cancellation request on a booking, for the customer and the partner; null when there was none
const cancellationOf = (booking) => {
    if (!booking.cancelStatus || booking.cancelStatus === 'none') return null
    const paid = booking.paymentStatus === 'Paid'
    const refundMethod = booking.refundMethod ? REFUND_METHODS[booking.refundMethod] : null
    const labels = { pending: 'Cancellation Requested', approved: 'Cancelled', rejected: 'Cancellation Rejected' }

    return {
        status: booking.cancelStatus,
        statusLabel: labels[booking.cancelStatus],
        requestStatusLabel: REQUEST_STATUS_LABELS[booking.cancelStatus],
        isCancelled: booking.cancelStatus === 'approved',
        isCancel: booking.isCancel,
        cancelReason: booking.cancelReason,
        cancelReasonLabel: CANCEL_REASONS[booking.cancelReason] || null,
        cancelReasonNote: booking.cancelReasonNote,
        requestedDate: booking.cancelRequestedDate,
        requestedDateLabel: booking.cancelRequestedDate ? salonDateTimeLabel(booking.cancelRequestedDate) : null,
        respondedDate: booking.cancelRespondedDate,
        respondedDateLabel: booking.cancelRespondedDate ? salonDateTimeLabel(booking.cancelRespondedDate) : null,
        responseNote: booking.cancelResponseNote,
        cancelledDate: booking.bookingCancelledDate,
        cancelledDateLabel: booking.bookingCancelledDate ? salonDateTimeLabel(booking.bookingCancelledDate) : null,
        refund: {
            isEligible: paid && booking.cancelStatus !== 'rejected',
            method: booking.refundMethod,
            methodLabel: refundMethod ? refundMethod.label : null,
            methodDescription: refundMethod ? refundMethod.description : null,
            status: !paid ? 'Not applicable (not paid)' : booking.cancelStatus === 'rejected' ? 'Not applicable (cancellation rejected)' : 'Pending salon review',
        },
        cancellationPolicy: CANCELLATION_POLICY,
    }
}

// The reschedule request on a booking; null when there was none
const rescheduleOf = (booking) => {
    if (!booking.rescheduleStatus || booking.rescheduleStatus === 'none') return null
    const labels = { pending: 'Reschedule Requested', approved: 'Rescheduled', rejected: 'Reschedule Rejected' }
    const approved = booking.rescheduleStatus === 'approved'

    return {
        status: booking.rescheduleStatus,
        statusLabel: labels[booking.rescheduleStatus],
        requestStatusLabel: REQUEST_STATUS_LABELS[booking.rescheduleStatus],
        // Pending / rejected: the booking still has its own slot; approved: it moved from previous_* to the requested slot
        currentSchedule: approved
            ? scheduleOf(booking.previousSlotId, booking.previousSlotDate, booking.previousStartTime, booking.previousEndTime)
            : scheduleOf(booking.slotId, booking.slotDate, booking.startTime, booking.endTime),
        requestedSchedule: scheduleOf(booking.requestedSlotId, booking.requestedSlotDate, booking.requestedStartTime, booking.requestedEndTime),
        requestedDate: booking.rescheduleRequestedDate,
        requestedDateLabel: booking.rescheduleRequestedDate ? salonDateTimeLabel(booking.rescheduleRequestedDate) : null,
        respondedDate: booking.rescheduleRespondedDate,
        respondedDateLabel: booking.rescheduleRespondedDate ? salonDateTimeLabel(booking.rescheduleRespondedDate) : null,
        responseNote: booking.rescheduleResponseNote,
    }
}

// The request still waiting for the salon, if any: { type, status, statusLabel }
const pendingRequestOf = (booking) => {
    if (booking.cancelStatus === 'pending') return { type: 'cancel', status: 'pending', statusLabel: 'Cancellation Requested' }
    if (booking.rescheduleStatus === 'pending') return { type: 'reschedule', status: 'pending', statusLabel: 'Reschedule Requested' }
    return null
}

// "Cancel Booking": the customer asks the salon to cancel their upcoming booking, with a reason and (for paid
// bookings) a refund method. Nothing changes on the booking until the salon approves.
const cancelBooking = async (req, res) => {
    if (!(await validateRequestDevice(req, res))) return

    const parsed = cancelBookingSchema.safeParse(req.body)

    if (!parsed.success) return sendValidationError(res, parsed.error)

    const d = parsed.data

    try {
        const customer = await findUser(req, res, d)
        if (!customer) return

        const result = await bookingModel.requestCancellation({
            bookingId: d.bookingId,
            customerId: customer.customerId,
            checkBooking: (booking) => bookingChangeError(booking, 'cancel'),
            cancellation: (booking) => ({
                cancelReason: d.cancelReason,
                // The note is kept for "Other"; for the fixed reasons it's optional extra detail
                cancelReasonNote: d.cancelReasonNote || null,
                // Nothing to refund on an unpaid booking
                refundMethod: booking.paymentStatus === 'Paid' ? d.refundMethod ?? 'original' : null,
            }),
            now: authModel.nowString(),
        })

        if (result.error) return sendChangeError(res, result.error)

        const booking = result.booking
        const cancellation = cancellationOf(booking)

        return res.status(200).json({
            success: true,
            message: 'Cancellation request sent to the salon',
            data: convertNulls({
                bookingId: booking.bookingId,
                bookingNumber: bookingNumber(booking.bookingId),
                invoiceNumber: booking.invoiceNumber,
                // Still "Booked" until the salon approves
                bookingStatus: booking.orderStatus,
                isCancel: booking.isCancel,
                paymentStatus: booking.paymentStatus,
                serviceId: booking.serviceId,
                serviceName: booking.serviceName,
                salonId: booking.salonId,
                slotId: booking.slotId,
                slotDate: booking.slotDate,
                dateLabel: dateParts(booking.slotDate).label,
                timeLabel: `${timeLabel(booking.startTime)} – ${timeLabel(booking.endTime)}`,
                amount: Number(booking.totalAmount),
                amountLabel: rupees(booking.totalAmount),
                cancelReason: booking.cancelReason,
                cancelReasonLabel: CANCEL_REASONS[booking.cancelReason],
                cancelReasonNote: booking.cancelReasonNote,
                requestStatus: booking.cancelStatus,
                requestStatusLabel: cancellation.statusLabel,
                refund: cancellation.refund,
                cancellationPolicy: CANCELLATION_POLICY,
                requestedDate: booking.cancelRequestedDate,
            }),
        })
    } catch (err) {
        console.error('Cancel booking error:', err)
        return res.status(200).json({ success: false, message: 'Something went wrong' })
    }
}

// "Reschedule": the customer asks the salon to move their upcoming booking to another of its slots.
// The booking keeps its date and time until the salon approves. Price and coupon never change.
const rescheduleBooking = async (req, res) => {
    if (!(await validateRequestDevice(req, res))) return

    const parsed = rescheduleBookingSchema.safeParse(req.body)

    if (!parsed.success) return sendValidationError(res, parsed.error)

    try {
        const customer = await findUser(req, res, parsed.data)
        if (!customer) return

        const result = await bookingModel.requestReschedule({
            bookingId: parsed.data.bookingId,
            customerId: customer.customerId,
            newSlotId: parsed.data.slotId,
            checkBooking: (booking) => bookingChangeError(booking, 'reschedule'),
            checkSlot: (slot) => (hasStarted(slot) ? 'started' : null),
            now: authModel.nowString(),
        })

        if (result.error) return sendChangeError(res, result.error)

        const { booking } = result
        const reschedule = rescheduleOf(booking)

        return res.status(200).json({
            success: true,
            message: 'Reschedule request sent to the salon',
            data: convertNulls({
                bookingId: booking.bookingId,
                bookingNumber: bookingNumber(booking.bookingId),
                invoiceNumber: booking.invoiceNumber,
                bookingStatus: booking.orderStatus,
                serviceId: booking.serviceId,
                serviceName: booking.serviceName,
                salonId: booking.salonId,
                totalAmount: booking.totalAmount,
                requestStatus: booking.rescheduleStatus,
                requestStatusLabel: reschedule.statusLabel,
                // The booking's slot stays until the salon approves
                currentSchedule: reschedule.currentSchedule,
                requestedSchedule: reschedule.requestedSchedule,
                requestedDate: booking.rescheduleRequestedDate,
            }),
        })
    } catch (err) {
        console.error('Reschedule booking error:', err)
        return res.status(200).json({ success: false, message: 'Something went wrong' })
    }
}

// "BK-30418": the booking number on the cards
const bookingNumber = (bookingId) => `BK-${bookingId}`

// "2026-10-07" or "2026-10-07 11:00:00" -> "07 Oct 2026"
const shortDate = (value) => {
    const date = String(value).slice(0, 10)
    const parts = dateParts(date)
    return `${parts.dayNumber} ${parts.month} ${date.slice(0, 4)}`
}

// Saved times are UTC (authModel.nowString); shown in salon time: "2026-10-06 18:30:00" -> "07 Oct 2026 · 12:00 AM"
const salonDateTimeLabel = (utcDateTime) => {
    const date = new Date(`${String(utcDateTime).replace(' ', 'T')}Z`)
    if (Number.isNaN(date.getTime())) return null
    const parts = Object.fromEntries(
        new Intl.DateTimeFormat('en-CA', {
            timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
        }).formatToParts(date).map((part) => [part.type, part.value])
    )
    return `${shortDate(`${parts.year}-${parts.month}-${parts.day}`)} · ${timeLabel(`${parts.hour}:${parts.minute}`)}`
}

// Online / Cash, from payment_mode (a payment method of "Cash" counts as cash for older records)
const paymentModeOf = (booking) =>
    booking.paymentMode || (booking.paymentStatus === 'Paid' ? (String(booking.paymentMethod || '').trim().toLowerCase() === 'cash' ? 'cash' : 'online') : null)

const PAYMENT_MODE_LABELS = { online: 'Online', cash: 'Cash' }

// "Paid · UPI" / "Paid · Cash", or just "Unpaid"
const paymentLabel = (booking) =>
    [booking.paymentStatus, booking.paymentMethod || PAYMENT_MODE_LABELS[paymentModeOf(booking)]].filter(Boolean).join(' · ')

// Fields shared by the list card and the details screen
const bookingBasics = (booking, tab) => {
    const typeKey = booking.serviceType || booking.salonType
    const typeLabel = SERVICE_TYPE_LABELS[typeKey] || null
    const duration = booking.serviceDuration ?? null
    const pendingRequest = pendingRequestOf(booking)
    // Reschedule / Cancel buttons: upcoming, not started, and no request already waiting for the salon
    const changeable = tab === 'upcoming' && !hasStarted(booking) && !pendingRequest

    return {
        bookingId: booking.bookingId,
        bookingNumber: bookingNumber(booking.bookingId),
        invoiceNumber: booking.invoiceNumber,
        // The badge: Upcoming / Completed / Cancelled, or the request waiting for the salon
        status: tab,
        statusLabel: (tab === 'upcoming' && pendingRequest?.statusLabel) || TAB_LABELS[tab] || booking.orderStatus,
        orderStatus: booking.orderStatus,
        isCancel: booking.isCancel,
        pendingRequest,
        serviceId: booking.serviceId,
        serviceName: booking.serviceName,
        serviceType: typeKey,
        serviceTypeLabel: typeLabel,
        salonId: booking.salonId,
        salonName: booking.salonName,
        // "Beaunic Salon Academy · At Salon"
        subtitle: [booking.salonName, typeLabel].filter(Boolean).join(' · ') || null,
        slotId: booking.slotId,
        bookingDate: booking.slotDate,
        bookingDateLabel: shortDate(booking.slotDate),
        startTime: hhmm(booking.startTime),
        endTime: hhmm(booking.endTime),
        timeLabel: timeLabel(booking.startTime),
        // Minutes from the service (bookings don't store one); null when the service has none
        duration,
        durationLabel: duration !== null ? durationLabel(duration) : null,
        amount: Number(booking.totalAmount),
        amountLabel: rupees(booking.totalAmount),
        paymentStatus: booking.paymentStatus,
        paymentMethod: booking.paymentMethod,
        paymentMode: paymentModeOf(booking),
        canReschedule: changeable,
        canCancel: changeable,
    }
}

// Which tab a single booking belongs to (the same rules as the list's SQL)
const tabOf = (booking) => {
    if (booking.isCancel === '1' || booking.orderStatus === 'Cancelled') return 'cancelled'
    if (['Completed', 'No Show'].includes(booking.orderStatus)) return 'completed'
    if (booking.orderStatus !== 'Booked') return 'other'
    const now = salonNow()
    const ended = booking.slotDate < now.date || (booking.slotDate === now.date && hhmm(booking.endTime) <= now.time)
    return ended ? 'completed' : 'upcoming'
}

// The Status card on Booking Details
const buildTimeline = (booking, tab) => {
    const paid = booking.paymentStatus === 'Paid'
    const placed = {
        key: 'placed',
        title: 'Booking placed',
        subtitle: paid ? 'Payment received' : 'Payment pending',
        isDone: true,
        date: booking.orderReceivedDate,
    }

    // Slots are confirmed as soon as they're booked
    const confirmed = { key: 'confirmed', title: 'Booking confirmed', subtitle: booking.salonName ? `By ${booking.salonName}` : 'Confirmed', isDone: true, date: booking.orderReceivedDate }

    const cancellationRequested = (isDone) => ({
        key: 'cancellation_requested',
        title: 'Cancellation requested',
        // "07 Oct 2026 · 12:00 AM": when the customer asked
        subtitle: booking.cancelRequestedDate ? salonDateTimeLabel(booking.cancelRequestedDate) : 'Requested',
        isDone,
        // Hollow on the screen while the salon reviews it
        isCurrent: !isDone,
        date: booking.cancelRequestedDate,
    })

    // Approved: Booking placed → Booking confirmed → Cancellation requested → Booking cancelled
    if (tab === 'cancelled') {
        return [
            placed,
            confirmed,
            ...(booking.cancelRequestedDate ? [cancellationRequested(true)] : []),
            {
                key: 'cancelled',
                title: 'Booking cancelled',
                subtitle: booking.bookingCancelledDate ? `Approved by the salon · ${salonDateTimeLabel(booking.bookingCancelledDate)}` : 'Cancelled',
                isDone: true,
                date: booking.bookingCancelledDate,
            },
        ]
    }

    const completed = tab === 'completed'
    const serviceDay = {
        key: 'service_day',
        title: 'Service day',
        subtitle: `${shortDate(booking.slotDate)} · ${timeLabel(booking.startTime)}`,
        isDone: hasStarted(booking),
        date: booking.slotDate,
    }
    const serviceCompleted = {
        key: 'completed',
        title: 'Service completed',
        subtitle: completed ? (booking.orderStatus === 'No Show' ? 'No show' : 'Completed') : 'Pending',
        isDone: completed,
        date: null,
    }

    // Waiting for the salon: Booking placed → Booking confirmed → Cancellation requested → Service completed (Pending)
    if (booking.cancelStatus === 'pending') return [placed, confirmed, cancellationRequested(false), serviceCompleted]

    // Waiting for the salon: … → Reschedule requested ("To Fri, 11 Dec 2026 · 02:00 PM") → Service day → Service completed
    if (booking.rescheduleStatus === 'pending') {
        return [
            placed,
            confirmed,
            {
                key: 'reschedule_requested',
                title: 'Reschedule requested',
                subtitle: booking.requestedSlotDate
                    ? `To ${shortDate(booking.requestedSlotDate)} · ${timeLabel(booking.requestedStartTime)}`
                    : 'Requested',
                isDone: false,
                isCurrent: true,
                date: booking.rescheduleRequestedDate,
            },
            serviceDay,
            serviceCompleted,
        ]
    }

    return [placed, confirmed, serviceDay, serviceCompleted]
}

// Booking Details extras when the customer asked to cancel or reschedule: the request blocks, the badge while
// it waits, and the Invoice row for cancellations. Nothing is added for bookings without a request.
const requestDetails = (booking, tab) => {
    const cancellation = cancellationOf(booking)
    const reschedule = rescheduleOf(booking)
    const pendingRequest = pendingRequestOf(booking)

    return {
        ...(tab === 'upcoming' && pendingRequest && { statusLabel: pendingRequest.statusLabel }),
        ...(cancellation && {
            cancellation,
            // "Invoice · INV-BK-30418"
            invoice: { invoiceNumber: `INV-${bookingNumber(booking.bookingId)}`, label: 'Invoice' },
        }),
        ...(reschedule && { reschedule }),
    }
}

// ----- Salon Partner: requests and payments -----

// The salon's requests list; filters are optional ("all" or blank = every status / both kinds)
const bookingRequestsSchema = z.object({
    ...deviceFields,
    requestType: z.preprocess(
        (value) => {
            if (typeof value !== 'string') return value
            const key = value.trim().toLowerCase()
            if (key === 'all') return undefined
            return { cancellation: 'cancel', cancelled: 'cancel', rescheduling: 'reschedule' }[key] ?? key
        },
        z.enum(['cancel', 'reschedule'], { error: 'Request type must be cancel or reschedule' }).optional()
    ),
    status: z.preprocess(
        (value) => (typeof value === 'string' ? value.trim().toLowerCase() : value),
        z.enum(['pending', 'approved', 'rejected', 'all'], { error: 'Status must be one of: pending, approved, rejected, all' }).optional()
    ),
    limit: z.coerce.number({ error: 'Limit must be a number' })
        .int('Limit must be a whole number')
        .min(1, 'Limit must be 1 or more')
        .max(MAX_PAGE_SIZE, `Limit can be at most ${MAX_PAGE_SIZE}`)
        .optional(),
}).strict()

const respondRequestSchema = z.object({
    ...deviceFields,
    bookingId: bookingIdField,
    requestType: z.preprocess(
        (value) => (typeof value === 'string' ? ({ cancellation: 'cancel', rescheduling: 'reschedule' }[value.trim().toLowerCase()] ?? value.trim().toLowerCase()) : value),
        z.enum(['cancel', 'reschedule'], { error: 'Request type must be cancel or reschedule' })
    ),
    action: z.preprocess(
        (value) => (typeof value === 'string' ? ({ approved: 'approve', accept: 'approve', rejected: 'reject', decline: 'reject' }[value.trim().toLowerCase()] ?? value.trim().toLowerCase()) : value),
        z.enum(['approve', 'reject'], { error: 'Action must be approve or reject' })
    ),
    note: z.string().trim().max(500, 'Note can be up to 500 characters').refine(noMarkup, 'Invalid characters').optional(),
}).strict()

const recordPaymentSchema = z.object({
    ...deviceFields,
    bookingId: bookingIdField,
    paymentMode: z.preprocess(
        (value) => (typeof value === 'string' ? value.trim().toLowerCase() : value),
        z.enum(['online', 'cash'], { error: 'Payment mode must be online or cash' })
    ),
    // e.g. "UPI", "Card"; defaults to "Cash" for cash
    paymentMethod: z.string().trim().max(100, 'Payment method can be up to 100 characters').refine(noMarkup, 'Invalid characters').optional(),
}).strict()

const RESPOND_ERRORS = {
    not_found: 'Booking not found.',
    no_pending_request: 'There is no pending request of this type on this booking.',
    booking_closed: 'This booking is no longer active, so the request can only be rejected.',
    slot_not_found: 'The requested slot is no longer available. Please reject this request.',
    started: 'The requested slot has already started. Please reject this request.',
    already_booked: 'The customer already has a booking in the requested slot. Please reject this request.',
    full: 'The requested slot is now full. Please reject this request.',
    same_slot: 'The booking is already in the requested slot.',
}

const PAYMENT_ERRORS = {
    not_found: 'Booking not found.',
    cancelled: 'This booking is cancelled.',
    already_paid: 'This booking is already marked as paid.',
}

// Bookings are managed by Salon Partners (customer_type 1)
const findSalonPartner = async (req, res, data) => {
    const customer = await findLoggedInCustomer(req, res, data)
    if (!customer) return null

    if (customer.customerType !== '1') {
        res.status(200).json({ success: false, message: 'This feature is only available for Salon Partners.' })
        return null
    }

    return customer
}

// One request card for the partner
const formatRequest = (row) => {
    const request = row.requestType === 'cancel' ? cancellationOf(row) : rescheduleOf(row)
    const customerName = [row.firstName, row.lastName].filter(Boolean).join(' ').trim() || null

    return {
        bookingId: row.bookingId,
        bookingNumber: bookingNumber(row.bookingId),
        requestType: row.requestType,
        requestTypeLabel: row.requestType === 'cancel' ? 'Cancellation Request' : 'Reschedule Request',
        status: request.status,
        statusLabel: request.requestStatusLabel,
        customerName,
        mobileNumber: row.mobileNumber,
        serviceName: row.serviceName,
        bookingSchedule: scheduleOf(row.slotId, row.slotDate, row.startTime, row.endTime),
        amountLabel: rupees(row.totalAmount),
        paymentStatus: row.paymentStatus,
        requestedDateLabel: request.requestedDateLabel,
        respondedDateLabel: request.respondedDateLabel,
        responseNote: request.responseNote,
        ...(row.requestType === 'cancel'
            ? { cancelReasonLabel: request.cancelReasonLabel, cancelReasonNote: request.cancelReasonNote, refund: request.refund }
            : { currentSchedule: request.currentSchedule, requestedSchedule: request.requestedSchedule }),
        canApprove: request.status === 'pending',
        canReject: request.status === 'pending',
    }
}

// "Reschedule Requests" / "Cancellation Requests": the salon's requests, pending ones by default
const listBookingRequests = async (req, res) => {
    if (!(await validateRequestDevice(req, res))) return

    const parsed = bookingRequestsSchema.safeParse(req.body)

    if (!parsed.success) return sendValidationError(res, parsed.error)

    const { requestType } = parsed.data
    const status = parsed.data.status ?? 'pending'
    const limit = parsed.data.limit ?? MAX_PAGE_SIZE

    try {
        const partner = await findSalonPartner(req, res, parsed.data)
        if (!partner) return

        const [rows, pending] = await Promise.all([
            bookingModel.findSalonRequests(partner.customerId, { requestType, status: status === 'all' ? undefined : status, limit }),
            bookingModel.countPendingRequests(partner.customerId),
        ])

        return res.status(200).json({
            success: true,
            message: rows.length ? 'Requests fetched successfully' : 'No requests found',
            data: convertNulls({
                pendingCounts: { reschedule: pending.reschedule, cancel: pending.cancel },
                filters: { requestType: requestType ?? 'all', status },
                requests: rows.map(formatRequest),
            }),
        })
    } catch (err) {
        console.error('List booking requests error:', err)
        return res.status(200).json({ success: false, message: 'Something went wrong' })
    }
}

// Approve / reject a customer's cancellation or reschedule request
const respondBookingRequest = async (req, res) => {
    if (!(await validateRequestDevice(req, res))) return

    const parsed = respondRequestSchema.safeParse(req.body)

    if (!parsed.success) return sendValidationError(res, parsed.error)

    const d = parsed.data

    try {
        const partner = await findSalonPartner(req, res, d)
        if (!partner) return

        const result = await bookingModel.respondToRequest({
            bookingId: d.bookingId,
            salonId: partner.customerId,
            requestType: d.requestType,
            action: d.action,
            note: d.note || null,
            checkSlot: (slot) => (hasStarted(slot) ? 'started' : null),
            now: authModel.nowString(),
        })

        if (result.error) return res.status(200).json({ success: false, message: RESPOND_ERRORS[result.error] })

        const booking = result.booking
        const messages = {
            cancel: { approve: 'Cancellation approved. The booking is cancelled.', reject: 'Cancellation rejected. The booking stays active.' },
            reschedule: { approve: 'Reschedule approved. The booking has been moved.', reject: 'Reschedule rejected. The booking keeps its date and time.' },
        }

        return res.status(200).json({
            success: true,
            message: messages[d.requestType][d.action],
            data: convertNulls({
                ...formatRequest({ ...booking, requestType: d.requestType }),
                bookingStatus: booking.orderStatus,
                isCancel: booking.isCancel,
                // An approved reschedule took a place in the new slot
                ...(result.slot && { slot: formatSlot(result.slot) }),
            }),
        })
    } catch (err) {
        console.error('Respond booking request error:', err)
        return res.status(200).json({ success: false, message: 'Something went wrong' })
    }
}

// The salon marks a booking as paid, online or in cash (for the Payment Overview)
const recordBookingPayment = async (req, res) => {
    if (!(await validateRequestDevice(req, res))) return

    const parsed = recordPaymentSchema.safeParse(req.body)

    if (!parsed.success) return sendValidationError(res, parsed.error)

    const d = parsed.data

    try {
        const partner = await findSalonPartner(req, res, d)
        if (!partner) return

        const result = await bookingModel.recordPayment({
            bookingId: d.bookingId,
            salonId: partner.customerId,
            paymentMode: d.paymentMode,
            paymentMethod: d.paymentMethod || (d.paymentMode === 'cash' ? 'Cash' : null),
            now: authModel.nowString(),
        })

        if (result.error) return res.status(200).json({ success: false, message: PAYMENT_ERRORS[result.error] })

        const booking = result.booking

        return res.status(200).json({
            success: true,
            message: 'Payment recorded successfully',
            data: convertNulls({
                bookingId: booking.bookingId,
                bookingNumber: bookingNumber(booking.bookingId),
                paymentStatus: booking.paymentStatus,
                paymentMode: booking.paymentMode,
                paymentModeLabel: PAYMENT_MODE_LABELS[booking.paymentMode],
                paymentMethod: booking.paymentMethod,
                payment: paymentLabel(booking),
                amount: Number(booking.totalAmount),
                amountLabel: rupees(booking.totalAmount),
                paymentReceivedDate: booking.paymentReceivedDate,
            }),
        })
    } catch (err) {
        console.error('Record payment error:', err)
        return res.status(200).json({ success: false, message: 'Something went wrong' })
    }
}

// Cover image of each service, as on the service cards
const coverImages = async (req, serviceIds) => {
    const media = await withImageUrls(req, await serviceModel.findMediaForServices([...new Set(serviceIds)]))
    const covers = new Map()
    for (const row of media) if (!covers.has(row.serviceId)) covers.set(row.serviceId, row.url)
    return covers
}

// "My Bookings": the logged-in User's bookings, one tab at a time, with the count for every tab
const listBookings = async (req, res) => {
    if (!(await validateRequestDevice(req, res))) return

    const parsed = listBookingsSchema.safeParse(req.body)

    if (!parsed.success) return sendValidationError(res, parsed.error)

    const { tab } = parsed.data
    const page = parsed.data.page ?? 1
    const limit = parsed.data.limit ?? DEFAULT_PAGE_SIZE

    try {
        // Only the logged-in User's own bookings (customer ID from the token, never the body)
        const customer = await findUser(req, res, parsed.data)
        if (!customer) return

        const now = salonNow()
        const clock = { today: now.date, nowTime: `${now.time}:00` }
        const [counts, rows] = await Promise.all([
            bookingModel.countCustomerBookingsByTab(customer.customerId, clock),
            bookingModel.findCustomerBookings(customer.customerId, { tab, ...clock, limit, offset: (page - 1) * limit }),
        ])

        const covers = await coverImages(req, rows.map((row) => row.serviceId))
        const total = tab ? counts[tab] : counts.total
        const totalPages = Math.ceil(total / limit)

        return res.status(200).json({
            success: true,
            message: rows.length
                ? 'Bookings fetched successfully'
                : total ? 'No more bookings' : tab ? `No ${TAB_LABELS[tab].toLowerCase()} bookings` : 'No bookings yet',
            data: convertNulls({
                // The tabs with their numbers: "Upcoming 2 · Completed 2 · Cancelled 1"
                tabs: bookingModel.BOOKING_TAB_KEYS.map((key) => ({ key, label: TAB_LABELS[key], count: counts[key], isSelected: key === tab })),
                selectedTab: tab ?? null,
                bookings: rows.map((row) => ({
                    ...bookingBasics(row, row.tab),
                    imageUrl: covers.get(row.serviceId) || null,
                })),
                pagination: { page, limit, total, totalPages, hasNextPage: page < totalPages },
            }),
        })
    } catch (err) {
        console.error('List bookings error:', err)
        return res.status(200).json({ success: false, message: 'Something went wrong' })
    }
}

// "Booking Details": one of the logged-in User's bookings
const getBookingDetails = async (req, res) => {
    if (!(await validateRequestDevice(req, res))) return

    const parsed = bookingDetailsSchema.safeParse(req.body)

    if (!parsed.success) return sendValidationError(res, parsed.error)

    try {
        const customer = await findUser(req, res, parsed.data)
        if (!customer) return

        // Looked up by booking ID and the logged-in customer together, so other people's bookings are "not found"
        const booking = await bookingModel.findCustomerBooking(customer.customerId, parsed.data.bookingId)
        if (!booking) return res.status(200).json({ success: false, message: 'Booking not found.' })

        const tab = tabOf(booking)
        const [address, covers] = await Promise.all([
            addressModel.findDefaultAddress(booking.salonId),
            coverImages(req, [booking.serviceId]),
        ])
        const basics = bookingBasics(booking, tab)
        const location = buildSalonLocation(booking.salonId, booking.salonName, address)
        const pricePaise = toPaise(booking.servicePrice)
        const discountPaise = toPaise(booking.couponDiscountAmount || 0)

        return res.status(200).json({
            success: true,
            message: 'Booking details fetched successfully',
            data: convertNulls({
                ...basics,
                imageUrl: covers.get(booking.serviceId) || null,
                // Header line: "09 Oct 2026 · 11:00 AM · At Salon"
                headerSubtitle: [basics.bookingDateLabel, basics.timeLabel, basics.serviceTypeLabel].filter(Boolean).join(' · '),
                timeline: buildTimeline(booking, tab),
                // The details card, row by row
                details: {
                    bookingId: basics.bookingNumber,
                    salon: booking.salonName,
                    // No employees/artists are stored yet
                    employee: null,
                    dateAndSlot: `${basics.bookingDateLabel} · ${basics.timeLabel}`,
                    payment: paymentLabel(booking),
                    amount: basics.amountLabel,
                },
                price: {
                    servicePrice: fromPaise(pricePaise),
                    discount: fromPaise(discountPaise),
                    couponCode: booking.discountCouponCode || null,
                    totalAmount: basics.amount,
                    totalAmountLabel: basics.amountLabel,
                },
                // "At Salon address" card
                address: {
                    label: basics.serviceTypeLabel ? `${basics.serviceTypeLabel} address` : 'Address',
                    ...location,
                    // "Beaunic Salon Academy, Main Market, Dildarnagar, Uttar Pradesh 232326"
                    fullAddressWithName: [booking.salonName, location.fullAddress].filter(Boolean).join(', ') || null,
                },
                // No employees/artists (or their ratings) are stored yet
                employee: null,
                customer: {
                    customerId: booking.customerId,
                    name: [booking.firstName, booking.lastName].filter(Boolean).join(' ').trim() || null,
                    mobileNumber: booking.mobileNumber,
                    email: booking.email,
                },
                notes: booking.bookingNotes,
                bookedOn: booking.orderReceivedDate,
                // Only for a cancelled booking; everything above stays as it is otherwise
                ...requestDetails(booking, tab),
            }),
        })
    } catch (err) {
        console.error('Booking details error:', err)
        return res.status(200).json({ success: false, message: 'Something went wrong' })
    }
}

// ----- Salon Partner: Bookings screen -----

// Every filter is optional: blank, null or missing means "not used". The salon is never taken from the body.
const salonBookingsSchema = z.object({
    ...deviceFields,
    // The tag: All / Upcoming / Completed / Cancelled ("All" or blank = every booking)
    tab: z.preprocess(
        (value) => (typeof value === 'string' ? (value.trim().toLowerCase() === 'all' ? undefined : value.trim().toLowerCase()) : value),
        z.enum(bookingModel.BOOKING_TAB_KEYS, { error: 'Tab must be one of: all, upcoming, completed, cancelled' }).optional()
    ),
    // "Search ID, customer, service"
    search: z.string().trim().max(100, 'Search can be up to 100 characters').optional(),
    // Filter sheet
    date: z.string()
        .trim()
        .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format')
        .refine((value) => !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().startsWith(value), 'Enter a valid date')
        .optional(),
    paymentStatus: z.preprocess(
        (value) => (typeof value === 'string' ? { paid: 'Paid', unpaid: 'Unpaid' }[value.trim().toLowerCase()] ?? value : value),
        z.enum(['Paid', 'Unpaid'], { error: 'Payment status must be paid or unpaid' }).optional()
    ),
    page: z.coerce.number({ error: 'Page must be a number' }).int('Page must be a whole number').min(1, 'Page must be 1 or more').optional(),
    limit: z.coerce.number({ error: 'Limit must be a number' })
        .int('Limit must be a whole number')
        .min(1, 'Limit must be 1 or more')
        .max(MAX_PAGE_SIZE, `Limit can be at most ${MAX_PAGE_SIZE}`)
        .optional(),
}).strict()

// "Priya Sharma" -> "PS"
const nameInitials = (name) => (name || '').split(/\s+/).filter(Boolean).slice(0, 2).map((word) => word[0]).join('').toUpperCase() || null

// One booking card on the partner's Bookings screen
const formatSalonBooking = (row) => {
    const customerName = [row.firstName, row.lastName].filter(Boolean).join(' ').trim() || null
    const pendingRequest = pendingRequestOf(row)
    const paid = row.paymentStatus === 'Paid'
    const mode = paymentModeOf(row)

    return {
        bookingId: row.bookingId,
        bookingNumber: bookingNumber(row.bookingId),
        // The badge: the tab, or the request waiting for the salon
        status: row.tab,
        statusLabel: (row.tab === 'upcoming' && pendingRequest?.statusLabel) || TAB_LABELS[row.tab] || row.orderStatus,
        pendingRequest,
        customerName,
        initials: nameInitials(customerName),
        mobileNumber: row.mobileNumber,
        serviceId: row.serviceId,
        serviceName: row.serviceName,
        slotId: row.slotId,
        date: row.slotDate,
        dateLabel: shortDate(row.slotDate),
        startTime: hhmm(row.startTime),
        endTime: hhmm(row.endTime),
        // "10:00 AM – 11:00 AM"
        timeSlotLabel: `${timeLabel(row.startTime)} – ${timeLabel(row.endTime)}`,
        // No employees are stored yet
        employeeName: null,
        employeeLabel: 'Not assigned',
        amount: Number(row.totalAmount),
        amountLabel: rupees(row.totalAmount),
        paymentStatus: row.paymentStatus,
        paymentMode: mode,
        // "Paid · Online" (green dot) / "Unpaid · Cash at salon" (red dot)
        paymentLabel: paid ? `Paid · ${row.paymentMethod || PAYMENT_MODE_LABELS[mode] || 'Online'}` : 'Unpaid · Cash at salon',
        isPaid: paid,
        // "Update Status": only while the booking is active
        canUpdateStatus: row.tab === 'upcoming',
    }
}

// "Bookings" (Salon Partner): only the logged-in partner's salon, one tag at a time, with the counts for every tag
const listSalonBookings = async (req, res) => {
    if (!(await validateRequestDevice(req, res))) return

    const parsed = salonBookingsSchema.safeParse(req.body)

    if (!parsed.success) return sendValidationError(res, parsed.error)

    const { tab, date, paymentStatus } = parsed.data
    const search = parsed.data.search || undefined
    const page = parsed.data.page ?? 1
    const limit = parsed.data.limit ?? DEFAULT_PAGE_SIZE

    try {
        const partner = await findSalonPartner(req, res, parsed.data)
        if (!partner) return

        // The salon is the logged-in partner (from the token), never an ID from the request
        const salonId = partner.customerId
        const now = salonNow()
        const filters = { search, date, paymentStatus, today: now.date, nowTime: `${now.time}:00` }

        const [counts, rows, pending] = await Promise.all([
            bookingModel.countSalonBookingsByTab(salonId, filters),
            bookingModel.findSalonBookings(salonId, { ...filters, tab, limit, offset: (page - 1) * limit }),
            bookingModel.countPendingRequests(salonId),
        ])

        const total = tab ? counts[tab] : counts.total
        const totalPages = Math.ceil(total / limit)
        const isFiltered = Boolean(search || date || paymentStatus)

        return res.status(200).json({
            success: true,
            message: rows.length
                ? 'Bookings fetched successfully'
                : total ? 'No more bookings'
                    : isFiltered ? 'No bookings match your search'
                        : tab ? `No ${TAB_LABELS[tab].toLowerCase()} bookings` : 'No bookings yet',
            data: convertNulls({
                // The Reschedule / Cancellations buttons at the top
                requests: {
                    reschedule: { label: 'Reschedule', pendingCount: pending.reschedule },
                    cancel: { label: 'Cancellations', pendingCount: pending.cancel },
                },
                // "All 7 · Upcoming 4 · Completed 2 · Cancelled 1"
                tabs: [
                    { key: 'all', label: 'All', count: counts.total, isSelected: !tab },
                    ...bookingModel.BOOKING_TAB_KEYS.map((key) => ({ key, label: TAB_LABELS[key], count: counts[key], isSelected: key === tab })),
                ],
                selectedTab: tab ?? 'all',
                filters: { search: search ?? null, date: date ?? null, paymentStatus: paymentStatus ?? null },
                bookings: rows.map(formatSalonBooking),
                pagination: { page, limit, total, totalPages, hasNextPage: page < totalPages },
            }),
        })
    } catch (err) {
        console.error('List salon bookings error:', err)
        return res.status(200).json({ success: false, message: 'Something went wrong' })
    }
}

module.exports = {
    createBooking,
    getBookingSummary,
    cancelBooking,
    rescheduleBooking,
    listBookings,
    getBookingDetails,
    listBookingRequests,
    respondBookingRequest,
    recordBookingPayment,
    listSalonBookings,
    paymentModeOf,
}
