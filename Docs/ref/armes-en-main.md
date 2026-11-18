# Armes en main — corps long, gabarits, table des armes, chargeurs, changement d'arme (lot 9e, V0.9)
Partie A : relevé, valeurs proposées, plan. **Rien n'est codé avant « GO 9e ».** Base : `origin/dev` `d456a42` (bilans 9c et 9d présents, Tests verts).

## 1. Gabarits : ce qui dépend du corps
Mesure (`posedTriangles` de `js/core/character-parts.js` sur les poses de `pose-v2.js`, variante « riche », vue de dessus, unités du jeu ; corps long = épaules ±9 × (épaule du type / 11,5), bras et avant-bras ×1,2, mains ×1, os `rig.upper`/`rig.fore` ×1,2 pour la cinématique inverse) :

| Marcheur (petit / grand ≈ ×0,93 / ×1,11) | Avant | Corps long |
|---|---|---|
| Largeur aux épaules, bras compris (marche) | 27,8 | 23,8 |
| Main la plus avancée : marche / attente | 19,4–20,0 / 19,6 | 21,1–23,2 / 22,3 |
| Main au coup (attaque, phase 0,45) | 19,6 | 21,8 (animation revue : 30 à 31) |
| Main à l'arrachage (arracher) | 26,5 | 30,0 |
| Rampant : longueur × largeur ; aire | 59 × 28 ; 857 | 60 × 24 ; 878 |
| Aire au sol (marche) → rayon de même aire | 464 → 12,1 | 439 → 11,8 |
| Joueur : largeur ; main à la réparation | 25,8 ; 28,1 | 23,0 ; 30,9 |

Le corps long **rétrécit les épaules (−4) et allonge la portée des mains (+2 à +4)** ; jambes, bassin et torse (ce qui touche le sol) ne changent pas.

