# Atelier des sons (lot 3h)

Page technique `atelier-sons.html` : comparer les sons actuels du jeu et de nouvelles variantes synthétisées, les régler, noter ses choix. **Rien n'est intégré au jeu** (lot 3i). **Aucun son n'a été écouté par l'agent** : ce document donne des recettes et des mesures ; le jugement d'oreille appartient au propriétaire.

## Fichiers
- `js/core/audio-analysis.js` (mesures), `js/core/synth2.js`, `synth2-dsp.js`, `synth2-sources.js` (synthèse), `js/core/atelier-check.js` (cibles), `atelier-choices.js` (« Mes choix »), `sound-cache.js` (cache de 24 Mo), `wave-svg.js` (oscillogramme) : purs, déterministes, sans Web Audio ni horloge.
- `data/game/sounds-atelier.json` (provisoire) : `targets`, `presets`, `slots` (variantes, macros), `references`, `levelRef`, `distinctness`, `page` (volume, limiteur, pas des curseurs).
- `atelier-sons.html`, `css/atelier-sons.css`, `js/atelier-sons/` (`main.js` interface, `player.js` Web Audio, `worker.js` + `render.js` calcul en arrière-plan), `data/i18n/atelier-sons.json` (textes, français seul : fichier séparé, lu par `translate` de `js/i18n.js` ; le test `data-i18n` ne lit que `fr.json` et `en.json`, son équivalent est dans `tests/unit/atelier-variantes.test.js`).

