# Conventions

Avant de modifier une page, relis ce fichier.

## Règles de base
- Mobile d'abord : vérifier à 375, 768 et 1440 px ; ruptures à 768 et 1200 px.
- Cibles tactiles d'au moins 44 px ; contraste d'au moins 4,5:1 ; `prefers-reduced-motion` respecté.
- `noindex` pendant le développement.
- HTML, CSS à variables, JavaScript en modules (`type="module"`), chemins relatifs, aucune ressource externe, aucune dépendance d'exécution (Three.js est une devDependency copiée dans `vendor/three/` par `npm run vendor:three`).
- Aucune couleur en dur hors `css/tokens.css`.
- Textes dans `data/i18n/fr.json` et `data/i18n/en.json`, jamais en dur (les clés `dev.*` et `game.*` n'existent qu'en français). Contenus provisoires marqués comme tels.
- Outils de développement seulement : ESLint (configuration plate), Vitest, Playwright, `@axe-core/playwright`, Lighthouse. Versions exactes, `package-lock.json` versionné.
- `Docs/seed.md` appartient au propriétaire : on ne le modifie jamais.

## Architecture
- **La logique du jeu vit dans `js/core/`, sans Three.js, DOM, réseau, stockage ni horloge.** Tout ce dont elle a besoin (temps, hasard, données) lui est passé en paramètre.
- `js/game/` : rendu Three.js. `js/save/` : `SaveRepository` et adaptateurs de stockage.

## Style « sang noir »
- Rouge sang (`--color-action`) pour les zones, le cadre et les grands titres ; pour du petit texte rouge sur fond sombre, `--color-action-text`. Jaune (`--color-money`) réservé à l'argent.
- Un texte posé sur du rouge l'est sur une zone rouge pleine (`.zone`, texte `--color-on-action`) ; les taches de sang sont dessinées autour, jamais sous le texte.
- Tout état est aussi porté par une forme ou un texte, jamais par la couleur seule.
- Polices lourdes (Rubik Dirt) : chargées après le premier affichage, pour garder Lighthouse performance à 90 ou plus.

## Publication et aperçus
- Chemins toujours relatifs (`../` depuis `dev/`), jamais de `/` initial : le site est servi sous `/<dépôt>/`, sous `/<dépôt>/dev/` et sous `/<dépôt>/lots/lot-N/`.
- Les noms de branche de lot suivent `lot-<numéro><lettre facultative>` (ex. `lot-0b`) ; l'ordre est numérique puis alphabétique (`js/lots.js`).
- Toute page ajoutée au site est `noindex` tant que le jeu n'est pas en ligne (lot 13).

