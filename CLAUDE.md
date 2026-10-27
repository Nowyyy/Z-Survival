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
- Playwright : Chromium préinstallé en local (ne jamais lancer `playwright install`, voir `Docs/ref/environnement.md`) ; en CI (`CI=true`) il pilote le Chrome du runner (`channel: 'chrome'`), sans installation.

## Publication
- URL du jeu : `https://nowyyy.github.io/<nom du dépôt>/` (cible : dépôt nommé `Z-Survival`). La racine = main. `/dev/` = menu (main, dernier lot, menu déroulant des anciens lots). `/lots/lot-N/` = aperçu de chaque branche de lot.
- `.github/workflows/pages.yml` : sur Pull Request et sur push de `main` ou `lot-*`, lint + Vitest + Playwright. Sur `main` (push ou `workflow_dispatch`), `npm run assemble` puis déploiement de `_site/` seulement. Un push sur `lot-*` relance le workflow sur `main` (job `refresh`, seul à avoir `actions: write`).
- Droits minimaux, actions épinglées par SHA complet, ni `pull_request_target` ni secrets. Source Pages : « GitHub Actions » (réglage du propriétaire).
- Tous les chemins sont relatifs : le site marche quel que soit le nom du dépôt et sous `/lots/…`.

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
- Style « sang noir » : noir, rouge sang, os, jaune pour l'argent. Le texte sur du rouge est posé sur une zone rouge pleine (`.zone`), jamais sur les taches ; les taches (canvas, `js/splat.js`) sont autour.
- Polices (OFL) dans `fonts/`, licence copiée à côté : Barlow, Rubik Wet Paint (titre), Rubik Dirt (libellés, majuscules seulement, chargée après l'affichage pour tenir le seuil Lighthouse).
- Honnêteté : tout contenu fictif ou provisoire est marqué comme tel.
- `Docs/seed.md` : appartient au propriétaire, jamais modifié par Claude (rempli depuis le lot 0-A).
- La logique du jeu vit dans `js/core/`, sans Three.js, DOM, réseau, stockage ni horloge.
- Le workflow `.github/workflows/pages.yml` n'est modifiable que si le prompt du lot l'autorise.
- Rendu : Three.js 0.186.1 en devDependency copié par npm run vendor:three vers vendor/three/ (ne jamais éditer) ; importmap locale dans jeu.html ; lire le paquet installé avant d'utiliser l'API.
- Coordonnées : logique 2D (x, y) ; Three.js (x, 0, y) ; haut de l'écran = nord ; js/core/ ne connaît pas Three.js.
- Caméra : perspective inclinée 75° (?tilt=60|75|90), qui suit le joueur en douceur, 2,5× plus proche que la vue de toute la zone (comme au lot 1m) (?zoom=1|1.25|1.5|2|2.5|3 ; 1 = zone entière) ; js/core/viewport.js et camera.js. Plein écran : le canvas couvre toute la fenêtre, jamais de bandes ni de ratio fixe.
- Poses : js/core/pose.js (pur) donne les angles ; le rendu les applique ; géométries et matériaux partagés ; ne jamais recréer des objets à chaque image.
- HUD : HTML, marges de 16 px plus env(safe-area-inset-*) via js/game/safe-area.js.
- Entrées : event.code (jamais event.key) ; tir automatique quand le laser touche ; pas de bouton de tir.
- Tir : une balle par tir, dégâts à l'impact seulement (projectile.js) ; le laser (ray.js) sert à viser, jamais aux dégâts ; le tir part dès qu'un ennemi est sur la ligne de visée jusqu'à `fireRange` (au-delà du laser, qui s'estompe à sa portée) ; marge de visée `aimTolerance` (le tir part un peu à côté, la balle suit la vraie visée) ; on tire à travers les fenêtres (les murs arrêtent, pas leurs ouvertures).
- Couleurs du jeu : variables --game-* lues par js/game/palette.js ; aucune valeur en dur dans js/.
- Tests : ?test=1 expose window.__zs (getState, setSeed, spawnEnemy, setInput) ; ?seed, ?nospawn, ?fps=1, ?dpr=1, ?shadows=0 ; Math.random interdit dans le jeu.
- Monde : data/game/world.json (salle, meubles, fenêtres) et decor.json (extérieur, points d'apparition) ; camera.js suit le joueur et reste dans le monde ; ne jamais recréer le décor à chaque image.
- Obstacles et zombies : collision.js, nav.js (champ de flux, cellules de 20) ; les meubles bloquent joueur, zombies, balles, laser et ligne de tir ; les fenêtres sont passables pour les zombies seulement jusqu'au lot 3.
- Apparitions : hors de la vue, aux points de decor.json ; ne jamais faire apparaître un zombie à l'écran.
- Hauteurs : murs 60, meubles 70 au plus, voitures 55 (ne pas masquer les zombies à 75°).
- Tests : ?test=1 ajoute step(seconds), overview() ; ?empty=1 charge un monde sans meubles ; privilégier 667×375.
- Lighthouse de jeu.html : performance 45, accessibilité 95, bonnes pratiques 95 ; CLS ≤ 0,1.
- Textures : générées par js/core/texgen.js (pur, déterministe, tuilable) d'après data/game/textures.json ; aucune image importée ; couleurs passées en argument depuis les variables --game-*.
- Chargement : js/game/textures.js génère par tranches de 8 ms, écran de préparation plein écran ; la partie démarre ensuite.
- Personnages : 12 pièces et 700 triangles au plus ; 4 variantes de zombies par js/core/variants.js ; budget 300 appels de dessin (objectif 240) avec 8 zombies.
- Lisibilité : contraste ≥ 3:1 personnages / sol (js/core/color.js) ; laser et balle ≥ 4,5:1 ; ne jamais dégrader ces seuils.
- Tests : ?test=1 expose textures et sampleScreen ; ?fps=1 affiche durée des textures et du champ de flux.
- Sons : js/core/synth.js calcule des tampons (couches, formants, résonance de pièce) d'après data/game/sounds.json ; aucun fichier audio importé ; js/game/audio.js les lit (Web Audio) ; ne jamais écrire de son en direct dans js/core/.
- Direction sonore : js/core/sound-director.js transforme les événements en demandes ; son de tir au départ de la balle, blessure de zombie à l'impact ; voix de zombies par js/core/zombie-voice.js (16 à 36 par minute avec 8 zombies, 1,2 s d'écart au moins).
- Chargement : sons essentiels calculés par blocs avec les textures (écran de préparation), sons fond en arrière-plan ; aucun son avant le premier geste ; pause = contexte suspendu.
- Tests : ?test=1 expose getState().audio (journal des lectures) ; privilégier le journal, jamais l'écoute.
- sons.html : page d'écoute technique, à retirer au lot 13.
