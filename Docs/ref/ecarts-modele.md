# Écarts entre la carte et le modèle 3D (lot 3g)

Généré par `node scripts/modele/rapport.mjs --ecrire` d'après `releve.json` (lui-même tiré du modèle par `scripts/modele/extraire.py` et `scripts/modele/releve.mjs`). Ne pas éditer à la main : relancer le script. Méthode, calage et procédure : `Docs/ref/affinage.md`. Page visuelle : `ecarts.html`.

## Calage

- Formule (celle du lot 3e) : px = (x + ox) × scale ; py = (oy − y) × scale (mètres du modèle, x est, y nord) ; scale 12, ox 5,0833, oy 28,9167.
- Résidu : **89,65 %** des pixels du contour de `plan.json` à 1 px au plus de la coupe pleine du modèle à 1,2 m ; meilleur décalage trouvé -2,5, 0,5 px (91 %), moins de 15 unités : le calage du lot 3e est gardé.
- Le mobilier relevé au lot 3b (M1 à M36) est en moyenne 9 unités au sud des objets du modèle (écart systématique, sous le seuil de 15 : ignoré).

## Résumé (nombre d'écarts par niveau et par nature)

| Étage | Niveau | mur | ouverture | fenêtre | pilier | escalier | meuble | objet |
|---|---|---|---|---|---|---|---|---|
| Rez-de-chaussée | moins-15 | 14 | 1 | 7 | 10 | 0 | 40 | 6 |
| Rez-de-chaussée | 15-60 | 1 | 1 | 0 | 0 | 1 | 8 | 7 |
| Rez-de-chaussée | plus-60 | 1 | 0 | 2 | 2 | 1 | 1 | 0 |
| Étage | moins-15 | 15 | 1 | 6 | 5 | 0 | 8 | 0 |
| Étage | 15-60 | 2 | 1 | 1 | 0 | 1 | 0 | 0 |
| Étage | plus-60 | 0 | 0 | 11 | 2 | 1 | 0 | 0 |

Niveaux : **moins-15** ignoré ; **15-60** appliqué en partie B par `scripts/modele/appliquer-decisions.mjs` quand le modèle est net ; **plus-60** signalé, jamais appliqué sans `approved: true`. Les escaliers, les portes et leurs ouvertures ne changent pas dans ce lot (`garder`), quel que soit l'écart.

## Rez-de-chaussée : écarts par élément

