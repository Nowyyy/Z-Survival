# Consolidation de `CLAUDE.md` (lot 4g)

Écrit **avant** toute modification de `CLAUDE.md` (partie B du lot 4g). Base : `CLAUDE.md` de `origin/dev` (ccde5f3), **11300 caractères** pour une limite en vigueur de **8 400** (`Docs/seed.md`, ligne 157 : « consolide d'abord à 8 000 au plus, puis finit à 8 400 au plus ») ; le test `tests/unit/hygiene.test.js` ne vérifie que le garde-fou du lot 4b (moins de 12 000).

Règle appliquée : **aucune règle perdue**. Chaque ligne raccourcie, fusionnée ou déplacée est recopiée **mot pour mot** dans `Docs/ref/conventions.md`, section « Règles détaillées déplacées de `CLAUDE.md` (consolidation du lot 4g, aucune règle supprimée) » ; la version courte de `CLAUDE.md` en est le résumé fidèle. Seules deux lignes sont supprimées entièrement, parce que périmées (raison ci-dessous, texte d'origine en annexe). Règles nouvelles : seulement les deux lignes autorisées par le prompt (paliers de tests, CI), qui manquaient.

Numéros = lignes de `CLAUDE.md` à la base ; seules les lignes de règle (« - ») sont listées ; titres, phrase d'en-tête et lignes vides sont gardés.

| Ligne | Règle | Décision | Destination | Raison / détail |
|---|---|---|---|---|
| 8 | `npm ci` | raccourcir (texte intégral déplacé) | conventions.md | durées indicatives (~4 min, ~40 min) dans conventions.md |
| 9 | `npm run vendor:three` | garder | CLAUDE.md | identique |
| 10 | `npm run assemble` | supprimer (périmée) | — | ancien système d'aperçus : depuis le lot 4c, l'assembleur publie racine = main, next/ = dev, v0.N/ = archive et lots/ = page de renvoi (aucun _site/lots/<lot>/, aucun lots.json, aucune branche origin/lot-* lue) |
| 11 | `npm run lighthouse` | garder | CLAUDE.md | identique |
| 12 | Playwright | garder | CLAUDE.md | identique |
| 15 | URL | raccourcir (texte intégral déplacé) | conventions.md | fragment « /lots/lot-N/ = aperçu d'un lot » périmé (aperçus retirés au lot 4c) ; le reste gardé |
| 16 | `.github/workflows/pages.yml` | supprimer (périmée) | — | anciens déclencheurs et ancien job e2e : depuis le lot 4c, pages.yml ne tourne que sur push de main et dev (plus de PR ni de lot-*), et le job e2e est retiré au lot 4g ; remplacée par la ligne « CI » (nouvelle, autorisée par le prompt) |
| 17 | Droits minimaux, actions épinglées par SHA, ni ` | raccourcir (texte intégral déplacé) | conventions.md | fragment « (site valable sous /lots/…) » périmé (aperçus retirés au lot 4c) ; « Chemins relatifs » gardé |
| 20 | Une branche par lot | fusionner (texte intégral déplacé) | conventions.md | fusionnée avec la ligne 23 (première ligne « Git ») |
| 21 | Push de `lot-N` seulement, puis comparer `git re | garder | CLAUDE.md | identique |
| 22 | Jamais de force-push, jamais de fusion dans `mai | fusionner (texte intégral déplacé) | conventions.md | fusionnée avec la ligne 24 (troisième ligne « Git ») |
| 23 | Une branche de lot n'est jamais supprimée. Arbre | fusionner (texte intégral déplacé) | conventions.md | fusionnée avec la ligne 20 |
| 24 | Une seule partie par session, puis arrêt. | fusionner (texte intégral déplacé) | conventions.md | fusionnée avec la ligne 22 |
| 27 | Jetons | garder | CLAUDE.md | identique |
| 28 | Données | garder | CLAUDE.md | identique |
| 29 | Accessibilité | garder | CLAUDE.md | identique |
| 30 | Exception texte | garder | CLAUDE.md | identique |
| 31 | Style « sang noir » | garder | CLAUDE.md | identique |
| 32 | Polices (OFL, `fonts/` avec licence) | garder | CLAUDE.md | identique |
| 33 | Honnêteté | garder | CLAUDE.md | identique |
| 34 | `Docs/seed.md` | garder | CLAUDE.md | identique |
| 35 | La logique du jeu vit dans `js/core/`, sans Thre | garder | CLAUDE.md | identique |
| 36 | Le workflow `.github/workflows/pages.yml` n'est  | fusionner (texte intégral déplacé) | conventions.md | fusionnée dans la ligne « CI » (« modifiable seulement si le prompt du lot l'autorise ») |
| 37 | Rendu | garder | CLAUDE.md | identique |
| 38 | Coordonnées | garder | CLAUDE.md | identique |
| 39 | Caméra | garder | CLAUDE.md | identique |
| 40 | Animations | raccourcir (texte intégral déplacé) | conventions.md | détail (cinématique inverse ; pose.js pour « actuel ») dans conventions.md |
| 41 | Entrées | garder | CLAUDE.md | identique |
| 42 | Tir | garder | CLAUDE.md | identique |
| 43 | Tests | raccourcir (texte intégral déplacé) | conventions.md | liste complète des appels de window.__zs dans conventions.md |
| 44 | Monde | garder | CLAUDE.md | identique |
| 45 | Textures | garder | CLAUDE.md | identique |
| 46 | Personnages | fusionner (texte intégral déplacé) | conventions.md | fusionnée avec la ligne 47 (ligne « Personnages » courte) |
| 47 | Ancien modèle (pose.js, character.js) importé se | fusionner (texte intégral déplacé) | conventions.md | fusionnée dans la ligne « Personnages » |
| 48 | Sang | raccourcir (texte intégral déplacé) | conventions.md | fichiers blood.json, blood-fx.js et défaut « table de choix » dans conventions.md |
| 49 | Morts | raccourcir (texte intégral déplacé) | conventions.md | recul KICK 0,25 s et climb.t dans conventions.md |
| 50 | Tir et réparation | garder | CLAUDE.md | identique |
| 51 | Couleurs --perso-* et --sang-* (bloc du lot 3j d | raccourcir (texte intégral déplacé) | conventions.md | référence « bloc du lot 3j de tokens.css » dans conventions.md |
| 52 | Atelier des personnages | déplacer | conventions.md | atelier technique (lot 3j) |
| 53 | Sons | raccourcir (texte intégral déplacé) | conventions.md | audio.js, sound-director.js dans conventions.md |
| 54 | Atelier des sons (lot 3h) | déplacer | conventions.md | atelier technique à retirer au lot 13 (lot 3h) |
| 55 | Synthèse 2 | déplacer | conventions.md | détail de la synthèse 2 (lot 3h) |
| 56 | Sons de l'atelier (lot 3i) | déplacer | conventions.md | intégration des sons de l'atelier (lot 3i) |
| 57 | ?sons=choix\|ancien\|A\|B\|C | fusionner (texte intégral déplacé) | conventions.md | fusionnée avec la ligne 58 (ligne « ?sons= » courte) |
| 58 | Poids des sons | fusionner (texte intégral déplacé) | conventions.md | fusionnée dans la ligne « ?sons= » |
| 59 | Chargement | garder | CLAUDE.md | identique |
| 60 | Vagues | garder | CLAUDE.md | identique |
| 61 | Zombies | raccourcir (texte intégral déplacé) | conventions.md | createEnemy dans conventions.md |
| 62 | Statistiques | raccourcir (texte intégral déplacé) | conventions.md | effectiveWeapon, effectivePlayer dans conventions.md |
| 63 | Fenêtres | raccourcir (texte intégral déplacé) | conventions.md | windows.json dans conventions.md |
| 64 | Siège | raccourcir (texte intégral déplacé) | conventions.md | états du siège dans conventions.md |
| 65 | Chutes | raccourcir (texte intégral déplacé) | conventions.md | stats chutes et reparation dans conventions.md |
| 66 | Planches | raccourcir (texte intégral déplacé) | conventions.md | débris dans conventions.md |
| 67 | HUD (lot 3l) | raccourcir (texte intégral déplacé) | conventions.md | détail du HUD du lot 3l dans conventions.md |
| 68 | jeu.html | raccourcir (texte intégral déplacé) | conventions.md | « sans barres de Safari » dans conventions.md |
| 69 | Journal des versions | fusionner (texte intégral déplacé) | conventions.md | fusionnée avec la ligne 70 (ligne « Journal ») |
| 70 | Journal de /dev | fusionner (texte intégral déplacé) | conventions.md | fusionnée dans la ligne « Journal » |
| 71 | Effet VHS | garder | CLAUDE.md | identique |
| 72 | Budget, annonce de vague, nuit, cartes, zones, p | fusionner (texte intégral déplacé) | conventions.md | renvoi fusionné dans la dernière ligne (« Détails… : conventions.md (lots 3e et 4g) ») |
| 73 | Contrôle | déplacer | conventions.md | page de contrôle technique à retirer au lot 13 |
| 74 | Étages | raccourcir (texte intégral déplacé) | conventions.md | (floors, stairs, blocks) dans conventions.md |
| 75 | Escaliers physiques | raccourcir (texte intégral déplacé) | conventions.md | bloc de porte mince et renvoi au lot 4 dans conventions.md |
| 76 | Fondu | garder | CLAUDE.md | identique |
| 77 | Visibilité | raccourcir (texte intégral déplacé) | conventions.md | garde-corps et rez-de-chaussée toujours dessiné dans conventions.md |
| 78 | Portes | raccourcir (texte intégral déplacé) | conventions.md | fragment « budget étage 30 000 / 300 » périmé (ancienne limite de triangles : 45 000 triangles et 400 appels par vue depuis le lot 4b, ligne « Personnages ») ; « le lot 3d est reporté » dans conventions.md |
| 79 | Sauvegarde | raccourcir (texte intégral déplacé) | conventions.md | migrations, commitDelta, écriture par différences dans conventions.md |
| 80 | Mode essai | raccourcir (texte intégral déplacé) | conventions.md | reformulée plus court (mêmes paramètres) |
| 81 | Argent | raccourcir (texte intégral déplacé) | conventions.md | bounty, killAll/skipWave, bonus de manche, fin de monde dans conventions.md |
| 82 | Interface | raccourcir (texte intégral déplacé) | conventions.md | « remplacée au lot 7 » dans conventions.md |
| 83 | Atelier de l'interface (lot 3k) | déplacer | conventions.md | atelier technique (lot 3k) |
| 84 | Atelier de la carte (lot 3g) | déplacer | conventions.md | atelier de la carte (lot 3g) |
| 85 | Décor léger | raccourcir (texte intégral déplacé) | conventions.md | liste des modules et paramètres du décor léger dans conventions.md |
| 86 | Lot 4 | déplacer | conventions.md | renvoi au lot 4, repris par la dernière ligne |

## Comptage
- Avant : **73 lignes de règle** — gardées mot pour mot 25, raccourcies 26, fusionnées 12, déplacées entièrement 8, supprimées car périmées 2 (25 + 26 + 12 + 8 + 2 = 73).
- Après : **59 lignes de règle** dans `CLAUDE.md` (dont 2 nouvelles : « Tests : paliers… », « CI : … ») ; les 46 lignes raccourcies, fusionnées ou déplacées sont toutes présentes mot pour mot dans `conventions.md` (vérifié par script, voir le bilan du lot).

## Annexe : lignes supprimées (texte d'origine)
- Ligne 10 : `npm run assemble` : site complet = main + `_site/lots/<lot>/` par branche `origin/lot-*` + `_site/lots.json`.
- Ligne 16 : `.github/workflows/pages.yml` : lint + Vitest (job `quick`) sur PR et push de `main` ou `lot-*`, Playwright en 4 tranches (job `e2e`) sur PR ; `main` assemble et déploie.

## Fusion de `dev` dans `lot-4g` (après la partie B)
`dev` a reçu entre-temps deux commits du lot 4f (`b25ca0b`) qui réécrivent les lignes 8, 10, 15, 16 et 17 de `CLAUDE.md`. Résolution : gardées telles quelles depuis le lot 4f, la ligne `npm run assemble` (à jour : racine, `next/`, `v0.N/`), la ligne URL et la ligne « Droits minimaux » ; la ligne « CI » fusionne celle du lot 4f et celle du lot 4g, sans « `e2e` sur `dev` » (périmé) ; la ligne `npm ci` du lot 4f est remplacée (paliers : ligne « Tests » ; « `test:e2e` : suite rapide de `pages.yml` » périmé). Ces deux lignes du lot 4f sont recopiées mot pour mot dans `conventions.md`. Pour rester sous 8 400, sept lignes déjà raccourcies le sont un peu plus (Personnages, Sauvegarde, Décor léger, ?sons=, HUD, Animations, Visibilité : leur texte intégral était déjà dans `conventions.md`). Résultat : **8 371 caractères**, 60 lignes de règle ; vérification par script contre `ccde5f3` et contre `b25ca0b` : 0 ligne perdue.
