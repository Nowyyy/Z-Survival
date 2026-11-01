# Sons actuels : inventaire mesuré (lot 3h)

Mesures faites en Node par `node scripts/sons/inventaire.mjs` (rendu de `data/game/sounds.json` avec `js/core/synth.js`, lecture seule) et `js/core/audio-analysis.js`. **Aucun son n'a été écouté par l'agent** : ce document donne des chiffres, pas un jugement d'oreille. Valeurs moyennes sur les variantes de chaque son.

**Format des tampons du jeu** : Float32 (4 octets par échantillon), mono, fréquence propre à chaque recette (44 100 Hz : tir, douille, impacts, pas du joueur, interface ; 22 050 Hz : voix, pas des zombies, planches, joueur, ambiance, annonces). **Référence** (sur `main`, cette machine) : 28 recettes, **65 tampons**, **6 894 612 octets (6,58 Mo, limite 8 Mo)**, rendu de tous les sons en Node **1 333 à 1 468 ms** (dont essentiels 786 à 839 ms ; quatre mesures sur machine au repos ; 1 881 à 1 987 ms quand la suite Playwright tournait en même temps ; le lot 3 mesurait 1 329 ms et 811 ms).

**Définitions** : niveau relatif au tir = niveau court (RMS de la fenêtre de 100 ms la plus forte) + gain de la catégorie du jeu (`audio.json`) − niveau court du tir (−4,55 dBFS) : l'écart tel que le joueur l'entend, avant distance et étouffement. Centroïde pondéré par l'amplitude (cases à plus de 60 dB sous la plus forte ignorées). Pic = maximum du spectre moyen. f0 par une méthode de type YIN (40 à 400 Hz). HNR par l'autocorrélation normalisée. Voix : le jeu lit le même tampon pour les quatre types à la hauteur `zombieRate` (grand 0,82, marcheur 1, voûté 1,12, petit 1,35) : fréquences × hauteur et durée ÷ hauteur dans le tableau.

## Emplacements à refaire

