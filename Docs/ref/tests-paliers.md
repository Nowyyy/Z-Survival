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
| standard | `npm run test:standard` | après chaque partie d'un lot ; CI à chaque push de `dev`, `lot-*`, `essai/standard-*` et PR | lint, tout Vitest (sa durée mesurée est sous `vitestToutSousSecondes`), fumée, Playwright des zones touchées (palier standard des zones), hors `@instable` et `@lent`, **projet bureau seulement** (`standardProjets`, lot 4f) ; en CI : 8 tranches au plus |
| publication | `npm run test:publication` | avant de livrer une version | comme standard, mais depuis la version publiée (`--depuis-version`) et avec les tests « complet » des zones touchées ; mode « tout » si aucun complet n'est enregistré ou s'il date de plus de `completMaxVersions` versions |
| complet | `npm run test:complet` | à la demande, et en CI par `workflow_dispatch` ou un push de `essai/complet-*` (16 tranches) | tout : lint, Vitest, Playwright (E2E_FULL=1), `@lent` compris ; `@instable` rejoués à part (2 rejeux au plus) |

Autres : `npm run test:fumee` (13 tests, projet bureau, 28 s mesurées), `npm run test:selection` (affiche la sélection), `npm run test:budget` (projection du complet). Anciens noms conservés : `npm test` (Vitest complet), `npm run test:e2e` (suite rapide historique, utilisée par `pages.yml`), `npm run test:e2e:full` (Playwright complet), `npm run lint`.

