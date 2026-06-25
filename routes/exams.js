const express = require('express');
const router = express.Router();
const multer = require('multer');
const os = require('os');
const path = require('path');
const fs = require('fs');
const auth = require('../middleware/auth');
const Exam = require('../models/Exam');
const Submission = require('../models/Submission');
const Student = require('../models/Student');
const Anthropic = require('@anthropic-ai/sdk');

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Configure Multer for subject photo upload
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, os.tmpdir());
  },
  filename: function (req, file, cb) {
    cb(null, 'subject_' + Date.now() + path.extname(file.originalname));
  }
});
const upload = multer({ storage: storage });

// Helper to encode image
function encodeImage(imagePath) {
  const imageBuffer = fs.readFileSync(imagePath);
  return imageBuffer.toString('base64');
}

// Helper to determine media type
function getMediaType(imagePath) {
  const ext = imagePath.toLowerCase().split('.').pop();
  const types = { 'jpg': 'image/jpeg', 'jpeg': 'image/jpeg', 'png': 'image/png', 'gif': 'image/gif', 'webp': 'image/webp' };
  return types[ext] || 'image/jpeg';
}

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

// Générer automatiquement un corrigé et barème depuis la photo d'un sujet
router.post('/generate-rubric', auth, upload.single('subjectImage'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ msg: 'Aucun sujet d\'examen fourni.' });
    }

    const imagePath = req.file.path;
    const base64Image = encodeImage(imagePath);
    const mediaType = getMediaType(imagePath);

    console.log('=== SUBJECT OCR: Analyse du sujet ===');

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2048,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: mediaType,
                data: base64Image,
              },
            },
            {
              type: "text",
              text: `Tu es un enseignant expert. Analyse ce sujet d'examen scanné. 
Déduis et génère :
1. Un titre d'examen pertinent.
2. Une courte description générale.
3. Un corrigé type structuré question par question. Pour CHAQUE question, génère :
   - questionText (le texte complet de la question)
   - questionType ("short" pour réponse courte d'un mot/courte phrase, ou "long" pour développement/synthèse)
   - points (suggère un barème de points réaliste dont la somme fait idéalement 20 au total)
   - expectedKeywords (tableau de mots-clés essentiels attendus dans la réponse de l'élève)

Réponds UNIQUEMENT avec un objet JSON strict au format suivant, sans aucun texte autour :
{
  "title": "Titre suggéré de l'examen",
  "description": "Description suggérée...",
  "questions": [
    {
      "questionText": "Texte de la question 1",
      "questionType": "short",
      "points": 5,
      "expectedKeywords": ["mot1", "mot2"]
    }
  ]
}`
            }
          ]
        }
      ]
    });

    const resultStr = response.content[0].text;
    const jsonMatch = resultStr.match(/\{[\s\S]*\}/);
    const resultObj = JSON.parse(jsonMatch ? jsonMatch[0] : resultStr);

    // Supprimer le fichier temporaire
    fs.unlink(imagePath, () => {});

    res.json(resultObj);
  } catch (err) {
    console.error('Generate Rubric Error:', err);
    res.status(500).json({ msg: 'Erreur lors de la génération du barème : ' + err.message });
  }
});

// Créer un examen
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

