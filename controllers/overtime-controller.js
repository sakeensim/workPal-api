const prisma = require('../configs/prisma')

const getBangkokDateString = (date = new Date()) => {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

const getBangkokDayStart = (date = new Date()) => {
  const bangkokDate = getBangkokDateString(date)
  return new Date(`${bangkokDate}T00:00:00.000+07:00`)
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

    if (!employee) {
      return res.status(404).json({
        message: 'Employee not found',
      })
    }

    if (!employee.branch) {
      return res.status(400).json({
        message: 'พนักงานยังไม่ได้ถูกกำหนดสาขา',
      })
    }

    if (!employee.position) {
      return res.status(400).json({
        message: 'พนักงานยังไม่ได้ถูกกำหนดตำแหน่ง',
      })
    }

    if (!employee.position.allowOT) {
      return res.status(400).json({
        message: 'ตำแหน่งนี้ไม่สามารถทำ OT ได้',
      })
    }

    const otCapMinutes = Number(employee.position.otCapMinutes || 0)

    if (otCapMinutes <= 0) {
      return res.status(400).json({
        message: 'ตำแหน่งนี้ยังไม่ได้กำหนด OT cap',
      })
    }

    const now = new Date()

    const latestOvertime = await prisma.overtimeTracking.findFirst({
      where: {
        employeesId: Number(userId),
        status: {
          not: 'CANCELLED',
        },
      },
      orderBy: {
        checkIn: 'desc',
      },
    })

    if (latestOvertime) {
      if (latestOvertime.checkOut) {
        const minutesAfterLastCheckout = calculateMinutes(
          latestOvertime.checkOut,
          now
        )

        if (minutesAfterLastCheckout <= 180) {
          return res.status(400).json({
            message: 'ต้องห่างจาก OT รอบล่าสุดเกิน 3 ชั่วโมงก่อนเริ่ม OT ใหม่',
            minutesAfterLastCheckout,
          })
        }
      } else {
        const activeLimitTime = addMinutes(
          latestOvertime.checkIn,
          otCapMinutes + 180
        )

        if (now <= activeLimitTime) {
          return res.status(400).json({
            message: 'คุณมี OT ที่ยังไม่ได้จบอยู่',
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
    }

    const latestWorkTime = await prisma.timeTracking.findFirst({
      where: {
        employeesId: Number(userId),
        checkIn: {
          not: null,
        },
      },
      include: {
        shift: true,
      },
      orderBy: {
        checkIn: 'desc',
      },
    })

    if (latestWorkTime && !latestWorkTime.checkOut) {
      const latestShift = latestWorkTime.shift

      if (latestShift?.checkInTime) {
        const [shiftStartHour, shiftStartMinute] = latestShift.checkInTime
          .split(':')
          .map(Number)

        const windowStart = new Date(now)

        windowStart.setHours(shiftStartHour)
        windowStart.setMinutes(shiftStartMinute)
        windowStart.setSeconds(0)
        windowStart.setMilliseconds(0)

        windowStart.setMinutes(windowStart.getMinutes() - 30)

        const windowEnd = new Date(windowStart)
        windowEnd.setHours(windowEnd.getHours() + 24)

        if (now < windowStart) {
          windowStart.setDate(windowStart.getDate() - 1)
          windowEnd.setDate(windowEnd.getDate() - 1)
        }

        const checkInTime = new Date(latestWorkTime.checkIn)

        const isSameShiftWindow =
          checkInTime >= windowStart && checkInTime < windowEnd

        if (isSameShiftWindow) {
          return res.status(400).json({
            message: 'กรุณา Check-out งานปกติก่อนเริ่ม OT',
            shiftCheckIn: latestWorkTime.checkIn,
            shiftCheckInTime: latestShift.checkInTime,
            windowStart,
            windowEnd,
          })
        }
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

    if (!employee.position.allowOT) {
      return res.status(400).json({
        message: 'ตำแหน่งนี้ไม่สามารถทำ OT ได้',
      })
    }

    const otCapMinutes = Number(employee.position.otCapMinutes || 0)

    if (otCapMinutes <= 0) {
      return res.status(400).json({
        message: 'ตำแหน่งนี้ยังไม่ได้กำหนด OT cap',
      })
    }

    const activeOvertime = await prisma.overtimeTracking.findFirst({
      where: {
        employeesId: Number(userId),
        status: 'ACTIVE',
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
      return res.status(400).json({
        message: 'เลยเวลาที่สามารถจบ OT ได้ กรุณาติดต่อแอดมิน',
        endAllowedTime,
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

    const overtime = await prisma.overtimeTracking.findFirst({
      where: {
        employeesId: Number(userId),
        status: 'ACTIVE',
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

    const where = {
      employeesId: Number(userId),
    }

    if (status && status !== 'all') {
      where.status = status
    }

    if (month && year) {
      const start = new Date(
        `${year}-${String(month).padStart(2, '0')}-01T00:00:00.000+07:00`
      )

      const lastDay = new Date(Number(year), Number(month), 0).getDate()

      const end = new Date(
        `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(
          2,
          '0'
        )}T23:59:59.999+07:00`
      )

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
      .filter((item) => item.status === 'COMPLETED')
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
    const { branchId, employeeId, status, month, year } = req.query

    const where = {}

    if (branchId && branchId !== 'all') {
      where.branchId = Number(branchId)
    }

    if (employeeId && employeeId !== 'all') {
      where.employeesId = Number(employeeId)
    }

    if (status && status !== 'all') {
      where.status = status
    }

    if (month && year) {
      const start = new Date(
        `${year}-${String(month).padStart(2, '0')}-01T00:00:00.000+07:00`
      )

      const lastDay = new Date(Number(year), Number(month), 0).getDate()

      const end = new Date(
        `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(
          2,
          '0'
        )}T23:59:59.999+07:00`
      )

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
          },
        },
      },
      orderBy: {
        checkIn: 'desc',
      },
    })

    const totalOtMinutes = overtimes
      .filter((item) => item.status === 'COMPLETED')
      .reduce((sum, item) => sum + Number(item.otMinutes || 0), 0)

    res.json({
      data: overtimes,
      totalOtMinutes,
    })
  } catch (error) {
    next(error)
  }
}

exports.cancelOvertime = async (req, res, next) => {
  try {
    const { id } = req.params

    const overtime = await prisma.overtimeTracking.findUnique({
      where: {
        id: Number(id),
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

    const result = await prisma.overtimeTracking.update({
      where: {
        id: Number(id),
      },
      data: {
        status: 'CANCELLED',
        otMinutes: 0,
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
          },
        },
      },
    })

    res.json({
      message: 'Cancel overtime success',
      data: result,
    })
  } catch (error) {
    next(error)
  }
}