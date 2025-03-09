const prisma = require("../configs/prisma");

// Get all pending requests (both salary advances and day-off requests)
exports.getPendingRequests = async (req, res, next) => {
  try {
    // Verify the user is an admin
    if (req.user.role !== 'ADMIN') {
      return res.status(403).json({ message: "Not authorized" });
    }

    // Get all pending advance salary requests
    const salaryRequests = await prisma.advanceSalary.findMany({
      where: { status: 'PENDING' },
      include: {
        employees: true // Include employee details
      }
    });

    // Get all pending day-off requests
    const dayOffRequests = await prisma.dayOff.findMany({
      where: { status: 'PENDING' },
      include: {
        employees: true // Include employee details
      }
    });

    // Format the response
    const formattedSalaryRequests = salaryRequests.map(req => ({
      id: req.id,
      type: 'salary',
      amount: req.amount,
      requestDate: req.requestDate,
      status: req.status,
      employee: req.employees ? {
        id: req.employees.id,
        firstName: req.employees.firstName,
        lastName: req.employees.lastName,
        profileImage: req.employees.profileImage
      } : null
    }));

    const formattedDayOffRequests = dayOffRequests.map(req => ({
      id: req.id,
      type: 'dayoff',
      reason: req.reason,
      startDate: req.date,
      endDate: req.date,
      status: req.status,
      employee: req.employees ? { // Changed from req.user to req.employees to match the relation
        id: req.employees.id,
        firstName: req.employees.firstName,
        lastName: req.employees.lastName,
        profileImage: req.employees.profileImage
      } : null
    }));

    // Combine the requests
    const allRequests = [...formattedSalaryRequests, ...formattedDayOffRequests];

    res.json({ data: allRequests });
  } catch (error) {
    console.error("Error in getPendingRequests:", error);
    next(error);
  }
};

// Approve an advance salary request
exports.approveSalaryRequest = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Verify the user is an admin
    if (req.user.role !== 'ADMIN') {
      return res.status(403).json({ message: "Not authorized" });
    }

    const updatedRequest = await prisma.advanceSalary.update({
      where: { id: parseInt(id) },
      data: { status: 'APPROVED' }
    });

    res.json({
      message: "Advance salary request approved successfully",
      data: updatedRequest
    });
  } catch (error) {
    console.error("Error in approveSalaryRequest:", error);
    next(error);
  }
};

// Reject an advance salary request
exports.rejectSalaryRequest = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Verify the user is an admin
    if (req.user.role !== 'ADMIN') {
      return res.status(403).json({ message: "Not authorized" });
    }

    const updatedRequest = await prisma.advanceSalary.update({
      where: { id: parseInt(id) },
      data: { status: 'REJECTED' }
    });

    res.json({
      message: "Advance salary request rejected",
      data: updatedRequest
    });
  } catch (error) {
    console.error("Error in rejectSalaryRequest:", error);
    next(error);
  }
};

// Approve a day-off request
exports.approveDayOffRequest = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Verify the user is an admin
    if (req.user.role !== 'ADMIN') {
      return res.status(403).json({ message: "Not authorized" });
    }

    const updatedRequest = await prisma.dayOff.update({
      where: { id: parseInt(id) },
      data: { status: 'APPROVED' }
    });

    res.json({
      message: "Day-off request approved successfully",
      data: updatedRequest
    });
  } catch (error) {
    console.error("Error in approveDayOffRequest:", error);
    next(error);
  }
};

// Reject a day-off request
exports.rejectDayOffRequest = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Verify the user is an admin
    if (req.user.role !== 'ADMIN') {
      return res.status(403).json({ message: "Not authorized" });
    }

    const updatedRequest = await prisma.dayOff.update({
      where: { id: parseInt(id) },
      data: { status: 'REJECTED' }
    });

    res.json({
      message: "Day-off request rejected",
      data: updatedRequest
    });
  } catch (error) {
    console.error("Error in rejectDayOffRequest:", error);
    next(error);
  }
};