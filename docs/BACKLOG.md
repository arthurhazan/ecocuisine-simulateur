# Backlog — Simulateur ÉcoCuisine

État au 19 août 2026. Arbitrages pris avec Arthur le 19 août 2026 : la landing page **reste en
« full IA »** (HTML monolithique + fonction Vercel) pour la phase de test, aucun portage no-code ni
refonte applicative ; la destination des leads **attend la réponse du client**, le code n'expose donc
qu'un point d'entrée unique prêt à être branché.

Ce qui a été traité le 19 août 2026 (branche `feat/prep-phase-test`) est marqué [fait]. Les trois premiers blocs viennent de la demande d'Elodie Pouliquen du
19 août 2026 dans la conversation Teams « Eco-Cuisine | ProAc IA ».

## 1. Qualité des rendus IA

- [fait] **Erreurs d'objets dans la génération** : les fours sont souvent interprétés comme des meubles.
  À traiter par le prompt de `api/simulate.js` (règles explicites sur l'électroménager encastré,
  plaques, hotte, four), et éventuellement par un second passage de vérification.
- [fait] **Mention de protection** : ajouter au résultat une formulation du type « image générée par IA,
  à titre d'illustration, non contractuelle, susceptible de comporter des erreurs de représentation ».
  Aujourd'hui absente de `index.html` — c'était pourtant une recommandation actée à la démo du
  16 juin.

## 2. Landing page et collecte de leads

- **Décision d'architecture à prendre avec Elodie** : la LP peut-elle vivre en « full IA » (page
  générée et maintenue comme aujourd'hui, HTML monolithique) ou faut-il la développer, en no-code ou
  en vrai code ? Critère posé par Elodie : meilleur compromis effort/risque sachant qu'on est sur une
  phase de test de 2 mois. Position à préparer avant l'échange.
- **Destination des leads** : le client doit préciser où sont renvoyés les leads. En attendant, la
  phase de test prévoyait un simple Excel, avec Brevo comme CRM éventuel ensuite.
- [partiel] **Câblage réel de la capture d'e-mail** : aujourd'hui `sendResultEmail()` et `submitEmail()` ne font
  qu'afficher un état de succès, aucun envoi ni stockage. Rien ne sort de la page.
- **Design** : ajustement à prévoir dès que la nouvelle identité de marque ÉcoCuisine est figée.
- [fait] **Instrumentation** : aucun tracking analytics dans la page. Les KPI annoncés au client (taux
  d'usage, nombre d'images générées, clics « prendre RDV en magasin ») ne sont donc pas mesurables en
  l'état. À câbler avant la phase de test et la campagne média.

## 3. Maîtrise des coûts

- [fait] Garde-fous sur le nombre de générations par session ou par IP : point soulevé par Romain Gillet le
  1er juillet et acté à la démo client. Rien n'est en place aujourd'hui, l'API `/api/simulate` est
  ouverte et sans limite.
