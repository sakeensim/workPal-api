const prisma = require('../configs/prisma')

const isAdminOrOwner = (user) => {
  return user?.role === 'ADMIN' || user?.role === 'OWNER'
}

const getId = (id) => {
  const parsed = Number(id)

  if (!parsed || Number.isNaN(parsed)) return null

  return parsed
}

const getDateRange = ({ startDate, endDate }) => {
  const where = {}

  if (startDate || endDate) {
    where.createdAt = {}

    if (startDate) {
      where.createdAt.gte = new Date(`${startDate}T00:00:00.000+07:00`)
    }

    if (endDate) {
      where.createdAt.lte = new Date(`${endDate}T23:59:59.999+07:00`)
    }
  }

  return where
}

exports.getAuditLogs = async (req, res, next) => {
  try {
    if (!isAdminOrOwner(req.user)) {
      return res.status(403).json({
        message: 'Not authorized',
      })
    }

    const {
      action,
      entity,
      actorId,
      targetEmployeeId,
      branchId,
      startDate,
      endDate,
      page = 1,
      limit = 20,
    } = req.query

    const pageNum = Math.max(Number(page) || 1, 1)
    const limitNum = Math.min(Math.max(Number(limit) || 20, 1), 100)
    const skip = (pageNum - 1) * limitNum

    const where = {
      ...getDateRange({ startDate, endDate }),
    }

    if (action && action !== 'all') {
      where.action = action
    }

    if (entity && entity !== 'all') {
      where.entity = entity
    }

    if (actorId && actorId !== 'all') {
      const finalActorId = getId(actorId)

      if (!finalActorId) {
        return res.status(400).json({
          message: 'Invalid actor id',
        })
      }

      where.actorId = finalActorId
    }

    if (targetEmployeeId && targetEmployeeId !== 'all') {
      const finalTargetEmployeeId = getId(targetEmployeeId)

      if (!finalTargetEmployeeId) {
        return res.status(400).json({
          message: 'Invalid target employee id',
        })
      }

      where.targetEmployeeId = finalTargetEmployeeId
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

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        include: {
          actor: {
            select: {
              id: true,
              firstname: true,
              lastname: true,
              email: true,
              role: true,
              profileImage: true,
            },
          },
          targetEmployee: {
            select: {
              id: true,
              firstname: true,
              lastname: true,
              email: true,
              role: true,
              profileImage: true,
            },
          },
          branch: {
            select: {
              id: true,
              name: true,
              code: true,
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
        skip,
        take: limitNum,
      }),

      prisma.auditLog.count({
        where,
      }),
    ])

    res.json({
      message: 'Get audit logs success',
      data: logs,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    })
  } catch (error) {
    next(error)
  }
}

exports.getAuditLogById = async (req, res, next) => {
  try {
    if (!isAdminOrOwner(req.user)) {
      return res.status(403).json({
        message: 'Not authorized',
      })
    }

    const id = getId(req.params.id)

    if (!id) {
      return res.status(400).json({
        message: 'Invalid audit log id',
      })
    }

    const log = await prisma.auditLog.findUnique({
      where: {
        id,
      },
      include: {
        actor: {
          select: {
            id: true,
            firstname: true,
            lastname: true,
            email: true,
            role: true,
            profileImage: true,
          },
        },
        targetEmployee: {
          select: {
            id: true,
            firstname: true,
            lastname: true,
            email: true,
            role: true,
            profileImage: true,
          },
        },
        branch: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
      },
    })

    if (!log) {
      return res.status(404).json({
        message: 'Audit log not found',
      })
    }

    res.json({
      message: 'Get audit log success',
      data: log,
    })
  } catch (error) {
    next(error)
  }
}