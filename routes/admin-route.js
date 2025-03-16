const express = require('express')
const router = express.Router()
const userController = require('../controllers/user-controller')
const adminController = require('../controllers/admin-controller');
const adminAuth = require('../middleware/adminAuth')
const salaryController = require('../controllers/salary-controller')
const {authenticate} = require('../middleware/authenticate')


// Admin only

router.get('/user/list', authenticate, adminAuth, userController.listUsers);
router.post('/user/update-role', authenticate, adminAuth, userController.updateRole);
router.delete('/user/delete/:id', authenticate, adminAuth, userController.deleteUser);
router.patch('/user/update-salary/:id', authenticate, adminAuth, userController.updateBaseSalary);

// Get all pending requests
router.get('/admin/pending-requests', authenticate, adminController.getPendingRequests);

// Salary advance approval routes
router.patch('/admin/salary-approve/:id', authenticate, adminController.approveSalaryRequest);
router.patch('/admin/salary-reject/:id', authenticate, adminController.rejectSalaryRequest);

// Day off approval routes
router.patch('/admin/dayoff-approve/:id', authenticate, adminController.approveDayOffRequest);
router.patch('/admin/dayoff-reject/:id', authenticate, adminController.rejectDayOffRequest);

router.patch('/admin/update-salary',authenticate,salaryController.updateSalary)


module.exports = router