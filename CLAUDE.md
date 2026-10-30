# mobile-games

Jeu web de survie zombies en vue de dessus, hébergé sur GitHub Pages.
Mobile d'abord, français seul, sans dépendance d'exécution (Three.js : devDependency copiée dans `vendor/three/`).
Avant de modifier une page, lis `Docs/ref/conventions.md` (arborescence, pages, règles détaillées).

## Commandes
- `npm ci` : installe · `npm run lint` · `npm test` (Vitest) · `npm run test:e2e` (Playwright, serveur sur :4173)
- `npm run vendor:three` : copie Three.js vers `vendor/three/` · `npm run build` : copie les pages et dossiers publiés dans `_site/`
- `npm run assemble` : site complet = main + `_site/lots/<lot>/` par branche `origin/lot-*` + `_site/lots.json`.
- `npm run lighthouse` : mobile (index.html 90 / 95 / 95 ; jeu.html 45 / 95 / 95 ; CLS ≤ 0,1) ; échoue sous les seuils
- Playwright : Chromium préinstallé (jamais `playwright install`, voir `Docs/ref/environnement.md`) ; en CI, Chrome du runner.

## Publication
- URL : `https://nowyyy.github.io/<dépôt>/` (cible : `Z-Survival`) ; racine = main, `/dev/` = menu, `/lots/lot-N/` = aperçu d'un lot.
- `.github/workflows/pages.yml` : lint + Vitest (job `quick`) sur PR et push de `main` ou `lot-*`, Playwright en 4 tranches (job `e2e`) sur PR ; `main` assemble et déploie.
- Droits minimaux, actions épinglées par SHA, ni `pull_request_target` ni secret. Source Pages : « GitHub Actions ». Chemins relatifs (site valable sous `/lots/…`).

## Git
- Une branche par lot : `lot-N`. Un commit par partie : « Lot N-X — titre ».
- Push de `lot-N` seulement, puis comparer `git rev-parse HEAD` et `git ls-remote origin lot-N`.
- Jamais de force-push, jamais de fusion dans `main`, pas de Pull Request sans demande. Tags facultatifs.
- Une branche de lot n'est jamais supprimée. Arbre propre au départ.
- Une seule partie par session, puis arrêt.

