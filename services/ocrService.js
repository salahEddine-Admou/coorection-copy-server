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
 * Parse JSON string resiliently, removing markdown backticks and repairing truncation.
 */
function parseCleanJSON(str) {
  if (!str) return {};
  let cleaned = str.trim();
  
  // Supprimer les blocs de code markdown (comme ```json ... ```)
  cleaned = cleaned.replace(/^```json\s*/i, '');
  cleaned = cleaned.replace(/^```\s*/, '');
  cleaned = cleaned.replace(/```$/, '');
  cleaned = cleaned.trim();

  // Trouver les délimitations de l'objet JSON
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  
  if (firstBrace !== -1) {
    if (lastBrace !== -1 && lastBrace > firstBrace) {
      cleaned = cleaned.substring(firstBrace, lastBrace + 1);
    } else {
      cleaned = cleaned.substring(firstBrace);
    }
  }

  try {
    return JSON.parse(cleaned);
  } catch (e) {
    // Tenter de réparer le JSON s'il a été tronqué
    try {
      let repaired = cleaned;
      
      // Fermer un guillemet de chaîne de caractères ouvert
      const quotes = (repaired.match(/"/g) || []).length;
      if (quotes % 2 !== 0) {
        repaired += '"';
      }
      
      const openBraces = (repaired.match(/\{/g) || []).length;
      const closeBraces = (repaired.match(/\}/g) || []).length;
      const openBrackets = (repaired.match(/\[/g) || []).length;
      const closeBrackets = (repaired.match(/\]/g) || []).length;
      
      for (let i = 0; i < openBrackets - closeBrackets; i++) {
        repaired += ']';
      }
      for (let i = 0; i < openBraces - closeBraces; i++) {
        repaired += '}';
      }
      
      return JSON.parse(repaired);
    } catch (err) {
      console.error('Failed to parse and repair JSON:', str);
      throw e; // Lancer l'erreur de parsing d'origine
    }
  }
}

/**
```,StartLine:34,TargetContent:
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
    const resultObj = parseCleanJSON(resultStr);
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
const gradeAnswer = async (studentAnswer, questionText, expectedKeywords, maxScore, customInstructions = '', agentType = 'strict') => {
  try {
    const agentDirectives = agentType === 'strict'
      ? "Tu es un correcteur STRICT. Évalue rigoureusement la réponse. N'accorde les points que si les concepts ou mots-clés attendus sont explicitement formulés ou très précisément décrits. Pénalise le manque de rigueur."
      : "Tu es un correcteur BIENVEILLANT et constructif. Concentre-toi sur la compréhension globale de l'élève. Accorde des points partiels si le raisonnement sous-jacent est bon, même si l'expression ou les mots exacts manquent.";

    const prompt = `Tu es un professeur expert qui corrige des copies d'examen.
${agentDirectives}

La question posée était : "${questionText}".
La réponse de l'élève est : "${studentAnswer}".
${expectedKeywords && expectedKeywords.length > 0 ? `Les éléments de réponse attendus (mots-clés) sont : ${expectedKeywords.join(', ')}.` : ''}
La note maximale pour cette question est de ${maxScore}.
${customInstructions ? `CONSIGNES ET CORRIGÉ DE RÉFÉRENCE DE L'EXAMEN : "${customInstructions}". Réfère-toi à ce corrigé/sujet pour comprendre les questions, voir les réponses attendues et noter l'élève de manière juste.` : ''}

Tâche :
1. Évalue la note attribuée (de 0 à ${maxScore}) en jugeant intelligemment si la réponse de l'élève est correcte par rapport aux mots-clés ou au sens général de la réponse attendue.
2. Détermine si la réponse est globalement correcte (isCorrect: true/false).
3. Identifie les éléments attendus, trouvés dans la copie, et manquants sous forme de listes de concepts courts.
4. Identifie le type d'erreur commis par l'élève parmi :
   - "none" : aucune erreur (bonne réponse)
   - "knowledge" : erreur de connaissances (faits faux, oublis historiques/scientifiques)
   - "logical" : erreur de logique (déduction fausse, contradiction)
   - "incomplete" : raisonnement incomplet (réponse commencée mais non finie)
   - "confusion" : confusion entre deux concepts proches
   - "drafting" : problème de rédaction (l'élève a compris mais s'exprime mal)
5. Rédige un diagnostic cognitif court (1 à 2 phrases maximum) expliquant le raisonnement de l'élève.
6. ATTENTION PLAGIAT ET IA : Tu dois IMPÉRATIVEMENT analyser le style d'écriture. Si la réponse contient plus de 15 mots et utilise un vocabulaire trop sophistiqué, un ton robotique/académique typique de ChatGPT (ex: phrases complexes parfaites, termes comme "primordial", "dichotomie", "réfute"), ou semble directement copiée d'un manuel, tu DOIS ABSOLUMENT mettre "plagiarismRisk" à "high" ou "medium". Sois très sévère dans ta détection d'IA.

Réponds UNIQUEMENT avec un objet JSON strict au format suivant, sans aucun texte autour :
{
  "score": note_attribuée,
  "isCorrect": true_ou_false,
  "justification": "Une remarque TRÈS COURTE ET CONCISE (maximum 1 courte phrase de 10-15 mots ou quelques mots) justifiant brièvement la note.",
  "elementsExpected": ["concept 1", "concept 2"],
  "elementsFound": ["concept 1"],
  "elementsMissing": ["concept 2"],
  "errorType": "knowledge",
  "cognitiveDiagnosis": "Explication du raisonnement de l'élève...",
  "plagiarismRisk": "low", // ou "medium", ou "high"
  "plagiarismDetails": "Explication si nécessaire, sinon vide"
}`;

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1000,
      messages: [{ role: "user", content: prompt }],
    });

    const resultStr = response.content[0].text;
    const resultObj = parseCleanJSON(resultStr);

    return {
      score: resultObj.score || 0,
      isCorrect: resultObj.isCorrect || false,
      justification: resultObj.justification || "",
      elementsExpected: resultObj.elementsExpected || expectedKeywords,
      elementsFound: resultObj.elementsFound || [],
      elementsMissing: resultObj.elementsMissing || [],
      errorType: resultObj.errorType || "none",
      cognitiveDiagnosis: resultObj.cognitiveDiagnosis || "",
      plagiarismRisk: resultObj.plagiarismRisk || 'low',
      plagiarismDetails: resultObj.plagiarismDetails || ''
    };

  } catch (err) {
    console.error('gradeAnswer Error:', err.message);
    return { 
      score: 0, 
      isCorrect: false, 
      justification: "Erreur API: " + err.message,
      elementsExpected: expectedKeywords,
      elementsFound: [],
      elementsMissing: expectedKeywords,
      errorType: "none",
      cognitiveDiagnosis: "Impossible de générer le diagnostic à cause d'une erreur API.",
      plagiarismRisk: 'low',
      plagiarismDetails: ''
    };
  }
};

module.exports = { analyzeExamCopy, gradeAnswer };
