# Audit des tests (lot 4e-A)

Mesures du 2 au 3 novembre 2026 sur `lot-4e` (base `origin/dev` = `f6b744a`), conteneur à 4 cœurs, Chromium préinstallé, 2 workers Playwright, aucun rejeu (`retries` vaut 0 hors CI). Outils : `scripts/tests/mesurer.mjs` (mesure, sorties hors dépôt), `scripts/tests/resumer.mjs` (annexe), `scripts/tests/classement.json` (classement). Annexe détaillée : `Docs/ref/tests-audit-annexe.md`. **Rien n'a été retiré ni regroupé.**

## Étape 0 — ce qui tourne, où, quand
1. CI (`pages.yml`) : seulement sur push de `main` ou `dev` (et lancement manuel) ; ni PR ni `lot-*` (CLAUDE.md dit encore le contraire).
2. Job `quick` à chaque push : `npm ci`, `npm run lint`, `npm test` (Vitest complet) ; le déploiement n'attend que lui.
3. Job `e2e` sur `dev` seulement : suite rapide Playwright en 4 tranches (`--shard`), `CI=true` donc 1 rejeu ; rapport téléversé en cas d'échec.
4. Suite complète (`npm run test:e2e:full`, `E2E_FULL=1`) : jamais en CI, seulement à la demande (sessions d'agent, fin de lot).
5. Session d'agent : lint, Vitest, suite rapide à chaque partie ; suite complète en fin de lot (1,1 à 1,6 h selon les bilans).
6. Lighthouse et `scripts/sons/*` : à la demande seulement.
7. Suite rapide : projet `bureau` (1440×900) sur 11 fichiers `ESSENTIAL`, projet `mobile` (Pixel 5, 375×812, DPR 2,75) sur 4 fichiers `PAGES`.
8. Suite complète : les 46 fichiers e2e sur les deux projets (431 exécutions ignorées par `test.skip` selon le projet).
9. `tests/unit/` : 140 fichiers, 7 578 tests (Vitest, Node, délai 30 s) ; `tests/e2e/` : 46 fichiers + `helpers.js`.
10. Suite rapide : 358 exécutions (bureau 286, mobile 72) ; suite complète : 2 064 exécutions, 1 633 jouées.
11. Lenteur n° 1 : le chargement de `jeu.html` (Three.js, textures, sons) coûte 3,5 à 4 s en bureau, 5 à 5,5 s en mobile (10e centile des tests à un seul chargement).
12. La suite complète charge 1 729 pages, dont 1 351 fois le jeu ; la suite rapide en charge 365, dont 201 fois le jeu. La plupart des tests rechargent le jeu pour une seule vérification.
13. Lenteur n° 2 : le rendu logiciel en mobile (DPR 2,75) est 1,5 à 2,5 fois plus lent qu'en bureau ; les sons du jeu sont calculés à chaque chargement, d'où 15 à 54 s pour un test de son en mobile.
14. Lenteur n° 3 : des attentes réelles (21 `waitForTimeout`, 17,6 s par projet) et des `expect.poll` sur `audio.ready`, avec un délai par test de 60 s.

## Durées mesurées
| Étape | Durée réelle | Somme des tests | Résultat |
|---|---|---|---|
| Lint | 7,5 s | — | propre |
| Vitest | 81 s (63 s au second passage) | 172 s | 7 566 réussis, 11 ignorés, 1 échec (environnement, voir plus bas) |
| Suite rapide | 11,5 min | 22,6 min | 358/358 |
| Suite complète | 81,2 min | 161,6 min | 1 632 réussis, 431 ignorés, 1 échec (`jeu-voix:107`) |

## Proposition par catégorie (suite complète ; minutes réelles ≈ somme / 2 avec 2 workers)
| Cat. | Exécutions e2e (complète / rapide) | Somme (complète / rapide) | Gain réel si appliqué | Recommandation | Risque | Décision |
|---|---|---|---|---|---|---|
| G | 688 / 294 + 2 133 Vitest | 60,4 / 17,5 min | 0 (on peut accélérer ou regrouper) | garder | — | aucune |
| P | 74 + 4 370 Vitest | 9,1 min | 0 | garder | — | aucune |
| D | 276 / 0 | 44,8 min | ≈ 22 min (28 %) | règles en bureau seulement ; G et P gardés en mobile | une différence propre au mobile (toucher, DPR, mise en page) dans une règle de jeu | APPROUVE ou REFUSE |
| R | 263 / 15 | 25,8 / 1,3 min | ≈ 13 min (16 %) ; rapide 0,6 min (6 %) | palier complet (pas de retrait) ; à retirer, on perd le câblage rendu ↔ logique | régression d'intégration détectée au palier complet seulement | APPROUVE ou REFUSE |
| F | 93 / 22 | 8,2 / 2,4 min | ≈ 4 min (5 %) ; rapide 1,2 min (11 %) | palier complet ou retrait | un détail visuel ou de comportement (mur percé, portes, 3D) | APPROUVE ou REFUSE |
| T | 169 / 20 + 715 Vitest | 4,8 / 1,0 min + 49 s | ≈ 2,5 min (3 %) ; rapide 0,5 min (4 %) | retirer sauf axe (axe = G, gardé) | pages techniques non protégées jusqu'au lot 13 | APPROUVE ou REFUSE |
| L | 38 / 7 + 187 Vitest | 3,4 / 0,4 min | ≈ 1,7 min (2 %) | retirer ; le code reste (`?perso=actuel`, `?sons=ancien`, salle, `?detail=0`) | l'ancien code peut casser sans alerte | APPROUVE ou REFUSE |
| V | 12 + 149 Vitest | 0,8 min + 1,6 s | < 0,5 min | corriger (tolérances) plutôt que retirer | — | APPROUVE ou REFUSE |
| I | 12 + 16 Vitest | 1,1 min + 3,2 s | ≈ 0,6 min | étiqueter `@instable` (hors palier standard) ; les garde-fous restent | intermittents masqués | APPROUVE ou REFUSE |
| E | 8 | 3,2 min | fiabilité, pas de temps | corriger 2 tests faux ; ambiances mobile au palier complet | — | APPROUVE ou REFUSE |

**Totaux** :
- **Retirer** ou sortir du palier standard D, R, F, T, L et V : 87,8 min de somme sur 161,6, soit la suite complète de 81 à ≈ 37 min (−54 %). La suite rapide passe de 11,5 à ≈ 9 min (−23 % : R, F, T, L ; le reste est G). Vitest : −20 s environ.
- **Regrouper** les fichiers qui rechargent le jeu (même page pour les tests d'un `describe`, remise à zéro par `window.__zs`) : environ 60 % des chargements du jeu évitables.
  - Suite rapide : −100 chargements, soit ≈ −3 min (−25 %).
  - Suite complète : −800 chargements, soit ≈ −30 min (−37 %).
  - Ce gain ne s'ajoute pas tout à fait à celui des retraits (en partie sur les mêmes fichiers).
- **Ne rejouer que le concerné** : sur les 30 derniers commits, 2 sont de documentation seule et 11 ne touchent ni le jeu ni ses pages (`tests/`, `scripts/`, `data/changelog.json`, `apercu.txt`). Pour ces 13 commits, lint, Vitest et 0 à 2 fichiers e2e suffisent, soit ≈ 2 min au lieu de 13. Les 17 autres touchent le jeu (8 ciblés, 9 larges) et rejouent le palier standard. Sur ces 30 commits, le gain est d'environ −37 % du temps à chaque push (390 → 250 min).

## Autres leviers (chiffrés, non appliqués)
- **Regroupables** (plus de 5 chargements identiques ; 71 couples fichier × projet, liste dans l'annexe) : en rapide `argent` (57, 5,5 min de somme), `persos-integres` (48), `interface-integree` (43), `jeu-interface` (18), `atelier-retours` (13) ; en complète aussi `etage` (56 × 2 projets, 14,6 min), `jeu-ambiance` (45 × 2), `carte-jeu`, `jeu-fenetres` (36 × 2), `jeu-zones` (34 × 2), `persos-jeu` (48).
- **Attentes réelles** : 21 `waitForTimeout` (17,6 s par projet) et des `expect.poll` sur le calcul des sons (jusqu'à 60 s) ; à remplacer par `step()` et le journal là où la logique le permet.
- **Projets superposés** : en complète, bureau 82,8 min et mobile 78,8 min de somme pour des tests en grande partie identiques (voir D) ; en rapide, le mobile ne fait que 1,4 min (pages seulement).
- **`workers` et `retries`** : 2 workers par défaut en local (4 cœurs), 3 à essayer (risque : délai de 60 s dépassé en mobile) ; `retries: 1` en CI masque les intermittents : garder, mais compter les « instables ».
- **Cache** : npm déjà en cache (`setup-node`), Chrome du runner (`channel`) sans téléchargement ; rien d'autre sans dépendance nouvelle.
- **Déclenchements inutiles** : un push de documentation seule sur `dev` relance Vitest et les 4 tranches e2e ; les déclencheurs de `pages.yml` sont interdits, un `tests.yml` dédié (partie B) peut filtrer par chemins.
- **`--shard`** : la rapide est déjà en 4 tranches sur `dev` ; la complète (81 min, 2 workers) tiendrait en ≈ 4 × 20 min, mais elle n'est pas en CI.

## Échecs hérités (E) et instables (I) : diagnostic
- **`jeu-sons:93` « M et le bouton Son coupent »** : **test faux, jeu correct.** Depuis le lot 3i, le journal note début et arrêt des boucles (`ambiance-vent`, `loop: true`) sans champ `muted` ; la coupure arrête bien les boucles et met le gain à 0 (`toggleMute` d'`audio.js`). Échoue 3/3 seul, passe sous charge (boucle pas encore lancée). Correctif : ignorer les entrées `loop`.
- **`jeu-voix:107` « derrière un mur, étouffé »** (I au 4b) : **même cause, test faux** (l'entrée de boucle n'a pas de `lowpass`) ; seul échec de la complète du 4e (bureau) ; reclassé E.
- **`sons-integres-ambiances` × 3 (mobile)** : **non reproduits** (complète, puis 3 passes isolées : 30 sur 30) ; 25 à 54 s en mobile pour un plafond de 60 s : sensibles à la charge, jeu non fautif. Palier complet seulement, ou regroupés (un seul chargement).
- **Vitest `persos-jeu` « données de logique inchangées »** : **environnement.** `origin/lot-4b` n'existe plus, la comparaison retombe sur la branche locale `main` restée au lot 3 (`4b3f41c`) ; contre `origin/main`, aucune différence. Garde-fou : à corriger (comparer à `origin/main`), jamais à retirer.
- **Autres I**, tous verts ici : `atelier-retours:60` (mobile), `interface-atelier-ecrans:145`, axe à 1440×900, `core-monde-ia`, pose des zombies.

## Idées (hors périmètre)
- CLAUDE.md décrit des déclencheurs de CI (PR, `lot-*`) que `pages.yml` n'a plus : au propriétaire de le corriger (fichier interdit ici).
- Mettre en cache le calcul des sons entre deux chargements, côté jeu, accélérerait tous les tests de son (code du jeu interdit ici).