## Variantes
Chaque emplacement a trois variantes distinctes par intention : **A « réaliste sourd »** (grave et pression, voix peu éclatante : pente spectrale plus basse, moins de sous-harmonique et de rugosité), **B « horreur marquée »** (voix doublée désaccordée de 0,8 %, prise d'air inspirée, sous-harmonique × 1,15, rugosité × 1,1, souffle × 1,05, durée × 1,2, hauteur × 0,93 ; pas plus lourds et plus traînants ; planches plus graves et plus longues), **C « sec et proche »** (durée × 0,75, sans réverbération, passe-haut à 180 Hz et bosse de +7 dB à 1,1 kHz pour les voix, décroissances raccourcies pour les impacts). Cinq macros par variante (bornes et défaut dans les données) : `hauteur` (demi-tons, −6 à +6), `matiere` (octaves de brillance des filtres, −1 à +1), `grain` (facteur du bruit et de la rugosité, 0 à 2), `duree` (facteur 0,6 à 1,6 ; réparation : secondes, 0,4 à 1,8), `ampleur` (part de réverbération courte, 0 à 0,6 ; défaut A 0,1, B 0,3, C 0). Cinq versions par son (graines 1 à 5, tirage sans répétition immédiate).

**Distinction** : distance spectrale (`spectralDistance` : écart moyen, en dB, des profils en 24 bandes d'un tiers d'octave environ, bornés à −60 dB, divisé par 60). Seuil **0,035** (≈ 2,1 dB d'écart moyen par bande), fixé à 1,4 fois la **médiane des écarts entre deux versions d'une même variante (0,025)** : deux variantes doivent différer plus que deux tirages ordinaires d'une même variante. Mesuré (priorité 1) : minimum 0,038, 10e centile 0,048, médiane 0,084 ; versions d'une même variante : médiane 0,023, 90e centile 0,046, maximum 0,106.

## Mesures des variantes de la priorité 1 (version 1, macros par défaut)
Niveau / tir : niveau court (RMS de la fenêtre de 100 ms la plus forte) + gain de la catégorie du jeu − niveau court du tir ; tolérance ±3 dB. Dernière colonne : versions 2 à 5 hors d'une borne (la cible est exigée de la version 1, les autres sont rapportées). **92 des 93 variantes par défaut sont dans leurs cibles** ; la 93e, `voix-petit-attaque` B, est marquée `outOfTarget` dans les données (HNR 5,7 dB pour 6 à 14 : le jitter minimal de 2 % exigé pour les voix, la voix doublée, la prise d'air et la saturation de B donnent trop de bruit sur une voix aiguë ; trois réglages essayés : 5,26 -> 5,71 dB) ; 12 versions sur 372 sortent d'une borne, de peu : HNR de 5,0 à 5,9 dB pour un minimum de 6 (6 versions), centroïde 195 à 567 Hz pour un minimum de 200 à 600 selon l'emplacement (4), pic à 263 Hz pour un maximum de 250 (1), attaque de 5,0 ms arrondie sous 5 (1).

| Emplacement | Var. | Durée s | Centroïde Hz | f0 Hz | Pic Hz | > 4 kHz % | Crête dBFS | RMS dBFS | Niveau / tir dB (cible) | Écart dB | Rendu ms | Hors cible (graines 2 à 5) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `pas-joueur-dur` | A | 0,15 | 418 | – | 184 | 0,00 | −3,3 | −15,1 | −18,0 (−18) | 0,0 | 52 | 0/4 |
| `pas-joueur-dur` | B | 0,18 | 399 | – | 185 | 0,00 | −4,5 | −15,7 | −18,0 (−18) | 0,0 | 6 | 0/4 |
| `pas-joueur-dur` | C | 0,11 | 452 | – | 223 | 0,00 | −4,4 | −13,8 | −18,0 (−18) | 0,0 | 3 | 1/4 (attackMs) |
| `pas-joueur-exterieur` | A | 0,16 | 554 | – | 129 | 0,00 | −4,6 | −17,4 | −20,0 (−20) | 0,0 | 3 | 0/4 |
| `pas-joueur-exterieur` | B | 0,20 | 565 | – | 107 | 0,00 | −6,3 | −17,9 | −20,0 (−20) | 0,0 | 7 | 0/4 |
| `pas-joueur-exterieur` | C | 0,12 | 537 | – | 160 | 0,00 | −6,0 | −16,2 | −20,0 (−20) | 0,0 | 2 | 0/4 |
| `pas-joueur-escalier` | A | 0,15 | 388 | – | 243 | 0,00 | −6,9 | −15,0 | −18,0 (−18) | 0,0 | 2 | 0/4 |
| `pas-joueur-escalier` | B | 0,19 | 383 | – | 216 | 0,00 | −6,5 | −15,8 | −18,0 (−18) | 0,0 | 2 | 2/4 (centroid) |
| `pas-joueur-escalier` | C | 0,11 | 399 | – | 252 | 0,00 | −5,6 | −13,8 | −18,0 (−18) | 0,0 | 2 | 0/4 |
| `pas-zombie-lent` | A | 0,30 | 398 | – | 121 | 0,00 | −3,2 | −15,5 | −16,0 (−16) | 0,0 | 5 | 0/4 |
| `pas-zombie-lent` | B | 0,34 | 351 | – | 98 | 0,00 | −3,5 | −16,0 | −16,0 (−16) | 0,0 | 4 | 0/4 |
| `pas-zombie-lent` | C | 0,20 | 372 | – | 134 | 0,00 | −3,3 | −13,5 | −16,0 (−16) | 0,0 | 3 | 0/4 |
| `pas-zombie-marche` | A | 0,22 | 300 | – | 113 | 0,00 | −3,0 | −14,7 | −16,4 (−16) | −0,4 | 2 | 0/4 |
| `pas-zombie-marche` | B | 0,26 | 258 | – | 101 | 0,00 | −3,7 | −14,6 | −16,0 (−16) | 0,0 | 3 | 0/4 |
| `pas-zombie-marche` | C | 0,15 | 282 | – | 128 | 0,00 | −3,4 | −13,2 | −16,0 (−16) | 0,0 | 2 | 0/4 |
| `pas-zombie-course` | A | 0,16 | 220 | – | 119 | 0,00 | −3,5 | −13,4 | −16,0 (−16) | 0,0 | 2 | 1/4 (centroid) |
| `pas-zombie-course` | B | 0,19 | 244 | – | 129 | 0,00 | −3,0 | −14,9 | −16,7 (−16) | −0,7 | 2 | 1/4 (peakHz) |
| `pas-zombie-course` | C | 0,12 | 229 | – | 139 | 0,00 | −3,8 | −12,2 | −16,0 (−16) | 0,0 | 1 | 0/4 |
| `zombie-rampe` | A | 0,80 | 703 | – | 73 | 0,00 | −5,5 | −19,8 | −18,0 (−18) | 0,0 | 36 | 0/4 |
| `zombie-rampe` | B | 1,00 | 566 | – | 70 | 0,00 | −6,2 | −19,0 | −18,0 (−18) | 0,0 | 16 | 0/4 |
| `zombie-rampe` | C | 0,55 | 869 | – | 68 | 0,00 | −3,7 | −18,8 | −18,0 (−18) | 0,0 | 6 | 0/4 |
| `voix-marcheur-errance` | A | 1,70 | 706 | 94 | 92 | 0,00 | −6,3 | −13,6 | −10,0 (−10) | 0,0 | 85 | 0/4 |
| `voix-marcheur-errance` | B | 2,04 | 763 | 89 | 87 | 0,01 | −4,8 | −13,7 | −10,0 (−10) | 0,0 | 88 | 0/4 |
| `voix-marcheur-errance` | C | 1,28 | 753 | 95 | 597 | 0,00 | −3,3 | −14,0 | −10,0 (−10) | 0,0 | 32 | 1/4 (hnr) |
| `voix-marcheur-attaque` | A | 0,75 | 812 | 106 | 109 | 0,01 | −4,7 | −11,2 | −8,0 (−8) | 0,0 | 10 | 0/4 |
| `voix-marcheur-attaque` | B | 0,90 | 893 | 100 | 103 | 0,02 | −4,1 | −11,7 | −8,0 (−8) | 0,0 | 17 | 0/4 |
| `voix-marcheur-attaque` | C | 0,56 | 867 | 107 | 657 | 0,00 | −3,0 | −12,0 | −8,3 (−8) | −0,3 | 7 | 1/4 (hnr) |
| `voix-marcheur-touche` | A | 0,32 | 696 | 106 | 109 | 0,00 | −7,0 | −14,5 | −10,0 (−10) | 0,0 | 4 | 0/4 |
| `voix-marcheur-touche` | B | 0,38 | 782 | 98 | 101 | 0,01 | −5,8 | −13,9 | −10,0 (−10) | 0,0 | 10 | 0/4 |
| `voix-marcheur-touche` | C | 0,24 | 742 | 108 | 549 | 0,00 | −3,9 | −14,2 | −10,0 (−10) | 0,0 | 4 | 0/4 |
| `voix-marcheur-mort` | A | 1,50 | 636 | 95 | 97 | 0,00 | −5,8 | −15,0 | −10,0 (−10) | 0,0 | 56 | 0/4 |
| `voix-marcheur-mort` | B | 1,80 | 698 | 85 | 81 | 0,01 | −5,5 | −14,8 | −10,0 (−10) | 0,0 | 58 | 0/4 |
| `voix-marcheur-mort` | C | 1,12 | 720 | 93 | 575 | 0,00 | −3,6 | −15,2 | −10,0 (−10) | 0,0 | 13 | 0/4 |
| `voix-petit-errance` | A | 1,22 | 773 | 145 | 725 | 0,00 | −5,9 | −14,3 | −10,0 (−10) | 0,0 | 25 | 0/4 |
| `voix-petit-errance` | B | 1,47 | 885 | 134 | 133 | 0,01 | −4,6 | −13,7 | −10,0 (−10) | 0,0 | 26 | 1/4 (hnr) |
| `voix-petit-errance` | C | 0,92 | 841 | 141 | 701 | 0,00 | −4,1 | −14,3 | −10,0 (−10) | 0,0 | 10 | 0/4 |
| `voix-petit-attaque` | A | 0,54 | 1004 | 166 | 833 | 0,02 | −4,9 | −12,2 | −8,0 (−8) | 0,0 | 7 | 0/4 |
| `voix-petit-attaque` | B | 0,65 | 1069 | 146 | 157 | 0,04 | −3,0 | −11,4 | −8,2 (−8) | −0,2 | 13 | HORS CIBLE |
| `voix-petit-attaque` | C | 0,40 | 1047 | 163 | 847 | 0,00 | −3,4 | −12,6 | −8,0 (−8) | 0,0 | 5 | 0/4 |
| `voix-petit-touche` | A | 0,23 | 841 | 163 | 679 | 0,00 | −4,8 | −14,0 | −10,0 (−10) | 0,0 | 3 | 0/4 |
| `voix-petit-touche` | B | 0,28 | 933 | 152 | 630 | 0,01 | −5,2 | −13,8 | −10,0 (−10) | 0,0 | 10 | 0/4 |
| `voix-petit-touche` | C | 0,17 | 864 | 166 | 677 | 0,00 | −3,4 | −13,4 | −10,0 (−10) | 0,0 | 2 | 0/4 |
| `voix-petit-mort` | A | 1,08 | 759 | 138 | 737 | 0,00 | −6,2 | −15,0 | −10,0 (−10) | 0,0 | 15 | 0/4 |
| `voix-petit-mort` | B | 1,30 | 863 | 128 | 793 | 0,02 | −4,6 | −14,4 | −10,0 (−10) | 0,0 | 24 | 0/4 |
| `voix-petit-mort` | C | 0,81 | 842 | 141 | 707 | 0,00 | −3,3 | −15,2 | −10,0 (−10) | 0,0 | 11 | 0/4 |
| `voix-voute-errance` | A | 1,70 | 935 | 100 | 106 | 0,04 | −6,5 | −13,2 | −10,0 (−10) | 0,0 | 45 | 0/4 |
| `voix-voute-errance` | B | 2,04 | 999 | 97 | 96 | 0,07 | −4,7 | −13,5 | −10,0 (−10) | 0,0 | 68 | 1/4 (hnr) |
| `voix-voute-errance` | C | 1,28 | 1143 | 109 | 661 | 0,08 | −4,6 | −14,3 | −10,0 (−10) | 0,0 | 21 | 0/4 |
| `voix-voute-attaque` | A | 0,75 | 1067 | 122 | 124 | 0,06 | −5,1 | −11,3 | −8,0 (−8) | 0,0 | 15 | 0/4 |
| `voix-voute-attaque` | B | 0,90 | 1099 | 115 | 118 | 0,08 | −4,1 | −11,7 | −8,0 (−8) | 0,0 | 51 | 1/4 (hnr) |
| `voix-voute-attaque` | C | 0,56 | 1229 | 126 | 676 | 0,09 | −3,0 | −11,8 | −8,4 (−8) | −0,4 | 20 | 0/4 |
| `voix-voute-touche` | A | 0,32 | 911 | 124 | 129 | 0,04 | −6,7 | −14,2 | −10,0 (−10) | 0,0 | 12 | 0/4 |
| `voix-voute-touche` | B | 0,38 | 1001 | 114 | 116 | 0,06 | −5,7 | −14,4 | −10,0 (−10) | 0,0 | 19 | 0/4 |
| `voix-voute-touche` | C | 0,24 | 1077 | 123 | 625 | 0,06 | −4,2 | −14,3 | −10,0 (−10) | 0,0 | 7 | 0/4 |
| `voix-voute-mort` | A | 1,50 | 941 | 108 | 110 | 0,06 | −5,6 | −14,5 | −10,0 (−10) | 0,0 | 41 | 0/4 |
| `voix-voute-mort` | B | 1,80 | 969 | 97 | 99 | 0,07 | −5,0 | −15,0 | −10,0 (−10) | 0,0 | 60 | 0/4 |
| `voix-voute-mort` | C | 1,12 | 1182 | 105 | 651 | 0,12 | −4,4 | −16,3 | −10,0 (−10) | 0,0 | 37 | 0/4 |
| `voix-grand-errance` | A | 1,70 | 623 | 65 | 65 | 0,00 | −4,0 | −11,3 | −8,0 (−8) | 0,0 | 55 | 0/4 |
| `voix-grand-errance` | B | 2,04 | 704 | 61 | 60 | 0,01 | −3,1 | −11,4 | −8,0 (−8) | 0,0 | 55 | 0/4 |
| `voix-grand-errance` | C | 1,28 | 720 | 69 | 69 | 0,00 | −3,0 | −12,6 | −8,5 (−8) | −0,5 | 31 | 0/4 |
| `voix-grand-attaque` | A | 0,75 | 830 | 80 | 82 | 0,02 | −3,0 | −9,1 | −6,1 (−6) | −0,1 | 15 | 0/4 |
| `voix-grand-attaque` | B | 0,90 | 795 | 74 | 74 | 0,02 | −3,0 | −10,3 | −7,1 (−6) | −1,1 | 28 | 0/4 |
| `voix-grand-attaque` | C | 0,56 | 808 | 78 | 80 | 0,01 | −3,0 | −10,9 | −7,7 (−6) | −1,7 | 16 | 1/4 (hnr) |
| `voix-grand-touche` | A | 0,32 | 564 | 74 | 76 | 0,00 | −4,0 | −12,0 | −8,0 (−8) | 0,0 | 7 | 0/4 |
| `voix-grand-touche` | B | 0,38 | 616 | 72 | 74 | 0,00 | −4,2 | −11,8 | −8,0 (−8) | 0,0 | 10 | 0/4 |
| `voix-grand-touche` | C | 0,24 | 665 | 79 | 81 | 0,00 | −3,0 | −12,6 | −8,7 (−8) | −0,7 | 8 | 0/4 |
| `voix-grand-mort` | A | 1,50 | 585 | 67 | 66 | 0,00 | −4,1 | −12,0 | −8,0 (−8) | 0,0 | 34 | 0/4 |
| `voix-grand-mort` | B | 1,80 | 651 | 63 | 61 | 0,01 | −3,4 | −12,1 | −8,0 (−8) | 0,0 | 41 | 0/4 |
| `voix-grand-mort` | C | 1,12 | 683 | 67 | 544 | 0,00 | −3,0 | −14,2 | −9,5 (−8) | −1,5 | 23 | 0/4 |
| `planche-arrachage` | A | 0,50 | 759 | – | 184 | 0,00 | −7,1 | −16,7 | −12,0 (−12) | 0,0 | 20 | 0/4 |
| `planche-arrachage` | B | 0,66 | 678 | – | 157 | 0,00 | −7,7 | −17,1 | −12,0 (−12) | 0,0 | 8 | 1/4 (centroid) |
| `planche-arrachage` | C | 0,32 | 804 | – | 228 | 0,00 | −6,4 | −17,5 | −12,0 (−12) | 0,0 | 3 | 0/4 |
| `reparation` | A | 1,80 | 2411 | – | 156 | 2,19 | −3,0 | −21,5 | −13,5 (−12) | −1,5 | 44 | 0/4 |
| `reparation` | B | 1,80 | 2646 | – | 140 | 1,30 | −3,0 | −19,8 | −12,2 (−12) | −0,2 | 19 | 0/4 |
| `reparation` | C | 1,80 | 2736 | – | 182 | 4,36 | −3,1 | −20,0 | −12,0 (−12) | 0,0 | 7 | 0/4 |
| `reparation-coup` | A | 0,20 | 836 | – | 165 | 0,02 | −3,0 | −16,6 | −12,4 (−12) | −0,4 | 2 | 0/4 |
| `reparation-coup` | B | 0,24 | 1539 | – | 139 | 0,15 | −3,4 | −17,1 | −12,0 (−12) | 0,0 | 2 | 0/4 |
| `reparation-coup` | C | 0,14 | 777 | – | 191 | 0,08 | −3,0 | −16,6 | −13,7 (−12) | −1,7 | 1 | 0/4 |
| `planche-craquement` | A | 0,70 | 674 | – | 215 | 0,00 | −9,0 | −18,8 | −14,0 (−14) | 0,0 | 7 | 0/4 |
| `planche-craquement` | B | 0,90 | 587 | – | 179 | 0,00 | −8,9 | −19,2 | −14,0 (−14) | 0,0 | 14 | 0/4 |
| `planche-craquement` | C | 0,45 | 731 | – | 240 | 0,00 | −7,2 | −17,6 | −14,0 (−14) | 0,0 | 6 | 0/4 |
| `planche-chute` | A | 0,75 | 367 | – | 220 | 0,00 | −6,7 | −20,0 | −12,0 (−12) | 0,0 | 11 | 0/4 |
| `planche-chute` | B | 0,95 | 346 | – | 194 | 0,00 | −7,3 | −21,1 | −12,0 (−12) | 0,0 | 13 | 0/4 |
| `planche-chute` | C | 0,50 | 416 | – | 255 | 0,00 | −6,4 | −19,8 | −12,0 (−12) | 0,0 | 5 | 0/4 |
| `escalade` | A | 1,50 | 503 | – | 194 | 0,00 | −9,3 | −22,2 | −14,0 (−14) | 0,0 | 31 | 0/4 |
| `escalade` | B | 1,90 | 444 | – | 167 | 0,00 | −9,7 | −24,1 | −14,0 (−14) | 0,0 | 32 | 0/4 |
| `escalade` | C | 1,05 | 515 | – | 231 | 0,00 | −6,2 | −22,5 | −14,0 (−14) | 0,0 | 12 | 0/4 |
| `joueur-souffle-terre` | A | 1,70 | 1057 | 111 | 462 | 0,05 | −8,2 | −21,2 | −10,0 (−10) | 0,0 | 41 | 0/4 |
| `joueur-souffle-terre` | B | 2,10 | 1143 | 98 | 107 | 0,06 | −5,7 | −21,9 | −10,0 (−10) | 0,0 | 55 | 0/4 |
| `joueur-souffle-terre` | C | 1,25 | 988 | 130 | 537 | 0,02 | −7,9 | −21,1 | −10,0 (−10) | 0,0 | 16 | 0/4 |
| `joueur-relevage` | A | 0,85 | 755 | – | 198 | 0,00 | −5,4 | −20,6 | −12,0 (−12) | 0,0 | 14 | 0/4 |
| `joueur-relevage` | B | 1,05 | 715 | – | 171 | 0,00 | −7,0 | −21,5 | −12,0 (−12) | 0,0 | 27 | 0/4 |
| `joueur-relevage` | C | 0,62 | 834 | – | 534 | 0,01 | −11,3 | −20,7 | −12,0 (−12) | 0,0 | 9 | 0/4 |

## Propositions (priorité 2 : 9 emplacements, 2 variantes)
Une phrase par proposition (texte de la page) : vent à travers les fenêtres (bruit filtré qui suit des rafales lentes et siffle dans les jours des planches, boucle de 10 s), grincements du bâtiment (collé-glissé lent dans des modes de bois), ronflement d'un néon (harmoniques de 100 Hz d'un ballast sur secteur à 50 Hz, boucle de 8 s), battement de cœur à faible vie (paires de coups très graves ; A 75 et B 112 battements par minute : variantes distinctes par le rythme, pas par la couleur), souffle essoufflé du joueur, gémissements lointains pendant les pauses (voix filtrées à 900 Hz), porte qui s'enfonce (grondement, raclement, choc : 1,2 s), pièce ramassée (lot 4) et achat (lot 5) : métal frappé, partiels inharmoniques. Les pas d'escalier sont en priorité 1 (`ETAGE` = oui). Cibles « agent » dans les données ; toutes tenues par la version 1.

