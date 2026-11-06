# Audit de nettoyage — annexe (lots 5c-A et 5c-A2)

**A2** (6 novembre 2026, état fusionné `c3a4379` = `lot-5c` + `origin/dev` `20fa5c5`) : l'outil relancé donne les mêmes candidats qu'en A (tableaux B à J inchangés, sauf les numéros de ligne et les compléments marqués « A2 ») : 588 constructions dynamiques (+20, harnais et tests du 5d, aucune ne vise un candidat), 160 exports utilisés seulement dans leur fichier, 242 utilisés seulement par des tests, 21 fichiers lus seulement par des tests (dont les 5 oracles du 5d, jamais candidats). Accès calculés aux exports relevés en A2 : `atelier-analyse.test.js` (`audio-analysis.js`), `collision-identite.test.js` (`collision.js`), `lots.test.js` (`js/lots.js`), `poses-identite.test.js` (`character-parts.js`, `pose-v2.js`) : aucun candidat N1 dans ces modules, sauf `affine` (douteux, I).

Produit à partir de `node scripts/nettoyage/auditer.mjs --json <fichier hors dépôt>` sur `origin/dev` = `d18023c`, puis lu et classé à la main (l'outil ne compte jamais ses propres documents, ni lui-même, comme preuve d'usage). Résumé : `Docs/ref/nettoyage-audit.md`. Les noms de fichiers sont des données.

**Preuves** (règles du lot) : **a** aucun import statique ou dynamique, `new URL`, chemin lu par `fetch` ou `fs`, `src`/`href` de page (graphe de `scripts/tests/lib/graphe.mjs`, complété) ; **b** aucune occurrence du nom de fichier, ou de l'identifiant d'un export, hors du fichier lui-même (index en mémoire de tous les fichiers suivis, équivalent de `git grep -nw`) ; une mention dans `Docs/lots/` est de l'historique (jamais modifié, toléré) ; une mention dans `Docs/ref/` est corrigée en partie B ; **c** aucune construction dynamique qui puisse le viser ; **d** aucune mention dans `package.json`, `.github/workflows/*`, `tests/selection.json`, `scripts/tests/classement.json`, `versions.json`, `data/game/graphics.json` (une ligne qui range le fichier comme **source d'une zone** de `tests/selection.json` n'est pas un usage : elle part avec le fichier) ; **e** paramètres d'URL : code, tests, `graphics-apply.js`, `graphics-boot.js`, `js/core/graphics.js`, `graphics.json`, documentation.

## A. Constructions dynamiques (c)
568 relevées : 289 gabarits, 209 `readFileSync`, 21 `fetch`, 16 `loadJson`, 23 `new URL`, 8 `read`, 2 `import` (tous deux dans des tests). Dans le site (`js/`, `dev/`), les seules qui construisent un chemin :
| Motif | Où | Peut viser |
|---|---|---|
| `${mapDir}/{zones,etage.world,decor-interieur.world,mobilier.world,world,decor,feux}.json` ; `data/game/maps/${mapId}` | `js/game/main.js:66-129` | les données de `data/game/maps/<id>/` et, pour la salle, `data/game/world.json`, `decor.json` |
| `data/game/maps/${id}/{world,decor,zones,etage.world}.json` | `js/carte/main.js:41-49` | idem |
| `${DIR}/{releve,plan,world,etage,etage.world,ecarts-decisions}.json` | `js/ecarts/main.js:25` | données de la carte |
| `${base}data/i18n/${lang}.json` | `js/page.js:25` | `data/i18n/fr.json`, `en.json` |
| `${ROOT}versions.json`, `${probe.devPath}build-info.json` | `dev/dev.js:22`, `js/accueil/main.js:19` | fichiers du site assemblé |
| `jeu.html?nospawn=1&wave=${n}` | `js/core/visite.js:29` | `jeu.html` |
| `fetch(path)`, `loadJson(path)` | enveloppes de 11 modules | appelées avec des littéraux (déjà dans le graphe) |
Clés, classes et jetons construits : préfixes `game.gfx.`, `atelier.state.`, `ui3k.shop.weapon.`, `dev.persos.anim.`, `dev.sons.etiquette.`… (keys), `p2-hit-`, `p2-zone-`, `ui3k-dir-`, `sol-`, `is-` (classes), `--game-` (`palette.js` : liste `NAMES`). Tests et scripts : énumérations `readdirSync('scripts/sons')` (`atelier-sons-hygiene.test.js:98`), `readdirSync('scripts/personnages')` (`persos-donnees.test.js:112`), `walk('scripts')` (`lot1-regles.test.js:82`) : elles parcourent ce qui existe, une suppression ne les casse pas. Aucun accès calculé aux exports d'un module (`m[nom]`) dans le dépôt.

