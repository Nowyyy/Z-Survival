# Lot 3e — Étage : fondu entre étages, zombies sur deux étages, escaliers et portes 2 et 3

**Le modèle 3D a été lu** (`Sanstitre.zip`, `model.dae`, fourni en cours de session, jamais versionné) : l'étage est relevé dessus (calage sur le rez-de-chaussée : 91 % des pixels du contour). Seules 2 pièces de mobilier (E1, E2) viennent du modèle ; 6 (Q1 à Q6) sont **provisoires**. Esthétique, confort du fondu et difficulté de l'étage : **non jugés par l'agent**.

**Livré** (workflow `pages.yml` inchangé)
- Données : `etage.json`, `etage.world.json` (généré), `zones.json` (floors, stairs, blocks, subtitleKey, portes 2 et 3 actives), `stairs.json`, `Docs/ref/etage.md` ; `plan.json` : seulement l'escalier de l'aile (+ mobilier coupé par son emprise).
- Pur (`js/core/`) : `floors.js`, `stairs.js`, `floor-transition.js`, `stair-zombies.js`, `floor-sim.js`, `floor-rules.js` ; adaptés : `layout`, `zones`, `nav`, `siege`, `spawner`, `wave-director`, `enemy-ai`, `combat`, `ray`, `projectile`, `player-down`, `sound-director`.
- Jeu : `world.js` (groupes exterieur / rdc / etage, `showFloor`, dalle, marques), `game.js`, `floor-fade.js` (`#floor-fade`), HUD (puce « RDC » / « Étage »), hooks `setFloor`, `useStair`, `getState().floor`, `?floor=N`, `?labels=1` par étage ; `carte.html` : boutons « Rez-de-chaussée » / « Étage » (`?floor=`), zones de déclenchement, arrivées, blocs de portes.

**Choix** : étage = aile + poche + moitié ouest de la grande salle (le reste, découvert, n'est pas une salle) ; fenêtres U1 à U7 (72, espacées de 150 ; fenêtre est, planche d'angle et mur sud de la salle de droite : écarts dans `etage.md`) ; escalier physique (voir la mise à jour), 1,0 s de protection après un changement d'étage ; escalier 1,5 s, 2 par escalier ; sons de l'autre étage ×0,5 et 700 Hz ; **levier de budget : champs de flux des fenêtres calculés au premier accès** (Lighthouse). Cages d'escalier de l'étage dessinées en blocs de 70 (provisoire).

**Critères (chiffres)**
- Départ `main` : Vitest 3 046, Playwright 801 (+ 151 ignorés). Fin : Vitest 3 329 (+283) ; Playwright 961 réussis, 151 ignorés, 0 échec (+160 ; `etage.spec.js` 42 tests, `etage-salle.spec.js` 22, `carte.spec.js` +8).
- `zones-metriques` : rdc `depart` 977 900 / libre 83,9 %, couloir 50 ; `aile` 81,3 %, 53 ; étage `etage-gauche` 709 660 / 91,2 % ; `etage-droite` 429 920 / 73,3 %. Après porte 3 : 14 points d'étage, entrées 7/7 reliées, 0 zombie bloqué sur 14.
- Budget (`main` → lot) : R1 195 / 14 392 → 195 / 13 148 (4 meubles retirés par l'emprise de l'escalier) ; R2 192 / 14 988 → 194 / 14 988 ; R3 195 / 14 392 → 195 / 13 148 ; **R4 195 / 14 360 → 197 / 14 380 (+2 appels, +20 triangles : au-dessus de la limite +12, voir Points ouverts)** ; étage : U1 198 / 13 878, U2 199 / 13 888, U4 (seconde salle) 201 / 14 004 (limites 300 / 15 000). Aucune fuite après 10 allers-retours.
- Construction : étage 47,7 ms (« Étage : X ms », WebGL logiciel, non représentatif) ; recalcul du champ du joueur 0,5 ms (navigateur), 0,5 ms au plus (Node, seuil 8) ; synchronisation de la porte 3 : 4 ms ; `createFloorWorld` 53 ms en Node avant le levier.
- Lighthouse `jeu.html` : avant le levier 41 à 45 (`main` 44 à 58, moyenne 48) ; après : 49 à 51 avec VHS et avec `&vhs=0` (seuil 45) ; accessibilité 100, bonnes pratiques 100, CLS 0,002.
- Simulations (joueur immobile au centre du rez-de-chaussée, WebGL logiciel) : `?wave=21` : F2 13,1 s, U2 14,3 s, F6 14,7 s, U1 19,8 s, première descente d'un zombie 24,8 s, 1 chute consommée, mort à 27,7 s (à l'étage : 30,7 s) ; `?wave=31` : U2 13,7 s, U5 (seconde salle) 14,8 s, première descente 17,9 s, mort à 30 s. 120 s avec changement d'étage toutes les 20 s et éclaircissement : jamais plus de 10 zombies, aucun zombie immobile plus de 2 s.
- `CLAUDE.md` : 8 407 → 8 343 caractères (consolidation puis 5 lignes, mises à jour ; limite 8 400).

