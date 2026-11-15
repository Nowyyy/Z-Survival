# Audits, plans et relevés terminés (V0.4 à V0.7), archivés au lot 8l

> Fiches terminées de `Docs/ref/` (audits, plans, relevés d'anciens lots), regroupées par `scripts/docs/archiver-ref.mjs` et recopiées **mot pour mot** (aucune modification). Chaque fiche est encadrée par deux commentaires ; le premier donne son ancien fichier, sa taille en octets et l'empreinte SHA-256 de son texte. Les chemins qu'elles citent sont ceux de leur époque. Renvoi : `<ce fichier>#<nom>`.

## Sommaire

- [tests-audit — Audit des tests (lot 4e-A)](#tests-audit) (ancien fichier `Docs/ref/tests-audit.md`)
- [tests-decisions.modele](#tests-decisions.modele) (ancien fichier `Docs/ref/tests-decisions.modele.md`)
- [tests-chargement — Décomposition du chargement du jeu dans les tests (lot 4f-A)](#tests-chargement) (ancien fichier `Docs/ref/tests-chargement.md`)
- [tests-allegement-audit — Lot 5n-A — Audit des tests déclenchés sur `dev` et sur `main` (lecture seule)](#tests-allegement-audit) (ancien fichier `Docs/ref/tests-allegement-audit.md`)
- [tests-allegement-decisions](#tests-allegement-decisions) (ancien fichier `Docs/ref/tests-allegement-decisions.md`)
- [tests-allegement-decisions.modele](#tests-allegement-decisions.modele) (ancien fichier `Docs/ref/tests-allegement-decisions.modele.md`)
- [nettoyage-audit-annexe — Audit de nettoyage — annexe (lots 5c-A et 5c-A2)](#nettoyage-audit-annexe) (ancien fichier `Docs/ref/nettoyage-audit-annexe.md`)
- [nettoyage-decisions](#nettoyage-decisions) (ancien fichier `Docs/ref/nettoyage-decisions.md`)
- [nettoyage-docs-decisions.modele](#nettoyage-docs-decisions.modele) (ancien fichier `Docs/ref/nettoyage-docs-decisions.modele.md`)
- [nettoyage-plan-ancien — Plan de retrait de l'ancien modèle de personnages et de l'ancien pack de sons (lot 5e-C1)](#nettoyage-plan-ancien) (ancien fichier `Docs/ref/nettoyage-plan-ancien.md`)
- [nettoyage-plan-ancien-decisions](#nettoyage-plan-ancien-decisions) (ancien fichier `Docs/ref/nettoyage-plan-ancien-decisions.md`)
- [docs-audit — Audit de la documentation (lot 5m-A)](#docs-audit) (ancien fichier `Docs/ref/docs-audit.md`)
- [docs-audit-annexe — Audit de la documentation — annexe (lot 5m-A, sortie de scripts/docs/auditer.mjs)](#docs-audit-annexe) (ancien fichier `Docs/ref/docs-audit-annexe.md`)
- [branches-audit — Audit des branches (lot 5m-A)](#branches-audit) (ancien fichier `Docs/ref/branches-audit.md`)
- [interface-actuelle — Interface actuelle : état des lieux mesuré (lot 3k-A)](#interface-actuelle) (ancien fichier `Docs/ref/interface-actuelle.md`)
- [personnages-actuels — Personnages actuels : état des lieux mesuré (lot 3j-A)](#personnages-actuels) (ancien fichier `Docs/ref/personnages-actuels.md`)
- [integration-sons — Intégration des sons de l'atelier (plan pour le lot 3i)](#integration-sons) (ancien fichier `Docs/ref/integration-sons.md`)
- [atelier-interface — Atelier de l'interface (lot 3k)](#atelier-interface) (ancien fichier `Docs/ref/atelier-interface.md`)
- [atelier-personnages — Atelier des personnages (lot 3j)](#atelier-personnages) (ancien fichier `Docs/ref/atelier-personnages.md`)
- [verification-versions — Vérification des versions archivées (lot 4c-B)](#verification-versions) (ancien fichier `Docs/ref/verification-versions.md`)
- [versions-correspondance — Correspondance des versions (lot 4c-A)](#versions-correspondance) (ancien fichier `Docs/ref/versions-correspondance.md`)

<a id="tests-audit"></a>
<!-- fiche: tests-audit | ancien: Docs/ref/tests-audit.md | octets: 9250 | sha256: fca7000ffc8efcedebe5ae05e753724e4001bcb938e13ae0e0c879207d0e8a13 -->
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

<!-- fin de la fiche: tests-audit -->

<a id="tests-decisions.modele"></a>
<!-- fiche: tests-decisions.modele | ancien: Docs/ref/tests-decisions.modele.md | octets: 365 | sha256: d958007d05cbe61f5bbfd640e5f35294c2c3978d36a1e48baad1db1b456670bc -->
STATUT: A REMPLIR            (le propriétaire met STATUT: VALIDE quand il a fini)
## Catégories (écrire APPROUVE ou REFUSE ; vide = REFUSE)
R: 
V: 
L: 
T: 
I: 
E: 
F: 
D: 
Regroupements: 
## Exceptions par fichier (un par ligne : chemin | garder / retirer / palier-complet | raison)
## Objectifs de durée (minutes ; défauts : avant commit 2, à chaque push 8)

<!-- fin de la fiche: tests-decisions.modele -->

<a id="tests-chargement"></a>
<!-- fiche: tests-chargement | ancien: Docs/ref/tests-chargement.md | octets: 5551 | sha256: 5268bfeb383d34f86e5d27821e5515115e01ca65fa7def1b6a104b46cab22930 -->
# Décomposition du chargement du jeu dans les tests (lot 4f-A)

Mesure locale (4 cœurs, Chromium préinstallé, rendu logiciel), `node scripts/tests/chargement.mjs` : `jeu.html?test=1&seed=1` puis des **paramètres existants** ajoutés un à un (relevés dans `js/game/main.js`, `persos-params.js`, `sound-loader.js` et `Docs/ref/conventions.md`). Chaque combinaison : **5 chargements**, chacun dans un contexte neuf (cache vide, comme un test Playwright), un seul à la fois, paysage 667×375 (en portrait 375×812, le jeu ne lance pas la partie : la mesure mobile attend sans fin). Aucun code du jeu modifié.
- **hook** : `window.__zs` défini (temps de la page depuis le début de la navigation) ; **prêt** : premier pas de simulation (`getState().time > 0,05`, critère de `waitReady` dans `tests/e2e/helpers.js`) ; **total** : de `page.goto` à « prêt », vu de Playwright. Dispersion : min–max et écart interquartile (EIQ) de « prêt ».
- **Bruit** : deux séries « défaut » du même jour donnent 4 256 et 3 871 ms en bureau : un gain de moins de 250 ms n'est pas significatif.
- Avant « hook » (≈ 3,2 à 3,8 s), le jeu calcule les textures et les sons essentiels derrière l'écran de préparation : c'est l'essentiel du coût, et aucun paramètre ne le supprime.

## Bureau (projet `bureau`, 667×375, DPR 1)
| Combinaison | Paramètres | hook (ms) | prêt (ms, min–max, EIQ) | total (ms) | gain |
|---|---|---|---|---|---|
| défaut | — | 3 550 | 4 096 (3 852–4 341, 259) | 4 256 | — |
| vhs0 | `vhs=0` | 3 594 | 4 052 (3 874–4 232, 255) | 4 162 | 94 (bruit) |
| shadows0 | `shadows=0` | 3 453 | 3 695 (3 592–3 734, 116) | 3 714 | **542** |
| dpr1 | `dpr=1` | 3 517 | 4 002 (3 739–4 150, 20) | 4 014 | 242 (bruit : DPR déjà 1) |
| sang0 | `sang=0` | 3 416 | 3 916 (3 723–4 107, 195) | 4 024 | 232 |
| sonsAncien (retirée au lot 5e) | `sons=ancien` | 3 523 | 3 914 (3 808–4 321, 206) | 4 179 | 77 |
| persoActuel (retirée au lot 5e) | `perso=actuel` | 3 366 | 3 653 (3 185–3 845, 205) | 3 655 | 601 |
| detail0 | `detail=0` | 2 856 | 3 345 (3 089–3 394, 165) | 3 391 | **865** |
| fps1 | `fps=1` | 3 431 | 3 819 (3 733–3 942, 70) | 3 995 | 261 (bruit) |
| nospawn1 | `nospawn=1` | 3 627 | 4 079 (3 763–4 151, 197) | 4 100 | 156 |
| empty1 | `empty=1` | 3 171 | 3 395 (3 076–3 515, 40) | 3 432 | 824 |
| mursBas (retirée au lot 5c) | `murs=bas` | 3 315 | 3 719 (3 653–3 800, 54) | 3 851 | 405 |
| rapide | `vhs=0&shadows=0&dpr=1&sang=0&nospawn=1` | 3 336 | 3 699 (3 498–3 796, 121) | 3 725 | 531 |
| rapideDetail0 | rapide + `detail=0` | 2 878 | 3 219 (2 908–3 264, 126) | 3 235 | **1 021 (−24 %)** |
| rendu (2ᵉ série) | `vhs=0&shadows=0&dpr=1` | 3 157 | 3 549 (3 416–3 786, 200) | 3 625 | 246 (défaut de la série : 3 871) |

## Mobile (projet `mobile` : Pixel 5, DPR 2,75, tactile, 667×375)
| Combinaison | hook (ms) | prêt (ms, min–max, EIQ) | total (ms) | gain |
|---|---|---|---|---|
| défaut | 3 820 | 4 762 (4 727–5 544, 561) | 5 281 | — |
| shadows0 | 3 439 | 4 330 (4 080–4 374, 73) | 4 378 | 903 |
| detail0 | 3 253 | 4 404 (4 330–4 561, 69) | 4 860 | 421 |
| empty1 | 3 423 | 3 942 (3 854–4 064, 35) | 4 088 | 1 193 |
| rapide | 3 197 | 3 591 (3 229–3 626, 180) | 3 597 | 1 684 |
| rapideDetail0 | 2 858 | 3 083 (3 042–3 250, 117) | 3 253 | **2 028 (−38 %)** |
| rendu (2ᵉ série) | 3 083 | 3 401 (3 286–3 675, 131) | 3 460 | **1 874 (−35 %)** (défaut de la série : 5 334) |

## Lecture
- **Meilleure combinaison** : `vhs=0&shadows=0&dpr=1&sang=0&nospawn=1&detail=0` (−1,0 s en bureau, −2,0 s en mobile), mais elle change ce qui est testé (sang, apparitions, décor d'avant le lot 3g) : réservée aux tests qui n'en dépendent pas.
- **Combinaison sûre** : `vhs=0&shadows=0&dpr=1` (« rendu ») ne touche que le rendu : −0,25 s en bureau (dans le bruit), **−1,9 s en mobile** (le DPR de 2,75 et les ombres dominent). Le mobile ne joue que les garde-fous (paliers publication et complet), d'où un gain réel limité.
- `detail=0`, `empty=1`, `nospawn=1` changent le jeu montré ou sa logique : jamais pour un garde-fou ni pour un test du rendu.

## Fichiers de test qui pourraient utiliser `vhs=0&shadows=0&dpr=1` sans risque (non modifiés)
Critère : le fichier ouvre `jeu.html` et ne porte ni sur le VHS, ni sur les ombres, ni sur le DPR, ni sur les budgets de dessin (appels, triangles, mesurés ombres actives), ni sur les couleurs lues à l'écran (relevé par `grep` des mots `vhs|shadow|ombre|dpr|pixelRatio|triangles|calls|budget|screenshot|getImageData|readPixels|contraste`).
- `jeu.spec.js`, `jeu-combat.spec.js`, `jeu-voix.spec.js`, `sons-integres.spec.js`, `sons-integres-ambiances.spec.js` : aucune mention.
- `jeu-interface.spec.js`, `atelier-visite.spec.js` : ont déjà `vhs=0` ; ajouter `shadows=0&dpr=1`.
- `jeu-sons.spec.js` : a déjà `dpr=1` en grand écran ; ajouter `vhs=0&shadows=0`.
- `fumee.spec.js` : possible, mais la fumée gagne à garder le réglage par défaut (c'est ce que voit le joueur) : à décider par le propriétaire.
- `sang=0` en plus, sans risque pour : `jeu-voix`, `sons-integres`, `sons-integres-ambiances`, `jeu-interface` (aucune mention du sang).
- **À ne pas changer** : `jeu-ambiance` (VHS), `jeu-rendu`, `jeu-monde` et `jeu-textures` (budgets avec ombres), `jeu-pause` (DPR), `carte-jeu`, `etage*`, `jeu-zones`, `persos-*`, `jeu-personnages`, `argent`, `interface-integree`, `atelier-*` (ombres, sang, détail ou couleurs mesurés), `publication` (site publié tel quel).

<!-- fin de la fiche: tests-chargement -->

<a id="tests-allegement-audit"></a>
<!-- fiche: tests-allegement-audit | ancien: Docs/ref/tests-allegement-audit.md | octets: 30873 | sha256: f834debd74bb43d9d68ede898ad25f003bbd9847c38c608ab2c1b18f8614e813 -->
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

<!-- fin de la fiche: tests-allegement-audit -->

<a id="tests-allegement-decisions"></a>
<!-- fiche: tests-allegement-decisions | ancien: Docs/ref/tests-allegement-decisions.md | octets: 5333 | sha256: dea5bcaaebf2d9e3ada9d2e228fede933f758491bc0e19ad7d263e77f525254f -->
STATUT: VALIDE
## Catégories (APPROUVE ou REFUSE ; vide = REFUSE)
W1: APPROUVE   (W1-a seulement : sauter `unitaires` sur un push de `dev` ; la variante W1-b est refusée ; pages.yml n'est pas modifié)
W2: APPROUVE   (W2-a : pull_request limité aux Pull Requests vers main ; W2-c : base du premier push d'une branche lot-* = origin/dev ; la variante W2-b est refusée ; paths-ignore de pages.yml : Idées seulement)
T1: REFUSE     (aucun gain de temps ; à retirer au prochain nettoyage de fin de version)
T2: REFUSE
T3: APPROUVE   (délais de 5 s à 30 s, carte-jeu:66, diagnostic d'argent:340 ; atelier-detail U4 mobile : diagnostic seulement, voir exceptions)
T4: APPROUVE   (durées mesurées des tests sans mesure ; canal.spec : pas de regroupement)
T5: APPROUVE   (table de sélection : changement limité aux zones ; aides Vitest)
T6: APPROUVE   (remise à la mesure de la référence de durée ; PAS la variante par retraits)
## Exceptions (fichier ou tâche | garder / retirer | raison)
.github/workflows/pages.yml | ne pas modifier | seuil de quick tenu (1 min 37 s) ; aucun risque de déploiement à prendre
W1-a : tâche unitaires de tests.yml | sauter sur un push de dev seulement | quick fait déjà lint et tout Vitest et bloque le déploiement ; unitaires continue de tourner sur push lot-*, pull_request vers main, essai/** et déclenchement manuel ; rapport et bilan-duree ne doivent plus dépendre d'unitaires sur dev (test du workflow mis à jour avec les valeurs exactes attendues, sans assouplissement) ; dire dans le bilan que bilan-duree n'a plus de durée Vitest sur dev
W2-a : règle à documenter | ajouter à Docs/ref/tests-paliers.md | une branche de travail se nomme lot-* pour être testée avant sa fusion ; une Pull Request d'une autre branche vers dev n'a plus de test avant fusion ; la Pull Request main vers dev n'est pas testée (contenu déjà testé)
W2-c : repli | origin/main | si origin/dev est absent
T3 : délais de 5 s | passer à 30 s sans changer d'assertion | jeu.spec.js:181, 183, 194, 204, 205 ; jeu-ambiance.spec.js:171, 172 ; publication.spec.js:287 ; ajouter tout autre délai de 5 s attendant un chargement de la page du jeu repéré dans le même esprit (délai seulement, listé dans le bilan)
carte-jeu.spec.js:66 (mobile, axe) | délai du test 60 s à 120 s | assertion inchangée (test.setTimeout)
argent.spec.js:340 | diagnostic | au moins 20 répétitions (--repeat-each) en bureau et une série sous charge ; corriger seulement si la cause est dans le test ; JAMAIS @instable ; si la cause est dans le jeu : défaut signalé dans le bilan, test inchangé, jeu non modifié
atelier-detail.spec.js:56 (mobile U4, 210 pour au moins 211) | garder tel quel | aucune tolérance modifiée ; diagnostic autorisé : hypothèse du propriétaire à vérifier : en mobile le préréglage vient de la détection automatique (Moyen) et les nappes de brume basses n'existent pas à Moyen, soit 2 appels et 4 triangles de moins ; essayer un préréglage explicite identique dans les deux projets ; PROPOSER le correctif dans le bilan sans l'appliquer
lampes.spec.js:289 | garder | douteux (404 en console à la fusion du lot 5k) ; si un échec se reproduit, le signaler dans le bilan
T4 : mesure locale | autorisée pour les seuls fichiers sans durée | 208 exécutions dont 106 au standard ; PAS de palier complet en local ; durées intégrées à tests/budget-mesure.json par l'outillage ; recalculer N ; équilibre vérifié sur la CI de la branche
T4 : tranche supplémentaire | conditionnelle | si le palier standard en rejeu total sur la CI de la branche dépasse 7 min 30 s, passer standardCibleSecondes à 400 s (une tranche de plus) et le dire ; sinon ne pas y toucher ; mesure du rejeu total : moyen au choix de l'agent, documenté, sans commit artificiel dans un autre lot et sans toucher aux workflows de déploiement
T5 : table de sélection | appliquer | un changement limité aux entrées zones[*] de tests/selection.json touche ces zones (fermeture inverse comprise) ; toute autre clé (garde-fous, rejeu-total, toujours, fumee, documentation, defaut, schema) garde « tout » ; test de la règle (cas par cas) ; contrôle de la table (tests-selection.test) toujours dans toujours ; sabotage de 16 cassures sur 16 refait
T5 : aides Vitest | appliquer | tests/unit/helpers/** rejoue tout Vitest (déjà fait en CI) mais plus de rejeu total de Playwright ; preuve par grep qu'aucun fichier e2e ne les importe
T5 : css/tokens.css, tests/e2e/helpers.js, workflows, configurations | garder « tout » | lus par toutes les pages ou tous les tests
T6 : référence de durée | remise à zéro explicite | tests/budget-mesure.json et la référence du complet remplacés par le cumul mesuré après T4 ; ajoutMaxParLotSecondes reste 90 ; le bilan écrit « ce n'est pas un allègement » avec le cumul avant et après et la durée réelle du complet en CI ; ne pas présenter le budget comme respecté par rapport à la référence du lot 4e
W1-b, W2-b, T6 par retraits | refuser | pertes de vérification (Vitest sur main, palier standard sur dev, règles de jeu vérifiées en navigateur) pour un gain faible
Aucun test supprimé | contrainte | aucune assertion retirée ; garde-fous intacts ; chaque changement listé « avant / après » avec ses assertions (compter.mjs)

<!-- fin de la fiche: tests-allegement-decisions -->

<a id="tests-allegement-decisions.modele"></a>
<!-- fiche: tests-allegement-decisions.modele | ancien: Docs/ref/tests-allegement-decisions.modele.md | octets: 213 | sha256: 303f0646c3175b7fd8f3697d3c478841e87768c196fc8e9a953bb398431bc3f8 -->
STATUT: A REMPLIR            (le propriétaire met VALIDE)
## Catégories (APPROUVE ou REFUSE ; vide = REFUSE)
W1: 
W2: 
T1: 
T2: 
T3: 
T4: 
T5: 
T6: 
## Exceptions (fichier ou tâche | garder / retirer | raison)

<!-- fin de la fiche: tests-allegement-decisions.modele -->

<a id="nettoyage-audit-annexe"></a>
<!-- fiche: nettoyage-audit-annexe | ancien: Docs/ref/nettoyage-audit-annexe.md | octets: 23936 | sha256: 58b08c5df6e7af91684a80f68c9f9a0cca3bf691a1debf5e12461814d1545c65 -->
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
| `MODES` (`siege.js:13`), `LAYER_TYPES` (`synth.js:17`) | B1 : exports morts, mais leurs fichiers sont voulus inchangés par des garde-fous d'hygiène (`atelier-hygiene`, `sauvegarde-donnees` pour `siege.js` ; `maps-hygiene`, `zones-hygiene`, `etage-hygiene`, `atelier-hygiene`, `sauvegarde-donnees` pour `synth.js` : `git diff --name-only` vide) ; retirés puis restaurés en B1, l'outil les classe désormais « fichier voulu inchangé » |
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

<!-- fin de la fiche: nettoyage-audit-annexe -->

<a id="nettoyage-decisions"></a>
<!-- fiche: nettoyage-decisions | ancien: Docs/ref/nettoyage-decisions.md | octets: 1774 | sha256: 031771d13ec43bfc2b1dbc4d8d3d86902b66c31b2012280c45f7615a9c19932a -->
STATUT: VALIDE
## Catégories
N1: APPROUVE   (exports morts, jetons --space-8 et --duration-normal, tests/e2e/.gitkeep ; plus `affine` de character-parts.js s'il reste mort après le lot 5d et que la preuve tient ; ESLint signale les fonctions d'aide devenues orphelines : les retirer seulement si la preuve tient)
N2: APPROUVE   (seulement ?murs=bas : la condition de js/game/main.js, les commentaires, la combinaison « mursBas » de scripts/tests/chargement.mjs)
N3: REFUSE     (pages techniques gardées jusqu'au lot 13)
N4: APPROUVE   (retirer scripts/modele/captures.mjs, scripts/plan-monde.mjs, scripts/sons/scene.mjs et leurs lignes de source dans tests/selection.json)
N5: APPROUVE   (retirer Docs/ref/fusion-3g.md ; corriger les phrases périmées listées en N5 de l'audit)
N6: REFUSE
N7: REFUSE
## Exceptions
?percee=0 | garder | garde-fou atelier-retours.spec.js
?detail=, ?vhs=, ?shadows=, ?dpr= | garder | lus par les préréglages graphiques
?sons=A|B|C, js/game/sound-atelier.js, data/game/sounds-atelier.json | garder | jusqu'au lot 13
scripts/planche-textures.mjs, scripts/stats-joueur.mjs | garder | outils utiles aux lots suivants
Docs/ref/conventions.md et CLAUDE.md | corriger | seulement les phrases périmées de N5 (anciens déclencheurs de CI et job e2e, npm run assemble et _site/lots/, dossier modele-rdc, ligne « Sons » de CLAUDE.md : la plupart des sons passent par synth2.js) et les mentions de fichiers ou d'exports supprimés ; CLAUDE.md ne doit pas dépasser 8 400 caractères (il en compte 8 371 : une correction ne doit jamais l'allonger) ; rien d'autre
?perso=actuel, js/core/pose.js, js/game/character.js, ?sons=ancien, js/game/sound-legacy.js, data/game/sounds-legacy.json | traités en partie C | plan puis accord du propriétaire

<!-- fin de la fiche: nettoyage-decisions -->

<a id="nettoyage-docs-decisions.modele"></a>
<!-- fiche: nettoyage-docs-decisions.modele | ancien: Docs/ref/nettoyage-docs-decisions.modele.md | octets: 362 | sha256: 0bd16706282f0ae99d2dbaef31f03fa646b1c919e600b6d5819cbfa58684fdca -->
STATUT: A REMPLIR            (le propriétaire met VALIDE)
## Documentation (APPROUVE ou REFUSE ; vide = REFUSE)
L1: 
R1: 
R2: 
R3: 
R4: 
R5: 
R6: 
## Branches
Sources de V0.1 à V0.5 (lot-1, lot-1d, lot-2c, lot-3e, lot-4b) : GARDER ou SUPPRIMER
Branches « SÛRES » du rapport : APPROUVE ou REFUSE
## Exceptions (chemin ou branche | garder / retirer | raison)

<!-- fin de la fiche: nettoyage-docs-decisions.modele -->

<a id="nettoyage-plan-ancien"></a>
<!-- fiche: nettoyage-plan-ancien | ancien: Docs/ref/nettoyage-plan-ancien.md | octets: 10002 | sha256: e6bc250b3985f5518649c1cb1decae9d835eb49188f683182336ce4f452f3334 -->
# Plan de retrait de l'ancien modèle de personnages et de l'ancien pack de sons (lot 5e-C1)

Base : pointe de `lot-5c` `92e4556` (nettoyage du lot 5c, `dev` du lot 5d compris), branche `lot-5e`, 6 novembre 2026. **C1 ne modifie aucun fichier de `js/`, `data/`, `tests/` ni de `scripts/` hors `scripts/nettoyage/`** : il ajoute ce plan, son annexe (`nettoyage-plan-ancien-annexe.md` : inventaire complet, mesures, avant/après par test), le modèle de décisions et deux scripts en lecture seule : `scripts/nettoyage/inventaire-ancien.mjs` (inventaire ; `--remesure` : références de rendu) et `scripts/nettoyage/empreintes-sons.mjs` (SHA-256 de chaque tampon du pack par défaut, sans navigateur). C2 n'applique que ce que `Docs/ref/nettoyage-plan-ancien-decisions.md` (`STATUT: VALIDE`) approuve. **Aucun comportement du jeu ne change avec une table valide et sans paramètre.** *(Lot 5m : annexe retirée, décision R2 ; texte intégral dans l'historique : `git show 919d64f:Docs/ref/nettoyage-plan-ancien-annexe.md`.)*

## Ce qui serait retiré
| Retrait | Fichiers supprimés | Lignes modifiées (résumé) |
|---|---|---|
| Personnages | `js/core/pose.js` (213 l., 9 381 o), `js/game/character.js` (221 l., 10 910 o), `scripts/personnages/architecture.mjs` (6 708 o, comparaison des architectures du lot 3j), `scripts/personnages/inventaire.mjs` (3 171 o, état des lieux de l'ancien modèle) | `persos-loader.js` (import dynamique et modèle ancien), `persos-params.js` (`actuel` hors de `PERSO_VALUES` et `VARIANTES`, repli **A**, plus de mode inactif), `persos-runtime.js`, `character-v2.js` (`handles`, `choices`), `game.js` (commentaires), `graphics.js` (`PERSO_LOADS` sans `actuel`), atelier des personnages (colonne et variante « actuel », `measures.current`, clé `dev.persos.variant.actuel`), `scripts/personnages/lib.mjs` (`currentPose`, `currentMetrics` et l'import de `pose.js`), `projection.mjs` (`choicesOf` : repli A, comme le jeu), `scripts/tests/chargement.mjs` (`persoActuel`) |
| Sons | `js/game/sound-legacy.js` (10 l., 553 o), `data/game/sounds-legacy.json` (690 l., 14 395 o, publié) | `sound-loader.js` (`loadLegacy`, `resolveJobs`), `audio.js` (`legacyMode`), `js/core/sound-choice.js` (`SOUND_MODES` sans `ancien`), `scripts/sons/integrer.mjs` (n'écrit plus `sounds-legacy.json` ; `integrate` sans `legacy`), `lister-integres.mjs`, `scripts/sons/projection.mjs`, atelier des sons (`js/atelier-sons/main.js` : « Actuel » d'un son remplacé), `scripts/tests/chargement.mjs` (`sonsAncien`) |

Gain estimé : 6 fichiers supprimés (≈ 45 ko, ≈ 1 290 lignes), dont 2 publiés (`sounds-legacy.json`, `sound-legacy.js`) et 2 seulement chargés à la demande (`pose.js`, `character.js`) ; **JavaScript chargé par défaut : 113 → 113** (aucun de ces fichiers n'est chargé par défaut) ; tests : 10 retirés, 1 ajouté, ≈ 30 réécrits (détail en annexe C).

## Comportement après retrait
- `?perso=actuel` et `?sons=ancien` : valeur inconnue = défaut (`choix`), sans erreur, jamais mémorisée ; `?perso=actuel&sang=0` = `?sang=0`.
- **Repli du chargeur** (table `persos-choix.json` absente, illisible, ou variante inconnue d'un personnage, `actuel` compris) : **variante A** pour ce personnage (avant : ancien modèle, et rien de chargé sans table). Test prévu : `readPersosParams('', null)` → 5 personnages `A`, `v2: true`, actif ; `slotVariants('choix', { persos: { petit: { variante: 'Z' } } })` → `A` ; e2e : `persos-choix.json` en 404 → le jeu démarre, `persos.slots` tous `A`, aucune erreur de console.
- Avec la table valide et sans paramètre : mêmes personnages, mêmes sons, même rendu (preuves ci-dessous).

## Garde-fous touchés (résumé ; détail par test : annexe C)
| Fichier (G = garde-fou) | Tests avant → après | Assertions avant → après | Ce qui change |
|---|---|---|---|
| `e2e/atelier-carte` (G) | 3 → 3 | 7 → 7 | `&perso=actuel` → `&perso=A` ; `REF` remesurées avec A (mêmes marges : +300 triangles, +6 appels) |
| `e2e/atelier-detail` (G) | 11 → 11 | 27 → 27 | idem ; plafonds 30 000 / 240 → **27 300 / 84** |
| `e2e/argent` (G) | 48 → 48 | 215 → 215 | idem (R1, U1) ; plafonds 30 000 / 240 → **27 300 / 84** |
| `e2e/carte-jeu` (G) | 23 → 23 | 78 → 78 | budget 10 zombies : référence A 53 / 19 951 (+3 appels, +100 triangles) |
| `e2e/jeu-rendu` (G) | 13 → 13 | 32 → 32 | ombres lointaines : `&perso=A` ; au moins **+1** appel d'ombre (proxy v2) au lieu de +5 (5 pièces de l'ancien modèle) |
| `e2e/jeu-personnages` (G) | 5 → 4 | 12 → 8 | retiré : angles de `pose.js` (`shoulderL`, `hipL`) d'un zombie « actuel » (**propre à l'ancien modèle**) |
| `e2e/persos-integres` (G) | 24 → 25 | 62 → 64 | « ?perso=actuel » et « ?perso=actuel&sang=0 » : valeur inconnue, aucun module ancien demandé ; invariance sans `actuel` ; **ajouté** : repli A quand la table répond 404 (2 assertions) |
| `e2e/persos-jeu` (G) | 8 → 8 | 22 → 22 | invariance comparée à `&perso=A&sang=0` (variantes : défaut, A, B, C, riche&sang=0, riche&sang=reduit, riche&sang=1, B&sang=reduit) ; tir/réparation : `riche`, `A` |
| `unit/persos-integres` (G) | 49 → 49 | 107 → 107 | repli A, `actuel` inconnu, chargeur sans `pose.js` ; `pose.js` hors des listes « inchangés » |
| `unit/persos-jeu` (G) | 29 → 29 | 63 → 63 | modèle du chargeur au lieu de `character.js` ; « ?perso=actuel&sang=… » → valeur inconnue |
| `unit/persos-animations` (G) | 20 → 20 | 52 → 52 | rampe : bassin de l'ancien rampant **figé** (9,0811, ±4) au lieu de `computePose` |
| `unit/data-textures` (G) | 13 → 12 | 35 → 32 | retiré : « articulations de `pose.js` dans le squelette » (**propre à l'ancien modèle**) |
| `unit/atelier-hygiene`, `sauvegarde-donnees`, `etage-hygiene` (G) | = | = | `js/core/pose.js` sorti des listes « fichiers inchangés » (fichier supprimé) |
| `unit/sons-integres` (G) | 35 → 31 | 95 → 86 | retirés : `sounds-legacy.json` à jour, recettes d'avant conservées (2), voix commune du pack d'avant, planche posée du pack d'avant (3), `resolveJobs` (2) : **propres à l'ancien pack** |
| `unit/sons-integres-ambiances` (G) | 22 → 19 | 64 → 60 | retirés : 4 assertions sur la table du pack d'avant (**propres à l'ancien pack**) |
| `unit/core-sound-director` (G) | 34 → 34 | 78 → 78 | table du pack par défaut (au lieu du pack d'avant) ; 3 tests réécrits (hauteur par `zombie-grognement`, gain propre du pas, cri par type) |
| `unit/data-sons`, `data-sons-lot3` (G), `data-annonce-sons` | = | = | recettes `synth.js` du pack par défaut (assistant `sons-synth.js`) ; listes de la spécification réduites aux sons encore en `synth.js`, cohérence sur `sounds.json` entier |
| `unit/atelier-sons-hygiene` (G) | 18 → 18 | 32 → 31 | retirée : recette d'avant de `impact-zombie` gardée dans `sounds-legacy.json` (**propre à l'ancien pack**) |
| `unit/impact-chair` | 16 → 15 | 47 → 42 | niveaux de l'ancien impact **figés** (`tests/unit/helpers/references-sons.json`) ; retirés : « l'ancien son scintille » (3), empreinte de l'ancienne recette, crête du mélange avec l'ancien impact |
| `e2e/sons-integres` (G) | 16 → 16 | 65 → 65 | `?sons=ancien` → valeur inconnue (impact B par défaut) ; essai sans mode essai : `?sons=B` |
| `e2e/jeu-vagues` (G) | 24 → 24 | 135 → 135 | hauteur des voix : cas « pack d'avant » retiré de la boucle |
| `e2e/atelier-sons` (G) | 4 → 4 | 21 → 18 | retirées : « Actuel » de `impact-chair` (ancien « cling ») (**propre à l'ancien pack**) |

**Assertions retirées : 29** (personnages 7, sons 22), toutes « propres à l'ancien modèle » ou « propres à l'ancien pack » ; **ajoutées : 2** (repli A en e2e ; le repli unitaire remplace les tests de l'ancien repli). Aucune propriété protégée ne disparaît sans remplacement : **aucun BLOQUANT**. Plafonds proposés (règle : valeur mesurée arrondie au millier ou à la dizaine supérieurs, + 5 %, jamais au-dessus de 45 000 / 400) : avec le détail, A mesure au plus 25 805 à 25 789 triangles et 77 appels (U4) → **27 300 triangles et 84 appels**.

## Preuves prévues pour C2 (à chaque pas)
(a) six empreintes de `scripts/perf/trace-logique.mjs` identiques à la pointe de `lot-5c` (finales `7e5fed6a`, `3cab05cf`, `4b78adcd`, `dde468cb`, `42056a40`, `8a17408c`) ; (b) `--os` : matrices des os identiques (référence relancée sur `lot-5c` dans une copie `git worktree`) ; (c) appels, triangles, pixels de R1, R2, U1, U4 × Élevé, Moyen, Faible identiques (`budget-instant.mjs`) ; (d) six vues identiques (`vues.mjs`) ; (e) **SHA-256 de chaque tampon du pack par défaut** : `node scripts/nettoyage/empreintes-sons.mjs --out <hors dépôt>` puis `--compare` : 184 tampons, empreinte globale `62c628d3e17b8358833cd979f9f7bce4b6696aa3147d9bea91e9f9391ad30999` (liste en annexe D ; vérifiée identique sur un retrait simulé) ; (f) `sounds.json` : SHA-256 `4eb3ba26cd1108679d6f35e35f907a0ffbefa7f4b65e19b0661797706a7eec5e` ; (g) site assemblé servi sans ressource manquante.

## Points d'attention
- Les fichiers « voulus inchangés » par des garde-fous d'hygiène listent `js/core/pose.js` : il en sort (fichier supprimé) ; les autres entrées restent.
- `?perso=actuel&sang=0` chargeait le jeu d'avant le lot 3j sans module v2 : ce chemin « rien de chargé » disparaît (aucun préréglage ne l'utilise ; `graphics.json` : `A` ou `choix`).
- L'échec mobile d'`atelier-detail` U4 (210 appels contre 212 en bureau, constaté au lot 5c) reste à traiter à part ; les nouvelles références sont mesurées en bureau comme les anciennes.
- `characters-v2.json` (`slot.current`) et `projection.mjs` décrivent encore l'ancien modèle **en données** (estimation du décor des projections) : gardés, ils n'exigent aucun code retiré.
- `Docs/ref/personnages-actuels.md` et `sons-actuels.md` : gardés comme états des lieux historiques (une note « lot 5e : retiré du jeu »), sauf décision contraire.

<!-- fin de la fiche: nettoyage-plan-ancien -->

<a id="nettoyage-plan-ancien-decisions"></a>
<!-- fiche: nettoyage-plan-ancien-decisions | ancien: Docs/ref/nettoyage-plan-ancien-decisions.md | octets: 5546 | sha256: 24ec954b5b2b7b031d381d1b139005061c2d240643bd1c19a706c1392b35ac37 -->
STATUT: VALIDE
## Retraits (APPROUVE ou REFUSE ; vide = REFUSE)
PERSONNAGES (?perso=actuel, pose.js, character.js, aiguillage, colonne « actuel » de l'atelier, repli sur la variante A): APPROUVE
SONS (?sons=ancien, sound-legacy.js, sounds-legacy.json, loadLegacy, legacyMode, comparaison de l'atelier des sons): APPROUVE
## Garde-fous modifiés (la liste du plan est APPROUVEE, aux conditions suivantes)
- Plafonds de rendu : 27 300 triangles et 84 appels (atelier-detail, argent) et références remesurées avec la variante A, comme dans le plan ; les plafonds de persos-integres (45 000 / 400) ne changent pas.
- e2e/jeu-personnages : retrait des 4 assertions de l'ancien modèle APPROUVE, à condition que l'agent confirme qu'une assertion v2 équivalente existe (bras en avant et hanches du zombie qui marche) dans persos-animations ou persos-integres ; sinon il en ajoute une.
- Sons : les 22 assertions listées sont approuvées ; au plus 5 assertions de plus (data-sons, data-sons-lot3, data-annonce-sons), chacune listée avec sa justification « propre à l'ancien pack » avant d'être retirée ; au-delà de 5, l'agent s'arrête et le signale.
- unit/impact-chair : niveaux figés APPROUVES ; tests/unit/helpers/references-sons.json doit indiquer le hash de départ (pointe de lot-5c, 92e4556), la méthode de mesure et la date, car l'ancienne recette ne pourra plus servir à les régénérer.
- e2e/atelier-detail, cas U4 en mobile (210 appels contre 212 en bureau) : ne jamais élargir la tolérance ; ne traiter que si la CI complète confirme l'échec (alors une référence par projet, bureau et mobile, mesurée) ; sinon le signaler dans le bilan sans modifier.
- Un retrait ou un assouplissement non listé dans le plan est interdit : l'agent le liste et s'arrête.
## Exceptions (fichier | garder / retirer | raison)
js/core/character-parts.js (fromV1) et data/game/characters-v2.json (slot.current) | garder | utilisés par les tests, les oracles du lot 5d et les projections
tests/unit/helpers/oracle/ | garder | références figées du lot 5d, jamais modifiées
Docs/ref/personnages-actuels.md, Docs/ref/sons-actuels.md | garder | états des lieux historiques ; y ajouter une note « retiré du jeu au lot 5e »
Docs/ref/personnages-integres.md | garder | la section « Code ancien supprimable » (exigée par persos-integres-finitions.test.js) reste, avec une note de retrait
data/i18n/sons-integres.json et Docs/ref/sons-integres.md | corriger | textes qui parlent du pack d'avant ; aucune clé orpheline
CLAUDE.md et Docs/ref/conventions.md | corriger | seulement les mentions de ?perso=actuel, ?sons=ancien, de l'ancien modèle et de l'ancien pack ; CLAUDE.md ne doit pas dépasser sa longueur actuelle (8 371 caractères au plus, limite 8 400)
Docs/seed.md | ne pas toucher | le propriétaire le réécrira à la publication de V0.6
?sons=A|B|C, js/game/sound-atelier.js, data/game/sounds-atelier.json | garder | jusqu'au lot 13
Ordre de fusion | information | lot-5c est déjà dans dev ; lot-5e ne doit contenir que ses propres commits de plus (ne pas fusionner dev dans lot-5e sauf conflit signalé à l'agent)
## Décision complémentaire (C3)
Décision du propriétaire sur C3 (sons), en complément de Docs/ref/nettoyage-plan-ancien-decisions.md.
1. La limite de 5 assertions supplémentaires est portée à 8 pour tests/unit/data-sons-lot3.test.js seulement : les 8 assertions listées en annexe F (planche arrachée : attaque 6 ms, centre de gravité 300 à 3 000 Hz ; planche posée : 2 à 3 coups séparés d'au moins 80 ms, espacement 110 à 150 ms) sont APPROUVÉES au retrait. Toute autre assertion supplémentaire au-delà des 22 du plan reste interdite : tu t'arrêtes et tu le signales.
2. Condition : ces propriétés doivent être protégées sur les sons livrés. Pour planche-arrachee et planche-posee du pack par défaut (moteur de l'atelier, toutes les graines), ajoute des assertions équivalentes : vitesse d'attaque et centre de gravité de la planche arrachée ; nombre de coups, espacement et centre de gravité de la planche posée. Vérifie d'abord, avec lire/grep, si un test existant (sons-integres, atelier-check, sons-integres-ambiances) vérifie déjà une de ces propriétés : dans ce cas, ne la duplique pas et note-le.
3. Bornes : mesurées avec js/core/audio-analysis.js sur toutes les graines du pack par défaut, élargies d'au plus 15 % de part et d'autre de la plage mesurée, jamais plus larges. Si une propriété ne peut pas être mesurée par audio-analysis.js, dis-le, ne l'invente pas et liste-la. Écris les valeurs mesurées, la méthode, le hash de départ et la date dans tests/unit/helpers/references-sons.json.
4. Tableau « avant / après » dans le bilan : les 8 assertions retirées (avec leur justification « propre à l'ancien pack ») et les assertions ajoutées, avec le solde net par fichier.
5. Ajoute à Docs/ref/nettoyage-plan-ancien-decisions.md une section « Décision complémentaire (C3) » avec ce texte, dans le commit de C3.
6. Continue ensuite : C3 (sons) en entier, validation (empreintes SHA-256 des 184 tampons et de sounds.json identiques à la référence, etat logique, rendu, six vues), CI standard puis palier complet par une branche essai/complet, bilan Docs/lots/versions/v0.6.md#lot-5e.
Rappel : atelier-detail U4 en mobile : tu as mis une référence par projet (bureau et mobile) avec les mêmes tolérances ; dans le bilan, dis si la CI complète avait confirmé l'échec avant ce changement ou si c'est un choix préventif.

<!-- fin de la fiche: nettoyage-plan-ancien-decisions -->

<a id="docs-audit"></a>
<!-- fiche: docs-audit | ancien: Docs/ref/docs-audit.md | octets: 10271 | sha256: 25899926cdb909835f00aa3e3e0cd9e1b5e0db7c3a91ef998ba49bf68f1926f5 -->
# Audit de la documentation (lot 5m-A)

> Lecture seule, base `origin/dev` `2941829`. Outil : `node scripts/docs/auditer.mjs --json <fichier hors dépôt>` (Node natif, n'écrit rien dans le dépôt) ; sortie complète : `Docs/ref/docs-audit-annexe.md` (inventaire, références `fichier:ligne`, motifs, rattachement, liens). Branches : `Docs/ref/branches-audit.md`. Rien n'est déplacé ni supprimé en A.

**Règles de preuve** (lot 5c) : références entrantes par chemin (`Docs/ref/x.md`, `../ref/x.md`, chemin partiel) ou par nom de fichier (`x.md`) dans tous les fichiers suivis, plus les chaînes « Docs… » du code, des tests, des scripts, des pages, des workflows et de la configuration converties en motifs (gabarit, glob, dossier, concaténation). Un motif qui couvre un dossier entier (`readdirSync('Docs/lots')`, `walk('Docs/ref')`, `paths-ignore: Docs/**`) est listé à part : test à adapter, pas preuve d'usage d'un document précis. Chaînes passées à une fonction pure et titres de test : « donnée », sans lecture. **R1 à R5** : point fixe (un document cité par un document qui reste n'est pas candidat). **L1** (regroupement, pas retrait) : seuls un test, un script, le seed ou un fichier hors `Docs/` qui le lit nommément le rendent douteux ; les citations de `conventions.md` et des documents qui restent se corrigent en B.

## Chiffres (`Docs/lots/` et `Docs/ref/`, 91 fichiers dont `.gitkeep`, 6 306 lignes, 1 151 088 o)

| Cat. | Documents | Lignes | Octets | Candidats | Douteux | Historique seul. | Réf. entrantes | Gain si approuvé (candidats seuls) |
|---|---|---|---|---|---|---|---|---|
| L1 bilans V0.1–V0.6 | 39 | 1 453 | 334 288 | 27 | 12 | — | 52 | −22 documents (27 → 5 fichiers) ; lignes et octets ≈ +2 % (sommaires) |
| R1 manifestes de fusion | 2 | 61 | 12 993 | 0 | 2 | 0 | 22 | aucun |
| R2 audits, plans, décisions | 15 | 1 475 | 189 889 | 3 | 10 | 2 | 37 | −3 documents, −249 lignes, −30 181 o |
| R3 états des lieux d'avant | 3 | 125 | 17 040 | 0 | 3 | 0 | 33 | aucun |
| R4 passations, choix d'atelier | 7 | 500 | 76 439 | 0 | 7 | 0 | 110 | aucun |
| R5 pages techniques (lot 13) | 5 | 804 | 120 412 | 0 | 5 | 0 | 41 | garder (recommandé) |
| R6 périmés, doublons | 0 | — | — | 0 | — | — | — | aucun trouvé |
| Bilans V0.7 (5j, 5k, 5l) | 3 | 97 | 33 245 | — | — | — | 3 | restent séparés |
| Autres références actives | 17 | 1 791 | 366 782 | — | — | — | 327 | gardés |

**Après, candidats seuls (L1 et R2)** : 66 fichiers (−25), ≈ 6 180 lignes, ≈ 1 128 000 o (estimation : sommaires et marqueurs ≈ +120 lignes, +7 Ko). **Recommandation suivie** (11 douteux adaptables en exception, `lot-5a` séparé, R2) : 56 fichiers (−35), mêmes lignes et octets à ±1 %. Le regroupement réduit le **nombre** de fichiers, pas le texte (aucun bilan n'est raccourci).

## L1 — rattachement des bilans (journal, bornes, preuve git)
- Règle : champ `version` (5a à 5i : `v0.6`) ; sinon ordre du journal et bornes `lot-1`, `lot-1d`, `lot-2c`, `lot-3e`, `lot-4b`. Contrôle : première version de `versions.json` dont le commit gelé contient le bilan. **Accord pour 35 bilans sur 39** (2 désaccords, 2 absents du commit gelé).
- **Doutes** : `lot-3h` (journal : V0.4 ; présent seulement à partir du commit gelé de **V0.5**) ; `lot-4c` (après la borne de V0.5 : V0.6 par déduction ; présent dans le commit gelé de **V0.5**) ; `lot-4e`, `lot-4f`, `lot-4g` (sans `version`, V0.6 par déduction ; git : V0.6, d'accord) ; `lot-5f`, `lot-5i` (`version: "v0.6"` mais absents du commit gelé `cef11b3` : arrivés dans `main` après, par la fusion #46). **Recommandation** : V0.5 pour `lot-3h` et `lot-4c` (preuve git), à écrire en exception ; sinon la règle du journal s'applique.
- Proposé : `Docs/lots/versions/v0.1.md` … `v0.6.md` (sommaire, puis chaque bilan intégral, sans modification, dans l'ordre du journal ; ancien nom en tête). Par version : V0.1 5 (lot-0, 0b, 0c, 0d, 1), V0.2 4, V0.3 3, V0.4 6 (avec 3h), V0.5 8, V0.6 13 (avec 4c).
- **Douteux (12)** : `lot-1`, `lot-2`, `lot-2b`, `lot-2c`, `lot-3`, `lot-3a`, `lot-3b` (`zones-hygiene.test.js:63` : `git diff main --` sur ces 7 chemins) ; `lot-3j` (`interface-integree-retours.test.js:122`, `existsSync`) ; `lot-3m` (`persos-integres-finitions.test.js:143`, lit le texte) ; `lot-4c`, `lot-5g` (`publication.test.js:672, 703` : nom exclu d'une liste, garde-fous **inactifs**, `skipIf`) ; `lot-5a` (`data/game/sounds-choix.json:727`, champ `source` : **`data/game` interdit**, le chemin y resterait périmé).
- **Lectures du dossier entier** (à adapter si L1 est appliqué) : `data-changelog.test.js:34` (chaque bilan de `Docs/lots/*.md` a son entrée : ne verrait plus les bilans regroupés) ; `persos-donnees.test.js:96` (`git diff --diff-filter=MD main -- Docs/lots` : échoue dès qu'un bilan est retiré) ; `publication.test.js:672, 703` (inactifs, sans effet) ; `structure.test.js:7, 21` (le dossier reste : sans effet).
- **Ce que `data-changelog` exige** : une entrée par bilan (sens bilan → journal ; `lot-0t` a une entrée sans bilan, donc « chaque lot du journal a un bilan » serait faux). Adaptation proposée : chercher les bilans séparés **et** les bilans des fichiers groupés (marqueurs du sommaire), même assertion par bilan, plus une assertion « 39 + bilans séparés retrouvés » ; aucune retirée.
- **Chemins à corriger en B** (aucun dans `CLAUDE.md`) : `conventions.md:66, 79, 92, 101, 306` ; `etage.md:57`, `fusion-3j.md:23, 27`, `passation-personnages-4b.md:5, 53, 107`, `fusion-3k.md:17`, `integration-interface.md:3`, `passation-interface-4b.md:8`, `interface-a-integrer.md:20`, `personnages-integres.md:37, 41`, `tests-paliers.md:107`, `nettoyage-plan-ancien-decisions.md:29`, `site-adresses.md:70`. Les bilans eux-mêmes ne sont jamais modifiés (leurs citations d'autres bilans restent historiques).

## R1 à R6
- **R1** `fusion-3j.md` (lu par `persos-jeu.test.js:218`, `readFileSync`), `fusion-3k.md` (`scripts/build.mjs:11`, `interface-atelier-hygiene.test.js:39`) : douteux, rien à appliquer.
- **R2** : **candidats** `nettoyage-plan-ancien-annexe.md` (233 lignes, 29 435 o, annexe d'inventaire), `nettoyage-decisions.modele.md`, `nettoyage-plan-ancien-decisions.modele.md` (modèles vides). **Historique seulement** (cités par le bilan `lot-5e`, regroupables sans perte en exception) : `nettoyage-plan-ancien.md`, `nettoyage-plan-ancien-decisions.md`. **Douteux** : `claude-md-consolidation.md`, `claude-md-v06.md` (`conventions.md:341, 394`), `nettoyage-audit.md` (`scripts/nettoyage/auditer.mjs:565`), `tests-audit-annexe.md` (écrite par `scripts/tests/resumer.mjs:18`), `tests-decisions.md` (`scripts/tests/classement.json:3`) ; et, cités par ces documents qui restent : `nettoyage-audit-annexe.md`, `nettoyage-decisions.md`, `tests-audit.md`, `tests-chargement.md`, `tests-decisions.modele.md`.
- **R3** : `sons-actuels.md` (`scripts/sons/lister-integres.mjs:40`) ; `interface-actuelle.md`, `personnages-actuels.md` (cités par `fusion-3k.md`, `fusion-3j.md`, `passation-*`, `nettoyage-audit*`, qui restent). Code décrit retiré (`pose.js`, `character.js`, `sounds-legacy.json`) : déjà annotés au lot 5e.
- **R4** : `integration-personnages.md` (`persos-jeu.test.js:217`, `readFileSync`), `interface-a-integrer.md` (`interface-integree-retours.test.js:15`, `readFileSync` ; `css/game-ui.css:2`), `passation-personnages-4b.md` (`data/game/persos-choix.json`, 6 tests en commentaire), `passation-interface-4b.md` (`css/proto-b.css:5`, un test), `sons-a-integrer.md` (`data/game/sounds-choix.json`, 2 scripts), `integration-interface.md` (`scripts/interface/projection.mjs:16`), `integration-sons.md` (cité par `atelier-sons.md` et `sons-a-integrer.md`). Tous douteux.
- **R5** : `atelier-interface.md`, `atelier-personnages.md`, `atelier-sons.md`, `ecarts-modele.md` (écrit par `scripts/modele/rapport.mjs`, `ecarts.html`), `affinage.md` (**cité par le seed** `Docs/seed.md:49`) : 5 documents, 804 lignes, 120 412 o ; **garder jusqu'au lot 13**.
- **R6** : aucun document périmé prouvé : ceux qui citent du code retiré (`publication-versions.md`, `site-adresses.md`, `personnages-integres.md`, `tests-paliers.md`) sont des références actives, déjà annotées ; aucune ligne de 60 caractères ou plus reprise mot pour mot de `conventions.md` hors de lui-même (0 %).

## Liens et chemins cassés (avant tout changement)
- Liens Markdown relatifs dans `Docs/`, `CLAUDE.md`, `conventions.md` : **aucun** (0 lien : tout est cité en `chemin`). Chemins `Docs/…` introuvables : 5, tous `Docs/ref/fusion-3g.md` (retiré au lot 5c) dans `lot-4b.md:10`, `lot-5c.md:7` (bilans, intouchables), `nettoyage-audit.md:64`, `nettoyage-audit-annexe.md:85`, `nettoyage-decisions.md:7`.

## Effets annexes
- **Seed** : cite `affinage.md`, `etage.md`, `conventions.md`, `publication-versions.md`, `site-adresses.md` (aucun proposé au déplacement) : rien à réécrire si L1 et R2 seuls sont appliqués.
- **`CLAUDE.md`** : ne cite aucun document candidat (aucune correction) ; **8 326 caractères** (`wc -m`), et non 8 140 comme annoncé par le prompt : écart à confirmer par le propriétaire.
- **Garde-fou à respecter** : `lot1-regles.test.js:83` lit tout `Docs/ref/` (et `scripts/`) et refuse le nom de l'ancien moteur de rendu ; les nouveaux documents l'évitent.
- **Tests à adapter si L1 est appliqué** : `data-changelog.test.js:34`, `persos-donnees.test.js:96`, `zones-hygiene.test.js:63`, `interface-integree-retours.test.js:122`, `persos-integres-finitions.test.js:143` (même nombre d'assertions, lecture par une aide commune qui trouve un bilan séparé ou groupé, texte comparé à celui de `main`).

## Recommandation
- **L1 : APPROUVE**, avec en exception les 11 douteux adaptables (`lot-1`, `2`, `2b`, `2c`, `3`, `3a`, `3b`, `3j`, `3m`, `4c`, `5g` : tests adaptés, sans perte) et **`lot-5a` gardé séparé** (citation dans `data/game`) ; `lot-3h` et `lot-4c` en V0.5.
- **R2 : APPROUVE** (3 retraits sans référence) ; regroupement de `nettoyage-plan-ancien.md` et `nettoyage-plan-ancien-decisions.md` seulement par exception.
- **R1, R3, R4, R6 : REFUSE** (rien de prouvé) ; **R5 : REFUSE** (garder jusqu'au lot 13).

<!-- fin de la fiche: docs-audit -->

<a id="docs-audit-annexe"></a>
<!-- fiche: docs-audit-annexe | ancien: Docs/ref/docs-audit-annexe.md | octets: 65294 | sha256: 37f51565f8b1b2a6ecb3d2c3b11296dd5d3a4d23f803db07c9fc819eb223d08c -->
<!-- Lot 5m-A : annexe générée par « node scripts/docs/auditer.mjs --json <hors dépôt> » (sortie standard recopiée telle quelle) ; résumé et recommandations : Docs/ref/docs-audit.md. -->

# Audit de la documentation — annexe (lot 5m-A, sortie de scripts/docs/auditer.mjs)

Racine : /home/user/Z-Survival ; commit 2941829 ; 91 documents (Docs/lots/ et Docs/ref/).

## Catégories

| Catégorie | Documents | Lignes | Octets | Candidats | Douteux | Douteux (historique seulement) | Références entrantes |
|---|---|---|---|---|---|---|---|
| L1 | 39 | 1 453 | 334 288 | 27 | 12 | 0 | 52 |
| R1 | 2 | 61 | 12 993 | 0 | 2 | 0 | 22 |
| R2 | 15 | 1 475 | 189 889 | 3 | 10 | 2 | 37 |
| R3 | 3 | 125 | 17 040 | 0 | 3 | 0 | 33 |
| R4 | 7 | 500 | 76 439 | 0 | 7 | 0 | 110 |
| R5 | 5 | 804 | 120 412 | 0 | 5 | 0 | 41 |
| V0.7 | 3 | 97 | 33 245 | 0 | 0 | 0 | 3 |
| autre | 17 | 1 791 | 366 782 | 0 | 0 | 0 | 327 |

## Inventaire

| Document | Cat. | Lignes | Octets | Dernier commit | Références (par type) | Motifs | Statut |
|---|---|---|---|---|---|---|---|
| `Docs/lots/.gitkeep` | autre | 0 | 0 | 2026-10-26 | — | — | garder |
| `Docs/lots/lot-0.md` | L1 | 45 | 5 058 | 2026-10-26 | — | — | candidat |
| `Docs/lots/lot-0b.md` | L1 | 27 | 2 185 | 2026-10-26 | bilan 1 | — | candidat |
| `Docs/lots/lot-0c.md` | L1 | 17 | 1 426 | 2026-10-26 | bilan 1 | — | candidat |
| `Docs/lots/lot-0d.md` | L1 | 11 | 806 | 2026-10-26 | bilan 1 | — | candidat |
| `Docs/lots/lot-1.md` | L1 | 37 | 4 572 | 2026-10-26 | test 1 | — | douteux |
| `Docs/lots/lot-1b.md` | L1 | 21 | 5 090 | 2026-10-26 | — | — | candidat |
| `Docs/lots/lot-1c.md` | L1 | 12 | 6 817 | 2026-10-26 | — | — | candidat |
| `Docs/lots/lot-1d.md` | L1 | 19 | 5 800 | 2026-10-27 | — | — | candidat |
| `Docs/lots/lot-1m.md` | L1 | 36 | 6 477 | 2026-10-26 | conventions 1 | — | candidat |
| `Docs/lots/lot-2.md` | L1 | 23 | 7 097 | 2026-10-27 | test 1, conventions 1 | — | douteux |
| `Docs/lots/lot-2b.md` | L1 | 18 | 4 836 | 2026-10-27 | test 1 | — | douteux |
| `Docs/lots/lot-2c.md` | L1 | 17 | 5 903 | 2026-10-27 | test 1, conventions 1 | — | douteux |
| `Docs/lots/lot-3.md` | L1 | 18 | 6 739 | 2026-10-28 | test 1 | — | douteux |
| `Docs/lots/lot-3a.md` | L1 | 20 | 8 220 | 2026-10-28 | test 1, conventions 1 | — | douteux |
| `Docs/lots/lot-3b.md` | L1 | 50 | 8 388 | 2026-10-29 | test 1 | — | douteux |
| `Docs/lots/lot-3c.md` | L1 | 41 | 9 271 | 2026-10-29 | — | — | candidat |
| `Docs/lots/lot-3e.md` | L1 | 116 | 22 791 | 2026-10-30 | document 1 | — | candidat |
| `Docs/lots/lot-3g.md` | L1 | 40 | 12 049 | 2026-11-01 | bilan 2 | — | candidat |
| `Docs/lots/lot-3h.md` | L1 | 34 | 13 179 | 2026-11-01 | test 1, bilan 2 | — | candidat |
| `Docs/lots/lot-3i.md` | L1 | 28 | 9 648 | 2026-11-01 | bilan 2 | — | candidat |
| `Docs/lots/lot-3j.md` | L1 | 56 | 18 673 | 2026-11-01 | test 1, bilan 1, document 5 | — | douteux |
| `Docs/lots/lot-3k.md` | L1 | 38 | 9 250 | 2026-11-01 | bilan 2, document 3 | — | candidat |
| `Docs/lots/lot-3l.md` | L1 | 35 | 9 954 | 2026-11-02 | bilan 2, document 1 | — | candidat |
| `Docs/lots/lot-3m.md` | L1 | 40 | 9 164 | 2026-11-02 | test 1, bilan 2, document 2 | — | douteux |
| `Docs/lots/lot-4.md` | L1 | 21 | 7 388 | 2026-11-01 | test 2 | — | candidat |
| `Docs/lots/lot-4b.md` | L1 | 155 | 19 827 | 2026-11-02 | conventions 1 | — | candidat |
| `Docs/lots/lot-4c.md` | L1 | 38 | 9 749 | 2026-11-02 | test 1 | — | douteux |
| `Docs/lots/lot-4e.md` | L1 | 38 | 9 932 | 2026-11-03 | document 1 | — | candidat |
| `Docs/lots/lot-4f.md` | L1 | 28 | 6 271 | 2026-11-03 | — | — | candidat |
| `Docs/lots/lot-4g.md` | L1 | 23 | 5 754 | 2026-11-03 | — | — | candidat |
| `Docs/lots/lot-5a.md` | L1 | 124 | 12 674 | 2026-11-04 | autre 1 | — | douteux |
| `Docs/lots/lot-5b.md` | L1 | 37 | 8 357 | 2026-11-05 | — | — | candidat |
| `Docs/lots/lot-5c.md` | L1 | 31 | 7 085 | 2026-11-06 | — | — | candidat |
| `Docs/lots/lot-5d.md` | L1 | 34 | 9 620 | 2026-11-06 | — | — | candidat |
| `Docs/lots/lot-5e.md` | L1 | 40 | 8 786 | 2026-11-06 | document 1 | — | candidat |
| `Docs/lots/lot-5f.md` | L1 | 28 | 11 434 | 2026-11-06 | — | — | candidat |
| `Docs/lots/lot-5g.md` | L1 | 24 | 8 381 | 2026-11-06 | test 1, document 1 | — | douteux |
| `Docs/lots/lot-5h.md` | L1 | 17 | 7 548 | 2026-11-06 | — | — | candidat |
| `Docs/lots/lot-5i.md` | L1 | 16 | 8 089 | 2026-11-07 | bilan 1 | — | candidat |
| `Docs/lots/lot-5j.md` | V0.7 | 23 | 9 081 | 2026-11-07 | bilan 1 | — | garder |
| `Docs/lots/lot-5k.md` | V0.7 | 49 | 16 663 | 2026-11-08 | document 2 | — | garder |
| `Docs/lots/lot-5l.md` | V0.7 | 25 | 7 501 | 2026-11-08 | — | — | garder |
| `Docs/ref/affinage.md` | R5 | 87 | 18 794 | 2026-11-06 | script 2, conventions 2, seed 1, bilan 4, document 2, autre 1 | — | douteux |
| `Docs/ref/atelier-interface.md` | R5 | 32 | 6 248 | 2026-11-06 | bilan 2, document 5 | — | douteux (document qui reste) |
| `Docs/ref/atelier-personnages.md` | R5 | 129 | 22 267 | 2026-11-06 | bilan 1, document 6 | — | douteux (document qui reste) |
| `Docs/ref/atelier-sons.md` | R5 | 183 | 30 101 | 2026-11-06 | conventions 1, bilan 3, document 3 | — | douteux |
| `Docs/ref/claude-md-consolidation.md` | R2 | 94 | 11 563 | 2026-11-03 | conventions 1, bilan 2, document 1 | — | douteux |
| `Docs/ref/claude-md-v06.md` | R2 | 90 | 11 968 | 2026-11-06 | conventions 1, bilan 2, document 1 | — | douteux |
| `Docs/ref/conventions.md` | autre | 442 | 146 306 | 2026-11-06 | test 11, script 1, claude 4, seed 1, bilan 52, document 117 | — | garder |
| `Docs/ref/debug.md` | autre | 80 | 12 646 | 2026-11-08 | test 3, script 1, code 4, page 1, bilan 2, document 2 | — | garder |
| `Docs/ref/ecarts-modele.md` | R5 | 373 | 43 002 | 2026-11-01 | script 3, page 1, conventions 1, bilan 1, document 2 | — | douteux |
| `Docs/ref/environnement.md` | autre | 16 | 1 259 | 2026-10-26 | test 1, claude 1, conventions 1, bilan 2 | — | garder |
| `Docs/ref/etage.md` | autre | 62 | 9 053 | 2026-10-30 | test 2, code 1, claude 1, conventions 3, seed 1, bilan 2, document 2, autre 1 | — | garder |
| `Docs/ref/fusion-3j.md` | R1 | 27 | 6 832 | 2026-11-01 | test 1, bilan 3, document 8 | — | douteux |
| `Docs/ref/fusion-3k.md` | R1 | 34 | 6 161 | 2026-11-01 | test 1, script 1, bilan 3, document 5 | — | douteux |
| `Docs/ref/integration-interface.md` | R4 | 53 | 10 200 | 2026-11-01 | script 1, bilan 3, document 5 | — | douteux |
| `Docs/ref/integration-personnages.md` | R4 | 64 | 6 667 | 2026-11-06 | test 1, bilan 1, document 12 | — | douteux |
| `Docs/ref/integration-sons.md` | R4 | 81 | 15 307 | 2026-11-01 | bilan 2, document 2 | — | douteux (document qui reste) |
| `Docs/ref/interface-a-integrer.md` | R4 | 22 | 2 502 | 2026-11-02 | test 1, code 1, conventions 1, bilan 3, document 1 | — | douteux |
| `Docs/ref/interface-actuelle.md` | R3 | 32 | 4 115 | 2026-11-01 | bilan 2, document 6 | — | douteux (document qui reste) |
| `Docs/ref/interface-integree.md` | autre | 60 | 9 206 | 2026-11-02 | test 4, code 1, conventions 1, bilan 3, document 1 | — | garder |
| `Docs/ref/lampes.md` | autre | 71 | 15 390 | 2026-11-08 | bilan 4, document 1, autre 2 | — | garder |
| `Docs/ref/menu-debogage-proposition.md` | autre | 81 | 10 344 | 2026-11-08 | — | — | garder |
| `Docs/ref/nettoyage-audit-annexe.md` | R2 | 122 | 23 936 | 2026-11-06 | document 1 | — | douteux (document qui reste) |
| `Docs/ref/nettoyage-audit.md` | R2 | 80 | 13 833 | 2026-11-06 | script 1, bilan 1, document 1 | — | douteux |
| `Docs/ref/nettoyage-decisions.md` | R2 | 16 | 1 774 | 2026-11-06 | bilan 1, document 1 | — | douteux (document qui reste) |
| `Docs/ref/nettoyage-decisions.modele.md` | R2 | 10 | 226 | 2026-11-05 | — | — | candidat |
| `Docs/ref/nettoyage-plan-ancien-annexe.md` | R2 | 233 | 29 435 | 2026-11-06 | document 1 | — | candidat |
| `Docs/ref/nettoyage-plan-ancien-decisions.md` | R2 | 30 | 5 532 | 2026-11-06 | bilan 1, document 1 | — | douteux (historique seulement) |
| `Docs/ref/nettoyage-plan-ancien-decisions.modele.md` | R2 | 6 | 520 | 2026-11-06 | — | — | candidat |
| `Docs/ref/nettoyage-plan-ancien.md` | R2 | 54 | 9 860 | 2026-11-06 | bilan 1, document 1 | — | douteux (historique seulement) |
| `Docs/ref/options-graphiques.md` | autre | 56 | 11 814 | 2026-11-08 | bilan 4, document 2, autre 1 | — | garder |
| `Docs/ref/passation-interface-4b.md` | R4 | 93 | 16 090 | 2026-11-01 | test 1, code 1, bilan 3, document 4 | — | douteux |
| `Docs/ref/passation-personnages-4b.md` | R4 | 134 | 18 231 | 2026-11-01 | test 6, bilan 4, document 4, autre 7 | — | douteux |
| `Docs/ref/performance.md` | autre | 317 | 51 021 | 2026-11-06 | script 2, bilan 7, document 2 | — | garder |
| `Docs/ref/personnages-actuels.md` | R3 | 27 | 3 834 | 2026-11-06 | bilan 3, document 9 | — | douteux (document qui reste) |
| `Docs/ref/personnages-integres.md` | autre | 49 | 5 532 | 2026-11-06 | test 1, conventions 2, bilan 4, document 6 | — | garder |
| `Docs/ref/publication-versions.md` | autre | 156 | 24 824 | 2026-11-07 | conventions 1, seed 1, bilan 6, document 4 | — | garder |
| `Docs/ref/site-adresses.md` | autre | 135 | 22 242 | 2026-11-08 | claude 1, conventions 8, seed 1, bilan 4, document 3 | — | garder |
| `Docs/ref/sons-a-integrer.md` | R4 | 53 | 7 442 | 2026-11-01 | test 3, script 2, bilan 3, document 3, autre 35 | — | douteux |
| `Docs/ref/sons-actuels.md` | R3 | 66 | 9 091 | 2026-11-06 | script 1, bilan 4, document 8 | — | douteux |
| `Docs/ref/sons-integres.md` | autre | 53 | 8 281 | 2026-11-06 | script 4, bilan 3, document 4 | — | garder |
| `Docs/ref/tests-audit-annexe.md` | R2 | 591 | 64 719 | 2026-11-03 | script 2, document 2 | — | douteux |
| `Docs/ref/tests-audit.md` | R2 | 69 | 9 250 | 2026-11-03 | bilan 1, document 2 | — | douteux (document qui reste) |
| `Docs/ref/tests-chargement.md` | R2 | 50 | 5 551 | 2026-11-06 | bilan 3, document 4 | — | douteux (document qui reste) |
| `Docs/ref/tests-decisions.md` | R2 | 17 | 1 357 | 2026-11-03 | selection 1, bilan 1, document 1 | — | douteux |
| `Docs/ref/tests-decisions.modele.md` | R2 | 13 | 365 | 2026-11-03 | document 1 | — | douteux (document qui reste) |
| `Docs/ref/tests-paliers.md` | autre | 148 | 28 874 | 2026-11-03 | test 1, script 1, workflow 1, claude 1, conventions 1, bilan 4, document 1 | — | garder |
| `Docs/ref/verification-versions.md` | autre | 33 | 5 187 | 2026-11-06 | bilan 3, document 6 | — | garder |
| `Docs/ref/versions-correspondance.md` | autre | 32 | 4 803 | 2026-11-02 | bilan 1, document 2 | — | garder |

## Raisons des « douteux » et chemins à corriger

- `Docs/lots/lot-1.md` (douteux) : test tests/unit/zones-hygiene.test.js:63
- `Docs/lots/lot-2.md` (douteux) : test tests/unit/zones-hygiene.test.js:63
- `Docs/lots/lot-2b.md` (douteux) : test tests/unit/zones-hygiene.test.js:63
- `Docs/lots/lot-2c.md` (douteux) : test tests/unit/zones-hygiene.test.js:63
- `Docs/lots/lot-3.md` (douteux) : test tests/unit/zones-hygiene.test.js:63
- `Docs/lots/lot-3a.md` (douteux) : test tests/unit/zones-hygiene.test.js:63
- `Docs/lots/lot-3b.md` (douteux) : test tests/unit/zones-hygiene.test.js:63
- `Docs/lots/lot-3j.md` (douteux) : test tests/unit/interface-integree-retours.test.js:122
- `Docs/lots/lot-3m.md` (douteux) : test tests/unit/persos-integres-finitions.test.js:143
- `Docs/lots/lot-4c.md` (douteux) : test tests/unit/publication.test.js:672
- `Docs/lots/lot-5a.md` (douteux) : autre data/game/sounds-choix.json:727
- `Docs/lots/lot-5g.md` (douteux) : test tests/unit/publication.test.js:703
- `Docs/ref/affinage.md` (douteux) : conventions Docs/ref/conventions.md:313 ; conventions Docs/ref/conventions.md:385 ; seed Docs/seed.md:49 ; autre data/game/maps/rez-de-chaussee/ecarts-decisions.json:2 ; script scripts/modele/rapport.mjs:25 ; script scripts/modele/rapport.mjs:74 ; document qui reste Docs/ref/ecarts-modele.md:3 ; document qui reste Docs/ref/nettoyage-audit-annexe.md:88 ; historique : lot-3g.md, lot-5c.md
- `Docs/ref/atelier-interface.md` (douteux (document qui reste)) : document qui reste Docs/ref/fusion-3k.md:17 ; document qui reste Docs/ref/nettoyage-audit-annexe.md:36 ; document qui reste Docs/ref/nettoyage-audit-annexe.md:87 ; document qui reste Docs/ref/nettoyage-audit-annexe.md:88 ; document qui reste Docs/ref/passation-interface-4b.md:8 ; historique : lot-3k.md, lot-5c.md
- `Docs/ref/atelier-personnages.md` (douteux (document qui reste)) : document qui reste Docs/ref/fusion-3j.md:23 ; document qui reste Docs/ref/integration-personnages.md:5 ; document qui reste Docs/ref/nettoyage-audit-annexe.md:87 ; document qui reste Docs/ref/passation-personnages-4b.md:5 ; historique : lot-3j.md
- `Docs/ref/atelier-sons.md` (douteux) : conventions Docs/ref/conventions.md:319 ; document qui reste Docs/ref/nettoyage-audit-annexe.md:87 ; historique : lot-3h.md
- `Docs/ref/claude-md-consolidation.md` (douteux) : conventions Docs/ref/conventions.md:341 ; historique : lot-4g.md
- `Docs/ref/claude-md-v06.md` (douteux) : conventions Docs/ref/conventions.md:394 ; document qui reste Docs/ref/publication-versions.md:155 ; historique : lot-5f.md
- `Docs/ref/ecarts-modele.md` (douteux) : conventions Docs/ref/conventions.md:312 ; page ecarts.html:19 ; script scripts/modele/rapport.mjs:2 ; script scripts/modele/rapport.mjs:78 ; script scripts/modele/rapport.mjs:81 ; document qui reste Docs/ref/affinage.md:13 ; document qui reste Docs/ref/affinage.md:31 ; historique : lot-3g.md
- `Docs/ref/fusion-3j.md` (douteux) : test tests/unit/persos-jeu.test.js:218 ; document qui reste Docs/ref/atelier-personnages.md:3 ; document qui reste Docs/ref/integration-personnages.md:45 ; document qui reste Docs/ref/integration-personnages.md:61 ; document qui reste Docs/ref/nettoyage-audit-annexe.md:86 ; document qui reste Docs/ref/nettoyage-audit.md:76 ; document qui reste Docs/ref/passation-personnages-4b.md:5 ; document qui reste Docs/ref/personnages-integres.md:37 ; historique : lot-3j.md, lot-4b.md
- `Docs/ref/fusion-3k.md` (douteux) : script scripts/build.mjs:11 ; test tests/unit/interface-atelier-hygiene.test.js:39 ; document qui reste Docs/ref/atelier-interface.md:29 ; document qui reste Docs/ref/nettoyage-audit-annexe.md:86 ; document qui reste Docs/ref/nettoyage-audit.md:76 ; document qui reste Docs/ref/passation-interface-4b.md:8 ; document qui reste Docs/ref/passation-interface-4b.md:74 ; historique : lot-3k.md, lot-4b.md
- `Docs/ref/integration-interface.md` (douteux) : script scripts/interface/projection.mjs:16 ; document qui reste Docs/ref/atelier-interface.md:27 ; document qui reste Docs/ref/fusion-3k.md:14 ; document qui reste Docs/ref/fusion-3k.md:17 ; document qui reste Docs/ref/interface-integree.md:57 ; document qui reste Docs/ref/passation-interface-4b.md:8 ; historique : lot-3k.md
- `Docs/ref/integration-personnages.md` (douteux) : test tests/unit/persos-jeu.test.js:217 ; document qui reste Docs/ref/atelier-personnages.md:3 ; document qui reste Docs/ref/atelier-personnages.md:129 ; document qui reste Docs/ref/fusion-3j.md:23 ; document qui reste Docs/ref/nettoyage-audit-annexe.md:87 ; document qui reste Docs/ref/passation-personnages-4b.md:5 ; document qui reste Docs/ref/passation-personnages-4b.md:42 ; document qui reste Docs/ref/passation-personnages-4b.md:130 ; document qui reste Docs/ref/passation-personnages-4b.md:131 ; document qui reste Docs/ref/passation-personnages-4b.md:132 ; document qui reste Docs/ref/personnages-integres.md:3 ; historique : lot-5e.md
- `Docs/ref/integration-sons.md` (douteux (document qui reste)) : document qui reste Docs/ref/atelier-sons.md:180 ; document qui reste Docs/ref/sons-a-integrer.md:3 ; historique : lot-3h.md
- `Docs/ref/interface-a-integrer.md` (douteux) : conventions Docs/ref/conventions.md:327 ; code css/game-ui.css:2 ; test tests/unit/interface-integree-retours.test.js:15 ; document qui reste Docs/ref/interface-integree.md:3 ; historique : lot-3l.md, lot-4b.md
- `Docs/ref/interface-actuelle.md` (douteux (document qui reste)) : document qui reste Docs/ref/fusion-3k.md:17 ; document qui reste Docs/ref/integration-interface.md:3 ; document qui reste Docs/ref/nettoyage-audit-annexe.md:86 ; document qui reste Docs/ref/nettoyage-audit-annexe.md:110 ; document qui reste Docs/ref/nettoyage-audit.md:76 ; document qui reste Docs/ref/passation-interface-4b.md:8 ; historique : lot-3k.md, lot-5c.md
- `Docs/ref/nettoyage-audit-annexe.md` (douteux (document qui reste)) : document qui reste Docs/ref/nettoyage-audit.md:3
- `Docs/ref/nettoyage-audit.md` (douteux) : script scripts/nettoyage/auditer.mjs:565 ; document qui reste Docs/ref/nettoyage-audit-annexe.md:5 ; historique : lot-5c.md
- `Docs/ref/nettoyage-decisions.md` (douteux (document qui reste)) : document qui reste Docs/ref/nettoyage-audit.md:3 ; historique : lot-5c.md
- `Docs/ref/nettoyage-plan-ancien-decisions.md` (douteux (historique seulement)) : historique : lot-5e.md
- `Docs/ref/nettoyage-plan-ancien.md` (douteux (historique seulement)) : historique : lot-5e.md
- `Docs/ref/passation-interface-4b.md` (douteux) : code css/proto-b.css:5 ; test tests/unit/interface-integree-retours.test.js:1 ; document qui reste Docs/ref/integration-interface.md:53 ; document qui reste Docs/ref/interface-a-integrer.md:3 ; document qui reste Docs/ref/interface-integree.md:3 ; document qui reste Docs/ref/passation-personnages-4b.md:133 ; historique : lot-3k.md, lot-3l.md, lot-4b.md
- `Docs/ref/passation-personnages-4b.md` (douteux) : autre data/game/persos-choix.json:2 ; autre data/game/persos-choix.json:4 ; autre data/game/persos-choix.json:6 ; autre data/game/persos-choix.json:7 ; autre data/game/persos-choix.json:8 ; autre data/game/persos-choix.json:9 ; autre data/game/persos-choix.json:10 ; test tests/unit/interface-integree.test.js:340 ; test tests/unit/persos-donnees.test.js:9 ; test tests/unit/persos-integres.test.js:33 ; test tests/unit/persos-integres.test.js:44 ; test tests/unit/persos-jeu.test.js:25 ; test tests/unit/sons-integres.test.js:326 ; document qui reste Docs/ref/fusion-3j.md:3 ; document qui reste Docs/ref/personnages-integres.md:3 ; historique : lot-3j.md, lot-3m.md, lot-4b.md
- `Docs/ref/personnages-actuels.md` (douteux (document qui reste)) : document qui reste Docs/ref/fusion-3j.md:23 ; document qui reste Docs/ref/nettoyage-audit-annexe.md:86 ; document qui reste Docs/ref/nettoyage-audit-annexe.md:87 ; document qui reste Docs/ref/nettoyage-audit-annexe.md:110 ; document qui reste Docs/ref/nettoyage-audit.md:76 ; document qui reste Docs/ref/passation-personnages-4b.md:5 ; historique : lot-3j.md, lot-5c.md, lot-5e.md
- `Docs/ref/sons-a-integrer.md` (douteux) : autre data/game/sounds-choix.json:2 ; autre data/game/sounds-choix.json:3 ; autre data/game/sounds-choix.json:25 ; autre data/game/sounds-choix.json:46 ; autre data/game/sounds-choix.json:67 ; autre data/game/sounds-choix.json:88 ; autre data/game/sounds-choix.json:109 ; autre data/game/sounds-choix.json:130 ; autre data/game/sounds-choix.json:151 ; autre data/game/sounds-choix.json:175 ; autre data/game/sounds-choix.json:196 ; autre data/game/sounds-choix.json:217 ; autre data/game/sounds-choix.json:238 ; autre data/game/sounds-choix.json:259 ; autre data/game/sounds-choix.json:280 ; autre data/game/sounds-choix.json:301 ; autre data/game/sounds-choix.json:322 ; autre data/game/sounds-choix.json:343 ; autre data/game/sounds-choix.json:364 ; autre data/game/sounds-choix.json:385 ; autre data/game/sounds-choix.json:406 ; autre data/game/sounds-choix.json:427 ; autre data/game/sounds-choix.json:448 ; autre data/game/sounds-choix.json:469 ; autre data/game/sounds-choix.json:490 ; autre data/game/sounds-choix.json:511 ; autre data/game/sounds-choix.json:532 ; autre data/game/sounds-choix.json:553 ; autre data/game/sounds-choix.json:574 ; autre data/game/sounds-choix.json:595 ; autre data/game/sounds-choix.json:617 ; autre data/game/sounds-choix.json:639 ; autre data/game/sounds-choix.json:661 ; autre data/game/sounds-choix.json:683 ; autre data/game/sounds-choix.json:705 ; script scripts/sons/integrer.mjs:1 ; script scripts/sons/lister-integres.mjs:40 ; test tests/unit/sons-integres-ambiances.test.js:11 ; test tests/unit/sons-integres.test.js:19 ; test tests/unit/sons-integres.test.js:63 ; document qui reste Docs/ref/integration-sons.md:3 ; document qui reste Docs/ref/sons-integres.md:3 ; historique : lot-3h.md, lot-3i.md, lot-4b.md
- `Docs/ref/sons-actuels.md` (douteux) : script scripts/sons/lister-integres.mjs:40 ; document qui reste Docs/ref/atelier-sons.md:162 ; document qui reste Docs/ref/nettoyage-audit-annexe.md:86 ; document qui reste Docs/ref/nettoyage-audit-annexe.md:110 ; document qui reste Docs/ref/nettoyage-audit.md:76 ; document qui reste Docs/ref/sons-integres.md:3 ; historique : lot-3h.md, lot-5c.md, lot-5e.md
- `Docs/ref/tests-audit-annexe.md` (douteux) : script scripts/tests/resumer.mjs:5 ; script scripts/tests/resumer.mjs:18 ; document qui reste Docs/ref/tests-audit.md:3
- `Docs/ref/tests-audit.md` (douteux (document qui reste)) : document qui reste Docs/ref/tests-decisions.md:4 ; document qui reste Docs/ref/tests-paliers.md:3 ; historique : lot-4e.md
- `Docs/ref/tests-chargement.md` (douteux (document qui reste)) : document qui reste Docs/ref/nettoyage-audit-annexe.md:86 ; document qui reste Docs/ref/nettoyage-audit-annexe.md:88 ; historique : lot-4f.md, lot-5c.md
- `Docs/ref/tests-decisions.md` (douteux) : selection scripts/tests/classement.json:3 ; document qui reste Docs/ref/tests-paliers.md:3 ; historique : lot-4e.md
- `Docs/ref/tests-decisions.modele.md` (douteux (document qui reste)) : document qui reste Docs/ref/nettoyage-audit-annexe.md:86

Bilans (L1) : citations à corriger en partie B si le bilan est regroupé (CLAUDE.md, conventions.md, documents qui restent) :

- `Docs/lots/lot-1m.md` : Docs/ref/conventions.md:101
- `Docs/lots/lot-2.md` : Docs/ref/conventions.md:66
- `Docs/lots/lot-2c.md` : Docs/ref/conventions.md:79
- `Docs/lots/lot-3a.md` : Docs/ref/conventions.md:92
- `Docs/lots/lot-3e.md` : Docs/ref/etage.md:57
- `Docs/lots/lot-3j.md` : Docs/ref/fusion-3j.md:23 ; Docs/ref/fusion-3j.md:27 ; Docs/ref/passation-personnages-4b.md:5 ; Docs/ref/passation-personnages-4b.md:53 ; Docs/ref/passation-personnages-4b.md:107
- `Docs/lots/lot-3k.md` : Docs/ref/fusion-3k.md:17 ; Docs/ref/integration-interface.md:3 ; Docs/ref/passation-interface-4b.md:8
- `Docs/lots/lot-3l.md` : Docs/ref/interface-a-integrer.md:20
- `Docs/lots/lot-3m.md` : Docs/ref/personnages-integres.md:37 ; Docs/ref/personnages-integres.md:41
- `Docs/lots/lot-4b.md` : Docs/ref/conventions.md:306
- `Docs/lots/lot-4e.md` : Docs/ref/tests-paliers.md:107
- `Docs/lots/lot-5e.md` : Docs/ref/nettoyage-plan-ancien-decisions.md:29
- `Docs/lots/lot-5g.md` : Docs/ref/site-adresses.md:70

## Références entrantes hors bilans et journal (fichier:ligne)

- `Docs/lots/lot-1.md` : tests/unit/zones-hygiene.test.js:63 (test, chemin)
- `Docs/lots/lot-1m.md` : Docs/ref/conventions.md:101 (conventions, chemin)
- `Docs/lots/lot-2.md` : Docs/ref/conventions.md:66 (conventions, chemin) ; tests/unit/zones-hygiene.test.js:63 (test, chemin)
- `Docs/lots/lot-2b.md` : tests/unit/zones-hygiene.test.js:63 (test, chemin)
- `Docs/lots/lot-2c.md` : Docs/ref/conventions.md:79 (conventions, chemin) ; tests/unit/zones-hygiene.test.js:63 (test, chemin)
- `Docs/lots/lot-3.md` : tests/unit/zones-hygiene.test.js:63 (test, chemin)
- `Docs/lots/lot-3a.md` : Docs/ref/conventions.md:92 (conventions, chemin) ; tests/unit/zones-hygiene.test.js:63 (test, chemin)
- `Docs/lots/lot-3b.md` : tests/unit/zones-hygiene.test.js:63 (test, chemin)
- `Docs/lots/lot-3e.md` : Docs/ref/etage.md:57 (document, chemin)
- `Docs/lots/lot-3h.md` : tests/unit/atelier-sons-hygiene.test.js:61 (test, chemin ; donnée : titre d'un test qui lit data/changelog.json)
- `Docs/lots/lot-3j.md` : Docs/ref/fusion-3j.md:23 (document, chemin) ; Docs/ref/fusion-3j.md:27 (document, chemin) ; Docs/ref/passation-personnages-4b.md:5 (document, chemin) ; Docs/ref/passation-personnages-4b.md:53 (document, chemin) ; Docs/ref/passation-personnages-4b.md:107 (document, nom) ; tests/unit/interface-integree-retours.test.js:122 (test, chemin)
- `Docs/lots/lot-3k.md` : Docs/ref/fusion-3k.md:17 (document, chemin) ; Docs/ref/integration-interface.md:3 (document, chemin) ; Docs/ref/passation-interface-4b.md:8 (document, chemin)
- `Docs/lots/lot-3l.md` : Docs/ref/interface-a-integrer.md:20 (document, chemin)
- `Docs/lots/lot-3m.md` : Docs/ref/personnages-integres.md:37 (document, chemin) ; Docs/ref/personnages-integres.md:41 (document, chemin) ; tests/unit/persos-integres-finitions.test.js:143 (test, chemin)
- `Docs/lots/lot-4.md` : tests/unit/tests-audit.test.js:57 (test, chemin ; donnée : chaîne passée à une fonction pure (famille d'un chemin)) ; tests/unit/tests-selection.test.js:55 (test, chemin ; donnée : chaîne passée à une fonction pure (sélection))
- `Docs/lots/lot-4b.md` : Docs/ref/conventions.md:306 (conventions, chemin)
- `Docs/lots/lot-4c.md` : tests/unit/publication.test.js:672 (test, nom)
- `Docs/lots/lot-4e.md` : Docs/ref/tests-paliers.md:107 (document, chemin)
- `Docs/lots/lot-5a.md` : data/game/sounds-choix.json:727 (autre, chemin)
- `Docs/lots/lot-5e.md` : Docs/ref/nettoyage-plan-ancien-decisions.md:29 (document, chemin)
- `Docs/lots/lot-5g.md` : Docs/ref/site-adresses.md:70 (document, chemin) ; tests/unit/publication.test.js:703 (test, nom)
- `Docs/lots/lot-5k.md` : Docs/ref/lampes.md:3 (document, chemin) ; Docs/ref/lampes.md:64 (document, chemin)
- `Docs/ref/affinage.md` : Docs/ref/conventions.md:313 (conventions, chemin) ; Docs/ref/conventions.md:385 (conventions, chemin) ; Docs/ref/ecarts-modele.md:3 (document, chemin) ; Docs/ref/nettoyage-audit-annexe.md:88 (document, nom) ; Docs/seed.md:49 (seed, chemin) ; data/game/maps/rez-de-chaussee/ecarts-decisions.json:2 (autre, chemin) ; scripts/modele/rapport.mjs:25 (script, chemin) ; scripts/modele/rapport.mjs:74 (script, chemin)
- `Docs/ref/atelier-interface.md` : Docs/ref/fusion-3k.md:17 (document, nom) ; Docs/ref/nettoyage-audit-annexe.md:36 (document, chemin) ; Docs/ref/nettoyage-audit-annexe.md:87 (document, nom) ; Docs/ref/nettoyage-audit-annexe.md:88 (document, nom) ; Docs/ref/passation-interface-4b.md:8 (document, chemin)
- `Docs/ref/atelier-personnages.md` : Docs/ref/fusion-3j.md:23 (document, chemin) ; Docs/ref/integration-personnages.md:5 (document, chemin) ; Docs/ref/nettoyage-audit-annexe.md:87 (document, nom) ; Docs/ref/nettoyage-plan-ancien-annexe.md:9 (document, chemin) ; Docs/ref/nettoyage-plan-ancien-annexe.md:112 (document, nom) ; Docs/ref/passation-personnages-4b.md:5 (document, chemin)
- `Docs/ref/atelier-sons.md` : Docs/ref/conventions.md:319 (conventions, chemin) ; Docs/ref/nettoyage-audit-annexe.md:87 (document, nom) ; Docs/ref/nettoyage-plan-ancien-annexe.md:10 (document, chemin) ; Docs/ref/nettoyage-plan-ancien-annexe.md:112 (document, nom)
- `Docs/ref/claude-md-consolidation.md` : Docs/ref/conventions.md:341 (conventions, chemin) ; Docs/ref/nettoyage-plan-ancien-annexe.md:11 (document, chemin)
- `Docs/ref/claude-md-v06.md` : Docs/ref/conventions.md:394 (conventions, chemin) ; Docs/ref/publication-versions.md:155 (document, chemin)
- `Docs/ref/conventions.md` : CLAUDE.md:5 (claude, chemin) ; CLAUDE.md:10 (claude, nom) ; CLAUDE.md:63 (claude, nom) ; CLAUDE.md:64 (claude, nom) ; Docs/ref/claude-md-consolidation.md:5 (document, chemin) ; Docs/ref/claude-md-consolidation.md:11 (document, nom) ; Docs/ref/claude-md-consolidation.md:11 (document, nom) ; Docs/ref/claude-md-consolidation.md:16 (document, nom) ; Docs/ref/claude-md-consolidation.md:18 (document, nom) ; Docs/ref/claude-md-consolidation.md:19 (document, nom) ; Docs/ref/claude-md-consolidation.md:21 (document, nom) ; Docs/ref/claude-md-consolidation.md:22 (document, nom) ; Docs/ref/claude-md-consolidation.md:23 (document, nom) ; Docs/ref/claude-md-consolidation.md:33 (document, nom) ; Docs/ref/claude-md-consolidation.md:37 (document, nom) ; Docs/ref/claude-md-consolidation.md:37 (document, nom) ; Docs/ref/claude-md-consolidation.md:40 (document, nom) ; Docs/ref/claude-md-consolidation.md:40 (document, nom) ; Docs/ref/claude-md-consolidation.md:43 (document, nom) ; Docs/ref/claude-md-consolidation.md:44 (document, nom) ; Docs/ref/claude-md-consolidation.md:45 (document, nom) ; Docs/ref/claude-md-consolidation.md:45 (document, nom) ; Docs/ref/claude-md-consolidation.md:46 (document, nom) ; Docs/ref/claude-md-consolidation.md:46 (document, nom) ; Docs/ref/claude-md-consolidation.md:48 (document, nom) ; Docs/ref/claude-md-consolidation.md:48 (document, nom) ; Docs/ref/claude-md-consolidation.md:49 (document, nom) ; Docs/ref/claude-md-consolidation.md:50 (document, nom) ; Docs/ref/claude-md-consolidation.md:50 (document, nom) ; Docs/ref/claude-md-consolidation.md:51 (document, nom) ; Docs/ref/claude-md-consolidation.md:52 (document, nom) ; Docs/ref/claude-md-consolidation.md:53 (document, nom) ; Docs/ref/claude-md-consolidation.md:54 (document, nom) ; Docs/ref/claude-md-consolidation.md:55 (document, nom) ; Docs/ref/claude-md-consolidation.md:58 (document, nom) ; Docs/ref/claude-md-consolidation.md:58 (document, nom) ; Docs/ref/claude-md-consolidation.md:59 (document, nom) ; Docs/ref/claude-md-consolidation.md:59 (document, nom) ; Docs/ref/claude-md-consolidation.md:60 (document, nom) ; Docs/ref/claude-md-consolidation.md:60 (document, nom) ; Docs/ref/claude-md-consolidation.md:61 (document, nom) ; Docs/ref/claude-md-consolidation.md:61 (document, nom) ; Docs/ref/claude-md-consolidation.md:62 (document, nom) ; Docs/ref/claude-md-consolidation.md:62 (document, nom) ; Docs/ref/claude-md-consolidation.md:63 (document, nom) ; Docs/ref/claude-md-consolidation.md:63 (document, nom) ; Docs/ref/claude-md-consolidation.md:64 (document, nom) ; Docs/ref/claude-md-consolidation.md:64 (document, nom) ; Docs/ref/claude-md-consolidation.md:65 (document, nom) ; Docs/ref/claude-md-consolidation.md:65 (document, nom) ; Docs/ref/claude-md-consolidation.md:66 (document, nom) ; Docs/ref/claude-md-consolidation.md:67 (document, nom) ; Docs/ref/claude-md-consolidation.md:69 (document, nom) ; Docs/ref/claude-md-consolidation.md:69 (document, nom) ; Docs/ref/claude-md-consolidation.md:70 (document, nom) ; Docs/ref/claude-md-consolidation.md:71 (document, nom) ; Docs/ref/claude-md-consolidation.md:71 (document, nom) ; Docs/ref/claude-md-consolidation.md:72 (document, nom) ; Docs/ref/claude-md-consolidation.md:72 (document, nom) ; Docs/ref/claude-md-consolidation.md:74 (document, nom) ; Docs/ref/claude-md-consolidation.md:74 (document, nom) ; Docs/ref/claude-md-consolidation.md:75 (document, nom) ; Docs/ref/claude-md-consolidation.md:75 (document, nom) ; Docs/ref/claude-md-consolidation.md:76 (document, nom) ; Docs/ref/claude-md-consolidation.md:76 (document, nom) ; Docs/ref/claude-md-consolidation.md:77 (document, nom) ; Docs/ref/claude-md-consolidation.md:78 (document, nom) ; Docs/ref/claude-md-consolidation.md:78 (document, nom) ; Docs/ref/claude-md-consolidation.md:79 (document, nom) ; Docs/ref/claude-md-consolidation.md:79 (document, nom) ; Docs/ref/claude-md-consolidation.md:80 (document, nom) ; Docs/ref/claude-md-consolidation.md:81 (document, nom) ; Docs/ref/claude-md-consolidation.md:82 (document, nom) ; Docs/ref/claude-md-consolidation.md:82 (document, nom) ; Docs/ref/claude-md-consolidation.md:83 (document, nom) ; Docs/ref/claude-md-consolidation.md:87 (document, nom) ; Docs/ref/claude-md-consolidation.md:94 (document, nom) ; Docs/ref/claude-md-consolidation.md:94 (document, nom) ; Docs/ref/claude-md-v06.md:3 (document, chemin) ; Docs/ref/claude-md-v06.md:6 (document, nom) ; Docs/ref/claude-md-v06.md:9 (document, nom) ; Docs/ref/claude-md-v06.md:16 (document, nom) ; Docs/ref/claude-md-v06.md:17 (document, nom) ; Docs/ref/claude-md-v06.md:18 (document, nom) ; Docs/ref/claude-md-v06.md:19 (document, nom) ; Docs/ref/claude-md-v06.md:20 (document, nom) ; Docs/ref/claude-md-v06.md:21 (document, nom) ; Docs/ref/claude-md-v06.md:22 (document, nom) ; Docs/ref/claude-md-v06.md:23 (document, nom) ; Docs/ref/claude-md-v06.md:24 (document, nom) ; Docs/ref/claude-md-v06.md:25 (document, nom) ; Docs/ref/claude-md-v06.md:26 (document, nom) ; Docs/ref/claude-md-v06.md:27 (document, nom) ; Docs/ref/claude-md-v06.md:28 (document, nom) ; Docs/ref/claude-md-v06.md:29 (document, nom) ; Docs/ref/claude-md-v06.md:30 (document, nom) ; Docs/ref/claude-md-v06.md:31 (document, nom) ; Docs/ref/claude-md-v06.md:32 (document, nom) ; Docs/ref/claude-md-v06.md:33 (document, nom) ; Docs/ref/claude-md-v06.md:34 (document, nom) ; Docs/ref/claude-md-v06.md:41 (document, nom) ; Docs/ref/claude-md-v06.md:47 (document, nom) ; Docs/ref/claude-md-v06.md:70 (document, nom) ; Docs/ref/claude-md-v06.md:75 (document, nom) ; Docs/ref/fusion-3j.md:21 (document, chemin) ; Docs/ref/nettoyage-audit-annexe.md:26 (document, chemin) ; Docs/ref/nettoyage-audit-annexe.md:62 (document, nom) ; Docs/ref/nettoyage-audit-annexe.md:86 (document, nom) ; Docs/ref/nettoyage-audit-annexe.md:88 (document, nom) ; Docs/ref/nettoyage-audit-annexe.md:88 (document, nom) ; Docs/ref/nettoyage-audit-annexe.md:89 (document, nom) ; Docs/ref/nettoyage-audit-annexe.md:89 (document, nom) ; Docs/ref/nettoyage-decisions.md:15 (document, chemin) ; Docs/ref/nettoyage-plan-ancien-annexe.md:12 (document, chemin) ; Docs/ref/nettoyage-plan-ancien-annexe.md:112 (document, chemin) ; Docs/ref/nettoyage-plan-ancien-decisions.md:18 (document, chemin) ; Docs/ref/passation-personnages-4b.md:3 (document, nom) ; Docs/ref/passation-personnages-4b.md:35 (document, nom) ; Docs/ref/passation-personnages-4b.md:113 (document, chemin) ; Docs/ref/tests-audit-annexe.md:377 (document, nom) ; Docs/ref/tests-chargement.md:3 (document, chemin) ; Docs/seed.md:132 (seed, chemin) ; scripts/nettoyage/auditer.mjs:73 (script, chemin) ; tests/unit/atelier-hygiene.test.js:79 (test, nom) ; tests/unit/atelier-sons-hygiene.test.js:33 (test, chemin) ; tests/unit/interface-integree.test.js:341 (test, chemin) ; tests/unit/persos-donnees.test.js:90 (test, chemin) ; tests/unit/persos-integres.test.js:302 (test, chemin) ; tests/unit/publication.test.js:671 (test, nom) ; tests/unit/publication.test.js:673 (test, chemin) ; tests/unit/publication.test.js:702 (test, nom) ; tests/unit/publication.test.js:704 (test, chemin) ; tests/unit/sons-integres.test.js:327 (test, chemin) ; tests/unit/structure.test.js:6 (test, chemin)
- `Docs/ref/debug.md` : Docs/ref/options-graphiques.md:41 (document, chemin) ; Docs/ref/site-adresses.md:3 (document, chemin) ; jeu.html:8 (page, chemin) ; js/core/graphics.js:456 (code, chemin) ; js/game/debug-menu.js:2 (code, chemin) ; js/game/graphics-boot.js:6 (code, chemin) ; js/game/main.js:57 (code, chemin) ; scripts/assemble.mjs:15 (script, chemin) ; tests/e2e/canal.spec.js:4 (test, chemin) ; tests/unit/debug-canal.test.js:3 (test, chemin) ; tests/unit/debug-menu.test.js:3 (test, chemin)
- `Docs/ref/ecarts-modele.md` : Docs/ref/affinage.md:13 (document, chemin) ; Docs/ref/affinage.md:31 (document, chemin) ; Docs/ref/conventions.md:312 (conventions, chemin) ; ecarts.html:19 (page, chemin) ; scripts/modele/rapport.mjs:2 (script, chemin) ; scripts/modele/rapport.mjs:78 (script, chemin) ; scripts/modele/rapport.mjs:81 (script, chemin)
- `Docs/ref/environnement.md` : CLAUDE.md:12 (claude, chemin) ; Docs/ref/conventions.md:143 (conventions, chemin) ; tests/unit/structure.test.js:6 (test, chemin)
- `Docs/ref/etage.md` : CLAUDE.md:59 (claude, chemin) ; Docs/ref/affinage.md:6 (document, chemin) ; Docs/ref/conventions.md:260 (conventions, chemin) ; Docs/ref/conventions.md:280 (conventions, chemin) ; Docs/ref/conventions.md:376 (conventions, chemin) ; Docs/ref/nettoyage-plan-ancien-annexe.md:13 (document, chemin) ; Docs/seed.md:49 (seed, chemin) ; data/game/maps/rez-de-chaussee/etage.json:2 (autre, chemin) ; js/core/releve.js:11 (code, chemin) ; tests/unit/etage-donnees.test.js:21 (test, chemin) ; tests/unit/etage-donnees.test.js:22 (test, chemin)
- `Docs/ref/fusion-3j.md` : Docs/ref/atelier-personnages.md:3 (document, chemin) ; Docs/ref/integration-personnages.md:45 (document, chemin) ; Docs/ref/integration-personnages.md:61 (document, chemin) ; Docs/ref/nettoyage-audit-annexe.md:86 (document, nom) ; Docs/ref/nettoyage-audit.md:76 (document, nom) ; Docs/ref/nettoyage-plan-ancien-annexe.md:14 (document, chemin) ; Docs/ref/passation-personnages-4b.md:5 (document, chemin) ; Docs/ref/personnages-integres.md:37 (document, chemin) ; tests/unit/persos-jeu.test.js:218 (test, chemin)
- `Docs/ref/fusion-3k.md` : Docs/ref/atelier-interface.md:29 (document, chemin) ; Docs/ref/nettoyage-audit-annexe.md:86 (document, nom) ; Docs/ref/nettoyage-audit.md:76 (document, nom) ; Docs/ref/passation-interface-4b.md:8 (document, chemin) ; Docs/ref/passation-interface-4b.md:74 (document, chemin) ; scripts/build.mjs:11 (script, chemin) ; tests/unit/interface-atelier-hygiene.test.js:39 (test, chemin)
- `Docs/ref/integration-interface.md` : Docs/ref/atelier-interface.md:27 (document, chemin) ; Docs/ref/fusion-3k.md:14 (document, nom) ; Docs/ref/fusion-3k.md:17 (document, nom) ; Docs/ref/interface-integree.md:57 (document, chemin) ; Docs/ref/passation-interface-4b.md:8 (document, chemin) ; scripts/interface/projection.mjs:16 (script, chemin)
- `Docs/ref/integration-personnages.md` : Docs/ref/atelier-personnages.md:3 (document, chemin) ; Docs/ref/atelier-personnages.md:129 (document, chemin) ; Docs/ref/fusion-3j.md:23 (document, nom) ; Docs/ref/nettoyage-audit-annexe.md:87 (document, nom) ; Docs/ref/nettoyage-plan-ancien-annexe.md:15 (document, chemin) ; Docs/ref/nettoyage-plan-ancien-annexe.md:112 (document, nom) ; Docs/ref/passation-personnages-4b.md:5 (document, chemin) ; Docs/ref/passation-personnages-4b.md:42 (document, nom) ; Docs/ref/passation-personnages-4b.md:130 (document, nom) ; Docs/ref/passation-personnages-4b.md:131 (document, nom) ; Docs/ref/passation-personnages-4b.md:132 (document, nom) ; Docs/ref/personnages-integres.md:3 (document, chemin) ; tests/unit/persos-jeu.test.js:217 (test, chemin)
- `Docs/ref/integration-sons.md` : Docs/ref/atelier-sons.md:180 (document, chemin) ; Docs/ref/sons-a-integrer.md:3 (document, chemin)
- `Docs/ref/interface-a-integrer.md` : Docs/ref/conventions.md:327 (conventions, chemin) ; Docs/ref/interface-integree.md:3 (document, chemin) ; css/game-ui.css:2 (code, chemin) ; tests/unit/interface-integree-retours.test.js:15 (test, chemin)
- `Docs/ref/interface-actuelle.md` : Docs/ref/fusion-3k.md:17 (document, chemin) ; Docs/ref/integration-interface.md:3 (document, chemin) ; Docs/ref/nettoyage-audit-annexe.md:86 (document, nom) ; Docs/ref/nettoyage-audit-annexe.md:110 (document, chemin) ; Docs/ref/nettoyage-audit.md:76 (document, chemin) ; Docs/ref/passation-interface-4b.md:8 (document, chemin)
- `Docs/ref/interface-integree.md` : Docs/ref/conventions.md:327 (conventions, chemin) ; Docs/ref/interface-a-integrer.md:20 (document, chemin) ; css/game-ui.css:3 (code, chemin) ; tests/unit/interface-integree.test.js:197 (test, chemin) ; tests/unit/interface-integree.test.js:198 (test, chemin) ; tests/unit/interface-integree.test.js:207 (test, chemin) ; tests/unit/interface-integree.test.js:207 (test, chemin)
- `Docs/ref/lampes.md` : Docs/ref/options-graphiques.md:30 (document, chemin) ; data/game/lumieres.json:2 (autre, chemin) ; data/game/maps/rez-de-chaussee/lampes.json:2 (autre, chemin)
- `Docs/ref/nettoyage-audit-annexe.md` : Docs/ref/nettoyage-audit.md:3 (document, chemin)
- `Docs/ref/nettoyage-audit.md` : Docs/ref/nettoyage-audit-annexe.md:5 (document, chemin) ; scripts/nettoyage/auditer.mjs:565 (script, chemin)
- `Docs/ref/nettoyage-decisions.md` : Docs/ref/nettoyage-audit.md:3 (document, chemin)
- `Docs/ref/nettoyage-plan-ancien-annexe.md` : Docs/ref/nettoyage-plan-ancien.md:3 (document, nom)
- `Docs/ref/nettoyage-plan-ancien-decisions.md` : Docs/ref/nettoyage-plan-ancien.md:3 (document, chemin)
- `Docs/ref/nettoyage-plan-ancien.md` : Docs/ref/nettoyage-plan-ancien-annexe.md:3 (document, chemin)
- `Docs/ref/options-graphiques.md` : Docs/ref/lampes.md:3 (document, chemin) ; Docs/ref/menu-debogage-proposition.md:78 (document, chemin) ; data/game/graphics.json:4 (autre, chemin)
- `Docs/ref/passation-interface-4b.md` : Docs/ref/integration-interface.md:53 (document, chemin) ; Docs/ref/interface-a-integrer.md:3 (document, chemin) ; Docs/ref/interface-integree.md:3 (document, chemin) ; Docs/ref/passation-personnages-4b.md:133 (document, nom) ; css/proto-b.css:5 (code, chemin) ; tests/unit/interface-integree-retours.test.js:1 (test, chemin)
- `Docs/ref/passation-personnages-4b.md` : Docs/ref/fusion-3j.md:3 (document, chemin) ; Docs/ref/nettoyage-plan-ancien-annexe.md:16 (document, chemin) ; Docs/ref/nettoyage-plan-ancien-annexe.md:112 (document, nom) ; Docs/ref/personnages-integres.md:3 (document, chemin) ; data/game/persos-choix.json:2 (autre, chemin) ; data/game/persos-choix.json:4 (autre, nom) ; data/game/persos-choix.json:6 (autre, nom) ; data/game/persos-choix.json:7 (autre, nom) ; data/game/persos-choix.json:8 (autre, nom) ; data/game/persos-choix.json:9 (autre, nom) ; data/game/persos-choix.json:10 (autre, nom) ; tests/unit/interface-integree.test.js:340 (test, nom) ; tests/unit/persos-donnees.test.js:9 (test, chemin) ; tests/unit/persos-integres.test.js:33 (test, nom) ; tests/unit/persos-integres.test.js:44 (test, nom) ; tests/unit/persos-jeu.test.js:25 (test, chemin) ; tests/unit/sons-integres.test.js:326 (test, chemin)
- `Docs/ref/performance.md` : Docs/ref/nettoyage-audit-annexe.md:88 (document, nom) ; Docs/ref/nettoyage-plan-ancien-annexe.md:17 (document, chemin) ; scripts/perf/mesurer.mjs:3 (script, chemin) ; scripts/perf/mesurer.mjs:39 (script, chemin)
- `Docs/ref/personnages-actuels.md` : Docs/ref/fusion-3j.md:23 (document, nom) ; Docs/ref/nettoyage-audit-annexe.md:86 (document, nom) ; Docs/ref/nettoyage-audit-annexe.md:87 (document, nom) ; Docs/ref/nettoyage-audit-annexe.md:110 (document, nom) ; Docs/ref/nettoyage-audit.md:76 (document, nom) ; Docs/ref/nettoyage-plan-ancien-annexe.md:18 (document, chemin) ; Docs/ref/nettoyage-plan-ancien-decisions.md:15 (document, chemin) ; Docs/ref/nettoyage-plan-ancien.md:54 (document, chemin) ; Docs/ref/passation-personnages-4b.md:5 (document, chemin)
- `Docs/ref/personnages-integres.md` : Docs/ref/atelier-personnages.md:112 (document, chemin) ; Docs/ref/atelier-personnages.md:113 (document, chemin) ; Docs/ref/atelier-personnages.md:118 (document, chemin) ; Docs/ref/conventions.md:331 (conventions, chemin) ; Docs/ref/conventions.md:357 (conventions, chemin) ; Docs/ref/nettoyage-plan-ancien-annexe.md:19 (document, chemin) ; Docs/ref/nettoyage-plan-ancien-annexe.md:112 (document, nom) ; Docs/ref/nettoyage-plan-ancien-decisions.md:16 (document, chemin) ; tests/unit/persos-integres-finitions.test.js:148 (test, chemin)
- `Docs/ref/publication-versions.md` : Docs/ref/claude-md-v06.md:76 (document, chemin) ; Docs/ref/conventions.md:420 (conventions, chemin) ; Docs/ref/nettoyage-audit-annexe.md:87 (document, nom) ; Docs/ref/nettoyage-plan-ancien-annexe.md:112 (document, nom) ; Docs/ref/site-adresses.md:69 (document, chemin) ; Docs/seed.md:122 (seed, chemin)
- `Docs/ref/site-adresses.md` : CLAUDE.md:16 (claude, chemin) ; Docs/ref/claude-md-v06.md:76 (document, nom) ; Docs/ref/conventions.md:26 (conventions, chemin) ; Docs/ref/conventions.md:102 (conventions, chemin) ; Docs/ref/conventions.md:142 (conventions, chemin) ; Docs/ref/conventions.md:219 (conventions, chemin) ; Docs/ref/conventions.md:220 (conventions, chemin) ; Docs/ref/conventions.md:343 (conventions, chemin) ; Docs/ref/conventions.md:397 (conventions, chemin) ; Docs/ref/conventions.md:415 (conventions, chemin) ; Docs/ref/publication-versions.md:3 (document, chemin) ; Docs/ref/publication-versions.md:5 (document, chemin) ; Docs/seed.md:122 (seed, chemin)
- `Docs/ref/sons-a-integrer.md` : Docs/ref/integration-sons.md:3 (document, chemin) ; Docs/ref/nettoyage-plan-ancien-annexe.md:20 (document, chemin) ; Docs/ref/sons-integres.md:3 (document, chemin) ; data/game/sounds-choix.json:2 (autre, chemin) ; data/game/sounds-choix.json:3 (autre, chemin) ; data/game/sounds-choix.json:25 (autre, nom) ; data/game/sounds-choix.json:46 (autre, nom) ; data/game/sounds-choix.json:67 (autre, nom) ; data/game/sounds-choix.json:88 (autre, nom) ; data/game/sounds-choix.json:109 (autre, nom) ; data/game/sounds-choix.json:130 (autre, nom) ; data/game/sounds-choix.json:151 (autre, nom) ; data/game/sounds-choix.json:175 (autre, nom) ; data/game/sounds-choix.json:196 (autre, nom) ; data/game/sounds-choix.json:217 (autre, nom) ; data/game/sounds-choix.json:238 (autre, nom) ; data/game/sounds-choix.json:259 (autre, nom) ; data/game/sounds-choix.json:280 (autre, nom) ; data/game/sounds-choix.json:301 (autre, nom) ; data/game/sounds-choix.json:322 (autre, nom) ; data/game/sounds-choix.json:343 (autre, nom) ; data/game/sounds-choix.json:364 (autre, nom) ; data/game/sounds-choix.json:385 (autre, nom) ; data/game/sounds-choix.json:406 (autre, nom) ; data/game/sounds-choix.json:427 (autre, nom) ; data/game/sounds-choix.json:448 (autre, nom) ; data/game/sounds-choix.json:469 (autre, nom) ; data/game/sounds-choix.json:490 (autre, nom) ; data/game/sounds-choix.json:511 (autre, nom) ; data/game/sounds-choix.json:532 (autre, nom) ; data/game/sounds-choix.json:553 (autre, nom) ; data/game/sounds-choix.json:574 (autre, nom) ; data/game/sounds-choix.json:595 (autre, nom) ; data/game/sounds-choix.json:617 (autre, nom) ; data/game/sounds-choix.json:639 (autre, nom) ; data/game/sounds-choix.json:661 (autre, nom) ; data/game/sounds-choix.json:683 (autre, nom) ; data/game/sounds-choix.json:705 (autre, nom) ; scripts/sons/integrer.mjs:1 (script, chemin) ; scripts/sons/lister-integres.mjs:40 (script, chemin) ; tests/unit/sons-integres-ambiances.test.js:11 (test, chemin) ; tests/unit/sons-integres.test.js:19 (test, chemin) ; tests/unit/sons-integres.test.js:63 (test, nom)
- `Docs/ref/sons-actuels.md` : Docs/ref/atelier-sons.md:162 (document, chemin) ; Docs/ref/nettoyage-audit-annexe.md:86 (document, nom) ; Docs/ref/nettoyage-audit-annexe.md:110 (document, nom) ; Docs/ref/nettoyage-audit.md:76 (document, nom) ; Docs/ref/nettoyage-plan-ancien-annexe.md:21 (document, chemin) ; Docs/ref/nettoyage-plan-ancien-decisions.md:15 (document, chemin) ; Docs/ref/nettoyage-plan-ancien.md:54 (document, nom) ; Docs/ref/sons-integres.md:3 (document, chemin) ; scripts/sons/lister-integres.mjs:40 (script, chemin)
- `Docs/ref/sons-integres.md` : Docs/ref/nettoyage-audit-annexe.md:60 (document, chemin) ; Docs/ref/nettoyage-plan-ancien-annexe.md:22 (document, chemin) ; Docs/ref/nettoyage-plan-ancien-annexe.md:112 (document, nom) ; Docs/ref/nettoyage-plan-ancien-decisions.md:17 (document, chemin) ; scripts/sons/lister-integres.mjs:3 (script, chemin) ; scripts/sons/lister-integres.mjs:4 (script, chemin) ; scripts/sons/lister-integres.mjs:60 (script, chemin) ; scripts/sons/lister-integres.mjs:61 (script, chemin)
- `Docs/ref/tests-audit-annexe.md` : Docs/ref/nettoyage-plan-ancien-annexe.md:23 (document, chemin) ; Docs/ref/tests-audit.md:3 (document, chemin) ; scripts/tests/resumer.mjs:5 (script, chemin) ; scripts/tests/resumer.mjs:18 (script, chemin)
- `Docs/ref/tests-audit.md` : Docs/ref/tests-decisions.md:4 (document, nom) ; Docs/ref/tests-paliers.md:3 (document, chemin)
- `Docs/ref/tests-chargement.md` : Docs/ref/nettoyage-audit-annexe.md:86 (document, nom) ; Docs/ref/nettoyage-audit-annexe.md:88 (document, nom) ; Docs/ref/nettoyage-plan-ancien-annexe.md:24 (document, chemin) ; Docs/ref/nettoyage-plan-ancien-annexe.md:112 (document, nom)
- `Docs/ref/tests-decisions.md` : Docs/ref/tests-paliers.md:3 (document, chemin) ; scripts/tests/classement.json:3 (selection, chemin)
- `Docs/ref/tests-decisions.modele.md` : Docs/ref/nettoyage-audit-annexe.md:86 (document, nom)
- `Docs/ref/tests-paliers.md` : .github/workflows/tests.yml:3 (workflow, chemin) ; CLAUDE.md:13 (claude, chemin) ; Docs/ref/conventions.md:390 (conventions, chemin) ; Docs/ref/nettoyage-plan-ancien-annexe.md:112 (document, nom) ; scripts/tests/compter.mjs:2 (script, chemin) ; tests/unit/tests-selection.test.js:60 (test, chemin ; donnée : chaîne passée à une fonction pure (sélection))
- `Docs/ref/verification-versions.md` : Docs/ref/nettoyage-audit-annexe.md:87 (document, nom) ; Docs/ref/nettoyage-plan-ancien-annexe.md:25 (document, chemin) ; Docs/ref/publication-versions.md:11 (document, chemin) ; Docs/ref/publication-versions.md:93 (document, nom) ; Docs/ref/publication-versions.md:152 (document, nom) ; Docs/ref/site-adresses.md:69 (document, chemin)
- `Docs/ref/versions-correspondance.md` : Docs/ref/publication-versions.md:11 (document, chemin) ; Docs/ref/publication-versions.md:80 (document, nom)

## Citations par les bilans et le journal (nombre)

- `Docs/lots/lot-0b.md` : 1 (lot-0.md)
- `Docs/lots/lot-0c.md` : 1 (lot-0.md)
- `Docs/lots/lot-0d.md` : 1 (lot-0.md)
- `Docs/lots/lot-3g.md` : 2 (lot-4b.md)
- `Docs/lots/lot-3h.md` : 2 (lot-4b.md)
- `Docs/lots/lot-3i.md` : 2 (lot-4b.md)
- `Docs/lots/lot-3j.md` : 1 (lot-4b.md)
- `Docs/lots/lot-3k.md` : 2 (lot-4b.md)
- `Docs/lots/lot-3l.md` : 2 (lot-4b.md)
- `Docs/lots/lot-3m.md` : 2 (lot-4b.md)
- `Docs/lots/lot-5i.md` : 1 (lot-5j.md)
- `Docs/lots/lot-5j.md` : 1 (lot-5k.md)
- `Docs/ref/affinage.md` : 4 (lot-3g.md, lot-5c.md)
- `Docs/ref/atelier-interface.md` : 2 (lot-3k.md, lot-5c.md)
- `Docs/ref/atelier-personnages.md` : 1 (lot-3j.md)
- `Docs/ref/atelier-sons.md` : 3 (lot-3h.md)
- `Docs/ref/claude-md-consolidation.md` : 2 (lot-4g.md)
- `Docs/ref/claude-md-v06.md` : 2 (lot-5f.md)
- `Docs/ref/conventions.md` : 52 (lot-0.md, lot-1.md, lot-1m.md, lot-2c.md, lot-3a.md, lot-3b.md, lot-3e.md, lot-3g.md, lot-3h.md, lot-3i.md, lot-3j.md, lot-3l.md, lot-3m.md, lot-4b.md, lot-4c.md, lot-4e.md, lot-4g.md, lot-5a.md, lot-5b.md, lot-5c.md, lot-5d.md, lot-5f.md, lot-5g.md, lot-5h.md, lot-5i.md, lot-5j.md, lot-5k.md, lot-5l.md)
- `Docs/ref/debug.md` : 2 (lot-5l.md)
- `Docs/ref/ecarts-modele.md` : 1 (lot-3g.md)
- `Docs/ref/environnement.md` : 2 (lot-0.md, lot-4g.md)
- `Docs/ref/etage.md` : 2 (lot-3e.md)
- `Docs/ref/fusion-3j.md` : 3 (lot-3j.md, lot-4b.md)
- `Docs/ref/fusion-3k.md` : 3 (lot-3k.md, lot-4b.md)
- `Docs/ref/integration-interface.md` : 3 (lot-3k.md)
- `Docs/ref/integration-personnages.md` : 1 (lot-5e.md)
- `Docs/ref/integration-sons.md` : 2 (lot-3h.md)
- `Docs/ref/interface-a-integrer.md` : 3 (lot-3l.md, lot-4b.md)
- `Docs/ref/interface-actuelle.md` : 2 (lot-3k.md, lot-5c.md)
- `Docs/ref/interface-integree.md` : 3 (lot-3l.md, lot-4b.md)
- `Docs/ref/lampes.md` : 4 (lot-5k.md)
- `Docs/ref/nettoyage-audit.md` : 1 (lot-5c.md)
- `Docs/ref/nettoyage-decisions.md` : 1 (lot-5c.md)
- `Docs/ref/nettoyage-plan-ancien-decisions.md` : 1 (lot-5e.md)
- `Docs/ref/nettoyage-plan-ancien.md` : 1 (lot-5e.md)
- `Docs/ref/options-graphiques.md` : 4 (lot-5j.md, lot-5k.md)
- `Docs/ref/passation-interface-4b.md` : 3 (lot-3k.md, lot-3l.md, lot-4b.md)
- `Docs/ref/passation-personnages-4b.md` : 4 (lot-3j.md, lot-3m.md, lot-4b.md)
- `Docs/ref/performance.md` : 7 (lot-5b.md, lot-5c.md, lot-5d.md)
- `Docs/ref/personnages-actuels.md` : 3 (lot-3j.md, lot-5c.md, lot-5e.md)
- `Docs/ref/personnages-integres.md` : 4 (lot-3m.md, lot-4b.md, lot-5e.md)
- `Docs/ref/publication-versions.md` : 6 (lot-4c.md, lot-4g.md, lot-5f.md, lot-5h.md, lot-5i.md)
- `Docs/ref/site-adresses.md` : 4 (lot-5f.md, lot-5g.md, lot-5h.md, lot-5i.md)
- `Docs/ref/sons-a-integrer.md` : 3 (lot-3h.md, lot-3i.md, lot-4b.md)
- `Docs/ref/sons-actuels.md` : 4 (lot-3h.md, lot-5c.md, lot-5e.md)
- `Docs/ref/sons-integres.md` : 3 (lot-3i.md, lot-4b.md)
- `Docs/ref/tests-audit.md` : 1 (lot-4e.md)
- `Docs/ref/tests-chargement.md` : 3 (lot-4f.md, lot-5c.md)
- `Docs/ref/tests-decisions.md` : 1 (lot-4e.md)
- `Docs/ref/tests-paliers.md` : 4 (lot-4e.md, lot-4f.md, lot-4g.md)
- `Docs/ref/verification-versions.md` : 3 (lot-4c.md, lot-5f.md)
- `Docs/ref/versions-correspondance.md` : 1 (lot-4c.md)

## Motifs dynamiques

| Lieu | Motif | Forme | Lecture | Portée | Documents visés |
|---|---|---|---|---|---|
| `.github/workflows/tests.yml:19` | `Docs/**` | glob | non (déclencheur : la documentation seule ne lance rien) | dossier entier | 91 |
| `.github/workflows/tests.yml:21` | `Docs/**` | glob | non (déclencheur : la documentation seule ne lance rien) | dossier entier | 91 |
| `scripts/nettoyage/auditer.mjs:69` | `Docs/lots/**` | glob | non (outil d'audit du lot 5c : inventorie ou exclut les documents, ne dépend d'aucun) | dossier entier | 43 |
| `scripts/nettoyage/auditer.mjs:125` | `Docs/` | dossier | non (outil d'audit du lot 5c : inventorie ou exclut les documents, ne dépend d'aucun) | dossier entier | 91 |
| `scripts/nettoyage/auditer.mjs:417` | `Docs/` | dossier | non (outil d'audit du lot 5c : inventorie ou exclut les documents, ne dépend d'aucun) | dossier entier | 91 |
| `scripts/nettoyage/auditer.mjs:452` | `Docs/ref/` | dossier | non (outil d'audit du lot 5c : inventorie ou exclut les documents, ne dépend d'aucun) | dossier entier | 48 |
| `scripts/nettoyage/auditer.mjs:458` | `Docs/lots/` | dossier | non (outil d'audit du lot 5c : inventorie ou exclut les documents, ne dépend d'aucun) | dossier entier | 43 |
| `scripts/nettoyage/auditer.mjs:467` | `Docs/ref/` | dossier | non (outil d'audit du lot 5c : inventorie ou exclut les documents, ne dépend d'aucun) | dossier entier | 48 |
| `scripts/nettoyage/auditer.mjs:473` | `Docs/lots/` | dossier | non (outil d'audit du lot 5c : inventorie ou exclut les documents, ne dépend d'aucun) | dossier entier | 43 |
| `scripts/nettoyage/auditer.mjs:473` | `Docs/lots/` | dossier | non (outil d'audit du lot 5c : inventorie ou exclut les documents, ne dépend d'aucun) | dossier entier | 43 |
| `scripts/nettoyage/auditer.mjs:519` | `Docs/` | dossier | non (outil d'audit du lot 5c : inventorie ou exclut les documents, ne dépend d'aucun) | dossier entier | 91 |
| `scripts/nettoyage/inventaire-ancien.mjs:135` | `Docs/lots/` | dossier | non (classement « historique » par préfixe) | dossier entier | 43 |
| `scripts/site/e2e-site.mjs:21` | `Docs` | dossier | non (dossiers ignorés par le serveur de test (exclusion)) | dossier entier | 91 |
| `scripts/tests/lib/selection.mjs:10` | `Docs/**` | glob | non (classement par défaut « documentation seule ») | dossier entier | 91 |
| `tests/selection.json:246` | `Docs/**` | glob | non (classement « documentation seule » (aucune lecture de contenu)) | dossier entier | 91 |
| `tests/selection.json:247` | `Docs/ref/tests-*.md` | glob | non (classement « documentation seule » (aucune lecture de contenu)) | nominative | 6 |
| `tests/selection.json:959` | `Docs/ref/tests-*.md` | glob | non (motif de zone : reste valable sans ce fichier (classement, aucune lecture)) | nominative | 6 |
| `tests/unit/build.test.js:18` | `Docs` | dossier | non (chemins interdits dans le build (absence vérifiée)) | dossier entier | 91 |
| `tests/unit/data-changelog.test.js:33` | `Docs/lots/` | dossier | oui | dossier entier | 43 |
| `tests/unit/data-changelog.test.js:34` | `Docs/lots` | dossier | oui | dossier entier | 43 |
| `tests/unit/lot1-regles.test.js:83` | `Docs/ref` | dossier | oui | dossier entier | 48 |
| `tests/unit/persos-donnees.test.js:96` | `Docs/lots` | dossier | oui | dossier entier | 43 |
| `tests/unit/persos-jeu.test.js:230` | `Docs/` | dossier | non (exclusion d'une liste de fichiers modifiés) | dossier entier | 91 |
| `tests/unit/publication.test.js:672` | `Docs/lots` | dossier | oui | dossier entier | 43 |
| `tests/unit/publication.test.js:672` | `Docs/lots/${f}` | gabarit | oui | dossier entier | 43 |
| `tests/unit/publication.test.js:703` | `Docs/lots` | dossier | oui | dossier entier | 43 |
| `tests/unit/publication.test.js:703` | `Docs/lots/${f}` | gabarit | oui | dossier entier | 43 |
| `tests/unit/structure.test.js:7` | `Docs/lots` | dossier | oui | dossier entier | 43 |
| `tests/unit/structure.test.js:21` | `Docs/lots` | dossier | oui | dossier entier | 43 |
| `tests/unit/tests-selection.test.js:14` | `Docs/**` | glob | non (table de sélection d'essai (données)) | dossier entier | 91 |
| `tests/unit/tests-selection.test.js:14` | `Docs/ref/tests-*.md` | glob | non (table de sélection d'essai (données)) | nominative | 6 |
| `tests/unit/tests-selection.test.js:54` | `Docs/ref/tests-*.md` | glob | non (titre d'un test) | nominative | 6 |
| `tests/unit/tests-selection.test.js:119` | `Docs` | dossier | non (dossiers ignorés par la recherche de fichiers (exclusion)) | dossier entier | 91 |

## Rattachement des bilans aux versions

| Bilan | Journal | Règle | Preuve git (1re version gelée qui le contient) | Doutes |
|---|---|---|---|---|
| lot-0 | v0.1 | ordre du journal (avant la borne de v0.1) | v0.1 | — |
| lot-0b | v0.1 | ordre du journal (avant la borne de v0.1) | v0.1 | — |
| lot-0c | v0.1 | ordre du journal (avant la borne de v0.1) | v0.1 | — |
| lot-0d | v0.1 | ordre du journal (avant la borne de v0.1) | v0.1 | — |
| lot-1 | v0.1 | borne de v0.1 | v0.1 | — |
| lot-1b | v0.2 | ordre du journal (avant la borne de v0.2) | v0.2 | — |
| lot-1c | v0.2 | ordre du journal (avant la borne de v0.2) | v0.2 | — |
| lot-1d | v0.2 | borne de v0.2 | v0.2 | — |
| lot-1m | v0.2 | ordre du journal (avant la borne de v0.2) | v0.2 | — |
| lot-2 | v0.3 | ordre du journal (avant la borne de v0.3) | v0.3 | — |
| lot-2b | v0.3 | ordre du journal (avant la borne de v0.3) | v0.3 | — |
| lot-2c | v0.3 | borne de v0.3 | v0.3 | — |
| lot-3 | v0.4 | ordre du journal (avant la borne de v0.4) | v0.4 | — |
| lot-3a | v0.4 | ordre du journal (avant la borne de v0.4) | v0.4 | — |
| lot-3b | v0.4 | ordre du journal (avant la borne de v0.4) | v0.4 | — |
| lot-3c | v0.4 | ordre du journal (avant la borne de v0.4) | v0.4 | — |
| lot-3e | v0.4 | borne de v0.4 | v0.4 | — |
| lot-3g | v0.5 | ordre du journal (avant la borne de v0.5) | v0.5 | — |
| lot-3h | v0.4 | ordre du journal (avant la borne de v0.4) | v0.5 | journal : v0.4 ; présent pour la première fois dans le commit gelé de v0.5 |
| lot-3i | v0.5 | ordre du journal (avant la borne de v0.5) | v0.5 | — |
| lot-3j | v0.5 | ordre du journal (avant la borne de v0.5) | v0.5 | — |
| lot-3k | v0.5 | ordre du journal (avant la borne de v0.5) | v0.5 | — |
| lot-3l | v0.5 | ordre du journal (avant la borne de v0.5) | v0.5 | — |
| lot-3m | v0.5 | ordre du journal (avant la borne de v0.5) | v0.5 | — |
| lot-4 | v0.5 | ordre du journal (avant la borne de v0.5) | v0.5 | — |
| lot-4b | v0.5 | borne de v0.5 | v0.5 | — |
| lot-4c | v0.6 | ordre du journal (avant la borne de v0.6) | v0.5 | journal : v0.6 ; présent pour la première fois dans le commit gelé de v0.5 ; après la borne de V0.5, sans champ « version » : V0.6 par déduction |
| lot-4e | v0.6 | ordre du journal (avant la borne de v0.6) | v0.6 | après la borne de V0.5, sans champ « version » : V0.6 par déduction |
| lot-4f | v0.6 | ordre du journal (avant la borne de v0.6) | v0.6 | après la borne de V0.5, sans champ « version » : V0.6 par déduction |
| lot-4g | v0.6 | ordre du journal (avant la borne de v0.6) | v0.6 | après la borne de V0.5, sans champ « version » : V0.6 par déduction |
| lot-5a | v0.6 | champ « version » | v0.6 | — |
| lot-5b | v0.6 | champ « version » | v0.6 | — |
| lot-5c | v0.6 | champ « version » | v0.6 | — |
| lot-5d | v0.6 | champ « version » | v0.6 | — |
| lot-5e | v0.6 | champ « version » | v0.6 | — |
| lot-5f | v0.6 | champ « version » | — | absent du commit gelé de v0.6 (publié après, par main) |
| lot-5g | v0.6 | champ « version » | v0.6 | — |
| lot-5h | v0.6 | champ « version » | v0.6 | — |
| lot-5i | v0.6 | champ « version » | — | absent du commit gelé de v0.6 (publié après, par main) |
| lot-5j | v0.7 | champ « version » | — | — |
| lot-5k | v0.7 | champ « version » | — | — |
| lot-5l | v0.7 | champ « version » | — | — |

## Liens et chemins de documents cassés

- Liens Markdown relatifs dans Docs/ et CLAUDE.md : 0 relevé(s), 0 cassé(s).
- Chemins `Docs/…` cités introuvables dans Docs/ et CLAUDE.md : 5.
  - `Docs/lots/lot-4b.md:10` → `Docs/ref/fusion-3g.md`
  - `Docs/lots/lot-5c.md:7` → `Docs/ref/fusion-3g.md`
  - `Docs/ref/nettoyage-audit-annexe.md:85` → `Docs/ref/fusion-3g.md`
  - `Docs/ref/nettoyage-audit.md:64` → `Docs/ref/fusion-3g.md`
  - `Docs/ref/nettoyage-decisions.md:7` → `Docs/ref/fusion-3g.md`

## Indices de péremption (R6) et de doublon

| Document | Cat. | Chemins du dépôt cités | Introuvables | Lignes reprises dans conventions.md |
|---|---|---|---|---|
| `Docs/ref/affinage.md` | R5 | 31 | 0 | 0 % |
| `Docs/ref/atelier-interface.md` | R5 | 16 | 2 (`css/proto-d.css`, `tests/unit/interface-atelier-protos.test.js`) | 0 % |
| `Docs/ref/atelier-personnages.md` | R5 | 27 | 3 (`scripts/personnages/architecture.mjs`, `tests/unit/persos-actuels.test.js`, `tests/unit/persos-page.test.js`) | 0 % |
| `Docs/ref/atelier-sons.md` | R5 | 16 | 1 (`tests/unit/atelier-variantes.test.js`) | 0 % |
| `Docs/ref/claude-md-consolidation.md` | R2 | 4 | 0 | 0 % |
| `Docs/ref/claude-md-v06.md` | R2 | 7 | 0 | 0 % |
| `Docs/ref/debug.md` | autre | 25 | 0 | 0 % |
| `Docs/ref/ecarts-modele.md` | R5 | 5 | 0 | 0 % |
| `Docs/ref/environnement.md` | autre | 1 | 0 | 0 % |
| `Docs/ref/etage.md` | autre | 2 | 0 | 0 % |
| `Docs/ref/fusion-3j.md` | R1 | 28 | 2 (`tests/unit/persos-page.test.js`, `js/game/character.js`) | 0 % |
| `Docs/ref/fusion-3k.md` | R1 | 23 | 2 (`tests/e2e/dev.spec.js`, `tests/unit/interface-atelier-protos.test.js`) | 0 % |
| `Docs/ref/integration-interface.md` | R4 | 10 | 0 | 0 % |
| `Docs/ref/integration-personnages.md` | R4 | 19 | 3 (`js/core/pose.js`, `js/game/character.js`, `tests/unit/personnages.test.js`) | 0 % |
| `Docs/ref/integration-sons.md` | R4 | 4 | 0 | 0 % |
| `Docs/ref/interface-a-integrer.md` | R4 | 3 | 0 | 0 % |
| `Docs/ref/interface-actuelle.md` | R3 | 2 | 0 | 0 % |
| `Docs/ref/interface-integree.md` | autre | 18 | 0 | 0 % |
| `Docs/ref/lampes.md` | autre | 14 | 0 | 0 % |
| `Docs/ref/menu-debogage-proposition.md` | autre | 16 | 1 (`data/game/debug.json`) | 0 % |
| `Docs/ref/nettoyage-audit-annexe.md` | R2 | 65 | 10 (`dev/dev.js`, `js/core/pose.js`, `js/game/character.js`, `js/game/sound-legacy.js`, `data/game/sounds-legacy.json`, `scripts/modele/captures.mjs`, …) | 0 % |
| `Docs/ref/nettoyage-audit.md` | R2 | 22 | 5 (`js/core/pose.js`, `js/game/character.js`, `scripts/modele/captures.mjs`, `scripts/sons/scene.mjs`, `Docs/ref/fusion-3g.md`) | 0 % |
| `Docs/ref/nettoyage-decisions.md` | R2 | 16 | 8 (`scripts/modele/captures.mjs`, `scripts/plan-monde.mjs`, `scripts/sons/scene.mjs`, `Docs/ref/fusion-3g.md`, `js/core/pose.js`, `js/game/character.js`, …) | 0 % |
| `Docs/ref/nettoyage-decisions.modele.md` | R2 | 0 | 0 | 0 % |
| `Docs/ref/nettoyage-plan-ancien-annexe.md` | R2 | 105 | 7 (`data/game/sounds-legacy.json`, `js/game/character.js`, `js/game/sound-legacy.js`, `scripts/personnages/architecture.mjs`, `scripts/personnages/inventaire.mjs`, `tests/unit/helpers/sons-anciens.js`, …) | 0 % |
| `Docs/ref/nettoyage-plan-ancien-decisions.md` | R2 | 16 | 0 | 0 % |
| `Docs/ref/nettoyage-plan-ancien-decisions.modele.md` | R2 | 0 | 0 | 0 % |
| `Docs/ref/nettoyage-plan-ancien.md` | R2 | 18 | 6 (`js/core/pose.js`, `js/game/character.js`, `scripts/personnages/architecture.mjs`, `scripts/personnages/inventaire.mjs`, `js/game/sound-legacy.js`, `data/game/sounds-legacy.json`) | 0 % |
| `Docs/ref/options-graphiques.md` | autre | 16 | 0 | 0 % |
| `Docs/ref/passation-interface-4b.md` | R4 | 24 | 2 (`tests/e2e/dev.spec.js`, `tests/unit/interface-atelier-protos.test.js`) | 0 % |
| `Docs/ref/passation-personnages-4b.md` | R4 | 22 | 1 (`js/game/character.js`) | 0 % |
| `Docs/ref/performance.md` | autre | 25 | 0 | 0 % |
| `Docs/ref/personnages-actuels.md` | R3 | 4 | 4 (`js/core/pose.js`, `js/game/character.js`, `scripts/personnages/inventaire.mjs`, `tests/unit/personnages.test.js`) | 0 % |
| `Docs/ref/personnages-integres.md` | autre | 14 | 2 (`js/core/pose.js`, `js/game/character.js`) | 0 % |
| `Docs/ref/publication-versions.md` | autre | 20 | 2 (`dev/index.html`, `dev/dev.js`) | 0 % |
| `Docs/ref/site-adresses.md` | autre | 39 | 5 (`dev/jeu.html`, `dev/index.html`, `dev/dev.js`, `tests/e2e/dev.spec.js`, `dev/scripts/assemble.mjs`) | 0 % |
| `Docs/ref/sons-a-integrer.md` | R4 | 5 | 0 | 0 % |
| `Docs/ref/sons-actuels.md` | R3 | 5 | 1 (`data/game/sounds-legacy.json`) | 0 % |
| `Docs/ref/sons-integres.md` | autre | 4 | 0 | 0 % |
| `Docs/ref/tests-audit-annexe.md` | R2 | 3 | 0 | 0 % |
| `Docs/ref/tests-audit.md` | R2 | 5 | 0 | 0 % |
| `Docs/ref/tests-chargement.md` | R2 | 4 | 0 | 0 % |
| `Docs/ref/tests-decisions.md` | R2 | 0 | 0 | 0 % |
| `Docs/ref/tests-decisions.modele.md` | R2 | 0 | 0 | 0 % |
| `Docs/ref/tests-paliers.md` | autre | 34 | 1 (`tests/unit/helpers/sons-anciens.js`) | 0 % |
| `Docs/ref/verification-versions.md` | autre | 3 | 0 | 0 % |
| `Docs/ref/versions-correspondance.md` | autre | 2 | 0 | 0 % |


<!-- fin de la fiche: docs-audit-annexe -->

<a id="branches-audit"></a>
<!-- fiche: branches-audit | ancien: Docs/ref/branches-audit.md | octets: 14155 | sha256: 6bfed7cd9bd49f2ca299d06f564d88f3722994d3ce04da84a0f4b40ea6656e84 -->
# Audit des branches (lot 5m-A)

> Relevé en lecture seule le 2026-11-08 vers 19 h 35 UTC, après `git fetch origin --prune`, sur `origin/dev` `2941829bc85cb880f20eb423228a24412d1519ee` et `origin/main` `6e3ae1ad602ff7612e6ad0901e823902fd20d9e0` (`main` est un ancêtre de `dev`). Rien n'a été supprimé. Les suppressions éventuelles se font en partie C, après la phrase de confirmation du propriétaire, avec un nouveau relevé : une branche dont le hash a changé ou qui a une CI en cours sort de la liste.

## Méthode
- **Fusion** : `git merge-base --is-ancestor origin/<b> origin/dev` (et `origin/main`) ; commits absents : `git rev-list --count origin/dev..origin/<b>` ; `git cherry -v origin/dev origin/<b>` n'a rien à montrer (aucune branche n'a de commit absent de `dev`).
- **Pull Requests** : `gh pr list` passe par GraphQL, refusé dans cette session ; même information par l'API REST en lecture seule (`gh api repos/Nowyyy/Z-Survival/pulls?state=all`, 62 Pull Requests) : **aucune Pull Request ouverte**, quelle que soit la branche.
- **CI** : `gh run list --status in_progress|queued|waiting|pending` : **aucune exécution en cours ni en file** ; dernière exécution de `dev` (Tests, Pages, push de la fusion #62) : **verte**.
- **Âge** : dernier commit de moins de 60 minutes = « possible session active ».
- **Références** : `git grep -nIw <nom>` sur `origin/dev` hors `Docs/lots`, `Docs/ref`, `data/changelog.json` (« occurrences du nom », la plupart sont des noms de lots dans les tests du journal, pas des branches) ; puis références **de type branche** (`origin/<b>`, `refs/heads/<b>`, `--ref <b>`, `"branch": "<b>"`).
- **Jetables** (`essai/*`) : `git diff --stat origin/dev...origin/<b>` est **vide** pour toutes (aucun contenu absent de `dev`, donc ni capture ni artefact à perdre).

## Branches protégées (jamais proposées)
- `main` (branche par défaut du dépôt, `gh api repos/Nowyyy/Z-Survival` → `default_branch`), `dev`, `archive` (versions figées V0.1 à V0.5, 5 commits hors de `dev`, normal : branche orpheline), `lot-5m` (ce lot).
- Branches de `versions.json` (champ `branch`) : `lot-1`, `lot-1d`, `lot-2c`, `lot-3e`, `lot-4b` (**absente du dépôt distant** : déjà supprimée avant ce lot ; V0.5 désigne le commit `e23d92b`, toujours présent), `dev`.
- Branches nommées par un workflow : `main`, `dev` (`pages.yml`, `tests.yml`), `archive` (`pages.yml`). Les filtres `lot-*` et `essai/**` de `tests.yml` sont des motifs de déclenchement, pas des noms : ils ne protègent pas une branche précise (une branche supprimée ne déclenche rien ; une branche recréée relancerait le palier de son motif).
- `gh-pages` : n'existe pas.

## Sources de V0.1 à V0.5 (GARDER par défaut)

| Version | Branche | Tête de la branche | `ref` de `versions.json` | `ref` ancêtre de `main` | Commits absents de `main` | Supprimable sans perte |
|---|---|---|---|---|---|---|
| V0.1 | `lot-1` | `1ffbf76e8521a8cfc384b603e90d422842d5d8e3` | identique | oui | 0 | oui |
| V0.2 | `lot-1d` | `8a098f02510d03ea97dffb8a9bdce3ab6bc5bdba` | identique | oui | 0 | oui |
| V0.3 | `lot-2c` | `0eee61905f1a3d1dd102949b7752392d8d7439cc` | identique | oui | 0 | oui |
| V0.4 | `lot-3e` | `b4a0e315d644ce934894549dee8c8bd044bfaa68` | identique | oui | 0 | oui |
| V0.5 | `lot-4b` | absente | `e23d92b7cfa46e92693b6695d2e8ad15ecc28344` (tête de `main` archivée) | oui | — | déjà supprimée |

- Chaque `ref` est dans `main` et dans `dev`, et chaque version est déjà construite dans `archive` (`v0.1/` à `v0.5/`) : la suppression de `lot-1`, `lot-1d`, `lot-2c`, `lot-3e` ne perd **aucun commit** ni aucune archive. Ce qui changerait : le champ `branch` de `versions.json` nommerait une branche absente (déjà le cas de `lot-4b` ; `versions.json` n'est lu que comme étiquette : `scripts/versions/archiver.mjs` et `schema.mjs` travaillent sur `ref`, et `versions-schema` ne vérifie que le nom), et la liste des branches GitHub ne montrerait plus les sources. **Recommandation : GARDER** (coût nul, repères lisibles).

## Branches non protégées (26)

| Branche | Hash complet | Dernier commit | Âge | Dans dev | Absents de dev | Dans main | Pull Requests (toutes fermées) | Occurrences du nom | Références de type branche | Verdict | Raison ou remarque |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `essai/complet-1` | `e6f3578b872769ee1f4701b7d1981a03c697867b` | 2026-11-03 14:50 | 5 j 4 h | oui | 0 | oui | aucune | 3 | 2 (chaîne d'exemple dans un test pur ou un commentaire d'usage, voir § Références) | SÛRE | jetable ; aucun contenu absent de dev (diff vide) |
| `essai/complet-2` | `704dff1550b1b500ab1f484db32370a7b61afffe` | 2026-11-03 15:05 | 5 j 4 h | oui | 0 | oui | aucune | 1 | 0 | SÛRE | jetable ; aucun contenu absent de dev (diff vide) |
| `essai/complet-3` | `31b95e2692009813cd89a1adfa1757f1ca6f61ce` | 2026-11-03 17:36 | 5 j 1 h | oui | 0 | oui | aucune | 3 | 3 (chaîne d'exemple dans un test pur ou un commentaire d'usage, voir § Références) | SÛRE | jetable ; aucun contenu absent de dev (diff vide) |
| `essai/complet-4` | `adff74e60f33f403ad98b54be3a6560d625d700a` | 2026-11-03 17:47 | 5 j 1 h | oui | 0 | oui | aucune | 0 | 0 | SÛRE | jetable ; aucun contenu absent de dev (diff vide) |
| `essai/complet-5` | `7f7694f5afd821b7a18520dec054751648df6876` | 2026-11-06 13:15 | 2 j 6 h | oui | 0 | oui | aucune | 0 | 0 | SÛRE | jetable ; aucun contenu absent de dev (diff vide) |
| `essai/complet-6` | `0a2a39101a2c99b7395a43ec62709c4ecb26eeaf` | 2026-11-06 17:44 | 2 j 1 h | oui | 0 | oui | aucune | 0 | 0 | SÛRE | jetable ; aucun contenu absent de dev (diff vide) |
| `essai/complet-7` | `89fce38f71b1c71df35ebb4b9ac82210c7c6648e` | 2026-11-06 22:34 | 1 j 20 h | oui | 0 | oui | aucune | 1 | 0 | SÛRE | jetable ; aucun contenu absent de dev (diff vide) |
| `essai/complet-8` | `e3a6c329159cd76d66dc22e3999f50e402fe882b` | 2026-11-06 22:59 | 1 j 20 h | oui | 0 | oui | aucune | 0 | 0 | SÛRE | jetable ; aucun contenu absent de dev (diff vide) |
| `essai/complet-9` | `1969d1f0cfdaec0bb3b792dc9ea87b2e762d5c58` | 2026-11-06 23:08 | 1 j 20 h | oui | 0 | oui | aucune | 1 | 0 | SÛRE | jetable ; aucun contenu absent de dev (diff vide) |
| `essai/standard-1` | `4414302fdc11412388aca7c974f492c13141ce74` | 2026-11-03 15:14 | 5 j 4 h | oui | 0 | oui | aucune | 3 | 2 (chaîne d'exemple dans un test pur ou un commentaire d'usage, voir § Références) | SÛRE | jetable ; aucun contenu absent de dev (diff vide) |
| `lot-4` | `a91d707709e39dbf2e71a72131c434426a46167c` | 2026-11-01 14:20 | 7 j 5 h | oui | 0 | oui | #17 fusionnée → main | 3 | 0 | SÛRE |  |
| `lot-4e` | `3d8d1ba40061c320983655c00bd787d23ac83f07` | 2026-11-03 11:18 | 5 j 8 h | oui | 0 | oui | aucune | 2 | 0 | SÛRE |  |
| `lot-4f` | `adff74e60f33f403ad98b54be3a6560d625d700a` | 2026-11-03 17:47 | 5 j 1 h | oui | 0 | oui | #22 fusionnée → dev; #23 fusionnée → dev; #24 fusionnée → dev | 8 | 3 (chaîne d'exemple dans un test pur ou un commentaire d'usage, voir § Références) | SÛRE |  |
| `lot-4g` | `f6be72ba46f95e005b4376e9ad9a585b3d6e664d` | 2026-11-03 20:36 | 4 j 22 h | oui | 0 | oui | aucune | 2 | 0 | SÛRE |  |
| `lot-5a` | `0bdea2fd5f7ccfb961ed27e0a8f86444c2ffc9c2` | 2026-11-04 16:43 | 4 j 2 h | oui | 0 | oui | #25 fusionnée → dev; #26 fusionnée → dev; #27 fusionnée → dev; #28 fusionnée → dev | 53 | 0 | SÛRE |  |
| `lot-5b` | `1fecb361b91fc82357cd54babc768edf4543f78b` | 2026-11-05 10:41 | 3 j 8 h | oui | 0 | oui | #29 fusionnée → dev; #30 fusionnée → dev; #31 fusionnée → dev; #32 fusionnée → dev; #33 fusionnée → dev | 22 | 0 | SÛRE |  |
| `lot-5c` | `92e45566feb99cc76667e123d1b68171f6ed51f7` | 2026-11-06 13:36 | 2 j 5 h | oui | 0 | oui | #36 fusionnée → dev | 14 | 0 | SÛRE |  |
| `lot-5d` | `b7d20a4c379af90da4d7f47b80343300dc56b4bd` | 2026-11-06 10:14 | 2 j 9 h | oui | 0 | oui | #34 fusionnée → dev; #35 fusionnée → dev | 7 | 0 | SÛRE |  |
| `lot-5e` | `e594eddb62a91ac8748d2a541f5a02ced2d07d7c` | 2026-11-06 18:18 | 2 j 1 h | oui | 0 | oui | #37 fusionnée → dev | 7 | 0 | SÛRE |  |
| `lot-5f` | `c8e83b5e68402ddbdcbc841514caa004814b1609` | 2026-11-06 23:21 | 1 j 20 h | oui | 0 | oui | #42 fusionnée → dev | 8 | 0 | SÛRE |  |
| `lot-5g` | `aa4e220352ff2215c0f5e0def6bdd0012492d640` | 2026-11-06 20:17 | 1 j 23 h | oui | 0 | oui | #38 fusionnée → dev; #39 fusionnée → dev | 11 | 0 | SÛRE |  |
| `lot-5h` | `eeb76b0941d05a7e64de998bbcd87856e771d198` | 2026-11-06 21:08 | 1 j 22 h | oui | 0 | oui | #40 fusionnée → dev | 9 | 0 | SÛRE |  |
| `lot-5i` | `c1d3e9f6dabe642854de790527da32b7ce02e389` | 2026-11-07 10:20 | 1 j 9 h | oui | 0 | oui | #45 fusionnée → dev | 8 | 0 | SÛRE |  |
| `lot-5j` | `076f534434dfac90cf138561b67469f4cf7c0076` | 2026-11-07 19:54 | 23 h 40 min | oui | 0 | non | #48 fusionnée → dev; #49 fusionnée → dev; #50 fusionnée → dev; #51 fusionnée → dev | 21 | 0 | SÛRE | 13 commits absents de main (V0.7 non publiée ; tous dans dev) |
| `lot-5k` | `ff037baff73e8b0e07c18678c11c75d56e32f5e2` | 2026-11-08 18:52 | 0 h 42 min | oui | 0 | non | #52 fusionnée → dev; #53 fusionnée → dev; #54 fusionnée → dev; #55 fusionnée → dev; #56 fusionnée → dev; #59 fusionnée → dev; #60 fusionnée → dev; #61 fusionnée → dev; #62 fusionnée → dev | 19 | 0 | À GARDER | dernier commit il y a 42 min : possible session active |
| `lot-5l` | `e7501cd24ba77cf81151dc17d54013c8db7a3c71` | 2026-11-08 13:45 | 5 h 49 min | oui | 0 | non | #57 fusionnée → dev; #58 fusionnée → dev | 19 | 0 | SÛRE | 38 commits absents de main (V0.7 non publiée ; tous dans dev) |

- `lot-4f` et `essai/complet-4` pointent sur le même commit (`adff74e`).
- **Références de type branche** (toutes sans lecture de la branche) : `essai/complet-1`, `essai/complet-3`, `essai/standard-1`, `lot-4f` apparaissent comme chaînes d'exemple dans `tests/unit/tests-budget.test.js` (lignes 111 à 146 : fonctions pures `palierDeLExecution`, `basesCandidates` de `scripts/tests/lib/ci.mjs`) et dans le commentaire d'usage de `scripts/tests/ci-palier.mjs:7` ; aucun script ni workflow ne lit ces branches. Les seules lectures de branches de lot par un test (`origin/lot-3h` dans `atelier-sons-hygiene`, `origin/lot-4b` cité par `persos-jeu`) visent des branches **déjà absentes**, avec repli prévu (comparaisons sautées).
- **`lot-5k`** : À GARDER à cette heure (dernier commit 42 minutes avant le relevé). La partie C ne la reprend que si le propriétaire la nomme dans les exceptions **et** si le nouveau relevé la trouve fusionnée, sans CI en cours ni commit de moins de 60 minutes.
- **`lot-5j`, `lot-5l`** (et `lot-5k`) : lots de V0.7, dans `dev` mais pas encore dans `main` ; leur suppression ne perd rien (tout est dans `dev`).
- **Règle de `CLAUDE.md`** : « Une branche par lot : `lot-N`, jamais supprimée. » Supprimer des branches `lot-*` contredit cette règle durable ; c'est au propriétaire de décider (et, s'il approuve, de réécrire la règle : ce lot n'a le droit de toucher `CLAUDE.md` que pour des chemins de documents). Les branches `essai/*` ne sont pas concernées par cette règle.

## Restauration (une commande par branche)

Tous ces commits sont dans `dev` (fusionnés) : ils restent accessibles après la suppression de la branche, et chaque branche se recrée telle quelle par :

```
git push origin e6f3578b872769ee1f4701b7d1981a03c697867b:refs/heads/essai/complet-1
git push origin 704dff1550b1b500ab1f484db32370a7b61afffe:refs/heads/essai/complet-2
git push origin 31b95e2692009813cd89a1adfa1757f1ca6f61ce:refs/heads/essai/complet-3
git push origin adff74e60f33f403ad98b54be3a6560d625d700a:refs/heads/essai/complet-4
git push origin 7f7694f5afd821b7a18520dec054751648df6876:refs/heads/essai/complet-5
git push origin 0a2a39101a2c99b7395a43ec62709c4ecb26eeaf:refs/heads/essai/complet-6
git push origin 89fce38f71b1c71df35ebb4b9ac82210c7c6648e:refs/heads/essai/complet-7
git push origin e3a6c329159cd76d66dc22e3999f50e402fe882b:refs/heads/essai/complet-8
git push origin 1969d1f0cfdaec0bb3b792dc9ea87b2e762d5c58:refs/heads/essai/complet-9
git push origin 4414302fdc11412388aca7c974f492c13141ce74:refs/heads/essai/standard-1
git push origin a91d707709e39dbf2e71a72131c434426a46167c:refs/heads/lot-4
git push origin 3d8d1ba40061c320983655c00bd787d23ac83f07:refs/heads/lot-4e
git push origin adff74e60f33f403ad98b54be3a6560d625d700a:refs/heads/lot-4f
git push origin f6be72ba46f95e005b4376e9ad9a585b3d6e664d:refs/heads/lot-4g
git push origin 0bdea2fd5f7ccfb961ed27e0a8f86444c2ffc9c2:refs/heads/lot-5a
git push origin 1fecb361b91fc82357cd54babc768edf4543f78b:refs/heads/lot-5b
git push origin 92e45566feb99cc76667e123d1b68171f6ed51f7:refs/heads/lot-5c
git push origin b7d20a4c379af90da4d7f47b80343300dc56b4bd:refs/heads/lot-5d
git push origin e594eddb62a91ac8748d2a541f5a02ced2d07d7c:refs/heads/lot-5e
git push origin c8e83b5e68402ddbdcbc841514caa004814b1609:refs/heads/lot-5f
git push origin aa4e220352ff2215c0f5e0def6bdd0012492d640:refs/heads/lot-5g
git push origin eeb76b0941d05a7e64de998bbcd87856e771d198:refs/heads/lot-5h
git push origin c1d3e9f6dabe642854de790527da32b7ce02e389:refs/heads/lot-5i
git push origin 076f534434dfac90cf138561b67469f4cf7c0076:refs/heads/lot-5j
git push origin ff037baff73e8b0e07c18678c11c75d56e32f5e2:refs/heads/lot-5k
git push origin e7501cd24ba77cf81151dc17d54013c8db7a3c71:refs/heads/lot-5l
```

## Recommandation
- **Supprimer** les 10 branches `essai/*` (jetables, rien hors de `dev`).
- **Branches `lot-*` SÛRES** (15 : `lot-4`, `lot-4e`, `lot-4f`, `lot-4g`, `lot-5a` à `lot-5j`, `lot-5l`) : supprimables sans perte, mais contraires à la règle de `CLAUDE.md` ; si le propriétaire les approuve, garder au moins `lot-5j` et `lot-5l` jusqu'à la publication de V0.7 (exceptions « garder »).
- **Garder** les sources de V0.1 à V0.4.

## Ce que je n'ai pas pu vérifier
- Règles de protection des branches et réglages du dépôt sur GitHub ; sessions ouvertes ailleurs (seul l'âge du dernier commit en donne un indice) ; une restauration réelle (aucune branche n'a été supprimée ni recréée).

<!-- fin de la fiche: branches-audit -->

<a id="interface-actuelle"></a>
<!-- fiche: interface-actuelle | ancien: Docs/ref/interface-actuelle.md | octets: 4115 | sha256: 2a94f1b604d0cdfc05f5560371492a5643ab16cab721d69cf825218f716e71df -->
# Interface actuelle : état des lieux mesuré (lot 3k-A)

Relevé : `node scripts/interface/mesures.mjs` (Playwright, `jeu.html?test=1&seed=1&vhs=0`, `main` = `c166e53`), 7 tailles × 13 cas (HUD dans 7 états nommés, pause, mort, monde terminé, à terre, protégé, sticks). Calculs : `js/core/ui-measure.js` ; pire fond = 17 jetons de sols, murs, brume (`ui-atelier.json`). Zones de sécurité : padding imposé à la sonde `.safe-probe` du jeu puis `resize` (le jeu republie `--safe-*`). L'agent mesure et décrit ; il ne juge ni l'esthétique ni le confort.

## Boîtes (état « combat », px : gauche, haut, largeur × hauteur)
| taille | `#hud` | `#hud-money` | `#hud-wave` | Pause | part HUD + Pause |
|---|---|---|---|---|---|
| 667×375 | 16,16 200×72 | 220,17 88×20 | 459,27 144×22 | 607,16 44×44 | 8,5 % |
| 812×375 (zones 44/21) | 16,16 | 220,17 | 604,27 | 752,16 | 7,0 % |
| 844×390 (zones 47/21) | 19,16 | 223,17 | 633,27 | 781,16 | 6,5 % |
| 932×430 | 16,16 | 220,17 | 724,27 | 872,16 | 5,3 % |
| 1024×768 | 16,16 | 220,17 | 816,27 | 964,16 | 2,7 % |
| 1440×900 | 16,16 | 220,17 | 1232,27 | 1380,16 | 1,6 % |
| 2560×1080 | 16,16 | 220,17 | 2352,27 | 2500,16 | 0,8 % |

Mêmes tailles de blocs à toutes les tailles d'écran (rem fixes) : seule la position horizontale de la vague et de Pause change (collées à droite). Panneau de pause : 544 × 327 à 667×375 (deux colonnes, 8 cibles de 44 px), 352 × 538 à 1440×900 (une colonne). Écran de fin : 544 × 229 (mort) et 544 × 261 (monde terminé) à 667×375. À terre : texte de 182 × 61 centré à 84 % de la hauteur. Sticks au repos : 112 × 112 à 16 % et 84 % de la largeur, 68 % de la hauteur.

## Analyse chiffrée
- **Part de l'écran** (HUD + argent + vague + Pause) : 8,5 % à 667×375, 0,8 % à 2560×1080 ; « Étage » ou une vie faible ajoutent 0,3 point.
- **Hiérarchie des textes** : HUD 14 px (vie, restants, tués, étage, argent), vague 16 px (Rubik Wet Paint) ; titre de pause et de fin 20 px (écran bas) ou 28 px ; lignes des panneaux 16 à 20 px ; notes 14 px ; « À terre » 20 px puis 16 px. Écart entre le plus petit et le plus grand texte du HUD : 2 px.
- **Plus petit texte** : 14 px partout. **Plus petite cible** : 44 px (Pause, boutons des panneaux, curseur de volume).
- **Contraste sur le pire fond** : HUD 5,27:1 (texte sur puce à 78 % d’opacité posée sur le pire des 17 fonds) ; panneaux 4,63:1 (note atténuée sur `--color-surface`). Aucun texte sous 4,5:1.
- **Stabilité** : 0 px de déplacement (argent 0 → 9 000 000 cumulés, vague 1 → 40, 5 chutes) aux 7 tailles. **CLS** (données retardées de 400 ms) : 0,0008 au plus (667×375).
- **DOM** : 56 éléments dans `#game-root` ; 7 lignes de texte visibles sur le HUD, 11 dans la pause, 10 sur l'écran de fin.
- **Chevauchements** : aucun entre blocs, ni avec Pause. **Zones des pouces** (moitiés basses, dès 50 % de la hauteur) : seul E2-10 (« À terre », « Protégé ») les chevauche, à toutes les tailles (centré à 84 % de la hauteur).
- **Zones de sécurité** : à 812×375 et 844×390, le HUD (x = 16 et 19) et Pause (à 16 et 19 px du bord droit) sont dans la zone de l'encoche ou de l'îlot (44 et 47 px) : c'est le choix du lot 4 (`max(16 px, zone − 28 px)`, retour du propriétaire « plus près des bords »), rapporté hors cible par la règle « 16 px plus zones de sécurité » ; E2-10 y est aussi à 9 et 11 px de la barre d'accueil.
- **Ce qui bouge** : rien quand les valeurs changent ; « +N » (22 px de haut) apparaît sous l'argent pendant 1,2 s ; la ligne « Étage » n'existe que sur les cartes à étages.

## Limites du relevé
- Aucun hook ne règle la vie : elle est approchée par des coups de zombie (écart de 1 à 17 PV, noté) ; ni les tués (0), ni l'état de sauvegarde (`memory` en `?test=1`, `readonly` en mode essai).
- Rendu logiciel (WebGL sans GPU) ; vrai iPhone (îlot dynamique, zones réelles) non mesuré.
- Lighthouse mobile de `jeu.html` sur `main` (référence, cette branche ne le change pas) : performance 45, accessibilité 100, bonnes pratiques 100, CLS 0,002.

<!-- fin de la fiche: interface-actuelle -->

<a id="personnages-actuels"></a>
<!-- fiche: personnages-actuels | ancien: Docs/ref/personnages-actuels.md | octets: 3834 | sha256: cad4c74e5c060f9ccd49cecb3fedc4a4a466b5a3b907f49251a1bfaaae5115d2 -->
# Personnages actuels : état des lieux mesuré (lot 3j-A)

*Retiré du jeu au lot 5e : l'ancien modèle (`js/core/pose.js`, `js/game/character.js`, `?perso=actuel`) et le script `scripts/personnages/inventaire.mjs` qui produisait ces mesures n'existent plus ; document gardé comme état des lieux historique.*

Mesures de `node scripts/personnages/inventaire.mjs` (Node, sans rendu). Caméra du jeu à 667 × 375 : distance 704,5, inclinaison 75°, champ 40°, 1,37 unité par pixel au sol. Silhouette : rasterisation des triangles posés (pose de marche du jeu), moyenne sur 4 orientations ; « lum. vue » : luminance de la couleur moyenne visible (régions d'atlas, sans éclairage) ; contraste avec la couleur moyenne de chaque sol (même méthode que `tests/unit/personnages.test.js`, le béton d'escalier utilise la texture des murs).

| Personnage | Pièces | Triangles | Appels (pièces + ombres) | Emprise / 1,3 r | Hauteur | Aire (px) | Aspect | Lum. vue | Carrelage | Herbe | Terre | Route | Trottoir | Escalier |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| joueur | 12 | 680 | 17 (12 + 5) | 26,77 / 23,40 | 61,30 | 268,0 | 0,967 | 0,243 | 2,87 | 3,87 | 3,76 | 3,73 | 3,51 | 1,85 |
| marcheur | 11 | 624 | 16 (11 + 5) | 28,18 / 26,00 | 60,70 | 267,0 | 0,933 | 0,330 | 3,72 | 5,02 | 4,88 | 4,84 | 4,55 | 2,39 |
| petit | 11 | 624 | 16 (11 + 5) | 26,05 / 24,18 | 56,45 | 230,0 | 0,926 | 0,347 | 3,89 | 5,25 | 5,10 | 5,06 | 4,76 | 2,50 |
| voute | 11 | 624 | 16 (11 + 5) | 27,60 / 25,48 | 59,49 | 261,0 | 0,937 | 0,303 | 3,46 | 4,67 | 4,53 | 4,50 | 4,23 | 2,23 |
| grand | 11 | 624 | 16 (11 + 5) | 30,07 / 27,82 | 64,95 | 307,6 | 0,937 | 0,259 | 3,03 | 4,09 | 3,97 | 3,94 | 3,70 | 1,95 |

Articulations : 12 (joueur, poignet droit pour l'arme) ou 11. Ombres : bassin, tronc, tête, deux cuisses (5 appels de la passe d'ombre par personnage). Atlas : 256 × 256, 349 525 octets avec mipmaps, 35 ms de génération en Node.

## Ce qui manque, en chiffres (sans jugement esthétique)

1. **Coût de dessin** : 16 à 17 appels par personnage ; 10 zombies et le joueur = 177 appels sur les 203 mesurés en R1 (87 %). Les personnages sont la première dépense d'appels du jeu.
2. **Silhouettes confondues** : les 4 types n'ont que l'échelle (0,93 à 1,07) et deux angles (tête, bras) pour se distinguer. Écarts d'aire : marcheur / voûté 2,2 %, petit / voûté 11,9 % (sous 12 %) ; écarts d'aspect : 0,0 à 1,2 % pour toutes les paires (même forme, même proportion largeur / hauteur).
3. **Lisibilité sur le béton d'escalier** : aucun personnage n'atteint 3:1 (1,85 à 2,50) avec la couleur moyenne réellement vue ; le joueur est aussi sous 3:1 sur le carrelage (2,87). Le test existant passe parce qu'il ne mesure que la couleur dominante (veste, tenues) et ne compte pas l'escalier.
4. **Emprise** : bras tendus devant, l'emprise debout dépasse 1,3 × le rayon de collision pour les 5 personnages (de 1,08 à 1,14 fois la limite).
5. **Personnalité** : mêmes 11 pièces et mêmes formes (capsules, sphères) pour les 4 zombies ; aucune pièce propre à un type (pas d'accessoire, pas de vêtement distinctif), même pose de base (inclinaison 0,14 rad) ; le voûté ne diffère du marcheur que par 0,28 rad de tête.
6. **Animations** : aucune attaque, aucune réaction au tir (un flash de 0,1 s), aucune mort (le zombie disparaît), aucune réparation (le joueur reste en pose d'arrêt), aucune attente devant une fenêtre ; glissement des pieds en marche : amplitude de hanche 0,385 rad pour une foulée de 52 (le pied d'appui recule d'environ 20 unités par demi-cycle au lieu de 26 : glissement d'environ 22 %).
7. **Usure, tenues** : une tenue par type, aucune variation selon la manche.

L'agent ne juge ni le beau ni le caractère effrayant : ces chiffres sont des mesures, pas des avis.

<!-- fin de la fiche: personnages-actuels -->

<a id="integration-sons"></a>
<!-- fiche: integration-sons | ancien: Docs/ref/integration-sons.md | octets: 15307 | sha256: 6cae72f00580ecd78c41f3639ce91ce3e38facd380f3fe3076927e4d96771832 -->
# Intégration des sons de l'atelier (plan pour le lot 3i)

**Fiche par son (à quoi sert chaque son, quand le déclencher) : `Docs/ref/sons-a-integrer.md`.** **Limite de 8 Mo levée par le propriétaire** après ses choix : les dépassements ci-dessous sont informatifs ; au lot 3i, relever le plafond du test `data-sons`.

Plan établi au lot 3h, **sans rien intégrer** : le lot 3i appliquera les choix du propriétaire (texte de « Mes choix »). Les poids sont au format du jeu (Float32 mono, 4 octets par échantillon, 22 050 Hz). **Aucun son n'a été écouté par l'agent.** Le plan de chaque emplacement est aussi dans `data/game/sounds-atelier.json` (champ `integration` : identifiants produits, identifiants remplacés, nombre de versions), lu par `scripts/sons/projection.mjs`.

## Principe
1. **Même identifiant** quand un emplacement remplace un son existant (`pas`, `pas-zombie`, voix, `planche-arrachee`, `planche-posee`, `joueur-chute`, `joueur-releve`) : le directeur de sons et ses appels ne changent pas. Les recettes de `synth2.js` ne passent pas par `synth.js` : le lot 3i ajoute à `sounds.json` un champ (par exemple `engine: "synth2"`, `slot`, `variant`, `macros`) et `sound-loader.js` choisit le moteur (seul changement du chargeur).
2. **Nouvel identifiant** pour un son qui n'existe pas (pas extérieur et d'escalier, allures des zombies, rampant, craquement et chute de planche, escalade, propositions) : il faut un nouvel événement dans `sound-director.js` (surface sous le joueur, allure du zombie, début d'escalade…) et une entrée `minDelay` dans `audio.json`.
3. **Niveaux** : les cibles sont des niveaux entendus (tampon + gain de catégorie d'`audio.json`, relatifs au tir) ; les gains de catégorie ne changent donc pas. Écart entendu par rapport à aujourd'hui : pas du joueur +7,5 dB (−25,5 -> −18), voix d'errance +1 dB, attaque +4 dB, chute du joueur −7,2 dB (−2,8 -> −10).
4. **Voix** : deux plans. *Par type* (défaut de la projection) : un jeu de tampons par type de zombie (identifiants `zombie-gemissement-grand`…), timbres propres à chaque type (formants, sifflement du voûté). *Hauteur de lecture* (comme aujourd'hui) : seules les voix du marcheur sont calculées, lues à `zombieRate` (le grand à 0,82…) ; 2,6 Mo de moins (2 713 320 octets avec la variante A), mais les types ne diffèrent plus que par la vitesse de lecture.
5. **Réparation** : la séquence (2 à 5 coups, 0,4 à 1,8 s) se calcule pour la durée du niveau courant de la statistique `reparation` ; autre voie, plus légère : 3 versions d'un coup seul (`reparation-coup`, 0,2 s) jouées par le directeur selon `repairSequence` (changement du directeur, à décider au lot 3i).

## Emplacement par emplacement (variante A par défaut, B pour comparaison)

| Emplacement | Actuel (octets, niveau / tir) | Identifiant(s) produit(s) dans sounds.json | Versions | Octets A / B | Niveau / tir (cible) | Tests à adapter |
|---|---|---|---|---|---|---|
| `pas-joueur-dur` | `pas` : 155232, −25,5 dB | `pas` (même identifiant) | 4 | 45872 / 59984 | −18 dB | `data-sons` (44 100 -> 22 050 Hz, 4 variantes, niveau de la catégorie pas), `core-sound-director` (playerStep), `jeu-sons` |
| `pas-joueur-exterieur` | `pas` : 155232, −25,5 dB | `pas-exterieur` (nouveau) | 4 | 56448 / 70560 | −20 dB | `data-sons` (liste des sons attendus), `core-sound-director` (nouvel événement) |
| `pas-joueur-escalier` | `pas` : 155232, −25,5 dB | `pas-escalier` (nouveau) | 4 | 49392 / 63504 | −18 dB | `data-sons` (liste des sons attendus), `core-sound-director` (nouvel événement) |
| `pas-zombie-lent` | `pas-zombie` : 70560, −17,3 dB | `pas-zombie-lent` (nouveau) | 2 | 52920 / 59976 | −16 dB | `data-sons` (liste des sons attendus), `core-sound-director` (nouvel événement) |
| `pas-zombie-marche` | `pas-zombie` : 70560, −17,3 dB | `pas-zombie` (même identifiant) | 3 | 52920 / 66156 | −16 dB | `data-sons` (2 -> 3 variantes, durée 0,4 -> 0,22 s), `core-sound-director` (pas de zombie) |
| `pas-zombie-course` | `pas-zombie` : 70560, −17,3 dB | `pas-zombie-course` (nouveau) | 2 | 26464 / 31752 | −16 dB | `data-sons` (liste des sons attendus), `core-sound-director` (nouvel événement) |
| `zombie-rampe` | aucun | `zombie-rampe` (nouveau) | 2 | 141120 / 176400 | −18 dB | `data-sons` (liste des sons attendus), `core-sound-director` (nouvel événement) |
| `voix-marcheur-errance` | `zombie-gemissement` : 423360, −11,0 dB | `zombie-gemissement` (même identifiant) | 3 | 449820 / 539784 | −10 dB | `data-sons` (« fondamentale proche de 110 Hz » -> 75-110 Hz ; durée 1,6 -> 1,7 s), `core-zombie-voice`, `jeu-voix` |
| `voix-marcheur-attaque` | `zombie-attaque` : 185220, −12,2 dB | `zombie-attaque` (même identifiant) | 3 | 198456 / 238140 | −8 dB | `data-sons` (fondamentale, durée 0,7 -> 0,75 s), `jeu-voix` (cri d'attaque) |
| `voix-marcheur-touche` | `zombie-blessure` : 119076, −12,2 dB | `zombie-blessure` (même identifiant) | 3 | 84672 / 101604 | −10 dB | `data-sons` (fondamentale, durée 0,45 -> 0,32 s) |
| `voix-marcheur-mort` | `zombie-mort` : 264600, −13,8 dB | `zombie-mort` (même identifiant) | 2 | 264600 / 317520 | −10 dB | `data-sons` (fondamentale, durée) |
| `voix-petit-errance` | `zombie-gemissement` × 1,35 : 423360, −11,0 dB | `zombie-gemissement-petit` (nouveau) ; ou hauteur de lecture : 0 tampon (le tampon du marcheur lu à zombieRate) | 3 | 323868 / 388644 | −10 dB | `data-sons` (liste des sons attendus), `core-sound-director` (nouvel événement) |
| `voix-petit-attaque` | `zombie-attaque` × 1,35 : 185220, −12,2 dB | `zombie-attaque-petit` (nouveau) ; ou hauteur de lecture : 0 tampon (le tampon du marcheur lu à zombieRate) | 3 | 142884 / 171456 | −8 dB | `data-sons` (liste des sons attendus), `core-sound-director` (nouvel événement) |
| `voix-petit-touche` | `zombie-blessure` × 1,35 : 119076, −12,2 dB | `zombie-blessure-petit` (nouveau) ; ou hauteur de lecture : 0 tampon (le tampon du marcheur lu à zombieRate) | 3 | 60960 / 73152 | −10 dB | `data-sons` (liste des sons attendus), `core-sound-director` (nouvel événement) |
| `voix-petit-mort` | `zombie-mort` × 1,35 : 264600, −13,8 dB | `zombie-mort-petit` (nouveau) ; ou hauteur de lecture : 0 tampon (le tampon du marcheur lu à zombieRate) | 2 | 190512 / 228616 | −10 dB | `data-sons` (liste des sons attendus), `core-sound-director` (nouvel événement) |
| `voix-voute-errance` | `zombie-gemissement` × 1,12 : 423360, −11,0 dB | `zombie-gemissement-voute` (nouveau) ; ou hauteur de lecture : 0 tampon (le tampon du marcheur lu à zombieRate) | 3 | 449820 / 539784 | −10 dB | `data-sons` (liste des sons attendus), `core-sound-director` (nouvel événement) |
| `voix-voute-attaque` | `zombie-attaque` × 1,12 : 185220, −12,2 dB | `zombie-attaque-voute` (nouveau) ; ou hauteur de lecture : 0 tampon (le tampon du marcheur lu à zombieRate) | 3 | 198456 / 238140 | −8 dB | `data-sons` (liste des sons attendus), `core-sound-director` (nouvel événement) |
| `voix-voute-touche` | `zombie-blessure` × 1,12 : 119076, −12,2 dB | `zombie-blessure-voute` (nouveau) ; ou hauteur de lecture : 0 tampon (le tampon du marcheur lu à zombieRate) | 3 | 84672 / 101604 | −10 dB | `data-sons` (liste des sons attendus), `core-sound-director` (nouvel événement) |
| `voix-voute-mort` | `zombie-mort` × 1,12 : 264600, −13,8 dB | `zombie-mort-voute` (nouveau) ; ou hauteur de lecture : 0 tampon (le tampon du marcheur lu à zombieRate) | 2 | 264600 / 317520 | −10 dB | `data-sons` (liste des sons attendus), `core-sound-director` (nouvel événement) |
| `voix-grand-errance` | `zombie-gemissement` × 0,82 : 423360, −11,0 dB | `zombie-gemissement-grand` (nouveau) ; ou hauteur de lecture : 0 tampon (le tampon du marcheur lu à zombieRate) | 3 | 449820 / 539784 | −8 dB | `data-sons` (liste des sons attendus), `core-sound-director` (nouvel événement) |
| `voix-grand-attaque` | `zombie-attaque` × 0,82 : 185220, −12,2 dB | `zombie-attaque-grand` (nouveau) ; ou hauteur de lecture : 0 tampon (le tampon du marcheur lu à zombieRate) | 3 | 198456 / 238140 | −6 dB | `data-sons` (liste des sons attendus), `core-sound-director` (nouvel événement) |
| `voix-grand-touche` | `zombie-blessure` × 0,82 : 119076, −12,2 dB | `zombie-blessure-grand` (nouveau) ; ou hauteur de lecture : 0 tampon (le tampon du marcheur lu à zombieRate) | 3 | 84672 / 101604 | −8 dB | `data-sons` (liste des sons attendus), `core-sound-director` (nouvel événement) |
| `voix-grand-mort` | `zombie-mort` × 0,82 : 264600, −13,8 dB | `zombie-mort-grand` (nouveau) ; ou hauteur de lecture : 0 tampon (le tampon du marcheur lu à zombieRate) | 2 | 264600 / 317520 | −8 dB | `data-sons` (liste des sons attendus), `core-sound-director` (nouvel événement) |
| `planche-arrachage` | `planche-arrachee` : 132300, −9,8 dB | `planche-arrachee` (même identifiant) | 3 | 251376 / 304284 | −12 dB | `data-sons-lot3` (attaque < 6 ms, centre de gravité 300-3 000 Hz) |
| `reparation` | `planche-posee` : 119076, −14,0 dB | `planche-posee` (même identifiant) | 3 | 476280 / 476280 | −12 dB | `data-sons-lot3` (« 2 à 3 pics séparés de 80 ms » -> 2 à 5 coups selon la durée), `core-sound-director` (plankRepaired) |
| `reparation-coup` | aucun | variante de remplacement de la réparation (coups seuls, séquence jouée par le directeur de sons) : non comptée par défaut | 0 | 0 / 0 | −12 dB | – |
| `planche-craquement` | aucun | `planche-craquement` (nouveau) | 2 | 149944 / 176400 | −14 dB | `data-sons` (liste des sons attendus), `core-sound-director` (nouvel événement) |
| `planche-chute` | aucun | `planche-chute` (nouveau) | 2 | 132304 / 167584 | −12 dB | `data-sons` (liste des sons attendus), `core-sound-director` (nouvel événement) |
| `escalade` | aucun | `zombie-escalade` (nouveau) | 2 | 264600 / 335160 | −14 dB | `data-sons` (liste des sons attendus), `core-sound-director` (nouvel événement) |
| `joueur-souffle-terre` | `joueur-chute` : 229320, −2,8 dB | `joueur-chute` (même identifiant) | 2 | 299880 / 370440 | −10 dB | `data-sons-lot3` (« pic dans les 80 premières ms, 1,0 à 1,5 s » -> grognement d'abord, 1,7 s) |
| `joueur-relevage` | `joueur-releve` : 141120, −9,6 dB | `joueur-releve` (même identifiant) | 2 | 149944 / 185224 | −12 dB | `data-sons-lot3` (0,6 à 1,0 s : tenu) |
| `ambiance-vent` | aucun | `ambiance-vent` (nouveau) | 1 | 882000 / 882000 | −24 dB | `data-sons` (liste des sons attendus), `core-sound-director` (nouvel événement) |
| `ambiance-grincements` | aucun | `ambiance-grincements` (nouveau) | 2 | 529200 / 617400 | −22 dB | `data-sons` (liste des sons attendus), `core-sound-director` (nouvel événement) |
| `ambiance-neon` | aucun | `ambiance-neon` (nouveau) | 1 | 705600 / 705600 | −30 dB | `data-sons` (liste des sons attendus), `core-sound-director` (nouvel événement) |
| `joueur-coeur` | aucun | `joueur-coeur` (nouveau) | 1 | 141120 / 141120 | −14 dB | `data-sons` (liste des sons attendus), `core-sound-director` (nouvel événement) |
| `joueur-essouffle` | aucun | `joueur-essouffle` (nouveau) | 2 | 352800 / 352800 | −14 dB | `data-sons` (liste des sons attendus), `core-sound-director` (nouvel événement) |
| `ambiance-lointains` | aucun | `ambiance-lointains` (nouveau) | 2 | 529200 / 670320 | −24 dB | `data-sons` (liste des sons attendus), `core-sound-director` (nouvel événement) |
| `porte-enfoncee` | aucun | `porte-enfoncee` (nouveau) | 1 | 105840 / 105840 | −8 dB | `data-sons` (liste des sons attendus), `core-sound-director` (nouvel événement) |
| `interface-piece` | aucun | `interface-piece` (nouveau) | 3 | 119076 / 132300 | −14 dB | `data-sons` (liste des sons attendus), `core-sound-director` (nouvel événement) |
| `interface-achat` | aucun | `interface-achat` (nouveau) | 1 | 97020 / 110252 | −12 dB | `data-sons` (liste des sons attendus), `core-sound-director` (nouvel événement) |
| `ambiance-feu` | aucun | `ambiance-feu` (nouveau) | 1 | 705600 / 705600 | −22 dB | `data-sons` (liste des sons attendus), `core-sound-director` (nouvel événement) |

## Projections (`node scripts/sons/projection.mjs`, mesurées sur cette machine)

| Choix | Voix | Poids projeté | Limite 8 Mo | Calcul au chargement (référence) |
|---|---|---|---|---|
| **Tous les choix du propriétaire** (`data/game/sounds-atelier-choix.txt`) | par type | 13 048 608 octets (12,44 Mo) | **dépassée** de 4,4 Mo | 4 732 ms (1 813 ms) |
| **Tous les choix du propriétaire** | hauteur de lecture | 11 013 624 octets (10,50 Mo) | **dépassée** de 2,5 Mo | 4 307 ms (1 672 ms) |
| A partout (priorités 1 et 2) | par type | 15 082 536 octets (14,38 Mo) | **dépassée** de 6,4 Mo | 3 935 ms (1 399 ms) |
| B partout (priorités 1 et 2) | par type | 16 474 696 octets (15,71 Mo) | **dépassée** de 7,7 Mo | 4 398 ms (1 435 ms) |
| A partout (priorités 1 et 2) | hauteur de lecture | 12 369 216 octets (11,80 Mo) | **dépassée** de 3,8 Mo | 3 084 ms (1 458 ms) |
| B partout (priorités 1 et 2) | hauteur de lecture | 13 218 732 octets (12,61 Mo) | **dépassée** de 4,6 Mo | 3 683 ms (1 462 ms) |
| A partout, priorité 1 seule | hauteur de lecture | 8 201 760 octets (7,82 Mo) | tenue | 2 088 ms (1 428 ms) |
| B partout, priorité 1 seule | hauteur de lecture | 8 795 500 octets (8,39 Mo) | **dépassée** de 0,39 Mo | 2 187 ms (1 291 ms) |

Itération 2 : avec les choix du propriétaire (les sons encore à réécouter ne sont pas comptés), les plus gros postes sont le vent (10 s : 882 000 octets), les gémissements lointains B (2 × 3,8 s : 670 320), les voix par type et le feu s'il est retenu (8 s : 705 600). Pistes : boucles de 4 à 6 s, une seule version des gémissements lointains, voix à la hauteur de lecture.

Référence : 6 894 612 octets (6,58 Mo), 65 tampons ; le temps de référence varie de 1 219 à 1 541 ms d'une exécution à l'autre (charge de la machine). Ce qui pèse : les boucles d'ambiance (vent 10 s : 882 000 octets ; néon 8 s : 705 600), les voix par type (×4), la réparation à 1,8 s (3 × 158 760 octets), l'escalade (2 × 1,5 s). **À raccourcir si besoin** (le script les liste par poids décroissant) : boucles de 10 et 8 s -> 4 à 6 s, voix par type -> hauteur de lecture, réparation -> coups seuls, deux versions au lieu de trois pour les sons longs. Le plafond de 8 Mo et la fréquence d'échantillonnage du jeu ne changent pas (hors lot).

## Procédure (lot 3i)
1. Relire le texte de « Mes choix » du propriétaire : `node scripts/sons/projection.mjs --choix=mes-choix.txt [--voix=hauteur] [--p1]` (les lignes invalides sont signalées) ; ajuster le nombre de versions ou les durées jusqu'à tenir les 8 Mo.
2. Ajouter le moteur `synth2` au chargeur, les recettes choisies à `sounds.json` (mêmes identifiants pour les remplacements), les nouveaux événements au directeur de sons.
3. Adapter les tests listés ci-dessus (durées, fondamentales, nombre de pics, niveaux) en gardant leur intention ; garder intacts la mélodie de début de manche et les coups de feu (test d'égalité des recettes du lot 3h).
4. Écouter sur téléphone (le propriétaire), retirer `atelier-sons.html` au lot 13 avec `sons.html`.

<!-- fin de la fiche: integration-sons -->

<a id="atelier-interface"></a>
<!-- fiche: atelier-interface | ancien: Docs/ref/atelier-interface.md | octets: 6248 | sha256: abba85ef35a7e9f9b66dd7f18c16da6c9cebbd66fe5373c7eaefad919ee3d5d3 -->
# Atelier de l'interface (lot 3k)

Page technique `atelier-interface.html` (`…/lots/lot-3k/atelier-interface.html`). Depuis les choix du propriétaire, `interface-retenue.html` (aperçu de la branche) ne montre que l'interface retenue (`ui-atelier.json`, `retenue` : HUD, pause, fins, à terre en B ; sticks en A), écran par écran ou les six d'un coup. Elle montre l'interface actuelle du jeu et trois directions de refonte, mesure chaque vue et produit un texte « Mes choix » à copier. Elle n'intègre rien dans le jeu, n'enregistre rien et ne fait aucune requête hors de l'origine.

## Méthode
1. **Actuel** : `jeu.html?test=1&seed=1` dans un `<iframe>` de même origine, interface d'origine. L'état est obtenu par les hooks existants de `window.__zs` (`startWave`, `giveMoney`, `setChutes`, `setLevels`, `setWaveParams`, `downPlayer`, `skipWave`, `step`) et des événements de pointeur (sticks), boucle d'images figée comme dans les tests (`js/atelier-interface/actuel.js`). Ce qu'aucun hook ne règle est écrit dans l'état de la vue (vie approchée par des coups de zombie, tués à 0, sauvegarde en mémoire). Écrans absents du jeu : « état non disponible dans « Actuel » » ; le menu E1 « actuel » est la page d'attente `index.html`.
2. **A, B, C** : même cadre `jeu.html?test=1&nospawn=1&seed=1` en fond, son interface masquée de l'extérieur (feuille `#ui3k-hide` injectée dans le document du cadre : `display: none`), boucle figée après 0,4 s ; par-dessus, l'interface de la direction (`js/atelier-interface/render.js`, `screens.js`, feuilles `css/proto-*.css`) alimentée par `mockState` (`js/core/ui-mock.js`). Si le jeu ne peut pas s'afficher (WebGL absent, délai de 60 s), un sol généré en CSS le remplace et un message le dit ; `?fond=sol` le force (tests).
3. **Mesures** : `js/atelier-interface/measure-dom.js` relève boîtes, textes (taille, graisse, couleur, fonds des ancêtres, contour), débordements et animations ; `js/core/ui-measure.js` (pur) calcule part de l'écran, chevauchements, zone sûre, marges, zones des pouces, cibles, contraste sur le pire fond, clignotements, et rapporte chaque écart dans `outOfTarget` avec la mesure, la cible et la raison. Stabilité : `stability()` parcourt vie, argent, vague, chutes, restants, tués et chrono (`sweepValues`) et compare toutes les boîtes (0 px attendu).

## Règles mesurées (`data/game/ui-atelier.json`, `rules`)
Texte ≥ 14 px ; contraste ≥ 4,5:1 (grand texte : 24 px, ou 18,66 px gras, ≥ 3:1) sur le **pire** des 17 fonds (sols, murs, brume de `tokens.css`) après superposition des fonds semi-transparents des ancêtres ; un contour d'au moins 1 px sert de fond local (on retient le meilleur des deux rapports : règle de l'atelier, non normative) ; cibles ≥ 44 px ; chaque bloc à 16 px **plus** la zone de sécurité ; rien dans les zones des pouces (moitiés gauche et droite, à partir de 50 % de la hauteur) hors écrans modaux ; aucun chevauchement (un enfant dans son parent n'en est pas un) ; aucun débordement ; ≤ 3 clignotements par seconde (point REC ≤ 2) ; aucune animation sous `prefers-reduced-motion` ; CLS ≤ 0,1. Aucun `filter`, `mix-blend-mode` ni `backdrop-filter` dans les propositions (la page en utilise un pour le simulateur de daltonisme, sur le cadre d'aperçu seulement).

## Zones de sécurité simulées
Propositions : variables `--ui3k-safe-*` posées sur la scène (préréglage de taille ou choix « Zone de sécurité »). Actuel : le padding de la sonde `.safe-probe` du jeu est imposé par une feuille injectée puis un `resize` fait relire les valeurs par `js/game/safe-area.js` (le jeu publie lui-même `--safe-*`). Valeurs : 812×375 encoche 44 / 21, 844×390 îlot 47 / 21 (gabarits publics d'Apple, non vérifiés sur un téléphone).

## Formats
- **État** : `mockState(params, config)` → `{ hp, maxHp, hpRatio, chutes, money, moneyText, moneyCompact, wave, maxWave, reinforced, floor, multiFloor, remaining, kills, chrono, chronoText, save, trial, down {mode, seconds}, paused, end, earned, bestWave, record, nextZone, warnings }` ; `worstCase()`, `states()`.
- **Mes choix** : une ligne par écran `ecran=hud;direction=B;argent=haut-droite;texte=M;densite=compacte;fond=leger;contour=fin` (« actuel » sans macros), puis `priorite2=retour-degats:B`. Lecture : `parseChoices` (`js/atelier-interface/choices.js`), tolérante (avertissements, jamais d'exception).
- **Tests** : `?test=1` expose `window.__zsUi` (`ready`, `getState`, `set`, `setParam`, `measure`, `stability`, `compare`, `keepChoice`, `keepP2`, `choicesText`, `parseChoices`, `config`) ; rien sans `?test=1`.

## Ajouter une direction ou un état
- **Direction D** : ajouter `D` à `directions` et `macroDefaults` de `ui-atelier.json`, une feuille `css/proto-d.css` (sélecteurs `.ui3k-dir-d`, jetons seulement), la liée dans `atelier-interface.html`, les répartitions de colonnes dans `renderHud` (`render.js`), les textes `atelier.direction.D` et `atelier.direction.desc.D` ; lancer `tests/unit/interface-atelier-protos.test.js` et les deux fichiers e2e.
- **État** : ajouter `{ id, params }` à `states` (champs de `defaults` seulement) et `atelier.state.<id>` aux textes.

## Lire « Mes choix » et intégrer (lot 4b)
1. Coller le texte reçu dans `node scripts/interface/projection.mjs '<texte>'` : éléments, règles CSS, tests à adapter par écran.
2. Suivre `Docs/ref/integration-interface.md` (DOM, CSS, `hud.js`, `ui.js`, clés de `fr.json`, jetons) écran par écran.
3. Adapter les tests listés, reprendre les contrôles des fichiers `interface-atelier*.spec.js` sur `jeu.html`, mesurer Lighthouse (`LH_ONLY=jeu npm run lighthouse`).
4. Retirer les garde-fous de branche (`Docs/ref/fusion-3k.md`) ; `atelier-interface.html` peut rester comme page technique jusqu'au lot 13.

## Commandes
`node scripts/interface/mesures.mjs [--json] [--sizes=…] [--screens=…]` (interface actuelle, 7 tailles) · `node scripts/interface/projection.mjs '<Mes choix>' [--json]` · `E2E_FULL=1 npx playwright test tests/e2e/interface-atelier.spec.js tests/e2e/interface-atelier-ecrans.spec.js` (hors de la suite rapide jusqu'au lot 4b, la liste de `playwright.config.js` n'étant pas modifiable au lot 3k).

<!-- fin de la fiche: atelier-interface -->

<a id="atelier-personnages"></a>
<!-- fiche: atelier-personnages | ancien: Docs/ref/atelier-personnages.md | octets: 22267 | sha256: 8967d7f70ab86a388be297658859eae6174048e01acdbe8bfec1a09297d3c4be -->
# Atelier des personnages (lot 3j)

Document de référence du lot 3j : méthode, architecture de rendu, kit de pièces, squelette, données, variantes, animations, page de l'atelier, sang, essai en jeu, procédures. Plan d'intégration : `Docs/ref/integration-personnages.md` ; manifeste de fusion : `Docs/ref/fusion-3j.md`.

## Méthode

- Tout est mesuré en Node, sans rendu, avec les modules purs de `js/core/` (`character-parts.js`, `pose-v2.js`) et les données (`data/game/characters-v2.json`, `data/game/poses-v2.json`). Les scripts de `scripts/personnages/` impriment leurs mesures et n'écrivent rien.
- Silhouette et contraste : `silhouetteMetrics` rasterise les triangles posés avec la caméra du jeu (`gameView()` de `scripts/personnages/lib.mjs` : perspective 40°, inclinaison 75°, distance `fitDistance(zone de jeu, 667 / 375) / zoom` = 704,5 pour la carte par défaut), personnage au centre, 4 orientations moyennées, 4 × 4 sous-pixels par pixel, z-buffer, couleurs sans éclairage.
- L'agent ne juge ni l'esthétique, ni le caractère effrayant, ni la fluidité sur un vrai téléphone : il fournit des nombres et décrit des captures.

## Architecture de rendu (décision de la partie A, corrigée en partie B)

`node scripts/personnages/architecture.mjs` : 10 zombies (types variés) et le joueur, personnages actuels décrits à l'identique dans les deux architectures, proxy d'ombre de 5 boîtes (60 triangles) pour les os rigides. *(Lot 5e : script retiré avec l'ancien modèle ; mesures gardées ici comme historique.)*

| Mesure | Pièces articulées (actuelle) | Os rigides (`SkinnedMesh`) |
|---|---|---|
| Appels, passe principale | 122 | 22 (corps 11 + proxy d'ombre 11, sans couleur ni profondeur) |
| Appels, passe d'ombre | 55 | 11 |
| Appels au total (11 personnages) | 177 | 33 |
| Appels par zombie | 16 | 3 |
| Triangles, passe principale | 6 920 | 6 920 (+ 660 du proxy, qui n'écrit rien) |
| Triangles, passe d'ombre | 2 936 | 660 |
| Mémoire des géométries partagées | 201 216 o | 709 104 o (5 géométries fusionnées avec couleur et os par sommet) |
| Mémoire propre à chaque personnage | 0 | 4 096 o (texture d'os 16 × 16 du squelette v2 à 19 articulations ; 1 024 o pour v1) |
| Mise à jour d'une pose, 11 personnages (Node) | 0,16 à 0,18 ms par image | 0,15 à 0,19 ms par image |

Lu dans Three.js 0.186.1 (`node_modules/three/src`) : `SkinnedMesh` (mode « attached », `bind(skeleton, bindMatrix)`, `boundingSphere` propre au maillage, calculé une seule fois s'il est nul, donc fixé à la main pour couvrir toutes les poses), `Skeleton` (une texture d'os par squelette, mise à jour une fois par image, partagée par la passe d'ombre), `WebGLShadowMap.renderObject` (**un objet n'est dessiné dans la passe d'ombre que si `object.layers.test(caméra principale)`** : la partie A prévoyait de mettre le proxy sur une couche réservée à la caméra d'ombre, ce qui ne marche pas — vu sur les captures de la partie B, où les variantes n'avaient plus d'ombre ; correction : le proxy reste sur la couche 0 avec une matière `colorWrite: false, depthWrite: false`, qui coûte un appel dans la passe principale et n'écrit rien), `CapsuleGeometry` et `SphereGeometry` (algorithmes repris à l'identique dans le kit), matériaux partagés.

**Décision : os rigides** (un `SkinnedMesh` par matière, un sommet = un os de poids 1, plus un proxy d'ombre ≤ 64 triangles). Raisons mesurées : 33 appels au lieu de 177 pour 11 personnages (−81 %), 4,4 fois moins de triangles dans la passe d'ombre, même coût de mise à jour en Node ; compatible avec le culling du jeu (`root.visible` par étage, sphère englobante fixe de rayon 62 pour le culling hors champ) et avec la projection d'ombre. Complexité : un module (`js/game/character-v2.js`) ; la géométrie se fusionne une fois par variante et par tenue, les paliers d'usure ne changent que la couleur des sommets (attributs partagés). Coût : 3,5 fois plus de mémoire de géométrie (environ 140 Ko par variante et par tenue utilisée). **Critère tenu** : chaque personnage ≤ 4 appels (corps 1, lueur facultative 1, proxy 1 + 1). Les pièces articulées restent pour `?perso=actuel` (code actuel inchangé).

## Kit de pièces (`js/core/character-parts.js`)

- Types : `box` (12 triangles), `taper` (tronc de pyramide de 4 à 8 côtés, 4 n − 4), `capsule` (2 × radial × (2 × caps + 1), triangles dégénérés des pôles compris, comme Three.js), `sphere` (ellipsoïde, 2 w (h − 1)), `wedge` (prisme, 8), `quad` (bande de tissu à deux faces, 4). `sphere` s'ajoute aux cinq types demandés : les têtes, mains et bottes actuelles sont des `SphereGeometry`.
- Pièce : `{ id, piece, joint, kind, dims, offset, rotation, palette | region, material, casts, mirror }` ; transformation : échelle (capsule, sphère), rotation d'Euler XYZ, translation. `mirror: true` sur une articulation `…L` crée la pièce `…R` (x opposé).
- Fonctions : `partTriangles`, `buildPartGeometry` (tableaux purs, indices), `mergeParts` (par matière, non indexé, os, région, couleur par sommet), `characterStats`, `checkVariant` (budget, type ou articulation inconnus, pièce flottante à plus de 0,5, emprise > 1,3 r, hauteur, proportions de `petit`, ombres, texture), `fkPose`, `groundContact`, `boundsOf`, `silhouetteMetrics`, `distinctness`, `gameCamera`, `projectPoint`.

## Squelettes (`data/game/poses-v2.json`)

- `v1` : squelette actuel (bassin à 27, tronc, tête, épaules, coudes, poignets, hanches, genoux) ; `fromV1` (`js/core/pose-v2.js`) traduit une sortie de `computePose` comme `setPose` de `character.js`.
- `v2` : bassin, colonne (`spine`), poitrine (`chest`), cou, tête, épaules, coudes, poignets, hanches, genoux, chevilles (16 articulations), plages articulaires par axe. Angles : Euler `YXZ` de Three.js.

## Données (`data/game/characters-v2.json`)

`{ version, slots: [{ id, label, current, variants }] }` ; `current` reprend les vraies clés de `zombie-variants.json` (`scale`, `headTilt`, `armLift`, `dominant`, régions `outfit`, `trousers`, `skin`, `boot`, `sleeves`) et décrit les pièces actuelles à l'identique (test d'égalité : `tests/unit/persos-actuels.test.js`).

## Variantes (partie B)

`node scripts/personnages/variantes.mjs` (tableau complet et écarts de silhouette). Couleur vue = palette (jetons `--perso-*`) × facteur moyen de la région de détail × salissure ; contraste avec la couleur moyenne de chaque sol (carrelage, herbe, terre, route, trottoir, béton d'escalier) et de chaque sol taché (sol mêlé à 60 % à `--sang-frais`).

| Personnage | A | B | C | Riche (hors budget) |
|---|---|---|---|---|
| Joueur | 844 tri., 3 appels, 3,41:1 | 880 tri., 4 appels (lampe), 3,12:1 | 904 tri., 3 appels, 3,35:1 | 2 244 tri., 3,44:1 |
| Marcheur | 736, 3, 3,81:1 | 804, 3, 3,70:1 | 724, 3, 3,36:1 | 2 048, 3,81:1 |
| Petit | 712, 3, 3,47:1 | 768, 3, 3,41:1 | 772, 3, 3,55:1 | 2 024, 3,47:1 |
| Voûté | 720, 3, 3,36:1 | 804, 3, 3,38:1 | 804, 3, 3,31:1 | 2 032, 3,36:1 |
| Grand | 728, 3, 3,37:1 | 852, 3, 3,87:1 | 832, 3, 3,50:1 | 2 040, 3,39:1 |

(triangles, appels par personnage, contraste minimal sur tous les sols et sols tachés au palier d'usure 0 ; au palier 3 : 3,04:1 au moins ; toutes les tenues testées.) Ombre : 1 appel, 60 triangles. Aucune violation (`checkVariant` : budget, articulations, pièces flottantes, emprise debout ≤ 1,3 × le rayon dans 12 poses debout, hauteur 0,92 à 1,08 × l'actuelle, tête de « petit » entre 1/8,5 et 1/6,5).

- **Intentions** : zombies A « déchu réaliste » (lambeaux, tête inclinée, col ou gilet selon le type), B « horreur marquée » (bras et avant-bras plus longs, cou court et tête avancée, dos plus courbé, membres plus fins, mâchoire, arêtes et omoplates sombres sur le dos), C « lisible d'abord » (sac pour le marcheur, capuche pour le petit, chaînes, bosse et cape pour le voûté, casque, gilet et épaulettes pour le grand) ; joueur A « survivant tactique » (gilet, sac à dos, casquette, genouillères), B « civil débrouillard » (capuche, lampe frontale émissive, sac en bandoulière), C « lisible d'abord » (turquoise `--perso-joueur-vif`, épaules larges, brassard orange). « Riche » : la variante A en segments plus fins, plus de lambeaux, mains et oreilles.
- **Types** : échelles petit 0,93 < voûté 0,98 < marcheur 1 < grand 1,11 ; voûté penché (colonne + poitrine ≈ 1 rad, bras compensés aux 3/10) ; aires de silhouette toujours dans l'ordre petit < marcheur < voûté < grand ; écart minimal entre deux types : 12,6 % (A, marcheur et voûté), 15,0 % (B), 20,7 % (C, marcheur et voûté).
- **Macros** (`macros` de chaque variante, pas entiers de −2 à +2) : taille (±4 % par pas, ±8 %), carrure (±5 % de largeur par pas), usure (décale le palier), teinte (éclaircit ou assombrit de 4 % par pas), posture (±0,06 rad de colonne par pas). Animations : amplitude (±15 %), rythme (±10 % des animations au temps, jamais des marches), lourdeur (bassin plus bas, pas plus courts).
- **Tenues** : 6 palettes par type de zombie (`outfits`, pièces facultatives par tenue : `outfits: [indices]` sur une pièce), tirées par graine à chaque apparition (`pickOutfit` : jamais deux fois la même à la suite) ; 3 palettes pour le joueur (préparation des skins du lot 11).
- **Usure** (`wearByWave`, `wearTiers`) : manches 1-10, 11-20, 21-30, 31-40 → paliers 0 à 3 ; salissure (mélange avec `--perso-crasse`, 0 à 32 %) et déchirures (triangles de tissu assombris par `--perso-dechirure`, 0 à 10 %). Le joueur ne s'use pas.
- **Textures** (`js/core/texgen-persos.js`) : un atlas de détail gris par type (256 × 256, 4 tuiles = paliers de blessure 0 à 3, taches aux couleurs `--sang-*`) et un pour le joueur (128 × 128) ; 5 atlas = 1 485 481 octets avec mipmaps (≤ 4 Mo avec l'atlas du sang). La couleur vient des sommets ; une matière par palier de blessure partage l'image (seul le décalage de texture change).

## Animations (partie B)

`node scripts/personnages/animations.mjs` (maximum sur les 20 variantes) ; contrôles de `tests/unit/persos-animations.test.js` : plages articulaires (`range` de `poses-v2.json`), périodicité (phase 0 = phase 1 à 1e-6), vitesse angulaire < 65 rad/s, glissement du pied d'appui ≤ 15 %, aucune pièce sous le sol (0,5) hors morts, terre et relevage, pénétration des bras dans le tronc ≤ 1,5, morts terminées à plat (point le plus haut ≤ 40 % de la hauteur) dans l'emprise × 1,6.

- Marches (`marcheLente`, `marche`, `course`, `escalier`, joueur `marche`) : le pied d'appui suit une trajectoire droite au sol, la jambe est posée par cinématique inverse (`legIK`) et le bassin descend juste assez pour que la foulée soit atteignable : **glissement mesuré 0,0 %** pour toutes les variantes (l'actuel : environ 22 %). Foulées = `gaits.json` (38, 52, 40, 78), joueur 2π / 0,09 ; vitesses de déplacement inchangées.
- Styles : A mesuré, B lourd et saccadé (phase du haut du corps déformée, bassin plus bas, pas plus courts), C amplitudes nettes (bras tendus plus haut, mouvements francs).
- Zombies : attente (balancement), rampe (corps bas et presque horizontal, bras qui tirent à tour de rôle, comme l'actuel), arracher, escalade, attaque (cycle de 1 s = délai de contact), touché (additif, 0,25 s, nul aux deux bouts), trois morts de 1,2 s (chute avant, chute arrière, effondrement), escalier. Joueur : repos, marche (le tronc vise, les jambes suivent le déplacement), tir (recul), touché, à terre, relevage (0,8 s), réparation (un coup de marteau par cycle, `strikesPerPlank` coups par planche, réglé sur 0,4 à 1,8 s). L'arme et le marteau sont sur deux articulations ajoutées (`prop`, `tool`), cachées par échelle nulle.
- `blendPoses` (fondu de 0,15 s entre deux animations), `addPose` (touché), `poseAt(rig, anim, phase, params, data)`, `cycleSeconds`, `groundLift` (points de contact de `poses-v2.json` et des accessoires de la variante).

## Page `atelier-personnages.html`

Sections : choix (personnage, variante, tenue, usure ou manche, animation, sol, vue, orbite, vitesse, lecture), vue principale, comparaison « A | B | C » (lot 5e : colonne « Actuel » retirée avec l'ancien modèle) à l'échelle du jeu (1,368 unité par pixel), ×2 et ×4, mesures (« hors cible » en toutes lettres), curseurs, sang et mini-arène (partie C), « Mes choix ». Rendu : `js/atelier-personnages/scene.js` (lumière, ombres et brume de `render.json`), personnages du jeu (`character.js` pour « Actuel », `character-v2.js`). Textes : `data/i18n/atelier-personnages.json` (clés `dev.persos.*`, chargé par la page comme l'atelier des sons du lot 3h ; vérifié par `tests/unit/persos-page.test.js`, `fr.json` n'est pas touché). `?test=1` expose `window.__zsPersos` (`getState`, `set(id, valeur)`, `step(secondes)`, `render`).

**« Mes choix »** (`formatChoices`, `parseChoices` de `js/core/persos-variants.js`) : une ligne par personnage choisi, `cle=valeur` séparés par « ; », valeurs signées (`+1`, `-2`), puis `sang=…` :

```
perso=marcheur;variante=B;taille=0;carrure=-2;usure=0;teinte=0;posture=0;tenue=+1;style=B;amplitude=0;rythme=0;lourdeur=0
perso=joueur;variante=C;…
sang=reduit
```

## Sang, cadavres et mini-arène (partie C)

- **Données** : `data/game/blood.json` (provisoire). Niveaux `0` (rien), `reduit` (3 particules par tir non mortel, 8 par mort, 96 vivantes au plus, 12 taches de 8 s, fondu de 3 s, corps sans taches, cadavres de 2 s, teinte `--sang-reduit`), `1` complet (8 et 20 particules, 256 au plus, 48 taches de 20 s dont 5 de fondu, taches sur les corps selon la vie, cadavres de 6 s). Joueur touché : 4 particules au plus, aucune tache. Au plus 6 cadavres (le plus ancien part), enfoncement de 0,8 s.
- **Pur** (`js/core/blood.js`) : `levelOf`, `settings`, `burst(graine, type, direction de la balle, niveau, cfg, origine)`, `stepParticles` (gravité, aucun rebond, une particule qui touche le sol devient une goutte), `decalsAdd` / `decalsStep` / `decalAlpha` (taches gelées, plafond, éviction de la plus ancienne, fondu final), `impactDecals`, `woundTier` (0 à 3 : > 0,75, > 0,5, > 0,25 de vie), `corpsesAdd` / `corpsesStep` / `corpseSink`, `bloodBudget`, `decalAtlas` (4 formes générées).
- **Rendu** (`js/game/blood-fx.js`) : un `InstancedMesh` de quadrilatères pour les particules (1 appel), un pour les taches (1 appel, atlas 256 × 256 généré, forme et opacité par instance), posées à y = 0,2 ; cadavres = personnages en pose de mort, jamais ciblés ni solides (le jeu ne les connaît pas). Pleine charge (complet) : 2 appels, 608 triangles (≤ 3 et ≤ 1 200). Le sang suit l'étage de son événement (affiché à l'étage du joueur et au rez-de-chaussée).
- **Taches sur les corps** : 4 matières par type (une par palier de blessure, même image, décalage de texture), aucune géométrie en plus ; niveau complet seulement.
- **Lisibilité** : contraste ≥ 3:1 de chaque variante sur chaque sol couvert de sang à 30, 60 et 100 % (test) ; aucun état de jeu ne se lit dans le sang ; aucun clignotement, aucun flash.
- **Mini-arène** (`js/core/arena.js`, `js/core/crowd.js`) : 10 zombies en couronne (les 4 types par bloc de 4, allures tirées), vitesses et vies de `createEnemy` (manche 1), tir au délai (0,4 s) et aux dégâts (25) du pistolet sur le plus proche, sans collision ; pas fixes de 1/60 s : la vitesse d'affichage (×0,5, ×1, ×2) ne change pas les résultats.
- **Propositions de priorité 2** (`priority2` de `blood.json`, données seulement, désactivées) : lueur des yeux (2 pièces, 48 triangles, 1 appel), lampe du joueur (déjà émissive sur B ; une vraie lumière dynamique en plus, non mesurée), copeaux de réparation (même instance que les particules, 1 appel).

Projection (`node scripts/personnages/projection.mjs`) : décor de la référence + 10 zombies variés et le joueur + sang à pleine charge + 6 cadavres :

| Personnages | Sang | Personnages seuls | R1 | R2 | U1 | U4 | Marge / limites actuelles (300, 30 000) | Marge / refonte (400, 45 000) |
|---|---|---|---|---|---|---|---|---|
| actuel | 0 | 177 / 9856 | 203 / 14370 | 194 / 14988 | 210 / 15208 | 216 / 16092 | 84 appels, 13908 triangles | 184 appels, 28908 triangles |
| A | 1 | 33 / 9404 | 79 / 19662 | 70 / 20280 | 86 / 20500 | 92 / 21384 | 208 appels, 8616 triangles | 308 appels, 23616 triangles |
| B | 1 | 34 / 10228 | 80 / 20894 | 71 / 21512 | 87 / 21732 | 93 / 22616 | 207 appels, 7384 triangles | 307 appels, 22384 triangles |
| C | 1 | 33 / 9984 | 79 / 20170 | 70 / 20788 | 86 / 21008 | 92 / 21892 | 208 appels, 8108 triangles | 308 appels, 23108 triangles |
| riche | 1 | 33 / 23924 | 79 / 42054 | 70 / 42672 | 86 / 42892 | 92 / 43776 | 208 appels, -13776 triangles | 308 appels, 1224 triangles |

Textures (Node, non représentatif d'un téléphone) : 4 atlas de zombies 23.0 ms, joueur 1.3 ms ; mémoire estimée avec le sang : 1835006 octets (limite 4194304).

## Essai en jeu (partie D)

- **Paramètres** (`js/game/persos-params.js`) : `?perso=actuel|A|B|C|riche` (défaut **`riche`**), `?sang=0|reduit|1` (défaut **`1`**, sang complet), `?usure=auto|0|1|2|3` (défaut `auto` : palier de la manche en cours). Défauts choisis par le propriétaire après la livraison ; `?sang=reduit`, `?sang=0` et `?perso=actuel|A|B|C` restent disponibles pour le futur écran de réglages. Valeur inconnue : défaut, sans erreur. Jamais mémorisés ; absents de `readOnlyParams` (`save.json`) : ils ne déclenchent pas le mode essai, la sauvegarde reste écrite. *(Lot 5e : ancien modèle retiré ; `?perso=actuel` est une valeur inconnue, voir `Docs/ref/personnages-integres.md`.)*
- **Chargeur** : `game.js` importe toujours `persos-loader.js` ; celui-ci importe `persos-runtime.js` et les données (`characters-v2.json`, `poses-v2.json`, `blood.json`) sauf avec `?perso=actuel&sang=0` (le jeu d'avant le lot : rien de plus n'est chargé que le chargeur et `persos-params.js`). *(Lot 5e : ancien modèle retiré ; `?perso=actuel` est une valeur inconnue, voir `Docs/ref/personnages-integres.md`.)*
- **Arme** : `muzzle()` du joueur v2 donne le bout du canon dans le monde ; `game.js` le passe à `effects.update` (`gun`) : laser, éclair et balles en partent, à sa hauteur (la logique du tir reste celle de `muzzlePoint`). Tenue de l'arme : `HOLD` de `pose-v2.js` (bras tendus) ; recul au tir : `KICK` (à l'arrêt comme en marchant, buste rejeté, 0,25 s). Viser un zombie interrompt la réparation (jamais les deux à la fois) ; pendant la réparation, le laser n'est pas dessiné.
- **Fenêtres** : pendant le passage (`climb.t` > 0), les zombies v2 jouent `enjamber` (piloté par la progression, hauteur d'appui `sillHeight` de `render.json`) ; avant, ils marchent jusqu'au bord extérieur.
- **Morts** : `deathFor` (`js/core/blood.js`) choisit la mort d'après le côté touché (de face : `mortArriere` ; de dos : `mortAvant` ou `effondrement`) ; le cadavre garde l'orientation du zombie.
- **Démarrage** : seul le joueur est construit dans `createGame` ; les zombies (texture et géométrie de chaque tenue) sont préparés ensuite, une tenue par tâche, quand le navigateur est libre (`requestIdleCallback`), et l'atlas des taches au premier moment libre ou à la première tache ; les maillages du sang sont masqués tant qu'ils sont vides ; les géométries des personnages actuels ne sont construites qu'au premier personnage actuel. Les textures et géométries sont identiques à l'octet près à celles d'avant ces optimisations (empreintes comparées).
- **Accroches** : `character.js` (1 ligne : `kit.v2` aiguille `createCharacter`), `game.js` (18 lignes `// lot 3j` : impacts, morts, coups reçus, pas du sang, synchronisation par étage et manche, contexte du joueur, `getState().persos`), `effects.js` inchangé. Les personnages v2 reçoivent l'entrée de `computePose` et l'entité (zombie) ou le contexte (joueur) : allure, siège, escalier (marche d'escalier ; rampants en rampe, toujours relevés de 14 par le jeu), attaque (relance du délai de contact), touché (flash), à terre, relevage, réparation (durée par planche de la statistique). *(Lot 5e : ancien modèle retiré ; `?perso=actuel` est une valeur inconnue, voir `Docs/ref/personnages-integres.md`.)*
- **Invariance** : à graine fixe et 600 pas, `getState()` (positions, vies, tués, vague, argent) est identique pour `actuel`, A, B, C, `riche` et les trois niveaux de sang (`tests/e2e/persos-jeu.spec.js`, boucle d'images figée).
- Crochet « spawnVariety » : le crochet existant `spawnEnemy(x, y, { type, gait, wave, floor, mode })` suffit (zombies de types et d'allures variés) ; `killAll` est inchangé.
- `?test=1` : `getState().persos` = `{ perso, sang, usure, wear, architecture, characters: { joueur, zombies }, blood: { particules, taches, cadavres, calls, triangles, dessines }, textures, render }`.

## Procédures

- **Ajouter une variante** : une entrée dans `variants` de l'emplacement voulu (`characters-v2.json`) : `skeleton: 'v2'`, `style`, `scale`, `joints` (épaules et hanches au moins), `posture`, `parts` (types du kit, `palette` = clé de la palette), `shadow` (≤ 64 triangles), `palette` (jetons `--perso-*`), `anchors`, `macros`, `outfits`, `contacts` (accessoires du tronc) ; puis `node scripts/personnages/variantes.mjs` et les tests `persos-variantes`, `persos-animations` (budget, contrastes, silhouettes, animations).
- **Ajouter une tenue** : une entrée `{ id, label, palette: { tenue, pantalon, accent } }` dans `outfits` (6 par type de zombie, 3 pour le joueur) ; une pièce facultative prend `outfits: [indices]`.
- **Ajouter une animation** : une fonction dans `js/core/pose-v2.js` (phase → angles), son nom dans `ZOMBIE_ANIMS` ou `PLAYER_ANIMS` (et `CYCLIC` si elle boucle), ses réglages par style dans `poses-v2.json`, son libellé `dev.persos.anim.<nom>` ; les tests de `persos-animations` la contrôlent alors d'office.
- **Lire « Mes choix »** : `parseChoices(texte)` renvoie `{ persos: [{ perso, variante, … }], extra: { sang } }` ; `node scripts/personnages/projection.mjs mes-choix.txt` imprime le budget correspondant.
- **Intégrer** : `Docs/ref/integration-personnages.md`.

<!-- fin de la fiche: atelier-personnages -->

<a id="verification-versions"></a>
<!-- fiche: verification-versions | ancien: Docs/ref/verification-versions.md | octets: 6953 | sha256: fd599a6ee21fd7de287c6492c5ca38b6732f05ba82d3a28e26026f1c4e165a53 -->
# Vérification des versions archivées (lot 4c-B)

Archives construites le 2026-11-02 par `node scripts/versions/archiver.mjs --all` (une version à la fois, depuis son hash gelé de `versions.json`), sur la branche orpheline **`archive`** : `6d8c1bc` (4 commits : `b617c21` V0.1, `955ebbd` V0.2, `34b3b48` V0.3, `6d8c1bc` V0.4 ; `LISEZMOI.md` + `v0.1/` à `v0.4/`, 398 fichiers, **aucun fichier de workflow**). Relance de `--id v0.2` : « inchangée », aucun commit (idempotent). V0.5 : archivée au lot 5f (publication de V0.6) par `node scripts/versions/archiver.mjs --id v0.5 --ref e23d92b7cfa46e92693b6695d2e8ad15ecc28344` (tête de `main` au moment de l'archivage, ce que le public voyait ; son contenu ne diffère de la fusion `e6cf00e` que par la documentation et le seed) : essai à blanc, puis commit `92631da` sur `archive` (5 commits ; `LISEZMOI.md` + `v0.1/` à `v0.5/`, 651 fichiers, aucun fichier de workflow). V0.6 : archivée au lot 5p (publication de V0.7) par `node scripts/versions/archiver.mjs --id v0.6 --ref 6e3ae1ad602ff7612e6ad0901e823902fd20d9e0` (tête de `main`, ce que le public voyait : même jeu que `cef11b3`, plus l'accueil retouché du lot 5i, le fichier des noms et le seed ; le `ref` de V0.6 dans `versions.json` passe de `cef11b3` à ce hash) : essai à blanc (`--dry-run --keep`, puis le vérificateur sur le dossier construit), puis commit `eab1a3f` sur `archive` (6 commits ; `LISEZMOI.md` + `v0.1/` à `v0.6/`, 910 fichiers, 20,4 Mo, aucun fichier de workflow).

Contrôle : `node scripts/versions/verifier.mjs` (contenu de `origin/archive` extrait en dossier temporaire, servi par `scripts/site/serve.mjs` sous **`/Z-Survival/v0.N/`**, comme sur GitHub Pages ; Chromium de Playwright, 667×375, WebGL logiciel SwiftShader : présent pour les quatre versions ; aucune conclusion sur la fluidité). Pour chaque version : la page d'entrée et la page `v0.N/` sont chargées, puis 4 s d'attente.

| Version | Branche (hash) | Entrée | Taille | Fichiers | `npm ci` / build | Ressources manquantes | Erreurs de console | Liens non relatifs | Statut |
|---|---|---|---|---|---|---|---|---|---|
| V0.1 | `lot-1` (`1ffbf76`) | `v0.1/jeu.html` | 1,7 Mo | 54 | 8,5 s / 0,2 s | 0 | 0 | 0 | archive |
| V0.2 | `lot-1d` (`8a098f0`) | `v0.2/jeu.html` | 2,7 Mo | 93 | 7,0 s / 0,2 s | 0 | 0 | 0 | archive |
| V0.3 | `lot-2c` (`0eee619`) | `v0.3/jeu.html` | 2,8 Mo | 108 | 6,7 s / 0,2 s | 0 | 0 | 0 | archive |
| V0.4 | `lot-3e` (`b4a0e31`) | `v0.4/jeu.html` | 3,2 Mo | 142 | 6,8 s / 0,2 s | 0 | 0 | 0 | archive |
| V0.5 | `lot-4b` (archivée depuis `main` `e23d92b`, lot 5f) | `v0.5/jeu.html` | 4,9 Mo | 253 | 5,1 s / 0,2 s | 0 sur `jeu.html` ; 1 sur `v0.5/` (`versions.json`, 404) | 0 sur `jeu.html` ; 1 sur `v0.5/` (la même 404) | 0 | archive |
| V0.6 | `dev` (archivée depuis `main` `6e3ae1a`, lot 5p) | `v0.6/jeu.html` | 5,0 Mo | 259 | 5,7 s / 0,1 s | 0 sur `jeu.html` ; 1 sur `v0.6/` (`site-info.json`, 404) | 0 sur `jeu.html` ; 1 sur `v0.6/` (la même 404) | 0 | archive |

Aucune version indisponible. Aucun fichier de plus de 50 Mo (le plus gros : `vendor/` de chaque version). Total des archives : 10,4 Mo (V0.1 à V0.4), 15,3 Mo avec V0.5, 20,4 Mo avec V0.6. Vérification complète : 43 s (lot 4c), 54 s avec V0.5 (lot 5f), 67 s avec V0.6 (lot 5p).

**V0.5, écart connu (lot 5f, accepté par le propriétaire)** : sa page `v0.5/` (`index.html`) est l'ancien accueil du lot 4c, qui lit `versions.json` dans son dossier ; l'archiveur n'en écrit pas, d'où une 404 et un message de console sur cette page seulement (la requête échoue sans erreur de script : la liste des versions y est vide). L'entrée `v0.5/jeu.html`, celle que l'accueil de la Recette ouvre, se charge sans ressource manquante ni erreur. Rien n'a été corrigé (archiveur inchangé).

**V0.6, même écart (lot 5p)** : sa page `v0.6/` (`index.html`) est l'accueil des lots 5g à 5i, qui lit `site-info.json` dans son dossier ; l'archiveur n'en écrit pas, d'où une 404 et un message de console sur cette page seulement. L'entrée `v0.6/jeu.html` se charge sans ressource manquante ni erreur (WebGL logiciel présent). Rien n'a été corrigé (archiveur inchangé).

## À regarder à la main (le propriétaire)

| Version | Adresse après fusion | Ce qu'il faut regarder |
|---|---|---|
| V0.1 | `…/v0.1/jeu.html` | Premier moteur 2D (avant Three.js) : salle simple, sticks, laser, tir automatique à balle visible, zombies, pause ; sons Web Audio simples. Pas de textures, pas de vagues. |
| V0.2 | `…/v0.2/jeu.html` | Three.js : monde plus grand, meubles, textures générées, personnages finaux ; sons synthétisés (voix de zombies) et invitation « Touche ici pour activer le son » sur téléphone. |
| V0.3 | `…/v0.3/jeu.html` | Vagues et allures, types de zombies, cône de tir, statistiques ; animation de changement de vague, mélodie, effet VHS. |
| V0.4 | `…/v0.4/jeu.html` | Fenêtres à planches (arrachage, réparation), chutes, carte du rez-de-chaussée et étage, escaliers, portes qui s'ouvrent aux manches 10, 20, 30 (`?wave=21&floor=1`). |
| V0.5 | `…/v0.5/jeu.html` (lot 5f ; avant : `…/Recette/` puis « Jouer ») | Argent, sauvegarde, refontes (carte, sons, interface, personnages, sang) ; **elle lit et écrit la même sauvegarde `zs.save.v1` que la Recette** (même domaine) ; `…/v0.5/` (ancien accueil) : liste des versions vide et une 404 en console, attendu. |
| V0.6 | `…/v0.6/jeu.html` (lot 5p ; avant : `…/Recette/` puis « Jouer ») | Épaves (voiture en flammes, hélicoptère écrasé), nouvel impact sur les zombies, préréglages graphiques (`?gfx=`) ; **même sauvegarde `zs.save.v1` que la Recette**, sans les relevés entre onglets de V0.7 (ne pas la laisser ouverte en même temps qu'un onglet V0.7) ; `…/v0.6/` (accueil des lots 5g à 5i) : une 404 (`site-info.json`) en console, accueil dans son état « données absentes » (`homeModel` : `state: 'error'`), attendu. |

Pour toutes les versions archivées :
- leur `index.html` est l'ancienne page d'attente « En construction » : on les ouvre par leur entrée (`jeu.html`), comme le fait l'accueil de la Recette (lot 5g : le journal `/dev/` est supprimé, `/dev/` est le build de développement) ;
- leur `/v0.N/dev/` est l'ancien menu : il affiche « La liste des lots est indisponible » (les aperçus par lot sont retirés) ; c'est attendu ;
- elles partagent l'origine du site : la langue mémorisée (`mobile-games.lang`) est commune (lot 5g : `/Recette/` et `/dev/` partagent aussi la même sauvegarde `zs.save.v1`) ; V0.1 à V0.4 n'ont pas de sauvegarde (introduite au lot 4, V0.5) et ne peuvent pas toucher `zs.save.v1` ; V0.5 (archivée au lot 5f) l'utilise : elle peut lire une sauvegarde écrite par une version plus récente (verrouillée si son schéma est plus récent, jamais écrasée) ;
- le jeu, les sons et l'esthétique n'ont pas été jugés par l'agent (rendu logiciel seulement, aucun son écouté).

<!-- fin de la fiche: verification-versions -->

<a id="versions-correspondance"></a>
<!-- fiche: versions-correspondance | ancien: Docs/ref/versions-correspondance.md | octets: 4803 | sha256: 294538a8cc3b177db1d28797a34cde35c8e7150c720d95b15c69f273ac0f8fbd -->
# Correspondance des versions (lot 4c-A)

Relevé le 2026-11-02 sur `origin` (après `git fetch origin --prune`). Les hash sont **gelés** dans `versions.json` (champ `ref`) : l'archive d'une version est construite depuis ce commit, jamais depuis la tête de la branche (qui pourrait bouger). Les branches restent la source des versions et ne sont jamais supprimées.

## Versions

| Version | Branche | Hash gelé (`ref`) | Date du commit | Résumé (déduit du plan des lots, à confirmer par le propriétaire) | Contrôle par l'historique | Doute |
|---|---|---|---|---|---|---|
| V0.1 | `lot-1` | `1ffbf76e8521a8cfc384b603e90d422842d5d8e3` | 2026-10-26 | Cœur du jeu sur le premier moteur 2D, retiré au lot 1m au profit de Three.js (nom exact dans `versions.json` : ce dossier ne cite pas l'ancienne bibliothèque, règle du lot 1m) | tête « Lot 1 — Bilan mis à jour », après la fusion #1 ; `devDependencies` : l'ancienne bibliothèque 2D (pas `three`) ; `apercu.txt` : `jeu.html`, « Cœur du jeu » | aucun |
| V0.2 | `lot-1d` | `8a098f02510d03ea97dffb8a9bdce3ab6bc5bdba` | 2026-10-27 | Jeu en Three.js : monde, textures, personnages, sons | contient `lot-1`, `lot-1m` (Three.js), `lot-1b` (monde), `lot-1c` (textures, personnages) ; ajoute les sons (`synth.js`, `sons.html`) ; `devDependencies` : `three` | aucun |
| V0.3 | `lot-2c` | `0eee61905f1a3d1dd102949b7752392d8d7439cc` | 2026-10-27 | Vagues, allures et types de zombies, cône de tir, statistiques, animation de manche, effet VHS | contient `lot-1d`, `lot-2` (vagues, allures), `lot-2b` (cône, statistiques) ; 2c-A/2c-B : animation de vague, VHS, ambiance | mineur : la tête de `lot-2c` est un commit de workflow (« Workflow allégé ») postérieur au bilan ; le jeu est celui de 2c-B |
| V0.4 | `lot-3e` | `b4a0e315d644ce934894549dee8c8bd044bfaa68` | 2026-10-30 | Fenêtres à planches, carte à deux étages, escaliers, portes qui s'ouvrent par manche | contient `lot-2c`, `lot-3` (fenêtres, siège), `lot-3a`, `lot-3c` (zones, portes) ; 3e : étage, escaliers, portes 2 et 3 | mineur : le dernier commit de `lot-3b` (`c8ffcd3`, tests e2e seulement) n'est pas dans `lot-3e` ; le contenu du jeu de 3b y est (carte du rez-de-chaussée) |
| V0.5 | `lot-4b` | `e6cf00e0392250d1125e4c14c11a91837fca29db` | 2026-11-02 | Version actuelle : argent et sauvegarde, refontes (carte, sons, interface, personnages, sang) | **commit de fusion** « Merge pull request #20 from Nowyyy/lot-4b » dans `main` (parents : `a8e5a9d` de `main`, `3d60823` = tête de `lot-4b`) ; `lot-4b` ⊂ `main` (`git merge-base --is-ancestor`) | aucun ; à noter : trois fusions de `lot-4b` (#18, #19, #20), la dernière est retenue (elle est égale à `origin/main` au relevé) |

Aucune branche ne contredit sa description : **pas d'arrêt après la partie A**. Les deux doutes mineurs ne changent pas le contenu du jeu ; ils sont à confirmer par le propriétaire en même temps que les descriptions.

## Contrôle des refs et des déclencheurs

Chaque commit existe (`git cat-file -e <hash>^{commit}`), porte un `package.json` avec `"build": "node scripts/build.mjs"` et un seul workflow, `.github/workflows/pages.yml`.

| Version | Branche | Hash | Jobs du workflow à ce commit | Déclencheurs `push` | Risque qu'un push sur la branche redéploie un ancien site |
|---|---|---|---|---|---|
| V0.1 | `lot-1` | `1ffbf76` | `verify` (30 min), `refresh`, `deploy` | `main`, `lot-*` (+ `pull_request`, `workflow_dispatch`) | **faible** : `deploy` exige `github.ref == 'refs/heads/main'` ; `refresh` relance le workflow **de `main`** (`gh workflow run pages.yml --ref main`), qui republie le site courant, pas l'ancien |
| V0.2 | `lot-1d` | `8a098f0` | `verify` (30 min, rejeu), `refresh`, `deploy` | idem | faible (mêmes conditions) |
| V0.3 | `lot-2c` | `0eee619` | `quick`, `e2e` (Pull Request), `refresh`, `deploy` | idem | faible (mêmes conditions) |
| V0.4 | `lot-3e` | `b4a0e31` | `quick`, `e2e`, `refresh`, `deploy` | idem | faible (mêmes conditions) |
| V0.5 | `lot-4b` | `e6cf00e` (fusion dans `main`) | `quick`, `e2e`, `refresh`, `deploy` | idem | faible (mêmes conditions) |

Risques résiduels, d'où le réglage demandé au propriétaire (**Settings → Environments → `github-pages` → Deployment branches : `main` et `dev` seulement**) :
- un vieux workflow modifié sur une de ces branches (par erreur) pourrait retirer la condition `refs/heads/main` : l'environnement le refuserait alors ;
- un push sur une branche de version déclenche toujours `refresh`, qui relance le **nouveau** workflow de `main` : sans danger (republication du site courant), mais inutile ; c'est pourquoi aucun agent ne pousse sur ces branches ;
- la branche `archive` ne contient **aucun** fichier de workflow : un push sur `archive` ne déclenche rien.

<!-- fin de la fiche: versions-correspondance -->

