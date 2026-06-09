const prisma = require("../configs/prisma")

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

function addMinutes(date, minutes) {
  const result = new Date(date)
  result.setMinutes(result.getMinutes() + minutes)
  return result
}

function buildBangkokDateTime(dateString, timeString) {
  const [hour, minute] = timeString.split(':').map(Number)

  return new Date(
    `${dateString}T${String(hour).padStart(2, '0')}:${String(minute).padStart(
      2,
      '0'
    )}:00.000+07:00`
  )
}

function getShiftWindowFromDateString(dateString, checkInTime) {
  const shiftStart = buildBangkokDateTime(dateString, checkInTime)

  return {
    shiftStart,
    windowStart: addMinutes(shiftStart, -30),
    checkInWindowEnd: addMinutes(shiftStart, 15 * 60),
    checkOutWindowEnd: addMinutes(shiftStart, 23.5 * 60),
  }
}

function getShiftWindowCandidates(baseTime, checkInTime) {
  const today = getBangkokDateString(baseTime)

  const todayStart = new Date(`${today}T00:00:00.000+07:00`)
  const yesterdayStart = addMinutes(todayStart, -24 * 60)
  const yesterday = getBangkokDateString(yesterdayStart)

  return [
    getShiftWindowFromDateString(yesterday, checkInTime),
    getShiftWindowFromDateString(today, checkInTime),
  ]
}

function findCheckInWindow(now, shift) {
  const candidates = getShiftWindowCandidates(now, shift.checkInTime)

  return candidates
    .filter(
      (window) =>
        now >= window.windowStart && now <= window.checkInWindowEnd
    )
    .sort((a, b) => b.shiftStart - a.shiftStart)[0]
}

function findWindowByCheckInTime(checkInTime, shift) {
  const candidates = getShiftWindowCandidates(checkInTime, shift.checkInTime)

  return candidates
    .filter(
      (window) =>
        checkInTime >= window.windowStart &&
        checkInTime <= window.checkInWindowEnd
    )
    .sort((a, b) => b.shiftStart - a.shiftStart)[0]
}

function getShiftEndDateTime(shiftWindow, shift) {
  const shiftDate = getBangkokDateString(shiftWindow.shiftStart)
  const shiftEnd = buildBangkokDateTime(shiftDate, shift.checkOutTime)

  const [inHour, inMinute] = shift.checkInTime.split(':').map(Number)
  const [outHour, outMinute] = shift.checkOutTime.split(':').map(Number)

  const inTotal = inHour * 60 + inMinute
  const outTotal = outHour * 60 + outMinute

  if (outTotal <= inTotal) {
    shiftEnd.setDate(shiftEnd.getDate() + 1)
  }

  return shiftEnd
}

