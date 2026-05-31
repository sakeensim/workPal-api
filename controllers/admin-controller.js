const prisma = require("../configs/prisma");
const BANGKOK_TIMEZONE = 'Asia/Bangkok'

const getBangkokDateString = (date = new Date()) => {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: BANGKOK_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

const getBangkokMonthRange = (year, month) => {
  const start = new Date(
    `${year}-${String(month).padStart(2, '0')}-01T00:00:00.000+07:00`
  )

  const lastDay = new Date(year, month, 0).getDate()

  const end = new Date(
    `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}T23:59:59.999+07:00`
  )

  return { start, end }
}
//const getClientIP = require("../utils/getClientIP")
// Get all pending requests (both salary advances and day-off requests)
exports.getPendingRequests = async (req, res, next) => {
  try {
    // Verify the user is an admin
    if (req.user.role !== 'ADMIN' && req.user.role !== 'OWNER') {
      return res.status(403).json({ message: "Not authorized" });
    }

    // Get all pending advance salary requests
    const salaryRequests = await prisma.advanceSalary.findMany({
      where: { status: 'PENDING' },
      include: {
        employees: true // Include employee details
      }
    });

    // Get all pending day-off requests
    const dayOffRequests = await prisma.dayOff.findMany({
      where: { status: 'PENDING' },
      include: {
        employees: true // Include employee details
      }
    });

    // Format the response
    const formattedSalaryRequests = salaryRequests.map(req => ({
      id: req.id,
      type: 'salary',
      amount: req.amount,
      requestDate: req.requestDate,
      status: req.status,
      employee: req.employees ? {
        id: req.employees.id,
        firstName: req.employees.firstname,
        lastName: req.employees.lastname,
        profileImage: req.employees.profileImage,
        branchId: req.employees.branchId,
      } : null
    }));

    const formattedDayOffRequests = dayOffRequests.map(req => ({
      id: req.id,
      type: 'dayoff',
      reason: req.reason,
      startDate: req.date,
      endDate: req.date,
      status: req.status,
      employee: req.employees ? { 
        id: req.employees.id,
        firstName: req.employees.firstname,
        lastName: req.employees.lastname,
        profileImage: req.employees.profileImage,
        branchId: req.employees.branchId
      } : null
    }));

    // Combine the requests
    const allRequests = [...formattedSalaryRequests, ...formattedDayOffRequests];

    res.json({ data: allRequests });
  } catch (error) {
    console.error("Error in getPendingRequests:", error);
    next(error);
  }
};

// Approve an advance salary request
exports.approveSalaryRequest = async (req, res, next) => {
  try {
    const { id } = req.params

    if (req.user.role !== 'ADMIN' && req.user.role !== 'OWNER') {
      return res.status(403).json({
        message: 'Not authorized',
      })
    }

    const salaryRequest = await prisma.advanceSalary.findUnique({
      where: {
        id: parseInt(id),
      },
      include: {
        employees: true,
      },
    })

    if (!salaryRequest) {
      return res.status(404).json({
        message: 'Advance salary request not found',
      })
    }

    if (salaryRequest.status !== 'PENDING') {
      return res.status(400).json({
        message: 'Only pending requests can be approved',
      })
    }

    const employee = salaryRequest.employees

    if (!employee) {
      return res.status(404).json({
        message: 'Employee not found',
      })
    }

    const requestDate = new Date(salaryRequest.requestDate)
    const year = requestDate.getFullYear()
    const month = requestDate.getMonth()

    const { start: monthStart, end: monthEnd } =
    getBangkokMonthRange(year, month + 1)

    const approvedThisMonth = await prisma.advanceSalary.aggregate({
      where: {
        employeesId: employee.id,
        status: 'APPROVED',
        requestDate: {
          gte: monthStart,
          lte: monthEnd,
        },
      },
      _sum: {
        amount: true,
      },
    })

    const usedAdvance = Number(approvedThisMonth._sum.amount || 0)
    const baseSalary = Number(employee.baseSalary || 0)
    const requestAmount = Number(salaryRequest.amount)
    const remainingAdvanceSalary = baseSalary - usedAdvance

    if (requestAmount > remainingAdvanceSalary) {
      return res.status(400).json({
        message: `Approve ไม่ได้ เบิกล่วงหน้าได้อีกไม่เกิน ${remainingAdvanceSalary} บาท`,
      })
    }

    const updatedRequest = await prisma.advanceSalary.update({
      where: {
        id: parseInt(id),
      },
      data: {
        status: 'APPROVED',
      },
      include: {
        employees: true,
      },
    })

    res.json({
      message: 'Advance salary request approved successfully',
      data: updatedRequest,
      remainingAdvanceSalary: remainingAdvanceSalary - requestAmount,
    })
  } catch (error) {
    console.error('Error in approveSalaryRequest:', error)
    next(error)
  }
}

exports.rejectSalaryRequest = async (req, res, next) => {
  try {
    const { id } = req.params

    if (req.user.role !== 'ADMIN' && req.user.role !== 'OWNER') {
      return res.status(403).json({
        message: 'Not authorized',
      })
    }

    const salaryRequest = await prisma.advanceSalary.findUnique({
      where: {
        id: parseInt(id),
      },
    })

    if (!salaryRequest) {
      return res.status(404).json({
        message: 'Advance salary request not found',
      })
    }

    if (salaryRequest.status !== 'PENDING') {
      return res.status(400).json({
        message: 'Only pending requests can be rejected',
      })
    }

    const updatedRequest = await prisma.advanceSalary.update({
      where: {
        id: parseInt(id),
      },
      data: {
        status: 'REJECTED',
      },
    })

    res.json({
      message: 'Advance salary request rejected',
      data: updatedRequest,
    })
  } catch (error) {
    console.error('Error in rejectSalaryRequest:', error)
    next(error)
  }
}
// Approve a day-off request
exports.approveDayOffRequest = async (req, res, next) => {
  try {
    const { id } = req.params

    if (req.user.role !== 'ADMIN' && req.user.role !== 'OWNER') {
      return res.status(403).json({
        message: 'Not authorized',
      })
    }

    const dayOffRequest = await prisma.dayOff.findUnique({
      where: {
        id: parseInt(id),
      },
      include: {
        employees: {
          include: {
            position: true,
          },
        },
      },
    })

    if (!dayOffRequest) {
      return res.status(404).json({
        message: 'Day-off request not found',
      })
    }

    if (dayOffRequest.status !== 'PENDING') {
      return res.status(400).json({
        message: 'Only pending requests can be approved',
      })
    }

    if (!dayOffRequest.employees?.position) {
      return res.status(400).json({
        message: 'พนักงานยังไม่ได้ถูกกำหนดตำแหน่ง',
      })
    }

    const remainingDayOffs = Number(
      dayOffRequest.employees.remainingDayOffs || 0
    )

    if (remainingDayOffs <= 0) {
      return res.status(400).json({
        message: 'อนุมัติไม่ได้ วันลาคงเหลือไม่พอ',
      })
    }

    const updatedRequest = await prisma.$transaction(async (tx) => {
      const approved = await tx.dayOff.update({
        where: {
          id: parseInt(id),
        },
        data: {
          status: 'APPROVED',
        },
        include: {
          employees: true,
        },
      })

      await tx.employees.update({
        where: {
          id: dayOffRequest.employeesId,
        },
        data: {
          remainingDayOffs: {
            decrement: 1,
          },
        },
      })

      return approved
    })

    res.json({
      message: 'Day-off request approved successfully',
      data: updatedRequest,
    })
  } catch (error) {
    console.error('Error in approveDayOffRequest:', error)
    next(error)
  }
}

// Reject a day-off request
exports.rejectDayOffRequest = async (req, res, next) => {
  try {
    const { id } = req.params

    if (req.user.role !== 'ADMIN' && req.user.role !== 'OWNER') {
      return res.status(403).json({
        message: 'Not authorized',
      })
    }

    const dayOffRequest = await prisma.dayOff.findUnique({
      where: {
        id: parseInt(id),
      },
    })

    if (!dayOffRequest) {
      return res.status(404).json({
        message: 'Day-off request not found',
      })
    }

    if (dayOffRequest.status !== 'PENDING') {
      return res.status(400).json({
        message: 'Only pending requests can be rejected',
      })
    }

    const updatedRequest = await prisma.dayOff.update({
      where: {
        id: parseInt(id),
      },
      data: {
        status: 'REJECTED',
      },
    })

    res.json({
      message: 'Day-off request rejected',
      data: updatedRequest,
    })
  } catch (error) {
    console.error('Error in rejectDayOffRequest:', error)
    next(error)
  }
}

exports.getEmployeesDashboard = async (req, res, next) => {
  try {
    const { year, month } = req.query

    const dashboardYear = parseInt(year) || new Date().getFullYear()
    const dashboardMonth = parseInt(month) || new Date().getMonth() + 1

    const { start: startDate, end: endDate } = getBangkokMonthRange(
      dashboardYear,
      dashboardMonth
    )

    const holidays = await prisma.storeHoliday.findMany({
      where: {
        date: {
          gte: startDate,
          lte: endDate,
        },
      },
    })

    const employees = await prisma.employees.findMany({
      include: {
        branch: true,
        position: true,
        timetracking: {
          where: {
            date: {
              gte: startDate,
              lte: endDate,
            },
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
        },
        advanceSalary: {
          where: {
            requestDate: {
              gte: startDate,
              lte: endDate,
            },
          },
        },
        salaryRecord: {
          where: {
            month: {
              gte: startDate,
              lte: endDate,
            },
          },
        },
      },
      orderBy: {
        firstname: 'asc',
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

    const selectedMonthKey = `${dashboardYear}-${String(
      dashboardMonth
    ).padStart(2, '0')}`

    const currentMonthKey = todayKey.slice(0, 7)

    const getLastDayToCheck = () => {
      if (selectedMonthKey > currentMonthKey) return 0

      if (selectedMonthKey === currentMonthKey) {
        return Number(todayKey.slice(8, 10))
      }

      return new Date(dashboardYear, dashboardMonth, 0).getDate()
    }

    const lastDayToCheck = getLastDayToCheck()

    const transformedEmployees = employees.map((employee) => {
      const employeeHolidays = holidays.filter(
        (holiday) =>
          Number(holiday.branchId) === Number(employee.branchId)
      )

      const holidayDateKeys = new Set(
        employeeHolidays.map((holiday) =>
          toBangkokDateKey(holiday.date)
        )
      )

      const approvedAdvanceSalary = (employee.advanceSalary || []).filter(
        (advance) => advance.status === 'APPROVED'
      )

      const advanceTaken = approvedAdvanceSalary.reduce(
        (sum, advance) => sum + Number(advance.amount || 0),
        0
      )

      const salaryRecordForMonth = employee.salaryRecord.find((record) => {
        const recordDate = new Date(record.month)

        return (
          recordDate.getFullYear() === dashboardYear &&
          recordDate.getMonth() === dashboardMonth - 1
        )
      })

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
          lateMinutes: record.lateMinutes || 0,
          earlyLeaveMinutes: record.earlyLeaveMinutes || 0,
          checkInNote: record.checkInNote || null,
          checkOutNote: record.checkOutNote || null,
        })
      })

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

      employeeHolidays.forEach((holiday) => {
        const key = toBangkokDateKey(holiday.date)
        const dayNumber = Number(key.slice(8, 10))

        if (
          key.slice(0, 7) === selectedMonthKey &&
          dayNumber <= lastDayToCheck
        ) {
          attendanceLogs.push({
            date: key,
            status: 'HOLIDAY',
            reason: holiday.title || 'Store holiday',
          })
        }
      })

      for (let day = 1; day <= lastDayToCheck; day++) {
        const dateKey = `${dashboardYear}-${String(
          dashboardMonth
        ).padStart(2, '0')}-${String(day).padStart(2, '0')}`

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

      const absentDays = attendanceLogs.filter(
        (log) => log.status === 'ABSENT'
      ).length

      attendanceLogs.sort((a, b) => new Date(b.date) - new Date(a.date))

      return {
        id: employee.id,
        email: employee.email,
        firstname: employee.firstname,
        lastname: employee.lastname,
        profileImage: employee.profileImage,
        role: employee.role,

        branchId: employee.branchId,
        branch: employee.branch,

        positionId: employee.positionId,
        position: employee.position,

        baseSalary: employee.baseSalary || 0,
        remainingDayOffs: employee.position
          ? Number(employee.remainingDayOffs || 0)
          : 0,

        timetracking: employee.timetracking || [],
        dayOff: employee.dayOff || [],
        dayOffsTaken: employee.dayOff || [],
        advanceSalary: employee.advanceSalary || [],

        attendanceLogs,
        absentDays,

        advanceTaken,

        finalSalary: salaryRecordForMonth
          ? Number(salaryRecordForMonth.finalSalary || 0)
          : Number(employee.baseSalary || 0) - advanceTaken,
      }
    })

    res.status(200).json(transformedEmployees)
  } catch (error) {
    console.error('Error fetching employee dashboard data:', error)

    res.status(500).json({
      message: 'Failed to fetch employee dashboard data',
      error: error.message,
    })
  }
}


//get all time tracking records for an employee
exports.getTimetracking = async (req, res, next) => {
  try {
    const {
      month,
      year,
      branchId,
      page = 1,
      limit = 50,
    } = req.query

    if (!month || !year) {
      return res.status(400).json({
        success: false,
        message: 'Both month and year are required',
      })
    }

    const monthNum = parseInt(month, 10)
    const yearNum = parseInt(year, 10)
    const pageNum = Math.max(parseInt(page, 10) || 1, 1)
    const limitNum = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100)
    const skip = (pageNum - 1) * limitNum

    if (
      isNaN(monthNum) ||
      monthNum < 1 ||
      monthNum > 12 ||
      isNaN(yearNum)
    ) {
      return res.status(400).json({
        success: false,
        message: 'Invalid month or year',
      })
    }

    const { start: startDate, end: endDate } =
      getBangkokMonthRange(yearNum, monthNum)

    const where = {
      date: {
        gte: startDate,
        lte: endDate,
      },
      checkIn: {
        not: null,
      },
      checkOut: {
        not: null,
      },
    }

    if (branchId && branchId !== 'all') {
      where.employees = {
        is: {
          branchId: parseInt(branchId, 10),
        },
      }
    }

    const user = req.user

    if (user.role !== 'ADMIN' && user.role !== 'OWNER') {
      where.employeesId = user.id
    }

    const [total, timeRecords] = await prisma.$transaction([
      prisma.timeTracking.count({
        where,
      }),

      prisma.timeTracking.findMany({
        where,
        skip,
        take: limitNum,
        orderBy: {
          checkIn: 'desc',
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
              branch: true,
            },
          },
        },
      }),
    ])

    return res.status(200).json({
      success: true,
      data: timeRecords,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
      message: 'All time records fetched successfully',
    })
  } catch (error) {
    console.error('Error fetching time records summary:', error)

    return res.status(500).json({
      success: false,
      message: 'Server error while fetching time records summary',
      error: error.message,
    })
  }
}
