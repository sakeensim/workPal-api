const prisma = require('../configs/prisma')

const getMonthRange = (year, month) => {
  const start = new Date(
    `${year}-${String(month).padStart(2, '0')}-01T00:00:00.000+07:00`
  )

  const lastDay = new Date(year, month, 0).getDate()

  const end = new Date(
    `${year}-${String(month).padStart(2, '0')}-${String(
      lastDay
    ).padStart(2, '0')}T23:59:59.999+07:00`
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

    if (!employee.branchId) {
      return res.json({
        data: [],
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

    const notes = await prisma.calendarNote.findMany({
      where: {
        branchId: employee.branchId,
        date: {
          gte: start,
          lte: end,
        },
      },
      include: {
        branch: true,
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
      employeeName: item.employees
        ? `${item.employees.firstname} ${item.employees.lastname}`
        : '-',
      branchId: item.employees?.branchId || null,
    }))

    const noteEvents = notes.map((item) => ({
      id: item.id,
      type: 'note',
      title: item.title,
      note: item.note,
      date: item.date,
      branchId: item.branchId,
      branchName: item.branch?.name || '-',
      color: 'green',
    }))

    res.json({
      data: [...holidayEvents, ...dayOffEvents, ...noteEvents],
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

    const noteWhere = {
      date: {
        gte: start,
        lte: end,
      },
    }

    if (branchId && branchId !== 'all') {
      holidayWhere.branchId = Number(branchId)
      noteWhere.branchId = Number(branchId)

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

    const notes = await prisma.calendarNote.findMany({
      where: noteWhere,
      include: {
        branch: true,
      },
      orderBy: {
        date: 'asc',
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
      employeeName: item.employees
        ? `${item.employees.firstname} ${item.employees.lastname}`
        : '-',
      branchId: item.employees?.branchId || null,
      branchName: item.employees?.branch?.name || '-',
    }))

    const noteEvents = notes.map((item) => ({
      id: item.id,
      type: 'note',
      title: item.title,
      note: item.note,
      date: item.date,
      branchId: item.branchId,
      branchName: item.branch?.name || '-',
      color: 'green',
    }))

    res.json({
      data: [...holidayEvents, ...dayOffEvents, ...noteEvents],
    })
  } catch (error) {
    next(error)
  }
}

exports.createCalendarNote = async (req, res, next) => {
  try {
    const { date, title, note, branchId } = req.body

    if (!date || !title || !branchId) {
      return res.status(400).json({
        message: 'Date, title and branch are required',
      })
    }

    const branch = await prisma.branch.findUnique({
      where: {
        id: Number(branchId),
      },
    })

    if (!branch) {
      return res.status(404).json({
        message: 'Branch not found',
      })
    }

    const result = await prisma.calendarNote.create({
      data: {
        date: new Date(date),
        title,
        note: note || null,
        branchId: Number(branchId),
      },
      include: {
        branch: true,
      },
    })

    res.json({
      message: 'Create calendar note success',
      result,
    })
  } catch (error) {
    next(error)
  }
}

exports.updateCalendarNote = async (req, res, next) => {
  try {
    const { id } = req.params
    const { date, title, note, branchId } = req.body

    const oldNote = await prisma.calendarNote.findUnique({
      where: {
        id: Number(id),
      },
    })

    if (!oldNote) {
      return res.status(404).json({
        message: 'Calendar note not found',
      })
    }

    if (branchId) {
      const branch = await prisma.branch.findUnique({
        where: {
          id: Number(branchId),
        },
      })

      if (!branch) {
        return res.status(404).json({
          message: 'Branch not found',
        })
      }
    }

    const result = await prisma.calendarNote.update({
      where: {
        id: Number(id),
      },
      data: {
        date: date ? new Date(date) : undefined,
        title: title !== undefined ? title : undefined,
        note: note !== undefined ? note : undefined,
        branchId: branchId ? Number(branchId) : undefined,
      },
      include: {
        branch: true,
      },
    })

    res.json({
      message: 'Update calendar note success',
      result,
    })
  } catch (error) {
    next(error)
  }
}

exports.deleteCalendarNote = async (req, res, next) => {
  try {
    const { id } = req.params

    const oldNote = await prisma.calendarNote.findUnique({
      where: {
        id: Number(id),
      },
    })

    if (!oldNote) {
      return res.status(404).json({
        message: 'Calendar note not found',
      })
    }

    await prisma.calendarNote.delete({
      where: {
        id: Number(id),
      },
    })

    res.json({
      message: 'Delete calendar note success',
    })
  } catch (error) {
    next(error)
  }
}