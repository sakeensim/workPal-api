const cron = require('node-cron')
const prisma = require('../configs/prisma')

const getBangkokNow = () => {
  const now = new Date()

  return new Date(
    now.toLocaleString('en-US', {
      timeZone: 'Asia/Bangkok',
    })
  )
}

cron.schedule(
  '0 0 1 * *',
  async () => {
    try {
      console.log('Resetting monthly day off...')

      const bangkokNow = getBangkokNow()
      const currentMonth = bangkokNow.getMonth() + 1
      const currentYear = bangkokNow.getFullYear()

      const employees = await prisma.employees.findMany({
        include: {
          position: true,
        },
      })

      for (const employee of employees) {
        if (!employee.position) continue

        await prisma.employees.update({
          where: {
            id: employee.id,
          },
          data: {
            remainingDayOffs: employee.position.maxDayOffPerMonth,
            lastDayOffResetMonth: currentMonth,
            lastDayOffResetYear: currentYear,
          },
        })
      }

      console.log('Monthly day off reset completed')
    } catch (error) {
      console.error('Cron reset error:', error)
    }
  },
  {
    timezone: 'Asia/Bangkok',
  }
)