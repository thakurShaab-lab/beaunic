const { z } = require('zod')
const { sendValidationError } = require('../utils/validationError')
const authModel = require('../models/auth.model')
const slotModel = require('../models/slot.model')
const complaintModel = require('../models/complaint.model')
const { validateRequestDevice } = require('./device&app.controller')
const { findLoggedInCustomer } = require('./profile.controller')
const { convertNulls } = require('../utils/convertNulls')

// Salons work in Indian time, so "today" and "already started" use it, not the server clock
const SALON_TIMEZONE = 'Asia/Kolkata'

const MAX_BOOKINGS_LIMIT = 100

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const FULL_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

// { date: "2026-10-07", time: "14:05" } in salon time
const salonNow = () => {
    const parts = Object.fromEntries(
        new Intl.DateTimeFormat('en-CA', {
            timeZone: SALON_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
        }).formatToParts(new Date()).map((part) => [part.type, part.value])
    )
    return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` }
}

const isRealDate = (value) => {
    const [year, month, day] = value.split('-').map(Number)
    const d = new Date(Date.UTC(year, month - 1, day))
    return d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day
}

// "10:00 AM", "10:00am", "10:00" or "14:30" -> "10:00" / "14:30"; anything else is left for the regex to reject
const toTime24 = (value) => {
    if (typeof value !== 'string') return value
    const match = /^(\d{1,2}):(\d{2})(?::\d{2})?\s*([ap]\.?m\.?)?$/i.exec(value.trim())
    if (!match) return value
    let hour = Number(match[1])
    const minute = Number(match[2])
    const meridiem = match[3] && match[3].replace(/\./g, '').toLowerCase()
    if (minute > 59 || (meridiem ? hour < 1 || hour > 12 : hour > 23)) return value
    if (meridiem) hour = (hour % 12) + (meridiem === 'pm' ? 12 : 0)
    return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

const deviceFields = {
    app_id: z.union([z.string(), z.number()]),
    device_id: z.string().trim().min(1, 'Device ID is required'),
}

const slotId = z.coerce.number({ error: 'Slot ID is required' }).int().positive('Slot ID is required')

const slotDate = (label = 'Date') =>
    z.string({ error: `${label} is required` })
        .trim()
        .regex(/^\d{4}-\d{2}-\d{2}$/, `${label} must be in YYYY-MM-DD format`)
        .refine(isRealDate, `Enter a valid ${label.toLowerCase()}`)

const timeField = (label) =>
    z.preprocess(
        toTime24,
        z.string({ error: `${label} is required` }).regex(/^\d{2}:\d{2}$/, `${label} must be a time like 10:00 AM`)
    )

const maxBookings = z.coerce.number({ error: 'Max bookings is required' })
    .int('Max bookings must be a whole number')
    .min(1, 'Max bookings must be at least 1')
    .max(MAX_BOOKINGS_LIMIT, `Max bookings can be at most ${MAX_BOOKINGS_LIMIT}`)

const endAfterStart = (d, ctx) => {
    if (d.startTime && d.endTime && d.endTime <= d.startTime) {
        ctx.addIssue({ code: 'custom', path: ['endTime'], message: 'End time must be after start time' })
    }
}

const createSlotSchema = z.object({
    ...deviceFields,
    slotDate: slotDate(),
    startTime: timeField('Start time'),
    endTime: timeField('End time'),
    maxBookings,
}).strict().superRefine(endAfterStart)

// Only the fields sent are changed
const updateSlotSchema = z.object({
    ...deviceFields,
    slotId,
    slotDate: slotDate().optional(),
    startTime: timeField('Start time').optional(),
    endTime: timeField('End time').optional(),
    maxBookings: maxBookings.optional(),
}).strict()

// Both filters are optional: no slotId lists slots; no slotDate means "All Dates" (today onwards).
// salonId: required for a User (whose slots to show); a Salon Partner always sees their own, so it's ignored.
const listSlotsSchema = z.object({
    ...deviceFields,
    salonId: z.coerce.number({ error: 'Salon ID must be a number' }).int().positive('Salon ID must be a number').optional(),
    slotId: slotId.optional(),
    slotDate: slotDate().optional(),
}).strict()

const deleteSlotSchema = z.object({
    ...deviceFields,
    slotId,
}).strict()

// Slots are only for Salon Partners (customer_type 1)
const findSalonPartner = async (req, res, data) => {
    const customer = await findLoggedInCustomer(req, res, data)
    if (!customer) return null

    if (customer.customerType !== '1') {
        res.status(200).json({ success: false, message: 'This feature is only available for Salon Partners.' })
        return null
    }

    return customer
}

const sendNotFound = (res) => res.status(200).json({ success: false, message: 'Slot not found.' })

// "14:00:00" -> "02:00 PM"
const timeLabel = (value) => {
    const [hour, minute] = String(value).split(':').map(Number)
    return `${String(hour % 12 || 12).padStart(2, '0')}:${String(minute).padStart(2, '0')} ${hour < 12 ? 'AM' : 'PM'}`
}

const hhmm = (value) => String(value).slice(0, 5)

// "2026-10-07" -> { day: "Wed", dayNumber: "07", month: "Oct", label: "Wed, 07 Oct 2026" }
const dateParts = (value) => {
    const [year, month, day] = value.split('-').map(Number)
    const weekday = DAYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()]
    const dayNumber = String(day).padStart(2, '0')
    return { day: weekday, dayNumber, month: MONTHS[month - 1], monthLabel: `${FULL_MONTHS[month - 1]} ${year}`, label: `${weekday}, ${dayNumber} ${MONTHS[month - 1]} ${year}` }
}

// The badge on each card: Available (none booked), Booked (some), Full (no places left)
const availabilityOf = (slot) =>
    slot.bookedCount >= slot.maxBookings ? 'full' : slot.bookedCount > 0 ? 'booked' : 'available'

const AVAILABILITY_LABELS = { available: 'Available', booked: 'Booked', full: 'Full' }

// statusCode / statusText: 1 Available (none booked), 2 Booked (some places booked), 3 Booked (every place booked)
const SLOT_STATUSES = {
    available: { statusCode: 1, statusText: 'Available' },
    booked: { statusCode: 2, statusText: 'Booked' },
    full: { statusCode: 3, statusText: 'Booked' },
}

const formatSlot = (slot) => {
    const availability = availabilityOf(slot)

    return {
        slotId: slot.slotId,
        slotDate: slot.slotDate,
        dateLabel: dateParts(slot.slotDate).label,
        startTime: hhmm(slot.startTime),
        endTime: hhmm(slot.endTime),
        startTimeLabel: timeLabel(slot.startTime),
        endTimeLabel: timeLabel(slot.endTime),
        timeLabel: `${timeLabel(slot.startTime)} – ${timeLabel(slot.endTime)}`,
        maxBookings: slot.maxBookings,
        bookedCount: slot.bookedCount,
        availableCount: Math.max(slot.maxBookings - slot.bookedCount, 0),
        bookedLabel: `${slot.bookedCount} of ${slot.maxBookings} booked`,
        // 0-100, for the progress bar
        bookedPercent: Math.min(Math.round((slot.bookedCount / slot.maxBookings) * 100), 100),
        availability,
        availabilityLabel: AVAILABILITY_LABELS[availability],
        ...SLOT_STATUSES[availability],
        // The Create Slot preview line
        previewLabel: `Up to ${slot.maxBookings} booking${slot.maxBookings === 1 ? '' : 's'} in this slot`,
    }
}

// A slot can't be placed in the past or start at a time that has already gone today
const pastSlotError = ({ slotDate: date, startTime }) => {
    const now = salonNow()
    if (date < now.date) return 'Choose today or a future date'
    if (date === now.date && hhmm(startTime) <= now.time) return 'Start time has already passed. Choose a later time.'
    return null
}

const overlapMessage = (overlap) =>
    `This time overlaps your ${timeLabel(overlap.startTime)} – ${timeLabel(overlap.endTime)} slot on ${dateParts(overlap.slotDate).label}.`

// "Create Slot"
const createSlot = async (req, res) => {
    if (!(await validateRequestDevice(req, res))) return

    const parsed = createSlotSchema.safeParse(req.body)

    if (!parsed.success) return sendValidationError(res, parsed.error)

    const d = parsed.data

    try {
        const customer = await findSalonPartner(req, res, d)
        if (!customer) return

        const pastError = pastSlotError(d)
        if (pastError) return res.status(200).json({ success: false, message: pastError })

        const now = authModel.nowString()
        const values = {
            customerId: customer.customerId,
            slotDate: d.slotDate,
            startTime: `${d.startTime}:00`,
            endTime: `${d.endTime}:00`,
            maxBookings: d.maxBookings,
            bookedCount: 0,
            status: '1',
            slotAddedDate: now,
            slotUpdatedDate: now,
        }

        const result = await slotModel.createSlotIfFree(values)
        if (result.overlap) return res.status(200).json({ success: false, message: overlapMessage(result.overlap) })

        return res.status(200).json({
            success: true,
            message: 'Slot created successfully',
            data: convertNulls({ slot: formatSlot({ ...values, slotId: result.slotId }) }),
        })
    } catch (err) {
        console.error('Create slot error:', err)
        return res.status(200).json({ success: false, message: 'Something went wrong' })
    }
}

// Whose slots the list shows: a Salon Partner sees their own (active and inactive);
// a User sees the active slots of the salon they send, from today onwards
const findSlotOwner = async (req, res, data) => {
    const customer = await findLoggedInCustomer(req, res, data)
    if (!customer) return null

    if (customer.customerType === '1') return { salonId: customer.customerId, salon: null, isUser: false }

    if (data.salonId === undefined) {
        res.status(200).json({ success: false, message: 'Salon ID is required', field: 'salonId' })
        return null
    }

    const salon = await complaintModel.findActiveSalon(data.salonId)
    if (!salon) {
        res.status(200).json({ success: false, message: 'Salon not found.' })
        return null
    }

    return { salonId: salon.salonId, salon, isUser: true }
}

// "Manage Slots" (Salon Partner) / a salon's slots (User): slots grouped by day, plus the date strip;
// slotId gives one slot
const listSlots = async (req, res) => {
    if (!(await validateRequestDevice(req, res))) return

    const parsed = listSlotsSchema.safeParse(req.body)

    if (!parsed.success) return sendValidationError(res, parsed.error)

    const { slotId: id, slotDate: date } = parsed.data

    try {
        const owner = await findSlotOwner(req, res, parsed.data)
        if (!owner) return

        const today = salonNow().date
        const activeOnly = owner.isUser
        // Shown to a User, so the app knows which salon the slots belong to
        const salon = owner.salon && { salonId: owner.salon.salonId, salonName: owner.salon.salonName }

        if (id !== undefined) {
            const slot = await slotModel.findCustomerSlot(owner.salonId, id, { activeOnly })
            // A User can't open a past slot
            if (!slot || (owner.isUser && slot.slotDate < today)) return sendNotFound(res)

            return res.status(200).json({
                success: true,
                message: 'Slot fetched successfully',
                data: convertNulls({ ...(salon && { salon }), slot: formatSlot(slot) }),
            })
        }

        // A User asking for a past day gets nothing
        const pastDayForUser = owner.isUser && date !== undefined && date < today
        const [slots, dateCounts] = await Promise.all([
            pastDayForUser
                ? []
                : slotModel.findCustomerSlots(owner.salonId, { ...(date !== undefined ? { slotDate: date } : { fromDate: today }), activeOnly }),
            slotModel.countSlotsByDate(owner.salonId, today, { activeOnly }),
        ])

        const days = []
        for (const slot of slots) {
            let group = days[days.length - 1]
            if (!group || group.slotDate !== slot.slotDate) {
                group = { slotDate: slot.slotDate, dateLabel: dateParts(slot.slotDate).label, slotCount: 0, slots: [] }
                days.push(group)
            }
            group.slots.push(formatSlot(slot))
            group.slotCount += 1
        }

        return res.status(200).json({
            success: true,
            message: slots.length ? 'Slots fetched successfully' : 'No slots found',
            data: convertNulls({
                ...(salon && { salon }),
                total: slots.length,
                // The date strip: every upcoming day that has slots
                dates: dateCounts.map((row) => {
                    const parts = dateParts(row.slotDate)
                    return { slotDate: row.slotDate, day: parts.day, dayNumber: parts.dayNumber, month: parts.month, monthLabel: parts.monthLabel, slotCount: Number(row.total) }
                }),
                days,
            }),
        })
    } catch (err) {
        console.error('List slots error:', err)
        return res.status(200).json({ success: false, message: 'Something went wrong' })
    }
}

const updateSlot = async (req, res) => {
    if (!(await validateRequestDevice(req, res))) return

    const parsed = updateSlotSchema.safeParse(req.body)

    if (!parsed.success) return sendValidationError(res, parsed.error)

    const d = parsed.data

    try {
        const customer = await findSalonPartner(req, res, d)
        if (!customer) return

        const existing = await slotModel.findCustomerSlot(customer.customerId, d.slotId)
        if (!existing) return sendNotFound(res)

        const now = salonNow()
        if (existing.slotDate < now.date || (existing.slotDate === now.date && hhmm(existing.startTime) <= now.time)) {
            return res.status(200).json({ success: false, message: 'This slot has already started and can no longer be changed.' })
        }

        const changesTime = [d.slotDate, d.startTime, d.endTime].some((value) => value !== undefined)
        if (changesTime && existing.bookedCount > 0) {
            return res.status(200).json({ success: false, message: 'This slot already has bookings, so its date and time can\'t be changed.' })
        }

        if (d.maxBookings !== undefined && d.maxBookings < existing.bookedCount) {
            return res.status(200).json({ success: false, message: `Max bookings can't be less than the ${existing.bookedCount} booking${existing.bookedCount === 1 ? '' : 's'} already made.` })
        }

        const updated = {
            ...existing,
            slotDate: d.slotDate ?? existing.slotDate,
            startTime: d.startTime ? `${d.startTime}:00` : existing.startTime,
            endTime: d.endTime ? `${d.endTime}:00` : existing.endTime,
            maxBookings: d.maxBookings ?? existing.maxBookings,
        }

        if (hhmm(updated.endTime) <= hhmm(updated.startTime)) {
            return res.status(200).json({ success: false, message: 'End time must be after start time', field: 'endTime' })
        }

        if (changesTime) {
            const pastError = pastSlotError(updated)
            if (pastError) return res.status(200).json({ success: false, message: pastError })
        }

        updated.slotUpdatedDate = authModel.nowString()
        const result = await slotModel.updateSlotIfFree(updated, {
            slotDate: updated.slotDate,
            startTime: updated.startTime,
            endTime: updated.endTime,
            maxBookings: updated.maxBookings,
            slotUpdatedDate: updated.slotUpdatedDate,
        })
        if (result.overlap) return res.status(200).json({ success: false, message: overlapMessage(result.overlap) })

        return res.status(200).json({
            success: true,
            message: 'Slot updated successfully',
            data: convertNulls({ slot: formatSlot(updated) }),
        })
    } catch (err) {
        console.error('Update slot error:', err)
        return res.status(200).json({ success: false, message: 'Something went wrong' })
    }
}

const deleteSlot = async (req, res) => {
    if (!(await validateRequestDevice(req, res))) return

    const parsed = deleteSlotSchema.safeParse(req.body)

    if (!parsed.success) return sendValidationError(res, parsed.error)

    try {
        const customer = await findSalonPartner(req, res, parsed.data)
        if (!customer) return

        const existing = await slotModel.findCustomerSlot(customer.customerId, parsed.data.slotId)
        if (!existing) return sendNotFound(res)

        if (existing.bookedCount > 0) {
            return res.status(200).json({ success: false, message: 'This slot already has bookings and can\'t be deleted.' })
        }

        await slotModel.deleteSlot(existing.slotId, authModel.nowString())

        return res.status(200).json({
            success: true,
            message: 'Slot deleted successfully',
            data: { slotId: existing.slotId },
        })
    } catch (err) {
        console.error('Delete slot error:', err)
        return res.status(200).json({ success: false, message: 'Something went wrong' })
    }
}

module.exports = { createSlot, listSlots, updateSlot, deleteSlot }