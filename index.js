const express = require('express')
const cors = require('cors')
const morgan = require('morgan')

const app = express()
app.use(cors())
const handlesErrors = require('.//middleware/error')

//Import Router
const authRouter = require('./routes/auth-route')
const userRouter = require('./routes/user-route')
const adminRouter = require('./routes/admin-route')
//midleware
app.use(morgan('dev'))
app.use(express.json({limit:"10mb"}))



// Routing
app.use('/', authRouter)
app.use('/', userRouter)
app.use('/', adminRouter)


//Error
app.use(handlesErrors)


//Find Not Found



const PORT = process.env.PORT || 9191
app.listen(PORT,()=> console.log(`Server is running on ${PORT}`))
