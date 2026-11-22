# Lot 9j — Mobilier de 1942 : piles de caisses, gravats, étagères, classeurs, bureaux, comptoirs du lot 3g redessinés ; escaliers fermés et décor des murs (V0.9)

## Base
- `origin/dev` `de25a4f` (seed 0.41, bilan 9i présent, `main` ancêtre de `dev`, Tests verts) ; dernier déploiement Pages de `dev` en échec à l'envoi (« Fetching artifact metadata failed », incident GitHub) ; clone complété (`git fetch --unshallow`) ; branche `lot-9j` (la session proposait `claude/nice-hypatia-tg1xn3` : j'ai suivi le prompt). Fiche : `Docs/ref/decor-epoque.md` (« Mobilier »).
- Arrêt respecté après l'atelier (B) ; « go 9j » du propriétaire, puis parties C et D, un correctif et cinq retours, chacun fusionné dans `dev` par Pull Request « Create a merge commit » :

| Étape | Commit | Fusion dans `dev` |
|---|---|---|
| A — Relevé, référence de la trace et plan | `09a7716` | — |
| B — Atelier du mobilier de 1942 (arrêt) | `41af393` | — |
| C — Mobilier de 1942 | `da57a11` | PR #189 (`808ae5c`, avec D) |
| D — Bilan | `b546b26` | PR #189 |
| Correctif — budget du pire cas de la partie | `1f94598` | PR #190 (`6668d05`) |
| Retours 1 — éboulis des escaliers plus fin | `89b5e76` | PR #191 (`b669955`) |
| Retours 2 — éboulis fin retenu | `87fc0ff` | PR #192 (`d3a92bd`) |
| Retours 3 — plafond de 60 000 triangles, décor des murs (atelier) ; test de cadence | `7796107`, `696d023` | PR #193 (`ce39e4c`) |
| Retours 4 — affiche « ACHTUNG » | `3474a3c` | PR #194 (`7a9ec24`) |
| Retours 5 — décor des murs activé | `0bf3dd2` | PR #195 (`1ae6263`) |

## Référence de la trace
- `scripts/perf/trace-reference.json` (2026-11-22, `de25a4f`, 6 × 600 pas, 22 champs de `getState()`) : quatre exécutions de suite identiques à chaque pas ; finales 630b3fed…, c787713e…, 72d446e9…, fa4bfe49…, 4cf10a77…, 4ea6da5e….
- Le script garde l'empreinte complète (`pose` compris) et ajoute, par pas, « logique » (tout sauf `pose`) et « pose » (seul) : `--enregistre A B` (deux exécutions identiques → référence), `--reference dossier` (dit si la logique ou `pose` diffère).
- Retrouvée identique à chaque pas après C, après le correctif et après chaque retour (le décor des murs et les escaliers ne touchent pas à la logique).

