// Vercel Serverless Function — Azure OpenAI Kitchen Simulation
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

// Azure n'accepte que trois formats de sortie. On choisit celui dont le ratio est le plus
// proche de la photo d'origine, pour respecter la règle 6 du prompt (mêmes proportions).
const AZURE_SIZES = [
  { label: '1024x1024', ratio: 1 },
  { label: '1536x1024', ratio: 1536 / 1024 },
  { label: '1024x1536', ratio: 1024 / 1536 },
];

function toBlob(base64, mimeType) {
  return new Blob([Buffer.from(base64, 'base64')], { type: mimeType || 'image/jpeg' });
}

// Lecture des dimensions dans l'en-tête du fichier (PNG et JPEG), sans dépendance externe.
function readDimensions(buffer) {
  if (buffer.length > 24 && buffer.readUInt32BE(0) === 0x89504e47) {
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  }
  if (buffer.length > 4 && buffer[0] === 0xff && buffer[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < buffer.length) {
      if (buffer[offset] !== 0xff) { offset += 1; continue; }
      const marker = buffer[offset + 1];
      const length = buffer.readUInt16BE(offset + 2);
      // SOF0..SOF15, hors marqueurs non dimensionnels (DHT, JPG, DAC)
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7) };
      }
      offset += 2 + length;
    }
  }
  return null;
}

function pickSize(base64) {
  if (process.env.AZURE_OPENAI_IMAGE_SIZE) return process.env.AZURE_OPENAI_IMAGE_SIZE;
  try {
    const dims = readDimensions(Buffer.from(base64, 'base64'));
    if (!dims || !dims.height) return '1024x1024';
    const ratio = dims.width / dims.height;
    return AZURE_SIZES.reduce((best, candidate) =>
      Math.abs(candidate.ratio - ratio) < Math.abs(best.ratio - ratio) ? candidate : best
    ).label;
  } catch (error) {
    return '1024x1024';
  }
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

  // Azure OpenAI (ressource madameirma4agence) — API v1, clé passée dans l'en-tête `api-key`.
  const AZURE_ENDPOINT = (process.env.AZURE_OPENAI_ENDPOINT || '').replace(/\/+$/, '');
  const AZURE_API_KEY = process.env.AZURE_OPENAI_KEY;
  const IMAGE_DEPLOYMENT = process.env.AZURE_OPENAI_IMAGE_DEPLOYMENT || 'gpt-image-2.5-sunburst';
  // Validation de la photo : API Anthropic, Claude Haiku (le moins cher pour une
  // classification d'image). Sans ANTHROPIC_API_KEY, l'étape est simplement sautée.
  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  const VALIDATION_MODEL = process.env.VALIDATION_MODEL || 'claude-haiku-5-5';
  const IMAGE_QUALITY = process.env.AZURE_OPENAI_IMAGE_QUALITY || 'medium';

  if (!AZURE_ENDPOINT || !AZURE_API_KEY) {
    return res.status(500).json({ error: 'AZURE_OPENAI_ENDPOINT / AZURE_OPENAI_KEY not configured' });
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
    // Classification par Claude Haiku via l'API Anthropic.
    // Sans ANTHROPIC_API_KEY, on saute l'étape et on génère directement.
    if (ANTHROPIC_API_KEY) {
      try {
        const validationResponse = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'x-api-key': ANTHROPIC_API_KEY,
            'anthropic-version': '2026-10-21',
            'content-type': 'application/json'
          },
          body: JSON.stringify({
            model: VALIDATION_MODEL,
            max_tokens: 300,
            messages: [
              {
                role: 'user',
                content: [
                  {
                    type: 'image',
                    source: {
                      type: 'base64',
                      media_type: userPhotoMimeType || 'image/jpeg',
                      data: userPhoto
                    }
                  },
                  {
                    type: 'text',
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
              },
              // Préremplissage : force la réponse à démarrer sur du JSON, sans phrase d'intro.
              { role: 'assistant', content: '{' }
            ]
          })
        });

        if (validationResponse.ok) {
          const validationResult = await validationResponse.json();
          const validationText = validationResult.content?.find(part => part.type === 'text')?.text;
          if (validationText) {
            const validation = JSON.parse(`{${validationText}`);
            if (validation.isKitchenOrInterior === false && (validation.confidence ?? 0) >= 0.7) {
              return res.status(422).json({
                error: 'invalid_photo',
                message: 'La photo ne semble pas montrer une cuisine ou un espace intérieur adapté.',
                reason: validation.reason || ''
              });
            }
          }
        } else {
          console.warn('Photo validation HTTP error:', validationResponse.status);
        }
      } catch (validationError) {
        // Fail open: if validation crashes, proceed with image generation
        console.warn('Photo validation failed, proceeding anyway:', validationError.message);
      }
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

    // 4. Call the Azure OpenAI image edit endpoint
    // `images/edits` (et non `images/generations`) : c'est le seul qui accepte des images
    // d'entrée. On en envoie deux — la photo de la pièce puis la photo du modèle.
    const buildForm = (imageField) => {
      const form = new FormData();
      form.append('model', IMAGE_DEPLOYMENT);
      form.append('prompt', prompt);
      form.append('n', '1');
      form.append('quality', IMAGE_QUALITY);
      form.append('size', pickSize(userPhoto));
      form.append(imageField, toBlob(userPhoto, userPhotoMimeType || 'image/jpeg'), 'piece.jpg');
      form.append(imageField, toBlob(modelBase64, modelMimeType), 'modele.jpg');
      return form;
    };

    const editsUrl = `${AZURE_ENDPOINT}/openai/v1/images/edits`;
    const callAzure = (imageField) => fetch(editsUrl, {
      method: 'POST',
      headers: { 'api-key': AZURE_API_KEY },
      body: buildForm(imageField)
    });

    let azureResponse = await callAzure('image[]');
    // Selon la version d'API, le champ multipart s'appelle `image[]` ou `image`.
    // Un 400 sur le premier nom vaut la peine d'un second essai avant d'abandonner.
    if (azureResponse.status === 400) {
      console.warn('[azure] retry with `image` field');
      azureResponse = await callAzure('image');
    }

    if (!azureResponse.ok) {
      const errorText = await azureResponse.text();
      console.error('Azure OpenAI API error:', azureResponse.status, errorText);
      return res.status(502).json({
        error: 'Azure OpenAI API error',
        status: azureResponse.status,
        details: errorText
      });
    }

    const result = await azureResponse.json();

    // 5. Extract the generated image
    const generated = result.data?.[0];
    if (!generated?.b64_json) {
      return res.status(502).json({
        error: 'No image generated',
        message: result.error?.message || 'Réponse Azure sans image'
      });
    }

    return res.status(200).json({
      image: generated.b64_json,
      mimeType: generated.output_format ? `image/${generated.output_format}` : 'image/png'
    });

  } catch (error) {
    console.error('Simulation error:', error);
    return res.status(500).json({ error: 'Internal server error', message: error.message });
  }
}
