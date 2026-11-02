# Lot 4b — Intégration des refontes (V0.5, en cours)

**Rôle** : branche d'intégration `lot-4b`, partie de `main` (`c166e53`, lot 4 : argent et sauvegarde locale) ; les refontes y sont fusionnées avant d'entrer dans `main` (jamais de fusion directe dans `main` depuis un lot). Aperçu : `…/lots/lot-4b/jeu.html` (nom affiché : V0.5). Ce bilan liste toutes les évolutions des lots fusionnés ; les détails restent dans le bilan de chaque lot (`Docs/lots/lot-3*.md`) et dans ses documents de référence.

## Historique des fusions

| Ordre | Commit | Lot fusionné | Contenu | Bilan / manifeste |
|---|---|---|---|---|
| 0 | `29880a0`, `0fc3d7e`, `a8c7e90`, `a177359` | lot 4b | branche d'intégration, nom affiché V0.1 puis V0.5, journal par versions majeures | ce fichier |
| 1 | `7e5e6ed` (+ `af5bba4`) | `lot-3g` | atelier de la carte : visite, relevé du modèle 3D, mobilier, décor, textures, retours du propriétaire | `lot-3g.md`, `Docs/ref/fusion-3g.md` |
| 2 | `3aa8f66` (+ `8e08948`) | `lot-3h` | atelier des sons (page technique ; rien ne change dans le jeu) | `lot-3h.md` |
| 3 | `d84fc65`, `cdacb2b` | `lot-3i` | sons de l'atelier intégrés au jeu | `lot-3i.md`, `Docs/ref/sons-integres.md` |
| 4 | `ca703dd` | `lot-3k` | atelier de l'interface (page technique ; rien ne change dans le jeu) | `lot-3k.md`, `Docs/ref/fusion-3k.md` |
| 5 | `790b8c3`, `a6c36b1`, `a332841` (+ `6d027d9`) | `lot-3l` | interface retenue intégrée au jeu, puis retours du propriétaire | `lot-3l.md`, `Docs/ref/interface-integree.md` |
| 6 | `8419982` | `lot-3j` | atelier des personnages, animations et sang ; « riche » et sang complet par défaut | `lot-3j.md`, `Docs/ref/fusion-3j.md`, `Docs/ref/passation-personnages-4b.md` |
| 7 | `f44367b` (+ `a937f55`), `63aced1` | `lot-3m` | personnages choisis par défaut (table de choix), chargement allégé, entrée du journal | `lot-3m.md`, `Docs/ref/personnages-integres.md` |

Chaque fusion garde la première ligne d'`apercu.txt` de `lot-4b` (`jeu.html`, titre « Intégration des refontes », `nom: V0.5`) : **piège récurrent**, git prend sans conflit l'`apercu.txt` du lot quand `lot-4b` ne l'a pas changé depuis la base commune (3l, 3j, 3m) ; un commit séparé le remet.

## Ce qui change dans le jeu (par rapport à `main`)

