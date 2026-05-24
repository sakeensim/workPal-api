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

  const maxDayOffPerMonth = Number(
    employee.position.maxDayOffPerMonth || 0
  )

  const currentRemaining = Number(
    employee.remainingDayOffs || 0
  )

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
    const { date, title } = req.body

    if (!date) {
      return res.status(400).json({
        message: 'Holiday date is required',
      })
    }

    const { start, end } = getBangkokDayRange(date)

    const existingHoliday =
      await prisma.storeHoliday.findFirst({
        where: {
          date: {
            gte: start,
            lte: end,
          },
        },
      })

    if (existingHoliday) {
      return res.status(400).json({
        message: 'วันนี้ถูกตั้งเป็นวันหยุดร้านแล้ว',
      })
    }

    const result = await prisma.$transaction(
      async (tx) => {
        const holiday =
          await tx.storeHoliday.create({
            data: {
              date: start,
              title: title || null,
            },
          })

        const affectedDayOffs =
          await tx.dayOff.findMany({
            where: {
              date: {
                gte: start,
                lte: end,
              },

              status: {
                in: ['PENDING', 'APPROVED'],
              },
            },
          })

        for (const dayOff of affectedDayOffs) {
          if (dayOff.status === 'APPROVED') {
            await refundDayOffIfNeeded(
              tx,
              dayOff.employeesId
            )
          }
        }

        if (affectedDayOffs.length > 0) {
          await tx.dayOff.updateMany({
            where: {
              id: {
                in: affectedDayOffs.map(
                  (item) => item.id
                ),
              },
            },

            data: {
              status: 'CANCELED',
            },
          })
        }

        return {
          holiday,
          canceledDayOffCount:
            affectedDayOffs.length,
        }
      }
    )

    res.json({
      message: 'Create holiday success',
      data: result.holiday,
      canceledDayOffCount:
        result.canceledDayOffCount,
    })
  } catch (error) {
    next(error)
  }
}

exports.getHolidays = async (
  req,
  res,
  next
) => {
  try {
    const holidays =
      await prisma.storeHoliday.findMany({
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

exports.deleteHoliday = async (
  req,
  res,
  next
) => {
  try {
    const { id } = req.params

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