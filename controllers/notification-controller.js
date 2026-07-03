const prisma = require('../configs/prisma')

const getActiveEmployeeWhere = () => ({
  isActive: true,
  isDeleted: false,
})

const getCurrentEmployee = async (userId) => {
  if (!userId) return null

  return prisma.employees.findFirst({
    where: {
      id: Number(userId),
      ...getActiveEmployeeWhere(),
    },
    select: {
      id: true,
    },
  })
}

exports.getMyNotifications = async (req, res, next) => {
  try {
    const employee = await getCurrentEmployee(req.user.id)

    if (!employee) {
      return res.status(403).json({
        message: 'บัญชีนี้ถูกปิดใช้งานแล้ว',
      })
    }

    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 100)
    const unreadOnly = req.query.unreadOnly === 'true'

    const where = {
      employeesId: employee.id,
      employees: {
        is: getActiveEmployeeWhere(),
      },
    }

    if (unreadOnly) {
      where.isRead = false
    }

    const [notifications, unreadCount] = await Promise.all([
      prisma.notificationRecipient.findMany({
        where,
        include: {
          notification: {
            include: {
              createdBy: {
                select: {
                  id: true,
                  firstname: true,
                  lastname: true,
                  profileImage: true,
                  role: true,
                  isActive: true,
                  isDeleted: true,
                },
              },
              branch: {
                select: {
                  id: true,
                  name: true,
                  code: true,
                  isActive: true,
                  isDeleted: true,
                },
              },
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
        take: limit,
      }),

      prisma.notificationRecipient.count({
        where: {
          employeesId: employee.id,
          employees: {
            is: getActiveEmployeeWhere(),
          },
          isRead: false,
        },
      }),
    ])

    const data = notifications.map((item) => {
      const branch = item.notification?.branch

      const activeBranch =
        branch && branch.isActive && !branch.isDeleted
          ? {
              id: branch.id,
              name: branch.name,
              code: branch.code,
            }
          : null

      const createdBy = item.notification?.createdBy

      const activeCreatedBy =
        createdBy && createdBy.isActive && !createdBy.isDeleted
          ? {
              id: createdBy.id,
              firstname: createdBy.firstname,
              lastname: createdBy.lastname,
              profileImage: createdBy.profileImage,
              role: createdBy.role,
            }
          : null

      return {
        id: item.id,
        notificationId: item.notificationId,
        isRead: item.isRead,
        readAt: item.readAt,
        createdAt: item.createdAt,

        type: item.notification?.type,
        title: item.notification?.title,
        message: item.notification?.message,
        link: item.notification?.link,
        entity: item.notification?.entity,
        entityId: item.notification?.entityId,
        targetType: item.notification?.targetType,

        notificationCreatedAt: item.notification?.createdAt,
        createdBy: activeCreatedBy,
        branch: activeBranch,
      }
    })

    res.json({
      message: 'Get notifications success',
      unreadCount,
      data,
    })
  } catch (error) {
    console.error('Error getMyNotifications:', error)
    next(error)
  }
}

exports.markNotificationAsRead = async (req, res, next) => {
  try {
    const employee = await getCurrentEmployee(req.user.id)

    if (!employee) {
      return res.status(403).json({
        message: 'บัญชีนี้ถูกปิดใช้งานแล้ว',
      })
    }

    const { id } = req.params
    const notificationRecipientId = Number(id)

    if (!notificationRecipientId) {
      return res.status(400).json({
        message: 'Invalid notification id',
      })
    }

    const notification = await prisma.notificationRecipient.findFirst({
      where: {
        id: notificationRecipientId,
        employeesId: employee.id,
        employees: {
          is: getActiveEmployeeWhere(),
        },
      },
    })

    if (!notification) {
      return res.status(404).json({
        message: 'Notification not found',
      })
    }

    if (notification.isRead) {
      return res.json({
        message: 'Notification already read',
        data: notification,
      })
    }

    const updated = await prisma.notificationRecipient.update({
      where: {
        id: notificationRecipientId,
      },
      data: {
        isRead: true,
        readAt: new Date(),
      },
    })

    res.json({
      message: 'Notification marked as read',
      data: updated,
    })
  } catch (error) {
    console.error('Error markNotificationAsRead:', error)
    next(error)
  }
}

exports.markAllNotificationsAsRead = async (req, res, next) => {
  try {
    const employee = await getCurrentEmployee(req.user.id)

    if (!employee) {
      return res.status(403).json({
        message: 'บัญชีนี้ถูกปิดใช้งานแล้ว',
      })
    }

    const result = await prisma.notificationRecipient.updateMany({
      where: {
        employeesId: employee.id,
        employees: {
          is: getActiveEmployeeWhere(),
        },
        isRead: false,
      },
      data: {
        isRead: true,
        readAt: new Date(),
      },
    })

    res.json({
      message: 'All notifications marked as read',
      updatedCount: result.count,
    })
  } catch (error) {
    console.error('Error markAllNotificationsAsRead:', error)
    next(error)
  }
}