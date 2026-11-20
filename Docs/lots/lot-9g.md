# Lot 9g — Personnages et zombies de la Seconde Guerre mondiale (V0.9)
## Base
- `origin/dev` `622df2c` (bilan 9e, seed 0.38, `main` ancêtre de `dev`) ; branche `lot-9g` (la session proposait `claude/cool-noether-7cgj0u` : j'ai suivi le prompt). Commits : A `e3c6350` ; B `b4551af`, retours `4f66a0e`, `ea684ed`, `273ecaa` ; fusions de `origin/dev` (lot 9f) `4f62830` ; C `4b41fff` ; D `357570a` ; ce bilan (E). Atelier fusionné dans `dev` avant le GO à la demande du propriétaire (PR #171, #174). Fiche : `Docs/ref/personnages-epoque.md`.
## Choix du propriétaire
- Atelier : sections Mesures, Curseurs et Mini-arène retirées, réglages toujours visibles. **Zombies A et B gardés, toutes tenues, mélangés** ; C « boueux » gardé pour la carte 3 (marais). **Survivant A**, casque plus gris, tenue 1. **Personnage 2 redessiné** (trop proche du Survivant), puis **parachutiste radio (B), tenue 1**. « GO 9g » le 20/11/2026.
## Personnages jouables
- Survivant : fantassin américain de 1942 (casque M1 gris à jugulaire, veste M41 sable, pantalon olive, guêtres de toile, ceinturon M1923, bretelles, gourde). Personnage 2 : parachutiste radio (veste verte, pantalon clair, casque à filet, poste radio dorsal à antenne, harnais, poches de cuisse, bottes de saut). Choisi d'après la sauvegarde (`persos.choisi`) ; autres personnages : Survivant.
## Zombies
- Quatre types visuels (marcheur, petit adulte, voûté, grand ; coureur et rampant sont des allures de chaque type) ; variantes A « lisible » et B « équipé » mélangées en une variante de douze tenues (une texture) : soldat casqué (modèle 1935), au calot, en capote, sous-officier à casquette souple (jumelles, porte-cartes), officier à casquette à visière (baudrier, culotte, étui), tête nue ; dosage par type (voûté : havresac ; grand : masque à gaz, équipement lourd ; petit : léger). Bottes de cuir, sang et usure par manche inchangés.
## Menu
- Écran Personnage et grille (silhouettes et bustes casqués, poste radio et antenne animée du personnage 2), avatars du Profil (mêmes identifiants : Survivant, Éclaireur parachutiste radio, Tireur Marine camouflé ; zombies casqué, sapeur — nom « Zombie sapeur », avant « de chantier » —, tête nue en capote ; défaut gris inchangé), zombies des ouvertures de caisses (même résolution que la partie).
## Règles de contenu (revue)
- Pièces et textures relues : casques, coiffures, capotes, équipement, motifs géométriques (laine, chevrons, filet, camouflage) ; **aucun insigne, aigle, rune, croix, écusson, galon ni symbole** (test sur les recettes et le menu) ; petit : proportions adultes vérifiées par tenue ; aucune pièce du corps retirée (aucun démembrement) ; couleurs dérivées de jetons existants (aucun jeton nouveau, aucune couleur en dur).
## Preuves
- **G1** `trace-logique.mjs` 6 × 600 contre `origin/dev` `7514702` : tout l'état logique identique à chaque pas ; seuls diffèrent les champs d'apparence du `pose` (variante, tenue, triangles), anim et phase identiques ; aucune donnée de gabarit, collision, coup ni durée modifiée (tests de garde inchangés et verts).
- **G2** 3 appels par personnage ; triangles max. sur les tenues (complet / simple, écart à l'actuel) : Survivant 2 164 (−4 %) / 876 (+4 %) ; parachutiste radio 2 164 (−4 %) / 912 (+8 %) ; zombies de −4 à +8 % / +4 à +9 %. Scène (`mesurer.mjs --ref --ref-memes-reglages`) : appels identiques ; triangles Élevé +16 (U4 37 263 → 37 279), Moyen et Faible +292 (U4 25 913 → 26 205) ; temps d'image comparables.
- **G3** revue ci-dessus ; contraste ≥ 3:1 sur chaque sol (3,02 à 3,19).
- **G4** menu au démarrage : 30 fichiers JavaScript avant et après ; aucune requête externe ; aucune écriture nouvelle (avatars : mêmes identifiants). **G5** Lighthouse mobile, 5 passes, médianes : `jeu.html` 83 → 82 (−1), `index.html` 90 → 90 ; accessibilité et bonnes pratiques 100 ; CLS ≤ 0,001.
## Tests adaptés
- Nouveaux : `persos-epoque.test.js` (construction, budgets, contraste, contenu, textures actuelles intactes, fichier de choix, mélange, résolution en jeu, menu) ; e2e de l'atelier (section Époque, réglages collants). Adaptés avec la raison en commentaire : `persos-integres` (unitaire et e2e), `persos-integres-finitions`, `persos-jeu` (« epoque » remplace « riche »), `persos-sang` (arène retirée), `personnage.spec` (bandana retiré), `studio.spec` (antenne, « Zombie sapeur »), journal. Aucune assertion retirée sans équivalent.
## CI
- Tests de `lot-9g` verts à chaque push (B à D) ; fusions dans `dev` : Tests et Pages verts. Ce bilan : voir le message de livraison.
## Points ouverts
- Rendu jugé sur captures seulement ; teintes claires imposées par le contraste 3:1 (le gris-vert se lit mieux sous la lune que sous la lampe) ; `js/core/arena.js` n'est plus importé par l'atelier (garde son test) ; l'ancienne variante A n'est plus visible en jeu (?perso=A = niveau simple d'époque).
## Idées
- Variante C boueuse pour la carte 3 ; personnages 3 à 6 dessinés ; lampe coudée (lot 9i) ; retirer `js/core/arena.js`.
## Entrée du journal — `lot-9g` (v0.9, 2026-11-20) « Soldats de 1942 et zombies soldats » (4 points) ; bloc `[lot-9g]` affiché.
## Lignes à ajouter à `CLAUDE.md` et `conventions.md`
- `CLAUDE.md` : « Époque (lot 9g) : persos-choix.json → variante "epoque" (persos-epoque-choix.json : Survivant A, personnage 2 para-B, zombies [A, B] mélangés) ; recettes data/game/persos-epoque.json (buildEpochVariant, melangeEpoque, resoudreEpoque de persos-variants.js) ; couleurs dérivées de jetons ; aucun insigne ni symbole ; Docs/ref/personnages-epoque.md. » `conventions.md` : « atelier-personnages.html : section Époque (__zsPersos.epoque) ; getState().persos.slots = variantes résolues, personnage. »
## Passages du seed à réécrire par le propriétaire
- « Personnages, animations et sang » : « À venir (V0.9) » devient fait (soldats de 1942, zombies soldats A et B mélangés, menu, avatars, ouvertures) ; « par défaut riche » devient « epoque » ; plan des lots : 9g fait.
## À faire par moi
1. Sur PC et téléphone, jouer quelques manches (lisibilité des zombies d'époque sur le sol sombre, horde variée), regarder l'écran Personnage (Survivant et personnage 2), les avatars, une ouverture de caisse. 2. Rapporter les retours.
