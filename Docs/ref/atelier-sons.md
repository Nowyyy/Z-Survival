# Atelier des sons (lot 3h)

Page technique `atelier-sons.html` : comparer les sons actuels du jeu et de nouvelles variantes synthétisées, les régler, noter ses choix. **Rien n'est intégré au jeu** (lot 3i). **Aucun son n'a été écouté par l'agent** : ce document donne des recettes et des mesures ; le jugement d'oreille appartient au propriétaire.

## Fichiers
- `js/core/audio-analysis.js` (mesures), `js/core/synth2.js`, `synth2-dsp.js`, `synth2-sources.js` (synthèse), `js/core/atelier-check.js` (cibles), `atelier-choices.js` (« Mes choix »), `sound-cache.js` (cache de 24 Mo), `wave-svg.js` (oscillogramme) : purs, déterministes, sans Web Audio ni horloge.
- `data/game/sounds-atelier.json` (provisoire) : `targets`, `presets`, `slots` (variantes, macros), `references`, `levelRef`, `distinctness`, `page` (volume, limiteur, pas des curseurs).
- `atelier-sons.html`, `css/atelier-sons.css`, `js/atelier-sons/` (`main.js` interface, `player.js` Web Audio, `worker.js` + `render.js` calcul en arrière-plan), `data/i18n/atelier-sons.json` (textes, français seul : fichier séparé, lu par `translate` de `js/i18n.js` ; le test `data-i18n` ne lit que `fr.json` et `en.json`, son équivalent est dans `tests/unit/atelier-variantes.test.js`).