**Boucles sans raccord** : le tampon est rendu avec 0,5 à 1 s de plus, la queue est enchaînée sur la tête (fondu à puissance constante : tampon circulaire continu), puis le point de bouclage est déplacé (`rotateToSeam`) là où le saut entre échantillons voisins est le plus petit parmi les points dont l'énergie des 50 ms de chaque côté est équilibrée à ±5 % (technique des échantillonneurs). Mesuré sur les cinq versions de chaque boucle : saut à la jonction ≤ 2,8 × 10⁻⁵ (critère < 0,002), rapport d’énergie de 0,95 à 1,04 (critère ±10 %). Le néon est périodique (100 Hz, 800 périodes en 8 s) ; ses cinq versions diffèrent par les phases et les poids des harmoniques.

| Emplacement | Var. | Durée s | Centroïde Hz | f0 Hz | Pic Hz | > 4 kHz % | Crête dBFS | RMS dBFS | Niveau / tir dB (cible) | Écart dB | Rendu ms | Hors cible (graines 2 à 5) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `ambiance-vent` | A | 10,00 | 675 | – | 297 | 0,00 | −3,0 | −16,5 | −26,2 (−24) | −2,2 | 329 | 0/4 |
| `ambiance-vent` | B | 10,00 | 1030 | – | 475 | 0,01 | −3,0 | −16,1 | −25,7 (−24) | −1,7 | 114 | 1/4 (level) |
| `ambiance-grincements` | A | 3,00 | 496 | – | 247 | 0,00 | −3,7 | −16,5 | −22,0 (−22) | 0,0 | 91 | 0/4 |
| `ambiance-grincements` | B | 3,50 | 363 | – | 167 | 0,00 | −3,0 | −16,2 | −22,1 (−22) | −0,1 | 88 | 0/4 |
| `ambiance-neon` | A | 8,00 | 188 | – | 100 | 0,00 | −11,9 | −20,9 | −30,0 (−30) | 0,0 | 171 | 0/4 |
| `ambiance-neon` | B | 8,00 | 374 | – | 100 | 0,00 | −12,2 | −21,2 | −30,0 (−30) | 0,0 | 217 | 0/4 |
| `joueur-coeur` | A | 1,60 | 72 | – | 43 | 0,00 | −9,5 | −25,3 | −14,0 (−14) | 0,0 | 23 | 0/4 |
| `joueur-coeur` | B | 1,60 | 65 | – | 38 | 0,00 | −9,9 | −22,6 | −14,0 (−14) | 0,0 | 12 | 0/4 |
| `joueur-essouffle` | A | 2,00 | 1583 | – | 594 | 0,35 | −6,7 | −22,7 | −14,0 (−14) | 0,0 | 49 | 0/4 |
| `joueur-essouffle` | B | 2,00 | 1451 | – | 540 | 0,19 | −6,0 | −22,4 | −14,0 (−14) | 0,0 | 41 | 0/4 |
| `ambiance-lointains` | A | 3,00 | 485 | 89 | 91 | 0,00 | −4,5 | −15,4 | −24,0 (−24) | 0,0 | 116 | 0/4 |
| `ambiance-lointains` | B | 3,50 | 448 | 71 | 72 | 0,00 | −3,0 | −16,2 | −25,0 (−24) | −1,0 | 88 | 0/4 |
| `porte-enfoncee` | A | 1,20 | 217 | – | 118 | 0,00 | −3,2 | −13,0 | −8,0 (−8) | 0,0 | 19 | 0/4 |
| `porte-enfoncee` | B | 1,20 | 231 | – | 92 | 0,00 | −4,6 | −13,0 | −8,0 (−8) | 0,0 | 13 | 0/4 |
| `interface-piece` | A | 0,45 | 3529 | – | 2800 | 15,60 | −3,0 | −20,7 | −14,5 (−14) | −0,5 | 4 | 0/4 |
| `interface-piece` | B | 0,50 | 3335 | – | 2592 | 4,83 | −3,0 | −19,8 | −14,0 (−14) | 0,0 | 3 | 0/4 |
| `interface-achat` | A | 0,90 | 1434 | – | 1109 | 0,18 | −3,0 | −17,0 | −12,0 (−12) | 0,0 | 5 | 0/4 |
| `interface-achat` | B | 1,00 | 1470 | – | 990 | 0,02 | −3,5 | −17,1 | −12,0 (−12) | 0,0 | 8 | 0/4 |