| Élément | Nature | Modèle | Écart (unités) | Niveau | Décision | Raison | Détails |
|---|---|---|---|---|---|---|---|
| contour-1 | mur | coupe | 13,4 | moins-15 | garder | écart sous 15 unités : ignoré | horizontal, couvert 65 % |
| contour-2 | mur | coupe | 14,2 | moins-15 | garder | modèle peu net : un mur du modèle ne longe que 11 % du segment (moins de 50 %) | ligne médiane du modèle à 135.2 px (carte 138) |
| contour-3 | mur | coupe | 3,7 | moins-15 | garder | écart sous 15 unités : ignoré | horizontal, couvert 96 % |
| contour-4 | mur | coupe | 5 | moins-15 | garder | écart sous 15 unités : ignoré | vertical, couvert 78 % |
| contour-5 | mur | coupe | 12,4 | moins-15 | garder | écart sous 15 unités : ignoré | horizontal, couvert 87 % |
| contour-6 | mur | coupe | 3,7 | moins-15 | garder | écart sous 15 unités : ignoré | vertical, couvert 86 % |
| contour-7 | mur | coupe | 9,7 | moins-15 | garder | écart sous 15 unités : ignoré | horizontal, couvert 54 % |
| contour-8 | mur | coupe | 0 | moins-15 | garder | écart sous 15 unités : ignoré | vertical, couvert 100 % |
| contour-9 | mur | coupe | 3,6 | moins-15 | garder | écart sous 15 unités : ignoré | horizontal, couvert 91 % |
| contour-10 | mur | coupe | 3,8 | moins-15 | garder | écart sous 15 unités : ignoré | vertical, couvert 100 % |
| contour-11 | mur | coupe | 11,7 | moins-15 | garder | écart sous 15 unités : ignoré | horizontal, couvert 79 % |
| contour-12 | mur | coupe | 12,6 | moins-15 | garder | écart sous 15 unités : ignoré | vertical, couvert 90 % |
| mur-interieur-1 | mur | coupe | 8 | moins-15 | garder | écart sous 15 unités : ignoré | vertical, couvert 100 % |
| mur-interieur-2 | mur | coupe | 26,2 | 15-60 | garder | modèle peu net : un mur du modèle ne longe que 12 % du segment (moins de 50 %) | ligne médiane du modèle à 132.8 px (carte 138) |
| mur-interieur-3 | mur | coupe | 0,1 | moins-15 | garder | écart sous 15 unités : ignoré | vertical, couvert 98 % |
| MC1 | mur | coupe | 232,5 | plus-60 | ajouter → {"x0":335,"y0":308,"x1":382,"y1":346,"kind":"cloison"} | cloison ou bloc du bâti sans équivalent dans la carte : à approuver | 335,307.5 → 381.5,346.3 px, 6 rectangle(s) |
| ouverture-aile | ouverture | coupe | 12,5 | moins-15 | garder | ouverture conforme au modèle | longueur 85 unités |
| ouverture-haut | ouverture | coupe | 15,1 | 15-60 | garder | ouverture conforme au modèle | longueur 445 unités |
| F1 | fenetre | MW10 | 1,5 | moins-15 | garder | écart sous 15 unités : ignoré | largeur du modèle 94.5 unités |
| F2 | fenetre | MW9 | 12 | moins-15 | garder | écart sous 15 unités : ignoré | largeur du modèle 95 unités |
| F3 | fenetre | MG1 | 11,2 | moins-15 | garder | écart sous 15 unités : ignoré | largeur du modèle 97.5 unités |
| F4 | fenetre | MW16 | 1 | moins-15 | garder | écart sous 15 unités : ignoré | largeur du modèle 97.5 unités |
| F5 | fenetre | MW4 | 6 | moins-15 | garder | écart sous 15 unités : ignoré | largeur du modèle 95 unités |
| F6 | fenetre | MW2 | 4,5 | moins-15 | garder | écart sous 15 unités : ignoré | largeur du modèle 95 unités |
| F7 | fenetre | aucun | 0 | plus-60 | garder | aucune fenêtre du modèle à moins de 70 unités : gardée (identifiant, largeur 72 et mur conservés) |  |
| F8 | fenetre | MW3 | 4,5 | moins-15 | garder | écart sous 15 unités : ignoré | largeur du modèle 95 unités |
| MW5 | fenetre | MW5 | 95 | plus-60 | garder | fenêtre ou trou du modèle sans fenêtre de la carte : hors du lot (mêmes fenêtres) | Component_6 en 467.6, 238.9 px, 95 unités |
| pilier 92,85 | pilier | MP1 | 10 | moins-15 | garder | écart sous 15 unités : ignoré | index 0 |
| pilier 92,147 | pilier | MP2 | 10 | moins-15 | garder | écart sous 15 unités : ignoré | index 1 |
| pilier 92,209 | pilier | MP7 | 8,5 | moins-15 | garder | écart sous 15 unités : ignoré | index 2 |
| pilier 92,255 | pilier | MP9 | 10 | moins-15 | garder | écart sous 15 unités : ignoré | index 3 |
| pilier 92,313 | pilier | MP13 | 7,5 | moins-15 | garder | écart sous 15 unités : ignoré | index 4 |
| pilier 198,255 | pilier | MP10 | 10 | moins-15 | garder | écart sous 15 unités : ignoré | index 5 |
| pilier 241,255 | pilier | MP11 | 11,2 | moins-15 | garder | écart sous 15 unités : ignoré | index 6 |
| pilier 198,313 | pilier | MP14 | 7,5 | moins-15 | garder | écart sous 15 unités : ignoré | index 7 |
| pilier 241,313 | pilier | MP15 | 9 | moins-15 | garder | écart sous 15 unités : ignoré | index 8 |
| pilier 198,228 | pilier | MP8 | 12,5 | moins-15 | garder | écart sous 15 unités : ignoré | index 9 |
| pilier 241,228 | pilier | aucun | 0 | plus-60 | garder | aucun pilier isolé du modèle à moins de 50 unités (pilier adossé ou absent) : gardé |  |
| MP12 | pilier | MP12 | 40 | plus-60 | ajouter → {"at":[52,312]} | pilier du modèle sans pilier de la carte : à approuver | 51.8, 311.5 px |
| escalier-courbe | escalier | ME2 | 70 | plus-60 | garder | règle du lot : escaliers inchangés (formes, walk.path, trous, garde-corps) | marches du modèle 251.4,229 → 292.3,271.3 px |
| escalier-aile | escalier | ME1 | 42,5 | 15-60 | garder | règle du lot : escaliers inchangés (formes, walk.path, trous, garde-corps) | marches du modèle 22.6,256.7 → 51.8,292.5 px |
| M1 | meuble | G30 | 10,5 | moins-15 | garder | écart sous 15 unités : ignoré | recouvrement 60 %, centre 1.8, -9.5 ; taille -1.5, 2 |
| M2 | meuble | G26 | 20,5 | 15-60 | corriger → {"x0":98,"y0":319,"x1":114,"y1":332,"kind":"table"} | objet du modèle O32 + O33 + O34 (Component_1, Component_2) | recouvrement 54 %, centre 1.7, -15.5 ; taille 7.5, 10 |
| M3 | meuble | G28 | 55 | 15-60 | retirer | doublon : recouverte à plus de 50 % par l'objet O37 déjà associé à M4 | comptoir |
| M4 | meuble | G28 | 41 | 15-60 | corriger → {"x0":65,"y0":321,"x1":82,"y1":332,"kind":"comptoir"} | objet du modèle O37 (Computer_desk_30x36x27) | recouvrement 36 %, centre -19, -10.2 ; taille 44, -1.5 |
| M5 | meuble | G27 | 11,5 | moins-15 | garder | écart sous 15 unités : ignoré | recouvrement 79 %, centre -0.3, -9 ; taille 1.5, 5 |
| M6 | meuble | G29 | 11,5 | moins-15 | garder | écart sous 15 unités : ignoré | recouvrement 47 %, centre 0.2, -9.3 ; taille 1.5, 4.5 |
| M7 | meuble | G31 | 9,5 | moins-15 | garder | écart sous 15 unités : ignoré | recouvrement 63 %, centre 1, -8.5 ; taille -3, 2 |
| M8 | meuble | G49 | 8,5 | moins-15 | garder | écart sous 15 unités : ignoré | recouvrement 83 %, centre 2, -8 ; taille -1, -1 |
| M9 | meuble | G34 | 10,5 | moins-15 | garder | écart sous 15 unités : ignoré | recouvrement 78 %, centre 1, -9.8 ; taille 1, 1.5 |
| M10 | meuble | G9 | 17 | 15-60 | corriger → {"x0":362,"y0":298,"x1":378,"y1":309,"kind":"table"} | objet du modèle O10 + O11 (Component_2) | recouvrement 60 %, centre 9.3, -8.2 ; taille 15.5, -1.5 |
| M11 | meuble | G10 | 10 | moins-15 | garder | écart sous 15 unités : ignoré | recouvrement 76 %, centre -0.7, -8.5 ; taille 0.5, -3 |
| M12 | meuble | G24 | 10 | moins-15 | garder | écart sous 15 unités : ignoré | recouvrement 42 %, centre 1.3, -8.7 ; taille -3.5, -2.5 |
| M13 | meuble | G36 | 11 | moins-15 | garder | écart sous 15 unités : ignoré | recouvrement 60 %, centre 0.5, -9.3 ; taille 1, -3.5 |
| M14 | meuble | G35 | 11 | moins-15 | garder | écart sous 15 unités : ignoré | recouvrement 51 %, centre -2.3, -9.3 ; taille 9.5, -3.5 |
| M15 | meuble | G23 | 10 | moins-15 | garder | écart sous 15 unités : ignoré | recouvrement 40 %, centre 1.3, -8.5 ; taille -3.5, 3 |
| M16 | meuble | G33 | 10,5 | moins-15 | garder | écart sous 15 unités : ignoré | recouvrement 78 %, centre 0.5, -10 ; taille 1, 1 |
| M17 | meuble | G22 | 9,5 | moins-15 | garder | écart sous 15 unités : ignoré | recouvrement 42 %, centre 1.3, -8 ; taille -3.5, 3 |
| M18 | meuble | G21 | 8,5 | moins-15 | garder | écart sous 15 unités : ignoré | recouvrement 47 %, centre 1.3, -7.5 ; taille -3.5, -2 |
| M19 | meuble | G20 | 9,5 | moins-15 | garder | écart sous 15 unités : ignoré | recouvrement 43 %, centre 1.3, -8.5 ; taille -3.5, -2 |
| M20 | meuble | G5 | 10 | moins-15 | garder | écart sous 15 unités : ignoré | recouvrement 79 %, centre -0.7, -8.7 ; taille 0.5, -2.5 |
| M21 | meuble | G11 | 17,5 | 15-60 | corriger → {"x0":445,"y0":257,"x1":462,"y1":263,"kind":"caisse"} | objet du modèle O13 + O14 + O15 (Vertical_filing_short, Component_2) | recouvrement 35 %, centre 2, -13.5 ; taille 1, 8 |
| M22 | meuble | G4 | 11 | moins-15 | garder | écart sous 15 unités : ignoré | recouvrement 87 %, centre 1.8, -9 ; taille -0.5, -4 |
| M23 | meuble | G6 | 8,5 | moins-15 | garder | écart sous 15 unités : ignoré | recouvrement 54 %, centre 2.8, -7.8 ; taille 0.5, -1.5 |
| M24 | meuble | G7 | 11 | moins-15 | garder | écart sous 15 unités : ignoré | recouvrement 43 %, centre 1.5, -9.5 ; taille 3, 3 |
| M25 | meuble | G8 | 11 | moins-15 | garder | écart sous 15 unités : ignoré | recouvrement 36 %, centre 1.5, -9.5 ; taille 3, 3 |
| M26 | meuble | G17 | 11,5 | moins-15 | garder | écart sous 15 unités : ignoré | recouvrement 65 %, centre 2.3, -10 ; taille -0.5, 3 |
| M27 | meuble | G12 | 9 | moins-15 | garder | écart sous 15 unités : ignoré | recouvrement 54 %, centre -1, -8.7 ; taille 1, -0.5 |
| M28 | meuble | G13 | 9,5 | moins-15 | garder | écart sous 15 unités : ignoré | recouvrement 44 %, centre -0.3, -8 ; taille 1.5, 3 |
| M29 | meuble | G18 | 9,5 | moins-15 | garder | écart sous 15 unités : ignoré | recouvrement 67 %, centre 1.3, -9.5 ; taille 0.5, 0 |
| M30 | meuble | G43 | 10,5 | moins-15 | garder | écart sous 15 unités : ignoré | recouvrement 48 %, centre 0.3, -10.3 ; taille 1.5, -0.5 |
| M31 | meuble | G14 | 8,5 | moins-15 | garder | écart sous 15 unités : ignoré | recouvrement 52 %, centre 2, -7.8 ; taille -1, -1.5 |
| M32 | meuble | G19 | 11 | moins-15 | garder | écart sous 15 unités : ignoré | recouvrement 56 %, centre -1.2, -9.2 ; taille 0.5, 3.5 |
| M33 | meuble | G41 | 11 | moins-15 | garder | écart sous 15 unités : ignoré | recouvrement 83 %, centre 0, -9 ; taille 1, -4 |
| M34 | meuble | G42 | 17 | 15-60 | corriger → {"x0":126,"y0":49,"x1":133,"y1":56,"kind":"etagere"} | objet du modèle O65 (Bar_stool) | recouvrement 34 %, centre 5.3, -12.7 ; taille 9.5, 8.5 |
| M35 | meuble | G40 | 11 | moins-15 | garder | écart sous 15 unités : ignoré | recouvrement 79 %, centre 0.8, -10.2 ; taille -0.5, 1.5 |
| M36 | meuble | MW10 | 75 | plus-60 | retirer | recouvre l'ouvrage de fenêtre MW10 (Component_6) : sans doute le cadre de la fenêtre, pas un meuble | comptoir |
| P1 | meuble | aucun | 0 | moins-15 | garder | pièce provisoire sans objet du modèle : gardée, toujours provisional | armoire |
| P2 | meuble | G38 | 40,5 | 15-60 | remplacer → {"x0":53,"y0":116,"x1":60,"y1":138,"kind":"etagere"} | pièce provisoire associée à O56 + O61 + O62 (shelf, Component_2) : remplacée par la pièce du modèle | recouvrement 45 %, centre -6.5, 30.2 ; taille -3, -20.5 |
| P3 | meuble | aucun | 0 | moins-15 | garder | pièce provisoire sans objet du modèle : gardée, toujours provisional | comptoir |
| P4 | meuble | G25 | 50,5 | 15-60 | remplacer → {"x0":112,"y0":325,"x1":134,"y1":332,"kind":"etagere"} | pièce provisoire associée à O31 (shelf) : remplacée par la pièce du modèle | recouvrement 25 %, centre -16, 29 ; taille 50, -43 |
| P5 | meuble | aucun | 0 | moins-15 | garder | pièce provisoire sans objet du modèle : gardée, toujours provisional | table |
| P6 | meuble | aucun | 0 | moins-15 | garder | pièce provisoire sans objet du modèle : gardée, toujours provisional | comptoir |
| P7 | meuble | aucun | 0 | moins-15 | garder | pièce provisoire sans objet du modèle : gardée, toujours provisional | comptoir |
| P8 | meuble | aucun | 0 | moins-15 | garder | pièce provisoire sans objet du modèle : gardée, toujours provisional | comptoir |
| P9 | meuble | aucun | 0 | moins-15 | garder | pièce provisoire sans objet du modèle : gardée, toujours provisional | table |
| P10 | meuble | aucun | 0 | moins-15 | garder | pièce provisoire sans objet du modèle : gardée, toujours provisional | caisse |
| P11 | meuble | aucun | 0 | moins-15 | garder | pièce provisoire sans objet du modèle : gardée, toujours provisional | armoire |
| P12 | meuble | aucun | 0 | moins-15 | garder | pièce provisoire sans objet du modèle : gardée, toujours provisional | table |
| P13 | meuble | aucun | 0 | moins-15 | garder | pièce provisoire sans objet du modèle : gardée, toujours provisional | caisse |
| G1 | objet | G1 | 110 | 15-60 | ajouter → {"x0":142,"y0":286,"x1":149,"y1":308,"kind":"etagere"} | objet du modèle sans équivalent : pièce solide proposée (règles de la carte vérifiées par npm run carte) | O1 (shelf), 137.8,285.9 → 145.1,307.9 px, sommet 2.13 m |
| G2 | objet | G2 | 109,5 | 15-60 | ajouter → {"x0":216,"y0":212,"x1":238,"y1":219,"kind":"etagere"} | objet du modèle sans équivalent : pièce solide proposée (règles de la carte vérifiées par npm run carte) | O2 (shelf), 216.4,209.3 → 238.3,216.7 px, sommet 2.13 m |
| G3 | objet | G3 | 123 | 15-60 | ajouter → {"x0":383,"y0":232,"x1":407,"y1":245,"kind":"etagere"} | objet du modèle sans équivalent : pièce solide proposée (règles de la carte vérifiées par npm run carte) | O3 (shelf), 382.8,226.9 → 407.4,240.2 px, sommet 2.42 m |
| G16 | objet | G16 | 99 | 15-60 | ajouter → {"x0":127,"y0":211,"x1":134,"y1":231,"kind":"etagere"} | objet du modèle sans équivalent : pièce solide proposée (règles de la carte vérifiées par npm run carte) | O21 (shelf), 128.3,211 → 135.6,230.8 px, sommet 2.13 m |
| G32 | objet | G32 | 109,5 | 15-60 | ajouter → {"x0":24,"y0":300,"x1":31,"y1":322,"kind":"etagere"} | objet du modèle sans équivalent : pièce solide proposée (règles de la carte vérifiées par npm run carte) | O45 (shelf), 23.2,300.2 → 30.5,322.1 px, sommet 2.13 m |
| G37 | objet | G37 | 109,5 | 15-60 | ajouter → {"x0":24,"y0":212,"x1":31,"y1":234,"kind":"etagere"} | objet du modèle sans équivalent : pièce solide proposée (règles de la carte vérifiées par npm run carte) | O54 + O55 (shelf, Component_2), 22.8,207.8 → 30.2,229.7 px, sommet 2.11 m |
| G39 | objet | G39 | 110 | 15-60 | ajouter → {"x0":53,"y0":93,"x1":63,"y1":115,"kind":"etagere"} | objet du modèle sans équivalent : pièce solide proposée (règles de la carte vérifiées par npm run carte) | O57 + O58 + O59 + O60 (shelf, Component_2), 52,93.2 → 62.1,115.2 px, sommet 2.13 m |
| G44 | objet | G44 | 40 | moins-15 | garder | décor léger (non solide) : catalogue de la partie C | O101 + O106 + O107 + O112 (sandbag), 186.7,219.2 → 194.7,224.5 px, sommet 0.42 m |
| G45 | objet | G45 | 40 | moins-15 | garder | décor léger (non solide) : catalogue de la partie C | O102 + O105 + O108 + O111 (sandbag), 180.9,218.5 → 188.9,223.9 px, sommet 0.42 m |
| G46 | objet | G46 | 40 | moins-15 | garder | décor léger (non solide) : catalogue de la partie C | O103 + O104 + O109 + O110 (sandbag), 175.1,217.9 → 183.1,223.3 px, sommet 0.42 m |
| G47 | objet | G47 | 32 | moins-15 | garder | décor léger (non solide) : catalogue de la partie C | O113 + O116 (sandbag), 172,218.3 → 177.4,224.7 px, sommet 0.34 m |
| G48 | objet | G48 | 39,5 | moins-15 | garder | décor léger (non solide) : catalogue de la partie C | O114 + O115 + O117 (sandbag), 171.4,222.3 → 177.1,230.2 px, sommet 0.34 m |
| G50 | objet | G50 | 21,5 | moins-15 | garder | décor léger (non solide) : catalogue de la partie C | O120 (Component_9), 235.5,309.3 → 238.9,313.6 px, sommet 2.01 m |

