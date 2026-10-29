# Lot 3b — Première carte : rez-de-chaussée d'après le plan du propriétaire

Aucun levier Lighthouse appliqué (50 / 50, seuil 45). Branche `lot-3b` (la session démarrait en HEAD détaché : branche créée depuis `main`). Parties A (`acfe22d`) et B faites.

**Livré**
- `data/game/maps/rez-de-chaussee/plan.json` (pixels seulement), `data/game/maps/params.json`, `js/core/maps.js` (`planToWorld`, `resolveMapId`, `analyzeMap`, `mergeInterstices`), `js/core/shape.js` (rectangles, polygone, murs), `scripts/plan-vers-monde.mjs` (`npm run carte`), `world.json` et `decor.json` générés, `js/core/map-svg.js` + `carte.html`, `css/carte.css`, `js/carte/main.js`, `scripts/plan-carte.mjs`.
- Jeu : `layout.js` accepte les cartes à segments (salle inchangée), `decor.js`, `siege.js`, `plank-layout.js`, `player-down.js` généralisés par `layout.inside`, rendu des murs, piliers, escaliers, rampe, débris par fenêtre (`createDebrisMeshes`), `#hud-live` F1 à F8, `?labels=1`, `?map=`, `getState().map`, caméra `?zoom=1`. Workflow, `index.html`, `seed.md`, `world.json` et `decor.json` d'origine : inchangés. `player-down.js` : 2 lignes ajoutées (test `inside`), comportement ancien identique.

