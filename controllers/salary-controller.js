const prisma = require('../configs/prisma')
const { createNotification } = require('../services/notification-service')

const ADVANCE_PER_REQUEST = 1000

const isAdminOrOwner = (user) => {
  return user?.role === 'ADMIN' || user?.role === 'OWNER'
}

const getActiveEmployeeWhere = () => ({
  isActive: true,
  isDeleted: false,
})

const isActiveBranch = (branch) => {
  return branch && branch.isActive === true && branch.isDeleted === false
}

const isActivePosition = (position) => {
  return position && position.isActive === true && position.isDeleted === false
}

const isPositionMatchBranch = (employee) => {
  if (!employee?.positionId) return true
  if (!employee?.position) return false
  if (!isActivePosition(employee.position)) return false

  return Number(employee.position.branchId) === Number(employee.branchId)
}

const validateEmployeeOrganization = (employee) => {
  if (!employee) return 'Employee not found'

  if (employee.branchId && !isActiveBranch(employee.branch)) {
    return 'สาขาของพนักงานถูกปิดใช้งานหรือถูกลบแล้ว'
  }

  if (!isPositionMatchBranch(employee)) {
    return 'ตำแหน่งของพนักงานไม่ตรงกับสาขา หรือถูกปิดใช้งานแล้ว'
  }

  return null
}

const getMonthRange = (date) => {
  const requestDate = new Date(date)

  const year = requestDate.getFullYear()
  const month = requestDate.getMonth()

  const monthStart = new Date(year, month, 1)
  const monthEnd = new Date(year, month + 1, 0, 23, 59, 59, 999)

  return {
    monthStart,
    monthEnd,
  }
}

const getEmployeeFullName = (employee) => {
  return [employee?.firstname, employee?.lastname].filter(Boolean).join(' ')
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

const safeCreateNotification = async (payload) => {
  try {
    await createNotification(payload)
  } catch (error) {
    console.error('Error creating notification:', error)
  }
}

exports.salaryAdvance = async (req, res, next) => {
  try {
    const { date, amount } = req.body

    if (!date || !amount || isNaN(amount) || Number(amount) <= 0) {
      return res.status(400).json({
        message: 'Invalid salary advance request',
      })
    }

    const employee = await prisma.employees.findFirst({
      where: {
        id: Number(req.user.id),
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

    const employeeError = validateEmployeeOrganization(employee)

    if (employeeError) {
      return res.status(employee ? 400 : 404).json({
        message: employeeError,
      })
    }

    const requestAmount = Number(amount)

    if (requestAmount > ADVANCE_PER_REQUEST) {
      return res.status(400).json({
        message: `เบิกได้ไม่เกิน ${ADVANCE_PER_REQUEST} บาทต่อครั้ง`,
      })
    }

    const requestDate = new Date(date)

    if (Number.isNaN(requestDate.getTime())) {
      return res.status(400).json({
        message: 'Invalid request date',
      })
    }

    const { monthStart, monthEnd } = getMonthRange(requestDate)

    const approvedAndPendingThisMonth = await prisma.advanceSalary.aggregate({
      where: {
        employeesId: employee.id,
        status: {
          in: ['PENDING', 'APPROVED'],
        },
        requestDate: {
          gte: monthStart,
          lte: monthEnd,
        },
        employees: {
          is: getActiveEmployeeWhere(),
        },
      },
      _sum: {
        amount: true,
      },
    })

    const usedAdvance = Number(approvedAndPendingThisMonth._sum.amount || 0)
    const baseSalary = Number(employee.baseSalary || 0)

    if (baseSalary <= 0) {
      return res.status(400).json({
        message: 'ยังไม่ได้กำหนดเงินเดือนพื้นฐาน',
      })
    }

    const monthlyAdvanceLimit = baseSalary
    const remainingAdvanceSalary = monthlyAdvanceLimit - usedAdvance

    if (remainingAdvanceSalary <= 0) {
      return res.status(400).json({
        message: `เดือนนี้มีคำขอเบิกล่วงหน้าครบ ${monthlyAdvanceLimit} บาทแล้ว`,
      })
    }

    if (requestAmount > remainingAdvanceSalary) {
      return res.status(400).json({
        message: `เบิกได้อีกไม่เกิน ${remainingAdvanceSalary} บาท`,
      })
    }

    const salaryTaked = await prisma.advanceSalary.create({
      data: {
        requestDate,
        amount: requestAmount,
        employeesId: employee.id,
      },
    })

    await safeCreateNotification({
      type: 'REQUEST_CREATED',
      title: 'มีคำขอเบิกเงินใหม่',
      message: `${getEmployeeFullName(employee)} ส่งคำขอเบิกเงิน ${requestAmount.toLocaleString()} บาท`,
      link: '/admin',
      entity: 'AdvanceSalary',
      entityId: salaryTaked.id,
      targetType: 'ADMIN',
      createdById: employee.id,
    })

    res.json({
      message: 'Salary Advance request was sent to admin',
      data: salaryTaked,
      monthlyAdvanceLimit,
      remainingAdvanceSalary: remainingAdvanceSalary - requestAmount,
    })
  } catch (error) {
    console.error('Error in salaryAdvance:', error)
    next(error)
  }
}

exports.updateSalary = async (req, res, next) => {
  try {
    const { id, baseSalary } = req.body

    if (!isAdminOrOwner(req.user)) {
      return res.status(403).json({
        message: 'Unauthorized',
      })
    }

    const employeeId = Number(id)
    const newBaseSalary = Number(baseSalary)

    if (!employeeId || Number.isNaN(newBaseSalary) || newBaseSalary < 0) {
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

    const employeeError = validateEmployeeOrganization(oldEmployee)

    if (employeeError) {
      return res.status(oldEmployee ? 400 : 404).json({
        message: employeeError,
      })
    }

    const updatedUser = await prisma.$transaction(async (tx) => {
      const updatedEmployee = await tx.employees.update({
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
        entityId: oldEmployee.id,
        targetEmployeeId: oldEmployee.id,
        branchId: oldEmployee.branchId,
        oldValue: {
          id: oldEmployee.id,
          firstname: oldEmployee.firstname,
          lastname: oldEmployee.lastname,
          email: oldEmployee.email,
          baseSalary: oldEmployee.baseSalary,
          branchId: oldEmployee.branchId,
          branch: oldEmployee.branch?.name || null,
          positionId: oldEmployee.positionId,
          position: oldEmployee.position?.name || null,
          positionBranchId: oldEmployee.position?.branchId || null,
        },
        newValue: {
          id: updatedEmployee.id,
          baseSalary: updatedEmployee.baseSalary,
          branchId: updatedEmployee.branchId,
          positionId: updatedEmployee.positionId,
        },
        note: `Change salary for ${getEmployeeFullName(oldEmployee)} from ${
          oldEmployee.baseSalary || 0
        } to ${newBaseSalary}`,
      })

      return updatedEmployee
    })

    res.status(200).json({
      message: 'Salary updated successfully',
      user: updatedUser,
    })
  } catch (error) {
    console.error('Error updating salary:', error)
    next(error)
  }
}