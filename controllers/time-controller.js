
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
        data: currentTime
    });
    } catch (error) {
        next(error)
    }
}