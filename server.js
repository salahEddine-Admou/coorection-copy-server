const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static('uploads'));

// Routes will be registered after middleware

const PORT = process.env.PORT || 5000;

// Vercel Serverless MongoDB Connection logic
let cached = global.mongoose;
if (!cached) {
  cached = global.mongoose = { conn: null, promise: null };
}

const connectDB = async () => {
  // 1. Si une connexion est prête, vérifier sa validité (Ping anti-gel Vercel)
  if (cached.conn && mongoose.connection.readyState === 1 && mongoose.connection.db) {
    try {
      const pingPromise = mongoose.connection.db.admin().ping();
      const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Ping timeout')), 500));
      await Promise.race([pingPromise, timeoutPromise]);
      return cached.conn;
    } catch (err) {
      console.log('Dead socket detected on Ping. Reconnecting...');
      await mongoose.disconnect().catch(() => {});
      cached.conn = null;
      cached.promise = null;
    }
  }

  // 2. Si une connexion est déjà en cours d'initialisation, on l'attend ! (Fix concurrence)
  if (cached.promise) {
    try {
      cached.conn = await cached.promise;
      return cached.conn;
    } catch (err) {
      cached.promise = null;
    }
  }

  // 3. Nouvelle connexion
  console.log('Connecting to MongoDB...');
  cached.promise = mongoose.connect(process.env.MONGO_URI, {
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
  }).then(mongoose => mongoose);
  
  try {
    cached.conn = await cached.promise;
    console.log('MongoDB connected successfully');
  } catch (err) {
    cached.promise = null;
    console.error('MongoDB connection error:', err);
    throw err;
  }
  
  return cached.conn;
};

// Ensure DB is connected for every request BEFORE hitting routes
app.use(async (req, res, next) => {
  try {
    await connectDB();
    next();
  } catch (err) {
    console.error('MongoDB connection middleware error:', err);
    res.status(500).json({ msg: 'Database connection failed' });
  }
});

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/students', require('./routes/students'));
app.use('/api/exams', require('./routes/exams'));
app.use('/api/submissions', require('./routes/submissions'));

if (require.main === module) {
  connectDB().then(() => {
    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  });
}

module.exports = app;
