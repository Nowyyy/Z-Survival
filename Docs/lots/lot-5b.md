# Lot 5b — Fluidité : outil de mesure, préréglages graphiques, optimisations

- **Base** : `origin/dev` bee1944. Commits : A a1c2d7b (outil de mesure), B c35fb92 (préréglages), C (optimisations, ce bilan). Détails et tableaux complets : `Docs/ref/performance.md`. **Rendu logiciel : valeurs relatives seulement ; la fluidité réelle sur iPhone et Android n'est pas mesurée par l'agent.** La logique du jeu ne change pas.
- **Livré** : `?perf=1` (panneau replié en bas à gauche, rapport copiable, profileur par étape, accrocs au premier usage, tâches longues ; modules chargés seulement avec le paramètre) ; `?cap=30|45|60` (expérience, alignée sur l'écran, avertissement si non aligné) ; `scripts/perf/` (`mesurer.mjs`, `budget-instant.mjs`, `premier-usage.mjs`, `vues.mjs`) ; préréglages Faible, Moyen, Élevé, Auto (`data/game/graphics.json`, `js/core/graphics.js`, `js/game/graphics-boot.js`, `graphics-apply.js`) ; ligne « Graphismes » de la pause avec confirmation ; préférence `zs.device.v1` (`js/save/device-settings.js`) ; `?gfx=` jamais mémorisé ; deux leviers gardés.
- **Préréglages** (provisoires) :

| | Faible | Moyen | Élevé |
|---|---|---|---|
| Pixels max, ombres, VHS, brume | 1, non, coupé, `fog` seul | 1,5, 512, statique, mur seul | 2, 1 024, animé, complète |
| Feux | voiture 1 foyer, fumée hélico coupée, autres 50 % sans lueur | fumée hélico 50 % | complets |
| Sang / cadavres ; personnages ; AA, textures fines, décor léger | réduit / 0 ; A ; non, non, réduit | réduit / 1 ; A ; non, oui, complet | complet / 2 ; table (« riche ») ; oui, oui, complet |

Auto : pointeur grossier ou téléphone → Moyen, sinon Élevé ; baisse d'un cran entre deux manches (médiane > 22 ms sur 10 s de jeu actif), jamais sous Faible, jamais de remontée, annoncée dans `#hud-live` et la pause.
- **Mesures** (% de l'Élevé ; triangles, appels, pixels à l'apparition, écran ×2 ; tâche et allocations sur 600 images) :

| | Triangles | Appels | Pixels | Tâche | Allocations | Marge sous 45 000 (U4) |
|---|---|---|---|---|---|---|
| Moyen (R1, R2, U1, U4) | 62 à 64 % | 97 % | 56 % | 56 à 60 % | 94 à 96 % | 19 215 |
| Faible | 49 à 50 % | 68 à 70 % | 25 % | 30 à 34 % | 91 à 96 % | 24 623 (Élevé : 4 603) |

Cibles : Moyen toutes tenues ; Faible tâche et pixels tenus, **triangles non tenus (49–50 % pour 45 %)** : les personnages A dominent (≈ 70 %) → variante plus légère (Idées). Surcoût par défaut de A : tâche 99 %, image 94 % de `origin/dev` (passes alternées, dans le bruit de mesure).
- **Leviers** : gardés — précompilation `renderer.compile` (chargement 99 %, accroc du premier sang −16 %, première image à l'étage −34 %), feux hors champ non réécrits (étape « monde » −39 %, image −6 %) ; non appliqués — allocations (dominées par `collision.js` et les poses, interdits), poses hors champ (gain nul dans les scénarios), HUD (déjà écrit seulement s'il change).
- **Lighthouse** (mobile, 5 passes, médiane ; `origin/dev` : 45 et 44) : Auto (Moyen émulé) **44** (36 à 46) ; Auto `?vhs=0` 44 (35 à 47) ; Élevé forcé 45 (36 à 46) ; CLS 0,002. **Objectif 45 non atteint** : le score dépend du chargement, que les préréglages ne touchent pas : premier affichage simulé ≈ 12,3 s (chaîne d'environ 110 modules et fichiers de données avant l'écran de préparation), puis script de démarrage (sons 2,3 s, `game.js` 2,4 s dont une tâche de 1,0 s, textures 1,9 s) ; écart entre passes de 10 points.
- **Invariance et contrastes** : `getState()` logique identique aux quatre préréglages après 600 pas (`graphismes.spec.js`) ; HUD et pause sans hors-cible (4,5:1, 14 px, 44 px) et planches lisibles sous Faible et Moyen ; personnages A ≥ 3:1 sur tous les sols avec et sans textures fines, tachés compris (Vitest) ; rendu Élevé identique à `origin/dev` sur six vues ; `git diff` de la logique vide.
- **CI de la branche** : CI_LIGNE
- **Points ouverts** : fluidité réelle sur iPhone et Android non mesurée par l'agent (valeurs relatives seulement) ; valeurs des préréglages à régler avec les rapports ; garde-fou de stockage assoupli (décision du propriétaire : `zs.save.v1` et `zs.device.v1`) ; six tests d'hygiène locaux échouent déjà sur `origin/dev` (ils comparent à la branche locale `main`, `Docs/seed.md` modifié par le propriétaire) ; budget des tests : +60 s estimées par l'outil (+72 → +132), durées réelles locales ≈ 150 s pour `perf.spec.js` et `graphismes.spec.js`.
- **Idées** : variante de personnages légère pour Faible ; poses à fréquence réduite hors champ ; instanciation des zombies identiques ; cadavres simplifiés ; décor découpé en tuiles ; allocations de `collision.js` (lot de logique) ; textures plus petites sans changer le motif.
- **Entrée du journal** : `data/changelog.json` → `lots` : « lot-5b — Fluidité : outil de mesure et préréglages graphiques ».
- **Lignes à ajouter (CLAUDE.md et conventions.md)** :
1. Mesure : ?perf=1 (profiler.js, perf-panel.js, perf-stats.js pur, chargés seulement avec le paramètre) ; ?cap=30|45|60 expérience ; scripts/perf/ (valeurs relatives, rendu logiciel).
2. Préréglages : graphics.json (faible, moyen, eleve = rendu actuel, auto) ; ?gfx= > zs.device.v1 > auto ; paramètres explicites prioritaires ; Auto baisse d'un cran entre deux manches, jamais de remontée.
3. Stockage : seules clés zs.save.v1 et zs.device.v1 (préférence de l'appareil, écrite par la pause, mémoire sous ?test=1 sans store=local).
4. Rendu : renderer.compile à la création ; feux hors champ non réécrits ; un préréglage ne touche jamais la logique (invariance testée).
5. ?gfx=, ?perf=, ?cap= hors de readOnlyParams.
- **À tester par moi** : après fusion dans `dev`, sur `/next/jeu.html` (si le navigateur garde l'ancienne version, ajouter `&v=` suivi d'un nombre) : ouvrir `?perf=1&gfx=eleve`, `?perf=1&gfx=moyen`, `?perf=1&gfx=faible`, `?perf=1&gfx=auto` sur l'iPhone **et** l'Android, jouer **deux manches complètes** à chaque réglage, toucher « Copier le rapport » et coller les rapports dans la conversation de cadrage (une conversation Claude, pas la session de code) avec le **modèle de l'appareil** ; essayer `&cap=60` sur l'Android ; noter quel réglage paraît fluide. Essayer aussi la ligne « Graphismes » de la pause (confirmation, rechargement).
- **Fusion** : Pull Request `lot-5b` vers **`dev`** (« Create a merge commit »).
