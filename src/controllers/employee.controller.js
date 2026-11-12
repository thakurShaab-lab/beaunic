const fs = require('fs/promises')
const path = require('path')
const crypto = require('crypto')
const { z } = require('zod')
const { sendValidationError } = require('../utils/validationError')
const env = require('../config/env')
const authModel = require('../models/auth.model')
const employeeModel = require('../models/employee.model')
const bookingModel = require('../models/booking.model')
const { validateRequestDevice } = require('./device&app.controller')
const { findLoggedInCustomer } = require('./profile.controller')
const { detectImageExt } = require('./auth.controller')
const { noMarkup } = require('./address.controller')
const { convertNulls } = require('../utils/convertNulls')
const { resolveMediaUrl } = require('../utils/mediaUrl')

// Photos are saved in uploaded_files/employee (the folder served at /uploaded_files)
const EMPLOYEE_IMAGE_FOLDER = 'employee'
const EMPLOYEE_IMAGE_DIR = path.join(env.uploadDir, EMPLOYEE_IMAGE_FOLDER)

// wl_employees.salary is decimal(10,2)
const MAX_SALARY = 99999999.99

const deviceFields = {
    app_id: z.union([z.string(), z.number()]),
    device_id: z.string().trim().min(1, 'Device ID is required'),
}

const idField = (label) => z.coerce.number({ error: `${label} is required` }).int(`${label} is required`).positive(`${label} is required`)

