# Manifeste de fusion du lot 3g (atelier de la carte)

But : fusionner `lot-3g` dans une branche d'intégration (`lot-4b`), jamais dans `main`. `lot-3g` contient déjà `main` après le lot 4 (`c166e53`, récupéré par la fusion `75552cf`) : ses conflits avec le lot 4 sont résolus dans la branche.

## Fichiers où un conflit est toléré, et sa résolution
Règle générale : **garder les deux versions** (réunion des listes, des clés, des blocs).
- `apercu.txt` : garder **la première ligne de la branche d'intégration** (page d'ouverture de l'aperçu) ; `type` et `titre` de la branche d'intégration.
- `scripts/build.mjs`, ligne `ENTRIES` : réunion ; garder `'visite.html', 'ecarts.html'` côte à côte (testé par `atelier-hygiene`).
- `package.json`, ligne `build` (si un autre lot la change) : réunion des pages publiées.
- `css/tokens.css`, fin du bloc `--game-*` : garder les deux blocs ; le lot 3g ajoute `--game-fire`, `--game-fire-edge`, `--game-smoke` après `--game-furniture`.
- `js/game/palette.js`, liste `NAMES` : réunion (le lot 3g ajoute `fire`, `fire-edge`, `smoke`).
- `data/i18n/fr.json` : réunion des clés (le lot 3g ajoute un bloc de 25 clés `dev.visite.*` et `dev.ecarts.*`) ; vérifier que le JSON reste valide.
- `data/changelog.json` : réunion des entrées, dans l'ordre des lots ; l'entrée `lot-3g` existe déjà (ajoutée à la demande du propriétaire pour débloquer un déploiement : le test `data-changelog` exige une entrée par bilan).
- `playwright.config.js`, liste `ESSENTIAL` : réunion (le lot 3g ajoute `atelier-retours`).
- Tests de pureté et de listes : `tests/unit/lot1-regles.test.js` (modules de `js/core/`), `tests/unit/atelier-hygiene.test.js` (`NEW_CORE`), `tests/unit/data-i18n.test.js` (pages et scripts lus) : réunion des listes.
- Tests du journal : `tests/unit/data-changelog.test.js`, `tests/e2e/dev.spec.js` : version de la branche d'intégration (dernier lot entré).

Un conflit sur **un autre fichier** : `git merge --abort`, lister les fichiers, s'arrêter.

## Sources de la carte
Le lot 3g change `plan.json` et `etage.json` **seulement par des décisions rejouables** (`data/game/maps/rez-de-chaussee/ecarts-decisions.json`, dont `escalier-courbe` : emprise `free`, et `F7` : fenêtre retirée, toutes deux approuvées par le propriétaire). `zones.json` n'est pas modifié.
Si la branche d'intégration a d'autres changements de ces sources : prendre leur version, puis
```
node scripts/modele/appliquer-decisions.mjs
npm run carte
```
et vérifier que `world.json`, `decor.json`, `etage.world.json`, `decor-interieur.world.json` et `mobilier.world.json` sont identiques à la sortie des scripts (tests `atelier-*`, `maps-fidelite`, `zones-*`).

## Fichiers du lot 3g (à ne pas réécrire par un autre lot)
- Nouveaux : `visite.html`, `ecarts.html`, `js/visite/`, `js/ecarts/`, `css/visite.css`, `css/ecarts.css` ; `js/core/` : `releve`, `ecarts`, `ecarts-svg`, `visite`, `decisions`, `decor-interieur`, `mobilier-aspect`, `portes-aspect`, `see-through`, `decor-vivant` ; `js/game/` : `fire`, `mist`, `see-through` ; `scripts/modele/` ; données de carte `releve.json`, `ecarts-decisions.json`, `decor-interieur.json` et `.world.json`, `mobilier.world.json`, `feux.json` ; `Docs/ref/affinage.md`, `Docs/ref/ecarts-modele.md`.
- Modifiés (blocs isolés) : `js/game/world.js` (murs, portes, grilles, mobilier, feux, brume, mur percé), `js/game/main.js` (bloc de réglages de rendu), `js/game/game.js` (trois lignes : sortie d'escalier, mur percé, import), `js/game/windows-mesh.js` (pastilles), `js/game/textures.js`, `js/core/texgen.js`, `js/core/maps.js`, `js/core/stair-walk.js`, `data/game/render.json`, `data/game/textures.json`, `scripts/plan-vers-monde.mjs`, `scripts/lib/carte-zones.mjs`.
- Règles de jeu **non modifiées** : `waves.js`, `projectile.js`, `ray.js`, `player-stats.js`, `siege.js`, `save.js`, `economy.js`.

## Après la fusion
- Lignes de `CLAUDE.md` et `conventions.md` : dans le bilan `Docs/lots/lot-3g.md` (à ajouter une seule fois par la branche d'intégration).
- Aperçu : `…/lots/<branche>/visite.html`, `…/jeu.html?nospawn=1&wave=31`, `…/ecarts.html`.
