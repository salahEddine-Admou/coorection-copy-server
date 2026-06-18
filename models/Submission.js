const mongoose = require('mongoose');

const AnswerSchema = new mongoose.Schema({
  questionId: { type: mongoose.Schema.Types.ObjectId, required: true },
  extractedText: { type: String, default: '' },
  score: { type: Number, default: 0 },
  isCorrect: { type: Boolean, default: false },
  justification: { type: String, default: '' }
});

const SubmissionSchema = new mongoose.Schema({
  exam: { type: mongoose.Schema.Types.ObjectId, ref: 'Exam', required: true },
  student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
  scannedImage: { type: String, required: true }, // Path to the uploaded image
  answers: [AnswerSchema],
  totalScore: { type: Number, default: 0 },
  status: { type: String, enum: ['pending', 'graded'], default: 'pending' },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Submission', SubmissionSchema);
