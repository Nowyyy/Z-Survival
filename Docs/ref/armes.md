# Armes — modèles 3D, caisse d'armes, visuels du menu (lot 9c, V0.9)
Atelier seulement : **rien n'est branché sur la partie** (statistiques, prix, répartition sur les cartes : lot d'intégration).

## Échelle et taille à l'écran (relevées sur `origin/dev` `2752cc1`)
- Personnage du joueur (v2, variante A) : **61 unités** de haut (≈ 1,75 m), 28 de large bras compris ; articulation `prop` (arme) à 13 devant la poitrine.
- Échelle retenue : **35 unités par mètre** (61 / 1,75), commune à toutes les armes (`data/armes/armes.json` → `echelle`). Le décor garde la sienne (case 60).
- Caméra du jeu (bâtiment) : champ 40°, inclinaison 75°, distance 704,5 → **0,731 px par unité à 667 × 375, 2,106 à 1920 × 1080**.
- Personnage à l'écran : ≈ 20 × 23 px (667 × 375), ≈ 59 × 65 px (1920 × 1080) ; pistolet actuel (glissière 14) : **10 px / 29 px**, soit **1,84 fois** un vrai M1911 (7,6). Mesures sur image dans l'atelier (partie B).
- Conséquence : à l'échelle réelle, le M1911 fait 5,5 px de long à 667 × 375. Le facteur `echelle.lisibilite` (1 par défaut) agrandit toutes les armes d'un coup si le propriétaire le veut.

## Matières, couleurs, textures
- Géométrie pure (`js/core/armes/`, sans Three.js) : pièces en millimètres (boîtes, tubes, profils extrudés, sections en loft), un repère par arme : z vers la bouche, y vers le haut, x à gauche de l'arme (la droite du tireur = −x, comme le personnage), origine à la poignée (main droite).
- Une géométrie fusionnée par arme, **une matière `MeshLambertMaterial`** (atlas + couleurs de sommet), **un appel** ; pas de `MeshStandardMaterial`.
- **Atlas commun 256 × 256** généré en code (`js/core/armes/atlas.js`, pur) : 16 tuiles de 64 px (acier bruni, bruni usé, phosphaté, phosphaté usé, noyer, hêtre, bakélite, cuir, toile, laiton, olive, olive écaillé, feldgrau, sable, tôle perforée, caoutchouc). Les variantes changent les tuiles et des détails, jamais l'identité.
- Couleurs : jetons `--arm-*` d'une feuille à part, `css/armes.css` (une déclaration par ligne, `#rrggbb`), chargée par l'atelier seulement ; **`tokens.css` n'est pas touché** (accueil au seuil Lighthouse). Garde-fous `tokens.test` et `attente.spec` adaptés comme au lot 8f (`--ouv-*`).

## Les dix armes (longueur réelle → jeu à 35 u/m ; px à 667 × 375 / 1920 × 1080)
| Identifiant | Arme | Longueur réelle | Jeu | Écran | Triangles visés | Variantes prévues |
|---|---|---|---|---|---|---|
| `m1911` | Colt M1911 | 216 mm | 7,6 | 6 / 16 | ≤ 200 | phosphaté et bois ; bronzé et bakélite ; usé |
| `kar98k` | Kar98k | 1 110 mm | 38,9 | 28 / 82 | ≤ 400 | noyer ; hêtre clair ; usé avec bretelle |
| `thompson` | Thompson M1928 | 852 mm | 29,8 | 22 / 63 | ≤ 400 | chargeur droit ; chargeur camembert ; droit bois clair usé |
| `winchester1897` | Winchester M1897 « trench » | 1 003 mm (+ 380 baïonnette) | 35,1 | 26 / 74 | ≤ 400 | trench ; avec baïonnette ; usé bois clair |
| `garand` | M1 Garand | 1 107 mm | 38,7 | 28 / 82 | ≤ 400 | noyer ; bouleau clair ; usé avec bretelle |
| `stg44` | StG 44 | 940 mm | 32,9 | 24 / 69 | ≤ 400 | standard ; bois clair ; usé |
| `bar` | BAR M1918 | 1 214 mm | 42,5 | 31 / 90 | ≤ 400 | avec bipied ; sans bipied ; bipied bois clair |
| `mg42` | MG42 | 1 220 mm | 42,7 | 31 / 90 | ≤ 700 | bande pendante ; tambour à bande ; usé, bande longue |
| `panzerschreck` | Panzerschreck RPzB 54 | 1 640 mm | 57,4 | 42 / 121 | ≤ 700 | gris ; sable ; olive usé |
| `m2lanceflammes` | Lance-flammes M2 | lance ≈ 1 100 mm, réservoirs ≈ 630 mm (approximations) | 38,5 | 28 / 81 | ≤ 700 | olive ; olive écaillé ; réservoirs gris |
- Budgets du lot : 400 triangles (poing et épaule), 700 (MG42, Panzerschreck, lance-flammes, réservoirs compris), comptés sur chaque variante.
- Silhouette vue de dessus d'abord : levier de culasse coudé (Kar98k) à droite, bande à gauche (MG42), bipieds écartés, bouclier en travers (Panzerschreck), chargeurs qui débordent seulement s'ils débordent en vrai.

