const { z } = require('zod')
const { sendValidationError } = require('../utils/validationError')
const authModel = require('../models/auth.model')
const slotModel = require('../models/slot.model')
const timeModel = require('../models/time.model')
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

// A wl_times ID, from /api/slot/times
const timeIdField = (label) =>
    z.coerce.number({ error: `${label} is required` }).int(`${label} is required`).positive(`${label} is required`)

const maxBookings = z.coerce.number({ error: 'Max bookings is required' })
    .int('Max bookings must be a whole number')
    .min(1, 'Max bookings must be at least 1')
    .max(MAX_BOOKINGS_LIMIT, `Max bookings can be at most ${MAX_BOOKINGS_LIMIT}`)

// startTimeId / endTimeId: wl_times IDs (from /api/slot/times)
const createSlotSchema = z.object({
    ...deviceFields,
    slotDate: slotDate(),
    startTimeId: timeIdField('Start time'),
    endTimeId: timeIdField('End time'),
    maxBookings,
}).strict()

// Only the fields sent are changed
const updateSlotSchema = z.object({
    ...deviceFields,
    slotId,
    slotDate: slotDate().optional(),
    startTimeId: timeIdField('Start time').optional(),
    endTimeId: timeIdField('End time').optional(),
    maxBookings: maxBookings.optional(),
}).strict()

const listTimesSchema = z.object({ ...deviceFields }).strict()

// "Select Time Slot": one salon's slots on one date, grouped Morning / Afternoon / Evening.
// salonId: required for a User (a Salon Partner always gets their own salon).
// showUnavailable: 1 also returns booked / already-started slots (isAvailable 0, shown struck through)
const availableSlotsSchema = z.object({
    ...deviceFields,
    salonId: z.coerce.number({ error: 'Salon ID must be a number' }).int().positive('Salon ID must be a number').optional(),
    date: slotDate(),
    showUnavailable: z.preprocess(
        (value) => (typeof value === 'string' ? ({ true: '1', false: '0', yes: '1', no: '0' }[value.trim().toLowerCase()] ?? value.trim()) : value),
        z.coerce.number({ error: 'Show unavailable must be 1 or 0' }).int().min(0).max(1, 'Show unavailable must be 1 or 0').optional()
    ),
}).strict()

// date: days of the month, comma-separated: "9", "9,10", "9,12,15". Empty / not sent = all available dates
// (today onwards). Returns e.g. [9, 12, 15].
const dayList = z.preprocess(
    (value) => (typeof value === 'number' ? String(value) : value),
    z.string({ error: 'Date must be day numbers like 9 or 9,10' })
        .transform((value) => value.split(',').map((part) => part.trim()).filter(Boolean))
        .refine(
            (parts) => parts.every((part) => /^\d{1,2}$/.test(part) && Number(part) >= 1 && Number(part) <= 31),
            'Date must be day numbers from 1 to 31, like 9 or 9,10'
        )
        .transform((parts) => [...new Set(parts.map(Number))])
)

