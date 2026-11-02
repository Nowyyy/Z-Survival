# mobile-games

Jeu web de survie zombies en vue de dessus, hébergé sur GitHub Pages.
Mobile d'abord, français seul, sans dépendance d'exécution (Three.js : devDependency copiée dans `vendor/three/`).
Avant de modifier une page, lis `Docs/ref/conventions.md` (arborescence, pages, règles détaillées).

## Commandes
- `npm ci` : installe · `npm run lint` · `npm test` (Vitest) · `npm run test:e2e` (Playwright essentiel, ~4 min ; `test:e2e:full` : tout, ~40 min)
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
- Polices (OFL, `fonts/` avec licence) : Barlow, Rubik Wet Paint (titre), Rubik Dirt (libellés, chargée après l'affichage : seuil Lighthouse).
- Honnêteté : tout contenu fictif ou provisoire est marqué comme tel.
- `Docs/seed.md` : appartient au propriétaire, jamais modifié par Claude (rempli depuis le lot 0-A).
- La logique du jeu vit dans `js/core/`, sans Three.js, DOM, réseau, stockage ni horloge.
- Le workflow `.github/workflows/pages.yml` n'est modifiable que si le prompt du lot l'autorise.
- Rendu : Three.js 0.186.1 (vendor/three/, jamais édité) ; importmap locale dans jeu.html ; lire le paquet avant l'API.
- Coordonnées : logique 2D (x, y) ; Three.js (x, 0, y) ; haut de l'écran = nord ; js/core/ ne connaît pas Three.js.
- Caméra : perspective 75° qui suit le joueur, zoom 2,5 (?tilt= ?zoom=) ; viewport.js, camera.js ; canvas plein écran.
- Animations : pose-v2.js (pur ; styles A, B, C ; marches par cinématique inverse, glissement des pieds ≤ 15 %) ; pose.js seulement pour « actuel » ; géométries et matériaux partagés, jamais recréés par image.
- Entrées : event.code (jamais event.key) ; tir automatique quand le laser touche.
- Tir : balle dans un cône (spread.js) ; dégâts figés à la création, appliqués à l'impact ; le laser (ray.js) vise sans dégâts ; à travers les fenêtres ; portée 700, laser 300.
- Tests : ?test=1 expose window.__zs (getState, step, skipWave, setDoor, flushSave, giveMoney…) ; 667×375, step() et le journal, jamais une durée réelle ; Math.random interdit ; helpers e2e : map=salle ; Docs/ref/modele-rdc/ exclu des 5 Mo.
- Monde : decor.json (extérieur, apparitions hors de la vue) ; collision.js, nav.js ; meubles et portes fermées bloquent tout ; hauteurs : murs 60, meubles ≤ 70, voitures 55.
- Textures : texgen.js (pur) d'après textures.json, aucune image ; contraste ≥ 3:1 personnages / sol, laser et balle ≥ 4,5:1.
- Personnages : v2 « os rigides » par défaut (character-v2.js ; data/game/persos-choix.json ; ?perso=choix|actuel|A|B|C|riche) ; ≤ 4 appels, ≤ 1 600 triangles (riche 2 600), ombre ≤ 64 ; 4 variantes (variants.js) ; vue ≤ 45 000 triangles et 400 appels ; 10 zombies au plus.
- Ancien modèle (pose.js, character.js) importé seulement si un personnage est « actuel » ; characters-v2.json, poses-v2.json.
- Sang : blood.js, blood.json, blood-fx.js ; ?sang=0|reduit|1 (défaut : la table de choix) ; ≤ 3 appels, ≤ 1 200 triangles, 2 cadavres, sans effet de jeu ; jamais de démembrement.
- Morts : le corps tombe à l'opposé du tireur (deathFor) ; recul KICK 0,25 s ; laser, éclair et balles dessinés depuis le canon (muzzle()), logique inchangée ; fenêtres : enjamber suit climb.t.
- Tir et réparation : jamais en même temps (viser un zombie interrompt la réparation, la planche garde sa progression) ; pas de laser pendant la réparation.
- Couleurs --perso-* et --sang-* (bloc du lot 3j de tokens.css) ; contraste ≥ 3:1 sur la couleur vue, escalier et sols tachés compris.
- Atelier des personnages : atelier-personnages.html (?test=1 : window.__zsPersos), « Mes choix » (persos-variants.js) ; Docs/ref/personnages-integres.md.
- Sons : synth.js (sounds.json, aucun fichier audio), audio.js, sound-director.js ; jamais de son dans js/core/ ; sons.html à retirer au lot 13.
- Atelier des sons (lot 3h) : atelier-sons.html et atelier-choix.html (techniques, à retirer au lot 13), js/atelier-sons/, data/i18n/atelier-sons.json (français seul).
- Synthèse 2 : js/core/synth2*.js, audio-analysis.js, atelier-check.js, scenes-sons.js (purs) ; niveau entendu relatif au tir, crête ≤ −3 dBFS, variantes distinctes (distance ≥ 0,035).
- Sons de l'atelier (lot 3i) : sounds-choix.json → scripts/sons/integrer.mjs → sounds.json (engine atelier) ; anciens : sounds-legacy.json ; mélodie de début de manche et tirs : recettes inchangées.
- ?sons=choix|ancien|A|B|C : jamais mémorisé, pas un mode essai ; ancien et atelier par import dynamique ; calcul dans sound-worker.js, 1 version au chargement, autres au premier usage.
- Poids des sons : aucun plafond ; garde-fou provisoire 64 Mo. Boucles (audio.json loops) : une voix chacune, coupées à la pause et à la mort, relancées à « Rejouer ».
- Chargement : textures et sons essentiels derrière l'écran de préparation ; aucun son avant le premier geste.
- Vagues : waves.js + wave-director.js d'après waves.json (vie BO3 ×30 au plus) ; 10 zombies simultanés au plus.
- Zombies : 4 types × 4 allures (enemies.json, gaits.json), createEnemy ; vitesse ≤ 190 ; la rampe est visuelle, sans effet sur la hitbox.
- Statistiques : player-stats.js (9 stats, niveaux 0 à 10) ; niveaux = ?lvl= > sauvegarde > zéros ; effectiveWeapon, effectivePlayer.
- Fenêtres : windows.json, windows.js (4 planches, arrachage 2,2 s, réparation 1,8 s) ; les planches ne bloquent que les zombies (closedRects).
- Siège : siege.js (approche, attente, arrache, escalade, dedans, libre) ; 2 emplacements, file de 6, 2 grimpeurs ; jamais d'entrée sans fenêtre ouverte ni active ; ?empty=1 : zombies libres.
- Chutes : player-down.js ; 1 chute de base, à terre 5 s invulnérable, relevage à 50 % ; stats chutes (0 à 5), reparation (0 à 10).
- Planches : plank-layout.js (pivot au bas) ; un maillage par fenêtre, 42 triangles au plus ; débris à plat, à l'infini.
- HUD (lot 3l) : game-ui.css, hud.js, hud-format.js ; 3 colonnes de blocs fixes (em, 15,75 px) ; REC = temps de jeu ; sticks A ; marges 16 px, côtés sans zone (--edge-*) ; E2-9, E2-11 retirés ; #hud-live annonce.
- jeu.html : apple-mobile-web-app-capable (essai sans barres de Safari) ; pas de manifeste.
- Journal des versions : chaque lot ajoute une entrée à data/changelog.json et adapte data-changelog et dev.spec.
- Journal de /dev : seulement les versions de data/changelog.json → versions (V0.x) ; un nouveau lot ajoute son entrée à lots, jamais à versions : le propriétaire dit quand.
- Effet VHS : #vhs (vhs.js, horloge réelle) ; interdits : mix-blend-mode, filter, backdrop-filter, post-traitement 3D ; ?vhs=0|1 ; coupé en mouvement réduit.
- Budget, annonce de vague, nuit, cartes, zones, portes, mobilier : `Docs/ref/conventions.md` (« consolidation du lot 3e »).
- Contrôle : carte.html (à retirer au lot 13), ?labels=1 et ?zoom=1 comparent la carte au plan.
- Étages : etage.json, zones.json (floors, stairs, blocks) ; floor (rdc, etage) sur zombies, fenêtres, balles, obstacles ; une couche de collisions par étage ; relevé : Docs/ref/etage.md.
- Escaliers physiques : tube autour de `walk.path` (stair-walk.js, zones.json), hauteur = t × floorLift, aucun délai, zombies touchables dans l'escalier, bloc de porte mince ; détails dans `conventions.md` (consolidation du lot 4).
- Fondu : #floor-fade seulement en mouvement réduit ; aucun matériau transparent ; useStair = marche auto.
- Visibilité : userData.floor ; setElevation (le monde descend, le joueur reste à y = 0) ; tout le rez-de-chaussée toujours dessiné ; garde-corps ; laser et balles dans effectsRoot.
- Portes : 1 manche 10, 2 manche 20, 3 manche 30 ; ?wave=N ouvre celles dont openAfterWave < N ; ?floor=N ; budget étage 30 000 / 300 ; le lot 3d est reporté.
- Sauvegarde : js/core/save.js (schéma v1, migrations, commitDelta, code ZS1.<base64url>.<crc32>) pur ; js/save/ seul à toucher localStorage, clé unique zs.save.v1 ; écriture par différences ; illisible ou version future = verrouillée, jamais écrasée.
- Mode essai : wave, lvl, planks, map, empty, nospawn, endless, floor, money = sauvegarde en lecture seule (aucune écriture, solde réel lu) ; ?test=1 = mémoire, ?test=1&store=local = vrai localStorage.
- Argent : economy.js, economy.json, bounty ; 10 par kill (balle seulement, jamais killAll/skipWave), 1 par planche posée, bonus de manche, fin de monde ; tout est conservé à la mort ; jamais de calcul d'argent hors de economy.js.
- Interface : argent sous les tués, « +N » sous Pause ; solde en pause et E2-7 ; fin : Rejouer, menu (sans action) ; sauvegarde.html sans lien (technique, remplacée au lot 7).
- Atelier de l'interface (lot 3k) : atelier-interface.html, interface-retenue.html, js/atelier-interface/, ui-mock.js et ui-measure.js (purs) ; proto-a|b|c.css (jetons seulement) ; fausses données (ui-atelier.json) toujours annoncées « fictives » ; rien d'enregistré.
- Atelier de la carte (lot 3g) : visite.html (jeu.html?nospawn=1&wave=31), ecarts.html, relevé par scripts/modele/ (modèle jamais versionné) ; décisions rejouables ecarts-decisions.json (plus de 60 unités : approved: true), puis npm run carte ; Docs/ref/affinage.md.
- Décor léger : decor-interieur.json (non solide, 8 types, 1 500 triangles et 6 appels au plus, hors zones de dégagement) ; mobilier-aspect.js, portes-aspect.js, feux.json, mist.js ; textures fines (clé fine de textures.json) ; ?detail=0 = rendu d'avant le lot 3g ; ?murs=bas, ?percee=0.
- Lot 4 : scripts/economie.mjs, code-sauvegarde.mjs ; détails : `conventions.md`.
