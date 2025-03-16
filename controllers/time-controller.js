
const prisma = require("../configs/prisma")

exports.checkIn = async(req,res,next)=>{
    try {
        const userId = req.user.id;
        const currentTime = new Date()
  

    // Create a new TimeTracking record
    const timeTrackingRecord = await prisma.timeTracking.create({
      data: {
        employeesId: userId,
        checkIn: currentTime,
      },
    });

    res.json({ 
        message: "Check-in successful" ,
        data: timeTrackingRecord
    });
    } catch (error) {
        next(error)
    }
}

exports.checkOut = async(req,res,next)=>{
    try {
        
      console.log("Request from check out",req.body)
        const timeId = req.body.id;


        const currentTime = new Date()
  
    const timeTrackingRecord = await prisma.timeTracking.update({
      data: {
        checkOut: currentTime,
      },
      where:{
        id : timeId
      }
    });
    res.json({ 
        message: "Check-out successful" ,
        data: timeTrackingRecord
    });
    } catch (error) {
        next(error)
    }
}

exports.dayOff=async(req,res,next)=>{
  try {

    const { date, reason, status } = req.body;
    const employeesId = req.user.id; 

    const validStatus = status || 'PENDING';

    const dayOff = await prisma.dayOff.create({
      data: {
        date: new Date(date),
        reason,
        status: validStatus, // This needs to match one of your enum values
        employeesId: employeesId // Match the field name in your schema
      }
    })
    console.log('Request for day off:', dayOff)

    res.json({
      message: "Day-Off was booked",
      data: dayOff
    })
  } catch (error) {
    next(error)
  }
}


// delete DayOff
exports.deleteDayOff = async (req, res) => {
  try {
    const requestId = parseInt(req.params.id); // Convert to integer
    const userId = req.user.id;
    console.log('Deleting day off requestId:', requestId);
    console.log('Logged in userId:', userId);


    // Find the day off request
    const dayOffRequest = await prisma.dayOff.findUnique({
      where: { id: requestId }, // Find by the correct 'id'
    });

    // Check if day off request exists
    if (!dayOffRequest) {
      return res.status(404).json({
        success: false,
        message: "Day off request not found",
      });
    }

    // Check if the day off request belongs to the user
    if (dayOffRequest.employeesId !== userId) {
      return res.status(403).json({
        success: false,
        message: "You don't have permission to cancel this request",
      });
    }

    // Check if the request status is 'PENDING' (you can also check for other statuses like 'APPROVED' if needed)
    if (dayOffRequest.status !== "APPROVED") {
      return res.status(400).json({
        success: false,
        message: "Only pending requests can be canceled",
      });
    }

    // Check if the request date has already passed
    const currentDate = new Date();
    const requestDate = new Date(dayOffRequest.date);

    if (requestDate < currentDate) {
      return res.status(400).json({
        success: false,
        message: "Cannot cancel a day off that has already passed",
      });
    }

    // Delete the day off request
    await prisma.dayOff.delete({
      where: { id: requestId },
    });

    // Optionally update the remaining day offs manually (if needed)
    await prisma.employees.update({
      where: { id: userId },
      data: {
        // Assuming you have a field remainingDayOffs to track available days off
        remainingDayOffs: {
          decrement: 1,  // Decrement remaining days off
        },
      },
    });

    return res.status(200).json({
      success: true,
      message: "Day off request canceled successfully",
    });
  } catch (error) {
    console.error("Error cancelling day off:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};



