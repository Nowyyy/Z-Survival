# Interface actuelle : état des lieux mesuré (lot 3k-A)

Relevé : `node scripts/interface/mesures.mjs` (Playwright, `jeu.html?test=1&seed=1&vhs=0`, `main` = `c166e53`), 7 tailles × 13 cas (HUD dans 7 états nommés, pause, mort, monde terminé, à terre, protégé, sticks). Calculs : `js/core/ui-measure.js` ; pire fond = 17 jetons de sols, murs, brume (`ui-atelier.json`). Zones de sécurité : padding imposé à la sonde `.safe-probe` du jeu puis `resize` (le jeu republie `--safe-*`). L'agent mesure et décrit ; il ne juge ni l'esthétique ni le confort.

## Boîtes (état « combat », px : gauche, haut, largeur × hauteur)
| taille | `#hud` | `#hud-money` | `#hud-wave` | Pause | part HUD + Pause |
|---|---|---|---|---|---|
| 667×375 | 16,16 200×72 | 220,17 88×20 | 459,27 144×22 | 607,16 44×44 | 8,5 % |
| 812×375 (zones 44/21) | 16,16 | 220,17 | 604,27 | 752,16 | 7,0 % |
| 844×390 (zones 47/21) | 19,16 | 223,17 | 633,27 | 781,16 | 6,5 % |
| 932×430 | 16,16 | 220,17 | 724,27 | 872,16 | 5,3 % |
| 1024×768 | 16,16 | 220,17 | 816,27 | 964,16 | 2,7 % |
| 1440×900 | 16,16 | 220,17 | 1232,27 | 1380,16 | 1,6 % |
| 2560×1080 | 16,16 | 220,17 | 2352,27 | 2500,16 | 0,8 % |

Mêmes tailles de blocs à toutes les tailles d'écran (rem fixes) : seule la position horizontale de la vague et de Pause change (collées à droite). Panneau de pause : 544 × 327 à 667×375 (deux colonnes, 8 cibles de 44 px), 352 × 538 à 1440×900 (une colonne). Écran de fin : 544 × 229 (mort) et 544 × 261 (monde terminé) à 667×375. À terre : texte de 182 × 61 centré à 84 % de la hauteur. Sticks au repos : 112 × 112 à 16 % et 84 % de la largeur, 68 % de la hauteur.

## Analyse chiffrée
- **Part de l'écran** (HUD + argent + vague + Pause) : 8,5 % à 667×375, 0,8 % à 2560×1080 ; « Étage » ou une vie faible ajoutent 0,3 point.
- **Hiérarchie des textes** : HUD 14 px (vie, restants, tués, étage, argent), vague 16 px (Rubik Wet Paint) ; titre de pause et de fin 20 px (écran bas) ou 28 px ; lignes des panneaux 16 à 20 px ; notes 14 px ; « À terre » 20 px puis 16 px. Écart entre le plus petit et le plus grand texte du HUD : 2 px.
- **Plus petit texte** : 14 px partout. **Plus petite cible** : 44 px (Pause, boutons des panneaux, curseur de volume).
- **Contraste sur le pire fond** : HUD 5,27:1 (texte sur puce à 78 % d’opacité posée sur le pire des 17 fonds) ; panneaux 4,63:1 (note atténuée sur `--color-surface`). Aucun texte sous 4,5:1.
- **Stabilité** : 0 px de déplacement (argent 0 → 9 000 000 cumulés, vague 1 → 40, 5 chutes) aux 7 tailles. **CLS** (données retardées de 400 ms) : 0,0008 au plus (667×375).
- **DOM** : 56 éléments dans `#game-root` ; 7 lignes de texte visibles sur le HUD, 11 dans la pause, 10 sur l'écran de fin.
- **Chevauchements** : aucun entre blocs, ni avec Pause. **Zones des pouces** (moitiés basses, dès 50 % de la hauteur) : seul E2-10 (« À terre », « Protégé ») les chevauche, à toutes les tailles (centré à 84 % de la hauteur).
- **Zones de sécurité** : à 812×375 et 844×390, le HUD (x = 16 et 19) et Pause (à 16 et 19 px du bord droit) sont dans la zone de l'encoche ou de l'îlot (44 et 47 px) : c'est le choix du lot 4 (`max(16 px, zone − 28 px)`, retour du propriétaire « plus près des bords »), rapporté hors cible par la règle « 16 px plus zones de sécurité » ; E2-10 y est aussi à 9 et 11 px de la barre d'accueil.
- **Ce qui bouge** : rien quand les valeurs changent ; « +N » (22 px de haut) apparaît sous l'argent pendant 1,2 s ; la ligne « Étage » n'existe que sur les cartes à étages.

## Limites du relevé
- Aucun hook ne règle la vie : elle est approchée par des coups de zombie (écart de 1 à 17 PV, noté) ; ni les tués (0), ni l'état de sauvegarde (`memory` en `?test=1`, `readonly` en mode essai).
- Rendu logiciel (WebGL sans GPU) ; vrai iPhone (îlot dynamique, zones réelles) non mesuré.
- Lighthouse mobile de `jeu.html` sur `main` (référence, cette branche ne le change pas) : performance 45, accessibilité 100, bonnes pratiques 100, CLS 0,002.
