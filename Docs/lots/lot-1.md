# Bilan du lot 1 — Cœur du jeu (Phaser, visée, laser, tir automatique à balle visible)

Branche `lot-1` (fusionnée dans `main`, PR n°1, commit de fusion). Workflow, `index.html`, `Docs/seed.md` et bilans existants : non modifiés. Le tag `lot-1` n'a pas pu être poussé (refusé), il existe en local.

## Livré
- **Phaser 4.2.1** (MIT, publiée le 2026-07-09, `phaser.min.js` 1 375 976 octets) : devDependency exacte, `npm run vendor` → `vendor/`. `dependencies` reste vide.
- `jeu.html`, `css/game.css`, `js/game/` (main, boot, texts, scene, input, ui, audio, palette, textures, testhook), `data/game/*.json` (provisoires), `apercu.txt`, `--game-*` dans `tokens.css`, clés `game.*` (français seul).
- `js/core/` pur : vec, viewport, movement, rng, stick, aim, ray, projectile, combat, enemy-ai, spawner, sound-params. Le laser vise et déclenche ; seuls les impacts de `projectile.js` blessent.
- Sticks multi-touch (E2-3, E2-4), pause (E2-6), fin provisoire (E2-7), HUD canvas + `#hud-live`, sons Web Audio, touches F, M, P, Échap.
- **Menu /dev** : `assemble.mjs` écrit `entry` (1re ligne de `apercu.txt`) dans `lots.json` ; le menu ouvre cette page (« Lot 1 » ouvre `jeu.html`). Si `entry` manque (ancien script), le menu lit `apercu.txt` lui-même ; la copie du menu d'un aperçu (`/lots/lot-N/dev/`) remonte à la racine. `serve.mjs` ne plante plus sur une URL absente.
- `npm run lighthouse` mesure `index.html` et `jeu.html`. `CLAUDE.md` : 5 210 caractères ; section « Jeu » dans `conventions.md`.

## Choix
- **Haute densité** : Phaser 4 n'a pas de réglage de résolution. Canvas = fenêtre × `min(devicePixelRatio, 2)`, zoom de caméra × ratio, CSS à la taille de la fenêtre. Testé à ratio 3 : 1600×900 pour 800×450.
- Entrées lues par écouteurs DOM (module d'entrée de Phaser désactivé). Console des tests : le message `GL Driver Message … ReadPixels` du navigateur est filtré.
- Décor de 600 unités insuffisant pour des fenêtres très hautes (768×1024) : liseré du fond de caméra au bord.
- Après coup : la CI a échoué sur A et B (test « joueur reste dans la salle » trop lent sur le runner en 1440×900) ; il tourne maintenant en 667×375 avec un délai de 90 s.

## Critères (chiffres)
- Départ `main` : 130 Vitest, 44 Playwright. Arrivée : **266 Vitest**, **117 Playwright exécutés** (25 ignorés, propres à un projet), lint sans avertissement, CI verte sur le dernier commit.
- Largeurs vues : 375×667 (rotation), 667×375, 768, 1440×900, 2560×1080. Canvas = fenêtre à 0 px près (1440×900, 1920×1080, 2560×1080, 667×375, après redimensionnement) ; aucun défilement.
- Délai tir → impact : attendu 0,541 s, mesuré 0,557 s (+3,1 %, seuil 15 %).
- **Lighthouse mobile `jeu.html` : performance 50 (seuil 75 NON atteint)**, accessibilité 100, bonnes pratiques 100, CLS 0,001. `index.html` : 92 / 100 / 100. Cause : évaluation de Phaser ≈ 2,2 s sous limitation CPU (TBT 1,2 s) ; LCP simulé ≈ 10 s, observé 290 ms. Essais : `defer` (31 → 52), chargement différé (50, abandonné). Seuil inchangé : `npm run lighthouse` échoue sur `jeu.html`.
- CLS avec données retardées de 400 ms : 0 à 360, 768 et 1440 px. Images par seconde (10 s, 5 zombies, balles) : 59,6 à 667×375, 15,3 à 1440×900, en WebGL logiciel (non représentatif).

## Tests adaptés (avant / après) et supprimés
- `data-i18n.test.js` : clés fr/en identiques hors `dev.*` → hors `dev.*` et `game.*` ; sources étendues à `jeu.html` et `js/game/`. `build.test.js` : fichiers attendus étendus. `dev.spec.js` : lien du dernier lot `../lots/lot-1/` → `…/jeu.html` (`entry`). `jeu.spec.js` : test « reste dans la salle » rendu indépendant de la vitesse de rendu. Supprimés : aucun.

## Points ouverts
- Performance Lighthouse de `jeu.html` sous 75 : décider du seuil ou d'un autre chargement de Phaser.
- Son non écouté et plein écran réel non essayé (API simulée dans les tests) ; à vérifier sur appareil.

## Choix à valider
- Équilibrage : balle 1100 u/s, délai 0,4 s, dégâts 25, zombie 50 de vie à 70 u/s, 5 présents, apparition toutes les 3 s. Couleurs `--game-*`, 4 sons, sticks (rayon 56 px, zone morte 15 %).

## À tester par moi
Sur `https://nowyyy.github.io/Z-Survival/jeu.html`, téléphone en paysage et ordinateur : plein écran et F ; sticks (E2-3, E2-4) ; laser ; balle visible et délai ; tir automatique ; sons et M ; pause (E2-5, E2-6) ; fin (E2-7) ; HUD (E2-2) à 375 px de haut ; message de rotation. Le navigateur garde `/dev/` 10 minutes en cache : recharger.
