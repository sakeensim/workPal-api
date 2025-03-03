const cloudinary = require("../configs/cloudinary")
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
        // console.log(req.body.image)
        //ส่งไปรูป cloudinary
        const result = await cloudinary.uploader.upload(req.body.image,{
            folder: 'profile',
            public_id: Date.now().toString(),

        })
        console.log(result)
        res.json({result})
    } catch (error) {
        next(error)
    }
}

//update Profil
exports.updateProfile = async(req,res,next)=>{
    try {
        console.log(req.body)
        //ลง database
        const {id} = req.params
        const {phone,emergencyContact,image} = req.body
  
        await prisma.employees.update({
            where: { id: Number(id) },
            data: { 
                phone: phone,
                emergencyContact: emergencyContact,
                profileImage : image?.secure_url,
                publicId: image?.public_id
            },
        })
        res.json({message: 'Update Profile Success'})
    } catch (error) {
        next(error)
        
    }
}

exports.myProfile = async(req,res,next)=>{
try {
    const {id} =req.user
    const profile = await prisma.employees.findFirst({
        where : {
            id : Number(id)
        },
        omit:{
            password:true,
        }
})
    res.json({result : profile})
} catch (error) {
    next(error)
}
}
