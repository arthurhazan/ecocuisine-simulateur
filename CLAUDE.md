# ÉcoCuisine — Simulateur de rendu cuisine IA

Landing page + simulateur de projection IA pour ÉcoCuisine (enseigne de cuisines, ~100 magasins
indépendants). Prototype développé par Arthur Guillermin (ARNEO / Agence Mantu), présenté au client
et actuellement en attente de la phase de test de 2 mois.

Contexte métier complet, parties prenantes et historique : `docs/CONTEXTE-PROJET.md`.
Chantiers ouverts : `docs/BACKLOG.md`.

## Stack

- Une seule page : `index.html` (~3 700 lignes) — HTML, CSS et JS inline, aucun build, aucune dépendance npm.
- `api/simulate.js` : Vercel Serverless Function (Node, `maxDuration: 60`).
- Hébergement Vercel, projet `ecocuisine-simulateur` (`prj_vuBuQ87l35EpdynGP3hYcmWge68G`).
  URL de démo : https://ecocuisine-simulateur.vercel.app/ — sous-domaine cible côté client :
  `simulateur.ecocuisine.fr`.
- Serveur local : `npx serve -l 3000 .` (configuré dans `.claude/launch.json`, cible
  `preview_start` avec le nom « Static HTML Server »). Attention : l'appel `/api/simulate` n'existe
  pas sous `serve`, il faut `vercel dev` pour tester la génération de bout en bout.

## Chaîne de génération (`api/simulate.js`)

Deux fournisseurs : Azure OpenAI pour l'image (ressource `madameirma4agence`, API v1, clé dans
l'en-tête `api-key`) et l'API Anthropic pour la validation de photo.

1. Validation de la photo uploadée par Claude Haiku (réponse JSON `isKitchenOrInterior`) —
   renvoie 422 `invalid_photo` si l'image n'est pas un intérieur, mais échoue « ouvert » (on
   continue) si la validation plante. Étape sautée si `ANTHROPIC_API_KEY` n'est pas défini.
2. Téléchargement de la photo du modèle de cuisine depuis `ecocuisine.fr`, avec cache mémoire
   par URL, valable pour les invocations chaudes d'une même instance Vercel.
3. Génération par `POST /openai/v1/images/edits` (déploiement `gpt-image-2.5-sunburst` par
   défaut), en multipart avec les deux images d'entrée — photo de la pièce puis photo du modèle —
   et un prompt d'architecte d'intérieur qui verrouille la perspective, l'architecture de la
   pièce, l'éclairage et le format. Le format de sortie (1024x1024, 1536x1024 ou 1024x1536) est
   choisi d'après le ratio de la photo d'origine.
4. Réponse : image base64 + mimeType. Aucun stockage serveur des photos.

Variables d'environnement Vercel, jamais committées :

| Variable | Rôle |
| --- | --- |
| `AZURE_OPENAI_ENDPOINT` | `https://madameirma4agence.openai.azure.com` |
| `AZURE_OPENAI_KEY` | clé API de la ressource |
| `AZURE_OPENAI_IMAGE_DEPLOYMENT` | déploiement image, défaut `gpt-image-2.5-sunburst` |
| `ANTHROPIC_API_KEY` | clé API Anthropic pour la validation de photo (optionnel) |
| `VALIDATION_MODEL` | modèle de validation, défaut `claude-haiku-5-5` |
| `AZURE_OPENAI_IMAGE_QUALITY` | `low` / `medium` / `high`, défaut `medium` |
| `AZURE_OPENAI_IMAGE_SIZE` | force une taille de sortie, sinon déduite du ratio |


## Principes produit à respecter

- Aucune photo utilisateur ne doit être stockée côté serveur ni en base : traitement dans le
  navigateur, historique en `localStorage` uniquement (clé `HISTORY_KEY`, vignettes JPEG ~400 px
  compressées pour tenir dans le quota).
- Les rendus ne sont pas contractuels. Une mention explicite « image générée par IA, non
  contractuelle » doit apparaître à côté du résultat (voir backlog, pas encore implémenté).
- Le simulateur est d'abord un outil de collecte de leads : les CTA (prise de RDV, trouver un
  magasin, partage e-mail/WhatsApp/SMS, téléchargement) sont le cœur du modèle, pas un accessoire.
- Coût de génération à maîtriser : prévoir des garde-fous sur le nombre de générations par session
  (hypothèse client évoquée : ~10 000 générations/mois).

## Écrans et structure de `index.html`

Sections : `#hero`, `#comment-ca-marche`, `#gamme`, `#temoignages`, `#faq`, réassurance,
`#cta-final`, footer.
Parcours simulateur : `#screenSelection` → `#screenLoading` → `#screenResult`.
Catalogue : constante `MODELS` (23 modèles ÉcoCuisine : Ecosmart, Mira, Pulse, Atelier, Cosy,
Emotion, Frame, Hydra, Idea, Innova, Intensa, Linea, Matéria, Novia, Phenix, Pietra, Quadra,
Quercia, Sygma, Systema, Urban, Wave, Wood), photos servies depuis `ecocuisine.fr`.

## Conventions de travail

- Messages de commit en anglais, à l'impératif, une ligne (voir `git log`).
- Une branche par sujet, préfixes utilisés : `feat/`, `fix/`. Les branches `claude/*` sont des
  worktrees de session, pas des livrables.
- `master` est la branche de référence et ce qui est déployé. Plusieurs branches ne sont pas encore
  mergées, voir `docs/BACKLOG.md`.
- Ne pas committer `.claude/`, `.vercel`, `.DS_Store` (déjà dans `.gitignore`).
