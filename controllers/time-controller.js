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

  const start = new Date(`${year}-${String(month).padStart(2, '0')}-01T00:00:00.000+07:00`)
  const end = new Date(year, month, 0, 23, 59, 59, 999)

  return {
    start,
    end: new Date(
      new Intl.DateTimeFormat('en-CA', {
        timeZone: BANGKOK_TIMEZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(end) + 'T23:59:59.999+07:00'
    ),
  }
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

function calculateLateMinutes(currentTime, targetTime) {
  const [hour, minute] = targetTime.split(':').map(Number)
  const today = getBangkokDateString(currentTime)
  const targetDate = new Date(`${today}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00.000+07:00`)

  const diffMs = currentTime - targetDate
  const diffMinutes = Math.floor(diffMs / 1000 / 60)

  return diffMinutes > 0 ? diffMinutes : 0
}

function calculateEarlyLeaveMinutes(currentTime, targetTime) {
  const [hour, minute] = targetTime.split(':').map(Number)
  const today = getBangkokDateString(currentTime)
  const targetDate = new Date(`${today}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00.000+07:00`)

  const diffMs = targetDate - currentTime
  const diffMinutes = Math.floor(diffMs / 1000 / 60)

  return diffMinutes > 0 ? diffMinutes : 0
}

exports.checkIn = async (req, res, next) => {
  try {
    const userId = req.user.id
    const { latitude, longitude, note } = req.body

    if (!latitude || !longitude) {
      return res.status(400).json({
        message: 'Location is required',
      })
    }

    const employee = await prisma.employees.findUnique({
      where: { id: Number(userId) },
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

    if (!employee.position.checkInTime) {
      return res.status(400).json({
        message: 'ตำแหน่งนี้ยังไม่ได้กำหนดเวลาเข้างาน',
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
        message: `คุณอยู่นอกพื้นที่ ${branch.name} ระยะห่าง ${Math.round(distance)} เมตร`,
        distance: Math.round(distance),
      })
    }

    const { start: todayStart, end: todayEnd } = getBangkokDayRange()

    const existingRecord = await prisma.timeTracking.findFirst({
      where: {
        employeesId: Number(userId),
        date: {
          gte: todayStart,
          lte: todayEnd,
        },
      },
    })

    if (existingRecord) {
      return res.status(400).json({
        message: 'วันนี้คุณ Check-in ไปแล้ว',
      })
    }

    const now = new Date()

    const [hour, minute] = employee.position.checkInTime.split(':').map(Number)
    const today = getBangkokDateString(now)

    const shiftStart = new Date(
      `${today}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00.000+07:00`
    )

    const allowedCheckInTime = new Date(shiftStart)
    allowedCheckInTime.setMinutes(allowedCheckInTime.getMinutes() - 30)

    if (now < allowedCheckInTime) {
      return res.status(400).json({
        message: 'สามารถ Check-in ได้ก่อนเวลาเข้างาน 30 นาที',
      })
    }

    const lateMinutes = calculateLateMinutes(now, employee.position.checkInTime)

    const timeTrackingRecord = await prisma.timeTracking.create({
      data: {
        employeesId: Number(userId),
        checkIn: now,
        date: now,
        lateMinutes,
        checkInNote: note || null,
      },
    })

    res.json({
      message:
        lateMinutes > 0
          ? `Check-in successful แต่สาย ${lateMinutes} นาที`
          : 'Check-in successful',
      branch: branch.name,
      distance: Math.round(distance),
      lateMinutes,
      data: timeTrackingRecord,
    })
  } catch (error) {
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
      where: { id: Number(userId) },
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
        message: `คุณอยู่นอกพื้นที่ ${branch.name} ระยะห่าง ${Math.round(distance)} เมตร`,
        distance: Math.round(distance),
      })
    }

    const { start: todayStart, end: todayEnd } = getBangkokDayRange()

    const activeCheckIn = await prisma.timeTracking.findFirst({
      where: {
        employeesId: Number(userId),
        checkIn: {
          not: null,
        },
        checkOut: null,
        date: {
          gte: todayStart,
          lte: todayEnd,
        },
      },
      orderBy: {
        checkIn: 'desc',
      },
    })

    if (!activeCheckIn) {
      return res.status(400).json({
        message: 'คุณยังไม่ได้ Check-in วันนี้ หรือได้ Check-out ไปแล้ว',
      })
    }

    const now = new Date()

    const earlyLeaveMinutes = employee.position?.checkOutTime
      ? calculateEarlyLeaveMinutes(now, employee.position.checkOutTime)
      : 0

    const timeTrackingRecord = await prisma.timeTracking.update({
      where: {
        id: activeCheckIn.id,
      },
      data: {
        checkOut: now,
        earlyLeaveMinutes,
        checkOutNote: note || null,
      },
    })

    res.json({
      message:
        earlyLeaveMinutes > 0
          ? `Check-out successful แต่ออกก่อนเวลา ${earlyLeaveMinutes} นาที`
          : 'Check-out successful',
      branch: branch.name,
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
    const {
      start: requestDayStart,
      end: requestDayEnd,
    } = getBangkokDayRange(requestDate)

    if (requestDayStart < todayStart) {
      return res.status(400).json({
        success: false,
        message: 'Cannot request a day off for a past date',
      })
    }

    const holiday = await prisma.storeHoliday.findFirst({
      where: {
        date: {
          gte: requestDayStart,
          lte: requestDayEnd,
        },
      },
    })

    if (holiday) {
      return res.status(400).json({
        success: false,
        message: 'วันที่เลือกเป็นวันหยุดร้าน ไม่จำเป็นต้องขอลา',
      })
    }

    const employee = await prisma.employees.findUnique({
      where: { id: Number(employeesId) },
      include: {
        position: true,
      },
    })

    if (!employee?.position) {
      return res.status(400).json({
        success: false,
        message: 'พนักงานยังไม่ได้ถูกกำหนดตำแหน่ง',
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
      where: { id: requestId },
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
      where: { id: requestId },
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

      const maxDayOffPerMonth = Number(employee?.position?.maxDayOffPerMonth || 0)
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