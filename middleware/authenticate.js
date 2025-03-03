const createError = require("../utils/createError")
const jwt = require("jsonwebtoken")

exports.authenticate = (req,res,next)=>{
    try {
        //รับ header ที่ส่งมาจาก client
        const authorization = req.headers.authorization
        // console.log(authorization)

        //ถ้าไม่มี Token ให้ส่ง error 401
        if(!authorization){
            return createError(401, "Missing Token")
        }
        //แยก Baerer กับ Token [1]คือตะแหน่งของ Token
        const token = authorization.split(" ")[1]

        //verity token ถ้าผ่านจะได้ข้อมูล user ใน decode ออกมา
        jwt.verify(token, process.env.SECRET,(err,decode)=>{
            console.log(decode)
            if(err){
                return createError(401, "Unauthorized")
            }
            // console.log(decode)
            //สร้าง property user ให้เท่ากับ decode (ข้อมูล user จาก Token)
            req.user = decode
            next()
        })      
    } catch (error) {
        next(error)
    }
}