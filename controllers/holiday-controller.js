const prisma = require('../configs/prisma')
const { createNotification } = require('../services/notification-service')

const getBangkokDayRange = (date = new Date()) => {
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

const getBangkokMonthRange = (date = new Date()) => {
  const target = new Date(date)

  const bangkokMonth = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
  }).format(target)

  const [year, month] = bangkokMonth.split('-').map(Number)
  const lastDay = new Date(year, month, 0).getDate()

  return {
    start: new Date(
      `${year}-${String(month).padStart(2, '0')}-01T00:00:00.000+07:00`
    ),
    end: new Date(
      `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(
        2,
        '0'
      )}T23:59:59.999+07:00`
    ),
  }
}

const getBangkokMonthKey = (date = new Date()) => {
  const target = new Date(date)

  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
  }).format(target)
}

const isSameBangkokMonth = (dateA, dateB) => {
  return getBangkokMonthKey(dateA) === getBangkokMonthKey(dateB)
}

const isAdminOrOwner = (user) => {
  return user?.role === 'ADMIN' || user?.role === 'OWNER'
}

const getId = (id) => {
  const parsed = Number(id)

  if (!parsed || Number.isNaN(parsed)) return null

  return parsed
}

const getActiveBranchWhere = () => ({
  isActive: true,
  isDeleted: false,
})

const getActiveEmployeeWhere = () => ({
  isActive: true,
  isDeleted: false,
})

const getActiveHolidayWhere = () => ({
  isDeleted: false,
})

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

const refundDayOffIfNeeded = async (tx, dayOff) => {
  if (!dayOff?.employeesId) {
    return {
      refunded: false,
      reason: 'NO_EMPLOYEE_ID',
    }
  }

  if (dayOff.status !== 'APPROVED') {
    return {
      refunded: false,
      reason: 'NOT_APPROVED',
    }
  }

  const employee = await tx.employees.findFirst({
    where: {
      id: Number(dayOff.employeesId),
      ...getActiveEmployeeWhere(),
    },
    include: {
      position: true,
    },
  })

  if (!employee?.position) {
    return {
      refunded: false,
      reason: 'NO_ACTIVE_POSITION',
    }
  }

  const maxDayOffPerMonth = Number(employee.position.maxDayOffPerMonth || 0)
  const isCurrentMonth = isSameBangkokMonth(dayOff.date, new Date())

  // เดือนปัจจุบัน:
  // ไม่ต้องเช็ก maxDayOffPerMonth
  // ถ้าเป็น APPROVED แล้วถูกยกเลิกเพราะตั้งวันหยุด ให้คืน remainingDayOffs +1 ทันที
  if (isCurrentMonth) {
    await tx.employees.update({
      where: {
        id: Number(dayOff.employeesId),
      },
      data: {
        remainingDayOffs: {
          increment: 1,
        },
      },
    })

    return {
      refunded: true,
      reason: 'CURRENT_MONTH_DIRECT_REFUND',
      employeesId: employee.id,
      isCurrentMonth,
      maxDayOffPerMonth,
    }
  }

  // เดือนอื่น:
  // เช็กจำนวนวันลา APPROVED ในเดือนของวันลานั้น
  // ถ้าไม่เกิน maxDayOffPerMonth ไม่ต้องคืน
  // ถ้าเกิน maxDayOffPerMonth ให้คืน remainingDayOffs +1
  if (maxDayOffPerMonth <= 0) {
    return {
      refunded: false,
      reason: 'NO_MAX_DAY_OFF_PER_MONTH',
      employeesId: employee.id,
      isCurrentMonth,
      maxDayOffPerMonth,
      approvedDayOffsInMonth: 0,
    }
  }

  const { start: monthStart, end: monthEnd } = getBangkokMonthRange(dayOff.date)

  const approvedDayOffsInMonth = await tx.dayOff.count({
    where: {
      employeesId: Number(dayOff.employeesId),
      status: 'APPROVED',
      date: {
        gte: monthStart,
        lte: monthEnd,
      },
      employees: {
        is: {
          ...getActiveEmployeeWhere(),
          branch: {
            is: getActiveBranchWhere(),
          },
        },
      },
    },
  })

  if (approvedDayOffsInMonth <= maxDayOffPerMonth) {
    return {
      refunded: false,
      reason: 'REQUEST_MONTH_QUOTA_NOT_EXCEEDED',
      employeesId: employee.id,
      isCurrentMonth,
      maxDayOffPerMonth,
      approvedDayOffsInMonth,
    }
  }

  await tx.employees.update({
    where: {
      id: Number(dayOff.employeesId),
    },
    data: {
      remainingDayOffs: {
        increment: 1,
      },
    },
  })

  return {
    refunded: true,
    reason: 'REQUEST_MONTH_EXCEEDED_MONTHLY_QUOTA',
    employeesId: employee.id,
    isCurrentMonth,
    maxDayOffPerMonth,
    approvedDayOffsInMonth,
  }
}

