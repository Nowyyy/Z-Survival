# Armes — modèles 3D, caisse d'armes, visuels du menu (lot 9c, V0.9)
Atelier seulement (`atelier-armes.html`, à retirer au lot 13) : **rien n'est branché sur la partie** (statistiques, prix, cartes : lot d'intégration).

## Échelle et taille à l'écran (relevées sur `origin/dev` `2752cc1`)
- Personnage du joueur (v2) : **61 unités** de haut (≈ 1,75 m), 28 de large bras compris ; articulation `prop` (arme) à 13 devant la poitrine.
- Échelle des armes : **35 unités par mètre** (`data/armes/armes.json` → `echelle`) ; `echelle.lisibilite` (1) agrandit toutes les armes d'un coup.
- Caméra du jeu (bâtiment) : champ 40°, inclinaison 75°, distance 704,5 → **0,731 px par unité à 667 × 375, 2,106 à 1920 × 1080**.
- Mesuré sur image dans l'atelier (fond noir, lumière du jeu) : personnage ≈ **20 × 25 px** (667 × 375) et **56 × 72 px** (1920 × 1080) ; pistolet actuel (glissière 14, calculé) 10 / 29 px, soit **1,84 fois** un vrai M1911 ; M1911 réel : **4 × 6 px / 8 × 16 px** ; Kar98k 12 × 28 / 35 × 80 ; Panzerschreck 20 × 42 / 56 × 121.

## Matières, couleurs, textures
- Géométrie pure `js/core/armes/` (sans Three.js) : `geometrie.js` (boîtes, tubes, profils extrudés, lofts → triangles), `modeles.js` (une fonction par arme, en mm ; repère : z vers la bouche, y en haut, x à gauche de l'arme, origine à la main droite), `armes.js` (données, variantes, choix, poses), `atlas.js`, `caisse.js`, `visuel.js` (SVG). Rendu : `js/armes/rendu.js` ; page : `js/armes/atelier.js`.
- Une géométrie fusionnée et **une matière `MeshLambertMaterial`** (atlas + couleurs de sommet) par arme : **un appel** (mesuré). Pas de `MeshStandardMaterial`.
- **Atlas commun 256 × 256** généré en code (16 tuiles de 64 px : bruni, bruni usé, phosphaté, phosphaté usé, noyer, hêtre, bakélite, cuir, toile, laiton, olive, olive écaillé, feldgrau, sable, tôle perforée, caoutchouc) ; une variante change les tuiles et des détails, jamais l'identité.
- Couleurs : jetons `--arm-*` de **`css/armes.css`** (une déclaration `#rrggbb` par ligne ; aussi les classes des visuels 2D), chargée par l'atelier seulement ; `tokens.css` non touché. Garde-fous `tokens.test` et `attente.spec` adaptés comme au lot 8f.

## Les dix armes (longueur réelle → jeu à 35 u/m ; triangles réels : le plus grand des poses « en main » et « posée »)
| Identifiant | Arme | Réelle | Jeu | Triangles (a / b / c) | Variantes |
|---|---|---|---|---|---|
| `m1911` | Colt M1911 | 216 mm | 7,5 | 240 / 240 / 240 | phosphaté et noyer ; bronzé et bakélite ; usé |
| `kar98k` | Kar98k | 1 110 mm | 38,7 | 364 / 364 / 392 | noyer ; hêtre clair ; usé avec bretelle |
| `thompson` | Thompson M1928 | 852 mm | 30,1 | 306 / 338 / 306 | chargeur droit ; camembert ; droit bois clair usé |
| `winchester1897` | Winchester M1897 | 1 003 mm (1 395 avec baïonnette) | 35,4 (49,1) | 304 / 328 / 304 | trench ; avec baïonnette ; usé bois clair |
| `garand` | M1 Garand | 1 107 mm | 38,5 | 328 / 328 / 356 | noyer ; bouleau clair ; usé avec bretelle |
| `stg44` | StG 44 | 940 mm | 33,1 | 288 / 288 / 288 | standard ; bois clair ; usé |
| `bar` | BAR M1918 | 1 214 mm | 42,5 | 336 / 276 / 336 | avec bipied ; sans bipied ; bipied bois clair |
| `mg42` | MG42 | 1 220 mm | 42,8 | 428 / 392 / 488 | bande pendante ; tambour à bande ; usé, bande longue |
| `panzerschreck` | Panzerschreck RPzB 54 | 1 640 mm | 57,4 | 292 / 292 / 292 | gris ; sable ; olive écaillé |
| `m2lanceflammes` | Lance-flammes M2 | lance ≈ 1 050 mm, réservoirs 630 mm (approximations) | 36,8 | 480 / 480 / 480 | olive ; olive écaillé ; réservoirs gris |
- Budgets : 400 (poing, épaule), 700 (MG42, Panzerschreck, lance-flammes réservoirs compris) ; testés sur chaque variante (`tests/unit/armes.test.js`).

## Tenue en main (atelier : arme fixée à l'articulation `prop`, au centre de la poignée du pistolet actuel ; personnage et squelette intacts)
- Le pistolet actuel fait partie de la géométrie du personnage : l'atelier l'enlève d'une **copie en mémoire** des données (réglage « Pistolet actuel »).
- La pose actuelle tient une arme courte devant la poitrine : M1911 juste ; armes longues tenues par la poignée seulement, la crosse traverse le buste, la main gauche ne tient rien. Lance-flammes : réservoirs placés sur le dos par un décalage (`dos.main`, dans la même géométrie, donc ils suivent `prop`).
- **Intégration** : pose à deux mains et épaulement par genre d'arme, bout du canon (`muzzle`) par arme, réservoirs sur l'os `chest` (deuxième os ou maillage à part), retrait du pistolet de la géométrie du personnage.

## Caisse d'armes
- **Caisse militaire ouverte** 70 × 30, 22 de haut, couvercle posé de travers à côté (204 triangles) ; **râtelier mural bas** 72 × 16, 28 de haut (120 triangles) ; texture 256 px propre (planches, pochoirs inventés « ARMES Z-7 », « LOT 44-C 1/1 », « N 3 »). Arme couchée sur le côté (droite en haut) : **33,6 au plus** (Panzerschreck), sous 43.
- Aperçu de l'approche : contour à la craie (48 triangles, matière transparente, allumé ou éteint) et texte « {arme} — 500 Zollars » (prix d'exemple fictif) au-dessus de la caisse.

