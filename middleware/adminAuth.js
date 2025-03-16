const adminAuth = (req, res, next) => {
    try {
        // req.user is set by the previous auth middleware
        if (req.user.role !== 'ADMIN') {
            return res.status(403).json({ message: 'Access denied. Admin privileges required.' });
        }
        next();
    } catch (error) {
        return res.status(500).json({ message: 'Server error in admin authentication.' });
    }
};

module.exports = adminAuth;