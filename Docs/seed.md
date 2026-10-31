# Seed — Z-Survival (jeu de survie zombies, vue de dessus en 3D)
Version 0.22 — 31/10/2026 — modifié par le propriétaire seulement.
Dépôt : Nowyyy/Z-Survival. Site : https://nowyyy.github.io/Z-Survival/

## Le jeu en une phrase
Jeu web gratuit et solo, en 3D vue de dessus : un personnage défend un bâtiment à deux étages contre des vagues de zombies de plus en plus nombreuses, résistantes et rapides ; des portes s'ouvrent au fil des manches pour agrandir le territoire ; chaque partie rapporte de l'argent, conservé même en cas de mort, qui achète des améliorations permanentes. Inspiré du principe de SAS Zombie Assault TD pour la défense, de Black Ops 3 (mode Zombies) pour la montée en difficulté et d'Archero pour la structure en mondes ; aucun visuel, nom ni son repris.

## Piliers
1. Jouable en 10 secondes sur téléphone comme sur ordinateur, sans compte.
2. Mourir fait progresser : l'argent n'est jamais perdu.
3. La logique du jeu est pure (sans Three.js ni DOM), donc testée à fond : changer le rendu ne change pas les règles.
4. Aucune donnée personnelle, aucune requête externe : la sauvegarde est locale (une seule clé `localStorage`), mais le code est prêt pour une base en ligne.
5. Tout texte et tout chiffre d'équilibrage sont dans des fichiers de données.
6. Chaque écran est réalisé directement en version finale (pas de maquettes).
7. Une pièce encombrée où l'on se fait difficilement toucher : le jeu récompense le déplacement et la visée, pas le nombre de tirs.
8. Tout est généré en code : textures, modèles, sons. Aucun fichier image, modèle 3D ou son importé.
9. La difficulté monte vague après vague sans plafond de fin : seul le budget de dessin limite le nombre de zombies simultanés.
10. Le territoire s'agrandit avec la progression (portes), il ne se resserre pas : les premières manches se jouent dans un espace réduit.
11. Deux étages physiquement superposés : l'étage est au-dessus du rez-de-chaussée, les escaliers se marchent, les zombies existent, apparaissent et se déplacent sur les deux étages, même quand le joueur ne les voit pas.