**Pièces provisoires associées à un objet du modèle** : P2 → G38, P4 → G25.
**Pièces provisoires sans objet du modèle** (restent `provisional`) : P1, P3, P5, P6, P7, P8, P9, P10, P11, P12, P13.
**Pièces déjà relevées sur le modèle** : M1 → G30, M2 → G26, M3 → G28, M4 → G28, M5 → G27, M6 → G29, M7 → G31, M8 → G49, M9 → G34, M10 → G9, M11 → G10, M12 → G24, M13 → G36, M14 → G35, M15 → G23, M16 → G33, M17 → G22, M18 → G21, M19 → G20, M20 → G5, M21 → G11, M22 → G4, M23 → G6, M24 → G7, M25 → G8, M26 → G17, M27 → G12, M28 → G13, M29 → G18, M30 → G43, M31 → G14, M32 → G19, M33 → G41, M34 → G42, M35 → G40, M36 → MW10.

**Objets du modèle sans équivalent** : G1 (meuble, shelf), G2 (meuble, shelf), G3 (meuble, shelf), G16 (meuble, shelf), G32 (meuble, shelf), G37 (meuble, shelf + Component_2), G39 (meuble, shelf + Component_2), G44 (decor-leger, sandbag), G45 (decor-leger, sandbag), G46 (decor-leger, sandbag), G47 (decor-leger, sandbag), G48 (decor-leger, sandbag), G50 (decor-leger, Component_9). Les meubles sont proposés comme pièces solides (partie B, 12 au plus au rez-de-chaussée, 8 à l'étage) ; le décor léger va au catalogue de la partie C.

**Objets au-dessus de 1,2 m** (luminaires, caisses posées haut) : O34 (Component_2, 1,22 à 1,55 m), O60 (Component_2, 1,3 à 1,74 m), O61 (Component_2, 1,3 à 1,74 m), O120 (Component_9, 1,62 à 2,01 m).

## Étage : écarts par élément

| Élément | Nature | Modèle | Écart (unités) | Niveau | Décision | Raison | Détails |
|---|---|---|---|---|---|---|---|
| contour-1 | mur | coupe | 1,7 | moins-15 | garder | modèle peu net : un mur du modèle ne longe que 27 % du segment (moins de 50 %) | ligne médiane du modèle à 22.7 px (carte 23) |
| contour-2 | mur | coupe | 3,8 | moins-15 | garder | modèle peu net : un mur du modèle ne longe que 21 % du segment (moins de 50 %) | ligne médiane du modèle à 137.2 px (carte 138) |
| contour-3 | mur | coupe | 0,4 | moins-15 | garder | écart sous 15 unités : ignoré | horizontal, couvert 75 % |
| contour-4 | mur | coupe | 1,3 | moins-15 | garder | écart sous 15 unités : ignoré | vertical, couvert 98 % |
| contour-5 | mur | coupe | 0 | moins-15 | garder | modèle peu net : un mur du modèle ne longe que 23 % du segment (moins de 50 %) | ligne médiane du modèle à 350 px (carte 350) |
| contour-6 | mur | coupe | 0,4 | moins-15 | garder | écart sous 15 unités : ignoré | vertical, couvert 100 % |
| contour-7 | mur | coupe | 3,7 | moins-15 | garder | écart sous 15 unités : ignoré | horizontal, couvert 88 % |
| contour-8 | mur | coupe | 4,7 | moins-15 | garder | écart sous 15 unités : ignoré | vertical, couvert 87 % |
| contour-9 | mur | coupe | 17,5 | 15-60 | garder | modèle peu net : un mur du modèle ne longe que 5 % du segment (moins de 50 %) | ligne médiane du modèle à 211.5 px (carte 208) |
| contour-10 | mur | coupe | 2,9 | moins-15 | garder | écart sous 15 unités : ignoré | vertical, couvert 58 % |
| mur-interieur-1 | mur | coupe | 4,7 | moins-15 | garder | écart sous 15 unités : ignoré | vertical, couvert 100 % |
| mur-interieur-2 | mur | coupe | 17,5 | 15-60 | garder | modèle peu net : un mur du modèle ne longe que 19 % du segment (moins de 50 %) | ligne médiane du modèle à 134.5 px (carte 138) |
| mur-interieur-3 | mur | coupe | 2,3 | moins-15 | garder | écart sous 15 unités : ignoré | vertical, couvert 72 % |
| MD1 | mur | coupe | 37,5 | moins-15 | garder | petit morceau de la coupe : ignoré | 135.5,278.5 → 138,286 px, 1 rectangle(s) |
| MD2 | mur | coupe | 37 | moins-15 | garder | petit morceau de la coupe : ignoré | 110.5,141.4 → 110.5,148.8 px, 1 rectangle(s) |
| MD3 | mur | coupe | 37 | moins-15 | garder | petit morceau de la coupe : ignoré | 117.5,141.4 → 117.5,148.8 px, 1 rectangle(s) |
| MD4 | mur | coupe | 37 | moins-15 | garder | petit morceau de la coupe : ignoré | 145,249.3 → 145,256.7 px, 1 rectangle(s) |
| porte-etage | ouverture | coupe | 40 | 15-60 | garder | le modèle ferme 40 unités de cette ouverture : signalé (porte et ouverture inchangées) | longueur 195 unités |
| ouverture-haut | ouverture | coupe | 7,5 | moins-15 | garder | ouverture conforme au modèle | longueur 440 unités |
| U1 | fenetre | MW6 | 2,5 | moins-15 | garder | écart sous 15 unités : ignoré | largeur du modèle 95 unités |
| U2 | fenetre | MW7 | 2,5 | moins-15 | garder | écart sous 15 unités : ignoré | largeur du modèle 95 unités |
| U3 | fenetre | MW12 | 5,5 | moins-15 | garder | écart sous 15 unités : ignoré | largeur du modèle 73 unités |
| U4 | fenetre | MW18 | 2 | moins-15 | garder | écart sous 15 unités : ignoré | largeur du modèle 73 unités |
| U5 | fenetre | MW17 | 22,5 | 15-60 | corriger → {"x":217} | centre du modèle (Component_8, Component_5) à 216.5 px | largeur du modèle 97.5 unités |
| U6 | fenetre | MW26 | 9,5 | moins-15 | garder | écart sous 15 unités : ignoré | largeur du modèle 73 unités |
| U7 | fenetre | MW24 | 6 | moins-15 | garder | écart sous 15 unités : ignoré | largeur du modèle 73.5 unités |
| MW8 | fenetre | MW8 | 94,5 | plus-60 | garder | fenêtre ou trou du modèle sans fenêtre de la carte : hors du lot (mêmes fenêtres) | Component_6 en 138.4, 214.3 px, 94.5 unités |
| MW13 | fenetre | MW13 | 73,5 | plus-60 | garder | fenêtre ou trou du modèle sans fenêtre de la carte : hors du lot (mêmes fenêtres) | Component_7 en 111.8, 22.5 px, 73.5 unités |
| MW14 | fenetre | MW14 | 74 | plus-60 | garder | fenêtre ou trou du modèle sans fenêtre de la carte : hors du lot (mêmes fenêtres) | Component_7 en 136.5, 28.3 px, 74 unités |
| MW19 | fenetre | MW19 | 73 | plus-60 | garder | fenêtre ou trou du modèle sans fenêtre de la carte : hors du lot (mêmes fenêtres) | Component_7 en 282.2, 309.4 px, 73 unités |
| MW20 | fenetre | MW20 | 73 | plus-60 | garder | fenêtre ou trou du modèle sans fenêtre de la carte : hors du lot (mêmes fenêtres) | Component_7 en 267.3, 306.7 px, 73 unités |
| MW21 | fenetre | MW21 | 62,5 | plus-60 | garder | fenêtre ou trou du modèle sans fenêtre de la carte : hors du lot (mêmes fenêtres) | Component_7 en 256.6, 296.9 px, 62.5 unités |
| MW22 | fenetre | MW22 | 72,5 | plus-60 | garder | fenêtre ou trou du modèle sans fenêtre de la carte : hors du lot (mêmes fenêtres) | Component_7 en 247.6, 285.3 px, 72.5 unités |
| MW23 | fenetre | MW23 | 74,5 | plus-60 | garder | fenêtre ou trou du modèle sans fenêtre de la carte : hors du lot (mêmes fenêtres) | Component_7 en 243, 271.3 px, 74.5 unités |
| MW25 | fenetre | MW25 | 73 | plus-60 | garder | fenêtre ou trou du modèle sans fenêtre de la carte : hors du lot (mêmes fenêtres) | Component_7 en 267.5, 348.4 px, 73 unités |
| MH1 | fenetre | MH1 | 97,5 | plus-60 | garder | fenêtre ou trou du modèle sans fenêtre de la carte : hors du lot (mêmes fenêtres) | trou du mur en 214.3, 350 px, 97.5 unités |
| MH2 | fenetre | MH2 | 127,5 | plus-60 | garder | fenêtre ou trou du modèle sans fenêtre de la carte : hors du lot (mêmes fenêtres) | trou du mur en 37.3, 208 px, 127.5 unités |
| pilier 83,83 | pilier | MQ1 | 0 | moins-15 | garder | écart sous 15 unités : ignoré | index 0 |
| pilier 83,145 | pilier | MQ2 | 0 | moins-15 | garder | écart sous 15 unités : ignoré | index 1 |
| pilier 83,208 | pilier | MQ3 | 3,5 | moins-15 | garder | écart sous 15 unités : ignoré | index 2 |
| pilier 83,253 | pilier | MQ5 | 0 | moins-15 | garder | écart sous 15 unités : ignoré | index 3 |
| pilier 231,264 | pilier | MQ6 | 77,8 | plus-60 | corriger → {"at":[242,253]} | pilier du modèle en 242, 253 px (déplacé par un lot précédent ?) : à approuver | index 4 |
| pilier 198,312 | pilier | MQ8 | 2,5 | moins-15 | garder | écart sous 15 unités : ignoré | index 5 |
| MQ4 | pilier | MQ4 | 50 | plus-60 | ajouter → {"at":[55,254]} | pilier du modèle sans pilier de la carte : à approuver | 55.3, 254 px |
| escalier-aile-etage | escalier | ME1 | 53,5 | 15-60 | garder | règle du lot : escaliers inchangés (formes, walk.path, trous, garde-corps) | marches du modèle 22.6,256.7 → 51.8,292.5 px |
| escalier-depart-etage | escalier | ME2 | 93,5 | plus-60 | garder | règle du lot : escaliers inchangés (formes, walk.path, trous, garde-corps) | marches du modèle 251.4,229 → 292.3,271.3 px |
| E1 | meuble | coupe | 0 | moins-15 | garder | relevée sur la coupe du bâti (cloison basse, pas un composant) : conforme | comptoir |
| E2 | meuble | G15 | 2,5 | moins-15 | garder | écart sous 15 unités : ignoré | recouvrement 87 %, centre 2, -0.8 ; taille 0, -3.5 |
| Q1 | meuble | aucun | 0 | moins-15 | garder | pièce provisoire sans objet du modèle : gardée, toujours provisional | etagere |
| Q2 | meuble | aucun | 0 | moins-15 | garder | pièce provisoire sans objet du modèle : gardée, toujours provisional | table |
| Q3 | meuble | aucun | 0 | moins-15 | garder | pièce provisoire sans objet du modèle : gardée, toujours provisional | armoire |
| Q4 | meuble | aucun | 0 | moins-15 | garder | pièce provisoire sans objet du modèle : gardée, toujours provisional | table |
| Q5 | meuble | aucun | 0 | moins-15 | garder | pièce provisoire sans objet du modèle : gardée, toujours provisional | caisse |
| Q6 | meuble | aucun | 0 | moins-15 | garder | pièce provisoire sans objet du modèle : gardée, toujours provisional | caisse |

**Pièces provisoires associées à un objet du modèle** : aucune.
**Pièces provisoires sans objet du modèle** (restent `provisional`) : Q1, Q2, Q3, Q4, Q5, Q6.
**Pièces déjà relevées sur le modèle** : E1 → coupe, E2 → G15.

**Objets du modèle sans équivalent** : aucun. Les meubles sont proposés comme pièces solides (partie B, 12 au plus au rez-de-chaussée, 8 à l'étage) ; le décor léger va au catalogue de la partie C.

**Objets au-dessus de 1,2 m** (luminaires, caisses posées haut) : aucun.

## Inventaire des objets du modèle (à l'intérieur du bâtiment)

Règles de classement (dans l'ordre, hauteurs au-dessus du sol de l'étage) : composant d'ouvrage de fenêtre (`Component_5` à `Component_8`) → relevé avec les fenêtres ; bas à plus de 1,2 m → décor léger (haut) ; côté court de moins de 0,12 m → décor léger (mince) ; sommet à 0,5 m au plus et aire de 0,6 m² au plus → décor léger (bas) ; posé au sol, sommet de 0,3 à 2,6 m, côté court d'au moins 0,25 m → meuble ; sinon inconnu. Piliers et escaliers viennent de la coupe et des marches du bâti, pas des composants.

| Objet | Composant | Étage | Boîte du plan (px) | Bas → sommet (m) | Classe (règle) |
|---|---|---|---|---|---|
| O1 | shelf | rdc | 137,8, 285,9 → 145,1, 307,9 | 0 → 2,13 | meuble (meuble) |
| O2 | shelf | rdc | 216,4, 209,3 → 238,3, 216,7 | 0 → 2,13 | meuble (meuble) |
| O3 | shelf | rdc | 382,8, 226,9 → 407,4, 240,2 | 0,12 → 2,42 | meuble (meuble) |
| O4 | shelf | rdc | 353,4, 228,6 → 381,3, 259,8 | 0,02 → 1,05 | meuble (meuble) |
| O5 | Vertical_filing_short | rdc | 379,5, 249,7 → 386,1, 266,9 | 0 → 0,38 | meuble (meuble) |
| O6 | Vertical_filing_short | rdc | 378,8, 249,5 → 386,9, 267 | 0,38 → 0,76 | meuble (meuble) |
| O7 | Vertical_filing_short | rdc | 292,5, 247,6 → 298,6, 254,3 | -0,01 → 1,42 | meuble (meuble) |
| O8 | Vertical_filing_short | rdc | 293, 242,8 → 298,6, 248,4 | 0,17 → 1,6 | meuble (meuble) |
| O9 | Vertical_filing_short | rdc | 293, 237,8 → 298,6, 242,4 | 0,05 → 1,46 | meuble (meuble) |
| O10 | Component_2 | rdc | 367,1, 298,6 → 378,4, 308,1 | 0,61 → 1,22 | inconnu (inconnu) |
| O11 | Component_2 | rdc | 362,3, 297,5 → 375,3, 309,2 | 0 → 0,61 | meuble (meuble) |
| O12 | Component_2 | rdc | 374,8, 293,6 → 388,9, 307 | 0 → 0,61 | meuble (meuble) |
| O13 | Vertical_filing_short | rdc | 446,4, 257,8 → 463,3, 263,1 | 0 → 0,38 | meuble (meuble) |
| O14 | Vertical_filing_short | rdc | 446,3, 256,5 → 463,5, 262,7 | 0,38 → 0,76 | meuble (meuble) |
| O15 | Component_2 | rdc | 457, 257,5 → 461,4, 261,4 | 0,78 → 0,99 | inconnu (inconnu) |
| O16 | Vertical_filing_short | rdc | 176,7, 223,3 → 193,9, 229,2 | 0 → 0,45 | meuble (meuble) |
| O17 | Vertical_filing_short | rdc | 137,8, 216,1 → 143,1, 220,7 | 0 → 1,41 | meuble (meuble) |
| O18 | Vertical_filing_short | rdc | 137,5, 210,6 → 143,3, 216,3 | -0,01 → 1,42 | meuble (meuble) |
| O19 | Component_2 | etage | 186,2, 235,4 → 195,4, 246,4 | 0 → 0,61 | meuble (meuble) |
| O20 | Component_2 | etage | 185,4, 235,2 → 195, 246,5 | 0,61 → 1,22 | inconnu (inconnu) |
| O21 | shelf | rdc | 128,3, 211 → 135,6, 230,8 | 0 → 2,13 | meuble (meuble) |
| O22 | Component_1 | rdc | 118,5, 219,7 → 129,4, 231,3 | 0 → 1,22 | meuble (meuble) |
| O23 | Component_2 | rdc | 118,2, 208,1 → 127,3, 219,1 | 0 → 0,61 | meuble (meuble) |
| O24 | Component_2 | rdc | 130,6, 172,5 → 135,8, 178,7 | -0,02 → 0,32 | decor-leger (bas) |
| O25 | Component_2 | rdc | 128,7, 171,8 → 135,8, 179,5 | 0,31 → 0,65 | meuble (meuble) |
| O26 | Vertical_filing_short | rdc | 130,6, 265,5 → 135,9, 270,1 | -0,01 → 1,4 | meuble (meuble) |
| O27 | Vertical_filing_short | rdc | 130,6, 270,7 → 135,9, 275,3 | -0,01 → 1,4 | meuble (meuble) |
| O28 | Vertical_filing_short | rdc | 130,6, 284,1 → 135,9, 288,7 | -0,01 → 1,4 | meuble (meuble) |
| O29 | Vertical_filing_short | rdc | 130,6, 289 → 135,9, 293,6 | -0,01 → 1,4 | meuble (meuble) |
| O30 | Vertical_filing_short | rdc | 130,6, 294,5 → 135,9, 299 | -0,01 → 1,4 | meuble (meuble) |
| O31 | shelf | rdc | 113,8, 326,1 → 135,8, 333,5 | 0 → 2,13 | meuble (meuble) |
| O32 | Component_1 | rdc | 98,2, 322,7 → 113,5, 332,9 | 0 → 0,61 | meuble (meuble) |
| O33 | Component_1 | rdc | 97,6, 319,9 → 114,1, 332,6 | 0,61 → 1,22 | inconnu (inconnu) |
| O34 | Component_2 | rdc | 104,5, 322,4 → 110,5, 327,4 | 1,22 → 1,55 | decor-leger (haut) |
| O35 | Component_1 | rdc | 81,3, 314,8 → 98,1, 331,6 | 0 → 0,61 | meuble (meuble) |
| O36 | Component_1 | rdc | 80,8, 314,7 → 97,3, 331,7 | 0,61 → 1,22 | inconnu (inconnu) |
| O37 | Computer_desk_30x36x27 | rdc | 64,8, 322,1 → 81,6, 332,8 | 0 → 0,8 | meuble (meuble) |
| O40 | Component_2 | rdc | 60,4, 321,2 → 64,6, 326,2 | 0 → 0,34 | decor-leger (bas) |
| O41 | Component_1 | rdc | 43,5, 324,9 → 56,9, 333,3 | 0 → 0,56 | meuble (meuble) |
| O42 | Component_1 | rdc | 43,5, 316,1 → 56,9, 324,5 | 0 → 0,56 | meuble (meuble) |
| O43 | Component_1 | rdc | 43,5, 316,1 → 56,9, 324,5 | 0,56 → 1,12 | inconnu (inconnu) |
| O44 | Component_1 | rdc | 43,8, 324,9 → 57,2, 333,3 | 0,56 → 1,12 | inconnu (inconnu) |
| O45 | shelf | rdc | 23,2, 300,2 → 30,5, 322,1 | 0 → 2,13 | meuble (meuble) |
| O46 | Component_1 | rdc | 30, 271,9 → 46,2, 289,1 | 0 → 0,61 | meuble (meuble) |
| O47 | Component_1 | rdc | 37,1, 294,9 → 52,3, 312,2 | 0 → 0,61 | meuble (meuble) |
| O48 | Component_2 | rdc | 43,3, 288,5 → 50,5, 295,8 | 0 → 0,42 | decor-leger (bas) |
| O49 | Component_2 | rdc | 36, 288,5 → 43,2, 295,8 | 0 → 0,42 | decor-leger (bas) |
| O50 | Component_2 | rdc | 40,9, 301,4 → 47,8, 309,4 | 0,61 → 0,95 | inconnu (inconnu) |
| O51 | Component_2 | rdc | 41,8, 302,9 → 47, 309,8 | 0,94 → 1,28 | inconnu (inconnu) |
| O52 | Component_2 | rdc | 41,6, 288,8 → 47,3, 294,8 | 0,43 → 0,85 | meuble (meuble) |
| O53 | Component_2 | rdc | 59,9, 320,7 → 65,2, 326,6 | 0,33 → 0,67 | meuble (meuble) |
| O54 | shelf | rdc | 22,8, 207,8 → 30,1, 229,7 | -0,02 → 2,11 | meuble (meuble) |
| O55 | Component_2 | rdc | 23,8, 209,1 → 30,2, 214,4 | 0,51 → 0,86 | inconnu (inconnu) |
| O56 | shelf | rdc | 52, 116,1 → 59,3, 138 | 0 → 2,13 | meuble (meuble) |
| O57 | shelf | rdc | 52, 93,2 → 59,3, 115,2 | 0 → 2,13 | meuble (meuble) |
| O58 | Component_2 | rdc | 53,1, 94,8 → 62,1, 103,7 | 0,53 → 0,98 | inconnu (inconnu) |
| O59 | Component_2 | rdc | 52,6, 105,1 → 59, 111,7 | 0,53 → 0,98 | inconnu (inconnu) |
| O60 | Component_2 | rdc | 52,2, 104,7 → 59,4, 112,1 | 1,3 → 1,74 | decor-leger (haut) |
| O61 | Component_2 | rdc | 52,6, 128,2 → 59, 134,9 | 1,3 → 1,74 | decor-leger (haut) |
| O62 | Component_2 | rdc | 52,6, 125,9 → 59,4, 134,1 | 0,53 → 0,8 | inconnu (inconnu) |
| O63 | Component_3 | rdc | 113,2, 24,8 → 136,1, 43,1 | 0 → 0,91 | meuble (meuble) |
| O64 | Component_3 | rdc | 123,9, 58,6 → 135,1, 78,8 | 0 → 0,91 | meuble (meuble) |
| O65 | Bar_stool | rdc | 126,1, 48,6 → 133, 56,3 | 0 → 1,17 | meuble (meuble) |
| O68 | Vertical_filing_short | rdc | 82,9, 211,3 → 99,8, 216,7 | 0 → 0,38 | meuble (meuble) |
| O69 | Vertical_filing_short | rdc | 83,1, 211 → 100,2, 216,9 | 0,38 → 0,76 | meuble (meuble) |
| O70 | Bar_stool | rdc | 90,6, 211,5 → 94,1, 215,5 | 0,76 → 1,51 | inconnu (inconnu) |
| O78 | Component_6 | rdc | 302,4, 348,7 → 321,4, 352,4 | 0 → 2,27 | fenetre (fenetre) |
| O79 | Component_6 | rdc | 152,4, 348,7 → 171,4, 352,4 | 0 → 2,27 | fenetre (fenetre) |
| O80 | Component_6 | rdc | 426,7, 348,7 → 445,7, 352,4 | 0 → 2,27 | fenetre (fenetre) |
| O82 | Component_6 | etage | 18,3, 221 → 22, 240 | 0 → 2,27 | fenetre (fenetre) |
| O86 | Component_6 | rdc | 65,8, 20,1 → 84,7, 23,8 | 0 → 2,27 | fenetre (fenetre) |
| O90 | Component_7 | etage | 133,7, 20,9 → 139,2, 35,7 | 0 → 0,91 | fenetre (fenetre) |
| O101 | sandbag | rdc | 188,2, 219,2 → 194,4, 224,2 | 0 → 0,14 | decor-leger (bas) |
| O102 | sandbag | rdc | 182,4, 218,5 → 188,6, 223,6 | 0 → 0,14 | decor-leger (bas) |
| O103 | sandbag | rdc | 176,6, 217,9 → 182,8, 223 | 0 → 0,14 | decor-leger (bas) |
| O104 | sandbag | rdc | 175,1, 217,9 → 181,3, 223 | 0,08 → 0,22 | decor-leger (bas) |
| O105 | sandbag | rdc | 180,9, 218,5 → 187, 223,6 | 0,08 → 0,22 | decor-leger (bas) |
| O106 | sandbag | rdc | 186,7, 219,2 → 192,8, 224,2 | 0,08 → 0,22 | decor-leger (bas) |
| O107 | sandbag | rdc | 188,5, 219,5 → 194,7, 224,5 | 0,18 → 0,32 | decor-leger (bas) |
| O108 | sandbag | rdc | 182,7, 218,9 → 188,9, 223,9 | 0,18 → 0,32 | decor-leger (bas) |
| O109 | sandbag | rdc | 177, 218,2 → 183,1, 223,3 | 0,18 → 0,32 | decor-leger (bas) |
| O110 | sandbag | rdc | 177, 218,2 → 183,1, 223,3 | 0,28 → 0,42 | decor-leger (bas) |
| O111 | sandbag | rdc | 182,7, 218,9 → 188,9, 223,9 | 0,28 → 0,42 | decor-leger (bas) |
| O112 | sandbag | rdc | 188,5, 219,5 → 194,7, 224,5 | 0,28 → 0,42 | decor-leger (bas) |
| O113 | sandbag | rdc | 172, 218,3 → 177,1, 224,4 | 0 → 0,14 | decor-leger (bas) |
| O114 | sandbag | rdc | 171,4, 224,1 → 176,5, 230,2 | 0 → 0,14 | decor-leger (bas) |
| O115 | sandbag | rdc | 172, 222,3 → 177,1, 228,4 | 0,1 → 0,24 | decor-leger (bas) |
| O116 | sandbag | rdc | 172,3, 218,6 → 177,4, 224,7 | 0,2 → 0,34 | decor-leger (bas) |
| O117 | sandbag | rdc | 171,7, 223,8 → 176,8, 229,9 | 0,2 → 0,34 | decor-leger (bas) |
| O118 | Call_of_Duty__World_at_War_Nazi_Zombies__Mystery_Box_ | rdc | 107,5, 300,5 → 132,3, 321,3 | 0 → 0,45 | meuble (meuble) |
| O120 | Component_9 | rdc | 235,5, 309,3 → 238,9, 313,6 | 1,62 → 2,01 | decor-leger (haut) |
| O121 | Component_7 | etage | 274,9, 307,9 → 289,5, 310,9 | 0 → 0,91 | fenetre (fenetre) |
| O122 | Component_7 | etage | 260, 303 → 274,6, 310,3 | 0 → 0,91 | fenetre (fenetre) |
| O123 | Component_7 | etage | 250,8, 290,6 → 262,4, 303,1 | 0 → 0,91 | fenetre (fenetre) |
| O124 | Component_7 | etage | 243,7, 278 → 251,5, 292,5 | 0 → 0,91 | fenetre (fenetre) |
| O125 | Component_7 | etage | 240,3, 263,8 → 245,7, 278,7 | 0 → 0,91 | fenetre (fenetre) |
| O126 | Component_7 | etage | 274,8, 346,9 → 289,5, 349,9 | 0 → 0,91 | fenetre (fenetre) |
| O127 | Component_7 | etage | 260,2, 346,9 → 274,8, 349,9 | 0 → 0,91 | fenetre (fenetre) |
| O128 | Component_7 | etage | 245,6, 346,9 → 260,2, 349,9 | 0 → 0,91 | fenetre (fenetre) |

Hors du bâtiment (décor extérieur du modèle, non comparé : `decor.json` ne change pas) : 112 objets — red_barrel × 26, Component_7 × 14, Component_2 × 10, Component_1 × 7, white_barrel × 7, blown_barrel × 6, Component_6 × 5, Olive_tree_high_polygon × 5, Flatbed_truck × 4, SimpleDome02 × 4, Component_8 × 3, Loaded_electrical_distribution_1 × 3, Winter_dead_pine_tree_high_poly × 3, Winter_tree × 3, Component_5 × 2, Winter_poplar_tree × 2, Geometric_tree × 2, Component_9 × 1, Trailer_Generator × 1, Winter_dead_pine_tree_high_poly_1 × 1, Electrical_transmission_lattice_140_ × 1, Loaded_electrical_distribution × 1, Victorian_lamp_post × 1.

## Escaliers et fenêtres du modèle

- ME1 : 22,6, 256,7 → 51,8, 292,5 px, 7 niveaux de marche jusqu'à 2,13 m.
- ME2 : 251,4, 229 → 292,3, 271,3 px, 12 niveaux de marche jusqu'à 2,29 m.
- ME3 : 257, -72 → 271, -69,5 px, 6 niveaux de marche jusqu'à 0,91 m (hors du bâtiment).
- ME4 : 256,6, 183,5 → 300,5, 205,4 px, 16 niveaux de marche jusqu'à 2,29 m (hors du bâtiment).
- Ouvrages de fenêtre (composants) : 36, dont 20 au rez-de-chaussée et 16 à l'étage (les barrières de planches du décor extérieur en font partie).

## Matières et couleurs du modèle

Couleur diffuse (0 à 255) quand le modèle en donne une ; sinon le nom de l'image de texture (jamais importée ni reproduite : les teintes du jeu restent générées en code).

| Matière | Couleur (R, G, B) | Image de texture | Triangles |
|---|---|---|---|
| material | 255, 255, 255 | — | 119459 |
| material_13 | — | material_13.jpg | 72968 |
| material_4 | — | material_4.jpg | 46940 |
| __DarkSeaGreen_ | 16, 25, 16 | — | 31800 |
| __PaleGreen_ | 187, 229, 194 | — | 31800 |
| __SaddleBrown_1 | 139, 69, 19 | — | 24128 |
| material_3 | — | material_3.jpg | 19423 |
| __Black_ | 0, 0, 0 | — | 16784 |
| material_15 | — | material_15.jpg | 15043 |
| Stone_Vein_Gray | — | Stone_Vein_Gray.jpg | 12671 |
| material_8 | — | material_8.jpg | 7930 |
| Fencing_Wood_Old | — | Fencing_Wood_Old.jpg | 6506 |
| Metal_Rough | — | Metal_Rough.jpg | 5708 |
| __SaddleBrown_ | 84, 41, 11 | — | 5088 |
| Metal_Rusted | — | Metal_Rusted.jpg | 3570 |
| __DarkGray_ | 81, 81, 81 | — | 3362 |
| White1 | 255, 234, 85 | — | 3080 |
| material_7 | — | material_7.jpg | 3037 |
| material_1 | — | material_1.jpg | 2955 |
| __Gainsboro_ | 43, 37, 30 | — | 2240 |
| Groundcover_Sand_Smooth | — | Groundcover_Sand_Smooth.jpg | 1925 |
| __Gray3_ | 181, 181, 181 | — | 1894 |
| material_6 | — | material_6.jpg | 1787 |
| material_11 | — | material_11.jpg | 1692 |
| Stone_Pavers_Flagstone_Gray | — | Stone_Pavers_Flagstone_Gray.jpg | 1621 |
| Wood_Plywood_Knots | — | Wood_Plywood_Knots.jpg | 1440 |
| __Charcoal_ | 35, 35, 35 | — | 1300 |
| material_5 | — | material_5.jpg | 1189 |
| white2 | 224, 224, 211 | — | 1120 |
| __CoolGray5_ | 143, 145, 153 | — | 982 |
| __Pale_Brown_ | 212, 167, 108 | — | 952 |
| __WarmGray4_ | 66, 65, 54 | — | 798 |
| Groundcover_RiverRock_4inch | — | Groundcover_RiverRock_4inch.jpg | 568 |
| Fencing_Diamond_Mesh | — | Fencing_Diamond_Mesh.png | 456 |
| __Yellow_Green_ | 23, 45, 21 | — | 440 |
| __Ivory_ | 255, 255, 240 | — | 432 |
| Charcoal_Light | 45, 45, 45 | — | 416 |
| __Light_Oliv_ | 40, 81, 35 | — | 406 |
| __Olive_ | 31, 51, 31 | — | 304 |
| __LightGray_ | 169, 169, 169 | — | 252 |

