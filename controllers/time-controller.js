const prisma = require("../configs/prisma")
const { createNotification } = require("../services/notification-service")

const BANGKOK_TIMEZONE = 'Asia/Bangkok'

const getBangkokDateString = (date = new Date()) => {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: BANGKOK_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

const getBangkokDayRange = (date = new Date()) => {
  const bangkokDate = getBangkokDateString(date)

  return {
    start: new Date(`${bangkokDate}T00:00:00.000+07:00`),
    end: new Date(`${bangkokDate}T23:59:59.999+07:00`),
  }
}

const getBangkokMonthRange = (date = new Date()) => {
  const bangkokDate = getBangkokDateString(date)
  const [year, month] = bangkokDate.split('-').map(Number)
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

const getBangkokYearMonth = (date = new Date()) => {
  const [year, month] = getBangkokDateString(date).split('-').map(Number)

  return { year, month }
}

const isSameBangkokMonth = (dateA, dateB) => {
  const a = getBangkokYearMonth(dateA)
  const b = getBangkokYearMonth(dateB)

  return a.year === b.year && a.month === b.month
}

const addMinutes = (date, minutes) => {
  const result = new Date(date)
  result.setMinutes(result.getMinutes() + Number(minutes || 0))

  return result
}

const buildBangkokDateTime = (dateString, timeString) => {
  const [hour, minute] = String(timeString).split(':').map(Number)

  return new Date(
    `${dateString}T${String(hour).padStart(2, '0')}:${String(minute).padStart(
      2,
      '0'
    )}:00.000+07:00`
  )
}
const markOvertimeExpiredIfNeeded = async ({
  overtime,
  employee,
  now = new Date(),
  noteOut,
}) => {
  if (!overtime) return null
  if (overtime.status === 'EXPIRED') return overtime
  if (overtime.checkOut) return overtime

  const otCapMinutes = Number(employee?.position?.otCapMinutes || 0)

  if (otCapMinutes <= 0) return overtime

  // อิงจาก overtime-controller:
  // expired = checkIn + otCapMinutes + 180 นาที
  const expiredAt = addMinutes(overtime.checkIn, otCapMinutes + 180)

  if (now <= expiredAt) {
    return {
      ...overtime,
      expiredAt,
    }
  }

  return prisma.overtimeTracking.update({
    where: {
      id: overtime.id,
    },
    data: {
      status: 'EXPIRED',
      otMinutes: 0,
      noteOut:
        noteOut ||
        overtime.noteOut ||
        'System expired because OT was not checked out within cap + 3 hours',
    },
  })
}

const getActiveEmployeeWhere = () => ({
  isActive: true,
  isDeleted: false,
})

const getActiveBranchWhere = () => ({
  isActive: true,
  isDeleted: false,
})

const getActivePositionWhere = () => ({
  isActive: true,
  isDeleted: false,
})

const getActiveShiftWhere = () => ({
  isActive: true,
  isDeleted: false,
})
const getActiveStoreHolidayWhere = () => ({
  isDeleted: false,
})
const isActiveBranch = (branch) => {
  return branch && branch.isActive === true && branch.isDeleted === false
}

const isActivePosition = (position) => {
  return position && position.isActive === true && position.isDeleted === false
}

const isEmployeePositionMatchBranch = (employee) => {
  if (!employee?.branchId) return false
  if (!employee?.positionId) return false
  if (!isActiveBranch(employee.branch)) return false
  if (!isActivePosition(employee.position)) return false

  return Number(employee.position.branchId) === Number(employee.branchId)
}

const validateEmployeeOrganization = (employee) => {
  if (!employee) return 'Employee not found'

  if (!isActiveBranch(employee.branch)) {
    return 'พนักงานยังไม่ได้ถูกกำหนดสาขา หรือสาขาถูกปิดใช้งานแล้ว'
  }

  if (!isEmployeePositionMatchBranch(employee)) {
    return 'พนักงานยังไม่ได้ถูกกำหนดตำแหน่ง หรือตำแหน่งไม่ตรงกับสาขา'
  }

  return null
}

const hasLocation = (latitude, longitude) => {
  return (
    latitude !== undefined &&
    latitude !== null &&
    latitude !== '' &&
    longitude !== undefined &&
    longitude !== null &&
    longitude !== ''
  )
}

const getEmployeeFullName = (employee) => {
  return [employee?.firstname, employee?.lastname].filter(Boolean).join(' ')
}

const safeCreateNotification = async (payload) => {
  try {
    await createNotification(payload)
  } catch (error) {
    console.error('Error creating notification:', error)
  }
}

const getShiftConfig = (shift) => {
  return {
    checkInTime: shift.checkInTime,
    checkOutTime: shift.checkOutTime,
    checkInGraceBeforeMinutes: Number(
      shift.checkInGraceBeforeMinutes ?? 30
    ),
    checkOutGraceAfterMinutes: Number(
      shift.checkOutGraceAfterMinutes ?? 180
    ),
  }
}

const getRecordShiftConfig = (record) => {
  const checkInTime =
    record?.scheduledCheckInTime || record?.shift?.checkInTime || null

  const checkOutTime =
    record?.scheduledCheckOutTime || record?.shift?.checkOutTime || null

  if (!checkInTime || !checkOutTime) return null

  return {
    checkInTime,
    checkOutTime,
    checkInGraceBeforeMinutes: Number(
      record.checkInGraceBeforeMinutesSnapshot ??
        record.shift?.checkInGraceBeforeMinutes ??
        30
    ),
    checkOutGraceAfterMinutes: Number(
      record.checkOutGraceAfterMinutesSnapshot ??
        record.shift?.checkOutGraceAfterMinutes ??
        180
    ),
  }
}

const getShiftWindowFromDateString = (dateString, shiftConfig) => {
  const shiftStart = buildBangkokDateTime(dateString, shiftConfig.checkInTime)
  const shiftEnd = buildBangkokDateTime(dateString, shiftConfig.checkOutTime)

  const [inHour, inMinute] = String(shiftConfig.checkInTime)
    .split(':')
    .map(Number)

  const [outHour, outMinute] = String(shiftConfig.checkOutTime)
    .split(':')
    .map(Number)

  const inTotal = inHour * 60 + inMinute
  const outTotal = outHour * 60 + outMinute

  if (outTotal <= inTotal) {
    shiftEnd.setDate(shiftEnd.getDate() + 1)
  }

  return {
    shiftStart,
    shiftEnd,
    windowStart: addMinutes(
      shiftStart,
      -Number(shiftConfig.checkInGraceBeforeMinutes || 30)
    ),
    checkInWindowEnd: shiftEnd,
    checkOutWindowEnd: addMinutes(
      shiftEnd,
      Number(shiftConfig.checkOutGraceAfterMinutes || 180)
    ),
  }
}

const getShiftWindowCandidates = (baseTime, shiftConfig) => {
  const today = getBangkokDateString(baseTime)
  const todayStart = new Date(`${today}T00:00:00.000+07:00`)
  const yesterdayStart = addMinutes(todayStart, -24 * 60)
  const yesterday = getBangkokDateString(yesterdayStart)

  return [
    getShiftWindowFromDateString(yesterday, shiftConfig),
    getShiftWindowFromDateString(today, shiftConfig),
  ]
}

const findCheckInWindow = (now, shift) => {
  const shiftConfig = getShiftConfig(shift)
  const candidates = getShiftWindowCandidates(now, shiftConfig)

  return candidates
    .filter(
      (window) =>
        now >= window.windowStart && now <= window.checkInWindowEnd
    )
    .sort((a, b) => b.shiftStart - a.shiftStart)[0]
}

const findWindowByCheckInTime = (checkInTime, shiftConfig) => {
  const candidates = getShiftWindowCandidates(checkInTime, shiftConfig)

  return candidates
    .filter(
      (window) =>
        checkInTime >= window.windowStart &&
        checkInTime <= window.checkInWindowEnd
    )
    .sort((a, b) => b.shiftStart - a.shiftStart)[0]
}

const getShiftWindowForRecord = (record) => {
  const shiftConfig = getRecordShiftConfig(record)

  if (!shiftConfig) return null

  return (
    findWindowByCheckInTime(new Date(record.checkIn), shiftConfig) ||
    getShiftWindowFromDateString(
      getBangkokDateString(record.date || record.checkIn),
      shiftConfig
    )
  )
}

const isShiftExpired = (record, now = new Date()) => {
  const shiftWindow = getShiftWindowForRecord(record)

  if (!shiftWindow) return true

  return now > shiftWindow.checkOutWindowEnd
}

const markExpiredIfNeeded = async (record, now = new Date()) => {
  if (!record) return null
  if (record.status === 'EXPIRED') return record
  if (record.checkOut) return record
  if (!isShiftExpired(record, now)) return record

  return prisma.timeTracking.update({
    where: {
      id: record.id,
    },
    data: {
      status: 'EXPIRED',
    },
    include: {
      shift: true,
    },
  })
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

const calculateLateMinutes = (currentTime, shiftWindow) => {
  const diffMinutes = Math.floor(
    (currentTime - shiftWindow.shiftStart) / 1000 / 60
  )

  return diffMinutes > 0 ? diffMinutes : 0
}

const calculateEarlyLeaveMinutes = (currentTime, shiftWindow) => {
  const diffMinutes = Math.floor(
    (shiftWindow.shiftEnd - currentTime) / 1000 / 60
  )

  return diffMinutes > 0 ? diffMinutes : 0
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

exports.checkIn = async (req, res, next) => {
  try {
    const userId = req.user.id
    const { latitude, longitude, note, shiftId } = req.body

    if (!hasLocation(latitude, longitude)) {
      return res.status(400).json({
        message: 'Location is required',
      })
    }

    if (!shiftId) {
      return res.status(400).json({
        message: 'กรุณาเลือกกะทำงาน',
      })
    }

    const employee = await prisma.employees.findFirst({
      where: {
        id: Number(userId),
        ...getActiveEmployeeWhere(),
        branch: {
          is: getActiveBranchWhere(),
        },
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

    const employeeError = validateEmployeeOrganization(employee)

    if (employeeError) {
      return res.status(employee ? 400 : 404).json({
        message: employeeError,
      })
    }

    const selectedShift = await prisma.shift.findFirst({
      where: {
        id: Number(shiftId),
        positionId: employee.positionId,
        ...getActiveShiftWhere(),
        position: {
          is: {
            id: employee.positionId,
            branchId: employee.branchId,
            ...getActivePositionWhere(),
            branch: {
              is: getActiveBranchWhere(),
            },
          },
        },
      },
      include: {
        position: {
          include: {
            branch: true,
          },
        },
      },
    })

    if (!selectedShift) {
      return res.status(400).json({
        message: 'กะทำงานไม่ถูกต้อง หรือไม่ตรงกับสาขาของพนักงาน',
      })
    }

    if (!selectedShift.checkInTime || !selectedShift.checkOutTime) {
      return res.status(400).json({
        message: 'กะนี้ยังไม่ได้กำหนดเวลาเข้าออกงาน',
      })
    }

    const now = new Date()
    const shiftWindow = findCheckInWindow(now, selectedShift)

    if (!shiftWindow) {
      return res.status(400).json({
        message: 'ไม่อยู่ในช่วงเวลาที่สามารถ Check-in ได้',
      })
    }

    // 1) ดักงานปกติ ACTIVE ค้างจากทุกกะก่อน
    const activeNormalRecord = await prisma.timeTracking.findFirst({
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
        shift: true,
      },
      orderBy: {
        checkIn: 'desc',
      },
    })

    if (activeNormalRecord) {
      const updatedActiveNormal = await markExpiredIfNeeded(
        activeNormalRecord,
        now
      )

      if (updatedActiveNormal?.status !== 'EXPIRED') {
        return res.status(400).json({
          message: 'คุณยังมีรอบทำงานที่ยังไม่ได้ Check-out',
          status: updatedActiveNormal?.status || activeNormalRecord.status,
          data: updatedActiveNormal || activeNormalRecord,
        })
      }
    }

    // 2) ดัก OT ACTIVE ค้างก่อน check-in งานปกติ
    // อิง expired logic เดียวกับ OT controller:
    // checkIn + otCapMinutes + 180 นาที
    const activeOvertime = await prisma.overtimeTracking.findFirst({
      where: {
        employeesId: Number(userId),
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
        branch: {
          is: getActiveBranchWhere(),
        },
      },
      orderBy: {
        checkIn: 'desc',
      },
    })

    if (activeOvertime) {
      const updatedActiveOvertime = await markOvertimeExpiredIfNeeded({
        overtime: activeOvertime,
        employee,
        now,
      })

      if (updatedActiveOvertime?.status !== 'EXPIRED') {
        return res.status(400).json({
          message: 'คุณมี OT ที่ยังไม่ได้จบ กรุณาจบ OT ก่อน Check-in งานปกติ',
          status: 'ACTIVE_OT',
          expiredAt: updatedActiveOvertime?.expiredAt || null,
          data: updatedActiveOvertime || activeOvertime,
        })
      }
    }

    // 3) ดัก record ของ shift เดียวกัน / รอบเดียวกัน
    const existingRecordInShiftWindow = await prisma.timeTracking.findFirst({
      where: {
        employeesId: Number(userId),
        shiftId: selectedShift.id,
        date: shiftWindow.shiftStart,
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
        shift: true,
      },
    })

    if (existingRecordInShiftWindow) {
      const updatedExisting = await markExpiredIfNeeded(
        existingRecordInShiftWindow,
        now
      )

      return res.status(400).json({
        message:
          updatedExisting?.status === 'EXPIRED'
            ? 'กะนี้หมดอายุแล้ว กรุณาติดต่อแอดมิน'
            : 'คุณ Check-in ในรอบกะนี้ไปแล้ว',
        status: updatedExisting?.status || existingRecordInShiftWindow.status,
        data: updatedExisting || existingRecordInShiftWindow,
      })
    }

    const { start: shiftDayStart, end: shiftDayEnd } = getBangkokDayRange(
      shiftWindow.shiftStart
    )

    const holiday = await prisma.storeHoliday.findFirst({
      where: {
        ...getActiveStoreHolidayWhere(),
        branchId: employee.branchId,
        date: {
          gte: shiftDayStart,
          lte: shiftDayEnd,
        },
        branch: {
          is: getActiveBranchWhere(),
        },
      },
    })

    if (holiday) {
      return res.status(400).json({
        message: 'วันนี้เป็นวันหยุดของสาขานี้ ไม่สามารถ Check-in ได้',
      })
    }

    const approvedDayOff = await prisma.dayOff.findFirst({
      where: {
        employeesId: Number(userId),
        status: 'APPROVED',
        date: {
          gte: shiftDayStart,
          lte: shiftDayEnd,
        },
        employees: {
          is: getActiveEmployeeWhere(),
        },
      },
    })

    if (approvedDayOff) {
      return res.status(400).json({
        message: 'คุณได้ลาวันนี้ไว้แล้ว ไม่สามารถ Check-in ได้',
      })
    }

    const branch = employee.branch

    const { distance, isInside } = validateLocation({
      latitude,
      longitude,
      branch,
    })

    if (!isInside) {
      return res.status(403).json({
        message: `คุณอยู่นอกพื้นที่ ${branch.name} ระยะห่าง ${Math.round(
          distance
        )} เมตร`,
        distance: Math.round(distance),
      })
    }

    const lateMinutes = calculateLateMinutes(now, shiftWindow)

    const timeTrackingRecord = await prisma.timeTracking.create({
      data: {
        employeesId: Number(userId),
        shiftId: selectedShift.id,
        checkIn: now,
        date: shiftWindow.shiftStart,
        lateMinutes,
        checkInNote: note || null,
        status: 'ACTIVE',

        shiftNameSnapshot: selectedShift.name,
        positionIdSnapshot: employee.positionId,
        positionNameSnapshot: employee.position.name,
        scheduledCheckInTime: selectedShift.checkInTime,
        scheduledCheckOutTime: selectedShift.checkOutTime,
        checkInGraceBeforeMinutesSnapshot:
          selectedShift.checkInGraceBeforeMinutes,
        checkOutGraceAfterMinutesSnapshot:
          selectedShift.checkOutGraceAfterMinutes,
        branchIdSnapshot: employee.branchId,
        branchNameSnapshot: employee.branch.name,
      },
      include: {
        shift: true,
      },
    })

    res.json({
      message:
        lateMinutes > 0
          ? `Check-in successful แต่สาย ${lateMinutes} นาที`
          : 'Check-in successful',
      status: 'ACTIVE',
      branch: branch.name,
      shift: selectedShift.name,
      distance: Math.round(distance),
      lateMinutes,
      data: timeTrackingRecord,
    })
  } catch (error) {
    if (error.code === 'P2002') {
      return res.status(400).json({
        message: 'คุณ Check-in ในรอบกะนี้ไปแล้ว',
      })
    }

    next(error)
  }
}
exports.checkOut = async (req, res, next) => {
  try {
    const userId = req.user.id
    const { latitude, longitude, note } = req.body

    if (!hasLocation(latitude, longitude)) {
      return res.status(400).json({
        message: 'Location is required',
      })
    }

    const employee = await prisma.employees.findFirst({
      where: {
        id: Number(userId),
        ...getActiveEmployeeWhere(),
        branch: {
          is: getActiveBranchWhere(),
        },
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

    const employeeError = validateEmployeeOrganization(employee)

    if (employeeError) {
      return res.status(employee ? 400 : 404).json({
        message: employeeError,
      })
    }

    const branch = employee.branch

    const { distance, isInside } = validateLocation({
      latitude,
      longitude,
      branch,
    })

    if (!isInside) {
      return res.status(403).json({
        message: `คุณอยู่นอกพื้นที่ ${branch.name} ระยะห่าง ${Math.round(
          distance
        )} เมตร`,
        distance: Math.round(distance),
      })
    }

    const activeCheckIn = await prisma.timeTracking.findFirst({
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

    const now = new Date()

    // ถ้าไม่มีงานปกติ active แต่มี OT active ให้บอกให้ไปจบ OT
    // และเช็ก expired ด้วย logic OT เดียวกัน
    if (!activeCheckIn) {
      const activeOvertime = await prisma.overtimeTracking.findFirst({
        where: {
          employeesId: Number(userId),
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
          branch: {
            is: getActiveBranchWhere(),
          },
        },
        orderBy: {
          checkIn: 'desc',
        },
      })

      if (activeOvertime) {
        const updatedActiveOvertime = await markOvertimeExpiredIfNeeded({
          overtime: activeOvertime,
          employee,
          now,
          noteOut:
            note ||
            'System expired because OT was not checked out within cap + 3 hours',
        })

        if (updatedActiveOvertime?.status === 'EXPIRED') {
          return res.status(400).json({
            message:
              'OT นี้เลยเวลาที่สามารถจบได้ ระบบแปะ EXPIRED แล้ว กรุณาติดต่อแอดมิน',
            status: 'EXPIRED',
            data: updatedActiveOvertime,
          })
        }

        return res.status(400).json({
          message: 'คุณกำลังทำ OT อยู่ กรุณากดจบ OT',
          status: 'ACTIVE_OT',
          expiredAt: updatedActiveOvertime?.expiredAt || null,
          data: updatedActiveOvertime || activeOvertime,
        })
      }

      return res.status(400).json({
        message: 'คุณยังไม่ได้ Check-in หรือได้ Check-out ไปแล้ว',
        status: 'NO_ACTIVE_CHECK_IN',
      })
    }

    const shiftWindow = getShiftWindowForRecord(activeCheckIn)

    if (!shiftWindow) {
      await prisma.timeTracking.update({
        where: {
          id: activeCheckIn.id,
        },
        data: {
          status: 'EXPIRED',
        },
      })

      return res.status(400).json({
        message: 'ไม่สามารถตรวจสอบช่วงเวลากะได้ ระบบแปะ EXPIRED แล้ว',
        status: 'EXPIRED',
      })
    }

    if (isShiftExpired(activeCheckIn, now)) {
      const expiredRecord = await prisma.timeTracking.update({
        where: {
          id: activeCheckIn.id,
        },
        data: {
          status: 'EXPIRED',
        },
        include: {
          shift: true,
        },
      })

      return res.status(400).json({
        message: 'กะนี้หมดเวลา Check-out แล้ว กรุณาติดต่อแอดมิน',
        status: 'EXPIRED',
        expiredAt: shiftWindow.checkOutWindowEnd,
        data: expiredRecord,
      })
    }

    const earlyLeaveMinutes = calculateEarlyLeaveMinutes(now, shiftWindow)

    const timeTrackingRecord = await prisma.timeTracking.update({
      where: {
        id: activeCheckIn.id,
      },
      data: {
        checkOut: now,
        earlyLeaveMinutes,
        checkOutNote: note || null,
        status: 'COMPLETED',
      },
      include: {
        shift: true,
      },
    })

    res.json({
      message:
        earlyLeaveMinutes > 0
          ? `Check-out successful แต่ออกก่อนเวลา ${earlyLeaveMinutes} นาที`
          : 'Check-out successful',
      status: 'COMPLETED',
      branch: branch.name,
      shift:
        activeCheckIn.shiftNameSnapshot ||
        activeCheckIn.shift?.name ||
        'Shift',
      distance: Math.round(distance),
      earlyLeaveMinutes,
      data: timeTrackingRecord,
    })
  } catch (error) {
    next(error)
  }
}

const countEmployeeDayOffs = ({ employeesId, start, end, statuses }) => {
  const statusWhere = Array.isArray(statuses)
    ? {
        in: statuses,
      }
    : statuses

  return prisma.dayOff.count({
    where: {
      employeesId,
      date: {
        gte: start,
        lte: end,
      },
      status: statusWhere,
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
}

const getDayOffRequestQuotaInfo = async ({ employee, requestDate }) => {
  const employeesId = Number(employee.id)
  const remainingDayOffs = Number(employee.remainingDayOffs || 0)
  const maxDayOffPerMonth = Number(employee.position?.maxDayOffPerMonth || 0)
  const isCurrentMonth = isSameBangkokMonth(new Date(), requestDate)
  const { start: requestMonthStart, end: requestMonthEnd } =
    getBangkokMonthRange(requestDate)

  if (maxDayOffPerMonth <= 0) {
    return {
      canRequest: false,
      message: 'ตำแหน่งนี้ยังไม่ได้กำหนดจำนวนวันลาต่อเดือน',
      isCurrentMonth,
      approveBy: null,
      remainingDayOffs,
      maxDayOffPerMonth,
      requestMonthPendingAndApproved: 0,
      pendingCurrentMonth: 0,
      pendingRequestMonth: 0,
      pendingReserveTotal: 0,
    }
  }

  const requestMonthPendingAndApproved = await countEmployeeDayOffs({
    employeesId,
    start: requestMonthStart,
    end: requestMonthEnd,
    statuses: ['PENDING', 'APPROVED'],
  })

  if (isCurrentMonth) {
    if (remainingDayOffs <= 0) {
      return {
        canRequest: false,
        message: 'วันลาคงเหลือไม่พอ',
        isCurrentMonth: true,
        approveBy: null,
        remainingDayOffs,
        maxDayOffPerMonth,
        requestMonthPendingAndApproved,
        pendingCurrentMonth: 0,
        pendingRequestMonth: 0,
        pendingReserveTotal: 0,
      }
    }

    if (requestMonthPendingAndApproved >= maxDayOffPerMonth) {
      return {
        canRequest: false,
        message: `เดือนนี้ขอลาครบโควต้าแล้ว ลาได้ไม่เกิน ${maxDayOffPerMonth} วัน`,
        isCurrentMonth: true,
        approveBy: null,
        remainingDayOffs,
        maxDayOffPerMonth,
        requestMonthPendingAndApproved,
        pendingCurrentMonth: 0,
        pendingRequestMonth: 0,
        pendingReserveTotal: 0,
      }
    }

    return {
      canRequest: true,
      message: null,
      isCurrentMonth: true,
      approveBy: 'CURRENT_MONTH_NORMAL_QUOTA',
      remainingDayOffs,
      maxDayOffPerMonth,
      requestMonthPendingAndApproved,
      pendingCurrentMonth: 0,
      pendingRequestMonth: 0,
      pendingReserveTotal: 0,
      requestMonthQuotaRemainingAfterRequest:
        maxDayOffPerMonth - requestMonthPendingAndApproved - 1,
    }
  }

  if (requestMonthPendingAndApproved < maxDayOffPerMonth) {
    return {
      canRequest: true,
      message: null,
      isCurrentMonth: false,
      approveBy: 'REQUEST_MONTH_NORMAL_QUOTA',
      remainingDayOffs,
      maxDayOffPerMonth,
      requestMonthPendingAndApproved,
      pendingCurrentMonth: 0,
      pendingRequestMonth: 0,
      pendingReserveTotal: 0,
      requestMonthQuotaRemainingAfterRequest:
        maxDayOffPerMonth - requestMonthPendingAndApproved - 1,
    }
  }

  const { start: currentMonthStart, end: currentMonthEnd } =
    getBangkokMonthRange(new Date())

  const [pendingCurrentMonth, pendingRequestMonth] = await Promise.all([
    countEmployeeDayOffs({
      employeesId,
      start: currentMonthStart,
      end: currentMonthEnd,
      statuses: 'PENDING',
    }),
    countEmployeeDayOffs({
      employeesId,
      start: requestMonthStart,
      end: requestMonthEnd,
      statuses: 'PENDING',
    }),
  ])

  const pendingReserveTotal = pendingCurrentMonth + pendingRequestMonth

  if (pendingReserveTotal < remainingDayOffs) {
    return {
      canRequest: true,
      message: null,
      isCurrentMonth: false,
      approveBy: 'REMAINING_DAY_OFF_FALLBACK',
      remainingDayOffs,
      maxDayOffPerMonth,
      requestMonthPendingAndApproved,
      pendingCurrentMonth,
      pendingRequestMonth,
      pendingReserveTotal,
      remainingFallbackAvailableAfterRequest:
        remainingDayOffs - pendingReserveTotal - 1,
    }
  }

  return {
    canRequest: false,
    message:
      'เดือนที่เลือกขอลาครบโควต้าแล้ว และวันลาคงเหลือไม่พอสำหรับคำขอที่รออนุมัติ',
    isCurrentMonth: false,
    approveBy: null,
    remainingDayOffs,
    maxDayOffPerMonth,
    requestMonthPendingAndApproved,
    pendingCurrentMonth,
    pendingRequestMonth,
    pendingReserveTotal,
  }
}

exports.dayOff = async (req, res, next) => {
  try {
    const { date, reason } = req.body
    const employeesId = Number(req.user.id)

    if (!date) {
      return res.status(400).json({
        success: false,
        message: 'Date is required',
      })
    }

    const requestDate = new Date(date)

    if (Number.isNaN(requestDate.getTime())) {
      return res.status(400).json({
        success: false,
        message: 'Invalid date',
      })
    }

    const { start: todayStart } = getBangkokDayRange()
    const { start: requestDayStart, end: requestDayEnd } =
      getBangkokDayRange(requestDate)

    if (requestDayStart < todayStart) {
      return res.status(400).json({
        success: false,
        message: 'Cannot request a day off for a past date',
      })
    }

    const employee = await prisma.employees.findFirst({
      where: {
        id: employeesId,
        ...getActiveEmployeeWhere(),
        branch: {
          is: getActiveBranchWhere(),
        },
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

    const employeeError = validateEmployeeOrganization(employee)

    if (employeeError) {
      return res.status(employee ? 400 : 404).json({
        success: false,
        message: employeeError,
      })
    }

    const holiday = await prisma.storeHoliday.findFirst({
      where: {
        ...getActiveStoreHolidayWhere(),
        branchId: employee.branchId,
        date: {
          gte: requestDayStart,
          lte: requestDayEnd,
        },
        branch: {
          is: getActiveBranchWhere(),
        },
      },
    })

    if (holiday) {
      return res.status(400).json({
        success: false,
        message: 'วันที่เลือกเป็นวันหยุดของสาขานี้ ไม่จำเป็นต้องขอลา',
      })
    }

    const existingRequest = await prisma.dayOff.findFirst({
      where: {
        employeesId,
        date: {
          gte: requestDayStart,
          lte: requestDayEnd,
        },
        status: {
          in: ['PENDING', 'APPROVED'],
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

    if (existingRequest) {
      return res.status(400).json({
        success: false,
        message: 'คุณมีคำขอลาในวันนี้อยู่แล้ว',
      })
    }

    const quotaInfo = await getDayOffRequestQuotaInfo({
      employee,
      requestDate,
    })

    if (!quotaInfo.canRequest) {
      return res.status(400).json({
        success: false,
        message: quotaInfo.message,
        quotaInfo,
      })
    }

    const dayOff = await prisma.dayOff.create({
      data: {
        date: requestDayStart,
        reason: reason || null,
        status: 'PENDING',
        employeesId,
      },
    })

    await safeCreateNotification({
      type: 'REQUEST_CREATED',
      title: 'มีคำขอลาใหม่',
      message: `${getEmployeeFullName(employee)} ส่งคำขอลา`,
      link: '/admin',
      entity: 'DayOff',
      entityId: dayOff.id,
      targetType: 'ADMIN',
      createdById: employee.id,
    })

    res.json({
      success: true,
      message: 'Day off request sent successfully',
      data: dayOff,
      remainingDayOffs: quotaInfo.remainingDayOffs,
      maxDayOffPerMonth: quotaInfo.maxDayOffPerMonth,
      quotaInfo: {
        ...quotaInfo,
        requestMonthPendingAndApprovedAfterRequest:
          quotaInfo.requestMonthPendingAndApproved + 1,
        pendingRequestMonthAfterRequest: quotaInfo.isCurrentMonth
          ? quotaInfo.pendingRequestMonth
          : quotaInfo.pendingRequestMonth + 1,
        pendingReserveTotalAfterRequest:
          quotaInfo.approveBy === 'REMAINING_DAY_OFF_FALLBACK'
            ? quotaInfo.pendingReserveTotal + 1
            : quotaInfo.pendingReserveTotal,
      },
    })
  } catch (error) {
    next(error)
  }
}

exports.deleteDayOff = async (req, res, next) => {
  try {
    const requestId = Number(req.params.id)
    const userId = Number(req.user.id)

    if (!requestId) {
      return res.status(400).json({
        success: false,
        message: 'Invalid day off request id',
      })
    }

    const dayOffRequest = await prisma.dayOff.findFirst({
      where: {
        id: requestId,
        employeesId: userId,
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

    if (!dayOffRequest) {
      return res.status(404).json({
        success: false,
        message: 'Day off request not found',
      })
    }

    if (
      dayOffRequest.status !== 'PENDING' &&
      dayOffRequest.status !== 'APPROVED'
    ) {
      return res.status(400).json({
        success: false,
        message: 'This request cannot be canceled',
      })
    }

    const { start: todayStart } = getBangkokDayRange()
    const { start: requestDayStart } = getBangkokDayRange(dayOffRequest.date)

    if (requestDayStart < todayStart) {
      return res.status(400).json({
        success: false,
        message: 'Cannot cancel a day off that has already passed',
      })
    }

    const employee = dayOffRequest.employees
    const employeeError = validateEmployeeOrganization(employee)

    if (employeeError) {
      return res.status(400).json({
        success: false,
        message: employeeError,
      })
    }

    const toAuditDate = (value) => {
      if (!value) return null

      const parsed = new Date(value)

      if (Number.isNaN(parsed.getTime())) return null

      return parsed.toISOString()
    }

    const result = await prisma.$transaction(async (tx) => {
      const oldStatus = dayOffRequest.status
      const remainingBefore = Number(employee.remainingDayOffs || 0)

      let refundedDayOff = false
      let refundReason = 'NO_REFUND'
      let remainingAfter = remainingBefore
      let approvedDayOffsInMonth = null

      const maxDayOffPerMonth = Number(
        employee.position?.maxDayOffPerMonth || 0
      )

      const isCurrentMonth = isSameBangkokMonth(
        dayOffRequest.date,
        new Date()
      )

      // ต้องเช็กจำนวนวันลาก่อน update เป็น CANCELED
      // เพราะถ้า update ก่อน count จะไม่รวม request ปัจจุบัน
      if (oldStatus === 'APPROVED') {
        if (isCurrentMonth) {
          refundedDayOff = true
          refundReason = 'CURRENT_MONTH_DIRECT_REFUND'
        } else {
          const { start: monthStart, end: monthEnd } = getBangkokMonthRange(
            dayOffRequest.date
          )

          approvedDayOffsInMonth = await tx.dayOff.count({
            where: {
              employeesId: userId,
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

          if (approvedDayOffsInMonth > maxDayOffPerMonth) {
            refundedDayOff = true
            refundReason = 'FUTURE_MONTH_EXCEEDED_MAX_DAY_OFF'
          } else {
            refundedDayOff = false
            refundReason = 'FUTURE_MONTH_NOT_EXCEEDED_MAX_DAY_OFF'
          }
        }
      } else {
        refundReason = 'PENDING_REQUEST_NO_REFUND'
      }

      const canceledDayOff = await tx.dayOff.update({
        where: {
          id: requestId,
        },
        data: {
          status: 'CANCELED',
        },
      })

      if (refundedDayOff) {
        const updatedEmployee = await tx.employees.update({
          where: {
            id: userId,
          },
          data: {
            remainingDayOffs: {
              increment: 1,
            },
          },
        })

        remainingAfter = Number(updatedEmployee.remainingDayOffs || 0)
      }

      await tx.auditLog.create({
        data: {
          action: 'CANCEL_DAY_OFF',
          entity: 'DayOff',
          entityId: dayOffRequest.id,

          actorId: userId,
          targetEmployeeId: userId,
          branchId: employee.branchId || employee.branch?.id || null,

          oldValue: {
            id: dayOffRequest.id,
            date: toAuditDate(dayOffRequest.date),
            reason: dayOffRequest.reason || null,
            status: oldStatus,
            employeesId: dayOffRequest.employeesId,
            remainingDayOffs: remainingBefore,
          },

          newValue: {
            id: canceledDayOff.id,
            date: toAuditDate(canceledDayOff.date),
            reason: canceledDayOff.reason || null,
            status: canceledDayOff.status,
            employeesId: canceledDayOff.employeesId,

            refundedDayOff,
            refundReason,
            isCurrentMonth,
            maxDayOffPerMonth,
            approvedDayOffsInMonth,
            remainingDayOffsBefore: remainingBefore,
            remainingDayOffsAfter: remainingAfter,
          },

          note: `User canceled day off request. Refund: ${refundedDayOff ? 'YES' : 'NO'} (${refundReason})`,
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
        },
      })

      return {
        canceledDayOff,
        refundedDayOff,
        refundReason,
        remainingBefore,
        remainingAfter,
        isCurrentMonth,
        maxDayOffPerMonth,
        approvedDayOffsInMonth,
      }
    })

    res.status(200).json({
      success: true,
      message: 'Day off request canceled successfully',
      data: {
        id: result.canceledDayOff.id,
        status: result.canceledDayOff.status,
        refundedDayOff: result.refundedDayOff,
        refundReason: result.refundReason,
        remainingDayOffsBefore: result.remainingBefore,
        remainingDayOffsAfter: result.remainingAfter,
      },
    })
  } catch (error) {
    next(error)
  }
}