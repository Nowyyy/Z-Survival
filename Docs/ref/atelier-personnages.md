# Atelier des personnages (lot 3j)

Document de référence du lot 3j : méthode, architecture de rendu, kit de pièces, squelette, données, variantes, animations, page de l'atelier. Les sections sang, paramètres d'essai et intégration sont complétées aux parties C et D.

## Méthode

- Tout est mesuré en Node, sans rendu, avec les modules purs de `js/core/` (`character-parts.js`, `pose-v2.js`) et les données (`data/game/characters-v2.json`, `data/game/poses-v2.json`). Les scripts de `scripts/personnages/` impriment leurs mesures et n'écrivent rien.
- Silhouette et contraste : `silhouetteMetrics` rasterise les triangles posés avec la caméra du jeu (`gameView()` de `scripts/personnages/lib.mjs` : perspective 40°, inclinaison 75°, distance `fitDistance(zone de jeu, 667 / 375) / zoom` = 704,5 pour la carte par défaut), personnage au centre, 4 orientations moyennées, 4 × 4 sous-pixels par pixel, z-buffer, couleurs sans éclairage.
- L'agent ne juge ni l'esthétique, ni le caractère effrayant, ni la fluidité sur un vrai téléphone : il fournit des nombres et décrit des captures.

## Architecture de rendu (décision de la partie A, corrigée en partie B)

`node scripts/personnages/architecture.mjs` : 10 zombies (types variés) et le joueur, personnages actuels décrits à l'identique dans les deux architectures, proxy d'ombre de 5 boîtes (60 triangles) pour les os rigides.

