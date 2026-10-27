# mobile-games

Jeu web de survie zombies en vue de dessus, hébergé sur GitHub Pages (dépôt Nowyyy/mobile-games).
Mobile d'abord, français seul pour l'instant (structure prête pour l'anglais), sans dépendance d'exécution (Three.js est en devDependency, copié dans `vendor/three/`).
Avant de modifier une page, lis `Docs/ref/conventions.md`.

## Arborescence
```
index.html (page d'attente) · jeu.html (le jeu) · sons.html (écoute) · apercu.txt · dev/ (menu /dev : main, dernier lot, anciens lots) · css/ (tokens.css, base.css)
js/ (main.js, page.js, i18n.js, splat.js, lots.js)
js/core/ logique pure (dont texgen, color, variants, synth, sound-director) · js/game/ rendu Three.js et lecture audio · js/sons/ page d'écoute · js/save/ sauvegarde
data/i18n/{fr,en}.json · data/game/ (équilibrage, monde, décor, textures, variantes de zombies) · fonts/ · vendor/ · scripts/ (build, assemble, serve, lighthouse)
tests/unit (Vitest) · tests/e2e (Playwright) · Docs/seed.md (propriétaire)
Docs/ref/ (environnement, conventions) · Docs/lots/ (bilans) · .github/workflows/ (lot 0-C)
```

## Commandes (vérifiées)
- `npm ci` : installe · `npm run lint` · `npm test` (Vitest) · `npm run test:e2e` (Playwright, serveur auto sur :4173)
- `npm run vendor:three` : copie Three.js (node_modules) vers `vendor/three/` + licence + version.json · `npm run build` : copie index.html, jeu.html, apercu.txt, dev, css, js, data, fonts, vendor (donc `vendor/three/`) dans `_site/`
- `npm run assemble` : site complet = build de main + `_site/lots/<lot>/` pour chaque branche `origin/lot-*` + `_site/lots.json` (exige tout l'historique git)
- `npm run lighthouse` : Lighthouse mobile (index.html : 90 / 95 / 95, CLS ≤ 0,1 ; jeu.html : 45 / 95 / 95, CLS ≤ 0,1 ; le script échoue sous les seuils ; voir `Docs/lots/lot-1m.md`)
- Playwright : Chromium préinstallé (ne jamais lancer `playwright install`, voir `Docs/ref/environnement.md`) ; en CI il pilote le Chrome du runner.

## Publication
- URL : `https://nowyyy.github.io/<nom du dépôt>/` (cible : `Z-Survival`). Racine = main ; `/dev/` = menu (main, dernier lot, anciens lots) ; `/lots/lot-N/` = aperçu de chaque branche de lot.
- `.github/workflows/pages.yml` : sur Pull Request et push de `main` ou `lot-*`, lint + Vitest + Playwright ; sur `main`, `npm run assemble` puis déploiement de `_site/`. Un push sur `lot-*` relance le workflow sur `main` (job `refresh`, seul avec `actions: write`).
- Droits minimaux, actions épinglées par SHA, ni `pull_request_target` ni secrets. Source Pages : « GitHub Actions ». Chemins tous relatifs (site valable sous `/lots/…`).

## Git
- Une branche par lot : `lot-N`. Un commit par partie : « Lot N-X — titre ».
- Push de `lot-N` seulement, puis comparer `git rev-parse HEAD` et `git ls-remote origin lot-N`.
- Jamais de force-push, jamais de fusion dans `main`, pas de Pull Request sans demande. Tags facultatifs.
- Une branche de lot n'est jamais supprimée. Arbre propre avant de commencer.
- Une seule partie par session, puis arrêt.

## Règles durables
- Jetons : aucune couleur en dur hors `css/tokens.css`.
- Données : textes dans `data/i18n/*.json`, jamais en dur ; mêmes clés dans les deux langues, sauf `dev.*` et `game.*` (français seul).
- Accessibilité : cibles 44 px, contraste 4,5:1, focus visible, `prefers-reduced-motion`, axe sans violation.
- Exception texte : le message `<noscript>` de `index.html` est bilingue en dur (le i18n a besoin de JS).
- Style « sang noir » : noir, rouge sang, os, jaune pour l'argent. Texte sur rouge = zone rouge pleine (`.zone`), jamais sur les taches (canvas, `js/splat.js`).
- Polices (OFL) dans `fonts/`, licence à côté : Barlow, Rubik Wet Paint (titre), Rubik Dirt (libellés, majuscules, chargée après l'affichage pour le seuil Lighthouse).
- Honnêteté : tout contenu fictif ou provisoire est marqué comme tel.
- `Docs/seed.md` : appartient au propriétaire, jamais modifié par Claude (rempli depuis le lot 0-A).
- La logique du jeu vit dans `js/core/`, sans Three.js, DOM, réseau, stockage ni horloge.
- Le workflow `.github/workflows/pages.yml` n'est modifiable que si le prompt du lot l'autorise.
- Rendu : Three.js 0.186.1 (devDependency) copié par npm run vendor:three vers vendor/three/ (jamais édité) ; importmap locale dans jeu.html ; lire le paquet installé avant l'API.
- Coordonnées : logique 2D (x, y) ; Three.js (x, 0, y) ; haut de l'écran = nord ; js/core/ ne connaît pas Three.js.
- Caméra : perspective 75° (?tilt=60|75|90) qui suit le joueur, zoom 2,5 par défaut (?zoom=1…3 ; 1 = zone entière) ; viewport.js, camera.js ; canvas plein écran, jamais de bandes (détails dans `conventions.md`).
- Poses : js/core/pose.js (pur) donne les angles ; le rendu les applique ; géométries et matériaux partagés, jamais recréés à chaque image.
- HUD : HTML, marges de 16 px plus env(safe-area-inset-*) via js/game/safe-area.js.
- Entrées : event.code (jamais event.key) ; tir automatique quand le laser touche ; pas de bouton de tir.
- Tir : une balle par tir, dégâts à l'impact seulement (projectile.js) ; le laser (ray.js) vise, jamais de dégâts ; tir dès qu'un ennemi est sur la ligne de visée jusqu'à `fireRange`, marge `aimTolerance` ; on tire à travers les fenêtres.
- Couleurs du jeu : variables --game-* lues par js/game/palette.js ; aucune valeur en dur dans js/.
- Tests : ?test=1 expose window.__zs (getState, setSeed, spawnEnemy, setInput, step, overview, textures, sampleScreen) ; ?seed, ?nospawn, ?empty=1, ?fps=1, ?dpr=1, ?shadows=0 ; privilégier 667×375 ; Math.random interdit dans le jeu.
- Monde : data/game/world.json (salle, meubles, fenêtres), decor.json (extérieur, points d'apparition) ; le décor n'est jamais recréé à chaque image.
- Obstacles : collision.js, nav.js (champ de flux) ; les meubles bloquent joueur, zombies, balles et laser ; fenêtres passables pour les zombies seulement jusqu'au lot 3.
- Apparitions : hors de la vue, aux points de decor.json, jamais à l'écran.
- Hauteurs : murs 60, meubles 70 au plus, voitures 55 (ne pas masquer les zombies à 75°).
- Textures : js/core/texgen.js (pur) d'après data/game/textures.json ; aucune image importée ; couleurs passées depuis les variables --game-*.
- Personnages : 12 pièces, 700 triangles au plus ; 4 variantes (variants.js) ; budget 300 appels de dessin (objectif 240) et 15 000 triangles, 10 zombies au plus.
- Lisibilité : contraste ≥ 3:1 personnages / sol (js/core/color.js) ; laser et balle ≥ 4,5:1 ; ne jamais dégrader ces seuils.
- Sons : js/core/synth.js calcule des tampons d'après data/game/sounds.json ; aucun fichier audio importé ; js/game/audio.js les lit (Web Audio) ; jamais de son en direct dans js/core/.
- Direction sonore : sound-director.js (événements → demandes) ; tir au départ de la balle, blessure à l'impact ; voix par zombie-voice.js (16 à 36 par minute avec 8 zombies, 1,2 s d'écart).
- Chargement : textures (tranches de 8 ms) et sons essentiels derrière l'écran de préparation, sons fond en arrière-plan ; aucun son avant le premier geste ; pause = contexte suspendu.
- Tests : ?test=1 expose getState().audio (journal des lectures) ; privilégier le journal, jamais l'écoute.
- sons.html : page d'écoute technique, à retirer au lot 13.
- Vagues : js/core/waves.js (courbe pure, vie de forme BO3 plafonnée ×30) + wave-director.js (états attente, apparition, combat, terminée) d'après data/game/waves.json ; numérotation continue ; jamais plus de 10 zombies simultanés (budget de triangles) ; ne pas remettre de lanceur continu.
- Zombies : 4 types (marcheur, petit, voute, grand : enemies.json variants) × 4 allures (lent, marche, rampe, course : gaits.json) ; createEnemy applique type, allure et vague ; vitesse plafonnée à 190 (joueur 220) ; la rampe est visuelle (pose.js), sans effet sur la hitbox.
- Interface : E2-2 (Vague N, Restants), E2-8 (annonce) ; #hud-live annonce la vague, jamais le compte à rebours ; vie du joueur remise à 100 % en fin de vague.
- Tests : ?wave=N démarre à la vague N ; ?nospawn=1 coupe les vagues ; hooks startWave, killAll, setWaveParams ; n'attendre jamais une vague en temps réel.
- Journal des versions : chaque lot ajoute une entrée à data/changelog.json et adapte data-changelog et dev.spec.
