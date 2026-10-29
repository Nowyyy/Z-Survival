# mobile-games

Jeu web de survie zombies en vue de dessus, hébergé sur GitHub Pages (dépôt Nowyyy/mobile-games).
Mobile d'abord, français seul, sans dépendance d'exécution (Three.js : devDependency copiée dans `vendor/three/`).
Avant de modifier une page, lis `Docs/ref/conventions.md`.

## Arborescence
Voir `Docs/ref/conventions.md` : index.html, jeu.html, sons.html, carte.html, apercu.txt, dev/, css/, js/ (core logique pure, game rendu et audio, sons, carte, save), data/ (i18n, game, game/maps), fonts/, vendor/, scripts/, tests/, Docs/ (seed.md propriétaire, ref, lots), .github/workflows/.

## Commandes
- `npm ci` : installe · `npm run lint` · `npm test` (Vitest) · `npm run test:e2e` (Playwright, serveur sur :4173)
- `npm run vendor:three` : copie Three.js vers `vendor/three/` · `npm run build` : copie les pages et dossiers publiés dans `_site/`
- `npm run assemble` : site complet = main + `_site/lots/<lot>/` par branche `origin/lot-*` + `_site/lots.json` (tout l'historique git).
- `npm run lighthouse` : mobile (index.html 90 / 95 / 95 ; jeu.html 45 / 95 / 95 ; CLS ≤ 0,1) ; échoue sous les seuils
- Playwright : Chromium préinstallé (jamais `playwright install`, voir `Docs/ref/environnement.md`) ; en CI, Chrome du runner.

## Publication
- URL : `https://nowyyy.github.io/<dépôt>/` (cible : `Z-Survival`) ; racine = main, `/dev/` = menu, `/lots/lot-N/` = aperçu d'une branche de lot.
- `.github/workflows/pages.yml` : lint + Vitest (job `quick`) sur PR et push de `main` ou `lot-*`, Playwright en 4 tranches (job `e2e`) sur PR ; sur `main`, assemble et déploie ; un push sur `lot-*` relance `main` (job `refresh`).
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
- Style « sang noir » : noir, rouge sang, os, jaune (argent). Texte sur rouge = zone rouge pleine (`.zone`), jamais sur les taches (canvas, `js/splat.js`).
- Polices (OFL) dans `fonts/` avec licence : Barlow, Rubik Wet Paint (titre), Rubik Dirt (libellés, chargée après l'affichage : seuil Lighthouse).
- Honnêteté : tout contenu fictif ou provisoire est marqué comme tel.
- `Docs/seed.md` : appartient au propriétaire, jamais modifié par Claude (rempli depuis le lot 0-A).
- La logique du jeu vit dans `js/core/`, sans Three.js, DOM, réseau, stockage ni horloge.
- Le workflow `.github/workflows/pages.yml` n'est modifiable que si le prompt du lot l'autorise.
- Rendu : Three.js 0.186.1 (vendor/three/, jamais édité) ; importmap locale dans jeu.html ; lire le paquet installé avant l'API.
- Coordonnées : logique 2D (x, y) ; Three.js (x, 0, y) ; haut de l'écran = nord ; js/core/ ne connaît pas Three.js.
- Caméra : perspective 75° qui suit le joueur, zoom 2,5 (?tilt= ?zoom=) ; viewport.js, camera.js ; canvas plein écran, sans bandes.
- Poses : pose.js (pur) donne les angles, le rendu les applique ; géométries et matériaux partagés, jamais recréés par image.
- Entrées : event.code (jamais event.key) ; tir automatique quand le laser touche, pas de bouton.
- Tir : balle dans un cône (spread.js) ; dégâts figés à la création, appliqués à l'impact ; le laser (ray.js) vise et déclenche, sans dégâts ; on tire à travers les fenêtres ; portée 700, laser 300.
- Tests : ?test=1 expose window.__zs (getState, step, setPlanks, spawnAtWindow F1 à F8…) ; getState().map, windows[i].mesh ; ?seed ?nospawn=1 ?empty=1 ?fps=1 ?dpr=1 ?shadows=0 ?wave=N ?lvl= ?planks=N ; 667×375, step() et le journal, jamais une durée en temps réel ; Math.random interdit ; les helpers e2e ajoutent map=salle aux tests anciens.
- Monde : decor.json (extérieur, apparitions hors de la vue) ; collision.js, nav.js ; les meubles bloquent joueur, zombies, balles et laser ; hauteurs : murs 60, meubles ≤ 70, voitures 55.
- Textures : texgen.js (pur) d'après textures.json, aucune image importée ; contraste ≥ 3:1 personnages / sol, laser et balle ≥ 4,5:1 : ne jamais dégrader.
- Personnages : 12 pièces, 700 triangles au plus ; 4 variantes (variants.js) ; objectif 240 appels de dessin, 10 zombies au plus.
- Sons : synth.js (tampons d'après sounds.json, aucun fichier audio), audio.js les lit ; sound-director.js ; jamais de son dans js/core/ ; sons.html à retirer au lot 13 ; annonces de vague : une demande par animation, sautée si le son n'est pas débloqué.
- Chargement : textures (8 ms par tranche) et sons essentiels derrière l'écran de préparation, sons de fond ensuite ; aucun son avant le premier geste.
- Vagues : waves.js + wave-director.js d'après waves.json (vie BO3 ×30 au plus) ; numérotation continue ; 10 zombies simultanés au plus ; pas de lanceur continu.
- Zombies : 4 types × 4 allures (enemies.json, gaits.json), createEnemy ; vitesse ≤ 190 ; la rampe est visuelle, sans effet sur la hitbox.
- Statistiques : player-stats.js (7 stats, niveaux 0 à 10) ; effectiveWeapon et effectivePlayer ; niveaux via ?lvl=, jamais stockés ; vie maximale effective pour barre, HUD et fin de vague ; régénération par kill.
- Budget de dessin : 300 appels et 15 000 triangles ; lot 3b : au plus 194 appels et 15 000 triangles avec 10 zombies, ombres et cône (référence main : 191 et 14 904) ; ne rien ajouter sans mesurer.
- Fenêtres : windows.json, windows.js (4 planches, arrachage 2,2 s, réparation 1,8 s) ; les planches ne bloquent que les zombies (closedRects).
- Siège : siege.js (approche, attente, arrache, escalade, dedans, libre) ; 2 emplacements, file de 6, 2 grimpeurs ; jamais d'entrée sans fenêtre ouverte ; ?empty=1 = zombies libres ; réparation bloquée si un zombie occupe la fenêtre.
- Chutes : player-down.js (debout, terre, mort) ; 1 chute de base, à terre 5 s invulnérable, zombies repoussés, relevage à 50 % ; stats chutes (0 à 5), reparation (0 à 10).
- Planches : plank-layout.js (pivot au bas, aucun coin dans le sol ni le mur), texture planche (128 px) ; un maillage par fenêtre, 42 triangles au plus, dessiné si visible ; débris à plat, un maillage par fenêtre, à l'infini.
- HUD : un seul rectangle E2-2 (96 × 300 px au plus), aucune ligne Fenêtres ; E2-9 et E2-11 (flèches au bord) retirés ; réparation = carrés sur le mur, E2-10 (à terre) ; marges 16 px + env(safe-area-inset-*) ; icônes SVG ; texte ≥ 14 px ; #hud-live : À terre, Relevé, fenêtre ouverte, réparée, occupée.
- jeu.html : balises apple-mobile-web-app-capable (essai d'un jeu sans barres de Safari) ; pas de manifeste.
- Journal des versions : chaque lot ajoute une entrée à data/changelog.json et adapte data-changelog et dev.spec.
- Annonce de vague : E2-8, animation centrale (wave-splash.js, horloge du jeu figée par la pause), 3,0 s avant les apparitions ; #hud-live annonce la vague, jamais le compte à rebours.
- Effet VHS : #vhs (vhs.js, horloge réelle) ; interdits : mix-blend-mode, filter, backdrop-filter, post-traitement 3D ; ?vhs=0|1 ; coupé sous prefers-reduced-motion ; 3 clignotements par seconde au plus.
- Cartes : data/game/maps/<id>/ ; défaut rez-de-chaussee (plan.json en pixels, source unique ; world.json et decor.json générés par npm run carte, jamais édités à la main) ; ?map=salle charge l'ancienne salle (data/game/world.json et decor.json, inchangés).
- Carte rez-de-chaussee : 8 fenêtres F1 à F8 (72 de large), 11 piliers, escalier plein, aucune porte, relevée sur le modèle SketchUp (60 unités par mètre) ; couloirs ≥ 50, interstices < 50 fusionnés ; départ libre sur 120 ; 16 apparitions (2 par fenêtre) ; mobilier non conforme retiré.
- Nuit : dehors, nuit et brume (scene.fog réglé par la caméra, --game-fog, render.json fog) ; mur de brouillard autour du bâtiment (fog.js, plan translucide, wallNear/wallFar) ; béton gris froid, herbe morte.
- Contrôle : carte.html (SVG, à retirer au lot 13) et ?labels=1 pour comparer la carte au plan ; ?zoom=1 montre tout le bâtiment.