| Mesure | Pièces articulées (actuelle) | Os rigides (`SkinnedMesh`) |
|---|---|---|
| Appels, passe principale | 122 | 22 (corps 11 + proxy d'ombre 11, sans couleur ni profondeur) |
| Appels, passe d'ombre | 55 | 11 |
| Appels au total (11 personnages) | 177 | 33 |
| Appels par zombie | 16 | 3 |
| Triangles, passe principale | 6 920 | 6 920 (+ 660 du proxy, qui n'écrit rien) |
| Triangles, passe d'ombre | 2 936 | 660 |
| Mémoire des géométries partagées | 201 216 o | 709 104 o (5 géométries fusionnées avec couleur et os par sommet) |
| Mémoire propre à chaque personnage | 0 | 4 096 o (texture d'os 16 × 16 du squelette v2 à 19 articulations ; 1 024 o pour v1) |
| Mise à jour d'une pose, 11 personnages (Node) | 0,16 à 0,18 ms par image | 0,15 à 0,19 ms par image |

Lu dans Three.js 0.186.1 (`node_modules/three/src`) : `SkinnedMesh` (mode « attached », `bind(skeleton, bindMatrix)`, `boundingSphere` propre au maillage, calculé une seule fois s'il est nul, donc fixé à la main pour couvrir toutes les poses), `Skeleton` (une texture d'os par squelette, mise à jour une fois par image, partagée par la passe d'ombre), `WebGLShadowMap.renderObject` (**un objet n'est dessiné dans la passe d'ombre que si `object.layers.test(caméra principale)`** : la partie A prévoyait de mettre le proxy sur une couche réservée à la caméra d'ombre, ce qui ne marche pas — vu sur les captures de la partie B, où les variantes n'avaient plus d'ombre ; correction : le proxy reste sur la couche 0 avec une matière `colorWrite: false, depthWrite: false`, qui coûte un appel dans la passe principale et n'écrit rien), `CapsuleGeometry` et `SphereGeometry` (algorithmes repris à l'identique dans le kit), matériaux partagés.

**Décision : os rigides** (un `SkinnedMesh` par matière, un sommet = un os de poids 1, plus un proxy d'ombre ≤ 64 triangles). Raisons mesurées : 33 appels au lieu de 177 pour 11 personnages (−81 %), 4,4 fois moins de triangles dans la passe d'ombre, même coût de mise à jour en Node ; compatible avec le culling du jeu (`root.visible` par étage, sphère englobante fixe de rayon 62 pour le culling hors champ) et avec la projection d'ombre. Complexité : un module (`js/game/character-v2.js`) ; la géométrie se fusionne une fois par variante et par tenue, les paliers d'usure ne changent que la couleur des sommets (attributs partagés). Coût : 3,5 fois plus de mémoire de géométrie (environ 140 Ko par variante et par tenue utilisée). **Critère tenu** : chaque personnage ≤ 4 appels (corps 1, lueur facultative 1, proxy 1 + 1). Les pièces articulées restent pour `?perso=actuel` (code actuel inchangé).

## Kit de pièces (`js/core/character-parts.js`)

- Types : `box` (12 triangles), `taper` (tronc de pyramide de 4 à 8 côtés, 4 n − 4), `capsule` (2 × radial × (2 × caps + 1), triangles dégénérés des pôles compris, comme Three.js), `sphere` (ellipsoïde, 2 w (h − 1)), `wedge` (prisme, 8), `quad` (bande de tissu à deux faces, 4). `sphere` s'ajoute aux cinq types demandés : les têtes, mains et bottes actuelles sont des `SphereGeometry`.
- Pièce : `{ id, piece, joint, kind, dims, offset, rotation, palette | region, material, casts, mirror }` ; transformation : échelle (capsule, sphère), rotation d'Euler XYZ, translation. `mirror: true` sur une articulation `…L` crée la pièce `…R` (x opposé).
- Fonctions : `partTriangles`, `buildPartGeometry` (tableaux purs, indices), `mergeParts` (par matière, non indexé, os, région, couleur par sommet), `characterStats`, `checkVariant` (budget, type ou articulation inconnus, pièce flottante à plus de 0,5, emprise > 1,3 r, hauteur, proportions de `petit`, ombres, texture), `fkPose`, `groundContact`, `boundsOf`, `silhouetteMetrics`, `distinctness`, `gameCamera`, `projectPoint`.

## Squelettes (`data/game/poses-v2.json`)

- `v1` : squelette actuel (bassin à 27, tronc, tête, épaules, coudes, poignets, hanches, genoux) ; `fromV1` (`js/core/pose-v2.js`) traduit une sortie de `computePose` comme `setPose` de `character.js`.
- `v2` : bassin, colonne (`spine`), poitrine (`chest`), cou, tête, épaules, coudes, poignets, hanches, genoux, chevilles (16 articulations), plages articulaires par axe. Angles : Euler `YXZ` de Three.js.

## Données (`data/game/characters-v2.json`)

`{ version, slots: [{ id, label, current, variants }] }` ; `current` reprend les vraies clés de `zombie-variants.json` (`scale`, `headTilt`, `armLift`, `dominant`, régions `outfit`, `trousers`, `skin`, `boot`, `sleeves`) et décrit les pièces actuelles à l'identique (test d'égalité : `tests/unit/persos-actuels.test.js`).

## Variantes (partie B)

`node scripts/personnages/variantes.mjs` (tableau complet et écarts de silhouette). Couleur vue = palette (jetons `--perso-*`) × facteur moyen de la région de détail × salissure ; contraste avec la couleur moyenne de chaque sol (carrelage, herbe, terre, route, trottoir, béton d'escalier) et de chaque sol taché (sol mêlé à 60 % à `--sang-frais`).

| Personnage | A | B | C | Riche (hors budget) |
|---|---|---|---|---|
| Joueur | 844 tri., 3 appels, 3,41:1 | 880 tri., 4 appels (lampe), 3,12:1 | 904 tri., 3 appels, 3,35:1 | 2 244 tri., 3,44:1 |
| Marcheur | 736, 3, 3,81:1 | 804, 3, 3,70:1 | 724, 3, 3,36:1 | 2 048, 3,81:1 |
| Petit | 712, 3, 3,47:1 | 768, 3, 3,41:1 | 772, 3, 3,55:1 | 2 024, 3,47:1 |
| Voûté | 720, 3, 3,36:1 | 804, 3, 3,38:1 | 804, 3, 3,31:1 | 2 032, 3,36:1 |
| Grand | 728, 3, 3,37:1 | 852, 3, 3,87:1 | 832, 3, 3,50:1 | 2 040, 3,39:1 |

(triangles, appels par personnage, contraste minimal sur tous les sols et sols tachés au palier d'usure 0 ; au palier 3 : 3,04:1 au moins ; toutes les tenues testées.) Ombre : 1 appel, 60 triangles. Aucune violation (`checkVariant` : budget, articulations, pièces flottantes, emprise debout ≤ 1,3 × le rayon dans 12 poses debout, hauteur 0,92 à 1,08 × l'actuelle, tête de « petit » entre 1/8,5 et 1/6,5).

- **Intentions** : zombies A « déchu réaliste » (lambeaux, tête inclinée, col ou gilet selon le type), B « horreur marquée » (bras et avant-bras plus longs, cou court et tête avancée, dos plus courbé, membres plus fins, mâchoire, arêtes et omoplates sombres sur le dos), C « lisible d'abord » (sac pour le marcheur, capuche pour le petit, chaînes, bosse et cape pour le voûté, casque, gilet et épaulettes pour le grand) ; joueur A « survivant tactique » (gilet, sac à dos, casquette, genouillères), B « civil débrouillard » (capuche, lampe frontale émissive, sac en bandoulière), C « lisible d'abord » (turquoise `--perso-joueur-vif`, épaules larges, brassard orange). « Riche » : la variante A en segments plus fins, plus de lambeaux, mains et oreilles.
- **Types** : échelles petit 0,93 < voûté 0,98 < marcheur 1 < grand 1,11 ; voûté penché (colonne + poitrine ≈ 1 rad, bras compensés aux 3/10) ; aires de silhouette toujours dans l'ordre petit < marcheur < voûté < grand ; écart minimal entre deux types : 12,6 % (A, marcheur et voûté), 15,0 % (B), 20,7 % (C, marcheur et voûté).
- **Macros** (`macros` de chaque variante, pas entiers de −2 à +2) : taille (±4 % par pas, ±8 %), carrure (±5 % de largeur par pas), usure (décale le palier), teinte (éclaircit ou assombrit de 4 % par pas), posture (±0,06 rad de colonne par pas). Animations : amplitude (±15 %), rythme (±10 % des animations au temps, jamais des marches), lourdeur (bassin plus bas, pas plus courts).
- **Tenues** : 6 palettes par type de zombie (`outfits`, pièces facultatives par tenue : `outfits: [indices]` sur une pièce), tirées par graine à chaque apparition (`pickOutfit` : jamais deux fois la même à la suite) ; 3 palettes pour le joueur (préparation des skins du lot 11).
- **Usure** (`wearByWave`, `wearTiers`) : manches 1-10, 11-20, 21-30, 31-40 → paliers 0 à 3 ; salissure (mélange avec `--perso-crasse`, 0 à 32 %) et déchirures (triangles de tissu assombris par `--perso-dechirure`, 0 à 10 %). Le joueur ne s'use pas.
- **Textures** (`js/core/texgen-persos.js`) : un atlas de détail gris par type (256 × 256, 4 tuiles = paliers de blessure 0 à 3, taches aux couleurs `--sang-*`) et un pour le joueur (128 × 128) ; 5 atlas = 1 485 481 octets avec mipmaps (≤ 4 Mo avec l'atlas du sang). La couleur vient des sommets ; une matière par palier de blessure partage l'image (seul le décalage de texture change).

## Animations (partie B)

`node scripts/personnages/animations.mjs` (maximum sur les 20 variantes) ; contrôles de `tests/unit/persos-animations.test.js` : plages articulaires (`range` de `poses-v2.json`), périodicité (phase 0 = phase 1 à 1e-6), vitesse angulaire < 65 rad/s, glissement du pied d'appui ≤ 15 %, aucune pièce sous le sol (0,5) hors morts, terre et relevage, pénétration des bras dans le tronc ≤ 1,5, morts terminées à plat (point le plus haut ≤ 40 % de la hauteur) dans l'emprise × 1,6.

- Marches (`marcheLente`, `marche`, `course`, `escalier`, joueur `marche`) : le pied d'appui suit une trajectoire droite au sol, la jambe est posée par cinématique inverse (`legIK`) et le bassin descend juste assez pour que la foulée soit atteignable : **glissement mesuré 0,0 %** pour toutes les variantes (l'actuel : environ 22 %). Foulées = `gaits.json` (38, 52, 40, 78), joueur 2π / 0,09 ; vitesses de déplacement inchangées.
- Styles : A mesuré, B lourd et saccadé (phase du haut du corps déformée, bassin plus bas, pas plus courts), C amplitudes nettes (bras tendus plus haut, mouvements francs).
- Zombies : attente (balancement), rampe (corps bas et presque horizontal, bras qui tirent à tour de rôle, comme l'actuel), arracher, escalade, attaque (cycle de 1 s = délai de contact), touché (additif, 0,25 s, nul aux deux bouts), trois morts de 1,2 s (chute avant, chute arrière, effondrement), escalier. Joueur : repos, marche (le tronc vise, les jambes suivent le déplacement), tir (recul), touché, à terre, relevage (0,8 s), réparation (un coup de marteau par cycle, `strikesPerPlank` coups par planche, réglé sur 0,4 à 1,8 s). L'arme et le marteau sont sur deux articulations ajoutées (`prop`, `tool`), cachées par échelle nulle.
- `blendPoses` (fondu de 0,15 s entre deux animations), `addPose` (touché), `poseAt(rig, anim, phase, params, data)`, `cycleSeconds`, `groundLift` (points de contact de `poses-v2.json` et des accessoires de la variante).

## Page `atelier-personnages.html`

Sections : choix (personnage, variante, tenue, usure ou manche, animation, sol, vue, orbite, vitesse, lecture), vue principale, comparaison « Actuel | A | B | C » à l'échelle du jeu (1,368 unité par pixel), ×2 et ×4, mesures (« hors cible » en toutes lettres), curseurs, sang et mini-arène (partie C), « Mes choix ». Rendu : `js/atelier-personnages/scene.js` (lumière, ombres et brume de `render.json`), personnages du jeu (`character.js` pour « Actuel », `character-v2.js`). Textes : `data/i18n/atelier-personnages.json` (clés `dev.persos.*`, chargé par la page comme l'atelier des sons du lot 3h ; vérifié par `tests/unit/persos-page.test.js`, `fr.json` n'est pas touché). `?test=1` expose `window.__zsPersos` (`getState`, `set(id, valeur)`, `step(secondes)`, `render`).

**« Mes choix »** (`formatChoices`, `parseChoices` de `js/core/persos-variants.js`) : une ligne par personnage choisi, `cle=valeur` séparés par « ; », valeurs signées (`+1`, `-2`), puis `sang=…` :

```
perso=marcheur;variante=B;taille=0;carrure=-2;usure=0;teinte=0;posture=0;tenue=+1;style=B;amplitude=0;rythme=0;lourdeur=0
perso=joueur;variante=C;…
sang=reduit
```
