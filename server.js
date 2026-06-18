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
let isConnecting = false;

const connectDB = async () => {
  // Si la connexion est prête, on l'utilise
  if (mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  // Si on est déjà en train de se connecter, on ne lance pas une 2e tentative
  if (mongoose.connection.readyState === 2 || isConnecting) {
    return;
  }

  isConnecting = true;
  console.log('Connecting to MongoDB...');
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      maxIdleTimeMS: 10000, // Ferme les sockets inactifs (Fix pour les Serverless Sleep)
    });
    console.log('MongoDB connected successfully');
  } catch (err) {
    console.error('MongoDB connection error:', err);
  } finally {
    isConnecting = false;
  }
};

// Ensure DB is connected for every request
app.use(async (req, res, next) => {
  try {
    await connectDB();
    next();
  } catch (err) {
    console.error('MongoDB connection middleware error:', err);
    res.status(500).json({ msg: 'Database connection failed' });
  }
});

if (require.main === module) {
  connectDB().then(() => {
    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  });
}

module.exports = app;
