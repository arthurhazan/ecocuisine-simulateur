// Vercel Serverless Function — Gemini Kitchen Simulation
// POST /api/simulate
// Body: { userPhoto: base64, modelPhotoUrl: string, modelName: string }

export const config = {
  maxDuration: 60, // Allow up to 60s for image generation
};

// In-memory cache for model photos — persists across warm invocations on the same Vercel instance
// Key: modelPhotoUrl, Value: { base64: string, mimeType: string }
const modelPhotoCache = {};

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  if (!GEMINI_API_KEY) {
    return res.status(500).json({ error: 'GEMINI_API_KEY not configured' });
  }

  try {
    const { userPhoto, userPhotoMimeType, modelPhotoUrl, modelName } = req.body;

    if (!userPhoto || !modelPhotoUrl) {
      return res.status(400).json({ error: 'Missing userPhoto or modelPhotoUrl' });
    }

    // 1. Validate that the user photo shows a kitchen or suitable interior space
    const validationUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`;
    try {
      const validationResponse = await fetch(validationUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            role: 'user',
            parts: [
              {
                inlineData: {
                  mimeType: userPhotoMimeType || 'image/jpeg',
                  data: userPhoto
                }
              },
              {
                text: `Analyse cette image et dis-moi si elle montre une cuisine, une salle à manger, un salon, ou tout autre espace intérieur d'un logement (maison ou appartement) qui pourrait accueillir une cuisine.

Réponds UNIQUEMENT avec un objet JSON valide, sans markdown, sans bloc de code, exactement dans ce format :
{"isKitchenOrInterior": true, "confidence": 0.95, "reason": "Description courte de ce que montre l'image"}`
              }
            ]
          }],
          generationConfig: {
            responseMimeType: 'application/json'
          }
        })
      });

      if (validationResponse.ok) {
        const validationResult = await validationResponse.json();
        const validationText = validationResult.candidates?.[0]?.content?.parts?.[0]?.text;
        if (validationText) {
          const validation = JSON.parse(validationText);
          if (validation.isKitchenOrInterior === false && (validation.confidence ?? 0) >= 0.7) {
            return res.status(422).json({
              error: 'invalid_photo',
              message: 'La photo ne semble pas montrer une cuisine ou un espace intérieur adapté.',
              reason: validation.reason || ''
            });
          }
        }
      }
    } catch (validationError) {
      // Fail open: if validation crashes, proceed with image generation
      console.warn('Photo validation failed, proceeding anyway:', validationError.message);
    }

    // 2. Fetch the model reference photo from ecocuisine.fr (with in-memory cache)
    let modelBase64, modelMimeType;
    if (modelPhotoCache[modelPhotoUrl]) {
      console.log('[model-photo-cache] HIT:', modelPhotoUrl);
      ({ base64: modelBase64, mimeType: modelMimeType } = modelPhotoCache[modelPhotoUrl]);
    } else {
      console.log('[model-photo-cache] MISS:', modelPhotoUrl);
      const modelResponse = await fetch(modelPhotoUrl);
      if (!modelResponse.ok) {
        return res.status(502).json({ error: 'Failed to fetch model photo' });
      }
      const modelBuffer = await modelResponse.arrayBuffer();
      modelBase64 = Buffer.from(modelBuffer).toString('base64');
      modelMimeType = modelResponse.headers.get('content-type') || 'image/jpeg';
      modelPhotoCache[modelPhotoUrl] = { base64: modelBase64, mimeType: modelMimeType };
    }

    // 3. Construct the prompt
    const prompt = `Tu es un architecte d'intérieur expert en rénovation de cuisine, spécialisé dans les cuisines ECOCUISINE.

MISSION : À partir de la photo de cette pièce (Image 1), génère une image photoréaliste montrant cette même pièce équipée avec le style de la cuisine de référence "${modelName}" (Image 2).

RÈGLES IMPÉRATIVES :
1. PERSPECTIVE : Conserver EXACTEMENT la même perspective, le même angle de vue, le même cadrage et le même point de fuite que la photo d'origine (Image 1). La caméra ne bouge absolument pas. La position de la caméra, sa hauteur, son inclinaison et sa focale doivent être strictement identiques.
2. ARCHITECTURE : Ne JAMAIS modifier l'architecture du bâtiment : murs, fenêtres, portes, sol, plafond, dimensions de la pièce, prises électriques, radiateurs. Tous les éléments structurels restent exactement à leur place.
3. CUISINE : Appliquer les éléments visuels de la cuisine de référence "${modelName}" (Image 2) : style des façades de meubles, couleurs, finitions (mat/brillant/bois), type de plan de travail, crédence, poignées, électroménager intégré.
4. COHÉRENCE SPATIALE : Adapter harmonieusement le mobilier de cuisine à l'espace existant de la photo d'origine. Respecter les contraintes de la pièce (arrivées d'eau, prises, ouvertures). Les meubles doivent s'intégrer naturellement dans la pièce telle qu'elle est.
5. PHOTORÉALISME : Le résultat doit être indiscernable d'une vraie photographie. L'éclairage doit être cohérent avec celui de la photo d'origine (lumière naturelle, ombres, reflets).
6. FORMAT : L'image générée doit avoir exactement les mêmes proportions et la même résolution que l'image d'origine.`;

    // 4. Call Gemini API
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image-preview:generateContent?key=${GEMINI_API_KEY}`;

    const geminiResponse = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          role: 'user',
          parts: [
            {
              inlineData: {
                mimeType: userPhotoMimeType || 'image/jpeg',
                data: userPhoto
              }
            },
            {
              inlineData: {
                mimeType: modelMimeType,
                data: modelBase64
              }
            },
            { text: prompt }
          ]
        }],
        generationConfig: {
          responseModalities: ['IMAGE'],
          thinkingConfig: { thinkingLevel: 'MINIMAL' },
          imageConfig: { imageSize: '1K' }
        }
      })
    });

    if (!geminiResponse.ok) {
      const errorText = await geminiResponse.text();
      console.error('Gemini API error:', geminiResponse.status, errorText);
      return res.status(502).json({
        error: 'Gemini API error',
        status: geminiResponse.status,
        details: errorText
      });
    }

    const result = await geminiResponse.json();

    // 5. Extract the generated image
    const candidates = result.candidates;
    if (!candidates || candidates.length === 0) {
      return res.status(502).json({ error: 'No candidates in Gemini response', result });
    }

    const parts = candidates[0].content?.parts;
    if (!parts) {
      return res.status(502).json({ error: 'No parts in Gemini response', result });
    }

    // Find the image part
    const imagePart = parts.find(p => p.inlineData?.data);
    if (!imagePart) {
      // Maybe there's text instead of image
      const textPart = parts.find(p => p.text);
      return res.status(502).json({
        error: 'No image generated',
        message: textPart?.text || 'Unknown error'
      });
    }

    return res.status(200).json({
      image: imagePart.inlineData.data,
      mimeType: imagePart.inlineData.mimeType
    });

  } catch (error) {
    console.error('Simulation error:', error);
    return res.status(500).json({ error: 'Internal server error', message: error.message });
  }
}
