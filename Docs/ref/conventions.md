# Conventions

Avant de modifier une page, relis ce fichier.

## Règles de base
- Mobile d'abord : vérifier à 375, 768 et 1440 px ; ruptures à 768 et 1200 px.
- Cibles tactiles d'au moins 44 px ; contraste d'au moins 4,5:1 ; `prefers-reduced-motion` respecté.
- `noindex` pendant le développement.
- HTML, CSS à variables, JavaScript en modules (`type="module"`), chemins relatifs, aucune ressource externe, aucune dépendance d'exécution (Phaser est une devDependency copiée dans `vendor/` par `npm run vendor`).
- Aucune couleur en dur hors `css/tokens.css`.
- Textes dans `data/i18n/fr.json` et `data/i18n/en.json`, jamais en dur (les clés `dev.*` et `game.*` n'existent qu'en français). Contenus provisoires marqués comme tels.
- Outils de développement seulement : ESLint (configuration plate), Vitest, Playwright, `@axe-core/playwright`, Lighthouse. Versions exactes, `package-lock.json` versionné.
- `Docs/seed.md` appartient au propriétaire : on ne le modifie jamais.

## Architecture
- **La logique du jeu vit dans `js/core/`, sans Phaser, DOM, réseau, stockage ni horloge.** Tout ce dont elle a besoin (temps, hasard, données) lui est passé en paramètre.
- `js/game/` : scènes Phaser. `js/save/` : `SaveRepository` et adaptateurs de stockage.

## Style « sang noir »
- Rouge sang (`--color-action`) pour les zones, le cadre et les grands titres ; pour du petit texte rouge sur fond sombre, `--color-action-text`. Jaune (`--color-money`) réservé à l'argent.
- Un texte posé sur du rouge l'est sur une zone rouge pleine (`.zone`, texte `--color-on-action`) ; les taches de sang sont dessinées autour, jamais sous le texte.
- Tout état est aussi porté par une forme ou un texte, jamais par la couleur seule.
- Polices lourdes (Rubik Dirt) : chargées après le premier affichage, pour garder Lighthouse performance à 90 ou plus.

## Publication et aperçus
- Chemins toujours relatifs (`../` depuis `dev/`), jamais de `/` initial : le site est servi sous `/<dépôt>/`, sous `/<dépôt>/dev/` et sous `/<dépôt>/lots/lot-N/`.
- Les noms de branche de lot suivent `lot-<numéro><lettre facultative>` (ex. `lot-0b`) ; l'ordre est numérique puis alphabétique (`js/lots.js`).
- Toute page ajoutée au site est `noindex` tant que le jeu n'est pas en ligne (lot 13).

