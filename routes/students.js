const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const Student = require('../models/Student');

// Get all students for the logged-in professor
router.get('/', auth, async (req, res) => {
  try {
    const students = await Student.find({ professor: req.user.id }).sort({ createdAt: -1 });
    res.json(students);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// Add a student
router.post('/', auth, async (req, res) => {
  const { firstName, lastName, matricule, className } = req.body;
  try {
    const newStudent = new Student({
      firstName,
      lastName,
      matricule,
      className,
      professor: req.user.id
    });
    const student = await newStudent.save();
    res.json(student);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

module.exports = router;
