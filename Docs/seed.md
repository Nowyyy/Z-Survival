# Seed — Z-Survival (jeu de survie zombies, vue de dessus en 3D)
Version 0.15 — 27/10/2026 — modifié par le propriétaire seulement.
Dépôt : Nowyyy/Z-Survival. Site : https://nowyyy.github.io/Z-Survival/

## Le jeu en une phrase
Jeu web gratuit et solo, en 3D vue de dessus : un personnage défend un bâtiment contre des vagues de zombies de plus en plus nombreuses, résistantes et rapides ; chaque partie rapporte de l'argent, conservé même en cas de mort, qui achète des améliorations permanentes. Inspiré du principe de SAS Zombie Assault TD pour la défense, de Black Ops 3 (mode Zombies) pour la montée en difficulté et d'Archero pour la structure en mondes et niveaux ; aucun visuel, nom ni son repris.

## Piliers
1. Jouable en 10 secondes sur téléphone comme sur ordinateur, sans compte.
2. Mourir fait progresser : l'argent n'est jamais perdu.
3. La logique du jeu est pure (sans Three.js ni DOM), donc testée à fond : changer le rendu ne change pas les règles.
4. Aucune donnée personnelle, aucune requête externe : la sauvegarde est locale, mais le code est prêt pour une base en ligne.
5. Tout texte et tout chiffre d'équilibrage sont dans des fichiers de données.
6. Chaque écran est réalisé directement en version finale (pas de maquettes).
7. Une pièce encombrée où l'on se fait difficilement toucher : le jeu récompense le déplacement et la visée, pas le nombre de tirs.
8. Tout est généré en code : textures, modèles, sons. Aucun fichier image, modèle 3D ou son importé.
9. La difficulté monte vague après vague sans plafond de fin : seul le budget de dessin limite le nombre de zombies simultanés.

