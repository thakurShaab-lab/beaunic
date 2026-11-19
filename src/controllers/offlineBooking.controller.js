const { z } = require('zod')
const { sendValidationError } = require('../utils/validationError')
const authModel = require('../models/auth.model')
const offlineBookingModel = require('../models/offlineBooking.model')
const serviceModel = require('../models/service.model')
const slotModel = require('../models/slot.model')
const { validateRequestDevice } = require('./device&app.controller')
const { findLoggedInCustomer } = require('./profile.controller')
const { salonNow, timeLabel, dateParts, hhmm } = require('./slot.controller')
const { rupees, withImageUrls } = require('./service.controller')
const { convertNulls } = require('../utils/convertNulls')

// "Offline Client Order" (Salon Partners only): a booking the partner makes for a walk-in / phone client.
//   Step 1 Client  -> /booking/offline/client   (creates the offline booking, or updates its client)
//   Step 2 Service -> /booking/offline/services (list) + /booking/offline/service (save)
//   Step 3 Booking -> /booking/offline/slots    (date strip + time slots) + /booking/offline/slot (save)
//   Step 4 Summary -> /booking/offline/details  (order summary) + /booking/offline/confirm ("CREATE ORDER")
// Until step 4 is confirmed it is a draft in wl_offline_bookings: no wl_bookings row and no place taken in the slot.

const DEFAULT_PAGE_SIZE = 10
const MAX_PAGE_SIZE = 50
// Days on the "Booking Date" strip, from today
const DATE_STRIP_DAYS = 14

const PAYMENT_MODES = [
    { key: 'cash', label: 'Cash' },
    { key: 'online', label: 'Online' },
]

const STATUS_LABELS = { draft: 'Draft', confirmed: 'Confirmed' }

const deviceFields = {
    app_id: z.union([z.string(), z.number()]),
    device_id: z.string().trim().min(1, 'Device ID is required'),
}

const offlineBookingIdField = z.coerce.number({ error: 'Offline booking ID is required' })
    .int('Offline booking ID is required')
    .positive('Offline booking ID is required')

const lowerKey = (value) => (typeof value === 'string' ? value.trim().toLowerCase() : value)

