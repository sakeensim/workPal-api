const prisma = require("../configs/prisma")

exports.salaryAdvance = async (req, res, next) => {
    try {
        const { date, amount } = req.body


        const salaryTaked = await prisma.advanceSalary.create({
            data: {
                requestDate: new Date(date), // Ensure it's a Date object
                amount: parseFloat(amount), // Convert to number 
                employeesId: req.user.id // Assuming you're tracking the requesting user
            }
        })
        res.json({ message: "Salary Advance request was send to admin" })
    } catch (error) {
        console.error("Error in salaryAdvance:", error)
        next(error)
    }
}