| Règle (fichier) | Valeur | Dépend de | Proposé |
|---|---|---|---|
| Rayon des zombies `enemies.json` `zombie.radius` × `radiusMul` | 20 (18,6 / 19,6 / 21,4) | place au sol : séparation (`enemy-ai.js:140`), murs et meubles (`collision.js`), grille (`nav.js:20`, +`inflate` 4), escaliers (`stair-zombies.js:77,93`), siège, repoussements | **inchangé** : le corps au sol est le même, l'aire passe de 464 à 439, le cercle de 40 couvre déjà 23,8 de large |
| Zone touchée par une balle (`projectile.js:87`) et le laser (`ray.js`) | r + 4 (balle) ; r | silhouette | **inchangé** debout : toutes les mains du corps long restent dans r + 4 = 24 (marcheur, marche : 24,0 au plus) |
| Rampant : même cercle (`CLAUDE.md` : « la rampe est visuelle ») | cercle 20 | corps couché 60 × 24 | **capsule** (corrections, point 1) pour balle, laser et coups ; collisions inchangées |
| Joueur `player.json` `radius` | 18 | collisions, tube d'escalier (`stair-walk.js:136`), barrières, contact | **inchangé** (même corps au sol ; épaules 25,8 → 23) |
| Coup du zombie (`combat.js:75`) : centres à r_joueur + r_zombie + 1 | 39 (37,6 / 38,6 / 40,4) | portée du bras | **règle inchangée, animation revue** : aujourd'hui la main frappe à 19,6 et s'arrête 13 avant le torse du joueur (coup dans le vide) ; bras long tendu, buste penché : 30–31 × échelle du type → la main touche le torse (≈ 8 du centre) à 39 |
| Emplacement d'arrachage `windows.json` `slotDistance` (file : + 45 × rang) | 55 | portée à l'arrachage | **50** : mains (30) au nu extérieur de l'ouverture (mur 40, face à 20 du centre) au lieu de 8,5 devant ; file décalée d'autant (décidé) |
| Réparation `repairDistance` / `repairRadius` | 70 / 80 | main du joueur | **inchangés** : zone de 80, et `repairDistance` place aussi les meubles (`maps/params.json` `repairClearance`, `decor-interieur.js:307`) : la carte ne bouge pas |
| `queueStep`, `approachRadius`, `gateTolerance`, `slotTolerance`, `climbTime` | 45, 140, 14, 26, 1,2 | corps au sol | inchangés |
| `nav.json` (`cell` 20, `inflate` 4), `stairs.json` (`arrivalPushRadius` 60), `player-down.json` (`knockbackRadius` 220) | — | rayon | inchangés (rayon inchangé) |
| Carte : `minCorridor` 50, fenêtre 72, `doorClearance` 100, apparitions 450 / 650 | — | rayon | inchangés ; `npm run carte` non relancé |
| `weapons.json` `muzzleOffset` 26, `aimTolerance` 24 | — | arme | bouche **par arme** (pose de `poses.json`, projetée sur l'axe de visée) |
| Os des personnages (`character-v2.js`, IK de `pose-v2.js`) | épaules 11,5 ; bras 10 + 9 | corps | épaules ±9 (petit 8,0, voûté 8,8, grand 9,4), échelle 1,2 aux épaules et 1/1,2 aux poignets (comme l'atelier), `rig.upper`/`fore` ×1,2 ; sang : ancres sur les os, suivent |

Trouvé en passant (non proposé, voir Idées) : le grand est dessiné ×1,11 mais son rayon est ×1,07. **Passages étroits** : couloirs de 50 (zombie 40, joueur 36), fenêtres de 72, escaliers ; rien ne s'élargit : aucun nouveau risque, vérifié par la simulation de blocage (§ 4) avant et après.

## 2. Table des armes — `data/game/armes-partie.json` (nouveau, réglable sans lot)
Une entrée par arme, **identifiant = celui de `data/armes/armes.json`** (modèle 3D, variante de `armes-choix.json`, visuel 2D `visuelArme(id)`, poses) : aucun doublon ; nom : `game.armes.<id>` (i18n). Champs : `categorie`, `palier`, `degats`, `cadence` (s entre deux tirs), `portee` (`fireRange` ; laser 300 pour toutes), `dispersion` (demi-angle à l'arrêt, ° ; `dispersionMouvement` en plus à pleine vitesse), `vitesse` (× joueur), `chargeur`, `reserve` (`null` = ∞), `rechargement`, `sortie` (s), `prix` (Zollars, provisoire), `plombs`, `active`. Les niveaux du joueur (`player-stats.json`) s'appliquent comme aujourd'hui (dégâts, cadence, portée, précision). Communs dans `weapons.json` (vitesse et rayon de balle, éclair, 30 balles en vol).

**Calcul** (`waves.js` + `enemies.json`, niveau 0) : vie du marcheur = 50 × `hpMul` : manche 1 : 50 ; 11 : 303 ; 21 : 785 ; 31 : 1 500 (plafond 30 atteint à la manche 28) ; 40 : 1 500. Référence : **Colt en manche 1 = 2 tirs × 0,4 s = 0,8 s par zombie**. Cible : T = ⌈vie / (dégâts × plombs × 0,75 si plombs)⌉ × cadence ≈ 0,8 s à la manche d'ouverture du palier (11, 21, 31). La vie étant plafonnée de 31 à 40, le palier 4 se règle sur le nombre de zombies : 150 (manche 40) / 98 (manche 31) = ×1,5 → T ≈ 0,53. **Lourdeur** d'après la masse réelle m (kg) : `vitesse` = 1 − 0,02 (m − 1,1) ; `sortie` = 0,3 + 0,07 m ; `dispersionMouvement` = 8 + 0,45 (m − 1,1). **Munitions** : chargeur réel ; chargeur + réserve = de quoi tuer les zombies d'une manche d'ouverture (75 % de tirs au but), arrondi au chargeur. **Prix** : 60 % des Zollars gagnés (10 par tué) entre l'ouverture du palier précédent et la sienne (1 460, 4 170, 7 950, 10 900), arrondi à 100.

| Arme | Catégorie | Palier | Dégâts | Cadence | Portée | Dispersion | Vitesse | Chargeur / réserve | Recharge | Sortie | Prix | T ouverture → suivant |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Colt M1911 (1,1 kg) | pistolet | 0 | 25 | 0,40 | 700 | 4 / +8 | 1,00 | 7 / ∞ | 1,4 | 0,38 | — | 0,8 (m1) → 4,4 (m10) |
| Kar98k (3,9) | fusil à verrou | 1 | 320 | 0,85 | 1 000 | 1,5 / +9,3 | 0,94 | 5 / 30 | 2,4 | 0,57 | 900 | 0,85 (m11) → 2,55 (m20) |
| Winchester M1897 (3,6) | fusil à pompe, **8 plombs** | 1 | 55 × 8 | 0,90 | 350 | 7 / +9,1 | 0,95 | 6 / 30 | 3,0 | 0,55 | 900 | 0,9 → 2,7 |
| Thompson M1928 (4,9) | pistolet-mitrailleur | 2 | 90 | 0,09 | 650 | 5 / +9,7 | 0,92 | 30 / 660 | 2,4 | 0,64 | 2 500 | 0,81 (m21) → 1,53 (m30) |
| M1 Garand (4,3) | fusil semi-automatique | 2 | 400 | 0,40 | 1 000 | 2 / +9,4 | 0,94 | 8 / 144 | 2,0 | 0,60 | 2 500 | 0,80 → 1,60 |
| StG 44 (4,6) | fusil d'assaut | 3 | 215 | 0,11 | 850 | 3 / +9,6 | 0,93 | 30 / 900 | 2,4 | 0,62 | 4 800 | 0,77 (m31 à m40) |
| BAR M1918 (8,8) | fusil-mitrailleur | 3 | 240 | 0,12 | 1 000 | 3,5 / +11,5 | 0,85 | 20 / 900 | 2,8 | 0,92 | 4 800 | 0,84 |
| MG42 (11,6) | mitrailleuse | 4 | 140 | 0,05 | 1 000 | 5 / +12,7 | 0,79 | 50 / 2 150 | 4,5 | 1,11 | 6 500 | 0,55 (m40) |
| Panzerschreck, Lance-flammes M2 | spéciales | 4 | — | — | — | — | — | — | — | — | — | `active: false`, hors débogage |

Colt : chargeur 7, réserve ∞, jamais à sec ; Colt en manche 11 : 13 tirs = 5,2 s, en 21 : 12,6 s (il s'essouffle). Le MG42 (174 u/s) est plus lent qu'un coureur (185) : lourdeur voulue, à juger en jouant. Recharges : ordre réel (lame de 5, clip du Garand, cartouche à cartouche du fusil à pompe, bande du MG42).

## 3. Chargeurs, changement d'arme, sons, débogage
- **Logique pure** `js/core/armes/inventaire.js` (sans horloge ni DOM) : emplacement **Colt permanent** + `emplacementsAchetes` (donnée de `armes-partie.json`, 1) ; `donnerArme` (emplacement libre, sinon remplace l'arme achetée tenue, ou la seule achetée si le Colt est en main) ; chargeur, réserve, tir (cadence, munitions), **rechargement automatique** (chargeur vide, réserve non vide) ou à la main, pas de tir pendant ; à sec : plus de tir ; **changement** : durée = sortie de l'arme qui arrive (40 % ranger, 60 % sortir), pas de tir ; rechargement interrompu par un changement, **gardé et repris** à la prochaine sortie (comme une planche) ; munitions illimitées (débogage). `combat.js` garde la cadence ; le jeu lit l'arme active (dégâts, cadence, portée, cône, plombs : un tirage par plomb dans le cône, `spread.js`, arrêté par les obstacles).
- **Contrôles** (`event.code`, mêmes lettres en AZERTY et QWERTY) : **R** recharger, **E** changer d'arme, **1** / **2** (Colt / arme achetée), **molette** (un cran = changer, 150 ms entre deux) ; téléphone : deux boutons ronds près du stick droit (≥ 44 px × `--ui-k`) : « Recharger » et « Changer » qui **montre le visuel 2D de l'autre arme** ; touches ajoutées à `game.aria` (pas d'écran d'aide ni d'Options des touches aujourd'hui).
- **Rendu** : arme du lot 9c (variante de `armes-choix.json`, ×0,8, Colt ×1,2) attachée à l'os `prop`, **un appel** (géométrie fusionnée, une matière Lambert, atlas commun) ; pistolet retiré de la géométrie du joueur (`gunGrip`, `gunSlide`) ; poses de `poses.json` dans `pose-v2.js` (`tenue`) ; **recharge** : arme abaissée de 25°, main gauche au chargeur (Colt, Thompson, StG 44, BAR), à la culasse (Kar98k, Garand), au tube (Winchester), au couvercle (MG42) — point `prises.recharge` ajouté à `armes.json` ; **sortie** : arme qui descend puis remonte ; bouche par arme (laser, balles, éclair). Armes chargées avec la partie seulement (import dynamique), jamais au démarrage du menu.
- **HUD** : « 5 / 42 », « 7 / ∞ », « Recharge… », « À sec » près de la vie, à `--ui-k`, contraste ≥ 4,5:1 ; lecteurs d'écran : région polie annonçant seulement le début et la fin d'un rechargement, l'arme sortie et « à sec » (jamais chaque tir).
- **Sons** (par ajout, `sounds.json` + `synth2.js`) : un tir par arme dérivé de la recette `shot` actuelle (corps, claquement, queue ; plus grave et plus long pour les fusils, rafale serrée pour les automatiques, souffle large pour le fusil à pompe), deux variantes chacune à choisir comme aux lots 3h / 8i, **à écouter dans l'atelier des sons existant** (section « Armes ») ; rechargement (chargeur, culasse, cartouches) et changement (frottement, clic) ; tampons existants inchangés (empreintes).
- **Débogage** (canaux `source`, `dev`) : « Donner une arme » (liste des huit), « Remplir les munitions », « Munitions illimitées » ; aucune écriture.
- **Réglages de test** (`?test=1`, groupe T de `pageSearch()`) : `corps=avant` (corps d'avant) et `munitions=illimitees` (sans rechargement) pour la garantie 1.

## 4. Mesures de référence (`origin/dev` `d456a42`)
- **Trace** (`trace-logique.mjs`, 6 × 600 pas, finales) : 2850de8d…, 750fb6c0…, 9f019408…, b18d5472…, b12ec825…, 937b5d1b… (égales à celles du bilan 9c).
- **Difficulté** : joueur automatique déterministe (immobile au départ, vise le zombie le plus proche de son étage, tir automatique du jeu, ne répare pas ; `step(0,05)`, graines 1 à 3) ; T = temps du premier impact à la mort (médiane), dégâts reçus, planches arrachées (fenêtres actives), coincés (moins de 5 parcourus en 5 s, ni occupé, ni près du joueur). Script : `scripts/perf/difficulte.mjs` (ajouté en B).

| Niveau 0 (Colt) | T m1 / m3 / m5 | Mort à | Dégâts m5 | Planches m1–5 | Coincés |
|---|---|---|---|---|---|
| graines 1 / 2 / 3 | 0,4 / 1,2 / 1,8–2,0 | m5 (228, 204, 214 s) | 139 / 150 / 148 | 16 / 16 / 16 | 0 |
| Manches 11 / 21 / 31 (2 graines) | 2,8 (2 tués) / aucun / aucun | 26 à 31 s | 100–142 | 19–29 | 0 |

| Niveaux 10 (`?lvl=all:10`) | T m2–6 / m7–11 | Manche à 800 s | Dégâts | Tués | Coincés |
|---|---|---|---|---|---|
| graines 1 / 2 / 3 | 0,2–0,4 / 0,4–1,0 | 11 / 11 / 11 (vivant) | 0 | 167 / 167 / 165 | 5 / 0 / 0 (à examiner en B) |
| Manches 11 / 21 / 31 | 0,6–0,8 / 1,8–7,4 / 7–13 | vivant / mort 64–78 s / mort 64–70 s | 0 / 803–974 / 781–803 | 16–18 / 5–11 / 1–3 | 1 / 0 / 0 |

- **Blocage** (deux étages, 3 portes ouvertes, fenêtres ouvertes, zombies quasi immortels, joueur déplacé sur les 14 points de réparation, 360 s × 2 graines) : 0 zombie coincé.
- **Lighthouse** mobile, 5 passes : `index.html` 90, 89, 89, 89, 90 (médiane 89 dans ce conteneur, déjà sous le seuil de 90 sur `origin/dev`) ; `jeu.html` 80, 80, 80, 80, 79 (médiane 80) ; CLS ≤ 0,0013. Rendu (R1, R2, U1, U4 × 3), fichiers au démarrage, captures et nombre de tests : relevés en B sur une copie servie de `d456a42`.

## 5. Plan
- **B** corps long et gabarits (`character-v2.js`, `pose-v2.js` : marche bras tendus, coup à vraie portée ; `slotDistance` ; rampants en capsule (balles, laser, coups)) ; trace (premier écart et cause), difficulté, blocage, captures. **C** table, armes en main, tir par arme, « Donner une arme ». **D** chargeurs, recharge animée, HUD, Colt ∞, à sec, « Remplir », « Illimitées » ; trace « chargeurs du Colt ». **E** emplacements, molette, E, 1/2, bouton à visuel, sortie animée. **F** sons, dix cycles du lot 9d, Lighthouse. **G** CI et bilan.
- **Tests** : purs (`inventaire`, table, calibrage recalculé depuis les données, plombs, gabarits, capsule) ; e2e (chaque arme tire, tue, ralentit ; recharge ; changement PC et téléphone ; axe ; 44 px ; aucune écriture ; aucune requête externe) ; références de trace et de mesures mises à jour avec la cause de chaque écart.

## Corrections du propriétaire (avant le GO ; elles priment sur le reste de la fiche)
1. **Rampants** : zone **plus longue qui couvre tout le corps couché**, pour les balles et le laser **et pour les coups** (contact avec le joueur) : capsule dans le sens de la marche, **rayon actuel gardé** (20 × type : la largeur ne diminue pas), segment de −8,8 à +10,8 × échelle du type (corps long : de −28,8 à +30,8 devant le centre) ; contact = distance du joueur à ce segment ≤ r_joueur + rayon + 1. **Aucune hauteur** ne filtre les balles (la logique reste en 2D) : elles touchent le rampant comme aujourd'hui. Collisions (place au sol) : cercle inchangé. La ligne « la rampe est visuelle, sans effet sur la hitbox » de `CLAUDE.md` sera à réécrire (bilan).
2. **Arrachage** : mains au mur, `slotDistance` 55 → 50.
3. **Cadence** : le niveau « cadence » du joueur n'est pas touché (rééquilibrage avec les objets hors partie).

## Idées
Rayon du grand aligné sur son dessin (×1,11) ; recharge cartouche par cartouche interruptible pour le fusil à pompe ; prix des munitions au lot d'achat.
