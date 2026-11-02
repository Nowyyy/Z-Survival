# Passation : fusionner le lot 3j (personnages v2 et sang) dans le lot 4b

Ce fichier suffit pour fusionner `lot-3j` dans la branche d'intégration `lot-4b` sans relire la conversation du lot. Il liste **tout ce que le lot a fait** (livraison puis retours du propriétaire), les fichiers touchés, la résolution exacte de chaque conflit (vérifiée par une fusion à blanc dans `lot-4b`), les tests à surveiller et les règles à reporter dans `CLAUDE.md` et `conventions.md`.

Documents liés : bilan `Docs/lots/lot-3j.md` ; manifeste `Docs/ref/fusion-3j.md` ; méthode et données `Docs/ref/atelier-personnages.md` ; plan d'intégration `Docs/ref/integration-personnages.md` ; état des lieux d'avant `Docs/ref/personnages-actuels.md`.

## 1. Où regarder

- Branche **`origin/lot-3j`** (base `origin/main` `c166e53`, lot 4). Toujours écrire `origin/lot-3j` : dans la session du lot, un tag local `lot-3j` (ancien, `c5b0a2e`, jamais poussé) rendait le nom ambigu.
- Aperçu : `https://nowyyy.github.io/Z-Survival/lots/lot-3j/jeu.html` (jeu, nouveaux personnages par défaut) et `…/lots/lot-3j/atelier-personnages.html` (atelier ; `?test=1` expose `window.__zsPersos`).
- Commits (du plus ancien au plus récent) :

| Commit | Contenu |
|---|---|
| `95f1315` | 3j-A : état des lieux mesuré, architecture « os rigides », kit pur `character-parts.js` |
| `324aeae` | 3j-B : variantes A, B, C (et riche), tenues, usure, squelette v2, animations, atelier |
| `de6aec0` | 3j-C : sang (3 niveaux), cadavres, mini-arène |
| `c5b0a2e` | 3j-D : essai en jeu (`?perso=`, `?sang=`), fusion à blanc, bilan |
| `1ae3204` | entrée `lot-3j` du journal des versions (job « quick » en échec) |
| `61415e6` | **« riche » et sang complet par défaut** ; démarrage allégé (Lighthouse) |
| `d56ace8` | jamais tirer et réparer à la fois ; laser depuis le canon ; pistolet lisible |
| `56cb762` | mort selon le côté touché (de face : en arrière) |
| `15db76c` | recul du pistolet ; pas de laser pendant la réparation |
| `bd5e78f` | recul visible (buste) ; animation « enjamber » des fenêtres |
| (ce commit) | passation : garde-fous limités à la branche du lot, contrastes avec les textures du 3g, journal des versions à jour |

## 2. Ce qui change dans le jeu (comportement par défaut après fusion)

1. **Personnages v2 « riche »** pour le joueur et les quatre zombies (marcheur, petit, voûté, grand) : architecture « os rigides » (un maillage par matière, 3 à 4 appels par personnage au lieu de 16-17), 6 tenues par zombie tirées à chaque apparition, 3 palettes du joueur, 4 paliers d'usure selon la manche (1-10, 11-20, 21-30, 31-40), textures générées en code (aucune image).
2. **Sang complet** : gerbes à l'impact, taches au sol, taches sur les corps selon la vie, cadavres qui s'enfoncent (6 au plus). Purement visuel : rien n'est lu par la simulation.
3. **Animations v2** : marches sans glissement des pieds (cinématique inverse), attaque, touché, trois morts, réparation, relevage, à terre, escalier, rampe.
4. **Morts** : le corps tombe à l'opposé du tireur (de face : en arrière ; de dos : en avant ou effondré) et garde l'orientation du zombie.
5. **Fenêtres** : les zombies **enjambent** l'ouverture (`enjamber`, piloté par `climb.t`) : mains et genou sur l'appui, corps couché entre l'appui (16) et le linteau (44), retombée accroupie ; avant le passage, ils marchent jusqu'au bord.
6. **Pistolet** : tenu bras tendus (`HOLD`), plus grand, métal clair ; **recul** à chaque tir (arme qui recule et se cabre, buste rejeté, 0,25 s) ; **laser, éclair et balles partent du bout du canon** (dessin seulement ; la logique part toujours de `muzzlePoint`).
7. **Tir ou réparation, jamais les deux** : quand le laser vise un zombie, la réparation s'arrête (la planche garde sa progression) ; **pas de laser pendant la réparation** (la visée continue : un zombie visé arrête la réparation et le laser revient). **Règle de jeu nouvelle** : elle contredit `conventions.md` (lot 3), voir § 8.
8. **Démarrage** : seul le joueur est construit dans `createGame` ; zombies préparés en tâche de fond (`requestIdleCallback`, une tenue par tâche), atlas des taches au premier moment libre, maillages du sang masqués tant qu'ils sont vides, géométries des personnages actuels construites seulement si elles servent.

