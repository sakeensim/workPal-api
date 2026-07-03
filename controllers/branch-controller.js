const prisma = require('../configs/prisma')

const isAdminOrOwner = (user) => {
  return user?.role === 'ADMIN' || user?.role === 'OWNER'
}

const getBranchId = (id) => {
  const parsed = Number(id)

  if (!parsed || Number.isNaN(parsed)) return null

  return parsed
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

exports.createBranch = async (req, res, next) => {
  try {
    if (!isAdminOrOwner(req.user)) {
      return res.status(403).json({
        message: 'Not authorized',
      })
    }

    const { name, code, address, lat, lng, radius } = req.body

    if (!name || !code || lat === undefined || lng === undefined) {
      return res.status(400).json({
        message: 'Name, code, lat and lng are required',
      })
    }

    const result = await prisma.$transaction(async (tx) => {
      const branch = await tx.branch.create({
        data: {
          name,
          code,
          address: address || null,
          lat: Number(lat),
          lng: Number(lng),
          radius: radius ? Number(radius) : 100,
          isActive: true,
          isDeleted: false,
        },
      })

      await createAudit(tx, req, {
        action: 'ADD_BRANCH',
        entity: 'Branch',
        entityId: branch.id,
        branchId: branch.id,
        newValue: {
          id: branch.id,
          name: branch.name,
          code: branch.code,
          address: branch.address,
          lat: branch.lat,
          lng: branch.lng,
          radius: branch.radius,
          isActive: branch.isActive,
          isDeleted: branch.isDeleted,
        },
        note: `Create branch ${branch.name}`,
      })

      return branch
    })

    res.json({
      message: 'Create branch success',
      data: result,
    })
  } catch (error) {
    if (error.code === 'P2002') {
      return res.status(400).json({
        message: 'Branch code already exists',
      })
    }

    next(error)
  }
}

exports.listBranches = async (req, res, next) => {
  try {
    const branches = await prisma.branch.findMany({
      where: {
        isDeleted: false,
      },
      include: {
        _count: {
          select: {
            employees: true,
            positions: true,
            holidays: true,
            calendarNotes: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    })

    res.json({
      data: branches,
    })
  } catch (error) {
    next(error)
  }
}

exports.updateBranch = async (req, res, next) => {
  try {
    if (!isAdminOrOwner(req.user)) {
      return res.status(403).json({
        message: 'Not authorized',
      })
    }

    const branchId = getBranchId(req.params.id)

    if (!branchId) {
      return res.status(400).json({
        message: 'Invalid branch id',
      })
    }

    const { name, code, address, lat, lng, radius, isActive } = req.body

    const oldBranch = await prisma.branch.findFirst({
      where: {
        id: branchId,
        isDeleted: false,
      },
    })

    if (!oldBranch) {
      return res.status(404).json({
        message: 'Branch not found',
      })
    }

    const result = await prisma.$transaction(async (tx) => {
      const branch = await tx.branch.update({
        where: {
          id: branchId,
        },
        data: {
          name: name !== undefined ? name : oldBranch.name,
          code: code !== undefined ? code : oldBranch.code,
          address: address !== undefined ? address || null : oldBranch.address,
          lat: lat !== undefined ? Number(lat) : oldBranch.lat,
          lng: lng !== undefined ? Number(lng) : oldBranch.lng,
          radius: radius !== undefined ? Number(radius) : oldBranch.radius,
          isActive:
            typeof isActive === 'boolean' ? isActive : oldBranch.isActive,
        },
      })

      await createAudit(tx, req, {
        action: 'UPDATE_BRANCH',
        entity: 'Branch',
        entityId: branch.id,
        branchId: branch.id,
        oldValue: {
          name: oldBranch.name,
          code: oldBranch.code,
          address: oldBranch.address,
          lat: oldBranch.lat,
          lng: oldBranch.lng,
          radius: oldBranch.radius,
          isActive: oldBranch.isActive,
        },
        newValue: {
          name: branch.name,
          code: branch.code,
          address: branch.address,
          lat: branch.lat,
          lng: branch.lng,
          radius: branch.radius,
          isActive: branch.isActive,
        },
        note: `Update branch ${branch.name}`,
      })

      return branch
    })

    res.json({
      message: 'Update branch success',
      data: result,
    })
  } catch (error) {
    if (error.code === 'P2002') {
      return res.status(400).json({
        message: 'Branch code already exists',
      })
    }

    next(error)
  }
}

exports.deleteBranch = async (req, res, next) => {
  try {
    if (!isAdminOrOwner(req.user)) {
      return res.status(403).json({
        message: 'Not authorized',
      })
    }

    const branchId = getBranchId(req.params.id)
    const { reason } = req.body || {}

    if (!branchId) {
      return res.status(400).json({
        message: 'Invalid branch id',
      })
    }

    const branch = await prisma.branch.findFirst({
      where: {
        id: branchId,
        isDeleted: false,
      },
      include: {
        positions: {
          where: {
            isDeleted: false,
          },
          include: {
            shifts: {
              where: {
                isDeleted: false,
              },
            },
          },
        },
        employees: {
          where: {
            isDeleted: false,
          },
          select: {
            id: true,
            firstname: true,
            lastname: true,
            email: true,
            branchId: true,
            positionId: true,
          },
        },
      },
    })

    if (!branch) {
      return res.status(404).json({
        message: 'Branch not found',
      })
    }

    const now = new Date()
    const deleteReason = reason || 'Branch deleted'

    const result = await prisma.$transaction(async (tx) => {
      const positionIds = branch.positions.map((position) => position.id)
      const shiftIds = branch.positions.flatMap((position) =>
        position.shifts.map((shift) => shift.id)
      )

      await tx.employees.updateMany({
        where: {
          branchId,
          isDeleted: false,
        },
        data: {
          branchId: null,
          positionId: null,
          remainingDayOffs: 0,
        },
      })

      if (shiftIds.length > 0) {
        await tx.shift.updateMany({
          where: {
            id: {
              in: shiftIds,
            },
          },
          data: {
            isActive: false,
            isDeleted: true,
            deletedAt: now,
            deletedById: req.user.id,
            deletedReason: deleteReason,
          },
        })
      }

      if (positionIds.length > 0) {
        await tx.position.updateMany({
          where: {
            id: {
              in: positionIds,
            },
          },
          data: {
            isActive: false,
            isDeleted: true,
            deletedAt: now,
            deletedById: req.user.id,
            deletedReason: deleteReason,
          },
        })
      }

      const deletedBranch = await tx.branch.update({
        where: {
          id: branchId,
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
        action: 'DELETE_BRANCH',
        entity: 'Branch',
        entityId: branch.id,
        branchId: branch.id,
        oldValue: {
          id: branch.id,
          name: branch.name,
          code: branch.code,
          address: branch.address,
          lat: branch.lat,
          lng: branch.lng,
          radius: branch.radius,
          isActive: branch.isActive,
          isDeleted: branch.isDeleted,
          positions: branch.positions.map((position) => ({
            id: position.id,
            name: position.name,
          })),
          employees: branch.employees,
        },
        newValue: {
          isActive: false,
          isDeleted: true,
          deletedAt: deletedBranch.deletedAt,
          deletedById: req.user.id,
          affectedEmployeeCount: branch.employees.length,
          deletedPositionCount: positionIds.length,
          deletedShiftCount: shiftIds.length,
        },
        note: `Soft delete branch ${branch.name}`,
      })

      return {
        deletedBranch,
        affectedEmployeeCount: branch.employees.length,
        deletedPositionCount: positionIds.length,
        deletedShiftCount: shiftIds.length,
      }
    })

    res.json({
      message: 'Delete branch success',
      data: result.deletedBranch,
      affectedEmployeeCount: result.affectedEmployeeCount,
      deletedPositionCount: result.deletedPositionCount,
      deletedShiftCount: result.deletedShiftCount,
    })
  } catch (error) {
    next(error)
  }
}