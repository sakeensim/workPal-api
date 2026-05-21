/*const express = require('express')
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

//Get all timetracking
router.get('/admin/Work-time-record',authenticate,adminAuth,adminController.getTimetracking)
router.get('/admin/getemployee', authenticate, adminAuth, userController.listUsers);


// Salary advance approval routes
router.patch('/admin/salary-approve/:id', authenticate, adminController.approveSalaryRequest);
router.patch('/admin/salary-reject/:id', authenticate, adminController.rejectSalaryRequest);

// Day off approval routes
router.patch('/admin/dayoff-approve/:id', authenticate, adminController.approveDayOffRequest);
router.patch('/admin/dayoff-reject/:id', authenticate, adminController.rejectDayOffRequest);


router.patch('/admin/update-salary',authenticate,salaryController.updateSalary)

router.get('/admin/dashboard', authenticate, adminAuth, adminController.getEmployeesDashboard);

// router.post('/admin/salary/:employeeId/:year/:month', authenticate,adminController.updateSalaryRecord);

const prisma = require('../configs/prisma')

router.patch('/admin/network-setting', authenticate, adminAuth, async (req, res) => {
  try {

    const { publicIp } = req.body

    const setting = await prisma.networkSetting.upsert({
      where: { id: 1 },
      update: {
        publicIp
      },
      create: {
        id: 1,
        name: 'Main Office',
        publicIp
      }
    })

    res.json(setting)

  } catch (error) {
    console.log(error)

    res.status(500).json({
      message: 'Server error'
    })
  }
})
module.exports = router*/
const express = require('express')
const router = express.Router()

const userController = require('../controllers/user-controller')
const adminController = require('../controllers/admin-controller')
const adminAuth = require('../middleware/adminAuth')
const salaryController = require('../controllers/salary-controller')
const { authenticate } = require('../middleware/authenticate')
const prisma = require('../configs/prisma')
const getClientIP = require('../utils/getClientIP')

// Admin only
router.get('/user/list', authenticate, adminAuth, userController.listUsers)
router.post('/user/update-role', authenticate, adminAuth, userController.updateRole)
router.delete('/user/delete/:id', authenticate, adminAuth, userController.deleteUser)
router.patch('/user/update-salary/:id', authenticate, adminAuth, userController.updateBaseSalary)

// Get all pending requests
router.get('/admin/pending-requests', authenticate, adminController.getPendingRequests)

// Get all timetracking
router.get('/admin/Work-time-record', authenticate, adminAuth, adminController.getTimetracking)
router.get('/admin/getemployee', authenticate, adminAuth, userController.listUsers)

// Salary advance approval routes
router.patch('/admin/salary-approve/:id', authenticate, adminController.approveSalaryRequest)
router.patch('/admin/salary-reject/:id', authenticate, adminController.rejectSalaryRequest)

// Day off approval routes
router.patch('/admin/dayoff-approve/:id', authenticate, adminController.approveDayOffRequest)
router.patch('/admin/dayoff-reject/:id', authenticate, adminController.rejectDayOffRequest)

router.patch('/admin/update-salary', authenticate, salaryController.updateSalary)

router.get('/admin/dashboard', authenticate, adminAuth, adminController.getEmployeesDashboard)

// Register current IP automatically
router.post('/admin/register-current-ip', authenticate, adminAuth, async (req, res) => {
  try {

    const clientIP = getClientIP(req)

    const saved = await prisma.allowedIP.upsert({
      where: {
        id: 1
      },
      update: {
        ipAddress: clientIP
      },
      create: {
        id: 1,
        ipAddress: clientIP,
        note: 'Main Office'
      }
    })

    res.json({
      message: 'Current IP registered successfully',
      clientIP,
      saved,
    })

  } catch (error) {

    console.log(error)

    res.status(500).json({
      message: 'Server error',
    })

  }
})

module.exports = router