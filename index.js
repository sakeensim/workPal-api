const express = require('express')
const cors = require('cors')
const morgan = require('morgan')

const app = express()

const handlesErrors = require('./middleware/error')

const authRouter = require('./routes/auth-route')
const userRouter = require('./routes/user-route')
const adminRouter = require('./routes/admin-route')

const corsOptions = {
  origin: [
    "http://localhost:5173",
    "https://work-pal-web.vercel.app",
    /\.vercel\.app$/
  ],
  credentials: true
}

app.use(cors(corsOptions))

app.use(morgan('dev'))
app.use(express.json({ limit: "10mb" }))

app.use('/', authRouter)
app.use('/', userRouter)
app.use('/', adminRouter)

app.use(handlesErrors)

const PORT = process.env.PORT || 9191

app.listen(PORT, () => {
  console.log(`Server is running on ${PORT}`)
})