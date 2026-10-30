# Étage : relevé sur le modèle 3D (lot 3e)

Ce fichier remplace le modèle SketchUp pour les lots suivants. Source : `model.dae` (SketchUp 8, Collada, pouces ; fourni par le propriétaire pendant la session du lot 3e, jamais versionné). Tout est en **pixels du plan** (12 px par mètre du modèle, 5 unités du jeu par pixel, 60 unités par mètre), avec **la même origine et la même échelle que `plan.json`** (bbox 0, 0, 486, 372) : un point a les mêmes coordonnées à tous les étages.

## Méthode
1. Aplatissement de la scène (matrices des instances), conversion en mètres.
2. Calage sur le rez-de-chaussée : le contour de `plan.json`, posé sur la coupe à z = 1,2 m, recouvre 91 % des pixels du contour (le reste : pilastres et marches de 1 px) (recherche de l'origine à 1 px près). Relation : `px = (x_modèle + 5,0833) × 12`, `py = (28,9167 − y_modèle) × 12` (x vers l'est, y vers le nord dans le modèle ; y vers le sud dans le plan).
3. Niveaux : sol du rez-de-chaussée z = 0 ; plafond du rez-de-chaussée z = 2,74 ; **sol de l'étage z = 3,05 m** (2,74 à 2,77 sous la salle de droite : marche de 0,3 m ignorée) ; toit z = 5,8 à 6,1. Coupe de l'étage **à z = 4,2 m** (1,15 m au-dessus de son sol, même méthode que le rez-de-chaussée).
4. Les murs sont relevés à la **ligne médiane** (comme le contour du rez-de-chaussée) ; les pilastres collés aux murs sont absorbés par l'épaisseur du mur (40 unités) ; les fenêtres sont les ouvrages à planches du modèle (composants de 1,22 m de large : les planches du bas, z = 3,05 à 3,96, et leur cadre), comme F1 à F8 au rez-de-chaussée.

## Ce que le modèle contient à l'étage
| Élément | Relevé | Où dans `etage.json` |
|---|---|---|
| Contour | aile (x 50 à 138, y 23 à 208) + poche (x 20 à 138, y 208 à 336) + salle de droite (x 138 à 293, y 226 à 350) | `contour` (10 sommets) |
| Mur entre poche et salle de droite | x = 138 ; **ouverture de 3,2 m** (y 262 à 301) avec un poteau de 0,6 m au milieu (retiré, voir écarts) | `walls`, `openings.porte-etage` |
| Mur-éperon | x = 198, de la façade nord à la colonne (y 226 à 253) | `walls.mur-interieur-3` |
| Colonnes (35) | aile : (83, 83), (83, 145) ; frontière poche/aile : (83, 208) ; poche : (83, 253) ; salle de droite : (242, 253), (198, 312) | `pillars` |
| Cloison basse de l'aile | x 112 à 116 (0,30 m), y 89 à 201 (9,3 m), avec une colonne en son milieu | meuble E1 (`comptoir`, modèle) |
| Pile de caisses | x 185 à 195, y 235 à 247 | meuble E2 (`caisse`, modèle) |
| Cage de l'escalier de l'aile | rectangle de x 24 à 52, y 254 à 298 (escalier droit de 2,44 m de large qui monte vers le sud ; la cage est fermée par des rambardes sur trois côtés, ouverte au sud) | `stairs.escalier-aile-etage` |
| Cage de l'escalier courbe | modèle : x 246 à 289, y 230 à 303 (quart de tour qui monte vers le nord-ouest) ; **jeu (retour du propriétaire, escalier physique arrondi) : x 255 à 288, y 243 à 270, aux deux étages** | `stairs.escalier-depart-etage` |

## Fenêtres U1 à U7 (72 de large, 150 de profondeur libre, centres à 150 au moins)
Triées par x croissant puis y. Position = centre sur la ligne du mur. `planX` = position du modèle quand elle a été décalée (au plus 50 unités).

| Id | Mur | x, y (px) | Modèle | Zone |
|---|---|---|---|---|
| U1 | ouest (poche) | 20, 230 | composant de planches à x = −3,5 m, y = 9,74 m | etage-gauche |
| U2 | ouest (aile) | 50, 59 | planches à x = −1,0 m, y = 23,99 m | etage-gauche |
| U3 | nord (aile) | 96, 23 | 1ʳᵉ des 3 planches contiguës du mur nord, x 2,4 à 3,6 m (planX 97) | etage-gauche |
| U4 | nord (aile) | 126, 23 | 3ᵉ des 3 planches (x 4,8 à 6,1 m) | etage-gauche |
| U5 | nord (salle de droite) | 212, 226 | cadre sans planches x 12,2 à 13,7 m (centre 216, décalée de 20 unités pour s'écarter de la zone de déclenchement de l'escalier) | etage-droite |
| U6 | sud (salle de droite) | 251, 350 | 1ʳᵉ des 3 planches contiguës, x 15,4 à 19,0 m (planX 253) | etage-droite |
| U7 | sud (salle de droite) | 281, 350 | 3ᵉ des 3 planches (planX 282) | etage-droite |

