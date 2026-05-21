const getClientIP = (req) => {
  const forwarded = req.headers['x-forwarded-for']

  if (forwarded) {
    return forwarded.split(',')[0].trim()
  }

  return req.ip || req.socket.remoteAddress
}

module.exports = getClientIP