## Scènes (30 s, déterministes)
`js/core/scenes-sons.js` (pur) : `createScene(id, graine, { repairDuration })` -> `{ id, duration: 30, listener, events }`, événement `{ t, sonId, variante: null, graine (1 à 5, jamais deux fois la même de suite pour un son), distance, etage, etouffement }` ; `mixFor(événement, audio.json, étage du joueur)` reprend les règles du jeu (`distanceGain` de `audio-mix.js` : plein gain sous 150, nul à 1 100 ; mur : passe-bas 900 Hz × 0,6 ; autre étage : 700 Hz × 0,5, un seul filtre). Avec la graine 1 : **Couloir** 52 événements (pas sur carrelage par séquences, voix d'errance à 600 à 1 000 derrière les murs), **Siège d'une fenêtre** 46 (approche, une réparation à la durée choisie, 4 planches arrachées toutes les 2,2 s qui tombent, 2 craquements, voix, escalade, un coup de feu de la recette du jeu, une mort), **Réparation** 26 avec 1,8 s (4 planches, quelques pas, et ainsi de suite ; plus de planches avec une durée plus courte), **Meute à l'escalier** 93 (le joueur monte, la meute en bas entendue à travers le plancher, puis dans l'escalier ; pas, voix, frottements du rampant). La page joue chaque événement avec le **choix courant** de son emplacement (favori coché, sinon la dernière variante jouée) ; avec `?test=1`, l'horloge avance par `window.__zsSons.stepScene(s)` (temps simulé).

