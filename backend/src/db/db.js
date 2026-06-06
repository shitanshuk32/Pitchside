//Connect to mongodb via mongoose.
require("dotenv").config();
const mongoose = require("mongoose");

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("Connected to MongoDB database");
  } catch (error) {
    console.log("Error connecting to MongoDB", error);
    process.exit(1);
  }
};

module.exports = connectDB;