## Contrôles
| Plateforme | Déplacement | Visée | Tir |
|---|---|---|---|
| Ordinateur | Touches physiques W, A, S, D et flèches (lues par `event.code` : Z, Q, S, D en AZERTY) | Souris | Un tir part automatiquement quand la ligne de visée touche ou frôle un ennemi |
| Mobile (paysage) | Stick gauche flottant (moitié gauche de l'écran) | Stick droit flottant (moitié droite) | Idem |
- Aucun bouton de tir, aucun bouton de réparation, aucun bouton de porte ni d'escalier : tout est automatique.
- **Escaliers (lot 3e, faits)** : le joueur marche dans l'escalier. En y entrant, il se déplace librement dans sa largeur (un « tube » autour du chemin de l'escalier, avec des rambardes), sa hauteur suit sa position, son étage logique change à mi-hauteur (hystérésis 0,48 / 0,52). Aucun fondu, aucune téléportation, aucun délai à l'entrée ni à la sortie, aucune limite de zombies. Protection de 1,0 s après un changement d'étage. Le voile `#floor-fade` et l'échange instantané ne servent plus qu'avec `prefers-reduced-motion` et pour les hooks de test.
- Le laser rouge (300 unités de base, qui s'estompe sur son dernier tiers) est une aide à la visée : il ne blesse jamais. Un tir part quand la ligne de visée passe à moins de 24 unités du bord d'un zombie touchable (même étage logique que le joueur ; un zombie dans un escalier est touchable), jusqu'à la portée de tir (700 de base ; limite réelle d'environ 770 au centre d'un zombie : marge de visée 24, rayon 20, bouche 26), sans mur, meuble ni porte fermée entre les deux. Laser et balles sont à la hauteur du joueur ; l'emprise d'un escalier ne les bloque pas (elle bloque les déplacements).
- Chaque tir crée une balle visible (flash de bouche, balle avec courte traînée, étincelle à l'impact). Les dégâts sont appliqués seulement à l'impact de la balle, figés à la création de la balle. La balle part dans un cône autour de l'axe de visée : demi-angle de 4° à l'arrêt, jusqu'à 12° en déplacement (au niveau 0, lissé en 0,08 s à l'ouverture et 0,25 s à la fermeture), resserré par la statistique de précision ; deux lignes ténues montrent le cône. Le premier tir après un arrêt est donc plus précis : il faut s'arrêter pour tirer juste. La balle s'arrête à la portée effective plus 100.
- Murs, meubles, piliers, portes fermées et décor solide arrêtent le laser et les balles (une balle arrêtée ne fait aucun dégât) ; les fenêtres et leurs planches les laissent passer.
- Le canvas occupe toute la fenêtre du navigateur. Vue du dessus inclinée à 75° (`?tilt=60|75|90`). Vue proche : la caméra suit le joueur avec lissage, ne sort jamais du monde ; zoom par défaut propre à chaque carte (3,4 sur le rez-de-chaussée), `?zoom=1` montre toute la zone. Touche F pour le plein écran réel.
- Sur téléphone, le jeu se joue en paysage ; en portrait, un message demande de tourner l'appareil.
- Touches Échap ou P : pause ; M : son. Sur téléphone, un bouton « Touche ici pour activer le son » apparaît tant que le son n'est pas débloqué.

## Écrans (codes de blocs `E<écran>-<n>`)
Chaque écran est livré en version finale au lot indiqué du plan.
| Écran | Fichier | Blocs dans l'ordre | Lot |
|---|---|---|---|
| E1 Menu | `index.html` (page d'attente actuelle, remplacée) | E1-1 titre ; E1-2 Jouer ; E1-3 solde d'argent ; E1-4 accès boutique ; E1-5 accès réglages ; E1-6 pied de page (légal) ; le choix du monde est ajouté au lot 7 (code fixé alors, sans renuméroter les existants) | 7 |
| E2 Partie | `jeu.html` | E2-1 zone de jeu ; E2-2 HUD compact (un seul rectangle : vie, vague, restants, tués, chutes, puce « RDC » ou « Étage », **argent au lot 4**) ; E2-3 stick gauche ; E2-4 stick droit ; E2-5 pause ; E2-6 panneau de pause (reprendre, plein écran, son, volume, effet VHS, ligne « Prochaine zone : manche N », **ligne de solde et d'état de la sauvegarde au lot 4**, recommencer) ; E2-7 fin provisoire (vague atteinte ; variante « Monde terminé » ; **argent gagné, solde et record au lot 4**) ; E2-8 annonce centrale (vague ; « Nouvelle zone ») ; E2-10 état à terre. **E2-9 (réparation, retiré au lot 3a) et E2-11 (flèches de bord, retiré au lot 3b) : ces codes ne sont pas réutilisés.** Le voile `#floor-fade` (mouvement réduit seulement) et `#vhs` sont décoratifs : `aria-hidden`, sans code de bloc. Ordre du HTML : E2-2, E2-8, E2-10, E2-5, E2-3, E2-4 | 1 à 3e (fait), 4 |
| E3 Boutique | `boutique.html` | E3-1 solde ; E3-2 liste des améliorations ; E3-3 armes ; E3-4 retour | 5 |
| E4 Fin de partie | scène ou page | E4-1 résultat ; E4-2 argent gagné ; E4-3 rejouer ; E4-4 boutique | 7 |
| E5 Réglages | `reglages.html` | E5-1 langue ; E5-2 son ; E5-3 réduire le sang ; E5-4 sauvegarde (export, import, effacer : reprend la page technique `sauvegarde.html` du lot 4) | 7 |
| E6 Légal | `legal.html` | E6-1 mentions ; E6-2 vie privée | 7 |
Les noms de fichiers des écrans autres que `jeu.html` sont provisoires et fixés dans le prompt de leur lot. Le HUD (en HTML au-dessus du canvas) et les panneaux restent à au moins 16 px des bords, plus les zones de sécurité du téléphone.

## Structure d'une partie (inspirée d'Archero pour les mondes, de Black Ops 3 pour les manches ; de mémoire, non vérifiée)
- Un **monde** = un bâtiment et **40 manches**. Premier monde : un bâtiment à deux étages relevé sur un modèle SketchUp fourni par le propriétaire (`Sanstitre.zip`, non versionné : une session d'agent l'a lu aux lots 3b et 3e ; les mesures de l'étage sont dans `Docs/ref/etage.md`). **4 salles : 2 au rez-de-chaussée (`depart` avec sa poche, et `aile`) et 2 à l'étage (`etage-gauche`, `etage-droite`).**
- Les **manches sont numérotées en continu** (comme les manches de Black Ops 3) : la difficulté suit le numéro de manche, jamais la zone ouverte.
- **Des portes s'ouvrent d'elles-mêmes, sans achat, quand une manche est terminée**, pour agrandir le territoire (toutes faites aux lots 3c et 3e) :
  - **Porte 1** (fin de la manche 10, dès la manche 11) : l'embrasure de 85 entre la salle de départ et l'aile ; elle ouvre l'aile et ses fenêtres F1 à F3.
  - **Porte 2** (fin de la manche 20, dès la manche 21) : l'escalier de l'aile (droit), fermé par un bloc à son pied ; elle ouvre `etage-gauche`.
  - **Porte 3** (fin de la manche 30, dès la manche 31) : le second escalier (celui de la salle de départ, courbe) et la porte de l'étage entre les deux salles du haut ; elles ouvrent `etage-droite`.
- **Zones fermées** : leurs fenêtres sont inertes (aucun zombie n'y apparaît ni ne les attaque) et leur porte est un bloc plein ; au départ, 5 fenêtres (F4 à F8) et 10 points d'apparition sont actifs ; après la porte 1, 8 fenêtres et 16 points ; après les portes 2 et 3, les fenêtres de l'étage (U1 à U7, 2 points chacune) s'ajoutent.
- **Ouverture** : pause de 12 s à la fin de la manche : « Vague N terminée », puis « Nouvelle zone » à 3,0 s (sous-titre selon la porte) ; le ou les blocs s'enfoncent dans le sol en 1,2 s à 3,6 s ; vie remise à 100 % ; les chutes ne sont pas rendues ; les planches ne sont pas remises à neuf. Un bloc d'escalier est dessiné comme une porte mince de 24 d'épaisseur au centre de son emprise (la collision garde toute l'emprise). `?wave=N` ouvre au chargement les portes dont `openAfterWave < N`.
- Une partie commence toujours à la manche 1, zones de départ seules ; mourir termine la partie ; **l'argent gagné est conservé en entier** ; finir la manche 40 termine le monde (écran provisoire « Monde terminé », écran définitif au lot 7) ; `?endless=1` continue pour les essais.
- Les améliorations s'achètent entre les parties, dans la boutique ; il n'y a pas de choix d'amélioration en cours de partie (décision en attente).

## Mécanique
- **Carte ancienne** (lots 1b à 3a) : une salle de 2000 × 1200 unités dans un monde de 3600 × 2800 (`data/game/world.json`), entourée d'un décor extérieur ; trois fenêtres ; 14 meubles. Elle reste disponible par `?map=salle` : un seul étage, une seule zone, aucune porte, aucune fin de monde.
- **Rez-de-chaussée** (lots 3b et 3c, faits) : une aile verticale à gauche (441 × 1 656), une grande salle à droite (1 644 × 621), une ouverture de 85 entre les deux, **huit fenêtres F1 à F8 de 72 unités**, 10 piliers de 35, un escalier plein remplacé au lot 3e par l'escalier de l'aile. Murs de 40, monde de 4 040 × 3 460. Le joueur démarre dans la grande salle. Source : `data/game/maps/rez-de-chaussee/plan.json` (pixels du plan, 5 unités par pixel, obstacles compris) ; `world.json` et `decor.json` de la carte en sont dérivés par `npm run carte` et ne s'éditent jamais à la main.
- **Étage** (lot 3e, fait) : physiquement au-dessus du rez-de-chaussée : le joueur et la caméra restent à y = 0, le monde descend quand on monte (`floorLift` 180 dans `render.json`). Il couvre l'aile, la poche et la moitié ouest de la grande salle (le reste est découvert et n'est pas une salle). Fenêtres **U1 à U7** de 72, espacées de 150 (écarts avec le modèle : `Docs/ref/etage.md`). Mobilier : 2 pièces du modèle (E1, E2) et **6 provisoires (Q1 à Q6)**. Sources : `etage.json` (mêmes origine et échelle que `plan.json`) et `zones.json` ; `etage.world.json` en est dérivé par `npm run carte`. Aire libre : `depart` 83,9 % (couloir 50), `aile` 81,3 % (53), `etage-gauche` 91,2 %, `etage-droite` 73,3 %.
- **Escaliers** (lot 3e, faits) : `escalier-aile` (droit) et `escalier-depart` (courbe : un quart de tour de 90° qui finit à l'ouest, vers la zone de l'étage). Marches de béton dans le maillage des murs du rez-de-chaussée ; trou dans le sol de l'étage, sans paroi, avec garde-corps (texture générée `garde-corps`) sauf à l'entrée ; on voit le rez-de-chaussée par le trou. Chemin de marche : `zones.json` `walk`. Fermés, ils sont bloqués au pied par un bloc plein.
- **Zombies sur deux étages** (lot 3e, fait) : chaque zombie, fenêtre, balle, point d'apparition et obstacle porte un étage. Un zombie apparaît aux fenêtres d'une zone ouverte **quel que soit l'étage du joueur** (la règle « jamais dans la vue » ne s'applique qu'à l'étage du joueur). Un zombie qui n'est pas sur l'étage du joueur se dirige vers l'escalier utilisable le plus proche et le **marche librement, comme le joueur** (dans la largeur, dans les deux sens, sans limite de nombre ; poussée de 6 au plus par image pour ne pas se superposer ; rampants relevés de 14). Quand le joueur est dans un escalier, ses zombies visent le bout de l'escalier qui donne sur son étage logique. Les zombies de l'étage ne sont pas dessinés depuis le rez-de-chaussée ; ceux du rez-de-chaussée le sont depuis l'étage. Plafond global : 10. Limite connue : des allers-retours restent possibles tant que le joueur reste dans l'escalier.
- Règles de toute carte (chaque étage) : couloirs libres d'**au moins 50 unités** (règle du propriétaire) **et franchissables dans la grille de chemin** (sinon élargis à 60 ou retire la pièce) ; deux obstacles sont soit au contact, soit séparés par un couloir valide (fusion des interstices) ; **aucun obstacle ne recouvre l'épaisseur d'un mur** (rognage au ras du mur) ; zone de départ libre sur 120 ; 150 de profondeur libre derrière chaque fenêtre ; aucune pièce dans l'ouverture d'une porte ni à moins de 100 de part et d'autre ; espace libre connexe (une fois les portes ouvertes) ; couloirs d'approche de 160 sans décor solide devant chaque fenêtre ; chemin de chaque point d'apparition à sa fenêtre de 900 au plus ; points d'apparition de l'étage à au moins 160 hors du contour du rez-de-chaussée.
- Les zombies naissent à l'extérieur (2 points par fenêtre, à 450 et 650 unités du mur, au milieu de la brume ; seuls ceux des zones ouvertes sont actifs), traversent l'extérieur par les couloirs d'approche et gagnent leur fenêtre. Ils poursuivent le joueur en ligne droite quand la voie est libre, sinon contournent les obstacles (champ de flux, grille de 20 unités ; **le suivi autour des obstacles n'est pas parfait : deux correctifs essayés au lot 3e n'ont rien amélioré**).
- **Vagues** (inspirées du mode Zombies de Black Ops 3 : formule de vie vérifiée, le reste de conception propre) : courbe pure `js/core/waves.js` et directeur `wave-director.js`, paramétrés par `data/game/waves.json`.
  - Vie des zombies : `1 + 0,5 × (n−1)` jusqu'à la vague 9 (×5), puis ×1,1 par vague, plafond ×30 (atteint à la vague 28). BO3 : 150 de vie plus 100 par manche jusqu'à 950 à la manche 9, puis ×1,1 par manche, plafond introduit à Black Ops 4.
  - Nombre total : `5 + 1,6 × (n−1) + 0,05 × (n−1)²`, plafond 150 (atteint vers la vague 41) ; vague renforcée (+30 %) toutes les 5 vagues.
  - Simultanés : 6 à la vague 1, jusqu'à 10 au plus (budget de dessin ; BO3 en admet 24).
  - Vitesse : quatre allures (marche lente 45, marche 70, rampe vite 105, course 140, plafonnées par allure), introduites progressivement ; aucun zombie ne dépasse 190 (le joueur : 220). La rampe est visuelle.
  - Quatre types : `marcheur` (de base), `petit` (rapide, fragile, dès la vague 3), `voute` (résistant, dès la 5), `grand` (lent, très résistant et dur, dès la 7).
  - Dégâts au contact croissants (×1,05 par vague, plafond ×3) ; intervalle d'apparition décroissant de 2,5 s à 0,9 s.
  - Pause de 3 s avant la vague 1, 8 s entre les vagues, 12 s quand une porte s'ouvre. À la fin d'une vague, le joueur retrouve 100 % de sa vie maximale.
- **Fenêtres et siège** (lot 3, fait ; identique à l'étage) : chaque fenêtre porte 4 planches. Les zombies de la fenêtre visée s'y rendent ; 2 emplacements d'attaque, file d'attente derrière (6 places) ; un zombie arrache une planche en 2,2 s (`petit` 0,7, `voute` 1,2, `grand` 1,6 de vitesse d'arrachage) ; quand la dernière planche tombe, ils escaladent en 1,2 s (2 à la fois) et entrent. Aucun zombie n'entre sans fenêtre ouverte. Les planches ne bloquent ni le laser ni les balles ; le joueur ne franchit jamais une fenêtre.
- **Réparation** (lot 3, fait) : automatique quand le joueur est à moins de 80 unités du côté intérieur d'une fenêtre de son étage ; 1,8 s par planche au niveau 0 ; bloquée tant qu'un zombie occupe un emplacement de cette fenêtre ou escalade. Aucun coût.
- **Tomber à terre** (lot 3, fait) : quand la vie tombe à 0 et qu'il reste une chute (1 de base), le joueur tombe 5 s : invulnérable, immobile, sans tir ; les zombies proches du même étage sont repoussés (rayon 220, 160 à la chute et 200 au relevage) ; il se relève à 50 % de sa vie maximale avec 2 s de protection. Sans chute : fin de partie.
- **Argent** (lot 4) : gagné **à chaque zombie tué par une balle** (valeur par type, `bounty` dans `enemies.json`, multipliée par `1 + 0,04 × (manche − 1)`, plafonnée à ×3), **à la fin de chaque manche** (bonus de `10 + 2 × manche`, ×1,5 pour une manche renforcée) et **à la fin du monde** (500) ; valeurs proposées (marcheur 5, petit 6, voute 8, grand 12), provisoires, dans `data/game/economy.json`. Les zombies tués par un hook de test ne rapportent rien. Plafond de solde : 9 999 999. `scripts/economie.mjs` imprime les gains manche par manche pour fixer les prix du lot 5.
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
  `chutes` et `reparation` sont dans la section `extra` de `player-stats.json`. **Dès le lot 4, les niveaux viennent de la sauvegarde** ; `?lvl=degats:3,precision:5` ou `?lvl=all:5` les remplace pour la session (mode essai). Ils s'achèteront dans la boutique (lot 5).
- Armes (`data/weapons.json`) : une arme de départ (pistolet), d'autres achetables ; chaque arme définit dégâts, cadence, portée, vitesse de balle, tolérance de visée.
- Tourelles (lot 9), skins de personnage et d'armes (lot 11), mondes supplémentaires (lot 10).
- Sang et particules (lot 8), avec une option « réduire le sang ».
- **Ambiance** (lot 2c, fait et jugée bonne par le propriétaire) : une animation centrale « VAGUE N » démarre 3 s avant l'apparition des zombies et culmine avec elle, sur une mélodie angoissante synthétisée ; « Vague N terminée » avec un son plus doux ; vague renforcée : sous-titre et mélodie plus grave. Effet VHS en surcouche HTML/CSS, activé par défaut, basculable dans la pause, coupé sous `prefers-reduced-motion` et par `?vhs=0`. Aucun clignotement de plus de 3 par seconde.
- Les valeurs d'équilibrage sont provisoires ; elles seront jugées sur la carte définitive avec ses étages et réglées au lot 12. Repères : au lot 2b, sans amélioration, un joueur ne survit pas à la vague 10 ; au lot 3e, joueur immobile au centre du rez-de-chaussée à la manche 21 : première fenêtre ouverte à 13 s, première descente d'un zombie de l'étage à 25 s, mort à 28 s.

## Personnages et rendu
- Personnages articulés en 3D, vus du dessus : bassin, tronc, tête, deux bras (épaule et coude), deux jambes (hanche et genou), arme tenue en main. 12 pièces et 700 triangles au plus chacun, géométries et matériaux partagés. Le joueur tourne le tronc vers la visée, les jambes suivent le déplacement, léger recul au tir.
- Zombies : quatre variantes visuelles (`marcheur`, `petit`, `grand`, `voute`), sans sang avant le lot 8. Quatre allures, dessinées par des poses distinctes : marche lente, marche, rampe (corps abaissé, torse presque horizontal), course. Les rampants plaisent : on les garde. Poses supplémentaires, purement visuelles : `arracher`, `escalade`, et le joueur `terre`. Les angles des articulations viennent d'une fonction pure (`pose.js`, testée) ; le rendu ne fait que les appliquer.
- **Fenêtres et planches** (lots 3 et 3a, faits) : texture `planche` dédiée de 128 px, nettement distincte du bois des meubles ; poutres de 6 de haut, pivot au bas, inclinaison de 3 à 5° ; cadre de fenêtre et trou sombre dans le mur ; **quatre carrés sur le dessus du mur, devant la fenêtre** : plein = planche présente, vide = absente, le carré de la planche en cours de réparation se remplit par seizièmes (lecture par la forme et la luminosité, jamais par la couleur seule) ; les planches arrachées restent en débris à plat jusqu'à la réparation (4 par fenêtre au plus). Un maillage par fenêtre, dessiné seulement si la fenêtre est à l'écran.
- **Ambiance visuelle** (lot 3b) : intérieur en béton gris froid, extérieur de nuit ; brume (`scene.fog`, jeton `--game-fog`) et **mur de brouillard** (`js/core/fog.js`) : les zombies surgissent de la brume. Réglages dans `data/game/render.json`.
- **Étages dessinés** (lot 3e) : groupes `exterieur`, `rdc`, `etage` (`userData.floor`) ; la coque du rez-de-chaussée (sol, murs, marches) est toujours dessinée (le sol opaque de l'étage cache ce qui est dessous, sans transparence) ; quand le joueur est à l'étage, le mobilier, les fenêtres et les zombies du rez-de-chaussée restent visibles là où l'étage ne les couvre pas et par les trous des escaliers. Aucune reconstruction de géométrie au changement d'étage.
- Ombres portées (carte de 1024, la lumière suit la caméra) ; seules cinq pièces principales des personnages, les meubles, les piliers et les voitures en projettent.
- **Budget de dessin** : **limites en vigueur : 30 000 triangles et 300 appels** (décision du propriétaire au lot 3e ; elles étaient de 15 000 et 300). Mesuré au lot 3e avec 10 zombies, planches, ombres, cône : rez-de-chaussée 195 à 197 appels et environ 14 400 à 14 500 triangles (R4 : +2 appels et +140 triangles par rapport à `main`, à cause des marches) ; étage U1 200 appels et 14 496 triangles, U4 203 et 14 622. **La fluidité sur téléphone n'a jamais été mesurée** (les triangles de `renderer.info` sont indépendants du matériel, pas les images par seconde). Le lot 3d (tuiles éliminées hors champ, ombres simplifiées) est reporté. Les surcouches HTML/CSS (annonce, effet VHS, HUD) et le lot 4 n'ajoutent aucun triangle. **10 zombies simultanés au plus.**
- Le décor est créé une seule fois (maillages fusionnés ou instances), jamais par image.
- Paramètres de diagnostic dans l'URL : `?fps=1`, `?dpr=1`, `?shadows=0`, `?tilt=`, `?zoom=`, `?wave=N` (démarre à la manche N ; ouvre les portes dont `openAfterWave < N`), `?floor=N` (0 ou 1, si l'escalier est ouvert), `?endless=1`, `?lvl=` (niveaux des statistiques), `?vhs=0|1`, `?planks=N`, `?map=salle`, `?labels=1`, `?money=N` (solde de la session, lot 4), `?store=local` (avec `?test=1`, lot 4). **Les paramètres qui changent l'état du jeu mettent la sauvegarde en lecture seule (mode essai)** : `wave`, `lvl`, `planks`, `map`, `empty`, `nospawn`, `endless`, `floor`, `money`.

## Contenus
| Contenu | Fournisseur | Statut |
|---|---|---|
| Textures, matériaux, modèles | Générés en code (fonctions pures déterministes, atlas de 512 et 256) ; texture `planche` de 128 px ; texture `garde-corps` (10 textures sur 14) | Faits, à enrichir par monde |
| Sons | Plus de 50 tampons synthétisés en code (6,58 Mo, limite 8) : tirs en couches, impacts par matière, pas, voix de zombies par formants, ambiance, trois sons d'annonce de vague, quatre sons de fenêtre et de chute ; page d'écoute `sons.html`. Les sons de l'autre étage sont étouffés (×0,5, passe-bas à 700 Hz). **Aucun nouveau son avant le lot 5** | Faits ; réglables par identifiant de son |
| Textes en français | Claude, validés par le propriétaire | Réels |
| Textes en anglais | Reportés | Voir décisions en attente |
| Économie | `data/game/economy.json`, `enemies.json` (`bounty`) | Provisoire, lot 4 |
| Équilibrage | `data/game/*.json` | À régler en test |
| Mentions légales, vie privée | Claude, relues par le propriétaire | Au lot 7, provisoires jusqu'au lot 13 ; elles devront mentionner le stockage local de la sauvegarde |

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
- Les couleurs du jeu sont des variables `--game-*` dans `tokens.css`, lues par `js/game/palette.js` ; aucune couleur en dur dans le JavaScript. `tokens.css` fait foi pour les valeurs.
- Tout état (vie, fenêtre, solde, chute, porte, étage, sauvegarde) est porté aussi par une forme ou un texte, jamais par la couleur seule.
- Lisibilité : contraste d'au moins 3:1 entre les personnages et le sol, 4,5:1 pour le laser et la balle ; planches : au moins 2,5:1 contre le mur, 3:1 contre le sol, 1,8:1 contre le bois des meubles ; porte : au moins 1,5:1 en luminance contre le mur voisin.
- **Interface de jeu** : texte de 14 px au moins, contraste de 4,5:1 calculé sur le pire fond ; **E2-2 est un seul rectangle noir** (environ 64 px de haut à 667×375, 300 px de large au plus, 96 de haut au plus) contenant la barre de vie avec ses chiffres dedans, les puces « Vague N », restants et tués, les chutes (une silhouette avec un petit « + » par chute restante, plus le nombre), la puce « RDC » ou « Étage » et, au lot 4, l'argent (icône de pièce en SVG et nombre). **Aucune ligne « Fenêtres » dans le HUD** et **aucune flèche de bord** : l'état des fenêtres se lit sur les carrés du mur ; `?labels=1` affiche les étiquettes pour les essais. Pas de chevauchement avec Pause, les sticks ni E2-10 ; icônes en SVG en ligne écrit dans le code ; aucun `filter`, `mix-blend-mode` ni `backdrop-filter` sur le HUD.
- Cibles tactiles de 44 px, contraste de 4,5:1 pour le texte (le rouge sang n'est utilisé que pour de grands textes, 3:1), `prefers-reduced-motion` respecté.
- Tailles de test : 375, 768 et 1440 px, plus 667×375 (téléphone en paysage) et 2560×1080 pour le jeu.

## Stack et hébergement
- HTML, CSS à variables, JavaScript en modules. **Three.js 0.186.1** (MIT) est la bibliothèque de rendu : paquet npm en `devDependency` à version exacte, fichiers copiés par `npm run vendor:three` vers `vendor/three/` (jamais édités à la main), chargés par `importmap` locale placée **avant** tout `modulepreload` (sinon Firefox l'ignore). `dependencies` reste vide.
- Outils de développement : ESLint (configuration plate), Vitest, Playwright avec axe, Lighthouse. **Vitest et Playwright se lancent l'un après l'autre, jamais en parallèle.** Tests qui ont été intermittents sous charge (à relever au départ de chaque lot) : `axe` à 1440×900, `core-monde-ia`, durée de rendu des sons, rendu des sons d'annonce, trois tests `jeu-voix`, un test de pose des zombies.
- Arborescence de code : `js/core/` (logique pure du jeu : aucun Three.js, Web Audio, DOM, réseau, **stockage** ni horloge ; temps passé en argument ; pas de `Math.random`, générateur à graine), `js/game/` (rendu, sons, entrées), `js/save/` (sauvegarde : seul endroit qui touche `localStorage`), `data/` (textes et chiffres).
- Le monde est dans le plan (x, y) pour la logique ; dans Three.js, (x, 0, y) ; le haut de l'écran est le nord ; la caméra est au sud du joueur.
- Cartes : `data/game/maps/<id>/`. La carte par défaut est `rez-de-chaussee` : `plan.json`, `etage.json` et `zones.json` sont les sources ; `world.json`, `decor.json` et `etage.world.json` en sont dérivés par `npm run carte` (qui échoue si une règle casse) et ne s'éditent jamais à la main. Corriger la carte = changer un chiffre dans une source, relancer `npm run carte`, vérifier avec `scripts/zones-metriques.mjs` (`--etages`) et `carte.html` (boutons « Rez-de-chaussée » et « Étage »). Les fichiers `data/game/world.json` et `decor.json` d'origine (ancienne salle) ne changent pas.
- `carte.html`, `sons.html` : pages techniques, à retirer au lot 13. `sauvegarde.html` (lot 4) : page technique d'export, d'import et d'effacement, reprise par E5-4 au lot 7.
- GitHub Pages, chemins relatifs, aucune ressource externe. Déploiement depuis `main` seulement ; aperçus par branche (`apercu.txt`) à `/lots/lot-N/` ; page `/lots/` et menu `/dev/` générés automatiquement, avec un journal des versions (`data/changelog.json`) : chaque lot ajoute son entrée et adapte les tests `data-changelog` et `dev.spec`. Une branche de lot n'est jamais supprimée. La branche `lot-0t` n'est pas fusionnée et reste en ligne.
- Workflow : `verify` avec délai de 30 min, Playwright rejoué une fois en cas d'échec (modifié au lot 1d) ; un lot ne le modifie que si son prompt l'autorise. Le push des tags est refusé par GitHub : les tags restent locaux. Si la session d'agent impose une autre branche que `lot-N`, démarre en HEAD détaché ou a une branche locale `main` en retard, l'agent crée et suit la branche du lot depuis `origin/main` et le signale.
- `jeu.html` : balises `apple-mobile-web-app-capable` et `theme-color` (lot 3a ; pas de manifeste ni de service worker).
- **Sauvegarde (lot 4)** :
  - Interface `SaveRepository` ; adaptateurs : `localStorage` (clé unique **`zs.save.v1`**), mémoire (par défaut avec `?test=1`) et lecture seule (mode essai). Schéma versionné (v1) avec migrations, somme de contrôle CRC32, **export et import par code** (`ZS1.<base64url>.<crc32>`).
  - Contenu conservé : solde, total gagné, niveaux des neuf statistiques, records (meilleure manche, meilleur nombre de kills, parties, mondes terminés), numéro de révision, date de dernière écriture. **Jamais conservé** : position, étage, manche en cours, identité, adresse IP, paramètres d'URL de test, réglages (lot 7). Aucun cookie, aucun `sessionStorage`, aucun IndexedDB.
  - Écriture par différences (plusieurs onglets additionnent leurs gains), regroupée toutes les 2 s plus écriture immédiate à la fin d'une manche, à la mort, à l'ouverture de la pause et quand l'onglet se cache. Une sauvegarde illisible ou d'une version plus récente verrouille l'écriture (jamais écrasée en silence). Stockage indisponible : le jeu continue en mémoire et le dit.
  - **Safari efface tout le stockage d'un site après sept jours d'usage de Safari sans interaction avec lui (règle de WebKit, vérifiée) ; WebKit dit ne pas attendre cet effacement pour les applications ajoutées à l'écran d'accueil.** D'où l'export. L'icône de l'écran d'accueil et Safari peuvent avoir des sauvegardes séparées (de mémoire, non vérifié).
  - Une sauvegarde locale peut être modifiée à la main : la somme de contrôle détecte les erreurs de copie, pas la triche ; il n'y a aucun classement.
- Langue : français seul pour l'instant ; la structure `data/i18n/` permet d'ajouter l'anglais. `noindex` pendant le développement.
- Tests : `?test=1` expose `window.__zs` (état du jeu, graine, apparition d'un zombie, avance de la simulation, rendu, audio, vagues, statistiques, annonce, effet VHS, fenêtres, débris, HUD, chutes, carte, zones, étage, sauvegarde et économie ; hooks `skipWave`, `setDoor`, `setFloor`, `useStair`, `flushSave`, `giveMoney`) ; `?empty=1` charge un monde sans meubles ni décor solide, et sans siège aux fenêtres ; `?seed=` et `?nospawn=1`. Avec `?test=1`, la sauvegarde est en mémoire ; `?test=1&store=local` utilise le vrai `localStorage`.
- Seuils Lighthouse mobile : `index.html` 90 / 95 / 95 et CLS ≤ 0,1 ; `jeu.html` performance 45 (**mesuré 49 à 51 au lot 3e, après avoir calculé les champs de flux des fenêtres au premier accès**), accessibilité 95, bonnes pratiques 95, CLS ≤ 0,1. Si un lot fait passer `jeu.html` sous 45, l'agent applique dans l'ordre : grain immobile, retrait de la bande de suivi, effet VHS coupé par défaut, réduction du décor extérieur ; il ne modifie jamais le seuil et le signale en tête du bilan.
- `CLAUDE.md` reste sous 9 000 caractères en pratique **8 400** (8 391 au lot 3e) : chaque lot consolide d'abord à 8 000 au plus, puis finit à 8 400 au plus.

## Hors périmètre (pour l'instant)
Multijoueur, comptes, classements en ligne, publicité, achats réels, base de données, balles perforantes ou ricochets, munitions et rechargement, images, sons ou modèles 3D importés (tout est généré en code), anglais, caméra libre ou rotative, cartes de relief et post-traitement 3D (l'effet VHS est une surcouche HTML/CSS), zombies spéciaux (explosifs, tireurs, chiens), boss, choix d'amélioration en cours de partie, vitres qui se brisent, planches qui volent, troisième étage, sous-sol, ascenseur, vrai fondu enchaîné entre étages, indicateur d'écran pour les fenêtres de l'autre étage, flèches de bord, mobilier qui se resserre par niveau, achat des améliorations (lot 5), synchronisation en ligne de la sauvegarde. **Aucun nouveau son avant le lot 5.**

## Décisions en attente
- Prix des améliorations (lot 5) : à fixer d'après `scripts/economie.mjs` ; valeurs de gain du lot 4 provisoires.
- Plafond de 10 zombies simultanés : relever ou non, selon la fluidité mesurée sur téléphone.
- Mesurer la fluidité sur téléphone : si elle est mauvaise, le lot 3d (tuiles, ombres simplifiées) devient prioritaire.
- Consolidation du code du lot 3e (lot 3f) et corrections ouvertes : murs et piliers du rez-de-chaussée à fermer jusqu'au sol de l'étage, suivi des zombies autour des obstacles, allers-retours dans l'escalier. Recommandée avant le lot 8.
- Fidélité du mobilier : P1 à P13 (rez-de-chaussée) et Q1 à Q6 (étage) sont provisoires ; correction par identifiant de pièce.
- Mention du stockage local dans les mentions légales (lots 7 et 13).
- Emplacement du lien vers la sauvegarde (aujourd'hui seulement E2-7 ; menu au lot 7).
- Chutes non rendues à l'ouverture d'une porte (proposé) ou rendues.
- À terre : invulnérable pendant la chute (proposé) ou attaquable ; chutes de départ : 1 (proposé).
- Portée de tir de base 700 (au lieu de 1600) : à valider après test.
- Effet VHS : toujours (proposé), réservé au thème horreur (lot 10), ou coupé par défaut si Lighthouse l'exige.
- Fenêtre F9 non ajoutée ; nom du monde à choisir.
- Choix d'amélioration en cours de partie à la manière d'Archero : oui ou non (non pour l'instant).
- Anglais : abandonné ou reporté après la mise en ligne en français.
- Monétisation (le jeu reste gratuit et public).
- Date de mise en ligne officielle et passage en indexation.
- Base de données en ligne : si, quand et quel service (coûts : comptes, RGPD, clé visible dans le navigateur).
- Seuil de performance Lighthouse de `jeu.html` (45 proposé, mesuré 49 à 51).

## Risques connus
**Fluidité de la 3D sur téléphone jamais mesurée, avec une limite de triangles doublée (30 000)** ; **sauvegarde locale effaçable par Safari après 7 jours sans interaction** (règle vérifiée) et modifiable à la main ; sauvegarde illisible ou saturée (verrouillée, signalée) ; code du lot 3e très modifié (14 mises à jour, anciennes sections abandonnées) : code mort ou tests périmés possibles, consolidation reportée ; **`CLAUDE.md` à la limite** ; suivi des zombies autour des obstacles imparfait ; allers-retours de zombies dans les escaliers ; murs du rez-de-chaussée à 60 de haut sous un sol d'étage à 180 (visible dans le trou des escaliers) ; modèle SketchUp non versionné (mobilier de l'étage provisoire) ; risque de droits sur une disposition reproduite de près (nom, textures, objets et sons restent originaux) ; manches 1 à 9 dans une seule salle avec 5 fenêtres, plus dur qu'avec la carte entière, non jugé ; goulot de 85 à la porte 1 ; couloirs de 50 à la limite de la grille de chemin ; équilibrage de la difficulté et de l'économie (vie, vitesse, nombre, argent gagné sans usage avant le lot 5) ; durée d'un monde de 40 manches non prévisible ; cône de tir et tir automatique (au niveau 0, environ 16 % des balles touchent un zombie en déplacement à 700 unités) ; IA aux fenêtres ; coût du champ de flux sur téléphone (non mesuré) ; marge Lighthouse de 4 à 6 points ; lisibilité de l'interface à 375 px de haut et de l'îlot dynamique ; clignotement et photosensibilité (animation de vague, effet VHS) ; sons non écoutés par l'agent ; esthétique non jugée par l'agent ; poids de Three.js au chargement ; netteté sur écrans haute densité ; sticks multi-touch ; précision des impacts de balles rapides ; sang et public mineur ; commutateur silencieux des iPhone ; l'API de Three.js évolue (toujours lire le paquet installé).

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
| 2b | Cône de tir, imprécision en déplacement, statistiques du joueur (niveaux 0 à 10), régénération par kill | fait |
| 2c | Animation centrale de changement de vague avec mélodie angoissante, effet VHS | fait |
| 3 | Fenêtres à planches, siège par les zombies, réparation automatique, chutes, quatre sons | fait |
| 3a | Planches lisibles, carrés sur le mur, débris, HUD en un seul rectangle | fait |
| 3b | Première carte d'après le modèle 3D (8 fenêtres de 72), `carte.html`, textes de nuit, brume et mur de brouillard | fait |
| 3c | Zones et portes : porte 1 à la fin de la manche 10, 40 manches, fin de monde provisoire, mobilier provisoire | fait |
| 3d | Coût de dessin : tuiles éliminées hors champ, ombres simplifiées, faces invisibles | **reporté** (à lancer si la fluidité sur téléphone l'exige) |
| 3e | Étage physique au-dessus du rez-de-chaussée, escaliers marchables sans fondu, zombies sur deux étages, portes 2 et 3 (manches 20 et 30), limite portée à 30 000 triangles | fait |
| 3f | Consolidation du lot 3e : audit, code mort, tests et documentation remis d'accord, puis corrections ciblées (murs du rez-de-chaussée, allers-retours dans l'escalier, suivi autour des obstacles) | recommandé, non lancé |
| 4 | Argent (gains par kill, par manche, fin de monde), sauvegarde locale versionnée (`SaveRepository`), export et import par code, page `sauvegarde.html`, mode essai en lecture seule | à lancer |
| 5 | Boutique et améliorations (E3) | à écrire |
| 6 | Armes | à écrire |
| 7 | Menu avec choix du monde (E1), fin de partie (E4), réglages (E5, dont la sauvegarde), légal (E6) | à écrire |
| 8 | Sang, particules, option « réduire le sang » | à écrire |
| 9 | Tourelles | à écrire |
| 10 | Mondes supplémentaires (autres thèmes) | à écrire |
| 11 | Skins de personnage et d'armes | à écrire |
| 12 | Qualité technique : performance, équilibrage, accessibilité, nettoyage | à écrire |
| 13 | Mise en ligne : SEO, mentions légales finales, indexation, retrait de `sons.html`, `carte.html` | à écrire |

## Idées en attente
Base de données en ligne et sauvegarde dans le cloud, classement, achievements, boss de fin de monde, portes payantes et barrières achetables, choix d'améliorations en cours de partie, mode infini après la manche 40, zombies spéciaux, manches spéciales (comme les chiens de BO3), anglais, plusieurs armes en même temps, son de porte et de pièces, relever le plafond de zombies simultanés, indicateur des fenêtres de l'autre étage, réglages de la mélodie et de l'effet VHS (petit lot 2c2 si besoin).
