# Sons intégrés au jeu (lot 3i)

Généré par `node scripts/sons/lister-integres.mjs` d'après `data/game/sounds-choix.json` (source : `Docs/ref/sons-a-integrer.md`). **Aucun son n'a été écouté par l'agent** : mesures seules (Node, Float32 mono, 22 050 Hz pour l'atelier). Octets : toutes les versions (graines), 4 octets par échantillon ; « avant » : recette remplacée (`data/game/sounds-legacy.json`, `?sons=ancien`). Niveau : dB relatifs au tir tel qu'entendu en jeu (niveau court + gain de catégorie − niveau court du tir), version 1 ; les voix d'avant étaient lues à la hauteur du type (non comptée ici).

| Emplacement | Identifiant du jeu | Variante (réglages) | Versions | Octets (avant) | Durée s (avant) | Centroïde Hz (avant) | Niveau dB / cible (avant) | Événement |
|---|---|---|---|---|---|---|---|---|
| `pas-joueur-dur` | `pas` | C (hauteur -3) | 4 | 35 280 (155 232) | 0,10 (0,22) | 1 572 (7 740) | -20,5 / -18 (-25,7) | playerStep sur sol dur (intérieur), non spatialisé ; « 4 versions » (fiche) |
| `pas-zombie-marche` | `pas-zombie` | A (ampleur 0,10) | 3 | 52 920 (70 560) | 0,20 (0,40) | 2 011 (748) | -18,2 / -16 (-17,6) | pas d'un zombie à l'allure « marche » (3 plus proches, à moins de 450) ; « 3 versions » (fiche) |
| `voix-marcheur-errance` | `zombie-gemissement` | C (par défaut) | 5 | 562 280 (423 360) | 1,28 (1,60) | 753 (898) | -10,0 / -10 (-10,4) | voix d'errance du marcheur (zombie-voice.js, type gemissement), lue à la hauteur 1 |
| `voix-petit-errance` | `zombie-gemissement-petit` | C (par défaut) | 5 | 404 840 | 0,92 | 841 | -10,0 / -10 | voix d'errance du petit, lue à la hauteur 1 |
| `voix-voute-errance` | `zombie-gemissement-voute` | C (par défaut) | 5 | 562 280 | 1,28 | 1 143 | -10,0 / -10 | voix d'errance du voûté, lue à la hauteur 1 |
| `voix-grand-errance` | `zombie-gemissement-grand` | C (par défaut) | 5 | 562 280 | 1,28 | 720 | -8,5 / -8 | voix d'errance du grand, lue à la hauteur 1 |
| `voix-marcheur-attaque` | `zombie-attaque` | C (hauteur -6, duree 0,70) | 5 | 173 640 (185 220) | 0,39 (0,70) | 791 (1 258) | -8,9 / -8 (-13,1) | cri d'attaque du marcheur au contact (zombieAttack) |
| `voix-petit-attaque` | `zombie-attaque-petit` | C (par défaut) | 5 | 178 600 | 0,40 | 1 047 | -8,0 / -8 | cri d'attaque du petit (zombieAttack) |
| `voix-voute-attaque` | `zombie-attaque-voute` | C (par défaut) | 5 | 248 060 | 0,56 | 1 229 | -8,4 / -8 | cri d'attaque du voûté (zombieAttack) |
| `voix-grand-attaque` | `zombie-attaque-grand` | C (par défaut) | 5 | 248 060 | 0,56 | 808 | -7,7 / -6 | cri d'attaque du grand (zombieAttack) |
| `voix-marcheur-touche` | `zombie-blessure` | B (hauteur -5, ampleur 0,30) | 5 | 169 340 (119 076) | 0,38 (0,45) | 735 (955) | -10,0 / -10 (-12,6) | marcheur touché sans mourir (zombieHit, killed: false), à l'impact |
| `voix-petit-touche` | `zombie-blessure-petit` | C (par défaut) | 5 | 76 200 | 0,17 | 864 | -10,0 / -10 | petit touché sans mourir (zombieHit) |
| `voix-voute-touche` | `zombie-blessure-voute` | C (par défaut) | 5 | 105 840 | 0,24 | 1 077 | -10,0 / -10 | voûté touché sans mourir (zombieHit) |
| `voix-grand-touche` | `zombie-blessure-grand` | C (par défaut) | 5 | 105 840 | 0,24 | 665 | -8,7 / -8 | grand touché sans mourir (zombieHit) |
| `voix-marcheur-mort` | `zombie-mort` | C (par défaut) | 5 | 496 120 (264 600) | 1,12 (1,50) | 720 (1 140) | -10,0 / -10 (-13,4) | mort du marcheur (zombieHit, killed: true) |
| `voix-petit-mort` | `zombie-mort-petit` | C (hauteur 3) | 5 | 357 220 | 0,81 | 911 | -10,0 / -10 | mort du petit (zombieHit, killed: true) |
| `voix-voute-mort` | `zombie-mort-voute` | C (par défaut) | 5 | 496 120 | 1,12 | 1 182 | -10,0 / -10 | mort du voûté (zombieHit, killed: true) |
| `voix-grand-mort` | `zombie-mort-grand` | C (par défaut) | 5 | 496 120 | 1,12 | 683 | -9,5 / -8 | mort du grand (zombieHit, killed: true) |
| `planche-arrachage` | `planche-arrachee` | A (ampleur 0,10) | 5 | 418 960 (132 300) | 0,95 (0,50) | 1 662 (2 629) | -12,0 / -12 (-10,4) | un zombie arrache une planche (plankTorn), traverse l'ouverture, 120 ms par fenêtre |
| `reparation` | `planche-posee` | C (duree 1,80) | 5 | 793 800 (119 076) | 1,80 (0,45) | 1 045 (1 240) | -14,1 / -12 (-13,7) | début de la pose d'une planche (plankRepairStart), durée = temps de pose (statistique reparation), arrêt si la pose est interrompue |
| `pas-joueur-exterieur` | `pas-exterieur` | A (ampleur 0,10) | 5 | 70 560 | 0,16 | 554 | -20,0 / -20 | playerStep dehors (hors des pièces de l'étage du joueur) |
| `pas-joueur-escalier` | `pas-escalier` | C (hauteur -3) | 5 | 44 100 | 0,10 | 1 812 | -20,2 / -18 | playerStep dans un escalier (marche de stair-walk.js) |
| `pas-zombie-lent` | `pas-zombie-lent` | A (ampleur 0,10) | 5 | 132 300 | 0,30 | 2 279 | -17,7 / -16 | pas d'un zombie à l'allure « lent » (même logique que pas-zombie) |
| `pas-zombie-course` | `pas-zombie-course` | A (ampleur 0,10) | 5 | 66 160 | 0,15 | 1 686 | -18,0 / -16 | pas d'un zombie à l'allure « course » (délai minimal 0,06 s) |
| `zombie-rampe` | `zombie-rampe` | B (ampleur 0,30) | 5 | 441 000 | 1,00 | 566 | -18,0 / -18 | frottement d'un zombie rampant : un par cycle de foulée, 2 plus proches au plus |
| `planche-craquement` | `planche-craquement` | A (ampleur 0,10) | 5 | 374 860 | 0,85 | 1 888 | -14,0 / -14 | la dernière planche d'une fenêtre cède (plankTorn qui ouvre la fenêtre), traverse l'ouverture |
| `escalade` | `zombie-escalade` | C (par défaut) | 5 | 463 060 | 1,05 | 2 158 | -14,0 / -14 | un zombie commence à franchir la fenêtre (mode escalade de siege.js), à la position de la fenêtre |
| `joueur-coeur` | `joueur-coeur` | B (ampleur 0,20) | 1 | 141 120 | 1,60 | 65 | -14,0 / -14 | vie ≤ 25 % (exemple de la fiche), relancé toutes les 1,6 s, arrêté à terre et à la mort ; non spatialisé |
| `ambiance-vent` | `ambiance-vent` | A (ampleur 0,10) | 1 | 882 000 | 10,00 | 675 | -26,2 / -24 | boucle de 10 s, fond constant faible (option de la fiche), une seule voix, arrêtée à la pause, à la mort et à « Rejouer » |
| `ambiance-grincements` | `ambiance-grincements` | B (ampleur 0,20) | 2 | 617 400 | 3,50 | 363 | -22,1 / -22 | au hasard toutes les 20 à 60 s, position au hasard dans le bâtiment (murs de l'étage du joueur) |
| `ambiance-lointains` | `ambiance-lointains` | B (ampleur 0,20) | 2 | 670 320 | 3,80 | 567 | -24,0 / -24 | une fois par pause entre les manches, après « Vague N terminée » (waveEnd) ; non spatialisé |
| `ambiance-feu` | `ambiance-feu` | B (ampleur 0,20) | 1 | 705 600 | 8,00 | 1 609 | -22,4 / -22 | boucle de 8 s au feu de décor le plus proche (feux.json), une seule voix |
| `porte-enfoncee` | `porte-enfoncee` | A (ampleur 0,10) | 1 | 105 840 | 1,20 | 217 | -8,0 / -8 | le bloc d'une porte s'enfonce à l'ouverture d'une zone (doorOpen), à la position de la porte |
| `impact-chair` | `impact-zombie` | A (ampleur 0,05) | 5 | 70 560 (211 680) | 0,16 (0,40) | 556 (5 097) | -10,0 / -10 (-10,3) | une balle touche un zombie (zombieHit, blessure ou mort), à l'impact ; remplace l'ancien impact-zombie (« cling ») sous son identifiant : le directeur de sons ne change pas. Lot 5a : variante A par défaut, ?sons=A|B|C pour comparer, ?sons=ancien pour l'ancien |

## Non intégrés

- `reparation-coup` (`planche-coup`) : facultatif selon la fiche : seulement si la réparation est jouée coup par coup ; la réparation est jouée d'un seul tampon à la durée de pose.
- `planche-chute` (`planche-chute`) : aucun événement « planche qui tombe sans arrachage » dans le jeu (pas de débris projeté ni de porte qui bouscule une planche).
- `interface-achat` (`interface-achat`) : la boutique (lot 5) n'existe pas encore : aucun événement d'achat.
- `joueur-souffle-terre` (`joueur-chute`) : choix « actuel » : le son du jeu reste.
- `joueur-relevage` (`joueur-releve`) : choix « actuel » : le son du jeu reste.
- `ambiance-neon` (`ambiance-neon`) : choix « aucun » (pas de néon dans le jeu).
- `joueur-essouffle` (`joueur-essouffle`) : choix « aucun » (pas de sprint).
- `interface-piece` (`interface-piece`) : choix « aucun » (pas de pièce ramassée).

Total des sons de l'atelier intégrés : 11 328 680 octets (10,80 Mo), mémoire décodée estimée identique (mono). Aucun plafond de poids (décision du propriétaire).