## Sélection et dépendances entre zones
`tests/selection.json` : 17 zones (noyau, textes, carte, siège, vagues, étages, combat, économie, personnages, sons, rendu, interface, jeu, accueil, publication, pages techniques, outillage). Chaque zone a ses `sources` (motifs), ses `dependances` (zones dont ses sources lisent des fichiers), ses tests `vitest`, `e2e` (palier standard) et `complet` (palier complet seulement).
- Fichiers modifiés = `git diff --name-only <base>...HEAD` plus les changements non commités. Zones touchées → **fermeture inverse** (toute zone qui dépend d'une zone touchée, directement ou non, est rejouée, avec la raison « dépend de … »). Les autres sont listées « sautées » avec la raison.
- Documentation seule (`Docs/**`, `*.md`, sauf `Docs/ref/tests-*.md`) : rien. Fichier qu'aucune zone ne revendique : tout (`defaut`). Rejeu total forcé : `package.json`, verrou, configurations Vitest et Playwright, `tests/selection.json` (lot 5n : sauf un changement limité à ses zones), `tests/budget.json`, `.github/workflows/**`, `.nvmrc`, `css/tokens.css`, aides de tests Playwright (`tests/e2e/helpers.js`), `scripts/serve.mjs` ; lot 5n : les aides de Vitest (`tests/unit/helpers/**`) rejouent tout Vitest seulement.
- Vitest : union de la table, des tests `toujours` (hygiène, pureté, structure, contrôle de la table…) et de `vitest list --changed <base>` (graphe d'imports) ; jamais l'un sans l'autre.
- Les dépendances sont déduites du code (imports, `new URL`, données lues) ; un test vérifie que toute lecture d'un fichier d'une autre zone est déclarée et qu'il n'y a aucun cycle. Pour casser les cycles, quelques fichiers sont rangés dans la zone qui les importe (par exemple `floor-rules.js` et `plan-vers-monde.mjs` dans « étages », `ecarts.js` dans « carte »).
- `--depuis-version` : la base devient le `ref` de la version `actuelle` de `versions.json` lu sur `origin/main` (version absente ou commit introuvable : tout, avec la raison).

## Budget de 10 minutes en CI
`N = ceil(somme_cumulée × facteurDesequilibre ÷ (facteurParallelisme × testsParTrancheSecondes))` ; répartition gloutonne par durée de test (le plus lourd d'abord) ; durée d'une tranche = somme ÷ facteurParallelisme ; temps total = `installationSecondes` + tranche la plus longue. Deux projections toujours : facteur mesuré (1,99 = 161,6 min cumulées ÷ 81,2 min réelles de l'annexe de la partie A ; le cadrage estimait 1,68 à partir d'une durée réelle de 96 min) et 1,0 (prudente).
- **Lot 4f (mesuré en CI, `scripts/tests/mesures-ci.json`)** : `installationSecondes` = 30 (10 à 35 s mesurés par tranche), `facteurParallelisme` = 1,86 (le plus bas des parallélismes réels mesurés : 1,86 à 1,95), `workersCI` = 2 (confirmé par `actualWorkers`). Valeurs d'avant :
- `installationSecondes` = 90 : démarrage du runner et checkout (~20 s, non mesurable ici), `setup-node` avec cache npm (~10 s), `npm ci` (9,3 s mesurés), serveurs de test (< 1 s mesuré), démarrage de Playwright et téléversement du rapport (~10 s), arrondi avec une marge.
- `budget.mjs` échoue si N > `tranchesMax` (16) avec l'hypothèse mesurée, si le temps projeté dépasse `completCibleSecondes` (600), si un test seul dépasse une tranche, ou si un lot ajoute plus de `ajoutMaxParLotSecondes` (90 s) de calcul cumulé au complet.
- **Règle** : un lot n'ajoute pas plus de 90 s de calcul au palier complet ; s'il le dépasse, il retire ou regroupe d'abord. **Aucun nombre minimal de tests.**
- **Tranches équilibrées par test** : `budget.mjs --plan` écrit, par tranche, les lignes d'un fichier `--test-list` ; `tranche.mjs` les lance (puis les `@instable` avec 2 rejeux). Aucun fichier découpé : la répartition par test rend inutile le découpage des fichiers longs (le test le plus lourd, 54 s en mobile, tient dans une tranche).
- Limite de 20 tâches simultanées du compte (plan Free, non vérifiée ici), partagée avec `pages.yml` (au plus `quick` + 4 tranches e2e, puis `deploy`) : la matrice était limitée à 14 tranches simultanées (lot 4e) ; depuis le lot 4f, `max-parallel: 16` : le complet tourne seul (branche `essai/complet-*` ou lancement manuel), et un push de `dev` ne demande au plus que 5 tâches de `pages.yml` + 9 du standard (8 tranches, `unitaires`) = 14.

## CI (`.github/workflows/tests.yml`)
- Déclencheurs : push de `dev` et `lot-*`, `pull_request` (documentation seule ignorée : `paths-ignore`), `workflow_dispatch` avec le choix du palier (`standard`, `publication`, `complet`). Droits : `contents: read` ; la seule tâche `rapport` lit aussi les artefacts de l'exécution (`actions: read`, par `gh run download`, pour ne pas ajouter d'action).
- `standard` : (lot 4e) une seule tâche, `palier.mjs standard` ; depuis le lot 4f, réparti en tranches comme le complet (section « Lot 4f » ci-dessous).
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

## Après la partie C (allègement)
- Retraits appliqués (décisions D, R, F, T, L) : détail par fichier dans `Docs/lots/versions/v0.6.md#lot-4e`. Projet `mobile` réduit par la configuration (`playwright.config.js`, `grep` construit depuis la liste `garde-fous` de `tests/selection.json`) : en mode complet, il ne joue que les fichiers G et P et les tests G et P des autres fichiers.
- Palier complet projeté (`npm run test:budget`) : 1 237 exécutions listées, cumul 94,5 min ; hypothèse mesurée : **8 tranches**, tranche la plus longue 5,9 min, **total 7,4 min** ; prudente : 15 tranches, 7,8 min. Objectif de 10 minutes et 16 tranches tenu dans les deux hypothèses (projection : à confirmer par la première exécution en CI).
- Palier standard en rejeu total (tous les fichiers G et P et la fumée, deux projets) : 1 322 s mesurées, 459 réussis, 0 échec : l'objectif de 8 minutes ne vaut que pour un changement ciblé.
- Sabotage refait après les retraits : 16/16 détectées ; X4 (`rng.js`) n'est vue en zone « pages techniques » qu'au palier publication (`persos-atelier` « se charge sans erreur »), ses tests Vitest T étant retirés.
- `tests/budget-mesure.json` : mesures de la partie A sans les tests retirés, plus les fichiers regroupés et corrigés remesurés ; à remplacer par les durées du premier complet en CI.

## Lot 4f — mesure en CI, standard en tranches, bureau seulement
- **Déclencheurs de mesure** (sans fusion) : un push de `essai/complet-<n>` lance le palier complet, un push de `essai/standard-<n>` le palier standard (base `origin/dev`, sinon `origin/main`) ; toute autre branche `essai/**` ne lance rien (message dans le résumé). Rien n'est publié : `pages.yml` ne se déclenche que sur `main` et `dev`. Les branches `essai/…` ne sont supprimées que par le propriétaire. **Création d'une branche d'essai** : à cause de `paths-ignore`, un push qui crée une branche sur un commit déjà poussé ne lance rien (constaté avec `essai/complet-1`) ; depuis la fin du lot 4f, `tests.yml` écoute aussi l'événement `create` (création de branche, sans filtre de chemins) pour les branches `essai/**`, et le push qui accompagne la création ne lance aucun palier (pas de doublon). `git push origin <commit>:refs/heads/essai/complet-<n>` suffit donc, quel que soit le commit.
- **Un seul chemin pour tous les paliers** : `planifier` (`ci-palier.mjs` : palier et base ; `selectionner.mjs --sans-vitest` ; `budget.mjs --plan`) → matrice `tranches` (si N ≥ 1) en parallèle avec `unitaires` (lint, tout Vitest) → `rapport` (rapports blob fusionnés) et `bilan-duree` (non bloquant). Chaque tranche recalcule le plan et vérifie son **empreinte** (celle de `planifier`), sinon elle échoue.
- **Base de la sélection du standard** : push → `github.event.before` s'il est valide, sinon `origin/main` ; pull request → `origin/<branche de base>` (puis son commit) ; `essai/standard-*` et lancement manuel → `origin/dev`, sinon `origin/main`.
- **Complet et publication** : `N utilisé = tranchesMax` (16) dès que le nombre de tests le permet ; `budget.mjs` rapporte le **N minimal** (formule ci-dessus) et le **N utilisé** ; `--echec tranches` n'échoue que si le N minimal dépasse 16. `max-parallel: 16`.
- **Standard** : `N_standard = clamp(1, tranchesMaxStandard (8), ceil(somme × facteurDesequilibre ÷ (facteurParallelisme × (standardCibleSecondes (480) − installationSecondes))))`, sur les tests du **bureau** seulement (`standardProjets`) ; **aucun test Playwright** (documentation, Vitest seul) : 0 tranche, seulement `unitaires`. Avertissement au-delà de 480 s projetées, erreur rapportée (non bloquante) au-delà de `standardMaxSecondes` (600). Rejeux : ceux de `playwright.config.js` (1 en CI), `@instable` et `@lent` exclus. Le mobile ne tourne qu'aux paliers publication et complet.
- **Concurrence** : une exécution plus récente du standard sur la même référence annule la précédente ; publication et complet ont un groupe propre à l'exécution (jamais annulés, jamais en attente l'un de l'autre).
- **Instrumentation** : chaque tranche écrit `duree-tranche-<palier>-<i>.json` (artefact et résumé) : début de la tâche, fin de `npm ci`, fin du navigateur (Chrome du runner, aucune installation), début et fin des tests, exécutions, workers réellement utilisés (`config.metadata.actualWorkers` du rapport JSON), réussies, échouées, instables, ignorées, somme des durées ; `unitaires` écrit `duree-unitaires-<palier>.json`. `bilan-duree` (`bilan-duree.mjs`, `lib/duree.mjs`) lit les artefacts et l'API des exécutions (`created_at` = déclenchement, fins des tâches, attente en file) : durée totale, installation moyenne et maximale, tranche la plus longue, parallélisme réel, comparaison avec la projection, tranches qui dépassent, « OBJECTIF TENU » ou « OBJECTIF NON TENU (x s pour y s) » (objectif : 600 s pour les deux paliers).
- **Exécutions Playwright du standard, avant → après** (projection d'après `tests/budget-mesure.json`, code actuel ; « avant » = deux projets dans une seule tâche, « après » = bureau en tranches) :

| Commit | Nature | Zones rejouées | Avant | Après |
|---|---|---|---|---|
| `e046bee` | interface (`game.css`, `jeu.html`) | interface, jeu | 346 exécutions (165 mobiles), 1 349 s cumulées, ≈ 678 s + installation | 181 exécutions, 1 122 s cumulées, 2 tranches, total projeté 372 s |
| `56cb762` | logique (sang) | personnages, jeu, pages techniques | 173 (80 mobiles), 759 s, ≈ 381 s + installation | 93, 662 s, 2 tranches, 256 s |
| `343ad05` | documentation seule | aucune | 0 | 0 (aucune tranche) |
| rejeu total | `tests.yml`, `package.json`… | toutes | 631 (309 mobiles), 2 223 s, ≈ 1 117 s + installation ; **mesuré en CI au lot 4e : 1 452 s de Playwright, 1 535 s de palier** | 322, 1 696 s, 3 tranches, 374 s |

## Lot 5n — allègement des tests déclenchés sur `dev` et `main`
Audit : `Docs/ref/tests-allegement-audit.md` ; décisions du propriétaire : `Docs/ref/tests-allegement-decisions.md` ; bilan : `Docs/lots/versions/v0.7.md#lot-5n` (lot 5p : regroupé ; avant : `Docs/lots/lot-5n.md`).

**Déclencheurs après le lot 5n** (`pages.yml` inchangé) :
| Événement | `pages.yml` | `tests.yml` |
|---|---|---|
| push `dev` (code) | `quick` (lint, tout Vitest) → `deploy` | standard : `planifier` → tranches Playwright → `rapport`, `bilan-duree` ; **`unitaires` sautée** (W1-a : `quick` la fait déjà ; `bilan-duree` n'a pas de durée Vitest sur `dev`) |
| push `dev` (documentation seule) | `quick` → `deploy` | rien (`paths-ignore`) |
| push `main` | `quick` → `deploy` | rien |
| push `lot-*` | — | standard complet (`unitaires` comprise) ; **premier push d'une branche : base `origin/dev`** (W2-c ; repli `origin/main` si `origin/dev` est absent ; avant : `origin/main`, en retard d'une version) |
| Pull Request vers `main` | — | standard (seul Playwright avant un push sur `main`) |
| Pull Request vers `dev` | — | **rien** (W2-a) |
| création `essai/complet-*` / `essai/standard-*` | — | complet (16 tranches) / standard |
| lancement manuel | `quick` → `deploy` | palier au choix |

**Règle (W2-a)** : une branche de travail se nomme `lot-*` pour être testée avant sa fusion (son push lance le standard ; l'arbre fusionné est testé par le push de `dev`). Une Pull Request d'une autre branche vers `dev` n'a plus de test avant fusion. La Pull Request `main` → `dev` (retour de `main` après une publication) n'est pas testée : son contenu l'a déjà été.

**Sélection (T5)** : un changement de `tests/selection.json` limité aux entrées `zones[*]` touche ces zones (fermeture inverse comprise) ; toute autre clé (`garde-fous`, `rejeu-total`, `rejeu-vitest`, `toujours`, `fumee`, `documentation`, `defaut`, `schema`) ou une zone retirée impose « tout » ; la table de la base est lue à la merge-base (`selectionner.mjs`). Les aides de Vitest (`tests/unit/helpers/**`, clé `rejeu-vitest`) rejouent tout Vitest, sans rejeu total de Playwright (aucun fichier `tests/e2e/` ne les lit : vérifié par `tests-selection.test.js`). `css/tokens.css`, `tests/e2e/helpers.js`, workflows et configurations gardent « tout ».

**Durées (T4, T6)** : `node scripts/tests/budget.mjs --liste-sans-mesure <fichier>` liste les tests du complet sans durée mesurée ; on les mesure seuls (`E2E_FULL=1 npx playwright test --test-list <fichier> --workers=2 --retries=0 --reporter=json > rapport.json`, jamais le palier complet en local), puis `--completer-mesure rapport.json --note …` les ajoute à `tests/budget-mesure.json` (le reste inchangé, trace dans `complements`). `--remettre-reference --raison …` remplace la référence du complet (`complet.cumulSecondes`) par le cumul projeté d'aujourd'hui, l'ancienne gardée dans `referencesPrecedentes` : **décision du propriétaire seulement, ce n'est pas un allègement**. Lot 5n : 208 exécutions mesurées ; standard en rejeu total 3 → 4 tranches, puis 5 (`standardCibleSecondes` 480 → 400 s, décision conditionnelle T4 : rejeu total de 7 min 48 s sur la CI de la branche, au-delà de 7 min 30 s ; la formule du lot 4f ci-dessus garde son texte d'origine) ; référence 5 605 s (lot 4e) → 6 320 s ; `ajoutMaxParLotSecondes` reste 90.

**Seuils du propriétaire** (médiane des 50 dernières exécutions) : standard sur `dev` ≤ 7 min ; rejeu total ≤ 10 min ; `quick` ≤ 4 min ; complet ≤ 10 min ; instabilité ≤ 1 échec au hasard sur 50 ; ajout de durée de `tests/budget.json` respecté. Durées médianes avant / après : voir le bilan du lot 5n.

**Procédure de fin de version** : d'abord cette passe d'allègement (audit, décisions, application ; ne changer quelque chose que si un seuil est dépassé ou si un doublon est trouvé), ensuite le nettoyage des branches et de la documentation, puis la publication (`Docs/ref/publication-versions.md`).

## Comment ajouter une zone ou un test
- **Un test** : dans le fichier de la zone qu'il protège ; la logique en Vitest (`tests/unit/`), seulement ce qu'un joueur voit ou fait en Playwright. Ajouter le fichier à la zone dans `tests/selection.json` : `vitest`, ou `e2e` (palier standard : garde-fous et pages) ou `complet` (règles, détails). `npm test` vérifie la table (fichier classé, sources couvertes, dépendances réelles déclarées, aucun cycle) et `npm run test:budget` l'ajout au complet (90 s cumulées au plus par lot).
- **Une zone** : `id`, `description`, `sources` (motifs), `dependances` (zones dont ses fichiers lisent des fichiers ; le contrôle signale toute lecture non déclarée), tests. Si une dépendance crée un cycle, ranger le fichier partagé dans la zone qui l'importe (voir l'étape 0).
- **Un garde-fou** : l'ajouter à `garde-fous` (fichier entier, ou `motif` de ses titres) : il reste en mobile et un test vérifie qu'il existe.
- **Assertions comptées** (`node scripts/tests/compter.mjs`) : appels `expect(`, `expect.soft(` et `expect.poll(` écrits dans le fichier (une assertion écrite une fois dans une boucle compte une fois) ; chargements : `page.goto(` hors des chargeurs locaux, plus les appels de ces chargeurs (`open`, `openFrozen`…). Référence d'avant les regroupements : `scripts/tests/assertions-reference.json` ; un test interdit à un fichier G ou P d'en avoir moins.

## Garde-fous (jamais retirés ni affaiblis)
Pureté de `js/core/` ; `dependencies` vide ; aucune requête externe ; aucun stockage hors `zs.save.v1` ; sauvegarde (schéma, migrations, codec, verrouillage, mode essai, écritures) ; contrastes, cibles de 44 px, marges, polices minimales, stabilité de l'interface ; budgets de dessin et fuites de géométrie ; invariance de la logique du jeu ; JSON valides et clés de textes sans orpheline ; règles de carte (couloirs, connexité, aucun zombie bloqué) ; déterminisme du générateur ; construction du site, assembleur, workflow et `versions.json` ; absence de secrets et de gros fichiers ; axe sur chaque page publiée ; catégories G et P de l'audit. Liste des fichiers et des motifs : `tests/selection.json` → `garde-fous` (173 entrées).

## Publier une version
1. `npm run test:publication` : lire la liste « rejouées / sautées » ; en cas de doute, `node scripts/tests/palier.mjs publication --tout`. En CI : onglet Actions, workflow « Tests », palier `publication` (après la fusion dans `main`, voir plus haut).
2. Après un palier complet réussi (toutes les tranches vertes, Vitest vert) : `node scripts/tests/enregistrer-complet.mjs --rapport rapport-complet.json --vitest vitest.json` (artefacts `rapport-complet` et `vitest-rapport` de l'exécution), puis commiter `tests/dernier-complet.json`.
3. Archiver la version qui va être remplacée (`npm run archive`, Docs/ref du lot 4c).
4. Fusionner `dev` dans `main`.

**Limites** : une casse indirecte non déclarée (fichier lu sans import ni chemin écrit, effet visuel sans test) n'est pas vue par la sélection ; filets : le contrôle de la table (lectures réelles déclarées), le sabotage (`node scripts/tests/sabotage.mjs`, à refaire quand la table change beaucoup), le palier complet périodique (toutes les `completMaxVersions` = 3 versions au plus) et le complet de la première publication.

## Paragraphe à coller dans les futurs prompts de lots
« Pendant le lot, lance `npm run test:standard` après chaque partie ; lance `npm run test:publication` avant de livrer ; **n'impose aucun nombre minimal de tests** : écris les tests qui protègent un risque identifié, dans la zone concernée, la logique en Vitest et seulement ce qu'un joueur voit ou fait en Playwright ; ne dépasse pas l'ajout de durée de `tests/budget.json` ; un test retiré se justifie dans le bilan. »
