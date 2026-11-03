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
| sonsAncien | `sons=ancien` | 3 523 | 3 914 (3 808–4 321, 206) | 4 179 | 77 |
| persoActuel | `perso=actuel` | 3 366 | 3 653 (3 185–3 845, 205) | 3 655 | 601 |
| detail0 | `detail=0` | 2 856 | 3 345 (3 089–3 394, 165) | 3 391 | **865** |
| fps1 | `fps=1` | 3 431 | 3 819 (3 733–3 942, 70) | 3 995 | 261 (bruit) |
| nospawn1 | `nospawn=1` | 3 627 | 4 079 (3 763–4 151, 197) | 4 100 | 156 |
| empty1 | `empty=1` | 3 171 | 3 395 (3 076–3 515, 40) | 3 432 | 824 |
| mursBas | `murs=bas` | 3 315 | 3 719 (3 653–3 800, 54) | 3 851 | 405 |
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
- `detail=0`, `perso=actuel`, `empty=1`, `murs=bas`, `nospawn=1` changent le jeu montré ou sa logique : jamais pour un garde-fou ni pour un test du rendu.

## Fichiers de test qui pourraient utiliser `vhs=0&shadows=0&dpr=1` sans risque (non modifiés)
Critère : le fichier ouvre `jeu.html` et ne porte ni sur le VHS, ni sur les ombres, ni sur le DPR, ni sur les budgets de dessin (appels, triangles, mesurés ombres actives), ni sur les couleurs lues à l'écran (relevé par `grep` des mots `vhs|shadow|ombre|dpr|pixelRatio|triangles|calls|budget|screenshot|getImageData|readPixels|contraste`).
- `jeu.spec.js`, `jeu-combat.spec.js`, `jeu-voix.spec.js`, `sons-integres.spec.js`, `sons-integres-ambiances.spec.js` : aucune mention.
- `jeu-interface.spec.js`, `atelier-visite.spec.js` : ont déjà `vhs=0` ; ajouter `shadows=0&dpr=1`.
- `jeu-sons.spec.js` : a déjà `dpr=1` en grand écran ; ajouter `vhs=0&shadows=0`.
- `fumee.spec.js` : possible, mais la fumée gagne à garder le réglage par défaut (c'est ce que voit le joueur) : à décider par le propriétaire.
- `sang=0` en plus, sans risque pour : `jeu-voix`, `sons-integres`, `sons-integres-ambiances`, `jeu-interface` (aucune mention du sang).
- **À ne pas changer** : `jeu-ambiance` (VHS), `jeu-rendu`, `jeu-monde` et `jeu-textures` (budgets avec ombres), `jeu-pause` (DPR), `carte-jeu`, `etage*`, `jeu-zones`, `persos-*`, `jeu-personnages`, `argent`, `interface-integree`, `atelier-*` (ombres, sang, détail ou couleurs mesurés), `publication` (site publié tel quel).
