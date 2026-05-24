/*const prisma = require("../configs/prisma")

exports.createLocation = async (req, res, next) => {
  try {
    const { name, lat, lng, radius } = req.body

    await prisma.checkInLocation.updateMany({
      data: { isActive: false },
    })

    const location = await prisma.checkInLocation.create({
      data: {
        name,
        lat: Number(lat),
        lng: Number(lng),
        radius: Number(radius || 100),
        isActive: true,
      },
    })

    res.json({ message: "Create location success", location })
  } catch (error) {
    next(error)
  }
}

exports.getActiveLocation = async (req, res, next) => {
  try {
    const location = await prisma.checkInLocation.findFirst({
      where: { isActive: true },
    })

    res.json({ location })
  } catch (error) {
    next(error)
  }
}*/