**Choix**
- Schéma : `contour`, `walls` (segments, 40 d'épaisseur), `openings`, fenêtres sur la ligne du mur, `obstacles`, `pillars`, `stairs`, `ramp`, `zoom` (3,4 = même échelle qu'au lot 3a). Détails : `Docs/ref/conventions.md`.
- Fenêtres : largeur 80 au lieu de 140 (retour du propriétaire : environ 2 joueurs de large, `windowSize` de `params.json`) ; décalées : F5 de 50, F6 de 40, F7 de 45 (valeurs du lot) ; F4 n'a plus besoin d'être décalée. F9 absente.
- Retour du propriétaire : flèches E2-11 au bord de l'écran retirées (marqueurs des fenêtres cassées) ; le code de calcul reste dormant, sans élément `#edges`. L'échelle de la carte (5 unités par pixel) n'a pas été réduite : couloirs de 90 et départ libre de 120 en dépendent.
- Fusions : escalier courbe + pilier (350,292) + pilier (412,301) en un bloc de 445 × 300 ; M2 + M3 + M4 (comptoir du fond, M2 prolongé de 20 jusqu'au mur). Prolongés jusqu'au mur : M2, M8, M12.
- Mobilier retiré : M5 (à 15 du pilier), M6 (recouvre le pilier), M10 (à 20,6 du mur, en diagonale), M11 (à 75 du pilier). Choix : jamais de fusion entre mobilier et structure (le mobilier est retiré).
- Domaine du champ du joueur : non restreint (recalcul 5 ms en Node, 7 ms dans le navigateur ; seuil 8 ms en Node).
- Décor : 4 voitures, 24 arbres (28 solides au plus 36), 18 buissons, 6 lampadaires, 4 barrières, sentiers, trottoir et route au sud, rampe de F3 en bande de sol.
- Un seul barreau par fenêtre sur la carte (budget).

**Critères (chiffres)**
- Départ `main` : 2 617 Vitest, 669 Playwright réussis, 151 ignorés. Fin : 2 816 Vitest (+199) ; Playwright 745 réussis + 5 échecs, dont 3 tests adaptés (ci-dessous), relancés verts ; 152 ignorés.
- Budget (10 zombies, planches, ombres, cône) : référence `main` 191 appels / 14 904 triangles ; carte : 193 / 14 058 (limites 194 et 15 000).
- Flux : huit champs de fenêtre 33,6 ms navigateur (Node : grille + 8 champs sous 2 s, mesure dans le test) ; recalcul du joueur 6,9 ms navigateur, environ 5 ms Node.
- Lighthouse `jeu.html` : `main` 53 (VHS) / 51 (`&vhs=0`) ; lot : 50 / 50 ; accessibilité et bonnes pratiques 100 ; CLS 0,002 (tests CLS 360, 768, 1440 verts).
- Images par seconde, 10 zombies, WebGL logiciel : 14 (carte) et 12,6 (salle) : non représentatif, rien à conclure.
- Simulation 120 s, vague 5, joueur immobile au centre : ouvertures à 16,8 s (F2), 18,8 (F6), 23,5 (F5), 24 (F7), 31,8 (F4) ; F1, F3, F8 pas ouvertes ; mort à 41,4 s, 1 chute consommée.
- Aires : intérieur 1 983 850, libre 1 684 725. `CLAUDE.md` : 8 454 caractères (limite 9 000 ; objectif 8 200 non atteint).

**Tests adaptés (avant / après)** : helpers `salle(url)` ajoute `map=salle` aux URL des tests anciens ; `jeu-monde` et `jeu-stats` : `location.search` attendu avec `?map=salle&` en tête ; `jeu-planches` (culling) : débris hors champ, écart de triangles 4 × débris -> 0 (un maillage par fenêtre) ; `data-i18n` (carte.html et js/carte lus) ; `game-data` (seulement les `.json` de `data/game/`) ; `lot1-regles` (maps, map-svg, shape autorisés) ; `data-changelog` et `dev.spec` (lot 3b). Aucun test supprimé.

**Points ouverts** : fidélité visuelle non jugée par l'agent (coordonnées approximatives du plan, ±5 px) ; F1 est cachée derrière le HUD à `?zoom=1` en 667 × 375 ; comportement sur vrai téléphone non vérifié ; l'aperçu publié n'a pas pu être ouvert.

**Choix à valider** : largeur des fenêtres (80) ; F5 à 50 du plan ; rampe de F3 (bande de sol de 225 × 350) ; alcôve nord (380 × 180) fermée à l'est par l'escalier ; escaliers pleins (le courbe fusionné avec deux piliers) ; départ libre sur 120 (141 réels) ; apparitions à 450 et 650 ; mobilier M5, M6, M10, M11 retiré ; budget 193 appels (+2).

**Corriger la carte** : (1) ouvrir `plan.json` ; (2) changer un chiffre (pixels) ; (3) `npm run carte` (liste décalages, fusions, retraits ; échoue si une règle casse) ; (4) ouvrir `carte.html` et comparer au plan ; (5) `npm test`, commit de `plan.json`, `world.json`, `decor.json`.

**À tester par moi** : `carte.html` sur téléphone en paysage et sur ordinateur, comparée à mon plan ; `jeu.html?labels=1&zoom=1` pour F1 à F8 ; jouer, défendre F3, F5, F7 ; vérifier le passage aile / grande salle, la poche, les piliers, la rampe, les carrés et débris des fenêtres sud. Retours par identifiant (`F7 : trop à gauche`, `pilier (176,228) : manquant`, `ouverture aile : trop étroite`).

**Fusion (à faire par moi)** : Pull Request `lot-3b` vers `main`, « Create a merge commit », ne pas supprimer la branche ; pages : `/`, `/dev/` (journal), `/lots/lot-3b/jeu.html`, `/lots/lot-3b/carte.html`.

## Mise à jour : carte refaite d'après le modèle SketchUp
Retours du propriétaire : fenêtres de 80 (puis 72 mesurées sur le modèle), flèches de bord retirées, couloir minimal abaissé de 90 à 50, `plan.json` refait d'après le modèle (coupe à 1,2 m) : aile de 441 × 1 656, grande salle de 1 644 × 621, ouverture de 85, 8 fenêtres de 72, 11 piliers de 35, un escalier, sans rampe, monde de 4 040 × 3 460. Tests de fidélité réécrits d'après le nouveau plan ; budget de dessin toujours mesuré par le test (193 appels). Détails : `Docs/ref/conventions.md`.

## Mise à jour : textures de nuit
D'après les captures du propriétaire : intérieur en béton chaud (carrelage gris-brun, murs brun rosé), extérieur de nuit (herbe morte bleutée, feuillage éteint) et brume (`scene.fog`, jeton `--game-fog`, distances en multiples de la distance de la caméra dans `render.json`). Jetons de `tokens.css` seulement (aucune image) ; laser éclairci pour garder 4,5:1 ; les seuils des tests n'ont pas changé. L'ancienne salle prend aussi ces couleurs.

## Mise à jour : béton gris froid et mur de brouillard
Béton gris froid (la teinte brun rosé venait des flammes de la carte d'origine) : jetons `--game-wall*`, `--game-tile-*`, `--game-gravel`, `--game-metal`, `--game-fog`. Mur de brouillard : `js/core/fog.js` (pur) calcule une grille d'opacité d'après la distance au bâtiment ; `world.js` l'affiche en plan translucide horizontal (1 appel de dessin de plus, test de budget ≤ 194). Transparent près des murs, opaque à partir de `wallFar` (480) : les zombies (apparitions à 450 et 650) surgissent de la brume. Réglage : `data/game/render.json` (`fog.wallNear` 180, `wallFar` 480, `wallHeight`, `wallPad`, `wallCell`). L'ancienne salle prend les couleurs mais sans mur de brouillard.
