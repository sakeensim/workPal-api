const prisma = require('../configs/prisma')

exports.createBranch = async (req, res, next) => {
  try {
    const {
      name,
      code,
      address,
      lat,
      lng,
      radius,
    } = req.body

    const branch = await prisma.branch.create({
      data: {
        name,
        code,
        address,
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

    const {
      name,
      code,
      address,
      lat,
      lng,
      radius,
      isActive,
    } = req.body

    const branch = await prisma.branch.update({
      where: {
        id: Number(id),
      },
      data: {
        name,
        code,
        address,
        lat: Number(lat),
        lng: Number(lng),
        radius: radius ? Number(radius) : 100,
        isActive,
      },
    })

    res.json({
      message: 'Update branch success',
      data: branch,
    })
  } catch (error) {
    next(error)
  }
}

exports.deleteBranch = async (req, res, next) => {
  try {
    const { id } = req.params

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