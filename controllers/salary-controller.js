const prisma = require("../configs/prisma")

exports.salaryAdvance = async (req, res, next) => {
  try {
    const { date, amount } = req.body

    if (!date || !amount || isNaN(amount) || Number(amount) <= 0) {
      return res.status(400).json({
        message: 'Invalid salary advance request',
      })
    }

    const employee = await prisma.employees.findUnique({
      where: {
        id: req.user.id,
      },
    })

    if (!employee) {
      return res.status(404).json({
        message: 'Employee not found',
      })
    }

    const requestAmount = Number(amount)

    const requestDate = new Date(date)

    const year = requestDate.getFullYear()
    const month = requestDate.getMonth()

    const monthStart = new Date(year, month, 1)
    const monthEnd = new Date(
      year,
      month + 1,
      0,
      23,
      59,
      59,
      999
    )

    const approvedThisMonth =
      await prisma.advanceSalary.aggregate({
        where: {
          employeesId: req.user.id,

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

    const usedAdvance = Number(
      approvedThisMonth._sum.amount || 0
    )

    const baseSalary = Number(employee.baseSalary || 0)
    if (baseSalary <= 0) {
        return res.status(400).json({
            message: 'ยังไม่ได้กำหนดเงินเดือนพื้นฐาน',
        })
    }
    const remainingAdvanceSalary =
      baseSalary - usedAdvance

    if (requestAmount > remainingAdvanceSalary) {
      return res.status(400).json({
        message: `เบิกล่วงหน้าได้อีกไม่เกิน ${remainingAdvanceSalary} บาท`,
      })
    }

    const salaryTaked =
      await prisma.advanceSalary.create({
        data: {
          requestDate,
          amount: requestAmount,
          employeesId: req.user.id,
        },
      })

    res.json({
      message:
        'Salary Advance request was sent to admin',

      data: salaryTaked,

      remainingAdvanceSalary:
        remainingAdvanceSalary - requestAmount,
    })
  } catch (error) {
    console.error('Error in salaryAdvance:', error)
    next(error)
  }
}

exports.updateSalary = async (req, res, next) => {
  try {
    const { id, baseSalary } = req.body

    if (req.user.role !== 'ADMIN' && req.user.role !== 'OWNER') {
      return res.status(403).json({
        message: 'Unauthorized',
      })
    }

    if (!id || isNaN(baseSalary) || Number(baseSalary) < 0) {
      return res.status(400).json({
        message: 'Invalid salary amount',
      })
    }

    const updatedUser = await prisma.employees.update({
      where: {
        id: Number(id),
      },
      data: {
        baseSalary: Number(baseSalary),
      },
    })

    res.status(200).json({
      message: 'Salary updated successfully',
      user: updatedUser,
    })
  } catch (error) {
    console.error('Error updating salary:', error)
    next(error)
  }
}