| Emplacement | Son actuel (variantes, Hz) | Durée s | Ko | Niveau rel. tir dB (cible) | Centroïde Hz (cible) | Pic Hz | f0 Hz (cible) | > 4 kHz % | HNR dB |
|---|---|---|---|---|---|---|---|---|---|
| `pas-joueur-dur` | `pas` (4, 44100) | 0,22 | 152 | -25,5 (-18) | 7446 (350-1100) | 129 | – | 4,2 | – |
| `pas-joueur-exterieur` | `pas` (4, 44100) | 0,22 | 152 | -25,5 (-20) | 7446 (250-800) | 129 | – | 4,2 | – |
| `pas-joueur-escalier` | `pas` (4, 44100) | 0,22 | 152 | -25,5 (-18) | 7446 (350-1100) | 129 | – | 4,2 | – |
| `pas-zombie-lent` | `pas-zombie` (2, 22050) | 0,40 | 69 | -17,3 (-16) | 766 (200-700) | 65 | – | 0,0 | – |
| `pas-zombie-marche` | `pas-zombie` (2, 22050) | 0,40 | 69 | -17,3 (-16) | 766 (200-700) | 65 | – | 0,0 | – |
| `pas-zombie-course` | `pas-zombie` (2, 22050) | 0,40 | 69 | -17,3 (-16) | 766 (200-700) | 65 | – | 0,0 | – |
| `zombie-rampe` | aucun | – | – | – (-18) | – (250-900) | – | – | – | – |
| `voix-marcheur-errance` | `zombie-gemissement` (3, 22050) | 1,60 | 413 | -11,0 (-10) | 917 (300-1100) | 470 | 119 (75-110) | 0,0 | 9,6 |
| `voix-marcheur-attaque` | `zombie-attaque` (3, 22050) | 0,70 | 181 | -12,2 (-8) | 1245 (300-1100) | 580 | 143 (75-160) | 0,1 | 1,8 |
| `voix-marcheur-touche` | `zombie-blessure` (3, 22050) | 0,45 | 116 | -12,2 (-10) | 954 (300-1100) | 607 | 146 (80-175) | 0,0 | 5,7 |
| `voix-marcheur-mort` | `zombie-mort` (2, 22050) | 1,50 | 258 | -13,8 (-10) | 1135 (300-1100) | 511 | 109 (55-120) | 0,1 | 2,0 |
| `voix-petit-errance` | `zombie-gemissement` × 1,35 (3, 22050) | 1,19 | 413 | -11,0 (-10) | 1238 (500-1600) | 634 | 161 (110-180) | 0,0 | 9,6 |
| `voix-petit-attaque` | `zombie-attaque` × 1,35 (3, 22050) | 0,52 | 181 | -12,2 (-8) | 1681 (500-1600) | 782 | 193 (110-260) | 0,1 | 1,8 |
| `voix-petit-touche` | `zombie-blessure` × 1,35 (3, 22050) | 0,33 | 116 | -12,2 (-10) | 1288 (500-1600) | 819 | 196 (115-290) | 0,0 | 5,7 |
| `voix-petit-mort` | `zombie-mort` × 1,35 (2, 22050) | 1,11 | 258 | -13,8 (-10) | 1532 (500-1600) | 690 | 147 (85-200) | 0,1 | 2,0 |
| `voix-voute-errance` | `zombie-gemissement` × 1,12 (3, 22050) | 1,43 | 413 | -11,0 (-10) | 1027 (400-1300) | 526 | 133 (85-125) | 0,0 | 9,6 |
| `voix-voute-attaque` | `zombie-attaque` × 1,12 (3, 22050) | 0,62 | 181 | -12,2 (-8) | 1394 (400-1300) | 649 | 160 (85-180) | 0,1 | 1,8 |
| `voix-voute-touche` | `zombie-blessure` × 1,12 (3, 22050) | 0,40 | 116 | -12,2 (-10) | 1068 (400-1300) | 679 | 163 (90-200) | 0,0 | 5,7 |
| `voix-voute-mort` | `zombie-mort` × 1,12 (2, 22050) | 1,34 | 258 | -13,8 (-10) | 1271 (400-1300) | 572 | 122 (65-140) | 0,1 | 2,0 |
| `voix-grand-errance` | `zombie-gemissement` × 0,82 (3, 22050) | 1,95 | 413 | -11,0 (-8) | 752 (250-900) | 385 | 98 (55-80) | 0,0 | 9,6 |
| `voix-grand-attaque` | `zombie-attaque` × 0,82 (3, 22050) | 0,85 | 181 | -12,2 (-6) | 1021 (250-900) | 475 | 117 (55-115) | 0,1 | 1,8 |
| `voix-grand-touche` | `zombie-blessure` × 0,82 (3, 22050) | 0,55 | 116 | -12,2 (-8) | 782 (250-900) | 497 | 119 (60-130) | 0,0 | 5,7 |
| `voix-grand-mort` | `zombie-mort` × 0,82 (2, 22050) | 1,83 | 258 | -13,8 (-8) | 931 (250-900) | 419 | 89 (40-90) | 0,1 | 2,0 |
| `planche-arrachage` | `planche-arrachee` (3, 22050) | 0,50 | 129 | -9,8 (-12) | 2656 (600-2500) | 94 | – | 3,0 | – |
| `reparation` | `planche-posee` (3, 22050) | 0,45 | 116 | -14,0 (-12) | 1292 (700-3000) | 355 | – | 0,2 | – |
| `reparation-coup` | aucun | – | – | – (-12) | – (700-3000) | – | – | – | – |
| `planche-craquement` | aucun | – | – | – (-14) | – (400-2000) | – | – | – | – |
| `planche-chute` | aucun | – | – | – (-12) | – (300-1800) | – | – | – | – |
| `escalade` | aucun | – | – | – (-14) | – (250-1500) | – | – | – | – |
| `joueur-souffle-terre` | `joueur-chute` (2, 22050) | 1,30 | 224 | -2,8 (-10) | 438 (300-1500) | 79 | 66 (90-170) | 0,0 | 10,5 |
| `joueur-relevage` | `joueur-releve` (2, 22050) | 0,80 | 138 | -9,6 (-12) | 1923 (250-1500) | 110 | 0 | 1,3 | -5,7 |

## Ce qui sonne faux, d'après les mesures

