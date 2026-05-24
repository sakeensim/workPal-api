const prisma = require('../configs/prisma')
const createError = require('../utils/createError')
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const admin = require('../configs/firebase')

exports.googleLogin = async (req, res, next) => {
  try {
    const { idToken } = req.body

    if (!idToken) {
      throw createError(400, "Google token is required")
    }

    const decoded = await admin.auth().verifyIdToken(idToken)

    const email = decoded.email
    const name = decoded.name || ""
    const picture = decoded.picture || ""

    let employees = await prisma.employees.findFirst({
      where: { email }
    })

    if (!employees) {
        return res.status(403).json({
            message: "This email is not allowed. Please contact admin."
         })
    }
    const payload = {
      id: employees.id,
      email: employees.email,
      firstname: employees.firstname,
      lastname: employees.lastname,
      profile: employees.profileImage,
      phone: employees.phone,
      emergencyContact: employees.emergencyContact,
      role: employees.role,
    }

    const token = jwt.sign(payload, process.env.SECRET, {
      expiresIn: "15d",
    })

    res.json({
      message: "Google Login Success",
      payload,
      token,
    })

  } catch (error) {
    next(error)
  }
}

exports.getMe = async (req, res, next) => {
  try {
    const { id } = req.user

    const employees = await prisma.employees.findUnique({
      where: { id },
    })

    res.json({ result: employees })

  } catch (error) {
    next(error)
  }
}