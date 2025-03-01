const handlesErrors = (err,req,res,next)=>{
    console.log('Error from middleware')
    res.status(err.statusCode || 500)
    .json({message:err.message} || "Error from middleware") 
}
module.exports = handlesErrors