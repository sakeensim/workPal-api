const prisma = require('../configs/prisma')

exports.createBranch = async (req, res, next) => {
  try {
    const { name, code, address, lat, lng, radius } = req.body

    if (!name || !code || lat === undefined || lng === undefined) {
      return res.status(400).json({
        message: 'Name, code, lat and lng are required',
      })
    }

    const branch = await prisma.branch.create({
      data: {
        name,
        code,
        address: address || null,
        lat: Number(lat),
        lng: Number(lng),
        radius: radius ? Number(radius) : 100,
      },
    })

    res.json({
      message: 'Create branch success',
      data: branch,
    })
  } catch (error) {
    if (error.code === 'P2002') {
      return res.status(400).json({
        message: 'Branch code already exists',
      })
    }

    next(error)
  }
}

exports.listBranches = async (req, res, next) => {
  try {
    const branches = await prisma.branch.findMany({
      orderBy: {
        createdAt: 'desc',
      },
    })

    res.json({
      data: branches,
    })
  } catch (error) {
    next(error)
  }
}

exports.updateBranch = async (req, res, next) => {
  try {
    const { id } = req.params
    const { name, code, address, lat, lng, radius, isActive } = req.body

    const oldBranch = await prisma.branch.findUnique({
      where: {
        id: Number(id),
      },
    })

    if (!oldBranch) {
      return res.status(404).json({
        message: 'Branch not found',
      })
    }

    const branch = await prisma.branch.update({
      where: {
        id: Number(id),
      },
      data: {
        name,
        code,
        address: address || null,
        lat: lat !== undefined ? Number(lat) : oldBranch.lat,
        lng: lng !== undefined ? Number(lng) : oldBranch.lng,
        radius: radius !== undefined ? Number(radius) : oldBranch.radius,
        isActive:
          typeof isActive === 'boolean' ? isActive : oldBranch.isActive,
      },
    })

    res.json({
      message: 'Update branch success',
      data: branch,
    })
  } catch (error) {
    if (error.code === 'P2002') {
      return res.status(400).json({
        message: 'Branch code already exists',
      })
    }

    next(error)
  }
}

exports.deleteBranch = async (req, res, next) => {
  try {
    const { id } = req.params

    const branch = await prisma.branch.findUnique({
      where: {
        id: Number(id),
      },
    })

    if (!branch) {
      return res.status(404).json({
        message: 'Branch not found',
      })
    }

    await prisma.branch.delete({
      where: {
        id: Number(id),
      },
    })

    res.json({
      message: 'Delete branch success',
    })
  } catch (error) {
    next(error)
  }
}