## Caisse d'armes (deux variantes)
- **Caisse militaire ouverte** : 70 × 30 au sol, **22 de haut**, couvercle posé de travers à côté ; **râtelier mural bas** : 72 × 16, 34 de haut au plus. Arme posée dessus : **tout reste sous 40** (< 43, tirs par-dessus, lot 8j).
- Empreinte compatible avec les meubles (caisse 80 × 80, étagère 260 × 60, couloir minimal 90). Marquage au pochoir inventé (glyphes dessinés en code, aucune marque réelle). Budget : ≤ 300 triangles, un appel (texture 256 px propre à la caisse).
- Aperçu de l'approche (atelier) : contour à la craie au sol (anneau texturé, allumé ou éteint) et emplacement du texte « Kar98k — 500 Zollars » (prix d'exemple, fictif).

## Visuels du menu (2D)
- Un SVG de profil par arme (variante par défaut), **généré en code** depuis les mêmes pièces (projection de côté), style peint du menu (aplats, trait sombre, reflet) ; viewBox 0 0 400 120, couleurs par classes `var(--arm-*)` ; quelques Ko ; **sans Three.js**.

## Page d'atelier `atelier-armes.html` (technique, à retirer au lot 13)
- Arme et variante ; vues : **en jeu** (caméra du jeu à taille réelle 667 × 375 et 1920 × 1080, sol de la carte, lampe ou lune), **sur la caisse** (craie et texte), **gros plan** qui tourne (immobile en mouvement réduit, souris ou doigt), **visuel du menu** ; **comparaison** des variantes d'une arme ; **planche** des dix armes à l'échelle ; budget (triangles, appels, texture). Un seul contexte WebGL (rendu copié dans chaque vue).
- Lien « Atelier des armes » dans le menu de débogage de la pause ; textes `data/i18n/atelier-armes.json` (français seul) ; `?test=1` : `window.__zsArmes`.
- **Choix du propriétaire** : `data/armes/armes-choix.json` = `{ "variantes": { "kar98k": "b", … }, "armeSpeciale": "panzerschreck" }` ; identifiant ou variante inconnus = défaut (première variante, Panzerschreck). La page montre la variante retenue (« retenue ») et ce fichier.
- Rien n'est écrit dans le stockage ; aucune requête externe ; aucun module des armes chargé par le menu ni par la partie.

## Tests prévus
- Vitest `armes.test.js` : budgets de chaque variante, longueurs relatives (ordre et rapports aux longueurs réelles à 2 % près), déterminisme (mêmes sommets), choix invalide → défaut, caisse sous 43 et ≤ 300 triangles, SVG sans couleur en dur et de quelques Ko.
- Playwright `armes-atelier.spec.js` (bureau et mobile) : toutes les armes et variantes se construisent, vues, comparaison, planche, aucune requête externe, aucune écriture, mouvement réduit, axe.
- Garanties : `trace-logique.mjs` 6 × 600 pas, `mesurer.mjs --ref --ref-memes-reglages`, fichiers au démarrage (menu 59, partie 174 sur `origin/dev`), Lighthouse 5 passes.
