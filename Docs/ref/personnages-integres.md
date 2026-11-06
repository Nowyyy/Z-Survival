# Personnages et sang intégrés au jeu par défaut (lot 3m)

Source des choix : `Docs/ref/passation-personnages-4b.md` (lot 3j, § 2 et 3), désignée par le propriétaire comme fichier de choix. Table du jeu : **`data/game/persos-choix.json`** (provisoire). Plan d'origine : `Docs/ref/integration-personnages.md`.

## Personnages par défaut

| Personnage | Variante | Macros (taille, carrure, usure, teinte, posture) | Macros d'animation (amplitude, rythme, lourdeur) | Style | Tenues |
|---|---|---|---|---|---|
| Joueur | riche | 0, 0, 0, 0, 0 | 0, 0, 0 | A | `sable` (palette par défaut ; le joueur ne tire pas de tenue) |
| Marcheur | riche | 0, 0, 0, 0, 0 | 0, 0, 0 | A | toutes (6, tirées à chaque apparition) |
| Petit | riche | 0, 0, 0, 0, 0 | 0, 0, 0 | A | toutes (6) |
| Voûté | riche | 0, 0, 0, 0, 0 | 0, 0, 0 | A | toutes (6) |
| Grand | riche | 0, 0, 0, 0, 0 | 0, 0, 0 | A | toutes (6) |

- Indiqués par la passation : variante « riche » pour les cinq, 6 tenues par zombie, 3 palettes du joueur (disponibles, la première est portée), 4 paliers d'usure selon la manche (`usure: "auto"`), **sang complet** (`sang: "1"`).
- **Non indiqués** : macros, style et macros d'animation. La table reprend les valeurs des données de la variante « riche » (`characters-v2.json`, `poses-v2.json`), sans changement : le rendu par défaut est celui du lot 3j.

## Paramètres d'adresse (jamais mémorisés, jamais en mode essai)

- `?perso=choix` (défaut) : la table, personnage par personnage ; `?perso=A|B|C|riche` : une variante pour les cinq ; `?perso=actuel` (ancien modèle) : retiré au lot 5e, valeur inconnue.
- `?sang=0|reduit|1` : défaut = `sang` de la table (`0` si la table est absente ou illisible).
- `?usure=auto|0|1|2|3` : défaut = `usure` de la table (`auto` : palier de la manche).
- Valeur inconnue : défaut, sans erreur. Absents de `readOnlyParams` (`data/game/save.json`) : `?test=1&store=local&perso=B` écrit la sauvegarde.

## Changer un défaut

Modifier la ligne du personnage dans `data/game/persos-choix.json` : `variante` (`A`, `B`, `C` ou `riche` ; lot 5e : `actuel` retiré, une variante absente ou inconnue donne `A`), `macros` (bornes de la variante, −2 à 2), `animation`, `style` (`A`, `B`, `C`), `tenues` (`"toutes"` ou liste d'identifiants de `characters-v2.json`) ; `sang` et `usure` en bas du fichier. `tests/unit/persos-integres.test.js` vérifie chaque valeur. Budget projeté : `node scripts/personnages/projection.mjs data/game/persos-choix.json`. Une variante inconnue ou absente donne l'ancien modèle.

## Chargement

`js/game/game.js` importe `persos-loader.js`, qui lit la table en même temps que le module v2 (`persos-runtime.js`, `character-v2.js`, `blood-fx.js`) et ses données. **Lot 5e : l'ancien modèle (`js/core/pose.js`, `js/game/character.js`) est retiré ; chaque personnage est construit par le kit v2 (table absente ou variante inconnue : `A`).** Avant : il n'était importé que si un personnage était `actuel` (adresse ou table) ; sinon le chargeur fournit un modèle v2 seul (`computePose` neutre, `createKit` réduit aux variantes, `createCharacter` = `kit.v2.create`). Aiguillage par personnage : `kit.v2.handles(kind, variant)` (`character-v2.js`), utilisé par `character.js` quand l'ancien modèle est chargé. `js/game/skeleton.js` reste chargé : `STRIDE` y règle le rythme des pas du jeu.

## Code ancien supprimable après validation

*Lot 5e : supprimé (`js/core/pose.js`, `js/game/character.js`, `?perso=actuel`) ; `fromV1`, `skeleton.js` (`STRIDE`) et la région `atlas-persos` sont gardés (tests, oracles du lot 5d, projections).* Liste d'origine :

`js/core/pose.js` ; dans `js/game/character.js` : `buildGeometries`, `merge`, `createKit`, `createCharacter` actuel ; `js/game/skeleton.js` sauf `STRIDE` ; `fromV1` de `js/core/pose-v2.js` ; région `atlas-persos` de `data/game/textures.json` et ses jetons `--game-cloth-*`, `--game-zombie-skin-*`, `--game-jacket`, `--game-denim*`, `--game-pants-dark` (si plus aucun usage) ; régions d'atlas de `zombie-variants.json` (garder identifiants et ordre). Puis : `computePose` de `game.js`, branche « actuel » du chargeur et tests ouverts avec `&perso=actuel&sang=0` (liste : `Docs/ref/fusion-3j.md` et `Docs/lots/lot-3m.md`).

## Budget

Limites de refonte (décision du propriétaire) : **45 000 triangles et 400 appels** par vue ; par personnage 1 600 triangles (riche 2 600), 4 appels, ombre ≤ 64 triangles. Un cadavre « riche » coûte environ 2 100 triangles : les niveaux réduit et complet gardent **2 cadavres** à la fois (`blood.json`, avant : 6 ; plafond absolu `corpses.max` : 6). Pire cas mesuré (10 zombies vivants, 2 cadavres, 48 taches) : U4 85 appels, 44 086 triangles. Mesures et marges : `Docs/lots/lot-3m.md`.

Chargement allégé (lot 3m-C) : atlas des taches calculé à la première tache ; matières de blessure (tuiles 1 à 3) créées au premier palier de blessure ; `blood-fx.js` jamais importé avec `?sang=0`. Essayés puis retirés, sans gain mesurable : tenues au premier usage, textures des personnages réduites d'un cran.

## Futur écran de réglages (lot 7)

- Trois niveaux : « Sang : aucun / réduit / complet » (`0`, `reduit`, `1` de `blood.json`) ; aucun effet sur le jeu.
- Stockage : sauvegarde v2, clé de préférences hors de l'économie ; ordre de priorité : adresse (`?sang=`) > sauvegarde > `persos-choix.json`.
- Le niveau `0` ne crée ni particule, ni tache, ni cadavre (un zombie tué disparaît, comme avant le lot 3j).
