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

const getBangkokDateString = (date = new Date()) => {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: BANGKOK_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(date))
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

const getActiveEmployeeWhere = () => ({
  isActive: true,
  isDeleted: false,
})

const getActiveBranchWhere = () => ({
  isActive: true,
  isDeleted: false,
})

const getActiveStoreHolidayWhere = () => ({
  isDeleted: false,
})

const isLastDayOfBangkokMonth = () => {
  const bangkokNow = getBangkokNow()
  const tomorrow = new Date(bangkokNow)

  tomorrow.setDate(tomorrow.getDate() + 1)

  return tomorrow.getDate() === 1
}

const createMonthlyHistorySnapshot = async ({ year, month }) => {
  const { start: monthStart, end: monthEnd } = getBangkokMonthRange(year, month)

  const employees = await prisma.employees.findMany({
    where: {
      ...getActiveEmployeeWhere(),
    },
    include: {
      branch: true,
      position: true,

      timetracking: {
        where: {
          date: {
            gte: monthStart,
            lte: monthEnd,
          },
        },
      },

      overtimeTrackings: {
        where: {
          date: {
            gte: monthStart,
            lte: monthEnd,
          },
        },
      },

      dayOff: {
        where: {
          date: {
            gte: monthStart,
            lte: monthEnd,
          },
        },
      },

      advanceSalary: {
        where: {
          requestDate: {
            gte: monthStart,
            lte: monthEnd,
          },
        },
      },
    },
  })

  if (employees.length === 0) {
    console.log('No employees found for monthly history snapshot')
    return {
      count: 0,
    }
  }

  const branchIds = [
    ...new Set(
      employees
        .map((employee) => employee.branchId)
        .filter((branchId) => branchId !== null && branchId !== undefined)
    ),
  ]

  const holidays = await prisma.storeHoliday.findMany({
    where: {
      ...getActiveStoreHolidayWhere(),
      branchId: {
        in: branchIds.length > 0 ? branchIds : [-1],
      },
      date: {
        gte: monthStart,
        lte: monthEnd,
      },
      branch: {
        is: getActiveBranchWhere(),
      },
    },
  })

  const holidayMap = new Map()

  holidays.forEach((holiday) => {
    const branchId = Number(holiday.branchId)
    const dateKey = getBangkokDateString(holiday.date)

    if (!holidayMap.has(branchId)) {
      holidayMap.set(branchId, new Set())
    }

    holidayMap.get(branchId).add(dateKey)
  })

  const lastDayOfMonth = new Date(year, month, 0).getDate()

  const results = await prisma.$transaction(async (tx) => {
    const savedSnapshots = []

    for (const employee of employees) {
      const branchHolidayKeys =
        holidayMap.get(Number(employee.branchId)) || new Set()

      const checkInDateMap = new Map()

      ;(employee.timetracking || []).forEach((record) => {
        const dateKey = getBangkokDateString(record.date || record.checkIn)

        if (!checkInDateMap.has(dateKey)) {
          checkInDateMap.set(dateKey, record)
        }
      })

      const approvedDayOffMap = new Map()

      ;(employee.dayOff || [])
        .filter((dayOff) => String(dayOff.status).toUpperCase() === 'APPROVED')
        .forEach((dayOff) => {
          const dateKey = getBangkokDateString(dayOff.date)
          approvedDayOffMap.set(dateKey, dayOff)
        })

      const employeeCreatedKey = getBangkokDateString(employee.createdAt)

      let absentDays = 0

      for (let day = 1; day <= lastDayOfMonth; day++) {
        const dateKey = `${year}-${String(month).padStart(2, '0')}-${String(
          day
        ).padStart(2, '0')}`

        if (dateKey < employeeCreatedKey) continue

        const hasCheckIn = checkInDateMap.has(dateKey)
        const hasDayOff = approvedDayOffMap.has(dateKey)
        const isHoliday = branchHolidayKeys.has(dateKey)

        if (!hasCheckIn && !hasDayOff && !isHoliday) {
          absentDays += 1
        }
      }

      const workingDays = (employee.timetracking || []).length

      const lateDays = (employee.timetracking || []).filter(
        (record) => Number(record.lateMinutes || 0) > 0
      ).length

      const totalOTMinutes = (employee.overtimeTrackings || [])
        .filter((ot) => String(ot.status).toUpperCase() === 'COMPLETED')
        .reduce((sum, ot) => sum + Number(ot.otMinutes || 0), 0)

      const dayOffUsed = (employee.dayOff || []).filter(
        (dayOff) => String(dayOff.status).toUpperCase() === 'APPROVED'
      ).length

      const advanceTaken = (employee.advanceSalary || [])
        .filter((advance) => String(advance.status).toUpperCase() === 'APPROVED')
        .reduce((sum, advance) => sum + Number(advance.amount || 0), 0)

      const baseSalary = Number(employee.baseSalary || 0)
      const salaryLeft = Math.max(baseSalary - advanceTaken, 0)

      const remainingDayOffs = employee.positionId
        ? Number(employee.remainingDayOffs || 0)
        : 0

      const snapshot = await tx.monthlyHistorySnapshot.upsert({
        where: {
          employeesId_month: {
            employeesId: employee.id,
            month: monthStart,
          },
        },
        update: {
          remainingDayOffs,
          salaryLeft,
          workingDays,
          lateDays,
          absentDays,
          totalOTMinutes,
          dayOffUsed,
          advanceTaken,
        },
        create: {
          employeesId: employee.id,
          month: monthStart,
          remainingDayOffs,
          salaryLeft,
          workingDays,
          lateDays,
          absentDays,
          totalOTMinutes,
          dayOffUsed,
          advanceTaken,
        },
      })

      savedSnapshots.push(snapshot)
    }

    return savedSnapshots
  })

  return {
    count: results.length,
  }
}

cron.schedule(
  '55 23 28-31 * *',
  async () => {
    try {
      if (!isLastDayOfBangkokMonth()) return

      const bangkokNow = getBangkokNow()
      const month = bangkokNow.getMonth() + 1
      const year = bangkokNow.getFullYear()

      console.log(`Creating monthly history snapshot for ${month}/${year}...`)

      const result = await createMonthlyHistorySnapshot({
        year,
        month,
      })

      console.log(
        `Monthly history snapshot completed for ${month}/${year}. Count: ${result.count}`
      )
    } catch (error) {
      console.error('Monthly history snapshot cron error:', error)
    }
  },
  {
    timezone: BANGKOK_TIMEZONE,
  }
)

module.exports = {
  createMonthlyHistorySnapshot,
}