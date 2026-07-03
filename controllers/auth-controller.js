const prisma = require('../configs/prisma')
const createError = require('../utils/createError')
const jwt = require('jsonwebtoken')
const admin = require('../configs/firebase')

const isActiveBranch = (branch) => {
  return branch && branch.isActive === true && branch.isDeleted === false
}

const isActivePosition = (position) => {
  return position && position.isActive === true && position.isDeleted === false
}

const isPositionMatchBranch = (employee) => {
  if (!employee?.positionId || !employee?.position) return false
  if (!employee?.branchId) return false
  if (!isActivePosition(employee.position)) return false

  return Number(employee.position.branchId) === Number(employee.branchId)
}

const sanitizeEmployee = (employee) => {
  const validBranch = employee.branchId ? isActiveBranch(employee.branch) : true
  const validPosition = isPositionMatchBranch(employee)

  return {
    ...employee,
    branch: validBranch ? employee.branch || null : null,
    branchId: validBranch ? employee.branchId : null,
    position: validPosition ? employee.position || null : null,
    positionId: validPosition ? employee.positionId : null,
  }
}

const buildUserPayload = (employee) => {
  const safeEmployee = sanitizeEmployee(employee)

  return {
    id: safeEmployee.id,
    email: safeEmployee.email,
    firstname: safeEmployee.firstname,
    lastname: safeEmployee.lastname,
    profile: safeEmployee.profileImage,
    phone: safeEmployee.phone,
    emergencyContact: safeEmployee.emergencyContact,
    role: safeEmployee.role,
    branchId: safeEmployee.branchId,
    positionId: safeEmployee.positionId,
    branch: safeEmployee.branch,
    position: safeEmployee.position,
  }
}

exports.googleLogin = async (req, res, next) => {
  try {
    const { idToken } = req.body

    if (!idToken) {
      throw createError(400, 'Google token is required')
    }

    const decoded = await admin.auth().verifyIdToken(idToken)
    const email = decoded.email

    if (!email) {
      throw createError(400, 'Google account email not found')
    }

    const employee = await prisma.employees.findFirst({
      where: {
        email,
        isDeleted: false,
      },
      include: {
        branch: true,
        position: {
          include: {
            branch: true,
          },
        },
      },
    })

    if (!employee) {
      return res.status(403).json({
        message: 'This email is not allowed. Please contact admin.',
      })
    }

    if (!employee.isActive) {
      return res.status(403).json({
        message: 'บัญชีนี้ถูกปิดใช้งานแล้ว',
      })
    }

    if (employee.branchId && !isActiveBranch(employee.branch)) {
      return res.status(403).json({
        message: 'สาขาของบัญชีนี้ถูกปิดใช้งานแล้ว',
      })
    }

    const payload = buildUserPayload(employee)

    const token = jwt.sign(payload, process.env.SECRET, {
      expiresIn: '15d',
    })

    res.json({
      message: 'Google Login Success',
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

    const employee = await prisma.employees.findFirst({
      where: {
        id: Number(id),
        isDeleted: false,
      },
      include: {
        branch: true,
        position: {
          include: {
            branch: true,
          },
        },
      },
    })

    if (!employee) {
      return res.status(404).json({
        message: 'User not found',
      })
    }

    if (!employee.isActive) {
      return res.status(403).json({
        message: 'บัญชีนี้ถูกปิดใช้งานแล้ว',
      })
    }

    if (employee.branchId && !isActiveBranch(employee.branch)) {
      return res.status(403).json({
        message: 'สาขาของบัญชีนี้ถูกปิดใช้งานแล้ว',
      })
    }

    const safeEmployee = sanitizeEmployee(employee)

    res.json({
      result: safeEmployee,
    })
  } catch (error) {
    next(error)
  }
}