## Variantes
Chaque emplacement a trois variantes distinctes par intention : **A « réaliste sourd »** (grave et pression, voix peu éclatante : pente spectrale plus basse, moins de sous-harmonique et de rugosité), **B « horreur marquée »** (voix doublée désaccordée de 0,8 %, prise d'air inspirée, sous-harmonique × 1,15, rugosité × 1,1, souffle × 1,05, durée × 1,2, hauteur × 0,93 ; pas plus lourds et plus traînants ; planches plus graves et plus longues), **C « sec et proche »** (durée × 0,75, sans réverbération, passe-haut à 180 Hz et bosse de +7 dB à 1,1 kHz pour les voix, décroissances raccourcies pour les impacts). Cinq macros par variante (bornes et défaut dans les données) : `hauteur` (demi-tons, −6 à +6), `matiere` (octaves de brillance des filtres, −1 à +1), `grain` (facteur du bruit et de la rugosité, 0 à 2), `duree` (facteur 0,6 à 1,6 ; réparation : secondes, 0,4 à 1,8), `ampleur` (part de réverbération courte, 0 à 0,6 ; défaut A 0,1, B 0,3, C 0). Cinq versions par son (graines 1 à 5, tirage sans répétition immédiate).

**Distinction** : distance spectrale (`spectralDistance` : écart moyen, en dB, des profils en 24 bandes d'un tiers d'octave environ, bornés à −60 dB, divisé par 60). Seuil **0,035** (≈ 2,1 dB d'écart moyen par bande), fixé à 1,4 fois la **médiane des écarts entre deux versions d'une même variante (0,025)** : deux variantes doivent différer plus que deux tirages ordinaires d'une même variante. Mesuré : minimum 0,038, 10e centile 0,048, médiane 0,078 (93 paires) ; versions d'une même variante : médiane 0,025, 90e centile 0,050, maximum 0,106.

## Mesures des variantes de la priorité 1 (version 1, macros par défaut)
Niveau / tir : niveau court (RMS de la fenêtre de 100 ms la plus forte) + gain de la catégorie du jeu − niveau court du tir ; tolérance ±3 dB. Dernière colonne : versions 2 à 5 hors d'une borne (la cible est exigée de la version 1, les autres sont rapportées). **Les 93 variantes par défaut sont dans leurs cibles** ; 12 versions sur 372 sortent d'une borne, de peu : HNR de 5,0 à 5,9 dB pour un minimum de 6 (6 versions), centroïde 195 à 567 Hz pour un minimum de 200 à 600 selon l'emplacement (4), pic à 263 Hz pour un maximum de 250 (1), attaque de 5,0 ms arrondie sous 5 (1).

| Emplacement | Var. | Durée s | Centroïde Hz | f0 Hz | Pic Hz | > 4 kHz % | Crête dBFS | RMS dBFS | Niveau / tir dB (cible) | Écart dB | Rendu ms | Hors cible (graines 2 à 5) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `pas-joueur-dur` | A | 0,15 | 418 | – | 184 | 0,00 | −3,3 | −15,1 | −18,0 (−18) | 0,0 | 43 | 0/4 |
| `pas-joueur-dur` | B | 0,18 | 399 | – | 185 | 0,00 | −4,5 | −15,7 | −18,0 (−18) | 0,0 | 8 | 0/4 |
| `pas-joueur-dur` | C | 0,11 | 452 | – | 223 | 0,00 | −4,4 | −13,8 | −18,0 (−18) | 0,0 | 2 | 1/4 (attackMs) |
| `pas-joueur-exterieur` | A | 0,16 | 554 | – | 129 | 0,00 | −4,6 | −17,4 | −20,0 (−20) | 0,0 | 3 | 0/4 |
| `pas-joueur-exterieur` | B | 0,20 | 565 | – | 107 | 0,00 | −6,3 | −17,9 | −20,0 (−20) | 0,0 | 8 | 0/4 |
| `pas-joueur-exterieur` | C | 0,12 | 537 | – | 160 | 0,00 | −6,0 | −16,2 | −20,0 (−20) | 0,0 | 3 | 0/4 |
| `pas-joueur-escalier` | A | 0,15 | 388 | – | 243 | 0,00 | −6,9 | −15,0 | −18,0 (−18) | 0,0 | 2 | 0/4 |
| `pas-joueur-escalier` | B | 0,19 | 383 | – | 216 | 0,00 | −6,5 | −15,8 | −18,0 (−18) | 0,0 | 3 | 2/4 (centroid) |
| `pas-joueur-escalier` | C | 0,11 | 399 | – | 252 | 0,00 | −5,6 | −13,8 | −18,0 (−18) | 0,0 | 1 | 0/4 |
| `pas-zombie-lent` | A | 0,30 | 398 | – | 121 | 0,00 | −3,2 | −15,5 | −16,0 (−16) | 0,0 | 3 | 0/4 |
| `pas-zombie-lent` | B | 0,34 | 351 | – | 98 | 0,00 | −3,5 | −16,0 | −16,0 (−16) | 0,0 | 4 | 0/4 |
| `pas-zombie-lent` | C | 0,20 | 372 | – | 134 | 0,00 | −3,3 | −13,5 | −16,0 (−16) | 0,0 | 2 | 0/4 |
| `pas-zombie-marche` | A | 0,22 | 300 | – | 113 | 0,00 | −3,0 | −14,7 | −16,4 (−16) | −0,4 | 2 | 0/4 |
| `pas-zombie-marche` | B | 0,26 | 258 | – | 101 | 0,00 | −3,7 | −14,6 | −16,0 (−16) | 0,0 | 4 | 0/4 |
| `pas-zombie-marche` | C | 0,15 | 282 | – | 128 | 0,00 | −3,4 | −13,2 | −16,0 (−16) | 0,0 | 1 | 0/4 |
| `pas-zombie-course` | A | 0,16 | 220 | – | 119 | 0,00 | −3,5 | −13,4 | −16,0 (−16) | 0,0 | 2 | 1/4 (centroid) |
| `pas-zombie-course` | B | 0,19 | 244 | – | 129 | 0,00 | −3,0 | −14,9 | −16,7 (−16) | −0,7 | 2 | 1/4 (peakHz) |
| `pas-zombie-course` | C | 0,12 | 229 | – | 139 | 0,00 | −3,8 | −12,2 | −16,0 (−16) | 0,0 | 1 | 0/4 |
| `zombie-rampe` | A | 0,80 | 703 | – | 73 | 0,00 | −5,5 | −19,8 | −18,0 (−18) | 0,0 | 40 | 0/4 |
| `zombie-rampe` | B | 1,00 | 566 | – | 70 | 0,00 | −6,2 | −19,0 | −18,0 (−18) | 0,0 | 13 | 0/4 |
| `zombie-rampe` | C | 0,55 | 869 | – | 68 | 0,00 | −3,7 | −18,8 | −18,0 (−18) | 0,0 | 6 | 0/4 |
| `voix-marcheur-errance` | A | 1,70 | 706 | 94 | 92 | 0,00 | −6,3 | −13,6 | −10,0 (−10) | 0,0 | 103 | 0/4 |
| `voix-marcheur-errance` | B | 2,04 | 763 | 89 | 87 | 0,01 | −4,8 | −13,7 | −10,0 (−10) | 0,0 | 61 | 0/4 |
| `voix-marcheur-errance` | C | 1,28 | 753 | 95 | 597 | 0,00 | −3,3 | −14,0 | −10,0 (−10) | 0,0 | 28 | 1/4 (hnr) |
| `voix-marcheur-attaque` | A | 0,75 | 812 | 106 | 109 | 0,01 | −4,6 | −11,2 | −8,0 (−8) | 0,0 | 10 | 0/4 |
| `voix-marcheur-attaque` | B | 0,90 | 887 | 100 | 103 | 0,02 | −4,0 | −11,7 | −8,0 (−8) | 0,0 | 26 | 0/4 |
| `voix-marcheur-attaque` | C | 0,56 | 868 | 107 | 657 | 0,00 | −3,0 | −12,0 | −8,2 (−8) | −0,2 | 6 | 1/4 (hnr) |
| `voix-marcheur-touche` | A | 0,32 | 696 | 106 | 109 | 0,00 | −7,0 | −14,5 | −10,0 (−10) | 0,0 | 5 | 0/4 |
| `voix-marcheur-touche` | B | 0,38 | 782 | 98 | 101 | 0,01 | −5,8 | −13,9 | −10,0 (−10) | 0,0 | 8 | 0/4 |
| `voix-marcheur-touche` | C | 0,24 | 742 | 108 | 549 | 0,00 | −3,9 | −14,2 | −10,0 (−10) | 0,0 | 3 | 0/4 |
| `voix-marcheur-mort` | A | 1,50 | 636 | 95 | 97 | 0,00 | −5,8 | −15,0 | −10,0 (−10) | 0,0 | 34 | 0/4 |
| `voix-marcheur-mort` | B | 1,80 | 698 | 85 | 81 | 0,01 | −5,5 | −14,8 | −10,0 (−10) | 0,0 | 52 | 0/4 |
| `voix-marcheur-mort` | C | 1,12 | 720 | 93 | 575 | 0,00 | −3,6 | −15,2 | −10,0 (−10) | 0,0 | 14 | 0/4 |
| `voix-petit-errance` | A | 1,22 | 841 | 145 | 725 | 0,01 | −6,6 | −14,1 | −10,0 (−10) | 0,0 | 24 | 0/4 |
| `voix-petit-errance` | B | 1,47 | 946 | 134 | 133 | 0,02 | −5,1 | −13,5 | −10,0 (−10) | 0,0 | 28 | 1/4 (hnr) |
| `voix-petit-errance` | C | 0,92 | 902 | 141 | 701 | 0,00 | −5,2 | −14,1 | −10,0 (−10) | 0,0 | 10 | 0/4 |
| `voix-petit-attaque` | A | 0,54 | 1116 | 165 | 833 | 0,06 | −5,8 | −11,9 | −8,0 (−8) | 0,0 | 7 | 0/4 |
| `voix-petit-attaque` | B | 0,65 | 1175 | 150 | 157 | 0,08 | −3,5 | −11,2 | −8,0 (−8) | 0,0 | 12 | 0/4 |
| `voix-petit-attaque` | C | 0,40 | 1099 | 163 | 855 | 0,01 | −4,3 | −12,5 | −8,0 (−8) | 0,0 | 5 | 0/4 |
| `voix-petit-touche` | A | 0,23 | 920 | 162 | 679 | 0,01 | −5,7 | −13,9 | −10,0 (−10) | 0,0 | 6 | 0/4 |
| `voix-petit-touche` | B | 0,28 | 992 | 152 | 630 | 0,03 | −5,8 | −13,6 | −10,0 (−10) | 0,0 | 10 | 0/4 |
| `voix-petit-touche` | C | 0,17 | 893 | 166 | 655 | 0,00 | −4,6 | −13,4 | −10,0 (−10) | 0,0 | 4 | 0/4 |
| `voix-petit-mort` | A | 1,08 | 836 | 138 | 738 | 0,01 | −6,9 | −14,8 | −10,0 (−10) | 0,0 | 27 | 0/4 |
| `voix-petit-mort` | B | 1,30 | 925 | 128 | 125 | 0,03 | −5,3 | −14,6 | −10,0 (−10) | 0,0 | 33 | 0/4 |
| `voix-petit-mort` | C | 0,81 | 890 | 141 | 707 | 0,00 | −4,2 | −15,0 | −10,0 (−10) | 0,0 | 10 | 0/4 |
| `voix-voute-errance` | A | 1,70 | 935 | 100 | 106 | 0,04 | −6,5 | −13,2 | −10,0 (−10) | 0,0 | 51 | 0/4 |
| `voix-voute-errance` | B | 2,04 | 999 | 97 | 96 | 0,07 | −4,7 | −13,5 | −10,0 (−10) | 0,0 | 64 | 1/4 (hnr) |
| `voix-voute-errance` | C | 1,28 | 1143 | 109 | 661 | 0,08 | −4,6 | −14,3 | −10,0 (−10) | 0,0 | 19 | 0/4 |
| `voix-voute-attaque` | A | 0,75 | 1067 | 122 | 124 | 0,06 | −5,1 | −11,3 | −8,0 (−8) | 0,0 | 11 | 0/4 |
| `voix-voute-attaque` | B | 0,90 | 1099 | 115 | 118 | 0,08 | −4,0 | −11,7 | −8,0 (−8) | 0,0 | 19 | 1/4 (hnr) |
| `voix-voute-attaque` | C | 0,56 | 1230 | 125 | 676 | 0,09 | −3,0 | −11,9 | −8,5 (−8) | −0,5 | 8 | 0/4 |
| `voix-voute-touche` | A | 0,32 | 911 | 124 | 129 | 0,04 | −6,7 | −14,2 | −10,0 (−10) | 0,0 | 5 | 0/4 |
| `voix-voute-touche` | B | 0,38 | 1001 | 114 | 116 | 0,06 | −5,7 | −14,4 | −10,0 (−10) | 0,0 | 8 | 0/4 |
| `voix-voute-touche` | C | 0,24 | 1077 | 123 | 625 | 0,06 | −4,2 | −14,3 | −10,0 (−10) | 0,0 | 4 | 0/4 |
| `voix-voute-mort` | A | 1,50 | 941 | 108 | 110 | 0,06 | −5,6 | −14,5 | −10,0 (−10) | 0,0 | 47 | 0/4 |
| `voix-voute-mort` | B | 1,80 | 969 | 97 | 99 | 0,07 | −5,0 | −15,0 | −10,0 (−10) | 0,0 | 38 | 0/4 |
| `voix-voute-mort` | C | 1,12 | 1182 | 105 | 651 | 0,12 | −4,4 | −16,3 | −10,0 (−10) | 0,0 | 17 | 0/4 |
| `voix-grand-errance` | A | 1,70 | 623 | 65 | 65 | 0,00 | −4,0 | −11,3 | −8,0 (−8) | 0,0 | 31 | 0/4 |
| `voix-grand-errance` | B | 2,04 | 704 | 61 | 60 | 0,01 | −3,1 | −11,4 | −8,0 (−8) | 0,0 | 37 | 0/4 |
| `voix-grand-errance` | C | 1,28 | 720 | 69 | 69 | 0,00 | −3,0 | −12,6 | −8,5 (−8) | −0,5 | 15 | 0/4 |
| `voix-grand-attaque` | A | 0,75 | 825 | 80 | 82 | 0,02 | −3,0 | −9,1 | −6,2 (−6) | −0,2 | 10 | 0/4 |
| `voix-grand-attaque` | B | 0,90 | 792 | 74 | 74 | 0,02 | −3,0 | −10,3 | −7,1 (−6) | −1,1 | 16 | 0/4 |
| `voix-grand-attaque` | C | 0,56 | 806 | 78 | 80 | 0,01 | −3,0 | −11,0 | −7,7 (−6) | −1,7 | 7 | 1/4 (hnr) |
| `voix-grand-touche` | A | 0,32 | 564 | 74 | 76 | 0,00 | −4,0 | −12,0 | −8,0 (−8) | 0,0 | 5 | 0/4 |
| `voix-grand-touche` | B | 0,38 | 616 | 72 | 74 | 0,00 | −4,2 | −11,8 | −8,0 (−8) | 0,0 | 8 | 0/4 |
| `voix-grand-touche` | C | 0,24 | 665 | 79 | 81 | 0,00 | −3,0 | −12,6 | −8,7 (−8) | −0,7 | 3 | 0/4 |
| `voix-grand-mort` | A | 1,50 | 585 | 67 | 66 | 0,00 | −4,1 | −12,0 | −8,0 (−8) | 0,0 | 21 | 0/4 |
| `voix-grand-mort` | B | 1,80 | 651 | 63 | 61 | 0,01 | −3,4 | −12,1 | −8,0 (−8) | 0,0 | 35 | 0/4 |
| `voix-grand-mort` | C | 1,12 | 683 | 67 | 544 | 0,00 | −3,0 | −14,2 | −9,5 (−8) | −1,5 | 13 | 0/4 |
| `planche-arrachage` | A | 0,50 | 759 | – | 184 | 0,00 | −7,1 | −16,7 | −12,0 (−12) | 0,0 | 18 | 0/4 |
| `planche-arrachage` | B | 0,66 | 678 | – | 157 | 0,00 | −7,7 | −17,1 | −12,0 (−12) | 0,0 | 14 | 1/4 (centroid) |
| `planche-arrachage` | C | 0,32 | 804 | – | 228 | 0,00 | −6,4 | −17,5 | −12,0 (−12) | 0,0 | 2 | 0/4 |
| `reparation` | A | 1,80 | 2411 | – | 156 | 2,19 | −3,0 | −21,5 | −13,5 (−12) | −1,5 | 34 | 0/4 |
| `reparation` | B | 1,80 | 2646 | – | 140 | 1,30 | −3,0 | −19,8 | −12,2 (−12) | −0,2 | 12 | 0/4 |
| `reparation` | C | 1,80 | 2736 | – | 182 | 4,36 | −3,1 | −20,0 | −12,0 (−12) | 0,0 | 7 | 0/4 |
| `reparation-coup` | A | 0,20 | 836 | – | 165 | 0,02 | −3,0 | −16,6 | −12,4 (−12) | −0,4 | 2 | 0/4 |
| `reparation-coup` | B | 0,24 | 1539 | – | 139 | 0,15 | −3,4 | −17,1 | −12,0 (−12) | 0,0 | 3 | 0/4 |
| `reparation-coup` | C | 0,14 | 777 | – | 191 | 0,08 | −3,0 | −16,6 | −13,7 (−12) | −1,7 | 1 | 0/4 |
| `planche-craquement` | A | 0,70 | 674 | – | 215 | 0,00 | −9,0 | −18,8 | −14,0 (−14) | 0,0 | 8 | 0/4 |
| `planche-craquement` | B | 0,90 | 587 | – | 179 | 0,00 | −8,9 | −19,2 | −14,0 (−14) | 0,0 | 10 | 0/4 |
| `planche-craquement` | C | 0,45 | 731 | – | 240 | 0,00 | −7,2 | −17,6 | −14,0 (−14) | 0,0 | 5 | 0/4 |
| `planche-chute` | A | 0,75 | 367 | – | 220 | 0,00 | −6,7 | −20,0 | −12,0 (−12) | 0,0 | 12 | 0/4 |
| `planche-chute` | B | 0,95 | 346 | – | 194 | 0,00 | −7,3 | −21,1 | −12,0 (−12) | 0,0 | 15 | 0/4 |
| `planche-chute` | C | 0,50 | 416 | – | 255 | 0,00 | −6,4 | −19,8 | −12,0 (−12) | 0,0 | 3 | 0/4 |
| `escalade` | A | 1,50 | 503 | – | 194 | 0,00 | −9,3 | −22,2 | −14,0 (−14) | 0,0 | 31 | 0/4 |
| `escalade` | B | 1,90 | 444 | – | 167 | 0,00 | −9,7 | −24,1 | −14,0 (−14) | 0,0 | 30 | 0/4 |
| `escalade` | C | 1,05 | 515 | – | 231 | 0,00 | −6,2 | −22,5 | −14,0 (−14) | 0,0 | 14 | 0/4 |
| `joueur-souffle-terre` | A | 1,70 | 1057 | 111 | 462 | 0,05 | −8,2 | −21,2 | −10,0 (−10) | 0,0 | 35 | 0/4 |
| `joueur-souffle-terre` | B | 2,10 | 1143 | 98 | 107 | 0,06 | −5,7 | −21,9 | −10,0 (−10) | 0,0 | 26 | 0/4 |
| `joueur-souffle-terre` | C | 1,25 | 988 | 130 | 537 | 0,02 | −7,9 | −21,1 | −10,0 (−10) | 0,0 | 10 | 0/4 |
| `joueur-relevage` | A | 0,85 | 755 | – | 198 | 0,00 | −5,4 | −20,6 | −12,0 (−12) | 0,0 | 10 | 0/4 |
| `joueur-relevage` | B | 1,05 | 715 | – | 171 | 0,00 | −7,0 | −21,5 | −12,0 (−12) | 0,0 | 13 | 0/4 |
| `joueur-relevage` | C | 0,62 | 834 | – | 534 | 0,01 | −11,3 | −20,7 | −12,0 (−12) | 0,0 | 7 | 0/4 |
