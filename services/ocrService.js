const fs = require('fs');
const { OpenAI } = require('openai');

const openai = new OpenAI({
  baseURL: 'https://api.deepseek.com',
  apiKey: process.env.DEEPSEEK_API_KEY,
});

/**
 * Convertit une image en base64
 */
function encodeImage(imagePath) {
  const imageBuffer = fs.readFileSync(imagePath);
  return imageBuffer.toString('base64');
}

/**
 * Utilise DeepSeek pour extraire le texte et corriger la réponse.
 */
const gradeAnswerWithDeepSeek = async (imagePath, questionText, expectedKeywords, maxScore) => {
  try {
    const base64Image = encodeImage(imagePath);

    const prompt = `
      Tu es un professeur expert qui corrige des copies d'examen.
      Voici une image scannée de la copie d'un élève. 
      La question posée était : "${questionText}".
      Les éléments de réponse attendus (mots-clés) sont : ${expectedKeywords.join(', ')}.
      La note maximale pour cette question est de ${maxScore}.
      
      Tâche :
      1. Extraire le texte lu sur l'image (OCR).
      2. Comparer le texte extrait avec la réponse attendue de manière intelligente.
      3. Attribuer une note (entre 0 et ${maxScore}).
      
      Réponds UNIQUEMENT avec un objet JSON strict au format suivant, sans bloc de code markdown (pas de \`\`\`json):
      {
        "extractedText": "Le texte lu sur l'image",
        "score": note_attribuée,
        "isCorrect": true_ou_false,
        "justification": "Brève explication de la note"
      }
    `;

    const response = await openai.chat.completions.create({
      model: "deepseek-chat", // Or deepseek-vision if they added one, but standard chat is recommended as default endpoint
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            {
              type: "image_url",
              image_url: {
                url: `data:image/jpeg;base64,${base64Image}`
              }
            }
          ],
        },
      ],
      response_format: { type: "json_object" }
    });

    const resultStr = response.choices[0].message.content;
    const resultObj = JSON.parse(resultStr);

    return {
      extractedText: resultObj.extractedText || "Texte non trouvé",
      score: resultObj.score || 0,
      isCorrect: resultObj.isCorrect || false,
      justification: resultObj.justification || ""
    };

  } catch (err) {
    console.error('DeepSeek Vision/OCR Error:', err.message);
    
    // Fallback: Si le modèle ne supporte pas l'image, on utilise tesseract puis DeepSeek pour l'analyse
    console.log("Fallback: Utilisation de Tesseract pour l'OCR puis DeepSeek pour la logique");
    const Tesseract = require('tesseract.js');
    const { data: { text } } = await Tesseract.recognize(imagePath, 'fra');
    
    return await gradeTextWithDeepSeek(text, questionText, expectedKeywords, maxScore);
  }
};

/**
 * Fallback fonction si DeepSeek n'accepte pas l'image directement : 
 * Analyse un texte pré-extrait (par Tesseract) avec DeepSeek
 */
const gradeTextWithDeepSeek = async (extractedText, questionText, expectedKeywords, maxScore) => {
    try {
        const prompt = `
          Tu es un professeur expert qui corrige des copies d'examen.
          Voici le texte extrait (par OCR) de la copie d'un élève : "${extractedText}".
          La question posée était : "${questionText}".
          Les éléments de réponse attendus (mots-clés) sont : ${expectedKeywords.join(', ')}.
          La note maximale pour cette question est de ${maxScore}.
          
          Tâche : Évalue intelligemment si la réponse de l'élève est correcte par rapport aux mots-clés ou au sens général de la réponse attendue.
          
          Réponds UNIQUEMENT avec un objet JSON strict au format suivant, sans bloc de code markdown (pas de \`\`\`json):
          {
            "extractedText": "${extractedText.replace(/"/g, '\\"')}",
            "score": note_attribuée,
            "isCorrect": true_ou_false,
            "justification": "Brève explication de la note"
          }
        `;

        const response = await openai.chat.completions.create({
            model: "deepseek-chat",
            messages: [{ role: "user", content: prompt }],
            response_format: { type: "json_object" }
        });

        const resultObj = JSON.parse(response.choices[0].message.content);
        return {
            extractedText: resultObj.extractedText || extractedText,
            score: resultObj.score || 0,
            isCorrect: resultObj.isCorrect || false,
            justification: resultObj.justification || ""
        };
    } catch (err) {
        console.error("DeepSeek Fallback Error:", err);
        return { extractedText, score: 0, isCorrect: false, justification: "Erreur API" };
    }
}

module.exports = { gradeAnswerWithDeepSeek };