Inchangés : toute la logique du jeu (positions, vies, dégâts, argent, vagues : invariance vérifiée à graine fixe pour `actuel`, A, B, C, riche et les trois niveaux de sang), sauf la règle tir / réparation du point 7.

## 3. Paramètres d'adresse (pour le futur menu d'options)

`js/game/persos-params.js` : `?perso=actuel|A|B|C|riche` (défaut `riche`), `?sang=0|reduit|1` (défaut `1`), `?usure=auto|0|1|2|3` (défaut `auto`). Valeur inconnue : défaut. Jamais mémorisés ; ils ne déclenchent pas le mode essai. **`?perso=actuel&sang=0` = le jeu d'avant le lot** (rien de plus chargé). Le niveau de sang est prévu pour le futur écran de réglages (« Sang : aucun / réduit / complet », mémorisé dans la sauvegarde : `integration-personnages.md`, § 8).

## 4. Fichiers

### Nouveaux (aucun conflit possible)
- Page : `atelier-personnages.html`, `css/atelier-personnages.css`, `data/i18n/atelier-personnages.json` (clés `dev.persos.*`, français seul), `js/atelier-personnages/{main,scene,measures}.js`.
- Logique pure (`js/core/`) : `character-parts.js` (kit, fusion des pièces, cinématique directe), `pose-v2.js` (animations, `HOLD`, `KICK`, `VAULT`), `persos-variants.js` (variantes, tenues, usure, « Mes choix »), `texgen-persos.js` (atlas), `blood.js` (sang, `deathFor`), `arena.js`, `crowd.js` (mini-arène).
- Jeu (`js/game/`) : `character-v2.js` (os rigides, `muzzle()`, préparation `prewarm`), `blood-fx.js`, `persos-params.js`, `persos-loader.js`, `persos-runtime.js`.
- Données : `data/game/characters-v2.json`, `poses-v2.json`, `blood.json`.
- Scripts (lecture seule, sortie standard) : `scripts/personnages/{lib,inventaire,architecture,variantes,animations,projection,mesure-rendu}.mjs`.
- Tests : `tests/unit/persos-{kit,actuels,donnees,animations,variantes,page,sang,arene,jeu}.test.js`, `tests/e2e/persos-{atelier,sang,jeu}.spec.js`.
- Docs : `Docs/lots/lot-3j.md`, `Docs/ref/{atelier-personnages,integration-personnages,personnages-actuels,fusion-3j}.md`, ce fichier.

### Partagés modifiés (diff avec `main`)
| Fichier | Lignes | Modification |
|---|---|---|
| `apercu.txt` | 2/2 | première ligne `atelier-personnages.html`, titre « Atelier des personnages » |
| `css/tokens.css` | +37 | bloc final isolé « Personnages et sang (lot 3j) » : `--perso-*`, `--sang-frais`, `--sang-sec`, `--sang-reduit` |
| `data/changelog.json` | +9 | entrée `lot-3j` « Atelier des personnages » avant `lot-4` |
| `scripts/build.mjs` | +1 | `ENTRIES.push('atelier-personnages.html'); // lot 3j …` après `ENTRIES` |
| `tests/unit/lot1-regles.test.js` | +7 | `allowed.push('js/core/<fichier>.js'); // lot 3j` × 7 après `allowed` |
| `js/game/character.js` | +8 −3 | `if (kit.v2) return kit.v2.create(kind, variant);` ; `geo` de `createKit` devient un accesseur paresseux |
| `js/game/effects.js` | +17 −10 | `frame.gun` facultatif : laser, cône, point, éclair, balles, étincelles depuis le canon et à sa hauteur (`laserY`, `shotY`) |
| `js/game/game.js` | +21 −5 | voir le détail ci-dessous |
| 9 tests e2e existants | 1 à 4 lignes chacun | voir § 6 |

