// Vercel Serverless Function — Gemini Kitchen Simulation
// POST /api/simulate
// Body: { userPhoto: base64, modelPhotoUrl: string, modelName: string }

export const config = {
  maxDuration: 60, // Allow up to 60s for image generation
};

// In-memory cache for model photos — persists across warm invocations on the same Vercel instance
// Key: modelPhotoUrl, Value: { base64: string, mimeType: string }
const modelPhotoCache = {};

// Rate limiting — image generation is billed per call, so an open endpoint is a cost risk.
// This is a best-effort guard: the counter lives in the memory of a single warm Vercel
// instance, so a burst spread across cold starts can exceed the cap. It stops casual
// looping and scripted abuse from one client, not a distributed attack. A durable store
// (Upstash/Redis) is the next step if the volume justifies it.
const RATE_LIMIT_MAX = Number(process.env.RATE_LIMIT_MAX || 10);
const RATE_LIMIT_WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MS || 60 * 60 * 1000);
const rateLimitBuckets = new Map();

function clientKey(req) {
  const forwarded = req.headers['x-forwarded-for'];
  const ip = (Array.isArray(forwarded) ? forwarded[0] : forwarded || '').split(',')[0].trim();
  return ip || req.headers['x-real-ip'] || req.socket?.remoteAddress || 'unknown';
}

function isRateLimited(req) {
  const key = clientKey(req);
  const now = Date.now();
  const bucket = rateLimitBuckets.get(key);

  if (!bucket || now - bucket.startedAt > RATE_LIMIT_WINDOW_MS) {
    rateLimitBuckets.set(key, { startedAt: now, count: 1 });
    return { limited: false, count: 1 };
  }

  bucket.count += 1;
  // Opportunistic cleanup so the map cannot grow without bound on a long-lived instance.
  if (rateLimitBuckets.size > 5000) {
    for (const [k, b] of rateLimitBuckets) {
      if (now - b.startedAt > RATE_LIMIT_WINDOW_MS) rateLimitBuckets.delete(k);
    }
  }
  return { limited: bucket.count > RATE_LIMIT_MAX, count: bucket.count };
}

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

  const rate = isRateLimited(req);
  if (rate.limited) {
    console.warn('[rate-limit] blocked', clientKey(req), rate.count);
    res.setHeader('Retry-After', String(Math.ceil(RATE_LIMIT_WINDOW_MS / 1000)));
    return res.status(429).json({
      error: 'rate_limited',
      message: `Limite de ${RATE_LIMIT_MAX} simulations par heure atteinte. Réessayez plus tard.`,
    });
  }

  try {
    const { userPhoto, userPhotoMimeType, modelPhotoUrl, modelName } = req.body;

    if (!userPhoto || !modelPhotoUrl) {
      return res.status(400).json({ error: 'Missing userPhoto or modelPhotoUrl' });
    }

    // 1. Validate that the user photo shows a kitchen or suitable interior space
    // gemini-2.0-flash a été arrêté le 1er juin 2026 : la validation tournait donc à vide
    // (échec silencieux, on passait directement à la génération). Modèle de remplacement :
    // le flash-lite courant, le moins cher pour une simple classification d'image.
    const VALIDATION_MODEL = process.env.VALIDATION_MODEL || 'gemini-3.5-flash-lite';
    const validationUrl = `https://generativelanguage.googleapis.com/v1beta/models/${VALIDATION_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
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
                text: `Tu es un classificateur strict. Analyse cette image.

Elle est VALIDE uniquement si elle montre principalement :
- une pièce, vide ou meublée (cuisine, salle à manger, salon, couloir, salle de bain), avec murs, sol et plafond visibles ;
- un espace architectural intérieur où une cuisine pourrait être installée.

Elle est INVALIDE si elle montre principalement :
- une personne, un visage ou un portrait, même dans un intérieur ;
- un animal ;
- un extérieur (jardin, rue, façade) ;
- un objet ou un meuble seul, sans contexte architectural ;
- une capture d'écran, un dessin, un plan, un document.

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
3bis. ÉLECTROMÉNAGER : chaque appareil doit rester un appareil, jamais un meuble ou un caisson plein. Le four et le micro-ondes gardent une porte vitrée sombre, un bandeau de commandes visible et une façade en inox ou en verre distincte des façades de meubles. La plaque de cuisson reste une surface plane sombre affleurant le plan de travail, avec ses foyers visibles. La hotte reste un volume distinct au-dessus de la plaque. Le lave-vaisselle et le réfrigérateur intégrés peuvent être habillés par une façade assortie, mais leurs poignées et lignes de refente doivent rester lisibles. Ne jamais remplacer un appareil par un placard, un tiroir ou une façade pleine, et ne jamais inventer d'appareil absent de la photo d'origine.
4. COHÉRENCE SPATIALE : Adapter harmonieusement le mobilier de cuisine à l'espace existant de la photo d'origine. Respecter les contraintes de la pièce (arrivées d'eau, prises, ouvertures). Les meubles doivent s'intégrer naturellement dans la pièce telle qu'elle est.
5. PHOTORÉALISME : Le résultat doit être indiscernable d'une vraie photographie. L'éclairage doit être cohérent avec celui de la photo d'origine (lumière naturelle, ombres, reflets).
6. FORMAT : L'image générée doit avoir exactement les mêmes proportions et la même résolution que l'image d'origine.`;

    // 4. Call Gemini API
    // ID GA du modèle (l'ancien `gemini-3.1-flash-image-preview` n'existe plus sous ce nom).
    // Coût de référence : ~0,067 $ par image en 1K, ~0,045 $ en 0,5K.
    const IMAGE_MODEL = process.env.IMAGE_MODEL || 'gemini-3.1-flash-image';
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${IMAGE_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

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
