# Correctifs du lot 8j (V0.8) : relevé, plan, réglages

## Relevé sur `origin/dev` (`b14311c`)
- **Interface de la partie** : HUD (E2-2), pause (E2-6), fin (E2-7), état à terre, débogage (E2-13) en `em` depuis `--hud-fs` = 14 px × 1,125 = 15,75 px ; `--hud-gap` 4 px, `--hud-target` 44 px, `--hud-pause-size` ≥ 44 px (`css/tokens.css`, interdit au lot), marges `--game-margin` 16 px (`css/game.css`). Tailles fixes : rien ne suit l'écran (panneau de pause de 504 × 185 px, boutons de 44 px de haut, à 1920 × 1080 comme à 2560 × 1440). Options en partie (E2-12) : styles `e5-*` de `css/menu.css` en `calc(N × --u)`, `--u` = clamp(0,7 px, min(100vw / 932, 100vh / 430), 2,4 px) : elles suivent déjà la largeur, plafonnées à 2,4.
- **Volumes** : `js/game/options-menu.js`, `<input type="range">` 0 à 100, pas lu dans `data/game/audio.json` (`volume.step` 10) ; flèches = ±10 (navigateur) ; écriture : `zs.device.v1` → `son.jeu`, `son.musique`, entiers 0 à 100 déjà acceptés (`js/save/device-settings.js`, inchangé) ; clic d'essai du menu à chaque `input`.
- **Portes** : `zones.json` → `porte-1` (`openAfterWave` 10), `porte-2` (20), `porte-3` (30, blocs au rez-de-chaussée et à l'étage) ; ouvertes à la fin de la manche `openAfterWave`, donc **ouvertes à la manche `openAfterWave + 1`** (convention de `nextDoor`, `js/core/zones.js`). État lu : `sim.doors[id].open` (`js/game/game.js`), blocs par étage dans `layouts.doors`. Infini : mêmes portes (même directeur).
- **Sons des zombies** : `js/core/sound-director.js` (pur, générateur propre au son) : `zombieHit` → `impact-zombie` + `zombie-blessure` ou `zombie-mort` ; `zombieAttack` (contact avec le joueur, une fois par seconde par zombie) → `zombie-attaque` ; `plankTorn` (planche arrachée, 2,2 s par planche) → `planche-arrachee`. Vague chargée (estimation par les cadences : tir 0,4 s, 4 balles par zombie, 3 à 4 fenêtres attaquées) : 5 à 7 coups sonores par seconde.
- **Tirs** : `syncSolids` (`js/game/game.js`) : balles (`stepBullets`, `js/core/projectile.js`), laser et ligne de tir (`castRay`, `js/core/ray.js`) arrêtés par les meubles (sauf escaliers), murs (fenêtres percées : on tire à travers, planches comprises), décor extérieur solide (voitures, arbres, hélicoptère), portes fermées. Les grilles F7 et F8 (`decor-interieur.json`) ne sont que dessinées : le mur logique (`mur-20`, `mur-19`) reste plein.

## Objets bas (< 100) et grilles (relevé de la partie A ; règle finale : sous l'arme, voir le bilan)
*(Lot 8l : tableau du relevé de la partie A, **périmé** : la règle finale du lot 8j, après les retours du propriétaire, est « dessiné sous la hauteur de l'arme (43) » plus les grilles ; la liste qui fait foi est `data/game/tirs-traversables.json`, voir plus bas.)*

| Étage | Objets (type, hauteur de collision) | Traversable |
| --- | --- | --- |
| rdc | comptoirs M4, M22, P6, P7, P8 (55), M33+M34+M35 (70) ; tables M1+M3+M7 (55), M10, P5, P9, P12 (40) ; étagères M12+M15+M17+M18, M19, M26+M28+M29+M31, P4, P3+R-G37, P1+P2+R-G39 (70) ; caisses M21, M32, P10, P13 (45) ; armoire P11 (65) | oui (22) |
| rdc | grilles `grille-F7` (115 de large, dans `mur-20`), `grille-F8` (30, dans `mur-19`), de part et d'autre de la fenêtre F8 (58 de haut) | oui |
| étage | comptoir E1 (55) ; caisses E2, Q5, Q6 (45) ; étagère Q1 (70) ; tables Q2, Q4 (40) ; armoire Q3 (65) | oui (8) |
| les deux | piliers (70) ; escaliers (déjà sans effet sur les tirs) | non (règle du prompt) |
| extérieur | voitures (55), arbres, hélicoptère | non (pas des meubles ; ajoutables par la liste) |

## Fait (lot 8j)
1. **Interface en 2K** : `--ui-k` = 1 jusqu'à 1080 px de haut, puis hauteur / 1080, plafond 2 (`js/game/ui-echelle.js`, appelé par `js/game/ui.js`) ; `css/game-ui.css` reprend `--hud-fs`, `--hud-gap`, `--hud-radius`, `--hud-target`, `--hud-pause-size`, `--game-margin` × `--ui-k` (le reste est en `em`) ; ni `zoom` ni `transform` ; identique au pixel jusqu'à 1080 px. **Options plus denses sur PC** (demande du propriétaire en cours de lot) : unité des écrans Options (menu et partie) plafonnée à `--e5-u-max` = max(1,25 px, 100vh / 864) (`css/menu.css`, `.e5`) ; téléphones inchangés ; en partie, cibles et curseur × `--ui-k`.
2. **Volumes** : pas de 1 %, clavier par `event.code` (flèches ±1, Page ±10, Début 0, Fin 100), réglage (et clic d'essai du menu) au plus toutes les 150 ms pendant le glissement, puis au relâchement ; `zs.device.v1` inchangé (entier 0 à 100, validé par `js/save/device-settings.js`, non modifié).
3. **Portes** : `js/core/porte-message.js` (pur, lecture seule) et `js/game/porte-message.js` (texte à 66 % de la hauteur, fondu de 0,25 s dans `css/game.css`, `aria-live` poli) ; clé `game.porte.message` dans `fr.json` seulement (`en.json` n'a aucune clé `game.*` : le jeu est en français seul).
4. **Sons** : `js/core/sons-coups.js` (pur, générateur propre au son) appliqué par `js/game/audio.js` avant le directeur des sons : coups reçus non mortels, coups au joueur, planches arrachées ; morts toujours.
5. **Tirs** : `js/core/tir-traverse.js` (pur) : objets listés retirés et murs percés aux grilles **pour les tirs seulement** (`obstaclesTirs`, appelé par `syncSolids`) ; balles, laser et ligne de tir partagent la liste. Fenêtres : inchangées (ouvertures sans obstacle, planches comprises, comme avant le lot).

## Régler sans lot
- Distance du message : `data/game/reglages-partie.json` → `porte.distance` (unités, 20 à 2000 ; 60 depuis le retour du propriétaire ; **lot 9a : 120, deux cases du dallage** : une case = 600 / 10 = 60 unités, `textures.json` → `sol-salle`). Fin de manche : `bleuManche.duree` (secondes de jeu, 1 à 15 ; 4).
- Sons : même fichier → `sonsZombies.probabilite` (0 à 1 ; 0,25) et `sonsZombies.types` (`zombieHit`, `zombieAttack`, `plankTorn`).
- Traversables : `data/game/tirs-traversables.json` → `cartes.rez-de-chaussee.rdc` et `.etage` (identifiants) ; puis `npm run carte` (refuse un identifiant inconnu ou en double, un pilier, un escalier, un objet **dessiné** à la hauteur de l'arme ou plus haut — `render.json` → `gunHeight`, 43 —, une grille hors mur ; écrit `tirs.world.json`), puis `npm test`.
- Densité des Options sur PC : `css/menu.css`, `.e5` → `--e5-u-max` (1,25 px ; 864 = 1080 / 1,25). Facteur de l'interface : `js/game/ui-echelle.js` (1080, plafond 2).
- Essais (jamais mémorisés, `?test=1`) : `&tirtraverse=0` (liste vide, tirs d'avant le lot), `&coups=1` (chaque coup sonne).

## Retours du propriétaire après la fusion
- Meubles de la carte : boîte de collision = rectangle dessiné (fin de la boîte de « chaise » du lot 3c) ; tirs par-dessus ce qui est dessiné sous l'arme (43) seulement ; cône arrêté comme le laser (`longueursCone`, `js/core/tir-traverse.js`) ; message des portes à 60 ; gemme bleue puis « solde (+gain) » sous la vague en fin de manche (`js/game/bleu-manche.js`, `js/game/gains-manche.js` depuis le lot 9b) ; pause : gemme bleue et solde bleu au lieu de « Monnaie jaune » (`jeu.html`, `js/game/ui.js`). Validé par le propriétaire sur `/dev/` (PR #135 à #137).
