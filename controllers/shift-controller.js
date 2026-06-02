const prisma = require('../configs/prisma')

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
    const {
      name,
      checkInTime,
      checkOutTime,
      positionId,
      isDefault = false,
      allowOT = false,
      otStartAfter = 0,
      otCapMinutes = null,
    } = req.body

    if (!name || !checkInTime || !checkOutTime || !positionId) {
      return res.status(400).json({
        message: 'Name, check-in time, check-out time and position are required',
      })
    }

    const position = await prisma.position.findUnique({
      where: { id: Number(positionId) },
    })

    if (!position) {
      return res.status(404).json({
        message: 'Position not found',
      })
    }

    const shift = await prisma.$transaction(async (tx) => {
      if (isDefault) {
        await tx.shift.updateMany({
          where: {
            positionId: Number(positionId),
            isDefault: true,
          },
          data: {
            isDefault: false,
          },
        })
      }

      return tx.shift.create({
        data: {
          name,
          checkInTime,
          checkOutTime,
          positionId: Number(positionId),
          isDefault: Boolean(isDefault),
          allowOT: Boolean(allowOT),
          otStartAfter: Number(otStartAfter || 0),
          otCapMinutes:
            otCapMinutes === null || otCapMinutes === ''
              ? null
              : Number(otCapMinutes),
        },
        include: {
          position: true,
        },
      })
    })

    res.json({
      message: 'Create shift success',
      result: shift,
    })
  } catch (error) {
    next(error)
  }
}

exports.listShifts = async (req, res, next) => {
  try {
    const { positionId, activeOnly } = req.query

    const where = {}

    if (positionId && positionId !== 'all') {
      where.positionId = Number(positionId)
    }

    if (activeOnly === 'true') {
      where.isActive = true
    }

    const shifts = await prisma.shift.findMany({
      where,
      include: {
        position: true,
      },
      orderBy: [
        { positionId: 'asc' },
        { isDefault: 'desc' },
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
    const { id } = req.params

    const {
      name,
      checkInTime,
      checkOutTime,
      positionId,
      isDefault,
      isActive,
      allowOT,
      otStartAfter,
      otCapMinutes,
    } = req.body

    const oldShift = await prisma.shift.findUnique({
      where: { id: Number(id) },
    })

    if (!oldShift) {
      return res.status(404).json({
        message: 'Shift not found',
      })
    }

    const finalPositionId =
      positionId !== undefined ? Number(positionId) : oldShift.positionId

    const updatedShift = await prisma.$transaction(async (tx) => {
      if (isDefault === true) {
        await tx.shift.updateMany({
          where: {
            positionId: finalPositionId,
            isDefault: true,
            id: {
              not: Number(id),
            },
          },
          data: {
            isDefault: false,
          },
        })
      }

      return tx.shift.update({
        where: { id: Number(id) },
        data: {
          name,
          checkInTime,
          checkOutTime,
          positionId:
            positionId !== undefined ? Number(positionId) : undefined,
          isDefault:
            isDefault !== undefined ? Boolean(isDefault) : undefined,
          isActive:
            isActive !== undefined ? Boolean(isActive) : undefined,
          allowOT:
            allowOT !== undefined ? Boolean(allowOT) : undefined,
          otStartAfter:
            otStartAfter !== undefined ? Number(otStartAfter || 0) : undefined,
          otCapMinutes:
            otCapMinutes !== undefined
              ? otCapMinutes === null || otCapMinutes === ''
                ? null
                : Number(otCapMinutes)
              : undefined,
        },
        include: {
          position: true,
        },
      })
    })

    res.json({
      message: 'Update shift success',
      result: updatedShift,
    })
  } catch (error) {
    next(error)
  }
}

exports.deleteShift = async (req, res, next) => {
  try {
    const { id } = req.params

    const shift = await prisma.shift.findUnique({
      where: { id: Number(id) },
      include: {
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

    if (shift.employeeShifts.length > 0) {
      return res.status(400).json({
        message: 'This shift is already assigned. Please disable it instead.',
      })
    }

    await prisma.shift.delete({
      where: { id: Number(id) },
    })

    res.json({
      message: 'Delete shift success',
    })
  } catch (error) {
    next(error)
  }
}

exports.assignShift = async (req, res, next) => {
  try {
    const { employeesId, shiftId, date } = req.body

    if (!employeesId || !shiftId || !date) {
      return res.status(400).json({
        message: 'Employee, shift and date are required',
      })
    }

    const employee = await prisma.employees.findUnique({
      where: { id: Number(employeesId) },
      include: {
        position: true,
      },
    })

    if (!employee) {
      return res.status(404).json({
        message: 'Employee not found',
      })
    }

    const shift = await prisma.shift.findUnique({
      where: { id: Number(shiftId) },
    })

    if (!shift || !shift.isActive) {
      return res.status(404).json({
        message: 'Shift not found or inactive',
      })
    }

    if (employee.positionId && shift.positionId !== employee.positionId) {
      return res.status(400).json({
        message: 'This shift does not belong to employee position',
      })
    }

    const { date: shiftDate } = getBangkokDayRange(date)

    const assignedShift = await prisma.employeeShift.upsert({
      where: {
        employeesId_date: {
          employeesId: Number(employeesId),
          date: shiftDate,
        },
      },
      update: {
        shiftId: Number(shiftId),
      },
      create: {
        employeesId: Number(employeesId),
        shiftId: Number(shiftId),
        date: shiftDate,
      },
      include: {
        employees: true,
        shift: {
          include: {
            position: true,
          },
        },
      },
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
    const { employeesId, date } = req.body

    if (!employeesId || !date) {
      return res.status(400).json({
        message: 'Employee and date are required',
      })
    }

    const { date: shiftDate } = getBangkokDayRange(date)

    await prisma.employeeShift.delete({
      where: {
        employeesId_date: {
          employeesId: Number(employeesId),
          date: shiftDate,
        },
      },
    })

    res.json({
      message: 'Remove assigned shift success',
    })
  } catch (error) {
    if (error.code === 'P2025') {
      return res.status(404).json({
        message: 'Assigned shift not found',
      })
    }

    next(error)
  }
}

exports.getEmployeeShifts = async (req, res, next) => {
  try {
    const { employeesId, startDate, endDate } = req.query

    const where = {}

    if (employeesId) {
      where.employeesId = Number(employeesId)
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
            position: true,
          },
        },
        shift: {
          include: {
            position: true,
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

    const employee = await prisma.employees.findUnique({
      where: {
        id: Number(userId),
      },
      include: {
        position: true,
      },
    })

    if (!employee) {
      return res.status(404).json({
        message: 'Employee not found',
      })
    }

    if (!employee.positionId) {
      return res.status(400).json({
        message: 'พนักงานยังไม่ได้ถูกกำหนดตำแหน่ง',
      })
    }

    const shifts = await prisma.shift.findMany({
      where: {
        positionId: employee.positionId,
        isActive: true,
      },
      orderBy: [
        { isDefault: 'desc' },
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