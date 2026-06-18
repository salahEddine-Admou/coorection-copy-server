const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const Exam = require('../models/Exam');

// Get all exams for the logged-in professor
router.get('/', auth, async (req, res) => {
  try {
    const exams = await Exam.find({ professor: req.user.id }).sort({ createdAt: -1 });
    res.json(exams);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// Create an exam
router.post('/', auth, async (req, res) => {
  const { title, description, questions } = req.body;
  try {
    const totalPoints = questions.reduce((acc, q) => acc + (Number(q.points) || 1), 0);
    const newExam = new Exam({
      title,
      description,
      questions,
      totalPoints,
      professor: req.user.id
    });
    const exam = await newExam.save();
    res.json(exam);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// Get single exam
router.get('/:id', auth, async (req, res) => {
  try {
    const exam = await Exam.findById(req.params.id);
    if (!exam) return res.status(404).json({ msg: 'Exam not found' });
    if (exam.professor.toString() !== req.user.id) {
       return res.status(401).json({ msg: 'Not authorized' });
    }
    res.json(exam);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

module.exports = router;