## Écarts avec le modèle et avec le prompt
- **Salle de droite = la moitié ouest de la grande salle** (x 138 à 293). Le reste de l'étage au-dessus de la grande salle (x > 293) est un toit découvert au niveau 3,05 : ni mur nord ni mur est à z = 4,2 ; il n'est **pas** relevé comme salle (aucun zombie ne peut y apparaître ni le joueur y aller).
- **Fenêtres non reprises** : la fenêtre est de la poche (x = 6,43 m, y = 11,03 m) regarde un point qui est au-dessus du rez-de-chaussée (un point d'apparition à 450 y serait dans le contour du rez-de-chaussée : règle des 160 hors du contour) ; la planche du coin nord-est (x 6,3 m, y 26,6 m) est à 65 unités de U4 (centres à 150 au moins) ; la planche centrale de chaque triplet (nord de l'aile, sud de la salle) est trop proche de ses voisines.
- **Mur sud de la salle de droite** : le modèle n'a aucun mur entre x = 7,0 et 11,1 m à cet étage (ni à 3,4, ni à 4,2, ni à 5,0 m) ; la carte le **ferme** (le contour est continu), sans fenêtre. À corriger si le propriétaire le veut ouvert.
- **Poteau de la porte** (0,6 m au milieu de l'ouverture entre les deux salles) : retiré ; l'ouverture est un seul segment de 195 unités.
- **Contour** : le mur nord de l'aile est à y = 23 (rez-de-chaussée : 20) ; le mur nord de la salle de droite à y = 226 (rez-de-chaussée : 228 au nord-est, 208 à l'ouest) ; le contour de l'étage reste à 100 unités près dans celui du rez-de-chaussée (test).
- **Mobilier du modèle** : 2 pièces seulement (E1, E2) : l'étage est presque vide dans le modèle. **6 pièces provisoires** (`provisional: true`, Q1 à Q6) complètent à 8, jamais comparées à un modèle ; 8 pièces sur 8 à 20 attendues.
- **Cages d'escalier** : au rez-de-chaussée, l'emprise du second escalier (aile) vient de `plan.json` (`escalier-aile`, x 24 à 52, y 257 à 301, ajouté) ; l'ancien gros bloc `M1+M3+M7+M9+M13+M14+M16` (« table » qui recouvrait en réalité les marches) est maintenant coupé en deux par cette emprise (M9, M13, M14, M16 retirées : elles étaient dans l'escalier).
- **Escalier courbe** : son emprise de `plan.json` (x 261 à 288, y 242 à 261) est un rectangle réduit de la vraie cage (x 15,4 à 19,1 m, y 6,3 à 10,4 m) ; sa zone de déclenchement est à son pied (côté sud), l'arrivée à l'étage à l'ouest de sa tête (côté nord-ouest).

## Zones de déclenchement et arrivées (pixels)
| Escalier | Étage | Emprise (solid) | Déclenchement (trigger) | Arrivée |
|---|---|---|---|---|
| escalier-aile | rez-de-chaussée | 24, 257 → 52, 301 | 26, 238 → 50, 256 (au pied nord, 120 × 90 u.) | 66, 248 |
| escalier-aile | étage | 24, 254 → 52, 298 | 26, 299 → 44, 319 (à la tête sud, 90 × 100 u.) | 60, 308 |
| escalier-depart | rez-de-chaussée | 255, 243 → 288, 270 (quart de tour arrondi) | 261, 270 → 286, 284 (au pied sud, 125 × 70 u.) | 275, 300 |
| escalier-depart | étage | 250, 230 → 290, 290 (trou dans le sol et obstacle : tout le coin autour de la rampe) | 232, 238 → 250, 256 (à l'ouest de la tête, 90 × 90 u.) | 226, 276 |

Blocs : porte 2 : rez-de-chaussée 24, 238 → 52, 257 ; porte 3 : rez-de-chaussée 260, 269 → 287, 285 et la porte de l'étage (segment x = 138, y 262 à 301).

## Corriger l'étage
Voir la section du bilan `Docs/lots/lot-3e.md` : modifier `etage.json`, `zones.json` ou `plan.json` (escaliers), `npm run carte`, `node scripts/zones-metriques.mjs --etages`, `carte.html` et `jeu.html?labels=1&wave=31&zoom=1&floor=1`.

## Escaliers physiques (mise à jour du lot 3e)
- `zones.json` `walk` : `path` (points `[x, y, t]` du pied au haut, en pixels) et `width`. **Escalier de l'aile** : droit, du sud au nord à l'étage (de (38, 247) à (35, 309)), largeur 24. **Escalier de départ** : arrondi, quart de tour de rayon 19 centré en (254,5, 270) (de (273,5, 270) vers le nord, puis l'ouest, jusqu'à (254,5, 251)), puis un palier de 14 px vers la zone de l'étage (241, 247) ; largeur 16 ; hauteur de 0 à 1 le long de l'arc (180 unités sur 180 de longueur).
- L'emprise pleine de l'escalier de départ est (255, 243 → 288, 270) au rez-de-chaussée (la rampe) et (250, 230 → 290, 290) à l'étage : à l'étage tout le coin autour de la rampe (derrière, à côté et en dessous, jusqu'aux murs) est un **trou** dans le sol (on y voit le rez-de-chaussée) et un obstacle ; on ne peut donc pas passer derrière l'escalier. La zone de déclenchement du rez-de-chaussée est au pied (261, 270 → 286, 284) ; celle de l'étage (232, 238 → 250, 256) est au bout du palier. Le pilier de l'étage (242, 253) est déplacé en (231, 264) pour libérer le palier et le trou ; la pièce P8 est descendue de 4 px.
- Aucune zone n'est plus dessinée au sol.
