const dns = require('dns');
dns.setServers(['8.8.8.8', '1.1.1.1']);

require('dotenv').config();
const mongoose = require('mongoose');
const Exam = require('./models/Exam');
const Student = require('./models/Student');
const User = require('./models/User');

mongoose.connect(process.env.MONGO_URI)
  .then(async () => {
    try {
      const user = await User.findOne();
      if (!user) {
        console.log("No user found.");
        process.exit(1);
      }

      const exam = new Exam({
        professor: user._id,
        title: "Philosophie : L'IA",
        description: "Dissertation sur l'intelligence artificielle.",
        totalPoints: 20,
        questions: [
          {
            questionText: "Selon vous, une machine pourra-t-elle un jour posséder une conscience similaire à celle des humains ?",
            points: 20,
            expectedKeywords: ["conscience", "sentience", "algorithmes", "John Searle", "chambre chinoise", "Alan Turing"]
          }
        ]
      });
      await exam.save();

      let student = await Student.findOne({ matricule: "PHIL101" });
      if (!student) {
        student = new Student({
          professor: user._id,
          firstName: "Jean",
          lastName: "Valjean",
          matricule: "PHIL101",
          email: "jean.valjean@example.com",
          className: "Terminale Philosophie"
        });
        await student.save();
      }

      console.log("Exam created successfully!");
      process.exit(0);
    } catch (err) {
      console.error(err);
      process.exit(1);
    }
  })
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
