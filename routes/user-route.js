const express = require('express')
const router = express.Router()
const userController = require('../controllers/user-controller')

const {authenticate} = require('../middleware/authenticate')
const {upload} = require('../middleware/upload')


//user-route
router.patch('/user/upload-img/:id',authenticate,upload,userController.uploadImg)
router.patch('/user/update-phone/:id',authenticate,userController.updatePhone)  
router.patch('/user/update-EM/:id',authenticate,userController.updateEmergency)



module.exports = router