## Jeu (lot 1)
- **Plein écran.** Le canvas couvre 100 % de la fenêtre (`position: fixed; inset: 0; height: 100dvh`), sans bande ni défilement. Le monde est une salle de taille fixe (`data/game/room.json`) entourée d'un décor de 600 unités ; la caméra prend le plus grand zoom qui fait tenir la salle (plafonné 0,4 à 2, `js/core/viewport.js`) : on voit plus de décor sur un écran large, jamais plus de salle. Touche F : plein écran réel (bouton masqué si l'API manque). Haute densité : le canvas est dimensionné en pixels écran × ratio, ratio = `min(devicePixelRatio, 2)`, car Phaser 4 n'a pas de réglage de résolution.
- **Téléphone en portrait.** Un message HTML remplace le jeu (media query `orientation: portrait` + `pointer: coarse` + largeur ≤ 600 px) et la partie est figée.
- **Contrôles.** `event.code` (jamais `event.key`) : W, A, S, D et flèches (Z, Q, S, D en AZERTY). Souris pour viser. Mobile : stick gauche (déplacement) et stick droit (visée) flottants, multi-touch ; la visée garde sa dernière direction. Aucun bouton de tir. `touch-action: none` et `overscroll-behavior: none` sur la zone de jeu. Échap ou P : pause ; M : son ; F : plein écran.
- **Blocs `E2-n`** (attribut `data-block`) : E2-1 zone de jeu, E2-2 HUD (dessiné dans le canvas, doublé par `#hud-live`, région `aria-live="polite"` mise à jour par paliers de 10 %), E2-3 stick gauche, E2-4 stick droit, E2-5 bouton Pause, E2-6 panneau de pause, E2-7 fin provisoire.
- **Données provisoires.** `data/game/*.json` porte `_provisoire` ; tout chiffre d'équilibrage y vit, jamais dans le code. Couleurs : `--game-*` de `css/tokens.css`, lues par `js/game/palette.js`.
- **Pureté de `js/core/`.** Ni Phaser, DOM, réseau, stockage, horloge ni `Math.random` : le temps arrive en `dt` (borné à 0,05 s), le hasard par `rng.js` (graine). Les fonctions renvoient de nouveaux objets, ne modifient pas leurs arguments, ne lèvent pas d'exception sur des entrées inattendues. Testé par `tests/unit/core-purity.test.js`.
- **Tir à balle visible.** Le laser (`ray.js`) vise et déclenche le tir ; il ne blesse jamais. Un tir crée une balle (`combat.js`, `projectile.js`) qui parcourt la distance ; les dégâts sont appliqués à son impact, calculé sur le segment parcouru pendant l'image (jamais de traversée) ; une balle touche au plus une cible ; au plus 30 balles actives.
- **Hook de test.** Avec `?test=1`, `window.__zs` expose `getState`, `setSeed`, `spawnEnemy`, `setInput` ; `?seed=<n>` fixe la graine, `?nospawn=1` coupe les apparitions. Sans `?test=1`, rien n'est exposé. Ces paramètres ne sont jamais conservés ni envoyés.
- **Audio.** Web Audio synthétisé (`js/core/sound-params.js`, `js/game/audio.js`), aucun fichier ; le contexte audio n'est créé qu'après le premier geste du joueur ; l'état coupé/activé reste en mémoire.
- **Confidentialité.** Aucune requête externe, aucune écriture dans `localStorage`, `sessionStorage` ni cookies, aucune donnée dans les URL (un test chacun).
- **Console des tests.** Le message `GL Driver Message … ReadPixels` du navigateur à la création du premier contexte WebGL est du bruit du navigateur : les tests de console le filtrent.

## Test 3D (jetable, branche lot-0t, ne jamais fusionner dans main)
- **Textes.** Exception documentée : les textes de l'interface de `test3d/` sont en français dans un seul fichier, `js/test3d/textes.js` (pas dans `fr.json`). Les messages `<noscript>` restent bilingues en dur.
- **Couleurs.** Jetons `--t3d-*` dans la section « Test 3D (jetable) » de `css/tokens.css`, lus par `js/test3d/palette.js` ; aucune couleur en dur dans `js/test3d/`, `test3d/` ni `css/test3d.css`.
- **`js/core/` non modifié.** La logique de jeu des deux pages est celle de `js/core/`, telle quelle ; ce qui manque (poses, statistiques) vit dans `js/test3d/` (`pose.js`, `stats.js`, `skeleton.js`, purs). Contrôle : `git diff main -- js/core` est vide.
- **Three.js.** devDependency à version exacte, copiée par `npm run vendor:three` dans `vendor/three/` (`three.module.js` et `three.core.js`, licence, `version.json`) ; importée par chemin relatif, aucun CDN. `?test=1` expose `window.__t3d` (page Three.js) et `window.__t3dPseudo` (page 2D) ; `?bench=quick` ramène chaque configuration à 1 s.
- **Mesures.** Les chiffres pris en WebGL logiciel (CI, session) ne sont pas ceux d'un téléphone : seul le rapport copié sur l'appareil du propriétaire compte.

