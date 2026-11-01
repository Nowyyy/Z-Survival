# Atelier des personnages (lot 3j)

Document de référence du lot 3j : méthode, architecture de rendu, kit de pièces, squelette, données. Les sections suivantes (variantes, animations, sang, paramètres d'essai, formats, intégration) sont complétées aux parties B, C et D.

## Méthode

- Tout est mesuré en Node, sans rendu, avec les modules purs de `js/core/` (`character-parts.js`, `pose-v2.js`) et les données (`data/game/characters-v2.json`, `data/game/poses-v2.json`). Les scripts de `scripts/personnages/` impriment leurs mesures et n'écrivent rien.
- Silhouette et contraste : `silhouetteMetrics` rasterise les triangles posés avec la caméra du jeu (`gameView()` de `scripts/personnages/lib.mjs` : perspective 40°, inclinaison 75°, distance `fitDistance(zone de jeu, 667 / 375) / zoom` = 704,5 pour la carte par défaut), personnage au centre, 4 orientations moyennées, 4 × 4 sous-pixels par pixel, z-buffer, couleurs sans éclairage.
- L'agent ne juge ni l'esthétique, ni le caractère effrayant, ni la fluidité sur un vrai téléphone : il fournit des nombres et décrit des captures.

## Architecture de rendu (décision de la partie A)

`node scripts/personnages/architecture.mjs` : 10 zombies (types variés) et le joueur, personnages actuels décrits à l'identique dans les deux architectures, proxy d'ombre de 5 boîtes (60 triangles) pour les os rigides.

| Mesure | Pièces articulées (actuelle) | Os rigides (`SkinnedMesh`) |
|---|---|---|
| Appels, passe principale | 122 | 11 |
| Appels, passe d'ombre | 55 | 11 |
| Appels au total (11 personnages) | 177 | 22 |
| Appels par zombie | 16 | 2 |
| Triangles, passe principale | 6 920 | 6 920 |
| Triangles, passe d'ombre | 2 936 | 660 |
| Mémoire des géométries partagées | 201 216 o | 709 104 o (5 géométries fusionnées avec couleur et os par sommet) |
| Mémoire propre à chaque personnage | 0 | 1 024 o (texture d'os 8 × 8) |
| Mise à jour d'une pose, 11 personnages (Node) | 0,158 ms par image | 0,146 ms par image |

Lu dans Three.js 0.186.1 (`node_modules/three/src`) : `SkinnedMesh` (mode « attached », `bind(skeleton, bindMatrix)`, `boundingSphere` propre au maillage, calculé une seule fois s'il est nul, donc fixé à la main pour couvrir toutes les poses), `Skeleton` (une texture d'os par squelette, mise à jour une fois par image par le moteur, partagée par la passe d'ombre), `WebGLShadowMap` (un objet n'est dessiné dans la passe d'ombre que si `object.layers.test(caméra d'ombre)` : le proxy est mis sur la couche 1, activée sur la caméra d'ombre du soleil seulement, il ne coûte rien dans la passe principale), `CapsuleGeometry` et `SphereGeometry` (algorithmes repris à l'identique dans le kit), matériaux partagés.

**Décision : os rigides** (un `SkinnedMesh` par matière, un sommet = un os de poids 1, plus un proxy d'ombre ≤ 64 triangles). Raisons mesurées : 22 appels au lieu de 177 pour 11 personnages (−87 %), 4,4 fois moins de triangles dans la passe d'ombre, même coût de mise à jour en Node ; compatible avec le culling du jeu (`root.visible` par étage, sphère englobante fixe de rayon 62 pour le culling hors champ) et avec la projection d'ombre (couche 1). Complexité : un module (`js/game/character-v2.js`, ~150 lignes) ; la géométrie se fusionne une fois par variante et par jeu de couleurs. Coût : 3,5 fois plus de mémoire de géométrie (couleur et os par sommet, sommets non indexés comme aujourd'hui), soit environ 140 Ko par variante. **Critère** : chaque personnage ≤ 4 appels (corps 1, lueur facultative 1, proxy d'ombre 1). Les pièces articulées restent pour `?perso=actuel` (code actuel inchangé).

## Kit de pièces (`js/core/character-parts.js`)

- Types : `box` (12 triangles), `taper` (tronc de pyramide de 4 à 8 côtés, 4 n − 4), `capsule` (2 × radial × (2 × caps + 1), triangles dégénérés des pôles compris, comme Three.js), `sphere` (ellipsoïde, 2 w (h − 1)), `wedge` (prisme, 8), `quad` (bande de tissu à deux faces, 4). `sphere` s'ajoute aux cinq types demandés : les têtes, mains et bottes actuelles sont des `SphereGeometry`.
- Pièce : `{ id, piece, joint, kind, dims, offset, rotation, palette | region, material, casts, mirror }` ; transformation : échelle (capsule, sphère), rotation d'Euler XYZ, translation. `mirror: true` sur une articulation `…L` crée la pièce `…R` (x opposé).
- Fonctions : `partTriangles`, `buildPartGeometry` (tableaux purs, indices), `mergeParts` (par matière, non indexé, os, région, couleur par sommet), `characterStats`, `checkVariant` (budget, type ou articulation inconnus, pièce flottante à plus de 0,5, emprise > 1,3 r, hauteur, proportions de `petit`, ombres, texture), `fkPose`, `groundContact`, `boundsOf`, `silhouetteMetrics`, `distinctness`, `gameCamera`, `projectPoint`.

## Squelettes (`data/game/poses-v2.json`)

- `v1` : squelette actuel (bassin à 27, tronc, tête, épaules, coudes, poignets, hanches, genoux) ; `fromV1` (`js/core/pose-v2.js`) traduit une sortie de `computePose` comme `setPose` de `character.js`.
- `v2` : bassin, colonne (`spine`), poitrine (`chest`), cou, tête, épaules, coudes, poignets, hanches, genoux, chevilles (16 articulations), plages articulaires par axe. Angles : Euler `YXZ` de Three.js.

## Données (`data/game/characters-v2.json`)

`{ version, slots: [{ id, label, current, variants }] }` ; `current` reprend les vraies clés de `zombie-variants.json` (`scale`, `headTilt`, `armLift`, `dominant`, régions `outfit`, `trousers`, `skin`, `boot`, `sleeves`) et décrit les pièces actuelles à l'identique (test d'égalité : `tests/unit/persos-actuels.test.js`).
