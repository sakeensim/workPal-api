const cloudinary = require("../configs/cloudinary")
const prisma = require("../configs/prisma")

const getBangkokMonthRange = (year, month) => {
  const start = new Date(
    `${year}-${String(month).padStart(2, '0')}-01T00:00:00.000+07:00`
  )

  const lastDay = new Date(year, month, 0).getDate()

  const end = new Date(
    `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(
      2,
      '0'
    )}T23:59:59.999+07:00`
  )

  return { start, end }
}

exports.listUsers = async (req, res, next) => {
  try {
    const users = await prisma.employees.findMany({
      include: {
        branch: true,
        position: true,
      },
      orderBy: {
        firstname: 'asc',
      },
    })

    res.json({ result: users })
  } catch (error) {
    next(error)
  }
}

exports.updateRole = async (req, res, next) => {
  try {
    const { id, role } = req.body

    await prisma.employees.update({
      where: { id: Number(id) },
      data: { role },
    })

    res.json({ message: 'Update Success' })
  } catch (error) {
    next(error)
  }
}

exports.deleteUser = async (req, res, next) => {
  try {
    const { id } = req.params

    await prisma.employees.delete({
      where: {
        id: Number(id),
      },
    })

    res.json({ message: 'Delete Success' })
  } catch (error) {
    next(error)
  }
}

exports.uploadImg = async (req, res, next) => {
  try {
    const { id } = req.user

    const result = await cloudinary.uploader.upload(req.body.image, {
      folder: 'profile',
      public_id: Date.now().toString(),
    })

    const updatedUser = await prisma.employees.update({
      where: { id: Number(id) },
      data: {
        profileImage: result.secure_url,
        publicId: result.public_id,
      },
    })

    res.json({
      message: 'Upload image success',
      result,
      user: updatedUser,
    })
  } catch (error) {
    next(error)
  }
}

exports.updateProfile = async (req, res, next) => {
  try {
    const { id } = req.params
    const { firstname, lastname, phone, emergencyContact, image } = req.body

    const data = {
      firstname,
      lastname,
      phone,
      emergencyContact,
    }

    if (image?.secure_url) {
      data.profileImage = image.secure_url
      data.publicId = image.public_id
    }

    await prisma.employees.update({
      where: { id: Number(id) },
      data,
    })

    res.json({ message: 'Update Profile Success' })
  } catch (error) {
    next(error)
  }
}

exports.myProfile = async (req, res, next) => {
  try {
    const { id } = req.user

    const profile = await prisma.employees.findFirst({
      where: {
        id: Number(id),
      },
      include: {
        branch: true,
        position: true,
      },
    })

    res.json({
      result: profile,
    })
  } catch (error) {
    next(error)
  }
}

exports.getUserApprovedRequests = async (req, res, next) => {
  try {
    const userId = req.user.id

    const approvedSalaryRequests = await prisma.advanceSalary.findMany({
      where: {
        employeesId: userId,
        status: 'APPROVED',
      },
      orderBy: {
        requestDate: 'desc',
      },
    })

    const totalApprovedSalary = approvedSalaryRequests.reduce(
      (sum, item) => sum + Number(item.amount || 0),
      0
    )

    const approvedDayOffRequests = await prisma.dayOff.findMany({
      where: {
        employeesId: userId,
        status: 'APPROVED',
      },
      orderBy: {
        date: 'desc',
      },
    })

    const formattedSalaryRequests = approvedSalaryRequests.map((item) => ({
      id: item.id,
      type: 'salary',
      amount: item.amount,
      requestDate: item.requestDate,
      status: item.status,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    }))

    const formattedDayOffRequests = approvedDayOffRequests.map((item) => ({
      id: item.id,
      type: 'dayoff',
      reason: item.reason,
      date: item.date,
      status: item.status,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    }))

    const allApprovedRequests = [
      ...formattedSalaryRequests,
      ...formattedDayOffRequests,
    ]

    allApprovedRequests.sort(
      (a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)
    )

    res.json({
      data: allApprovedRequests,
      totalSalaryAdvance: totalApprovedSalary,
    })
  } catch (error) {
    next(error)
  }
}

exports.updateBaseSalary = async (req, res, next) => {
  try {
    const { id } = req.params
    const { baseSalary } = req.body

    await prisma.employees.update({
      where: { id: Number(id) },
      data: {
        baseSalary: Number(baseSalary || 0),
      },
    })

    res.json({ message: 'Salary updated successfully' })
  } catch (error) {
    next(error)
  }
}

exports.updateUserBranch = async (req, res, next) => {
  try {
    const { id } = req.params
    const { branchId } = req.body

    await prisma.employees.update({
      where: { id: Number(id) },
      data: {
        branchId: branchId ? Number(branchId) : null,
      },
    })

    res.json({ message: 'Update branch success' })
  } catch (error) {
    next(error)
  }
}

