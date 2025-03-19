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
      employee: req.employees ? { 
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
      data: { status: 'APPROVED' },
      include:{ employees: true} // Include employee info for notification
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
      data: { status: 'APPROVED' },
      include: {employees: true}
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

exports.getEmployeesDashboard = async (req, res, next) => {
  try {
    const { year, month } = req.query;
    
    // Validate year and month
    const dashboardYear = parseInt(year) || new Date().getFullYear();
    const dashboardMonth = parseInt(month) || new Date().getMonth() + 1;
    
    // Create date objects for the start and end of the month
    const startDate = new Date(dashboardYear, dashboardMonth - 1, 1);
    const endDate = new Date(dashboardYear, dashboardMonth, 0); // Last day of the month
    
    // Get all employees
    const employees = await prisma.employees.findMany({
      include: {
        dayOff: {
          where: {
            date: {
              gte: startDate,
              lte: endDate,
            },
            status: 'APPROVED',
          },
        },
        advanceSalary: {
          where: {
            requestDate: {
              gte: startDate,
              lte: endDate,
            },
            status: 'APPROVED',
          },
        },
        salaryRecord: {
          where: {
            month: {
              gte: startDate,
              lte: endDate,
            },
          },
        },
      },
    });

    // Transform the data for the frontend
    const transformedEmployees = employees.map(employee => {
      // Calculate day offs taken this month
      const dayOffsTaken = employee.dayOff.length;
      
      // Calculate advance salary taken this month
      const advanceTaken = employee.advanceSalary.reduce(
        (sum, advance) => sum + parseFloat(advance.amount), 
        0
      );
      
      // Get or calculate final salary
      let finalSalary = employee.baseSalary - advanceTaken;
      // If we have a salary record for this month, use that instead
      const salaryRecordForMonth = employee.salaryRecord[0];
      if (salaryRecordForMonth) {
        finalSalary = parseFloat(salaryRecordForMonth.finalSalary);
      }
      
      return {
        id: employee.id,
        email: employee.email,
        firstname: employee.firstname,
        lastname: employee.lastname,
        profileImage: employee.profileImage,
        role: employee.role,
        baseSalary: employee.baseSalary || 0,
        remainingDayOffs: employee.remainingDayOffs || 0,
        dayOffsTaken: dayOffsTaken,
        advanceTaken: advanceTaken,
        finalSalary: finalSalary
      };
    });

    res.status(200).json(transformedEmployees);
  } catch (error) {
    next(error)
    console.error('Error fetching employee dashboard data:', error);
    res.status(500).json({ message: 'Failed to fetch employee dashboard data', error: error.message });
  }
};

//get all time tracking records for an employee
exports.getTimetracking = async (req, res, next) => {
  try {
    const { month, year } = req.query;
    
    if (!month || !year) {
      return res.status(400).json({
        success: false,
        message: 'Both month and year are required'
      });
    }
    
    // Validate month and year
    const monthNum = parseInt(month, 10);
    const yearNum = parseInt(year, 10);
    
    if (isNaN(monthNum) || monthNum < 1 || monthNum > 12 || isNaN(yearNum)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid month or year'
      });
    }
    
    // Calculate start and end dates for the month
    const startDate = new Date(yearNum, monthNum - 1, 1);
    const endDate = new Date(yearNum, monthNum, 0, 23, 59, 59);
    
    // Build the query
    const query = {
      where: {
        date: { gte: startDate, lte: endDate },
        checkIn: { not: null },
        checkOut: { not: null }
      },
      select: { 
        id: true, 
        date: true, 
        checkIn: true, 
        checkOut: true,
        employeesId: true
      }
    };
    
    
    
    
    // For admin, fetch all employees' records
    // For regular users, only fetch their own records
    const user = req.user; // Assuming user info is attached by authentication middleware
    
    if (user.role !== 'ADMIN') {
      query.where.employeesId = user.id;
    }
    
    
    const timeRecords = await prisma.timeTracking.findMany(query);
    console.log("Final API Response Data:", timeRecords);
    // Calculate total hours per employee
    const employeeSummary = {};
    
    timeRecords.forEach(record => {
      if (record.checkIn && record.checkOut) {
        const employeeId = record.employeesId;
        const checkInTime = new Date(record.checkIn).getTime();
        const checkOutTime = new Date(record.checkOut).getTime();
        const hoursWorked = (checkOutTime - checkInTime) / (1000 * 60 * 60);
        
        if (!employeeSummary[employeeId]) {
          employeeSummary[employeeId] = {
            employee: record.employees,
            totalHours: 0,
            daysWorked: 0
          };
        }
        
        employeeSummary[employeeId].totalHours += hoursWorked;
        employeeSummary[employeeId].daysWorked += 1;
      }
    });
    
    // Convert to array for response
    const summaryArray = Object.values(employeeSummary).map(entry => ({
      ...entry,
      totalHours: parseFloat(entry.totalHours.toFixed(2))
    }));
    
    return res.status(200).json({
      success: true,
      data: summaryArray,
      message: 'Time records summary fetched successfully'
    });

    
  } catch (error) {
    console.error('Error fetching time records summary:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while fetching time records summary',
      error: error.message
    });
  }
}

// Create API route to handle salary record updates
// exports.updateSalaryRecord = async (req, res,next) => {
//   try {
//     const { employeeId, month, year } = req.params;
//     const { finalSalary } = req.body;
    
//     // Create date for the first day of the specified month
//     const monthDate = new Date(parseInt(year), parseInt(month) - 1, 1);
    
//     // Get employee data
//     const employee = await prisma.employees.findUnique({
//       where: { id: parseInt(employeeId) },
//       include: {
//         advanceSalary: {
//           where: {
//             requestDate: {
//               gte: new Date(parseInt(year), parseInt(month) - 1, 1),
//               lte: new Date(parseInt(year), parseInt(month), 0),
//             },
//             status: 'APPROVED',
//           },
//         },
//       },
//     });

//     if (!employee) {
//       return res.status(404).json({ message: 'Employee not found' });
//     }

//     // Calculate advance salary taken this month
//     const advanceTaken = employee.advanceSalary.reduce(
//       (sum, advance) => sum + parseFloat(advance.amount), 
//       0
//     );

//     // Check if salary record already exists for this month
//     const existingRecord = await prisma.salaryRecord.findFirst({
//       where: {
//         employeesId: parseInt(employeeId),
//         month: {
//           gte: new Date(parseInt(year), parseInt(month) - 1, 1),
//           lte: new Date(parseInt(year), parseInt(month), 0),
//         },
//       },
//     });

//     let salaryRecord;
    
//     if (existingRecord) {
//       // Update existing record
//       salaryRecord = await prisma.salaryRecord.update({
//         where: { id: existingRecord.id },
//         data: {
//           baseSlary: employee.baseSalary.toString(),
//           advanceTaken: advanceTaken.toString(),
//           finalSalary: finalSalary.toString(),
//         },
//       });
//     } else {
//       // Create new record
//       salaryRecord = await prisma.salaryRecord.create({
//         data: {
//           month: monthDate,
//           baseSlary: employee.baseSalary.toString(),
//           advanceTaken: advanceTaken.toString(),
//           finalSalary: finalSalary.toString(),
//           employeesId: parseInt(employeeId),
//         },
//       });
//     }

//     res.status(200).json({ message: 'Salary record updated successfully', data: salaryRecord });
//   } catch (error) {
//     next(error)
//     console.error('Error updating salary record:', error);
//     res.status(500).json({ message: 'Failed to update salary record', error: error.message });
//   }
// };