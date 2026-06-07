const prisma = require('../configs/prisma')

const getBangkokDayRange = (date) => {
  const target = new Date(date)

  const bangkokDate = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(target)

  return {
    start: new Date(`${bangkokDate}T00:00:00.000+07:00`),
    end: new Date(`${bangkokDate}T23:59:59.999+07:00`),
  }
}

const refundDayOffIfNeeded = async (tx, employeeId) => {
  if (!employeeId) return

  const employee = await tx.employees.findUnique({
    where: {
      id: Number(employeeId),
    },
    include: {
      position: true,
    },
  })

  if (!employee?.position) return

  const maxDayOffPerMonth = Number(employee.position.maxDayOffPerMonth || 0)
  const currentRemaining = Number(employee.remainingDayOffs || 0)

  if (currentRemaining < maxDayOffPerMonth) {
    await tx.employees.update({
      where: {
        id: Number(employeeId),
      },
      data: {
        remainingDayOffs: {
          increment: 1,
        },
      },
    })
  }
}

exports.createHoliday = async (req, res, next) => {
  try {
    const { date, title, branchId } = req.body

    if (!date) {
      return res.status(400).json({
        message: 'Holiday date is required',
      })
    }

    if (!branchId) {
      return res.status(400).json({
        message: 'Branch is required',
      })
    }

    const holidayBranchId = Number(branchId)

    const branch = await prisma.branch.findUnique({
      where: {
        id: holidayBranchId,
      },
    })

    if (!branch) {
      return res.status(404).json({
        message: 'Branch not found',
      })
    }

    const { start, end } = getBangkokDayRange(date)

    const existingHoliday = await prisma.storeHoliday.findFirst({
      where: {
        branchId: holidayBranchId,
        date: {
          gte: start,
          lte: end,
        },
      },
    })

    if (existingHoliday) {
      return res.status(400).json({
        message: 'วันนี้ถูกตั้งเป็นวันหยุดของสาขานี้แล้ว',
      })
    }

    const result = await prisma.$transaction(async (tx) => {
      const holiday = await tx.storeHoliday.create({
        data: {
          date: start,
          title: title || null,
          branchId: holidayBranchId,
        },
        include: {
          branch: true,
        },
      })

      const affectedDayOffs = await tx.dayOff.findMany({
        where: {
          date: {
            gte: start,
            lte: end,
          },
          status: {
            in: ['PENDING', 'APPROVED'],
          },
          employees: {
            is: {
              branchId: holidayBranchId,
            },
          },
        },
      })

      for (const dayOff of affectedDayOffs) {
        if (dayOff.status === 'APPROVED') {
          await refundDayOffIfNeeded(tx, dayOff.employeesId)
        }
      }

      if (affectedDayOffs.length > 0) {
        await tx.dayOff.updateMany({
          where: {
            id: {
              in: affectedDayOffs.map((item) => item.id),
            },
          },
          data: {
            status: 'CANCELED',
          },
        })
      }

      return {
        holiday,
        canceledDayOffCount: affectedDayOffs.length,
      }
    })

    res.json({
      message: 'Create holiday success',
      data: result.holiday,
      canceledDayOffCount: result.canceledDayOffCount,
    })
  } catch (error) {
    next(error)
  }
}

exports.getHolidays = async (req, res, next) => {
  try {
    const { branchId } = req.query

    const where = {}

    if (branchId && branchId !== 'all') {
      where.branchId = Number(branchId)
    }

    const holidays = await prisma.storeHoliday.findMany({
      where,
      include: {
        branch: true,
      },
      orderBy: {
        date: 'desc',
      },
    })

    res.json({
      data: holidays,
    })
  } catch (error) {
    next(error)
  }
}

exports.deleteHoliday = async (req, res, next) => {
  try {
    const { id } = req.params

    const holiday = await prisma.storeHoliday.findUnique({
      where: {
        id: Number(id),
      },
    })

    if (!holiday) {
      return res.status(404).json({
        message: 'Holiday not found',
      })
    }

    await prisma.storeHoliday.delete({
      where: {
        id: Number(id),
      },
    })

    res.json({
      message: 'Delete holiday success',
    })
  } catch (error) {
    next(error)
  }
}