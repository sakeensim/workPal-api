const cloudinary = require("../configs/cloudinary")
const prisma = require("../configs/prisma")
//1. list all users
const getBangkokMonthRange = (year, month) => {
  const start = new Date(
    `${year}-${String(month).padStart(2, '0')}-01T00:00:00.000+07:00`
  )

  const end = new Date(
    `${year}-${String(month).padStart(2, '0')}-${String(
      new Date(year, month, 0).getDate()
    ).padStart(2, '0')}T23:59:59.999+07:00`
  )

  return {
    start,
    end,
  }
}
exports.listUsers = async(req,res,next)=>{
        try {
            const users = await prisma.employees.findMany({
                include: { branch: true ,position: true},
                orderBy: { firstname: 'asc' },
            })
            console.log(users)
            res.json({result : users})
        } catch (error) {
            next(error)
            
        }

}
//2. Update Role 
exports.updateRole = async(req,res,next)=>{
    try {
        const {id, role} = req.body
        // อัพเดท role
        await prisma.employees.update({
            where: { id: Number(id) },
            data: { role: role },
        })
        res.json({message: 'Update Success'})
    } catch (error) {
        next(error)
    }
}

//3. Delete User
exports.deleteUser = async (req, res, next) => {
    try {
      const { id } = req.params;
      const deleted = await prisma.employees.delete({
        where: {
          id: Number(id),
        },
      });
      console.log(id);
      res.json({ message: "Delete Success" });
    } catch (error) {
      next(error);
    }
  };

//4. edite image profile
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

//update Profil
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

//update approved status
exports.getUserApprovedRequests = async (req, res, next) => {
    try {
        console.log("Fetching approved requests for user:", req.user);
        const userId = req.user.id;

        // Get approved advance salary requests
        const approvedSalaryRequests = await prisma.advanceSalary.findMany({
            where: { employeesId: userId, status: 'APPROVED' },
            orderBy: { requestDate: 'desc' }
        });

        // Calculate total approved salary sum
        const totalApprovedSalary = approvedSalaryRequests.reduce((sum, req) => sum + Number(req.amount), 0);

        // Get approved day-off requests
        const approvedDayOffRequests = await prisma.dayOff.findMany({
            where: { employeesId: userId, status: 'APPROVED' },
            orderBy: { date: 'desc' }
        });

        // Format the response
        const formattedSalaryRequests = approvedSalaryRequests.map(req => ({
            id: req.id,
            type: 'salary',
            amount: req.amount,
            requestDate: req.requestDate,
            status: req.status,
            createdAt: req.createdAt,
            updatedAt: req.updatedAt
        }));

        const formattedDayOffRequests = approvedDayOffRequests.map(req => ({
            id: req.id,
            type: 'dayoff',
            reason: req.reason,
            date: req.date,
            status: req.status,
            createdAt: req.createdAt,
            updatedAt: req.updatedAt
        }));

        const allApprovedRequests = [...formattedSalaryRequests, ...formattedDayOffRequests];

        // Sort by most recent updates
        allApprovedRequests.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));

        console.log('Approved Requests:', allApprovedRequests);

        res.json({ data: allApprovedRequests, totalSalaryAdvance: totalApprovedSalary });
    } catch (error) {
        console.error("Error in getUserApprovedRequests:", error);
        next(error);
    }
};
exports.updateBaseSalary = async(req,res,next)=>{
    try {
        const {id} = req.params;
        const {baseSalary} = req.body;
        
        await prisma.employees.update({
            where: { id: Number(id) },
            data: { baseSalary: baseSalary.toString() }
        });
        
        res.json({message: 'Salary updated successfully'});
    } catch (error) {
        next(error);
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

    // check existing email
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
    if (positionId) {
        position = await prisma.position.findUnique({
            where: {
            id: Number(positionId),
            },
        })
    }

    // create user
    const user = await prisma.employees.create({
      data: {
        email,
        firstname,
        lastname,
        phone,
        emergencyContact,
        role: role || 'USER',
        baseSalary: baseSalary
          ? Number(baseSalary)
          : null,
        branchId: branchId
        ? Number(branchId)
        : null,

        positionId: positionId
        ? Number(positionId)
        : null,

        remainingDayOffs: position
        ? Number(position.maxDayOffPerMonth || 0)
        : 0,
      },
      include: {
        branch: true,
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

    const position = positionId
      ? await prisma.position.findUnique({
          where: {
            id: Number(positionId),
          },
        })
      : null

    await prisma.employees.update({
      where: {
        id: Number(id),
      },

      data: {
        positionId: positionId
          ? Number(positionId)
          : null,

        remainingDayOffs: position
          ? Number(position.maxDayOffPerMonth || 0)
          : 0,
      },
    })

    res.json({
      message: 'Update position success',
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

    const { start: startDate, end: endDate } =
      getBangkokMonthRange(yearNum, monthNum)

    const holidays = await prisma.storeHoliday.findMany({
      where: {
        date: {
          gte: startDate,
          lte: endDate,
        },
      },
    })

    const employee = await prisma.employees.findUnique({
      where: { id: Number(userId) },
      include: {
        position: true,
        branch: true,

        timetracking: {
          where: {
            date: { gte: startDate, lte: endDate },
          },
          orderBy: { checkIn: 'desc' },
        },

        dayOff: {
          where: {
            date: { gte: startDate, lte: endDate },
          },
          orderBy: { date: 'desc' },
        },

        advanceSalary: {
          where: {
            requestDate: { gte: startDate, lte: endDate },
          },
          orderBy: { requestDate: 'desc' },
        },
      },
    })

    if (!employee) {
      return res.status(404).json({ message: 'Employee not found' })
    }

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
        remainingDayOffs: employee.remainingDayOffs,
      },

      summary: {
        workingDays,
        absentDays,
        lateDays,
        earlyDays,
        dayOffs: approvedDayOffs,
        advanceTaken: approvedAdvance,
        finalSalary: Number(employee.baseSalary || 0) - approvedAdvance,
      },

      logs: {
        attendanceLogs,
        timetracking: employee.timetracking,
        dayOff: employee.dayOff,
        advanceSalary: employee.advanceSalary,
      },
    })
  } catch (error) {
    next(error)
  }
}