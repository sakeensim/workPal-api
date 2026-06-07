const prisma = require('../configs/prisma')

const toBoolean = (value) => {
  if (value === true || value === 'true') return true
  if (value === false || value === 'false') return false
  return Boolean(value)
}

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

exports.createPosition = async (req, res, next) => {
  try {
    const {
      name,
      description,
      checkInTime,
      checkOutTime,
      maxDayOffPerMonth,
      allowOT = false,
      otCapMinutes,
    } = req.body

    if (!name || !checkInTime || !checkOutTime) {
      return res.status(400).json({
        message: 'Name, check-in time and check-out time are required',
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
        },
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
        message: 'Position name already exists',
      })
    }

    next(error)
  }
}

exports.listPositions = async (req, res, next) => {
  try {
    const positions = await prisma.position.findMany({
      orderBy: {
        name: 'asc',
      },
      include: {
        shifts: {
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
    const { id } = req.params

    const {
      name,
      description,
      checkInTime,
      checkOutTime,
      maxDayOffPerMonth,
      allowOT,
      otCapMinutes,
    } = req.body

    const positionId = Number(id)

    const oldPosition = await prisma.position.findUnique({
      where: {
        id: positionId,
      },
      include: {
        shifts: {
          where: {
            isDefault: true,
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

    const addDayOff = Math.max(0, newMaxDayOff - oldMaxDayOff)

    const updateData = {
      name: name !== undefined ? name : oldPosition.name,
      description:
        description !== undefined ? description || null : oldPosition.description,
      checkInTime:
        checkInTime !== undefined ? checkInTime : oldPosition.checkInTime,
      checkOutTime:
        checkOutTime !== undefined ? checkOutTime : oldPosition.checkOutTime,
      maxDayOffPerMonth: newMaxDayOff,
      allowOT: finalAllowOT,
      otCapMinutes: finalOtCapMinutes,
    }

    const result = await prisma.$transaction(async (tx) => {
      const position = await tx.position.update({
        where: {
          id: positionId,
        },
        data: updateData,
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
              checkInTime !== undefined ? checkInTime : defaultShift.checkInTime,
            checkOutTime:
              checkOutTime !== undefined
                ? checkOutTime
                : defaultShift.checkOutTime,
          },
        })
      }

      const employees = await tx.employees.findMany({
        where: {
          positionId,
        },
        select: {
          id: true,
          remainingDayOffs: true,
        },
      })

      for (const employee of employees) {
        const currentRemaining = Number(employee.remainingDayOffs || 0)

        const newRemainingDayOffs = Math.min(
          newMaxDayOff,
          currentRemaining + addDayOff
        )

        await tx.employees.update({
          where: {
            id: employee.id,
          },
          data: {
            remainingDayOffs: newRemainingDayOffs,
          },
        })
      }

      return position
    })

    res.json({
      message: 'Update position success',
      data: result,
    })
  } catch (error) {
    if (error.code === 'P2002') {
      return res.status(400).json({
        message: 'Position name already exists',
      })
    }

    next(error)
  }
}

exports.deletePosition = async (req, res, next) => {
  try {
    const { id } = req.params
    const positionId = Number(id)

    const position = await prisma.position.findUnique({
      where: {
        id: positionId,
      },
    })

    if (!position) {
      return res.status(404).json({
        message: 'Position not found',
      })
    }

    await prisma.$transaction(async (tx) => {
      await tx.employees.updateMany({
        where: {
          positionId,
        },
        data: {
          positionId: null,
          remainingDayOffs: 0,
        },
      })

      await tx.position.delete({
        where: {
          id: positionId,
        },
      })
    })

    res.json({
      message: 'Delete position success',
    })
  } catch (error) {
    next(error)
  }
}