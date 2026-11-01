# Atelier des personnages (lot 3j)

Document de référence du lot 3j : méthode, architecture de rendu, kit de pièces, squelette, données, variantes, animations, page de l'atelier, sang, essai en jeu, procédures. Plan d'intégration : `Docs/ref/integration-personnages.md` ; manifeste de fusion : `Docs/ref/fusion-3j.md`.

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

## Sang, cadavres et mini-arène (partie C)

- **Données** : `data/game/blood.json` (provisoire). Niveaux `0` (rien), `reduit` (3 particules par tir non mortel, 8 par mort, 96 vivantes au plus, 12 taches de 8 s, fondu de 3 s, corps sans taches, cadavres de 2 s, teinte `--sang-reduit`), `1` complet (8 et 20 particules, 256 au plus, 48 taches de 20 s dont 5 de fondu, taches sur les corps selon la vie, cadavres de 6 s). Joueur touché : 4 particules au plus, aucune tache. Au plus 6 cadavres (le plus ancien part), enfoncement de 0,8 s.
- **Pur** (`js/core/blood.js`) : `levelOf`, `settings`, `burst(graine, type, direction de la balle, niveau, cfg, origine)`, `stepParticles` (gravité, aucun rebond, une particule qui touche le sol devient une goutte), `decalsAdd` / `decalsStep` / `decalAlpha` (taches gelées, plafond, éviction de la plus ancienne, fondu final), `impactDecals`, `woundTier` (0 à 3 : > 0,75, > 0,5, > 0,25 de vie), `corpsesAdd` / `corpsesStep` / `corpseSink`, `bloodBudget`, `decalAtlas` (4 formes générées).
- **Rendu** (`js/game/blood-fx.js`) : un `InstancedMesh` de quadrilatères pour les particules (1 appel), un pour les taches (1 appel, atlas 256 × 256 généré, forme et opacité par instance), posées à y = 0,2 ; cadavres = personnages en pose de mort, jamais ciblés ni solides (le jeu ne les connaît pas). Pleine charge (complet) : 2 appels, 608 triangles (≤ 3 et ≤ 1 200). Le sang suit l'étage de son événement (affiché à l'étage du joueur et au rez-de-chaussée).
- **Taches sur les corps** : 4 matières par type (une par palier de blessure, même image, décalage de texture), aucune géométrie en plus ; niveau complet seulement.
- **Lisibilité** : contraste ≥ 3:1 de chaque variante sur chaque sol couvert de sang à 30, 60 et 100 % (test) ; aucun état de jeu ne se lit dans le sang ; aucun clignotement, aucun flash.
- **Mini-arène** (`js/core/arena.js`, `js/core/crowd.js`) : 10 zombies en couronne (les 4 types par bloc de 4, allures tirées), vitesses et vies de `createEnemy` (manche 1), tir au délai (0,4 s) et aux dégâts (25) du pistolet sur le plus proche, sans collision ; pas fixes de 1/60 s : la vitesse d'affichage (×0,5, ×1, ×2) ne change pas les résultats.
- **Propositions de priorité 2** (`priority2` de `blood.json`, données seulement, désactivées) : lueur des yeux (2 pièces, 48 triangles, 1 appel), lampe du joueur (déjà émissive sur B ; une vraie lumière dynamique en plus, non mesurée), copeaux de réparation (même instance que les particules, 1 appel).

Projection (`node scripts/personnages/projection.mjs`) : décor de la référence + 10 zombies variés et le joueur + sang à pleine charge + 6 cadavres :

| Personnages | Sang | Personnages seuls | R1 | R2 | U1 | U4 | Marge / limites actuelles (300, 30 000) | Marge / refonte (400, 45 000) |
|---|---|---|---|---|---|---|---|---|
| actuel | 0 | 177 / 9856 | 203 / 14370 | 194 / 14988 | 210 / 15208 | 216 / 16092 | 84 appels, 13908 triangles | 184 appels, 28908 triangles |
| A | 1 | 33 / 9404 | 79 / 19662 | 70 / 20280 | 86 / 20500 | 92 / 21384 | 208 appels, 8616 triangles | 308 appels, 23616 triangles |
| B | 1 | 34 / 10228 | 80 / 20894 | 71 / 21512 | 87 / 21732 | 93 / 22616 | 207 appels, 7384 triangles | 307 appels, 22384 triangles |
| C | 1 | 33 / 9984 | 79 / 20170 | 70 / 20788 | 86 / 21008 | 92 / 21892 | 208 appels, 8108 triangles | 308 appels, 23108 triangles |
| riche | 1 | 33 / 23924 | 79 / 42054 | 70 / 42672 | 86 / 42892 | 92 / 43776 | 208 appels, -13776 triangles | 308 appels, 1224 triangles |

