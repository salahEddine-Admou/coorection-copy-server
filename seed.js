const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const User = require('./models/User');
const Student = require('./models/Student');
const Exam = require('./models/Exam');

const seedDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('MongoDB connected for seeding...');

    // Nettoyer la base (optionnel, on va juste ajouter/mettre à jour le prof test)
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
      { firstName: 'Jean', lastName: 'Dupont', matricule: 'M1001', className: 'Terminale S', professor: prof._id },
      { firstName: 'Marie', lastName: 'Curie', matricule: 'M1002', className: 'Terminale S', professor: prof._id },
      { firstName: 'Albert', lastName: 'Einstein', matricule: 'M1003', className: 'Terminale S', professor: prof._id }
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

    console.log('Seeding terminé !');
    process.exit();
  } catch (err) {
    console.error('Erreur lors du seeding:', err);
    process.exit(1);
  }
};

seedDB();
