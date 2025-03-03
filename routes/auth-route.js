const express =require('express')
const router = express.Router()
const authController = require('../controllers/auth-controller')
const {validateWithZod, registerSchema, loginSchema} =require('../middleware/validators')

//middleware
const {authenticate} = require('../middleware/authenticate')



router.post("/register",validateWithZod(registerSchema), authController.register)
router.post("/login", validateWithZod(loginSchema),authController.login)
router.get("/getme", authenticate,authController.getMe)


module.exports = router