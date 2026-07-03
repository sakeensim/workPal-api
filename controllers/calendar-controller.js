const prisma = require('../configs/prisma')
const { createNotification } = require('../services/notification-service')

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

const isAdminOrOwner = (user) => {
  return user?.role === 'ADMIN' || user?.role === 'OWNER'
}

const getActiveEmployeeWhere = () => ({
  isActive: true,
  isDeleted: false,
})

const getActiveBranchWhere = () => ({
  isActive: true,
  isDeleted: false,
})

const getActiveCalendarNoteWhere = () => ({
  isDeleted: false,
})

const getActiveStoreHolidayWhere = () => ({
  isDeleted: false,
})

const getId = (id) => {
  const parsed = Number(id)

  if (!parsed || Number.isNaN(parsed)) return null

  return parsed
}

const createAudit = async (tx, req, data) => {
  return tx.auditLog.create({
    data: {
      actorId: req.user.id,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      ...data,
    },
  })
}

const safeCreateNotification = async (payload) => {
  try {
    await createNotification(payload)
  } catch (error) {
    console.error('Error creating notification:', error)
  }
}

exports.getUserCalendar = async (req, res, next) => {
  try {
    const userId = req.user.id
    const { year, month } = req.query

    const currentDate = new Date()
    const calendarYear = Number(year) || currentDate.getFullYear()
    const calendarMonth = Number(month) || currentDate.getMonth() + 1

    const { start, end } = getMonthRange(calendarYear, calendarMonth)

    const employee = await prisma.employees.findFirst({
      where: {
        id: Number(userId),
        ...getActiveEmployeeWhere(),
      },
      select: {
        id: true,
        branchId: true,
        branch: true,
      },
    })

    if (!employee) {
      return res.status(404).json({
        message: 'Employee not found',
      })
    }

    if (
      !employee.branchId ||
      !employee.branch ||
      employee.branch.isDeleted ||
      !employee.branch.isActive
    ) {
      return res.json({
        data: [],
      })
    }

    const holidays = await prisma.storeHoliday.findMany({
      where: {
        ...getActiveStoreHolidayWhere(),
        branchId: employee.branchId,
        date: {
          gte: start,
          lte: end,
        },
        branch: {
          is: getActiveBranchWhere(),
        },
      },
    })

    const dayOffs = await prisma.dayOff.findMany({
      where: {
        status: 'APPROVED',
        date: {
          gte: start,
          lte: end,
        },
        employees: {
          is: {
            branchId: employee.branchId,
            ...getActiveEmployeeWhere(),
          },
        },
      },
      include: {
        employees: true,
      },
    })

    const notes = await prisma.calendarNote.findMany({
      where: {
        ...getActiveCalendarNoteWhere(),
        branchId: employee.branchId,
        date: {
          gte: start,
          lte: end,
        },
        branch: {
          is: getActiveBranchWhere(),
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
    if (!isAdminOrOwner(req.user)) {
      return res.status(403).json({
        message: 'Not authorized',
      })
    }

    const { branchId, year, month } = req.query

    const currentDate = new Date()
    const calendarYear = Number(year) || currentDate.getFullYear()
    const calendarMonth = Number(month) || currentDate.getMonth() + 1

    const { start, end } = getMonthRange(calendarYear, calendarMonth)

    const holidayWhere = {
      ...getActiveStoreHolidayWhere(),
      date: {
        gte: start,
        lte: end,
      },
      branch: {
        is: getActiveBranchWhere(),
      },
    }

    const dayOffWhere = {
      status: 'APPROVED',
      date: {
        gte: start,
        lte: end,
      },
      employees: {
        is: getActiveEmployeeWhere(),
      },
    }

    const noteWhere = {
      ...getActiveCalendarNoteWhere(),
      date: {
        gte: start,
        lte: end,
      },
      branch: {
        is: getActiveBranchWhere(),
      },
    }

    if (branchId && branchId !== 'all') {
      holidayWhere.branchId = Number(branchId)
      noteWhere.branchId = Number(branchId)
      dayOffWhere.employees.is.branchId = Number(branchId)
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

    if (!date || !title) {
      return res.status(400).json({
        message: 'Date and title are required',
      })
    }

    const employee = await prisma.employees.findFirst({
      where: {
        id: Number(req.user.id),
        ...getActiveEmployeeWhere(),
      },
      select: {
        id: true,
        role: true,
        branchId: true,
      },
    })

    if (!employee) {
      return res.status(404).json({
        message: 'Employee not found',
      })
    }

    let targetBranchId = null

    if (isAdminOrOwner(employee)) {
      if (!branchId) {
        return res.status(400).json({
          message: 'Branch is required',
        })
      }

      targetBranchId = Number(branchId)
    } else {
      if (!employee.branchId) {
        return res.status(400).json({
          message: 'พนักงานยังไม่ได้ถูกกำหนดสาขา',
        })
      }

      targetBranchId = Number(employee.branchId)
    }

    const branch = await prisma.branch.findFirst({
      where: {
        id: targetBranchId,
        ...getActiveBranchWhere(),
      },
    })

    if (!branch) {
      return res.status(404).json({
        message: 'Branch not found',
      })
    }

    const result = await prisma.$transaction(async (tx) => {
      const createdNote = await tx.calendarNote.create({
        data: {
          date: new Date(date),
          title,
          note: note || null,
          branchId: targetBranchId,
          isDeleted: false,
        },
        include: {
          branch: true,
        },
      })

      await createAudit(tx, req, {
        action: 'ADD_CALENDAR_NOTE',
        entity: 'CalendarNote',
        entityId: createdNote.id,
        branchId: targetBranchId,
        newValue: {
          id: createdNote.id,
          date: createdNote.date,
          title: createdNote.title,
          note: createdNote.note,
          branchId: createdNote.branchId,
          isDeleted: createdNote.isDeleted,
        },
        note: `Create calendar note ${createdNote.title}`,
      })

      return createdNote
    })

    await safeCreateNotification({
      type: 'CALENDAR_NOTE_CREATED',
      title: 'มีโน้ตใหม่ในปฏิทิน',
      message: note || title,
      link: '/calendar/user',
      entity: 'CalendarNote',
      entityId: result.id,
      targetType: 'BRANCH',
      branchId: targetBranchId,
      createdById: req.user.id,
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
    const noteId = getId(req.params.id)
    const { date, title, note, branchId } = req.body

    if (!noteId) {
      return res.status(400).json({
        message: 'Invalid calendar note id',
      })
    }

    const employee = await prisma.employees.findFirst({
      where: {
        id: Number(req.user.id),
        ...getActiveEmployeeWhere(),
      },
      select: {
        id: true,
        role: true,
        branchId: true,
      },
    })

    if (!employee) {
      return res.status(404).json({
        message: 'Employee not found',
      })
    }

    const oldNote = await prisma.calendarNote.findFirst({
      where: {
        id: noteId,
        ...getActiveCalendarNoteWhere(),
      },
      include: {
        branch: true,
      },
    })

    if (!oldNote) {
      return res.status(404).json({
        message: 'Calendar note not found',
      })
    }

    if (!isAdminOrOwner(employee) && oldNote.branchId !== employee.branchId) {
      return res.status(403).json({
        message: 'Not authorized',
      })
    }

    if (oldNote.branch?.isDeleted || oldNote.branch?.isActive === false) {
      return res.status(404).json({
        message: 'Branch not found',
      })
    }

    let targetBranchId = oldNote.branchId

    if (branchId) {
      if (!isAdminOrOwner(employee)) {
        return res.status(403).json({
          message: 'Only admin can change branch',
        })
      }

      targetBranchId = Number(branchId)

      const branch = await prisma.branch.findFirst({
        where: {
          id: targetBranchId,
          ...getActiveBranchWhere(),
        },
      })

      if (!branch) {
        return res.status(404).json({
          message: 'Branch not found',
        })
      }
    }

    const result = await prisma.$transaction(async (tx) => {
      const updatedNote = await tx.calendarNote.update({
        where: {
          id: noteId,
        },
        data: {
          date: date ? new Date(date) : undefined,
          title: title !== undefined ? title : undefined,
          note: note !== undefined ? note : undefined,
          branchId: targetBranchId,
        },
        include: {
          branch: true,
        },
      })

      await createAudit(tx, req, {
        action: 'UPDATE_CALENDAR_NOTE',
        entity: 'CalendarNote',
        entityId: updatedNote.id,
        branchId: updatedNote.branchId,
        oldValue: {
          id: oldNote.id,
          date: oldNote.date,
          title: oldNote.title,
          note: oldNote.note,
          branchId: oldNote.branchId,
          isDeleted: oldNote.isDeleted,
        },
        newValue: {
          id: updatedNote.id,
          date: updatedNote.date,
          title: updatedNote.title,
          note: updatedNote.note,
          branchId: updatedNote.branchId,
          isDeleted: updatedNote.isDeleted,
        },
        note: `Update calendar note ${updatedNote.title}`,
      })

      return updatedNote
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
    const noteId = getId(req.params.id)

    if (!noteId) {
      return res.status(400).json({
        message: 'Invalid calendar note id',
      })
    }

    const employee = await prisma.employees.findFirst({
      where: {
        id: Number(req.user.id),
        ...getActiveEmployeeWhere(),
      },
      select: {
        id: true,
        role: true,
        branchId: true,
      },
    })

    if (!employee) {
      return res.status(404).json({
        message: 'Employee not found',
      })
    }

    if (!isAdminOrOwner(employee)) {
      return res.status(403).json({
        message: 'Not authorized',
      })
    }

    const oldNote = await prisma.calendarNote.findFirst({
      where: {
        id: noteId,
        ...getActiveCalendarNoteWhere(),
      },
      include: {
        branch: true,
      },
    })

    if (!oldNote) {
      return res.status(404).json({
        message: 'Calendar note not found',
      })
    }

    if (oldNote.branch?.isDeleted || oldNote.branch?.isActive === false) {
      return res.status(404).json({
        message: 'Branch not found',
      })
    }

    const deletedAt = new Date()

    const result = await prisma.$transaction(async (tx) => {
      await createAudit(tx, req, {
        action: 'DELETE_CALENDAR_NOTE',
        entity: 'CalendarNote',
        entityId: oldNote.id,
        branchId: oldNote.branchId,
        oldValue: {
          id: oldNote.id,
          date: oldNote.date,
          title: oldNote.title,
          note: oldNote.note,
          branchId: oldNote.branchId,
          isDeleted: oldNote.isDeleted,
        },
        newValue: {
          isDeleted: true,
          deletedAt,
          deletedById: req.user.id,
          deletedReason: 'Deleted by admin',
        },
        note: `Soft delete calendar note ${oldNote.title}`,
      })

      const deletedNote = await tx.calendarNote.update({
        where: {
          id: noteId,
        },
        data: {
          isDeleted: true,
          deletedAt,
          deletedById: req.user.id,
          deletedReason: 'Deleted by admin',
        },
      })

      return deletedNote
    })

    await safeCreateNotification({
      type: 'CALENDAR_NOTE_DELETED',
      title: 'Note ในปฏิทินถูกยกเลิก',
      message: oldNote.title
        ? `Note "${oldNote.title}" ถูกยกเลิกแล้ว`
        : 'ยกเลิก Note ในปฏิทินของสาขา',
      link: '/calendar/user',
      entity: 'CalendarNote',
      entityId: oldNote.id,
      targetType: 'BRANCH',
      branchId: oldNote.branchId,
      createdById: req.user.id,
    })

    res.json({
      message: 'Delete calendar note success',
      data: result,
    })
  } catch (error) {
    next(error)
  }
}