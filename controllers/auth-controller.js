const prisma = require('../configs/prisma')
const createError = require('../utils/createError')
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')

exports.register =async(req,res,next)=>{
    
    try {
        //1.req.body
        const {email,firstname,lastname,password,confirmpassword} =req.body
        //2.validators
        //3.Check email alredy exist
        const checkEmail = await prisma.employees.findFirst({
            where :{
                email :email,
            }
        })
        if(checkEmail){
            createError(400, "Email is already Exist")
        }

        //4.Encrypt bcryptjs
        const hashedPassword = bcrypt.hashSync(password,10);

        //5.insert to db
        const employees = await prisma.employees.create({
            data :{
                email: email,
                firstname: firstname,
                lastname : lastname,
                password: hashedPassword,
            }
        })

        
        res.json({message : 'Register Success'})
    } catch (error) {
        
        next(error)
    }
}


exports.login = async(req, res, next) =>{
    try {
        //1. req.body
        const {email, password} = req.body

        //2. check email and password
        const employees = await prisma.employees.findFirst({
            where:{
                email:email,
            }
        })
        if(!employees){
            createError(400,"Email or Password invalid")
        }

        const passwordMatch = bcrypt.compareSync(password, employees.password)

        if(!passwordMatch){
            createError(400, "Email or Password invalid")
        }
        //3. Grnerate Token
        const payload = {
            id: employees.id,
            // email : employees.email,
            // password: employees.password,
            // firstname: employees.firstname,
            // lastname: employees.lastname,
            role: employees.role,
        }
        const token = jwt.sign(payload, process.env.SECRET,{
            expiresIn : "15d",
        } )
        res.json({
            message: "Login Success",
            payload : payload,
            token: token,
        })
        
    } catch (error) {
        next(error)
    }
}

exports.getMe = async (req, res, next) => {
    try {
        const {id} = req.user
        console.log("checkkkk", req.user)
        const employees = await prisma.employees.findUnique({
            where:{
                id: id,
            },
            select:{
                role:true
            }
        })
        console.log(employees)
        res.json({result: employees});
    } catch (error) {
      next(error);
    }
  };