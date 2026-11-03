# Paliers de tests, sélection par zone et budget de 10 minutes (lot 4e)

Outils : `scripts/tests/` (selectionner, palier, budget, tranche, enregistrer-complet, sabotage), table `tests/selection.json`, réglages `tests/budget.json`, mesure de référence `tests/budget-mesure.json`, dernier complet `tests/dernier-complet.json`, workflow `.github/workflows/tests.yml`. Décisions du propriétaire : `Docs/ref/tests-decisions.md`. Audit : `Docs/ref/tests-audit.md`.

## Étape 0 (partie B) — ce que j'ai compris
1. Audit (partie A) : lint 7,5 s ; Vitest 81 s ; suite rapide 11,5 min (358 exécutions) ; suite complète 81,2 min réels pour 161,6 min cumulées (2 064 exécutions, 1 633 jouées) avec 2 workers sur 4 cœurs.
2. Catégories : G et P à garder (garde-fous), D 44,8 min, R 25,8 min, F 8,2, T 4,8, L 3,4, V 0,8, I 1,1, E 3,2 (minutes cumulées de la suite complète).
3. Échecs hérités : `jeu-sons:93` et `jeu-voix:107` sont des tests faux (entrées de boucle `ambiance-vent` sans `muted` ni `lowpass`) ; `sons-integres-ambiances` en mobile : délais sous charge ; `persos-jeu` (Vitest) : référence Git locale périmée.
4. Décisions : D, R, F, T, L, V, I, E approuvés avec leurs nuances ; regroupements G et P (diviser par deux les chargements du jeu) ; objectifs 2 / 8 / 10 minutes, 16 tranches au plus.
5. Scripts actuels : `lint`, `test` (Vitest complet), `test:e2e` (suite rapide : 11 fichiers `ESSENTIAL` en bureau, 4 `PAGES` en mobile), `test:e2e:full` (`E2E_FULL=1`, tout, deux projets).
6. Workflows : seul `pages.yml` (push de `main` et `dev`, lancement manuel) : `quick` (lint, Vitest) à chaque push, `e2e` (suite rapide en 4 tranches) sur `dev`, `deploy` après `quick` ; aucun job `verify` (retiré au lot 2c) ; la suite complète ne tourne jamais en CI.
7. `tests/unit/` : 140 fichiers Vitest (Node, délai 30 s) et `helpers/` ; `tests/e2e/` : 46 fichiers Playwright, `helpers.js`, `visite-chemins.js`.
8. Le jeu est servi par `scripts/serve.mjs` (sources du dépôt, port 4173) ; `publication.spec.js` utilise un site construit à la volée par `scripts/site/e2e-site.mjs` (port 4174) : aucun site construit à partager.
9. Les tests ouvrent `jeu.html?test=1` (accès `window.__zs`), souvent en 667×375, et avancent le temps par `step()`.
10. Projet `mobile` : Pixel 5 (375×812, DPR 2,75, tactile) ; projet `bureau` : 1440×900 ; délai de test 60 s ; `fullyParallel` ; 1 rejeu en CI ; Chrome du runner en CI (`channel`), aucun navigateur installé.
11. Un chargement du jeu coûte 3,5 à 4 s en bureau et 5 à 5,5 s en mobile : il domine le temps (1 351 chargements du jeu dans la suite complète).
12. Les tests d'un même fichier sont indépendants (aucun `beforeAll`, aucun mode série, aucun état de module) : répartition possible test par test.
13. Playwright 1.63 découpe `--shard` par nombre de tests dans l'ordre des fichiers (`filterForShard` de `lib/runner`), sans tenir compte des durées ; il accepte `--test-list` (`[projet] › fichier › titres`).
14. Les durées de ce lot sont des projections d'après la mesure de la partie A ; la vitesse réelle des runners de GitHub n'est pas connue.

