# Lampes à huile et lumières dynamiques (lot 5k) — plan

État : **plan (partie A)**. Rien du jeu n'est encore changé. Valeurs provisoires, à régler par le propriétaire.

## Relevé (étape 0, `origin/dev` 080a7fe)
1. Lumières : une `AmbientLight` (`--game-ambient`, intensité 2,3) et une `DirectionalLight` (`--game-sun`, 3,5) qui suit la cible de la caméra (`followSun`), avec une carte d'ombres de 512 ou 1 024 (option « Ombres ») ; aucune lumière hémisphérique ni ponctuelle (`render.json` → `light`).
2. Matières qui reçoivent la lumière : `MeshLambertMaterial` partout pour le décor (sols, murs, atlas de props, planches, garde-corps, sol extérieur, épaves) et pour les personnages (`character-v2.js`, matières de blessure comprises).
3. Mur percé (`see-through.js`) : Lambert modifié par `onBeforeCompile` (tramage par `discard`, clé de programme `mur-perce`) : il reçoit les lumières comme les autres Lambert ; le `discard` n'enlève que des pixels.
4. Sans éclairage : `MeshBasicMaterial` (jupe sombre sous l'étage, laser, balles, flash, lampe frontale du joueur, taches et particules de sang), `ShaderMaterial` (flammes et fumées de `fire.js`, brume de `mist.js`).
5. Three.js 0.186.1 (paquet installé) : lumières physiques (unités : candela, `decay` 2 par défaut) ; atténuation `pow2(saturate(1 - (d / distance)^4)) / max(d^decay, 0.01)` : **zéro exact au-delà de `distance`** ; Lambert calculé au pixel.
6. Le nombre de lumières de chaque type est un `#define` du programme (`NUM_POINT_LIGHTS`) : changer le nombre de lumières visibles recompile **tous** les programmes Lambert ; une lumière cachée (`visible = false`) sort de la liste (`traverseVisible`) et compte comme un changement.
7. Une lumière n'a pas de masque par objet : `WebGLRenderer` teste seulement `light.layers` contre la caméra ; une lumière éclaire tout ce qui est à sa portée, à travers les murs (aucune ombre).
8. Coût : une lumière ponctuelle ajoute une boucle par pixel de chaque matière Lambert (pas d'appel de dessin) ; avec ombre, une passe de six faces : **exclu**.
9. Étage affiché : `world.setElevation(e, floor)` (game.js) ; le monde descend de `e` (groupes `exterieur`, `rdc`, `rdcShell`, `rdcExposed` à `-e`, `etage` à `180 - e`) ; l'étage n'est visible que si `e > 0,01` ; le rez-de-chaussée reste dessiné (le sol de l'étage le cache).
10. Hauteur d'étage `floorLift` 180 ; murs et piliers jusqu'à 179 (`ceilingWalls`) ; l'étage couvre moins que le rez-de-chaussée (aile est du rez-de-chaussée au-delà de x 2 265 vue d'en haut, trous des deux escaliers).
11. Décors légers : `Builder` fusionne par matière (un maillage par matière et par étage) ; décor léger intérieur (`decor-interieur.world.json`) dans un maillage par étage (`decor-leger`, atlas) ; épaves et cratère par couleurs de sommet dans les maillages extérieurs.
12. Feux (`fire.js`, `feux.json`) : trois appels par feu, sans lumière (la « lueur » est un plan additif) ; mis à jour seulement dans le champ.
13. Sources de carte : `plan.json`, `etage.json`, `zones.json`, `decor-interieur.json`, `epaves.json`, `releve.json` (pixels) ; `npm run carte` écrit les dérivés (`*.world.json`, `decor.json`) et vérifie les règles.
14. `carte.html` : SVG de `world.json` ou `etage.world.json` (`js/core/map-svg.js`, `js/carte/main.js`), surcouches (blocs, déclencheurs).
15. Options (lot 5j) : `graphics.json` (sections, options, vecteurs), `js/core/graphics.js` (réglages `live` / `load`, `ELEVE` = rendu actuel, repli), `graphics-apply.js` (`applyLive` à chaud), `options-menu.js` (lit la liste : rien à ajouter à l'écran).
16. Sans nouvel appel : les supports peuvent rejoindre un maillage existant **au chargement** seulement ; une option `live` impose des maillages créés à part (voir « Choix technique »).

## Emplacements proposés (pixels du plan ; unités = pixels × 5 + 800)
| id | étage | support | position (px) | orientation | justification |
|---|---|---|---|---|---|
| lampe-r1 | rdc | pilier (pilier-1) | 92, 85 | s | nord de l'aile, loin de F1 |
| lampe-r2 | rdc | mur (mur-2, face ouest) | 134, 196 | o | bas de l'aile, F2 à 345 unités |
| lampe-r3 | rdc | pilier (pilier-4) | 92, 255 | s | pièce de l'escalier de l'aile |
| lampe-r4 | rdc | pilier (pilier-10) | 198, 228 | s | entrée de la grande salle |
| lampe-r5 | rdc | pilier (pilier-8) | 198, 313 | e | centre-ouest de la grande salle |
| lampe-r6 | rdc | mur (mur-interieur-3, face est) | 295, 256 | e | près de l'escalier courbe |
| lampe-r7 | rdc | mur (mur-5, face sud) | 388, 232 | s | entre deux comptoirs, F4 à 310 unités |
| lampe-r8 | rdc | mur (mur-6, face ouest) | 462, 280 | o | zone de départ |
| lampe-r9 | rdc | mur (mur-7, face nord) | 396, 348 | n | sud-est, entre F6 et F5 |
| lampe-u1 | étage | pilier (pilier-1) | 83, 83 | s | nord de l'aile |
| lampe-u2 | étage | mur (mur-2, face ouest) | 134, 170 | o | milieu de l'aile |
| lampe-u3 | étage | pilier (pilier-4) | 83, 253 | e | pièce de l'escalier de l'aile, 170 du trou |
| lampe-u4 | étage | mur (mur-7, face nord) | 100, 332 | n | sud de la même pièce |
| lampe-u5 | étage | mur (mur-3, face sud) | 176, 230 | s | nord de la salle de l'étage |
| lampe-u6 | étage | pilier (pilier-6) | 198, 312 | s | sud de la salle de l'étage |
| lampe-u7 | étage | pilier (pilier-5) | 231, 264 | o | est de la salle, loin du trou |

- **Zones laissées sombres** : milieu de l'aile (fenêtres F2, F3), sud-ouest de la pièce de l'escalier (pilier-5), sud-ouest de la grande salle (F8, F6, piliers 7 et 9), est de la salle (F5 près du bord) ; à l'étage, abords des fenêtres U1, U2, U3, U4, U6, U7 et des deux trous.
- **Hors couloirs d'approche** (prudence visuelle) : aucune lampe à moins de 150 unités d'une fenêtre, pour ne pas mettre une flamme vive dans l'axe où les zombies surgissent.

## Schéma de données
- Source `data/game/maps/rez-de-chaussee/lampes.json` (pixels, édité par le propriétaire) : `{ "lampes": [ { "id", "floor": "rdc" | "etage", "support": "pilier" | "mur", "x", "y", "orientation": "n" | "s" | "e" | "o", "hauteur" } ] }`. `orientation` : direction vers laquelle la lampe regarde (normale qui sort du support).
- `npm run carte` écrit `lampes.world.json` (dérivé, jamais édité) : unités du jeu, position collée sur la face du pilier ou du mur le plus proche dans le sens opposé à l'orientation, normale, `portee` (distance de lumière maximale sûre, voir « Risques »), support retrouvé ; une lampe sans support à moins de 40 unités, hors carte ou sur une fenêtre est signalée comme problème (la commande échoue).
- `data/game/lumieres.json` : `ambiance`, `plancherAmbiance`, `intensite`, `distance`, `decroissance`, `hauteurLumiere`, `decalage`, `fondu` (secondes), `vacillement` (`amplitude` ≤ 0,15, `frequences` < 1,5 Hz), `max` par défaut, `distanceActivation`. Couleurs : jetons `--game-lamp-*` (bloc isolé de `tokens.css`, lus par `palette.js`).

## Choix technique
- **Lampes (décor)** : modèle pur `js/core/lamps.js` (support, réservoir, flamme ; ≤ 60 triangles ; déterministe) ; rendu `js/game/lamps.js` (import dynamique si l'option n'est pas `off`) : **un maillage par étage** (rez-de-chaussée dans `groups.rdc`, étage dans `groups.etage`) avec **une seule matière** Lambert à couleurs de sommet dont la flamme est émissive (attribut de sommet lu par `onBeforeCompile`) : +1 appel au rez-de-chaussée, +2 à l'étage ; sans ombre ; créés une fois (à la première activation), cachés avec `off`. Pas de fusion dans les maillages existants : l'option est `live`, et refaire un maillage existant à chaud coûterait une reconstruction.
- **Lumières** (`eclairage`) : `js/game/lights.js` (import dynamique) : **N `PointLight` toujours visibles** (N = « Lumières simultanées »), `castShadow = false`, dans la scène (pas dans un groupe d'étage, pour qu'elles ne sortent jamais de la liste) ; à chaque image : lampes de l'étage affiché dont la sphère de lumière touche le champ de la caméra, triées par distance au joueur, les N plus proches ; chaque emplacement garde sa lampe tant qu'elle reste choisie ; une lampe qui sort s'éteint en `fondu`, la nouvelle s'allume ensuite en `fondu` (aucun saut d'intensité). Intensité nulle = lumière présente : **aucun changement de programme en partie**.
- **Changement d'option** (nombre ou mode) : programmes Lambert recompilés une fois ; préchauffage `renderer.compile(scene, camera)` aussitôt (un accroc unique possible, signalé).
- **Base** : en `eclairage` seulement, `ambient × max(ambiance, plancherAmbiance)` et `soleil × ambiance` ; rien ne change sinon.
- **Vacillement** : somme de deux sinus lents (temps de jeu, aucune horloge réelle), amplitude ≤ 15 %, < 3 variations par seconde ; constant sous `prefers-reduced-motion`.

## Risques
- **Matières sans éclairage** : taches et particules de sang (Basic) resteraient claires dans le noir : en `eclairage`, leur couleur est multipliée par le facteur de l'ambiance (inchangée sinon) ; laser, balles, flash, lampe frontale, flammes et brume restent émissifs ; la jupe sombre est déjà sombre.
- **Mur percé** : Lambert, reçoit la lumière sans traitement ; ses pixels tramés restent tramés.
- **Étage superposé** : une lumière n'a pas de masque par objet. Garantie par la distance : la lumière d'une lampe est **nulle au-delà de sa portée** (Three.js). (1) Seules les lampes de l'étage affiché reçoivent une lumière ; (2) une lampe du rez-de-chaussée a une portée < `180 − hauteur` : elle n'atteint jamais l'étage (sol, murs, garde-corps), même pendant la montée de l'escalier ; (3) une lampe de l'étage a une portée inférieure à sa distance au rez-de-chaussée visible d'en haut (trous des escaliers, parties du rez-de-chaussée hors du sol de l'étage, sommets des murs à 179) : `portee` calculée par `npm run carte`, prise au minimum avec `distance` au rendu ; test de luminance d'une zone du rez-de-chaussée vue par le trou d'un escalier, avec et sans les lampes de l'étage.
- **Lumière à travers les murs** : aucune ombre ; la lumière est décalée de `decalage` vers l'intérieur de la pièce (l'autre côté du mur reçoit moins de 20 % de la face éclairée). Idée : ombre des lampes.
- **Coût par pixel** : réservé à l'Élevé (déjà saccadé sur iPhone et Pixel 7) ; Moyen garde `decor` seulement si la mesure le permet.

## Plan de mesure
- Références `origin/dev` (relevées) : appels, triangles, pixels, programmes de R1, R2, U1, U4 × Faible, Moyen, Élevé (Élevé R1 62 / 38 479 / 1 000 500 / 18 programmes ; Faible 16 programmes) ; six empreintes de `trace-logique.mjs` ; six vues (`vues.mjs`) ; 113 fichiers JavaScript ; Lighthouse mobile de `jeu.html` (5 passes) ; tâche par préréglage (`mesurer.mjs`, 5 passes).
- Après : mêmes relevés avec `?lum=off` (identiques), `decor` (+≤ 2 appels, ≤ +1 500 triangles, tâche ≤ +2 % à Moyen, passes alternées avec `origin/dev`), `eclairage` × 2, 4, 6 (tâche en % de l'Élevé sans lumière) ; lisibilité (luminance du sol dans la zone la plus sombre, part sous 8 %, rapport personnage / sol) ; captures 667×375 et 1440×900.
