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