Textures (Node, non représentatif d'un téléphone) : 4 atlas de zombies 23.0 ms, joueur 1.3 ms ; mémoire estimée avec le sang : 1835006 octets (limite 4194304).

## Essai en jeu (partie D)

- **Paramètres** (`js/game/persos-params.js`) : `?perso=actuel|A|B|C|riche` (défaut **`riche`**), `?sang=0|reduit|1` (défaut **`1`**, sang complet), `?usure=auto|0|1|2|3` (défaut `auto` : palier de la manche en cours). Défauts choisis par le propriétaire après la livraison ; `?sang=reduit`, `?sang=0` et `?perso=actuel|A|B|C` restent disponibles pour le futur écran de réglages. Valeur inconnue : défaut, sans erreur. Jamais mémorisés ; absents de `readOnlyParams` (`save.json`) : ils ne déclenchent pas le mode essai, la sauvegarde reste écrite.
- **Chargeur** : `game.js` importe toujours `persos-loader.js` ; celui-ci importe `persos-runtime.js` et les données (`characters-v2.json`, `poses-v2.json`, `blood.json`) sauf avec `?perso=actuel&sang=0` (le jeu d'avant le lot : rien de plus n'est chargé que le chargeur et `persos-params.js`).
- **Arme** : `muzzle()` du joueur v2 donne le bout du canon dans le monde ; `game.js` le passe à `effects.update` (`gun`) : laser, éclair et balles en partent, à sa hauteur (la logique du tir reste celle de `muzzlePoint`). Tenue de l'arme : `HOLD` de `pose-v2.js` (bras tendus) ; recul au tir : `KICK` (à l'arrêt comme en marchant, buste rejeté, 0,25 s). Viser un zombie interrompt la réparation (jamais les deux à la fois) ; pendant la réparation, le laser n'est pas dessiné.
- **Fenêtres** : pendant le passage (`climb.t` > 0), les zombies v2 jouent `enjamber` (piloté par la progression, hauteur d'appui `sillHeight` de `render.json`) ; avant, ils marchent jusqu'au bord extérieur.
- **Morts** : `deathFor` (`js/core/blood.js`) choisit la mort d'après le côté touché (de face : `mortArriere` ; de dos : `mortAvant` ou `effondrement`) ; le cadavre garde l'orientation du zombie.
- **Démarrage** : seul le joueur est construit dans `createGame` ; les zombies (texture et géométrie de chaque tenue) sont préparés ensuite, une tenue par tâche, quand le navigateur est libre (`requestIdleCallback`), et l'atlas des taches au premier moment libre ou à la première tache ; les maillages du sang sont masqués tant qu'ils sont vides ; les géométries des personnages actuels ne sont construites qu'au premier personnage actuel. Les textures et géométries sont identiques à l'octet près à celles d'avant ces optimisations (empreintes comparées).
- **Accroches** : `character.js` (1 ligne : `kit.v2` aiguille `createCharacter`), `game.js` (18 lignes `// lot 3j` : impacts, morts, coups reçus, pas du sang, synchronisation par étage et manche, contexte du joueur, `getState().persos`), `effects.js` inchangé. Les personnages v2 reçoivent l'entrée de `computePose` et l'entité (zombie) ou le contexte (joueur) : allure, siège, escalier (marche d'escalier ; rampants en rampe, toujours relevés de 14 par le jeu), attaque (relance du délai de contact), touché (flash), à terre, relevage, réparation (durée par planche de la statistique).
- **Invariance** : à graine fixe et 600 pas, `getState()` (positions, vies, tués, vague, argent) est identique pour `actuel`, A, B, C, `riche` et les trois niveaux de sang (`tests/e2e/persos-jeu.spec.js`, boucle d'images figée).
- Crochet « spawnVariety » : le crochet existant `spawnEnemy(x, y, { type, gait, wave, floor, mode })` suffit (zombies de types et d'allures variés) ; `killAll` est inchangé.
- `?test=1` : `getState().persos` = `{ perso, sang, usure, wear, architecture, characters: { joueur, zombies }, blood: { particules, taches, cadavres, calls, triangles, dessines }, textures, render }`.

## Procédures

- **Ajouter une variante** : une entrée dans `variants` de l'emplacement voulu (`characters-v2.json`) : `skeleton: 'v2'`, `style`, `scale`, `joints` (épaules et hanches au moins), `posture`, `parts` (types du kit, `palette` = clé de la palette), `shadow` (≤ 64 triangles), `palette` (jetons `--perso-*`), `anchors`, `macros`, `outfits`, `contacts` (accessoires du tronc) ; puis `node scripts/personnages/variantes.mjs` et les tests `persos-variantes`, `persos-animations` (budget, contrastes, silhouettes, animations).
- **Ajouter une tenue** : une entrée `{ id, label, palette: { tenue, pantalon, accent } }` dans `outfits` (6 par type de zombie, 3 pour le joueur) ; une pièce facultative prend `outfits: [indices]`.
- **Ajouter une animation** : une fonction dans `js/core/pose-v2.js` (phase → angles), son nom dans `ZOMBIE_ANIMS` ou `PLAYER_ANIMS` (et `CYCLIC` si elle boucle), ses réglages par style dans `poses-v2.json`, son libellé `dev.persos.anim.<nom>` ; les tests de `persos-animations` la contrôlent alors d'office.
- **Lire « Mes choix »** : `parseChoices(texte)` renvoie `{ persos: [{ perso, variante, … }], extra: { sang } }` ; `node scripts/personnages/projection.mjs mes-choix.txt` imprime le budget correspondant.
- **Intégrer** : `Docs/ref/integration-personnages.md`.
