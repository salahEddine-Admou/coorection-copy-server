const fs = require('fs');
const Anthropic = require('@anthropic-ai/sdk');

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

/**
 * Convertit une image en base64
 */
function encodeImage(imagePath) {
  const imageBuffer = fs.readFileSync(imagePath);
  return imageBuffer.toString('base64');
}

/**
 * Détecte le type MIME à partir des magic bytes du fichier
 */
function getMediaType(imagePath) {
  const buffer = fs.readFileSync(imagePath);
  // Check magic bytes
  if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
    return 'image/jpeg';
  }
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
    return 'image/png';
  }
  if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) {
    return 'image/gif';
  }
  if (buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46) {
    return 'image/webp';
  }
  // Fallback: try extension
  const ext = imagePath.toLowerCase().split('.').pop();
  const types = { 'jpg': 'image/jpeg', 'jpeg': 'image/jpeg', 'png': 'image/png', 'gif': 'image/gif', 'webp': 'image/webp' };
  return types[ext] || 'image/jpeg';
}

/**
 * Analyse complète d'une copie d'examen avec Claude Vision.
 * Extrait en un seul appel : nom de l'élève, titre de l'examen, et toutes les réponses.
 */
const analyzeExamCopy = async (imagePath, availableStudents = [], availableExams = []) => {
  try {
    const base64Image = encodeImage(imagePath);
    const mediaType = getMediaType(imagePath);
    const fileSize = fs.statSync(imagePath).size;

    console.log('analyzeExamCopy: fichier =', imagePath, '| taille =', fileSize, 'bytes | type =', mediaType);

    const prompt = `Tu es un assistant intelligent qui analyse des copies d'examen scannées.
Voici une image scannée d'une copie d'examen remplie par un élève.

Informations connues (pour t'aider à déchiffrer l'écriture manuscrite souvent très difficile à lire) :
- Liste des noms d'élèves possibles : ${availableStudents.length > 0 ? availableStudents.join(', ') : 'Inconnue'}
- Liste des titres d'examens possibles : ${availableExams.length > 0 ? availableExams.join(', ') : 'Inconnue'}

Tâche :
1. Extraire le TITRE de l'examen écrit sur la copie. (Utilise la liste fournie pour deviner le titre exact si l'écriture est mauvaise).
2. Extraire le NOM COMPLET de l'élève écrit sur la copie. (TRÈS IMPORTANT: Utilise la liste des élèves fournie pour deviner le nom exact de l'élève. Même si l'écriture est illisible ou que le nom de famille et le prénom sont inversés, trouve la meilleure correspondance dans la liste).
3. Pour CHAQUE question visible sur la copie, extraire :
   - Le numéro de la question
   - Le texte de la question
   - La réponse écrite par l'élève

Réponds UNIQUEMENT avec un objet JSON strict au format suivant, sans aucun texte autour :
{
  "examTitle": "Le titre de l'examen extrait de la copie",
  "studentName": "Le nom complet de l'élève extrait de la copie",
  "answers": [
    {
      "questionNumber": 1,
      "questionText": "Le texte de la question",
      "studentAnswer": "La réponse écrite par l'élève"
    }
  ]
}`;

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
              text: prompt,
            },
          ],
        },
      ],
    });

    const resultStr = response.content[0].text;
    const jsonMatch = resultStr.match(/\{[\s\S]*\}/);
    const resultObj = JSON.parse(jsonMatch ? jsonMatch[0] : resultStr);
    console.log('analyzeExamCopy: Résultat:', JSON.stringify(resultObj, null, 2));
    return resultObj;

  } catch (err) {
    console.error('analyzeExamCopy Error:', err.message);
    throw new Error('Erreur lors de l\'analyse de la copie: ' + err.message);
  }
};

/**
 * Corrige une réponse d'élève par rapport aux mots-clés attendus avec Claude.
 */
const gradeAnswer = async (studentAnswer, questionText, expectedKeywords, maxScore) => {
  try {
    const prompt = `Tu es un professeur expert qui corrige des copies d'examen.
La question posée était : "${questionText}".
La réponse de l'élève est : "${studentAnswer}".
Les éléments de réponse attendus (mots-clés) sont : ${expectedKeywords.join(', ')}.
La note maximale pour cette question est de ${maxScore}.

Tâche : Évalue intelligemment si la réponse de l'élève est correcte par rapport aux mots-clés ou au sens général de la réponse attendue.

Réponds UNIQUEMENT avec un objet JSON strict au format suivant, sans aucun texte autour :
{
  "extractedText": "${studentAnswer.replace(/"/g, '\\"')}",
  "score": note_attribuée,
  "isCorrect": true_ou_false,
  "justification": "Brève explication de la note"
}`;

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 512,
      messages: [{ role: "user", content: prompt }],
    });

    const resultStr = response.content[0].text;
    const jsonMatch = resultStr.match(/\{[\s\S]*\}/);
    const resultObj = JSON.parse(jsonMatch ? jsonMatch[0] : resultStr);

    return {
      extractedText: resultObj.extractedText || studentAnswer,
      score: resultObj.score || 0,
      isCorrect: resultObj.isCorrect || false,
      justification: resultObj.justification || ""
    };

  } catch (err) {
    console.error('gradeAnswer Error:', err.message);
    return { extractedText: studentAnswer, score: 0, isCorrect: false, justification: "Erreur API: " + err.message };
  }
};

module.exports = { analyzeExamCopy, gradeAnswer };
