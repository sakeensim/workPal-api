const prisma = require('../configs/prisma')

const toBoolean = (value) => {
  if (value === true || value === 'true') return true
  if (value === false || value === 'false') return false
  return Boolean(value)
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

const normalizeOtCapMinutes = (allowOT, otCapMinutes) => {
  if (!allowOT) return null

  if (
    otCapMinutes === undefined ||
    otCapMinutes === null ||
    otCapMinutes === ''
  ) {
    return null
  }

  return Number(otCapMinutes)
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

exports.createPosition = async (req, res, next) => {
  try {
    if (!isAdminOrOwner(req.user)) {
      return res.status(403).json({
        message: 'Not authorized',
      })
    }

    const {
      name,
      description,
      checkInTime,
      checkOutTime,
      maxDayOffPerMonth,
      allowOT = false,
      otCapMinutes,
      branchId,
    } = req.body

    if (!name || !checkInTime || !checkOutTime || !branchId) {
      return res.status(400).json({
        message: 'Name, check-in time, check-out time and branch are required',
      })
    }

    const finalBranchId = getId(branchId)

    if (!finalBranchId) {
      return res.status(400).json({
        message: 'Invalid branch id',
      })
    }

    const branch = await prisma.branch.findFirst({
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

    const finalAllowOT = toBoolean(allowOT)
    const finalOtCapMinutes = normalizeOtCapMinutes(
      finalAllowOT,
      otCapMinutes
    )

    if (finalAllowOT && (!finalOtCapMinutes || finalOtCapMinutes <= 0)) {
      return res.status(400).json({
        message: 'OT cap minutes is required when allow OT is enabled',
      })
    }

    const result = await prisma.$transaction(async (tx) => {
      const position = await tx.position.create({
        data: {
          name,
          description: description || null,
          checkInTime,
          checkOutTime,
          maxDayOffPerMonth: Number(maxDayOffPerMonth || 0),
          allowOT: finalAllowOT,
          otCapMinutes: finalOtCapMinutes,
          branchId: finalBranchId,
          isActive: true,
          isDeleted: false,
        },
        include: {
          branch: true,
        },
      })

      const defaultShift = await tx.shift.create({
        data: {
          name: `${position.name}_shift`,
          checkInTime,
          checkOutTime,
          positionId: position.id,
          isDefault: true,
          isActive: true,
          isDeleted: false,
        },
      })

      await createAudit(tx, req, {
        action: 'ADD_POSITION',
        entity: 'Position',
        entityId: position.id,
        branchId: position.branchId,
        newValue: {
          id: position.id,
          name: position.name,
          description: position.description,
          checkInTime: position.checkInTime,
          checkOutTime: position.checkOutTime,
          maxDayOffPerMonth: position.maxDayOffPerMonth,
          allowOT: position.allowOT,
          otCapMinutes: position.otCapMinutes,
          branchId: position.branchId,
          branchName: position.branch?.name || null,
          defaultShiftId: defaultShift.id,
        },
        note: `Create position ${position.name} for branch ${branch.name}`,
      })

      return {
        position,
        defaultShift,
      }
    })

    res.json({
      message: 'Create position success',
      data: result.position,
      defaultShift: result.defaultShift,
    })
  } catch (error) {
    if (error.code === 'P2002') {
      return res.status(400).json({
        message: 'Position name already exists in this branch',
      })
    }

    next(error)
  }
}

exports.listPositions = async (req, res, next) => {
  try {
    const { branchId, activeOnly } = req.query

    const where = {
      isDeleted: false,
      branch: {
        is: getActiveBranchWhere(),
      },
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

    if (activeOnly === 'true') {
      where.isActive = true
    }

    const positions = await prisma.position.findMany({
      where,
      orderBy: [
        { branchId: 'asc' },
        { name: 'asc' },
      ],
      include: {
        branch: true,
        shifts: {
          where: {
            isDeleted: false,
          },
          orderBy: [
            { isDefault: 'desc' },
            { isActive: 'desc' },
            { name: 'asc' },
          ],
        },
      },
    })

    res.json({
      data: positions,
    })
  } catch (error) {
    next(error)
  }
}

exports.updatePosition = async (req, res, next) => {
  try {
    if (!isAdminOrOwner(req.user)) {
      return res.status(403).json({
        message: 'Not authorized',
      })
    }

    const positionId = getId(req.params.id)

    if (!positionId) {
      return res.status(400).json({
        message: 'Invalid position id',
      })
    }

    const {
      name,
      description,
      checkInTime,
      checkOutTime,
      maxDayOffPerMonth,
      allowOT,
      otCapMinutes,
      isActive,
      branchId,
    } = req.body

    const oldPosition = await prisma.position.findFirst({
      where: {
        id: positionId,
        isDeleted: false,
        branch: {
          is: getActiveBranchWhere(),
        },
      },
      include: {
        branch: true,
        shifts: {
          where: {
            isDefault: true,
            isDeleted: false,
          },
          take: 1,
        },
      },
    })

    if (!oldPosition) {
      return res.status(404).json({
        message: 'Position not found',
      })
    }

    if (
      branchId !== undefined &&
      Number(branchId) !== Number(oldPosition.branchId)
    ) {
      return res.status(400).json({
        message:
          'Cannot change branch of existing position. Please create a new position for the new branch.',
      })
    }

    const oldMaxDayOff = Number(oldPosition.maxDayOffPerMonth || 0)

    const newMaxDayOff =
      maxDayOffPerMonth !== undefined
        ? Number(maxDayOffPerMonth || 0)
        : oldMaxDayOff

    const finalAllowOT =
      allowOT !== undefined ? toBoolean(allowOT) : Boolean(oldPosition.allowOT)

    const finalOtCapMinutes =
      otCapMinutes !== undefined
        ? normalizeOtCapMinutes(finalAllowOT, otCapMinutes)
        : finalAllowOT
          ? oldPosition.otCapMinutes
          : null

    if (finalAllowOT && (!finalOtCapMinutes || Number(finalOtCapMinutes) <= 0)) {
      return res.status(400).json({
        message: 'OT cap minutes is required when allow OT is enabled',
      })
    }

    const updateData = {
      name: name !== undefined ? name : oldPosition.name,
      description:
        description !== undefined
          ? description || null
          : oldPosition.description,
      checkInTime:
        checkInTime !== undefined ? checkInTime : oldPosition.checkInTime,
      checkOutTime:
        checkOutTime !== undefined ? checkOutTime : oldPosition.checkOutTime,
      maxDayOffPerMonth: newMaxDayOff,
      allowOT: finalAllowOT,
      otCapMinutes: finalOtCapMinutes,
      isActive:
        isActive !== undefined ? toBoolean(isActive) : oldPosition.isActive,
    }

    const result = await prisma.$transaction(async (tx) => {
      const position = await tx.position.update({
        where: {
          id: positionId,
        },
        data: updateData,
        include: {
          branch: true,
        },
      })

      const defaultShift = oldPosition.shifts?.[0]

      if (defaultShift) {
        await tx.shift.update({
          where: {
            id: defaultShift.id,
          },
          data: {
            name:
              name !== undefined
                ? `${position.name}_shift`
                : defaultShift.name,
            checkInTime:
              checkInTime !== undefined
                ? checkInTime
                : defaultShift.checkInTime,
            checkOutTime:
              checkOutTime !== undefined
                ? checkOutTime
                : defaultShift.checkOutTime,
            isActive:
              isActive !== undefined ? toBoolean(isActive) : defaultShift.isActive,
          },
        })
      }

      await createAudit(tx, req, {
        action: 'UPDATE_POSITION',
        entity: 'Position',
        entityId: position.id,
        branchId: position.branchId,
        oldValue: {
          id: oldPosition.id,
          name: oldPosition.name,
          description: oldPosition.description,
          checkInTime: oldPosition.checkInTime,
          checkOutTime: oldPosition.checkOutTime,
          maxDayOffPerMonth: oldPosition.maxDayOffPerMonth,
          allowOT: oldPosition.allowOT,
          otCapMinutes: oldPosition.otCapMinutes,
          isActive: oldPosition.isActive,
          branchId: oldPosition.branchId,
          branchName: oldPosition.branch?.name || null,
        },
        newValue: {
          id: position.id,
          name: position.name,
          description: position.description,
          checkInTime: position.checkInTime,
          checkOutTime: position.checkOutTime,
          maxDayOffPerMonth: position.maxDayOffPerMonth,
          allowOT: position.allowOT,
          otCapMinutes: position.otCapMinutes,
          isActive: position.isActive,
          branchId: position.branchId,
          branchName: position.branch?.name || null,
          remainingDayOffsNotChanged: true,
        },
        note: `Update position ${position.name}`,
      })

      return position
    })

    res.json({
      message: 'Update position success',
      data: result,
    })
  } catch (error) {
    if (error.code === 'P2002') {
      return res.status(400).json({
        message: 'Position name already exists in this branch',
      })
    }

    next(error)
  }
}

exports.deletePosition = async (req, res, next) => {
  try {
    if (!isAdminOrOwner(req.user)) {
      return res.status(403).json({
        message: 'Not authorized',
      })
    }

    const positionId = getId(req.params.id)
    const { reason } = req.body || {}

    if (!positionId) {
      return res.status(400).json({
        message: 'Invalid position id',
      })
    }

    const position = await prisma.position.findFirst({
      where: {
        id: positionId,
        isDeleted: false,
      },
      include: {
        branch: true,
        shifts: {
          where: {
            isDeleted: false,
          },
        },
      },
    })

    if (!position) {
      return res.status(404).json({
        message: 'Position not found',
      })
    }

    const now = new Date()
    const deleteReason = reason || 'Deleted by admin'

    const result = await prisma.$transaction(async (tx) => {
      const affectedEmployees = await tx.employees.findMany({
        where: {
          positionId,
          branchId: position.branchId,
          ...getActiveEmployeeWhere(),
        },
        select: {
          id: true,
          firstname: true,
          lastname: true,
          email: true,
          branchId: true,
          positionId: true,
        },
      })

      await tx.employees.updateMany({
        where: {
          positionId,
          branchId: position.branchId,
          ...getActiveEmployeeWhere(),
        },
        data: {
          positionId: null,
          remainingDayOffs: 0,
        },
      })

      await tx.shift.updateMany({
        where: {
          positionId,
          isDeleted: false,
        },
        data: {
          isActive: false,
          isDeleted: true,
          deletedAt: now,
          deletedById: req.user.id,
          deletedReason: deleteReason,
        },
      })

      const deletedPosition = await tx.position.update({
        where: {
          id: positionId,
        },
        data: {
          isActive: false,
          isDeleted: true,
          deletedAt: now,
          deletedById: req.user.id,
          deletedReason: deleteReason,
        },
        include: {
          branch: true,
        },
      })

      await createAudit(tx, req, {
        action: 'DELETE_POSITION',
        entity: 'Position',
        entityId: position.id,
        branchId: position.branchId,
        oldValue: {
          id: position.id,
          name: position.name,
          description: position.description,
          checkInTime: position.checkInTime,
          checkOutTime: position.checkOutTime,
          maxDayOffPerMonth: position.maxDayOffPerMonth,
          allowOT: position.allowOT,
          otCapMinutes: position.otCapMinutes,
          isActive: position.isActive,
          isDeleted: position.isDeleted,
          branchId: position.branchId,
          branchName: position.branch?.name || null,
          shiftIds: position.shifts.map((shift) => shift.id),
          affectedEmployees,
        },
        newValue: {
          isActive: false,
          isDeleted: true,
          deletedAt: deletedPosition.deletedAt,
          deletedById: req.user.id,
          affectedEmployeeCount: affectedEmployees.length,
          deletedShiftCount: position.shifts.length,
        },
        note: `Soft delete position ${position.name}`,
      })

      return {
        deletedPosition,
        affectedEmployeeCount: affectedEmployees.length,
        deletedShiftCount: position.shifts.length,
      }
    })

    res.json({
      message: 'Delete position success',
      data: result.deletedPosition,
      affectedEmployeeCount: result.affectedEmployeeCount,
      deletedShiftCount: result.deletedShiftCount,
    })
  } catch (error) {
    next(error)
  }
}