

exports.checkIn = async(req,res,next)=>{
    try {
        
        res.json({message:"Check-in"})
    } catch (error) {
        next(error)
    }
}