// Step 1. Without offlineBookingId a new offline booking is started; with it, the client of that draft is changed.
const clientSchema = z.object({
    ...deviceFields,
    offlineBookingId: offlineBookingIdField.optional(),
    clientName: z.string({ error: 'Please enter the client name' })
        .trim()
        .min(2, 'Client name must be at least 2 characters')
        .max(50, 'Client name can be up to 50 characters')
        .regex(/^\p{L}[\p{L} .'-]*$/u, 'Client name can contain only letters, spaces, dots, apostrophes and hyphens'),
    mobileNumber: z.string({ error: 'Please enter the mobile number' })
        .trim()
        .regex(/^\d{10}$/, 'Please enter a valid 10-digit mobile number'),
}).strict()

const offlineBookingSchema = z.object({
    ...deviceFields,
    offlineBookingId: offlineBookingIdField,
}).strict()

const serviceSchema = z.object({
    ...deviceFields,
    offlineBookingId: offlineBookingIdField,
    serviceId: z.coerce.number({ error: 'Please select a service' }).int('Please select a service').positive('Please select a service'),
}).strict()

const isRealDate = (value) => {
    const [year, month, day] = value.split('-').map(Number)
    const d = new Date(Date.UTC(year, month - 1, day))
    return d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day
}

// date is optional: the saved slot's date, else today
const slotsSchema = z.object({
    ...deviceFields,
    offlineBookingId: offlineBookingIdField,
    date: z.string()
        .trim()
        .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format')
        .refine(isRealDate, 'Please enter a valid date')
        .optional(),
}).strict()

const slotSchema = z.object({
    ...deviceFields,
    offlineBookingId: offlineBookingIdField,
    slotId: z.coerce.number({ error: 'Please select a time slot' }).int('Please select a time slot').positive('Please select a time slot'),
}).strict()

const confirmSchema = z.object({
    ...deviceFields,
    offlineBookingId: offlineBookingIdField,
    paymentMode: z.preprocess(
        lowerKey,
        z.enum(PAYMENT_MODES.map((mode) => mode.key), { error: 'Payment mode must be cash or online' })
    ),
}).strict()

// status is optional: draft (incomplete, to resume), confirmed, or all / blank / missing for both
const listSchema = z.object({
    ...deviceFields,
    status: z.preprocess(
        (value) => (lowerKey(value) === 'all' || value === '' ? undefined : lowerKey(value)),
        z.enum(Object.keys(STATUS_LABELS), { error: 'Status must be draft, confirmed or all' }).optional()
    ),
    page: z.coerce.number({ error: 'Page must be a number' }).int('Page must be a whole number').min(1, 'Page must be 1 or more').optional(),
    limit: z.coerce.number({ error: 'Limit must be a number' })
        .int('Limit must be a whole number')
        .min(1, 'Limit must be 1 or more')
        .max(MAX_PAGE_SIZE, `Limit can be at most ${MAX_PAGE_SIZE}`)
        .optional(),
}).strict()

// Salon Partners only (customer_type 1); everyone else is turned away before anything is read or saved
const findSalonPartner = async (req, res, data) => {
    const customer = await findLoggedInCustomer(req, res, data)
    if (!customer) return null

    if (customer.customerType !== '1') {
        res.status(200).json({ success: false, message: 'This feature is only available for Salon Partners.' })
        return null
    }

    return customer
}

const fail = (res, message, extra = {}) => res.status(200).json({ success: false, message, ...extra })

// The partner's own offline booking, or replies "not found" (another salon's offline bookings are never found)
const findOwnOfflineBooking = async (res, salonId, offlineBookingId) => {
    const offlineBooking = await offlineBookingModel.findSalonOfflineBooking(salonId, offlineBookingId)
    if (!offlineBooking) fail(res, 'Offline booking not found.')
    return offlineBooking
}

// A confirmed booking can't be changed any more
const CONFIRMED_MESSAGE = 'This booking is already confirmed and can no longer be changed.'
const findOwnDraft = async (res, salonId, offlineBookingId) => {
    const offlineBooking = await findOwnOfflineBooking(res, salonId, offlineBookingId)
    if (!offlineBooking) return null
    if (offlineBooking.status === 'confirmed') {
        fail(res, CONFIRMED_MESSAGE, { currentStep: 4 })
        return null
    }
    return offlineBooking
}

// The four steps: 1 Client, 2 Service, 3 Booking, 4 Summary. status 1 = completed, 0 = not completed.
// Step 4 is completed only when the booking is confirmed.
const stepsOf = (offlineBooking) => [
    { step: 1, status: offlineBooking ? 1 : 0 },
    { step: 2, status: offlineBooking?.serviceId ? 1 : 0 },
    { step: 3, status: offlineBooking?.slotId ? 1 : 0 },
    { step: 4, status: offlineBooking?.status === 'confirmed' ? 1 : 0 },
]

// Where to resume: the first step not completed (4 once confirmed)
const currentStepOf = (steps) => (steps.find((item) => item.status === 0) || steps[steps.length - 1]).step

const hasStarted = (slot) => {
    const now = salonNow()
    return slot.slotDate < now.date || (slot.slotDate === now.date && hhmm(slot.startTime) <= now.time)
}

const slotTimeLabel = (slot) => `${timeLabel(slot.startTime)} – ${timeLabel(slot.endTime)}`

// The saved service (with its category and cover image) and slot; null when not chosen yet or since deleted
const findSelections = async (req, salonId, offlineBooking) => {
    const [serviceRows, slot] = await Promise.all([
        offlineBooking.serviceId ? serviceModel.findCustomerServicesWithCategory(salonId, { serviceId: offlineBooking.serviceId }) : [],
        offlineBooking.slotId ? slotModel.findCustomerSlot(salonId, offlineBooking.slotId) : null,
    ])
    const service = serviceRows[0] || null
    const media = service ? await withImageUrls(req, await serviceModel.findMediaForServices([service.serviceId])) : []

    return { service, imageUrl: media[0]?.url || null, slot }
}

// Everything the app needs to show (or resume) the offline booking at any step
const offlineBookingData = (offlineBooking, { service, imageUrl, slot }) => {
    const steps = stepsOf(offlineBooking)
    const selectedMode = offlineBooking.paymentMode || 'cash'

    return {
        offlineBookingId: offlineBooking.offlineBookingId,
        // The confirmed booking (wl_bookings), once step 4 is done
        bookingId: offlineBooking.bookingId,
        bookingNumber: offlineBooking.bookingId ? `BK-${offlineBooking.bookingId}` : null,
        status: offlineBooking.status,
        statusLabel: STATUS_LABELS[offlineBooking.status],
        currentStep: currentStepOf(steps),
        steps,
        // Step 1
        client: { clientName: offlineBooking.clientName, mobileNumber: offlineBooking.mobileNumber },
        // Step 2
        service: service && {
            serviceId: service.serviceId,
            serviceName: service.serviceName,
            categoryName: service.categoryName,
            imageUrl,
            price: service.servicePrice === null ? null : Number(service.servicePrice),
            priceLabel: service.servicePrice === null ? 'Price not set' : rupees(service.servicePrice),
        },
        // Step 3
        slot: slot && {
            slotId: slot.slotId,
            date: slot.slotDate,
            dateLabel: dateParts(slot.slotDate).label,
            startTime: hhmm(slot.startTime),
            endTime: hhmm(slot.endTime),
            timeLabel: slotTimeLabel(slot),
        },
        // Step 4 "ORDER SUMMARY": "Haircut & Styling", "Wed, 07 Oct 2026 · 11:30 AM – 12:30 PM", Amount
        summary: service && slot ? {
            title: 'Order Summary',
            serviceName: service.serviceName,
            dateTimeLabel: `${dateParts(slot.slotDate).label} · ${slotTimeLabel(slot)}`,
            amount: service.servicePrice === null ? null : Number(service.servicePrice),
            amountLabel: service.servicePrice === null ? 'Price not set' : rupees(service.servicePrice),
            amountNote: 'As per configured service price',
        } : null,
        paymentMode: offlineBooking.paymentMode,
        paymentModes: PAYMENT_MODES.map((mode) => ({ ...mode, isSelected: mode.key === selectedMode ? 1 : 0 })),
    }
}

const sendOfflineBooking = async (req, res, salonId, offlineBooking, message, extra = {}) =>
    res.status(200).json({
        success: true,
        message,
        data: convertNulls({ ...offlineBookingData(offlineBooking, await findSelections(req, salonId, offlineBooking)), ...extra }),
    })

const handle = (label, schema, work) => async (req, res) => {
    if (!(await validateRequestDevice(req, res))) return

    const parsed = schema.safeParse(req.body)

    if (!parsed.success) return sendValidationError(res, parsed.error)

    try {
        const partner = await findSalonPartner(req, res, parsed.data)
        if (!partner) return

        return await work(req, res, partner.customerId, parsed.data)
    } catch (err) {
        console.error(`${label} error:`, err)
        return res.status(200).json({ success: false, message: 'Something went wrong' })
    }
}

// Step 1 "Client Details": starts a new offline booking, or changes the client of a draft
const saveClient = handle('Offline booking client', clientSchema, async (req, res, salonId, d) => {
    const now = authModel.nowString()
    const values = { clientName: d.clientName.replace(/\s+/g, ' '), mobileNumber: d.mobileNumber, offlineBookingUpdatedDate: now }

    let offlineBookingId = d.offlineBookingId
    if (offlineBookingId) {
        if (!(await findOwnDraft(res, salonId, offlineBookingId))) return
        await offlineBookingModel.updateDraft(salonId, offlineBookingId, values)
    } else {
        offlineBookingId = await offlineBookingModel.createOfflineBooking({ ...values, salonId, offlineBookingAddedDate: now })
    }

    const offlineBooking = await offlineBookingModel.findSalonOfflineBooking(salonId, offlineBookingId)
    return sendOfflineBooking(req, res, salonId, offlineBooking, 'Client details saved')
})

// Step 2 "Select Service": the salon's active services that have a price, with the saved one selected
const listServices = handle('Offline booking services', offlineBookingSchema, async (req, res, salonId, d) => {
    const offlineBooking = await findOwnDraft(res, salonId, d.offlineBookingId)
    if (!offlineBooking) return

    const services = (await serviceModel.findCustomerServicesWithCategory(salonId))
        .filter((service) => service.status === '1' && service.servicePrice !== null)
    const media = await withImageUrls(req, await serviceModel.findMediaForServices(services.map((service) => service.serviceId)))
    // Cover image first (findMediaForServices puts it first), so the first row per service is the one shown
    const imageOf = new Map()
    for (const row of media) if (!imageOf.has(row.serviceId)) imageOf.set(row.serviceId, row.url)

    const steps = stepsOf(offlineBooking)

    return res.status(200).json({
        success: true,
        message: services.length ? 'Services fetched successfully' : 'No services available. Please add a service with a price first.',
        data: convertNulls({
            offlineBookingId: offlineBooking.offlineBookingId,
            currentStep: currentStepOf(steps),
            steps,
            title: 'Select Service',
            services: services.map((service) => ({
                serviceId: service.serviceId,
                serviceName: service.serviceName,
                categoryName: service.categoryName,
                imageUrl: imageOf.get(service.serviceId) || null,
                price: Number(service.servicePrice),
                priceLabel: rupees(service.servicePrice),
                isSelected: service.serviceId === offlineBooking.serviceId ? 1 : 0,
            })),
        }),
    })
})

// Step 2 "NEXT": saves the chosen service (one of the salon's active services with a price)
const saveService = handle('Offline booking service', serviceSchema, async (req, res, salonId, d) => {
    if (!(await findOwnDraft(res, salonId, d.offlineBookingId))) return

    const service = await serviceModel.findCustomerService(salonId, d.serviceId)
    if (!service || service.status !== '1') return fail(res, 'Service not found.', { field: 'serviceId' })
    if (service.servicePrice === null) return fail(res, 'This service can\'t be booked yet because its price is not set.', { field: 'serviceId' })

    await offlineBookingModel.updateDraft(salonId, d.offlineBookingId, { serviceId: service.serviceId, offlineBookingUpdatedDate: authModel.nowString() })

    const offlineBooking = await offlineBookingModel.findSalonOfflineBooking(salonId, d.offlineBookingId)
    return sendOfflineBooking(req, res, salonId, offlineBooking, 'Service saved')
})

// Adds days to "2026-10-07"
const addDays = (isoDate, days) => {
    const [year, month, day] = isoDate.split('-').map(Number)
    return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10)
}

// Step 3 "Booking Date" + "Time Slot": the date strip and the salon's slots on the chosen date.
// Slots that have already started are left out; full ones are shown as "Full" and can't be picked.
const listSlots = handle('Offline booking slots', slotsSchema, async (req, res, salonId, d) => {
    const offlineBooking = await findOwnDraft(res, salonId, d.offlineBookingId)
    if (!offlineBooking) return
    if (!offlineBooking.serviceId) return fail(res, 'Please select a service first.', { currentStep: 2 })

    const today = salonNow().date
    if (d.date !== undefined && d.date < today) return fail(res, 'Choose today or a future date', { field: 'date' })

    const savedSlot = offlineBooking.slotId ? await slotModel.findCustomerSlot(salonId, offlineBooking.slotId, { activeOnly: true }) : null
    const date = d.date ?? (savedSlot && savedSlot.slotDate >= today ? savedSlot.slotDate : today)

    const [slotDates, slots] = await Promise.all([
        slotModel.countSlotsByDate(salonId, today, { activeOnly: true }),
        slotModel.findCustomerSlots(salonId, { slotDate: date, activeOnly: true }),
    ])
    const datesWithSlots = new Set(slotDates.map((row) => row.slotDate))

    const timeSlots = slots
        .filter((slot) => !hasStarted(slot))
        .map((slot) => {
            const left = Math.max(slot.maxBookings - slot.bookedCount, 0)
            return {
                slotId: slot.slotId,
                startTime: hhmm(slot.startTime),
                endTime: hhmm(slot.endTime),
                // "11:30 AM – 12:30 PM"
                timeLabel: slotTimeLabel(slot),
                availableCount: left,
                // "2 left" / "Full"
                availabilityLabel: left > 0 ? `${left} left` : 'Full',
                isAvailable: left > 0 ? 1 : 0,
                isSelected: slot.slotId === offlineBooking.slotId ? 1 : 0,
            }
        })

    const steps = stepsOf(offlineBooking)

    return res.status(200).json({
        success: true,
        message: timeSlots.some((slot) => slot.isAvailable) ? 'Time slots fetched successfully' : 'No time slots available on this date',
        data: convertNulls({
            offlineBookingId: offlineBooking.offlineBookingId,
            currentStep: currentStepOf(steps),
            steps,
            selectedDate: date,
            selectedDateLabel: dateParts(date).label,
            // "Wed 07 Oct", "Thur 08 Oct", ...
            dates: Array.from({ length: DATE_STRIP_DAYS }, (_, index) => {
                const day = addDays(today, index)
                const parts = dateParts(day)
                return {
                    date: day,
                    day: parts.day,
                    dayNumber: parts.dayNumber,
                    month: parts.month,
                    hasSlots: datesWithSlots.has(day) ? 1 : 0,
                    isSelected: day === date ? 1 : 0,
                }
            }),
            timeSlots,
        }),
    })
})

// Step 3 "NEXT": saves the chosen slot. It must be the salon's active slot, not started and not full.
// The place is taken only on step 4 (Confirm), where this is checked again.
const saveSlot = handle('Offline booking slot', slotSchema, async (req, res, salonId, d) => {
    const draft = await findOwnDraft(res, salonId, d.offlineBookingId)
    if (!draft) return
    if (!draft.serviceId) return fail(res, 'Please select a service first.', { currentStep: 2 })

    const slot = await slotModel.findCustomerSlot(salonId, d.slotId, { activeOnly: true })
    if (!slot) return fail(res, 'Slot not found.', { field: 'slotId' })
    if (hasStarted(slot)) return fail(res, 'This slot has already started. Please choose another slot.', { field: 'slotId' })
    if (slot.bookedCount >= slot.maxBookings) return fail(res, 'This slot is full. Please choose another slot.', { field: 'slotId' })

    await offlineBookingModel.updateDraft(salonId, d.offlineBookingId, { slotId: slot.slotId, offlineBookingUpdatedDate: authModel.nowString() })

    const offlineBooking = await offlineBookingModel.findSalonOfflineBooking(salonId, d.offlineBookingId)
    return sendOfflineBooking(req, res, salonId, offlineBooking, 'Booking date and time saved')
})

// One offline booking with everything saved so far: resume at currentStep; step 4 shows "Order Summary"
const getOfflineBooking = handle('Offline booking details', offlineBookingSchema, async (req, res, salonId, d) => {
    const offlineBooking = await findOwnOfflineBooking(res, salonId, d.offlineBookingId)
    if (!offlineBooking) return

    return sendOfflineBooking(req, res, salonId, offlineBooking, 'Offline booking fetched successfully')
})

// Why "CREATE ORDER" failed, and the step to go back to
const CONFIRM_ERRORS = {
    not_found: { message: 'Offline booking not found.' },
    confirmed: { message: CONFIRMED_MESSAGE, currentStep: 4 },
    incomplete: { message: 'Please complete the client, service and booking steps first.' },
    service_unavailable: { message: 'This service is no longer available. Please choose another service.', currentStep: 2 },
    slot_not_found: { message: 'This time slot is no longer available. Please choose another slot.', currentStep: 3 },
    started: { message: 'This slot has already started. Please choose another slot.', currentStep: 3 },
    full: { message: 'This slot is full. Please choose another slot.', currentStep: 3 },
    already_booked: { message: 'This client already has a booking in this slot.', currentStep: 3 },
}

// Step 4 "CREATE ORDER": confirms the booking with the payment mode. Only now is the wl_bookings row made and a place
// taken in the slot. The client pays at the salon, so the booking is saved as Paid by Cash / Online.
const confirmBooking = handle('Offline booking confirm', confirmSchema, async (req, res, salonId, d) => {
    const now = authModel.nowString()
    const result = await offlineBookingModel.confirmOfflineBooking({
        salonId,
        offlineBookingId: d.offlineBookingId,
        paymentMode: d.paymentMode,
        checkSlot: (slot) => (hasStarted(slot) ? 'started' : null),
        // wl_orders-style order fields first, then the booking fields (as /booking/create)
        buildBooking: (draft, service, slot) => {
            const [firstName, ...rest] = draft.clientName.split(' ')
            return {
                customerId: null,
                customerType: 'Offline',
                firstName,
                lastName: rest.join(' ') || null,
                mobileNumber: draft.mobileNumber,
                totalAmount: service.servicePrice,
                currencyCode: 'INR',
                currencySymbol: '&#8377;',
                currencyValue: '1.000000',
                orderStatus: 'Booked',
                orderReceivedDate: now,
                paymentMethod: PAYMENT_MODES.find((mode) => mode.key === d.paymentMode).label,
                paymentStatus: 'Paid',
                paymentMode: d.paymentMode,
                paymentReceivedDate: now,
                salonId,
                serviceId: service.serviceId,
                slotId: slot.slotId,
                serviceName: service.serviceName,
                servicePrice: service.servicePrice,
                slotDate: slot.slotDate,
                startTime: slot.startTime,
                endTime: slot.endTime,
                bookingUpdatedDate: now,
            }
        },
        now,
    })

    if (result.error) {
        const error = CONFIRM_ERRORS[result.error]
        if (result.error === 'incomplete') {
            const draft = await offlineBookingModel.findSalonOfflineBooking(salonId, d.offlineBookingId)
            return fail(res, error.message, { currentStep: currentStepOf(stepsOf(draft)) })
        }
        return fail(res, error.message, error.currentStep ? { currentStep: error.currentStep } : {})
    }

    return sendOfflineBooking(req, res, salonId, result.offlineBooking, 'Order created successfully')
})

// The partner's offline bookings, newest first: drafts to resume (status: draft) and confirmed ones
const listOfflineBookings = handle('Offline bookings list', listSchema, async (req, res, salonId, d) => {
    const page = d.page ?? 1
    const limit = d.limit ?? DEFAULT_PAGE_SIZE

    const [total, rows] = await Promise.all([
        offlineBookingModel.countSalonOfflineBookings(salonId, { status: d.status }),
        offlineBookingModel.findSalonOfflineBookings(salonId, { status: d.status, limit, offset: (page - 1) * limit }),
    ])
    const totalPages = Math.ceil(total / limit)

    return res.status(200).json({
        success: true,
        message: rows.length ? 'Offline bookings fetched successfully' : total ? 'No more offline bookings' : 'No offline bookings yet',
        data: convertNulls({
            selectedStatus: d.status ?? 'all',
            offlineBookings: rows.map(({ offlineBooking, serviceName, slotDate, startTime, endTime }) => {
                const steps = stepsOf(offlineBooking)
                return {
                    offlineBookingId: offlineBooking.offlineBookingId,
                    bookingId: offlineBooking.bookingId,
                    status: offlineBooking.status,
                    statusLabel: STATUS_LABELS[offlineBooking.status],
                    currentStep: currentStepOf(steps),
                    steps,
                    clientName: offlineBooking.clientName,
                    mobileNumber: offlineBooking.mobileNumber,
                    serviceName: offlineBooking.serviceId ? serviceName : null,
                    dateTimeLabel: offlineBooking.slotId && slotDate
                        ? `${dateParts(slotDate).label} · ${slotTimeLabel({ startTime, endTime })}`
                        : null,
                }
            }),
            pagination: { page, limit, total, totalPages, hasNextPage: page < totalPages },
        }),
    })
})

module.exports = {
    saveClient,
    listServices,
    saveService,
    listSlots,
    saveSlot,
    getOfflineBooking,
    confirmBooking,
    listOfflineBookings,
}