exports.createHoliday = async (req, res, next) => {
  try {
    if (!isAdminOrOwner(req.user)) {
      return res.status(403).json({
        message: 'Not authorized',
      })
    }

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

    const branch = await prisma.branch.findFirst({
      where: {
        id: holidayBranchId,
        ...getActiveBranchWhere(),
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
        ...getActiveHolidayWhere(),
        branchId: holidayBranchId,
        date: {
          gte: start,
          lte: end,
        },
        branch: {
          is: getActiveBranchWhere(),
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
          isDeleted: false,
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
              ...getActiveEmployeeWhere(),
            },
          },
        },
      })

      const refundResults = []

      for (const dayOff of affectedDayOffs) {
        const refundResult = await refundDayOffIfNeeded(tx, dayOff)

        refundResults.push({
          dayOffId: dayOff.id,
          ...refundResult,
        })
      }

      const refundedDayOffCount = refundResults.filter(
        (item) => item.refunded
      ).length

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

      await createAudit(tx, req, {
        action: 'SET_STORE_HOLIDAY',
        entity: 'StoreHoliday',
        entityId: holiday.id,
        branchId: holiday.branchId,
        newValue: {
          id: holiday.id,
          date: holiday.date,
          title: holiday.title,
          branchId: holiday.branchId,
          isDeleted: holiday.isDeleted,
          canceledDayOffCount: affectedDayOffs.length,
          refundedDayOffCount,
          refundResults,
        },
        note: `Create store holiday ${holiday.title || ''}`,
      })

      return {
        holiday,
        canceledDayOffCount: affectedDayOffs.length,
        refundedDayOffCount,
        refundResults,
      }
    })

    await safeCreateNotification({
      type: 'HOLIDAY_CREATED',
      title: 'มีวันหยุดร้าน',
      message: result.holiday.title || 'มีการกำหนดวันหยุดของสาขา',
      link: '/calendar/user',
      entity: 'StoreHoliday',
      entityId: result.holiday.id,
      targetType: 'BRANCH',
      branchId: result.holiday.branchId,
      createdById: req.user.id,
    })

    res.json({
      message: 'Create holiday success',
      data: result.holiday,
      canceledDayOffCount: result.canceledDayOffCount,
      refundedDayOffCount: result.refundedDayOffCount,
      refundResults: result.refundResults,
    })
  } catch (error) {
    next(error)
  }
}