## Visuels du menu
- `visuelArme()` : SVG de profil (viewBox 400 × 120) projeté depuis les pièces, aplats par tuile, trait sombre, veines et reflet ; **2,2 à 3,6 Ko** ; aucun Three.js.

## Page d'atelier et choix du propriétaire
- Vues : en jeu (667 × 375 et 1920 × 1080 à taille réelle, carrelage de la carte, lumière du jeu, lampe ou lune), sur la caisse, gros plan (tourne, immobile en mouvement réduit, souris ou doigt), visuel du menu, comparaison des variantes (dessus et profil), planche à l'échelle avec le personnage, budget. Un seul contexte WebGL. Lien : menu de débogage de la pause (« Atelier des armes »).
- **Choisir** : sur la page, arme et variante, « Retenir cette variante », puis recopier le texte de « Mes choix » dans **`data/armes/armes-choix.json`** : `{ "variantes": { "kar98k": "b", … }, "armeSpeciale": "panzerschreck" | "m2lanceflammes" }`. Identifiant inconnu : variante par défaut (la première), Panzerschreck. La page affiche « (retenue) » et ce qu'elle a ignoré.

## Tests
- Vitest `armes.test.js` (budgets, longueurs à 2 % et dans l'ordre, déterminisme, atlas, caisse sous 43, choix invalide, SVG) ; Playwright `armes-atelier.spec.js` (toutes les variantes, un appel, vues, craie, comparaison, planche, visuels, choix, mouvement réduit, axe, aucune requête, aucune écriture, lien de débogage) ; bureau et mobile en local.
