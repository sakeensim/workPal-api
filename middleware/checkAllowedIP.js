const prisma = require('../configs/prisma')
const getClientIP = require('../utils/getClientIP')

exports.checkAllowedIP = async (req, res, next) => {
  try {

    const clientIP = getClientIP(req)

    console.log('Client IP:', clientIP)

    const allowedIP = await prisma.allowedIP.findUnique({
      where: {
        id: 1
      }
    })

    if (!allowedIP) {
      return res.status(403).json({
        message: 'No office IP configured'
      })
    }

    if (allowedIP.ipAddress !== clientIP) {
      return res.status(403).json({
        message: 'This Wi-Fi/IP is not allowed',
        clientIP
      })
    }

    next()

  } catch (error) {

    console.log(error)

    res.status(500).json({
      message: 'IP check failed'
    })

  }
}