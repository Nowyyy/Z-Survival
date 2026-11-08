# Manifeste de fusion du lot 3k (atelier de l'interface)

La branche `lot-3k` ne modifie aucun fichier du jeu. Elle ajoute des fichiers neufs et touche **six fichiers partagés**, chacun par des lignes à part. Elle sera fusionnée dans la branche d'intégration du lot 4b avec `lot-3g`, `lot-3h` et `lot-3j`, pas directement dans `main`.

## Fichiers partagés modifiés (liste exacte)
| Fichier | Lignes ajoutées ou changées | Résolution en cas de conflit |
|---|---|---|
| `apercu.txt` | 1re ligne `jeu.html` → `interface-retenue.html` (après les choix du propriétaire ; `atelier-interface.html` avant) ; 3e ligne `titre: Argent et sauvegarde` → `titre: Interface retenue` | **Ne jamais fusionner la première ligne** : reprendre le fichier de `main` (ou celui que le lot 4b choisit). |
| `scripts/build.mjs` | une ligne neuve après `mkdirSync(OUT);` : `ENTRIES.push('atelier-interface.html', 'interface-retenue.html'); // lot 3k …` (la liste `ENTRIES` n'est pas touchée) | Garder les deux versions : la liste `ENTRIES` de l'autre branche, puis la ligne `push` du lot 3k. |
| `tests/unit/lot1-regles.test.js` | deux lignes neuves après `const allowed = […]` : `allowed.push('js/core/ui-mock.js');` et `allowed.push('js/core/ui-measure.js');` | Garder les deux versions : la liste et les lignes `push` de chaque lot (le lot 3j ajoute aussi des lignes `push`). |
| `data/changelog.json` | une entrée neuve `lot-3k` en fin de liste (ajoutée après le bilan, à la demande du propriétaire, pour que la CI de la branche repasse au vert) | Garder les deux versions : toutes les entrées, dans l'ordre chronologique de fusion. |
| `tests/unit/data-changelog.test.js`, `tests/e2e/dev.spec.js` | lot courant `lot-4` → `lot-3k` (dernier du journal ; premier affiché, texte « interface ») | Mettre le dernier lot fusionné. |

La consigne parlait d'« une ligne dans `npm run build` de `package.json` » : la liste des fichiers publiés est dans `scripts/build.mjs` (`package.json` appelle seulement `node scripts/build.mjs`). `package.json` n'est donc **pas** modifié. `core-purity.test.js` n'a pas de liste d'autorisation (il parcourt `js/core/`) : non modifié, les deux nouveaux modules le passent. Le test de clés de textes `data-i18n.test.js` n'est **pas** modifié : les textes de l'atelier sont dans `data/i18n/atelier-interface.json`, lu par la page seule (`fetch` de même origine, fusionné en mémoire avec `fr.json`) et vérifié par `tests/unit/interface-atelier-protos.test.js` (clés utilisées, clés présentes, aucune clé commune avec `fr.json`). Résolution recommandée au lot 4b : charger `data/i18n/*.json` par glob dans `data-i18n.test.js`, ou déplacer les clés `ui3k.*` retenues dans `fr.json` (voir `integration-interface.md`).

## Fichiers neufs (aucun conflit possible, noms propres au lot)
`atelier-interface.html`, `interface-retenue.html` ; `css/atelier-interface.css`, `css/proto-a.css`, `css/proto-b.css`, `css/proto-c.css` ; `js/atelier-interface/` (`main.js`, `retenue.js`, `view.js`, `render.js`, `screens.js`, `choices.js`, `actuel.js`, `measure-dom.js`) ; `js/core/ui-mock.js`, `js/core/ui-measure.js` ; `data/game/ui-atelier.json`, `data/i18n/atelier-interface.json` ; `scripts/interface/mesures.mjs`, `scripts/interface/projection.mjs` ; `tests/unit/interface-atelier-{mock,mesure,donnees,hygiene,protos,ecrans}.test.js` ; `tests/e2e/interface-atelier.spec.js`, `tests/e2e/interface-atelier-ecrans.spec.js`, `tests/e2e/interface-retenue.spec.js` ; `Docs/ref/interface-actuelle.md`, `integration-interface.md`, `atelier-interface.md`, `fusion-3k.md` ; `Docs/lots/versions/v0.5.md#lot-3k`. Préfixe `interface-atelier-*` choisi pour les tests : `lot-3g` et `lot-3h` créent tous deux `tests/unit/atelier-hygiene.test.js`.

## Fusion à blanc (partie C, `origin` lu le 1er novembre 2026)
Branches temporaires locales `fusion-essai-3k-*`, jamais poussées, supprimées ensuite. Point de départ : le commit « Lot 3k-B » plus le travail de la partie C (commit local temporaire `fusion-essai-3k-wip`, supprimé).

| Branche (hash) | Fichiers en conflit avec `lot-3k` | Conflits déjà présents entre `main` et la branche |
|---|---|---|
| `lot-3g` (`4b63d69`) | `apercu.txt`, `tests/unit/lot1-regles.test.js` | aucun |
| `lot-3h` (`07e93f7`) | `apercu.txt`, `scripts/build.mjs`, `tests/unit/lot1-regles.test.js` | les trois mêmes (la branche part d'avant le lot 4) |
| `lot-3j` (`95f1315`) | `tests/unit/lot1-regles.test.js` (lignes `push` voisines) | aucun |

Tous dans la liste tolérée. **Fusion combinée** (`fusion-essai-3k-tous`, ordre 3g, 3h, 3j, conflits tolérés résolus en gardant les deux versions) : `lot-3g` et `lot-3j` fusionnées ; `lot-3h` **abandonnée** (`git merge --abort`) sur `tests/unit/atelier-hygiene.test.js`, fichier créé à la fois par `lot-3g` et `lot-3h` (conflit entre ces deux lots, aucun fichier du lot 3k en cause). Sur le résultat (3k + 3g + 3j) : `npm run lint` sans erreur ni avertissement ; Vitest **4 777 réussis, 8 échecs sur 4 785**, tous des garde-fous propres à une branche : 5 de `interface-atelier-hygiene.test.js` (« le jeu n'est pas modifié » : les autres lots modifient le jeu), 1 de `interface-atelier-protos.test.js` (première ligne d'`apercu.txt`), 1 de `atelier-hygiene.test.js` du lot 3g (même raison), 1 de `persos-donnees.test.js` du lot 3j (fichiers interdits au lot 3j modifiés par les autres lots). À retirer ou adapter au lot 4b, pas à corriger ici.

## À faire au lot 4b
1. Fusionner `lot-3g` et `lot-3h` d'abord (conflit `atelier-hygiene.test.js` entre eux : renommer l'un des deux fichiers).
2. Fusionner `lot-3k` : résoudre `apercu.txt` (ligne de `main`), `scripts/build.mjs` et `lot1-regles.test.js` en gardant les deux versions.
3. Retirer les garde-fous de branche : le groupe « le jeu n'est pas modifié » de `tests/unit/interface-atelier-hygiene.test.js` et le test `apercu.txt` de `tests/unit/interface-atelier-protos.test.js`.
4. Journal des versions : l'entrée `lot-3k` est déjà dans `data/changelog.json` ; garder celles des autres lots et mettre le dernier lot fusionné dans `data-changelog.test.js` et `dev.spec.js`.
