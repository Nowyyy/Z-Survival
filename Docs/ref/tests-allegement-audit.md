# Lot 5n-A — Audit des tests déclenchés sur `dev` et sur `main` (lecture seule)

Base : `origin/dev` `42e711d` (seed 0.26, lot 5m fusionné, `main` ancêtre de `dev`). Rien n'est modifié en partie A : ni test, ni workflow, ni table. Décisions à prendre : `Docs/ref/tests-allegement-decisions.modele.md`.

**Sources et limites.** Historique lu par `gh` (API REST en lecture seule) : 170 exécutions de `tests.yml` (toutes, du 3 au 8 novembre 2026), 99 de `pages.yml` sur `dev` et `main` (les 50 dernières de chaque branche), détail des tâches de 255 exécutions, journaux de 660 tâches (`tranches`, `unitaires`) et de 156 tâches `planifier` (mode de sélection). **Les artefacts (rapports JSON, durées par test) ne sont pas téléchargeables depuis cette session** (stockage des artefacts refusé par le proxy, HTTP 403) : les durées par test viennent de `tests/budget-mesure.json` (lot 4e, machine locale), complétées par une mesure locale des fichiers sans durée (bureau, 2 workers, section 3.2). Les durées CI par tranche viennent des lignes « Tranche i/n » des journaux. La vitesse réelle des exécuteurs n'est connue que par ces exécutions passées.

## 1. Cartographie des déclencheurs

