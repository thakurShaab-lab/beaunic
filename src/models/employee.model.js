const { eq, and, ne, asc, desc, inArray, count, sql } = require("drizzle-orm")
const db = require("../config/drizzle")
const { wlEmployees } = require("../schema/wl-employees")
const { wlBookings } = require("../schema/wl-bookings")

// wl_employees.status: 1=Active, 0=Inactive, 2=Deleted. A partner only ever reaches their own salon's employees.
const salonEmployees = (salonId) => and(eq(wlEmployees.salonId, salonId), ne(wlEmployees.status, "2"))

// The salon's employees, newest first
const findSalonEmployees = async (salonId) =>
    db.select().from(wlEmployees).where(salonEmployees(salonId)).orderBy(desc(wlEmployees.employeeId))

// Active employees, by name (the "Assigned Employee" dropdown)
const findActiveSalonEmployees = async (salonId) =>
    db
        .select()
        .from(wlEmployees)
        .where(and(eq(wlEmployees.salonId, salonId), eq(wlEmployees.status, "1")))
        .orderBy(asc(wlEmployees.employeeName))

const findSalonEmployee = async (salonId, employeeId) => {
    const rows = await db
        .select()
        .from(wlEmployees)
        .where(and(salonEmployees(salonId), eq(wlEmployees.employeeId, employeeId)))
        .limit(1)

    return rows[0] || null
}

const createEmployee = async (values) => {
    const [result] = await db.insert(wlEmployees).values(values)
    return result.insertId
}

const updateEmployee = async (employeeId, values) => {
    await db.update(wlEmployees).set(values).where(eq(wlEmployees.employeeId, employeeId))
}

// Soft delete: bookings keep showing who was assigned
const deleteEmployee = async (employeeId, now) => {
    await db.update(wlEmployees).set({ status: "2", employeeUpdatedDate: now }).where(eq(wlEmployees.employeeId, employeeId))
}

// Upcoming bookings assigned to each of these employees: Map(employeeId -> count)
const countUpcomingBookings = async (salonId, employeeIds) => {
    if (!employeeIds.length) return new Map()

    const rows = await db
        .select({ employeeId: wlBookings.employeeId, total: count() })
        .from(wlBookings)
        .where(
            and(
                eq(wlBookings.salonId, salonId),
                inArray(wlBookings.employeeId, employeeIds),
                sql`${wlBookings.isCancel} <> '1' AND ${wlBookings.orderStatus} = 'Booked'`
            )
        )
        .groupBy(wlBookings.employeeId)

    return new Map(rows.map((row) => [row.employeeId, Number(row.total)]))
}

module.exports = {
    findSalonEmployees,
    findActiveSalonEmployees,
    findSalonEmployee,
    createEmployee,
    updateEmployee,
    deleteEmployee,
    countUpcomingBookings,
}