exports.createUser = async (req, res, next) => {
  try {
    const {
      email,
      firstname,
      lastname,
      phone,
      emergencyContact,
      role,
      baseSalary,
      branchId,
      positionId,
    } = req.body

    const existingUser = await prisma.employees.findUnique({
      where: {
        email,
      },
    })

    if (existingUser) {
      return res.status(400).json({
        message: 'Email already exists',
      })
    }

    let position = null

    if (positionId) {
      position = await prisma.position.findUnique({
        where: {
          id: Number(positionId),
        },
      })

      if (!position) {
        return res.status(404).json({
          message: 'Position not found',
        })
      }
    }

    const user = await prisma.employees.create({
      data: {
        email,
        firstname,
        lastname,
        phone,
        emergencyContact,
        role: role || 'USER',
        baseSalary: baseSalary ? Number(baseSalary) : 0,
        branchId: branchId ? Number(branchId) : null,
        positionId: positionId ? Number(positionId) : null,
        remainingDayOffs: position
          ? Number(position.maxDayOffPerMonth || 0)
          : 0,
      },
      include: {
        branch: true,
        position: true,
      },
    })

    res.json({
      message: 'Create user success',
      result: user,
    })
  } catch (error) {
    next(error)
  }
}

exports.updateUserPosition = async (req, res, next) => {
  try {
    const { id } = req.params
    const { positionId } = req.body

    const employeeId = Number(id)
    const newPositionId = positionId ? Number(positionId) : null

    const employee = await prisma.employees.findUnique({
      where: {
        id: employeeId,
      },
    })

    if (!employee) {
      return res.status(404).json({
        message: 'Employee not found',
      })
    }

    const position = newPositionId
      ? await prisma.position.findUnique({
          where: {
            id: newPositionId,
          },
        })
      : null

    if (newPositionId && !position) {
      return res.status(404).json({
        message: 'Position not found',
      })
    }

    let remainingDayOffs = 0

    if (position) {
      const now = new Date()

      const year = now.getFullYear()
      const month = now.getMonth()

      const monthStart = new Date(year, month, 1)
      const monthEnd = new Date(year, month + 1, 0, 23, 59, 59, 999)

      const approvedDayOffsThisMonth = await prisma.dayOff.count({
        where: {
          employeesId: employeeId,
          status: 'APPROVED',
          date: {
            gte: monthStart,
            lte: monthEnd,
          },
        },
      })

      const maxDayOffPerMonth = Number(position.maxDayOffPerMonth || 0)

      remainingDayOffs = Math.max(
        0,
        maxDayOffPerMonth - approvedDayOffsThisMonth
      )
    }

    const updatedEmployee = await prisma.employees.update({
      where: {
        id: employeeId,
      },
      data: {
        positionId: newPositionId,
        remainingDayOffs,
      },
      include: {
        position: true,
        branch: true,
      },
    })

    res.json({
      message: 'Update user position success',
      data: updatedEmployee,
    })
  } catch (error) {
    next(error)
  }
}

