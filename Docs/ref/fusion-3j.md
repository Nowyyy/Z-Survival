# Manifeste de fusion du lot 3j (personnages v2 et sang)

Liste exacte des fichiers **partagés** modifiés par `lot-3j` (tout le reste est nouveau et propre au lot) et la résolution à appliquer dans la branche d'intégration du lot 4b. Règle générale : **garder les deux versions**.

| Fichier | Modification du lot 3j | Résolution |
|---|---|---|
| `apercu.txt` | première ligne `atelier-personnages.html`, `type: hifi`, `titre: Atelier des personnages` | **Ne jamais fusionner la première ligne : reprendre celle de `main`** (et son titre). La page du lot reste `atelier-personnages.html`. |
| `scripts/build.mjs` (`npm run build` = `node scripts/build.mjs`) | une ligne séparée après `const ENTRIES = […]` : `ENTRIES.push('atelier-personnages.html'); // lot 3j …` | garder les deux : la ligne `ENTRIES` de l'autre lot et la ligne `push` du lot 3j. `package.json` n'est pas modifié. |
| `css/tokens.css` | bloc final isolé de 37 lignes : `/* Personnages et sang (lot 3j) … */` puis `:root { --perso-* …, --sang-frais, --sang-sec, --sang-reduit }` | garder les deux blocs de fin de fichier, l'un après l'autre. |
| `tests/unit/lot1-regles.test.js` | 7 lignes `allowed.push('js/core/<fichier>.js'); // lot 3j …` (character-parts, pose-v2, persos-variants, texgen-persos, blood, arena, crowd), juste après la déclaration de `allowed` | garder les deux : la liste `allowed` de l'autre lot puis les 7 lignes `push`. |
| `tests/unit/core-purity.test.js` | non modifié (aucune liste d'autorisation : les nouveaux fichiers de `js/core/` respectent ses règles) | — |
| Test des clés de textes (`tests/unit/data-i18n.test.js`) | non modifié : les textes de la page sont dans `data/i18n/atelier-personnages.json` (clés `dev.persos.*`), chargés par la page comme l'atelier des sons du lot 3h, et vérifiés par `tests/unit/persos-page.test.js` ; `fr.json` n'est pas touché | résolution recommandée au lot 4b : faire lire au test d'hygiène tous les `data/i18n/*.json` par glob. |
| `js/game/character.js` | 1 ligne : `if (kit.v2) return kit.v2.create(kind, variant);` au début de `createCharacter` | garder. |
| `js/game/game.js` | 18 lignes (15 ajoutées, 3 remplacées), toutes marquées `// lot 3j` : chargeur dynamique (2 lignes en tête), `pv` après `createKit`, `pv?.reset()`, `pv?.update(dt)`, `pv?.impacts(…)`, `pv?.playerHit(…)`, `poseIn` / `zIn` passés à `setPose`, `pv?.zombie(…)`, `pv?.sync(…)`, `persos` dans `snapshot()` | garder les deux ; si l'autre lot a modifié les mêmes lignes (`setPose` du joueur ou des zombies), reporter la forme `const poseIn = {…}; lastPose = computePose(poseIn); playerChar.setPose(lastPose, poseIn, pv?.playerCtx(sim, eff));`. |
| `js/game/effects.js` | non modifié (le sang s'accroche aux impacts dans `game.js`) | — |

Nouveaux fichiers (aucun conflit attendu) : `atelier-personnages.html`, `css/atelier-personnages.css`, `data/i18n/atelier-personnages.json`, `data/game/characters-v2.json`, `poses-v2.json`, `blood.json`, `js/core/character-parts.js`, `pose-v2.js`, `persos-variants.js`, `texgen-persos.js`, `blood.js`, `arena.js`, `crowd.js`, `js/game/character-v2.js`, `blood-fx.js`, `persos-params.js`, `persos-loader.js`, `persos-runtime.js`, `js/atelier-personnages/*`, `scripts/personnages/*`, `tests/unit/persos-*.test.js`, `tests/e2e/persos-*.spec.js`, `Docs/ref/atelier-personnages.md`, `personnages-actuels.md`, `integration-personnages.md`, ce manifeste, `Docs/lots/lot-3j.md`.

## Fusion à blanc (partie D)

Résultats : voir la section « Fusion à blanc » du bilan `Docs/lots/lot-3j.md` (branches temporaires locales `fusion-essai-3j-*`, jamais poussées, supprimées).
