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

exports.updateSalary = async (req, res, next) => {
    try {
        const { id, baseSalary } = req.body;

        if (!req.headers.authorization) {
            return res.status(401).json({ message: 'Missing Token' });
        }

        if (req.user.role !== 'ADMIN') {
            return res.status(403).json({ message: 'Unauthorized' });
        }

        if (!id || isNaN(baseSalary) || baseSalary < 0) {
            return res.status(400).json({ message: 'Invalid salary amount' });
        }

        // Convert ID to a number (assuming your DB uses numeric IDs)
        const employeeId = parseInt(id, 10);

        const updatedUser = await prisma.employees.update({
            where: { id: employeeId },
            data: { baseSalary: parseInt(baseSalary, 10) } 
        });

        res.status(200).json({ message: "Salary updated successfully", user: updatedUser });
    } catch (error) {
        console.error("Error updating salary:", error);
        next(error);
    }
};