## Méthode
1. **Mesurer avant de changer** : `node scripts/sons/inventaire.mjs [--md] [--variants]` (sons actuels) ; `Docs/ref/sons-actuels.md` donne l'analyse chiffrée de ce qui sonne faux.
2. **Recette = principes acoustiques**, jamais une copie d'un son existant : pas = appui du talon puis de la pointe (coup sourd à chute de hauteur, modes du sol excités par une impulsion de contact en demi-sinus, claquement médium), frottement de semelle, gravillons, coupure raide (deux biquads de Butterworth, −24 dB par octave) ; voix = source glottale de Rosenberg (jitter, shimmer, sous-harmonique par alternance d'amplitude, modulation rugueuse de 20 à 60 Hz) dans une cascade de quatre résonateurs de Klatt (formants à glissement et dérive lente ; le fondamental passe), souffle d'aspiration pulsé, saturation douce ; bois = résonateurs modaux (150 à 900 Hz, décroissances de 40 à 120 ms) excités par des éclats ; marteau = corps de bois grave + pointe métallique (partiels de 2,3 à 4,6 kHz, 8 à 20 ms) + claquement.
3. **Mesurer après** : chaque variante est rendue et comparée à sa cible ; les tests exigent la version 1 dans la cible et rapportent les autres.

