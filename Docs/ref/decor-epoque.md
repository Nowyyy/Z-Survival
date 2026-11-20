# Décor extérieur d'époque (lot 9h) — relevé et plan
Carte 1 (« Night of the Undead », 1942). Base : `origin/dev` `7514702` (seed 0.38), puis `d43689a` (lot 9g fusionné). **« GO 9h » du propriétaire : tout gardé, variantes proposées** (`data/game/decor-epoque-choix.json` inchangé) ; valeurs provisoires (positions, couleurs).

## Extérieur actuel (relevé sur `origin/dev`)
- Monde 4040 × 3460 ; bâtiment en L (contour de `world.json`) ; 7 fenêtres au rez-de-chaussée (F1 nord, F2 est, F3 ouest, F4 nord, F5, F6, F8 sud), 7 à l'étage (U1 à U7).
- **Couloirs d'approche** (160 de large, de la fenêtre au bord du monde, `js/core/decor.js`) : seul du sol y est posé. **14 points d'apparition** (`decor.json`, deux par fenêtre, à 450 et 650 du mur, dans les couloirs). Champ de flux par fenêtre (`nav.js`, cases de 20, rayon 20 + 4).
- **Décor solide à graine** (`decor.json` → `generateDecor`) : 4 voitures modernes sur la route du sud (92 × 46, 55 de haut ; `ex.props` : **seules à projeter une ombre** ; 632 triangles), 24 arbres (troncs 32 × 32) ; décoratifs : 18 buissons, 3 lampadaires, 4 barrières. Tous les solides arrêtent balles et laser (`shotBlockers`).
- **Épaves** (lot 5a, `epaves.json` → `npm run carte` → `decor.json.wrecks`, `js/core/epaves.js`) : voiture en flammes (3299, 2397 ; 92 × 46, solide ; feu à deux foyers, 2 appels dans le champ, **source de lumière** du lot 5k : `--game-fire-edge`, réglages `feux` de `lumieres.json`) ; hélicoptère dans l'angle du L (centre 1650, 1705, cap 150°, bord 40 ; 3 rectangles solides ; emprise 252 × 184 ; 63 de haut ; tôle 274 triangles + rotor 24, **2 appels** dans le champ ; verrière dans l'atlas ; cratère et traînée plats, 287 triangles ; fumée sans flammes, 1 appel, n'éclaire pas). Aucune ombre portée pour les épaves.
- **Décor vivant** (lot 3g, `decor-vivant.js`, non solide) : 22 arbres morts, clôture de barbelés (88 piquets, 8 fils), **7 poteaux électriques** de 150 sur le trottoir du sud et 6 câbles, flaques, herbes, 5 tas de gravats, 2 bidons en feu (sources de lumière).
- Maillage du décor de l'atlas (`ex.scenery`) : 5 304 triangles, dessiné partout (étendu au monde). Partie R1 : 39 appels, 12 661 triangles ; pire cas mesuré U4 ≈ 37 400 triangles (plafonds 400 et 45 000).

## Références (graines fixes, `origin/dev`)
- Trace `trace-logique.mjs` 6 × 600 : finales `409ba42b…`, `d35b3564…`, `f68e7922…`, `8541f81b…`, `11477f95…`, `7e7b3937…` (chaînes `ba1fdc84…`, `a20f7972…`, `3121245c…`, `55cf7f58…`, `f9647b35…`, `da4ed5fd…`).
- Arrivées (`scripts/perf/arrivees.mjs`, manche 10, graines 1 à 6, 3 000 pas, portes ouvertes) : 60 zombies, 60 arrivés ; médianes F1 3,3 s · F2 5,1 · F3 3,75 · F4 5,35 · F5 3,35 · F6 2,8 · F8 3,25 (étage U1 à U7 : 2,2 à 8,65).