**Tests adaptés (avant / après)** : `zones`, `zones-directeur` (portes 2 et 3 « planned » dans `zones.json` → variante forcée « avant ») ; `zones-hygiene` (1 puis 3 portes actives) ; `zones-porte-chemin`, `etage-donnees`, `data-changelog` (lot-3c → lot-3e), `data-ambiance` (`#vhs` → `#floor-fade` puis `#vhs`), `lot1-regles` ; e2e : `carte-jeu` (8 → 8 F + 7 U, maillages 8 → 15), `jeu-zones` (2 → 4 zones, maillages de portes, « Prochaine zone » 11 → 21 → 31, planches 32 → 60), `jeu-planches` (193 → 193 + 4 appels), `dev.spec` (Lot 3c → 3e). **Supprimés : aucun.**

**Points ouverts** : R4 dépasse de 8 triangles la limite +12 (deux blocs d'escalier fermés dans le champ ; levier possible : blocs réduits à leurs faces visibles) ; WebGL logiciel : aucune conclusion sur les images par seconde ; l'adresse publiée n'a pas été ouverte depuis la session ; `projectile.js` (+3 lignes, étage de la balle) et `world.json` du rez-de-chaussée (escalier de l'aile) diffèrent de `main`, extensions prévues.

**Choix à valider** : escalier physique (marche libre, pas de fondu) ; zombies de l'autre étage invisibles, sons étouffés (×0,5, 700 Hz) ; 2 zombies à la fois par escalier, 1,5 s ; budget de l'étage ; mobilier de l'étage (6 pièces provisoires) ; aucun indicateur pour les fenêtres de l'autre étage.

**Corriger l'étage** : (1) modifier `etage.json`, `zones.json` ou `plan.json` (escaliers) ; (2) `npm run carte` ; (3) `node scripts/zones-metriques.mjs --etages` ; (4) regarder `carte.html?floor=1` et `jeu.html?labels=1&wave=31&zoom=1&floor=1` ; (5) `npm test`.

**À tester par moi** (téléphone en paysage et ordinateur, `…/lots/lot-3e/jeu.html?fps=1&wave=21`) : monter par l'escalier de l'aile, juger le fondu ; rester en bas, laisser les zombies ouvrir les fenêtres de l'étage : les entends-tu, descendent-ils ? `&wave=21&floor=1` : rester en haut pendant qu'ils montent ; `&wave=30` : porte 3 ; `&wave=31&zoom=1&floor=1&labels=1` : tout l'étage à comparer au modèle 3D. Retours par identifiant (`U2 : trop près du mur`, `escalier de l'aile : zone trop petite`, `fondu : trop long`, `armoire de l'étage : manquante`).

