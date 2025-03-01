
//1. list all users
    exports.listUsers = async(req,res,next)=>{
        try {
            res.json({message: 'List all users'})
        } catch (error) {
            next(error)
            
        }

}
//2. Update Role 
exports.updateRole = async(req,res,next)=>{
    try {
        res.json({message: 'Update role'})
    } catch (error) {
        next(error)
    }
}

//3. Delete User
exports.deleteUser = async(req,res,next)=>{
    try {
        res.json({message: 'Delete user'})
    } catch (error) {
        next(error)
    }
}