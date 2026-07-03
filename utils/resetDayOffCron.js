const cron = require('node-cron')
const prisma = require('../configs/prisma')

const BANGKOK_TIMEZONE = 'Asia/Bangkok'

const getBangkokNow = () => {
  const now = new Date()

  return new Date(
    now.toLocaleString('en-US', {
      timeZone: BANGKOK_TIMEZONE,
    })
  )
}

const getBangkokMonthRange = (year, month) => {
  const monthString = String(month).padStart(2, '0')
  const lastDay = new Date(year, month, 0).getDate()
  const lastDayString = String(lastDay).padStart(2, '0')

  return {
    start: new Date(`${year}-${monthString}-01T00:00:00.000+07:00`),
    end: new Date(
      `${year}-${monthString}-${lastDayString}T23:59:59.999+07:00`
    ),
  }
}

cron.schedule(
  '0 0 1 * *',
  async () => {
    try {
      console.log('Resetting monthly day off...')

      const bangkokNow = getBangkokNow()
      const currentMonth = bangkokNow.getMonth() + 1
      const currentYear = bangkokNow.getFullYear()

      const { start: currentMonthStart, end: currentMonthEnd } =
        getBangkokMonthRange(currentYear, currentMonth)

      const employees = await prisma.employees.findMany({
        where: {
          isActive: true,
          isDeleted: false,
          positionId: {
            not: null,
          },
        },
        include: {
          position: true,
        },
      })

      const employeeIds = employees.map((employee) => employee.id)

      if (employeeIds.length === 0) {
        console.log('No employees found for monthly day off reset')
        return
      }

      const approvedDayOffGroups = await prisma.dayOff.groupBy({
        by: ['employeesId'],
        where: {
          employeesId: {
            in: employeeIds,
          },
          status: 'APPROVED',
          date: {
            gte: currentMonthStart,
            lte: currentMonthEnd,
          },
        },
        _count: {
          _all: true,
        },
      })

      const approvedDayOffMap = new Map(
        approvedDayOffGroups.map((item) => [
          item.employeesId,
          item._count._all,
        ])
      )

      await prisma.$transaction(async (tx) => {
        for (const employee of employees) {
          if (!employee.position) continue

          const maxDayOffPerMonth = Number(
            employee.position.maxDayOffPerMonth || 0
          )

          const approvedDayOffInCurrentMonth =
            approvedDayOffMap.get(employee.id) || 0

          const addDayOff = Math.max(
            maxDayOffPerMonth - approvedDayOffInCurrentMonth,
            0
          )

          await tx.employees.updateMany({
            where: {
              id: employee.id,
              NOT: {
                lastDayOffResetMonth: currentMonth,
                lastDayOffResetYear: currentYear,
              },
            },
            data: {
              remainingDayOffs: {
                increment: addDayOff,
              },
              lastDayOffResetMonth: currentMonth,
              lastDayOffResetYear: currentYear,
            },
          })
        }
      })

      console.log(
        `Monthly day off reset completed for ${currentMonth}/${currentYear}`
      )
    } catch (error) {
      console.error('Cron reset error:', error)
    }
  },
  {
    timezone: BANGKOK_TIMEZONE,
  }
)