function getDistanceMeters(lat1, lon1, lat2, lon2) {
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

function calculateLateMinutes(currentTime, shiftWindow) {
  const diffMinutes = Math.floor(
    (currentTime - shiftWindow.shiftStart) / 1000 / 60
  )

  return diffMinutes > 0 ? diffMinutes : 0
}

function calculateEarlyLeaveMinutes(currentTime, shiftWindow, shift) {
  const shiftEnd = getShiftEndDateTime(shiftWindow, shift)
  const diffMinutes = Math.floor((shiftEnd - currentTime) / 1000 / 60)

  return diffMinutes > 0 ? diffMinutes : 0
}

exports.checkIn = async (req, res, next) => {
  try {
    const userId = req.user.id
    const { latitude, longitude, note, shiftId } = req.body

    if (!latitude || !longitude) {
      return res.status(400).json({
        message: 'Location is required',
      })
    }

    if (!shiftId) {
      return res.status(400).json({
        message: 'กรุณาเลือกกะทำงาน',
      })
    }

    const employee = await prisma.employees.findUnique({
      where: {
        id: Number(userId),
      },
      include: {
        branch: true,
        position: true,
      },
    })

    if (!employee?.branch) {
      return res.status(400).json({
        message: 'พนักงานยังไม่ได้ถูกกำหนดสาขา',
      })
    }

    if (!employee.position) {
      return res.status(400).json({
        message: 'พนักงานยังไม่ได้ถูกกำหนดตำแหน่ง',
      })
    }

    const selectedShift = await prisma.shift.findFirst({
      where: {
        id: Number(shiftId),
        positionId: employee.positionId,
        isActive: true,
      },
    })

    if (!selectedShift) {
      return res.status(400).json({
        message: 'กะทำงานไม่ถูกต้อง',
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

    const existingRecordInShiftWindow = await prisma.timeTracking.findFirst({
      where: {
        employeesId: Number(userId),
        checkIn: {
          gte: shiftWindow.windowStart,
          lte: shiftWindow.checkOutWindowEnd,
        },
      },
    })

    if (existingRecordInShiftWindow) {
      return res.status(400).json({
        message: 'คุณ Check-in ในรอบกะนี้ไปแล้ว',
      })
    }

    const { start: shiftDayStart, end: shiftDayEnd } = getBangkokDayRange(
      shiftWindow.shiftStart
    )

    const holiday = await prisma.storeHoliday.findFirst({
      where: {
        branchId: employee.branchId,
        date: {
          gte: shiftDayStart,
          lte: shiftDayEnd,
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
      },
    })

    if (approvedDayOff) {
      return res.status(400).json({
        message: 'คุณได้ลาวันนี้ไว้แล้ว ไม่สามารถ Check-in ได้',
      })
    }

    const branch = employee.branch

    const distance = getDistanceMeters(
      Number(latitude),
      Number(longitude),
      Number(branch.lat),
      Number(branch.lng)
    )

    if (distance > branch.radius) {
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
      branch: branch.name,
      shift: selectedShift.name,
      distance: Math.round(distance),
      lateMinutes,
      data: timeTrackingRecord,
    })
  }  catch (error) {
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

    if (!latitude || !longitude) {
      return res.status(400).json({
        message: 'Location is required',
      })
    }

    const employee = await prisma.employees.findUnique({
      where: {
        id: Number(userId),
      },
      include: {
        branch: true,
        position: true,
      },
    })

    if (!employee?.branch) {
      return res.status(400).json({
        message: 'พนักงานยังไม่ได้ถูกกำหนดสาขา',
      })
    }

    if (!employee.position) {
      return res.status(400).json({
        message: 'พนักงานยังไม่ได้ถูกกำหนดตำแหน่ง',
      })
    }

    const branch = employee.branch

    const distance = getDistanceMeters(
      Number(latitude),
      Number(longitude),
      Number(branch.lat),
      Number(branch.lng)
    )

    if (distance > branch.radius) {
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
      },
      include: {
        shift: true,
      },
      orderBy: {
        checkIn: 'desc',
      },
    })

    if (!activeCheckIn) {
      return res.status(400).json({
        message: 'คุณยังไม่ได้ Check-in หรือได้ Check-out ไปแล้ว',
      })
    }

    const selectedShift = activeCheckIn.shift

    if (!selectedShift) {
      return res.status(400).json({
        message: 'ไม่พบกะทำงานของ Check-in นี้',
      })
    }

    if (!selectedShift.checkInTime || !selectedShift.checkOutTime) {
      return res.status(400).json({
        message: 'กะนี้ยังไม่ได้กำหนดเวลาเข้าออกงาน',
      })
    }

    const now = new Date()

    const shiftWindow =
      findWindowByCheckInTime(new Date(activeCheckIn.checkIn), selectedShift) ||
      getShiftWindowFromDateString(
        getBangkokDateString(activeCheckIn.date || activeCheckIn.checkIn),
        selectedShift.checkInTime
      )

    if (now < shiftWindow.windowStart || now > shiftWindow.checkOutWindowEnd) {
      return res.status(400).json({
        message: 'รายการนี้เลยช่วงเวลา Check-out แล้ว กรุณาติดต่อแอดมิน',
      })
    }

    const earlyLeaveMinutes = calculateEarlyLeaveMinutes(
      now,
      shiftWindow,
      selectedShift
    )

    const timeTrackingRecord = await prisma.timeTracking.update({
      where: {
        id: activeCheckIn.id,
      },
      data: {
        checkOut: now,
        earlyLeaveMinutes,
        checkOutNote: note || null,
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
      branch: branch.name,
      shift: selectedShift.name,
      distance: Math.round(distance),
      earlyLeaveMinutes,
      data: timeTrackingRecord,
    })
  } catch (error) {
    next(error)
  }
}

exports.dayOff = async (req, res, next) => {
  try {
    const { date, reason } = req.body
    const employeesId = req.user.id

    const { start: todayStart } = getBangkokDayRange()
    const requestDate = new Date(date)
    const { start: requestDayStart, end: requestDayEnd } =
      getBangkokDayRange(requestDate)

    if (requestDayStart < todayStart) {
      return res.status(400).json({
        success: false,
        message: 'Cannot request a day off for a past date',
      })
    }

    const employee = await prisma.employees.findUnique({
      where: {
        id: Number(employeesId),
      },
      include: {
        position: true,
        branch: true,
      },
    })

    if (!employee?.branch) {
      return res.status(400).json({
        success: false,
        message: 'พนักงานยังไม่ได้ถูกกำหนดสาขา',
      })
    }

    if (!employee?.position) {
      return res.status(400).json({
        success: false,
        message: 'พนักงานยังไม่ได้ถูกกำหนดตำแหน่ง',
      })
    }

    const holiday = await prisma.storeHoliday.findFirst({
      where: {
        branchId: employee.branchId,
        date: {
          gte: requestDayStart,
          lte: requestDayEnd,
        },
      },
    })

    if (holiday) {
      return res.status(400).json({
        success: false,
        message: 'วันที่เลือกเป็นวันหยุดของสาขานี้ ไม่จำเป็นต้องขอลา',
      })
    }

    const maxDayOffPerMonth = Number(employee.position.maxDayOffPerMonth || 0)
    const remainingDayOffs = Number(employee.remainingDayOffs || 0)

    if (maxDayOffPerMonth <= 0) {
      return res.status(400).json({
        success: false,
        message: 'ตำแหน่งนี้ยังไม่ได้กำหนดจำนวนวันลาต่อเดือน',
      })
    }

    if (remainingDayOffs <= 0) {
      return res.status(400).json({
        success: false,
        message: 'วันลาคงเหลือไม่พอ',
      })
    }

    const { start: monthStart, end: monthEnd } =
      getBangkokMonthRange(requestDate)

    const usedThisMonth = await prisma.dayOff.count({
      where: {
        employeesId: Number(employeesId),
        date: {
          gte: monthStart,
          lte: monthEnd,
        },
        status: {
          in: ['PENDING', 'APPROVED'],
        },
      },
    })

    if (usedThisMonth >= maxDayOffPerMonth) {
      return res.status(400).json({
        success: false,
        message: `เดือนนี้ขอลาครบโควต้าแล้ว ลาได้ไม่เกิน ${maxDayOffPerMonth} วัน`,
      })
    }

    const dayOff = await prisma.dayOff.create({
      data: {
        date: requestDayStart,
        reason,
        status: 'PENDING',
        employeesId: Number(employeesId),
      },
    })

    res.json({
      success: true,
      message: 'Day off request sent successfully',
      data: dayOff,
      remainingDayOffs,
      maxDayOffPerMonth,
    })
  } catch (error) {
    next(error)
  }
}

exports.deleteDayOff = async (req, res, next) => {
  try {
    const requestId = parseInt(req.params.id)
    const userId = req.user.id

    const dayOffRequest = await prisma.dayOff.findUnique({
      where: {
        id: requestId,
      },
    })

    if (!dayOffRequest) {
      return res.status(404).json({
        success: false,
        message: 'Day off request not found',
      })
    }

    if (dayOffRequest.employeesId !== userId) {
      return res.status(403).json({
        success: false,
        message: "You don't have permission to cancel this request",
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

    await prisma.dayOff.update({
      where: {
        id: requestId,
      },
      data: {
        status: 'CANCELED',
      },
    })

    if (dayOffRequest.status === 'APPROVED') {
      const employee = await prisma.employees.findUnique({
        where: {
          id: Number(userId),
        },
        include: {
          position: true,
        },
      })

      const maxDayOffPerMonth = Number(
        employee?.position?.maxDayOffPerMonth || 0
      )
      const currentRemaining = Number(employee?.remainingDayOffs || 0)

      if (currentRemaining < maxDayOffPerMonth) {
        await prisma.employees.update({
          where: {
            id: Number(userId),
          },
          data: {
            remainingDayOffs: {
              increment: 1,
            },
          },
        })
      }
    }

    res.status(200).json({
      success: true,
      message: 'Day off request canceled successfully',
    })
  } catch (error) {
    next(error)
  }
}