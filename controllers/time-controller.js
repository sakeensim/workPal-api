
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