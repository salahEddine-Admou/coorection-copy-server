const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const Student = require('../models/Student');
const Anthropic = require('@anthropic-ai/sdk');

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});


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
      firstName: firstName ? firstName.trim() : '',
      lastName: lastName ? lastName.trim() : '',
      matricule: matricule ? matricule.trim() : '',
      className: className ? className.trim() : '',
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
      { 
        firstName: firstName ? firstName.trim() : '',
        lastName: lastName ? lastName.trim() : '',
        matricule: matricule ? matricule.trim() : '',
        className: className ? className.trim() : ''
      },
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

// Get longitudinal analysis for a student
router.get('/:id/longitudinal', auth, async (req, res) => {
  try {
    const student = await Student.findById(req.params.id);
    if (!student) return res.status(404).json({ msg: 'Élève non trouvé' });
    if (student.professor.toString() !== req.user.id) {
      return res.status(401).json({ msg: 'Non autorisé' });
    }

    const Submission = require('../models/Submission');
    const Exam = require('../models/Exam');

    const submissions = await Submission.find({ student: student._id })
      .populate('exam')
      .sort({ createdAt: 1 });

    if (!submissions || submissions.length === 0) {
      return res.json({
        hasData: false,
        student,
        msg: "Aucune copie n'a encore été enregistrée pour cet élève."
      });
    }

    const totalExams = submissions.length;
    let sumNormalized = 0;
    const history = [];
    const errorTypesCount = { knowledge: 0, logical: 0, incomplete: 0, confusion: 0, drafting: 0 };
    const allExpected = [];
    const allFound = [];
    const allMissing = [];

    submissions.forEach(sub => {
      const examPoints = sub.exam.totalPoints || 20;
      const normalized = (sub.totalScore / examPoints) * 20;
      sumNormalized += normalized;

      history.push({
        submissionId: sub._id,
        examId: sub.exam._id,
        examTitle: sub.exam.title,
        totalScore: sub.totalScore,
        totalPoints: examPoints,
        normalizedScore: Number(normalized.toFixed(1)),
        createdAt: sub.createdAt,
        confidenceIndex: sub.confidenceIndex,
        twinSimilarityScore: sub.twinSimilarityScore,
        status: sub.status
      });

      sub.answers.forEach(ans => {
        if (ans.errorType && errorTypesCount[ans.errorType] !== undefined) {
          errorTypesCount[ans.errorType]++;
        }
        if (ans.elementsExpected) ans.elementsExpected.forEach(e => allExpected.push(e));
        if (ans.elementsFound) ans.elementsFound.forEach(e => allFound.push(e));
        if (ans.elementsMissing) ans.elementsMissing.forEach(e => allMissing.push(e));
      });
    });

    const averageScore = Number((sumNormalized / totalExams).toFixed(1));
    
    // Tendance de progression
    let progressRate = 0;
    if (totalExams > 1) {
      const firstScore = history[0].normalizedScore;
      const lastScore = history[totalExams - 1].normalizedScore;
      progressRate = Number((lastScore - firstScore).toFixed(1));
    }

    // Uniques et filtrage
    const uniqueExpected = [...new Set(allExpected)].slice(0, 15);
    const uniqueFound = [...new Set(allFound)].slice(0, 15);
    const uniqueMissing = [...new Set(allMissing)].slice(0, 15);

    // Prompt pour Claude
    const studentSummary = {
      firstName: student.firstName,
      lastName: student.lastName,
      averageScore,
      totalExams,
      progressRate,
      errorTypesCount,
      history: history.map(h => ({ title: h.examTitle, score: `${h.totalScore}/${h.totalPoints}` }))
    };

    console.log('=== LONGITUDINAL: Génération de la fiche IA élève ===');
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1500,
      messages: [{
        role: "user",
        content: `Tu es un conseiller pédagogique expert. Analyse le profil et l'historique d'évaluation de cet élève :
${JSON.stringify(studentSummary, null, 2)}

Rédige une fiche d'évaluation et de remédiation pédagogique pour cet élève en français.
Sois encourageant, constructif mais rigoureux et précis. Rédige en Markdown simple avec les sections suivantes :
1. **Synthèse de l'évolution** : Analyse sa courbe de progression et sa régularité.
2. **Points Forts** : Identifie ses compétences et points forts (bases académiques, rigueur, compréhension, etc.).
3. **Lacunes Clés & Types d'Erreurs Dominants** : Explique ses principales faiblesses à la lumière de ses types d'erreurs dominants.
4. **Plan d'action & Recommandations personnalisées** : Donne 3 à 4 actions concrètes et adaptées que l'élève peut entreprendre pour s'améliorer.`
      }],
    });

    const aiReport = response.content[0].text;

    res.json({
      hasData: true,
      student,
      stats: {
        totalExams,
        averageScore,
        progressRate,
        errorTypesCount,
        uniqueExpected,
        uniqueFound,
        uniqueMissing
      },
      history,
      aiReport
    });

  } catch (err) {
    console.error('Longitudinal Error:', err);
    res.status(500).json({ msg: 'Erreur lors de la génération du suivi longitudinal : ' + err.message });
  }
});

module.exports = router;

