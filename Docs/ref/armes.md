# Armes — modèles 3D, caisse d'armes, visuels du menu (lot 9c, V0.9)
Atelier seulement (`atelier-armes.html`, à retirer au lot 13) : **rien n'est branché sur la partie** (statistiques, prix, cartes : lot d'intégration).

## Échelle et taille à l'écran (relevées sur `origin/dev` `2752cc1`)
- Personnage du joueur (v2) : **61 unités** de haut (≈ 1,75 m), 28 de large bras compris ; articulation `prop` (arme) à 13 devant la poitrine.
- **Une seule règle d'échelle (décision du propriétaire)** : 35 unités par mètre (personnage de 1,75 m) × **un facteur commun à toutes les armes**, `echelle.lisibilite` = **×0,8** (seul curseur de l'atelier, « Taille des armes » ; valeur du fichier de choix : `echelle.longueur`) ; jamais de facteur par arme ni par classe (le ×2 du pistolet sur la caisse est retiré). ×0,8 = la plus grande valeur pour laquelle les dix armes se tiennent à deux mains dans leurs poses, paumes posées contre l'arme (×1,3 avant, puis ×1,1 et ×0,9 ; au-delà, la main gauche manque le dessous du boîtier du BAR). Constantes des données, sans curseur : `epaisseur` ×1,8 (dimensions transversales sous 60 mm) et `largeur` ×1,5 en x dans la vue de la caméra du jeu seulement. Les caisses s'allongent pour l'arme la plus longue.
- Caméra du jeu (bâtiment) : champ 40°, inclinaison 75°, distance 704,5 → **0,731 px par unité à 667 × 375, 2,106 à 1920 × 1080**.
- Mesuré sur image dans l'atelier (fond noir, lumière du jeu) : personnage ≈ **20 × 25 px** (667 × 375) et **56 × 72 px** (1920 × 1080) ; pistolet actuel (glissière 14, calculé) 10 / 29 px, soit **1,84 fois** un vrai M1911.

