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
    if (err.code === 11000) {
      return res.status(400).json({ msg: 'Un élève avec ce matricule existe déjà.' });
    }
    res.status(500).send('Server Error');
  }
});

// Update a student
router.put('/:id', auth, async (req, res) => {
  const { firstName, lastName, matricule, className } = req.body;
  try {
    let student = await Student.findById(req.params.id);
    if (!student) return res.status(404).json({ msg: 'Élève non trouvé' });
    if (student.professor.toString() !== req.user.id) {
      return res.status(401).json({ msg: 'Non autorisé' });
    }

    student = await Student.findByIdAndUpdate(
      req.params.id,
      { firstName, lastName, matricule, className },
      { new: true }
    );
    res.json(student);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// Delete a student
router.delete('/:id', auth, async (req, res) => {
  try {
    const student = await Student.findById(req.params.id);
    if (!student) return res.status(404).json({ msg: 'Élève non trouvé' });
    if (student.professor.toString() !== req.user.id) {
      return res.status(401).json({ msg: 'Non autorisé' });
    }

    await Student.findByIdAndDelete(req.params.id);
    res.json({ msg: 'Élève supprimé' });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

module.exports = router;