## B. N1 — code et données morts certains
| Candidat | Lignes / octets | a | b | c | d | Tests | Risque | Reco. |
|---|---|---|---|---|---|---|---|---|
| `js/core/arena.js:60` `runArena` | 11 / 361 | aucun import | aucune occurrence | aucun | aucune | aucun | faible | supprimer |
| `js/core/audio-mix.js:72` `activeCount` | 4 / 200 | aucun | `Docs/ref/conventions.md` (consolidation, historique), bilan 2c | aucun | aucune | aucun | faible | supprimer |
| `js/core/ecarts.js:13` `NATURES` | 1 / 111 | aucun | aucune | aucun | aucune | aucun | faible | supprimer |
| `js/core/ecarts.js:14` `ACTIONS` | 1 / 96 | aucun | aucune | aucun | aucune | aucun | faible | supprimer |
| `js/core/floor-sim.js:108` `zombieSolidsOn` | 1 / 133 | aucun | aucune | aucun | aucune | aucun | faible | supprimer |
| `js/core/floor-sim.js:182` `floorOfEnemy` | 1 / 46 | aucun | aucune | aucun | aucune | aucun | faible | supprimer |
| `js/core/shape.js:115` `gapToAll` | 5 / 155 | aucun | aucune | aucun | aucune | aucun | faible | supprimer |
| `js/core/siege.js:13` `MODES` | 1 / 87 | aucun | aucune | aucun | aucune | aucun | faible | supprimer |
| `js/core/synth.js:17` `LAYER_TYPES` | 1 / 76 | aucun | aucune | aucun | aucune | aucun | faible | supprimer |
| `js/core/synth2.js:22` `EDGE` | 1 / 26 | aucun | aucune | aucun | aucune | aucun | faible | supprimer |
| `js/core/synth2.js:304` `levelDbOf` | 1 / 88 | aucun | aucune | aucun | aucune | aucun | faible | supprimer |
| `js/core/ui-mock.js:168` `stateById` | 4 / 153 | aucun | `Docs/ref/atelier-interface.md:17` (à corriger) | aucun | aucune | aucun | faible | supprimer |
| `js/game/picking.js:20` `screenPoint` | 4 / 190 | aucun | aucune | aucun | aucune | aucun | faible | supprimer |
| `css/tokens.css:57` `--space-8`, `:67` `--duration-normal` | 2 / ≈ 40 | ni `var()` ni chaîne | aucune (les jetons exigés par `tokens.test.js` sont d'autres) | aucun préfixe `--space-` ou `--duration-` construit | aucune | aucun | faible | supprimer |
| `tests/e2e/.gitkeep` | 0 / 0 | — | aucune | aucun | aucune | aucun | nul | supprimer (le dossier a 51 autres fichiers) |
Les exports sont sans usage interne (aucune autre occurrence dans leur fichier) ; leurs fonctions d'aide éventuellement orphelines seront signalées par ESLint (`no-unused-vars`) en partie B. `js/core/*` : `lot1-regles.test.js` autorise déjà la modification de ces fichiers. **Non candidats** : `affine` (`character-parts.js:98` en A2 ; lot 5d en A ; en A2 : lu par l'accès calculé de `poses-identite.test.js:113`, voir I) ; 153 exports utilisés seulement dans leur fichier (code vivant, mot `export` superflu) ; 231 exports utilisés seulement par des tests (`texgen.js` `valueNoise`, `floors.js` `countByFloor`, `releve.js` `planToModel`…, liste dans la sortie de l'outil) ; aucun module, aucune donnée JSON, aucun asset sans lecteur ; aucune clé de texte orpheline démontrée (212 clés sans usage littéral, toutes visées par un préfixe construit) ; aucune règle CSS sans usage démontrée (19 sélecteurs sans usage littéral, tous visés par un préfixe construit : annexe I).

## C. N2 — paramètres d'URL (31)
| Paramètre | Lu par | Tests (fichiers / occ.) | Préréglages | Nature | Verdict |
|---|---|---|---|---|---|
| `perso` | `persos-params.js:24`, `graphics.js:149,209` | 16 / 172 | `graphics.js:149` (`explicitParams`), `presetSearch` | `A` et `choix` : préréglages ; `actuel` : ancien mode | `actuel` : **douteux** (I) ; le reste : garder |
| `sons` | `sound-choice.js:19` | 9 / 44 | — | `ancien` : ancien mode ; `A|B|C` : variantes de l'atelier | `ancien` : **douteux** (I) ; `A|B|C` : garder jusqu'au lot 13 |
| `detail` | `main.js:74`, `graphics.js:152` | 9 / 28 | `graphics.js:152,175-179` | ancien rendu | **rien proposé** (code des préréglages) |
| `murs` | `main.js:126` | 0 (commentaire de `carte-jeu.spec.js:207`) | — | essai des retours 3g | **candidat** |
| `percee` | `main.js:128` | 1 / 1 (`atelier-retours.spec.js:26`, garde-fou) | — | essai des retours 3g | **douteux** |
| `vhs`, `shadows`, `dpr` | `main.js:137,187`, `graphics.js:153-155` | 20 / 41 ; 19 / 26 ; 7 / 11 | `graphics.js:153-155,181-193`, `graphics.json:8` | réglages | **rien proposé** |
| `sang`, `usure` | `persos-params.js:25,28`, `persos-loader.js:18`, `graphics.js:150-151` | 15 / 132 ; 6 / 26 | `graphics.json`, `graphics-apply.js:42`, `graphics-boot.js:18` | réglages | garder |
| `gfx`, `perf`, `cap` | `graphics-boot.js:15`, `main.js:59,209` | 3 / 17 ; 5 / 14 ; 4 / 11 | `graphics.js` | lot 5b | garder |
| `map`, `empty` | `maps.js:21`, `main.js:64` | 17 / 48 ; 19 / 51 | — | ancienne salle | **jamais candidats** |
| `test`, `seed`, `store` | `main.js:56,60`, `js/save/index.js:14`, `device-settings.js:43`, pages | 52 / 162 ; 37 / 69 ; 10 / 24 | `graphics-apply.js:9` | tests | garder |
| `wave`, `floor`, `nospawn`, `endless`, `lvl`, `planks`, `money`, `fin` | `main.js:177-186,297`, `levels-source.js:7`, `save.js:300` | 28/231 ; 14/52 ; 38/201 ; 2/2 ; 11/63 ; 5/7 ; 5/35 ; 4/7 | — | mode essai | garder |
| `fps`, `tilt`, `zoom`, `labels` | `main.js:57,182-184` | 9/29 ; 4/7 ; 9/26 ; 7/22 | — | diagnostic | garder |
| `fond` | `js/atelier-interface/main.js:56`, `retenue.js:47` | 3 / 5 | — | page technique | garder (N3) |

**`?perso=actuel`** — code retenu : `js/core/pose.js` (213 l.), `js/game/character.js` (221 l.) ; aiguillage `persos-loader.js:24-25`, `persos-params.js` (`slotVariants` : repli « actuel » si la table manque), `persos-runtime.js:42,84`, `character-v2.js:155,458` (`handles`), `game.js:50`, `graphics.js:11` ; hors jeu : `js/atelier-personnages/main.js:7,11`, `measures.js:5`, `scripts/personnages/lib.mjs:8`, `architecture.mjs:8,11`. Tests qui en dépendent : unitaires `persos-animations` et `persos-donnees` (lot 5d, garde-fous), `persos-jeu`, `persos-integres`, `persos-variantes` (lot 5d), `data-textures`, `atelier-hygiene` (garde-fous) ; e2e `persos-integres.spec.js:120,263,431` (garde-fou entier), `persos-jeu.spec.js:66-68` (invariance, garde-fou), références de budget `atelier-carte.spec.js:89`, `atelier-detail.spec.js:57-59`, `argent.spec.js:808-813` (garde-fous « budget »), `carte-jeu.spec.js:404`, `jeu-personnages.spec.js:43`, `jeu-rendu.spec.js:220-221` ; mesures `scripts/tests/chargement.mjs:29`. Ce qui casserait : ces tests (références mesurées avec l'ancien modèle, plafond 30 000 triangles et 240 appels), l'atelier des personnages (colonne « actuel »), le repli sans table (le jeu n'aurait plus de modèle). Sans test depuis le 4e : `character.js` hors de son rôle de référence. 17 tests e2e nomment « actuel » (1,8 min cumulées).
**`?sons=ancien`** — code retenu : `js/game/sound-legacy.js` (10 l.), `sound-loader.js:49-80` (`loadLegacy`, `resolveJobs`), `audio.js:14-25,81,177,180` (`legacyMode`), `sound-choice.js:7` ; données `data/game/sounds-legacy.json` (690 l., 14 938 o). Dépendants : `atelier-sons.html` (`js/atelier-sons/main.js:43-47`), `scripts/sons/integrer.mjs` (écrit le fichier), `lister-integres.mjs`, `projection.mjs`, `scene.mjs` ; tests unitaires `sons-integres` (l. 33, 85-110, 247-278, garde-fou), `sons-integres-ambiances:71` (garde-fou), `atelier-sons-hygiene:76-77` (garde-fou), `impact-chair:21,45,133`, assistant `helpers/sons-anciens.js` → `data-sons`, `data-sons-lot3` (garde-fous), `data-annonce-sons`, `core-sound-director` (garde-fou) ; e2e `sons-integres.spec.js:50,213,297`, `jeu-vagues.spec.js:253`, `sons-integres-ambiances.spec.js:129`. Ce qui casserait : ces garde-fous, l'atelier des sons, la génération de `Docs/ref/sons-integres.md`. Sans test depuis le 4e : les scénarios d'`audio-mix.js` et `sound-director.js` avec le pack d'avant.
**`?detail=0`** — retient l'ancien dessin des portes (`world.js:983`), les textures sans `fine`, la scène sans décor léger ni feux ; 9 fichiers de tests (budgets de référence) ; lu par le code des préréglages : rien proposé.
**`?murs=bas`** — retient la seule condition `&& query.get('murs') !== 'bas'` (`main.js:126`) ; le dessin à hauteur basse reste (carte `salle`). Aucun test ; `scripts/tests/chargement.mjs:34` (combinaison `mursBas` : à retirer de la liste, sinon elle mesurerait le défaut) ; commentaires `main.js:79`, `world.js:602,622` ; documentation : `CLAUDE.md` (aucune), `conventions.md:316,386`, `Docs/seed.md` (propriétaire). Valeur inconnue ensuite : défaut, sans erreur.
**`?percee=0`** — retient `main.js:128` (le mur percé reste, `render.json`) ; garde-fou `atelier-retours.spec.js:26` : douteux.

## D. N3 — pages techniques (recommandation par défaut : garder jusqu'au lot 13)
| Page | Octets (page / exclusif) | Ce qui en dépend | Utile aux prochains lots |
|---|---|---|---|
| `carte.html` | 3 465 / 13 066 | `js/carte/main.js`, `map-svg.js` ; `carte.spec.js` (axe, garde-fou), `maps-hygiene`, `data-i18n` | Lot 10 : comparer la carte d'un nouveau monde à son plan (`?labels=1`). |
| `visite.html` | 1 831 / 7 763 | `js/visite/main.js`, `visite.js` ; `atelier-pages`, `atelier-visite` (garde-fous) | Lot 10 : visiter un nouveau monde sans zombie. |
| `ecarts.html` | 2 435 / 16 953 | `js/ecarts/main.js`, `ecarts-svg.js` ; `scripts/modele/rapport.mjs` ; `atelier-pages` | Lot 10 : écarts entre un nouveau modèle et le plan. |
| `sons.html` | 2 432 / 17 365 | `js/sons/main.js` ; `sons-page.spec.js` (garde-fou), `build.test.js` | Lot 8 : écouter les sons de chair et de chute dans le jeu. |
| `atelier-sons.html` | 3 995 / (groupe 63 019) | `js/atelier-sons/*`, `scenes-sons.js`, `sound-cache.js`, `wave-svg.js`, **`sounds-legacy.json`** ; `atelier-sons`, `atelier-scenes`, `sons-integres` | Lot 8 : nouvelles familles de sons. |
| `atelier-choix.html` | 4 266 / (groupe) | même groupe ; `atelier-choix.spec.js` (garde-fou) | Lot 8 : choix du propriétaire. |
| `atelier-interface.html` | 9 194 / (groupe 62 955) | `js/atelier-interface/*`, `ui-mock.js`, `ui-measure.js`, `proto-*.css` ; **`measure-dom.js` et `actuel.js` servent aux garde-fous d'interface du jeu** | Lots 5 (boutique), 7 (menu, réglages), 7c (classement) : maquettes E1, E3 à E6. |
| `interface-retenue.html` | 5 337 / (groupe) | `retenue.js` ; `interface-retenue.spec.js` | Lots 5 et 7 : référence de l'interface choisie. |
| `atelier-personnages.html` | 8 873 / 64 103 | `js/atelier-personnages/*`, `arena.js`, `crowd.js`, **`pose.js`, `character.js`** ; `persos-atelier`, `persos-sang` (garde-fous) | Lot 11 : skins ; lot 8 : sang. |
| `sauvegarde.html` | — | jamais candidate | Lot 7 : remplacée. |
Tout retirer : 39 fichiers, 254 598 o, 5 200 l. (fermeture exclusive) ; 15 fichiers de tests concernés, tous porteurs de garde-fous. `npm run carte` (`plan-vers-monde.mjs`) ne dépend d'aucune page. Liste des pages publiées : `scripts/build.mjs` (lignes `ENTRIES`).

## E. N4 — scripts (hors `scripts/tests/`, `versions/`, `site/`, `perf/`, `assemble.mjs`, `nettoyage/`)
**Candidats** (ni `package.json`, ni CI, ni `Docs/ref/`, ni import ; seulement un bilan) : `scripts/modele/captures.mjs` (2 032 o, 43 l., lot 3g, captures de la visite) ; `scripts/plan-monde.mjs` (2 935 o, 56 l., lot 1b, plan texte de la salle ; source de la zone « etages » de `tests/selection.json:334`) ; `scripts/planche-textures.mjs` (3 566 o, 63 l., lot 1c, planche PNG ; `selection.json:727`) ; `scripts/sons/scene.mjs` (11 847 o, 244 l., lot 3i, scène comparée au pack d'avant ; énumérée par `atelier-sons-hygiene.test.js:98`) ; `scripts/stats-joueur.mjs` (4 906 o, 83 l., lot 2b ; `selection.json:554`). Total 25 286 o, 489 l. ; aucun test ne les lance.
**Gardés** : `package.json` : `build`, `lighthouse`, `serve`, `vendor-three`, `plan-vers-monde` ; documentés dans `Docs/ref/` : `code-sauvegarde`, `economie`, `courbe-vagues`, `diagnostic-planches`, `icone`, `plan-carte`, `planche-sons`, `zones-metriques`, `interface/mesures`, `interface/projection`, `lib/carte-zones`, `modele/*` (sauf `captures`), `personnages/*`, `sons/integrer`, `sons/inventaire`, `sons/lister-integres`, `sons/projection` ; la plupart sont aussi importés par des tests.

## F. N5 — documentation
**Candidat** : `Docs/ref/fusion-3g.md` (4 180 o, 36 l.) : manifeste de fusion du lot 3g dans `lot-4b` (fait) ; cité par aucun fichier hors du bilan du 4b.
**Gardés** : `fusion-3j.md` (cité par `persos-jeu.test.js`), `fusion-3k.md` (`interface-atelier-hygiene.test.js`, `scripts/build.mjs`), `passation-*-4b.md` (sources de `persos-choix.json` et de tests), `interface-actuelle.md`, `personnages-actuels.md`, `sons-actuels.md` (états des lieux d'avant les refontes, cités par d'autres documents gardés : douteux), `tests-chargement.md` et `tests-decisions.modele.md` (outillage des tests, cités par aucun fichier mais rangés avec `Docs/ref/tests-*.md`), les autres (cités par le code, les tests ou `conventions.md`).
Références à des fichiers absents (aucune ne vient de ce lot) : `atelier-interface.md` (`css/proto-d.css`, `interface-atelier-protos.test.js`), `atelier-personnages.md` (`persos-actuels.test.js`, `persos-page.test.js`), `atelier-sons.md` (`atelier-variantes.test.js`), `integration-personnages.md` et `personnages-actuels.md` (`personnages.test.js`) : tests retirés au lot 4e ; `publication-versions.md`, `verification-versions.md` : chemins du site assemblé (normaux).
**A2 — phrases périmées à corriger en B4** (numéros de ligne de l'état fusionné ; les sections « consolidation » sont des copies mot pour mot : la correction y est une note *(Lot 5c : …)* ajoutée en fin de ligne, comme au lot 4g, le texte d'origine restant intact) : `conventions.md:102` (`/lots/lot-N/` et `npm run assemble` de main seul), `:121`, `:144`, `:221` (anciens déclencheurs de `pages.yml`, job `e2e`, job `refresh`), `:142`, `:219` (`npm run assemble` vers `_site/lots/<lot>/` et `_site/lots.json`), `:145` (« site valable sous `/lots/…` »), `:214`, `:283`, `:351` (`Docs/ref/modele-rdc/` : dossier jamais versionné ; l'exception reste dans 6 tests d'hygiène), `:76` (export `activeCount`, supprimé en N1), `:316`, `:386` (`?murs=bas`, retiré en N2) ; `CLAUDE.md:41` (« Docs/ref/modele-rdc/ exclu des 5 Mo » : retiré, la règle reste dans `conventions.md:214` et les tests) et `CLAUDE.md` « Sons : synth.js » (la plupart des sons passent par `synth2.js`, moteur « atelier ») ; autres documents : `atelier-interface.md:17` (`stateById`), `affinage.md:62,69`, `performance.md:21`, `tests-chargement.md:22,41` (`?murs=bas`).
**Phrases périmées (non modifiées en A)** : `conventions.md:121,144,221` (anciens déclencheurs et job `e2e` de `pages.yml`, consolidations des lots 2c à 3c) ; `:142,219` (`npm run assemble` vers `_site/lots/<lot>/` et `_site/lots.json`, périmé depuis le lot 4c) ; `:351` (« Docs/ref/modele-rdc/ exclu des 5 Mo » : dossier jamais versionné, l'exception reste dans `data-ambiance.test.js:216`) ; `CLAUDE.md` (« Tests : … Docs/ref/modele-rdc/ exclu des 5 Mo », même remarque) ; `CLAUDE.md` « Sons : synth.js (sounds.json…) » ne dit pas que la plupart des sons passent par `synth2.js` (moteur « atelier »). Les sections « consolidation » de `conventions.md` sont des copies mot pour mot : à garder telles quelles.

## G. N6 — doublons (liste seulement)
- Formatage `fmt(texte, paramètres)` : 10 copies identiques ou presque (`js/atelier-personnages/main.js`, `atelier-sons`, `carte`, `ecarts`, `sons`, `visite`, `game/texts.js`, `atelier-interface/main.js`, `retenue.js`, `sauvegarde/main.js`) ; `t(clé)` et `$(id)` dans les mêmes pages.
- Garde-types `isObject`/`isObj`/`obj` : ≈ 20 copies dans `js/core/` (dont `character-parts.js`, `pose-v2.js` : lot 5d) ; `clamp` : 10 ; `num` : 11 ; `lerp`, `hash` (`vhs.js` = `wave-splash.js`), `isPoint` (`maps.js` = `zones.js`), `idSet` (`stairs.js` = `zones.js`), `box` (`mobilier-aspect.js` = `portes-aspect.js`), `noise`/`hash` (`texgen.js`, `texgen-persos.js`, `synth2-dsp.js`).
- `STANDING` identique dans `js/atelier-personnages/measures.js` et `scripts/personnages/lib.mjs` ; `parseChoices`/`serializeChoices` dans `js/atelier-interface/choices.js` et `js/core/atelier-choices.js` (même nom, formats différents) ; `formatChrono` (`hud-format.js`, `ui-mock.js`) ; `labelOf`, `isObject` (`js/accueil/home.js`, `scripts/versions/schema.mjs`).
- Scripts : `load` (4 copies), `crc` (`planche-sons.mjs`, `planche-textures.mjs`), `readJson`, `num`, `parseArgs` ; tests : assistants `open`, `STATE`, `walk`, `deepFreeze`, `unlockReady`, `seedStorage` recopiés dans 2 à 7 fichiers.

## H. N7 — dépendances de développement
`@axe-core/playwright` (36 tests e2e), `@eslint/js` et `globals` (`eslint.config.js`), `@playwright/test` (62 fichiers, configuration), `eslint` (`npm run lint`), `lighthouse` (`npx lighthouse` dans `scripts/lighthouse.mjs`), `three` (`npm run vendor:three`, importmap des pages), `vitest` (`npm test`, 131 fichiers) : toutes utilisées, **aucun candidat**.

## I. N8 — douteux (preuve incomplète, jamais proposés)
| Élément | Raison |
|---|---|
| `?perso=actuel`, `js/core/pose.js`, `js/game/character.js` | tests du lot 5d (`persos-animations`, `persos-donnees`, `persos-variantes` par `scripts/personnages/lib.mjs`), garde-fous de budget et d'invariance mesurés avec l'ancien modèle, atelier des personnages, repli sans table (C) |
| `?sons=ancien`, `js/game/sound-legacy.js`, `data/game/sounds-legacy.json` | garde-fous `sons-integres`, `sons-integres-ambiances`, `atelier-sons-hygiene`, `data-sons*`, `core-sound-director` ; atelier des sons ; `integrer.mjs` (C) |
| `?percee=0` | garde-fou `atelier-retours.spec.js:26` |
| 19 sélecteurs (`.p2-hit-a`, `.p2-zone-b`, `.ui3k-dir-a`, `.sol-route`, `.is-playing`, `.is-max`…) | classes construites par des gabarits (`screens.js:197-204`, `view.js:77`, `retenue.js:41`, `js/core/map-svg.js:38`) |
| `--game-repair-panel`, `-ring`, `-track`, `-text` | lus par des noms construits (`--game-repair-…`) |
| 212 clés de texte (`atelier.*`, `ui3k.*`, `dev.persos.*`, `dev.sons.etiquette.*`, `home.channel.*`…) | visées par des préfixes construits ; le garde-fou `data-i18n` contrôle déjà les orphelines |
| `fonts/README.txt` | sans lecteur, mais il dit quelle licence OFL couvre quelle police |
| `Docs/ref/interface-actuelle.md`, `personnages-actuels.md`, `sons-actuels.md` | décrivent l'état d'avant les refontes, cités par des documents gardés |
| `affine` (`character-parts.js:98`) | A : fichier du lot 5d. A2 : jamais importé, mais `poses-identite.test.js:113` (garde-fou du 5d) vérifie que tout export de l'oracle figé `character-parts.oracle.js` (qui définit son propre `affine`) existe dans `character-parts.js` : le retirer casse ce test, et l'oracle est intouchable |
| `js/game/sound-atelier.js`, `data/game/sounds-atelier.json` (`?sons=A|B|C`) | lus par l'atelier et par les tests de sons : à revoir avec les pages au lot 13 |

## J. Gain estimé
| Cat. | Fichiers | Lignes | Octets | Site publié | JS chargés | Tests retirés |
|---|---|---|---|---|---|---|
| N1 | −1 (`.gitkeep`) | ≈ −38 | ≈ −1 790 | 0 fichier, ≈ −1,8 ko | 113 → 113 | 0 |
| N2 | 0 | −1 (plus commentaires) | ≈ −60 | ≈ −35 o | 113 | 0 |
| N4 | −5 | −489 | −25 286 | 0 (scripts non publiés) | 113 | 0 |
| N5 | −1 | −36 | −4 180 | 0 | 113 | 0 |
| N3 (si approuvé malgré la recommandation) | −39 | −5 200 | −254 598 | −39 fichiers, ≈ −255 ko | 113 | 31 fichiers de tests à réécrire ou retirer, dont des garde-fous : à éviter |