## Les quatre paliers
| Palier | Commande | Quand | Contenu |
|---|---|---|---|
| avant-commit | `npm run test:avant-commit` | avant chaque commit | lint, Vitest des zones touchées (avec `vitest --changed`), garde-fous unitaires rapides (≤ 1,5 s) ; aucun Playwright |
| standard | `npm run test:standard` | après chaque partie d'un lot ; CI à chaque push de `dev`, `lot-*` et PR | lint, tout Vitest (sa durée mesurée est sous `vitestToutSousSecondes`), fumée, Playwright des zones touchées (palier standard des zones), hors `@instable` et `@lent` |
| publication | `npm run test:publication` | avant de livrer une version | comme standard, mais depuis la version publiée (`--depuis-version`) et avec les tests « complet » des zones touchées ; mode « tout » si aucun complet n'est enregistré ou s'il date de plus de `completMaxVersions` versions |
| complet | `npm run test:complet` | à la demande, et en CI par `workflow_dispatch` (16 tranches au plus) | tout : lint, Vitest, Playwright (E2E_FULL=1), `@lent` compris ; `@instable` rejoués à part (2 rejeux au plus) |

Autres : `npm run test:fumee` (13 tests, projet bureau, 28 s mesurées), `npm run test:selection` (affiche la sélection), `npm run test:budget` (projection du complet). Anciens noms conservés : `npm test` (Vitest complet), `npm run test:e2e` (suite rapide historique, utilisée par `pages.yml`), `npm run test:e2e:full` (Playwright complet), `npm run lint`.

