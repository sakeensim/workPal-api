const express = require('express')
const router = express.Router()
const userController = require('../controllers/user-controller')

const {authenticate} = require('../middleware/authenticate')


// Admin only
router.get('/users',authenticate,userController.listUsers)
router.patch('/user/update-role',authenticate,userController.updateRole)
router.delete('/user/:id',authenticate,userController.deleteUser)    



module.exports = router