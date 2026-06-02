const prisma = require('../configs/prisma')

const getMonthRange = (year, month) => {
  const start = new Date(
    `${year}-${String(month).padStart(2, '0')}-01T00:00:00.000+07:00`
  )

  const end = new Date(
    `${year}-${String(month).padStart(2, '0')}-31T23:59:59.999+07:00`
  )

  return { start, end }
}

exports.getUserCalendar = async (req, res, next) => {
  try {
    const userId = req.user.id
    const { year, month } = req.query

    const currentDate = new Date()
    const calendarYear = Number(year) || currentDate.getFullYear()
    const calendarMonth = Number(month) || currentDate.getMonth() + 1

    const { start, end } = getMonthRange(calendarYear, calendarMonth)

    const employee = await prisma.employees.findUnique({
      where: { id: Number(userId) },
      select: {
        id: true,
        branchId: true,
      },
    })

    if (!employee) {
      return res.status(404).json({
        message: 'Employee not found',
      })
    }

    const holidays = await prisma.storeHoliday.findMany({
      where: {
        branchId: employee.branchId,
        date: {
          gte: start,
          lte: end,
        },
      },
    })

    const dayOffs = await prisma.dayOff.findMany({
      where: {
        employeesId: Number(userId),
        status: 'APPROVED',
        date: {
          gte: start,
          lte: end,
        },
      },
      include: {
        employees: true,
      },
    })

    const holidayEvents = holidays.map((item) => ({
      id: item.id,
      type: 'holiday',
      title: item.title || 'Store Holiday',
      date: item.date,
      branchId: item.branchId,
    }))

    const dayOffEvents = dayOffs.map((item) => ({
      id: item.id,
      type: 'dayoff',
      title: item.reason || 'Day Off',
      date: item.date,
      employeeId: item.employeesId,
      employeeName: `${item.employees.firstname} ${item.employees.lastname}`,
      branchId: item.employees.branchId,
    }))

    res.json({
      data: [...holidayEvents, ...dayOffEvents],
    })
  } catch (error) {
    next(error)
  }
}

exports.getAdminCalendar = async (req, res, next) => {
  try {
    const { branchId, year, month } = req.query

    const currentDate = new Date()
    const calendarYear = Number(year) || currentDate.getFullYear()
    const calendarMonth = Number(month) || currentDate.getMonth() + 1

    const { start, end } = getMonthRange(calendarYear, calendarMonth)

    const holidayWhere = {
      date: {
        gte: start,
        lte: end,
      },
    }

    const dayOffWhere = {
      status: 'APPROVED',
      date: {
        gte: start,
        lte: end,
      },
    }

    if (branchId && branchId !== 'all') {
      holidayWhere.branchId = Number(branchId)

      dayOffWhere.employees = {
        is: {
          branchId: Number(branchId),
        },
      }
    }

    const holidays = await prisma.storeHoliday.findMany({
      where: holidayWhere,
      include: {
        branch: true,
      },
    })

    const dayOffs = await prisma.dayOff.findMany({
      where: dayOffWhere,
      include: {
        employees: {
          include: {
            branch: true,
          },
        },
      },
    })

    const holidayEvents = holidays.map((item) => ({
      id: item.id,
      type: 'holiday',
      title: item.title || 'Store Holiday',
      date: item.date,
      branchId: item.branchId,
      branchName: item.branch?.name || '-',
    }))

    const dayOffEvents = dayOffs.map((item) => ({
      id: item.id,
      type: 'dayoff',
      title: item.reason || 'Day Off',
      date: item.date,
      employeeId: item.employeesId,
      employeeName: `${item.employees.firstname} ${item.employees.lastname}`,
      branchId: item.employees.branchId,
      branchName: item.employees.branch?.name || '-',
    }))

    res.json({
      data: [...holidayEvents, ...dayOffEvents],
    })
  } catch (error) {
    next(error)
  }
}