exports.getUserHistory = async (req, res, next) => {
  try {
    const userId = req.user.id
    const { month, year } = req.query

    const monthNum = parseInt(month) || new Date().getMonth() + 1
    const yearNum = parseInt(year) || new Date().getFullYear()

    const { start: startDate, end: endDate } = getBangkokMonthRange(
      yearNum,
      monthNum
    )

    const employee = await prisma.employees.findUnique({
      where: { id: Number(userId) },
      include: {
        position: true,
        branch: true,

        timetracking: {
          where: {
            date: {
              gte: startDate,
              lte: endDate,
            },
          },
          include: {
            shift: true,
          },
          orderBy: {
            checkIn: 'desc',
          },
        },

        overtimeTrackings: {
          where: {
            date: {
              gte: startDate,
              lte: endDate,
            },
          },
          include: {
            branch: true,
          },
          orderBy: {
            checkIn: 'desc',
          },
        },

        dayOff: {
          where: {
            date: {
              gte: startDate,
              lte: endDate,
            },
          },
          orderBy: {
            date: 'desc',
          },
        },

        advanceSalary: {
          where: {
            requestDate: {
              gte: startDate,
              lte: endDate,
            },
          },
          orderBy: {
            requestDate: 'desc',
          },
        },
      },
    })

    if (!employee) {
      return res.status(404).json({
        message: 'Employee not found',
      })
    }

    const holidays = await prisma.storeHoliday.findMany({
      where: {
        branchId: employee.branchId || undefined,
        date: {
          gte: startDate,
          lte: endDate,
        },
      },
    })

    const toBangkokDateKey = (date) => {
      return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Bangkok',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(new Date(date))
    }

    const todayKey = toBangkokDateKey(new Date())

    const selectedMonthKey = `${yearNum}-${String(monthNum).padStart(2, '0')}`
    const currentMonthKey = todayKey.slice(0, 7)

    const getLastDayToCheck = () => {
      if (selectedMonthKey > currentMonthKey) return 0

      if (selectedMonthKey === currentMonthKey) {
        return Number(todayKey.slice(8, 10))
      }

      return new Date(yearNum, monthNum, 0).getDate()
    }

    const lastDayToCheck = getLastDayToCheck()

    const holidayDateKeys = new Set(
      holidays.map((holiday) => toBangkokDateKey(holiday.date))
    )

    const attendanceLogs = []
    const employeeCreatedKey = toBangkokDateKey(employee.createdAt)

    const checkInDateMap = new Map()

    ;(employee.timetracking || []).forEach((record) => {
      const key = toBangkokDateKey(record.date || record.checkIn)

      if (!checkInDateMap.has(key)) {
        checkInDateMap.set(key, record)
      }

      attendanceLogs.push({
        date: key,
        status: 'PRESENT',
        checkIn: record.checkIn,
        checkOut: record.checkOut,
        shiftId: record.shiftId || null,
        shiftName: record.shift?.name || null,
        lateMinutes: record.lateMinutes || 0,
        earlyLeaveMinutes: record.earlyLeaveMinutes || 0,
        checkInNote: record.checkInNote || null,
        checkOutNote: record.checkOutNote || null,
      })
    })

    const overtimeLogs = (employee.overtimeTrackings || []).map((ot) => ({
      id: ot.id,
      date: toBangkokDateKey(ot.date || ot.checkIn),
      checkIn: ot.checkIn,
      checkOut: ot.checkOut,
      noteIn: ot.noteIn || null,
      noteOut: ot.noteOut || null,
      otMinutes: ot.otMinutes || 0,
      status: ot.status,
      branchId: ot.branchId,
      branch: ot.branch || null,
    }))

    const totalOtMinutes = overtimeLogs
      .filter((ot) => ot.status === 'COMPLETED')
      .reduce((sum, ot) => sum + Number(ot.otMinutes || 0), 0)

    const activeOvertime =
      overtimeLogs.find((ot) => ot.status === 'ACTIVE') || null

    const approvedDayOffMap = new Map()

    ;(employee.dayOff || [])
      .filter((dayOff) => dayOff.status === 'APPROVED')
      .forEach((dayOff) => {
        const key = toBangkokDateKey(dayOff.date)

        approvedDayOffMap.set(key, dayOff)

        attendanceLogs.push({
          date: key,
          status: 'DAY_OFF',
          reason: dayOff.reason || null,
        })
      })

    holidays.forEach((holiday) => {
      const key = toBangkokDateKey(holiday.date)
      const dayNumber = Number(key.slice(8, 10))

      if (key.slice(0, 7) === selectedMonthKey && dayNumber <= lastDayToCheck) {
        attendanceLogs.push({
          date: key,
          status: 'HOLIDAY',
          reason: holiday.title || 'Store holiday',
        })
      }
    })

    for (let day = 1; day <= lastDayToCheck; day++) {
      const dateKey = `${yearNum}-${String(monthNum).padStart(2, '0')}-${String(
        day
      ).padStart(2, '0')}`

      if (dateKey < employeeCreatedKey) continue

      const hasCheckIn = checkInDateMap.has(dateKey)
      const hasDayOff = approvedDayOffMap.has(dateKey)
      const isHoliday = holidayDateKeys.has(dateKey)

      if (!hasCheckIn && !hasDayOff && !isHoliday) {
        attendanceLogs.push({
          date: dateKey,
          status: 'ABSENT',
        })
      }
    }

    attendanceLogs.sort((a, b) => new Date(b.date) - new Date(a.date))
    overtimeLogs.sort((a, b) => new Date(b.checkIn) - new Date(a.checkIn))

    const approvedAdvance = employee.advanceSalary
      .filter((item) => item.status === 'APPROVED')
      .reduce((sum, item) => sum + Number(item.amount || 0), 0)

    const workingDays = attendanceLogs.filter(
      (log) => log.status === 'PRESENT'
    ).length

    const absentDays = attendanceLogs.filter(
      (log) => log.status === 'ABSENT'
    ).length

    const approvedDayOffs = attendanceLogs.filter(
      (log) => log.status === 'DAY_OFF'
    ).length

    const lateDays = attendanceLogs.filter(
      (log) => Number(log.lateMinutes || 0) > 0
    ).length

    const earlyDays = attendanceLogs.filter(
      (log) => Number(log.earlyLeaveMinutes || 0) > 0
    ).length

    res.json({
      profile: {
        id: employee.id,
        firstname: employee.firstname,
        lastname: employee.lastname,
        email: employee.email,
        profileImage: employee.profileImage,
        baseSalary: employee.baseSalary || 0,
        branch: employee.branch,
        position: employee.position,
        remainingDayOffs: employee.position
          ? Number(employee.remainingDayOffs || 0)
          : 0,
      },

      summary: {
        workingDays,
        absentDays,
        lateDays,
        earlyDays,
        dayOffs: approvedDayOffs,
        totalOtMinutes,
        advanceTaken: approvedAdvance,
        finalSalary: Number(employee.baseSalary || 0) - approvedAdvance,
      },

      logs: {
        attendanceLogs,
        overtimeLogs,
        activeOvertime,
        timetracking: employee.timetracking,
        overtimeTrackings: employee.overtimeTrackings,
        dayOff: employee.dayOff,
        advanceSalary: employee.advanceSalary,
      },
    })
  } catch (error) {
    next(error)
  }
}