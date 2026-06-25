const mongoose = require('mongoose');

const AnswerSchema = new mongoose.Schema({
  questionId: { type: mongoose.Schema.Types.ObjectId, required: true },
  extractedText: { type: String, default: '' },
  scoreIA: { type: Number, default: 0 },
  scoreProf: { type: Number, default: 0 },
  score: { type: Number, default: 0 }, // note finale affichée
  isCorrect: { type: Boolean, default: false },
  justificationIA: { type: String, default: '' },
  justificationProf: { type: String, default: '' },
  justification: { type: String, default: '' }, // justification finale affichée
  elementsExpected: [{ type: String }],
  elementsFound: [{ type: String }],
  elementsMissing: [{ type: String }],
  errorType: { type: String, enum: ['none', 'knowledge', 'logical', 'incomplete', 'confusion', 'drafting'], default: 'none' },
  cognitiveDiagnosis: { type: String, default: '' },
  plagiarismRisk: { type: String, enum: ['low', 'medium', 'high'], default: 'low' },
  plagiarismDetails: { type: String, default: '' }
});

const SubmissionSchema = new mongoose.Schema({
  exam: { type: mongoose.Schema.Types.ObjectId, ref: 'Exam', required: true },
  student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
  scannedImage: { type: String, required: true }, // Path to the uploaded image
  answers: [AnswerSchema],
  totalScoreIA: { type: Number, default: 0 },
  totalScoreProf: { type: Number, default: 0 },
  totalScore: { type: Number, default: 0 }, // note finale affichée
  confidenceIndex: { type: Number, default: 100 },
  status: { type: String, enum: ['pending', 'graded', 'needs_review'], default: 'pending' },
  twinSimilarityScore: { type: Number, default: 100 },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Submission', SubmissionSchema);
