# Coût d'exploitation du simulateur

Livrable attendu depuis la réunion du 16 juin 2026 : coût récurrent d'utilisation sur le périmètre
présenté, hors intégration ERP. Tarifs relevés le 19 août 2026 sur la grille publique de l'API Gemini
(tier standard, hors batch). À revalider avant contractualisation, ces prix bougent.

## Modèles utilisés

| Étape | Modèle | Prix |
|---|---|---|
| Validation de la photo uploadée | `gemini-3.5-flash-lite` | 0,10 $ / 1M tokens en entrée, sortie négligeable (JSON court) |
| Génération du rendu | `gemini-3.1-flash-image` | 0,067 $ par image en 1K, 0,045 $ en 0,5K |

Alternative moins chère pour la génération : `gemini-3.1-flash-lite-image` à 0,0336 $ par image en 1K,
soit la moitié du coût. À tester sur la qualité de rendu avant de trancher, c'est le principal levier
d'économie disponible.

## Coût unitaire d'une simulation

Une simulation = 1 appel de validation + 1 appel de génération.

- Validation : l'image envoyée est compressée à 1500 px côté navigateur, soit de l'ordre de 1 000 à
  1 500 tokens d'entrée. À 0,10 $/1M tokens, cela représente environ 0,0002 $. Négligeable.
- Génération : 0,067 $ en 1K (configuration actuelle, `imageConfig: { imageSize: '1K' }`).

**Coût unitaire retenu : environ 0,067 $, soit ~0,062 € au taux de 1,08 $/€.**

Le rechargement de la photo du modèle de référence est mis en cache en mémoire par instance Vercel,
son coût est nul (bande passante depuis ecocuisine.fr).

## Projection sur l'hypothèse de 10 000 générations par mois

| Scénario | Volume mensuel | Coût mensuel | Coût annuel |
|---|---|---|---|
| Configuration actuelle, 1K | 10 000 | ~670 $ / ~620 € | ~8 040 $ / ~7 440 € |
| Passage en 0,5K | 10 000 | ~450 $ / ~417 € | ~5 400 $ / ~5 000 € |
| Passage au modèle Lite en 1K | 10 000 | ~336 $ / ~311 € | ~4 032 $ / ~3 730 € |
| Phase de test 2 mois, 10 000/mois, config actuelle | 20 000 | — | ~1 340 $ / ~1 240 € sur la période |

À ces coûts s'ajoutent l'hébergement Vercel (le plan Pro, ~20 $/mois par membre, est nécessaire pour
une fonction à `maxDuration: 60`) et le temps humain de suivi.

## Ce que la phase de test doit mesurer

Le vrai inconnu n'est pas le prix unitaire mais le volume. Les événements de tracking en place
(`simulateur_simulation_succeeded`, `simulateur_page_view`) donnent directement le taux d'usage et le
volume réel, donc le coût par lead effectif. C'est cette donnée qui permettra de fixer le prix de
l'abonnement à l'issue des 2 mois.

## Garde-fous en place

- Côté navigateur : 5 simulations par jour et par appareil (`QUOTA_MAX_PER_DAY` dans `index.html`).
- Côté serveur : 10 générations par heure et par IP (`RATE_LIMIT_MAX` et `RATE_LIMIT_WINDOW_MS`,
  surchargeable par variable d'environnement Vercel).
- Limite du dispositif serveur : le compteur vit dans la mémoire d'une instance Vercel chaude. Un
  trafic réparti sur plusieurs instances ou des démarrages à froid peut dépasser le plafond. Si le
  volume réel le justifie, passer sur un store durable (Upstash Redis) ou activer un pare-feu Vercel.
- Au plafond de 10 000 générations/mois, une dérive d'un facteur 3 coûterait ~1 900 €/mois : le
  plafond serveur n'est pas un détail de confort.
