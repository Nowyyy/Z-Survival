# Bilan du lot 1 — Cœur du jeu (Phaser, visée, laser, tir automatique à balle visible)

Branche `lot-1`, commits « Lot 1-A », « Lot 1-B », « Lot 1-C ». Workflow, `index.html`, `Docs/seed.md` et bilans existants : non modifiés.

## Livré
- **Phaser 4.2.1** (MIT, publiée le 2026-07-09, `phaser.min.js` 1 375 976 octets) : devDependency exacte, `npm run vendor` → `vendor/phaser.min.js` + `vendor/LICENSE-phaser.txt`. `dependencies` reste vide.
- `jeu.html`, `css/game.css`, `js/game/` (main, boot, texts, scene, input, ui, audio, palette, textures, testhook), `data/game/*.json` (provisoires), `apercu.txt` (`jeu.html` / `type: hifi` / `titre: Cœur du jeu`), `--game-*` dans `tokens.css`, clés `game.*` dans `fr.json`.
- `js/core/` pur : vec, viewport, movement, rng, stick, aim, ray, projectile, combat, enemy-ai, spawner, sound-params. Le laser (`ray.js`) vise et déclenche ; seuls les impacts de `projectile.js` blessent.
- Sticks flottants multi-touch (E2-3, E2-4), pause (E2-6), fin provisoire (E2-7), HUD dans le canvas + `#hud-live`, sons Web Audio, touches F, M, P, Échap. `npm run build` copie aussi `jeu.html` et `apercu.txt` ; `npm run lighthouse` mesure maintenant `index.html` et `jeu.html`.
- `CLAUDE.md` : 5 210 caractères ; section « Jeu » ajoutée à `conventions.md`.

## Choix
- **Haute densité** : Phaser 4 n'a pas de réglage de résolution. Le canvas fait fenêtre × ratio, ratio = `min(devicePixelRatio, 2)` ; la caméra a pour zoom `zoom_viewport × ratio` ; le CSS ramène le canvas à la taille de la fenêtre. Testé à ratio 3 : canvas 1600×900 pour 800×450.
- Entrées, souris et sticks lus par des écouteurs DOM (pas par le module d'entrée de Phaser, désactivé) : `event.code` fiable, multi-touch simple.
- Décor de 600 unités insuffisant pour des fenêtres très hautes (ex. 768×1024) : un liseré du fond de caméra (couleur du décor) apparaît au bord ; non traité.
- Bruit du navigateur filtré dans les tests de console : `GL Driver Message … ReadPixels`, émis à la création du premier contexte WebGL (reproduit sur une page Phaser vide).
- `phaser.min.js` en `defer` + indicateur de chargement SVG + `boot.js` (textes avant Phaser) pour garder un premier affichage rapide (FCP 1,1 s).

## Critères (chiffres)
- Départ `main` : 130 Vitest, 44 Playwright. Arrivée : **263 Vitest** (+133), **109 Playwright exécutés** (+65 ; 25 ignorés car propres à un projet), lint sans avertissement.
- Largeurs vues : 375×667 (message de rotation), 667×375, 768, 1440×900, 2560×1080. Canvas = fenêtre à 0 px près à 1440×900, 1920×1080, 2560×1080, 667×375 et après redimensionnement ; aucun défilement.
- Délai tir → impact (temps de jeu) : attendu 0,541 s, mesuré 0,557 s (+3,1 %, seuil 15 %).
- **Lighthouse mobile `jeu.html` : performance 50 (seuil 75 NON atteint)**, accessibilité 100, bonnes pratiques 100, CLS 0,001. `index.html` : 92 / 100 / 100, CLS 0. Cause : évaluation de Phaser ≈ 2,2 s sous la limitation CPU de Lighthouse (TBT 1,2 s) ; LCP simulé ≈ 10 s alors que le LCP observé est 290 ms. Essais : `defer` (31 → 52), puis chargement différé de Phaser (50, abandonné). Seuil non modifié ; `npm run lighthouse` échoue donc sur `jeu.html`.
- CLS de `jeu.html`, données retardées de 400 ms : 0 à 360, 768 et 1440 px (objectif 0,08).
- Images par seconde sur 10 s, 5 zombies et balles en vol : **59,6 à 667×375, 15,3 à 1440×900**. Mesuré en WebGL logiciel (pas de GPU dans l'environnement) : non représentatif d'un téléphone ou d'un PC.
- Tactile : un test CDP à deux doigts simultanés (déplacement + visée) passe ; le reste des sticks est couvert en pur (`stick.js`, `aim.js`). Les glissés multi-touch plus longs ne sont pas simulés.

## Tests adaptés (avant / après) et supprimés
- `data-i18n.test.js` : clés identiques fr/en hors `dev.*` → hors `dev.*` et `game.*` ; « aucune clé `dev.*` en anglais » → « ni `dev.*` ni `game.*` » ; sources de clés étendues à `jeu.html` et `js/game/`.
- `build.test.js` : liste des fichiers attendus dans `_site/` étendue (jeu.html, apercu.txt, Phaser, js/game, js/core, data/game).
- `package.test.js` : inchangé (il vérifiait déjà que `dependencies` est vide) ; `vendor.test.js` ajoute les contrôles de Phaser.
- Supprimés : aucun.

## Points ouverts
- Performance Lighthouse de `jeu.html` sous 75 (voir ci-dessus) ; décision à prendre : seuil, ou chargement de Phaser autrement.
- Son : synthèse écrite et branchée, mais aucun navigateur avec audio dans l'environnement : non écouté.
- Fullscreen réel non essayé dans un vrai navigateur (testé avec une API simulée).
- Déploiement et `/lot-1/` non ouverts depuis la session.

## Choix à valider
- Équilibrage (`data/game/`) : balle 1100 u/s, délai 0,4 s, dégâts 25, zombie 50 de vie à 70 u/s, 5 présents, apparition toutes les 3 s.
- Couleurs `--game-*` (zombie vert terne, murs brun-rouge, balle crème, flash orange), sons (4 sons synthétisés : tir, touché, mort, joueur touché), taille des sticks (rayon 56 px, zone morte 15 %).

## À tester par moi (sur `/lot-1/`, téléphone en paysage et ordinateur)
Plein écran et touche F ; sticks (E2-3, E2-4) ; laser ; balle visible et délai avant l'impact ; tir automatique ; sons et touche M ; pause (E2-5, E2-6) ; fin provisoire (E2-7) ; lisibilité du HUD (E2-2) à 375 px de haut ; message de rotation en portrait.

## Fusion (à faire par moi)
Pull Request `lot-1` vers `main`, « Create a merge commit », ne pas supprimer la branche. Pages à vérifier : `/`, `/dev/`, `/jeu.html`, `/lots/lot-1/jeu.html`.
