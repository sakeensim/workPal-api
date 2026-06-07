const express = require('express')
const router = express.Router()
const userController = require('../controllers/user-controller')
const timeController = require('../controllers/time-controller')
const shiftController = require('../controllers/shift-controller')
const {authenticate} = require('../middleware/authenticate')
const { salaryAdvance } = require('../controllers/salary-controller')
const calendarController = require('../controllers/calendar-controller')
const overtimeController = require('../controllers/overtime-controller')
//const { checkAllowedIP } = require('../middleware/checkAllowedIP')


//Profile
router.patch('/user/upload-img',authenticate,userController.uploadImg)
router.patch('/user/update-profile/:id',authenticate,userController.updateProfile)  
router.get('/user/myProfile',authenticate,userController.myProfile)

//user's approved requests
router.get('/user/approved-requests',authenticate,userController.getUserApprovedRequests)

//Check-In 
router.post('/user/check-in', authenticate, timeController.checkIn)

//check-out
router.patch('/user/check-out', authenticate, timeController.checkOut)

//Day-Off
router.post('/user/day-off',authenticate,timeController.dayOff)

//Advance Salart
router.post('/user/advance-salary',authenticate,salaryAdvance)


//delete dayoff
router.delete('/user/cancel-dayoff/:id', authenticate,timeController.deleteDayOff)
router.get('/user/history', authenticate, userController.getUserHistory)

router.get('/user/my-shifts',authenticate,shiftController.getMyShifts)

router.get('/calendar/user',authenticate,calendarController.getUserCalendar)
router.post('/admin/calendar-note', authenticate, calendarController.createCalendarNote)

router.post('/user/overtime/start', authenticate, overtimeController.startOvertime)
router.patch('/user/overtime/end', authenticate, overtimeController.endOvertime)
router.get('/user/overtime/active', authenticate, overtimeController.getActiveOvertime)
router.get('/user/overtimes', authenticate, overtimeController.getMyOvertimes)

module.exports = router