- [fait] Hypothèse de volume à valider : ~10 000 générations/mois. Chiffrer le coût récurrent Gemini sur
  cette base (livrable attendu d'Arthur depuis la réunion du 16 juin).

## 4. Dette Git à nettoyer

`master` est la référence déployée. Plusieurs branches locales ne sont pas mergées :

- `feat/hover-effects-session` (branche courante, 1 commit d'avance)
- `update-testimonials-ui` (1)
- `fix/stats-bar-background-black` (3)
- `feat/step-card-hover-effect` (2)
- `feat/testimonial-hover-effect` (1)
- `claude/sharp-hoover` (2 d'avance, 12 de retard)

Les branches `claude/*` sont des worktrees de session, à supprimer après arbitrage. Un fichier est
aussi supprimé sans commit dans l'arbre de travail : `assets/images/cuisine-apres.png` (remplacé par
la version `.webp` lors de l'optimisation PageSpeed). À committer ou restaurer.

## 5. Calendrier

- Refonte du site ÉcoCuisine et évolution du code graphique : MEP fin 2026 / début 2027, c'est la
  fenêtre d'activation du simulateur.
- Phase de test de 2 mois, soutenue par une campagne média du client.
- Déploiement cible : sous-domaine `simulateur.ecocuisine.fr`, full web, pas de tablette en magasin.

## Journal du 19 août 2026 — branche `feat/prep-phase-test`

Fait :

- Mention « image générée par IA, non contractuelle » ajoutée sous le comparatif du résultat et, en
  version courte, sous le comparatif de la page d'accueil.
- Prompt de génération durci sur l'électroménager (règle 3bis) : four, micro-ondes, plaque, hotte,
  lave-vaisselle et réfrigérateur doivent rester des appareils identifiables, jamais des façades
  pleines, et aucun appareil ne doit être inventé.
- Prompt de validation de photo remplacé par la version stricte récupérée de la branche
  `claude/sharp-hoover` (rejette portraits, animaux, extérieurs, objets isolés, captures d'écran).
- **Bug corrigé** : la validation appelait `gemini-2.0-flash`, modèle arrêté par Google le
  1er juin 2026. Elle échouait donc systématiquement, et le code étant en « fail open », toutes les
  photos passaient sans contrôle. Remplacé par `gemini-3.5-flash-lite`. De même,
  `gemini-3.1-flash-image-preview` n'existe plus sous ce nom, remplacé par `gemini-3.1-flash-image`.
  Les deux identifiants sont surchargeables par variable d'environnement (`VALIDATION_MODEL`,
  `IMAGE_MODEL`). **À vérifier en production dès le prochain déploiement** : c'est le point le plus
  sensible du lot.
- Garde-fous de coût : 5 simulations par jour et par appareil côté navigateur, 10 par heure et par IP
  côté serveur, avec un message dédié et un événement de tracking quand la limite est atteinte.
- Couche de tracking neutre (`dataLayer` + CustomEvent, sans prestataire imposé) sur les événements
  utiles aux KPI vendus : `page_view`, `screen_view`, `photo_uploaded`, `model_selected`,
  `simulation_started`, `simulation_succeeded` (avec durée), `simulation_failed`,
  `simulation_invalid_photo`, `quota_reached`, `cta_click` (tous les liens ecocuisine.fr),
  `lead_submitted`, `result_downloaded`, `result_shared`. Debug avec `?debugTracking=1`.
- Capture d'e-mail : les deux formulaires passent désormais par `submitLead()`, point d'entrée unique.
  Le lead est tracé et conservé en local, **rien n'est encore envoyé** faute de destination validée
  par le client. Un seul `fetch` à décommenter le jour où la destination est connue.
- Chiffrage du coût d'exploitation : `docs/COUTS-GENERATION.md`.
- Git : `assets/images/cuisine-apres.png` restauré (supprimé par erreur, encore référencé par
  `og:image` et le fallback `<img>`), branche `feat/hover-effects-session` mergée dans `master`,
  commit « stats bar black » de `fix/stats-bar-background-black` repris par cherry-pick.

Reste à faire côté Git : la suppression des branches obsolètes a été refusée par la politique de
permissions de la session. Commandes à passer à la main une fois les variantes arbitrées :

```
git branch -d claude/competent-ptolemy claude/dreamy-goldberg claude/ecstatic-matsumoto \
  claude/hopeful-feynman claude/stoic-napier claude/youthful-cray feat/hero-redesign \
  feat/simulator-flow feat/hover-effects-session
```

Restent à arbitrer, car elles contiennent des variantes de design concurrentes et non fusionnées :
`update-testimonials-ui` (témoignages sur fond orange, design Figma), `feat/step-card-hover-effect` et
`feat/testimonial-hover-effect` (variante de survol avec fond orange plein plutôt qu'orange clair),
`fix/stats-bar-background-black` (son commit utile est déjà repris). `claude/sharp-hoover` est en
retard de 12 commits et supprime des assets : son seul apport utile, le prompt de validation, a été
récupéré, elle peut être supprimée avec `-D`.