## Choix du propriétaire
- Avant le GO : noms des objets du gros plan demandés et donnés, aucune retouche. « go 9j » sans autre précision : variantes par défaut, **A partout**, aucun aspect forcé.
- Après la fusion : escaliers fermés « plus fins » → **éboulis fin (A)** ; **plafond de la vue à 60 000 triangles** ; **décor des murs**, accroché et au pied des murs (« les deux ») ; affiche en allemand (« la map est en Allemagne ») → **« ACHTUNG »** ; décor des murs **activé** (« c'est parfait »).
- Fichier de choix `data/game/mobilier-epoque-choix.json` : `variantes` (A partout), `pieces` ({}), `escaliers` (« A »), `murs` (true) ; invalide = défaut ; appliqué par `npm run carte`.

## Mobilier (variante A ; hauteur dessinée ; P : tirs par-dessus, B : arrêtés ; triangles corps + détails)
| Aspect | Variante retenue | Pièces | Hauteur | Tirs | Triangles |
|---|---|---|---|---|---|
| Pile de caisses | munitions (couvercles olive « CAL .30 / LOT 4417 », bâche pliée) | M1 M7 M10 M26 M29 M32 P5 P9 P10 P13, E2 Q2 Q5 Q6 | 29,7 à 70 | P et B (comme avant) | 726 |
| Gravats | charpente effondrée (poutres cassées, briques, plâtre) | P3 P6 P7 P8 | 26,5 à 31,6 | P | 568 |
| Étagère | intendance en bois (conserves, couvertures, rations) | P1 P2 P4 P11 R-G37 R-G39, Q1 | 64 à 70 | B | 808 |
| Étagère renversée | couchée sur le dos, contenu répandu | M22, Q3 | 18 | P | 344 |
| Classeurs | tôle olive, tiroir du haut ouvert, dossiers | M12 M15 M17 M18 M19 M21 | 45 à 70 | B | 234 |
| Bureau | d'officier (sous-main, encrier) | M3 M4 | 51 | B | 124 |
| Tabouret | de bois, caisse à côté | M34 | 70 | B | 80 |
| Comptoir | établi (outils, étau, lampe tempête éteinte) | M33 M35 | 64,6 | B | 232 |
| Muret | sacs de sable (jute) | E1 | 48 | B | 120 |
- Total 3 236 triangles (avant 3 052, **+184**) ; corps dans le maillage des meubles (ombre comme avant), détails dans un maillage par étage sans ombre (faces nord retirées : jamais vues par la caméra ; gardées dans le gros plan de l'atelier) ; atlas généré de 256 px. Variantes B et C, aspects forcés pièce par pièce : atelier et fichier de choix. Les tables P12 et Q4 du lot 9i ne sont pas concernées.
- Modules : `js/core/mobilier-epoque.js` (modèles, rectangles cibles, côté ouvert, choix, escaliers, décor des murs), `js/core/mobilier-epoque-atlas.js` (atlas, police de pochoir), `js/game/mobilier-epoque-mesh.js` (maillages) ; couleurs `data/game/mobilier-epoque.json` (mélanges de jetons existants) ; `npm run carte` ajoute la clé `epoque` à `mobilier.world.json` (les boîtes du lot 3g restent la référence des collisions, des tirs et des feux).

## Escaliers fermés (retours 1 et 2)
- Les deux escaliers fermés (porte-2, porte-3) ne sont plus bouchés par le gros tas de blocs du lot 3g (440 et 340 triangles, 66 de haut). `modeleEscalier` (corps seulement, dans le maillage du bloc, qui s'enfonce toujours à l'ouverture) ; collisions de `zones.json` inchangées.
- Variantes : **A éboulis fin et bas (retenu : 212 triangles, 31 de haut)**, B barricade de planches sur tréteaux (138, 45), C chevaux de frise et barbelés (260, 41 ; proposé d'abord par défaut) ; aussi « actuel ». Atelier : section « Éboulis des escaliers ».

## Décor des murs (retours 3 à 5)
- `emplacementsMurs` et `modeleMur` : 22 emplacements générés par `npm run carte` (`epoque.murs` de `mobilier.world.json`, dessinés si `murs: true`), loin des fenêtres (160), des portes (60), des escaliers (40) et des lampes (50), jamais devant un meuble, 110 au moins entre deux ; un sur deux environ (« pas partout »), presque tous sur les faces tournées vers le sud (les seules que la caméra voit de face).
- **6 accrochés** (étagère garnie, portemanteau avec capote et casque, tableau d'ordres, carte, affiche « ACHTUNG », horloge arrêtée, plâtre arraché) et **16 au pied des murs** (planches appuyées, sacs de toile, jerrycan et bidon, fusil appuyé, papiers au sol).
- Taille agrandie (× 1,8 au sol, × 1,2 en hauteur accroché, × 1,5 au sol, 70 au plus) : à taille réelle, rien ne se voyait ; les objets plats accrochés restent de fines bandes (face de mur très écrasée par la caméra à 75°). 388 triangles, aucun appel de plus (détails du mobilier de l'étage), dessin seulement : aucune collision, aucun effet sur les tirs ni sur les chemins.
- Affiche : « AVIS » puis **« ACHTUNG »** (« Attention » : mot générique, la carte est en Allemagne ; lettres H, U, G ajoutées au pochoir). Atelier : section « Décor des murs » (chaque objet en vue du jeu et en gros plan, plan des emplacements des deux étages).

## Emprises
- Chaque pièce du mobilier est dessinée dans son rectangle cible (sa collision, partagée entre pièces qui se recouvrent : M1/M3/M7, M12/M15, M17/M18, M26/M29, P3/R-G37) ; sommets ramenés dans le rectangle ; écart au sol ≤ 0,5 % par côté (M34), 0 ailleurs ; vides dessinés du lot 3g comblés (M1 : 80 à droite, P3 : 80 à gauche, M26 : 50 en haut) ; feux de P9 et Q2 posés sur une caisse à la hauteur d'avant. Tableau complet : `atelier-mobilier.html` (« Plan des pièces »).

## Zombies et chemins
- Arrivées (manche 10, graines 1 à 6) **identiques au fichier près** : 60/60, médianes F1 3,3 · F2 5,1 · F3 3,75 · F4 5,35 · F5 3,35 · F6 2,8 · F8 3,25 · U1 2,22 · U2 5,25 · U3 3,75 · U4 4,53 · U5 2,8 · U6 3,15 · U7 8,65 s ; `blocage.mjs` (deux étages) : 0 coincé, fichier identique.

## Preuves
- **G1** référence enregistrée et stable (4 exécutions). **G2** trace 6 × 600 identique à chaque pas à la référence (logique et `pose`) ; fichiers comparés à `origin/dev`, **identiques à l'octet** à chaque étape : `world.json`, `etage.world.json`, `tirs.world.json`, `zones.json`, `lampes.world.json`, `decor.json`, `decor-interieur.world.json`, `data/game/tirs-traversables.json`, `lumieres.json`, `lampes.json` ; seul `mobilier.world.json` change ; `?test=1&decor=avant` : mobilier, escaliers et décor des murs d'avant le lot.
- **G3** voir « Zombies et chemins » ; règles de carte vertes (`npm run carte --verifie`).
- **G4** rendu (`mesurer.mjs --ref --ref-memes-reglages`, mobilier seul) : Élevé R1 78 → 79 appels / 38 053 → 38 147 triangles, R2 77 → 78 / 37 963 → 38 057, U1 77 → 79 / 38 349 → 38 533, U4 100 → 102 / 40 111 → 40 295 ; Faible +94 à +184 ; Moyen −1 098 à −1 216 ; pire choix possible du mobilier +394 (test ≤ 450). Éclairage (R1, R2, U1, U4 : lumières, intensités, positions, feux) identique ; aucune ombre portée de plus. Captures avant / après de chaque aspect, lampe et lune, 667 × 375 et 1920 × 1080.
- **Pire cas de la partie** (`persos-integres`, U4, sang à pleine charge et 10 zombies) : 44 451 sur `origin/dev` ; 45 559 au premier envoi du mobilier (+1 108 : CI de `dev` rouge après la PR #189) ; 44 635 après le correctif ; **45 023** avec le décor des murs (U1 44 873), sous le nouveau plafond de 60 000.
- **G5** textes peints « CAL .30 », « LOT 4417 », « RATIONS », « NO 12 », « ACHTUNG » (inventés ou génériques) ; aucun symbole politique, aucune marque, aucun emblème ; tout en code (test : aucune image ni modèle). **G6** aucune requête externe ni écriture (atelier) ; Lighthouse mobile, 5 passes, médianes (mobilier) : `jeu.html` 81 → 80, `index.html` 90 → 90.

## Plafond de la vue : 60 000 triangles (retours 3)
- Décision du propriétaire (avant : 45 000) : assertions des tests e2e (`persos-integres`, `persos-jeu`, `jeu-*`, `etage*`, `decor-epoque-jeu`), `scripts/personnages/projection.mjs` (limites de refonte) et ses tests, marges de `mesurer.mjs` et `budget-instant.mjs`, ligne de `CLAUDE.md` (« vue ≤ 60 000 triangles et 400 appels », changée à la demande du propriétaire). Les délais d'attente qui contiennent aussi « 45 000 » sont inchangés ; la borne propre au mobilier (+450, `mobilier-epoque.test`) est gardée.

## Tests adaptés
- Nouveaux : `mobilier-epoque.test.js` (29 : mobilier, rectangles, classes de tirs, feux, budget, choix, atlas, textes, escaliers, décor des murs, partie), `mobilier-epoque-atelier.spec.js` (2 : atelier, escaliers, décor des murs, lien du menu de débogage).
- Adaptés, raison en commentaire : `graphismes.spec` (+3 modules), `decor-epoque-jeu.spec` (`decor=avant` rend aussi le mobilier ; mesuré +5 appels / +3 618 triangles avant le décor des murs), `lot1-regles`, `data-changelog`, `publication.test`, `publication.spec` (`lot-9j`), plafond de 60 000 (voir plus haut) ; `tests/selection.json`, `scripts/tests/classement.json`.
- `jeu-stats.spec` (cadence) : `munitions=illimitees`. Il échouait déjà sur `dev` : depuis le lot 9e, le pistolet recharge après 7 balles et le rechargement tombait dans les 3 s mesurées au niveau 10 ; non vu car joué seulement au palier complet, revenu dans la CI quand ses bornes de triangles ont changé.
- Vitest 176 → 177 fichiers ; aucune assertion retirée.

## CI et déploiements
- `lot-9j` : A, B, D, correctif et retours 1 à 5 verts ; C annulée (remplacée par D) ; retours 3 rouge au premier envoi (`jeu-stats`, voir plus haut), vert ensuite.
- `dev` : après la PR #189, Tests rouge (pire cas du sang au-dessus de 45 000 : tranche non jouée sur `lot-9j`), corrigé par la PR #190 ; ensuite Tests verts à chaque fusion.
- Pages de `dev` : échecs répétés à l'envoi (« Fetching artifact metadata failed », incident GitHub, construction verte) après les PR #191, #192, #193 et #194 ; PR #192 rétablie par une relance demandée par le propriétaire ; PR #193 et #194 : relances en échec, rattrapées par le déploiement réussi de la PR #195. `/dev/` vérifié en ligne : mobilier, éboulis fin, décor des murs (`mursActifs: true`) et « ACHTUNG ».

## Points ouverts
- Rendu jugé sur captures seulement, puis validé en jeu par le propriétaire (« c'est parfait »).
- À la taille du jeu, une pièce fait 10 à 150 px : classeurs (20 × 25) et bureau restent de petits blocs ; les objets plats accrochés au mur restent de fines bandes.
- M26 et M29 se recouvrent en collision (tirs arrêtés au-dessus des caisses basses de M29 : déjà le cas avant).
- Le pire cas de la partie (45 023) dépasse l'ancien plafond de 45 000 : il ne tient que par le plafond relevé à 60 000.
- Pages de `dev` peu fiable ce jour (incident GitHub) : relancer le déploiement s'il échoue à l'envoi.
- Le journal (`data/changelog.json`) et le bloc `[lot-9j]` décrivent le mobilier, pas encore les escaliers ni le décor des murs.

## Idées
- Aspect « caisses » pour M22 si l'étagère renversée ne se lit pas ; une variante C pour classeurs et bureau ; casiers à courrier ; d'autres textes au pochoir en allemand si le propriétaire le souhaite (les caisses gardent des pochoirs américains : soldats américains en Allemagne) ; plus d'emplacements de décor des murs, ou sur les piliers.

## Entrée du journal
- `lot-9j` (v0.9, 2026-11-22) « Mobilier de 1942 » (4 points) ; bloc `[lot-9j]` (`afficher: oui`).

## Lignes à ajouter à `CLAUDE.md` et `conventions.md`
- `CLAUDE.md` : « Mobilier de 1942 (lot 9j) : mobilier.world.json → epoque (npm run carte, mobilier-epoque-choix.json : variantes, pieces, escaliers, murs) ; js/core/mobilier-epoque.js ; boîtes du lot 3g = collisions, tirs, feux ; ?test=1&decor=avant ; atelier-mobilier.html. » (le plafond de 60 000 y est déjà).
- `conventions.md` : « Mobilier de 1942 : dessin dans le rectangle cible de chaque pièce (sa collision, partagée), écart au sol ≤ 10 %, classe de tirs gardée ; corps dans le maillage des meubles, détails par étage sans ombre ; escaliers fermés et décor des murs : dessin seulement ; textes au pochoir inventés ou génériques. »

## Passages du seed à réécrire par le propriétaire
- « Époque » et « Monde » : mobilier de 1942, escaliers fermés (éboulis fin) et décor des murs faits (lot 9j) ; plafond de la vue à 60 000 triangles ; plan en lots : 9j fait, suite 9k.

## À faire par moi
1. Sur PC et téléphone, jouer quelques manches et parcourir les deux étages en regardant le mobilier, les escaliers fermés et le décor des murs.
2. Rapporter les retours : variantes, pièces, `escaliers` et `murs` dans `data/game/mobilier-epoque-choix.json`, puis `npm run carte`.
3. Si un déploiement Pages de `dev` échoue à l'envoi (« artifact metadata »), le relancer (Actions → Pages → « Re-run all jobs »).
