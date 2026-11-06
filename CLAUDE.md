# mobile-games

Jeu web de survie zombies en vue de dessus, hébergé sur GitHub Pages.
Mobile d'abord, français seul, sans dépendance d'exécution (Three.js : devDependency copiée dans `vendor/three/`).
Avant de modifier une page, lis `Docs/ref/conventions.md` (arborescence, pages, règles détaillées).

## Commandes
- `npm ci` : installe · `npm run lint` · `npm test` (Vitest) · `npm run test:e2e` (Playwright essentiel ; `test:e2e:full` : tout)
- `npm run vendor:three` : copie Three.js vers `vendor/three/` · `npm run build` : copie les pages et dossiers publiés dans `_site/`
- `npm run assemble` : site complet = main (racine) + dev (`next/`) + archives `v0.N/` (branche `archive`), d'après `versions.json`.
- `npm run lighthouse` : mobile (index.html 90 / 95 / 95 ; jeu.html 45 / 95 / 95 ; CLS ≤ 0,1) ; échoue sous les seuils
- Playwright : Chromium préinstallé (jamais `playwright install`, voir `Docs/ref/environnement.md`) ; en CI, Chrome du runner.
- Tests : paliers `npm run test:avant-commit | standard | publication | complet | selection` ; `tests/selection.json` ; aucun nombre minimal de tests ; `Docs/ref/tests-paliers.md`.

## Publication
- URL : `https://nowyyy.github.io/<dépôt>/` (cible : `Z-Survival`) ; racine = main, `/next/` = dev, `/v0.N/` = versions figées, `/dev/` = journal, `/lots/` = renvoi.
- CI : `tests.yml` (paliers en tranches : standard à chaque push de `dev`, `lot-*` et PR, ≤ 10 min ; complet par push de `essai/complet-*` ; budget `tests/budget.json`) ; `pages.yml` (push de `main` et `dev`) : `quick` puis `deploy`, modifiable seulement si le prompt du lot l'autorise.
- Droits minimaux, actions épinglées par SHA, ni `pull_request_target` ni secret. Source Pages : « GitHub Actions ». Chemins relatifs (site valable dans un sous-dossier).

## Git
- Une branche par lot : `lot-N`, jamais supprimée. Un commit par partie : « Lot N-X — titre ». Arbre propre au départ.
- Push de `lot-N` seulement, puis comparer `git rev-parse HEAD` et `git ls-remote origin lot-N`.
- Jamais de force-push, jamais de fusion dans `main`, pas de Pull Request sans demande. Tags facultatifs. Une seule partie par session, puis arrêt.

