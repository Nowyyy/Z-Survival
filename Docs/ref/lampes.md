# Lampes à huile et lumières dynamiques (lot 5k)

**Les lampes sont toujours sur la carte**, à tous les préréglages (décision du propriétaire, lot 5k-F) ; seule leur lumière dépend des graphismes : option « Lumière des lampes » (`decor` : Coupée ; `eclairage` : Dynamique) et « Lumières simultanées » (2, 4, 6) de l'écran Options (`Docs/ref/options-graphiques.md`) ; `?lum=decor|eclairage` (jamais mémorisé) ; `?lum=off` (sans lampes) sous `?test=1` seulement, pour les références des tests. **La logique du jeu ne change pas** : les lampes ne sont ni des obstacles, ni des cibles, ni des murs. Positions, couleurs et intensités **provisoires**, à régler par le propriétaire. Mesures et décisions : `Docs/lots/lot-5k.md`.

## Fichiers
- Sources (le propriétaire les modifie) : `data/game/maps/rez-de-chaussee/lampes.json` (positions, pixels du plan), `data/game/lumieres.json` (lumière), `css/tokens.css` (bloc « Lampes à huile (lot 5k) » : `--game-lamp-metal`, `-reservoir`, `-flame`, `-core`, `-light`).
- Dérivé (jamais à la main) : `lampes.world.json`, écrit par `npm run carte` (unités, collé au support, `portee`, `couverte`).
- Code : `js/core/lamps.js` (pur : sources, modèle de 34 à 36 triangles, portée sûre, choix des lampes, fondu, vacillement), `js/game/lamps.js` (maillages, chargé au démarrage), `js/game/lights.js` (lumières, importé en `eclairage`), `js/game/world.js` (`setLamps`), `js/game/graphics-boot.js` (préchargement), `js/game/graphics-apply.js` (option à chaud), `js/carte/main.js` (affichage sur `carte.html`).

## Déplacer, ajouter ou retirer une lampe
1. Ouvrir `carte.html` (rez-de-chaussée, puis « Étage ») : chaque lampe est un point jaune, un trait (son sens) et un cercle en pointillés (portée de sa lumière). Unités = pixels × 5 + 800 (le cadre « 100 px du plan » aide à lire les pixels).
2. Dans `lampes.json`, une ligne par lampe : `id` (minuscules, chiffres, tirets), `floor` (`rdc` ou `etage`), `support` (`pilier` : le point doit être dans le pilier, ou à 20 unités ; `mur` : la face de mur la plus proche, à 40 unités au plus, **dans le sens opposé à l'orientation**), `x`, `y` (pixels), `orientation` (`n`, `s`, `e`, `o` : vers où la lampe regarde ; une lampe sur la face sud d'un mur regarde au sud), `hauteur` (20 à 120 ; 48 par défaut, au-dessus des zombies).
3. `npm run carte` : la commande échoue (et dit pourquoi) si une lampe n'a pas de support, sort du bâtiment ou tombe sur une fenêtre ; elle donne le nombre de lampes et de triangles. Rien d'autre ne change (mondes, décor, règles de la carte).
4. `npm test` (tests/unit/lamps.test.js : 8 à 10 lampes au rez-de-chaussée, 6 à 8 à l'étage, piliers et murs aux deux étages, à plus de 150 unités des fenêtres : à adapter si le propriétaire décide d'autres nombres).

## Positions (lot 5k)
| id | étage | support | source (px) | sens | face (unités) | portée sûre | couverte |
|---|---|---|---|---|---|---|---|
| lampe-r1 | rdc | pilier-1 | 92, 85 | s | 1260, 1242,5 | 120 | oui |
| lampe-r2 | rdc | mur-2 | 134, 196 | o | 1470, 1780 | 120 | oui |
| lampe-r3 | rdc | pilier-4 | 92, 255 | s | 1260, 2092,5 | 120 | oui |
| lampe-r4 | rdc | pilier-10 | 198, 228 | s | 1790, 1957,5 | 120 | oui |
| lampe-r5 | rdc | pilier-8 | 198, 313 | e | 1807,5, 2365 | 120 | oui |
| lampe-r6 | rdc | mur-interieur-3 | 295, 256 | e | 2275, 2080 | 120 | non |
| lampe-r7 | rdc | mur-5 | 388, 232 | s | 2740, 1960 | 120 | non |
| lampe-r8 | rdc | mur-6 | 462, 280 | o | 3110, 2200 | 120 | non |
| lampe-r9 | rdc | mur-7 | 396, 348 | n | 2780, 2540 | 120 | non |
| lampe-u1 | étage | pilier-1 | 83, 83 | s | 1215, 1232,5 | 236 | — |
| lampe-u2 | étage | mur-2 | 134, 170 | o | 1470, 1650 | 191 | — |
| lampe-u3 | étage | pilier-4 | 83, 253 | e | 1232,5, 2065 | 187 | — |
| lampe-u4 | étage | mur-7 | 100, 332 | n | 1300, 2460 | 225 | — |
| lampe-u5 | étage | mur-interieur-2 | 142, 256 | e | 1510, 2080 | 189 | — |
| lampe-u6 | étage | pilier-6 | 198, 312 | s | 1790, 2377,5 | 195 | — |
| lampe-u7 | étage | pilier-5 | 231, 264 | o | 1937,5, 2120 | 131 | — |

Zones laissées sombres : milieu de l'aile (F2, F3), sud-ouest de la pièce de l'escalier de l'aile, sud-ouest de la grande salle (F8, F6), est de la salle (F5) ; à l'étage, abords des fenêtres et des deux trous d'escalier. Aucune lampe à moins de 150 unités d'une fenêtre (prudence visuelle : pas de flamme vive là où surgissent les zombies). Changement par rapport au plan de la partie A : `lampe-u5` déplacée (mur-interieur-2 au lieu de mur-3 : à 133 unités de U5, et portée réduite à 88 par le rez-de-chaussée visible juste derrière).

