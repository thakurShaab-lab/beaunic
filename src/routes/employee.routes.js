const express = require('express')
const { createEmployee, updateEmployee, deleteEmployee, listEmployees, assignBookingEmployee } = require('../controllers/employee.controller')
const { jwtAuthMiddleware, deviceAuthMiddleware } = require('../middleware/auth.middleware')
const { parsePayload } = require('../middleware/payload.middleware')

const router = express.Router()

// Salon Partners (customer_type 1) only. The photo is optional, in the "employeeImage" file field.
router.post('/create', jwtAuthMiddleware, parsePayload('employeeImage'), deviceAuthMiddleware, createEmployee)
router.post('/update', jwtAuthMiddleware, parsePayload('employeeImage'), deviceAuthMiddleware, updateEmployee)
router.post('/delete', jwtAuthMiddleware, parsePayload(), deviceAuthMiddleware, deleteEmployee)
router.post('/list', jwtAuthMiddleware, parsePayload(), deviceAuthMiddleware, listEmployees)
// Assign a booking to an employee
router.post('/assign', jwtAuthMiddleware, parsePayload(), deviceAuthMiddleware, assignBookingEmployee)

module.exports = router