## Règles durables
- Jetons : aucune couleur en dur hors `css/tokens.css` ; couleurs du jeu : variables --game-* (palette.js), jamais en dur dans js/.
- Données : textes dans `data/i18n/*.json`, jamais en dur ; mêmes clés dans les deux langues, sauf `dev.*` et `game.*` (français seul).
- Accessibilité : cibles 44 px, contraste 4,5:1, focus visible, `prefers-reduced-motion`, axe sans violation.
- Exception texte : `<noscript>` de `index.html` bilingue en dur (l'i18n exige JS).
- Style « sang noir » : noir, rouge sang, os, jaune (argent). Texte sur rouge = zone pleine (`.zone`), jamais sur les taches (`js/splat.js`).
- Polices (OFL, `fonts/` avec licence) : Barlow, Rubik Wet Paint (titre), Rubik Dirt (libellés, chargée après l'affichage : seuil Lighthouse).
- Honnêteté : tout contenu fictif ou provisoire est marqué comme tel.
- `Docs/seed.md` : appartient au propriétaire, jamais modifié par Claude (rempli depuis le lot 0-A).
- La logique du jeu vit dans `js/core/`, sans Three.js, DOM, réseau, stockage ni horloge.
- Rendu : Three.js 0.186.1 (vendor/three/, jamais édité) ; importmap locale dans jeu.html ; lire le paquet avant l'API.
- Coordonnées : logique 2D (x, y) ; Three.js (x, 0, y) ; haut de l'écran = nord ; js/core/ ne connaît pas Three.js.
- Caméra : perspective 75° qui suit le joueur, zoom 2,5 (?tilt= ?zoom=) ; viewport.js, camera.js ; canvas plein écran.
- Animations : pose-v2.js (pur ; glissement des pieds ≤ 15 %) ; géométries et matériaux partagés, jamais recréés par image.
- Entrées : event.code (jamais event.key) ; tir automatique quand le laser touche.
- Tir : balle dans un cône (spread.js) ; dégâts figés à la création, appliqués à l'impact ; le laser (ray.js) vise sans dégâts ; à travers les fenêtres ; portée 700, laser 300.
- Tests : ?test=1 expose window.__zs (getState, step, skipWave…) ; 667×375, step() et le journal, jamais une durée réelle ; Math.random interdit ; helpers e2e : map=salle.
- Monde : decor.json (extérieur, apparitions hors de la vue) ; collision.js, nav.js ; meubles et portes fermées bloquent tout ; hauteurs : murs 60, meubles ≤ 70, voitures 55.
- Textures : texgen.js (pur) d'après textures.json, aucune image ; contraste ≥ 3:1 personnages / sol, laser et balle ≥ 4,5:1.
- Personnages : v2 ; ≤ 4 appels, ≤ 1 600 triangles (riche 2 600) ; vue ≤ 45 000 triangles et 400 appels ; ancien modèle importé seulement si « actuel ».
- Sang : blood.js ; ?sang=0|reduit|1 ; ≤ 3 appels, ≤ 1 200 triangles, 2 cadavres, sans effet de jeu ; jamais de démembrement.
- Morts : le corps tombe à l'opposé du tireur (deathFor) ; laser, éclair et balles dessinés depuis le canon (muzzle()), logique inchangée.
- Tir et réparation : jamais en même temps (viser un zombie interrompt la réparation, la planche garde sa progression) ; pas de laser pendant la réparation.
- Couleurs --perso-* et --sang-* ; contraste ≥ 3:1 sur la couleur vue, escalier et sols tachés compris.
- Sons : synth.js et synth2.js (sounds.json, aucun fichier audio) ; jamais de son dans js/core/ ; sons.html à retirer au lot 13.
- ?sons=choix|ancien|A|B|C : jamais mémorisé, pas un mode essai. Poids des sons : aucun plafond (garde-fou 64 Mo).
- Chargement : textures et sons essentiels derrière l'écran de préparation ; aucun son avant le premier geste.
- Vagues : waves.js + wave-director.js d'après waves.json (vie BO3 ×30 au plus) ; 10 zombies simultanés au plus.
- Zombies : 4 types × 4 allures (enemies.json, gaits.json) ; vitesse ≤ 190 ; la rampe est visuelle, sans effet sur la hitbox.
- Statistiques : player-stats.js (9 stats, niveaux 0 à 10) ; niveaux = ?lvl= > sauvegarde > zéros.
- Fenêtres : windows.js (4 planches, arrachage 2,2 s, réparation 1,8 s) ; les planches ne bloquent que les zombies (closedRects).
- Siège : siege.js ; 2 emplacements, file de 6, 2 grimpeurs ; jamais d'entrée sans fenêtre ouverte ni active ; ?empty=1 : zombies libres.
- Chutes : player-down.js ; 1 chute de base, à terre 5 s invulnérable, relevage à 50 %.
- Planches : plank-layout.js (pivot au bas) ; un maillage par fenêtre, 42 triangles au plus.
- HUD : game-ui.css, hud.js, hud-format.js ; marges 16 px, côtés sans zone (--edge-*).
- jeu.html : apple-mobile-web-app-capable (essai) ; pas de manifeste.
- Journal : chaque lot ajoute son entrée à data/changelog.json → lots, jamais à versions (V0.x, montrées par /dev) : le propriétaire dit quand.
- Effet VHS : #vhs (vhs.js, horloge réelle) ; interdits : mix-blend-mode, filter, backdrop-filter, post-traitement 3D ; ?vhs=0|1 ; coupé en mouvement réduit.
- Étages : etage.json, zones.json ; floor (rdc, etage) sur zombies, fenêtres, balles, obstacles ; une couche de collisions par étage ; relevé : Docs/ref/etage.md.
- Escaliers : tube autour de `walk.path` (stair-walk.js), hauteur = t × floorLift, aucun délai, zombies touchables dans l'escalier.
- Fondu : #floor-fade seulement en mouvement réduit ; aucun matériau transparent ; useStair = marche auto.
- Visibilité : userData.floor ; setElevation (le monde descend, le joueur reste à y = 0) ; laser et balles dans effectsRoot.
- Portes : 1 manche 10, 2 manche 20, 3 manche 30 ; ?wave=N ouvre celles dont openAfterWave < N ; ?floor=N.
- Sauvegarde : js/core/save.js pur ; js/save/ seul à toucher localStorage (zs.save.v1) ; illisible ou version future = verrouillée, jamais écrasée.
- Mode essai (wave, lvl, planks, map, empty, nospawn, endless, floor, money) : sauvegarde en lecture seule ; ?test=1 = mémoire (&store=local : vrai localStorage).
- Argent : economy.js, economy.json ; 10 par kill (balle seulement), 1 par planche posée ; tout est conservé à la mort ; jamais de calcul d'argent hors de economy.js.
- Interface : argent sous les tués, « +N » sous Pause ; solde en pause et E2-7 ; fin : Rejouer, menu (sans action) ; sauvegarde.html sans lien (technique).
- Décor léger : decor-interieur.json (non solide, 1 500 triangles et 6 appels au plus).
- Détails, ateliers techniques (à retirer au lot 13), budget, nuit, cartes, zones, mobilier, lot 4 : `conventions.md` (lots 3e et 4g).
