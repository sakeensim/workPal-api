const express = require('express')
const router = express.Router()

const userController = require('../controllers/user-controller')
const adminController = require('../controllers/admin-controller')
const adminAuth = require('../middleware/adminAuth')
const ownerAuth = require('../middleware/ownerAuth')
const salaryController = require('../controllers/salary-controller')
const branchController = require('../controllers/branch-controller')
const { authenticate } = require('../middleware/authenticate')
const positionController = require('../controllers/position-controller')
const holidayController = require('../controllers/holiday-controller')
const calendarController = require('../controllers/calendar-controller')
const shiftController = require('../controllers/shift-controller')
// Owner only: User Management
router.get('/user/list', authenticate, ownerAuth, userController.listUsers)
router.post('/user/update-role', authenticate, ownerAuth, userController.updateRole)
router.delete('/user/delete/:id', authenticate, ownerAuth, userController.deleteUser)
router.post('/admin/user', authenticate, ownerAuth, userController.createUser)

router.patch('/user/update-salary/:id', authenticate, ownerAuth, userController.updateBaseSalary)
router.patch('/admin/update-salary', authenticate, ownerAuth, salaryController.updateSalary)
router.patch('/admin/user-branch/:id', authenticate, ownerAuth, userController.updateUserBranch)
router.patch('/admin/user-position/:id', authenticate, ownerAuth, userController.updateUserPosition)

// Branch management
router.post('/admin/branch', authenticate, adminAuth, branchController.createBranch)
router.get('/admin/branches', authenticate, adminAuth, branchController.listBranches)
router.patch('/admin/branch/:id', authenticate, adminAuth, branchController.updateBranch)
router.delete('/admin/branch/:id', authenticate, adminAuth, branchController.deleteBranch)

// Position management
router.post('/admin/position', authenticate, adminAuth, positionController.createPosition)
router.get('/admin/positions', authenticate, adminAuth, positionController.listPositions)
router.patch('/admin/position/:id', authenticate, adminAuth, positionController.updatePosition)
router.delete('/admin/position/:id', authenticate, adminAuth, positionController.deletePosition)

// Holiday management
router.post('/admin/holiday', authenticate, adminAuth, holidayController.createHoliday)
router.get('/admin/holidays', authenticate, adminAuth, holidayController.getHolidays)
router.delete('/admin/holiday/:id', authenticate, adminAuth, holidayController.deleteHoliday)

// Admin + Owner
router.get('/admin/dashboard', authenticate, adminAuth, adminController.getEmployeesDashboard)
router.get('/admin/Work-time-record', authenticate, adminAuth, adminController.getTimetracking)
router.get('/admin/getemployee', authenticate, adminAuth, userController.listUsers)

router.get('/admin/pending-requests', authenticate, adminAuth, adminController.getPendingRequests)

router.patch('/admin/salary-approve/:id', authenticate, adminAuth, adminController.approveSalaryRequest)
router.patch('/admin/salary-reject/:id', authenticate, adminAuth, adminController.rejectSalaryRequest)

router.patch('/admin/dayoff-approve/:id', authenticate, adminAuth, adminController.approveDayOffRequest)
router.patch('/admin/dayoff-reject/:id', authenticate, adminAuth, adminController.rejectDayOffRequest)

router.get('/calendar/admin',authenticate,adminAuth,calendarController.getAdminCalendar)
router.post('/admin/calendar-note', authenticate, adminAuth, calendarController.createCalendarNote)
router.patch('/admin/calendar-note/:id', authenticate, adminAuth, calendarController.updateCalendarNote)
router.delete('/admin/calendar-note/:id', authenticate, adminAuth, calendarController.deleteCalendarNote)

router.post('/admin/shift',authenticate,adminAuth,shiftController.createShift)
router.get('/admin/shifts',authenticate,adminAuth,shiftController.listShifts)
router.patch('/admin/shift/:id',authenticate,adminAuth,shiftController.updateShift)
router.delete('/admin/shift/:id',authenticate,adminAuth,shiftController.deleteShift)
router.post('/admin/assign-shift',authenticate,adminAuth,shiftController.assignShift)
router.delete('/admin/remove-assigned-shift',authenticate,adminAuth,shiftController.removeAssignedShift)
router.get('/admin/employee-shifts',authenticate,adminAuth,shiftController.getEmployeeShifts)

module.exports = router