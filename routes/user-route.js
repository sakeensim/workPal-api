const express = require('express')
const router = express.Router()

const userController = require('../controllers/user-controller')
const timeController = require('../controllers/time-controller')
const shiftController = require('../controllers/shift-controller')
const calendarController = require('../controllers/calendar-controller')
const overtimeController = require('../controllers/overtime-controller')
const notificationController = require('../controllers/notification-controller')

const { authenticate } = require('../middleware/authenticate')
const { salaryAdvance } = require('../controllers/salary-controller')

// Profile
router.patch('/user/upload-img', authenticate, userController.uploadImg)
router.patch('/user/update-profile/:id', authenticate, userController.updateProfile)
router.get('/user/myProfile', authenticate, userController.myProfile)

// User's approved requests
router.get('/user/approved-requests', authenticate, userController.getUserApprovedRequests)

// Notification
router.get(
  '/user/notifications',
  authenticate,
  notificationController.getMyNotifications
)

router.patch(
  '/user/notifications/read-all',
  authenticate,
  notificationController.markAllNotificationsAsRead
)

router.patch(
  '/user/notifications/:id/read',
  authenticate,
  notificationController.markNotificationAsRead
)

// Check-In
router.post('/user/check-in', authenticate, timeController.checkIn)

// Check-Out
router.patch('/user/check-out', authenticate, timeController.checkOut)

// Day-Off
router.post('/user/day-off', authenticate, timeController.dayOff)

// Advance Salary
router.post('/user/advance-salary', authenticate, salaryAdvance)

// Cancel Day-Off
router.delete('/user/cancel-dayoff/:id', authenticate, timeController.deleteDayOff)

// User History
router.get('/user/history', authenticate, userController.getUserHistory)

// User Shifts
router.get('/user/my-shifts', authenticate, shiftController.getMyShifts)

// Calendar
router.get('/calendar/user', authenticate, calendarController.getUserCalendar)

// ถ้า route นี้ให้เฉพาะ admin/owner ใช้ แนะนำย้ายไป admin-route
router.post('/admin/calendar-note', authenticate, calendarController.createCalendarNote)

// Overtime
router.post('/user/overtime/start', authenticate, overtimeController.startOvertime)
router.patch('/user/overtime/end', authenticate, overtimeController.endOvertime)
router.get('/user/overtime/active', authenticate, overtimeController.getActiveOvertime)
router.get('/user/overtimes', authenticate, overtimeController.getMyOvertimes)

module.exports = router