- **Pas du joueur (`pas`)** : un seul son pour tous les sols, à 44 100 Hz ; centroïde **7 446 Hz** (cible 350 à 1 100), rolloff à 85 % **16 758 Hz**, attaque **1,7 ms** (cible 5 à 25 ms) et centroïde des 30 premières ms **5 372 Hz** : un claquement très large bande (bruit blanc passe-haut à 1,5 kHz, bruit rose à 4,2 kHz, partiel à 3,1 kHz) posé sur un sinus 210 → 110 Hz qui s'éteint en 18 ms ; 88 % de l'énergie est sous 200 Hz mais rien entre les deux (aucun mode du sol, aucun frottement). Niveau entendu −25,5 dB sous le tir (cible −18).
- **Pas des zombies (`pas-zombie`)** : un seul son pour les trois allures, 0,40 s (cible 0,12 à 0,26 s pour la marche), pic à **65 Hz**, 95,6 % de l'énergie sous 200 Hz ; la rampe est muette (`silentGaits`).
- **Voix** : source en dents de scie et **trois formants** (`synth.js`), **aucun sous-harmonique** (énergie à f0/2 : 0 à 2,6 % de celle de f0), f0 de base **109 à 146 Hz** : le grand, lu à 0,82, reste à **98 Hz** en errance (cible 55 à 80) et le marcheur à **119 Hz** (cible 75 à 110) ; HNR **1,8 dB** (attaque) à **9,6 dB** (errance) : l'attaque est surtout du bruit, l'errance est propre. Les quatre types ne diffèrent que par la vitesse de lecture (même timbre transposé, durées changées).
- **Planche arrachée (`planche-arrachee`)** : pic spectral à **94 Hz** (sinus 200 → 90 Hz) et 69,5 % de l'énergie sous 200 Hz ; attaque **0,3 ms** ; les « bois » sont des bruits filtrés et une scie 800 → 1 600 Hz, **aucun résonateur de bois** (cible : modes entre 150 et 900 Hz).
- **Réparation (`planche-posee`)** : trois coups de **sinus 420 → 260 Hz** (pic 355 Hz) + bruit passe-bas à 1,8 kHz, toujours **0,45 s** quelle que soit la durée réelle de réparation (1,8 s au niveau 0) ; **aucune pointe métallique** (énergie au-dessus de 4 kHz : 0,2 %, cible : pointe de 2 à 5 kHz de moins de 40 ms).
- **Chute du joueur (`joueur-chute`)** : un coup sourd (sinus 90 → 45 Hz, 99 % sous 200 Hz) et un souffle rose, **pas de voix** (la « f0 » de 66 Hz est celle du sinus) ; niveau −2,8 dB sous le tir. **Relevage (`joueur-releve`)** : bruit rose montant et pas lourd, sans voix (HNR −5,7 dB).
- **Sans son aujourd'hui** : frottement du rampant, craquement d'une planche qui cède, chute d'une planche arrachée, coup de marteau seul, escalade d'une fenêtre.

## Références (inchangées, jouables dans l'atelier)

| Son | Durée s | Crête dBFS | RMS dBFS | Niveau rel. tir dB | Centroïde Hz | Pic Hz |
|---|---|---|---|---|---|---|
| `tir` (3 variantes, 44 100 Hz) | 0,75 | −0,3 | −10,9 | 0,0 (niveau court −4,55 dBFS) | 4 480 | 40 |
| `vague-annonce` (mélodie de début de manche, 3) | 3,80 | −1,5 | −18,4 | −7,9 | 1 498 | 53 |
| `vague-renforcee` (2) | 4,20 | −1,9 | −14,6 | −9,0 | 973 | 49 |
| `vague-fin` (2) | 1,40 | −5,5 | −20,4 | −13,4 | 534 | 279 |
| `douille` (2) | 0,55 | −4,7 | −24,0 | −12,7 | 6 259 | 4 154 |
| `impact-bois` / `-metal` / `-pierre` / `-voiture` / `-zombie` | 0,40 à 0,70 | −3,2 à −1,2 | −25,0 à −18,6 | −15,9 à −10,0 | 672 à 8 232 | 91 à 2 066 |
