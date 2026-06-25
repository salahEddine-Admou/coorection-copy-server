const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const auth = require('../middleware/auth');
const Submission = require('../models/Submission');
const Exam = require('../models/Exam');
const Student = require('../models/Student');
const User = require('../models/User');
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
    const professorUser = await User.findById(req.user.id);
    const twinProfile = professorUser?.gradingProfile;
    
    const availableExams = exams.map(e => e.title);
    const availableStudents = students.map(s => `${s.firstName} ${s.lastName}`);

    // Étape 2 : Claude analyse toute la copie en un seul appel
    console.log('=== SCAN: Analyse de la copie ===');
    const analysis = await analyzeExamCopy(imagePath, availableStudents, availableExams);

    // Étape 3 : Trouver l'examen (sélection manuelle ou détection auto)
    let matchedExam = null;

    if (req.body.examId) {
      matchedExam = exams.find(e => e._id.toString() === req.body.examId);
      if (!matchedExam) {
        return res.status(400).json({ msg: 'Examen sélectionné introuvable.' });
      }
    } else if (analysis.examTitle) {
      const titleLower = analysis.examTitle.toLowerCase().trim().replace(/\s+/g, ' ');
      matchedExam = exams.find(e => {
        const examTitleLower = e.title.toLowerCase().trim().replace(/\s+/g, ' ');
        return examTitleLower.includes(titleLower) || titleLower.includes(examTitleLower);
      });
    }

    if (!matchedExam) {
      return res.status(400).json({
        msg: `Impossible de trouver l'examen "${analysis.examTitle || ''}" dans vos examens.`,
        extractedData: analysis,
        availableExams: exams.map(e => e.title)
      });
    }

    // Étape 4 : Trouver l'élève (sélection manuelle ou détection auto)
    let matchedStudent = null;

    if (req.body.studentId) {
      matchedStudent = students.find(s => s._id.toString() === req.body.studentId);
      if (!matchedStudent) {
        return res.status(400).json({ msg: 'Élève sélectionné introuvable.' });
      }
    } else if (analysis.studentName) {
      const nameLower = analysis.studentName.toLowerCase().trim().replace(/\s+/g, ' ');
      matchedStudent = students.find(s => {
        const sFirst = (s.firstName || '').trim().toLowerCase().replace(/\s+/g, ' ');
        const sLast = (s.lastName || '').trim().toLowerCase().replace(/\s+/g, ' ');
        const fullName1 = `${sFirst} ${sLast}`;
        const fullName2 = `${sLast} ${sFirst}`;
        return fullName1.includes(nameLower) || nameLower.includes(fullName1) ||
               fullName2.includes(nameLower) || nameLower.includes(fullName2);
      });
    }

    if (!matchedStudent) {
      return res.status(400).json({
        msg: `Impossible de trouver l'élève "${analysis.studentName || ''}" dans vos élèves.`,
        extractedData: analysis,
        availableStudents: students.map(s => `${s.firstName} ${s.lastName}`)
      });
    }

    // Étape 4.5 : Insérer les consignes personnalisées de correction (et Jumeau Numérique)
    let customInstructions = req.body.customInstructions || '';
    if (twinProfile) {
      if (twinProfile.styleDirectives) {
        customInstructions += `\n[Note de style du Jumeau Numérique] : ${twinProfile.styleDirectives}`;
      }
      if (twinProfile.implicitCriteria && twinProfile.implicitCriteria.length) {
        customInstructions += `\n[Critères implicites appris] : ${twinProfile.implicitCriteria.join(', ')}`;
      }
    }

    // Étape 5 : Corriger chaque réponse avec double agents (strict et souple) en parallèle
    console.log('=== SCAN: Correction des réponses avec Double Agent ===');
    let totalScoreIA = 0;
    let totalScoreProf = 0;
    let accumulatedConfidence = 0;
    let hasHighDifference = false;
    const answers = [];

    for (let i = 0; i < matchedExam.questions.length; i++) {
      const question = matchedExam.questions[i];
      
      // Trouver la réponse correspondante extraite par Claude
      const extractedAnswer = analysis.answers.find(a => a.questionNumber === (i + 1));
      const studentAnswer = extractedAnswer ? extractedAnswer.studentAnswer : '';

      console.log(`Question ${i + 1}: "${question.questionText}" → Réponse: "${studentAnswer}"`);

      // Évaluer en parallèle (Agent Strict et Agent Lenient)
      const [resultStrict, resultLenient] = await Promise.all([
        gradeAnswer(studentAnswer, question.questionText, question.expectedKeywords, question.points, customInstructions, 'strict'),
        gradeAnswer(studentAnswer, question.questionText, question.expectedKeywords, question.points, customInstructions, 'lenient')
      ]);

      // Calculer le score IA moyen arrondi au demi-point près
      const scoreIA = Math.round(((resultStrict.score + resultLenient.score) / 2) * 2) / 2;

      // Calculer l'indice de confiance pour cette question
      const qPoints = question.points || 1;
      const difference = Math.abs(resultStrict.score - resultLenient.score);
      if (difference >= 1.5) hasHighDifference = true;
      const qConfidence = Math.max(0, 100 - (difference / qPoints) * 100);

      totalScoreIA += scoreIA;
      totalScoreProf += scoreIA; // Commande par défaut identique
      accumulatedConfidence += qConfidence;

      answers.push({
        questionId: question._id,
        extractedText: studentAnswer,
        scoreIA: scoreIA,
        scoreProf: scoreIA,
        score: scoreIA,
        isCorrect: resultStrict.isCorrect || resultLenient.isCorrect,
        justificationIA: `Agent Strict (${resultStrict.score} pts) : ${resultStrict.justification}\n\nAgent Souple (${resultLenient.score} pts) : ${resultLenient.justification}`,
        justificationProf: `Agent Strict (${resultStrict.score} pts) : ${resultStrict.justification}\n\nAgent Souple (${resultLenient.score} pts) : ${resultLenient.justification}`,
        justification: `Agent Strict (${resultStrict.score} pts) : ${resultStrict.justification}\n\nAgent Souple (${resultLenient.score} pts) : ${resultLenient.justification}`,
        elementsExpected: resultStrict.elementsExpected || [],
        elementsFound: resultStrict.elementsFound || [],
        elementsMissing: resultStrict.elementsMissing || [],
        errorType: resultStrict.errorType !== 'none' ? resultStrict.errorType : (resultLenient.errorType !== 'none' ? resultLenient.errorType : 'none'),
        cognitiveDiagnosis: resultStrict.cognitiveDiagnosis || resultLenient.cognitiveDiagnosis || '',
        plagiarismRisk: resultStrict.plagiarismRisk || 'low',
        plagiarismDetails: resultStrict.plagiarismDetails || ''
      });
    }

    const confidenceIndex = Math.round(accumulatedConfidence / matchedExam.questions.length);
    // Demander une validation humaine si la confiance est faible ou s'il y a un grand écart
    const status = (confidenceIndex < 80 || hasHighDifference) ? 'needs_review' : 'graded';

    // Étape 6 : Vérifier s'il y a déjà des copies pour cet élève et cet examen
    const existingSubmissions = await Submission.find({ exam: matchedExam._id, student: matchedStudent._id }).sort({ createdAt: -1 });

    const submissionData = {
      exam: matchedExam._id,
      student: matchedStudent._id,
      scannedImage: imagePath,
      answers: answers,
      totalScoreIA: totalScoreIA,
      totalScoreProf: totalScoreProf,
      totalScore: totalScoreIA,
      confidenceIndex: confidenceIndex,
      twinSimilarityScore: 100, // Démarre à 100% de similarité avant édition
      status: status
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
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const total = await Submission.countDocuments({ exam: req.params.examId });
    const submissions = await Submission.find({ exam: req.params.examId })
      .populate('student', ['firstName', 'lastName', 'matricule'])
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    res.json({
      total,
      page,
      totalPages: Math.ceil(total / limit),
      submissions,
    });
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

// Export exam results as CSV
router.get('/exam/:examId/export', auth, async (req, res) => {
  try {
    const format = req.query.format || 'csv';
    const submissions = await Submission.find({ exam: req.params.examId })
      .populate('student', ['firstName', 'lastName', 'matricule'])
      .sort({ createdAt: -1 });

    if (format === 'csv') {
      const { Parser } = require('json2csv');
      const fields = ['student.firstName', 'student.lastName', 'student.matricule', 'totalScore', 'createdAt'];
      const parser = new Parser({ fields });
      const csv = parser.parse(submissions.map(s => ({
        student: s.student,
        totalScore: s.totalScore,
        createdAt: s.createdAt,
      })));
      res.header('Content-Type', 'text/csv');
      res.attachment(`exam_${req.params.examId}_results.csv`);
      return res.send(csv);
    }
    return res.status(400).json({ msg: 'Unsupported format' });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// Modifier les scores et justifications (Jumeau Numérique / Edition Prof)
router.put('/:id/edit', auth, async (req, res) => {
  try {
    const submission = await Submission.findById(req.params.id);
    if (!submission) return res.status(404).json({ msg: 'Copie introuvable' });

    const exam = await Exam.findById(submission.exam);
    if (!exam) return res.status(404).json({ msg: 'Examen introuvable' });

    const { answers } = req.body; // array of { questionId, score, justification }
    
    let totalScoreProf = 0;
    
    // Mettre à jour chaque réponse
    submission.answers = submission.answers.map(ans => {
      const edit = answers.find(a => a.questionId.toString() === ans.questionId.toString());
      if (edit) {
        ans.scoreProf = Number(edit.score);
        ans.score = Number(edit.score);
        ans.justificationProf = edit.justification;
        ans.justification = edit.justification;
      }
      totalScoreProf += ans.score;
      return ans;
    });

    submission.totalScoreProf = totalScoreProf;
    submission.totalScore = totalScoreProf;

    // Calculer le score de similarité (différence en % entre IA et prof)
    const maxPoints = exam.totalPoints || 20;
    const diff = Math.abs(submission.totalScoreProf - submission.totalScoreIA);
    submission.twinSimilarityScore = Math.max(0, Math.round(100 - (diff / maxPoints) * 100));

    // Si le professeur valide la copie, son statut passe à 'graded'
    submission.status = 'graded';

    await submission.save();

    // Lancer en arrière-plan la mise à jour du profil du professeur
    const { learnFromTeacherEdit } = require('../services/twinService');
    learnFromTeacherEdit(req.user.id, submission, exam).catch(err => console.error('Twin learning error:', err));

    res.json({
      ...submission.toObject(),
      examTitle: exam.title,
      studentName: req.body.studentName || 'Élève',
      totalPoints: exam.totalPoints
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

module.exports = router;