## Sélection et dépendances entre zones
`tests/selection.json` : 17 zones (noyau, textes, carte, siège, vagues, étages, combat, économie, personnages, sons, rendu, interface, jeu, accueil, publication, pages techniques, outillage). Chaque zone a ses `sources` (motifs), ses `dependances` (zones dont ses sources lisent des fichiers), ses tests `vitest`, `e2e` (palier standard) et `complet` (palier complet seulement).
- Fichiers modifiés = `git diff --name-only <base>...HEAD` plus les changements non commités. Zones touchées → **fermeture inverse** (toute zone qui dépend d'une zone touchée, directement ou non, est rejouée, avec la raison « dépend de … »). Les autres sont listées « sautées » avec la raison.
- Documentation seule (`Docs/**`, `*.md`, sauf `Docs/ref/tests-*.md`) : rien. Fichier qu'aucune zone ne revendique : tout (`defaut`). Rejeu total forcé : `package.json`, verrou, configurations Vitest et Playwright, `tests/selection.json`, `tests/budget.json`, `.github/workflows/**`, `.nvmrc`, `css/tokens.css`, aides de tests (`tests/e2e/helpers.js`, `tests/unit/helpers/**`), `scripts/serve.mjs`.
- Vitest : union de la table, des tests `toujours` (hygiène, pureté, structure, contrôle de la table…) et de `vitest list --changed <base>` (graphe d'imports) ; jamais l'un sans l'autre.
- Les dépendances sont déduites du code (imports, `new URL`, données lues) ; un test vérifie que toute lecture d'un fichier d'une autre zone est déclarée et qu'il n'y a aucun cycle. Pour casser les cycles, quelques fichiers sont rangés dans la zone qui les importe (par exemple `floor-rules.js` et `plan-vers-monde.mjs` dans « étages », `ecarts.js` dans « carte »).
- `--depuis-version` : la base devient le `ref` de la version `actuelle` de `versions.json` lu sur `origin/main` (version absente ou commit introuvable : tout, avec la raison).

## Budget de 10 minutes en CI
`N = ceil(somme_cumulée × facteurDesequilibre ÷ (facteurParallelisme × testsParTrancheSecondes))` ; répartition gloutonne par durée de test (le plus lourd d'abord) ; durée d'une tranche = somme ÷ facteurParallelisme ; temps total = `installationSecondes` + tranche la plus longue. Deux projections toujours : facteur mesuré (1,99 = 161,6 min cumulées ÷ 81,2 min réelles de l'annexe de la partie A ; le cadrage estimait 1,68 à partir d'une durée réelle de 96 min) et 1,0 (prudente).
- `installationSecondes` = 90 : démarrage du runner et checkout (~20 s, non mesurable ici), `setup-node` avec cache npm (~10 s), `npm ci` (9,3 s mesurés), serveurs de test (< 1 s mesuré), démarrage de Playwright et téléversement du rapport (~10 s), arrondi avec une marge.
- `budget.mjs` échoue si N > `tranchesMax` (16) avec l'hypothèse mesurée, si le temps projeté dépasse `completCibleSecondes` (600), si un test seul dépasse une tranche, ou si un lot ajoute plus de `ajoutMaxParLotSecondes` (90 s) de calcul cumulé au complet.
- **Règle** : un lot n'ajoute pas plus de 90 s de calcul au palier complet ; s'il le dépasse, il retire ou regroupe d'abord. **Aucun nombre minimal de tests.**
- **Tranches équilibrées par test** : `budget.mjs --plan` écrit, par tranche, les lignes d'un fichier `--test-list` ; `tranche.mjs` les lance (puis les `@instable` avec 2 rejeux). Aucun fichier découpé : la répartition par test rend inutile le découpage des fichiers longs (le test le plus lourd, 54 s en mobile, tient dans une tranche).
- Limite de 20 tâches simultanées du compte (plan Free, non vérifiée ici), partagée avec `pages.yml` (au plus `quick` + 4 tranches e2e, puis `deploy`) : la matrice est limitée à 14 tranches simultanées pour ne jamais faire attendre le déploiement.

## CI (`.github/workflows/tests.yml`)
- Déclencheurs : push de `dev` et `lot-*`, `pull_request` (documentation seule ignorée : `paths-ignore`), `workflow_dispatch` avec le choix du palier (`standard`, `publication`, `complet`). Droits : `contents: read` ; la seule tâche `rapport` lit aussi les artefacts de l'exécution (`actions: read`, par `gh run download`, pour ne pas ajouter d'action).
- `standard` : historique complet (`fetch-depth: 0`), base = base de la PR ou commit précédent du push (sinon base du lot), `palier.mjs standard`.
- `publication` et `complet` : `planifier` (sélection, budget non bloquant, plan ; échoue si N > 16 en disant le calcul à retirer) → `tranches` (matrice dépendante ; chaque tranche recalcule le même plan, déterministe pour un commit) et `unitaires` (lint, Vitest) → `rapport` (rapports blob fusionnés en JSON, tranche la plus longue dans le résumé).
- Actions : seulement celles déjà épinglées dans `pages.yml` ; cache npm de `setup-node` ; aucun navigateur installé (Chrome du runner) ; aucun site construit à partager (les tests tournent sur les sources).
- `pages.yml` n'est pas modifié (empreintes de l'en-tête et de `deploy` vérifiées par `tests-selection.test.js`). Son job `e2e` (suite rapide sur `dev`) fait doublon avec le palier standard de `tests.yml` : à retirer par le propriétaire quand le nouveau workflow aura tourné (Idées).
- **Non vérifié ici** : un `workflow_dispatch` n'est en général proposé que si le fichier de workflow est sur la branche par défaut : le palier publication ne sera lançable à la demande qu'après la fusion dans `main`.

## Mesures de la partie B (4 cœurs, 2 workers, aucun rejeu)
**Durées des paliers sur trois commits de l'historique** (fichiers du commit passés par `--files`, code actuel) :
| Commit | Nature | Zones rejouées | avant-commit (objectif 120 s) | standard (objectif 480 s) |
|---|---|---|---|---|
| `343ad05` | documentation seule | aucune | lint seul (7 s) ; avant correction : 28 s | lint seul (7 s) ; avant correction : 104 s (Vitest complet inutile) |
| `56cb762` | logique (sang : `blood.js` et modules du jeu) | personnages, jeu, pages techniques | 72 s (lint 9 s, Vitest 123 fichiers 63 s) | **546 s** (lint 9 s, Vitest 98 s, Playwright 5 fichiers et fumée 439 s, 122 exécutions) |
| `e046bee` | interface (`game.css`, `jeu.html`) | interface, jeu | 41 s (Vitest 105 fichiers 32 s) | **917 s** (Vitest 93 s, Playwright 8 fichiers et fumée 815 s, 239 exécutions) |
- Objectif avant commit (2 min) tenu. **Objectif à chaque push (8 min) non tenu** pour les deux commits de code : ce qui domine, ce sont les fichiers Playwright G et P des zones touchées (`argent`, `interface-integree`, `persos-integres`, `jeu-interface`…), joués sur les deux projets, environ 4 à 7 s par chargement du jeu. La partie C (projet mobile réduit, regroupements) s'y attaque ; l'écart restant est donné dans le bilan.

**Projection du palier complet avant retraits** (`npm run test:budget`, 2 077 exécutions listées, fumée comprise) : cumul 162,6 min ; hypothèse mesurée (1,99) : **N = 13**, tranche la plus longue 6,3 min, **total 7,8 min** ; hypothèse prudente (1,0) : 26 tranches nécessaires, 16 tranches donnent 610 s par tranche, total 11,7 min. Écart avec la mesure de référence : +60 s (fumée).

**Exemple de `test:publication --depuis-version`** (différence entre la version actuelle `v0.5` = `e6cf00e` et `dev`, 46 fichiers) : mode tout, car `.github/workflows/pages.yml`, `package.json` et `playwright.config.js` ont changé depuis (lot 4c) ; et, de toute façon, aucun complet n'est encore enregistré (`tests/dernier-complet.json` vaut `null`) : **le premier palier de publication sera complet**. Budget du palier publication (hors `@lent` et `@instable`) : 2 035 exécutions, cumul 148,1 min, N = 12, tranche la plus longue 6,2 min, total 7,7 min (prudente : 645 s avec 16 tranches).
```
Sélection des tests — mode tout (depuis la version v0.5), base e6cf00e03922 : aucun palier complet enregistré (tests/dernier-complet.json vaut null) : le premier palier de publication est complet
Rejouées (17) : noyau [rejeu total] ; textes [rejeu total] ; … ; outillage-tests [rejeu total]
Sautées (0) : aucune
```
En mode zones (exemple : `js/core/economy.js` seul) : `Rejouées (4) : economie [source modifiée : js/core/economy.js] ; interface [dépend de « economie »] ; jeu [dépend de « economie »] ; pages-techniques [dépend de « economie »]` ; `Sautées (13) : noyau, textes, carte, … — aucune source ni dépendance modifiée depuis f6b744a8a56d`.

**Retour sur « tout » sur les 30 derniers commits** : 6 sur 30 (20 %) : `411f1e5` et `a6cbda5` (`playwright.config.js`, `package.json`, workflow), `83bfd5c`, `60c3966`, `d56ace8` (`css/tokens.css`), `6446fd1` (aide de tests `tests/unit/helpers/sons-anciens.js`). 2 commits de documentation seule ne rejouent rien ; les 22 autres rejouent de 0 à 8 zones sur 17.

**YAML** : `pages.yml` avant = après (aucune modification ; empreintes de l'en-tête et de `deploy` vérifiées) ; `tests.yml` ajouté (validé par `python3 -c "import yaml…"`) ; essai à blanc local de la séquence `planifier` → `tranches` : la sélection (`--tout`), le plan (`budget.mjs --plan`, 13 tranches) puis les 13 listes `--test-list` passées à `playwright --list` couvrent exactement les 2 077 exécutions, sans doublon.

**Corrections faites pendant la partie B** :
- Le nouveau `tests.yml` faisait échouer 5 tests d'hygiène d'anciens lots (« workflow inchangé depuis main ») : ajouté à leur liste `LOT_4C` d'exceptions, comme le lot 4c l'avait fait pour ses propres fichiers.
- `persos-jeu.test.js` comparait à `origin/lot-4b` (supprimée) puis à la branche locale `main` (périmée) : comparé désormais à `origin/main`, même assertion.

**Contrôle par sabotage (partie B)** : `node scripts/tests/sabotage.mjs` (copie jetable `git worktree`, supprimée à la fin ; rien de commité). Pour chaque cassure : témoin (ligne vide ajoutée au même fichier ; les tests qui échouent déjà avec lui — détecteurs de changement qui comparent à `main`, échecs d’environnement — ne comptent pas), sélection `--base HEAD`, seuls les tests sélectionnés lancés (Vitest, puis Playwright du palier standard si Vitest ne voit rien). `--depuis-version` donne « tout » dans les 16 cas (aucun complet enregistré). **16/16 détectées.**

| Cas | Fichier | Cassure | Zones rejouées | Vitest / e2e lancés | Détectée | Par (exemple) | s |
|---|---|---|---|---|---|---|---|
| Z1 | `js/core/spread.js` | fonction pure : ratio de vitesse du cône inversé | combat, economie, interface, jeu, pages-techniques | 71 / 0 | oui | core-spread.test.js | 106 |
| Z2 | `js/core/siege.js` | signe du pas de temps du siège inversé | siege, etages, personnages, rendu, jeu, pages-techniques | 97 / 0 | oui | atelier-carte.test.js, core-monde-ia-lot3.test.js | 165 |
| Z3 | `data/game/windows.json` | donnée : arrachage d'une planche 2,2 → 3,2 s | siege, etages, personnages, rendu, jeu, pages-techniques | 97 / 0 | oui | core-siege.test.js, core-windows.test.js | 170 |
| Z4 | `js/game/hud.js` | module de js/game : visibilité des blocs du HUD inversée | interface, jeu | 37 / 7 | oui | jeu-interface.spec.js | 66 |
| Z5 | `css/game-ui.css` | feuille de style : marge haute de 16 px supprimée | interface, jeu | 37 / 0 | oui | interface-integree.test.js | 44 |
| Z6 | `jeu.html` | page HTML : identifiant du bloc de manche changé | jeu | 36 / 0 | oui | data-vagues.test.js, interface-integree.test.js | 45 |
| Z7 | `.github/workflows/pages.yml` | workflow : droits d'écriture | tout | 142 / 0 | oui | publication.test.js, workflow.test.js | 206 |
| Z8 | `js/core/stairs.js` | durée d'escalier doublée | etages, jeu | 50 / 0 | oui | etage-escaliers.test.js | 105 |
| Z9 | `js/core/texgen.js` | constante : taille maximale des textures | personnages, rendu, jeu, pages-techniques | 78 / 0 | oui | core-texgen.test.js | 119 |
| Z10 | `js/core/pose-v2.js` | constante des poses (2π → π) | personnages, jeu, pages-techniques | 61 / 0 | oui | persos-animations.test.js, persos-page.test.js | 106 |
| Z11 | `js/core/sound-director.js` | hauteur de lecture des sons propres doublée | sons, jeu, pages-techniques | 66 / 0 | oui | sons-integres.test.js | 105 |
| Z12 | `js/core/save.js` | version du schéma de sauvegarde | economie, interface, jeu, pages-techniques | 57 / 0 | oui | bank.test.js, sauvegarde-depots.test.js | 90 |
| X1 | `js/core/economy.js` | économie : une planche posée rapporte 1 de plus | economie, interface, jeu, pages-techniques | 57 / 5 | oui | interface : argent.spec.js | 243 |
| X2 | `data/game/waves.json` | vagues : 12 zombies simultanés au lieu de 10 | 10 zones | 119 / 0 | oui | vagues : core-siege.test.js ; siege : core-siege.test.js | 193 |
| X3 | `css/tokens.css` | jeton : carrelage clair (--game-tile-a) | tout | 142 / 0 | oui | interface : data-ambiance.test.js ; personnages : personnages.test.js | 203 |
| X4 | `js/core/rng.js` | module partagé : nextInt décalé de 1 (sort de [0, max)) | 13 zones | 138 / 3 | oui | carte : core-ambiance-audio.test.js ; vagues : core-combat.test.js ; combat : core-combat.test.js ; … | 325 |

Défauts trouvés et corrigés pendant le contrôle : (1) **X2** non détectée en zone siège : ses tests simulent le siège avec les vagues (`tests/unit/helpers/sim-siege.js`) sans que la zone le déclare : `siege` dépend désormais de `vagues` et `carte` (cycle évité en rangeant `plank-layout.js` dans « carte »). (2) **X4**, premier essai (constante du générateur) : d’autres tirages tout aussi valides, aucun test de vagues ne fige une suite : la cassure retenue fausse le contrat de `nextInt`. (3) **X3**, premier essai (`--game-floor`) : aucun test des personnages ne lit ce jeton (« détection » seulement par `persos-jeu`, qui échouait alors pour une raison d’environnement) : remplacé par `--game-tile-a`, sol de référence des deux zones. (4) Sans témoin, `atelier-hygiene` et `data-lot3` (comparaison à la branche locale `main`) « détectaient » toute modification : d’où le témoin.
