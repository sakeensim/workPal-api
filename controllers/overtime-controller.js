const prisma = require('../configs/prisma')

const BANGKOK_TIMEZONE = 'Asia/Bangkok'

const getBangkokDateString = (date = new Date()) => {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: BANGKOK_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

const getBangkokDayStart = (date = new Date()) => {
  const bangkokDate = getBangkokDateString(date)

  return new Date(`${bangkokDate}T00:00:00.000+07:00`)
}

const getBangkokMonthRange = (year, month) => {
  const start = new Date(
    `${year}-${String(month).padStart(2, '0')}-01T00:00:00.000+07:00`
  )

  const lastDay = new Date(Number(year), Number(month), 0).getDate()

  const end = new Date(
    `${year}-${String(month).padStart(2, '0')}-${String(
      lastDay
    ).padStart(2, '0')}T23:59:59.999+07:00`
  )

  return { start, end }
}

const addMinutes = (date, minutes) => {
  const result = new Date(date)
  result.setMinutes(result.getMinutes() + Number(minutes || 0))

  return result
}

const calculateMinutes = (start, end) => {
  const diff = Math.floor((end - start) / 1000 / 60)

  return diff > 0 ? diff : 0
}

const buildBangkokDateTime = (dateString, timeString) => {
  const [hour, minute] = String(timeString).split(':').map(Number)

  return new Date(
    `${dateString}T${String(hour).padStart(2, '0')}:${String(
      minute
    ).padStart(2, '0')}:00.000+07:00`
  )
}

const isAdminOrOwner = (user) => {
  return user?.role === 'ADMIN' || user?.role === 'OWNER'
}

const getId = (id) => {
  const parsed = Number(id)

  if (!parsed || Number.isNaN(parsed)) return null

  return parsed
}

const getActiveEmployeeWhere = () => ({
  isActive: true,
  isDeleted: false,
})

const getActiveBranchWhere = () => ({
  isActive: true,
  isDeleted: false,
})

const isActiveBranch = (branch) => {
  return branch && branch.isActive === true && branch.isDeleted === false
}

const isActivePosition = (position) => {
  return position && position.isActive === true && position.isDeleted === false
}

const isPositionMatchBranch = (employee) => {
  if (!employee?.branchId) return false
  if (!employee?.positionId) return false
  if (!isActivePosition(employee.position)) return false

  return Number(employee.position.branchId) === Number(employee.branchId)
}

const hasLocation = (latitude, longitude) => {
  return (
    latitude !== undefined &&
    latitude !== null &&
    longitude !== undefined &&
    longitude !== null &&
    latitude !== '' &&
    longitude !== ''
  )
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

const getEmployeeForOvertime = async (userId) => {
  return prisma.employees.findFirst({
    where: {
      id: Number(userId),
      ...getActiveEmployeeWhere(),
    },
    include: {
      branch: true,
      position: {
        include: {
          branch: true,
        },
      },
    },
  })
}

const validateEmployeeForOvertime = (employee) => {
  if (!employee) {
    return 'Employee not found'
  }

  if (!isActiveBranch(employee.branch)) {
    return 'พนักงานยังไม่ได้ถูกกำหนดสาขา หรือสาขาถูกปิดใช้งานแล้ว'
  }

  if (!isPositionMatchBranch(employee)) {
    return 'ตำแหน่งของพนักงานไม่ตรงกับสาขา หรือถูกปิดใช้งานแล้ว'
  }

  if (!employee.position.allowOT) {
    return 'ตำแหน่งนี้ไม่สามารถทำ OT ได้'
  }

  const otCapMinutes = Number(employee.position.otCapMinutes || 0)

  if (otCapMinutes <= 0) {
    return 'ตำแหน่งนี้ยังไม่ได้กำหนด OT cap'
  }

  return null
}

const getShiftEndDateTime = (record) => {
  const checkInTime =
    record?.scheduledCheckInTime || record?.shift?.checkInTime || null

  const checkOutTime =
    record?.scheduledCheckOutTime || record?.shift?.checkOutTime || null

  if (!checkInTime || !checkOutTime) return null

  const dateKey = getBangkokDateString(record.date || record.checkIn)

  const shiftStart = buildBangkokDateTime(dateKey, checkInTime)
  const shiftEnd = buildBangkokDateTime(dateKey, checkOutTime)

  const [inHour, inMinute] = String(checkInTime).split(':').map(Number)
  const [outHour, outMinute] = String(checkOutTime).split(':').map(Number)

  const inTotal = inHour * 60 + inMinute
  const outTotal = outHour * 60 + outMinute

  if (outTotal <= inTotal) {
    shiftEnd.setDate(shiftEnd.getDate() + 1)
  }

  return {
    shiftStart,
    shiftEnd,
  }
}

const expireOldOT = async (userId) => {
  const now = new Date()

  const employee = await prisma.employees.findFirst({
    where: {
      id: Number(userId),
      ...getActiveEmployeeWhere(),
    },
    include: {
      branch: true,
      position: {
        include: {
          branch: true,
        },
      },
    },
  })

  if (!isPositionMatchBranch(employee)) return

  const otCapMinutes = Number(employee.position.otCapMinutes || 0)

  if (otCapMinutes <= 0) return

  const activeOvertimes = await prisma.overtimeTracking.findMany({
    where: {
      employeesId: Number(userId),
      status: 'ACTIVE',
      checkOut: null,
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

  for (const ot of activeOvertimes) {
    const expiredAt = addMinutes(ot.checkIn, otCapMinutes + 180)

    if (now > expiredAt) {
      await prisma.overtimeTracking.update({
        where: {
          id: ot.id,
        },
        data: {
          status: 'EXPIRED',
          otMinutes: 0,
          noteOut:
            'System expired because OT was not checked out within cap + 3 hours',
        },
      })
    }
  }
}

const getDistanceMeters = (lat1, lon1, lat2, lon2) => {
  const R = 6371000
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLon = ((lon2 - lon1) * Math.PI) / 180

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))

  return R * c
}

const validateLocation = ({ latitude, longitude, branch }) => {
  const distance = getDistanceMeters(
    Number(latitude),
    Number(longitude),
    Number(branch.lat),
    Number(branch.lng)
  )

  return {
    distance,
    isInside: distance <= Number(branch.radius || 100),
  }
}

exports.startOvertime = async (req, res, next) => {
  try {
    const userId = req.user.id
    const { latitude, longitude, noteIn } = req.body

    if (!hasLocation(latitude, longitude)) {
      return res.status(400).json({
        message: 'Location is required',
      })
    }

    await expireOldOT(userId)

    const employee = await getEmployeeForOvertime(userId)
    const employeeError = validateEmployeeForOvertime(employee)

    if (employeeError) {
      return res.status(400).json({
        message: employeeError,
      })
    }

    const otCapMinutes = Number(employee.position.otCapMinutes || 0)
    const now = new Date()

    const latestOvertime = await prisma.overtimeTracking.findFirst({
      where: {
        employeesId: Number(userId),
        status: {
          notIn: ['CANCELLED'],
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
      orderBy: {
        checkIn: 'desc',
      },
    })

    if (latestOvertime?.status === 'ACTIVE' && !latestOvertime.checkOut) {
      const activeLimitTime = addMinutes(
        latestOvertime.checkIn,
        otCapMinutes + 180
      )

      if (now <= activeLimitTime) {
        return res.status(400).json({
          message: 'คุณมี OT ที่ยังไม่ได้ check-out อยู่ กรุณา check-out OT ก่อน',
          activeLimitTime,
        })
      }

      await prisma.overtimeTracking.update({
        where: {
          id: latestOvertime.id,
        },
        data: {
          status: 'EXPIRED',
          otMinutes: 0,
          noteOut:
            'System expired because OT was not checked out within cap + 3 hours',
        },
      })
    }

    const latestWorkTime = await prisma.timeTracking.findFirst({
      where: {
        employeesId: Number(userId),
        checkIn: {
          not: null,
        },
        checkOut: null,
        status: 'ACTIVE',
        employees: {
          is: {
            ...getActiveEmployeeWhere(),
            branch: {
              is: getActiveBranchWhere(),
            },
          },
        },
      },
      include: {
        shift: {
          include: {
            position: {
              include: {
                branch: true,
              },
            },
          },
        },
      },
      orderBy: {
        checkIn: 'desc',
      },
    })

    if (latestWorkTime) {
      const shiftTime = getShiftEndDateTime(latestWorkTime)

      if (shiftTime?.shiftEnd) {
        const workExpireAt = addMinutes(shiftTime.shiftEnd, 180)

        if (now <= workExpireAt) {
          return res.status(400).json({
            message: 'กรุณา Check-out งานปกติก่อนเริ่ม OT',
            shiftCheckIn: latestWorkTime.checkIn,
            shiftEnd: shiftTime.shiftEnd,
            workExpireAt,
          })
        }

        await prisma.timeTracking.update({
          where: {
            id: latestWorkTime.id,
          },
          data: {
            status: 'EXPIRED',
          },
        })
      }
    }

    const { distance, isInside } = validateLocation({
      latitude,
      longitude,
      branch: employee.branch,
    })

    if (!isInside) {
      return res.status(403).json({
        message: `คุณอยู่นอกพื้นที่ ${employee.branch.name} ระยะห่าง ${Math.round(
          distance
        )} เมตร`,
        distance: Math.round(distance),
      })
    }

    const overtime = await prisma.overtimeTracking.create({
      data: {
        employeesId: Number(userId),
        branchId: employee.branchId,
        checkIn: now,
        date: getBangkokDayStart(now),
        noteIn: noteIn || null,
        status: 'ACTIVE',
      },
      include: {
        employees: {
          select: {
            id: true,
            firstname: true,
            lastname: true,
            email: true,
            profileImage: true,
            branchId: true,
            positionId: true,
          },
        },
        branch: true,
      },
    })

    res.json({
      message: 'Start overtime success',
      distance: Math.round(distance),
      otCapMinutes,
      data: overtime,
    })
  } catch (error) {
    next(error)
  }
}
exports.endOvertime = async (req, res, next) => {
  try {
    const userId = req.user.id
    const { latitude, longitude, noteOut } = req.body

    if (!hasLocation(latitude, longitude)) {
      return res.status(400).json({
        message: 'Location is required',
      })
    }

    await expireOldOT(userId)

    const employee = await getEmployeeForOvertime(userId)
    const employeeError = validateEmployeeForOvertime(employee)

    if (employeeError) {
      return res.status(400).json({
        message: employeeError,
      })
    }

    const otCapMinutes = Number(employee.position.otCapMinutes || 0)

    const activeOvertime = await prisma.overtimeTracking.findFirst({
      where: {
        employeesId: Number(userId),
        status: 'ACTIVE',
        checkOut: null,
        employees: {
          is: {
            ...getActiveEmployeeWhere(),
            branch: {
              is: getActiveBranchWhere(),
            },
          },
        },
        branch: {
          is: getActiveBranchWhere(),
        },
      },
      orderBy: {
        checkIn: 'desc',
      },
    })

    if (!activeOvertime) {
      return res.status(400).json({
        message: 'ไม่พบ OT ที่กำลังทำอยู่',
      })
    }

    const now = new Date()
    const endAllowedTime = addMinutes(activeOvertime.checkIn, otCapMinutes + 180)

    if (now > endAllowedTime) {
      const expiredOvertime = await prisma.overtimeTracking.update({
        where: {
          id: activeOvertime.id,
        },
        data: {
          status: 'EXPIRED',
          otMinutes: 0,
          noteOut:
            noteOut ||
            'System expired because OT was not checked out within cap + 3 hours',
        },
      })

      return res.status(400).json({
        message:
          'เลยเวลาที่สามารถจบ OT ได้ ระบบแปะ EXPIRED แล้ว กรุณาติดต่อแอดมิน',
        status: 'EXPIRED',
        endAllowedTime,
        data: expiredOvertime,
      })
    }

    const { distance, isInside } = validateLocation({
      latitude,
      longitude,
      branch: employee.branch,
    })

    if (!isInside) {
      return res.status(403).json({
        message: `คุณอยู่นอกพื้นที่ ${employee.branch.name} ระยะห่าง ${Math.round(
          distance
        )} เมตร`,
        distance: Math.round(distance),
      })
    }

    const rawOtMinutes = calculateMinutes(activeOvertime.checkIn, now)
    const otMinutes = Math.min(rawOtMinutes, otCapMinutes)

    const overtime = await prisma.overtimeTracking.update({
      where: {
        id: activeOvertime.id,
      },
      data: {
        checkOut: now,
        noteOut: noteOut || null,
        otMinutes,
        status: 'COMPLETED',
      },
      include: {
        employees: {
          select: {
            id: true,
            firstname: true,
            lastname: true,
            email: true,
            profileImage: true,
            branchId: true,
            positionId: true,
          },
        },
        branch: true,
      },
    })

    res.json({
      message: `End overtime success รวม OT ${otMinutes} นาที`,
      distance: Math.round(distance),
      otMinutes,
      rawOtMinutes,
      otCapMinutes,
      endAllowedTime,
      data: overtime,
    })
  } catch (error) {
    next(error)
  }
}

exports.getActiveOvertime = async (req, res, next) => {
  try {
    const userId = req.user.id

    const employee = await getEmployeeForOvertime(userId)

    if (!employee) {
      return res.status(403).json({
        message: 'บัญชีนี้ถูกปิดใช้งานแล้ว',
      })
    }

    await expireOldOT(userId)

    const overtime = await prisma.overtimeTracking.findFirst({
      where: {
        employeesId: Number(userId),
        status: 'ACTIVE',
        checkOut: null,
        employees: {
          is: {
            ...getActiveEmployeeWhere(),
            branch: {
              is: getActiveBranchWhere(),
            },
          },
        },
        branch: {
          is: getActiveBranchWhere(),
        },
      },
      include: {
        branch: true,
      },
      orderBy: {
        checkIn: 'desc',
      },
    })

    res.json({
      data: overtime,
    })
  } catch (error) {
    next(error)
  }
}

exports.getMyOvertimes = async (req, res, next) => {
  try {
    const userId = req.user.id
    const { month, year, status } = req.query

    const employee = await getEmployeeForOvertime(userId)

    if (!employee) {
      return res.status(403).json({
        message: 'บัญชีนี้ถูกปิดใช้งานแล้ว',
      })
    }

    const where = {
      employeesId: Number(userId),
      employees: {
        is: {
          ...getActiveEmployeeWhere(),
          branch: {
            is: getActiveBranchWhere(),
          },
        },
      },
      branch: {
        is: getActiveBranchWhere(),
      },
    }

    if (status && status !== 'all') {
      where.status = status
    }

    if (month && year) {
      const { start, end } = getBangkokMonthRange(Number(year), Number(month))

      where.date = {
        gte: start,
        lte: end,
      }
    }

    const overtimes = await prisma.overtimeTracking.findMany({
      where,
      include: {
        branch: true,
      },
      orderBy: {
        checkIn: 'desc',
      },
    })

    const totalOtMinutes = overtimes
      .filter(
        (item) => item.checkIn && item.checkOut && item.status === 'COMPLETED'
      )
      .reduce((sum, item) => sum + Number(item.otMinutes || 0), 0)

    res.json({
      data: overtimes,
      totalOtMinutes,
    })
  } catch (error) {
    next(error)
  }
}

exports.getAllOvertimes = async (req, res, next) => {
  try {
    if (!isAdminOrOwner(req.user)) {
      return res.status(403).json({
        message: 'Not authorized',
      })
    }

    const { branchId, employeeId, status, month, year } = req.query

    const where = {
      employees: {
        is: {
          ...getActiveEmployeeWhere(),
          branch: {
            is: getActiveBranchWhere(),
          },
        },
      },
      branch: {
        is: getActiveBranchWhere(),
      },
    }

    if (branchId && branchId !== 'all') {
      const selectedBranchId = Number(branchId)

      if (!selectedBranchId || Number.isNaN(selectedBranchId)) {
        return res.status(400).json({
          message: 'Invalid branch id',
        })
      }

      where.branchId = selectedBranchId
    }

    if (employeeId && employeeId !== 'all') {
      const selectedEmployeeId = Number(employeeId)

      if (!selectedEmployeeId || Number.isNaN(selectedEmployeeId)) {
        return res.status(400).json({
          message: 'Invalid employee id',
        })
      }

      where.employeesId = selectedEmployeeId
    }

    if (status && status !== 'all') {
      where.status = status
    }

    if (month && year) {
      const { start, end } = getBangkokMonthRange(Number(year), Number(month))

      where.date = {
        gte: start,
        lte: end,
      }
    }

    const overtimes = await prisma.overtimeTracking.findMany({
      where,
      include: {
        branch: true,
        employees: {
          select: {
            id: true,
            firstname: true,
            lastname: true,
            email: true,
            profileImage: true,
            branchId: true,
            positionId: true,
            position: {
              include: {
                branch: true,
              },
            },
          },
        },
      },
      orderBy: {
        checkIn: 'desc',
      },
    })

    const formattedOvertimes = overtimes.map((item) => {
      const employee = item.employees

      const validPosition =
        employee?.position &&
        employee.position.isActive &&
        !employee.position.isDeleted &&
        Number(employee.position.branchId) === Number(employee.branchId)
          ? employee.position
          : null

      return {
        ...item,
        employees: employee
          ? {
              ...employee,
              position: validPosition,
            }
          : null,
      }
    })

    const totalOtMinutes = formattedOvertimes
      .filter(
        (item) => item.checkIn && item.checkOut && item.status === 'COMPLETED'
      )
      .reduce((sum, item) => sum + Number(item.otMinutes || 0), 0)

    res.json({
      data: formattedOvertimes,
      totalOtMinutes,
    })
  } catch (error) {
    next(error)
  }
}

exports.cancelOvertime = async (req, res, next) => {
  try {
    if (!isAdminOrOwner(req.user)) {
      return res.status(403).json({
        message: 'Not authorized',
      })
    }

    const overtimeId = getId(req.params.id)
    const { reason } = req.body || {}

    if (!overtimeId) {
      return res.status(400).json({
        message: 'Invalid overtime id',
      })
    }

    const overtime = await prisma.overtimeTracking.findUnique({
      where: {
        id: overtimeId,
      },
      include: {
        branch: true,
        employees: {
          include: {
            branch: true,
            position: {
              include: {
                branch: true,
              },
            },
          },
        },
      },
    })

    if (!overtime) {
      return res.status(404).json({
        message: 'Overtime not found',
      })
    }

    if (overtime.status === 'CANCELLED') {
      return res.status(400).json({
        message: 'Overtime already cancelled',
      })
    }

    const result = await prisma.$transaction(async (tx) => {
      const updated = await tx.overtimeTracking.update({
        where: {
          id: overtimeId,
        },
        data: {
          status: 'CANCELLED',
          otMinutes: 0,
          noteOut: reason || overtime.noteOut || null,
        },
        include: {
          branch: true,
          employees: {
            select: {
              id: true,
              firstname: true,
              lastname: true,
              email: true,
              profileImage: true,
              branchId: true,
              positionId: true,
            },
          },
        },
      })

      await createAudit(tx, req, {
        action: 'MANUAL_TIME_EDIT',
        entity: 'OvertimeTracking',
        entityId: overtime.id,
        targetEmployeeId: overtime.employeesId,
        branchId: overtime.branchId,
        oldValue: {
          id: overtime.id,
          status: overtime.status,
          otMinutes: overtime.otMinutes,
          checkIn: overtime.checkIn,
          checkOut: overtime.checkOut,
          noteIn: overtime.noteIn,
          noteOut: overtime.noteOut,
          employee: overtime.employees
            ? {
                id: overtime.employees.id,
                firstname: overtime.employees.firstname,
                lastname: overtime.employees.lastname,
                email: overtime.employees.email,
                branchId: overtime.employees.branchId,
                positionId: overtime.employees.positionId,
                positionName: overtime.employees.position?.name || null,
              }
            : null,
          branch: overtime.branch
            ? {
                id: overtime.branch.id,
                name: overtime.branch.name,
                code: overtime.branch.code,
              }
            : null,
        },
        newValue: {
          status: 'CANCELLED',
          otMinutes: 0,
          reason: reason || null,
        },
        note: `Cancel overtime id ${overtime.id}`,
      })

      return updated
    })

    res.json({
      message: 'Cancel overtime success',
      data: result,
    })
  } catch (error) {
    next(error)
  }
}