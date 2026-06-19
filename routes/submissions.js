const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const auth = require('../middleware/auth');
const Submission = require('../models/Submission');
const Exam = require('../models/Exam');
const Student = require('../models/Student');
const { analyzeExamCopy, gradeAnswer } = require('../services/ocrService');

const os = require('os');

// Configure Multer for image uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, os.tmpdir());
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});
const upload = multer({ storage: storage });

// Nouveau workflow : Scanner et corriger une copie automatiquement
router.post('/scan', auth, upload.single('scannedImage'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ msg: 'Aucune image uploadée.' });
    }

    const imagePath = req.file.path;

    // Étape 1 : Récupérer les listes connues pour aider l'OCR avec l'écriture manuscrite
    const exams = await Exam.find({ professor: req.user.id });
    const students = await Student.find({ professor: req.user.id });
    
    const availableExams = exams.map(e => e.title);
    const availableStudents = students.map(s => `${s.firstName} ${s.lastName}`);

    // Étape 2 : Claude analyse toute la copie en un seul appel
    console.log('=== SCAN: Analyse de la copie ===');
    const analysis = await analyzeExamCopy(imagePath, availableStudents, availableExams);

    // Étape 3 : Trouver l'examen correspondant dans la base
    let matchedExam = null;
    
    if (analysis.examTitle) {
      // Recherche par correspondance partielle (insensible à la casse)
      const titleLower = analysis.examTitle.toLowerCase().trim();
      matchedExam = exams.find(e => {
        const examTitleLower = e.title.toLowerCase().trim();
        return examTitleLower.includes(titleLower) || titleLower.includes(examTitleLower);
      });
    }

    if (!matchedExam) {
      return res.status(400).json({
        msg: `Impossible de trouver l'examen "${analysis.examTitle}" dans vos examens.`,
        extractedData: analysis,
        availableExams: exams.map(e => e.title)
      });
    }

    // Étape 4 : Trouver l'élève correspondant dans la base
    let matchedStudent = null;

    if (analysis.studentName) {
      const nameLower = analysis.studentName.toLowerCase().trim();
      matchedStudent = students.find(s => {
        const fullName1 = `${s.firstName} ${s.lastName}`.toLowerCase();
        const fullName2 = `${s.lastName} ${s.firstName}`.toLowerCase();
        return fullName1.includes(nameLower) || nameLower.includes(fullName1) ||
               fullName2.includes(nameLower) || nameLower.includes(fullName2);
      });
    }

    if (!matchedStudent) {
      return res.status(400).json({
        msg: `Impossible de trouver l'élève "${analysis.studentName}" dans vos élèves.`,
        extractedData: analysis,
        availableStudents: students.map(s => `${s.firstName} ${s.lastName}`)
      });
    }

    // Étape 4 : Corriger chaque réponse
    console.log('=== SCAN: Correction des réponses ===');
    let totalScore = 0;
    const answers = [];

    for (let i = 0; i < matchedExam.questions.length; i++) {
      const question = matchedExam.questions[i];
      
      // Trouver la réponse correspondante extraite par Claude
      const extractedAnswer = analysis.answers.find(a => a.questionNumber === (i + 1));
      const studentAnswer = extractedAnswer ? extractedAnswer.studentAnswer : '';

      console.log(`Question ${i + 1}: "${question.questionText}" → Réponse: "${studentAnswer}"`);

      // Corriger avec Claude
      const result = await gradeAnswer(
        studentAnswer,
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
        justification: result.justification,
        plagiarismRisk: result.plagiarismRisk || 'low',
        plagiarismDetails: result.plagiarismDetails || ''
      });
    }

    // Étape 5 : Vérifier s'il y a déjà des copies pour cet élève et cet examen
    const existingSubmissions = await Submission.find({ exam: matchedExam._id, student: matchedStudent._id }).sort({ createdAt: -1 });

    const submissionData = {
      exam: matchedExam._id,
      student: matchedStudent._id,
      scannedImage: imagePath,
      answers: answers,
      totalScore: totalScore,
      status: 'graded'
    };

    const enrichedResult = {
      ...submissionData,
      examTitle: matchedExam.title,
      studentName: `${matchedStudent.firstName} ${matchedStudent.lastName}`,
      totalPoints: matchedExam.totalPoints
    };

    if (existingSubmissions.length > 0) {
      // Retourner un conflit avec les données pour que le front demande confirmation
      return res.json({
        conflict: true,
        unsavedSubmission: submissionData,
        enrichedResult: enrichedResult,
        existingSubmissions: existingSubmissions
      });
    }

    // Aucune copie existante, on sauvegarde directement
    const submission = new Submission(submissionData);
    await submission.save();

    // Retourner le résultat enrichi
    res.json({
      ...submission.toObject(),
      examTitle: matchedExam.title,
      studentName: `${matchedStudent.firstName} ${matchedStudent.lastName}`,
      totalPoints: matchedExam.totalPoints
    });

  } catch (err) {
    console.error('Scan Error:', err);
    res.status(500).json({ msg: 'Erreur serveur: ' + err.message });
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

// Confirmer l'ajout d'une nouvelle copie (en cas de doublon)
router.post('/confirm-new', auth, async (req, res) => {
  try {
    const submission = new Submission(req.body.submissionData);
    await submission.save();
    res.json(submission);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// Remplacer une copie existante
router.put('/replace/:id', auth, async (req, res) => {
  try {
    const existing = await Submission.findById(req.params.id);
    if (!existing) return res.status(404).json({ msg: 'Submission not found' });
    
    // Mettre à jour avec les nouvelles données
    const { scannedImage, answers, totalScore, status } = req.body.submissionData;
    
    existing.scannedImage = scannedImage;
    existing.answers = answers;
    existing.totalScore = totalScore;
    existing.status = status;
    existing.createdAt = Date.now(); // Update the timestamp
    
    await existing.save();
    res.json(existing);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

module.exports = router;
