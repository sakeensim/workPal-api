const adminAuth = (req, res, next) => {
  if (
    req.user.role !== 'ADMIN' &&
    req.user.role !== 'OWNER'
  ) {
    return res.status(403).json({
      message: 'Admin access only',
    })
  }

  next()
}

module.exports = adminAuth