# Fluidité : mesure, préréglages graphiques et optimisations (lot 5b)

**Rendu logiciel.** Les tests et le script de comparaison tournent sous Chromium sans processeur graphique (SwiftShader) : les valeurs absolues ne représentent aucun téléphone ; **seules les comparaisons relatives** (préréglage contre préréglage, avant contre après un levier) ont un sens. La fluidité réelle sur iPhone et Android n'est pas mesurée par l'agent : elle le sera par les rapports de `?perf=1` du propriétaire.

## Synthèse (fin du lot 5b, après les rapports de trois téléphones)
| Téléphone | Cadence | Élevé | Moyen | Faible |
|---|---|---|---|---|
| iPhone 16 Pro Max (iOS 27, Safari 27) | 60 Hz (plafond de Safari) | ≈ 40 i/s, 10 % d'images longues | 60 i/s, régulier | 60 i/s, régulier |
| Pixel 7 (Android, Chrome 149) | 90 Hz | 59 i/s, 34 % d'images longues | 89 i/s, régulier | 89 i/s, régulier |
| Poco F7 Ultra (Android 16, Chrome 156) | 120 Hz | 113 i/s, 6 % | 114 i/s, 5 % | 112 i/s, 7 % |

- **Verdict** : Moyen (le réglage d'Auto sur un téléphone) est fluide sur les trois ; Élevé ne l'est que sur le Poco. Le processeur ne travaille que 2 à 4 ms par image partout : la limite est le rendu graphique (pixels), d'où l'efficacité du rapport de pixels des préréglages. Aucune valeur de préréglage n'a été changée après les mesures.
- **Reste à comprendre ou à faire** : (1) l'accroc de 300 à 450 ms de la première image (premier « commit » du navigateur, attente du travail graphique ; le cacher sous l'écran de préparation fait tomber Lighthouse sous 45 : piste `compileAsync`) ; (2) les 5 à 7 % d'images qui sautent une cadence à 120 Hz même en Faible, probablement le ramasse-miettes (1,3 Mo alloués par image, moitié dans `collision.js`) : **lot à part décidé** (dernière section) ; (3) Auto n'a encore été vu sur aucun téléphone faible ; (4) Faible garde 49 à 50 % des triangles de l'Élevé (cible 45 %, personnages A).
- **Limites** : les mesures de l'agent sont en rendu logiciel (valeurs relatives seulement) ; trois téléphones haut de gamme ou milieu-haut de gamme seulement ; les seuils d'Auto (22 ms, 10 %, 1,5 ×) sont provisoires.