## Formules des mesures (`js/core/audio-analysis.js`)
- Spectre moyen : FFT de 2 048 échantillons, fenêtre de Hann, recouvrement de moitié ; puissance moyenne par case.
- **Centroïde** = Σ f·A(f) / Σ A(f), A = √puissance, cases à plus de 60 dB sous la plus forte ignorées (sinon les lobes de la fenêtre tirent un sinus grave vers l'aigu) ; **rolloff** : fréquence sous laquelle se trouve 85 % de Σ A.
- **Part au-dessus de 4 kHz** = Σ puissance(f ≥ 4 000) / Σ puissance ; **pic** = maximum du spectre moyen (FFT de 4 096, interpolation parabolique).
- **Fondamentale** : différence cumulée normalisée (YIN), seuil 0,2, contrôle d'octave (le double de la période est retenu si son creux est plus profond d'au moins 0,1), médiane des trames voisées (apériodicité < 0,45).
- **Harmonique-bruit** : r = maximum de l'autocorrélation normalisée entre les périodes de 400 et 40 à 50 Hz ; HNR = 10·log₁₀(r / (1 − r)), médiane des trames fortes, borné à [−20, 40] dB.
- **Niveau court** = RMS de la fenêtre de 100 ms la plus forte ; niveau relatif au tir = niveau court + gain de catégorie (dB) − niveau court du tir (−4,55 dBFS, moyenne des trois variantes).
- **Attaque** : de 10 % à 90 % du maximum de l'enveloppe (maximum sur 1 ms). **Coups** : maxima de l'enveloppe (5 ms) au-dessus de 30 % du maximum, séparés d'au moins 150 ms. **Pointe métallique** : part de l'énergie 2 à 5 kHz dans les 40 ms qui suivent l'attaque (≥ 0,8) et part de cette bande dans ces 40 ms (≥ 3 %).
- **Distance spectrale** : voir « Variantes ». **Jonction de boucle** : |dernier − premier échantillon| et rapport des RMS des 50 ms de chaque côté.