exports.getHolidays = async (req, res, next) => {
  try {
    const { branchId } = req.query

    const where = {
      ...getActiveHolidayWhere(),
      branch: {
        is: getActiveBranchWhere(),
      },
    }

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

exports.updateHoliday = async (req, res, next) => {
  try {
    if (!isAdminOrOwner(req.user)) {
      return res.status(403).json({
        message: 'Not authorized',
      })
    }

    const holidayId = getId(req.params.id)
    const { date, title, branchId } = req.body

    if (!holidayId) {
      return res.status(400).json({
        message: 'Invalid holiday id',
      })
    }

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

    const oldHoliday = await prisma.storeHoliday.findFirst({
      where: {
        id: holidayId,
        ...getActiveHolidayWhere(),
      },
      include: {
        branch: true,
      },
    })

    if (!oldHoliday) {
      return res.status(404).json({
        message: 'Holiday not found',
      })
    }

    if (oldHoliday.branch?.isDeleted || oldHoliday.branch?.isActive === false) {
      return res.status(404).json({
        message: 'Branch not found',
      })
    }

    const branch = await prisma.branch.findFirst({
      where: {
        id: holidayBranchId,
        ...getActiveBranchWhere(),
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
        ...getActiveHolidayWhere(),
        id: {
          not: holidayId,
        },
        branchId: holidayBranchId,
        date: {
          gte: start,
          lte: end,
        },
        branch: {
          is: getActiveBranchWhere(),
        },
      },
    })

    if (existingHoliday) {
      return res.status(400).json({
        message: 'วันนี้ถูกตั้งเป็นวันหยุดของสาขานี้แล้ว',
      })
    }

    const result = await prisma.$transaction(async (tx) => {
      const holiday = await tx.storeHoliday.update({
        where: {
          id: holidayId,
        },
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
              ...getActiveEmployeeWhere(),
            },
          },
        },
      })

      const refundResults = []

      for (const dayOff of affectedDayOffs) {
        const refundResult = await refundDayOffIfNeeded(tx, dayOff)

        refundResults.push({
          dayOffId: dayOff.id,
          ...refundResult,
        })
      }

      const refundedDayOffCount = refundResults.filter(
        (item) => item.refunded
      ).length

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

      await createAudit(tx, req, {
        action: 'SET_STORE_HOLIDAY',
        entity: 'StoreHoliday',
        entityId: holiday.id,
        branchId: holiday.branchId,
        oldValue: {
          id: oldHoliday.id,
          date: oldHoliday.date,
          title: oldHoliday.title,
          branchId: oldHoliday.branchId,
          isDeleted: oldHoliday.isDeleted,
        },
        newValue: {
          id: holiday.id,
          date: holiday.date,
          title: holiday.title,
          branchId: holiday.branchId,
          isDeleted: holiday.isDeleted,
          canceledDayOffCount: affectedDayOffs.length,
          refundedDayOffCount,
          refundResults,
        },
        note: `Update store holiday ${holiday.title || ''}`,
      })

      return {
        holiday,
        canceledDayOffCount: affectedDayOffs.length,
        refundedDayOffCount,
        refundResults,
      }
    })

    await safeCreateNotification({
      type: 'SYSTEM',
      title: 'มีการแก้ไขวันหยุดร้าน',
      message: result.holiday.title || 'มีการแก้ไขวันหยุดของสาขา',
      link: '/calendar/user',
      entity: 'StoreHoliday',
      entityId: result.holiday.id,
      targetType: 'BRANCH',
      branchId: result.holiday.branchId,
      createdById: req.user.id,
    })

    res.json({
      message: 'Update holiday success',
      data: result.holiday,
      canceledDayOffCount: result.canceledDayOffCount,
      refundedDayOffCount: result.refundedDayOffCount,
      refundResults: result.refundResults,
    })
  } catch (error) {
    next(error)
  }
}

exports.deleteHoliday = async (req, res, next) => {
  try {
    if (!isAdminOrOwner(req.user)) {
      return res.status(403).json({
        message: 'Not authorized',
      })
    }

    const holidayId = getId(req.params.id)

    if (!holidayId) {
      return res.status(400).json({
        message: 'Invalid holiday id',
      })
    }

    const holiday = await prisma.storeHoliday.findFirst({
      where: {
        id: holidayId,
        ...getActiveHolidayWhere(),
      },
      include: {
        branch: true,
      },
    })

    if (!holiday) {
      return res.status(404).json({
        message: 'Holiday not found',
      })
    }

    const deletedAt = new Date()

    const result = await prisma.$transaction(async (tx) => {
      await createAudit(tx, req, {
        action: 'DELETE_STORE_HOLIDAY',
        entity: 'StoreHoliday',
        entityId: holiday.id,
        branchId: holiday.branchId,
        oldValue: {
          id: holiday.id,
          date: holiday.date,
          title: holiday.title,
          branchId: holiday.branchId,
          branchName: holiday.branch?.name || null,
          isDeleted: holiday.isDeleted,
        },
        newValue: {
          isDeleted: true,
          deletedAt,
          deletedById: req.user.id,
          deletedReason: 'Deleted by admin',
        },
        note: `Soft delete store holiday ${holiday.title || ''}`,
      })

      const deletedHoliday = await tx.storeHoliday.update({
        where: {
          id: holidayId,
        },
        data: {
          isDeleted: true,
          deletedAt,
          deletedById: req.user.id,
          deletedReason: 'Deleted by admin',
        },
      })

      return deletedHoliday
    })

    await safeCreateNotification({
      type: 'SYSTEM',
      title: 'ยกเลิกวันหยุดสาขา',
      message: holiday.title || 'ยกเลิกวันหยุดของสาขา',
      link: '/calendar/user',
      entity: 'StoreHoliday',
      entityId: holiday.id,
      targetType: 'BRANCH',
      branchId: holiday.branchId,
      createdById: req.user.id,
    })

    res.json({
      message: 'Delete holiday success',
      data: result,
    })
  } catch (error) {
    next(error)
  }
}