`js/game/game.js`, chaque ligne marquée « lot 3j » : chargeur en tête (`const persos = await import('./persos-loader.js')…`) ; `const pv = persos?.attach(…)` après `createKit` ; `pv?.reset()` ; `pv?.update(dt)` ; `pv?.impacts(…)` après `applyImpacts` ; `canRepair: !sim.dead && !locked && !aimed` dans `stepFloors` ; `pv?.playerHit(…)` ; `poseIn` puis `playerChar.setPose(lastPose, poseIn, pv?.playerCtx(sim, eff))` ; `const gun = playerChar.muzzle?.() ?? null` ; `zIn` puis `z.char.setPose(computePose(zIn), zIn, e)` et `pv?.zombie(z.char, e)` ; `pv?.sync(…)` ; dans `effects.update` : `laser: … && !Object.values(sim.repair).some((r) => r.repairing) ? laser : null` et `gun` ; `persos` dans `snapshot()`.

## 5. Fusion à blanc dans `lot-4b` (faite à la fin du lot)

Base : `origin/lot-4b` `cdacb2b` (lots 3g, 3h, 3i déjà fusionnés), `git merge --no-commit --no-ff origin/lot-3j` dans une branche locale jamais poussée, supprimée ensuite.

**Conflits (6) et résolution exacte**
| Fichier | Résolution |
|---|---|
| `apercu.txt` | **reprendre tout le fichier de `lot-4b`** : `git checkout origin/lot-4b -- apercu.txt`. **Piège** : git ne signale que le titre ; il prend **sans conflit** la première ligne du 3j (`atelier-personnages.html`), parce que `lot-4b` ne l'a pas changée. |
| `scripts/build.mjs` | la ligne `const ENTRIES = [...]` de `lot-4b`, puis la ligne `ENTRIES.push('atelier-personnages.html'); // lot 3j …`. |
| `tests/unit/lot1-regles.test.js` | la liste `allowed` de `lot-4b` (avec ses commentaires 3h, 3i), puis les 7 lignes `allowed.push(… // lot 3j)`. |
| `data/changelog.json` | les deux entrées : celle de `lot-3g` **refermée** (`    ] },`) puis celle de `lot-3j`, avant `lot-4`. **Piège** : garder les deux blocs du conflit tels quels donne un JSON invalide (il manque `] },` après `lot-3g`). Vérifier avec `node -e "JSON.parse(require('fs').readFileSync('data/changelog.json','utf8'))"`. |
| `tests/e2e/argent.spec.js` | garder le test de `lot-4b` (`detail=0` et `detail=1`, budget du 3g) et ajouter `&perso=actuel&sang=0` à ses **deux** `open(...)` : sa référence a été mesurée avec les personnages actuels ; le budget de « riche » est couvert par `persos-jeu.spec.js`. |
| `tests/e2e/carte-jeu.spec.js` | garder les deux lignes de `lot-4b` (appels `194 + 2 + 2`, triangles `Math.min(14904 + 100 + MOBILIER, 30000)`) et ouvrir ce test avec `'&shadows=1&perso=actuel&sang=0'` (même raison). |

Fusionnés sans conflit : `js/game/game.js` (avec les modifications du 3g et du 3i), `css/tokens.css`, `tests/e2e/jeu-vagues.spec.js`.

**Résultats sur l'arbre fusionné** (avant les correctifs de ce commit) : lint propre ; Vitest 6 818 tests, 17 échecs, tous expliqués :
- 5 garde-fous du 3j qui comparent à `main` (fichiers interdits, 40 lignes de `game.js`, fichiers de `js/game/`, manifeste, `apercu.txt`) : **corrigé dans ce commit**, ils ne s'appliquent plus que sur la branche du lot (première ligne d'`apercu.txt` = `atelier-personnages.html`).
- 11 contrastes sous 3:1 (2,90 à 2,99), tous sur le béton d'escalier, plus clair avec les textures fines du 3g : **corrigé dans ce commit** (jetons `--perso-crasse` #c2baa6 → #d2cbba, `--perso-dechirure` #8a857a → #a29d92, `--perso-tissu-rose` #e2c4bf → #ebd0cb, `--perso-tissu-gris` #c9c9c4 → #d2d2cd ; minimum 3,02 avec les textures du 3g ; tout passe aussi avec celles de `main`).
- 1 garde-fou du **lot 3i** (`tests/unit/sons-integres.test.js`, « fichiers interdits au lot inchangés ») : il compare `js/game/character.js` et `js/game/effects.js` à `lot-4b`, et le 3j les modifie. **À adapter au 4b** : retirer ces deux fichiers de sa liste (ou limiter le test à la branche `lot-3i`, comme les garde-fous du 3j).

