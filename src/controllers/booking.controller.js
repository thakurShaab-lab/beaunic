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
const { buildSalonLocation, rupees } = require('./service.controller')
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

// The badge under the service name and the "Service type" line
const SERVICE_TYPE_LABELS = { salon: 'At Salon', home_service: 'At Home' }

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

module.exports = { createBooking, getBookingSummary }
