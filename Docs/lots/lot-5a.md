# Lot 5a — Voiture en flammes, hélicoptère écrasé, impact sur la chair

Version V0.6 (demande du propriétaire). La logique du jeu ne change pas. **Aucun son n'a été écouté et aucune image jugée par l'agent** : mesures et descriptions seulement.

## Base, commits et fusions

| Partie | Commit | Contenu | CI de la branche | Fusion dans `dev` |
|---|---|---|---|---|
| A | f877d46 | Voiture en flammes et hélicoptère | 41732348283, succès, 7 min 38 s | PR #25 (cea67a9) |
| B | 54ba606 | Son d'impact sur les zombies | 41735979411, succès, 7 min 01 s | PR #25 |
| C | 36e0c21 | Épaves déplacées (capture annotée du propriétaire) | 41793446942, succès, 6 min 12 s | PR #25 |
| D | e403bee | Impact B par défaut et douille −12 dB | 41835998609, succès, 6 min 38 s | PR #26 (42a75b1) |
| E | b374da0 | Douille plus sourde, −24 dB en tout | 41846720004, succès, 6 min 04 s | PR #27 (92348a0) |
| F | c9720da | Cratère, traînée et fumée de l'hélicoptère | 41848782792, succès, 7 min 18 s | PR #27 |
| G | c0d00a8 | Hélicoptère arrivé du nord-est (flèche du propriétaire) | 41850388158, succès, 6 min 49 s | PR #27 |

Base : `origin/dev` c6e5f4f (« Merge branch 'lot-4g' into dev »). Après chaque fusion, `lot-5a` a été avancé jusqu'à `dev` (avance rapide, aucune réécriture d'historique).

