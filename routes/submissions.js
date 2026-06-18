const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const auth = require('../middleware/auth');
const Submission = require('../models/Submission');
const Exam = require('../models/Exam');
const { gradeAnswerWithDeepSeek } = require('../services/ocrService');

const os = require('os');

// Configure Multer for image uploads (using /tmp for Vercel compatibility)
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, os.tmpdir());
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + path.extname(file.originalname)); // Appending extension
  }
});
const upload = multer({ storage: storage });

// Upload and Grade Submission
router.post('/grade/:examId/:studentId', auth, upload.single('scannedImage'), async (req, res) => {
  try {
    const { examId, studentId } = req.params;
    
    if (!req.file) {
      return res.status(400).json({ msg: 'No image uploaded' });
    }

    const exam = await Exam.findById(examId);
    if (!exam) return res.status(404).json({ msg: 'Exam not found' });

    const imagePath = req.file.path;
    let totalScore = 0;
    const answers = [];

    // On boucle sur chaque question et on demande à DeepSeek d'évaluer la réponse dans l'image
    for (let i = 0; i < exam.questions.length; i++) {
        const question = exam.questions[i];
        
        // Appel à DeepSeek
        const result = await gradeAnswerWithDeepSeek(
          imagePath, 
          question.questionText, 
          question.expectedKeywords, 
          question.points
        );

        totalScore += result.score;

        answers.push({
            questionId: question._id,
            extractedText: result.extractedText,
            score: result.score,
            isCorrect: result.isCorrect,
            justification: result.justification
        });
    }

    const submission = new Submission({
      exam: examId,
      student: studentId,
      scannedImage: imagePath,
      answers: answers,
      totalScore: totalScore,
      status: 'graded'
    });

    await submission.save();
    res.json(submission);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// Get all submissions for an exam
router.get('/exam/:examId', auth, async (req, res) => {
  try {
    const submissions = await Submission.find({ exam: req.params.examId }).populate('student', ['firstName', 'lastName', 'matricule']);
    res.json(submissions);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

module.exports = router;
