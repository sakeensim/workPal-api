// middleware/ownerAuth.js

const ownerAuth = (req, res, next) => {
  if (req.user.role !== 'OWNER') {
    return res.status(403).json({
      message: 'Owner access only',
    })
  }

  next()
}

module.exports = ownerAuth