// Récupérer l'analyse automatique d'une classe pour un examen donné
router.get('/:id/class-analytics', auth, async (req, res) => {
  try {
    const exam = await Exam.findById(req.params.id);
    if (!exam) return res.status(404).json({ msg: 'Examen introuvable' });
    if (exam.professor.toString() !== req.user.id) return res.status(401).json({ msg: 'Non autorisé' });

    const submissions = await Submission.find({ exam: exam._id }).populate('student');
    if (!submissions || submissions.length === 0) {
      return res.json({ hasData: false, msg: 'Aucune copie pour cet examen pour le moment.' });
    }

    const numSubmissions = submissions.length;
    let sumScore = 0;
    const scores = [];

    // Distribution des notes
    let dist0_5 = 0, dist5_10 = 0, dist10_15 = 0, dist15_20 = 0;

    // Analyse par question
    const questionStats = exam.questions.map(q => ({
      questionId: q._id,
      questionText: q.questionText,
      points: q.points,
      successCount: 0,
      totalPointsAwarded: 0
    }));

    const errorCountMap = { knowledge: 0, logical: 0, incomplete: 0, confusion: 0, drafting: 0, none: 0 };
    const classAnswersSummary = [];

    submissions.forEach(sub => {
      sumScore += sub.totalScore;
      // Normaliser sur 20 pour la distribution
      const scoreNormalized = (sub.totalScore / exam.totalPoints) * 20;
      scores.push(sub.totalScore);

      if (scoreNormalized < 5) dist0_5++;
      else if (scoreNormalized < 10) dist5_10++;
      else if (scoreNormalized < 15) dist10_15++;
      else dist15_20++;

      // Parcourir les réponses
      sub.answers.forEach(ans => {
        const stats = questionStats.find(q => q.questionId.toString() === ans.questionId.toString());
        if (stats) {
          stats.totalPointsAwarded += ans.score;
          if (ans.score >= (stats.points / 2)) {
            stats.successCount++;
          }
        }

        // Incrémenter les erreurs
        if (ans.errorType && errorCountMap[ans.errorType] !== undefined) {
          errorCountMap[ans.errorType]++;
        }

        // Ajouter au résumé pédagogique
        classAnswersSummary.push({
          questionText: stats?.questionText,
          extractedText: ans.extractedText,
          score: ans.score,
          points: stats?.points,
          errorType: ans.errorType,
          cognitiveDiagnosis: ans.cognitiveDiagnosis
        });
      });
    });

    const avgScore = sumScore / numSubmissions;
    scores.sort((a, b) => a - b);
    const medianScore = scores[Math.floor(numSubmissions / 2)];

    // Calculer le taux de réussite par question en %
    const successRates = questionStats.map(q => ({
      questionText: q.questionText,
      successRate: Math.round((q.successCount / numSubmissions) * 100),
      avgPoints: Number((q.totalPointsAwarded / numSubmissions).toFixed(1)),
      maxPoints: q.points
    }));

    // Trouver les élèves en difficulté et performants
    const strugglingStudents = submissions
      .filter(s => s.totalScore < (exam.totalPoints / 2))
      .map(s => ({ name: `${s.student.firstName} ${s.student.lastName}`, score: s.totalScore }));

    const performingStudents = submissions
      .filter(s => s.totalScore >= (exam.totalPoints * 0.75))
      .map(s => ({ name: `${s.student.firstName} ${s.student.lastName}`, score: s.totalScore }));

    // Appeler Claude pour générer l'analyse qualitative de la classe
    console.log('=== ANALYTICS: Génération du rapport pédagogique par l\'IA ===');
    const analyticsPrompt = `Tu es un inspecteur d'académie expert. Analyse les résultats de cette classe d'examen d'Histoire/Géographie/Sciences.
Examen : "${exam.title}"
Moyenne de la classe : ${avgScore.toFixed(1)} / ${exam.totalPoints}
Nombre d'élèves : ${numSubmissions}

Voici un récapitulatif détaillé des réponses des élèves, de leurs scores et des diagnostics d'erreurs IA :
${JSON.stringify(classAnswersSummary.slice(0, 40), null, 2)}

Tâche : Rédige un rapport pédagogique structuré en français contenant :
1. **Notions mal comprises** : Synthétise les concepts théoriques majeurs que la classe n'a pas assimilés.
2. **Erreurs récurrentes** : Explique les typologies de fautes récurrentes (confusions, manque de précision, logique...).
3. **Conseils d'ajustement** : Donne 3 plans d'actions concrets pour l'enseignant pour consolider ces notions lors des prochains cours.

Sois très précis, professionnel et direct. Réponds en Markdown simple.`;

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1500,
      messages: [{ role: "user", content: analyticsPrompt }],
    });

    const aiReport = response.content[0].text;

    res.json({
      hasData: true,
      stats: {
        numSubmissions,
        avgScore: Number(avgScore.toFixed(1)),
        medianScore,
        maxPoints: exam.totalPoints,
        distribution: { dist0_5, dist5_10, dist10_15, dist15_20 },
        successRates,
        strugglingStudents,
        performingStudents,
        errorBreakdown: errorCountMap
      },
      aiReport: aiReport
    });

  } catch (err) {
    console.error('Analytics Error:', err);
    res.status(500).json({ msg: 'Erreur lors du calcul des statistiques : ' + err.message });
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

// Delete an exam
router.delete('/:id', auth, async (req, res) => {
  try {
    const exam = await Exam.findById(req.params.id);
    if (!exam) return res.status(404).json({ msg: 'Examen introuvable' });
    if (exam.professor.toString() !== req.user.id) {
      return res.status(401).json({ msg: 'Non autorisé' });
    }

    // Supprimer toutes les soumissions associées à l'examen
    await Submission.deleteMany({ exam: exam._id });

    await Exam.findByIdAndDelete(req.params.id);
    res.json({ msg: 'Examen supprimé avec succès' });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

module.exports = router;