## Relevé de départ (étape 0, `origin/dev` bee1944)
1. Boucle (`js/game/game.js`, `frame`) : horloge VHS (`ctx.vhs.update`, 11 variables CSS), simulation `step(dt)` (vagues, IA, siège, balles, collisions, flux, argent, sons), `draw` (poses des 11 personnages, sang, effets, HUD, fenêtres, débris, flèches, étiquettes, annonce), `followCamera` (caméra, feux, brume, mur percé, carte d'ombres), `renderer.render`.
2. Poses : `pose-v2.js` et `character-parts.js` pour chaque personnage visible ou non (les zombies de l'autre étage sont posés aussi, puis cachés).
3. HUD : `hud.js` n'écrit déjà dans le DOM que si une valeur change (`changed`, `setText`, `setHidden`) ; aucune lecture de disposition dans la boucle.
4. Réglages existants (adresse, jamais mémorisés) : `?perso=`, `?sang=0|reduit|1`, `?usure=`, `?detail=0` (textures fines, décor léger, mobilier détaillé, feux, épaves), `?vhs=0|1`, `?shadows=0`, `?dpr=0.5..2`, `?percee=0`, `?murs=bas`.
5. Données : `render.json` (ombres 1 024, brume `fog.layers` : mur et 2 nappes), `blood.json` (niveaux, 2 cadavres), `vhs.json`, `persos-choix.json` (« riche » pour tous), `textures.json` (`fine`), `feux.json`.
6. Créé à la demande : atlas du sang et matières de blessure (premier sang), tenues des zombies (préparées pendant les temps libres), sons de l'atelier non préchargés ; programmes de shaders compilés au premier dessin de chaque matière (sang, feu, fumée, cadavres, mur percé).
7. Allocations par image possibles : `Set` des vivants, `filter`/`slice` des étincelles, objets passés à `effects.update` et `hud.update`, `fc.set([…])` et `new Vector2()` dans `fire.js` (128 particules par feu), matrices des articulations (`character-parts.js`), collisions (`collision.js`, logique).
8. Coûts d'après les données : personnages « riche » ≤ 2 600 triangles (10 zombies ≈ 26 000 des 38 500 de R1), cadavre ≈ 2 100, sang ≤ 3 appels et 1 200 triangles, décor léger ≤ 1 500 triangles et 6 appels, feu 3 appels (voiture 2, fumée de l'hélicoptère 1), épaves 755 triangles, brume 3 plans transparents (remplissage), VHS 3 calques plein écran, ombres : deuxième passe sur les objets qui en portent.
9. Références (10 zombies variés, planches, ombres, cône, 667 × 375, `scripts/modele/mesures-rendu.mjs`) : R1 62 / 38 479, R2 61 / 38 577, U1 67 / 39 635, U4 77 / 40 397 (appels / triangles), identiques au bilan du 5a.
10. Fichiers JavaScript chargés par défaut : 109 ; avec `?fps=1` : 110.
11. `?fps=1` (5 chargements, médiane) : textures 988 ms, sons essentiels 704 ms, étage 98 ms, flux 5,7 ms, jeu prêt en 3,1 s.
12. Lighthouse mobile de `jeu.html` (5 passes) : 34, 44, 45, 46, 46 (médiane 45) ; `?vhs=0` : 43, 43, 44, 45, 47 (médiane 44). FCP ≈ 12,3 s, TBT 380 à 920 ms.

## Outil de mesure `?perf=1`
- Modules importés seulement avec le paramètre : `js/game/profiler.js`, `js/game/perf-panel.js`, `js/core/perf-stats.js` (et `js/game/frame-cap.js` avec `?cap=`). Par défaut, `game.js` n'a pas de profileur : ses appels `P?.…` ne font rien.
- Étapes mesurées par image : `sim`, `poses`, `effets`, `hud`, `monde` (caméra, feux, brume, mur percé), `rendu` (côté processeur), `total`.
- Rapport (« Copier le rapport ») : système résumé, écran estimé, DPR, canvas, préréglage et paramètres, 5 s glissantes et session (médiane, p95, p99, maximum, images > 1,5 × et > 2 × la médiane), travail par étape, `renderer.info`, tâches longues, accrocs au premier usage (tir, sang, feu, types de zombies, manche, pause), mémoire du tas, plafond.
- `?cap=30|45|60` : expérience, jamais par défaut ni mémorisée. Une image sur `every` (fréquence de l'écran estimée sur 30 images / plafond, arrondi). **Avertissement** : un plafond qui ne divise pas la fréquence (60 sur un écran de 90 Hz) ne peut pas être tenu régulièrement : le panneau l'écrit (« non aligné ») et le jeu dessine alors une image sur deux (45 images/s).

## Script de comparaison
`node scripts/perf/mesurer.mjs [--presets eleve,moyen,faible] [--scenarios R1,R2,U1,U4] [--passes 5] [--ref URL] [--sans-perf]` : la fonction d'image du jeu est appelée 600 fois (1/60 s de jeu chacune, style et mise en page forcés à chaque image), avec `Performance.getMetrics` (script, style, mise en page, tâche), allocations échantillonnées par `HeapProfiler` (objets ramassés compris) et croissance du tas (`--enable-precise-memory-info`), `renderer.info`, pixels du canvas et temps du profileur par étape. Résultats JSON hors du dépôt (dossier temporaire). « Tâche » comprend l'attente du rendu logiciel : c'est elle qui reflète le coût du remplissage (pixels, ombres, brume).

## Préréglages (lot 5b-B, `data/game/graphics.json`, provisoires)
| Réglage | Faible | Moyen | Élevé (= rendu d'avant) |
|---|---|---|---|
| Rapport de pixels maximal | 1 | 1,5 | 2 |
| Ombres (carte) | non | oui (512) | oui (1 024) |
| Effet VHS | coupé | statique | animé |
| Brume | `scene.fog` seul | mur de brume, sans nappes basses | mur et 2 nappes |
| Feux | voiture 1 foyer, fumée de l'hélicoptère coupée, autres feux à 50 % des particules sans lueur | fumée de l'hélicoptère à 50 %, feux complets | complets |
| Sang, cadavres | réduit, 0 | réduit, 1 | complet, 2 |
| Personnages (chargement) | A | A | table des choix (« riche ») |
| Anticrénelage, textures fines, décor léger (chargement) | non, non, réduit (sans `decor-interieur`) | non, oui, complet | oui, oui, complet |
| Auto | pointeur grossier ou téléphone : Moyen ; sinon Élevé ; baisse d'un cran entre deux manches si la médiane des 10 dernières secondes de jeu actif dépasse 22 ms ; jamais de remontée | | |

Priorité : `?gfx=` > préférence de l'appareil (`zs.device.v1`, choisie dans la pause) > Auto ; un paramètre explicite (`?perso`, `?sang`, `?usure`, `?detail`, `?vhs`, `?shadows`, `?dpr`) l'emporte toujours. Les textures gardent leur taille (512 au plus) dans les trois préréglages.

## Mesures des préréglages (lot 5b-B)
- **À l'apparition** (10 zombies, 667 × 375, écran ×2 ; `scripts/perf/budget-instant.mjs`) : appels / triangles / pixels.

| Scénario | Élevé | Moyen | Faible |
|---|---|---|---|
| R1 | 62 / 38 479 / 1 000 500 | 60 / 23 867 (62 %) / 562 000 (56 %) | 42 / 19 253 (50 %) / 250 125 (25 %) |
| R2 | 61 / 38 577 | 59 / 23 965 (62 %) | 42 / 19 351 (50 %) |
| U1 | 67 / 39 635 | 65 / 25 023 (63 %) | 46 / 19 619 (49 %) |
| U4 | 77 / 40 397 (marge 4 603 sous 45 000) | 75 / 25 785 (64 %, marge 19 215) | 54 / 20 377 (50 %, marge 24 623) |

- **600 images** (`scripts/perf/mesurer.mjs`, 3 passes, médiane ; écran ×1, donc pixels identiques) : en pourcentage de l'Élevé, tâche (comprend le rendu logiciel) / temps d'image côté script / allocations.

| Scénario | Moyen | Faible |
|---|---|---|
| R1 | 57 % / 90 % / 96 % | 31 % / 85 % / 95 % |
| R2 | 56 % / 91 % / 96 % | 30 % / 84 % / 96 % |
| U1 | 60 % / 90 % / 94 % | 31 % / 82 % / 91 % |
| U4 | 60 % / 87 % / 95 % | 34 % / 78 % / 91 % |

- **Style recalculé par image** : 0,24 ms à l'Élevé (VHS animé), 0,015 ms à Moyen (VHS statique) et Faible.
- **Allocations** : 0,8 à 1,3 Mo par image, dominées par `js/core/collision.js` (environ 50 %, logique du jeu, non modifiable dans ce lot) puis les poses (`pose-v2.js`, `character-parts.js`) ; les préréglages ne les changent presque pas.
- **Cibles** : Moyen ≤ 70 % des triangles (62 à 64 %, tenu), ≤ 85 % de la tâche (56 à 60 %, tenu), pixels ≤ 56 % (56 %, tenu) ; Faible ≤ 70 % de la tâche (30 à 34 %, tenu), pixels ≤ 25 % (25 %, tenu), **≤ 45 % des triangles : non tenu (49 à 50 %)** : les 11 personnages A en font environ 70 % (estimation : 1 250 triangles chacun d'après l'écart Élevé − Moyen, ombres à part), le reste est le décor de l'atlas et les murs. Pistes : variante plus légère pour Faible (≤ 1 000 triangles), décor d'atlas simplifié (lots séparés).

## Leviers (lot 5b-C ; chacun mesuré avant et après, gardé seulement s'il gagne au moins 5 % sur sa métrique)
| Levier | Mesure (avant → après, médiane de 5 passes) | Décision |
|---|---|---|
| 1. Précompilation (`renderer.compile(scene, camera)` à la création du jeu, Three.js 0.186.1 : toutes les matières de la scène, autre étage et feux hors champ compris) | jeu prêt 6 802 → 6 721 ms (99 %, limite 115 %) ; image la plus longue après le premier sang 30,5 → 25,7 ms (84 %) ; première image à l'étage 14,8 → 9,7 ms (66 %) (`scripts/perf/premier-usage.mjs`) | gardé |
| 2. Allocations par image | 1,3 Mo par image dont environ 50 % dans `collision.js` (logique) et 10 % dans les poses (`pose-v2.js`, `character-parts.js`), interdits dans ce lot ; `fire.js` sous 2,5 % (absent des 10 premiers sites) | non appliqué |
| 3. HUD | `hud.js` n'écrit déjà que les valeurs changées et ne lit aucune disposition dans la boucle (étape `hud` 0,04 ms) | rien à faire |
| 4. Poses hors champ | dans R1, R2, U1, U4 les 10 zombies sont à l'écran : gain mesurable nul | non appliqué (Idées) |
| 5. Feux et fumées hors champ (particules avancées, tampons réécrits au retour dans le champ : apparence identique, test unitaire) | étape `monde` 0,159 → 0,097 ms (61 %) ; image 2,81 → 2,64 ms (94 %) (`mesurer.mjs --sans-tas`, R1) | gardé |
| 5 bis. VHS, brume, ombres | style recalculé 0,24 → 0,015 ms par image avec le VHS statique ; tâche −40 % (Moyen) et −70 % (Faible) : réductions faites dans les préréglages Faible et Moyen (partie B), Élevé inchangé | — |

**Rendu Élevé après les leviers** (`scripts/perf/vues.mjs`, six vues dont la voiture en flammes et l'hélicoptère) : luminance moyenne et couleurs distinctes identiques à `origin/dev` (écart 0,00 % et 0,0 %).

## Lighthouse mobile de `jeu.html` (fin de la partie C, 5 passes, médiane ; depuis la partie G : 55, voir plus bas)
Auto (Lighthouse émule un téléphone : Moyen) 44 (36, 43, 44, 45, 46) ; Auto `?vhs=0` 44 (35, 37, 44, 47, 47) ; Élevé forcé (`?gfx=eleve`) 45 (36, 42, 45, 46, 46) ; CLS 0,002. Référence `origin/dev` : 45 et 44. Le score est fait au chargement, que les préréglages ne changent pas : premier affichage simulé ≈ 12,3 s (environ 110 modules et fichiers de données avant l'écran de préparation), temps de script au démarrage (sons 2,3 s, `game.js` 2,4 s dont une tâche longue de 1,0 s, textures 1,9 s). Écart de 10 points entre passes : une passe seule ne permet aucune conclusion.

## Premiers rapports de l'iPhone (lot 5b-E ; iPhone 16 Pro Max, iOS 27, Safari 27.0, écran 120 Hz)
| Réglage | DPR, canvas | Session : médiane, p95, p99, max | Images > 1,5 × | Premier usage le plus long |
|---|---|---|---|---|
| Élevé | 2, 1 912 × 752 | 21,1 / 34,1 / 38,1 / 675 ms | 401 sur 4 077 (10 %) | feu 675 ms |
| Moyen | 1,5, 1 434 × 564 | 17,1 / 18,1 / 27,1 / 129 ms | 59 sur 4 957 (1,2 %) | sang 55 ms |
| Faible | 1, 956 × 386 | 17,1 / 18,1 / 23,1 / 156 ms | 44 sur 5 770 (0,8 %) | tir et sang 106 ms |

- Moyen et Faible tiennent la cadence de la page (60 images/s) ; Élevé non (une image sur dix est longue). Le travail côté processeur est de 2 à 4 ms par image dans les trois cas : la limite est le rendu graphique (pixels : Élevé en dessine 1,8 fois plus que Moyen).
- **Cadence de 60 Hz** : Safari donne par défaut 60 images/s aux pages, même sur un écran ProMotion de 120 Hz (réglage avancé de Safari « Prefer Page Rendering Updates near 60fps », dans les Feature Flags). Le rapport l'écrit maintenant « cadence de la page » et le signale sur iOS ; aucune page web ne peut lire la fréquence réelle de l'écran.
- **iOS 27 lu « 18.7 »** : depuis iOS 26, Safari fige la version d'iOS du user-agent ; le rapport prend la version de Safari (27.0) comme version d'iOS et garde la valeur figée entre parenthèses (Chrome et Firefox sur iOS : version du user-agent seulement).
- **Temps par étape à 0 ou 1 ms** : Safari arrondit `performance.now()` à la milliseconde ; le rapport donne désormais la moyenne par étape (plus la médiane).
- **Feu à 675 ms à l'Élevé** : premier dessin des particules de feu ; la précompilation (`renderer.compile`) ne l'évite pas sur Safari, qui semble finir ses pipelines au premier dessin. À suivre avec les rapports Android et une nouvelle mesure (`premier-usage.mjs` ne le voit pas en rendu logiciel).
- Le réglage fin des préréglages attend les rapports Android (aucune valeur changée ici).
- **Lot 5b-F, cadence de la page** : estimée sur le 10e centile des intervalles (plus la médiane), car la médiane mesurait la lenteur du jeu (« 30 Hz » à l'Élevé sur l'iPhone, qui propose 60 images/s). Le rapport et le bouton du panneau donnent à part les **images par seconde obtenues** (images / durée), sur 5 s et sur la session. Un jeu qui ne tient jamais la cadence (toutes les images au double) reste lu à la moitié : les images obtenues le montrent.

## Retours du Pixel 7 et lot 5b-G
- **Pixel 7** (Chrome 149, 90 Hz) : Élevé 59 i/s obtenues sur 90, p95 33 ms, 34 % d'images > 1,5 × ; Moyen et Faible 89 i/s, p99 11,1 ms. Travail du processeur 3,1 à 3,7 ms : la limite est le rendu graphique, comme sur l'iPhone. Auto (Moyen sur un téléphone) convient aux deux appareils ; aucune valeur de préréglage changée.
- **Version d'Android** : Chrome annonce toujours « Android 10; K » ; le rapport demande la vraie version à Chrome (`navigator.userAgentData.getHighEntropyValues(['platformVersion'])`, jamais le modèle) ; sans réponse : « Android (user-agent figé à 10) ».
- **Premiers usages** : chaque accroc porte son heure depuis la première image (« feu 956 ms à 0,1 s ») ; un premier usage d'avant la première image (rendu de préparation) n'est plus compté.
- **Auto, régularité** : baisse d'un cran entre deux manches si la médiane dépasse 22 ms **ou** si plus de 10 % des images dépassent 1,5 × la cadence (10e centile), sur les 10 dernières secondes de jeu actif (`graphics.json` → `auto.irregulier`, provisoire). Le Pixel 7 à l'Élevé (médiane 11,1 ms, 34 % d'images longues) serait baissé ; à Moyen (0,5 %), non.
- **Préparation au démarrage** : l'écran de préparation reste affiché pendant la création du jeu, un premier rendu complet est fait derrière lui (`renderer.render` puis `gl.finish`), et la première tenue de chaque zombie est préparée tout de suite (les autres pendant les temps libres). L'atlas du sang reste calculé à la première tache (décision du lot 3m, testée). Mesure (`scripts/perf/demarrage.mjs`, 5 passes, rendu logiciel) : jeu prêt 3 839 → 3 745 ms (98 %), image la plus longue des 4 premières secondes 833 → 717 ms (86 %), premier feu 833 → 717 ms (86 %) : gardé.
- **Lighthouse** `jeu.html` (Auto, 5 passes) : 38, 55, 55, 55, 55 (médiane **55**, avant 44). Le temps de blocage (TBT) tombe à 0 dans 4 passes sur 5 ; le premier affichage ne change pas (≈ 12,3 s simulées) et le jeu n'est pas prêt plus tôt (98 %) : le gain vient surtout de la fenêtre de mesure de Lighthouse (le travail lourd a lieu sous l'écran de préparation), pas d'un jeu plus rapide.

## Retours du Poco F7 Ultra et lot 5b-H
- **Poco F7 Ultra** (Android 16, Chrome 156, 120 Hz) : Élevé 113 i/s obtenues, Moyen 114, Faible 112 ; 4,8 à 6,9 % d'images qui sautent une cadence (16,6 ms au lieu de 8,3), **même en Faible**, avec 1,8 à 2,5 ms de travail du processeur par image : ni le dessin ni le calcul du jeu n'en sont la cause (voir la section suivante).
- **Accroc du démarrage** (« feu … à 0,0 s » sur les trois téléphones) : une trace Chrome montre une tâche de près d'une seconde juste après la première image, presque entièrement le premier « commit » du navigateur, qui attend le travail graphique de cette image (programmes et rendu ; 650 ms à l'Élevé, 360 ms à Faible en rendu logiciel, sans différence avec ou sans VHS). **Essai retiré** : afficher la page de jeu sous l'écran de préparation et attendre deux images avant de le retirer faisait passer l'image la plus longue des 4 premières secondes de 733 à 200 ms (`demarrage.mjs`, 5 passes), mais Lighthouse tombait de 55 à 30 (temps de blocage 1,3 à 1,6 s), sous le seuil obligatoire de 45. Ce commit reste donc dans la première seconde de la partie, pendant le compte à rebours « DÉBUT » (aucun zombie). Piste : compiler les programmes en parallèle pendant le chargement (`compileAsync`, extension `KHR_parallel_shader_compile` de Chrome ; absente de Safari), ce qui demande de créer le rendu plus tôt.
- **Rapport** : nouvelle ligne « Première image » (travail par étape, intervalle jusqu'à l'image suivante) ; la plus longue tâche longue est datée depuis la première image (négatif : avant le début de la partie, sous l'écran de préparation).
- **Atlas du sang** (décision du propriétaire) : calculé à la création du sang, sous l'écran de préparation, au lieu de la première tache (choix du lot 3m, test adapté). Mesure (`premier-usage.mjs`, 5 passes, contre `dev` 869c88d) : image la plus longue après le premier sang 34,4 → 16,0 ms (47 %) ; jeu prêt 104 % (limite 115 %) ; Lighthouse en Auto inchangé (37, 37, 55, 55, 55 : médiane 55). (« Première image à l'étage » 12,4 → 14,0 ms : sans lien avec ce changement, dans le bruit du rendu logiciel à cette échelle.)

## À faire dans un lot à part : allocations par image de la logique (décision du propriétaire)
- **Constat** : le jeu alloue 0,8 à 1,3 Mo par image (`scripts/perf/mesurer.mjs`, échantillonnage du tas, objets ramassés compris), soit environ 150 Mo/s à 120 Hz. Environ la moitié vient de `js/core/collision.js` (`firstOnSegment`, `isRect`, `slide`, `pushOut`, `segmentRect`, appelés par les déplacements, les balles et le laser), environ 10 % des poses (`js/core/pose-v2.js`, `jointMatrices` et `eulerMatrix` de `js/core/character-parts.js`). Hypothèse la plus probable pour les 5 à 7 % d'images sautées du Poco F7 Ultra à 120 Hz : les pauses du ramasse-miettes.
- **À faire** : réécrire ces fonctions sans objets ni tableaux temporaires (résultats écrits dans des objets réutilisés, boucles sans `map`/`filter` dans les chemins chauds), **sans changer aucun résultat**.
- **Garanties exigées** : `getState()` logique identique avant et après sur 600 pas et plus (tests d'invariance existants, plus un test qui compare les sorties de chaque fonction réécrite à l'ancienne sur des milliers de cas tirés d'une graine) ; règles de carte et de siège inchangées (`maps-regles`, `zones-metriques`) ; mesure avant/après des allocations par image et des images longues (`mesurer.mjs`, `?perf=1` sur le Poco F7 Ultra, critère : images > 1,5 × la cadence).
- **Pourquoi un lot à part** : `collision.js` et les poses sont la logique du jeu, interdite dans le lot 5b ; leur prompt doit l'autoriser explicitement.

## Lot 5d — Allocations par image : collisions et poses sans allocation, résultats identiques
**Base** : `origin/dev` d18023c (lots 5a et 5b). **Rendu logiciel** : les mesures de l'agent sont relatives ; la fluidité réelle d'un téléphone n'est pas mesurée par l'agent (rapports `?perf=1` du propriétaire).

### Relevé de départ (étape 0)
1. `isRect(r)` → booléen ; sans allocation propre, mais rappel du `filter` de `validRects` : l'échantillonneur du tas lui attribue le tableau filtré.
2. `validRects(list)` → tableau neuf des rectangles valides ; refait à chaque appel de `firstOnSegment`, `clearSegment` (deux fois) et `moveWithCollision`.
3. `segmentRect(x0, y0, x1, y1, r)` → `t` dans [0, 1] ou `null` ; trois tableaux par appel (`[x0, y0, x1, y1]`, `p`, `q`) ; appelée pour chaque obstacle.
4. `firstOnSegment(x0, y0, x1, y1, obstacles)` → `{ t, obstacle }` (l'obstacle de la liste, par identité) ou `null` ; appelants : `castRay` (laser, 2 par image), `stepBullets` (chaque balle à chaque pas), `isMuffled` (sons).
5. `clearSegment(a, b, obstacles, margin)` → booléen ; `validRects(obstacles).map(inflateRect)` : une copie complète de chaque obstacle par appel ; appelée par `lineOfSight` (`nav.js`) : poursuite directe et jusqu'à `lookahead − 1` = 4 fois par zombie et par pas dans `flowDirection`.
6. `moveWithCollision(circle, delta, obstacles, bounds)` → `{ x, y }` neuf ; alloue la liste filtrée, l'objet des bornes, `{ x, y, r }` et le `{ x, y }` de `pushOut` ; appelants : `stepEnemies` (chaque zombie, chaque pas), `moveCircle` (joueur), `player-down.js` (chute, rare).
7. Internes : `slide` (nombre ; une passe par obstacle valide au plus, 1 à 200 sous-pas), `pushOut` (`{ x, y }`).
8. `distanceToRect`, `rectGap`, `circleOverlapsRect` (nombres, booléen, sans allocation) et `inflateRect` (objet neuf) : carte, décor, sortie latérale d'escalier ; hors des chemins chauds.
9. `eulerMatrix(angles, order)` → tableau neuf de 9 nombres (matrice 3 × 3 par lignes) ; alloue `vec3` (`slice`, tableau), `rx`, `ry`, `rz` et deux `mul3`.
10. `jointMatrices(joints, pose, scale)` → `{ [articulation]: { m: [9 nombres], t: [3 nombres] } }` neuf ; une douzaine de tableaux et trois objets par articulation ; appelée par `groundLift` (pose-v2) pour chaque pose hors des marches, pour les 11 personnages à chaque image, et à la création des personnages (`character-v2.js`).
11. `poseAt`, `blendPoses`, `addPose`, `touche` → `{ angles: { articulation: [x, y, z] }, offsets: { … }, scales: { articulation: s } }` neuf : un tableau par articulation, chaînes `hip${s}`, tableaux de clés de `keyed`, `Set` et `map` de `blendPoses` ; appelées par `show()` de `character-v2.js` (11 personnages par image), avec `{ ...params(), ...extra }`.
12. Dépendances à l'ordre : à `t` égal, `firstOnSegment` garde le premier obstacle de la liste ; `slide` et `pushOut` parcourent la liste dans l'ordre et leur résultat en dépend ; `jointMatrices` prend le parent calculé plus tôt dans la même liste ; `blendPoses` range les clés de A puis celles de B ; un tampon réutilisé ne doit rien garder de l'appel précédent.
13. Nombres : JavaScript ordinaires partout (aucun `Float32Array`) ; `-0` possible (`side * 0` du côté droit, `-dx`), `NaN` possible avec des entrées extrêmes (sommes qui débordent) : la comparaison se fait par `Object.is`.
14. Sites d'appel à modifier : `enemy-ai.js` (`moveWithCollision` de chaque zombie) et `character-v2.js` (`show()`, `cycle()`, paramètres d'animation) ; `nav.js`, `projectile.js`, `ray.js`, `movement.js` n'ont rien à changer si `clearSegment` et `firstOnSegment` cessent d'allouer quand rien n'est touché.

### Classement des allocations (partie A, `origin/dev`, `scripts/perf/mesurer.mjs`, 5 passes, médiane ; R1, R2, U1, U4 en Moyen et Élevé)
Synthèse : `node scripts/perf/synthese-allocations.mjs mesures.json` (moyenne des 8 configurations : 997,5 Ko par image ; part = part du total).

**Fichiers autorisés du lot 5d**

| Rang | Site (fonction, fichier:ligne) | Ko par image | Part |
|---|---|---|---|
| 1 | firstOnSegment js/core/collision.js:51 | 142,4 | 14,3 % |
| 2 | isRect js/core/collision.js:5 (rappel du `filter` de `validRects`) | 115,0 | 11,5 % |
| 3 | (anonyme) js/core/collision.js:63 (`map(inflateRect)` de `clearSegment`) | 101,8 | 10,2 % |
| 4 | pushOut js/core/collision.js:98 | 53,2 | 5,3 % |
| 5 | slide js/core/collision.js:70 | 51,2 | 5,1 % |
| 6 | jointMatrices js/core/character-parts.js:320 | 48,2 | 4,8 % |
| 7 | eulerMatrix js/core/character-parts.js:33 | 46,3 | 4,6 % |
| 9 | groundLift js/core/pose-v2.js:249 | 24,1 | 2,4 % |
| 10 | segmentRect js/core/collision.js:29 | 23,7 | 2,4 % |
| 12 | mergeParts js/core/character-parts.js:388 (création d'une tenue, mise en cache : hors de l'image courante) | 17,2 | 1,7 % |
| 14 | mul3 js/core/character-parts.js:17 | 11,5 | 1,2 % |

**Autres** (non modifiés, sauf `show` : site d'appel des poses)

| Rang | Site | Ko par image | Part |
|---|---|---|---|
| 8 | next (natif) : itérateurs (`for … of` sur des `Map`, dont les os de `character-v2.js`) | 35,3 | 3,5 % |
| 11 | filter (natif) : surtout `validRects` | 23,4 | 2,3 % |
| 13 | show js/game/character-v2.js:327 (site d'appel des poses) | 13,1 | 1,3 % |
| 15 | hypot (natif) | 6,2 | 0,6 % |

Par fichier (Ko par image, R1 Moyen) : `collision.js` 720,7, `character-parts.js` 144,3, natif 119,6, `pose-v2.js` 75,3, `three.module.js` 24,3, `character-v2.js` 24,2, `fire.js` 16,6, `enemy-ai.js` 12,2, `game.js` 10,4.

| Configuration | Total | collision.js | Poses (pose-v2, character-parts, character-v2) | Autres | Croissance du tas |
|---|---|---|---|---|---|
| R1 Moyen | 1 208 | 721 | 244 | 244 | 11,4 |
| R1 Élevé | 1 252 | 721 | 273 | 258 | 17,7 |
| R2 Moyen | 1 061 | 579 | 245 | 238 | 8,0 |
| R2 Élevé | 1 095 | 576 | 269 | 251 | 15,4 |
| U1 Moyen | 903 | 428 | 247 | 229 | 8,9 |
| U1 Élevé | 947 | 426 | 275 | 246 | 16,9 |
| U4 Moyen | 743 | 254 | 256 | 234 | 8,1 |
| U4 Élevé | 770 | 252 | 284 | 234 | 18,9 |

(Croissance du tas et allocations : Ko par image.)

### Ramasse-miettes (partie A, `origin/dev`, `mesurer.mjs --gc`, 5 passes, médiane ; 600 images = 10 s de jeu simulé)
Tracé Chromium par le protocole DevTools (`Tracing.start`, catégories `devtools.timeline`, `v8`, `disabled-by-default-v8.gc`, `blink.user_timing`), fil principal de la page, entre deux marques posées autour des 600 images, sans échantillonnage du tas. **Noms relevés dans le tracé** (Chromium de Playwright 1.63) : `MinorGC` et `MajorGC` (événements complets « X » de `devtools.timeline`, un par ramasse-miettes), enveloppes de `V8.GC_SCAVENGER` et `V8.GC_MARK_COMPACTOR` (non recomptés) ; `V8.GCIncrementalMarking` (marquage incrémental) et ceux du fil du travailleur des sons sont exclus. Repli contrôlé : les chutes du tas entre deux images (`performance.memory`) suivent le nombre de `MinorGC`.

| Configuration | Mineurs par seconde | Durée médiane / max (ms) | Cumul sur 10 s (ms) | Majeurs par seconde (durée) | Croissance du tas (Ko/image) |
|---|---|---|---|---|---|
| R1 Moyen | 19,5 | 0,47 / 3,27 | 104,3 | 0 | 9,7 |
| R1 Élevé | 14,9 | 0,52 / 6,87 | 108,4 | 0,1 (4,5 ms) | 16,5 |
| R2 Moyen | 18,1 | 0,46 / 4,32 | 99,1 | 0 | 13,7 |
| R2 Élevé | 14,0 | 0,55 / 4,36 | 97,5 | 0,1 (4,0 ms) | 17,3 |
| U1 Moyen | 16,4 | 0,49 / 3,95 | 97,0 | 0 | 9,0 |
| U1 Élevé | 12,9 | 0,52 / 5,90 | 89,5 | 0,1 (5,7 ms) | 18,2 |
| U4 Moyen | 13,9 | 0,52 / 3,99 | 84,9 | 0 | 8,4 |
| U4 Élevé | 11,1 | 0,58 / 3,35 | 77,2 | 0,1 (3,9 ms) | 15,3 |

Lecture (rendu logiciel, valeurs relatives) : un ramasse-miettes mineur toutes les 50 à 90 ms de jeu, environ 1 % du temps ; le plus long atteint 3 à 7 ms, soit une bonne partie d'une image de 8,3 ms à 120 Hz. C'est compatible avec l'hypothèse (des images qui sautent une cadence à intervalle irrégulier), sans la démontrer : seule la mesure sur le téléphone le peut.

### Harnais de comparaison du jeu (`scripts/perf/trace-logique.mjs`)
Six scénarios, 600 pas de `step(0.05)` (onglet « caché » : seule la simulation avance, une image dessinée après chaque pas), actions déterministes (`setInput`, planches, escalier, chute et « Rejouer », niveaux de dégâts au maximum pour avoir des tués), empreinte SHA-256 de `getState()` logique à chaque pas (nombres exacts : `String(n)`, `-0`, `NaN`, `Infinity`). `--compare A B` donne le premier pas différent ; `--os` relève en plus la matrice monde de chaque os aux pas 100, 300 et 600. **Déterminisme** : deux exécutions d'`origin/dev` identiques à chaque pas, dans les six scénarios.

| Scénario | Pas | Contenu (pas 600) | Empreinte finale (`origin/dev`) |
|---|---|---|---|
| 1. R1 manche 5 (siège, tirs, réparation) | 600 | 2 tués, 8 zombies, réparation, toutes les planches de 0 à 4 | 7e5fed6a1bcf6457 |
| 2. `?wave=21&floor=1`, escaliers | 600 | 6 passages d'escalier, zombies dans l'escalier, mort au pas 543 | 3cab05cf38810eb6 |
| 3. `?wave=31&floor=1`, deux étages | 600 | 7 passages d'escalier, 10 zombies | 4b78adcd92477b6f |
| 4. Mort puis « Rejouer » | 600 | chute sans chute restante (pas 61), « Rejouer » au pas 150 | dde468cb9e7f2fe7 |
| 5. `?map=salle` | 600 | 1 tué, réparation | 42056a4014538ada |
| 6. R2 près d'une fenêtre, `?gfx=faible` | 600 | 4 tués, 108 pas de réparation | 8a17408c5401a78a |

### Références et générateurs de cas
- Oracles : `tests/unit/helpers/oracle/{collision,pose-v2,character-parts}.oracle.js`, copies verbatim d'`origin/dev` d18023c (deux lignes d'en-tête, « référence figée, ne jamais modifier »), avec deux relais d'import (`vec.js`, `character-parts.js` → l'oracle figé). `tests/unit/oracle-texte.test.js` vérifie l'en-tête et, tant qu'une source n'est pas réécrite, l'identité de texte ; sa ligne est retirée quand la source est réécrite (B : `collision.js` ; C : les poses), le test d'identité prenant le relais.
- Cas : `tests/unit/helpers/cas-collision.js` (graine fixe, `rng.js` : segments et rectangles tirés, cas limites, vraies cartes des deux étages, rayons des personnages) et `tests/unit/helpers/cas-poses.js` (160 variantes concrètes des 5 personnages × 3 styles × tenues, toutes les animations, phases limites et tirées, paramètres).

### Partie B — `collision.js` sans allocation
- **Fonctions réécrites** : `segmentRect` (découpage de Liang-Barsky déroulé dans `clipSegment`, sans tableau) ; `firstOnSegment` (indice du premier obstacle par `firstIndex`, puis `t` recalculé pour lui : aucun objet quand rien n'est touché, l'objet du résultat sinon) et sa variante **`firstOnSegmentInto(out, x0, y0, x1, y1, obstacles)`** ; `clearSegment` (obstacle gonflé dans des variables, aucun objet) ; `moveWithCollision` et sa variante **`moveWithCollisionInto(out, circle, delta, obstacles, bounds)`** (`countValid`, `slide`, `pushOutInto` sans objet, bornes dans des variables). Inchangées : `isRect`, `validRects`, `inflateRect`, `distanceToRect`, `circleOverlapsRect`, `rectGap`.
- **Règle des tampons** : le tampon `out` appartient à l'appelant (un par site d'appel, jamais partagé entre deux sites ni entre deux entités) ; le résultat d'une variante `Into` n'est valable que jusqu'au prochain appel avec le même `out` ; chaque champ du résultat est réécrit à chaque appel (`firstOnSegmentInto` remet `t` et `obstacle` à `null` quand rien n'est touché). Sans `out`, chaque fonction renvoie comme avant un objet neuf et ne modifie pas ses arguments. Aucun état dans le module.
- **Ce que la mesure a appris** : sous V8, chaque lecture d'un champ flottant d'objets de formes variées (les obstacles des cartes ont 11 formes) crée une boîte de nombre. Une première version sans aucun littéral n'enlevait que 54 % des allocations de `collision.js` (`b-tas` v1) : elle relisait les quatre champs (`isRect`) à chaque passe de `slide` et de `pushOut`. Version retenue : chaque champ lu une seule fois et, dans `slide` et `pushOutInto`, un obstacle manifestement trop loin sur un axe est écarté après une ou deux lectures (résultat inchangé : l'ancien code l'ignorait aussi, valide ou non ; `Math.hypot` ne rend jamais moins que le plus grand de ses termes et `Math.max` rend l'un de ses arguments) ; le compte exact des obstacles valides (borne des passes de `slide`) n'est fait que si une passe l'atteint. Banc d'essai Node (fonction optimisée, 91 obstacles du rez-de-chaussée, octets par appel) : `clearSegment` 55 441 → 2 064 (−96 %), `firstOnSegment` 31 260 → 3 014 (−90 %), `moveWithCollision` 24 265 → 4 744 (−80 %). Ce qui reste est la lecture des champs des obstacles (l'ancien code les lisait aussi, plus souvent).
- **Site d'appel modifié** : `js/core/enemy-ai.js` (2 lignes) : le nouvel objet du zombie `{ ...enemy, ...track, x: 0, y: 0 }` sert de sortie à `moveWithCollisionInto` (mêmes clés dans le même ordre, mêmes nombres) : le `{ x, y }` intermédiaire disparaît ; ce tampon est propre à chaque zombie et à chaque pas. Inchangés : `nav.js` (`clearSegment` n'alloue plus rien), `projectile.js` et `ray.js` (`firstOnSegment` n'alloue plus rien quand rien n'est touché, un objet sinon), `movement.js`, `player-down.js`, `audio-mix.js`.
- **Ajouter un test d'identité** : copier la fonction d'origine, verbatim, dans `tests/unit/helpers/oracle/` (en-tête « référence figée », empreinte SHA-256 dans `tests/unit/oracle-texte.test.js`), tirer des cas d'une graine (`tests/unit/helpers/cas-*.js` : cas limites, vraies données, `NaN`, `-0`), comparer chaque champ par `Object.is` et la forme (clés, ordre, trous), les exceptions, deux ordres d'appel, un même `out` rappelé, des arguments gelés (`deepFreeze`) ; vérifier qu'un sabotage d'un ulp fait échouer le test.
- **Preuves** : `tests/unit/collision-identite.test.js` (6 000 cas `segmentRect`, 4 000 `firstOnSegment`, 3 000 `clearSegment`, 4 000 `moveWithCollision`, 3 000 pour chacune des six petites fonctions ; variantes `Into` avec un seul `out` dans les deux ordres et `out` = cercle ; contrôle statique des corps : ni littéral, ni `map`/`filter`, ni fermeture) ; sabotages détectés (`<` → `<=` à égalité, `2 * m` → `m + m`, `Math.hypot` → `Math.sqrt`, seuils de contact) ; harnais : les six empreintes identiques à `origin/dev` à chaque pas ; `node scripts/zones-metriques.mjs --etages` : sortie identique (0 zombie bloqué sur 14) ; `maps-regles` et simulations pures vertes.
- **Mesures de B** (`mesurer.mjs`, 5 passes, médiane ; `origin/dev` → B ; Ko par image ; rendu logiciel, valeurs relatives) :

