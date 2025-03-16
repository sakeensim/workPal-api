const express = require('express')
const router = express.Router()
const userController = require('../controllers/user-controller')
const timeController = require('../controllers/time-controller')

const {authenticate} = require('../middleware/authenticate')
const { salaryAdvance } = require('../controllers/salary-controller')



//Profile
router.patch('/user/upload-img',authenticate,userController.uploadImg)
router.patch('/user/update-profile/:id',authenticate,userController.updateProfile)  
router.get('/user/myProfile',authenticate,userController.myProfile)

//user's approved requests
router.get('/user/approved-requests',authenticate,userController.getUserApprovedRequests)

//Check-In 
router.post('/user/check-in',authenticate,timeController.checkIn)

//check-out
router.patch('/user/check-out',authenticate,timeController.checkOut)

//Day-Off
router.post('/user/day-off',authenticate,timeController.dayOff)

//Advance Salart
router.post('/user/advance-salary',authenticate,salaryAdvance)


//delete dayoff
router.delete('/user/cancel-dayoff/:id', authenticate,timeController.deleteDayOff)
module.exports = router


