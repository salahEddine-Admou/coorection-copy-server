const User = require('../models/User');
const Submission = require('../models/Submission');
const Anthropic = require('@anthropic-ai/sdk');

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

/**
 * Analyse les modifications apportées par le professeur pour mettre à jour son jumeau numérique.
 */
const learnFromTeacherEdit = async (userId, submission, exam) => {
  try {
    // 1. Récupérer toutes les soumissions de ce professeur avec des différences de notation
    const submissions = await Submission.find({ exam: exam._id })
      .populate('student');
    
    let totalEditsCount = 0;
    let totalScoreDiff = 0;
    const diffData = [];

    for (const sub of submissions) {
      // Trouver les questions éditées
      for (let i = 0; i < sub.answers.length; i++) {
        const ans = sub.answers[i];
        const examQuestion = exam.questions.find(q => q._id.toString() === ans.questionId.toString());
        
        // S'il y a un écart entre la note IA et la note finale du prof
        if (ans.scoreProf !== ans.scoreIA || (ans.justificationProf && ans.justificationProf !== ans.justificationIA)) {
          totalEditsCount++;
          totalScoreDiff += (ans.scoreProf - ans.scoreIA);

          diffData.push({
            questionText: examQuestion?.questionText || 'Question inconnue',
            expectedKeywords: examQuestion?.expectedKeywords || [],
            studentAnswer: ans.extractedText,
            scoreIA: ans.scoreIA,
            scoreProf: ans.scoreProf,
            justificationIA: ans.justificationIA,
            justificationProf: ans.justificationProf
          });
        }
      }
    }

    // S'il n'y a pas assez d'éditions pour apprendre, on met juste à jour l'offset de sévérité de base
    if (totalEditsCount === 0) return;

    const severityOffset = totalScoreDiff / totalEditsCount;

    // 2. Si on a des différences, appeler Claude pour extraire les consignes implicites du professeur
    console.log(`=== TWIN LEARNING: Analyse de ${diffData.length} corrections professeurs ===`);

    const prompt = `Tu es un jumeau numérique pédagogique. Ta tâche est d'analyser les différences de notation entre une IA correctrice et un professeur humain pour en déduire les critères implicites et les préférences de ce professeur.
    
Voici un historique des écarts constatés :
${JSON.stringify(diffData, null, 2)}

Consignes d'analyse :
1. Déduis les critères implicites du professeur (ex: "exige des dates précises", "pénalise sévèrement les erreurs de syntaxe", "valorise l'argumentation même si incomplète").
2. Rédige une directive claire et concise (styleDirectives) que nous injecterons dans le prompt des futures corrections de l'IA pour imiter ce professeur.
3. Calcule l'indice de sévérité global (severityOffset) : négatif si le prof est plus sévère que l'IA, positif s'il est plus indulgent. Actuellement calculé mathématiquement à : ${severityOffset.toFixed(2)}.

Réponds UNIQUEMENT avec un objet JSON strict au format suivant, sans aucun texte autour :
{
  "severityOffset": ${severityOffset.toFixed(2)},
  "implicitCriteria": ["critère 1", "critère 2"],
  "styleDirectives": "Directive synthétique à l'attention du correcteur IA pour les futures copies..."
}`;

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    });

    const resultStr = response.content[0].text;
    const jsonMatch = resultStr.match(/\{[\s\S]*\}/);
    const resultObj = JSON.parse(jsonMatch ? jsonMatch[0] : resultStr);

    console.log('=== TWIN LEARNING: Profil appris ===', JSON.stringify(resultObj, null, 2));

    // 3. Mettre à jour le profil de l'utilisateur
    await User.findByIdAndUpdate(userId, {
      gradingProfile: {
        severityOffset: resultObj.severityOffset || severityOffset,
        implicitCriteria: resultObj.implicitCriteria || [],
        styleDirectives: resultObj.styleDirectives || '',
        lastUpdated: Date.now()
      }
    });

  } catch (err) {
    console.error('learnFromTeacherEdit error:', err);
  }
};

module.exports = {
  learnFromTeacherEdit
};
