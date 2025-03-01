const createError = (code, message) =>{
    console.log("step 1 Create error")
    const error = new Error(message)
     error.stautusCode = code;
     throw error;
};

module.exports = createError