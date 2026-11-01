# Affinage de la carte d'après le modèle 3D (lot 3g)

Atelier de la carte : visite libre, relevé du modèle, décisions rejouables. Le modèle (`Sanstitre.zip`, `model.dae`, SketchUp 8, Collada, pouces) n'est **jamais** versionné ni copié dans le dépôt ; ses images de texture ne sont ni importées ni reproduites.

## Calage du modèle
- Formule (celle du lot 3e, `Docs/ref/etage.md`) : `px = (x + 5,0833) × 12`, `py = (28,9167 − y) × 12` (mètres du modèle, x vers l'est, y vers le nord ; pixels du plan, y vers le sud). 12 px par mètre, 5 unités du jeu par pixel, 60 unités par mètre.
- Vérification (`releve.json`, `calage.residu`) : la coupe du bâti à 1,2 m est rastérisée (cellules de 0,5 px, poches minces remplies, fermeture de 2 px) ; **89,7 %** des points du contour de `plan.json` sont à 1 px au plus d'une cellule pleine. Le meilleur décalage (recherche à ±3 px par pas de 0,5) est (−2,5 ; +0,5) px pour 91,0 %, soit moins de 15 unités : le calage du lot 3e est gardé. Le lot 3e annonçait 91 % avec sa propre méthode.
- Le mobilier M1 à M36 (relevé au lot 3b) est en moyenne 9 unités au sud des objets du modèle (écart systématique sous le seuil de 15, ignoré).

## Méthode de relevé (scripts reproductibles, sans dépendance)
1. `python3 -I scripts/modele/extraire.py <model.dae> <brut.json>` (bibliothèque standard : `xml.etree`) : aplatit la scène (`scripts/modele/lecture_collada.py` : matrices des nœuds et des instances), coupe le bâti (géométrie libre du nœud `Nazi_Zombies-_Nacht_Der_Untoten`) à 1,2 m au-dessus de chaque sol (rez-de-chaussée z = 1,2 ; étage z = 4,2), liste les composants posés (boîte, triangles, matières), les marches (triangles horizontaux du bâti entre 0,1 et 2,35 m, groupés par contact : un groupe d'au moins 6 hauteurs est un escalier) et les matières (couleur diffuse ou nom de l'image, jamais l'image). `brut.json` n'est pas versionné.
2. `node scripts/modele/releve.mjs <brut.json> --ecrire` : conversion en pixels (`js/core/releve.js`), sections de la coupe (murs en rectangles, piliers = sections isolées de 4 à 10 px, parois minces = cloisons d'une seule face), calage vérifié, classement des objets, piles groupées, ouvrages de fenêtre ; écrit `data/game/maps/rez-de-chaussee/releve.json` (≤ 300 Ko, géométrie seulement).
3. `node scripts/modele/rapport.mjs --ecrire` : comparaison carte / relevé (`js/core/ecarts.js`), écrit `Docs/ref/ecarts-modele.md` et, s'il n'existe pas, le brouillon `ecarts-decisions.json` (l'accord `approved` déjà donné est toujours conservé).
4. `ecarts.html` : la même comparaison dessinée (`js/core/ecarts-svg.js`) ; `?floor=1` pour l'étage.

**Classement des objets** (hauteurs au-dessus du sol de leur étage, première règle qui convient) : ouvrage de fenêtre (`Component_5` à `Component_8` : planches et cadres) → relevé avec les fenêtres ; bas à plus de 1,2 m → décor léger « haut » (luminaires) ; côté court < 0,12 m → décor léger « mince » ; sommet ≤ 0,5 m et aire ≤ 0,6 m² → décor léger « bas » (sacs de sable) ; posé au sol, sommet de 0,3 à 2,6 m, côté court ≥ 0,25 m → meuble ; sinon inconnu. Deux objets d'un même étage dont les emprises se recouvrent à 40 % de la plus petite forment une pile (un seul groupe).

## Règles de tolérance
- Écart = plus grand déplacement d'un bord (meubles), de la ligne médiane (murs), du centre (piliers, fenêtres le long de leur mur), en unités du jeu. **moins-15** : ignoré ; **15-60** : corrigé en partie B quand le modèle est net ; **plus-60** : signalé, jamais appliqué sans `approved: true`.
- Modèle net : un mur du modèle longe au moins 50 % du segment de la carte ; une pièce est associée à un groupe d'objets si leur recouvrement (IoU) atteint 0,2 ou si leurs centres sont à 6 px au plus pour des tailles comparables ; un pilier du modèle à 10 px au plus (au-delà et jusqu'à 20 px : plus-60, à approuver).
- Fenêtres F1 à F8 et U1 à U7 : identifiant, largeur 72 et mur conservés ; décalage de 50 unités au plus par rapport à `planX` / `planY` (sinon `garder`).
- Ne changent pas dans ce lot, quel que soit l'écart : escaliers (formes, `walk.path`, trous, garde-corps), portes et ouvertures (un écart de plus de 25 unités est seulement signalé), `zones.json` (sauf ajustement des régions à la géométrie).

## Décisions rejouables et fusion tardive
- `data/game/maps/rez-de-chaussee/ecarts-decisions.json` (pixels du plan) : `{ id, floor, action, to, reason, level, approved }` ; `action` ∈ `corriger`, `remplacer`, `ajouter`, `retirer`, `garder` ; l'élément est désigné par son identifiant (`P4`, `M21`, `E1`, `F3`, `U2`, `contour-3`, `mur-interieur-2`, `pilier 92,85` pour un pilier sans identifiant, `G3` pour un objet du modèle, `MP12` pour un pilier du modèle) ; `to` : rectangle `{ x0, y0, x1, y1, kind }`, `{ at: [x, y] }`, `{ x }` ou `{ y }` (fenêtre), `{ line }` (mur).
- `scripts/modele/appliquer-decisions.mjs` (partie B) applique les décisions aux **sources** (`plan.json`, `etage.json`) : idempotent, déterministe, rapporte `appliquée`, `déjà appliquée`, `ignorée (non approuvée)` ou `introuvable` ; ne déplace jamais un élément de plus de 60 unités sans `approved` ; puis `npm run carte` régénère `world.json`, `decor.json`, `etage.world.json`.
- **Fusion tardive** : si `main` a changé les sources de la carte (par exemple un lot qui touche `plan.json`), prendre la version de `main` des sources (`git checkout origin/main -- data/game/maps/rez-de-chaussee/plan.json data/game/maps/rez-de-chaussee/etage.json`), rejouer `node scripts/modele/appliquer-decisions.mjs`, puis `npm run carte`, `node scripts/zones-metriques.mjs --etages` et les tests. Les décisions dont l'identifiant a disparu sont signalées `introuvable`, jamais une erreur.

## Corriger la carte d'après le modèle
1. Relancer le relevé (étapes 1 à 3 ci-dessus) si le modèle a changé.
2. Relire `ecarts.html` (et `?floor=1`) ou `Docs/ref/ecarts-modele.md`.
3. Éditer `ecarts-decisions.json` : ajouter, retirer ou modifier une décision ; mettre `"approved": true` pour autoriser un écart de plus de 60 unités.
4. `node scripts/modele/appliquer-decisions.mjs`, puis `npm run carte` et `node scripts/zones-metriques.mjs --etages`.
5. `npm test`, regarder `carte.html` et la visite, puis commit des sources et des fichiers générés.

## Mode visite et `visite.html`
- Visite = `jeu.html?nospawn=1&wave=N_VISITE` (`&floor=1` pour démarrer à l'étage) : **aucun paramètre ni code ajouté au jeu** (option a). `?nospawn=1` rend le directeur de vagues inactif (aucune manche, aucun compte à rebours, aucune annonce, aucun zombie) ; `?wave=N` ouvre au chargement, sans les construire, les portes dont `openAfterWave < N`. `N_VISITE` = plus grande valeur d'`openAfterWave` des portes non `planned` + 1 (`visitWave` de `js/core/visite.js`) : 31 avec les portes 1 à 3.
- Les fenêtres restent fermées au joueur (sortir par une fenêtre est hors du lot) ; le joueur ne peut ni tomber ni mourir (aucun zombie) ; rien n'est stocké.
- `visite.html` (`js/visite/main.js`, `css/visite.css`) lit `zones.json` et affiche les liens ; son `<noscript>` donne les liens fixes de la manche 31. L'aperçu de la branche s'ouvre sur elle (`apercu.txt`, première ligne `visite.html` : `parseEntry` de `js/lots.js` l'accepte) ; **remettre `jeu.html` avant une fusion**.