## Ombres et feux (lot 5k-G, retours du propriétaire après fusion)
- **Ombres cohérentes avec la lumière** : en Dynamique, la lune est réduite par `lune` et ne projette plus d'ombre ; les grands maillages fusionnés du décor (meubles, piliers, décor extérieur) cessent d'en projeter (chacun coûterait six passes de carte cubique) ; les « Ombres des lumières » (option, 0, 1 ou 2 ; Élevé : 1) lumières les plus proches projettent des ombres (carte cubique de `ombres.taille`, mise à jour seulement quand elles éclairent) à partir de **volumes simplifiés** : pour chaque source intérieure, les boîtes des murs, piliers et meubles à sa portée (invisibles, ni couleur ni profondeur), plus les volumes d'ombre des personnages. Les murs arrêtent donc la lumière de ces sources. Hors Dynamique : ombres de la lune comme avant.
- **Feux** : les feux intérieurs (`feux.json`, sur leur pièce de mobilier ; `lampes.world.json` → `feux`, portée sûre calculée par `npm run carte`) et extérieurs à flammes (voiture en flammes, bidons ; portée sous l'étage) sont des sources comme les lampes, couleur `--game-fire-edge`, réglages `feux` de `lumieres.json` (intensité, portée, vacillement borné). La fumée seule de l'hélicoptère n'éclaire pas.
- **Budget** (Élevé, Dynamique, 1 ombre) : moins qu'avant le lot, la passe d'ombre de la lune disparaissant (U4 71 appels, 35 883 triangles ; pire cas U4 du sang 41 183).

## Régler la lumière (`data/game/lumieres.json`, mode Éclairage seulement)
- `ambiance` (0 à 1) : facteur de la lumière ambiante ; `lune` (0 à 1, lot 5k-G) : facteur de la lune (sans ses ombres en Dynamique). Plus bas = zones plus sombres. `plancherAmbiance` (0,05 à 1) : la lumière ambiante ne descend jamais sous ce facteur (jamais le noir complet). Effet : ambiante × max(ambiance, plancher), lune × lune. Valeurs du lot 5k-G : 0,3, 0,2 et 0,15 (plus sombre loin des lampes, retour du propriétaire) ; `ombres` (`taille` 128, 256 ou 512 ; `biais`) ; `feux` (`intensite`, `distance`, `vacillement`).
- `intensite` (candela, lumières physiques de Three.js), `distance` (portée, jamais au-delà de la portée sûre de chaque lampe, 120 au rez-de-chaussée), `decroissance` (1 : douce ; 2 : physique, plus courte), `fondu` (secondes d'entrée et de sortie d'une lampe), `vacillement` (`amplitude` ≤ 0,15 et `frequences` ≤ 1,4 Hz, bornées par le code), `distanceActivation` (au-delà, une lampe n'est jamais choisie), `max` (repli du nombre de lumières).
- Couleurs : jetons `--game-lamp-*` de `css/tokens.css` (`--game-lamp-light` : couleur de la lumière).
- Après un changement : `npm test` (valeurs lues telles quelles), regarder sur `…/dev/jeu.html?lum=eclairage`, et rejouer la mesure de lisibilité (`Docs/lots/lot-5k.md`).

## Choix technique
- **Décor** : un maillage par étage (rez-de-chaussée dans le groupe `rdc`, étage dans `etage`), une matière Lambert à couleurs de sommet dont la flamme est émissive (attribut `aGlow`, `onBeforeCompile`) : +1 appel au rez-de-chaussée, +2 au plus à l'étage ; sans ombre ; créés une fois ; **seules les lampes dans le champ sont dessinées** (indices réécrits quand la liste change ; maillage caché s'il n'y en a aucune), et une lampe du rez-de-chaussée « couverte » par le sol de l'étage n'est pas dessinée quand l'étage est affiché (le pire cas du budget, U4 avec le sang à pleine charge, était à 159 triangles de la limite de 45 000).
- **Lumières** : N `PointLight` toujours présentes (intensité nulle si inutilisées : le nombre de lumières, donc les programmes, ne change jamais en partie), sans ombre, dans la scène ; à chaque image, les lampes de l'étage affiché dont la sphère de lumière touche le champ, les N plus proches du joueur ; une lampe garde son emplacement ; entrée et sortie en `fondu` ; vacillement en temps de jeu, coupé sous `prefers-reduced-motion`. Changement de mode ou de nombre : programmes recompilés une fois, préchauffés aussitôt (`renderer.compile`).
- **Étage superposé** : la lumière de Three.js est nulle au-delà de sa portée. Une lampe du rez-de-chaussée a une portée < 180 − hauteur de sa lumière (jamais l'étage, même pendant la montée) ; une lampe de l'étage a une portée inférieure à sa distance aux trous des escaliers et aux parties du rez-de-chaussée visibles d'en haut (calcul de `npm run carte`) ; au changement d'étage, les lumières de l'autre étage s'éteignent aussitôt. Test : pixels du rez-de-chaussée vus par le trou de l'escalier identiques avec et sans les lampes de l'étage (`?test=1&lampgain=0`).
- **Matières sans éclairage** : taches et particules de sang (Basic) assombries du facteur de l'ambiante en Éclairage ; laser, balles, flash, lampe frontale, flammes, fumées et brume restent émissifs ; la jupe sombre sous l'étage reste sombre. Mur percé : Lambert, éclairé normalement.
- **Lumière à travers les murs** : aucune ombre ; la lumière est placée 16 unités devant le support, l'autre côté d'un mur en reçoit nettement moins. Idée : ombre des lampes.