| Événement | Workflows et tâches | Commandes exactes | Bloque le déploiement |
|---|---|---|---|
| push `dev` (code) | `pages.yml` : `quick` → `deploy` ; `tests.yml` (palier standard) : `planifier` → `unitaires` ‖ `tranches` (N ≤ 8) → `rapport`, `bilan-duree` | `quick` : `npm ci` ; `npm run lint` ; `npm test` (= `vitest run`, 139 fichiers). `deploy` : 3 checkouts (main, dev, archive), `npm ci && npm run build` dans `main/` et `dev/`, `node dev/scripts/assemble.mjs …`, configure / upload / deploy-pages. `planifier` : `npm ci` ; `node scripts/tests/ci-palier.mjs` ; `node scripts/tests/selectionner.mjs $ARGS --sans-vitest --json selection.json` ; `node scripts/tests/budget.mjs --palier standard … --plan plan.json --echec tranches`. `unitaires` : `npm ci` ; `npm run lint` ; `npx vitest run --reporter=default --reporter=json`. `tranches` : `npm ci` ; sélection et plan recalculés ; `node scripts/tests/tranche.mjs --plan plan.json --index i …` (Playwright `--test-list`, projet bureau). `rapport` : `npm ci` ; `gh run download` ; `npx playwright merge-reports`. `bilan-duree` : `node scripts/tests/bilan-duree.mjs`. | `deploy` attend **`quick` seulement** (`needs: quick`) ; `tests.yml` ne bloque rien |
| push `dev` (documentation seule : `Docs/**`, `**/*.md`) | `pages.yml` seulement (`tests.yml` : `paths-ignore`) | comme ci-dessus | `quick` |
| push `main` | `pages.yml` seulement (`tests.yml` n'écoute pas `main`) | `quick`, puis `deploy` (assembleur de `main`) | `quick` |
| Pull Request vers `dev` (ouverte, poussée, rouverte) | `tests.yml` standard (base `origin/dev`), sur le commit de fusion de test | comme le standard | — |
| Pull Request vers `main` (`dev` → `main`) | `tests.yml` standard (base `origin/main`) : **seul Playwright avant un push sur `main`** | comme le standard | — |
| push `lot-*` | `tests.yml` standard (base : `github.event.before`, sinon `origin/main` — **donc `origin/main` au premier push d'une branche**) ; **si une Pull Request est ouverte, le même commit est aussi testé par l'événement `pull_request`** | comme le standard | — |
| création `essai/complet-*` | `tests.yml` complet, 16 tranches (bureau et mobile) | `planifier` (publication / complet) → 16 `tranches` ‖ `unitaires` → `rapport`, `bilan-duree` | — |
| création `essai/standard-*` | `tests.yml` standard (base `origin/dev`) | | — |
| création d'une autre branche ou d'une étiquette (`lot-*`, `v0.6`…) | `tests.yml` lancé, **toutes les tâches sautées** (`planifier` : `if`) : 14 exécutions d'une seconde | — | — |
| déclenchement manuel | `tests.yml` (`palier` au choix) ; `pages.yml` (`quick` → `deploy`) : 41 lancements manuels sur `main` les 1er et 2 novembre (avant le lot 4c), aucun depuis | | `quick` |

**Doublons dans un même déclenchement (push `dev` de code)** : `npm run lint` deux fois (`quick`, `unitaires`) ; **Vitest complet deux fois** (`quick` : `npm test` ; `unitaires` : `npx vitest run`) — hypothèse du prompt **confirmée** ; `npm ci` dans chaque tâche (`quick`, 2 dans `deploy`, `planifier`, `unitaires`, chaque tranche, `rapport`) : inévitable (machines séparées). La construction du site n'est faite qu'une fois par branche (`deploy`) ; `publication.spec.js` construit un site de test à part (`scripts/site/e2e-site.mjs`), ce n'est pas un doublon.

**Doublons entre déclenchements voisins (même contenu testé plusieurs fois)** :
- push `lot-*` **et** `pull_request` sur le **même commit** : 15 des 36 exécutions `pull_request` ont une exécution `push` sur le même commit parmi les 50 dernières (≈ 303 min cumulées).
- push `dev` d'une fusion **et** la Pull Request qui l'a précédée : 34 des 35 fusions sur `dev` avaient une exécution `pull_request` verte, lancée alors que `dev` était déjà au premier parent de la fusion, donc **sur le même arbre** (≈ 656 min cumulées). Une seule fusion (`c6e5f4f`, lot 5a) n'avait pas d'exécution de Pull Request.

**Ce que protège `quick`** (barrière du déploiement) : lint et **tout Vitest**, donc entre autres `noms.test.js` (fichier des noms), `versions-schema.test.js` et `versions-archiver.test.js` (`versions.json`, archives), `publication.test.js` (assembleur, `site-info.json`, accueil, balise de canal, actions de `pages.yml`), `build.test.js`, `workflow.test.js` et `tests-selection.test.js` (workflows : déclencheurs, permissions, `deploy` → `quick`), `debug-canal.test.js` (canaux de débogage), `lots.test.js`, `casse.test.js` (`/recette/`), `data-changelog.test.js`, `icone.test.js`, `core-purity.test.js`, `hygiene.test.js`, `package.test.js` (`dependencies` vide). **Aucun test Playwright** n'est dans `quick` : `publication.spec.js` et `canal.spec.js` ne tournent que dans `tests.yml` (standard) et ne bloquent pas le déploiement.

## 2. Historique réel (exécutions de GitHub Actions)

| Workflow · événement | Exécutions | Succès / échecs / annulées | Durée totale médiane (max) | Tâches (médiane / max) | Cumul des tâches |
|---|---|---|---|---|---|
| `tests.yml` · push `dev` | 36 (toutes) | 34 / 2 / 0 | **7 min 47 s** (10 min 19 s) | `planifier` 16 s ; `unitaires` 1 min 41 s / 2 min 00 ; tranche la plus longue 7 min 07 / 9 min 37 ; `rapport` 17 s ; `bilan-duree` 10 s ; 3 tranches dans 30 exécutions, 1 dans 5, 2 dans 1 | médiane 20 min par exécution ; 681 min |
| `tests.yml` · push `lot-*` | 50 dernières | 42 / 5 / 3 | 7 min 47 s (10 min 24 s) | `unitaires` 1 min 41 s ; tranche la plus longue 7 min 09 / 9 min 51 | 873 min |
| `tests.yml` · `pull_request` | 36 (toutes) | 36 / 0 / 0 | 7 min 57 s (10 min 15 s) | `unitaires` 1 min 25 s ; tranche la plus longue 7 min 22 / 9 min 33 ; 5 sans Playwright | 646 min |
| `tests.yml` · complet (`essai/complet-3` à `-9`, création) | 7 | 3 / **4** / 0 | **5 min 40 s** (6 min 37 s) | 16 tranches ; la plus longue 4 min 53 / 5 min 31 ; `unitaires` 1 min 23 s | 458 min |
| `pages.yml` · `dev` | 49 (1 en cours) | 47 / 1 / 0 | **2 min 18 s** (55 min 18 s ¹) | `quick` **1 min 37 s** / 1 min 59 ; `deploy` 34 s / 6 min 13 | 167 min |
| `pages.yml` · `main` (push) | 8 | 6 / 2 / 0 | 2 min 09 s (3 min 35 s) | `quick` 1 min 19 s / 1 min 57 ; `deploy` 46 s | 16 min |
| `pages.yml` · `main` (50 dernières, manuels compris) | 49 | 45 / 4 / 0 | 1 min 33 s | `quick` 1 min 04 s / 2 min 19 | 74 min |

¹ 55 min (`42409270322`), 15 min et 12 min : `quick` 1 à 2 min puis attente avant `deploy` (groupe de concurrence `pages` ou file de GitHub), sans rapport avec les tests.

- **Attente entre un push sur `dev` et la fin du déploiement** : médiane **2 min 18 s** (`quick` 1 min 37 s + `deploy` 34 s + démarrages) ; sur `main` : 2 min 15 s (push).
- **Temps cumulé du 3 au 8 novembre** : `tests.yml` ≈ **3 166 min** (≈ 53 h de machine), `pages.yml` (`dev`, `main`) ≈ 242 min. Dépôt public : gratuit, rapporté pour comparaison.
- **Mode de la sélection sur `dev`** (journaux de `planifier`) : 15 « tout » et 18 « zones » parmi les exécutions réussies ; les « zones » rejouent en général 10 à 16 zones sur 18 (la zone `jeu` dépend de 13 zones) : **médiane 7 min 48 s en zones contre 8 min 04 s en rejeu total** — la sélection par zone gagne peu sur une fusion de lot entière.
- **Rejeu total** (48 exécutions réussies, toutes branches) : médiane 8 min 03 s ; **les 10 dernières : 7 min 53 s à 10 min 24 s, 4 au-delà de 10 min** (lots 5l, 5m : la durée augmente avec les tests ajoutés).
- **Tranches déséquilibrées** (palier standard, 109 exécutions à 3 tranches) : tranche la plus longue médiane 413 s, la plus courte 299 s, projection 310 s ; **10 dernières : 441 à 573 s contre 272 à 458 s**, projection 312 à 336 s. Dernière exécution de `dev` (`42524227801`) : tranches de 559, 468 et 301 s pour 336 s projetées chacune. Cause : 106 des 363 exécutions du standard en rejeu total (29 %) n'ont **aucune durée mesurée** (`budget.mjs` : « 106 sans mesure, durée estimée » par la médiane du fichier), et les durées mesurées datent du lot 4e (machine locale).
- **Échecs des 50 dernières exécutions par type** (journaux `--log-failed`) :
  - push `dev` (2) : `publication.spec.js:70` et `:141` (lot 4f, icône absente sous le vrai Chrome, corrigé) ; `lampes.spec.js:289` (fusion du lot 5k, `6645e87` : « Failed to load resource : 404 » en console, aux deux essais ; la Pull Request du même contenu était verte : **douteux**).
  - push `lot-*` (5 échecs, 3 annulations) : 4 pendant le développement d'un lot (5h, 5j × 2, 5k : tests de la partie en cours) ; **1 au hasard** : `argent.spec.js:340` (lot 5e).
  - complet (4 sur 7, **tous au hasard**) : `carte-jeu.spec.js:66` mobile (axe, délai de test de 60 s dépassé), `atelier-detail.spec.js:56` mobile U4 (210 appels pour 211 attendus au moins), `publication.spec.js:282` (`canvas` attendu 5 s après la redirection de `/recette/`), `jeu.spec.js:200` (`#game-root` attendu 5 s après le chargement).
- **Instables rejoués avec succès** (« flaky » : échec puis réussite au rejeu de la CI) : 11 des 145 exécutions avec tranches (7,6 %), 3 des 36 sur `dev` ; **`argent.spec.js:340` (et `:337`, même test avant le lot 5b) : 9 rejeux et 1 échec**, `lampes.spec.js:289` : 1, `publication.spec.js:241` : 1.

## 3. Tests

### 3.1 Volumes
- Vitest : 139 fichiers, 6 876 tests dont 18 toujours sautés (conditions d'anciens lots) ; en CI : 86 s réelles, 183 s cumulées (`unitaires`). Les plus lents : `maps-conversion` 28,4 s, `sons-integres-ambiances` 13,7 s, `zones-mobilier` 11,2 s, `lamps` 10,2 s, `etage-donnees` 9,5 s, `epaves` 9,4 s.
- Playwright : 1 287 exécutions au complet (bureau et mobile) ; **363 au standard en rejeu total** (bureau : 17 fichiers, ceux des zones et la fumée) ; projection `budget.mjs` : cumul 31,3 min, 3 tranches, total 6,1 min ; **réel : 10 min 19 s**.
- Par zone (standard) : `interface` 7 fichiers e2e, `graphismes` 3, `jeu` 3, `economie` 2, `rendu` 2, `publication` 2 (`publication.spec`, `canal.spec`), `personnages`, `sons`, `accueil` 1 ; les zones de logique (`noyau`, `carte`, `siege`, `vagues`, `etages`, `combat`) n'ont que des tests « complet » ou Vitest.

### 3.2 Durées et tests les plus lents
Mesure locale (cette session, 4 cœurs, rendu logiciel, projet bureau, 2 workers, **sans le complet**) des fichiers sans durée dans `tests/budget-mesure.json` : 147 exécutions en 9 min 25 s.

| Fichier (bureau) | Tests | Mesuré | Estimé par `budget.mjs` | Écart |
|---|---|---|---|---|
| `atelier-detail.spec.js` | 19 | 217 s | 146 s | +71 s ¹ |
| `lampes.spec.js` (lot 5k) | 12 | 187 s | 60 s | +127 s |
| `graphismes.spec.js` (lot 5b) | 13 | 183 s | 65 s | +118 s |
| `persos-jeu.spec.js` | 19 | 147 s | 116 s | +31 s |
| `debug-menu.spec.js` (lot 5l) | 5 | 91 s | 25 s | +66 s |
| `canal.spec.js` (lot 5l) | 6 | 80 s (14 à 18 s par test) | 30 s | +50 s |
| `perf.spec.js` (lot 5b) | 5 | 64 s | 25 s | +39 s |
| `publication.spec.js` | 48 | 55 s | 30 s | +25 s |
| `fumee.spec.js` | 11 | 49 s | 55 s | −6 s |
| `carte.spec.js` | 9 | 36 s | 9 s | +27 s |

¹ Les 7 tests de budget d'`atelier-detail` (R1 à V2) échouent **en local seulement** (rendu logiciel de cette machine ; verts en CI, où la référence est celle du Chrome du runner).

Avec ces durées (le reste inchangé) : **standard en rejeu total** 363 exécutions, cumul 2 295 s au lieu de 1 876 s, **N = 4** au lieu de 3, tranche la plus longue projetée 308 s ; **complet** cumul 6 362 s (88 exécutions encore estimées, surtout mobiles), cohérent avec la CI (≈ 3 400 s de tranches × 1,88 ≈ 6 390 s cumulées au complet du 6 novembre).

**25 tests les plus lents** (durées de la mesure de référence et de cette mesure ; G = garde-fou) :

| s | Projet | Fichier › test | |
|---|---|---|---|
| 55,7 | bureau | `lampes` › « off » ≡ `origin/dev` : appels, triangles et programmes de shaders identiques | standard |
| 52,6 | mobile | `sons-integres-ambiances` › meute de 10 zombies pendant 12 s : jamais plus de maxVoices | G, complet |
| 45,3 | bureau | `graphismes` › invariance : 12 vecteurs d'options tirés d'une graine, 600 pas | standard |
| 42,9 | mobile | `jeu-sons` › le journal est borné à 200 entrées | G, complet |
| 31,5 | mobile | `jeu-zones` › axe sans violation : annonce « Nouvelle zone » | G, complet |
| 30,7 | bureau | `graphismes` › préférence retrouvée après rechargement ; schéma 1 migré | standard |
| 29,1 | mobile | `etage` › pause pendant le passage d'un zombie dans l'escalier | G, complet |
| 25,5 | bureau | `debug-menu` › manche 12, argent 500, « Tous au niveau 3 » → « Appliquer et recharger » | standard |
| 25,4 | bureau | `jeu-pause` › le HUD annonce la vie par paliers de 10 % et la mort | G, standard |
| 25,2 | bureau | `debug-menu` › 1440×900, canal dev (site assemblé, sans `?test=1`) | standard |
| 24,9 | mobile | `carte-jeu` › `?labels=1` : 7 étiquettes alignées | G, complet |
| 24,8 | bureau | `jeu-vagues` › `?wave=N` invalide est ignoré | complet |
| 23,8 | mobile | `sons-integres` › console propre et axe sans violation | G, complet |
| 23,0 | bureau | `interface-integree` › les 7 tailles de l'atelier | G, standard |
| 23,0 | bureau | `jeu` › clavier : W, A, S, D, flèches, `event.code` | G, standard |
| 22,5 | bureau | `jeu` › le joueur reste dans la salle | G, standard |
| 21,6 | mobile | `carte-jeu` › `?zoom=1` montre tout le bâtiment | G, complet |
| 21,5 | bureau | `sons-integres-ambiances` › meute de 10 zombies | G, complet |
| 21,0 | mobile | `jeu-sons` › invitation à activer le son | G, complet |
| 20,9 | bureau | `persos-sang` › niveau 1 : 60 s de tirs | G, complet |
| 20,8 | mobile | `etage` › `?fps=1` affiche « Étage : X ms » | G, complet |
| 20,3 | mobile | `sons-integres` › tous les tampons prêts | G, complet |
| 20,2 | bureau | `graphismes` › chaque préréglage applique ses réglages | standard |
| 20,1 | bureau | `persos-sang` › niveau réduit : 60 s de tirs | G, complet |
| 19,7 | bureau | `lampes` › fichiers : « off » n'en charge aucun de plus | standard |

Tests des canaux (lot 5l) : 14 à 18 s chacun en local (`canal.spec`), 25 s pour les deux tests « canal dev » de `debug-menu.spec` (site assemblé).

### 3.3 Tests propres à du code ou des pages supprimés (lots 5c, 5e, 5m)
`git grep` des chemins cités par les tests et absents du dépôt : **aucun test actif ne teste un code ou une page supprimés**. Les mentions restantes sont des contrôles d'absence (`lot1-regles` : ancien moteur 2D ; `persos-integres` : `pose.js`, `character.js` ; `sons-integres` : `sound-legacy.js` ; `publication.test` : `tests/e2e/dev.spec.js`), des listes d'exception d'anciens lots (`LOT_4C`, 10 fichiers) ou des chaînes d'exemple. **Tests inactifs** : 18 tests Vitest toujours sautés, dont la condition ne peut plus être vraie (`persos-donnees:90`, `persos-jeu:90, 96, 227` : `apercu.txt` du lot 3j ; `publication.test:667` : sujets « Lot 4c » ; `:700` : « Lot 5g » ; `noms.test:173–187` : fichier des noms initial) : 0 s de calcul.

### 3.4 Doublons
- Vitest : la forme de `pages.yml` (tâches `quick`, `deploy`, `needs: quick`, commandes de `quick`) est vérifiée trois fois (`workflow.test.js:30, 102`, `publication.test.js:611`, `tests-selection.test.js:187`) : quelques millisecondes, garde-fou des workflows.
- Playwright / Vitest : **aucun doublon prouvé** dans cet audit (je n'ai pas comparé assertion par assertion les 46 fichiers Playwright ; ceux de la fumée recoupent `jeu.spec` et `publication.spec` — démarrage, axe, réseau — mais servent de plancher au standard).

### 3.5 Pages techniques (à retirer au lot 13)
Zone `pages-techniques` : 13 fichiers Playwright, **tous au palier complet seulement** (aucun au standard), tous garde-fous par motif (chargement, axe, cibles, CLS, budgets) depuis le lot 4e ; 8 fichiers Vitest. Leurs tests non garde-fous restants : `atelier-sons` (7), `atelier-visite` (5), `persos-atelier` (7), `interface-atelier` (9) : quelques secondes chacun, complet seulement.

### 3.6 Budget de durée (`tests/budget.json`, `npm run test:budget`)
Complet projeté : 1 287 exécutions (208 sans mesure), cumul 96,9 min contre 93,4 min (5 605 s) à la référence du lot 4e : **+210 s pour un ajout maximal de 90 s** (ERREUR non bloquante) ; **avec les durées mesurées en §3.2 : +757 s**. L'écart se cumule depuis le lot 4e (≈ 20 lots) : il ne mesure pas « un lot ». Fichiers sans mesure (secondes estimées) : `atelier-detail` 172 (titres changés au lot 5b), `graphismes` 65 (5b), `publication` 62 (5g, 5h, 5j), `lampes` 60 (5k), `persos-jeu` 57, `fumee` 55, `carte-jeu` 45, `canal` 30 (5l), `debug-menu` 25 (5l), `perf` 25 (5b). Le lot 5l signalait déjà +130 s avant lui et +55 s pour lui. **En CI, le complet dure 5 min 40 s** (médiane, 16 tranches, ≈ 6 400 s cumulées réelles) : sous l'objectif de 10 min.

### 3.7 Retour sur « tout » (30 derniers commits de `dev`, hors fusions)
**4 sur 30 (13 %)** : `3ca2e19`, `73f051b` (lot 5m), `8cd1069`, `3e7ec16` (lot 5l) ; **tous à cause de `tests/selection.json` seul**, et dans les 4 cas seules des entrées de zones ont changé (`outillage-tests`, `interface`, `graphismes`, `publication`). 11 commits de documentation seule ne rejouent rien. Sur les fusions de `dev` : 17 sur 35 en rejeu total (`tests/selection.json` dans 10, `css/tokens.css` dans 5, aides `tests/unit/helpers/**` dans 3, workflows, `package.json` ou configuration dans 5) ; 7 d'entre elles ne viennent que de `tests/selection.json` et des aides Vitest.

## 4. Catégories

| Cat. | Candidat | Tests | Gain | Preuve | Risque | Recommandation |
|---|---|---|---|---|---|---|
| **W1** | `unitaires` sauté sur un push de `dev` (lint et tout Vitest déjà faits par `quick`, qui bloque le déploiement) | 0 retiré | ≈ 1 min 41 s de machine par push de `dev` (≈ 61 min sur la période) ; attente avant déploiement inchangée ; durée totale de `tests.yml` inchangée (les tranches dominent) | `quick` = `npm run lint` + `npm test` (= `vitest run`, mêmes 139 fichiers) ; `unitaires` = `npm run lint` + `npx vitest run` | `bilan-duree` sans durée de Vitest sur `dev` ; rien d'autre (`pages.yml` intact) | **APPROUVER** (W1-a) |
| W1 (variante) | `quick` = lint + 37 fichiers Vitest de la publication ; `unitaires` = le reste de Vitest sur `dev` (liste ci-dessous) | 0 retiré | attente avant déploiement ≈ −55 s sur `dev` et `main` (Vitest : 86 s → ≈ 15 s) | sous-ensemble : 22,7 s cumulées en CI sur 183 s | **sur `main`, 102 fichiers Vitest ne tourneraient plus au push** (testés avant, par la Pull Request `dev` → `main`) ; `pages.yml` modifié (testé seulement après fusion) ; seuil de `quick` non dépassé | REFUSER (W1-b) |
| **W2** | `pull_request` limité aux Pull Requests vers `main` (`branches: [main]`) | 0 retiré | ≈ 36 exécutions et ≈ 646 min de machine en 6 jours ; aucun effet sur le déploiement | voir §1 : le commit d'une Pull Request vers `dev` est déjà testé par le push `lot-*`, et l'arbre fusionné par le push de `dev` (34 fusions sur 35) | l'arbre fusionné n'est testé qu'après la fusion (le déploiement de `/dev/` n'attend déjà pas `tests.yml`) ; les coches de la Pull Request restent visibles (exécution du push sur le même commit) | **APPROUVER** (W2-a) |
| W2 (variante) | retirer `dev` des push de `tests.yml` (garder les Pull Requests) | 0 | ≈ 36 exécutions, ≈ 681 min | 34 fusions sur 35 déjà testées sur le même arbre | plus de palier standard sur `dev` (contrôle « CI de dev verte » réduit à `pages.yml`) ; une fusion après un déplacement de `dev` n'est plus testée ; exclusive de W2-a | REFUSER (W2-b) |
| W2 | **base du premier push d'une branche `lot-*`** : `origin/dev` (point de départ du lot, comme `selectionner.mjs` en local) au lieu d'`origin/main` (`scripts/tests/lib/ci.mjs`, `basesCandidates`) | 0 | ≈ 1 rejeu total de moins par lot (≈ 10 min, ≈ 25 min de machine) | journaux de `planifier` : premiers push de `lot-5j`, `lot-5l`, `lot-5m` comparés à `6e3ae1a` (`main`, V0.6) → « tout » à cause de `css/tokens.css`, changé sur `dev` depuis V0.6 et pas par le lot (de même `lot-4f` à `lot-5e` avec `f6b744a`) ; `lot-5l-A` seul aurait rejoué 2 zones | une branche qui ne part pas de `dev` serait comparée à `dev` (repli sur `origin/main` si `origin/dev` est absent) | **APPROUVER** (W2-c) |
| W2 | `paths-ignore` de `pages.yml` (documentation seule) | — | ≈ 2 min par push de documentation | — | déclencheurs de `pages.yml` : **interdits à ce lot** | Idées |
| **T1** | 18 tests Vitest toujours sautés (conditions d'anciens lots, §3.3) | 18 tests (assertions comptées en B) | 0 min | condition impossible (branches et fichiers disparus) | aucun ; baisse du décompte d'assertions de fichiers G (`publication.test`) à reporter dans `assertions-reference.json` | REFUSER (aucun gain de temps) |
| **T2** | contrôles de `pages.yml` répétés dans 3 fichiers Vitest | 3 à 4 tests | < 1 s | §3.4 | garde-fou des workflows | REFUSER |
| **T3** | délais de 5 s après un chargement du jeu → 30 s : `jeu.spec.js:181, 183, 194, 204, 205`, `jeu-ambiance.spec.js:171, 172`, `publication.spec.js:287` | 5 tests | instabilité du complet (2 des 4 échecs au hasard) | §2 : `jeu.spec.js:200` et `publication.spec.js:282` échouent à 5 000 ms ; chargement 3,5 à 5,5 s (lot 4e) | aucun (mêmes assertions, délai seulement) | **APPROUVER** |
| T3 | `carte-jeu.spec.js:66` mobile (axe, garde-fou) : délai du test 60 s → 120 s (`test.setTimeout`), assertion inchangée | 2 | instabilité du complet | 1 échec au hasard (délai de 60 s) | aucun | **APPROUVER** |
| T3 | `argent.spec.js:340` (multi-onglets, garde-fou sauvegarde) : diagnostic (`--repeat-each`), correction si la cause est dans le test ; **jamais `@instable`** (le sortirait du standard) | 1 | 9 rejeux et 1 échec sur 145 | §2 | cause possible dans le jeu (deux onglets, une écriture perdue : 10 au lieu de 20) : alors défaut signalé (Idées), test gardé tel quel | **APPROUVER** (diagnostic, correction côté test seulement) |
| T3 | `atelier-detail.spec.js:56` mobile U4 (garde-fou budget, 210 pour ≥ 211) | 1 | 1 échec au hasard | §2 | toute tolérance affaiblirait un garde-fou | Douteux : garder, étudier |
| **T4** | **Durées mesurées des tests sans mesure** (208 exécutions, 106 au standard) : mesure locale par l'outillage (`mesurer.mjs`, bureau et mobile, fichiers concernés seulement), intégrée à `tests/budget-mesure.json` ; le plan des tranches s'équilibre et `N` du standard est recalculé (4 attendues en rejeu total) | 0 retiré | rejeu total ≈ 10 min 19 s → ≈ 6 min 40 (§5) ; standard en zones ≈ 7 min 48 s → ≈ 6 à 6 min 30 | §2 : tranches de 559 / 468 / 301 s pour 336 s projetées | une machine locale n'a pas la vitesse des exécuteurs (l'équilibre relatif suffit) ; une tranche de plus = ≈ 40 s de machine en plus | **APPROUVER** |
| T4 | `canal.spec.js` (6 tests, 15 à 20 s chacun, jeu réel sans `?test=1`) | 6 | 0 | chaque test charge une adresse et un canal différents ; les raccourcis de rendu (`?vhs=0…`) sont justement ignorés en production | regrouper mélangerait des configurations | REFUSER (rien à regrouper) |
| **T5** | `tests/selection.json` : un changement limité aux entrées `zones[*]` touche ces zones (fermeture inverse comprise) au lieu de « tout » ; toute autre clé (`garde-fous`, `rejeu-total`, `toujours`, `fumee`, `documentation`, `defaut`, `schema`) garde « tout » | 0 | « tout » : 4/30 → 0/30 commits ; 7 des 17 fusions en rejeu total | §3.7 | une erreur dans la table ne rejouerait que ses zones : sabotage refait en C, contrôle de la table (`tests-selection.test`) toujours dans `toujours` | **APPROUVER** |
| T5 | `tests/unit/helpers/**` : rejeu de **tout Vitest** (déjà fait en CI par `unitaires`), plus de rejeu total de Playwright | 0 | 3 fusions en rejeu total de moins | `grep -rl unit/helpers tests/e2e` : aucun fichier | aucun pour Playwright | **APPROUVER** |
| T5 | `css/tokens.css`, `tests/e2e/helpers.js`, workflows, configurations | — | — | lus par toutes les pages ou tous les tests | — | garder |
| **T6** | Retour sous l'ajout maximal de 90 s : la référence `complet.cumulSecondes` (lot 4e, 5 605 s) remplacée par le cumul mesuré après T4 (≈ 6 360 s ; les lots suivants comparent à elle) | 0 | — | §3.6 : complet réel 5 min 40 s ; écart réel +757 s | **c'est une remise à zéro de la référence, pas un allègement** ; à décider explicitement | APPROUVER si T4 l'est (sinon REFUSER) |
| T6 (variante) | retraits pour −667 s cumulées au complet : liste minimale parmi les 161 tests du complet hors garde-fous et hors standard (952 s) : `jeu-ambiance` 34 tests 221 s, `etage` 40 tests 212 s, `jeu-vagues` 21 tests 132 s, `sons-integres` 12 tests 122 s (687 s, 107 tests) | 107 | 11 min de calcul, ≈ 45 s réelles sur 16 tranches | non-garde-fous du complet (bureau) | perte de règles de jeu (ambiance, étage, vagues, sons) vérifiées en navigateur, pour un complet déjà à 5 min 40 s | REFUSER |
| **Douteux** | `lampes.spec.js:289` (404 à la fusion du lot 5k, deux essais ; Pull Request verte) ; tests d'hygiène d'anciens lots comparés à `main` (`LOT_4C`, 10 fichiers, `git diff` à chaque exécution) ; `Docs/ref/tests-*.md` revendiqués par la zone `outillage-tests` mais ignorés par `paths-ignore` | — | — | preuve incomplète | — | garder |

Sous-ensemble de la variante W1-b (37 fichiers, contient `noms.test`, `versions-schema`, `versions-archiver`, `publication.test` (assembleur, accueil), `build.test`, `workflow.test`, `tests-selection.test`, `debug-canal.test` (canaux), `lots.test`, `casse.test`, `data-changelog.test`, `icone.test`) : les 24 fichiers `toujours` de `tests/selection.json`, les Vitest des zones `publication` et `accueil`, et `debug-canal.test.js`.

## 5. Chiffrage et seuils du propriétaire

| Mesure (médiane) | Actuel | Après W1-a, W2-a, T3, T4, T5, T6 (projection) | Seuil | État actuel |
|---|---|---|---|---|
| Attente avant déploiement, `dev` | 2 min 18 s | 2 min 18 s (`pages.yml` intact) | — | — |
| Attente avant déploiement, `main` | 2 min 15 s | 2 min 15 s | — | — |
| `quick` | 1 min 37 s (`dev`), 1 min 19 s (`main`) | inchangé | ≤ 4 min | **tenu** |
| Standard sur `dev` | **7 min 47 s** | ≈ 6 min à 6 min 30 (4 tranches équilibrées) | ≤ 7 min | **dépassé** |
| Rejeu total | **≈ 10 min** (10 dernières : 7 min 53 à 10 min 24) | ≈ 6 min 40 (4 tranches équilibrées, hypothèse mesurée ; voir note) | ≤ 10 min | **à la limite, dépassé 4 fois sur les 10 dernières** |
| Complet | 5 min 40 s | ≈ 5 min 30 | ≤ 10 min | **tenu** |
| Instabilité (échecs au hasard) | complet **4 sur 7** ; standard 1 sur 122 (+ 1 douteux) | complet : 2 causes corrigées (délais), 1 délai de test ; restent `atelier-detail` U4 et `argent:340` | ≤ 1 sur 50 | **dépassé (complet)** |
| Budget de durée (`budget.json`) | +210 s pour 90 s | 0 (référence remise à la mesure) | respecté | **dépassé** |
| Temps cumulé par push de `dev` | ≈ 20 min (`tests.yml`) + 2 min 12 s (`pages.yml`) | ≈ 19 min (W1-a) ; une tranche de plus : +≈ 40 s | — | — |
| Temps cumulé par lot (1 Pull Request) | push `lot-*` + `pull_request` + push `dev` ≈ 3 × 20 min, plus un rejeu total au premier push | ≈ 2 × 20 min (W2-a), premier push en zones (W2-c) | — | — |

Note sur les deux hypothèses de parallélisme de `tests/budget.json` : la CI mesure 1,86 à 1,98 (2 workers) ; le rejeu total réel du 8 novembre (1 328 s de tranches, 363 exécutions) vaut ≈ 2 600 s cumulées. Avec 4 tranches équilibrées : 1 328 s de tranches réelles ÷ 4 ≈ 332 s par tranche (≈ 2 600 ÷ 4 ÷ 1,96), total ≈ 332 + ≈ 70 s (planifier, installation, rapport, bilan) ≈ **6 min 40** ; projection de `budget.mjs` avec les durées locales : N = 4, tranche 308 s, 338 s (les exécuteurs ont été 20 à 60 % plus lents que les projections, lot 4f). Hypothèse prudente (1,0) : 2 600 ÷ 4 = 650 s par tranche, **≈ 12 min** (jamais observée : parallélisme réel ≥ 1,83 sur toutes les tranches lues). Avec 5 tranches (`standardCibleSecondes` abaissé à 400 s, seulement si le propriétaire l'ajoute en exception) : ≈ 280 s, total ≈ 6 min.

**Seuils dépassés : standard sur `dev`, rejeu total (à la limite), instabilité du complet, budget de durée. Doublons trouvés : Vitest et lint deux fois par push de `dev` ; trois exécutions du même contenu par lot (push `lot-*`, `pull_request`, push `dev`).** La conclusion « ne rien changer » ne s'applique donc pas.

## 6. Recommandation
Approuver **W1-a** (sans toucher à `pages.yml`), **W2-a**, **W2-c**, **T3** (délais de 5 s, délai de `carte-jeu:66`, diagnostic d'`argent:340`), **T4** (durées des tests sans mesure, tranches équilibrées), **T5** (table de sélection et aides Vitest) et **T6** (référence remise à la mesure de T4) ; refuser T1, T2 et les variantes. Aucun garde-fou n'est retiré ni affaibli ; aucun test n'est supprimé. `pages.yml` n'est pas modifié (seuil de `quick` tenu) : aucun retour arrière de déploiement à prévoir.

Dans le modèle de décisions, une catégorie approuvée s'applique à la ligne recommandée ci-dessus ; pour une variante (W1-b, W2-b, T6 par retraits) ou pour ne garder qu'une partie d'une catégorie (par exemple T3 sans `argent:340`), l'écrire sur la ligne de la catégorie ou dans « Exceptions ». Une ligne ambiguë n'est pas appliquée.
