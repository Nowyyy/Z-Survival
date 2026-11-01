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

## Non intégrés

- `reparation-coup` (`planche-coup`) : facultatif selon la fiche : seulement si la réparation est jouée coup par coup ; la réparation est jouée d'un seul tampon à la durée de pose.
- `planche-chute` (`planche-chute`) : aucun événement « planche qui tombe sans arrachage » dans le jeu (pas de débris projeté ni de porte qui bouscule une planche).
- `interface-achat` (`interface-achat`) : la boutique (lot 5) n'existe pas encore : aucun événement d'achat.
- `joueur-souffle-terre` (`joueur-chute`) : choix « actuel » : le son du jeu reste.
- `joueur-relevage` (`joueur-releve`) : choix « actuel » : le son du jeu reste.
- `ambiance-neon` (`ambiance-neon`) : choix « aucun » (pas de néon dans le jeu).
- `joueur-essouffle` (`joueur-essouffle`) : choix « aucun » (pas de sprint).
- `interface-piece` (`interface-piece`) : choix « aucun » (pas de pièce ramassée).

Total des sons de l'atelier intégrés : 6 543 800 octets (6,24 Mo), mémoire décodée estimée identique (mono). Aucun plafond de poids (décision du propriétaire).