## Règles durables
- Jetons : aucune couleur en dur hors `css/tokens.css` ; couleurs du jeu : variables --game-* (palette.js), jamais en dur dans js/.
- Données : textes dans `data/i18n/*.json`, jamais en dur ; mêmes clés dans les deux langues, sauf `dev.*` et `game.*` (français seul).
- Accessibilité : cibles 44 px, contraste 4,5:1, focus visible, `prefers-reduced-motion`, axe sans violation.
- Exception texte : `<noscript>` de `index.html` bilingue en dur (l'i18n exige JS).
- Style « sang noir » : noir, rouge sang, os, jaune (argent). Texte sur rouge = zone pleine (`.zone`), jamais sur les taches (`js/splat.js`).
- Polices (OFL) dans `fonts/` avec licence : Barlow, Rubik Wet Paint (titre), Rubik Dirt (libellés, chargée après l'affichage : seuil Lighthouse).
- Honnêteté : tout contenu fictif ou provisoire est marqué comme tel.
- `Docs/seed.md` : appartient au propriétaire, jamais modifié par Claude (rempli depuis le lot 0-A).
- La logique du jeu vit dans `js/core/`, sans Three.js, DOM, réseau, stockage ni horloge.
- Le workflow `.github/workflows/pages.yml` n'est modifiable que si le prompt du lot l'autorise.
- Rendu : Three.js 0.186.1 (vendor/three/, jamais édité) ; importmap locale dans jeu.html ; lire le paquet avant l'API.
- Coordonnées : logique 2D (x, y) ; Three.js (x, 0, y) ; haut de l'écran = nord ; js/core/ ne connaît pas Three.js.
- Caméra : perspective 75° qui suit le joueur, zoom 2,5 (?tilt= ?zoom=) ; viewport.js, camera.js ; canvas plein écran, sans bandes.
- Poses : pose.js (pur) donne les angles ; géométries et matériaux partagés, jamais recréés par image.
- Entrées : event.code (jamais event.key) ; tir automatique quand le laser touche.
- Tir : balle dans un cône (spread.js) ; dégâts figés à la création, appliqués à l'impact ; le laser (ray.js) vise et déclenche, sans dégâts ; à travers les fenêtres ; portée 700, laser 300.
- Tests : ?test=1 expose window.__zs (getState, step, skipWave, setDoor, setPlanks, spawnAtWindow…) ; ?seed ?nospawn ?empty ?fps ?dpr ?shadows ?wave ?lvl ?planks ?endless ; 667×375, step() et le journal, jamais une durée réelle ; Math.random interdit ; helpers e2e : map=salle ; getState().zones ; scripts/zones-metriques.mjs ; Docs/ref/modele-rdc/ exclu du contrôle de 5 Mo.
- Monde : decor.json (extérieur, apparitions hors de la vue) ; collision.js, nav.js ; meubles et portes fermées bloquent joueur, zombies, balles et laser ; hauteurs : murs 60, meubles ≤ 70, voitures 55.
- Textures : texgen.js (pur) d'après textures.json, aucune image importée ; contraste ≥ 3:1 personnages / sol, laser et balle ≥ 4,5:1 : ne pas dégrader.
- Personnages : 12 pièces, 700 triangles au plus ; 4 variantes (variants.js) ; objectif 240 appels de dessin, 10 zombies au plus.
- Sons : synth.js (tampons d'après sounds.json, aucun fichier audio), audio.js, sound-director.js ; jamais de son dans js/core/ ; sons.html à retirer au lot 13.
- Chargement : textures (8 ms par tranche) et sons essentiels derrière l'écran de préparation ; aucun son avant le premier geste.
- Vagues : waves.js + wave-director.js d'après waves.json (vie BO3 ×30 au plus) ; numérotation continue ; 10 zombies simultanés au plus ; pas de lanceur continu.
- Zombies : 4 types × 4 allures (enemies.json, gaits.json), createEnemy ; vitesse ≤ 190 ; la rampe est visuelle, sans effet sur la hitbox.
- Statistiques : player-stats.js (7 stats, niveaux 0 à 10, ?lvl=, jamais stockés) ; effectiveWeapon et effectivePlayer ; régénération par kill.
- Fenêtres : windows.json, windows.js (4 planches, arrachage 2,2 s, réparation 1,8 s) ; les planches ne bloquent que les zombies (closedRects).
- Siège : siege.js (approche, attente, arrache, escalade, dedans, libre) ; 2 emplacements, file de 6, 2 grimpeurs ; jamais d'entrée sans fenêtre ouverte ni active ; ?empty=1 = zombies libres.
- Chutes : player-down.js ; 1 chute de base, à terre 5 s invulnérable, relevage à 50 % ; stats chutes (0 à 5), reparation (0 à 10).
- Planches : plank-layout.js (pivot au bas) ; un maillage par fenêtre, 42 triangles au plus, dessiné si visible ; débris à plat, à l'infini.
- HUD : un seul rectangle E2-2 (96 × 300 px au plus) ; E2-9 et E2-11 retirés ; E2-10 (à terre) ; marges 16 px + env(safe-area-inset-*) ; icônes SVG ; texte ≥ 14 px ; #hud-live annonce les événements.
- jeu.html : apple-mobile-web-app-capable (essai sans barres de Safari) ; pas de manifeste.
- Journal des versions : chaque lot ajoute une entrée à data/changelog.json et adapte data-changelog et dev.spec.
- Effet VHS : #vhs (vhs.js, horloge réelle) ; interdits : mix-blend-mode, filter, backdrop-filter, post-traitement 3D ; ?vhs=0|1 ; coupé sous prefers-reduced-motion.
- Budget, annonce de vague, nuit, cartes, zones, portes, ouverture et mobilier : `Docs/ref/conventions.md` (« consolidation du lot 3e », texte intégral déplacé).
- Contrôle : carte.html (à retirer au lot 13), ?labels=1 et ?zoom=1 comparent la carte au plan.
- Étages : etage.json (pixels, même repère que plan.json), zones.json (floors, stairs, blocks) ; floor (rdc, etage) sur zombies, fenêtres, balles, obstacles, points d'apparition ; une couche de collisions par étage ; js/core/floors.js, stairs.js, floor-transition.js ; plan.json ne change que pour les escaliers ; notes de relevé dans Docs/ref/etage.md.
- Escaliers physiques : zone de déclenchement libre (≥ 64 × 64) ; en marchant vers l'escalier le joueur entre dans un tube autour de walk.path (zones.json ; js/core/stair-walk.js), libre dans la largeur, hauteur = t × floorLift (render.json), étage logique à mi-hauteur, sortie par un bout ; fermés par un bloc ; cooldown 0,8 s ; zombies : mode escalier (1,5 s, 2 à la fois) vers l'escalier utilisable le plus proche par chemin.
- Fondu : #floor-fade (voile --game-fog) seulement en mouvement réduit (échange instantané, verrou 0,2 s) ; aucun matériau transparent ; hook useStair = marche automatique.
- Visibilité : userData.floor (rdc, etage, exterieur) ; setElevation : le joueur reste à y = 0, le monde descend ; l'étage dès qu'il y a de la hauteur, la coque du rez-de-chaussée (sol, murs, rampes) toujours, le mobilier et le reste hors de l'emprise de l'étage (rdcExposed) aussi, seul le couvert est caché ; garde-corps (texture garde-corps) autour du trou ; zombies, balles, sons de l'autre étage (étouffés) ; spawns indépendants de l'étage du joueur.
- Portes : porte 1 manche 10, porte 2 (escalier de l'aile) manche 20, porte 3 (second escalier + porte de l'étage) manche 30 ; ?wave=N ouvre celles dont openAfterWave < N ; ?floor=N ; hooks setFloor, useStair ; budget étage 30 000 / 300, rez-de-chaussée référence + 12 / + 4 ; le lot 3d est reporté.
