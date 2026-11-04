# Fluidité : mesure, préréglages graphiques et optimisations (lot 5b)

**Rendu logiciel.** Les tests et le script de comparaison tournent sous Chromium sans processeur graphique (SwiftShader) : les valeurs absolues ne représentent aucun téléphone ; **seules les comparaisons relatives** (préréglage contre préréglage, avant contre après un levier) ont un sens. La fluidité réelle sur iPhone et Android n'est pas mesurée par l'agent : elle le sera par les rapports de `?perf=1` du propriétaire.

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

## Lighthouse mobile de `jeu.html` (fin du lot 5b, 5 passes, médiane)
Auto (Lighthouse émule un téléphone : Moyen) 44 (36, 43, 44, 45, 46) ; Auto `?vhs=0` 44 (35, 37, 44, 47, 47) ; Élevé forcé (`?gfx=eleve`) 45 (36, 42, 45, 46, 46) ; CLS 0,002. Référence `origin/dev` : 45 et 44. Le score est fait au chargement, que les préréglages ne changent pas : premier affichage simulé ≈ 12,3 s (environ 110 modules et fichiers de données avant l'écran de préparation), temps de script au démarrage (sons 2,3 s, `game.js` 2,4 s dont une tâche longue de 1,0 s, textures 1,9 s). Écart de 10 points entre passes : une passe seule ne permet aucune conclusion.
