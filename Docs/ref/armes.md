# Armes — modèles 3D, caisse d'armes, visuels du menu (lot 9c, V0.9)
Atelier seulement (`atelier-armes.html`, à retirer au lot 13) : **rien n'est branché sur la partie** (statistiques, prix, cartes : lot d'intégration).

## Échelle et taille à l'écran (relevées sur `origin/dev` `2752cc1`)
- Personnage du joueur (v2) : **61 unités** de haut (≈ 1,75 m), 28 de large bras compris ; articulation `prop` (arme) à 13 devant la poitrine.
- **Une seule règle d'échelle (décision du propriétaire)** : 35 unités par mètre (personnage de 1,75 m) × **un facteur commun à toutes les armes**, `echelle.lisibilite` = **×0,8** (seul curseur de l'atelier, « Taille des armes » ; valeur du fichier de choix : `echelle.longueur`) ; jamais de facteur par classe (le ×2 du pistolet sur la caisse est retiré) ; **une exception, demandée ensuite par le propriétaire : le Colt M1911 à ×1,2** (`taille` dans `armes.json`, hors curseur ; `tailleArme()`). ×0,8 = la plus grande valeur pour laquelle les dix armes se tiennent à deux mains dans leurs poses, paumes posées contre l'arme (×1,3 avant, puis ×1,1 et ×0,9 ; au-delà, la main gauche manque le dessous du boîtier du BAR). Constantes des données, sans curseur : `epaisseur` ×1,8 (dimensions transversales sous 60 mm) et `largeur` ×1,5 en x dans la vue de la caméra du jeu seulement. Les caisses s'allongent pour l'arme la plus longue.
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
| `m1911` | Colt M1911 | 216 mm | 7,5 (en jeu × 1,2) | 240 / 240 / 240 | phosphaté et noyer ; bronzé et bakélite ; usé |
| `kar98k` | Kar98k | 1 110 mm | 38,7 | 392 / 364 / 392 | noyer avec bretelle ; hêtre clair ; usé avec bretelle |
| `thompson` | Thompson M1928 | 852 mm | 30,1 | 306 / 338 / 306 | chargeur droit ; camembert ; droit bois clair usé |
| `winchester1897` | Winchester M1897 | 1 003 mm (1 395 avec baïonnette) | 35,4 (49,1) | 304 / 328 / 304 | trench ; avec baïonnette ; usé bois clair |
| `garand` | M1 Garand | 1 107 mm | 38,5 | 356 / 328 / 356 | noyer avec bretelle ; bouleau clair ; usé avec bretelle |
| `stg44` | StG 44 | 940 mm | 33,1 | 288 / 288 / 288 | standard ; bois clair ; usé |
| `bar` | BAR M1918 | 1 214 mm | 42,5 | 336 / 276 / 336 | avec bipied ; sans bipied ; bipied bois clair |
| `mg42` | MG42 | 1 220 mm | 42,8 | 428 / 392 / 488 | bande pendante ; tambour à bande ; usé, bande longue |
| `panzerschreck` | Panzerschreck RPzB 54 | 1 640 mm | 57,4 | 292 / 292 / 292 | gris ; sable ; olive écaillé |
| `m2lanceflammes` | Lance-flammes M2 | lance ≈ 1 050 mm, réservoirs 630 mm (approximations) | 36,8 | 480 / 480 / 480 | olive ; olive écaillé ; réservoirs gris |
- Budgets : 400 (poing, épaule), 700 (MG42, Panzerschreck, lance-flammes réservoirs compris) ; testés sur chaque variante (`tests/unit/armes.test.js`).

