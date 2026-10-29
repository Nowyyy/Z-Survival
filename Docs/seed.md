# Seed — Z-Survival (jeu de survie zombies, vue de dessus en 3D)
Version 0.20 — 29/10/2026 — modifié par le propriétaire seulement.
Dépôt : Nowyyy/Z-Survival. Site : https://nowyyy.github.io/Z-Survival/

## Le jeu en une phrase
Jeu web gratuit et solo, en 3D vue de dessus : un personnage défend un bâtiment contre des vagues de zombies de plus en plus nombreuses, résistantes et rapides ; des portes s'ouvrent au fil des manches pour agrandir le territoire ; chaque partie rapporte de l'argent, conservé même en cas de mort, qui achète des améliorations permanentes. Inspiré du principe de SAS Zombie Assault TD pour la défense, de Black Ops 3 (mode Zombies) pour la montée en difficulté et d'Archero pour la structure en mondes ; aucun visuel, nom ni son repris.

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
10. Le territoire s'agrandit avec la progression (portes), il ne se resserre pas : les premières manches se jouent dans un espace réduit.

## Contrôles
| Plateforme | Déplacement | Visée | Tir |
|---|---|---|---|
| Ordinateur | Touches physiques W, A, S, D et flèches (lues par `event.code` : Z, Q, S, D en AZERTY) | Souris | Un tir part automatiquement quand la ligne de visée touche ou frôle un ennemi |
| Mobile (paysage) | Stick gauche flottant (moitié gauche de l'écran) | Stick droit flottant (moitié droite) | Idem |
- Aucun bouton de tir, aucun bouton de réparation, aucun bouton de porte : tout est automatique.
- Le laser rouge (300 unités de base, qui s'estompe sur son dernier tiers) est une aide à la visée : il ne blesse jamais. Un tir part quand la ligne de visée passe à moins de 24 unités du bord d'un zombie, jusqu'à la portée de tir (700 de base ; limite réelle d'environ 770 au centre d'un zombie : marge de visée 24, rayon 20, bouche 26), sans mur, meuble ni porte fermée entre les deux.
- Chaque tir crée une balle visible (flash de bouche, balle avec courte traînée, étincelle à l'impact). Les dégâts sont appliqués seulement à l'impact de la balle, figés à la création de la balle. La balle part dans un cône autour de l'axe de visée : demi-angle de 4° à l'arrêt, jusqu'à 12° en déplacement (au niveau 0, lissé en 0,08 s à l'ouverture et 0,25 s à la fermeture), resserré par la statistique de précision ; deux lignes ténues montrent le cône. Le premier tir après un arrêt est donc plus précis : il faut s'arrêter pour tirer juste. La balle s'arrête à la portée effective plus 100.
- Murs, meubles, piliers, portes fermées et décor solide arrêtent le laser et les balles (une balle arrêtée ne fait aucun dégât) ; les fenêtres et leurs planches les laissent passer.
- Le canvas occupe toute la fenêtre du navigateur. Vue du dessus inclinée à 75° (`?tilt=60|75|90`). Vue proche : la caméra suit le joueur avec lissage, ne sort jamais du monde ; zoom par défaut propre à chaque carte (3,4 sur le rez-de-chaussée, même échelle qu'au lot 3a), `?zoom=1` montre toute la zone. Touche F pour le plein écran réel.
- Sur téléphone, le jeu se joue en paysage ; en portrait, un message demande de tourner l'appareil.
- Touches Échap ou P : pause ; M : son. Sur téléphone, un bouton « Touche ici pour activer le son » apparaît tant que le son n'est pas débloqué.

## Écrans (codes de blocs `E<écran>-<n>`)
Chaque écran est livré en version finale au lot indiqué du plan.
| Écran | Fichier | Blocs dans l'ordre | Lot |
|---|---|---|---|
| E1 Menu | `index.html` (page d'attente actuelle, remplacée) | E1-1 titre ; E1-2 Jouer ; E1-3 solde d'argent ; E1-4 accès boutique ; E1-5 accès réglages ; E1-6 pied de page (légal) ; le choix du monde est ajouté au lot 7 (code fixé alors, sans renuméroter les existants) | 7 |
| E2 Partie | `jeu.html` | E2-1 zone de jeu ; E2-2 HUD compact (voir Interface de jeu ; l'argent s'y ajoutera au lot 4) ; E2-3 stick gauche ; E2-4 stick droit ; E2-5 pause ; E2-6 panneau de pause (reprendre, plein écran, son, volume, effet VHS, ligne « Prochaine zone : manche N », recommencer) ; E2-7 fin provisoire (vague atteinte ; variante « Monde terminé ») ; E2-8 annonce centrale (vague ; « Nouvelle zone ») ; E2-10 état à terre. **E2-9 (réparation, retiré au lot 3a) et E2-11 (flèches de bord, retiré au lot 3b) : ces codes ne sont pas réutilisés.** Ordre du HTML : E2-2, E2-8, E2-10, E2-5, E2-3, E2-4 | 1 à 3c (fait) |
| E3 Boutique | `boutique.html` | E3-1 solde ; E3-2 liste des améliorations ; E3-3 armes ; E3-4 retour | 5 |
| E4 Fin de partie | scène ou page | E4-1 résultat ; E4-2 argent gagné ; E4-3 rejouer ; E4-4 boutique | 7 |
| E5 Réglages | `reglages.html` | E5-1 langue ; E5-2 son ; E5-3 réduire le sang ; E5-4 sauvegarde (export, import, effacer) | 7 |
| E6 Légal | `legal.html` | E6-1 mentions ; E6-2 vie privée | 7 |
Les noms de fichiers des écrans autres que `jeu.html` sont provisoires et fixés dans le prompt de leur lot. Le HUD (en HTML au-dessus du canvas) et les panneaux restent à au moins 16 px des bords, plus les zones de sécurité du téléphone.

## Structure d'une partie (inspirée d'Archero pour les mondes, de Black Ops 3 pour les manches ; de mémoire, non vérifiée)
- Un **monde** = un bâtiment et **40 manches**. Premier monde : un bâtiment à deux étages dont la disposition vient d'un modèle 3D fourni par le propriétaire (l'assistant qui rédige les prompts ne l'a jamais vu : une session d'agent l'a lu au lot 3b). À terme, **4 salles : 2 au rez-de-chaussée (la salle de départ avec sa poche, et l'aile de gauche) et 2 à l'étage.** Aujourd'hui, seul le rez-de-chaussée existe.
- Les **manches sont numérotées en continu** (comme les manches de Black Ops 3) : la difficulté suit le numéro de manche, jamais la zone ouverte.
- **Des portes s'ouvrent d'elles-mêmes, sans achat, quand une manche est terminée**, pour agrandir le territoire :
  - **Porte 1** (fin de la manche 10, donc dès la manche 11) : l'embrasure de 85 entre la salle de départ et l'aile de gauche ; elle ouvre l'aile et ses fenêtres F1 à F3. **Faite au lot 3c.**
  - **Porte 2** (fin de la manche 20, dès la manche 21) : l'escalier de l'aile de gauche, qui ouvre la première salle de l'étage. Lot 3e.
  - **Porte 3** (fin de la manche 30, dès la manche 31) : le second escalier (celui de la salle de départ) et la porte de l'étage, qui ouvrent la seconde salle de l'étage. Lot 3e.
- **Zones fermées** : leurs fenêtres sont inertes (aucun zombie n'y apparaît ni ne les attaque) et leur porte est un bloc plein ; au départ, 5 fenêtres (F4 à F8) et 10 points d'apparition sont actifs ; après la porte 1, 8 fenêtres et 16 points. Les portes 2 et 3 sont déclarées dans `zones.json` (`planned`, sans effet).
- **Ouverture** : pause de 12 s à la fin de la manche : « Vague N terminée », puis « Nouvelle zone » à 3,0 s ; la porte s'enfonce dans le sol en 1,2 s à 3,6 s ; vie remise à 100 % ; les chutes ne sont pas rendues ; les planches ne sont pas remises à neuf. `?wave=N` ouvre au chargement les portes dont `openAfterWave < N`.
- Une partie commence toujours à la manche 1, zones de départ seules ; mourir termine la partie ; l'argent gagné est conservé ; finir la manche 40 termine le monde (écran provisoire « Monde terminé », écran définitif au lot 7) ; `?endless=1` continue pour les essais.
- **Étage** (lot 3e) : avec gestion de la visibilité par étage (l'étage où l'on n'est pas se masque) ; il double la géométrie, donc le lot 3d (coût de dessin) passe avant.
- Les améliorations s'achètent entre les parties, dans la boutique ; il n'y a pas de choix d'amélioration en cours de partie (décision en attente).

## Mécanique
- **Carte ancienne** (lots 1b à 3a) : une salle de 2000 × 1200 unités dans un monde de 3600 × 2800 (`data/game/world.json`), entourée d'un décor extérieur ; trois fenêtres ; 14 meubles. Elle reste disponible par `?map=salle` : une seule zone, aucune porte, aucune fin de monde.
- **Premier monde, rez-de-chaussée** (lots 3b et 3c, faits) : relevé sur un modèle 3D à 1,2 m de hauteur. Une aile verticale à gauche (441 × 1 656), une grande salle à droite (1 644 × 621), une ouverture de 85 entre les deux, **huit fenêtres F1 à F8 de 72 unités**, 10 piliers de 35 dans le monde, un escalier plein (sans étage, sans rampe). Murs de 40, monde de 4 040 × 3 460. Le joueur démarre dans la grande salle. La carte est décrite par `data/game/maps/rez-de-chaussee/plan.json` (pixels du plan, 5 unités par pixel, obstacles compris) ; `world.json` et `decor.json` de la carte en sont dérivés par `npm run carte` et ne s'éditent jamais à la main.
- **Zones et portes** (lot 3c, fait) : `zones.json` (en pixels du plan) décrit la zone `depart` (grande salle et poche, F4 à F8, 10 points d'apparition, ouverte dès le début) et la zone `aile` (F1 à F3, 6 points, fermée jusqu'à la porte 1). La porte 1 est un bloc plein de 60 de haut (région `tole` de l'atlas, grise, sans ombre, 10 triangles) qui bloque joueur, zombies, balles et laser ; elle est dessinée un peu plus petite que son obstacle (pas de faces coïncidentes avec les murs) ; elle s'enfonce dans le sol en 1,2 s à l'ouverture.
- **Mobilier** (lots 3b et 3c) : `plan.json` est la source unique. **Les 13 pièces ajoutées au lot 3c (P1 à P13 : 4 armoires, 3 tables, 4 comptoirs, 2 caisses) sont provisoires** (marquées `provisional: true`, jamais comparées au modèle 3D) ; le propriétaire les accepte et corrige par identifiant de pièce. Les armoires, étagères et longs meubles sont dessinés en rangées de modules (un par tranche de 170, 4 au plus) ; les tables et grands meubles restent des blocs ; les petits meubles seuls (aire d'au plus 6 500) sont des chaises (M4, M21, M32, P10) tournées dos au mur le plus proche, dont la hitbox est l'assise seule (`js/core/furniture-model.js`). Aire libre : 80,9 % de l'intérieur (départ 83,9 %, aile 77,1 %), couloirs de 50 (départ) et 53 (aile). Le mobilier ne bouge plus ; il n'y a plus de niveaux qui se resserrent.
- Règles de toute carte : couloirs libres d'**au moins 50 unités** (règle du propriétaire) **et franchissables dans la grille de chemin** (sinon élargis à 60 ou retire la pièce) ; deux obstacles sont soit au contact, soit séparés par un couloir valide (fusion des interstices) ; **aucun obstacle ne recouvre l'épaisseur d'un mur** (rognage au ras du mur) ; zone de départ libre sur 120 ; 150 de profondeur libre derrière chaque fenêtre ; aucune pièce dans l'ouverture d'une porte ni à moins de 100 de part et d'autre ; espace libre connexe (une fois les portes ouvertes) ; couloirs d'approche de 160 sans décor solide devant chaque fenêtre ; chemin de chaque point d'apparition à sa fenêtre de 900 au plus.
- Les zombies naissent à l'extérieur, hors de la vue (16 points d'apparition, 2 par fenêtre, à 450 et 650 unités du mur, au milieu de la brume ; seuls ceux des zones ouvertes sont actifs), traversent le décor par les couloirs d'approche et gagnent leur fenêtre. Ils poursuivent le joueur en ligne droite quand la voie est libre, sinon contournent les obstacles (champ de flux, grille de 20 unités).
- **Vagues** (inspirées du mode Zombies de Black Ops 3 : formule de vie vérifiée, le reste de conception propre) : courbe pure `js/core/waves.js` et directeur `wave-director.js`, paramétrés par `data/game/waves.json`.
  - Vie des zombies : `1 + 0,5 × (n−1)` jusqu'à la vague 9 (×5), puis ×1,1 par vague, plafond ×30 (atteint à la vague 28). BO3 : 150 de vie plus 100 par manche jusqu'à 950 à la manche 9, puis ×1,1 par manche, plafond introduit à Black Ops 4. La courbe reste donc sous celle de BO3.
  - Nombre total : `5 + 1,6 × (n−1) + 0,05 × (n−1)²`, plafond 150 (atteint vers la vague 41) ; vague renforcée (+30 %) toutes les 5 vagues.
  - Simultanés : 6 à la vague 1, jusqu'à 10 au plus (budget de triangles ; BO3 en admet 24).
  - Vitesse : quatre allures (marche lente 45, marche 70, rampe vite 105, course 140, plafonnées par allure), introduites progressivement ; aucun zombie ne dépasse 190 (le joueur : 220). La rampe est visuelle (corps abaissé, sans effet sur la collision).
  - Quatre types : `marcheur` (de base), `petit` (rapide, fragile, dès la vague 3), `voute` (résistant, dès la 5), `grand` (lent, très résistant et dur, dès la 7). Un type introduit compte au moins un zombie.
  - Dégâts au contact croissants (×1,05 par vague, plafond ×3) ; intervalle d'apparition décroissant de 2,5 s à 0,9 s.
  - Pause de 3 s avant la vague 1, 8 s entre les vagues, 12 s quand une porte s'ouvre. À la fin d'une vague, le joueur retrouve 100 % de sa vie maximale.
- **Fenêtres et siège** (lot 3, fait) : chaque fenêtre porte 4 planches. Les zombies de la fenêtre visée s'y rendent ; 2 emplacements d'attaque, file d'attente derrière (6 places) ; un zombie arrache une planche en 2,2 s (`petit` 0,7, `voute` 1,2, `grand` 1,6 de vitesse d'arrachage) ; quand la dernière planche tombe, ils escaladent en 1,2 s (2 à la fois) et entrent. Aucun zombie n'entre sans fenêtre ouverte ; un zombie bloqué dehors repart vers sa fenêtre. Les planches ne bloquent ni le laser ni les balles ; le joueur ne franchit jamais une fenêtre.
- **Réparation** (lot 3, fait) : automatique quand le joueur est à moins de 80 unités du côté intérieur d'une fenêtre ; 1,8 s par planche au niveau 0 ; bloquée tant qu'un zombie occupe un emplacement de cette fenêtre ou escalade (la phrase explicative passe par `#hud-live`). Aucun coût (l'argent arrive au lot 4).
- **Tomber à terre** (lot 3, fait) : quand la vie tombe à 0 et qu'il reste une chute (1 de base), le joueur tombe 5 s : invulnérable, immobile, sans tir ; les zombies proches sont repoussés (rayon 220, 160 à la chute et 200 au relevage) ; il se relève à 50 % de sa vie maximale avec 2 s de protection. Sans chute : fin de partie. Le soin de fin de vague est reporté au relevage.
- Argent : gagné par ennemi tué et par vague, conservé à la mort (lot 4).
- **Statistiques du joueur** (lots 2b et 3, niveaux de 0 à 10, valeurs provisoires dans `data/game/player-stats.json`) :
  - `degats` : +15 % par niveau (62,5 dégâts par seconde au niveau 0, 417 au niveau 10 avec tout au maximum) ;
  - `portee` : +12 % par niveau sur le laser et sur la portée de tir ;
  - `precision` : demi-angle du cône de 4° × 0,9 puissance niveau à l'arrêt, plus 8° × 0,85 puissance niveau en déplacement (plancher 0,5°) ;
  - `cadence` : délai entre tirs de 0,4 s × 0,9 puissance niveau (plancher 0,15 s) ;
  - `vitesse` : +4 % par niveau (plafond +40 %) ;
  - `vie` : +12 de vie maximale par niveau ;
  - `regen` : points de vie rendus à chaque zombie tué, 1 de base puis +1 par niveau (jamais au-delà du maximum, jamais après la mort ni à terre) ;
  - `chutes` (niveaux 0 à 5) : 1 chute de base, +1 par niveau ;
  - `reparation` : temps par planche de 1,8 s × 0,88 puissance niveau (plancher 0,4 s).
  `chutes` et `reparation` sont dans la section `extra` de `player-stats.json`. Elles s'achètent dans la boutique (lots 4 et 5) ; avant, les niveaux se règlent par `?lvl=degats:3,precision:5` ou `?lvl=all:5`, sans aucun stockage.
- Armes (`data/weapons.json`) : une arme de départ (pistolet), d'autres achetables ; chaque arme définit dégâts, cadence, portée, vitesse de balle, tolérance de visée.
- Tourelles (lot 9), skins de personnage et d'armes (lot 11), mondes supplémentaires (lot 10).
- Sang et particules (lot 8), avec une option « réduire le sang ».
- **Ambiance** (lot 2c, fait et jugée bonne par le propriétaire) : une animation centrale « VAGUE N » démarre 3 s avant l'apparition des zombies et culmine avec elle, sur une mélodie angoissante synthétisée ; « Vague N terminée » avec un son plus doux ; vague renforcée : sous-titre et mélodie plus grave. Effet VHS en surcouche HTML/CSS (grain animé, lignes de balayage, bords teintés rouge et cyan, bande de suivi occasionnelle), activé par défaut, basculable dans la pause, coupé sous `prefers-reduced-motion` et par `?vhs=0`. Aucun clignotement de plus de 3 par seconde.
- Les valeurs d'équilibrage sont provisoires ; elles seront jugées sur la carte définitive avec ses zones (après le lot 3e) et réglées au lot 12. Repères : au lot 2b, sans amélioration, un joueur ne survit pas à la vague 10 ; au lot 3c, un joueur immobile au départ à la manche 5 (5 fenêtres) voit la première fenêtre s'ouvrir à 15,3 s, tombe à 32,1 s et meurt à 40,6 s sans amélioration.

## Personnages et rendu
- Personnages articulés en 3D, vus du dessus : bassin, tronc, tête, deux bras (épaule et coude), deux jambes (hanche et genou), arme tenue en main. 12 pièces et 700 triangles au plus chacun, géométries et matériaux partagés. Le joueur tourne le tronc vers la visée, les jambes suivent le déplacement, léger recul au tir.
- Zombies : quatre variantes visuelles (`marcheur`, `petit`, `grand`, `voute` : taille, tenue, teint, posture), sans sang avant le lot 8. Quatre allures, dessinées par des poses distinctes : marche lente (traînante), marche, rampe (corps abaissé, torse presque horizontal), course (grande amplitude, torse penché). Les rampants plaisent : on les garde. Trois poses de plus, purement visuelles (lot 3) : `arracher`, `escalade`, et le joueur `terre`. Les angles des articulations viennent d'une fonction pure (`pose.js`, testée) ; le rendu ne fait que les appliquer.
- **Fenêtres et planches** (lots 3 et 3a, faits) : texture `planche` dédiée de 128 px (bois clair, veines, têtes de clou), nettement distincte du bois des meubles ; poutres de 6 de haut, pivot au bas, inclinaison de 3 à 5° (plafond 7°), aucun coin dans le sol ni dans le mur ; cadre de fenêtre et trou sombre dans le mur ; **quatre carrés sur le dessus du mur, devant la fenêtre** : plein = planche présente, vide = absente, le carré de la planche en cours de réparation se remplit par seizièmes (la lecture se fait par la forme et la luminosité, jamais par la couleur seule) ; les planches arrachées restent en débris à plat devant la fenêtre jusqu'à la réparation de la planche (4 par fenêtre au plus, un maillage par fenêtre). Un maillage par fenêtre (42 triangles pour les poutres, le cadre, le trou et les carrés), dessiné seulement si la fenêtre est à l'écran.
- **Ambiance visuelle** (lot 3b) : intérieur en béton gris froid (carrelage gris, murs gris), extérieur de nuit (herbe morte bleutée, feuillage éteint) ; brume (`scene.fog`, jeton `--game-fog`) et **mur de brouillard** (`js/core/fog.js`, un plan translucide, 1 appel de dessin de plus) : transparent près des murs, opaque à partir de 320 unités, de sorte que les zombies surgissent de la brume. Réglages dans `data/game/render.json`. Couleurs par jetons de `tokens.css`, aucune image.
- Ombres portées (carte de 1024, la lumière suit la caméra) ; seules cinq pièces principales des personnages, les meubles, les piliers et les voitures en projettent.
- **Budget de dessin** : 300 appels et 15 000 triangles au plus (`renderer.info` : les triangles comptent la passe d'ombre ; la mesure est indépendante du matériel). **Mesuré au lot 3c après les meubles modélisés, avec 10 zombies, planches, ombres actives, cône affiché : 195 appels et 14 392 triangles ; près d'une fenêtre : 192 appels et 14 988 triangles, soit une marge de 12 triangles seulement** (plafond du test `jeu-planches` remonté à 15 000). **Lot 3d (coût de dessin) : objectif de 12 000 triangles et 225 appels au plus dans quatre scénarios de mesure**, par découpage du décor fixe en tuiles éliminées hors champ, proxies d'ombre pour les personnages et suppression des faces invisibles. **10 zombies simultanés au plus.** Les lots 3e (étage), 8 (sang) et 9 (tourelles) ne passeront pas sans le lot 3d. Les surcouches HTML/CSS (annonce, effet VHS, HUD) n'ajoutent aucun triangle.
- Le décor est créé une seule fois (maillages fusionnés ou instances), jamais par image.
- Paramètres de diagnostic dans l'URL : `?fps=1`, `?dpr=1`, `?shadows=0`, `?tilt=`, `?zoom=`, `?wave=N` (démarre à la vague N ; avec N ≥ 11, la porte 1 est déjà ouverte), `?endless=1` (continue après la manche 40), `?lvl=` (niveaux des statistiques, sans aucun stockage), `?vhs=0|1`, `?planks=N` (planches de départ, 0 à 4), `?map=salle` (ancienne salle), `?labels=1` (étiquettes F1 à F8), `?chunks=0` et `?proxy=0` (lot 3d : comparer au rendu d'avant le découpage et d'avant les ombres simplifiées).

## Contenus
| Contenu | Fournisseur | Statut |
|---|---|---|
| Textures, matériaux, modèles | Générés en code (fonctions pures déterministes, atlas de 512 et 256, 4,9 Mo) ; texture `planche` de 128 px | Faits aux lots 1c, 3a et 3b, à enrichir par monde |
| Sons | Plus de 50 tampons synthétisés en code (6,58 Mo au lot 3, limite 8) : tirs en couches, impacts par matière, pas, voix de zombies par formants (16 à 36 par minute avec 8 zombies), ambiance, trois sons d'annonce de vague, quatre sons de fenêtre et de chute ; page d'écoute `sons.html` | Faits ; réglables par identifiant de son |
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
- Les couleurs du jeu sont des variables `--game-*` dans `tokens.css`, lues par `js/game/palette.js` ; aucune couleur en dur dans le JavaScript. `tokens.css` fait foi pour les valeurs (sols, murs, laser et brume ont été retouchés aux lots 1c, 3a et 3b).
- Tout état (vie, fenêtre, solde, chute, porte) est porté aussi par une forme ou un texte, jamais par la couleur seule.
- Lisibilité : contraste d'au moins 3:1 entre les personnages et le sol, 4,5:1 pour le laser et la balle ; planches : au moins 2,5:1 contre le mur, 3:1 contre le sol, 1,8:1 contre le bois des meubles ; porte : au moins 1,5:1 en luminance contre le mur voisin (mesuré 1,65:1).
- **Interface de jeu (lots 3a et 3b)** : texte de 14 px au moins, contraste de 4,5:1 calculé sur le pire fond ; **E2-2 est un seul rectangle noir** (environ 64 px de haut à 667×375, 300 px de large au plus) contenant la barre de vie avec ses chiffres dedans, les puces « Vague N », restants et tués, et les chutes (une silhouette avec un petit « + » par chute restante, plus le nombre). **Aucune ligne « Fenêtres » dans le HUD** et **aucune flèche de bord** : l'état des fenêtres se lit sur les carrés du mur ; `?labels=1` affiche F1 à F8 pour les essais. Pas de chevauchement avec Pause, les sticks ni E2-10 ; icônes en SVG en ligne écrit dans le code ; aucun `filter`, `mix-blend-mode` ni `backdrop-filter` sur le HUD.
- Cibles tactiles de 44 px, contraste de 4,5:1 pour le texte (le rouge sang n'est utilisé que pour de grands textes, 3:1), `prefers-reduced-motion` respecté.
- Tailles de test : 375, 768 et 1440 px, plus 667×375 (téléphone en paysage) et 2560×1080 pour le jeu.

## Stack et hébergement
- HTML, CSS à variables, JavaScript en modules. **Three.js 0.186.1** (MIT) est la bibliothèque de rendu : paquet npm en `devDependency` à version exacte, fichiers copiés par `npm run vendor:three` vers `vendor/three/` (jamais édités à la main), chargés par `importmap` locale placée **avant** tout `modulepreload` (sinon Firefox l'ignore). `dependencies` reste vide.
- Outils de développement : ESLint (configuration plate), Vitest, Playwright avec axe, Lighthouse. **Vitest et Playwright se lancent l'un après l'autre, jamais en parallèle.** Tests qui ont été intermittents sous charge (à relever au départ de chaque lot, les deux derniers sont corrigés depuis le lot 3c) : `axe` à 1440×900, `core-monde-ia`, test de durée de rendu des sons, rendu des sons d'annonce, trois tests `jeu-voix`, un test de pose des zombies, « Rejouer » (`jeu-ambiance`), laser qui s'estompe (`jeu-rendu`, désormais avec `&vhs=0`).
- Arborescence de code : `js/core/` (logique pure du jeu : aucun Three.js, Web Audio, DOM, réseau, stockage ni horloge ; temps passé en argument ; pas de `Math.random`, générateur à graine), `js/game/` (rendu, sons, entrées), `js/save/` (futur `SaveRepository` et adaptateurs), `data/` (textes et chiffres).
- Le monde est dans le plan (x, y) pour la logique ; dans Three.js, (x, 0, y) ; le haut de l'écran est le nord ; la caméra est au sud du joueur.
- Cartes : `data/game/maps/<id>/`. La carte par défaut est `rez-de-chaussee` : `plan.json` (pixels du plan, obstacles compris) est la source unique ; `world.json` et `decor.json` en sont dérivés par `npm run carte` (qui liste décalages, fusions, rognages et retraits, et échoue si une règle casse) et ne s'éditent jamais à la main. Corriger la carte ou le mobilier = changer un chiffre dans `plan.json` ou `zones.json`, relancer `npm run carte`, vérifier avec `scripts/zones-metriques.mjs` et `carte.html`. Les fichiers `data/game/world.json` et `decor.json` d'origine (ancienne salle) ne changent pas. `Docs/ref/modele-rdc/` accueillerait des captures du modèle 3D (absent aujourd'hui ; exclu du contrôle de 5 Mo).
- `carte.html` (dessin SVG de la carte avec les fenêtres F1 à F8 et la zone des portes) et `sons.html` (page d'écoute) : pages techniques, à retirer au lot 13.
- GitHub Pages, chemins relatifs, aucune ressource externe. Déploiement depuis `main` seulement ; aperçus par branche (`apercu.txt`) à `/lots/lot-N/` ; page `/lots/` et menu `/dev/` générés automatiquement, avec un journal des versions (`data/changelog.json`) : chaque lot ajoute son entrée et adapte les tests `data-changelog` et `dev.spec`. Une branche de lot n'est jamais supprimée. La branche `lot-0t` (test Three.js contre Phaser) n'est pas fusionnée et reste en ligne.
- Workflow : `verify` avec délai de 30 min, Playwright rejoué une fois en cas d'échec (modifié au lot 1d à la demande du propriétaire) ; un lot ne le modifie que si son prompt l'autorise. Le push des tags est refusé par GitHub : les tags restent locaux. Si la session d'agent impose une autre branche que `lot-N`, démarre en HEAD détaché ou a une branche locale `main` en retard, l'agent crée et suit la branche du lot depuis `origin/main` et le signale.
- `jeu.html` : balises `apple-mobile-web-app-capable` et `theme-color` (lot 3a ; pas de manifeste ni de service worker).
- Sauvegarde : interface `SaveRepository` ; adaptateur `localStorage` avec schéma versionné et migrations ; export et import par code. Une base en ligne sera un nouvel adaptateur, sur décision écrite. Les niveaux des statistiques viennent de `js/game/levels-source.js` (lecture de `?lvl=`), seul point à remplacer par la sauvegarde au lot 4.
- Jamais conservé : position, identité, adresse IP, paramètres d'URL de test. Aucun cookie.
- Langue : français seul pour l'instant ; la structure `data/i18n/` permet d'ajouter l'anglais. `noindex` pendant le développement.
- Tests : `?test=1` expose `window.__zs` (état du jeu, graine, apparition d'un zombie, avance de la simulation, vue d'ensemble, rendu, audio, vagues, statistiques, annonce, effet VHS, fenêtres, débris, HUD, chutes, carte, zones ; hooks `skipWave` et `setDoor`) ; `?empty=1` charge un monde sans meubles ni décor solide, et sans siège aux fenêtres ; `?seed=` et `?nospawn=1` fixent la graine et coupent les vagues.
- Seuils Lighthouse mobile : `index.html` 90 / 95 / 95 et CLS ≤ 0,1 ; `jeu.html` performance 45 (**mesuré 50 avec l'effet VHS et 51 sans au lot 3c : marge de 5 points**), accessibilité 95, bonnes pratiques 95, CLS ≤ 0,1. Si un lot fait passer `jeu.html` sous 45, l'agent applique dans l'ordre : grain immobile, retrait de la bande de suivi, effet VHS coupé par défaut, réduction du décor extérieur ; il ne modifie jamais le seuil et le signale en tête du bilan.
- `CLAUDE.md` reste sous 9 000 caractères (8 391 au lot 3c) : chaque lot consolide d'abord à 8 000 au plus, puis finit à 8 400 au plus.

## Hors périmètre (pour l'instant)
Multijoueur, comptes, classements en ligne, publicité, achats, base de données, balles perforantes ou ricochets, munitions et rechargement, images, sons ou modèles 3D importés (tout est généré en code), anglais, caméra libre ou rotative, cartes de relief et post-traitement 3D (l'effet VHS est une surcouche HTML/CSS), zombies spéciaux (explosifs, tireurs, chiens), boss, choix d'amélioration en cours de partie, vitres qui se brisent, planches qui volent, **achat de portes, étage et escaliers praticables (lot 3e), flèches de bord vers les fenêtres, mobilier qui se resserre par niveau**. Nouveaux sons : aucun avant le lot 4.

## Décisions en attente
- Fidélité du mobilier : les 13 pièces P1 à P13 sont provisoires ; correction par identifiant de pièce, ou captures du modèle 3D déposées dans `Docs/ref/modele-rdc/`.
- Plafond de 10 zombies simultanés : relever ou non après le lot 3d, selon le budget libéré.
- Emplacement exact des portes 2 et 3 (escalier de l'aile, escalier de la salle de départ et porte de l'étage) : à préciser au lot 3e.
- Aspect de la porte (tôle grise au lot 3c ; un son de porte plus tard).
- Fenêtre F9 non ajoutée ; thème visuel du premier monde (nuit, béton gris froid : en place ; nom du monde à choisir).
- Chutes non rendues à l'ouverture d'une porte (proposé) ou rendues.
- À terre : invulnérable pendant la chute (proposé) ou attaquable ; chutes de départ : 1 (proposé).
- Portée de tir de base 700 (au lieu de 1600) : à valider après test.
- Effet VHS : toujours (proposé), réservé au thème horreur quand les mondes existeront (lot 10), ou coupé par défaut si Lighthouse l'exige.
- Choix d'amélioration en cours de partie à la manière d'Archero : oui ou non (non pour l'instant).
- Zone morte de la caméra (0 aujourd'hui : la caméra suit toujours le joueur).
- Anglais : abandonné ou reporté après la mise en ligne en français.
- Monétisation (le jeu reste gratuit et public).
- Date de mise en ligne officielle et passage en indexation.
- Base de données en ligne : si, quand et quel service (coûts : comptes, RGPD, clé visible dans le navigateur).
- Seuil de performance Lighthouse de `jeu.html` (45 proposé, mesuré 50 à 51).

## Risques connus
Risque de droits sur une disposition reproduite à l'identique (nom, textures, objets et sons restent originaux) ; **budget de triangles épuisé (marge de 12 triangles près d'une fenêtre) : le lot 3d est un prérequis de l'étage, du sang et des tourelles** ; **manches 1 à 9 jouées dans une seule salle avec 5 fenêtres et un seul escalier plein : plus dur qu'avec la carte entière, non jugé** (un joueur immobile y meurt à 40 s à la manche 5 sans amélioration) ; goulot de 85 à l'ouverture de la porte 1 pour les zombies qui poursuivent le joueur ; couloirs de 50 unités à la limite de la grille de chemin (zombies bloqués) ; mobilier provisoire non conforme au modèle 3D ; équilibrage (vie, vitesse et nombre, 100 % de vie rendue, zombies qui arrivent groupés) ; durée d'un monde de 40 manches non prévisible ; cône de tir et tir automatique (au niveau 0, en déplacement à 700 unités, environ 16 % des balles touchent un zombie) ; IA des zombies aux fenêtres (files d'attente, blocages) ; coût du champ de flux sur téléphone (2 à 7 ms dans la session, non mesuré sur téléphone) ; **marge Lighthouse de 5 points** ; lisibilité de l'interface à 375 px de haut et de l'îlot dynamique ; lisibilité des carrés de planches sur le mur ; visibilité par étage (lot 3e) ; fluidité de la 3D sur téléphone modeste (non mesurée) ; temps de génération des textures et des sons sur téléphone (non mesuré) ; clignotement et photosensibilité (animation de vague, effet VHS) ; sons non écoutés par l'agent (jugés par le propriétaire) ; esthétique non jugée par l'agent ; poids de Three.js au chargement ; netteté sur écrans haute densité ; sticks multi-touch ; précision des impacts de balles rapides ; sang et public mineur ; commutateur silencieux des iPhone ; l'API de Three.js évolue (toujours lire le paquet installé).

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
| 3 | Fenêtres à planches, siège par les zombies, réparation automatique, chutes, statistiques `chutes` et `reparation`, quatre sons | fait |
| 3a | Planches lisibles, carrés sur le mur, débris, HUD en un seul rectangle, balises d'écran d'accueil | fait |
| 3b | Première carte d'après le modèle 3D (8 fenêtres de 72, sans portes), `carte.html`, `?map=salle`, `?labels=1`, textes de nuit, brume et mur de brouillard | fait |
| 3c | Zones et portes : `zones.json`, porte 1 débloquée à la fin de la manche 10 (aile et fenêtres F1 à F3, 12 s de transition, « Nouvelle zone »), 40 manches, fin de monde provisoire, 13 pièces de mobilier provisoires, armoires en modules et chaises | fait |
| 3d | Coût de dessin : découpage du décor fixe en tuiles éliminées hors champ, proxies d'ombre des personnages, suppression des faces invisibles, quatre scénarios de mesure, objectif 12 000 triangles et 225 appels | à lancer |
| 3e | Étage : escaliers praticables, visibilité par étage, portes 2 (manche 20) et 3 (manche 30), 4 salles au total | à écrire (plus tard) |
| 4 | Argent, sauvegarde locale (`SaveRepository`) | à écrire |
| 5 | Boutique et améliorations (E3) | à écrire |
| 6 | Armes | à écrire |
| 7 | Menu avec choix du monde (E1), fin de partie (E4), réglages (E5), légal (E6) | à écrire |
| 8 | Sang, particules, option « réduire le sang » | à écrire |
| 9 | Tourelles | à écrire |
| 10 | Mondes supplémentaires (autres thèmes) | à écrire |
| 11 | Skins de personnage et d'armes | à écrire |
| 12 | Qualité technique : performance, équilibrage, accessibilité, nettoyage | à écrire |
| 13 | Mise en ligne : SEO, mentions légales finales, indexation, retrait de `sons.html` et `carte.html` | à écrire |

## Idées en attente
Base de données en ligne et sauvegarde dans le cloud, classement, achievements, boss de fin de monde, portes payantes et barrières achetables, choix d'améliorations en cours de partie, mode infini après la manche 40, zombies spéciaux, manches spéciales (comme les chiens de BO3), anglais, plusieurs armes en même temps, son de porte, relever le plafond de zombies simultanés, mobilier qui se resserre par niveau (abandonné), réglages de la mélodie et de l'effet VHS (petit lot 2c2 si besoin).
