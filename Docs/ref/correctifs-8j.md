# Correctifs du lot 8j (V0.8) : relevé, plan, réglages

## Relevé sur `origin/dev` (`b14311c`)
- **Interface de la partie** : HUD (E2-2), pause (E2-6), fin (E2-7), état à terre, débogage (E2-13) en `em` depuis `--hud-fs` = 14 px × 1,125 = 15,75 px ; `--hud-gap` 4 px, `--hud-target` 44 px, `--hud-pause-size` ≥ 44 px (`css/tokens.css`, interdit au lot), marges `--game-margin` 16 px (`css/game.css`). Tailles fixes : rien ne suit l'écran (panneau de pause de 504 × 185 px, boutons de 44 px de haut, à 1920 × 1080 comme à 2560 × 1440). Options en partie (E2-12) : styles `e5-*` de `css/menu.css` en `calc(N × --u)`, `--u` = clamp(0,7 px, min(100vw / 932, 100vh / 430), 2,4 px) : elles suivent déjà la largeur, plafonnées à 2,4.
- **Volumes** : `js/game/options-menu.js`, `<input type="range">` 0 à 100, pas lu dans `data/game/audio.json` (`volume.step` 10) ; flèches = ±10 (navigateur) ; écriture : `zs.device.v1` → `son.jeu`, `son.musique`, entiers 0 à 100 déjà acceptés (`js/save/device-settings.js`, inchangé) ; clic d'essai du menu à chaque `input`.
- **Portes** : `zones.json` → `porte-1` (`openAfterWave` 10), `porte-2` (20), `porte-3` (30, blocs au rez-de-chaussée et à l'étage) ; ouvertes à la fin de la manche `openAfterWave`, donc **ouvertes à la manche `openAfterWave + 1`** (convention de `nextDoor`, `js/core/zones.js`). État lu : `sim.doors[id].open` (`js/game/game.js`), blocs par étage dans `layouts.doors`. Infini : mêmes portes (même directeur).
- **Sons des zombies** : `js/core/sound-director.js` (pur, générateur propre au son) : `zombieHit` → `impact-zombie` + `zombie-blessure` ou `zombie-mort` ; `zombieAttack` (contact avec le joueur, une fois par seconde par zombie) → `zombie-attaque` ; `plankTorn` (planche arrachée, 2,2 s par planche) → `planche-arrachee`. Vague chargée (estimation par les cadences : tir 0,4 s, 4 balles par zombie, 3 à 4 fenêtres attaquées) : 5 à 7 coups sonores par seconde.
- **Tirs** : `syncSolids` (`js/game/game.js`) : balles (`stepBullets`, `js/core/projectile.js`), laser et ligne de tir (`castRay`, `js/core/ray.js`) arrêtés par les meubles (sauf escaliers), murs (fenêtres percées : on tire à travers, planches comprises), décor extérieur solide (voitures, arbres, hélicoptère), portes fermées. Les grilles F7 et F8 (`decor-interieur.json`) ne sont que dessinées : le mur logique (`mur-20`, `mur-19`) reste plein.

## Objets bas (< 100) et grilles
| Étage | Objets (type, hauteur de collision) | Traversable |
| --- | --- | --- |
| rdc | comptoirs M4, M22, P6, P7, P8 (55), M33+M34+M35 (70) ; tables M1+M3+M7 (55), M10, P5, P9, P12 (40) ; étagères M12+M15+M17+M18, M19, M26+M28+M29+M31, P4, P3+R-G37, P1+P2+R-G39 (70) ; caisses M21, M32, P10, P13 (45) ; armoire P11 (65) | oui (22) |
| rdc | grilles `grille-F7` (115 de large, dans `mur-20`), `grille-F8` (30, dans `mur-19`), de part et d'autre de la fenêtre F8 (58 de haut) | oui |
| étage | comptoir E1 (55) ; caisses E2, Q5, Q6 (45) ; étagère Q1 (70) ; tables Q2, Q4 (40) ; armoire Q3 (65) | oui (8) |
| les deux | piliers (70) ; escaliers (déjà sans effet sur les tirs) | non (règle du prompt) |
| extérieur | voitures (55), arbres, hélicoptère | non (pas des meubles ; ajoutables par la liste) |

## Plan
1. **Interface en 2K** : facteur `--ui-k` = min(2, max(1, hauteur / 1080)) posé sur la racine par `js/game/ui-echelle.js` (appelé par `js/game/ui.js`, au redimensionnement) ; `css/game-ui.css` redéfinit `--hud-fs`, `--hud-gap`, `--hud-target`, `--hud-pause-size`, `--hud-radius`, `--game-margin` × `--ui-k`, et l'unité `--u` du seul panneau d'Options de la partie ; ni `zoom` ni `transform`. Tests : captures au pixel (4 tailles × 4 écrans), mesures et chevauchements en grand.
2. **Volumes** : pas 1, clavier par `event.code` (flèches ±1, Page ±10, Début, Fin), application au plus toutes les 150 ms pendant le glissement et au relâchement (le clic d'essai du menu suit). Tests e2e (menu et pause).
3. **Message des portes** : `js/core/porte-message.js` (pur : porte fermée la plus proche de l'étage du joueur) et `js/game/porte-message.js` (texte, fondu, `aria-live`) ; distance dans `data/game/reglages-partie.json` (`porte.distance`) ; clé `game.porte.message`. Tests Vitest et e2e.
4. **Sons** : `js/core/sons-coups.js` (pur, tirage à part) appliqué par `js/game/audio.js` avant le directeur ; probabilité `sonsZombies.probabilite` (0,25) du même fichier ; morts toujours sonores. Tests Vitest et e2e (journal des sons).
5. **Tirs** : liste du propriétaire `data/game/tirs-traversables.json` → `npm run carte` vérifie les identifiants et écrit `tirs.world.json` ; `js/core/tir-traverse.js` (pur) retire les objets listés et perce les murs aux grilles pour les seuls tirs ; `?test=1&tirtraverse=0` vide la liste. Tests Vitest, e2e (grille de F8), trace logique.
