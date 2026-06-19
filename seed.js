const dns = require('dns');
dns.setServers(['8.8.8.8', '1.1.1.1']);

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const User = require('./models/User');
const Student = require('./models/Student');
const Exam = require('./models/Exam');
const Submission = require('./models/Submission');

const seedDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('MongoDB connected for seeding...');

    // Nettoyer toute la base
    await Submission.deleteMany();
    await Student.deleteMany();
    await Exam.deleteMany();
    await User.deleteMany();

    // 1. Créer un professeur
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash('Ad@m2026', salt);
    const prof = new User({
      name: 'Adam',
      email: 'adam@gmail.com',
      password: hashedPassword
    });
    await prof.save();
    console.log('Professeur créé: adam@gmail.com / Ad@m2026');

    // 2. Créer des élèves
    const students = await Student.insertMany([
      { firstName: 'Jean',   lastName: 'Dupont',   matricule: 'M1001', className: 'Terminale S', professor: prof._id },
      { firstName: 'Marie',  lastName: 'Curie',    matricule: 'M1002', className: 'Terminale S', professor: prof._id },
      { firstName: 'Albert', lastName: 'Einstein', matricule: 'M1003', className: 'Terminale S', professor: prof._id },
      { firstName: 'Sophie', lastName: 'Martin',   matricule: 'M1004', className: 'Terminale S', professor: prof._id },
      { firstName: 'Lucas',  lastName: 'Bernard',  matricule: 'M1005', className: 'Terminale S', professor: prof._id },
    ]);
    console.log(`${students.length} élèves créés.`);

    // 3. Créer un examen
    const exam = new Exam({
      title: 'Examen de Physique Quantique',
      description: 'Contrôle sur les bases de la physique.',
      professor: prof._id,
      totalPoints: 20,
      questions: [
        {
          questionText: "Qui a formulé la théorie de la relativité restreinte en 1905 ?",
          questionType: 'short',
          points: 5,
          expectedKeywords: ['einstein', 'albert einstein']
        },
        {
          questionText: "Quelle est l'unité de mesure de la force dans le Système international ?",
          questionType: 'short',
          points: 5,
          expectedKeywords: ['newton']
        },
        {
          questionText: "Expliquez brièvement le principe de la gravité.",
          questionType: 'long',
          points: 10,
          expectedKeywords: ['attraction', 'masse', 'planète', 'force']
        }
      ]
    });
    await exam.save();
    console.log('Examen créé avec succès.');

    const q = exam.questions; // shorthand

    // 4. Créer des copies (submissions) pour chaque élève
    const submissionsData = [
      // --- Jean Dupont : bonne copie (18/20) ---
      {
        exam: exam._id,
        student: students[0]._id,
        scannedImage: 'uploads/placeholder.jpg',
        totalScore: 18,
        status: 'graded',
        createdAt: new Date('2026-06-10T09:15:00Z'),
        answers: [
          {
            questionId: q[0]._id,
            extractedText: 'Albert Einstein a formulé la théorie de la relativité restreinte en 1905.',
            score: 5,
            isCorrect: true,
            justification: 'Réponse correcte et complète. Le nom complet est mentionné.',
            plagiarismRisk: 'low',
            plagiarismDetails: ''
          },
          {
            questionId: q[1]._id,
            extractedText: 'L\'unité de force est le Newton (N).',
            score: 5,
            isCorrect: true,
            justification: 'Correct. Le Newton est bien l\'unité SI de la force.',
            plagiarismRisk: 'low',
            plagiarismDetails: ''
          },
          {
            questionId: q[2]._id,
            extractedText: 'La gravité est une force d\'attraction entre deux masses. Plus les masses sont grandes et proches, plus la force est importante. Elle maintient les planètes en orbite.',
            score: 8,
            isCorrect: true,
            justification: 'Bonne explication. Les mots-clés attraction, masse, planète et force sont présents. Manque de précision sur la formule de Newton.',
            plagiarismRisk: 'low',
            plagiarismDetails: ''
          }
        ]
      },

      // --- Marie Curie : copie moyenne (11/20) ---
      {
        exam: exam._id,
        student: students[1]._id,
        scannedImage: 'uploads/placeholder.jpg',
        totalScore: 11,
        status: 'graded',
        createdAt: new Date('2026-06-10T09:40:00Z'),
        answers: [
          {
            questionId: q[0]._id,
            extractedText: 'Einstein',
            score: 3,
            isCorrect: false,
            justification: 'Réponse partielle : le prénom est manquant et l\'année n\'est pas mentionnée.',
            plagiarismRisk: 'low',
            plagiarismDetails: ''
          },
          {
            questionId: q[1]._id,
            extractedText: 'Le joule',
            score: 0,
            isCorrect: false,
            justification: 'Incorrect. Le joule est l\'unité d\'énergie, pas de force. L\'unité de force est le Newton.',
            plagiarismRisk: 'low',
            plagiarismDetails: ''
          },
          {
            questionId: q[2]._id,
            extractedText: 'La gravité attire les objets vers la Terre. C\'est une force naturelle qui agit sur toutes les masses.',
            score: 8,
            isCorrect: true,
            justification: 'Explication correcte et complète. Les notions d\'attraction, de masse et de force sont bien présentes.',
            plagiarismRisk: 'low',
            plagiarismDetails: ''
          }
        ]
      },

      // --- Albert Einstein : excellente copie (20/20) ---
      {
        exam: exam._id,
        student: students[2]._id,
        scannedImage: 'uploads/placeholder.jpg',
        totalScore: 20,
        status: 'graded',
        createdAt: new Date('2026-06-10T10:00:00Z'),
        answers: [
          {
            questionId: q[0]._id,
            extractedText: 'C\'est Albert Einstein qui a publié la théorie de la relativité restreinte en 1905, dans son article "De l\'électrodynamique des corps en mouvement".',
            score: 5,
            isCorrect: true,
            justification: 'Réponse exemplaire avec contexte historique précis.',
            plagiarismRisk: 'medium',
            plagiarismDetails: 'La formulation est très proche de sources encyclopédiques en ligne. Possible copie de Wikipedia.'
          },
          {
            questionId: q[1]._id,
            extractedText: 'Newton (symbole N), défini comme kg·m/s².',
            score: 5,
            isCorrect: true,
            justification: 'Parfait. Unité correcte avec la définition formelle.',
            plagiarismRisk: 'low',
            plagiarismDetails: ''
          },
          {
            questionId: q[2]._id,
            extractedText: 'La gravité est une interaction fondamentale qui attire les masses les unes vers les autres. Selon Newton, la force gravitationnelle entre deux corps est proportionnelle au produit de leurs masses et inversement proportionnelle au carré de leur distance. Elle explique l\'orbite des planètes autour du soleil.',
            score: 10,
            isCorrect: true,
            justification: 'Réponse complète et précise. Tous les mots-clés sont présents et la loi de Newton est correctement citée.',
            plagiarismRisk: 'low',
            plagiarismDetails: ''
          }
        ]
      },

      // --- Sophie Martin : faible copie (5/20) ---
      {
        exam: exam._id,
        student: students[3]._id,
        scannedImage: 'uploads/placeholder.jpg',
        totalScore: 5,
        status: 'graded',
        createdAt: new Date('2026-06-10T10:20:00Z'),
        answers: [
          {
            questionId: q[0]._id,
            extractedText: 'Je ne sais pas.',
            score: 0,
            isCorrect: false,
            justification: 'Aucune réponse fournie.',
            plagiarismRisk: 'low',
            plagiarismDetails: ''
          },
          {
            questionId: q[1]._id,
            extractedText: 'Le kilogramme',
            score: 0,
            isCorrect: false,
            justification: 'Incorrect. Le kilogramme est l\'unité de masse, pas de force.',
            plagiarismRisk: 'low',
            plagiarismDetails: ''
          },
          {
            questionId: q[2]._id,
            extractedText: 'La gravité c\'est ce qui nous fait tomber par terre. C\'est une force.',
            score: 5,
            isCorrect: false,
            justification: 'Réponse très incomplète. Seule la notion de force est mentionnée. Les notions de masse, attraction et planète sont absentes.',
            plagiarismRisk: 'low',
            plagiarismDetails: ''
          }
        ]
      },

      // --- Lucas Bernard : copie avec plagiat élevé (15/20) ---
      {
        exam: exam._id,
        student: students[4]._id,
        scannedImage: 'uploads/placeholder.jpg',
        totalScore: 15,
        status: 'graded',
        createdAt: new Date('2026-06-10T10:45:00Z'),
        answers: [
          {
            questionId: q[0]._id,
            extractedText: 'Albert Einstein a formulé la théorie de la relativité restreinte en 1905.',
            score: 5,
            isCorrect: true,
            justification: 'Réponse correcte.',
            plagiarismRisk: 'high',
            plagiarismDetails: 'Réponse identique mot pour mot à celle de Jean Dupont (M1001). Forte suspicion de copie entre élèves.'
          },
          {
            questionId: q[1]._id,
            extractedText: 'Le Newton',
            score: 5,
            isCorrect: true,
            justification: 'Correct.',
            plagiarismRisk: 'low',
            plagiarismDetails: ''
          },
          {
            questionId: q[2]._id,
            extractedText: 'La gravité attire les masses entre elles. C\'est une force proportionnelle aux masses et inversement proportionnelle à la distance.',
            score: 5,
            isCorrect: false,
            justification: 'Réponse partiellement correcte. Les mots-clés attraction, masse et force sont présents mais la notion de planète est absente et la loi est incomplète.',
            plagiarismRisk: 'medium',
            plagiarismDetails: 'La structure de la réponse est similaire à celle d\'Albert Einstein (M1003). Possible copie partielle.'
          }
        ]
      }
    ];

    await Submission.insertMany(submissionsData);
    console.log(`${submissionsData.length} copies (submissions) créées.`);

    console.log('\n✅ Seeding terminé !');
    console.log('   - Connexion: adam@gmail.com / Ad@m2026');
    console.log(`   - Examen: "${exam.title}" (${exam.totalPoints} pts)`);
    console.log(`   - ${students.length} élèves, ${submissionsData.length} copies`);
    process.exit();
  } catch (err) {
    console.error('Erreur lors du seeding:', err);
    process.exit(1);
  }
};

seedDB();
