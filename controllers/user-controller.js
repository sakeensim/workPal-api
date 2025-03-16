const cloudinary = require("../configs/cloudinary")
const prisma = require("../configs/prisma")

//1. list all users
exports.listUsers = async(req,res,next)=>{
        try {
            const users = await prisma.employees.findMany({
                // ไม่ส่ง password
                omit:{
                    password: true,
                },
                orderBy: {
                    firstname: 'asc'
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

//update approved status
exports.getUserApprovedRequests = async (req, res, next) => {
    try {
        console.log("Fetching approved requests for user:", req.user);
        const userId = req.user.id;

        // Get approved advance salary requests
        const approvedSalaryRequests = await prisma.advanceSalary.findMany({
            where: { employeesId: userId, status: 'APPROVED' },
            orderBy: { requestDate: 'desc' }
        });

        // Calculate total approved salary sum
        const totalApprovedSalary = approvedSalaryRequests.reduce((sum, req) => sum + Number(req.amount), 0);

        // Get approved day-off requests
        const approvedDayOffRequests = await prisma.dayOff.findMany({
            where: { employeesId: userId, status: 'APPROVED' },
            orderBy: { date: 'desc' }
        });

        // Format the response
        const formattedSalaryRequests = approvedSalaryRequests.map(req => ({
            id: req.id,
            type: 'salary',
            amount: req.amount,
            requestDate: req.requestDate,
            status: req.status,
            createdAt: req.createdAt,
            updatedAt: req.updatedAt
        }));

        const formattedDayOffRequests = approvedDayOffRequests.map(req => ({
            id: req.id,
            type: 'dayoff',
            reason: req.reason,
            date: req.date,
            status: req.status,
            createdAt: req.createdAt,
            updatedAt: req.updatedAt
        }));

        const allApprovedRequests = [...formattedSalaryRequests, ...formattedDayOffRequests];

        // Sort by most recent updates
        allApprovedRequests.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));

        console.log('Approved Requests:', allApprovedRequests);

        res.json({ data: allApprovedRequests, totalSalaryAdvance: totalApprovedSalary });
    } catch (error) {
        console.error("Error in getUserApprovedRequests:", error);
        next(error);
    }
};
exports.updateBaseSalary = async(req,res,next)=>{
    try {
        const {id} = req.params;
        const {baseSalary} = req.body;
        
        await prisma.employees.update({
            where: { id: Number(id) },
            data: { baseSalary: baseSalary.toString() }
        });
        
        res.json({message: 'Salary updated successfully'});
    } catch (error) {
        next(error);
    }
}