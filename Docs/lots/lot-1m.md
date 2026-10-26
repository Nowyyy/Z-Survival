# Bilan du lot 1m — Migration du rendu : Three.js remplace Phaser

Branche `lot-1m` (depuis `main`, lot 1 fusionné : `lot-1` est ancêtre de `main`). Workflow, `index.html`, `Docs/seed.md` et bilans existants : non modifiés. `js/core/` inchangé sauf `pose.js` (promu du test `lot-0t`) et `viewport.js` (réécrit).
## Livré
- Three.js **0.186.1** (MIT, même version que le test), devDependency exacte, `npm run vendor:three` → `vendor/three/` (2,1 Mo, licence, `version.json`), importmap locale dans `jeu.html`, sans CDN ; `dependencies` vide. `npm run build` copie déjà `vendor/` en entier, donc `vendor/three/`.
- `js/game/` : `game.js` (partie : mêmes appels de `js/core/` dans le même ordre qu'au lot 1, rendu, boucle), `world.js` (sol, murs et ouvertures, sol extérieur, lumière, ombres 1024 `PCFShadowMap`, caméra), `character.js` + `skeleton.js` (rigs joueur et zombie), `effects.js` (laser, balles en pool de 30, flash, étincelle), `picking.js`, `hud.js`, `safe-area.js`, `palette.js`, `floor.js` ; `js/fps.js` (`?fps=1`) ; `data/game/render.json` ; 8 jetons `--game-*`.
- Phaser retiré : dépendance, `npm run vendor`, `vendor/phaser.min.js`, licence, `scene.js`, `textures.js`, mentions dans `CLAUDE.md` (5 747 car.) et `conventions.md`.
- HUD E2-2 en HTML (barre, « Vie x/y », « Zombies tués », `#hud-live` inchangé) ; HUD, Pause et panneaux à 16 px + `env(safe-area-inset-*)` ; `viewport-fit=cover` conservé (marges respectées). Message d'erreur si WebGL manque.
## Choix
- Murs : épaisseur 40, face intérieure sur la limite de déplacement (`room.wall` = 24, inchangé) ; les 16 de plus débordent vers l'extérieur. Hauteur 60. Fenêtres = vraies ouvertures (allège, linteau, 2 barreaux).
- `fitDistance` est exact (quatre coins projetés, marge 5 %), caméra centrée sur la salle ; `groundView` est l'approximation rectangulaire demandée (largeur au point visé, profondeurs exactes).
- Ombres : la lumière suit le joueur (±560 unités) ; visée sur le plan `y = 0` (laser à 43 de haut : léger décalage) ; balles transparentes, ordonnées après le halo du laser.
## Critères (chiffres)
- Départ `main` : Vitest 266, Playwright 117 exécutés (25 ignorés). Fin : **Vitest 360** (+94), **Playwright 152 exécutés** (+35), 60 ignorés (projet mobile / bureau). Lint sans avertissement.
- Canvas = fenêtre à ≤ 1 px à 667×375, 1440×900, 1920×1080, 2560×1080 et après redimensionnement, 0 px de défilement. Salle entière visible (fenêtres listées dont 100×100) : calcul indépendant (Vitest) et caméra réelle (Playwright). Délai tir → impact (15 %) et 30 balles au plus : verts.
- Avec 5 zombies, ombres actives : **238 appels de dessin, 2 836 triangles** (ombres coupées : 88 / 1 036).
- Lighthouse mobile `jeu.html` : **performance 55** (seuil 45), accessibilité 100, bonnes pratiques 100, CLS 0,001 ; `index.html` 92 / 100 / 100. CLS avec données retardées de 400 ms (360, 768, 1440) : tests verts (≤ 0,1).
- Images/s sur 10 s avec 5 zombies : 29 avec ombres, 56 sans, **en WebGL logiciel : non représentatif, rien conclu**.
- Captures regardées (667×375, 1440×900, 2560×1080, 375×667, 768, pause, fin) : salle entière, murs, ouvertures, ombres, laser, balle, HUD à 16 px, personnages articulés (bras tendus des zombies, arme tenue). Limite : à 667×375 un personnage fait ~14 px de large, jambes peu lisibles.
## Tests adaptés (avant / après)
- `jeu.spec` « zoom suit viewport.js » → « distance suit `fitDistance` ». « Le laser suit la souris » : projection par `zoom` → `projectGround`. Zombies de « mourir au contact », du parcours cliqué et du HUD : (835, 420) et (770, 420) → (835, 480) et (770, 480) (au nord, ils croisaient le laser et étaient tués : 3 tués au lieu de 1).
## Tests supprimés (raison)
- `core-viewport.test.js` (11 tests de zoom) : `viewport.js` réécrit, remplacé par 60 tests. `vendor.test.js` (4 tests Phaser) : Phaser retiré, remplacé par `vendor-three.test.js`.
## Retour du propriétaire (après livraison)
- Caméra trop reculée : fit sur la zone de jeu avec 2 % de marge (au lieu de la salle + 5 %), `?zoom=1.25|1.5` pour essayer. Ombres : les murs ne projettent plus (bandes noires le long des murs), soleil plus bas : l'ombre des personnages est plus longue.
- Ombres des zombies lointains : la carte d'ombres suivait le joueur (±560) ; lumière fixe maintenant, ±950 sur toute la salle. Tir au-delà du laser : `fireRange` 1 600 (règle changée, simulation de référence conservée en mode `legacy`) ; laser qui s'estompe sur son dernier tiers.
## Points ouverts
- Test tactile : un seul glisser à deux doigts (CDP) + sticks couverts en pur ; pas de test sur vrai téléphone. Son non écouté (inchangé du lot 1). Déploiement non vérifié depuis la session. `axe` à 1440×900 a expiré une fois sous charge (passe en relance ; rendu logiciel lent).
- Tag `lot-1m` : poussé une seule fois (voir message final).
## Choix à valider
Inclinaison 75° par défaut ; hauteur des murs 60 ; épaisseur 40 vers l'extérieur ; couleurs `--game-*` (peau, pantalon, bottes, arme, haillons, soleil, ambiance) ; seuil Lighthouse de `jeu.html` à 45 (mesuré 55) ; ombres limitées autour du joueur.
## À tester par moi
Sur un téléphone en paysage et sur ordinateur, `/lot-1m/jeu.html?fps=1` : fluidité, personnages (E2-1), ombres, laser, balles, sticks (E2-3, E2-4), HUD (E2-2), pause (E2-5, E2-6), fin (E2-7), plein écran (F), `?tilt=60` et `?tilt=90`.
## Fusion (à faire par moi)
Pull Request `lot-1m` → `main`, « Create a merge commit », ne pas supprimer la branche ; vérifier `/`, `/dev/`, `/lots/lot-1m/jeu.html`.
