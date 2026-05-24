/*const express =require('express')
const router = express.Router()
const authController = require('../controllers/auth-controller')
const {validateWithZod, registerSchema, loginSchema} =require('../middleware/validators')

//middleware
const {authenticate} = require('../middleware/authenticate')



router.post("/register",validateWithZod(registerSchema), authController.register)
router.post("/login", validateWithZod(loginSchema),authController.login)
router.get("/getme", authenticate,authController.getMe)


module.exports = router*/
const express = require('express')
const router = express.Router()

const authController = require('../controllers/auth-controller')
const { authenticate } = require('../middleware/authenticate')

// Google Login only
router.post(
  "/google-login",
  authController.googleLogin
)

// Get current user
router.get(
  "/getme",
  authenticate,
  authController.getMe
)

module.exports = router