## Poses de tenue (décision du propriétaire : `js/armes/tenue.js`, `js/armes/poses-calcul.js`, `data/armes/poses.json`)
- Quatre poses sur une **instance** du personnage de l'atelier (articulations tournées ; `character-v2.js` et le personnage du jeu inchangés) : **pistolet** (M1911, bras tendus, à deux mains ou à une main), **épaule** (Kar98k, Garand, Thompson, StG 44, Winchester : crosse contre l'intérieur de l'épaule droite, main droite sur la poignée, main gauche sous le fût), **hanche** (BAR, MG42, lance du lance-flammes : arme basse devant la hanche droite, deux mains), **sur l'épaule** (Panzerschreck). Les dix sont faites (M1911, Kar98k, MG42 d'abord, puis les sept autres après « OK poses »).
- Règles (`regles` de poses.json) : torse 0, 15 puis 30° au plus, tête et regard vers l'avant ; épaules de l'instance rapprochées jusqu'à ±9 pour l'épaule et la hanche ; en dernier recours bras et avant-bras +20 % au plus (os de l'épaule à l'échelle, main ramenée à 1). Arme dans l'axe de visée, placée sur un petit quadrillage ; bras par cinématique inverse à deux os. Corps adapté à chaque arme (pour comparer, `?corps=adapte`) : M1911 sans changement du corps, les autres torse 30°, épaules ±9 à ±11,5, bras ×1 à ×1,2. Paumes posées contre l'arme, jamais dedans (aucun point de l'arme à moins de 1,3 du centre de la paume : la main droite sur le côté droit du poignet ou de la poignée, la gauche dessous, ou sur le côté d'une poignée avant ; retour « la main arrière est dans l'arme »), mains sur leurs prises (écart 0) et sur l'arme, jamais sur la bretelle ; bretelle (Kar98k, Garand) déviée contre le bras : ses deux sections du milieu descendent juste assez pour passer contre les bras et les mains, sans les traverser ni entrer dans le torse, attaches fixes (`arme.bretelle` de poses.json, contrôle `bretelle` = 0 ; retour « la bretelle doit être contre le bras ») ; aucun point de l'arme dans la tête ni le torse (la crosse peut toucher l'épaule), canon à 0°, bouche 12 à 27 devant le corps. Prises avant : sous l'arrière du fût (Kar98k, Garand), poignée avant (Thompson), pompe (Winchester), garde-main (StG 44), sous l'avant du boîtier (BAR), arrière du manchon (MG42), poignée avant du tube (Panzerschreck), mi-tube de la lance (lance-flammes : sa poignée avant, 50 cm devant, n'est pas à portée).
- **Corps long, retenu par le propriétaire** (essai « bras les plus longs, idem pour les épaules », puis « on garde le corps long ») : **bras ×1,2 et épaules ±9 pour toutes les armes**, le pistolet et la pose actuelle compris (`CORPS_LONG`, `js/armes/tenue.js` ; `corps` de poses.json ; réglage « Corps du personnage » de l'atelier, par défaut) ; torse 0° (M1911), 15° (Kar98k, Thompson, Garand, StG 44, Panzerschreck) ou 30° (Winchester, BAR, MG42, lance-flammes) ; Colt : la main s'avance pour garder l'extension du bras du corps normal (coude plié à 60° à deux mains, 46° à une main, au lieu de 93° et 78° ; retour « tendre un peu les bras ») ; les dix armes restent tenues (testé dans `armes-poses.test.js`).
- Données : points de prise par arme dans `armes.json` (`prises` : `tenue`, `droite`, `gauche`, `crosse`, en mm) ; poses dans `poses.json` (angles YXZ par articulation, écartement des épaules, allongement des bras, place de l'arme, contrôles). Recalcul : `node --input-type=module -e` avec `fichierPoses({ characters, poses, donnees })` (`js/armes/poses-calcul.js`) écrit dans `data/armes/poses.json` ; `tests/unit/armes-poses.test.js` vérifie qu'il est à jour.
- Le pistolet actuel fait partie de la géométrie du personnage : l'atelier l'enlève d'une **copie en mémoire** des données. **Intégration** : personnage du jeu aux bras ×1,2 et épaules ±9 (corps long retenu), poses reportées dans pose-v2, bout du canon (`muzzle`) par arme, réservoirs sur l'os `chest`.

## Caisse d'armes
- **Caisse militaire ouverte** 70 × 30, 22 de haut, couvercle posé de travers à côté (204 triangles) ; **râtelier mural bas** 72 × 16, 28 de haut (120 triangles) ; texture 256 px propre (planches, pochoirs inventés « ARMES Z-7 », « LOT 44-C 1/1 », « N 3 »). Arme couchée sur le côté (droite en haut) : **33,6 au plus** (Panzerschreck), sous 43.
- Aperçu de l'approche : contour à la craie (48 triangles, matière transparente, allumé ou éteint) et texte « {arme} — 500 Zollars » (prix d'exemple fictif) au-dessus de la caisse.

## Visuels du menu
- `visuelArme()` : SVG de profil (viewBox 400 × 120) projeté depuis les pièces, aplats par tuile, trait sombre, veines et reflet ; **2,2 à 3,6 Ko** ; aucun Three.js.

## Page d'atelier et choix du propriétaire
- Vues : en jeu (667 × 375 et 1920 × 1080 à taille réelle, carrelage de la carte, lumière du jeu, lampe ou lune), sur la caisse, gros plan (tourne, immobile en mouvement réduit, souris ou doigt), visuel du menu, comparaison des variantes (dessus et profil), planche à l'échelle avec le personnage, budget. Un seul contexte WebGL. Réglages (arme, variante, lumière, tenue, pistolet, curseurs) dans un panneau flottant collé en haut pendant le défilement (deux colonnes sur téléphone, la moitié de l'écran au plus). Lien : menu de débogage de la pause (« Atelier des armes »).
- **Choisir** : sur la page, arme et variante, « Retenir cette variante », puis recopier le texte de « Mes choix » dans **`data/armes/armes-choix.json`** : `{ "variantes": { "kar98k": "b", … }, "armesSpeciales": ["panzerschreck", "m2lanceflammes"] }` (choix du propriétaire : variante A partout, les deux armes spéciales gardées, elles ne serviront pas au même endroit ; l'ancien `armeSpeciale` est encore lu). Identifiant inconnu : variante par défaut (la première), Panzerschreck seul. La page affiche « (retenue) » et ce qu'elle a ignoré.

## Tests
- Vitest `armes.test.js` (budgets, longueurs à 2 % et dans l'ordre, déterminisme, atlas, caisse sous 43, choix invalide, SVG) ; Playwright `armes-atelier.spec.js` (toutes les variantes, un appel, vues, craie, comparaison, planche, visuels, choix, mouvement réduit, axe, aucune requête, aucune écriture, lien de débogage) ; bureau et mobile en local.

## Achat et équilibrage (lot 9k — partie A : relevé sur `origin/dev` `5d3d766`)
Mesures reproductibles : `node scripts/equilibrage/armes.mjs [--joueur résultats.json]` (aisance, en texte), `node scripts/equilibrage/joueur.mjs` (joueur automatique du lot 9e avec achats, profils `nu` et `equipe`, tables de remplacement servies par interception), `node scripts/equilibrage/caisses.mjs` (emplacements possibles). Modèle pur : `scripts/equilibrage/modele.mjs`.
### Difficulté par vague (`waves.json`, `enemies.json`)
| Vague | 1 | 5 R | 10 R | 11 | 15 R | 20 R | 21 | 25 R | 28 | 31 | 40 R |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Zombies / présents au plus | 5 / 6 | 16 / 8 | 30 / 10 | 26 / 10 | 48 / 10 | 69 / 10 | 57 / 10 | 94 / 10 | 85 / 10 | 98 / 10 | 150 / 10 |
| Intervalle d'apparition (s) | 2,50 | 2,04 | 1,58 | 1,50 | 1,22 | 0,94 | 0,90 | 0,90 | 0,90 | 0,90 | 0,90 |
| Vie marcheur / moyenne | 50 / 50 | 150 / 148 | 275 / 325 | 303 / 363 | 443 / 563 | 713 / 899 | 785 / 1 005 | 1 149 / 1 459 | 1 500 / 1 916 | 1 500 / 1 919 | 1 500 / 1 896 |
| Demande (PV par seconde) | 20 | 73 | 206 | 243 | 462 | 953 | 1 116 | 1 621 | 2 129 | 2 133 | 2 107 |
- Vie ×(1 + 0,5 (v − 1)) jusqu'à la 9, puis ×1,1 par vague, **plafond ×30 atteint à la manche 28** ; intervalle ×0,95 par vague, **plancher 0,9 s dès la 21** ; présents : 10 dès la 9 ; total plafonné à 150 (35 et 40) ; coups ×1,05 par vague (10 → 30, plafond ×3 vers la 24). **De la 28 à la 40 (et au-delà en infini, mêmes données), la demande ne monte plus** : seul le nombre de zombies grandit.
### Équipement et personnages
- Aucun objet ne donne dégâts, cadence, précision ni portée (décision du lot 8h : « l'arme fait l'attaque, l'équipement fait la survie ») ; le Survivant n'a aucun effet : **l'aisance d'une arme est la même avec et sans équipement**.
- Équipement de référence proposé (`EQUIPEMENT_REFERENCE`) : six objets rares au niveau 8 (milieu de 1 à 15 : casque kevlar, gilet pare-balles, gants tactiques, treillis, rangers, trousse de secours), Survivant → niveaux vie 10 (plafond), régénération 10, réparation 5, vitesse 5 : **vie 220 (100), soin 11 par tué (1), planche 0,95 s (1,8), vitesse ×1,2** ; chutes 1 dans les deux profils. Le joueur automatique, immobile et sans réparation, ne profite que de la vie et du soin.
- Effet mesuré aujourd'hui : **aucun** (les deux profils meurent en manche 5) ; même avec des coups de zombie divisés par 5, +1 à +1,5 manche seulement.
### Aisance actuelle (1,0 = Colt sans équipement, moyenne des vagues 1 à 10 ; précision du joueur automatique 0,89 pour le Colt, 0,8 par défaut pour les autres)
| Arme | 1 | 10 | 11 | 20 | 21 | 30 | 31 | 40 |
|---|---|---|---|---|---|---|---|---|
| Colt M1911 (25, 0,4 s, 7 / ∞, 1,4 + 0,3 s) | 2,88 | 0,27 | 0,23 | 0,06 | 0,05 | 0,03 | 0,03 | 0,03 |
| Winchester M1897 (55 × 8) | 18,7 | 2,00 | 1,57 | 0,43 | 0,36 | 0,19 | 0,19 | 0,19 |
| Kar98k (320, 1,05 s) | 1,88 | 0,85 | 0,79 | 0,20 | **0,19** | 0,11 | 0,11 | 0,11 |
| Thompson M1928 (90, 0,09 s) | 17,9 | 2,74 | 2,24 | 0,66 | 0,55 | 0,30 | **0,30** | 0,30 |
- Garand 0,30 à la 31, StG 44 0,61, BAR 0,50, MG42 1,00 (tableau complet : `armes.mjs --armes-vues toutes`). Le Kar98k (balle par balle, 5 coups) et la Thompson sont aujourd'hui bien trop faibles à leur vague de la carte 1 ; le pompe y est trop fort.
### Joueur automatique (lot 9e, graines 1 à 6 ; immobile au départ, vise le plus proche, ne répare pas)
- **Sans et avec l'équipement : mort en manche 5** (193 à 235 s ; 32 à 42 tués ; médianes 335 et 355 Zollars). La « mort en manche 10 » du seed vient du profil `?lvl=all:10` du lot 9e (dégâts ×2,5, cadence 0,15 s), que plus rien ne donne depuis le lot 8h.
- Essais (non retenus) : Colt à 50, 75, 100 de dégâts → manches 6–7, 7–9, 8–9 ; coups de zombie ÷2,5 ou ÷5 → +0 à +2 manches ; visée « d'abord les zombies entrés » → aucun gain. Sous la menace, le Colt recharge 43 % du temps ; **la mort vient d'une rafale dès que l'arme tue moins vite qu'ils n'arrivent (aisance brute ≲ 0,9)** : chaque zombie en trop frappe 10 à 15 par seconde contre 100 de vie.
- Gains d'une partie aujourd'hui (les deux profils) : 335–355 Zollars, 80 médailles (quatre manches), 0 diamant.
### Zollars
- 10 par zombie tué par balle, 1 par planche (le joueur automatique n'en pose pas) : 50, 70, 80, 100 aux manches 1 à 4 ; si tout est tué : **1 460 à l'ouverture de la manche 11, 5 630 à la 21, 13 580 à la 31** (avant tout achat). Aucune autre dépense en Zollars aujourd'hui (portes gratuites).
### Touches prises (`event.code`)
- Déplacement KeyW/A/S/D et flèches ; **R** recharger, **E** changer d'arme, **1** / **2** emplacements, molette ; Échap et **P** pause, **F plein écran**, **M** son ; réparation automatique (sans touche). **F est donc prise** : touche d'achat à proposer en B (libres : B, G, V, Espace…).
### Emplacements possibles (`caisses.mjs` : caisse 70 × 30 contre un mur ; fenêtre ≥ 160, porte ≥ 60, escalier ≥ 40, lampe ≥ 50, meuble 0 ou ≥ 50, décor des murs ≥ 60)
- **Aile** (pièce 2, rez-de-chaussée) : 8 places, dont mur nord face sud (1420, 935 ; fenêtre 211), mur nord de la poche face sud (955, 1875 ; porte 100), mur ouest face est (1080, 1295 ; fenêtre 361).
- **Étage de gauche** (pièce 3) : 8 places, dont mur est face ouest (1455, 1530 ; fenêtre 553, lampe 85), mur ouest face est (1085, 1550 ; fenêtre 403).
- **Étage de droite** (pièce 4) : 2 places seulement : face sud (1565, 1965 ; porte 130, lampe 102) et face ouest (2230, 2345 ; fenêtre 170, escalier 60).
### Références
- Trace logique (6 × 600 pas) : **identique à chaque pas** à `trace-reference.json` (lot 9j). Lighthouse mobile, 5 passes : `index.html` 90, 90, 89, 90, 89 (médiane 90) ; `jeu.html` 81, 80, 80, 79, 79 (médiane 80) ; CLS 0. Rendu, arrivées et captures : relevés en C sur une copie servie de `5d3d766`.
### Plan
- **B** proposition (`data/game/armes-partie.proposition.json`, non lu par le jeu) : table des quatre armes, prix, rachat, valeurs des zombies si nécessaire, deux places par pièce, touche, son ; arrêt. **C** (après « GO 9k ») caisses (`npm run carte`), module pur d'achat, message, bouton, son, débogage, `?equilibrage=avant`. **D** table appliquée, joueur automatique avec achats, mesures finales, tests des bornes. **E** nouvelle référence de la trace, CI, journal, bilan, fusion dans `dev`.
