const createError = require('../utils/createError')
const jwt = require('jsonwebtoken')

exports.authenticate = (req, res, next) => {
  try {
    const authorization = req.headers.authorization

    if (!authorization) {
      return next(createError(401, 'Missing Token'))
    }

    const [type, token] = authorization.split(' ')

    if (type !== 'Bearer' || !token) {
      return next(createError(401, 'Invalid Token Format'))
    }

    if (!process.env.SECRET) {
      return next(createError(500, 'JWT secret is not configured'))
    }

    jwt.verify(token, process.env.SECRET, (err, decode) => {
      console.log(decode)

      if (err) {
        return next(createError(401, 'Unauthorized'))
      }

      if (!decode?.id) {
        return next(createError(401, 'Invalid Token'))
      }

      req.user = decode
      next()
    })
  } catch (error) {
    next(error)
  }
}