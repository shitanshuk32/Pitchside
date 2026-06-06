const mongoose = require("mongoose");

//Craete a schema in mongodb as to describe as to how the data will be stored in the database.

const postSchema = new mongoose.Schema({
  image: String,
  caption: String,
});

//Now create a modal so as to create a collection in the database
const postModel = mongoose.model("post", postSchema);

module.exports = postModel;