// "Employee Name": letters, spaces and . ' -
const employeeName = z.string({ error: 'Employee name is required' })
    .trim()
    .min(2, 'Employee name must be at least 2 characters')
    .max(100, 'Employee name can be up to 100 characters')
    .regex(/^[\p{L}][\p{L} .'-]*$/u, 'Employee name can only contain letters, spaces and . \' -')

// "Designation", e.g. Hair Stylist
const designation = z.string({ error: 'Designation is required' })
    .trim()
    .min(2, 'Designation must be at least 2 characters')
    .max(100, 'Designation can be up to 100 characters')
    .refine(noMarkup, 'Invalid characters')

// "Salary" per month: "28000", "28,000" or "₹28,000.50"
const salary = z.preprocess(
    (value) => (typeof value === 'string' ? value.replace(/[₹,\s]/g, '') : value),
    z.coerce.number({ error: 'Salary is required' })
        .min(0, 'Salary can\'t be negative')
        .max(MAX_SALARY, 'Salary is too large')
        .refine((value) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-6, 'Salary can have at most 2 decimal places')
)

const createEmployeeSchema = z.object({
    ...deviceFields,
    employeeName,
    designation,
    salary,
}).strict()

// Only the fields sent are changed
const updateEmployeeSchema = z.object({
    ...deviceFields,
    employeeId: idField('Employee ID'),
    employeeName: employeeName.optional(),
    designation: designation.optional(),
    salary: salary.optional(),
}).strict()

const deleteEmployeeSchema = z.object({
    ...deviceFields,
    employeeId: idField('Employee ID'),
}).strict()

const listEmployeesSchema = z.object({
    ...deviceFields,
    // Optional: one employee
    employeeId: idField('Employee ID').optional(),
}).strict()

const assignEmployeeSchema = z.object({
    ...deviceFields,
    bookingId: idField('Booking ID'),
    employeeId: idField('Employee ID'),
}).strict()

const ASSIGN_ERRORS = {
    not_found: 'Booking not found.',
    employee_not_found: 'Employee not found.',
    closed: 'Only upcoming bookings can be assigned to an employee.',
    same_employee: 'This employee is already assigned to this booking.',
}

// Employees are only for Salon Partners (customer_type 1)
const findSalonPartner = async (req, res, data) => {
    const customer = await findLoggedInCustomer(req, res, data)
    if (!customer) return null

    if (customer.customerType !== '1') {
        res.status(200).json({ success: false, message: 'This feature is only available for Salon Partners.' })
        return null
    }

    return customer
}

const sendNotFound = (res) => res.status(200).json({ success: false, message: 'Employee not found.' })

// The uploaded photo (field "employeeImage") with a stored file name; undefined when none was sent.
// Returns null (after replying) when the file isn't an image.
const preparePhoto = (req, res) => {
    if (!req.file) return undefined

    const ext = detectImageExt(req.file.buffer)
    if (!ext) {
        res.status(200).json({ success: false, message: 'Employee image must be a PNG, JPG, WEBP or HEIC image' })
        return null
    }

    return { name: crypto.randomBytes(12).toString('hex') + ext, buffer: req.file.buffer }
}

const writePhoto = async (photo) => {
    await fs.mkdir(EMPLOYEE_IMAGE_DIR, { recursive: true })
    await fs.writeFile(path.join(EMPLOYEE_IMAGE_DIR, photo.name), photo.buffer)
}

const deletePhoto = (name) => (name ? fs.unlink(path.join(EMPLOYEE_IMAGE_DIR, name)).catch(() => { }) : Promise.resolve())

const photoUrl = (req, name) => resolveMediaUrl(req, EMPLOYEE_IMAGE_FOLDER, name, null, env.staticFileBaseUrl)

// "Neha Verma" -> "NV"
const initialsOf = (name) => String(name || '').split(/\s+/).filter(Boolean).slice(0, 2).map((word) => word[0]).join('').toUpperCase() || null

// 28000 -> "₹28,000"
const rupees = (value) =>
    `₹${Number(value).toLocaleString('en-IN', { minimumFractionDigits: Number.isInteger(Number(value)) ? 0 : 2, maximumFractionDigits: 2 })}`

const STATUS_LABELS = { 1: 'Active', 0: 'Inactive' }

// One employee card; imageUrl comes from photoUrl (null when there's no photo, and the app shows the initials)
const formatEmployee = (employee, imageUrl, upcomingBookings) => ({
    employeeId: employee.employeeId,
    employeeName: employee.employeeName,
    designation: employee.designation,
    salary: Number(employee.salary),
    // "₹28,000 / month"
    salaryLabel: `${rupees(employee.salary)} / month`,
    initials: initialsOf(employee.employeeName),
    imageUrl,
    status: employee.status,
    statusLabel: STATUS_LABELS[employee.status] || null,
    ...(upcomingBookings !== undefined && { upcomingBookings }),
    addedDate: employee.employeeAddedDate,
})

// "Add Employee"
const createEmployee = async (req, res) => {
    if (!(await validateRequestDevice(req, res))) return

    const parsed = createEmployeeSchema.safeParse(req.body)

    if (!parsed.success) return sendValidationError(res, parsed.error)

    const d = parsed.data
    let photo

    try {
        const partner = await findSalonPartner(req, res, d)
        if (!partner) return

        photo = preparePhoto(req, res)
        if (photo === null) return
        if (photo) await writePhoto(photo)

        const now = authModel.nowString()
        const values = {
            salonId: partner.customerId,
            employeeName: d.employeeName,
            designation: d.designation,
            salary: d.salary.toFixed(2),
            employeeImage: photo ? photo.name : null,
            status: '1',
            employeeAddedDate: now,
            employeeUpdatedDate: now,
        }
        const employeeId = await employeeModel.createEmployee(values)

        return res.status(200).json({
            success: true,
            message: 'Employee added successfully',
            data: convertNulls({ employee: formatEmployee({ ...values, employeeId }, photo ? await photoUrl(req, photo.name) : null, 0) }),
        })
    } catch (err) {
        if (photo) await deletePhoto(photo.name)
        console.error('Create employee error:', err)
        return res.status(200).json({ success: false, message: 'Something went wrong' })
    }
}

// "Edit" (pencil): name, designation, salary and/or a new photo
const updateEmployee = async (req, res) => {
    if (!(await validateRequestDevice(req, res))) return

    const parsed = updateEmployeeSchema.safeParse(req.body)

    if (!parsed.success) return sendValidationError(res, parsed.error)

    const d = parsed.data
    let photo

    try {
        const partner = await findSalonPartner(req, res, d)
        if (!partner) return

        const existing = await employeeModel.findSalonEmployee(partner.customerId, d.employeeId)
        if (!existing) return sendNotFound(res)

        photo = preparePhoto(req, res)
        if (photo === null) return

        const changes = {
            ...(d.employeeName !== undefined && { employeeName: d.employeeName }),
            ...(d.designation !== undefined && { designation: d.designation }),
            ...(d.salary !== undefined && { salary: d.salary.toFixed(2) }),
            ...(photo && { employeeImage: photo.name }),
        }
        if (!Object.keys(changes).length) {
            return res.status(200).json({ success: false, message: 'Nothing to update. Send the employee name, designation, salary or image.' })
        }

        // Taken before the update, so it's always the old file that gets removed
        const oldImage = existing.employeeImage
        const updated = { ...existing, ...changes }

        if (photo) await writePhoto(photo)
        changes.employeeUpdatedDate = authModel.nowString()
        updated.employeeUpdatedDate = changes.employeeUpdatedDate
        await employeeModel.updateEmployee(existing.employeeId, changes)
        // The old photo goes once the new one is saved
        if (photo && oldImage !== photo.name) await deletePhoto(oldImage)
        const upcoming = await employeeModel.countUpcomingBookings(partner.customerId, [existing.employeeId])

        return res.status(200).json({
            success: true,
            message: 'Employee updated successfully',
            data: convertNulls({ employee: formatEmployee(updated, await photoUrl(req, updated.employeeImage), upcoming.get(existing.employeeId) || 0) }),
        })
    } catch (err) {
        if (photo) await deletePhoto(photo.name)
        console.error('Update employee error:', err)
        return res.status(200).json({ success: false, message: 'Something went wrong' })
    }
}

// "Delete" (bin). Not allowed while the employee has upcoming bookings; past bookings keep their name.
const deleteEmployee = async (req, res) => {
    if (!(await validateRequestDevice(req, res))) return

    const parsed = deleteEmployeeSchema.safeParse(req.body)

    if (!parsed.success) return sendValidationError(res, parsed.error)

    try {
        const partner = await findSalonPartner(req, res, parsed.data)
        if (!partner) return

        const existing = await employeeModel.findSalonEmployee(partner.customerId, parsed.data.employeeId)
        if (!existing) return sendNotFound(res)

        const upcoming = (await employeeModel.countUpcomingBookings(partner.customerId, [existing.employeeId])).get(existing.employeeId) || 0
        if (upcoming) {
            return res.status(200).json({
                success: false,
                message: `${existing.employeeName} is assigned to ${upcoming} upcoming booking${upcoming === 1 ? '' : 's'}. Assign ${upcoming === 1 ? 'it' : 'them'} to another employee first.`,
            })
        }

        await employeeModel.deleteEmployee(existing.employeeId, authModel.nowString())

        return res.status(200).json({
            success: true,
            message: 'Employee deleted successfully',
            data: { employeeId: existing.employeeId },
        })
    } catch (err) {
        console.error('Delete employee error:', err)
        return res.status(200).json({ success: false, message: 'Something went wrong' })
    }
}

// "Employees": the salon's employees, newest first; employeeId gives one
const listEmployees = async (req, res) => {
    if (!(await validateRequestDevice(req, res))) return

    const parsed = listEmployeesSchema.safeParse(req.body)

    if (!parsed.success) return sendValidationError(res, parsed.error)

    try {
        const partner = await findSalonPartner(req, res, parsed.data)
        if (!partner) return

        const salonId = partner.customerId

        if (parsed.data.employeeId !== undefined) {
            const employee = await employeeModel.findSalonEmployee(salonId, parsed.data.employeeId)
            if (!employee) return sendNotFound(res)

            const upcoming = await employeeModel.countUpcomingBookings(salonId, [employee.employeeId])
            return res.status(200).json({
                success: true,
                message: 'Employee fetched successfully',
                data: convertNulls({ employee: formatEmployee(employee, await photoUrl(req, employee.employeeImage), upcoming.get(employee.employeeId) || 0) }),
            })
        }

        const rows = await employeeModel.findSalonEmployees(salonId)
        const [upcoming, imageUrls] = await Promise.all([
            employeeModel.countUpcomingBookings(salonId, rows.map((row) => row.employeeId)),
            Promise.all(rows.map((row) => photoUrl(req, row.employeeImage))),
        ])

        return res.status(200).json({
            success: true,
            message: rows.length ? 'Employees fetched successfully' : 'No employees added yet',
            data: convertNulls({
                total: rows.length,
                employees: rows.map((row, i) => formatEmployee(row, imageUrls[i], upcoming.get(row.employeeId) || 0)),
            }),
        })
    } catch (err) {
        console.error('List employees error:', err)
        return res.status(200).json({ success: false, message: 'Something went wrong' })
    }
}

// "Assigned Employee" on Booking Details: gives an upcoming booking to one of the salon's active employees
const assignBookingEmployee = async (req, res) => {
    if (!(await validateRequestDevice(req, res))) return

    const parsed = assignEmployeeSchema.safeParse(req.body)

    if (!parsed.success) return sendValidationError(res, parsed.error)

    try {
        const partner = await findSalonPartner(req, res, parsed.data)
        if (!partner) return

        // Booking and employee are both looked up within the logged-in partner's salon
        const result = await bookingModel.assignEmployee({
            bookingId: parsed.data.bookingId,
            salonId: partner.customerId,
            employeeId: parsed.data.employeeId,
            now: authModel.nowString(),
        })
        if (result.error) return res.status(200).json({ success: false, message: ASSIGN_ERRORS[result.error] })

        const { booking, employee } = result

        return res.status(200).json({
            success: true,
            message: 'Employee assigned successfully',
            data: convertNulls({
                bookingId: booking.bookingId,
                bookingNumber: `BK-${booking.bookingId}`,
                employee: {
                    employeeId: employee.employeeId,
                    employeeName: employee.employeeName,
                    designation: employee.designation,
                    // "Rohit Kumar · Hair Stylist"
                    label: `${employee.employeeName} · ${employee.designation}`,
                    initials: initialsOf(employee.employeeName),
                    imageUrl: await photoUrl(req, employee.employeeImage),
                },
                employeeAssignedDate: booking.employeeAssignedDate,
            }),
        })
    } catch (err) {
        console.error('Assign employee error:', err)
        return res.status(200).json({ success: false, message: 'Something went wrong' })
    }
}

module.exports = { createEmployee, updateEmployee, deleteEmployee, listEmployees, assignBookingEmployee, photoUrl, initialsOf }
