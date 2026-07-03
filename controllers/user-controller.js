const cloudinary = require("../configs/cloudinary")
const prisma = require("../configs/prisma")

const BANGKOK_TIMEZONE = 'Asia/Bangkok'

const getBangkokDateString = (date = new Date()) => {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: BANGKOK_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

const getBangkokDayStart = (date = new Date()) => {
  const bangkokDate = getBangkokDateString(date)

  return new Date(`${bangkokDate}T00:00:00.000+07:00`)
}

const getBangkokMonthRange = (year, month) => {
  const start = new Date(
    `${year}-${String(month).padStart(2, '0')}-01T00:00:00.000+07:00`
  )

  const lastDay = new Date(year, month, 0).getDate()

  const end = new Date(
    `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(
      2,
      '0'
    )}T23:59:59.999+07:00`
  )

  return { start, end }
}

const addMinutes = (date, minutes) => {
  const result = new Date(date)
  result.setMinutes(result.getMinutes() + Number(minutes || 0))
  return result
}

const buildBangkokDateTime = (dateString, timeString) => {
  const [hour, minute] = String(timeString).split(':').map(Number)

  return new Date(
    `${dateString}T${String(hour).padStart(2, '0')}:${String(minute).padStart(
      2,
      '0'
    )}:00.000+07:00`
  )
}

const isAdminOrOwner = (user) => {
  return user?.role === 'ADMIN' || user?.role === 'OWNER'
}

const getId = (id) => {
  const parsed = Number(id)

  if (!parsed || Number.isNaN(parsed)) return null

  return parsed
}

const getActiveEmployeeWhere = () => ({
  isActive: true,
  isDeleted: false,
})

const getActiveBranchWhere = () => ({
  isActive: true,
  isDeleted: false,
})

const getActiveStoreHolidayWhere = () => ({
  isDeleted: false,
})
const getActivePositionWhere = () => ({
  isActive: true,
  isDeleted: false,
})

const isActiveBranch = (branch) => {
  return branch && branch.isActive === true && branch.isDeleted === false
}

const isActivePosition = (position) => {
  return position && position.isActive === true && position.isDeleted === false
}

const isEmployeePositionMatchBranch = (employee) => {
  if (!employee?.positionId) return true
  if (!employee?.position) return false
  if (!employee?.branchId) return false
  if (!isActivePosition(employee.position)) return false

  return Number(employee.position.branchId) === Number(employee.branchId)
}

const sanitizeEmployee = (employee) => {
  if (!employee) return null

  const validBranch = employee.branchId ? isActiveBranch(employee.branch) : true
  const validPosition = isEmployeePositionMatchBranch(employee)

  return {
    ...employee,
    branchId: validBranch ? employee.branchId : null,
    branch: validBranch ? employee.branch || null : null,
    positionId: validPosition ? employee.positionId : null,
    position: validPosition ? employee.position || null : null,
  }
}

const createAudit = async (tx, req, data) => {
  return tx.auditLog.create({
    data: {
      actorId: req.user.id,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      ...data,
    },
  })
}

const getEmployeeFullName = (employee) => {
  return [employee?.firstname, employee?.lastname].filter(Boolean).join(' ')
}

const getShiftEndDateTime = (record) => {
  const checkInTime =
    record?.scheduledCheckInTime || record?.shift?.checkInTime || null

  const checkOutTime =
    record?.scheduledCheckOutTime || record?.shift?.checkOutTime || null

  if (!checkInTime || !checkOutTime) return null

  const dateKey = getBangkokDateString(record.date || record.checkIn)
  const shiftStart = buildBangkokDateTime(dateKey, checkInTime)
  const shiftEnd = buildBangkokDateTime(dateKey, checkOutTime)

  const [inHour, inMinute] = String(checkInTime).split(':').map(Number)
  const [outHour, outMinute] = String(checkOutTime).split(':').map(Number)

  const inTotal = inHour * 60 + inMinute
  const outTotal = outHour * 60 + outMinute

  if (outTotal <= inTotal) {
    shiftEnd.setDate(shiftEnd.getDate() + 1)
  }

  return { shiftStart, shiftEnd }
}

const isShiftExpired = (record, now = new Date()) => {
  const shiftTime = getShiftEndDateTime(record)

  if (!shiftTime?.shiftEnd) return true

  const graceMinutes = Number(
    record.checkOutGraceAfterMinutesSnapshot ??
      record.shift?.checkOutGraceAfterMinutes ??
      180
  )

  const expiredAt = addMinutes(shiftTime.shiftEnd, graceMinutes)

  return now > expiredAt
}

const expireOldRecords = async (userId) => {
  const now = new Date()

  const activeTimeTrackings = await prisma.timeTracking.findMany({
    where: {
      employeesId: Number(userId),
      status: 'ACTIVE',
      checkIn: {
        not: null,
      },
      checkOut: null,
      employees: {
        is: {
          ...getActiveEmployeeWhere(),
          branch: {
            is: getActiveBranchWhere(),
          },
        },
      },
    },
    include: {
      shift: true,
    },
  })

  for (const record of activeTimeTrackings) {
    if (isShiftExpired(record, now)) {
      await prisma.timeTracking.update({
        where: {
          id: record.id,
        },
        data: {
          status: 'EXPIRED',
        },
      })
    }
  }

  const activeOvertimes = await prisma.overtimeTracking.findMany({
    where: {
      employeesId: Number(userId),
      status: 'ACTIVE',
      checkOut: null,
      employees: {
        is: {
          ...getActiveEmployeeWhere(),
          branch: {
            is: getActiveBranchWhere(),
          },
        },
      },
      branch: {
        is: getActiveBranchWhere(),
      },
    },
    include: {
      employees: {
        include: {
          branch: true,
          position: {
            include: {
              branch: true,
            },
          },
        },
      },
    },
  })

  for (const ot of activeOvertimes) {
    const employee = ot.employees

    if (!isEmployeePositionMatchBranch(employee)) continue

    const cap = Number(employee?.position?.otCapMinutes || 0)

    if (cap > 0) {
      const expiredAt = addMinutes(ot.checkIn, cap + 180)

      if (now > expiredAt) {
        await prisma.overtimeTracking.update({
          where: {
            id: ot.id,
          },
          data: {
            status: 'EXPIRED',
            otMinutes: 0,
            noteOut:
              'System expired because OT was not checked out within cap + 3 hours',
          },
        })
      }
    }
  }
}

exports.listUsers = async (req, res, next) => {
  try {
    if (!isAdminOrOwner(req.user)) {
      return res.status(403).json({
        message: 'Not authorized',
      })
    }

    const { branchId, activeOnly } = req.query

    const where = {
      isDeleted: false,
    }

    if (activeOnly === 'true') {
      where.isActive = true
    }

    if (branchId && branchId !== 'all') {
      const finalBranchId = getId(branchId)

      if (!finalBranchId) {
        return res.status(400).json({
          message: 'Invalid branch id',
        })
      }

      where.branchId = finalBranchId
    }

    const users = await prisma.employees.findMany({
      where,
      include: {
        branch: true,
        position: {
          include: {
            branch: true,
          },
        },
      },
      orderBy: {
        firstname: 'asc',
      },
    })

    res.json({
      result: users.map(sanitizeEmployee),
    })
  } catch (error) {
    next(error)
  }
}

exports.updateRole = async (req, res, next) => {
  try {
    if (!isAdminOrOwner(req.user)) {
      return res.status(403).json({
        message: 'Not authorized',
      })
    }

    const { id, role } = req.body
    const employeeId = getId(id)

    if (!employeeId) {
      return res.status(400).json({
        message: 'Invalid employee id',
      })
    }

    if (!['USER', 'ADMIN', 'OWNER'].includes(role)) {
      return res.status(400).json({
        message: 'Invalid role',
      })
    }

    const oldEmployee = await prisma.employees.findFirst({
      where: {
        id: employeeId,
        isDeleted: false,
      },
    })

    if (!oldEmployee) {
      return res.status(404).json({
        message: 'Employee not found',
      })
    }

    const updatedEmployee = await prisma.$transaction(async (tx) => {
      const updated = await tx.employees.update({
        where: {
          id: employeeId,
        },
        data: {
          role,
        },
      })

      await createAudit(tx, req, {
        action: 'UPDATE_USER',
        entity: 'Employees',
        entityId: employeeId,
        targetEmployeeId: employeeId,
        branchId: oldEmployee.branchId,
        oldValue: {
          role: oldEmployee.role,
        },
        newValue: {
          role: updated.role,
        },
        note: `Update role for ${getEmployeeFullName(oldEmployee)} from ${oldEmployee.role} to ${role}`,
      })

      return updated
    })

    res.json({
      message: 'Update Success',
      data: updatedEmployee,
    })
  } catch (error) {
    next(error)
  }
}

exports.deleteUser = async (req, res, next) => {
  try {
    if (!isAdminOrOwner(req.user)) {
      return res.status(403).json({
        message: 'Not authorized',
      })
    }

    const employeeId = getId(req.params.id)
    const { reason } = req.body || {}

    if (!employeeId) {
      return res.status(400).json({
        message: 'Invalid employee id',
      })
    }

    if (Number(req.user.id) === employeeId) {
      return res.status(400).json({
        message: 'Cannot delete your own account',
      })
    }

    const employee = await prisma.employees.findFirst({
      where: {
        id: employeeId,
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
        message: 'Employee not found',
      })
    }

    const now = new Date()
    const deleteReason = reason || 'Deleted by admin'

    const result = await prisma.$transaction(async (tx) => {
      await tx.employeeShift.deleteMany({
        where: {
          employeesId: employeeId,
          date: {
            gte: getBangkokDayStart(now),
          },
        },
      })

      const deletedEmployee = await tx.employees.update({
        where: {
          id: employeeId,
        },
        data: {
          isActive: false,
          isDeleted: true,
          deletedAt: now,
          deletedById: req.user.id,
          deletedReason: deleteReason,
        },
      })

      await createAudit(tx, req, {
        action: 'DELETE_USER',
        entity: 'Employees',
        entityId: employee.id,
        targetEmployeeId: employee.id,
        branchId: employee.branchId,
        oldValue: {
          id: employee.id,
          email: employee.email,
          firstname: employee.firstname,
          lastname: employee.lastname,
          phone: employee.phone,
          emergencyContact: employee.emergencyContact,
          role: employee.role,
          baseSalary: employee.baseSalary,
          branchId: employee.branchId,
          branchName: employee.branch?.name || null,
          positionId: employee.positionId,
          positionName: employee.position?.name || null,
          isActive: employee.isActive,
          isDeleted: employee.isDeleted,
        },
        newValue: {
          isActive: false,
          isDeleted: true,
          deletedAt: now,
          deletedById: req.user.id,
          reason: deleteReason,
        },
        note: `Soft delete user ${getEmployeeFullName(employee)}`,
      })

      return deletedEmployee
    })

    res.json({
      message: 'Delete Success',
      data: result,
    })
  } catch (error) {
    next(error)
  }
}

exports.uploadImg = async (req, res, next) => {
  try {
    const { id } = req.user

    const employee = await prisma.employees.findFirst({
      where: {
        id: Number(id),
        ...getActiveEmployeeWhere(),
      },
    })

    if (!employee) {
      return res.status(404).json({
        message: 'Employee not found',
      })
    }

    const result = await cloudinary.uploader.upload(req.body.image, {
      folder: 'profile',
      public_id: Date.now().toString(),
    })

    const updatedUser = await prisma.employees.update({
      where: { id: Number(id) },
      data: {
        profileImage: result.secure_url,
        publicId: result.public_id,
      },
    })

    res.json({
      message: 'Upload image success',
      result,
      user: updatedUser,
    })
  } catch (error) {
    next(error)
  }
}

exports.updateProfile = async (req, res, next) => {
  try {
    const targetId = getId(req.params.id)

    if (!targetId) {
      return res.status(400).json({
        message: 'Invalid employee id',
      })
    }

    if (!isAdminOrOwner(req.user) && Number(req.user.id) !== targetId) {
      return res.status(403).json({
        message: 'Not authorized',
      })
    }

    const { firstname, lastname, phone, emergencyContact, image } = req.body

    const employee = await prisma.employees.findFirst({
      where: {
        id: targetId,
        ...getActiveEmployeeWhere(),
      },
    })

    if (!employee) {
      return res.status(404).json({
        message: 'Employee not found',
      })
    }

    const data = {
      firstname,
      lastname,
      phone,
      emergencyContact,
    }

    if (image?.secure_url) {
      data.profileImage = image.secure_url
      data.publicId = image.public_id
    }

    const updatedEmployee = await prisma.employees.update({
      where: { id: targetId },
      data,
      include: {
        branch: true,
        position: {
          include: {
            branch: true,
          },
        },
      },
    })

    res.json({
      message: 'Update Profile Success',
      result: sanitizeEmployee(updatedEmployee),
    })
  } catch (error) {
    next(error)
  }
}
exports.myProfile = async (req, res, next) => {
  try {
    const { id } = req.user

    const profile = await prisma.employees.findFirst({
      where: {
        id: Number(id),
        ...getActiveEmployeeWhere(),
      },
      include: {
        branch: true,
        position: {
          include: {
            branch: true,
          },
        },
        advanceSalary: {
          orderBy: {
            requestDate: 'desc',
          },
        },
      },
    })

    if (!profile) {
      return res.status(404).json({
        message: 'Employee not found',
      })
    }

    res.json({
      result: sanitizeEmployee(profile),
    })
  } catch (error) {
    next(error)
  }
}

exports.getUserApprovedRequests = async (req, res, next) => {
  try {
    const userId = req.user.id

    const employee = await prisma.employees.findFirst({
      where: {
        id: Number(userId),
        ...getActiveEmployeeWhere(),
      },
    })

    if (!employee) {
      return res.status(404).json({
        message: 'Employee not found',
      })
    }

    const approvedSalaryRequests = await prisma.advanceSalary.findMany({
      where: {
        employeesId: Number(userId),
        status: 'APPROVED',
        employees: {
          is: getActiveEmployeeWhere(),
        },
      },
      orderBy: {
        requestDate: 'desc',
      },
    })

    const totalApprovedSalary = approvedSalaryRequests.reduce(
      (sum, item) => sum + Number(item.amount || 0),
      0
    )

    const approvedDayOffRequests = await prisma.dayOff.findMany({
      where: {
        employeesId: Number(userId),
        status: 'APPROVED',
        employees: {
          is: getActiveEmployeeWhere(),
        },
      },
      orderBy: {
        date: 'desc',
      },
    })

    const formattedSalaryRequests = approvedSalaryRequests.map((item) => ({
      id: item.id,
      type: 'salary',
      amount: item.amount,
      requestDate: item.requestDate,
      status: item.status,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    }))

    const formattedDayOffRequests = approvedDayOffRequests.map((item) => ({
      id: item.id,
      type: 'dayoff',
      reason: item.reason,
      date: item.date,
      status: item.status,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    }))

    const allApprovedRequests = [
      ...formattedSalaryRequests,
      ...formattedDayOffRequests,
    ]

    allApprovedRequests.sort(
      (a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)
    )

    res.json({
      data: allApprovedRequests,
      totalSalaryAdvance: totalApprovedSalary,
    })
  } catch (error) {
    next(error)
  }
}

exports.updateBaseSalary = async (req, res, next) => {
  try {
    if (!isAdminOrOwner(req.user)) {
      return res.status(403).json({
        message: 'Not authorized',
      })
    }

    const employeeId = getId(req.params.id)
    const { baseSalary } = req.body

    if (!employeeId) {
      return res.status(400).json({
        message: 'Invalid employee id',
      })
    }

    const newBaseSalary = Number(baseSalary || 0)

    if (Number.isNaN(newBaseSalary) || newBaseSalary < 0) {
      return res.status(400).json({
        message: 'Invalid salary amount',
      })
    }

    const oldEmployee = await prisma.employees.findFirst({
      where: {
        id: employeeId,
        ...getActiveEmployeeWhere(),
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

    if (!oldEmployee) {
      return res.status(404).json({
        message: 'Employee not found',
      })
    }

    const updatedEmployee = await prisma.$transaction(async (tx) => {
      const updated = await tx.employees.update({
        where: {
          id: employeeId,
        },
        data: {
          baseSalary: newBaseSalary,
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

      await createAudit(tx, req, {
        action: 'CHANGE_SALARY',
        entity: 'Employees',
        entityId: employeeId,
        targetEmployeeId: employeeId,
        branchId: oldEmployee.branchId,
        oldValue: {
          baseSalary: oldEmployee.baseSalary,
          branchId: oldEmployee.branchId,
          positionId: oldEmployee.positionId,
        },
        newValue: {
          baseSalary: updated.baseSalary,
          branchId: updated.branchId,
          positionId: updated.positionId,
        },
        note: `Change salary for ${getEmployeeFullName(oldEmployee)} from ${
          oldEmployee.baseSalary || 0
        } to ${newBaseSalary}`,
      })

      return updated
    })

    res.json({
      message: 'Salary updated successfully',
      result: sanitizeEmployee(updatedEmployee),
    })
  } catch (error) {
    next(error)
  }
}

exports.updateUserBranch = async (req, res, next) => {
  try {
    if (!isAdminOrOwner(req.user)) {
      return res.status(403).json({
        message: 'Not authorized',
      })
    }

    const employeeId = getId(req.params.id)
    const { branchId } = req.body

    if (!employeeId) {
      return res.status(400).json({
        message: 'Invalid employee id',
      })
    }

    const newBranchId = branchId ? getId(branchId) : null

    if (branchId && !newBranchId) {
      return res.status(400).json({
        message: 'Invalid branch id',
      })
    }

    const oldEmployee = await prisma.employees.findFirst({
      where: {
        id: employeeId,
        ...getActiveEmployeeWhere(),
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

    if (!oldEmployee) {
      return res.status(404).json({
        message: 'Employee not found',
      })
    }

    let newBranch = null

    if (newBranchId) {
      newBranch = await prisma.branch.findFirst({
        where: {
          id: newBranchId,
          ...getActiveBranchWhere(),
        },
      })

      if (!newBranch) {
        return res.status(404).json({
          message: 'Branch not found or inactive',
        })
      }
    }

    const now = new Date()

    const updatedEmployee = await prisma.$transaction(async (tx) => {
      await tx.employeeShift.deleteMany({
        where: {
          employeesId: employeeId,
          date: {
            gte: getBangkokDayStart(now),
          },
        },
      })

      const updated = await tx.employees.update({
        where: {
          id: employeeId,
        },
        data: {
          branchId: newBranchId,
          positionId: null,
          remainingDayOffs: 0,
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

      await createAudit(tx, req, {
        action: 'CHANGE_BRANCH',
        entity: 'Employees',
        entityId: employeeId,
        targetEmployeeId: employeeId,
        branchId: newBranchId || oldEmployee.branchId,
        oldValue: {
          branchId: oldEmployee.branchId,
          branchName: oldEmployee.branch?.name || null,
          positionId: oldEmployee.positionId,
          positionName: oldEmployee.position?.name || null,
        },
        newValue: {
          branchId: newBranchId,
          branchName: newBranch?.name || null,
          positionId: null,
          remainingDayOffs: 0,
          futureAssignedShiftsDeleted: true,
        },
        note: `Change branch for ${getEmployeeFullName(oldEmployee)}`,
      })

      return updated
    })

    res.json({
      message: 'Update branch success',
      result: sanitizeEmployee(updatedEmployee),
    })
  } catch (error) {
    next(error)
  }
}

exports.createUser = async (req, res, next) => {
  try {
    if (!isAdminOrOwner(req.user)) {
      return res.status(403).json({
        message: 'Not authorized',
      })
    }

    const {
      email,
      firstname,
      lastname,
      phone,
      emergencyContact,
      role,
      baseSalary,
      branchId,
      positionId,
    } = req.body

    if (!email || !firstname || !lastname) {
      return res.status(400).json({
        message: 'Email, firstname and lastname are required',
      })
    }

    if (role && !['USER', 'ADMIN', 'OWNER'].includes(role)) {
      return res.status(400).json({
        message: 'Invalid role',
      })
    }

    const existingUser = await prisma.employees.findUnique({
      where: {
        email,
      },
    })

    if (existingUser) {
      return res.status(400).json({
        message: existingUser.isDeleted
          ? 'Email belongs to a deleted user. Please restore or use another email.'
          : 'Email already exists',
      })
    }

    const finalBranchId = branchId ? getId(branchId) : null
    const finalPositionId = positionId ? getId(positionId) : null

    if (branchId && !finalBranchId) {
      return res.status(400).json({
        message: 'Invalid branch id',
      })
    }

    if (positionId && !finalPositionId) {
      return res.status(400).json({
        message: 'Invalid position id',
      })
    }

    let branch = null

    if (finalBranchId) {
      branch = await prisma.branch.findFirst({
        where: {
          id: finalBranchId,
          ...getActiveBranchWhere(),
        },
      })

      if (!branch) {
        return res.status(404).json({
          message: 'Branch not found or inactive',
        })
      }
    }

    let position = null

    if (finalPositionId) {
      position = await prisma.position.findFirst({
        where: {
          id: finalPositionId,
          ...getActivePositionWhere(),
          branch: {
            is: getActiveBranchWhere(),
          },
        },
        include: {
          branch: true,
        },
      })

      if (!position) {
        return res.status(404).json({
          message: 'Position not found or inactive',
        })
      }

      if (!finalBranchId) {
        return res.status(400).json({
          message: 'Branch is required when position is selected',
        })
      }

      if (Number(position.branchId) !== Number(finalBranchId)) {
        return res.status(400).json({
          message: 'Position does not belong to selected branch',
        })
      }
    }

    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.employees.create({
        data: {
          email,
          firstname,
          lastname,
          phone: phone || null,
          emergencyContact: emergencyContact || null,
          role: role || 'USER',
          baseSalary: baseSalary ? Number(baseSalary) : 0,
          branchId: finalBranchId,
          positionId: finalPositionId,
          remainingDayOffs: position
            ? Number(position.maxDayOffPerMonth || 0)
            : 0,
          isActive: true,
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

      await createAudit(tx, req, {
        action: 'ADD_USER',
        entity: 'Employees',
        entityId: user.id,
        targetEmployeeId: user.id,
        branchId: user.branchId,
        newValue: {
          id: user.id,
          email: user.email,
          firstname: user.firstname,
          lastname: user.lastname,
          role: user.role,
          baseSalary: user.baseSalary,
          branchId: user.branchId,
          branchName: branch?.name || null,
          positionId: user.positionId,
          positionName: position?.name || null,
          remainingDayOffs: user.remainingDayOffs,
        },
        note: `Create user ${getEmployeeFullName(user)}`,
      })

      return user
    })

    res.json({
      message: 'Create user success',
      result: sanitizeEmployee(result),
    })
  } catch (error) {
    next(error)
  }
}
exports.updateUserPosition = async (req, res, next) => {
  try {
    if (!isAdminOrOwner(req.user)) {
      return res.status(403).json({
        message: 'Not authorized',
      })
    }

    const employeeId = getId(req.params.id)
    const { positionId } = req.body

    if (!employeeId) {
      return res.status(400).json({
        message: 'Invalid employee id',
      })
    }

    const newPositionId = positionId ? getId(positionId) : null

    if (positionId && !newPositionId) {
      return res.status(400).json({
        message: 'Invalid position id',
      })
    }

    const employee = await prisma.employees.findFirst({
      where: {
        id: employeeId,
        ...getActiveEmployeeWhere(),
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
        message: 'Employee not found',
      })
    }

    if (newPositionId && !isActiveBranch(employee.branch)) {
      return res.status(400).json({
        message: 'ต้องกำหนดสาขาที่ active ให้พนักงานก่อนเลือกตำแหน่ง',
      })
    }

    const position = newPositionId
      ? await prisma.position.findFirst({
          where: {
            id: newPositionId,
            ...getActivePositionWhere(),
            branch: {
              is: getActiveBranchWhere(),
            },
          },
          include: {
            branch: true,
          },
        })
      : null

    if (newPositionId && !position) {
      return res.status(404).json({
        message: 'Position not found or inactive',
      })
    }

    if (position && Number(position.branchId) !== Number(employee.branchId)) {
      return res.status(400).json({
        message: 'Position does not belong to employee branch',
      })
    }

    const now = new Date()

    const updatedEmployee = await prisma.$transaction(async (tx) => {
      await tx.employeeShift.deleteMany({
        where: {
          employeesId: employeeId,
          date: {
            gte: getBangkokDayStart(now),
          },
        },
      })

      const updated = await tx.employees.update({
        where: {
          id: employeeId,
        },
        data: {
          positionId: newPositionId,
          // ไม่แตะ remainingDayOffs
          // ให้เก็บค่าคงเหลือเดิมไว้
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

      await createAudit(tx, req, {
        action: 'CHANGE_POSITION',
        entity: 'Employees',
        entityId: employeeId,
        targetEmployeeId: employeeId,
        branchId: employee.branchId,
        oldValue: {
          positionId: employee.positionId,
          positionName: employee.position?.name || null,
          positionBranchId: employee.position?.branchId || null,
          maxDayOffPerMonth: employee.position?.maxDayOffPerMonth || null,
          remainingDayOffs: employee.remainingDayOffs,
        },
        newValue: {
          positionId: updated.positionId,
          positionName: updated.position?.name || null,
          positionBranchId: updated.position?.branchId || null,
          maxDayOffPerMonth: updated.position?.maxDayOffPerMonth || null,
          remainingDayOffs: updated.remainingDayOffs,
          futureAssignedShiftsDeleted: true,
        },
        note: `Change position for ${getEmployeeFullName(employee)}`,
      })

      return updated
    })

    res.json({
      message: 'Update user position success',
      data: sanitizeEmployee(updatedEmployee),
    })
  } catch (error) {
    next(error)
  }
}

exports.getUserHistory = async (req, res, next) => {
  try {
    const userId = Number(req.user.id)
    const { month, year } = req.query

    const now = new Date()
    const monthNum = parseInt(month, 10) || now.getMonth() + 1
    const yearNum = parseInt(year, 10) || now.getFullYear()

    const { start: startDate, end: endDate } = getBangkokMonthRange(
      yearNum,
      monthNum
    )

    const toBangkokDateKey = (date) => getBangkokDateString(date)

    const todayKey = toBangkokDateKey(now)
    const selectedMonthKey = `${yearNum}-${String(monthNum).padStart(2, '0')}`
    const currentMonthKey = todayKey.slice(0, 7)

    // ถ้าเปิดเดือนอนาคต ไม่ต้อง expire records

    const getLastDayToCheck = () => {
      if (selectedMonthKey > currentMonthKey) return 0

      if (selectedMonthKey === currentMonthKey) {
        return Number(todayKey.slice(8, 10))
      }

      return new Date(yearNum, monthNum, 0).getDate()
    }

    const lastDayToCheck = getLastDayToCheck()

    // 1) ดึง profile เบา ๆ ก่อน
    const [employee, snapshot] = await Promise.all([
      prisma.employees.findFirst({
        where: {
          id: userId,
          ...getActiveEmployeeWhere(),
        },
        select: {
          id: true,
          firstname: true,
          lastname: true,
          email: true,
          profileImage: true,
          baseSalary: true,
          remainingDayOffs: true,
          createdAt: true,
          branchId: true,
          positionId: true,

          branch: {
            select: {
              id: true,
              name: true,
              code: true,
              address: true,
              lat: true,
              lng: true,
              radius: true,
              isActive: true,
              isDeleted: true,
            },
          },

          position: {
            select: {
              id: true,
              name: true,
              description: true,
              checkInTime: true,
              checkOutTime: true,
              maxDayOffPerMonth: true,
              allowOT: true,
              otCapMinutes: true,
              branchId: true,
              isActive: true,
              isDeleted: true,
              branch: {
                select: {
                  id: true,
                  name: true,
                  code: true,
                  isActive: true,
                  isDeleted: true,
                },
              },
            },
          },
        },
      }),

      prisma.monthlyHistorySnapshot.findUnique({
        where: {
          employeesId_month: {
            employeesId: userId,
            month: startDate,
          },
        },
      }),
    ])

    if (!employee) {
      return res.status(404).json({
        message: 'Employee not found',
      })
    }

    const safeEmployee = sanitizeEmployee(employee)

    // 2) ดึง logs แยก table แบบ parallel และ select เท่าที่ใช้จริง
    const [
      timetracking,
      overtimeTrackingsRaw,
      dayOff,
      dayOffRequestsByCreatedAt,
      advanceSalary,
      holidays,
    ] = await Promise.all([
      prisma.timeTracking.findMany({
        where: {
          employeesId: userId,
          date: {
            gte: startDate,
            lte: endDate,
          },
        },
        select: {
          id: true,
          date: true,
          checkIn: true,
          checkOut: true,
          status: true,
          shiftId: true,

          shiftNameSnapshot: true,
          positionIdSnapshot: true,
          positionNameSnapshot: true,
          scheduledCheckInTime: true,
          scheduledCheckOutTime: true,
          branchIdSnapshot: true,
          branchNameSnapshot: true,

          lateMinutes: true,
          earlyLeaveMinutes: true,
          checkInNote: true,
          checkOutNote: true,

          shift: {
            select: {
              id: true,
              name: true,
              checkInTime: true,
              checkOutTime: true,
              isActive: true,
              isDeleted: true,
              position: {
                select: {
                  id: true,
                  branchId: true,
                  isActive: true,
                  isDeleted: true,
                },
              },
            },
          },
        },
        orderBy: {
          checkIn: 'desc',
        },
      }),

      prisma.overtimeTracking.findMany({
        where: {
          employeesId: userId,
          date: {
            gte: startDate,
            lte: endDate,
          },
        },
        select: {
          id: true,
          date: true,
          checkIn: true,
          checkOut: true,
          noteIn: true,
          noteOut: true,
          otMinutes: true,
          status: true,
          branchId: true,
          branch: {
            select: {
              id: true,
              name: true,
              code: true,
              address: true,
              lat: true,
              lng: true,
              radius: true,
              isActive: true,
              isDeleted: true,
            },
          },
        },
        orderBy: {
          checkIn: 'desc',
        },
      }),

      prisma.dayOff.findMany({
        where: {
          employeesId: userId,
          date: {
            gte: startDate,
            lte: endDate,
          },
        },
        orderBy: {
          date: 'desc',
        },
      }),

      prisma.dayOff.findMany({
        where: {
          employeesId: userId,
          createdAt: {
            gte: startDate,
            lte: endDate,
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
      }),

      prisma.advanceSalary.findMany({
        where: {
          employeesId: userId,
          requestDate: {
            gte: startDate,
            lte: endDate,
          },
        },
        orderBy: {
          requestDate: 'desc',
        },
      }),

      safeEmployee.branchId
        ? prisma.storeHoliday.findMany({
            where: {
              ...getActiveStoreHolidayWhere(),
              branchId: safeEmployee.branchId,
              date: {
                gte: startDate,
                lte: endDate,
              },
            },
            select: {
              id: true,
              date: true,
              title: true,
              branchId: true,
            },
          })
        : Promise.resolve([]),
    ])

    const attendanceLogs = []
    const checkInDateMap = new Map()
    const approvedDayOffMap = new Map()

    const counters = {
      workingDays: 0,
      absentDays: 0,
      approvedDayOffs: 0,
      lateDays: 0,
      earlyDays: 0,
      totalOtMinutes: 0,
      approvedAdvance: 0,
    }

    const employeeCreatedKey = toBangkokDateKey(employee.createdAt)

    for (const record of timetracking || []) {
      const key = toBangkokDateKey(record.date || record.checkIn)

      if (!checkInDateMap.has(key)) {
        checkInDateMap.set(key, record)
      }

      const validShift =
        record.shift &&
        record.shift.isActive &&
        !record.shift.isDeleted &&
        record.shift.position &&
        record.shift.position.isActive &&
        !record.shift.position.isDeleted &&
        Number(record.shift.position.branchId) === Number(employee.branchId)
          ? record.shift
          : null

      const lateMinutes = Number(record.lateMinutes || 0)
      const earlyLeaveMinutes = Number(record.earlyLeaveMinutes || 0)

      counters.workingDays += 1
      if (lateMinutes > 0) counters.lateDays += 1
      if (earlyLeaveMinutes > 0) counters.earlyDays += 1

      attendanceLogs.push({
        id: record.id,
        date: key,
        status: 'PRESENT',
        timeStatus: record.status || 'ACTIVE',
        checkIn: record.checkIn,
        checkOut: record.checkOut,
        shiftId: record.shiftId || null,
        shiftName: record.shiftNameSnapshot || validShift?.name || null,
        positionIdSnapshot: record.positionIdSnapshot || null,
        positionName:
          record.positionNameSnapshot || safeEmployee.position?.name || null,
        scheduledCheckInTime:
          record.scheduledCheckInTime || validShift?.checkInTime || null,
        scheduledCheckOutTime:
          record.scheduledCheckOutTime || validShift?.checkOutTime || null,
        lateMinutes,
        earlyLeaveMinutes,
        checkInNote: record.checkInNote || null,
        checkOutNote: record.checkOutNote || null,
        branchIdSnapshot: record.branchIdSnapshot || null,
        branchNameSnapshot: record.branchNameSnapshot || null,
      })
    }

    const overtimeLogs = []

    for (const ot of overtimeTrackingsRaw || []) {
      const isActiveBranch = ot.branch && ot.branch.isActive && !ot.branch.isDeleted

      // ถ้าอยากให้เหมือน logic เดิมที่ไม่เอา OT ของ branch ที่ถูกลบแล้ว ให้ข้ามตรงนี้
      if (!isActiveBranch) continue

      if (ot.status === 'COMPLETED') {
        counters.totalOtMinutes += Number(ot.otMinutes || 0)
      }

      overtimeLogs.push({
        id: ot.id,
        date: toBangkokDateKey(ot.date || ot.checkIn),
        checkIn: ot.checkIn,
        checkOut: ot.checkOut,
        noteIn: ot.noteIn || null,
        noteOut: ot.noteOut || null,
        otMinutes: ot.otMinutes || 0,
        status: ot.status,
        branchId: ot.branchId,
        branch: ot.branch,
      })
    }

    const activeOvertime =
      overtimeLogs.find((ot) => ot.status === 'ACTIVE' && !ot.checkOut) || null

    for (const item of dayOff || []) {
      if (item.status !== 'APPROVED') continue

      const key = toBangkokDateKey(item.date)

      approvedDayOffMap.set(key, item)
      counters.approvedDayOffs += 1

      attendanceLogs.push({
        id: item.id,
        date: key,
        status: 'DAY_OFF',
        reason: item.reason || null,
      })
    }

    const holidayDateKeys = new Set()

    for (const holiday of holidays || []) {
      const key = toBangkokDateKey(holiday.date)
      holidayDateKeys.add(key)

      const dayNumber = Number(key.slice(8, 10))

      if (key.slice(0, 7) === selectedMonthKey && dayNumber <= lastDayToCheck) {
        attendanceLogs.push({
          id: holiday.id,
          date: key,
          status: 'HOLIDAY',
          reason: holiday.title || 'Store holiday',
        })
      }
    }

    for (let day = 1; day <= lastDayToCheck; day++) {
      const dateKey = `${yearNum}-${String(monthNum).padStart(2, '0')}-${String(
        day
      ).padStart(2, '0')}`

      if (dateKey < employeeCreatedKey) continue

      const hasCheckIn = checkInDateMap.has(dateKey)
      const hasDayOff = approvedDayOffMap.has(dateKey)
      const isHoliday = holidayDateKeys.has(dateKey)

      if (!hasCheckIn && !hasDayOff && !isHoliday) {
        counters.absentDays += 1

        attendanceLogs.push({
          date: dateKey,
          status: 'ABSENT',
        })
      }
    }

    for (const item of advanceSalary || []) {
      if (item.status === 'APPROVED') {
        counters.approvedAdvance += Number(item.amount || 0)
      }
    }

    // date เป็น YYYY-MM-DD ใช้ string compare ได้ เร็วกว่า new Date ทุกแถว
    attendanceLogs.sort((a, b) => b.date.localeCompare(a.date))

    const liveRemainingDayOffs = safeEmployee.position
      ? Number(safeEmployee.remainingDayOffs || 0)
      : 0

    const liveFinalSalary =
      Number(employee.baseSalary || 0) - Number(counters.approvedAdvance || 0)

    const summary = snapshot
      ? {
          remainingDayOffs: Number(snapshot.remainingDayOffs || 0),
          workingDays: Number(snapshot.workingDays || 0),
          absentDays: Number(snapshot.absentDays || 0),
          lateDays: Number(snapshot.lateDays || 0),

          earlyDays: counters.earlyDays,

          dayOffs: Number(snapshot.dayOffUsed || 0),
          dayOffUsed: Number(snapshot.dayOffUsed || 0),
          totalOtMinutes: Number(snapshot.totalOTMinutes || 0),
          advanceTaken: Number(snapshot.advanceTaken || 0),
          finalSalary: Number(snapshot.salaryLeft || 0),
          remainingSalary: Number(snapshot.salaryLeft || 0),

          isSnapshot: true,
          snapshotId: snapshot.id,
          snapshotCreatedAt: snapshot.createdAt,
        }
      : {
          remainingDayOffs: liveRemainingDayOffs,
          workingDays: counters.workingDays,
          absentDays: counters.absentDays,
          lateDays: counters.lateDays,
          earlyDays: counters.earlyDays,
          dayOffs: counters.approvedDayOffs,
          dayOffUsed: counters.approvedDayOffs,
          totalOtMinutes: counters.totalOtMinutes,
          advanceTaken: counters.approvedAdvance,
          finalSalary: liveFinalSalary,
          remainingSalary: liveFinalSalary,

          isSnapshot: false,
        }

    res.json({
      profile: {
        id: safeEmployee.id,
        firstname: safeEmployee.firstname,
        lastname: safeEmployee.lastname,
        email: safeEmployee.email,
        profileImage: safeEmployee.profileImage,
        baseSalary: safeEmployee.baseSalary || 0,
        branch: safeEmployee.branch,
        position: safeEmployee.position,
        remainingDayOffs: liveRemainingDayOffs,
      },

      summary,

      logs: {
        attendanceLogs,
        overtimeLogs,
        activeOvertime,

        timetracking,
        overtimeTrackings: overtimeLogs,

        dayOff,
        dayOffRequests: dayOffRequestsByCreatedAt,

        advanceSalary,
      },
    })
  } catch (error) {
    next(error)
  }
}