**Fusion (à faire par moi)** : Pull Request `lot-3e` vers `main`, « Create a merge commit », ne pas supprimer la branche ; pages : `/`, `/dev/` (journal), `/lots/lot-3e/jeu.html`, `/lots/lot-3e/carte.html`.

## Mise à jour (retours du propriétaire) : étage au-dessus, escaliers physiques, sol visible dessous
- **Étage au-dessus** : le joueur et la caméra restent à y = 0, le monde descend quand il monte (`world.setElevation`, `render.json` `floorLift` 180) ; jupe sombre sous le sol de l'étage.
- **Escaliers physiques** (plus de téléportation) : `zones.json` `walk` (chemin `[x, y, t]` + largeur) ; en marchant vers l'escalier le joueur entre dans un tube autour du chemin (`js/core/stair-walk.js`, pur, 29 tests) : déplacement libre dans la largeur, rambardes, hauteur = t × `floorLift`, étage logique à mi-hauteur (hystérésis 0,48 / 0,52), sortie par un bout. Marches de béton (8 boîtes) dans le maillage des murs du rez-de-chaussée, trou dans le sol de l'étage avec couvercle tant que l'escalier est fermé. Le fondu ne sert plus qu'au mouvement réduit (échange instantané) ; `useStair` = marche automatique.
- **Sol visible dessous** : la coque du rez-de-chaussée (sol, murs, marches) est toujours dessinée (on la voit sous l'étage, dans la partie découverte et par le trou des escaliers) ; meubles, fenêtres et zombies du rez-de-chaussée ne sont pas dessinés depuis l'étage ; plus de dalle sombre.
- **Budget** (mesuré) : étage U1 200 / 14 496, U4 203 / 14 622 (limites 300 / 15 000) ; rez-de-chaussée R4 197 / 14 500 contre 195 / 14 360 sur `main` (+2 appels, **+140 triangles : la limite de +12 est dépassée**, le coût des marches ; limite absolue tenue).
- **Tests** : `stair-walk.test.js` (29), `etage.spec.js` « escalier physique » (15 tests, dont déplacement libre, demi-tour, passer à côté), `etage-salle.spec.js` adapté ; `lot1-regles` (+ `stair-walk`).
- **À juger à l'œil** : vitesse dans l'escalier (vitesse normale), largeur (24 et 25 px), virage au palier de l'escalier de départ (on tourne vers l'ouest au sommet), hauteur de 180 (`floorLift`). Points ouverts : la partie nord de la rampe de l'escalier de départ traverse du décor du rez-de-chaussée (non vérifié) ; le reste de la cage de l'escalier de départ à l'étage garde des collisions invisibles.

## Mise à jour 2 (retours du propriétaire) : zones jaunes retirées, escalier de départ arrondi, mur invisible, zombies
- **Zones jaunes** au sol retirées (les zones de déclenchement existent toujours, invisibles).
- **Escalier de départ arrondi** : quart de tour de 90° au lieu d'une rampe droite suivie d'un coude ; il part du même pied et finit à l'ouest, vers la zone de l'étage ; marches orientées le long de la courbe, trou courbe dans le sol de l'étage. Largeur 16 px (le tube de marche laisse 22 unités de jeu latéral).
- **Mur invisible** : l'ancienne cage de l'étage (246, 230 → 289, 303) était bien plus grande que la rampe ; elle est ramenée à l'emprise de la rampe, la même aux deux étages (255, 243 → 288, 270) ; le pilier voisin (242, 253) et la pièce P8 sont déplacés. Test : on atteint à pied trois points autour de la cage.
- **Zombies** : pendant que le joueur est dans l'escalier, sa position est dans une emprise pleine (donc sans chemin) : les zombies de son étage n'avaient plus de cible et restaient immobiles. Ils visent maintenant le bout de l'escalier de son étage logique (le pied au rez-de-chaussée, le palier à l'étage), puis le joueur dès qu'il en sort.
- **Tests** : 3 tests e2e (`escalier de départ arrondi`, mur invisible, zombies), tests de données adaptés (`plan.json` : l'emprise de l'escalier courbe est redessinée), `stair-walk.test.js` (courbe).

