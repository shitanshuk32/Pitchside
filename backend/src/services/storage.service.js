// Here we will write the logic for uploading the file to image kit and getting its url.
// We will use multer for uploading the file. As the data is not in raw json and is a file-type we will use form-data inside it as key, value pairs.
// We will provide the key and select the the data type to file type.
// The Multer - the file parser middleware
// Multer sits on "create_a_post" api as a middleware and reads the multipart/form-data send by the user.
// Then it puts the text on req.body and puts the file on req.file.
// With the help of memoryStorage() (in-memory storage), Multer stores the file as a Buffer(binary data) in RAM.
//The cloud service platform will take the buffer, turn those bytes into actual data and will host it and will sent he public url in return.
const ImageKit = require("@imagekit/nodejs");

const privateKey = process.env.IMAGEKIT_PRIVATE_KEY;

const client = new ImageKit({ privateKey });

//Create upload fucntion and export it

const uploadFile = async (file) => {
  console.log("file", file);
  return await client.files.upload({
    file: file.buffer.toString("base64"), //coverts to bytes to string
    fileName: file.originalname,
  });
};

module.exports = uploadFile;
