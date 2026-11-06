# Plan d'intégration des personnages v2 et du sang (lot 3j → lot 4b)

*Lot 5e : le retrait de l'ancien modèle prévu ici est fait (`pose.js`, `character.js`, `?perso=actuel`) ; plan gardé comme historique.*

Ce plan prépare le passage des variantes au jeu par défaut. **Mise à jour après la livraison (demande du propriétaire)** : le jeu par défaut utilise déjà les variantes « riche » et le sang complet (`?perso=actuel&sang=0` : le jeu d'avant) ; les sections 1 et 2 ci-dessous restent valables pour remplacer « riche » par les choix définitifs. Les choix viennent du texte « Mes choix » de `atelier-personnages.html` (format : `Docs/ref/atelier-personnages.md`) ; `node scripts/personnages/projection.mjs mes-choix.txt` imprime leur budget.

## 1. Variante par défaut de chaque personnage

| Personnage | Variante par défaut | Réglages à reporter |
|---|---|---|
| Joueur | celle de « Mes choix » (ligne `perso=joueur`) | macros (`taille`, `carrure`, `teinte`) dans `characters-v2.json` (champ `macros.*.default`), tenue (palette par défaut) |
| Marcheur, petit, voûté, grand | celle de « Mes choix » (une ligne par type ; un type absent garde A) | macros et style d'animation (`style`), `amplitude`, `rythme`, `lourdeur` dans les styles de `poses-v2.json` |

Sang : valeur de la ligne `sang=` (défaut proposé : `reduit` tant que l'écran de réglages n'existe pas).

## 2. Valeurs par défaut à changer

- `js/game/persos-params.js` : défauts actuels `perso: 'riche'`, `sang: '1'` (fait) ; à remplacer par la variante choisie (ou une valeur par personnage lue dans `characters-v2.json`) ; `usure` reste `auto`. Le futur écran de réglages lira le niveau de sang (`0`, `reduit`, `1`) dans la sauvegarde au lieu de l'adresse.
- `js/game/game.js` : le chargeur est déjà importé à chaque partie (fait) ; il pourra devenir un import statique quand `actuel` disparaîtra. Lighthouse `jeu.html` (rendu logiciel, 6 mesures) : 41 à 54 par défaut, médiane 47,5 (référence `?perso=actuel&sang=0` : 49 à 59) ; seuil 45.

## 3. Code à supprimer ensuite

- `js/core/pose.js` (remplacé par `js/core/pose-v2.js` ; `fromV1` disparaît avec lui), les pièces de `js/game/character.js` (`buildGeometries`, `merge`, `createKit` : `createCharacter` devient l'appel du kit v2), `js/game/skeleton.js` (hors `STRIDE`, à déplacer).
- Atlas `atlas-persos` de `data/game/textures.json` et ses jetons `--game-cloth-*`, `--game-zombie-skin-*`, `--game-jacket`, `--game-denim*`, `--game-pants-dark` (si plus aucun usage).
- `data/game/zombie-variants.json` : garder les identifiants et l'ordre (variante visuelle d'un type), retirer les régions d'atlas.

## 4. Tests à adapter

| Test | Ce qui change |
|---|---|
| `tests/unit/personnages.test.js` | 12 pièces / 700 triangles → architecture os rigides : ≤ 4 appels, ≤ 1 600 triangles ; contraste mesuré sur la couleur vue (méthode du lot 3j, escalier compris) ; « aucune trace de sang » → niveaux de sang |
| `tests/unit/core-pose*.test.js` (3 fichiers) | remplacés par `tests/unit/persos-animations.test.js` |
| `tests/e2e/jeu-personnages.spec.js`, `jeu-planches.spec.js` (budget), `etage-salle.spec.js` (budget U1, U4) | appels mesurés : environ 140 de moins avec 10 zombies (voir la section 6) ; nouveaux plafonds à fixer sur mesure |
| `tests/e2e/jeu-3d.spec.js` (pose des zombies, `readPose`) | `readPose()` des personnages v2 renvoie `{ anim, phase, outfit, wear, wound }` |
| `tests/unit/lot1-regles.test.js` | les lignes `allowed.push(… // lot 3j)` deviennent des entrées de la liste |
| `tests/e2e/persos-*.spec.js` | entrent dans la suite rapide (`ESSENTIAL` de `playwright.config.js`) : `persos-atelier` et `persos-jeu` (environ 1 min 30 à eux deux en rendu logiciel) ; `persos-sang` reste dans la suite complète |

## 5. Couleurs (`css/tokens.css`)

Le bloc « Personnages et sang (lot 3j) » est déjà en place : `--perso-*` (peaux, tissus, pantalons, accessoires, crasse, déchirures, joueur, lampe, yeux) et `--sang-frais`, `--sang-sec`, `--sang-reduit`. À la fusion : garder le bloc tel quel, puis retirer les jetons `--game-*` des anciens personnages (section 3).

## 6. Budget et mémoire

- Appels : 11 personnages = 33 appels (os rigides) au lieu de 177 (pièces articulées) ; sang ≤ 2 appels ; 6 cadavres = 18 appels. Pire cas mesuré en jeu avec `?perso=B&sang=1` : voir le bilan du lot.
- Triangles : A, B, C sans sang ≈ la référence (+0 à +3 %) ; avec le sang complet et 6 cadavres : 20 000 à 22 700 dans R1, R2, U1, U4 (limites actuelles 30 000) ; « riche » : jusqu'à 43 800 (sous la limite de refonte de 45 000 seulement). « Riche » étant le défaut, les plafonds de triangles des tests e2e existants sont passés à 45 000 (voir `Docs/ref/fusion-3j.md`) ; mesuré par défaut : R1 61 appels / 28 576 triangles, R2 50 / 29 176, U1 68 / 29 414, U4 74 / 30 298.
- Mémoire : textures des personnages 1,49 Mo + sang 0,35 Mo (≤ 4 Mo) ; géométries ≈ 140 Ko par variante et par tenue utilisée ; une texture d'os de 4 Ko par personnage vivant ou cadavre.

## 7. Sons à prévoir (non faits dans ce lot)

- Impact sur la chair (balle qui touche un zombie, plus mat que l'impact actuel), deux à trois variantes.
- Chute du corps (mort d'un zombie : un choc sourd, synchronisé sur la fin de la chute de 1,2 s).
- Marteau de réparation (un coup par cycle de l'animation `reparation`, `strikesPerPlank` coups par planche).
- Tous dans `data/game/sounds.json` (synthèse, aucun fichier audio), déclenchés par le directeur des sons à partir des événements `zombieHit` (déjà émis) et de nouveaux événements visuels (`corpseLanded`, `repairStrike`).

## 8. Réglage « réduire le sang »

Le futur écran de réglages propose les trois niveaux : « Sang : aucun / réduit / complet » (valeurs `0`, `reduit`, `1` de `blood.json`), mémorisés dans la sauvegarde (nouvelle clé de préférences, hors de l'économie). Le niveau ne change aucun état de jeu ; le mode réduit coupe les taches sur les corps et raccourcit les cadavres. `prefers-reduced-motion` ne coupe pas le sang (il n'y a ni clignotement ni flash) mais peut proposer `reduit` par défaut.

## 9. Procédure (lot 4b)

1. Fusionner `lot-3j` dans la branche d'intégration (manifeste : `Docs/ref/fusion-3j.md`, ne jamais fusionner la première ligne d'`apercu.txt`).
2. Reporter les choix (sections 1 et 2), lancer `node scripts/personnages/projection.mjs mes-choix.txt`.
3. Adapter les tests (section 4), puis supprimer l'ancien code (section 3).
4. Remesurer R1, R2, U1, U4 (`node scripts/personnages/mesure-rendu.mjs`), Lighthouse et la suite complète.