### Carte, décor et rendu (lot 3g)
- **Visite libre** sans zombie ni porte : `visite.html` (liens vers `jeu.html?nospawn=1&wave=31`, rez-de-chaussée et étage), aucun code ajouté au jeu.
- **Relevé du modèle 3D** et page des écarts `ecarts.html` (`scripts/modele/`, `js/core/releve.js`, `ecarts.js`, `ecarts-svg.js`) ; corrections par **décisions rejouables** (`ecarts-decisions.json`, `js/core/decisions.js`) puis `npm run carte`.
- **Mobilier** corrigé d'après le modèle (deux étagères ajoutées, deux pièces remplacées, quelques meubles recalés), puis **redessiné** d'après les composants du modèle (`mobilier-aspect.js`, `mobilier.world.json` : 41 pièces, 3 352 triangles ; collisions inchangées).
- **Décor léger non solide** : plinthes, tuyaux, appliques, affiches, tapis, taches, sacs de sable, bidons, grille (`decor-interieur.json`, 8 types, 79 éléments, un maillage par étage).
- **Textures plus fines** (joints irréguliers, éclats, fissures, coulures, taches ; option `fine` de `texgen.js`) ; `?detail=0` montre l'ancien rendu.
- **Retours du propriétaire** (6 passes) : sortie latérale au pied et en haut des escaliers (`sideExit`, joueur seulement) ; escalier courbe dont l'emprise suit l'arc ; fenêtre F7 retirée, grille à sa place ; **murs et piliers jusqu'au plafond** (`ceilingWalls`, `?murs=bas`), aux deux étages ; **vraies portes de planches et éboulis** aux escaliers fermés (`portes-aspect.js`) ; ouvertures grillagées du mur sud ; **mur percé autour du joueur caché** (trame par `discard`, aucun matériau transparent, `?percee=0`) ; pastilles de fenêtres dans la face du mur ; **feux avec fumée** (P9, Q2 à l'étage ; `feux.json`, `fire.js`, jetons `--game-fire*`, `--game-smoke`) ; **extérieur plus vivant** (`decor-vivant.js`) ; **brouillard en volutes** et nappes basses (`mist.js`) ; linteau de béton au-dessus des portes.
- Budgets : décor léger ≤ 1 500 triangles et 6 appels ; mobilier compté deux fois (passe d'ombre) ; plafond du projet alors 30 000 triangles.

### Sons (lots 3h et 3i)
- **Atelier des sons** (`atelier-sons.html`, `atelier-choix.html`, technique) : synthèse 2 (`js/core/synth2*.js`, `audio-analysis.js`, `atelier-check.js`, `scenes-sons.js`), variantes réaliste / horreur / sec, propositions, scènes de 30 s, « Mes choix ». Choix du propriétaire : `data/game/sounds-atelier-choix.txt`, fiche `Docs/ref/sons-a-integrer.md`.
- **Sons intégrés au jeu** (3i) : `sounds-choix.json` → `scripts/sons/integrer.mjs` → `sounds.json` (moteur « atelier », calcul dans `js/game/sound-worker.js`) ; anciennes recettes dans `sounds-legacy.json`.
  - Remplacés : pas du joueur, pas des zombies, voix **par type de zombie** (gémissement, attaque, blessure, mort), planche arrachée, réparation (suit la durée de pose, commence au début de la pose, s'arrête si interrompue).
  - Nouveaux : pas dehors et dans l'escalier, allures des zombies (lent, course), rampe, craquement de planche, escalade, battement de cœur (sous 25 % de vie), vent (fond constant), feu (une voix, feu le plus proche), grincements, gémissements lointains, porte enfoncée.
  - `?sons=choix|ancien|A|B|C` (jamais mémorisé, pas un mode essai ; ancien et atelier par import dynamique).
- **Poids** : limite de 8 Mo levée par le propriétaire ; 69 tampons au chargement (7,06 Mo), 16,7 Mo une fois tout joué ; garde-fou provisoire 64 Mo. Génération au chargement : navigateur ~790 → 1 249 ms.
- Non intégrés : marteau seul, planche qui tombe, achat (boutique au lot 5), chute et relevage du joueur (« actuel »), néon, essoufflement, pièce (« aucun ») ; **toujours absents** : son de chair, chute du corps, coup de marteau animé (voir lot 3m).

### Interface (lots 3k et 3l)
- **Atelier de l'interface** (`atelier-interface.html`, `interface-retenue.html`, technique) : trois directions (A sobre, B caméscope, C tactile) sur le vrai jeu, maquettes à fausses données (menu, boutique, réglages, classement), mesures, « Mes choix ». Choix : HUD, pause, fins et à terre en **B**, sticks en **A**, menu plus tard (`Docs/ref/passation-interface-4b.md`, `interface-a-integrer.md`).
- **Interface intégrée** (3l) : `jeu.html` (HUD en trois colonnes de blocs fixes en em, texte 15,75 px), `css/game-ui.css` (nouvelle feuille, `game.css` allégé), `hud.js` réécrit, `js/core/hud-format.js`, bloc « Interface intégrée (lot 3l) » de `tokens.css`.
  - HUD : REC et temps de jeu, vie (sans barre), chutes, étage, vague, argent, restants, tués ; « DÉBUT 3 s » dans la boîte des restants ; « Mode essai » à gauche.
  - Après les retours sur iPhone : argent à droite sous les tués, « +N » sous le bouton Pause, symbole d'argent après la somme.
  - Pause : solde à côté de « PAUSE », « Quitter » désactivé sous « Recommencer », « Effet VHS » sous « Son ».
  - Fins (mort, monde terminé) : deux colonnes, « Rejouer », « Revenir au menu principal » (sans action jusqu'au lot 7) ; `?fin=monde` (mode essai) montre l'écran de victoire ; état de la sauvegarde seulement s'il pose problème.
  - À terre : au centre sous la vague, barre de compte à rebours ; sticks sobres (A).
  - **Marges** : 16 px des bords, sans la zone de sécurité (Safari ne la donnait pas toujours au chargement).
- Retirés : lien « Voir ma sauvegarde » de l'écran de fin, E2-9 et E2-11. Priorité 2 : rien de retenu.

### Personnages, animations et sang (lots 3j et 3m)
- **Atelier des personnages** (`atelier-personnages.html`, technique ; `?test=1` : `window.__zsPersos`) : variantes A, B, C et « riche » des 5 personnages, macros (taille, carrure, usure, teinte, posture), 6 tenues par zombie, 3 palettes du joueur, 4 paliers d'usure selon la manche, mini-arène, « Mes choix ».
- **Personnages v2** (« os rigides », `js/game/character-v2.js`, `js/core/character-parts.js`, `persos-variants.js`, `texgen-persos.js`) : 3 à 4 appels de dessin par personnage au lieu de 16 à 17, textures générées en code.
- **Animations** (`js/core/pose-v2.js`, styles A, B, C) : marches sans glissement des pieds, course, rampe, attaque au contact, touché à l'impact, **trois morts selon le côté touché** (de face : en arrière), escalier, attente ; fenêtres **enjambées** (`enjamber`, piloté par la progression du passage) ; joueur : repos, marche, tir avec **recul visible**, touché, à terre, relevage, réparation ; **pistolet** plus grand, tenu bras tendus ; laser, éclair et balles dessinés depuis le bout du canon (logique inchangée).
- **Sang** (`js/core/blood.js`, `js/game/blood-fx.js`, `data/game/blood.json`) : trois niveaux (`?sang=0|reduit|1`) ; gerbes à l'impact, taches au sol, taches sur les corps selon la vie, cadavres qui s'enfoncent, sans effet de jeu ; jamais de démembrement.
- **Règle de jeu nouvelle (lot 3j, demande du propriétaire)** : **jamais tirer et réparer à la fois** (viser un zombie interrompt la réparation, la planche garde sa progression) ; pas de laser pendant la réparation.
- **Défaut du jeu (lot 3m)** : table `data/game/persos-choix.json` (provisoire, d'après la passation du 3j) : **« riche » pour le joueur et les quatre zombies**, macros et styles des données, toutes les tenues (joueur : palette `sable`), usure automatique, **sang complet**.
  - `?perso=choix|actuel|A|B|C|riche` : `actuel` montre l'ancien modèle pour comparer ; jamais mémorisé, pas un mode essai.
  - L'ancien modèle (`pose.js`, `character.js`) n'est importé que si un personnage est « actuel ».
  - **2 cadavres à la fois** (au lieu de 6) pour tenir le budget.
  - Atlas du sang et matières de blessure créés au premier usage ; `blood-fx.js` jamais chargé avec `?sang=0`.
- Couleurs : bloc « Personnages et sang (lot 3j) » de `tokens.css` (`--perso-*`, `--sang-*`), contraste ≥ 3:1 sur tous les sols, escalier compris.

### Menu /dev et journal (lot 4b)
- Nom affiché d'un lot : ligne `nom:` de `apercu.txt` (`js/lots.js` : `parseName`, `lotLabel(name, nom)`), recopiée par `scripts/assemble.mjs` dans `lots.json` (champ `nom`) et affichée par `/dev/`. La branche et l'adresse restent `lot-4b`.
- Journal de `/dev/` : seulement les versions majeures, de la plus récente (en haut) à la plus ancienne : V0.5 `lot-4b` (en cours), V0.4 `lot-3e`, V0.3 `lot-2c`, V0.2 `lot-1d`, V0.1 `lot-1`. Liste `versions` de `data/changelog.json` ; les autres lots restent dans `lots` (historique), masqués. Entrées ajoutées à `lots` : `lot-3g`, `lot-3h`, `lot-3j`, `lot-3i`, `lot-3k`, `lot-3l`, `lot-3m`.

## Pages et paramètres ajoutés
- Pages techniques (publiées par `npm run build`, à retirer ou à garder au lot 13) : `visite.html`, `ecarts.html`, `atelier-sons.html`, `atelier-choix.html`, `atelier-interface.html`, `interface-retenue.html`, `atelier-personnages.html` ; `sons.html` liste les sons intégrés.
- Paramètres de `jeu.html` (aucun n'est mémorisé) :
  - `?detail=0` (rendu d'avant le 3g), `?murs=bas`, `?percee=0` ;
  - `?sons=choix|ancien|A|B|C` ;
  - `?fin=monde` (mode essai seulement) ;
  - `?perso=choix|actuel|A|B|C|riche`, `?sang=0|reduit|1`, `?usure=auto|0..3`.

  Seuls les paramètres d'essai existants (`wave`, `lvl`, `map`, `nospawn`, `floor`, `money`…) mettent la sauvegarde en lecture seule.

## Mesures cumulées
- **Rendu** (appels / triangles, 10 zombies, planches, ombres, cône ; `scripts/personnages/mesure-rendu.mjs`) :
  - avant le 3j (décor du 3g) : R1 207/23 422, R2 194/14 988, U1 213/25 112, U4 223/25 874 ;
  - par défaut aujourd'hui : R1 65/37 628, R2 50/29 176, U1 71/39 318, U4 81/40 080 ;
  - pire cas avec le sang (2 cadavres, 48 taches) : jusqu'à U4 85/44 086.
  - **Limites de refonte** relevées par le propriétaire : **45 000 triangles et 400 appels** (avant : 30 000 et 300).
- **Lighthouse mobile `jeu.html`** (médianes, rendu logiciel, ± 6), sans paramètre puis avec `?vhs=0` :

  | Étape | Sans paramètre | `?vhs=0` |
  |---|---|---|
  | `main` | 50 | 48 |
  | `lot-4b` avant le 3j (3g, 3i, 3l compris) | 47 | 47 |
  | après le 3j | 44 | 44 |
  | après le 3m | 42 | 44 |

  Seuil du projet : 45. Accessibilité et bonnes pratiques 100, CLS 0,002.
- **Chargement** : 108 fichiers JavaScript par défaut (100 avant le 3j) ; textures « Textures : X ms » ~1,1 s dans le navigateur ; sons « Sons » ~1,25 s.
- **Tests** (au dernier lot fusionné) : Vitest 7 429/7 429 ; suite rapide Playwright 339/339 (environ 12 min ici ; fichiers ajoutés à `ESSENTIAL` : `atelier-retours`, `interface-integree`, `persos-integres`) ; suite complète 1 572 réussis, 7 échecs, 423 ignorés (1,6 h).
  - Échecs hérités persistants : 3 tests `sons-integres-ambiances` (mobile) et `jeu-sons` « M et le bouton Son coupent ».
  - Intermittents : `jeu-voix` « derrière un mur, étouffé », `atelier-retours:60` (mobile), `interface-atelier-ecrans:145` (délai de 5 s sous charge).

## Points ouverts (tous lots)
- **Performance** :
  - Lighthouse de `jeu.html` sous 45 depuis la fusion du 3j (« riche » et sang complet lourds au chargement) : **à traiter au lot d'optimisation** (section ci-dessous).
  - **Essai du propriétaire sur iPhone : tout est correct sauf la fluidité, qui tombe parfois sous 40 images/s.**
  - **Le propriétaire fera un changement d'optimisation** ; pistes : compiler les shaders des personnages et du sang hors du démarrage, préparer la texture du joueur pendant le chargement, instancier les zombies identiques (lot 3d), cadavres en géométrie simplifiée.
- **Sons** :
  - aucun son écouté par l'agent ;
  - mémoire audio sur iPhone à surveiller (~16 Mo de tampons) ;
  - manquent toujours : chute du corps, coup de marteau animé, impact sur la chair distinct.
- **Interface** :
  - « Revenir au menu principal » sans action jusqu'au lot 7 ;
  - accès à `sauvegarde.html` depuis le jeu à décider ;
  - zones de sécurité réelles non vérifiées par l'agent.
- **Règles à mettre à jour à l'entrée dans `main`** :
  - « tir ou réparation » contredit `conventions.md` (lot 3) ;
  - mentions de 8 Mo pour les sons (`conventions.md`, `Docs/seed.md`) ;
  - mentions de « 12 pièces et 700 triangles » (`CLAUDE.md`, `conventions.md`, `Docs/seed.md`).
- Esthétique, caractère effrayant, confort au pouce : jugés par le propriétaire seulement.

## À traiter au lot d'optimisation (décision du propriétaire)
- **Lighthouse mobile de `jeu.html` sous le seuil du projet (45)** : médiane 42 sans paramètre et 44 avec `?vhs=0`. Références : `main` 50 (48), `lot-4b` avant le 3j 47 (47), juste après la fusion du 3j 44 (44). Accessibilité, bonnes pratiques et CLS restent bons (100, 100, 0,002).
  - Mesure : `LH_ONLY=jeu npm run lighthouse`, et `LH_QUERY='?vhs=0'` pour la variante. En rendu logiciel, une passe varie de ± 6 : prendre la médiane d'au moins 5 passes.
  - Déjà fait au lot 3m : atlas du sang et matières de blessure au premier usage, `blood-fx.js` jamais chargé avec `?sang=0`.
  - Essayé sans gain mesurable, puis retiré : tenues au premier usage, textures des personnages réduites d'un cran.
  - Le seuil n'a jamais été modifié.
- **Fluidité sur iPhone** : parfois sous 40 images/s (essai du propriétaire, `?fps=1`).
- **Pistes** :
  - compiler les shaders des personnages v2 et du sang hors du démarrage (`renderer.compileAsync`) ;
  - préparer la texture du joueur pendant l'écran de chargement ;
  - instancier les zombies identiques (lot 3d) ;
  - cadavres en géométrie simplifiée ;
  - mesurer le coût par image du sang et des ombres des personnages ;
  - vérifier les tâches longues au démarrage (préparation des zombies en `requestIdleCallback`, calcul des sons).
- **Critères à tenir** : Lighthouse `jeu.html` ≥ 45 avec et sans `?vhs=0` (médiane), aucun changement de la logique du jeu, budgets de 45 000 triangles et 400 appels.

## Règle pour les prochains lots (demande du propriétaire)
**Un nouveau lot n'apparaît plus dans l'interface de `/dev/`.** Il continue d'ajouter son entrée dans `data/changelog.json` → `lots` (historique, exigé par `data-changelog` : une entrée par bilan), mais **n'ajoute rien à la liste `versions`** et ne met pas de ligne `nom:` dans son `apercu.txt`. **C'est le propriétaire qui indique quand une version est ajoutée** (numéro `V0.x`, lot concerné) ; alors seulement, une entrée est ajoutée à `versions`, et les tests `data-changelog` et `dev.spec` sont adaptés.

## Lignes à ajouter à `CLAUDE.md` et `conventions.md` à l'entrée dans `main` (une seule fois pour tous les lots)
`CLAUDE.md` est déjà proche de sa limite (8 216 caractères pour 8 400) : **consolider d'abord** (déplacer vers `conventions.md` les lignes « Lot 4 : scripts/economie.mjs… », « Contrôle : carte.html… », « Budget, annonce de vague… »), puis remplacer plutôt qu'ajouter. Lignes proposées par chaque lot :
- **lot 4b** : `- Journal de /dev : seulement les versions de data/changelog.json → versions (V0.x) ; un nouveau lot ajoute son entrée à lots, jamais à versions : le propriétaire dit quand.`
- **lot 3g** : atelier de la carte (`visite.html`, `ecarts.html`, décisions rejouables, `npm run carte`) ; décor léger et textures fines (`?detail=0`) — texte exact dans `Docs/lots/lot-3g.md`.
- **lot 3h** : atelier des sons et synthèse 2 (purs) ; niveaux relatifs au tir, crête ≤ −3 dBFS — texte exact dans `Docs/lots/lot-3h.md`.
- **lot 3i** : chaîne `sounds-choix.json` → `integrer.mjs` → `sounds.json` ; `?sons=` ; poids sans plafond (garde-fou 64 Mo) ; boucles — texte exact dans `Docs/lots/lot-3i.md`.
- **lot 3k** : atelier de l'interface, fausses données annoncées — texte exact dans `Docs/lots/lot-3k.md`.
- **lot 3l** : remplacer les lignes « HUD : … » et « Interface : … » — texte exact dans `Docs/lots/lot-3l.md`.
- **lots 3j et 3m** : remplacer « Personnages : 12 pièces… » et « Poses : pose.js… » par les lignes « Personnages v2 », « Sang », « Ancien modèle » de `Docs/lots/lot-3m.md` ; dans `conventions.md`, la section « Personnages v2 et sang » (§ 8 de `Docs/ref/passation-personnages-4b.md`) et la phrase « tir ou réparation ».

## Tests propres au lot 4b
`lots.test.js` (nom affiché), `data-changelog` (lot courant `lot-4b`, liste `versions`), `dev.spec` (ordre V0.5 → V0.1, « (en cours) », anciens lots absents, lien « Ouvrir ce lot »). Les garde-fous de branche des lots (fichiers interdits comparés à la base de `lot-4b`, titre d'`apercu.txt`) ont été adaptés à chaque fusion pour accepter les lots déjà présents.

## À tester par le propriétaire (iPhone en paysage)
`…/lots/lot-4b/jeu.html?fps=1` : une manche complète ; vérifier ensemble carte et décor (feux, brouillard, mur percé), sons (voix par type, réparation, vent, feu), interface (HUD, pause, fins, à terre), personnages et sang ; comparer `&perso=actuel`, `&sang=reduit`, `&sons=ancien`, `&detail=0` ; étage : `&wave=21&floor=1`.

## À savoir
- La page `/dev/` publiée et l'assemblage du site sont ceux de `main` : le nom affiché, le journal par versions et les aperçus `/lots/…` ne sont visibles qu'après un déploiement de `main` (un push sur une branche de lot relance le workflow sur `main`).
- **Fusion dans `main`** (à faire par le propriétaire) : Pull Request `lot-4b` → `main` quand toutes les refontes y sont ; **ne jamais fusionner la première ligne d'`apercu.txt`** ; ajouter les lignes de `CLAUDE.md` et `conventions.md` ci-dessus ; ne supprimer aucune branche de lot.
