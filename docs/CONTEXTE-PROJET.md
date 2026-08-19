# ÉcoCuisine — Contexte projet

Dernière mise à jour : 19 août 2026. Sources : dépôt Git, conversation Teams
« Eco-Cuisine | ProAc IA » (chat de groupe, 6 membres), wiki de références Agence Mantu
(fiches opportunité et interactions ÉcoCuisine).

## Le client

ÉcoCuisine, enseigne de cuisines équipées organisée en une centaine de magasins indépendants
(site : ecocuisine.fr). Pas de CRM en place au moment des échanges. Ouvre de nouveaux modèles de
magasins en 2026 et mène en parallèle une refonte de son site et une évolution de son code
graphique, avec mise en production visée fin 2026 / début 2027.

Interlocuteurs client identifiés : Nadège Taront et Frédéric Pluyaud (présents à la démo du
16 juin 2026).

## Deux sujets distincts, à ne pas confondre

1. **Simulateur B2C** (ce dépôt). Landing page grand public + simulateur : l'internaute uploade la
   photo de sa cuisine, choisit un modèle du catalogue ÉcoCuisine, reçoit une projection générée par
   IA. Objectif double : faciliter la projection et l'envie de se lancer côté utilisateur, collecter
   de la donnée côté marque. Initiative proactive d'ARNEO, non commandée au départ.
2. **Landing page B2B « nouvelle identité de marque »** (autre projet, pas ce dépôt). Page dédiée
   aux ~100 dirigeants de magasins pour expliquer la nouvelle identité, avec vidéo, charte
   téléchargeable, FAQ, et un simulateur de devanture / intérieur de magasin. Chiffrage visé
   ~20 000 € côté client, charge ARNEO estimée par Arthur à ~1,5 jour grâce à la réutilisation du
   design Figma et de l'IA générative. Go interne donné par Valentin Quillier le 21 juillet 2026,
   suite commerciale côté client. Interlocuteurs : Elodie Pouliquen, Matthias Rousseau pour le
   devops/dev, design issu d'un fichier Figma de l'équipe de Romain Gillet.

## Parties prenantes

Conversation Teams « Eco-Cuisine | ProAc IA » :

- **Elodie Pouliquen** (elodie.pouliquen@mantu.com) — Directrice Conseil, pilote la relation client
  et le modèle commercial. Moteur du sujet.
- **Arthur Guillermin** (arthur.guillermin@arneo.io) — ARNEO, conception et développement du
  simulateur et de la landing page.
- **Valentin Quillier** (valentin.quillier@mantu.com) — Delivery Director, arbitrages internes et
  go/no-go.
- **Douglas Graglia** (dgraglia@mantu.com) — Head of Digital.
- **Olivier Poncet** (olivier.poncet@mantu.com).
- **Antonin Thuia** (ARNEO) — présent à la démo client du 16 juin.

Autres personnes citées : Romain Gillet (design, questionne le coût par génération),
Matthias Rousseau (dev/devops sur la LP B2B), Rémi Boscari (origine de l'approche commerciale
« Bernard Tapie »), Mélanie Gentil et Charline Dantigny (volet identité B2C, autre fiche wiki).

## Chronologie

- **25 février 2026** — Arthur partage une première vidéo de démo du simulateur (modèle « Nano
  Banana » classique), en amont d'un point interne.
- **9 mars 2026** — Argumentaire posé : les configurateurs 3D existent déjà chez ÉcoCuisine, mais ils
  génèrent de la curiosité, pas du désir. Le simulateur vise une projection personnalisée et
  émotionnelle. Sous-domaine évoqué : simulateur.ecocuisine.fr.
- **20 mars 2026** — Première version de la landing page en ligne
  (ecocuisine-simulateur.vercel.app), logique de simulateur pas encore branchée. Débat sur le modèle
  économique : set-up 15 K€ + CPL jugé illisible côté client, run seul trop risqué, set-up seul trop
  classique. Décision : proposer une phase de test gratuite (1 mois côté ARNEO, le client suggérera
  un trimestre) puis un abonnement sans exclusivité si les résultats sont là.
