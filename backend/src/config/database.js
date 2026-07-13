const mongoose = require('mongoose');
const { database } = require('./integrations.config');

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(database.mongoUri);
    console.log(`✅ MongoDB connected: ${conn.connection.host}`);
  } catch (err) {
    console.error('❌ MongoDB connection failed:', err.message);
    process.exit(1);
  }
};

module.exports = connectDB;
