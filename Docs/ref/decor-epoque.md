# Décor extérieur d'époque (lot 9h) — relevé et plan
Carte 1 (« Night of the Undead », 1942). Base : `origin/dev` `7514702` (seed 0.38). Valeurs provisoires jusqu'au « GO 9h » du propriétaire.

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

## Objets proposés (échelle : 28 unités par mètre, soit 35 × 0,8 comme les armes ; hauteurs plafonnées, véhicules ≤ 55)
| Objet | Variantes | Réel → jeu (L × l × h) | Tirs (arme 43) | Collision | Triangles visés |
|---|---|---|---|---|---|
| Véhicules abandonnés (4, places des voitures) | Jeep Willys MB · Kübelwagen · mélange | 3,4 × 1,6 × 1,3 m → 92 × 46 × 40 | arrêtés | rectangle 92 × 46 (inchangé) | ≤ 200 chacun |
| Camion (nouveau) | Dodge WC-51 · Opel Blitz (sans insigne) | 4,2-6 × 2,1-2,3 × 2,1 m → 120-150 × 56 × 55 | arrêtés | son rectangle | ≤ 300 |
| Véhicule en flammes (même place) | Jeep · Kübelwagen · camion | → 92 × 46 (camion 120 × 56, même centre) | arrêtés | son rectangle | ≤ 200 |
| Avion écrasé (angle du L) | P-51A Mustang (aile arrachée) · P-47 Thunderbolt · P-40 Warhawk | 9,8 × 11,3 m → ≈ 216 × 248 à 22 u/m ; dérive ≤ 60 | fuselage et dérive : arrêtés ; aile (≈ 15) : passent | 3 rectangles (fuselage, aile, queue) | ≤ 700 ; hélice tordue immobile |
| Parachute dans un arbre mort | déployé sur la couronne · pendu à une branche · à moitié au sol | voilure 7 m → ≈ 100 | sans effet | aucune | ≤ 200 |
| Barbelés | rouleaux (concertina) · piquets et fils croisés · rouleau simple | 0,9 m → 25 | passent | rectangle dessiné | ≤ 150 par groupe |
| Hérissons tchèques | seul · rangée de 3 · rouillé penché | 1,4 m → 38 | passent | rectangle dessiné | 30 chacun |
| Jerrycans | pile · rangée · renversés | 0,47 m → 13-26 | passent | rectangle dessiné | ≤ 120 |
| Caisses de munitions au pochoir | pile 2 + 1 · rangée · ouverte | 0,9 m → 25-30 | passent | rectangle dessiné | ≤ 80 |
| Trous d'obus | petit · moyen · double | 2-5 m → 60-140 | sans effet (plats) | aucune | ≤ 50 chacun |
| Poteaux télégraphiques (remplacent les poteaux électriques) | une traverse · deux traverses · penché, fils cassés | 7 m → 150 (inchangé) | arrêtés | 10 × 10 | ≤ 30 chacun + fils |
| Panneaux militaires fléchés | poteau à 2 flèches · 3 flèches · panneau tombé | 2 m → 56 | arrêtés (poteau seul) | 10 × 10 | ≤ 40 |
| Projecteur de DCA ou pièce d'artillerie | projecteur sur remorque (éteint) · obusier 105 · canon antichar 57 | 2 m → 56 · 1,6 → 45 · 1,3 → 36 | arrêtés · arrêtés · passent | rectangle dessiné | ≤ 300 |
- Marquages : numéros et bandes inventés, étoile américaine permise (avion, Jeep, camion) ; **aucun symbole nazi ni politique, aucune marque** (Kübelwagen et Blitz sans croix ni plaque d'unité).
- Tout en code : formes de triangles (comme `epaves.js`) et une texture générée de 256 px (« atlas d'époque » : tôle olive, toile, bois au pochoir, acier brut) ; aucune image importée.

## Principes de placement
- Rien de solide dans un couloir d'approche (marge 20) ni à moins de 70 d'un point d'apparition ; ≥ 160 du bâtiment (règle du décor solide), sauf l'avion, au bord (40) comme l'hélicoptère ; règles de `npm run carte` (fenêtres dégagées, lampes et feux à leur place).
- Rien de clair ou de vif à moins de 300 d'une fenêtre (parachute, panneaux) ; décor bas et sombre loin des chemins ; hauteurs ≤ 55 (véhicules), ≤ 63 (avion), poteaux comme aujourd'hui.
- Composition : barrage routier abandonné sur la route du sud (hérissons, barbelés, panneau, jerrycans, camion), avion et parachute dans l'angle du L, pièce d'artillerie ou projecteur dans le champ du nord-est, trous d'obus dans les champs, poteaux télégraphiques le long du trottoir.
- Positions : `data/game/maps/rez-de-chaussee/decor-epoque.json` (unités du jeu), vérifiées par `npm run carte` (sans écrire de fichier lu par la partie avant le « GO 9h »).

## Budget visé
- Au plus +4 appels et +3 000 triangles au pire cas : un maillage fusionné de plus (atlas d'époque, sans ombre portée), moins les deux de l'hélicoptère (tôle et rotor) ; véhicules abandonnés dans le maillage à ombre des voitures (même nombre d'ombres) ; trous d'obus dans le sol (aucun appel) ; feu, fumée et lumière du véhicule en flammes et fumée de l'avion gardés.

## Atelier prévu (partie B)
- `atelier-decor.html` (page technique, lien dans le menu de débogage) : chaque objet en variantes, vue du jeu (667 × 375 et 1920 × 1080 : caméra du jeu, sol extérieur, lune, brouillard, lumière de feu), gros plan qui tourne (immobile en mouvement réduit), budget par variante ; plan de placement (carte entière, emprises, hauteurs, collisions, tirs ; chemins des zombies avant / après, longueurs) ; choix à recopier dans `data/game/decor-epoque-choix.json` (invalide = défaut).

## Tests prévus
- Unitaires (`decor-epoque.test.js`) : modèles purs et déterministes, budgets, hauteurs, tirs (< 43 traversable), emprises, fichier de choix (invalide = défaut), placement (couloirs, apparitions, bâtiment, fenêtres), chemins de chaque point d'apparition vers sa fenêtre jamais coupés, contenu (aucun symbole interdit dans les données).
- E2e (`atelier-decor.spec.js`) : toutes les variantes se construisent sous budget, vues et plan, mouvement réduit, axe, aucune requête externe, aucune écriture ; jeu inchangé avant le GO (trace identique, `npm run carte -- --verifie`).
