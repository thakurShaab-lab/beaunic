const { z } = require('zod')
const { sendValidationError } = require('../utils/validationError')
const authModel = require('../models/auth.model')
const serviceModel = require('../models/service.model')
const bookingModel = require('../models/booking.model')
const { validateRequestDevice } = require('./device&app.controller')
const { findLoggedInCustomer } = require('./profile.controller')
const { noMarkup } = require('./address.controller')
const { salonNow, timeLabel, dateParts, hhmm, formatSlot } = require('./slot.controller')
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

        // The service must be active and offered by an active, approved salon
        const service = await serviceModel.findActiveServiceWithSalon(d.serviceId)
        if (
            !service ||
            service.salonCustomerType !== '1' ||
            service.salonStatus !== '1' ||
            (d.salonId !== undefined && d.salonId !== service.customerId)
        ) {
            return res.status(200).json({ success: false, message: 'Service not found.' })
        }

        if (service.servicePrice === null) {
            return res.status(200).json({ success: false, message: 'This service can\'t be booked yet because its price is not set.' })
        }

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

module.exports = { createBooking }