## Jeu (lots 1 et 1m)
- **Rendu Three.js.** Version exacte 0.186.1 (devDependency), copiée par `npm run vendor:three` dans `vendor/three/` (jamais éditée), importée par l'importmap de `jeu.html` (`"three": "./vendor/three/three.module.js"`), sans CDN. Lire le paquet installé avant d'utiliser son API. Tout est généré en code (aucun modèle ni texture importé) ; géométries et matériaux sont partagés et créés une fois, jamais à chaque image ; les personnages tués vont dans un stock réutilisé.
- **Coordonnées.** La logique reste en 2D `(x, y)` ; dans Three.js `(x, y)` devient `(x, 0, y)` (le sol est le plan `y = 0`) ; le haut de l'écran est le nord (y décroissant), la caméra est au sud.
- **Caméra.** Perspective, champ 40°, inclinaison 75° par défaut (`?tilt=60`, `?tilt=75`, `?tilt=90` ; toute autre valeur est ignorée). Fixe et centrée sur la salle ; `js/core/viewport.js` (`fitDistance`, `groundView`, `cameraPosition`) calcule la distance qui fait tenir toute la salle plus 5 % : aucun défilement avant le lot 1b. Réglages dans `data/game/render.json` (murs de 60 de haut et 40 d'épaisseur, face intérieure sur la limite de déplacement).
- **Plein écran.** Le canvas couvre 100 % de la fenêtre (`position: fixed; inset: 0; height: 100dvh`), sans bande ni défilement. Résolution = fenêtre × `min(devicePixelRatio, 2)` (`?dpr=` abaisse le plafond, `?shadows=0` coupe les ombres, pour le diagnostic) ; aucune qualité adaptative ; plus de boucle de rendu quand l'onglet est caché. Touche F : plein écran réel (bouton masqué si l'API manque).
- **Visée à la souris.** À chaque image, le dernier point d'écran du pointeur devient un point du sol (`js/game/picking.js`, plan `y = 0`) puis passe à `aim.js` : elle reste juste après un redimensionnement.
- **Personnages.** `js/core/pose.js` (pur) calcule les angles (marche proportionnelle à la vitesse réelle, tronc tourné vers la visée, zombies bras tendus et déphasés par leur graine, recul au tir) ; `js/game/character.js` les applique à des rigs articulés ; l'arme est tenue en main droite. Le laser (trait rouge à hauteur de l'arme), la balle (trait orienté, traînée de 3 positions, pool de 30), le flash de bouche, l'étincelle et le flash de l'ennemi touché sont dans `js/game/effects.js`. Sous `prefers-reduced-motion`, flash raccourci et étincelle supprimée ; la balle reste visible.
- **Téléphone en portrait.** Un message HTML remplace le jeu (media query `orientation: portrait` + `pointer: coarse` + largeur ≤ 600 px) et la partie est figée.
- **Contrôles.** `event.code` (jamais `event.key`) : W, A, S, D et flèches (Z, Q, S, D en AZERTY). Souris pour viser. Mobile : stick gauche (déplacement) et stick droit (visée) flottants, multi-touch ; la visée garde sa dernière direction. Aucun bouton de tir. `touch-action: none` et `overscroll-behavior: none` sur la zone de jeu. Échap ou P : pause ; M : son ; F : plein écran.
- **Blocs `E2-n`** (attribut `data-block`, dans l'ordre de l'écran) : E2-1 zone de jeu, E2-2 HUD en HTML (barre de vie, « Vie x/y », « Zombies tués », doublé par `#hud-live`, région `aria-live="polite"` mise à jour par paliers de 10 % de vie et à la mort), E2-5 bouton Pause, E2-3 stick gauche, E2-4 stick droit, E2-6 panneau de pause, E2-7 fin provisoire.
- **Marges.** HUD, bouton Pause et panneaux restent à 16 px au moins des bords, plus `env(safe-area-inset-*)` lu par `js/game/safe-area.js` (élément caché dont le `padding` utilise `env()`, publié en `--safe-top|right|bottom|left`).
- **Données provisoires.** `data/game/*.json` porte `_provisoire` ; tout chiffre d'équilibrage ou de rendu y vit, jamais dans le code. Couleurs : `--game-*` de `css/tokens.css`, lues par `js/game/palette.js`.
- **Pureté de `js/core/`.** Ni Three.js, DOM, réseau, stockage, horloge ni `Math.random` : le temps arrive en `dt` (borné à 0,05 s), le hasard par `rng.js` (graine). Les fonctions renvoient de nouveaux objets, ne modifient pas leurs arguments, ne lèvent pas d'exception sur des entrées inattendues. Testé par `tests/unit/core-purity.test.js`.
- **Tir à balle visible.** Le laser (`ray.js`) vise et déclenche le tir ; il ne blesse jamais. Un tir crée une balle (`combat.js`, `projectile.js`) qui parcourt la distance ; les dégâts sont appliqués à son impact, calculé sur le segment parcouru pendant l'image (jamais de traversée) ; une balle touche au plus une cible ; au plus 30 balles actives.
- **Hooks de test.** Avec `?test=1`, `window.__zs` expose `getState` (joueur, visée, ennemis, balles, tués, pause, mort, temps de jeu, `camera: {x, y, z, distance, tilt}`, `render: {calls, triangles}`, `pose` : angles posés sur les articulations du joueur et angles attendus), `setSeed`, `spawnEnemy`, `setInput`. `?seed=<n>` fixe la graine, `?nospawn=1` coupe les apparitions ; `?fps=1`, `?tilt=`, `?dpr=` et `?shadows=` n'exposent aucune donnée. Sans `?test=1`, rien n'est exposé. Les tests privilégient 667×375 (rendu logiciel plus rapide) et se désactivent seuls si WebGL manque.
- **Audio.** Web Audio synthétisé (`js/core/sound-params.js`, `js/game/audio.js`), aucun fichier ; le contexte audio n'est créé qu'après le premier geste du joueur ; l'état coupé/activé reste en mémoire.
- **Confidentialité.** Aucune requête externe, aucune écriture dans `localStorage`, `sessionStorage` ni cookies, aucune donnée dans les URL (un test chacun).
- **Console des tests.** Le message `GL Driver Message … ReadPixels` du navigateur à la création du premier contexte WebGL est du bruit du navigateur : les tests de console le filtrent.