## Fichiers
- **Source des épaves** : `data/game/maps/rez-de-chaussee/epaves.json` (pixels du plan) → `decor.json` par `npm run carte` (`js/core/maps.js` vérifie les règles et fait échouer la commande ; `scripts/plan-vers-monde.mjs` affiche le bilan des épaves). `plan.json` et `world.json` ne changent pas.
- **Modèles purs** : `js/core/epaves.js` (sommets rentrants et angle du L, hélicoptère coupé au plan du sol, rectangles de collision, voiture calcinée, foyers du feu, cratère, traînée, emprises au sol).
- **Décor** : `js/core/decor.js` (le décor à graine est tiré comme sans épaves, puis ce qui touche une épave est retiré ; les épaves s'ajoutent aux solides) ; `js/core/decor-vivant.js` (même principe).
- **Rendu** : `js/game/world.js` (couleurs de sommet dans les maillages existants), `js/game/fire.js` (feu à plusieurs foyers, sans lueur, ou fumée seule), `js/game/palette.js`, bloc `/* Décor en flammes (lot 5a) */` de `css/tokens.css` (`--game-wreck-*`, `--game-car-burnt`, `--game-car-soot`, `--game-crater-burnt`, `--game-crater-earth`, `--game-smoke-light`).
- **Contrôle** : `carte.html` (épaves et sommets rentrants, légende), `js/core/map-svg.js`, `css/carte.css`.
- **Sons** : famille `flesh` (`js/core/synth2-sources.js`), emplacement `impact-chair` (`sounds-atelier.json`), choix (`sounds-choix.json`) → `scripts/sons/integrer.mjs` → `sounds.json` ; ancien impact dans `sounds-legacy.json` ; douille refaite dans `sounds.json` ; mesure `ringingPartials` (`js/core/audio-analysis.js`), critère `ringMs` (`js/core/atelier-check.js`, affiché par `atelier-sons.html`) ; l'hélicoptère sonne « métal » (`sound-materials.json`).
- **Tests** : `tests/unit/epaves.test.js`, `tests/unit/impact-chair.test.js`, `tests/e2e/carte.spec.js` (épaves), `tests/e2e/sons-integres.spec.js` et `atelier-sons.spec.js` (impact) ; tests existants adaptés (budgets « sans le détail », règles de carte, sons gardés) ; `tests/selection.json` et `scripts/tests/classement.json` à jour.

## Hélicoptère écrasé (état final)
- **Angle du L** : sommets rentrants du contour (1490, 1840), (2020, 1940), (1490, 2480), (1045, 1840). Les plus au nord (y = 1840) : (1045, 1840) a son quart nord-ouest barré par le couloir de F3 ; **(1490, 1840)** est dégagé : c'est l'angle du L.
- **Position** : centre (1650, 1705), cap 150° (nez vers l'angle du L, arrivé du nord-est en glissant). Emprise avec les pales : x 1559 à 1811, y 1606 à 1790, à 50 du contour. Trois rectangles de collision (fuselage, poutre, queue arrachée) à 69 du bâtiment au moins.
- **Décision du propriétaire** : « tout au bord » ; bord de 40 (`epaves.json`) pour l'hélicoptère seulement, au lieu des 160 du décor solide.
- **Couloirs** : hors des couloirs d'approche du rez-de-chaussée ; sous le couloir de la fenêtre d'étage U5, dont les zombies marchent à la hauteur de l'étage (180), au-dessus de l'hélicoptère (63 de haut).
- **Modèle** : 310 triangles (plafond 700), hauteur 63 (plafond 100), coupé au plan du sol (aucun sommet sous le sol). Pièces : coque, nez, verrière, moteur, mât, poutre cassée, queue arrachée couchée, dérive, rotor de queue, patin gauche à moitié enfoui, patin droit arraché, quatre pales tordues (la première plantée dans le sol), débris. Régions d'atlas existantes, aucune texture nouvelle. Solide pour les déplacements, les balles et le laser.
- **Cratère** : ellipse de 170 × 120 orientée selon le cap, fond de terre brûlée, bourrelet irrégulier de 3 à 9 de haut, coupé au pied des murs.
- **Traînée de glissade** : sillon de 380 × 60 bordé de deux bourrelets, qui remonte vers le nord-est. Son bout entre à plat dans le couloir de F2 : sol seulement, rien de haut ni de solide.
- **Cratère et traînée** : 287 triangles dans le maillage du sol de terre (texture répétée, teintée), plats, non solides.
- **Fumée** : légère et grise, sans flammes, plus lente qu'un feu (64 particules, un appel de dessin dans le champ, absente avec `?detail=0`).
- **Règles** : `npm run carte` sans règle cassée ; `zones-metriques` : 0 zombie bloqué sur 14 (plus long arrêt 0,00 s) ; chemins ≤ 900 et simulation de 60 s : tests de `maps-regles` verts. Décor à graine identique à `dev` (arbres, buissons, décor vivant, bidons en feu) : rien à retirer.

## Voiture en flammes (état final)
- **Position** : à l'est du bâtiment près de l'angle sud-est, centre (3345, 2420), 92 × 46, 55 de haut, à 169 du bâtiment, hors des couloirs. Posée à part (capture annotée du propriétaire) ; les quatre voitures de la route du sud restent.
- **Aspect** : caisse sur les jantes, habitacle sans vitres, toit affaissé ; 158 triangles, sans ombre portée.
- **Feu** : un seul feu groupé, deux foyers (capot, habitacle), flammes et fumée, sans lueur au sol ni lumière (deux appels de dessin dans le champ, absent avec `?detail=0`). Solide.

## Budget (appels / triangles)
Mesures : 10 zombies variés, planches, ombres, cône, 667×375, `scripts/modele/mesures-rendu.mjs`.

| Scène | Référence c6e5f4f | Fin du lot | Écart |
|---|---|---|---|
| R1 (centre de la grande salle) | 61 / 37 724 | 62 / 38 479 | +1 / +755 |
| R2 (près de F6) | 61 / 37 822 | 61 / 38 577 | +0 / +755 |
| U1 (étage, gauche) | 66 / 38 880 | 67 / 39 635 | +1 / +755 |
| U4 (étage, droite) | 76 / 39 642 | 77 / 40 397 | +1 / +755 |

- **Plafond** : +2 appels et +1 200 triangles, tenu. Aucune lumière ajoutée.
- **Fichiers JS chargés par défaut** : 108 → 109 (`epaves.js`).
- **Géométries** : stables après 10 allers-retours d'étage.
- **Sans ombre portée** : l'hélicoptère, la voiture, le cratère et la traînée sont dans des maillages sans ombre portée, pour tenir le budget.

## Son : impact sur un zombie
- **Identifiant** : `impact-zombie`, joué à l'événement `zombieHit` (`sound-director.js`) avec le cri du zombie.
- **Le « cling » de l'ancien son, mesuré** :
  - un partiel étroit à 13,4–18,4 kHz dure 30 à 48 ms (−21 à −26 dB sous le maximum) ;
  - le centroïde pondéré est de 4,8 à 5,1 kHz, alors que 0,7 à 1 % seulement de l'énergie est au-dessus de 4 kHz ;
  - cause : un clic de bruit blanc (passe-haut 1,5 kHz, gain 2,2, 2,5 ms) fait sonner la réverbération à peignes (4 peignes de 25 à 31 ms) ;
  - sans cette réverbération : aucun partiel résonant au-dessus de 2 kHz, et un centroïde de 2,1 à 2,3 kHz.
- **Trois variantes** (emplacement `impact-chair`, 5 graines sans répétition immédiate ; cibles provisoires de connaissance générale) :

| Variante | Recette | Durée | Centroïde | Niveau / tir | Crête |
|---|---|---|---|---|---|
| A réaliste sourd | choc grave, éclat étouffé, squelch | 0,16 s | 552 à 588 Hz | −10,0 dB | −5,2 à −3,4 dBFS |
| **B (défaut)** | perforation brève, corps de bruit sans hauteur, squelch, éclaboussures | 0,21 s | 739 à 861 Hz | −10,0 à −10,1 dB | −5,2 à −3,1 dBFS |
| C sec et proche | bref, sans réverbération | 0,11 s | 735 à 772 Hz | −10,1 à −11,5 dB | −3,2 à −3,0 dBFS |

- **Toutes** : au plus 0,01 % de l'énergie au-dessus de 4 kHz, aucun partiel résonant au-dessus de 2 kHz, distances spectrales ≥ 0,035 ; hors cible : aucune. Ancien impact : −9,4 à −10,3 dB du tir (moyenne −10,0, cible retenue).
- **B refaite (partie D)** : retour du propriétaire, « moins surface dure : on dirait un tambour ».

| Mesure | B avant | B après |
|---|---|---|
| Rapport harmonique-bruit (son accordé ou bruité) | 10,3 dB | −4,4 dB |
| Énergie sous 200 Hz | 95 % | 45 % |
| Niveau sur haut-parleur de téléphone (passe-haut à 500 Hz) | −30,4 dB | −20,4 dB |

- **Comparer** : `?sons=A`, `?sons=B`, `?sons=C`, `?sons=ancien` (ancien impact) ; seules, sans le tir ni le cri : `atelier-sons.html`, carte « impact sur la chair ».

## Son : douille
- **Le bruit aigu entendu à l'impact** : c'est la douille du pistolet, partie du tir. Elle sonne 0,25 à 0,40 s après le tir, l'instant où la balle (1 100 par seconde) touche un zombie à 275–440. Ancienne recette : partiels de 4,2 à 9,1 kHz qui sonnent 105 à 245 ms, 99,9 % de l'énergie au-dessus de 4 kHz.
- **Refaite plus sourde (partie E)** : trois rebonds gardés, partiels de 0,9 à 2,4 kHz amortis en 6 à 14 ms, sans réverbération à peignes ; 0 % au-dessus de 4 kHz, plus aucun partiel résonant au-dessus de 2 kHz plus long que 30 ms.
- **Niveau** : 24 dB sous l'ancienne en tout (niveau court moyen −17,3 → −41,3 dBFS ; gain propre −20,4 dB). Vaut aussi pour `?sons=ancien`.
- **Inchangés** : tir et impacts sur les autres matières, recettes identiques (empreinte SHA-256).

## Contrôles des sons
- **Scène simulée** (8 zombies, 24 tirs, mélange brut avant le compresseur du jeu) : niveau moyen −9,76 dB (référence −9,74) ; impacts seuls −29,3 à −30,3 dB (référence −29,5) ; crête 0,873 (A), 0,908 (B), 0,985 (C), sous 1 : aucun écrêtage.
- **Génération au chargement** : 897 → 771 ms (0,86 ×, médiane de 5), même phase « essentiel ».
- **Pack chargé au départ** : 69 tampons et 7 061 176 octets → 67 tampons et 6 797 460 octets. Sons de l'atelier : +92 620 octets pour les 5 graines de B (au premier usage sauf la première).
- **Limite de voix** : inchangée (16).

## Points ouverts
- Esthétique et son non jugés par l'agent.
- À `?zoom=1`, la voiture est au bord droit du cadre.
- Le cratère et la traînée sont des formes simples (polygones teintés) ; leur rendu à distance n'a pas été jugé.

## Idées
- Lueur au sol pour la voiture (+1 appel).
- Boucle `ambiance-feu` près de la voiture.
- Ombre portée des épaves (≈ +940 triangles).
- Étincelle visuelle remplacée par du sang quand `?sang` n'est pas à 0.
- Cri du zombie décalé de quelques dizaines de millisecondes après l'impact, pour mieux l'entendre.

## Entrée du journal
`data/changelog.json` → `lots` : « lot-5a — Épaves en flammes et nouvel impact sur les zombies ».

## Lignes à ajouter (CLAUDE.md et conventions.md)
1. Épaves (lot 5a) : epaves.json (pixels) → decor.json par npm run carte ; js/core/epaves.js (pur) ; voiture en flammes posée à part ; hélicoptère dans l'angle du L à 40 du bâtiment (décision du propriétaire), cratère et traînée plats, fumée légère ; le décor à graine ne change pas, ce qui touche une épave est retiré.
2. Couleurs des épaves : --game-wreck-*, --game-car-*, --game-crater-*, --game-smoke-light (bloc du lot 5a de tokens.css), couleurs de sommet.
3. fire.js : spots (foyers groupés), glow: false, flames: false (fumée seule), smoke { alpha, color, rise }.
4. Impact sur zombie : emplacement impact-chair (B par défaut) sous impact-zombie ; ?sons=ancien = ancien « cling » ; douille sourde, 24 dB sous l'ancienne (gainDb −20,4).
5. ringingPartials / ringMs : aucun partiel au-dessus de 2 kHz plus long que la cible.

## À tester par moi
Sur `/next/jeu.html` (toutes les parties sont dans `dev`) :
- `?zoom=1` : l'hélicoptère, son cratère et sa traînée dans l'angle du L, la voiture en flammes à l'est.
- Tirer sur un zombie : comparer `?sons=B` (défaut), `?sons=A`, `?sons=C`, `?sons=ancien`, et vérifier que la douille est discrète.
- Si le navigateur garde l'ancienne version, ajouter `&v=` suivi d'un nombre à l'adresse.
