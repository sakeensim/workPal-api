const prisma = require("../configs/prisma")

//1. list all users
    exports.listUsers = async(req,res,next)=>{
        try {
            const users = await prisma.employees.findMany({
                // ไม่ส่ง password
                omit:{
                    password: true,
                }
            })
            console.log(users)
            res.json({result : users})
        } catch (error) {
            next(error)
            
        }

}
//2. Update Role 
exports.updateRole = async(req,res,next)=>{
    try {
        const {id, role} = req.body
        // อัพเดท role
        await prisma.employees.update({
            where: { id: Number(id) },
            data: { role: role },
        })
        res.json({message: 'Update Success'})
    } catch (error) {
        next(error)
    }
}

//3. Delete User
exports.deleteUser = async (req, res, next) => {
    try {
      const { id } = req.params;
      const deleted = await prisma.employees.delete({
        where: {
          id: Number(id),
        },
      });
      console.log(id);
      res.json({ message: "Delete Success" });
    } catch (error) {
      next(error);
    }
  };

//4. edite image profile
exports.uploadImg = async(req,res,next)=>{
    try {
        
        res.json({message: 'Upload Success'})
    } catch (error) {
        next(error)
    }
}
//5. edite Phone number
exports.updatePhone = async(req,res,next)=>{
    try {
        res.json({message: 'Update Phone Number Success'})
    } catch (error) {
        next(error)
    }
}
//6. edite Emergrncy contact
exports.updateEmergency = async(req,res,next)=>{
    try {
        res.json({message: 'Update EM Success'})
    } catch (error) {
        next(error)
    }
}