| Configuration | Total | `collision.js` | Poses | Autres |
|---|---|---|---|---|
| R1 Moyen | 1 208 → 534 (−56 %) | 721 → 72 (−90 %) | 244 → 245 | 244 → 218 |
| R1 Élevé | 1 252 → 581 (−54 %) | 721 → 72 (−90 %) | 273 → 275 | 258 → 234 |
| R2 Moyen | 1 061 → 531 (−50 %) | 579 → 68 (−88 %) | 245 → 246 | 238 → 216 |
| R2 Élevé | 1 095 → 562 (−49 %) | 576 → 67 (−88 %) | 269 → 269 | 251 → 226 |
| U1 Moyen | 903 → 502 (−44 %) | 428 → 38 (−91 %) | 247 → 248 | 229 → 216 |
| U1 Élevé | 947 → 544 (−43 %) | 426 → 38 (−91 %) | 275 → 273 | 246 → 234 |
| U4 Moyen | 743 → 520 (−30 %) | 254 → 35 (−86 %) | 256 → 259 | 234 → 226 |
| U4 Élevé | 770 → 556 (−28 %) | 252 → 34 (−87 %) | 284 → 283 | 234 → 239 |

  **Cible de `collision.js` (−90 % ou plus) : non atteinte de peu** (−86 à −91 %, moyenne −89 %) : ce qui reste est la lecture des champs des obstacles (boîtes de V8). Ramasse-miettes (Moyen, tracé) : mineurs par seconde R1 19,5 → 10,7, R2 18,1 → 10,6, U1 16,4 → 10,4, U4 13,9 → 10,5 ; durée médiane inchangée (≈ 0,5 ms) ; plus long 3,3 / 4,3 / 4,0 / 4,0 → 1,4 / 2,9 / 1,6 / 3,4 ms ; cumul sur 10 s 104 / 99 / 97 / 85 → 63 / 62 / 61 / 63 ms. Étape `sim` du profileur (`--ref … --ref-memes-reglages --sans-tas`, passes alternées `origin/dev` / B, Moyen, 5 passes, médiane des moyennes par image) : R1 1,029 → 0,397 ms (−61 %), U4 0,535 → 0,311 ms (−42 %) : **plus rapide, critère « +2 % au plus » tenu**.