## Objets proposés (mesurés à la partie B ; 28 unités par mètre, soit 35 × 0,8 comme les armes ; hauteurs plafonnées)
| Objet | Variantes (triangles) | Jeu (emprise) | Hauteur | Tirs (arme 43) | Collision |
|---|---|---|---|---|---|
| Véhicules abandonnés (4, places des voitures) | Jeep 188 · Kübelwagen 196 · mélange (défaut) | 92 × 46 (inchangé) | 37 | passent | rectangle 92 × 46 |
| Camion (nouveau, barrage de la route) | Dodge WC-51 178 · Opel Blitz 216 | 120 × 56 · 150 × 58 | 53-54 | arrêtés | son rectangle |
| Véhicule en flammes (même centre) | Jeep 152 · Kübelwagen 164 · Dodge 164 | 86-120 × 46-56 | 28-34 | passent | son rectangle |
| Avion (angle du L, cap 165°) | P-51A 260 (aile arrachée) · P-47 256 · P-40 233 (queue cassée) | ≈ 214 × 260 | 52-59 | fuselage et dérive arrêtés (P-40 : fuselage 40, passent) ; ailes et débris passent | 3 ou 4 rectangles (fuselage, aile, queue, débris) |
| Parachute dans un arbre mort | déployé 128 · pendu 78 · au sol 106 | ≈ 100 | 85 | sans effet | aucune |
| Barbelés | rouleaux 246 · piquets 182 · simple 104 | 123 × 34 | 22-30 | passent | rectangle dessiné |
| Hérissons tchèques | seul 42 · rangée de 3 126 · rouillé 40 | 42-162 × 42-47 | 40 | passent | rectangle dessiné |
| Jerrycans | pile 114 · rangée 110 · renversés 88 | 28-56 × 13-33 | 15-30 | passent | rectangle dessiné |
| Caisses au pochoir | pile 32 · rangée 40 · ouverte 44 | 32-120 × 21-43 | 10-20 | passent | rectangle dessiné |
| Trous d'obus (6) | petit 50 · moyen 60 · double 90 | 73-111 | 5 (plats) | sans effet | aucune |
| Poteaux télégraphiques (7, pieds des poteaux électriques) | une traverse 35 · deux 59 · un sur deux penché 35 ; fils 4 par portée | 10 × 9 (pied ; traverse à 140 sans collision) | 150 | arrêtés | pied |
| Panneau fléché | deux flèches 34 · trois 46 · tombé 40 | 66 × 15-43 | 56 (tombé 14) | arrêtés (tombé : sans effet) | rectangle dessiné (tombé : aucune) |
| Projecteur ou artillerie (champ du nord-est) | projecteur éteint 184 · obusier 105 120 · antichar 57 120 | 104-142 × 50-60 | 60 · 50 · 36 | arrêtés · arrêtés · passent | rectangle dessiné |
- Marquages : numéros et bandes inventés, étoile américaine permise (avion, Jeep, camion) ; **aucun symbole nazi ni politique, aucune marque** (Kübelwagen et Blitz sans croix ni plaque d'unité).
- Tout en code : formes de triangles (comme `epaves.js`) et une texture générée de 256 px (« atlas d'époque » : tôle olive, toile, bois au pochoir, acier brut) ; aucune image importée.

## Principes de placement
- Rien de solide dans un couloir d'approche (marge 20) ni à moins de 70 d'un point d'apparition ; ≥ 160 du bâtiment (règle du décor solide), sauf l'avion, au bord (40) comme l'hélicoptère ; règles de `npm run carte` (fenêtres dégagées, lampes et feux à leur place).
- Rien de clair ou de vif à moins de 300 d'une fenêtre (parachute, panneaux) ; décor bas et sombre loin des chemins ; hauteurs ≤ 55 (véhicules), ≤ 63 (avion), poteaux comme aujourd'hui.
- Composition : barrage routier abandonné sur la route du sud (hérissons, barbelés, panneau, jerrycans, camion), avion et parachute dans l'angle du L, pièce d'artillerie ou projecteur dans le champ du nord-est, trous d'obus dans les champs, poteaux télégraphiques le long du trottoir.
- Positions : `data/game/maps/rez-de-chaussee/decor-epoque.json` (unités du jeu), vérifiées par `npm run carte` (sans écrire de fichier lu par la partie avant le « GO 9h »).

## Budget visé
- Au plus +4 appels et +3 000 triangles au pire cas : un maillage fusionné de plus (atlas d'époque, sans ombre portée), moins les deux de l'hélicoptère (tôle et rotor) ; véhicules abandonnés dans le maillage à ombre des voitures (même nombre d'ombres) ; trous d'obus dans le sol (aucun appel) ; feu, fumée et lumière du véhicule en flammes et fumée de l'avion gardés.

## Atelier et plan (partie B)
- `atelier-decor.html` (`js/atelier-decor/main.js`, lien du menu de débogage) : vue du jeu 667 × 375 et 1920 × 1080 (caméra du jeu, herbe, lune, brouillard, feu, repère zombie de 61), gros plan qui tourne (immobile en mouvement réduit), planche des 38 variantes, budget, plan (emprises, hauteurs, tirs, collisions, arbres gardés, chemins avant / après), revue du contenu, choix à recopier.
- Plan (choix par défaut) : 29 objets dont 22 solides, 0 problème pour **toutes** les variantes ; 14 chemins de zombies intacts, aucun allongé ; `npm run carte -- --verifie` contrôle le plan sans écrire de fichier lu par la partie.
- Budget : plan +3 297 triangles (objets et fils), −1 322 retirés (hélicoptère 310, voitures 632, voiture en flammes 158, poteaux et câbles 222) : **solde +1 975** (≤ +3 000) ; appels : +1 maillage d'époque, −2 de l'hélicoptère.
- Jeu inchangé : trace 6 × 600 identique à chaque pas à `origin/dev` ; la partie ne charge aucun module du décor d'époque (test).

## Dans la partie (partie C)
- `npm run carte` contrôle le plan sur le décor d'avant puis l'écrit dans `decor.json` (clé `epoque` : objets, spec, rectangles, remplacements, cicatrices de l'avion, couleurs) ; `generateDecor` l'applique après le tirage à graine (véhicules aux rectangles des voitures, mêmes identifiants ; avion à la place de l'hélicoptère ; objets solides de kind `epoque` ; petit décor qui les touche retiré) ; le décor vivant les traite comme des épaves. `?test=1&decor=avant` (jamais mémorisé) : décor d'avant.
- Dessin (`js/game/world.js`) : un maillage d'époque sans ombre portée et un maillage des 4 véhicules avec ombre (comme les voitures d'avant ; le maillage des voitures disparaît) ; trous d'obus, cratère et traînée dans le sol ; poteaux télégraphiques à la place des poteaux électriques et de leurs câbles ; feu, fumée et lumière du véhicule en flammes (mêmes identifiant et réglages), fumée légère de l'avion.
- Tirs : `tirs-traversables.json` + 13 rectangles dessinés sous 43 (voitures 1 à 4 et en flammes, ailes et débris de l'avion, hérissons, barbelés, jerrycans, caisses), vérifiés par `npm run carte`.
- Preuves : trace 6 × 600 identique à chaque pas à `origin/dev`, avec et sans `decor=avant` (rien n'entre dans un couloir ; aucun tir des scénarios ne croise un objet) ; arrivées identiques (60 zombies) ; `blocage.mjs` : aucun zombie coincé ; budget (`mesurer.mjs --ref --ref-memes-reglages`, R1, R2, U1, U4 × 3 préréglages) : −1 à +1 appel, +1 588 à +2 158 triangles ; pire cas U4 Élevé 39 039 triangles (37 291 avant), 92 appels ; aucune ombre portée de plus.

## Tests prévus
- Unitaires (`decor-epoque.test.js`) : modèles purs et déterministes, budgets, hauteurs, tirs (< 43 traversable), emprises, fichier de choix (invalide = défaut), placement (couloirs, apparitions, bâtiment, fenêtres), chemins de chaque point d'apparition vers sa fenêtre jamais coupés, contenu (aucun symbole interdit dans les données).
- E2e (`atelier-decor.spec.js`) : toutes les variantes se construisent sous budget, vues et plan, mouvement réduit, axe, aucune requête externe, aucune écriture ; jeu inchangé avant le GO (trace identique, `npm run carte -- --verifie`).
