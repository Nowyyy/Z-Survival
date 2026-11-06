# Audit de nettoyage (lots 5c-A et 5c-A2)

Audit A : base `origin/dev` = `d18023c` (lots 5a et 5b), 5 novembre 2026. **Audit rafraîchi (A2)** : `origin/dev` = `20fa5c5` (lot 5d fusionné) intégré à `lot-5c` par le commit de fusion `c3a4379`, 6 novembre 2026, conteneur à 4 cœurs. Outil : `node scripts/nettoyage/auditer.mjs [--json <chemin hors dépôt>] [--court]` (Node natif, aucune dépendance, n'écrit rien dans le dépôt). Tableaux complets et preuves : `Docs/ref/nettoyage-audit-annexe.md`. Décisions du propriétaire : `Docs/ref/nettoyage-decisions.md` (`STATUT: VALIDE`). **Rien n'est supprimé en partie A ; aucun comportement du jeu ne change.**

## Rafraîchissement A2 (état fusionné `c3a4379`, avant toute suppression)
| Mesure | Valeur (A2) | Écart avec A |
|---|---|---|
| Fichiers suivis | 633 (js 164, css 16, data 55, scripts 77, tests 208, Docs 73, dev 2, fonts 8, vendor 5, 12 pages et `jeu.html`…) | +17 (lot 5d : oracles, harnais, tests d'identité, bilan) |
| Lignes | js 29 544 · css 4 888 · data 37 772 · scripts 8 157 · tests 42 968 · Docs 5 304 · pages 1 026 | js +585, scripts +923, tests +2 185 |
| `npm run build` | `_site/` : 263 fichiers, 5 328 665 o | +27 222 o |
| Site assemblé (`scripts/site/local.mjs --no-install`) | 929 fichiers, 21 588 359 o ; racine 267 fichiers, 5 332 295 o ; `next/` 265, 5 330 609 o | `next/` = `dev` 5d |
| JavaScript chargé par `jeu.html?test=1&seed=1` | 113 URL `.js`, aucune ressource en erreur ; ni `pose.js`, ni `character.js`, ni `sound-legacy.js` | = |
| `npm test` | 132 fichiers, 6 871 tests (6 861 réussis, 10 ignorés), 66 s | +3 fichiers, +30 tests |
| `npm run test:standard` | 1 021 s : lint 7,5 s, Vitest 63,2 s, Playwright 948,9 s (333 tests réussis ; fumée et 14 fichiers : rejeu total, `tests/selection.json` modifié par la partie A) | — |
| Appels / triangles (`budget-instant.mjs`) | eleve R1 62/38 479, R2 61/38 577, U1 67/39 635, U4 77/40 397 ; moyen 60/23 867, 59/23 965, 65/25 023, 75/25 785 ; faible 42/19 253, 42/19 351, 46/19 619, 54/20 377 | identiques |
| Six vues (`vues.mjs`) | R1 0,2195/419 · R2 0,2263/393 · U1 0,2144/224 · U4 0,2215/365 · voiture 0,2000/210 · hélico 0,2228/138 | identiques |
| Empreintes `trace-logique.mjs` (600 pas, finale / chaîne, 16 premiers caractères) | 1 `7e5fed6a1bcf6457`/`42afea80daaa3bbe` · 2 `3cab05cf38810eb6`/`00b7b38f31552fb3` · 3 `4b78adcd92477b6f`/`e5af31ead2954076` · 4 `dde468cb9e7f2fe7`/`f87dc57dd273be87` · 5 `42056a4014538ada`/`dc4e72e69f078252` · 6 `8a17408c5401a78a`/`c9e42519963901cd` | nouvelle référence (harnais du 5d) |
| Même harnais avec `--os` (exécution séparée) | 1 `7e5fed6a…` · 2 `3cab05cf…` · 3 `327e7ca1ff2fee1a` · 4 `dde468cb…` · 5 `42056a40…` · 6 `8a17408c…` ; os 38 à 209 par point | référence des matrices d'os |
| Lighthouse mobile `jeu.html` (5 passes) | 55, 38, 55, 55, 55 : **médiane 55** ; CLS 0,0016 | information seulement |

**Candidats après le lot 5d** : N1 inchangé (13 exports, 2 jetons, `tests/e2e/.gitkeep`). **`affine`** (`character-parts.js:98`) n'est plus réservé, mais reste **douteux** : `tests/unit/poses-identite.test.js:113` (garde-fou du 5d) exige que chaque export de l'oracle figé `tests/unit/helpers/oracle/character-parts.oracle.js` (intouchable) existe dans `character-parts.js` (accès calculé par `Object.keys` et `in`) ; le retirer casserait ce test : **non appliqué**. Les trois fichiers du 5d (`collision.js`, `pose-v2.js`, `character-parts.js`) n'ont aucun autre export mort. L'outil relève désormais ces accès calculés (`import * as X` puis `Object.keys(X)`, `k in X`, `X[k]`) : `atelier-analyse`, `collision-identite`, `lots`, `poses-identite` ; aucun des 13 exports de N1 n'est concerné. N2, N4, N5 : inchangés ; seuls les éléments approuvés par les décisions sont appliqués en partie B (N4 : 3 scripts sur 5 ; `planche-textures.mjs` et `stats-joueur.mjs` gardés). Aucun candidat nouveau. Phrases périmées (N5) : voir l'annexe F (numéros de ligne de l'état fusionné). Corrections de l'outil : liste des fichiers du 5d vidée (oracles « jamais candidats »), documents de l'audit ignorés sans plantage.

## Audit A (base `d18023c`, conservé pour comparaison)

## Étape 0 — refontes, compatibilité, graphe
1. Moteur 2D d'origine → Three.js (lot 1m) : le moteur 2D est parti ; il reste la salle du lot 1m (`world.json`, `decor.json`, `?map=salle`, `?empty=1`) : jamais candidate.
2. Ancien modèle de personnages : `js/core/pose.js` et `js/game/character.js` (434 lignes), importés si un personnage est « actuel » : `?perso=actuel`, ou repli quand `persos-choix.json` manque ou nomme une variante inconnue.
3. Ancien moteur de sons : `synth.js` reste le moteur des tirs, de la mélodie, des annonces, des impacts de décor et de l'interface ; seul le « pack d'avant » est mort en jeu (`sounds-legacy.json`, `sound-legacy.js`, `?sons=ancien`).
4. Anciennes textures : `?detail=0` (genres sans l'option `fine`, anciens blocs de portes, sans décor léger ni feux) ; le rendu « non fin » sert aussi au préréglage Faible.
5. Pages d'ateliers (lots 3g, 3h, 3j, 3k) : 9 pages techniques, plus `sauvegarde.html` (jamais candidate) ; `seed.md` les fait retirer au lot 13.
6. Compatibilité : `?perso=actuel`, `?sons=ancien`, `?detail=0`, `?murs=bas`, `?percee=0`, `?map=salle`, `?empty=1`.
7. Préréglages : `graphics.json` (personnages `A` ou `choix`, sang, VHS, ombres, `dprMax`, `texturesFines`, `decor`) ; code : `explicitParams` (`js/core/graphics.js:139-157` : `perso`, `sang`, `usure`, `detail`, `vhs`, `shadows`, `dpr`), `settingsFor` (`:160-194`), `presetSearch` (`:198-213`), `graphics-boot.js:15` (`gfx`).
8. Donc `?detail=`, `?vhs=`, `?shadows=`, `?dpr=` : **rien n'est proposé** (règle du lot). La valeur `actuel` n'est qu'acceptée par `PERSO_LOADS` (`graphics.js:11`) : aucun préréglage ne la choisit.
9. Graphe : `scripts/tests/lib/graphe.mjs` (imports statiques et dynamiques, `new URL`, chaînes `data/…json` et `css/…css`, `src`, `href` et importmap des pages), complété par l'outil : `url()` des CSS, chemins cités par les scripts et les tests, liens vers les pages.
10. « Dynamique » ici : `fetch`/`loadJson` à argument variable (enveloppes appelées avec des littéraux), gabarits `${mapDir}/…json`, `data/game/maps/${id}/…`, `${DIR}/…` (écarts), `${base}data/i18n/${lang}.json`, clés `` `game.gfx.${id}` ``, classes `` `p2-hit-${v}` ``, jetons `--game-${name}` (`palette.js`), énumérations `readdirSync` des tests. Aucun `import()` à argument variable dans `js/`, aucun accès calculé aux exports d'un module.
11. 568 constructions relevées (289 gabarits, 209 `readFileSync` de scripts et de tests, 23 `new URL`…) ; aucune ne vise un candidat proposé, sauf l'énumération de `scripts/sons/` (`atelier-sons-hygiene.test.js:98`), qui ne casse pas quand un fichier disparaît.
12. Réservés au lot 5d : `js/core/collision.js`, `pose-v2.js`, `character-parts.js` et les 16 fichiers de tests qui les importent (dont `persos-animations`, `persos-donnees`, `persos-variantes`, `lot1-regles`, `core-collision`).
13. Conséquence : `pose.js` est importé par `persos-animations.test.js` (lot 5d et garde-fou) ; `scripts/personnages/lib.mjs`, lu par 5 tests de personnages, importe aussi `pose.js`.
14. Le code « sans test » du lot 4e (`pose.js`, `character.js`, `?sons=ancien`, `?detail=0`) sert encore de **référence** à des garde-fous (budgets mesurés avec `&perso=actuel&sang=0&detail=0`, mur percé mesuré avec `&percee=0`).

## Références (avant toute modification, `origin/dev`)
| Mesure | Valeur |
|---|---|
| Fichiers suivis | 616 (js 164, css 16, data 55, scripts 74, tests 198, Docs 69, dev 2, fonts 8, vendor 5, 13 pages) |
| Lignes | js 28 959 · css 4 888 · data 37 768 · scripts 7 234 · tests 40 783 · Docs 4 890 · pages 1 026 |
| `npm run build` | `_site/` : 263 fichiers, 5 301 443 o |
| Site assemblé (`scripts/site/local.mjs --no-install`) | 929 fichiers, 21 533 915 o ; racine 266 fichiers, 5 305 073 o ; `next/` 265, 5 303 387 o |
| JavaScript chargé par `jeu.html` | 113 URL `.js` (114 avec `?fps=1`) ; le bilan du 5b disait 109 / 110 : ma mesure compte aussi les 2 fichiers de Three.js et le calculateur `sound-worker.js` |
| Paramètres d'URL | 31 (tableau C de l'annexe) |
| `npm test` | 129 fichiers, 6 841 tests (6 831 réussis, 10 ignorés), 81 s |
| `npm run test:standard` | 81 s (lint 7,5 s, Vitest 72,9 s ; aucun Playwright : rien de modifié) |
| Appels / triangles (`budget-instant.mjs`, ×2) | eleve R1 62/38 479, R2 61/38 577, U1 67/39 635, U4 77/40 397 ; moyen 60/23 867, 59/23 965, 65/25 023, 75/25 785 ; faible 42/19 253, 42/19 351, 46/19 619, 54/20 377 |
| Six vues (`vues.mjs`, luminance / couleurs) | R1 0,2195/419 · R2 0,2263/393 · U1 0,2144/224 · U4 0,2215/365 · voiture 0,2000/210 · hélico 0,2228/138 |
| Lighthouse mobile `jeu.html` (5 passes) | 34, 55, 55, 55, 55 : **médiane 55** ; CLS 0,0016 |
| `getState()` logique, graine 1, `wave=3`, 600 pas (copie `git worktree`) | empreinte `b2d813cc77707d0a` par défaut et sous `?gfx=faible` (7 zombies, 1 tué, t = 30 s) |

## Catégories (détail par candidat : annexe)
| Cat. | Candidats proposés | Octets | Lignes | Tests concernés | Risque | Recommandation |
|---|---|---|---|---|---|---|
| N1 | 13 exports morts (`runArena`, `activeCount`, `NATURES`, `ACTIONS`, `zombieSolidsOn`, `floorOfEnemy`, `gapToAll`, `MODES`, `LAYER_TYPES`, `EDGE`, `levelDbOf`, `stateById`, `screenPoint`), jetons `--space-8`, `--duration-normal`, `tests/e2e/.gitkeep` | ≈ 1 790 | ≈ 38 | aucun | faible | APPROUVER |
| N2 | `?murs=bas` (une condition de `js/game/main.js:126`, commentaires, combinaison `mursBas` de `scripts/tests/chargement.mjs:34`) | ≈ 60 | 1 | aucun | faible | APPROUVER |
| N3 | aucun (9 pages : garder jusqu'au lot 13) | (254 598 si tout) | (5 200) | 15 fichiers, tous avec des garde-fous | élevé | REFUSER |
| N4 | `scripts/modele/captures.mjs`, `plan-monde.mjs`, `planche-textures.mjs`, `scripts/sons/scene.mjs`, `stats-joueur.mjs` | 25 286 | 489 | aucun (3 listés comme sources dans `tests/selection.json`) | faible | au choix (outils ponctuels des lots 1b, 1c, 2b, 3g, 3i) |
| N5 | `Docs/ref/fusion-3g.md` (manifeste de fusion du lot 4b, cité par aucun fichier hors bilans) ; phrases périmées listées, non modifiées | 4 180 | 36 | aucun | nul | APPROUVER |
| N6 | liste seulement (annexe G) | — | — | — | — | rien à supprimer |
| N7 | aucun : les 8 paquets sont importés ou appelés | 0 | 0 | — | — | rien |
| N8 | douteux (ci-dessous) | — | — | — | — | garder |

**Gain estimé si N1, N2, N4, N5 sont approuvés** : 7 fichiers suivis en moins (616 → 609, sans compter les 4 ajoutés par ce lot), ≈ 560 lignes, ≈ 31 ko ; site publié : 0 fichier, ≈ −1,8 ko (seuls les exports de `js/` et les jetons sont publiés) ; JavaScript chargé par défaut : 113 → 113 ; tests retirés : 0 (0 min d'après `tests/budget-mesure.json`). Rendu, logique et Lighthouse : inchangés par construction (code jamais appelé).

## Douteux (N8) — preuve incomplète, non proposés
- **`?perso=actuel`, `pose.js`, `character.js`** (434 l., 20 291 o, plus l'aiguillage de `persos-loader.js`, `persos-params.js`, `persos-runtime.js`, `character-v2.js` et `game.js`) : `pose.js` importé par `persos-animations.test.js` et `scripts/personnages/lib.mjs` (tests du lot 5d) ; garde-fous mesurés avec `&perso=actuel&sang=0` (budgets de `atelier-carte`, `atelier-detail`, `argent` : plafond 30 000 / 240 de l'ancien modèle ; invariance de `persos-jeu` ; `persos-integres`) ; comparaison « actuel » d'`atelier-personnages.html` ; repli du chargeur sans table. Le retirer demande de remesurer ces références (lot à part, après le 5d).
- **`?sons=ancien`, `sound-legacy.js`, `sounds-legacy.json`** (700 l., 14 948 o) : garde-fous `sons-integres.test.js` (l. 33, 85-110, 247-278 : import dynamique exigé), `sons-integres-ambiances.test.js:71`, `atelier-sons-hygiene.test.js:76`, `data-sons*.test.js` (assistant `sons-anciens.js`) ; `atelier-sons.html` compare à ces recettes ; `scripts/sons/integrer.mjs` écrit le fichier. Même la seule partie « jeu » (≈ 45 l.) touche un garde-fou.
- **`?percee=0`** : garde-fou `atelier-retours.spec.js:26` (« aucun matériau transparent ») le prend pour référence.
- **Pages techniques** : `measure-dom.js` et `actuel.js` de l'atelier de l'interface servent aux garde-fous d'interface du jeu (`graphismes.spec.js`, contrastes, 44 px).
- 19 sélecteurs CSS, 4 jetons `--game-repair-*`, 212 clés de texte sans usage littéral : tous visés par un préfixe dynamique ; `fonts/README.txt` (licences OFL des polices) ; `Docs/ref/interface-actuelle.md`, `personnages-actuels.md`, `sons-actuels.md`, `fusion-3j.md`, `fusion-3k.md` (cités par d'autres documents ou par des garde-fous) ; `affine` de `character-parts.js` (mort dans le code, mais lu par `poses-identite.test.js:113` qui compare les exports à l'oracle figé : A2).
- Hors candidature : 231 exports utilisés seulement par des tests, 153 exports utilisés seulement dans leur fichier (code vivant).

## Recommandation
Approuver N1, N2, N5 ; N4 selon l'usage du propriétaire (outils jamais appelés depuis leur lot, aucun test) ; refuser N3 (garder les pages jusqu'au lot 13) ; N6 et N7 : rien. `?perso=actuel` et `?sons=ancien` : **ne pas les supprimer dans ce lot** (preuve incomplète) ; les rouvrir après le lot 5d dans un lot qui remesure les références des garde-fous. Partie B : rejouer la preuve, un commit par catégorie . Seule modification hors des quatre fichiers ajoutés : `scripts/nettoyage/**` rangé dans la zone « outillage-tests » de `tests/selection.json` (exigé par le test de la table, `tests-selection.test.js`).
