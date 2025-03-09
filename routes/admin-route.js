const express = require('express')
const router = express.Router()
const userController = require('../controllers/user-controller')
const adminController = require('../controllers/admin-controller');

const {authenticate} = require('../middleware/authenticate')


// Admin only
router.get('/users',authenticate,userController.listUsers)
router.patch('/user/update-role',authenticate,userController.updateRole)
router.delete('/user/:id',authenticate,userController.deleteUser)    


// Get all pending requests
router.get('/admin/pending-requests', authenticate, adminController.getPendingRequests);

// Salary advance approval routes
router.patch('/admin/salary-approve/:id', authenticate, adminController.approveSalaryRequest);
router.patch('/admin/salary-reject/:id', authenticate, adminController.rejectSalaryRequest);

// Day off approval routes
router.patch('/admin/dayoff-approve/:id', authenticate, adminController.approveDayOffRequest);
router.patch('/admin/dayoff-reject/:id', authenticate, adminController.rejectDayOffRequest);

module.exports = router