## Mise à jour 3 (retours du propriétaire) : trou autour de l'escalier, zombies du rez-de-chaussée visibles d'en haut
- **Trou** : à l'étage, le coin autour de l'escalier de départ (derrière la rampe, à côté, en dessous, jusqu'aux murs : 250, 230 → 290, 290) est un trou dans le sol et un obstacle (la même zone) : on ne peut plus passer derrière l'escalier et on y voit le rez-de-chaussée. Parois sombres sur les quatre côtés ; le trou de l'escalier de l'aile reste celui de sa rampe. Le pilier voisin est déplacé.
- **Zombies** : depuis l'étage, les zombies du rez-de-chaussée sont dessinés (floorLift plus bas), visibles par le trou et dans la partie découverte ; ceux de l'étage ne le sont toujours pas depuis le rez-de-chaussée. Aucun changement de logique (tir, contact, siège restent par étage).
- **Tests** : 2 tests e2e (trou et zombies) ; test du mur invisible adapté.

## Mise à jour 4 (retours du propriétaire) : rien ne disparaît, haut de l'escalier, garde-corps
- **Rien ne disparaît** : depuis l'étage, le mobilier, les fenêtres, les planches et les portes du rez-de-chaussée restent dessinés quand ils ne sont pas sous le sol de l'étage (groupe `rdcExposed`, toujours visible) ; seul ce qui est couvert par l'étage (groupe `rdc`) est caché.
- **Haut de l'escalier** : la dernière marche est prolongée de 26 unités vers le sol de l'étage et affleure (0,2 sous le sol) : plus de vide entre le sol et la rampe.
- **Garde-corps** : nouvelle texture générée `garde-corps` (genre `railing`, `textures.json`, 10 textures sur 14), barrière de 36 de haut autour du trou de chaque escalier de l'étage, sauf à l'entrée de l'escalier (largeur de la rampe + 8 de chaque côté, là où le chemin franchit le bord). Un seul maillage, deux grandes faces par barre (12 triangles de moins par barre que `tout`).
- **Budget** : étage U4 (10 zombies, ombres) ≤ 15 000 triangles / 300 appels (mesuré par le test). Tests : e2e adaptés (mobilier exposé, garde-corps), délai Vitest 30 s (simulations lourdes lentes en CI).


## Mise à jour 5 (retours du propriétaire) : sol visible au pied de l'escalier de l'aile, zombies dans les escaliers
- **Trou de l'aile** : le trou du sol de l'étage (et l'obstacle de l'étage) commence 8 px plus au nord (254 → 246 en px du plan, `zones.json` et `etage.json`, `npm run carte` rejoué) : il couvre le pied de la rampe, donc le sol du rez-de-chaussée et les zombies qui y attendent se voient d'en haut. Limite : 246, car en dessous un point de réparation (U1) serait à moins de 80 du trou (test de `etage-donnees`).
- **Zombies bloqués** : non reproduit. Simulations à la manche 31 (joueur au rez-de-chaussée ou à l'étage, deux escaliers, zombies sous le palier ou au pied) : tous montent et descendent. Un nouveau test e2e couvre le cas de l'aile (deux zombies du rez-de-chaussée montent, un zombie de l'étage descend). À revérifier en jouant.

## Mise à jour 6 (retours du propriétaire) : le gris sous les escaliers, zombies qui suivent dans l'escalier
- **Gris sous les escaliers** : c'étaient les parois pleines de la « jupe » autour des trous (180 de haut, `--game-void`). Elles sont supprimées (aucune paroi autour des trous) : on voit le carrelage, les murs et les zombies du rez-de-chaussée par le trou. La jupe sous le reste du sol de l'étage ne change pas.
- **Zombies pendant la marche** : la première tentative (suivre dans l'escalier) a été retirée : elle bloquait les zombies qui montent normalement (deux restaient figés dans l'escalier, les autres attendaient). Il reste les 2 zombies à la fois par escalier ; mesuré : une meute de 6 au pied de l'escalier monte en quelques secondes, par paires.
- **Objets qui apparaissent** : un meuble ou une porte du rez-de-chaussée qui touche un trou est dessiné en entier dans le groupe toujours visible (`touchesHole`), plus de caisse qui apparaît à moitié.

## Mise à jour 7 (retours du propriétaire) : zombies arrêtés avant l'escalier, objet qui disparaît, mur invisible
- **Zombies arrêtés avant l'escalier** : quand le joueur marche dans un escalier, ses zombies (même étage logique) arrivent au bout de l'escalier et ne pouvaient plus avancer (l'emprise est un obstacle). Ils prennent maintenant l'escalier du joueur à leur tour (`follow` dans `stepStairZombies`, mode escalier habituel, 2 à la fois) et arrivent de l'autre côté, où le joueur sortira. Limite connue : ils peuvent faire des allers-retours tant que le joueur reste dans l'escalier. Test unitaire ajouté.
- **Objet qui disparaît en montant** : un meuble du rez-de-chaussée dont deux coins au moins dépassent du sol de l'étage (`partlyUncovered`) reste dessiné en entier. Un objet entièrement sous le sol de l'étage reste caché (le sol est opaque).
- **Mur invisible** : à la sortie d'un escalier, le joueur est dans la zone de déclenchement et le verrou « sortir de la zone avant de la reprendre » l'empêchait de remonter. Plus de verrou à la sortie d'un escalier marché (délai de 0,8 s seulement) ; l'escalier est repris en y marchant. Test e2e ajouté.
- **Budget** : garde-corps à une seule face par barre (matière à deux faces), pour tenir 15 000 triangles.

## Mise à jour 8 (demande du propriétaire) : limite à 30 000 triangles, rien ne disparaît
- **Limite** : 30 000 triangles (300 appels inchangés) ; tests, `conventions.md` et `CLAUDE.md` mis à jour. Le garde-corps garde une seule face (économie sans objet visible).
- **Rez-de-chaussée** : tout le groupe `rdc` reste dessiné à l'étage (plus de masquage au changement d'étage logique) ; seul le sol opaque de l'étage cache ce qui est dessous, sans transparence.

## Mise à jour 9 (retours du propriétaire) : zombies visibles dans les escaliers
- **Zombies dans l'escalier** : pendant le mode escalier (1,5 s), le zombie monte ou descend la rampe en suivant `walk.path` et la hauteur de l'escalier, face à son sens de marche, au lieu de rester figé à l'entrée puis d'apparaître de l'autre côté. Depuis l'étage on le voit sur toute la rampe ; depuis le rez-de-chaussée, sur sa moitié basse.

## À faire (demandé par le propriétaire, non fait)
- **Fermer les murs et les piliers** du rez-de-chaussée jusqu'au plafond matérialisé par le sol du deuxième étage : ils s'arrêtent aujourd'hui à 60 de haut (hauteur des murs) alors que le sol de l'étage est à `floorLift` (180). À traiter : prolonger les murs et les piliers du rez-de-chaussée jusqu'à `floorLift` sous l'emprise de l'étage, en restant dans le budget (30 000 triangles, 300 appels) ; les fenêtres et les portes gardent leurs ouvertures.

## Mise à jour 10 (demande du propriétaire) : le zombie est libre dans l'escalier
- **Marche libre** : en mode escalier, `stepStairZombies` fait marcher le zombie avec `stepWalk` (comme le joueur : tube autour de `walk.path`, hauteur selon sa position, étage logique à mi-hauteur, sortie par un bout). Il va droit sur le joueur si celui-ci marche dans le même escalier, sinon vers le bout qui donne sur l'étage du joueur, puis sort et le poursuit. `stairTime` et le délai d'arrivée ne servent plus.
- **Combat** : le laser, les balles et le contact comptent les zombies en mode escalier (à leur étage logique). L'emprise des escaliers ne bloque plus les balles ni le laser (elle bloque toujours les déplacements) ; le joueur peut tirer en marchant dans l'escalier.
- **Dessin** : le zombie est dessiné à sa vraie position et à sa hauteur sur la rampe, avec son allure de marche.
- **Tests** : tests unitaires réécrits (marche, sortie, 2 à la fois, joueur dans l'escalier), un test e2e (touché depuis l'extérieur, se déplace sur la rampe).

## Mise à jour 11 (retours du propriétaire) : un seul zombie à la fois, laser qui ne suit pas
- **Zombies** : au plus 4 zombies à la fois par escalier (au lieu de 2) et portée de départ 60 (au lieu de 40) : avec la marche libre, le plafond ne sert plus qu'à l'entrée, et une meute entre maintenant à plusieurs. `stairs.json`, `STAIR_DEFAULTS`, `CLAUDE.md`, `conventions.md` et les tests mis à jour.
- **Laser** : le laser, les balles et les étincelles étaient dans le groupe des zombies (décalé de `floorLift` et de l'élévation) : ils restaient en bas ou en haut quand le joueur montait. Ils ont leur propre groupe (`effectsRoot`), toujours à la hauteur du joueur.

## Mise à jour 12 (retours du propriétaire) : zombies sans limite dans l'escalier, clignotements, portes plus minces
- **Sans limite** : plus de plafond de zombies par escalier (`stairMaxAtOnce` supprimé de `stairs.json` et de `STAIR_DEFAULTS`). Dans l'escalier ils se déplacent comme le joueur (dans la largeur, dans les deux sens) et ne se superposent pas (poussée de 6 au plus par image).
- **Clignotements** : trois causes retirées. Le repoussement des zombies à la sortie de l'escalier du joueur (`knockArrival`, un saut de 80) ne s'applique plus aux marches physiques ; un zombie qui entre dans l'escalier n'est plus téléporté au centre de la zone (le tube se resserre autour de lui) ; un zombie sorti d'un escalier attend 1,5 s avant d'en reprendre un (plus d'allers-retours à l'entrée). La visibilité d'un zombie vient d'une seule fonction (`drawnOf`), identique pour le dessin et pour `getState()`.
- **Portes d'escalier** : un bloc d'escalier est dessiné comme une porte de 24 d'épaisseur au centre de son emprise (la collision garde toute l'emprise).
- Limite connue : le saut mesuré à la chute du joueur (repoussement de la chute, 80 à 160) reste ; ce n'est pas lié aux escaliers.

## Mise à jour 13 (demande du propriétaire) : l'escalier est un sol comme un autre
- **Aucun délai** : `stairCooldownPlayer` passe à 0 (le joueur reprend l'escalier tout de suite, en y marchant) et le délai de 1,5 s des zombies après une sortie est supprimé : ils entrent et sortent des escaliers quand ils veulent. Le verrou de zone reste pour les changements d'étage instantanés (mouvement réduit, hooks), sinon l'arrivée dans la zone les renverrait aussitôt. La protection de 1,0 s après un changement d'étage (`stairGraceAfter`) reste : ce n'est pas un délai de déplacement.

## Mise à jour 14 (retours du propriétaire) : rampants relevés, suivi des zombies
- **Rampants** : dans un escalier, un zombie rampant est relevé de 14 (les autres de 3) : il ne disparaît plus derrière les marches.
- **Suivi (non modifié)** : j'ai essayé deux correctifs dans `enemy-ai.js` (garder le champ de flux 0,4 s après une ligne de vue coupée ; garder le cap 0,6 s contre un demi-tour du champ) et un recalcul plus fréquent du champ. Sur des simulations d'obstacles (mur, deux caisses, joueur en zigzag ou en cercle), aucun ne réduisait les demi-tours ni la distance moyenne au joueur ; le cap tenu l'aggravait. Rien n'a été gardé. Il faut un cas précis (où, quel obstacle, joueur en mouvement ou non) pour corriger.