## Matières, couleurs, textures
- Géométrie pure `js/core/armes/` (sans Three.js) : `geometrie.js` (boîtes, tubes, profils extrudés, lofts → triangles), `modeles.js` (une fonction par arme, en mm ; repère : z vers la bouche, y en haut, x à gauche de l'arme, origine à la main droite), `armes.js` (données, variantes, choix, poses), `atlas.js`, `caisse.js`, `visuel.js` (SVG). Rendu : `js/armes/rendu.js` ; page : `js/armes/atelier.js`.
- Une géométrie fusionnée et **une matière `MeshLambertMaterial`** (atlas + couleurs de sommet) par arme : **un appel** (mesuré). Pas de `MeshStandardMaterial`.
- **Atlas commun 256 × 256** généré en code (16 tuiles de 64 px : bruni, bruni usé, phosphaté, phosphaté usé, noyer, hêtre, bakélite, cuir, toile, laiton, olive, olive écaillé, feldgrau, sable, tôle perforée, caoutchouc) ; une variante change les tuiles et des détails, jamais l'identité.
- Couleurs : jetons `--arm-*` de **`css/armes.css`** (une déclaration `#rrggbb` par ligne ; aussi les classes des visuels 2D), chargée par l'atelier seulement ; `tokens.css` non touché. Garde-fous `tokens.test` et `attente.spec` adaptés comme au lot 8f.

## Les dix armes (longueur réelle → jeu à 35 u/m ; triangles réels : le plus grand des poses « en main » et « posée »)
| Identifiant | Arme | Réelle | Jeu (× 1 ; en jeu × 0,8) | Triangles (a / b / c) | Variantes |
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

## Poses de tenue (décision du propriétaire : `js/armes/tenue.js`, `js/armes/poses-calcul.js`, `data/armes/poses.json`)
- Quatre poses sur une **instance** du personnage de l'atelier (articulations tournées ; `character-v2.js` et le personnage du jeu inchangés) : **pistolet** (M1911, bras tendus, à deux mains ou à une main), **épaule** (Kar98k, Garand, Thompson, StG 44, Winchester : crosse contre l'intérieur de l'épaule droite, main droite sur la poignée, main gauche sous le fût), **hanche** (BAR, MG42, lance du lance-flammes : arme basse devant la hanche droite, deux mains), **sur l'épaule** (Panzerschreck). Les dix sont faites (M1911, Kar98k, MG42 d'abord, puis les sept autres après « OK poses »).
- Règles (`regles` de poses.json) : torse 0, 15 puis 30° au plus, tête et regard vers l'avant ; épaules de l'instance rapprochées jusqu'à ±9 pour l'épaule et la hanche ; en dernier recours bras et avant-bras +20 % au plus (os de l'épaule à l'échelle, main ramenée à 1). Arme dans l'axe de visée, placée sur un petit quadrillage ; bras par cinématique inverse à deux os. Résultats à ×0,8 : M1911 de face, sans changement du corps ; armes d'épaule, de hanche et Panzerschreck : torse 30°, épaules ±9 à ±11,5, bras ×1,1 à ×1,2 (détail dans poses.json). Paumes posées contre l'arme, jamais dedans (aucun point de l'arme à moins de 1,3 du centre de la paume : la main droite sur le côté droit du poignet ou de la poignée, la gauche dessous, ou sur le côté d'une poignée avant ; retour « la main arrière est dans l'arme »), mains sur leurs prises (écart 0), aucun point de l'arme dans la tête ni le torse (la crosse peut toucher l'épaule), canon à 0°, bouche 12 à 27 devant le corps. Prises avant : sous l'arrière du fût (Kar98k, Garand), poignée avant (Thompson), pompe (Winchester), garde-main (StG 44), sous l'avant du boîtier (BAR), arrière du manchon (MG42), poignée avant du tube (Panzerschreck), mi-tube de la lance (lance-flammes : sa poignée avant, 50 cm devant, n'est pas à portée).
- Données : points de prise par arme dans `armes.json` (`prises` : `tenue`, `droite`, `gauche`, `crosse`, en mm) ; poses dans `poses.json` (angles YXZ par articulation, écartement des épaules, allongement des bras, place de l'arme, contrôles). Recalcul : `node --input-type=module -e` avec `fichierPoses({ characters, poses, donnees })` (`js/armes/poses-calcul.js`) écrit dans `data/armes/poses.json` ; `tests/unit/armes-poses.test.js` vérifie qu'il est à jour.
- Le pistolet actuel fait partie de la géométrie du personnage : l'atelier l'enlève d'une **copie en mémoire** des données. **Intégration** : reporter les poses dans pose-v2 (y compris l'écartement des épaules et l'allongement des bras, ou un personnage aux bras plus longs), bout du canon (`muzzle`) par arme, réservoirs sur l'os `chest`.

## Caisse d'armes
- **Caisse militaire ouverte** 70 × 30, 22 de haut, couvercle posé de travers à côté (204 triangles) ; **râtelier mural bas** 72 × 16, 28 de haut (120 triangles) ; texture 256 px propre (planches, pochoirs inventés « ARMES Z-7 », « LOT 44-C 1/1 », « N 3 »). Arme couchée sur le côté (droite en haut) : **33,6 au plus** (Panzerschreck), sous 43.
- Aperçu de l'approche : contour à la craie (48 triangles, matière transparente, allumé ou éteint) et texte « {arme} — 500 Zollars » (prix d'exemple fictif) au-dessus de la caisse.

## Visuels du menu
- `visuelArme()` : SVG de profil (viewBox 400 × 120) projeté depuis les pièces, aplats par tuile, trait sombre, veines et reflet ; **2,2 à 3,6 Ko** ; aucun Three.js.

## Page d'atelier et choix du propriétaire
- Vues : en jeu (667 × 375 et 1920 × 1080 à taille réelle, carrelage de la carte, lumière du jeu, lampe ou lune), sur la caisse, gros plan (tourne, immobile en mouvement réduit, souris ou doigt), visuel du menu, comparaison des variantes (dessus et profil), planche à l'échelle avec le personnage, budget. Un seul contexte WebGL. Réglages (arme, variante, lumière, tenue, pistolet, curseurs) dans un panneau flottant collé en haut pendant le défilement (deux colonnes sur téléphone, la moitié de l'écran au plus). Lien : menu de débogage de la pause (« Atelier des armes »).
- **Choisir** : sur la page, arme et variante, « Retenir cette variante », puis recopier le texte de « Mes choix » dans **`data/armes/armes-choix.json`** : `{ "variantes": { "kar98k": "b", … }, "armeSpeciale": "panzerschreck" | "m2lanceflammes" }`. Identifiant inconnu : variante par défaut (la première), Panzerschreck. La page affiche « (retenue) » et ce qu'elle a ignoré.

## Tests
- Vitest `armes.test.js` (budgets, longueurs à 2 % et dans l'ordre, déterminisme, atlas, caisse sous 43, choix invalide, SVG) ; Playwright `armes-atelier.spec.js` (toutes les variantes, un appel, vues, craie, comparaison, planche, visuels, choix, mouvement réduit, axe, aucune requête, aucune écriture, lien de débogage) ; bureau et mobile en local.