## Contrôles
| Plateforme | Déplacement | Visée | Tir |
|---|---|---|---|
| Ordinateur | Touches physiques W, A, S, D et flèches (lues par `event.code` : Z, Q, S, D en AZERTY) | Souris | Un tir part automatiquement quand la ligne de visée touche ou frôle un ennemi |
| Mobile (paysage) | Stick gauche flottant (moitié gauche de l'écran) | Stick droit flottant (moitié droite) | Idem |
- Aucun bouton de tir, aucun bouton de réparation : tout est automatique.
- Le laser rouge (300 unités de base, qui s'estompe sur son dernier tiers) est une aide à la visée : il ne blesse jamais. Un tir part quand la ligne de visée passe à moins de 24 unités du bord d'un zombie, jusqu'à la portée de tir (700 de base ; limite réelle d'environ 770 au centre d'un zombie : marge de visée 24, rayon 20, bouche 26), sans mur ni meuble entre les deux.
- Chaque tir crée une balle visible (flash de bouche, balle avec courte traînée, étincelle à l'impact). Les dégâts sont appliqués seulement à l'impact de la balle, figés à la création de la balle. La balle part dans un cône autour de l'axe de visée : demi-angle de 4° à l'arrêt, jusqu'à 12° en déplacement (au niveau 0, lissé en 0,08 s à l'ouverture et 0,25 s à la fermeture), resserré par la statistique de précision ; deux lignes ténues montrent le cône. Le premier tir après un arrêt est donc plus précis : il faut s'arrêter pour tirer juste. La balle s'arrête à la portée effective plus 100.
- Murs, meubles et décor solide arrêtent le laser et les balles (une balle arrêtée ne fait aucun dégât) ; les fenêtres et leurs planches les laissent passer.
- Le canvas occupe toute la fenêtre du navigateur. Vue du dessus inclinée à 75° (`?tilt=60|75|90`). Vue proche : la caméra suit le joueur avec lissage, ne sort jamais du monde ; zoom 2,5 par défaut (même échelle qu'au lot 1m), `?zoom=1` montre toute la zone. Touche F pour le plein écran réel.
- Sur téléphone, le jeu se joue en paysage ; en portrait, un message demande de tourner l'appareil.
- Touches Échap ou P : pause ; M : son. Sur téléphone, un bouton « Touche ici pour activer le son » apparaît tant que le son n'est pas débloqué.

## Écrans (codes de blocs `E<écran>-<n>`)
Chaque écran est livré en version finale au lot indiqué du plan.
| Écran | Fichier | Blocs dans l'ordre | Lot |
|---|---|---|---|
| E1 Menu | `index.html` (page d'attente actuelle, remplacée) | E1-1 titre ; E1-2 Jouer ; E1-3 solde d'argent ; E1-4 accès boutique ; E1-5 accès réglages ; E1-6 pied de page (légal) ; le choix du monde est ajouté au lot 7 (code fixé alors, sans renuméroter les existants) | 7 |
| E2 Partie | `jeu.html` | E2-1 zone de jeu ; E2-2 HUD (vie, tués, vague, restants, chutes et fenêtres au lot 3, puis argent) ; E2-3 stick gauche ; E2-4 stick droit ; E2-5 pause ; E2-6 panneau de pause (reprendre, plein écran, son, volume, effet VHS, recommencer) ; E2-7 fin provisoire (avec la vague atteinte) ; E2-8 annonce de vague (animation centrale, lot 2c) ; E2-9 indicateur de réparation (lot 3) ; E2-10 état à terre (lot 3). Ordre du HTML au lot 3 : E2-2, E2-8, E2-9, E2-10, E2-5, E2-3, E2-4 | 1 à 2c (fait), 3 |
| E3 Boutique | `boutique.html` | E3-1 solde ; E3-2 liste des améliorations ; E3-3 armes ; E3-4 retour | 5 |
| E4 Fin de partie | scène ou page | E4-1 résultat ; E4-2 argent gagné ; E4-3 rejouer ; E4-4 boutique | 7 |
| E5 Réglages | `reglages.html` | E5-1 langue ; E5-2 son ; E5-3 réduire le sang ; E5-4 sauvegarde (export, import, effacer) | 7 |
| E6 Légal | `legal.html` | E6-1 mentions ; E6-2 vie privée | 7 |
Les noms de fichiers des écrans autres que `jeu.html` sont provisoires et fixés dans le prompt de leur lot. Le HUD (en HTML au-dessus du canvas) et les panneaux restent à au moins 16 px des bords, plus les zones de sécurité du téléphone.

## Structure d'une partie (inspirée d'Archero, de mémoire, non vérifiée)
- Un **monde** = un thème (poste de police, rue, restaurant, etc.) et un nombre fixe de **niveaux** (provisoire : 6, à définir).
- Un **niveau** = une disposition de la salle, avec ses propres fenêtres. Au sein d'un monde, les dispositions se resserrent : plus de meubles, couloirs plus étroits, moins de place pour esquiver. Garde-fous : couloirs libres d'au moins 90 unités, au moins deux itinéraires depuis chaque fenêtre, espace libre connexe, zone de départ libre.
- Le niveau change toutes les Y vagues (provisoire : 5, paramètre `wavesPerLevel`). Les dispositions sont construites au lot 3b ; jusque-là, il n'existe qu'une disposition (la carte actuelle est provisoire et trop grande).
- Les vagues sont **numérotées en continu sur toute la partie** (comme les manches de Black Ops 3) : la difficulté suit le numéro de vague, pas le niveau.
- Entre deux niveaux : vie remise à 100 %, courte transition, nouvelle disposition.
- Une partie commence toujours au niveau 1 du monde choisi ; mourir termine la partie ; l'argent gagné est conservé ; finir le dernier niveau termine le monde (écran de fin au lot 7).
- Les améliorations s'achètent entre les parties, dans la boutique ; il n'y a pas de choix d'amélioration en cours de partie (décision en attente).

## Mécanique
- Un niveau = une salle de 2000 × 1200 unités dans un monde de 3600 × 2800 (valeurs provisoires, `data/game/world.json`), entourée d'un décor extérieur (route, trottoir, voitures abandonnées, arbres, buissons, lampadaires, barrières, `decor.json`).
- Murs de 40 d'épaisseur et 60 de haut. Trois fenêtres de 140 de large : nord au centre, ouest et est à mi-hauteur.
- La salle contient 14 meubles (hauteur 70 au plus) qui bloquent le joueur, les zombies, les balles et le laser.
- Les zombies naissent à l'extérieur, hors de la vue, traversent le décor par des couloirs d'approche de 160 de large sans décor solide, et gagnent leur fenêtre. Ils poursuivent le joueur en ligne droite quand la voie est libre, sinon contournent les meubles (champ de flux, grille de 20 unités).
- **Vagues** (inspirées du mode Zombies de Black Ops 3 : formule de vie vérifiée, le reste de conception propre) : courbe pure `js/core/waves.js` et directeur `wave-director.js`, paramétrés par `data/game/waves.json`.
  - Vie des zombies : `1 + 0,5 × (n−1)` jusqu'à la vague 9 (×5), puis ×1,1 par vague, plafond ×30 (atteint à la vague 28). BO3 : 150 de vie plus 100 par manche jusqu'à 950 à la manche 9, puis ×1,1 par manche, plafond introduit à Black Ops 4. La courbe reste donc sous celle de BO3.
  - Nombre total : `5 + 1,6 × (n−1) + 0,05 × (n−1)²`, plafond 150 ; vague renforcée (+30 %) toutes les 5 vagues.
  - Simultanés : 6 à la vague 1, jusqu'à 10 au plus (budget de triangles ; BO3 en admet 24).
  - Vitesse : quatre allures (marche lente 45, marche 70, rampe vite 105, course 140, plafonnées par allure), introduites progressivement (les lentes dominent au début, la rampe dès la vague 4, la course dès la vague 8) ; aucun zombie ne dépasse 190 (le joueur : 220). La rampe est visuelle (corps abaissé, sans effet sur la collision).
  - Quatre types : `marcheur` (de base), `petit` (rapide, fragile, dès la vague 3), `voute` (résistant, dès la 5), `grand` (lent, très résistant et dur, dès la 7). Un type introduit compte au moins un zombie.
  - Dégâts au contact croissants (×1,05 par vague, plafond ×3) ; intervalle d'apparition décroissant de 2,5 s à 0,9 s.
  - Pause de 3 s avant la vague 1, 8 s entre les vagues. À la fin d'une vague, le joueur retrouve 100 % de sa vie maximale.
- **Fenêtres et siège** (lot 3) : chaque fenêtre porte 4 planches. Les zombies de la fenêtre visée s'y rendent ; 2 emplacements d'attaque, file d'attente derrière (6 places), un zombie arrache une planche en 2,2 s (selon son type : `petit` 0,7, `voute` 1,2, `grand` 1,6 de vitesse d'arrachage) ; quand la dernière planche tombe, ils escaladent en 1,2 s (2 à la fois) et entrent. Aucun zombie n'entre sans fenêtre ouverte. Les planches ne bloquent ni le laser ni les balles. Le joueur ne franchit jamais une fenêtre.
- **Réparation** (lot 3) : automatique quand le joueur est à moins de 80 unités du côté intérieur d'une fenêtre ; 1,8 s par planche au niveau 0 ; bloquée tant qu'un zombie occupe un emplacement de cette fenêtre ou escalade. Aucun coût (l'argent arrive au lot 4).
- **Tomber à terre** (lot 3) : quand la vie tombe à 0 et qu'il reste une chute (1 de base), le joueur tombe 5 s : invulnérable, immobile, sans tir ; les zombies proches sont repoussés ; il se relève à 50 % de sa vie maximale avec 2 s de protection et un nouveau repoussement. Sans chute : fin de partie. Le soin de fin de vague est reporté au relevage.
- Argent : gagné par ennemi tué et par vague, conservé à la mort (lot 4).
- **Statistiques du joueur** (lots 2b et 3, niveaux de 0 à 10, valeurs provisoires dans `data/game/player-stats.json`) :
  - `degats` : +15 % par niveau (62,5 dégâts par seconde au niveau 0, 417 au niveau 10 avec tout au maximum) ;
  - `portee` : +12 % par niveau sur le laser et sur la portée de tir ;
  - `precision` : demi-angle du cône de 4° × 0,9 puissance niveau à l'arrêt, plus 8° × 0,85 puissance niveau en déplacement (plancher 0,5°) ;
  - `cadence` : délai entre tirs de 0,4 s × 0,9 puissance niveau (plancher 0,15 s) ;
  - `vitesse` : +4 % par niveau (plafond +40 %) ;
  - `vie` : +12 de vie maximale par niveau ;
  - `regen` : points de vie rendus à chaque zombie tué, 1 de base puis +1 par niveau (jamais au-delà du maximum, jamais après la mort ni à terre) ;
  - `chutes` (lot 3, niveaux 0 à 5) : 1 chute de base, +1 par niveau ;
  - `reparation` (lot 3) : temps par planche de 1,8 s × 0,88 puissance niveau (plancher 0,4 s).
  Elles s'achètent dans la boutique (lots 4 et 5) ; avant, les niveaux se règlent par `?lvl=degats:3,precision:5` ou `?lvl=all:5`, sans aucun stockage.
- Armes (`data/weapons.json`) : une arme de départ (pistolet), d'autres achetables ; chaque arme définit dégâts, cadence, portée, vitesse de balle, tolérance de visée.
- Tourelles (lot 9), skins de personnage et d'armes (lot 11), mondes supplémentaires (lot 10).
- Sang et particules (lot 8), avec une option « réduire le sang ».
- **Ambiance** (lot 2c, faite et jugée bonne par le propriétaire) : une animation centrale « VAGUE N » démarre 3 s avant l'apparition des zombies et culmine avec elle, sur une mélodie angoissante synthétisée ; « Vague N terminée » avec un son plus doux ; vague renforcée : sous-titre et mélodie plus grave. Effet VHS en surcouche HTML/CSS (grain animé, lignes de balayage, bords teintés rouge et cyan, bande de suivi occasionnelle), activé par défaut, basculable dans le panneau de pause, coupé sous `prefers-reduced-motion` et par `?vhs=0`. Aucun clignotement de plus de 3 par seconde.
- Les valeurs d'équilibrage sont provisoires ; elles seront jugées sur les cartes définitives (après le lot 3b) et réglées au lot 12. Repère du lot 2b : sans amélioration, un joueur ne survit pas à la vague 10.

## Personnages et rendu
- Personnages articulés en 3D, vus du dessus : bassin, tronc, tête, deux bras (épaule et coude), deux jambes (hanche et genou), arme tenue en main. 12 pièces et 700 triangles au plus chacun, géométries et matériaux partagés. Le joueur tourne le tronc vers la visée, les jambes suivent le déplacement, léger recul au tir.
- Zombies : quatre variantes visuelles (`marcheur`, `petit`, `grand`, `voute` : taille, tenue, teint, posture), sans sang avant le lot 8. Quatre allures, dessinées par des poses distinctes : marche lente (traînante, petite amplitude), marche, rampe (corps abaissé, torse presque horizontal, bras qui tirent), course (grande amplitude, torse penché). Les rampants plaisent : on les garde. Au lot 3, trois poses de plus, purement visuelles : `arracher` (bras tendus qui tirent la planche), `escalade`, et le joueur `terre` (corps abaissé, presque horizontal). Les angles des articulations viennent d'une fonction pure (`pose.js`, testée) ; le rendu ne fait que les appliquer.
- Ombres portées (carte de 1024, la lumière suit la caméra) ; seules cinq pièces principales des personnages, les meubles et les voitures en projettent.
- Budget de dessin : 300 appels et 15 000 triangles au plus. Mesuré au lot 2c avec 10 zombies (types et allures variés), ombres actives, cône affiché : 190 appels et 14 862 triangles, soit une marge de 138 triangles seulement ; **10 zombies simultanés au plus**. Les planches du lot 3 (quadrilatères dans un seul maillage dynamique, sans ombre) coûtent 1 appel et 30 triangles au plus. Les lots 8 (sang) et 9 (tourelles) ne passeront pas sans réduire le coût des personnages ; le lot 12 pourra aussi relever le plafond. Les surcouches HTML/CSS (annonce, effet VHS, indicateurs) n'ajoutent aucun triangle.
- Le décor est créé une seule fois (maillages fusionnés ou instances), jamais par image.
- Paramètres de diagnostic dans l'URL : `?fps=1`, `?dpr=1`, `?shadows=0`, `?tilt=`, `?zoom=`, `?wave=N` (démarre à la vague N), `?lvl=` (niveaux des statistiques, sans aucun stockage), `?vhs=0|1` (effet VHS), `?planks=N` (planches de départ, 0 à 4, lot 3).

## Contenus
| Contenu | Fournisseur | Statut |
|---|---|---|
| Textures, matériaux, modèles | Générés en code (fonctions pures déterministes, atlas de 512 et 256, 4,9 Mo) | Faits au lot 1c, à enrichir par monde |
| Sons | Plus de 50 tampons synthétisés en code (5,98 Mo au lot 2c) : tirs en couches, impacts par matière, pas, voix de zombies par formants (16 à 36 par minute avec 8 zombies), ambiance, trois sons d'annonce de vague (lot 2c) ; page d'écoute `sons.html`. Au lot 3, cinq sons de fenêtre et de chute (planche arrachée, planche posée, chute du joueur, relevage) | Faits jusqu'au lot 2c ; lot 3 à faire ; réglables par identifiant de son |
| Textes en français | Claude, validés par le propriétaire | Réels |
| Textes en anglais | Reportés | Voir décisions en attente |
| Équilibrage | `data/game/*.json` | À régler en test |
| Mentions légales, vie privée | Claude, relues par le propriétaire | Au lot 7, provisoires jusqu'au lot 13 |

## Design
- Style « sang noir », défini dans `css/tokens.css` : noir profond, rouge sang, os, jaune pour l'argent.
| Rôle | Valeur |
|---|---|
| Fond / surface / surélevé | `#050505` / `#131313` / `#222224` |
| Texte / texte secondaire | `#f4f1ec` / `#b8b4ae` |
| Rouge sang (zones, cadre, grands titres seulement) | `#d81414` |
| Rouge lisible en petit texte | `#ff4a3d` |
| Rouge profond (gouttes sombres) | `#7a0a0a` |
| Argent | `#ffd60a` |
| Succès / avertissement | `#7ed48b` / `#f2c94c` |
| Focus | `#9fd3ff` |
- Polices hébergées dans le dépôt : Barlow, Rubik Wet Paint (titre), Rubik Dirt (libellés).
- Les couleurs du jeu sont des variables `--game-*` dans `tokens.css`, lues par `js/game/palette.js` ; aucune couleur en dur dans le JavaScript. Les sols ont été assombris au lot 1c pour la lisibilité ; `tokens.css` fait foi pour les valeurs (le laser est devenu `#ff6a5a`).
- Tout état (vie, fenêtre cassée, solde, chute) est porté aussi par une forme ou un texte, jamais par la couleur seule.
- Lisibilité : contraste d'au moins 3:1 entre les personnages et le sol, 4,5:1 pour le laser et la balle.
- Cibles tactiles de 44 px, contraste de 4,5:1 pour le texte (le rouge sang n'est utilisé que pour de grands textes, 3:1), `prefers-reduced-motion` respecté.
- Tailles de test : 375, 768 et 1440 px, plus 667×375 (téléphone en paysage) et 2560×1080 pour le jeu.

## Stack et hébergement
- HTML, CSS à variables, JavaScript en modules. **Three.js 0.186.1** (MIT) est la bibliothèque de rendu : paquet npm en `devDependency` à version exacte, fichiers copiés par `npm run vendor:three` vers `vendor/three/` (jamais édités à la main), chargés par `importmap` locale placée **avant** tout `modulepreload` (sinon Firefox l'ignore). `dependencies` reste vide.
- Outils de développement : ESLint (configuration plate), Vitest, Playwright avec axe, Lighthouse. **Vitest et Playwright se lancent l'un après l'autre, jamais en parallèle** (le lot 2b a eu 7 échecs Playwright pour cette raison).
- Arborescence de code : `js/core/` (logique pure du jeu : aucun Three.js, Web Audio, DOM, réseau, stockage ni horloge ; temps passé en argument ; pas de `Math.random`, générateur à graine), `js/game/` (rendu, sons, entrées), `js/save/` (futur `SaveRepository` et adaptateurs), `data/` (textes et chiffres).
- Le monde est dans le plan (x, y) pour la logique ; dans Three.js, (x, 0, y) ; le haut de l'écran est le nord.
- GitHub Pages, chemins relatifs, aucune ressource externe. Déploiement depuis `main` seulement ; aperçus par branche (`apercu.txt`) à `/lots/lot-N/` ; page `/lots/` et menu `/dev/` générés automatiquement, avec un journal des versions (`data/changelog.json`) : chaque lot ajoute son entrée et adapte les tests `data-changelog` et `dev.spec`. Une branche de lot n'est jamais supprimée. La branche `lot-0t` (test Three.js contre Phaser) n'est pas fusionnée et reste en ligne.
- Workflow : `verify` avec délai de 30 min, Playwright rejoué une fois en cas d'échec (modifié au lot 1d à la demande du propriétaire) ; un lot ne le modifie que si son prompt l'autorise. Le push des tags est refusé par GitHub : les tags restent locaux. Si la session d'agent impose une autre branche que `lot-N`, l'agent suit quand même le prompt du lot et le signale.
- `sons.html` : page d'écoute technique, à retirer au lot 13.
- Sauvegarde : interface `SaveRepository` ; adaptateur `localStorage` avec schéma versionné et migrations ; export et import par code. Une base en ligne sera un nouvel adaptateur, sur décision écrite. Les niveaux des statistiques viennent de `js/game/levels-source.js` (lecture de `?lvl=`), seul point à remplacer par la sauvegarde au lot 4.
- Jamais conservé : position, identité, adresse IP, paramètres d'URL de test. Aucun cookie.
- Langue : français seul pour l'instant ; la structure `data/i18n/` permet d'ajouter l'anglais. `noindex` pendant le développement.
- Tests : `?test=1` expose `window.__zs` (état du jeu, graine, apparition d'un zombie, avance de la simulation, vue d'ensemble, rendu, audio, vagues, statistiques, annonce, effet VHS, fenêtres et chutes au lot 3) ; `?empty=1` charge un monde sans meubles ni décor solide, et sans siège aux fenêtres ; `?seed=` et `?nospawn=1` fixent la graine et coupent les vagues.
- Seuils Lighthouse mobile : `index.html` 90 / 95 / 95 et CLS ≤ 0,1 ; `jeu.html` performance 45 (mesuré 52 avec l'effet VHS et 54 sans, au lot 2c), accessibilité 95, bonnes pratiques 95, CLS ≤ 0,1.
- `CLAUDE.md` reste sous 9 000 caractères (7 799 au lot 2c ; 8 200 au plus à la fin du lot 3) : chaque lot consolide avant d'ajouter.

## Hors périmètre (pour l'instant)
Multijoueur, comptes, classements en ligne, publicité, achats, base de données, balles perforantes ou ricochets, munitions et rechargement, images, sons ou modèles 3D importés (tout est généré en code), anglais, caméra libre ou rotative, cartes de relief et post-traitement 3D (l'effet VHS est une surcouche HTML/CSS), zombies spéciaux (explosifs, tireurs, chiens), boss, choix d'amélioration en cours de partie, vitres qui se brisent, planches qui volent. Nouveaux sons : seulement ceux de fenêtre et de chute du lot 3.

## Décisions en attente
- Portée de tir de base 700 (au lieu de 1600) : à valider après test.
- À terre : invulnérable pendant la chute (proposé) ou attaquable ; chutes de départ : 1 (proposé).
- Effet VHS : toujours (proposé) ou réservé au thème horreur quand les mondes existeront (lot 10).
- Nombre de niveaux par monde (6 proposé) et de vagues par niveau (5 proposé) : durée d'une partie.
- Thème du premier monde (poste de police proposé).
- Choix d'amélioration en cours de partie à la manière d'Archero : oui ou non (non pour l'instant).
- Zone morte de la caméra (0 aujourd'hui : la caméra suit toujours le joueur).
- Anglais : abandonné ou reporté après la mise en ligne en français.
- Monétisation (le jeu reste gratuit et public).
- Date de mise en ligne officielle et passage en indexation.
- Base de données en ligne : si, quand et quel service (coûts : comptes, RGPD, clé visible dans le navigateur).
- Seuil de performance Lighthouse de `jeu.html` (45 proposé, mesuré 52 à 54).

## Risques connus
Équilibrage de la difficulté (vie, vitesse et nombre, pièce trop dure ou trop facile avec 100 % de vie rendue) ; durée d'une partie non prévisible ; cône de tir et tir automatique (au niveau 0, en déplacement à 700 unités, environ 16 % des balles touchent un zombie, d'après une approximation du lot 2b : frustration possible) ; IA des zombies aux fenêtres (files d'attente, blocages, zombies repoussés hors de la salle) ; place du HUD à 667×375 (chutes, fenêtres, réparation) ; avec la vue proche, les fenêtres sont souvent hors de l'écran (le HUD les résume) ; plafond de 10 zombies simultanés et marge de 138 triangles : le coût des personnages doit baisser avant les lots 8 et 9 ; fluidité de la 3D sur téléphone modeste (non mesurée ; Lighthouse n'a que 7 points de marge avec l'effet VHS) ; temps de génération des textures et des sons sur téléphone (non mesuré) ; coût des champs de flux sur téléphone (non mesuré) ; clignotement et photosensibilité (animation de vague, effet VHS) ; sons non écoutés par l'agent (jugés par le propriétaire) ; lisibilité de la rampe vue de dessus ; poids de Three.js au chargement ; netteté sur écrans haute densité ; sticks multi-touch ; précision des impacts de balles rapides ; dispositions de niveaux qui deviennent injouables en se resserrant ; sang et public mineur ; commutateur silencieux des iPhone (le son peut être coupé) ; l'API de Three.js évolue (toujours lire le paquet installé).

## Plan en lots (état)
| Lot | Sujet | État |
|---|---|---|
| 0, 0b, 0c, 0d | Socle, aperçus par branche, CI, accueil en français | fait |
| 0t | Test jetable Three.js contre Phaser (branche non fusionnée, à conserver) | fait |
| 1 | Cœur du jeu en Phaser | fait, remplacé par 1m |
| 1m | Migration du rendu : Three.js, personnages articulés, ombres, HUD HTML | fait |
| 1b | Monde plus grand, meubles, chemin des zombies, décor extérieur, apparitions hors vue | fait |
| 1c | Textures générées en code, personnages finaux, quatre variantes de zombies | fait |
| 1d | Sons synthétisés en code, voix de zombies, page d'écoute | fait |
| 2 | Vagues numérotées en continu (courbe inspirée de BO3), quatre allures, quatre types, vie à 100 % entre les vagues | fait |
| 2b | Cône de tir, imprécision en déplacement, statistiques du joueur (niveaux 0 à 10, `?lvl=`), régénération par kill | fait |
| 2c | Animation centrale de changement de vague avec mélodie angoissante, effet VHS en surcouche basculable dans la pause | fait |
| 3 | Fenêtres à planches, siège par les zombies (emplacements, file d'attente, escalade), réparation automatique, chutes (à terre), statistiques `chutes` et `reparation`, cinq sons de fenêtre et de chute | à lancer |
| 3b | Mondes et niveaux : dispositions de plus en plus serrées avec leurs fenêtres, transitions, premier monde ; équilibrage jugé ensuite | à écrire |
| 4 | Argent, sauvegarde locale (`SaveRepository`) | à écrire |
| 5 | Boutique et améliorations (E3) | à écrire |
| 6 | Armes | à écrire |
| 7 | Menu avec choix du monde (E1), fin de partie (E4), réglages (E5), légal (E6) | à écrire |
| 8 | Sang, particules, option « réduire le sang » | à écrire |
| 9 | Tourelles | à écrire |
| 10 | Mondes supplémentaires (thèmes : rue, restaurant, etc.) | à écrire |
| 11 | Skins de personnage et d'armes | à écrire |
| 12 | Qualité technique : performance (budget de personnages), équilibrage, accessibilité, nettoyage | à écrire |
| 13 | Mise en ligne : SEO, mentions légales finales, indexation, retrait de `sons.html` | à écrire |

## Idées en attente
Base de données en ligne et sauvegarde dans le cloud, classement, achievements, boss de fin de monde, choix d'améliorations en cours de partie, mode infini après le dernier niveau, zombies spéciaux, manches spéciales (comme les chiens de BO3), anglais, plusieurs armes en même temps, réglages de la mélodie et de l'effet VHS (petit lot 2c2 si besoin).