Playwright sur l'arbre fusionné : suite rapide 249/249 ; `persos-jeu`, `persos-sang`, `persos-atelier`, `argent`, `carte-jeu`, `jeu-personnages`, `jeu-textures`, `jeu-ambiance` (`E2E_FULL=1`) : 311 réussis, 155 ignorés (projets mobile / bureau), 0 échec. Budgets mesurés par défaut, avec le décor et le mobilier du 3g (appels / triangles, 10 zombies, ombres, cône) : R1 63 / 37 348, R2 50 / 29 176, U1 69 / 39 038, U4 79 / 39 800 (limites : 400 et 45 000) ; avec `?perso=actuel&sang=0` et le détail du 3g : R1 202 / 22 522, U1 215 / 25 470.

## 6. Tests

- **Nouveaux** : 9 fichiers unitaires `persos-*` (1 728 tests), 3 fichiers e2e `persos-*` (environ 75 cas par projet ; `E2E_FULL=1`, ils ne sont pas dans la suite rapide). Proposition : ajouter `persos-atelier` et `persos-jeu` à `ESSENTIAL` de `playwright.config.js` (environ 1 min 30 en rendu logiciel) ; `persos-sang` reste dans la suite complète.
- **Tests existants adaptés** (défaut « riche » et sang complet) : `argent.spec.js` (budget de référence ouvert avec `&perso=actuel&sang=0`) ; `carte-jeu.spec.js`, `jeu-ambiance.spec.js`, `jeu-personnages.spec.js` (×2), `jeu-textures.spec.js` (plafond de triangles 15 000 ou 30 000 → 45 000) ; `jeu-personnages.spec.js` (angles de `pose.js`), `jeu-3d.spec.js`, `jeu-vagues.spec.js`, `jeu-rendu.spec.js` (pièces d'ombre actuelles) ouverts avec `&perso=actuel&sang=0` ; `jeu-chutes.spec.js` (pose « terre » : angles actuels ou animation `terre` v2) ; `lot1-regles.test.js` (7 `allowed.push`). Si un autre lot change les mêmes lignes : reporter `&perso=actuel&sang=0` ou le plafond 45 000.
- **Garde-fous du 3j** (`persos-donnees`, `persos-jeu`, `persos-page`) : actifs seulement quand la première ligne d'`apercu.txt` est `atelier-personnages.html` ; ils se taisent d'eux-mêmes dans `lot-4b`. Les autres tests du 3j (données, animations, contrastes, budgets, invariance) restent actifs partout.
- Vitest sur `lot-3j` : 5 709/5 709 ; Playwright : suite rapide 239/239 ; suite complète (une fois, avant les retours du propriétaire) 1 159 réussis, 0 échec.

## 7. Procédure (lot 4b)

1. Partir d'un arbre propre sur `lot-4b` à jour : `git fetch origin lot-4b lot-3j`, `git checkout lot-4b`, `git merge --ff-only origin/lot-4b`.
2. `git merge --no-ff --no-commit origin/lot-3j`.
3. Résoudre les 6 conflits du § 5, **puis** `git checkout origin/lot-4b -- apercu.txt` (même si git ne le signale pas).
4. Adapter le garde-fou du 3i (§ 5).
5. Vérifier : `node -e "JSON.parse(require('fs').readFileSync('data/changelog.json','utf8'))"`, `npm run lint`, `npm test`, `npm run test:e2e`, puis `E2E_FULL=1 npx playwright test tests/e2e/persos-*.spec.js tests/e2e/argent.spec.js tests/e2e/carte-jeu.spec.js`.
6. Lighthouse (`LH_ONLY=jeu npm run lighthouse`, plusieurs passages : la mesure varie de ± 6) : sur `lot-3j`, `jeu.html` donnait 41 à 54 sur 6 passages (médiane 47,5, seuil 45 ; référence `?perso=actuel&sang=0` : 49 à 59), puis 47 après les retours. À remesurer avec le 3g, le 3i et l'interface du 3k. Ce qui a déjà été allégé : `lot-3j.md`, « Après la livraison » ; pistes restantes si la médiane passe sous 45 : compiler les shaders des personnages v2 et du sang hors du démarrage (`renderer.compileAsync`), construire la texture du joueur en tâche de fond pendant le chargement.
7. Commit « Lot 4b — Fusion lot-3j (personnages et sang) », push de `lot-4b` seulement, comparer `git rev-parse HEAD` et `git ls-remote origin lot-4b`.
8. Ouvrir l'aperçu `…/lots/lot-4b/jeu.html` : zombies v2, sang, recul, laser depuis le canon, passage des fenêtres ; `…/lots/lot-4b/atelier-personnages.html` (la page est copiée par `npm run build`).

## 8. Règles à reporter à l'entrée dans `main`

**`Docs/ref/conventions.md`** (non modifiable dans le lot 3j) :
- Remplacer « Il peut bouger et tirer pendant la réparation » (réparation, lot 3) par : « Il peut bouger pendant la réparation ; viser un zombie l'interrompt (la planche garde sa progression), et le laser n'est pas dessiné pendant la réparation. »
- Ajouter une section « Personnages v2 et sang (lot 3j) » reprenant les lignes ci-dessous.

**`CLAUDE.md`** (lignes proposées, à la place de « Personnages : 12 pièces, 700 triangles… » quand « actuel » disparaîtra) :
- Personnages v2 : os rigides (`character-v2.js`), ≤ 4 appels, ≤ 1 600 triangles (riche ≤ 2 600), proxy d'ombre ≤ 64 ; `characters-v2.json`, `poses-v2.json` ; défaut en jeu : `riche` et sang complet (`?perso=`, `?sang=0|reduit|1` pour le futur menu d'options) ; triangles ≤ 45 000 par vue.
- Animations : `pose-v2.js` (marches par cinématique inverse, glissement ≤ 15 %), styles A, B, C ; `pose.js` seulement pour « actuel ».
- Sang : `blood.js`, `blood.json`, `blood-fx.js` ; niveaux 0, réduit, complet ; ≤ 3 appels, ≤ 1 200 triangles, ≤ 6 cadavres ; jamais de démembrement.
- Couleurs `--perso-*` et `--sang-*` (bloc du lot 3j de `tokens.css`) ; contraste ≥ 3:1 mesuré sur la couleur vue, escalier et sols tachés compris.
- Atelier : `atelier-personnages.html` (`?test=1` : `window.__zsPersos`), « Mes choix » (`persos-variants.js`).
- Morts : le corps tombe à l'opposé du tireur (`deathFor`) ; le cadavre garde l'orientation du zombie.
- Recul : `KICK` de `pose-v2.js` pendant 0,25 s ; laser, éclair et balles dessinés depuis le canon (`muzzle()`), logique inchangée.
- Fenêtres : `enjamber` (`VAULT`) suit `climb.t` ; corps entre l'appui et le linteau, rien au-dessus du mur.
- Tir et réparation : jamais en même temps (viser un zombie interrompt la réparation) ; pas de laser pendant la réparation.

