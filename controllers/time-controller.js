
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
        console.log("Request",req.body)
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