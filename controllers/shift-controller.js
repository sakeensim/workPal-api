const prisma = require('../configs/prisma')

const toBoolean = (value) => {
  if (value === true || value === 'true') return true
  if (value === false || value === 'false') return false
  return false
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

const getActivePositionWhere = () => ({
  isActive: true,
  isDeleted: false,
})

const getActiveShiftWhere = () => ({
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
  if (!employee?.branchId) return false
  if (!employee?.positionId) return false
  if (!isActiveBranch(employee.branch)) return false
  if (!isActivePosition(employee.position)) return false

  return Number(employee.position.branchId) === Number(employee.branchId)
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

const getBangkokDayRange = (dateInput) => {
  const date = dateInput ? new Date(dateInput) : new Date()

  const bangkokDate = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)

  return {
    start: new Date(`${bangkokDate}T00:00:00.000+07:00`),
    end: new Date(`${bangkokDate}T23:59:59.999+07:00`),
    date: new Date(`${bangkokDate}T00:00:00.000+07:00`),
  }
}

exports.createShift = async (req, res, next) => {
  try {
    if (!isAdminOrOwner(req.user)) {
      return res.status(403).json({
        message: 'Not authorized',
      })
    }

    const {
      name,
      checkInTime,
      checkOutTime,
      positionId,
      isDefault = false,
      branchId,
    } = req.body

    if (!name || !checkInTime || !checkOutTime || !positionId) {
      return res.status(400).json({
        message: 'Name, check-in time, check-out time and position are required',
      })
    }

    const finalPositionId = getId(positionId)

    if (!finalPositionId) {
      return res.status(400).json({
        message: 'Invalid position id',
      })
    }

    const position = await prisma.position.findFirst({
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

    if (branchId && Number(branchId) !== Number(position.branchId)) {
      return res.status(400).json({
        message: 'Position does not belong to selected branch',
      })
    }

    const shift = await prisma.$transaction(async (tx) => {
      if (toBoolean(isDefault)) {
        await tx.shift.updateMany({
          where: {
            positionId: finalPositionId,
            isDefault: true,
            isDeleted: false,
          },
          data: {
            isDefault: false,
          },
        })
      }

      const createdShift = await tx.shift.create({
        data: {
          name,
          checkInTime,
          checkOutTime,
          positionId: finalPositionId,
          isDefault: toBoolean(isDefault),
          isActive: true,
          isDeleted: false,
        },
        include: {
          position: {
            include: {
              branch: true,
            },
          },
        },
      })

      await createAudit(tx, req, {
        action: 'CREATE_SHIFT',
        entity: 'Shift',
        entityId: createdShift.id,
        branchId: position.branchId,
        oldValue: null,
        newValue: {
          id: createdShift.id,
          name: createdShift.name,
          checkInTime: createdShift.checkInTime,
          checkOutTime: createdShift.checkOutTime,
          positionId: createdShift.positionId,
          positionName: createdShift.position?.name || null,
          branchId: position.branchId,
          branchName: position.branch?.name || null,
          isDefault: createdShift.isDefault,
          isActive: createdShift.isActive,
        },
        note: `Create shift ${createdShift.name}`,
      })

      return createdShift
    })

    res.json({
      message: 'Create shift success',
      result: shift,
    })
  } catch (error) {
    if (error.code === 'P2002') {
      return res.status(400).json({
        message: 'Shift name already exists in this position',
      })
    }

    next(error)
  }
}

exports.listShifts = async (req, res, next) => {
  try {
    const { positionId, branchId, activeOnly } = req.query

    const where = {
      isDeleted: false,
      position: {
        is: {
          ...getActivePositionWhere(),
          branch: {
            is: getActiveBranchWhere(),
          },
        },
      },
    }

    if (positionId && positionId !== 'all') {
      const finalPositionId = getId(positionId)

      if (!finalPositionId) {
        return res.status(400).json({
          message: 'Invalid position id',
        })
      }

      where.positionId = finalPositionId
    }

    if (branchId && branchId !== 'all') {
      const finalBranchId = getId(branchId)

      if (!finalBranchId) {
        return res.status(400).json({
          message: 'Invalid branch id',
        })
      }

      where.position.is.branchId = finalBranchId
    }

    if (activeOnly === 'true') {
      where.isActive = true
    }

    const shifts = await prisma.shift.findMany({
      where,
      include: {
        position: {
          include: {
            branch: true,
          },
        },
      },
      orderBy: [
        { positionId: 'asc' },
        { isDefault: 'desc' },
        { isActive: 'desc' },
        { name: 'asc' },
      ],
    })

    res.json({
      result: shifts,
    })
  } catch (error) {
    next(error)
  }
}
exports.updateShift = async (req, res, next) => {
  try {
    if (!isAdminOrOwner(req.user)) {
      return res.status(403).json({
        message: 'Not authorized',
      })
    }

    const shiftId = getId(req.params.id)

    if (!shiftId) {
      return res.status(400).json({
        message: 'Invalid shift id',
      })
    }

    const {
      name,
      checkInTime,
      checkOutTime,
      positionId,
      isDefault,
      isActive,
      branchId,
    } = req.body

    const oldShift = await prisma.shift.findFirst({
      where: {
        id: shiftId,
        isDeleted: false,
        position: {
          is: {
            ...getActivePositionWhere(),
            branch: {
              is: getActiveBranchWhere(),
            },
          },
        },
      },
      include: {
        position: {
          include: {
            branch: true,
          },
        },
      },
    })

    if (!oldShift) {
      return res.status(404).json({
        message: 'Shift not found',
      })
    }

    const finalPositionId =
      positionId !== undefined ? Number(positionId) : oldShift.positionId

    const position = await prisma.position.findFirst({
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

    if (branchId && Number(branchId) !== Number(position.branchId)) {
      return res.status(400).json({
        message: 'Position does not belong to selected branch',
      })
    }

    const finalIsDefault =
      isDefault !== undefined ? toBoolean(isDefault) : oldShift.isDefault

    const updatedShift = await prisma.$transaction(async (tx) => {
      if (finalIsDefault) {
        await tx.shift.updateMany({
          where: {
            positionId: finalPositionId,
            isDefault: true,
            isDeleted: false,
            id: {
              not: shiftId,
            },
          },
          data: {
            isDefault: false,
          },
        })
      }

      const updated = await tx.shift.update({
        where: {
          id: shiftId,
        },
        data: {
          name: name !== undefined ? name : undefined,
          checkInTime: checkInTime !== undefined ? checkInTime : undefined,
          checkOutTime: checkOutTime !== undefined ? checkOutTime : undefined,
          positionId: positionId !== undefined ? finalPositionId : undefined,
          isDefault:
            isDefault !== undefined ? toBoolean(isDefault) : undefined,
          isActive:
            isActive !== undefined ? toBoolean(isActive) : undefined,
        },
        include: {
          position: {
            include: {
              branch: true,
            },
          },
        },
      })

      await createAudit(tx, req, {
        action: 'UPDATE_SHIFT',
        entity: 'Shift',
        entityId: updated.id,
        branchId: updated.position?.branchId || position.branchId,
        oldValue: {
          id: oldShift.id,
          name: oldShift.name,
          checkInTime: oldShift.checkInTime,
          checkOutTime: oldShift.checkOutTime,
          positionId: oldShift.positionId,
          positionName: oldShift.position?.name || null,
          branchId: oldShift.position?.branchId || null,
          branchName: oldShift.position?.branch?.name || null,
          isDefault: oldShift.isDefault,
          isActive: oldShift.isActive,
        },
        newValue: {
          id: updated.id,
          name: updated.name,
          checkInTime: updated.checkInTime,
          checkOutTime: updated.checkOutTime,
          positionId: updated.positionId,
          positionName: updated.position?.name || null,
          branchId: updated.position?.branchId || null,
          branchName: updated.position?.branch?.name || null,
          isDefault: updated.isDefault,
          isActive: updated.isActive,
        },
        note: `Update shift ${updated.name}`,
      })

      return updated
    })

    res.json({
      message: 'Update shift success',
      result: updatedShift,
    })
  } catch (error) {
    if (error.code === 'P2002') {
      return res.status(400).json({
        message: 'Shift name already exists in this position',
      })
    }

    next(error)
  }
}

exports.deleteShift = async (req, res, next) => {
  try {
    if (!isAdminOrOwner(req.user)) {
      return res.status(403).json({
        message: 'Not authorized',
      })
    }

    const shiftId = getId(req.params.id)
    const { reason } = req.body || {}

    if (!shiftId) {
      return res.status(400).json({
        message: 'Invalid shift id',
      })
    }

    const shift = await prisma.shift.findFirst({
      where: {
        id: shiftId,
        isDeleted: false,
        position: {
          is: {
            ...getActivePositionWhere(),
            branch: {
              is: getActiveBranchWhere(),
            },
          },
        },
      },
      include: {
        position: {
          include: {
            branch: true,
          },
        },
        employeeShifts: true,
      },
    })

    if (!shift) {
      return res.status(404).json({
        message: 'Shift not found',
      })
    }

    if (shift.isDefault) {
      return res.status(400).json({
        message: 'Default shift cannot be deleted',
      })
    }

    const result = await prisma.$transaction(async (tx) => {
      const deletedShift = await tx.shift.update({
        where: {
          id: shiftId,
        },
        data: {
          isActive: false,
          isDeleted: true,
          deletedAt: new Date(),
          deletedById: req.user.id,
          deletedReason: reason || 'Deleted by admin',
        },
        include: {
          position: {
            include: {
              branch: true,
            },
          },
        },
      })

      await createAudit(tx, req, {
        action: 'DELETE_SHIFT',
        entity: 'Shift',
        entityId: shift.id,
        branchId: shift.position?.branchId || null,
        oldValue: {
          id: shift.id,
          name: shift.name,
          checkInTime: shift.checkInTime,
          checkOutTime: shift.checkOutTime,
          positionId: shift.positionId,
          positionName: shift.position?.name || null,
          branchId: shift.position?.branchId || null,
          branchName: shift.position?.branch?.name || null,
          isDefault: shift.isDefault,
          isActive: shift.isActive,
          isDeleted: shift.isDeleted,
          assignedCount: shift.employeeShifts.length,
        },
        newValue: {
          isActive: false,
          isDeleted: true,
          deletedAt: deletedShift.deletedAt,
          deletedById: req.user.id,
          reason: reason || null,
        },
        note: `Soft delete shift ${shift.name}`,
      })

      return deletedShift
    })

    res.json({
      message: 'Delete shift success',
      result,
    })
  } catch (error) {
    next(error)
  }
}

exports.assignShift = async (req, res, next) => {
  try {
    if (!isAdminOrOwner(req.user)) {
      return res.status(403).json({
        message: 'Not authorized',
      })
    }

    const { employeesId, shiftId, date } = req.body

    if (!employeesId || !shiftId || !date) {
      return res.status(400).json({
        message: 'Employee, shift and date are required',
      })
    }

    const employeeId = getId(employeesId)
    const finalShiftId = getId(shiftId)

    if (!employeeId || !finalShiftId) {
      return res.status(400).json({
        message: 'Invalid employee or shift id',
      })
    }

    const employee = await prisma.employees.findFirst({
      where: {
        id: employeeId,
        ...getActiveEmployeeWhere(),
        branch: {
          is: getActiveBranchWhere(),
        },
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

    if (!isEmployeePositionMatchBranch(employee)) {
      return res.status(400).json({
        message: 'พนักงานยังไม่ได้ถูกกำหนดตำแหน่ง หรือตำแหน่งไม่ตรงกับสาขา',
      })
    }

    const shift = await prisma.shift.findFirst({
      where: {
        id: finalShiftId,
        ...getActiveShiftWhere(),
        position: {
          is: {
            id: employee.positionId,
            branchId: employee.branchId,
            ...getActivePositionWhere(),
            branch: {
              is: getActiveBranchWhere(),
            },
          },
        },
      },
      include: {
        position: {
          include: {
            branch: true,
          },
        },
      },
    })

    if (!shift) {
      return res.status(404).json({
        message: 'Shift not found, inactive, or not in employee branch',
      })
    }

    const { date: shiftDate } = getBangkokDayRange(date)

    const assignedShift = await prisma.$transaction(async (tx) => {
      const oldAssigned = await tx.employeeShift.findUnique({
        where: {
          employeesId_date: {
            employeesId: employeeId,
            date: shiftDate,
          },
        },
        include: {
          shift: {
            include: {
              position: true,
            },
          },
        },
      })

      const assigned = await tx.employeeShift.upsert({
        where: {
          employeesId_date: {
            employeesId: employeeId,
            date: shiftDate,
          },
        },
        update: {
          shiftId: finalShiftId,
        },
        create: {
          employeesId: employeeId,
          shiftId: finalShiftId,
          date: shiftDate,
        },
        include: {
          employees: true,
          shift: {
            include: {
              position: {
                include: {
                  branch: true,
                },
              },
            },
          },
        },
      })

      await createAudit(tx, req, {
        action: 'SYSTEM',
        entity: 'EmployeeShift',
        entityId: assigned.id,
        targetEmployeeId: employeeId,
        branchId: employee.branchId,
        oldValue: oldAssigned
          ? {
              id: oldAssigned.id,
              shiftId: oldAssigned.shiftId,
              shiftName: oldAssigned.shift?.name || null,
              positionId: oldAssigned.shift?.positionId || null,
              branchId: oldAssigned.shift?.position?.branchId || null,
              date: oldAssigned.date,
            }
          : null,
        newValue: {
          id: assigned.id,
          shiftId: assigned.shiftId,
          shiftName: assigned.shift?.name || null,
          positionId: assigned.shift?.positionId || null,
          branchId: assigned.shift?.position?.branchId || null,
          date: assigned.date,
        },
        note: `Assign shift ${assigned.shift?.name || ''} to employee ${employeeId}`,
      })

      return assigned
    })

    res.json({
      message: 'Assign shift success',
      result: assignedShift,
    })
  } catch (error) {
    next(error)
  }
}

exports.removeAssignedShift = async (req, res, next) => {
  try {
    if (!isAdminOrOwner(req.user)) {
      return res.status(403).json({
        message: 'Not authorized',
      })
    }

    const { employeesId, date } = req.body

    if (!employeesId || !date) {
      return res.status(400).json({
        message: 'Employee and date are required',
      })
    }

    const employeeId = getId(employeesId)

    if (!employeeId) {
      return res.status(400).json({
        message: 'Invalid employee id',
      })
    }

    const { date: shiftDate } = getBangkokDayRange(date)

    const existing = await prisma.employeeShift.findUnique({
      where: {
        employeesId_date: {
          employeesId: employeeId,
          date: shiftDate,
        },
      },
      include: {
        shift: {
          include: {
            position: {
              include: {
                branch: true,
              },
            },
          },
        },
        employees: true,
      },
    })

    if (!existing) {
      return res.status(404).json({
        message: 'Assigned shift not found',
      })
    }

    await prisma.$transaction(async (tx) => {
      await createAudit(tx, req, {
        action: 'SYSTEM',
        entity: 'EmployeeShift',
        entityId: existing.id,
        targetEmployeeId: existing.employeesId,
        branchId:
          existing.shift?.position?.branchId ||
          existing.employees?.branchId ||
          null,
        oldValue: {
          id: existing.id,
          employeesId: existing.employeesId,
          employeeName: existing.employees
            ? `${existing.employees.firstname} ${existing.employees.lastname}`
            : null,
          shiftId: existing.shiftId,
          shiftName: existing.shift?.name || null,
          positionId: existing.shift?.positionId || null,
          branchId: existing.shift?.position?.branchId || null,
          date: existing.date,
        },
        newValue: {
          deleted: true,
        },
        note: `Remove assigned shift from employee ${existing.employeesId}`,
      })

      await tx.employeeShift.delete({
        where: {
          employeesId_date: {
            employeesId: employeeId,
            date: shiftDate,
          },
        },
      })
    })

    res.json({
      message: 'Remove assigned shift success',
    })
  } catch (error) {
    next(error)
  }
}

exports.getEmployeeShifts = async (req, res, next) => {
  try {
    const { employeesId, startDate, endDate, branchId } = req.query

    const where = {
      employees: {
        is: {
          ...getActiveEmployeeWhere(),
          branch: {
            is: getActiveBranchWhere(),
          },
        },
      },
      shift: {
        is: {
          ...getActiveShiftWhere(),
          position: {
            is: {
              ...getActivePositionWhere(),
              branch: {
                is: getActiveBranchWhere(),
              },
            },
          },
        },
      },
    }

    if (employeesId) {
      const employeeId = getId(employeesId)

      if (!employeeId) {
        return res.status(400).json({
          message: 'Invalid employee id',
        })
      }

      where.employeesId = employeeId
    }

    if (branchId && branchId !== 'all') {
      const finalBranchId = getId(branchId)

      if (!finalBranchId) {
        return res.status(400).json({
          message: 'Invalid branch id',
        })
      }

      where.employees.is.branchId = finalBranchId
      where.shift.is.position.is.branchId = finalBranchId
    }

    if (startDate && endDate) {
      where.date = {
        gte: getBangkokDayRange(startDate).start,
        lte: getBangkokDayRange(endDate).end,
      }
    }

    const employeeShifts = await prisma.employeeShift.findMany({
      where,
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
        shift: {
          include: {
            position: {
              include: {
                branch: true,
              },
            },
          },
        },
      },
      orderBy: {
        date: 'asc',
      },
    })

    res.json({
      result: employeeShifts,
    })
  } catch (error) {
    next(error)
  }
}

exports.getMyShifts = async (req, res, next) => {
  try {
    const userId = req.user.id

    const employee = await prisma.employees.findFirst({
      where: {
        id: Number(userId),
        ...getActiveEmployeeWhere(),
        branch: {
          is: getActiveBranchWhere(),
        },
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

    if (!isEmployeePositionMatchBranch(employee)) {
      return res.status(400).json({
        message: 'พนักงานยังไม่ได้ถูกกำหนดตำแหน่ง หรือตำแหน่งไม่ตรงกับสาขา',
      })
    }

    const shifts = await prisma.shift.findMany({
      where: {
        positionId: employee.positionId,
        ...getActiveShiftWhere(),
        position: {
          is: {
            branchId: employee.branchId,
            ...getActivePositionWhere(),
            branch: {
              is: getActiveBranchWhere(),
            },
          },
        },
      },
      orderBy: [
        { isDefault: 'desc' },
        { name: 'asc' },
      ],
    })

    res.json({
      result: shifts,
      position: {
        id: employee.position.id,
        name: employee.position.name,
        branchId: employee.position.branchId,
        branch: employee.position.branch || null,
        allowOT: Boolean(employee.position.allowOT),
        otCapMinutes: employee.position.otCapMinutes || 0,
      },
      allowOT: Boolean(employee.position.allowOT),
      otCapMinutes: employee.position.otCapMinutes || 0,
    })
  } catch (error) {
    next(error)
  }
}