### Partie C — Poses sans allocation
- **`character-parts.js`** : `eulerMatrixInto(out, angles, order)` (9 termes écrits dans `out`) ; `jointMatricesInto(out, joints, pose, scale)` (une entrée `{ m: [9], t: [3] }` par articulation, créée au premier appel puis réécrite ; un `out` par squelette) ; `jointMatricesOverInto` (interne aux poses : décalage du bassin remplacé sans copier la pose, pour le contact au sol). Produits de matrices déroulés terme à terme, termes nuls et unités compris, sans nombre passé en argument (V8 en ferait des boîtes) ; le parent est celui calculé plus tôt dans le même appel, comme avant. `eulerMatrix` et `jointMatrices` renvoient comme avant des objets neufs (mêmes nombres, mêmes clés).
- **`pose-v2.js`** : `poseAtInto(out, work, rig, anim, phase, params, data)`, `blendPosesInto(out, a, b, t)`, `addPoseInto(out, base, add, w)`, `toucheInto(out, rig, phase, params, data)`, `copyPoseInto(out, src)` (copie exacte, pour la pose précédente d'un fondu), `createPose()`, `createPoseWork()`. Toutes les animations écrivent dans la pose donnée (tableaux réutilisés, gardés sous une clé symbole invisible de `Object.keys`), les poses intermédiaires (attaque, morts, réparation, relevage, enjamber) dans l'espace de travail ; noms d'articulations en table figée (plus de chaînes construites), pieds, cinématique inverse et prises en variables, `cycleSeconds` sans objet. Dans une pose « Into », une articulation absente vaut `undefined` : c'est exactement ce qu'applique `setAngles` à une articulation absente (rotation nulle, décalage nul, échelle 1) et ce que lisent les variantes `Into`. Sans tampon, chaque fonction renvoie comme avant une pose neuve identique (clés, ordre, nombres) à l'ancienne. Même type numérique (nombres JavaScript ordinaires).
- **Site d'appel** : `js/game/character-v2.js` (34 lignes ajoutées, 14 retirées) : chaque personnage crée à sa construction ses poses (`cur`, `prev`, `blend`, `hurt`, `add`), son espace de travail et ses paramètres d'animation (objet réutilisé, comme `{ ...macros, ...extra }` : clé absente = `undefined`) ; `show()` enchaîne `poseAtInto`, `blendPosesInto` depuis une copie exacte de la pose précédente (prise au changement d'animation, comme l'ancien code gardait l'objet), `addPoseInto` du touché ; les `extra` (`{ twist, recoil }`, `{ repairTime }`, `{ sill }`) sont trois objets du personnage réécrits avant l'appel. Ce qui est appliqué aux os (`setAngles`, échelles) ne change pas.
- **Preuves** : `tests/unit/poses-identite.test.js` : 19 460 cas `poseAt` (160 variantes concrètes des 5 personnages, styles A, B, C, toutes les animations, phases limites et tirées, paramètres), 1 500 `blendPoses`, 1 000 `addPose`, 1 500 `jointMatrices`, 3 000 `eulerMatrix`, `touche`, `groundLift`, `cycleSeconds`, `armIK`, `strikesPerPlank` ; variantes `Into` avec un seul tampon et un seul espace de travail pour tous les cas, dans les deux ordres ; chaîne du jeu (pose, fondu, touché, copie de la pose précédente) sur 3 000 pas ; contrôle statique des corps. Harnais : six empreintes identiques à chaque pas ; matrices monde de tous les os (38 à 209) identiques aux pas 100, 300 et 600 des six scénarios. Banc d'essai Node (octets par pose, ancien → nouveau) : zombie en attente 42 119 → 890, marche 8 168 → 534, attaque 53 388 → 3 072 ; joueur au repos 43 652 → 920, en marche 10 449 → 848.

### Mesures finales (`origin/dev` → C ; 5 passes, médiane ; rendu logiciel : valeurs relatives)
**Allocations** (Ko par image ; « poses par image » = `pose-v2.js` + `character-parts.js` hors `mergeParts`, construction d'une tenue à l'apparition ; « poses (tous) » = ces deux fichiers et `character-v2.js`) :

| Configuration | Total | `collision.js` | Poses par image | Poses (tous) | Autres | Croissance du tas |
|---|---|---|---|---|---|---|
| R1 Moyen | 1 208 → 324 (−73 %) | 721 → 72 (−90 %) | 220 → 32 (−86 %) | 244 → 64 (−74 %) | 244 → 189 | 11,4 → 8,9 |
| R1 Élevé | 1 252 → 369 (−71 %) | 721 → 72 (−90 %) | 219 → 40 (−82 %) | 273 → 92 (−66 %) | 258 → 205 | 17,7 → 18,2 |
| R2 Moyen | 1 061 → 316 (−70 %) | 579 → 67 (−88 %) | 221 → 31 (−86 %) | 245 → 62 (−75 %) | 238 → 187 | 8,0 → 7,0 |
| R2 Élevé | 1 095 → 357 (−67 %) | 576 → 67 (−88 %) | 217 → 39 (−82 %) | 269 → 91 (−66 %) | 251 → 200 | 15,4 → 15,8 |
| U1 Moyen | 903 → 287 (−68 %) | 428 → 38 (−91 %) | 213 → 30 (−86 %) | 247 → 62 (−75 %) | 229 → 188 | 8,9 → 8,3 |
| U1 Élevé | 947 → 331 (−65 %) | 426 → 38 (−91 %) | 220 → 38 (−83 %) | 275 → 90 (−67 %) | 246 → 203 | 16,9 → 15,2 |
| U4 Moyen | 743 → 292 (−61 %) | 254 → 34 (−87 %) | 222 → 33 (−85 %) | 256 → 66 (−74 %) | 234 → 192 | 8,1 → 9,3 |
| U4 Élevé | 770 → 332 (−57 %) | 252 → 34 (−87 %) | 233 → 39 (−83 %) | 284 → 92 (−68 %) | 234 → 206 | 18,9 → 14,3 |

La croissance du tas entre le début et la fin des 600 images (ce qui survit, faible et bruité) ne bouge pas : les objets supprimés mouraient tous jeunes.

**Ramasse-miettes** (tracé, `MinorGC` et `MajorGC` du fil principal, 10 s de jeu simulé) :

| Configuration | Mineurs par seconde | Durée médiane (ms) | Plus long (ms) | Cumul sur 10 s (ms) | Majeurs |
|---|---|---|---|---|---|
| R1 Moyen | 19,5 → 7,7 | 0,47 → 0,52 | 3,27 → 2,48 | 104,3 → 47,8 | 0 → 0 |
| R1 Élevé | 14,9 → 6,1 | 0,52 → 0,61 | 6,87 → 5,30 | 108,4 → 55,2 | 0,1/s → 0,1/s (4,5 → 5,9 ms) |
| R2 Moyen | 18,1 → 7,8 | 0,46 → 0,53 | 4,32 → 3,34 | 99,1 → 48,8 | 0 → 0 |
| R2 Élevé | 14,0 → 5,1 | 0,55 → 0,66 | 4,36 → 2,87 | 97,5 → 41,0 | 0,1/s → 0,1/s (4,0 → 4,3 ms) |
| U1 Moyen | 16,4 → 7,1 | 0,49 → 0,54 | 3,95 → 3,02 | 97,0 → 44,1 | 0 → 0 |
| U1 Élevé | 12,9 → 5,2 | 0,52 → 0,61 | 5,90 → 5,00 | 89,5 → 48,8 | 0,1/s → 0,1/s (5,7 → 4,5 ms) |
| U4 Moyen | 13,9 → 7,0 | 0,52 → 0,51 | 3,99 → 3,96 | 84,9 → 43,9 | 0 → 0 |
| U4 Élevé | 11,1 → 4,9 | 0,58 → 0,64 | 3,35 → 2,78 | 77,2 → 37,1 | 0,1/s → 0,1/s (3,9 → 4,0 ms) |

**Étapes du profileur** (ms par image, moyenne ; `mesurer.mjs --ref … --ref-memes-reglages --sans-tas`, passes alternées `origin/dev` / C, 5 passes, médiane) :

| Configuration | `sim` | `poses` | `total` |
|---|---|---|---|
| R1 Moyen | 1,095 → 0,414 (−62 %) | 0,477 → 0,339 (−29 %) | 2,721 → 1,857 (−32 %) |
| R2 Moyen | 0,893 → 0,402 (−55 %) | 0,469 → 0,347 (−26 %) | 2,432 → 1,803 (−26 %) |
| U1 Moyen | 0,746 → 0,355 (−52 %) | 0,457 → 0,351 (−23 %) | 2,208 → 1,770 (−20 %) |
| U4 Moyen | 0,522 → 0,325 (−38 %) | 0,476 → 0,354 (−26 %) | 2,045 → 1,748 (−15 %) |
| R1 Élevé | 1,035 → 0,434 (−58 %) | 0,491 → 0,400 (−19 %) | 2,694 → 1,955 (−27 %) |
| R2 Élevé | 0,896 → 0,418 (−53 %) | 0,505 → 0,384 (−24 %) | 2,514 → 2,020 (−20 %) |
| U1 Élevé | 0,744 → 0,394 (−47 %) | 0,492 → 0,384 (−22 %) | 2,321 → 1,883 (−19 %) |
| U4 Élevé | 0,553 → 0,328 (−41 %) | 0,516 → 0,381 (−26 %) | 2,175 → 1,818 (−16 %) |

**Rendu** : `scripts/perf/vues.mjs` (six vues, Élevé) : luminance moyenne et couleurs distinctes identiques à `origin/dev` (écart 0,00 % et 0,0 %) ; `scripts/perf/budget-instant.mjs` (R1, R2, U1, U4 × Élevé, Moyen, Faible, écran ×2) : appels, triangles et pixels identiques dans les 12 configurations.

**Cibles (rapportées, jamais modifiées)** : total −50 % : tenue (−57 à −73 %) ; `collision.js` −90 % : non tenue de peu (−87 à −91 %, moyenne −89 %) ; poses −80 % : tenue pour le code des poses par image (−82 à −86 %), non tenue en comptant `mergeParts` et les itérations de `character-v2.js` non modifiées (−66 à −75 %) ; `sim` et `poses` à +2 % au plus : tenu (plus rapides partout : `sim` −38 à −62 %, `poses` −19 à −29 %).

### Conclusion sur l'hypothèse du ramasse-miettes
Le jeu jette 2,3 à 3,7 fois moins de mémoire par image ; il y a 2,3 à 2,7 fois moins de ramasse-miettes mineurs (≈ 5 à 8 par seconde au lieu de 11 à 19,5) et leur temps cumulé baisse de 45 à 62 %. Chacun dure toujours ≈ 0,5 ms (médiane) et le plus long reste de 2,5 à 5 ms : il y a **moins** de pauses, pas de pauses plus **courtes** ; les ramasse-miettes majeurs (0,1 par seconde en Élevé, 4 à 6 ms) ne changent pas. Si les 4,8 à 6,9 % d'images sautées du Poco F7 Ultra viennent des ramasse-miettes mineurs, leur part devrait baisser d'environ la moitié ; si elle ne bouge pas, la cause est ailleurs (rendu graphique, compositeur, majeurs). Rendu logiciel : seule la mesure sur le téléphone (`?perf=1`, « images > 1,5 × ») peut trancher. En prime, le calcul est plus rapide : `sim` −38 à −62 %, `poses` −19 à −29 %, image (côté processeur) −15 à −32 %.

### Sites restants (C, moyenne des 8 configurations : 326 Ko par image)
Fichiers du lot : `slide` 21,9 Ko (6,7 %), `mergeParts` 21,0 (6,4 %, construction d'une tenue), `clearSegment` 16,1 (4,9 %), `pushOutInto` 10,8 (3,3 %), `blendOne` 6,3 (1,9 %) — lectures des champs d'obstacles et de poses que V8 met en boîte. Autres (Idées, non modifiés) : itérateurs `next` natifs 21,8 (6,7 %), `show` 12,2 (3,8 %) et `setAngles` 7,8 (2,4 %) de `character-v2.js` (`for … of` sur des `Map`), `filter` natif 11,8 (3,6 %), `enemy-ai.js` 7,6 (2,3 %), Three.js `setValueM4` 7,4 (2,3 %) et `getParameters` 6,3 (1,9 %), `perf-stats.js` 5,6 (1,7 %, `?perf=1`), `fire.js` 8,6 (2,6 %).

**Lighthouse mobile de `jeu.html`** (5 passes, à titre d'information) : C 55, 55, 52, 55, 55 (médiane 55) ; `origin/dev` 55, 55, 55, 55, 55 (médiane 55) ; CLS 0,002 : aucune chute.
