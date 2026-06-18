const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static('uploads'));

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/students', require('./routes/students'));
app.use('/api/exams', require('./routes/exams'));
app.use('/api/submissions', require('./routes/submissions'));

const PORT = process.env.PORT || 5000;

// Vercel Serverless MongoDB Connection logic
let cached = global.mongoose;

if (!cached) {
  cached = global.mongoose = { conn: null, promise: null };
}

const connectDB = async () => {
  if (cached.conn) {
    return cached.conn;
  }

  if (!cached.promise) {
    const opts = {
      bufferCommands: false, // Ne pas attendre en cas de déconnexion
      serverSelectionTimeoutMS: 5000,
    };
    
    console.log('Connecting to MongoDB (New Connection)...');
    cached.promise = mongoose.connect(process.env.MONGO_URI, opts).then((mongoose) => {
      return mongoose;
    });
  }
  
  try {
    cached.conn = await cached.promise;
  } catch (e) {
    cached.promise = null;
    throw e;
  }

  return cached.conn;
};

// Ensure DB is connected for every request
app.use(async (req, res, next) => {
  try {
    await connectDB();
    next();
  } catch (err) {
    console.error('MongoDB connection error:', err);
    res.status(500).json({ msg: 'Database connection failed' });
  }
});

if (require.main === module) {
  connectDB().then(() => {
    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  });
}

module.exports = app;
