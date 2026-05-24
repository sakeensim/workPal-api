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

    const position = await prisma.position.create({
      data: {
        name,
        description,
        checkInTime,
        checkOutTime,
        maxDayOffPerMonth: Number(maxDayOffPerMonth || 0),
      },
    })

    res.json({
      message: 'Create position success',
      data: position,
    })
  } catch (error) {
    next(error)
  }
}

exports.listPositions = async (req, res, next) => {
  try {
    const positions = await prisma.position.findMany({
      orderBy: { name: 'asc' },
    })

    res.json({ data: positions })
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

    const newMaxDayOff =
      maxDayOffPerMonth !== undefined
        ? Number(maxDayOffPerMonth || 0)
        : Number(oldPosition.maxDayOffPerMonth || 0)

    const result = await prisma.$transaction(async (tx) => {
      const position = await tx.position.update({
        where: {
          id: positionId,
        },
        data: {
          name,
          description,
          checkInTime,
          checkOutTime,
          maxDayOffPerMonth: newMaxDayOff,
        },
      })

      await tx.employees.updateMany({
        where: {
          positionId,
          remainingDayOffs: {
            gt: newMaxDayOff,
          },
        },
        data: {
          remainingDayOffs: newMaxDayOff,
        },
      })

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