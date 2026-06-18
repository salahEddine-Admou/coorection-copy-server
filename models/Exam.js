const mongoose = require('mongoose');

const QuestionSchema = new mongoose.Schema({
  questionText: { type: String, required: true },
  questionType: { type: String, enum: ['short', 'long'], default: 'short' },
  points: { type: Number, required: true, default: 1 },
  expectedKeywords: [{ type: String }] // Mots-clés attendus pour la correction
});

const ExamSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String },
  professor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  questions: [QuestionSchema],
  totalPoints: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Exam', ExamSchema);
