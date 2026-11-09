const { z } = require('zod')
const { sendValidationError } = require('../utils/validationError')
const { validateRequestDevice } = require('./device&app.controller')
const { findLoggedInCustomer } = require('./profile.controller')
const { convertNulls } = require('../utils/convertNulls')

// Sample employees for the Employees section. There is no employees table yet, so this list is fixed
// (isSample: true) until employees can be added and saved.
const SAMPLE_EMPLOYEES = [
    { employeeId: 1, name: 'Neha Verma', role: 'Senior Makeup Artist', phone: '9876501234', email: 'neha.verma@example.com', rating: 4.9, reviewCount: 2600, experienceYears: 8, specialties: ['Bridal Makeup', 'HD Makeup', 'Party Makeup'], status: 'available', todayBookings: 3, joinedDate: '2019-04-12' },
    { employeeId: 2, name: 'Rohit Kumar', role: 'Hair Stylist', phone: '9876502345', email: 'rohit.kumar@example.com', rating: 4.7, reviewCount: 1450, experienceYears: 6, specialties: ['Haircut & Styling', 'Hair Colour', 'Keratin'], status: 'busy', todayBookings: 2, joinedDate: '2020-08-03' },
    { employeeId: 3, name: 'Pooja Singh', role: 'Skin & Facial Expert', phone: '9876503456', email: 'pooja.singh@example.com', rating: 4.8, reviewCount: 980, experienceYears: 5, specialties: ['Hydra Facial', 'Facial Cleanup', 'Skin Care'], status: 'available', todayBookings: 1, joinedDate: '2021-01-18' },
    { employeeId: 4, name: 'Anjali Mishra', role: 'Nail Technician', phone: '9876504567', email: 'anjali.mishra@example.com', rating: 4.6, reviewCount: 640, experienceYears: 4, specialties: ['Gel Polish Manicure', 'Nail Art', 'Pedicure'], status: 'available', todayBookings: 0, joinedDate: '2022-06-07' },
    { employeeId: 5, name: 'Sameer Khan', role: 'Massage Therapist', phone: '9876505678', email: 'sameer.khan@example.com', rating: 4.5, reviewCount: 410, experienceYears: 3, specialties: ['Head & Shoulder Massage', 'Spa'], status: 'on_leave', todayBookings: 0, joinedDate: '2023-02-20' },
]

const STATUS_LABELS = { available: 'Available', busy: 'Busy', on_leave: 'On Leave' }

const employeeListSchema = z.object({
    app_id: z.union([z.string(), z.number()]),
    device_id: z.string().trim().min(1, 'Device ID is required'),
    // Optional: one employee
    employeeId: z.coerce.number({ error: 'Employee ID must be a number' }).int().positive('Employee ID must be a number').optional(),
}).strict()

// "Neha Verma" -> "NV"
const initialsOf = (name) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((word) => word[0]).join('').toUpperCase()

// 2600 -> "2.6k"
const shortCount = (value) => (value >= 1000 ? `${Number((value / 1000).toFixed(1))}k` : String(value))

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const formatEmployee = (employee) => {
    const [year, month, day] = employee.joinedDate.split('-')
    return {
        ...employee,
        initials: initialsOf(employee.name),
        // No photos for sample employees; the app shows the initials
        imageUrl: null,
        statusLabel: STATUS_LABELS[employee.status],
        // "★ 4.9 · 2.6k reviews"
        ratingLabel: `★ ${employee.rating} · ${shortCount(employee.reviewCount)} reviews`,
        reviewCountLabel: `${shortCount(employee.reviewCount)} reviews`,
        experienceLabel: `${employee.experienceYears} yrs experience`,
        todayBookingsLabel: `${employee.todayBookings} booking${employee.todayBookings === 1 ? '' : 's'} today`,
        joinedDateLabel: `Joined ${day} ${MONTHS[Number(month) - 1]} ${year}`,
    }
}

// "Employees": the salon's team (sample data for now). Salon Partners only.
const listEmployees = async (req, res) => {
    if (!(await validateRequestDevice(req, res))) return

    const parsed = employeeListSchema.safeParse(req.body)

    if (!parsed.success) return sendValidationError(res, parsed.error)

    try {
        const customer = await findLoggedInCustomer(req, res, parsed.data)
        if (!customer) return

        if (customer.customerType !== '1') {
            return res.status(200).json({ success: false, message: 'This feature is only available for Salon Partners.' })
        }

        if (parsed.data.employeeId !== undefined) {
            const employee = SAMPLE_EMPLOYEES.find((row) => row.employeeId === parsed.data.employeeId)
            if (!employee) return res.status(200).json({ success: false, message: 'Employee not found.' })

            return res.status(200).json({
                success: true,
                message: 'Employee fetched successfully',
                data: convertNulls({ isSample: true, employee: formatEmployee(employee) }),
            })
        }

        const employees = SAMPLE_EMPLOYEES.map(formatEmployee)

        return res.status(200).json({
            success: true,
            message: 'Employees fetched successfully',
            data: convertNulls({
                isSample: true,
                total: employees.length,
                summary: {
                    available: employees.filter((row) => row.status === 'available').length,
                    busy: employees.filter((row) => row.status === 'busy').length,
                    onLeave: employees.filter((row) => row.status === 'on_leave').length,
                },
                employees,
            }),
        })
    } catch (err) {
        console.error('List employees error:', err)
        return res.status(200).json({ success: false, message: 'Something went wrong' })
    }
}

module.exports = { listEmployees }
