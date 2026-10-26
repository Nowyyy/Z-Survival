# Bilan du lot 0t — Test jetable : Three.js contre Phaser

Branche `lot-0t`, **jetable, jamais fusionnée dans `main`**. Workflow, `index.html`, `Docs/seed.md`, `js/core/`, `data/game/` et bilans existants : non modifiés (`git diff main --stat` vide sur ces chemins).

## Livré
- **Three.js 0.186.1** (MIT, publiée le 2026-09-24, dernière version stable de plus de 14 jours) : devDependency exacte ; `npm run vendor:three` → `vendor/three/` (`three.module.js` 662 772 o, `three.core.js` 1 458 113 o, licence, `version.json`) = 2 122 004 octets au total. `dependencies` reste vide ; aucun CDN.
- `test3d/index.html` (Three.js : salle, ombres 1024, personnage articulé et arme en main, zombies, banc d'essai, rapport), `test3d/pseudo.html` (Canvas 2D, mêmes angles de `pose.js`), `jeu.html?fps=1` (`js/fps.js`, 19 lignes), `css/test3d.css`, `js/test3d/` (pose, stats, skeleton, floor, palette, textes, scene, character, input, bench, report, main, pseudo), `data/test3d/`, `--t3d-*`.
- Workflow modifié : **non**. `npm run build` copie `test3d/` en plus (js, data, vendor l'étaient déjà). `npm run assemble` local : `lot-0t` est lu, trié et ajouté à `lots.json` sans erreur.

## Choix
- « Résolution maximale × 1 / 1,5 / 2 » = plafond du ratio de pixels, `min(devicePixelRatio, plafond)` ; le rapport note le ratio effectif (sur un écran à ratio 1, les configurations × 1 et × 2 sont donc identiques).
- Aucune modification de `js/core/` ; `input.js` réexporte l'entrée du jeu (`js/game/input.js`, sans Phaser). Ombres : `PCFShadowMap` (le doux est déprécié) ; la lumière suit le joueur pour que la carte de 1024 reste fine.
- Au banc d'essai (autoplay), les zombies réapparaissent sur un anneau autour du joueur (sinon la scène se vide). Appels et triangles = moyenne des images mesurées. La page pseudo-3D a son propre rapport (mesures cumulées), pas partagé avec l'autre page.

## Critères (chiffres)
- Départ `main` : 266 Vitest, 117 Playwright (25 ignorés). Arrivée : **329 Vitest** (+63), **138 Playwright** (+21, 46 ignorés), lint sans avertissement.
- Largeurs vues : 667×375 et 1440×900 (trois angles, deux pages). Jambes, bras et arme visibles ; ombres portées sur le sol ; pseudo-3D lisible mais plus plat.
- Banc rapide (WebGL logiciel SwiftShader, 667×375, **non représentatif d'un téléphone**) : 52 / 59 / 25 / 25 / 39 / 19 images/s pour les configurations 1 à 6 ; aucune conclusion de performance.
- `vendor/three/` 2,1 Mo ; `CLAUDE.md` 5 653 caractères.

## Tests adaptés (avant / après) et supprimés
- `build.test.js` : fichiers attendus étendus (`vendor/three`, `test3d/index.html`, `js/test3d/pose.js`, `data/test3d/bench.json`). Supprimés : aucun.

## Points ouverts
- Aucune mesure sur téléphone ni sur GPU réel. Adresses publiées non ouvertes depuis la session : déploiement non vérifié.
- Le décor n'a ni fenêtres ni collisions ; le pistolet garde l'axe du tronc (pas de vraie cinématique de la main gauche).

## Choix à valider
- Interprétation de la résolution (plafond du ratio). Graine et durée du banc (6 s, 1re seconde ignorée). Hauteur de caméra (distance 470–510 unités). Style cubique du personnage. Compteur `?fps=1` en haut au centre.

## À tester par moi
Sur téléphone en paysage et sur ordinateur : `test3d/index.html` (jambes, bras, arme, ombres, fluidité ; les trois angles ; banc d'essai complet puis « Copier le rapport »), `test3d/pseudo.html` (comparer le relief, « Mesurer 6 s »), `jeu.html?fps=1` (noter les images par seconde). Le navigateur garde `/dev/` en cache : recharger.

## Fusion
**Ne pas fusionner.** Branche jetable ; ne pas supprimer la branche (l'aperçu en dépend).
