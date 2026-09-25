require('dotenv').config();

const app = require('./app');
const connectDB = require('./config/db');

const PORT = Number(process.env.PORT || 5000);

const startServer = async () => {
  try {
    if (!process.env.MONGO_URI) {
      throw new Error('MONGO_URI is not defined. Add it to your environment variables.');
    }

    await connectDB(process.env.MONGO_URI);
    app.listen(PORT, () => console.log(`Server is listening on ${PORT}`));
  } catch (error) {
    console.error('Failed to start server:', error.message || error);
    process.exit(1);
  }
};

startServer();