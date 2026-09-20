require('dotenv').config();

const app = require('./app');
const connectDB = require('./config/db');

const PORT = 5000;

const startServer = async () => {
  try {
    await connectDB(process.env.MONGO_URI);
    app.listen(PORT, () => console.log(`Server is listening on ${PORT}`));
  } catch (error) {
    console.log(error);
  }
};

startServer();