## Comment…
- **ajouter une variante** : dans `data/game/sounds-atelier.json`, ajouter à l'emplacement `{ id: "D", label, recipe: { use: ["préréglage…"], champs propres, scale: { "chemin": facteur } }, macros }` (préréglages dans `presets`, fusion profonde dans l'ordre de `use`, facteurs multipliés à la fin, sous-recettes avec leur propre `use`) ; ajouter le texte du bouton dans `data/i18n/atelier-sons.json` ; `npx vitest run tests/unit/atelier-variantes.test.js` dit si elle tient ses cibles et si elle se distingue des autres (seuil 0,035).
- **régler une cible** : `targets.<emplacement>` (`duration`, `centroid`, `peakHz`, `f0`, `hf4k`, `hnr`, `attackMs`, `level`, `hits`, `tipBand`, `loopSeam`), avec `source` (`prompt` ou `agent`). Une variante qui ne la tient plus doit être réglée ou marquée `outOfTarget: { reason, mesure }` (le test l'exige, rien n'est caché). Le niveau d'une cible fixe aussi le niveau du tampon (normalisation, crête plafonnée à −3 dBFS).
- **lire « Mes choix »** : une ligne par emplacement, `emplacement=variante(hauteur=…,matiere=…,grain=…,duree=…,ampleur=…)` ; hauteur en demi-tons, matière en octaves, grain et durée en facteurs (réparation : durée en secondes), ampleur en part de réverbération. `parseChoices` (`js/core/atelier-choices.js`) relit le texte, borne les valeurs et signale chaque ligne invalide. Exemple : `voix-grand-errance=B(hauteur=-1,matiere=0,grain=1.2,duree=1,ampleur=0.3)`.
- **intégrer** (lot 3i) : voir `Docs/ref/integration-sons.md`.

## Page et tests
Volume maître 40 % par défaut, limiteur (compresseur : seuil −6 dB, genou 0, rapport 20, attaque 2 ms, relâchement 100 ms) après le volume, avertissement en tête, aucun son avant un geste (contexte créé par « Activer le son » ou le premier bouton), message sur le commutateur silencieux des iPhone (non vérifié par l'agent), aucun stockage, aucune requête externe. Calcul en arrière-plan (`worker.js`, repli sur place), cache de 24 Mo (éviction des plus anciens). `?test=1` : `window.__zsSons` = `log()` (son, variante, graine, macros, mesures, gain), `state()`, `choices()`, `graph()`, `stepScene(s)`, `scene()`. Tests : `tests/unit/atelier-*.test.js`, `tests/e2e/atelier-sons.spec.js`, `tests/e2e/atelier-scenes.spec.js`.