- **23 mars 2026** — Cadrage des CTA et de la valeur des leads par Elodie : N1 prise de RDV (lead
  chaud, contact + produit d'intérêt), N2 trouver un magasin (profil chaud, pas de contact,
  retargeting), N3 push e-mail/WhatsApp/SMS (lead tiède), N4 téléchargement (pas de collecte, mais
  usage naturel et lien de marque). Conclusion : le simulateur est autant un outil d'image de marque
  qu'un outil de collecte, et convertir les leads demandera un budget au-delà de l'outil.
- **26 mars 2026** — Planning en trois temps posé par Elodie : #1 simulateur (2 semaines, valider les
  cuisines et visuels à proposer), #2 collecte de data (deux CTA vers leurs formulaires, leads dans
  un Excel pour la phase de test faute de CRM, Brevo envisagé ensuite), #3 phase de conversion (hors
  test, mais prévoir un e-mail de partage et un contenu WhatsApp).
- **16 juin 2026** — Démo live au client (Nadège Taront, Frédéric Pluyaud). Accueil positif.
  Recommandations retenues : déploiement sur sous-domaine dédié plutôt qu'intégration au site, full
  web (le client ne veut pas de tablettes en magasin), mentions légales « photo d'aspiration / non
  contractuelle », garde-fous sur le nombre de générations. KPI : taux d'usage, nombre d'images
  générées, clics « prendre RDV en magasin » — le suivi jusqu'au devis suppose une intégration ERP.
  Fenêtre de lancement alors évoquée : septembre-octobre 2026. Le client demande un chiffrage alors
  que l'offre présentée était gratuite avec commission, signe que le message n'a pas été clair.
  Le même jour, ÉcoCuisine envoie un brief d'appel d'offres B2C à l'agence.
- **1er juillet 2026** — Romain Gillet alerte sur le coût de génération d'images : il faut empêcher
  un usage illimité.
- **3 juillet 2026** — Réunion de chiffrage de la LP B2B « nouvelle identité » (sujet 2).
- **21 juillet 2026** — Proposition simulateur présentée au lead, go interne de Valentin Quillier.
- **19 août 2026** — Message d'Elodie : le client est très favorable au test. Le simulateur doit être
  activé pour la MEP de la refonte du site, fin 2026 / début 2027, avec une campagne média de
  soutien pendant la phase de test de 2 mois. Le modèle coût au lead ne les freine pas et n'a pas
  été questionné. Trois chantiers demandés, détaillés dans `BACKLOG.md`.

## Modèle économique retenu

Phase de test de 2 mois, mise à disposition gratuite, discours transparent avec le client. À
l'issue : abonnement sans exclusivité si le client veut conserver l'outil, l'agence se réservant le
droit de le proposer à d'autres acteurs du secteur. Le format coût au lead est accepté par le client.
Un budget de conversion des leads, au-delà de l'outil, reste à cadrer.

## Points ouverts côté client

- Où renvoyer les leads collectés (base de données ou destination à préciser par ÉcoCuisine).
- Ajustement du design de la landing page à la nouvelle identité de marque, une fois celle-ci figée.
- Intégration ERP pour suivre le lead jusqu'au devis et à l'achat : hors périmètre du test.

## Traces dans le wiki de références Agence Mantu

- Opportunité : « ÉcoCuisine - Landing page nouvelle identité de marque + simulateur IA »
  (`opportunites/ecocuisine-landing-identite-2026`), statut en chiffrage.
- Interaction : « ÉcoCuisine - Chiffrage landing page nouvelle identité et simulateur IA »
  (`interactions/2026-07-03-ecocuisine-chiffrage-landing`).
- Fiche « Ecocuisine – Refonte identité B2C » : marquée invalide, ingérée par erreur, à ignorer.
- **Manque identifié dans le wiki** : aucune fiche client ni fiche projet ne documente le simulateur
  B2C lui-même. La fiche opportunité signale explicitement qu'une création rétroactive est à faire.