// All filters are optional; no date / slotDate means "All Dates" (today onwards).
// slotId is still accepted so older apps don't fail, but it no longer filters anything.
// salonId: required for a User (whose slots to show); a Salon Partner always sees their own, so it's ignored.
const listSlotsSchema = z.object({
    ...deviceFields,
    salonId: z.coerce.number({ error: 'Salon ID must be a number' }).int().positive('Salon ID must be a number').optional(),
    slotId: slotId.optional(),
    date: dayList.optional(),
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

// startTimeId / endTimeId (whichever are sent) -> { startTime, endTime } as "HH:MM:SS" from wl_times.
// Sends the error and returns null when an ID is not an active time.
const resolveTimes = async (res, { startTimeId, endTimeId }) => {
    const ids = [startTimeId, endTimeId].filter((id) => id !== undefined)
    if (!ids.length) return {}

    const rows = await timeModel.findActiveTimesByIds([...new Set(ids)])
    const byId = new Map(rows.map((row) => [row.timeId, row.timeValue]))
    const times = {}

    for (const [field, id, label] of [['startTime', startTimeId, 'Start time'], ['endTime', endTimeId, 'End time']]) {
        if (id === undefined) continue
        if (!byId.has(id)) {
            res.status(200).json({ success: false, message: `${label} not found. Choose a time from the list.`, field: `${field}Id` })
            return null
        }
        times[field] = byId.get(id)
    }

    return times
}

// formatSlot plus startTimeId / endTimeId (the wl_times rows for the slot's times; "" when a time isn't in the table)
const formatSlotsWithTimeIds = async (slots) => {
    const values = [...new Set(slots.flatMap((slot) => [slot.startTime, slot.endTime]))]
    const rows = await timeModel.findTimesByValues(values)
    const idByValue = new Map(rows.map((row) => [row.timeValue, row.timeId]))

    // Same fields and order as formatSlot, with each ID placed just before its time
    const ids = (slot) => ({ startTime: idByValue.get(slot.startTime) ?? null, endTime: idByValue.get(slot.endTime) ?? null })

    return slots.map((slot) => {
        const timeIds = ids(slot)
        return Object.fromEntries(
            Object.entries(formatSlot(slot)).flatMap(([key, value]) =>
                key in timeIds ? [[`${key}Id`, timeIds[key]], [key, value]] : [[key, value]]
            )
        )
    })
}

const formatSlotWithTimeIds = async (slot) => (await formatSlotsWithTimeIds([slot]))[0]

// The time picker for Create / Edit Slot: active rows of wl_times, earliest first
const listTimes = async (req, res) => {
    if (!(await validateRequestDevice(req, res))) return

    const parsed = listTimesSchema.safeParse(req.body)

    if (!parsed.success) return sendValidationError(res, parsed.error)

    try {
        const customer = await findSalonPartner(req, res, parsed.data)
        if (!customer) return

        const rows = await timeModel.findActiveTimes()

        return res.status(200).json({
            success: true,
            message: rows.length ? 'Times fetched successfully' : 'No times found',
            data: {
                total: rows.length,
                times: rows.map((row) => ({
                    timeId: row.timeId,
                    time: hhmm(row.timeValue),
                    timeLabel: row.timeLabel || timeLabel(row.timeValue),
                })),
            },
        })
    } catch (err) {
        console.error('List times error:', err)
        return res.status(200).json({ success: false, message: 'Something went wrong' })
    }
}

// "Create Slot"
const createSlot = async (req, res) => {
    if (!(await validateRequestDevice(req, res))) return

    const parsed = createSlotSchema.safeParse(req.body)

    if (!parsed.success) return sendValidationError(res, parsed.error)

    const d = parsed.data

    try {
        const customer = await findSalonPartner(req, res, d)
        if (!customer) return

        // The times come from wl_times by ID
        const times = await resolveTimes(res, d)
        if (!times) return

        if (times.endTime <= times.startTime) {
            return res.status(200).json({ success: false, message: 'End time must be after start time', field: 'endTimeId' })
        }

        const pastError = pastSlotError({ slotDate: d.slotDate, startTime: times.startTime })
        if (pastError) return res.status(200).json({ success: false, message: pastError })

        const now = authModel.nowString()
        const values = {
            customerId: customer.customerId,
            slotDate: d.slotDate,
            startTime: times.startTime,
            endTime: times.endTime,
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
            data: convertNulls({ slot: await formatSlotWithTimeIds({ ...values, slotId: result.slotId }) }),
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

// "Manage Slots" (Salon Partner) / a salon's slots (User): slots grouped by day, plus the date strip.
// date ("9,12,15") keeps only those days of the month
const listSlots = async (req, res) => {
    if (!(await validateRequestDevice(req, res))) return

    const parsed = listSlotsSchema.safeParse(req.body)

    if (!parsed.success) return sendValidationError(res, parsed.error)

    const { slotDate: date } = parsed.data
    const dayNumbers = parsed.data.date?.length ? parsed.data.date : undefined

    try {
        const owner = await findSlotOwner(req, res, parsed.data)
        if (!owner) return

        const today = salonNow().date
        const activeOnly = owner.isUser
        // Shown to a User, so the app knows which salon the slots belong to
        const salon = owner.salon && { salonId: owner.salon.salonId, salonName: owner.salon.salonName }

        // A User asking for a past day gets nothing
        const pastDayForUser = owner.isUser && date !== undefined && date < today
        const [slots, dateCounts] = await Promise.all([
            pastDayForUser
                ? []
                : slotModel.findCustomerSlots(owner.salonId, { ...(date !== undefined ? { slotDate: date } : { fromDate: today }), days: dayNumbers, activeOnly }),
            slotModel.countSlotsByDate(owner.salonId, today, { activeOnly }),
        ])

        const formatted = await formatSlotsWithTimeIds(slots)
        const days = []
        for (const [i, slot] of slots.entries()) {
            let group = days[days.length - 1]
            if (!group || group.slotDate !== slot.slotDate) {
                group = { slotDate: slot.slotDate, dateLabel: dateParts(slot.slotDate).label, slotCount: 0, slots: [] }
                days.push(group)
            }
            group.slots.push(formatted[i])
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

        const changesTime = [d.slotDate, d.startTimeId, d.endTimeId].some((value) => value !== undefined)
        if (changesTime && existing.bookedCount > 0) {
            return res.status(200).json({ success: false, message: 'This slot already has bookings, so its date and time can\'t be changed.' })
        }

        if (d.maxBookings !== undefined && d.maxBookings < existing.bookedCount) {
            return res.status(200).json({ success: false, message: `Max bookings can't be less than the ${existing.bookedCount} booking${existing.bookedCount === 1 ? '' : 's'} already made.` })
        }

        // New times come from wl_times by ID
        const times = await resolveTimes(res, d)
        if (!times) return

        const updated = {
            ...existing,
            slotDate: d.slotDate ?? existing.slotDate,
            startTime: times.startTime ?? existing.startTime,
            endTime: times.endTime ?? existing.endTime,
            maxBookings: d.maxBookings ?? existing.maxBookings,
        }

        if (hhmm(updated.endTime) <= hhmm(updated.startTime)) {
            return res.status(200).json({ success: false, message: 'End time must be after start time', field: 'endTimeId' })
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
            data: convertNulls({ slot: await formatSlotWithTimeIds(updated) }),
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

// The three groups on "Select Time Slot", by start time (salon time):
// Morning before 12:00 PM, Afternoon 12:00 PM – 3:59 PM, Evening from 4:00 PM
const DAY_PARTS = [
    { key: 'morning', label: 'Morning', icon: 'sun', from: '00:00', to: '12:00' },
    { key: 'afternoon', label: 'Afternoon', icon: 'sun', from: '12:00', to: '16:00' },
    { key: 'evening', label: 'Evening', icon: 'sparkle', from: '16:00', to: '24:00' },
]

// "Select Time Slot": the salon's slots on the chosen date in Morning / Afternoon / Evening.
// Only bookable slots by default: active, not full, and (today) not started yet.
const listAvailableSlots = async (req, res) => {
    if (!(await validateRequestDevice(req, res))) return

    const parsed = availableSlotsSchema.safeParse(req.body)

    if (!parsed.success) return sendValidationError(res, parsed.error)

    const { date } = parsed.data
    const showUnavailable = parsed.data.showUnavailable === 1

    try {
        const owner = await findSlotOwner(req, res, parsed.data)
        if (!owner) return

        const now = salonNow()
        if (date < now.date) return res.status(200).json({ success: false, message: 'Choose today or a future date', field: 'date' })

        // Only active slots, for the User and the partner alike (this is the booking screen)
        const slots = await slotModel.findCustomerSlots(owner.salonId, { slotDate: date, activeOnly: true })

        const groups = DAY_PARTS.map((part) => ({ key: part.key, label: part.label, icon: part.icon, count: 0, slots: [] }))
        let totalAvailable = 0

        for (const slot of slots) {
            const start = hhmm(slot.startTime)
            const full = slot.bookedCount >= slot.maxBookings
            const started = date === now.date && start <= now.time
            const isAvailable = !full && !started
            if (!isAvailable && !showUnavailable) continue

            const group = groups[DAY_PARTS.findIndex((part) => start >= part.from && start < part.to)]
            group.slots.push({
                slotId: slot.slotId,
                startTime: start,
                endTime: hhmm(slot.endTime),
                // The chip: "12:00 PM"
                timeLabel: timeLabel(slot.startTime),
                // "12:00 PM – 01:00 PM" (the "Selected slot" line can use either)
                timeRangeLabel: `${timeLabel(slot.startTime)} – ${timeLabel(slot.endTime)}`,
                availableCount: Math.max(slot.maxBookings - slot.bookedCount, 0),
                // 1 = can be picked; 0 = "Booked or unavailable" (struck through)
                isAvailable: isAvailable ? 1 : 0,
                unavailableReason: isAvailable ? null : full ? 'booked' : 'started',
            })
            if (isAvailable) {
                group.count += 1
                totalAvailable += 1
            }
        }

        const [morning, afternoon, evening] = groups
        const salon = owner.salon && { salonId: owner.salon.salonId, salonName: owner.salon.salonName }

        return res.status(200).json({
            success: true,
            message: totalAvailable ? 'Time slots fetched successfully' : 'No time slots available on this date',
            data: convertNulls({
                ...(salon && { salon }),
                // The date bar: "Wed, 07 Oct 2026"
                date,
                dateLabel: dateParts(date).label,
                totalAvailable,
                morning,
                afternoon,
                evening,
                legend: showUnavailable ? { label: 'Booked or unavailable' } : null,
            }),
        })
    } catch (err) {
        console.error('Available slots error:', err)
        return res.status(200).json({ success: false, message: 'Something went wrong' })
    }
}

module.exports = { createSlot, listSlots, updateSlot, deleteSlot, listTimes, listAvailableSlots, salonNow, timeLabel, dateParts, hhmm, formatSlot }