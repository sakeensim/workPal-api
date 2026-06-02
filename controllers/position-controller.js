const prisma = require('../configs/prisma')

exports.createPosition = async (req, res, next) => {
  try {
    const {
      name,
      description,
      checkInTime,
      checkOutTime,
      maxDayOffPerMonth,
    } = req.body

    if (!name || !checkInTime || !checkOutTime) {
      return res.status(400).json({
        message: 'Name, check-in time and check-out time are required',
      })
    }

    const result = await prisma.$transaction(async (tx) => {
      const position = await tx.position.create({
        data: {
          name,
          description,
          checkInTime,
          checkOutTime,
          maxDayOffPerMonth: Number(maxDayOffPerMonth || 0),
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
          allowOT: false,
          otStartAfter: 0,
          otCapMinutes: null,
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
    } = req.body

    const positionId = Number(id)

    const oldPosition = await prisma.position.findUnique({
      where: {
        id: positionId,
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

    const addDayOff = Math.max(0, newMaxDayOff - oldMaxDayOff)

    const updateData = {
      name: name !== undefined ? name : oldPosition.name,
      description:
        description !== undefined ? description : oldPosition.description,
      checkInTime:
        checkInTime !== undefined ? checkInTime : oldPosition.checkInTime,
      checkOutTime:
        checkOutTime !== undefined ? checkOutTime : oldPosition.checkOutTime,
      maxDayOffPerMonth: newMaxDayOff,
    }

    const result = await prisma.$transaction(async (tx) => {
      const position = await tx.position.update({
        where: {
          id: positionId,
        },
        data: updateData,
      })

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