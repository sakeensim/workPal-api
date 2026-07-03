const prisma = require('../configs/prisma')

const VALID_TARGET_TYPES = ['USER', 'ADMIN', 'OWNER', 'ALL', 'BRANCH']

const getUniqueIds = (ids = []) => {
  return [...new Set(ids.map(Number).filter(Boolean))]
}

const getRecipientIds = async (tx, { targetType, targetUserIds, branchId }) => {
  if (targetType === 'USER') {
    const users = await tx.employees.findMany({
      where: {
        id: {
          in: getUniqueIds(targetUserIds),
        },
        isActive: true,
        isDeleted: false,
      },
      select: {
        id: true,
      },
    })

    return users.map((user) => user.id)
  }

  if (targetType === 'ADMIN') {
    const admins = await tx.employees.findMany({
      where: {
        role: {
          in: ['ADMIN', 'OWNER'],
        },
        isActive: true,
        isDeleted: false,
      },
      select: {
        id: true,
      },
    })

    return admins.map((user) => user.id)
  }

  if (targetType === 'OWNER') {
    const owners = await tx.employees.findMany({
      where: {
        role: 'OWNER',
        isActive: true,
        isDeleted: false,
      },
      select: {
        id: true,
      },
    })

    return owners.map((user) => user.id)
  }

  if (targetType === 'ALL') {
    const users = await tx.employees.findMany({
      where: {
        isActive: true,
        isDeleted: false,
      },
      select: {
        id: true,
      },
    })

    return users.map((user) => user.id)
  }

  if (targetType === 'BRANCH') {
    if (!branchId) {
      throw new Error('branchId is required for BRANCH notification')
    }

    const users = await tx.employees.findMany({
      where: {
        branchId: Number(branchId),
        isActive: true,
        isDeleted: false,
      },
      select: {
        id: true,
      },
    })

    return users.map((user) => user.id)
  }

  return []
}

exports.createNotification = async ({
  type,
  title,
  message = null,
  link = null,
  entity = null,
  entityId = null,
  targetType = 'USER',
  targetUserIds = [],
  branchId = null,
  createdById = null,
  excludeUserIds = [],
}) => {
  if (!type || !title) {
    throw new Error('Notification type and title are required')
  }

  if (!VALID_TARGET_TYPES.includes(targetType)) {
    throw new Error(`Invalid notification targetType: ${targetType}`)
  }

  return prisma.$transaction(async (tx) => {
    const rawRecipientIds = await getRecipientIds(tx, {
      targetType,
      targetUserIds,
      branchId,
    })

    const excludedIds = getUniqueIds(excludeUserIds)

    const recipientIds = getUniqueIds(rawRecipientIds).filter(
      (id) => !excludedIds.includes(id)
    )

    const notification = await tx.notification.create({
      data: {
        type,
        title,
        message,
        link,
        entity,
        entityId: entityId ? Number(entityId) : null,
        targetType,
        branchId: branchId ? Number(branchId) : null,
        createdById: createdById ? Number(createdById) : null,
      },
    })

    if (recipientIds.length > 0) {
      await tx.notificationRecipient.createMany({
        data: recipientIds.map((employeesId) => ({
          notificationId: notification.id,
          employeesId,
        })),
        skipDuplicates: true,
      })
    }

    return {
      ...notification,
      recipientCount: recipientIds.length,
    }
  })
}