## 9. Points ouverts

- **Sons** : aucun son de chair, de chute du corps ni de marteau de réparation (liste : `integration-personnages.md`, § 7) ; à brancher sur le lot des sons (3h, 3i) au 4b ou après.
- **Personnages « actuels »** (`pose.js`, `buildGeometries` de `character.js`, atlas `atlas-persos`) : toujours là pour `?perso=actuel` et les tests de référence ; leur retrait est décrit dans `integration-personnages.md`, § 3 (avec les tests à adapter, § 4). Le personnage « actuel » n'a ni animation de mort ni « enjamber ».
- **Variantes définitives** : « riche » est le défaut demandé par le propriétaire ; le choix final par personnage (« Mes choix » de l'atelier) remplacera ce défaut (`integration-personnages.md`, § 1 et 2). Le libellé « Riche (hors budget) » de l'atelier rappelle qu'elle dépasse le budget par personnage (≤ 1 600 triangles).
- **Interface du 3k** : le 3j ne touche ni `jeu.html`, ni `css/game.css`, ni `hud.js`, et `lot-3k` ne touche pas `js/game/` : aucun conflit attendu avec la passation de l'interface (`passation-interface-4b.md`). Si l'intégration de l'interface modifie `game.js` (HUD), garder les lignes « lot 3j » du § 4.
- **Non jugé par l'agent** : esthétique, caractère effrayant, fluidité et lisibilité sur téléphone (rendu logiciel seulement dans la session).
