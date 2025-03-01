exports.authenticate = (req,res,next)=>{
    try {
        console.log('auth middleware')
        next()
    } catch (error) {
        next(error)
    }
}