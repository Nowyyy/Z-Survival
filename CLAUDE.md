# mobile-games

Jeu web de survie zombies en vue de dessus, hébergé sur GitHub Pages (dépôt Nowyyy/mobile-games).
Mobile d'abord, français seul pour l'instant, sans dépendance d'exécution (Three.js est en devDependency, copié dans `vendor/three/`).
Avant de modifier une page, lis `Docs/ref/conventions.md`.

## Arborescence
```
index.html · jeu.html (le jeu) · sons.html (écoute) · apercu.txt · dev/ (menu /dev) · css/ (tokens.css, base.css)
js/ (main, page, i18n, splat, lots) · js/core/ logique pure · js/game/ rendu et audio · js/sons/ · js/save/
data/i18n/{fr,en}.json · data/game/ · fonts/ · vendor/ · scripts/ · tests/unit (Vitest) · tests/e2e (Playwright)
Docs/seed.md (propriétaire) · Docs/ref/ · Docs/lots/ (bilans) · .github/workflows/
```

## Commandes (vérifiées)
- `npm ci` : installe · `npm run lint` · `npm test` (Vitest) · `npm run test:e2e` (Playwright, serveur auto sur :4173)
- `npm run vendor:three` : copie Three.js vers `vendor/three/` · `npm run build` : copie les pages et dossiers publiés dans `_site/`
- `npm run assemble` : site complet = build de main + `_site/lots/<lot>/` pour chaque branche `origin/lot-*` + `_site/lots.json` (exige tout l'historique git)
- `npm run lighthouse` : mobile (index.html 90 / 95 / 95 ; jeu.html 45 / 95 / 95 ; CLS ≤ 0,1) ; échoue sous les seuils
- Playwright : Chromium préinstallé (ne jamais lancer `playwright install`, voir `Docs/ref/environnement.md`) ; en CI il pilote le Chrome du runner.

## Publication
- URL : `https://nowyyy.github.io/<dépôt>/` (cible : `Z-Survival`) ; racine = main, `/dev/` = menu, `/lots/lot-N/` = aperçu d'une branche de lot.
- `.github/workflows/pages.yml` : lint + Vitest (job `quick`) sur Pull Request et push de `main` ou `lot-*`, Playwright en 4 tranches (job `e2e`) sur Pull Request ; sur `main`, assemble puis déploie ; un push sur `lot-*` relance `main` (job `refresh`).
- Droits minimaux, actions épinglées par SHA, ni `pull_request_target` ni secrets. Source Pages : « GitHub Actions ». Chemins tous relatifs (site valable sous `/lots/…`).

## Git
- Une branche par lot : `lot-N`. Un commit par partie : « Lot N-X — titre ».
- Push de `lot-N` seulement, puis comparer `git rev-parse HEAD` et `git ls-remote origin lot-N`.
- Jamais de force-push, jamais de fusion dans `main`, pas de Pull Request sans demande. Tags facultatifs.
- Une branche de lot n'est jamais supprimée. Arbre propre avant de commencer.
- Une seule partie par session, puis arrêt.

## Règles durables
- Jetons : aucune couleur en dur hors `css/tokens.css` ; couleurs du jeu : variables --game-* (palette.js), jamais en dur dans js/.
- Données : textes dans `data/i18n/*.json`, jamais en dur ; mêmes clés dans les deux langues, sauf `dev.*` et `game.*` (français seul).
- Accessibilité : cibles 44 px, contraste 4,5:1, focus visible, `prefers-reduced-motion`, axe sans violation.
- Exception texte : le message `<noscript>` de `index.html` est bilingue en dur (l'i18n exige JS).
- Style « sang noir » : noir, rouge sang, os, jaune pour l'argent. Texte sur rouge = zone rouge pleine (`.zone`), jamais sur les taches (canvas, `js/splat.js`).
- Polices (OFL) dans `fonts/`, licence à côté : Barlow, Rubik Wet Paint (titre), Rubik Dirt (libellés, majuscules, chargée après l'affichage : seuil Lighthouse).
- Honnêteté : tout contenu fictif ou provisoire est marqué comme tel.
- `Docs/seed.md` : appartient au propriétaire, jamais modifié par Claude (rempli depuis le lot 0-A).
- La logique du jeu vit dans `js/core/`, sans Three.js, DOM, réseau, stockage ni horloge.
- Le workflow `.github/workflows/pages.yml` n'est modifiable que si le prompt du lot l'autorise.
- Rendu : Three.js 0.186.1 (devDependency) copié vers vendor/three/ (jamais édité) ; importmap locale dans jeu.html ; lire le paquet installé avant l'API.
- Coordonnées : logique 2D (x, y) ; Three.js (x, 0, y) ; haut de l'écran = nord ; js/core/ ne connaît pas Three.js.
- Caméra : perspective 75° qui suit le joueur, zoom 2,5 (?tilt= ?zoom=) ; viewport.js, camera.js ; canvas plein écran, jamais de bandes.
- Poses : pose.js (pur) donne les angles, le rendu les applique ; géométries et matériaux partagés, jamais recréés à chaque image.
- HUD : HTML, marges de 16 px plus env(safe-area-inset-*) via js/game/safe-area.js.
- Entrées : event.code (jamais event.key) ; tir automatique quand le laser touche, pas de bouton de tir.
- Tir : balle dans un cône (spread.js) ; dégâts figés à la création, appliqués à l'impact ; le laser (ray.js) vise et déclenche, jamais de dégâts ; on tire à travers les fenêtres ; portée 700, laser 300.
- Tests : ?test=1 expose window.__zs (getState, step, spawnEnemy, setInput, setLevels, startWave, killAll, setWaveParams…) ; ?seed ?nospawn=1 ?empty=1 ?fps=1 ?dpr=1 ?shadows=0 ?wave=N ?lvl= ?planks=N ; hooks setPlanks, downPlayer, spawnAtWindow ; 667×375, step() et le journal, jamais l'écoute ni une durée en temps réel ; Math.random interdit.
- Monde : world.json (salle, meubles, fenêtres, inchangé), decor.json (extérieur, apparitions hors de la vue), jamais recréé à chaque image ; collision.js, nav.js ; les meubles bloquent joueur, zombies, balles et laser ; hauteurs : murs 60, meubles ≤ 70, voitures 55.
- Textures : texgen.js (pur) d'après textures.json, aucune image importée ; contraste ≥ 3:1 personnages / sol, laser et balle ≥ 4,5:1 : ne jamais dégrader.
- Personnages : 12 pièces, 700 triangles au plus ; 4 variantes (variants.js) ; budget 300 appels de dessin (objectif 240) et 15 000 triangles, 10 zombies au plus.
- Sons : synth.js (tampons d'après sounds.json, aucun fichier audio), audio.js les lit ; sound-director.js (événements → demandes) ; jamais de son dans js/core/ ; sons.html à retirer au lot 13.
- Chargement : textures (8 ms par tranche) et sons essentiels derrière l'écran de préparation, sons de fond ensuite ; aucun son avant le premier geste.
- Vagues : waves.js + wave-director.js d'après waves.json (vie BO3 plafonnée ×30) ; numérotation continue ; jamais plus de 10 zombies simultanés ; pas de lanceur continu.
- Zombies : 4 types × 4 allures (enemies.json, gaits.json), createEnemy ; vitesse plafonnée à 190 ; la rampe est visuelle, sans effet sur la hitbox.
- Statistiques : player-stats.js (7 stats, niveaux 0 à 10) ; effectiveWeapon et effectivePlayer donnent les valeurs effectives ; niveaux via ?lvl=, jamais stockés.
- Vie : la vie maximale effective sert à la barre, au HUD et à la remise de vie de fin de vague (100 %) ; régénération par kill (combat.js healOnKill).
- Budget de triangles : marge de 138 seulement (14 862 avec 10 zombies et le cône) ; ne rien ajouter sans mesurer.
- Fenêtres : windows.json et js/core/windows.js (4 planches, arrachage 2,2 s, réparation 1,8 s) ; les planches ne bloquent ni laser ni balles, seulement les zombies (closedRects) ; budget : 1 appel et 30 triangles au plus.
- Siège : js/core/siege.js (modes approche, attente, arrache, escalade, dedans, libre) ; 2 emplacements, file de 6, 2 grimpeurs ; jamais d'entrée sans fenêtre ouverte ; ?empty=1 = zombies libres ; réparation automatique, bloquée si un zombie occupe la fenêtre.
- Chutes : js/core/player-down.js (debout, terre, mort) ; 1 chute de base, à terre 5 s invulnérable, zombies repoussés, relevage à 50 % ; soin de fin de vague reporté ; statistiques chutes (0 à 5) et reparation (0 à 10) via ?lvl=.
- Interface : E2-2 (Chutes, Fenêtres), E2-9 (réparation), E2-10 (à terre) ; #hud-live annonce À terre, Relevé, fenêtre ouverte ou réparée.
- Journal des versions : chaque lot ajoute une entrée à data/changelog.json et adapte data-changelog et dev.spec.
- Annonce de vague : E2-8, animation centrale (js/core/wave-splash.js, état pur, horloge du jeu figée par la pause), 3,0 s avant les apparitions, fin à l'état terminee ; #hud-live annonce la vague, jamais le compte à rebours.
- Sons d'annonce : vague-annonce, vague-renforcee, vague-fin (catégorie annonce) ; une demande par animation ; sautée si le son n'est pas débloqué ; fondu à la mort.
- Effet VHS : #vhs (js/core/vhs.js, horloge d'effet réelle) ; interdits : mix-blend-mode, filter, backdrop-filter, post-traitement 3D ; ?vhs=0|1 ; coupé sous prefers-reduced-motion ; jamais plus de 3 clignotements par seconde.
