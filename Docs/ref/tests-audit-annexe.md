# Audit des tests — annexe (générée)

Généré par `node scripts/tests/resumer.mjs` depuis les mesures de `scripts/tests/mesurer.mjs` (sorties hors dépôt). Ne pas modifier à la main.

## Durées mesurées

| Étape | Durée | Code de sortie |
|---|---|---|
| lint | 0,1 min (7,5 s) | 0 |
| vitest | 1,4 min (81,4 s) | 1 |
| rapide | 11,5 min (687,7 s) | 0 |
| complet | 81,2 min (4869,7 s) | 1 |

## Vitest par fichier

139 fichiers, 7570 tests ; durée = somme des tests (la suite tourne en parallèle).

| Fichier | Tests | Échecs | Ignorés | Durée (s) | Cat. | Valeur | Reco. |
|---|---|---|---|---|---|---|---|
| atelier-scenes.test.js | 79 | 0 | 0 | 31,7 | T | page technique | garder (rapide) |
| maps-conversion.test.js | 60 | 0 | 0 | 23,9 | P | règle de jeu | garder |
| atelier-variantes.test.js | 267 | 0 | 0 | 14,4 | T | page technique | garder (rapide) |
| versions-archiver.test.js | 51 | 0 | 0 | 12,4 | G | garde-fou | garder |
| sons-integres-ambiances.test.js | 69 | 0 | 0 | 8,2 | P | règle de jeu | garder |
| zones-mobilier.test.js | 36 | 0 | 0 | 7,2 | P | règle de jeu | garder |
| zones-porte-chemin.test.js | 35 | 0 | 0 | 5,9 | G | garde-fou | garder |
| persos-variantes.test.js | 162 | 0 | 0 | 5,8 | P | règle de jeu | garder |
| sons-integres.test.js | 178 | 0 | 0 | 5,4 | P | règle de jeu | garder |
| etage-donnees.test.js | 54 | 0 | 0 | 4,9 | G | garde-fou | garder |
| etage-zombies.test.js | 41 | 0 | 0 | 4,1 | G | garde-fou | garder |
| maps-regles.test.js | 56 | 0 | 0 | 3,5 | G | garde-fou | garder |
| atelier-retours.test.js | 61 | 0 | 0 | 3,3 | P | règle de jeu | garder |
| core-monde-ia.test.js | 15 | 0 | 0 | 3,2 | I | instable | étiqueter @instable ; garde-fou (aucun zombie bloqué) : jamais retiré |
| atelier-textures.test.js | 65 | 0 | 0 | 2,5 | P | règle de rendu | garder |
| persos-page.test.js | 16 | 0 | 1 | 2,3 | T | page technique | garder (rapide) |
| atelier-synth.test.js | 95 | 0 | 0 | 2,3 | G | garde-fou | garder |
| core-texgen.test.js | 139 | 0 | 0 | 2,2 | G | garde-fou | garder |
| core-plank-layout.test.js | 78 | 0 | 0 | 1,9 | P | règle de jeu | garder |
| persos-animations.test.js | 1265 | 0 | 0 | 1,8 | P | règle de jeu | garder |
| atelier-carte.test.js | 31 | 0 | 0 | 1,7 | G | garde-fou | garder |
| atelier-decor.test.js | 42 | 0 | 0 | 1,6 | G | garde-fou | garder |
| core-vhs.test.js | 32 | 0 | 0 | 1,4 | V | valeurs exactes | garder (rapide) |
| persos-sang.test.js | 76 | 0 | 0 | 1,4 | G | garde-fou | garder |
| data-planches.test.js | 30 | 0 | 0 | 1,1 | G | garde-fou | garder |
| data-sons.test.js | 475 | 0 | 0 | 1,1 | P | règle de jeu | garder (cas du pack d'avant : L) |
| sauvegarde-schema.test.js | 219 | 0 | 0 | 1,0 | G | garde-fou | garder |
| core-synth.test.js | 78 | 0 | 0 | 1,0 | P | règle de jeu | garder |
| core-monde-ia-lot3.test.js | 41 | 0 | 0 | 0,9 | G | garde-fou | garder |
| core-siege.test.js | 46 | 0 | 0 | 0,9 | P | règle de jeu | garder |
| core-texgen-planche.test.js | 18 | 0 | 0 | 0,8 | G | garde-fou | garder |
| atelier-analyse.test.js | 75 | 0 | 0 | 0,7 | P | outillage des sons | garder |
| persos-integres.test.js | 90 | 0 | 0 | 0,7 | G | garde-fou | garder |
| core-zombie-voice.test.js | 24 | 0 | 0 | 0,7 | P | règle de jeu | garder |
| core-wave-splash.test.js | 57 | 0 | 0 | 0,6 | P | règle de jeu | garder |
| persos-jeu.test.js | 63 | 1 | 5 | 0,5 | G | garde-fou | garder ; corriger la comparaison à origin/lot-4b |
| lot1-regles.test.js | 12 | 0 | 0 | 0,5 | G | garde-fou | garder |
| persos-kit.test.js | 71 | 0 | 0 | 0,4 | P | règle de jeu | garder |
| core-sound-director.test.js | 34 | 0 | 0 | 0,3 | P | règle de jeu | garder (cas du pack d'avant : L) |
| zones.test.js | 61 | 0 | 0 | 0,3 | P | règle de jeu | garder |
| etage-floors.test.js | 49 | 0 | 0 | 0,3 | P | règle de jeu | garder |
| persos-actuels.test.js | 34 | 0 | 0 | 0,2 | L | ancien code | retirer si ?perso=actuel n'est plus voulu |
| core-tir-stats.test.js | 25 | 0 | 0 | 0,2 | P | règle de jeu | garder |
| core-enemy-factory.test.js | 34 | 0 | 0 | 0,2 | P | règle de jeu | garder |
| zones-directeur.test.js | 54 | 0 | 0 | 0,2 | P | règle de jeu | garder |
| data-annonce-sons.test.js | 85 | 0 | 0 | 0,2 | V | valeurs exactes | garder (rapide) |
| data-stats.test.js | 12 | 0 | 0 | 0,2 | P | règle de jeu | garder |
| core-texgen-grain.test.js | 13 | 0 | 0 | 0,2 | G | garde-fou | garder |
| atelier-sons-hygiene.test.js | 26 | 0 | 0 | 0,2 | G | garde-fou | garder |
| core-waves.test.js | 108 | 0 | 0 | 0,2 | P | règle de jeu | garder |
| atelier-releve.test.js | 42 | 0 | 0 | 0,2 | P | outillage de la carte | garder |
| sauvegarde-depots.test.js | 115 | 0 | 0 | 0,2 | G | garde-fou | garder |
| core-wave-director.test.js | 66 | 0 | 0 | 0,2 | P | règle de jeu | garder |
| persos-arene.test.js | 16 | 0 | 0 | 0,1 | T | page technique | garder (rapide) |
| publication.test.js | 54 | 0 | 4 | 0,1 | G | garde-fou | garder |
| game-windows-mesh.test.js | 38 | 0 | 0 | 0,1 | G | garde-fou | garder |
| core-ambiance-audio.test.js | 22 | 0 | 0 | 0,1 | L | ancien code | retirer si ?sons=ancien n'est plus voulu |
| core-spread.test.js | 45 | 0 | 0 | 0,1 | P | règle de jeu | garder |
| core-purity.test.js | 16 | 0 | 0 | 0,1 | G | garde-fou | garder |
| persos-integres-finitions.test.js | 19 | 0 | 0 | 0,1 | P | règle de jeu | garder |
| data-monde.test.js | 22 | 0 | 0 | 0,1 | G | garde-fou | garder |
| etage-hygiene.test.js | 16 | 0 | 0 | 0,1 | G | garde-fou | garder ; nettoyer les comparaisons de branche périmées |
| personnages.test.js | 40 | 0 | 0 | 0,1 | L | ancien code | retirer si ?perso=actuel n'est plus voulu |
| core-fog.test.js | 4 | 0 | 0 | 0,1 | P | règle de rendu | garder |
| interface-atelier-protos.test.js | 78 | 0 | 0 | 0,1 | T | page technique | garder (rapide) |
| data-sons-lot3.test.js | 76 | 0 | 0 | 0,1 | P | règle de jeu | garder |
| data-lot3.test.js | 43 | 0 | 0 | 0,1 | G | garde-fou | garder ; nettoyer les comparaisons de branche périmées |
| core-windows.test.js | 54 | 0 | 0 | 0,1 | P | règle de jeu | garder |
| zones-hygiene.test.js | 13 | 0 | 0 | 0,1 | G | garde-fou | garder ; nettoyer les comparaisons de branche périmées |
| map-svg.test.js | 24 | 0 | 0 | 0,1 | T | page technique | garder (rapide) |
| sauvegarde-donnees.test.js | 31 | 0 | 0 | 0,1 | G | garde-fou | garder |
| persos-donnees.test.js | 26 | 0 | 1 | 0,1 | G | garde-fou | garder |
| data-textures.test.js | 25 | 0 | 0 | 0,1 | G | garde-fou | garder |
| versions-schema.test.js | 38 | 0 | 0 | 0,1 | G | garde-fou | garder |
| core-pose-allures.test.js | 26 | 0 | 0 | 0,1 | L | ancien code | retirer si ?perso=actuel n'est plus voulu |
| economie.test.js | 201 | 0 | 0 | 0,1 | P | règle de jeu | garder |
| atelier-hygiene.test.js | 18 | 0 | 0 | 0,1 | G | garde-fou | garder ; nettoyer les comparaisons de branche périmées |
| core-player-down.test.js | 40 | 0 | 0 | 0,1 | P | règle de jeu | garder |
| core-viewport.test.js | 66 | 0 | 0 | 0,1 | P | règle de jeu | garder |
| core-collision.test.js | 22 | 0 | 0 | 0,1 | P | règle de jeu | garder |
| core-variants.test.js | 25 | 0 | 0 | 0,1 | P | règle de jeu | garder |
| interface-integree.test.js | 121 | 0 | 0 | 0,1 | G | garde-fou | garder |
| maps-hygiene.test.js | 12 | 0 | 0 | 0,1 | G | garde-fou | garder |
| data-ambiance.test.js | 29 | 0 | 0 | 0,1 | G | garde-fou | garder ; nettoyer les comparaisons de branche périmées |
| core-audio-mix.test.js | 17 | 0 | 0 | 0,1 | P | règle de jeu | garder |
| core-nav.test.js | 17 | 0 | 0 | 0,1 | G | garde-fou | garder |
| etage-directeur.test.js | 20 | 0 | 0 | 0,1 | P | règle de jeu | garder |
| core-audio-lot3.test.js | 15 | 0 | 0 | 0,1 | L | ancien code | retirer si ?sons=ancien n'est plus voulu |
| core-player-stats-lot3.test.js | 24 | 0 | 0 | 0,0 | P | règle de jeu | garder |
| core-player-stats.test.js | 74 | 0 | 0 | 0,0 | P | règle de jeu | garder |
| data-i18n.test.js | 11 | 0 | 0 | 0,0 | G | garde-fou | garder |
| hygiene.test.js | 5 | 0 | 0 | 0,0 | G | garde-fou | garder |
| interface-atelier-mesure.test.js | 82 | 0 | 0 | 0,0 | G | garde-fou | garder |
| atelier-ecarts.test.js | 42 | 0 | 0 | 0,0 | T | page technique | garder (rapide) |
| zones-splash.test.js | 14 | 0 | 0 | 0,0 | P | règle de jeu | garder |
| game-carte-mesh.test.js | 5 | 0 | 0 | 0,0 | G | garde-fou | garder |
| core-pose.test.js | 32 | 0 | 0 | 0,0 | L | ancien code | retirer si ?perso=actuel n'est plus voulu |
| interface-atelier-mock.test.js | 101 | 0 | 0 | 0,0 | T | page technique | garder (rapide) |
| interface-atelier-donnees.test.js | 42 | 0 | 0 | 0,0 | T | page technique | garder (rapide) |
| interface-atelier-ecrans.test.js | 50 | 0 | 0 | 0,0 | T | page technique | garder (rapide) |
| stair-walk.test.js | 29 | 0 | 0 | 0,0 | P | règle de jeu | garder |
| data-vagues.test.js | 19 | 0 | 0 | 0,0 | P | règle de jeu | garder |
| core-combat.test.js | 24 | 0 | 0 | 0,0 | P | règle de jeu | garder |
| core-pose-lot3.test.js | 18 | 0 | 0 | 0,0 | L | ancien code | retirer si ?perso=actuel n'est plus voulu |
| core-camera.test.js | 15 | 0 | 0 | 0,0 | P | règle de jeu | garder |
| core-rng.test.js | 4 | 0 | 0 | 0,0 | G | garde-fou | garder |
| zones-rendu.test.js | 7 | 0 | 0 | 0,0 | P | règle de jeu | garder |
| bank.test.js | 30 | 0 | 0 | 0,0 | G | garde-fou | garder |
| game-data.test.js | 7 | 0 | 0 | 0,0 | G | garde-fou | garder |
| furniture-model.test.js | 8 | 0 | 0 | 0,0 | P | règle de jeu | garder |
| interface-atelier-hygiene.test.js | 6 | 0 | 0 | 0,0 | G | garde-fou | garder |
| maps-fidelite.test.js | 32 | 0 | 0 | 0,0 | V | valeurs exactes | garder (rapide) |
| etage-fondu.test.js | 33 | 0 | 0 | 0,0 | P | règle de jeu | garder |
| core-footsteps.test.js | 9 | 0 | 0 | 0,0 | P | règle de jeu | garder |
| atelier-decisions.test.js | 22 | 0 | 0 | 0,0 | P | outillage de la carte | garder |
| etage-escaliers.test.js | 42 | 0 | 0 | 0,0 | P | règle de jeu | garder |
| sauvegarde-page.test.js | 39 | 0 | 0 | 0,0 | G | garde-fou | garder |
| core-projectile.test.js | 14 | 0 | 0 | 0,0 | P | règle de jeu | garder |
| core-hud-windows.test.js | 24 | 0 | 0 | 0,0 | P | règle de jeu | garder |
| core-tir-obstacles.test.js | 15 | 0 | 0 | 0,0 | P | règle de jeu | garder |
| interface-integree-retours.test.js | 21 | 0 | 0 | 0,0 | P | protège une page | garder |
| core-movement.test.js | 11 | 0 | 0 | 0,0 | P | règle de jeu | garder |
| core-color.test.js | 38 | 0 | 0 | 0,0 | G | garde-fou | garder |
| core-edge-arrow.test.js | 37 | 0 | 0 | 0,0 | P | règle de jeu | garder |
| data-changelog.test.js | 7 | 0 | 0 | 0,0 | G | garde-fou | garder |
| tokens.test.js | 41 | 0 | 0 | 0,0 | G | garde-fou | garder |
| core-ray.test.js | 10 | 0 | 0 | 0,0 | P | règle de jeu | garder |
| structure.test.js | 35 | 0 | 0 | 0,0 | G | garde-fou | garder |
| data-hud.test.js | 23 | 0 | 0 | 0,0 | G | garde-fou | garder |
| core-stick-aim.test.js | 11 | 0 | 0 | 0,0 | P | règle de jeu | garder |
| i18n.test.js | 12 | 0 | 0 | 0,0 | G | garde-fou | garder |
| icone.test.js | 10 | 0 | 0 | 0,0 | P | protège une page | garder |
| lots.test.js | 10 | 0 | 0 | 0,0 | P | protège une page | garder |
| vendor-three.test.js | 6 | 0 | 0 | 0,0 | G | garde-fou | garder |
| core-vec.test.js | 13 | 0 | 0 | 0,0 | P | règle de jeu | garder |
| workflow.test.js | 9 | 0 | 0 | 0,0 | G | garde-fou | garder |
| build.test.js | 2 | 0 | 0 | 0,0 | G | garde-fou | garder |
| jeu-html.test.js | 2 | 0 | 0 | 0,0 | G | garde-fou | garder |
| package.test.js | 4 | 0 | 0 | 0,0 | G | garde-fou | garder |

## Playwright — suite rapide

358 exécutions (358 jouées, 0 ignorées) ; 0 échecs, 0 instables ; durée du rapport 11,4 min ; somme des durées 22,6 min.
Pages chargées (serveur de comptage, documents .html) : 365 — /jeu.html 201, /sauvegarde.html 69, /dev/ 36, / 22, /sons.html 20, /carte.html 16, /atelier-interface.html 1.

| Fichier | Projet | Exéc. | OK | Échecs | Instables | Ignorés | Durée (min) | Chargements estimés | Cat. | Reco. |
|---|---|---|---|---|---|---|---|---|---|---|
| interface-integree.spec.js | bureau | 47 | 47 | 0 | 0 | 0 | 6,1 | 43 | G | garder, accélérer (regrouper les tailles) |
| argent.spec.js | bureau | 53 | 53 | 0 | 0 | 0 | 5,5 | 57 | G | garder, regrouper |
| persos-integres.spec.js | bureau | 43 | 43 | 0 | 0 | 0 | 4,9 | 48 | G | garder, regrouper |
| jeu-interface.spec.js | bureau | 22 | 22 | 0 | 0 | 0 | 1,5 | 18 | G | garder ; mobile en doublon |
| atelier-retours.spec.js | bureau | 8 | 8 | 0 | 0 | 0 | 1,1 | 13 | F | palier complet |
| sons-page.spec.js | mobile | 10 | 10 | 0 | 0 | 0 | 0,8 | 10 | T | retirer sauf chargement et axe ; sortir de la suite rapide |
| sons-page.spec.js | bureau | 10 | 10 | 0 | 0 | 0 | 0,8 | 10 | T | retirer sauf chargement et axe ; sortir de la suite rapide |
| publication.spec.js | bureau | 27 | 27 | 0 | 0 | 0 | 0,6 | 21 | G | garder |
| sauvegarde.spec.js | mobile | 33 | 33 | 0 | 0 | 0 | 0,3 | 34 | G | garder |
| sauvegarde.spec.js | bureau | 33 | 33 | 0 | 0 | 0 | 0,3 | 34 | G | garder |
| carte.spec.js | bureau | 14 | 14 | 0 | 0 | 0 | 0,2 | 13 | T | retirer sauf chargement et axe ; sortir de la suite rapide |
| dev.spec.js | bureau | 19 | 19 | 0 | 0 | 0 | 0,1 | 37 | G | garder |
| dev.spec.js | mobile | 19 | 19 | 0 | 0 | 0 | 0,1 | 37 | G | garder |
| attente.spec.js | mobile | 10 | 10 | 0 | 0 | 0 | 0,1 | 9 | G | garder |
| attente.spec.js | bureau | 10 | 10 | 0 | 0 | 0 | 0,1 | 9 | G | garder |

### 25 tests les plus lents (rapide)

| Durée (s) | Fichier:ligne | Projet | Titre |
|---|---|---|---|
| 18,2 | interface-integree.spec.js:49 | bureau | les 7 tailles de l'atelier : HUD, pire cas, à terre, protégé, pause, mort, monde terminé › 2560x1080 : aucun hors cible  |
| 16,1 | interface-integree.spec.js:238 | bureau | états du jeu › ?labels=1 et ?zoom=1 : le HUD garde les mêmes boîtes |
| 15,0 | interface-integree.spec.js:589 | bureau | compatibilité avec les refontes de lot-4b (lot 3l-C) › atelier : « Actuel » charge le jeu intégré et en mesure les blocs |
| 14,5 | persos-integres.spec.js:309 | bureau | personnages intégrés (choix par défaut) › aucune fuite de géométrie ni de texture après 10 allers-retours d'étage et 3 « |
| 14,2 | interface-integree.spec.js:438 | bureau | annonces, réseau, stockage, accessibilité, CLS › CLS avec les données retardées de 400 ms (1440 px) : au plus 0,1 |
| 12,1 | persos-integres.spec.js:247 | bureau | personnages intégrés (choix par défaut) › budget U4 (défaut ; ?perso=riche&sang=1) : au plus 45 000 triangles et 400 app |
| 11,9 | persos-integres.spec.js:247 | bureau | personnages intégrés (choix par défaut) › budget R1 (défaut ; ?perso=riche&sang=1) : au plus 45 000 triangles et 400 app |
| 11,8 | interface-integree.spec.js:420 | bureau | annonces, réseau, stockage, accessibilité, CLS › axe : aucune violation (HUD, à terre, pause, fin) à 1440×900 |
| 11,8 | persos-integres.spec.js:247 | bureau | personnages intégrés (choix par défaut) › budget U1 (défaut ; ?perso=riche&sang=1) : au plus 45 000 triangles et 400 app |
| 11,7 | interface-integree.spec.js:438 | bureau | annonces, réseau, stockage, accessibilité, CLS › CLS avec les données retardées de 400 ms (768 px) : au plus 0,1 |
| 11,5 | interface-integree.spec.js:49 | bureau | les 7 tailles de l'atelier : HUD, pire cas, à terre, protégé, pause, mort, monde terminé › 1440x900 : aucun hors cible ( |
| 11,3 | argent.spec.js:335 | bureau | multi-onglets › deux pages additionnent leurs gains ; la page affichée suit le signal storage |
| 11,3 | interface-integree.spec.js:228 | bureau | états du jeu › mode essai : « MODE ESSAI » à gauche sous chutes et étage ; absent hors mode essai |
| 11,3 | argent.spec.js:197 | bureau | conservation à la mort › la mort conserve tout : E2-7 affiche « Argent gagné » et « Solde » ; « Rejouer » repart avec le |
| 10,8 | interface-integree.spec.js:100 | bureau | stabilité : aucune boîte ne bouge quand les valeurs parcourent leur plage (0 px) › vie, argent, vague, chutes, restants, |
| 10,7 | atelier-retours.spec.js:43 | bureau | mur percé autour du joueur caché › le joueur à découvert : le mur percé ne change rien (même image avec et sans) |
| 10,6 | interface-integree.spec.js:486 | bureau | retours du propriétaire, mesurés (lot 3l-C) › REC, VIE et chutes + étage finissent au même bord droit ; restants et tués |
| 10,6 | atelier-retours.spec.js:60 | bureau | mur percé autour du joueur caché › le joueur devant un mur, visible : même image avec et sans ?percee |
| 10,3 | argent.spec.js:802 | bureau | budget et performance › U1 : sans le détail de l'atelier, la référence (à la brume près) ; avec, 30 000 triangles et 240 |
| 10,3 | atelier-retours.spec.js:33 | bureau | mur percé autour du joueur caché › derrière le mur sud : caché (une seule teinte) avec ?percee=0, visible à travers la t |
| 10,2 | interface-integree.spec.js:326 | bureau | états du jeu › ?wave=40&fin=monde : écran de victoire « Monde terminé » tout de suite (bonus de fin de monde, mode essai |
| 10,1 | argent.spec.js:802 | bureau | budget et performance › R1 : sans le détail de l'atelier, la référence (à la brume près) ; avec, 30 000 triangles et 240 |
| 10,1 | persos-integres.spec.js:238 | bureau | personnages intégrés (choix par défaut) › ?usure=auto suit la manche ; ?usure=3 impose le dernier palier |
| 9,8 | atelier-retours.spec.js:76 | bureau | mur percé autour du joueur caché › aucun matériau transparent ajouté ; le mur percé ne change pas le nombre d'appels |
| 9,5 | interface-integree.spec.js:49 | bureau | les 7 tailles de l'atelier : HUD, pire cas, à terre, protégé, pause, mort, monde terminé › 1024x768 : aucun hors cible ( |

## Playwright — suite complet

2064 exécutions (1633 jouées, 431 ignorées) ; 1 échecs, 0 instables ; durée du rapport 81,1 min ; somme des durées 161,6 min.
Pages chargées (serveur de comptage, documents .html) : 1729 — /jeu.html 1351, /sauvegarde.html 69, /atelier-sons.html 68, /atelier-interface.html 53, /dev/ 36, /atelier-personnages.html 36, /carte.html 32, / 22.

| Fichier | Projet | Exéc. | OK | Échecs | Instables | Ignorés | Durée (min) | Chargements estimés | Cat. | Reco. |
|---|---|---|---|---|---|---|---|---|---|---|
| etage.spec.js | mobile | 54 | 54 | 0 | 0 | 0 | 9,5 | 56 | R | regrouper, palier complet |
| sons-integres-ambiances.spec.js | mobile | 10 | 10 | 0 | 0 | 0 | 6,5 | 9 | R | palier complet |
| carte-jeu.spec.js | mobile | 35 | 35 | 0 | 0 | 0 | 6,4 | 36 | R | regrouper, palier complet |
| atelier-detail.spec.js | mobile | 29 | 26 | 0 | 0 | 3 | 5,8 | 38 | L | retirer (comparaisons à ?detail=0), garder les budgets |
| jeu-zones.spec.js | mobile | 31 | 31 | 0 | 0 | 0 | 5,6 | 34 | R | regrouper, palier complet |
| interface-integree.spec.js | bureau | 47 | 47 | 0 | 0 | 0 | 5,4 | 43 | G | garder, accélérer (regrouper les tailles) |
| sons-integres.spec.js | mobile | 15 | 15 | 0 | 0 | 0 | 5,2 | 16 | R | palier complet |
| etage.spec.js | bureau | 54 | 54 | 0 | 0 | 0 | 5,1 | 56 | R | regrouper, palier complet |
| argent.spec.js | bureau | 53 | 53 | 0 | 0 | 0 | 4,8 | 57 | G | garder, regrouper |
| persos-integres.spec.js | bureau | 43 | 43 | 0 | 0 | 0 | 4,6 | 48 | G | garder, regrouper |
| jeu-ambiance.spec.js | mobile | 40 | 40 | 0 | 0 | 0 | 4,6 | 45 | R | regrouper, palier complet |
| jeu-fenetres.spec.js | mobile | 37 | 37 | 0 | 0 | 0 | 3,9 | 36 | R | regrouper, palier complet |
| etage-salle.spec.js | mobile | 22 | 22 | 0 | 0 | 0 | 3,7 | 23 | R | regrouper, palier complet |
| persos-jeu.spec.js | bureau | 39 | 39 | 0 | 0 | 0 | 3,6 | 48 | F | fusionner dans persos-integres, palier complet |
| atelier-detail.spec.js | bureau | 29 | 29 | 0 | 0 | 0 | 3,4 | 38 | L | retirer (comparaisons à ?detail=0), garder les budgets |
| jeu-zones.spec.js | bureau | 31 | 31 | 0 | 0 | 0 | 3,4 | 34 | R | regrouper, palier complet |
| carte-jeu.spec.js | bureau | 35 | 35 | 0 | 0 | 0 | 3,3 | 36 | R | regrouper, palier complet |
| jeu-chutes.spec.js | mobile | 27 | 27 | 0 | 0 | 0 | 3,3 | 27 | R | regrouper, palier complet |
| jeu-ambiance.spec.js | bureau | 40 | 40 | 0 | 0 | 0 | 3,2 | 45 | R | regrouper, palier complet |
| jeu-vagues.spec.js | bureau | 31 | 31 | 0 | 0 | 0 | 3,1 | 30 | R | regrouper, palier complet |
| jeu-sons.spec.js | mobile | 16 | 16 | 0 | 0 | 0 | 3,0 | 15 | P | garder |
| jeu-stats.spec.js | mobile | 28 | 28 | 0 | 0 | 0 | 2,7 | 20 | R | regrouper, palier complet |
| sons-integres-ambiances.spec.js | bureau | 10 | 10 | 0 | 0 | 0 | 2,6 | 9 | R | palier complet |
| jeu-fenetres.spec.js | bureau | 37 | 37 | 0 | 0 | 0 | 2,6 | 36 | R | regrouper, palier complet |
| atelier-carte.spec.js | mobile | 16 | 16 | 0 | 0 | 0 | 2,4 | 16 | F | regrouper, palier complet |
| sons-integres.spec.js | bureau | 15 | 15 | 0 | 0 | 0 | 2,4 | 16 | R | palier complet |
| jeu-3d.spec.js | bureau | 27 | 27 | 0 | 0 | 0 | 2,3 | 22 | F | regrouper |
| etage-salle.spec.js | bureau | 22 | 22 | 0 | 0 | 0 | 2,2 | 23 | R | regrouper, palier complet |
| jeu-interface.spec.js | mobile | 22 | 22 | 0 | 0 | 0 | 2,2 | 18 | G | garder ; mobile en doublon |
| jeu.spec.js | bureau | 18 | 18 | 0 | 0 | 0 | 2,1 | 17 | P | garder |
| jeu-planches.spec.js | mobile | 17 | 17 | 0 | 0 | 0 | 2,1 | 19 | R | regrouper, palier complet |
| jeu-chutes.spec.js | bureau | 27 | 27 | 0 | 0 | 0 | 2,1 | 27 | R | regrouper, palier complet |
| jeu-monde.spec.js | bureau | 22 | 21 | 0 | 0 | 1 | 2,0 | 19 | R | regrouper, palier complet |
| jeu-pause.spec.js | bureau | 16 | 16 | 0 | 0 | 0 | 2,0 | 9 | P | garder |
| jeu-stats.spec.js | bureau | 28 | 28 | 0 | 0 | 0 | 2,0 | 20 | R | regrouper, palier complet |
| atelier-retours.spec.js | mobile | 8 | 8 | 0 | 0 | 0 | 1,9 | 13 | F | palier complet |
| atelier-visite.spec.js | mobile | 11 | 11 | 0 | 0 | 0 | 1,8 | 9 | F | regrouper |
| jeu-voix.spec.js | mobile | 6 | 5 | 0 | 0 | 1 | 1,7 | 5 | R | palier complet |
| jeu-combat.spec.js | mobile | 11 | 9 | 0 | 0 | 2 | 1,7 | 8 | R | palier complet |
| persos-sang.spec.js | bureau | 15 | 15 | 0 | 0 | 0 | 1,6 | 15 | T | retirer sauf axe et budget |
| jeu-sons.spec.js | bureau | 16 | 15 | 0 | 0 | 1 | 1,5 | 15 | P | garder |
| persos-atelier.spec.js | bureau | 21 | 21 | 0 | 0 | 0 | 1,4 | 22 | T | retirer sauf chargement, axe, cibles, CLS |
| jeu-interface.spec.js | bureau | 22 | 22 | 0 | 0 | 0 | 1,4 | 18 | G | garder ; mobile en doublon |
| jeu-planches.spec.js | bureau | 17 | 17 | 0 | 0 | 0 | 1,3 | 19 | R | regrouper, palier complet |
| jeu-textures.spec.js | bureau | 19 | 19 | 0 | 0 | 0 | 1,3 | 16 | R | regrouper |
| atelier-carte.spec.js | bureau | 16 | 16 | 0 | 0 | 0 | 1,3 | 16 | F | regrouper, palier complet |
| jeu-pause.spec.js | mobile | 16 | 6 | 0 | 0 | 10 | 1,2 | 4 | P | garder |
| jeu-rendu.spec.js | bureau | 14 | 13 | 0 | 0 | 1 | 1,2 | 14 | P | garder |
| jeu-voix.spec.js | bureau | 6 | 5 | 1 | 0 | 0 | 1,2 | 5 | R | palier complet |
| atelier-retours.spec.js | bureau | 8 | 8 | 0 | 0 | 0 | 1,0 | 13 | F | palier complet |
| atelier-visite.spec.js | bureau | 11 | 11 | 0 | 0 | 0 | 1,0 | 9 | F | regrouper |
| jeu-combat.spec.js | bureau | 11 | 10 | 0 | 0 | 1 | 1,0 | 8 | R | palier complet |
| interface-atelier.spec.js | bureau | 34 | 34 | 0 | 0 | 0 | 1,0 | 31 | T | retirer sauf chargement, axe, cibles, CLS |
| jeu-personnages.spec.js | bureau | 11 | 11 | 0 | 0 | 0 | 0,9 | 11 | L | retirer (sauf budget et lisibilité) |
| sons-page.spec.js | mobile | 10 | 10 | 0 | 0 | 0 | 0,7 | 10 | T | retirer sauf chargement et axe ; sortir de la suite rapide |
| sons-page.spec.js | bureau | 10 | 10 | 0 | 0 | 0 | 0,7 | 10 | T | retirer sauf chargement et axe ; sortir de la suite rapide |
| atelier-sons.spec.js | bureau | 23 | 23 | 0 | 0 | 0 | 0,6 | 18 | T | retirer sauf chargement, axe, CLS |
| atelier-scenes.spec.js | bureau | 14 | 14 | 0 | 0 | 0 | 0,6 | 13 | T | retirer sauf axe |
| publication.spec.js | mobile | 27 | 27 | 0 | 0 | 0 | 0,6 | 21 | G | garder |
| publication.spec.js | bureau | 27 | 27 | 0 | 0 | 0 | 0,6 | 21 | G | garder |
| atelier-scenes.spec.js | mobile | 14 | 13 | 0 | 0 | 1 | 0,5 | 13 | T | retirer sauf axe |
| jeu.spec.js | mobile | 18 | 6 | 0 | 0 | 12 | 0,4 | 6 | P | garder |
| interface-atelier-ecrans.spec.js | bureau | 17 | 17 | 0 | 0 | 0 | 0,3 | 17 | T | retirer sauf axe |
| persos-jeu.spec.js | mobile | 39 | 3 | 0 | 0 | 36 | 0,3 | 3 | F | fusionner dans persos-integres, palier complet |
| sauvegarde.spec.js | bureau | 33 | 33 | 0 | 0 | 0 | 0,3 | 34 | G | garder |
| sauvegarde.spec.js | mobile | 33 | 33 | 0 | 0 | 0 | 0,3 | 34 | G | garder |
| jeu-monde.spec.js | mobile | 22 | 1 | 0 | 0 | 21 | 0,2 | 0 | R | regrouper, palier complet |
| atelier-sons.spec.js | mobile | 23 | 18 | 0 | 0 | 5 | 0,2 | 18 | T | retirer sauf chargement, axe, CLS |
| atelier-choix.spec.js | bureau | 6 | 6 | 0 | 0 | 0 | 0,2 | 5 | T | retirer sauf chargement et axe |
| jeu-rendu.spec.js | mobile | 14 | 1 | 0 | 0 | 13 | 0,2 | 0 | P | garder |
| carte.spec.js | mobile | 14 | 14 | 0 | 0 | 0 | 0,1 | 13 | T | retirer sauf chargement et axe ; sortir de la suite rapide |
| dev.spec.js | mobile | 19 | 19 | 0 | 0 | 0 | 0,1 | 37 | G | garder |
| carte.spec.js | bureau | 14 | 14 | 0 | 0 | 0 | 0,1 | 13 | T | retirer sauf chargement et axe ; sortir de la suite rapide |
| dev.spec.js | bureau | 19 | 19 | 0 | 0 | 0 | 0,1 | 37 | G | garder |
| atelier-pages.spec.js | mobile | 10 | 10 | 0 | 0 | 0 | 0,1 | 11 | T | retirer sauf chargement et axe |
| atelier-pages.spec.js | bureau | 10 | 10 | 0 | 0 | 0 | 0,1 | 11 | T | retirer sauf chargement et axe |
| attente.spec.js | mobile | 10 | 10 | 0 | 0 | 0 | 0,1 | 9 | G | garder |
| attente.spec.js | bureau | 10 | 10 | 0 | 0 | 0 | 0,1 | 9 | G | garder |
| atelier-choix.spec.js | mobile | 6 | 5 | 0 | 0 | 1 | 0,0 | 5 | T | retirer sauf chargement et axe |
| interface-retenue.spec.js | bureau | 4 | 4 | 0 | 0 | 0 | 0,0 | 4 | T | retirer sauf axe |
| jeu-3d.spec.js | mobile | 27 | 0 | 0 | 0 | 27 | 0,0 | 0 | F | regrouper |
| interface-integree.spec.js | mobile | 47 | 0 | 0 | 0 | 47 | 0,0 | 0 | G | garder, accélérer (regrouper les tailles) |
| argent.spec.js | mobile | 53 | 0 | 0 | 0 | 53 | 0,0 | 0 | G | garder, regrouper |
| interface-atelier.spec.js | mobile | 34 | 0 | 0 | 0 | 34 | 0,0 | 0 | T | retirer sauf chargement, axe, cibles, CLS |
| interface-atelier-ecrans.spec.js | mobile | 17 | 0 | 0 | 0 | 17 | 0,0 | 0 | T | retirer sauf axe |
| persos-atelier.spec.js | mobile | 21 | 0 | 0 | 0 | 21 | 0,0 | 0 | T | retirer sauf chargement, axe, cibles, CLS |
| jeu-vagues.spec.js | mobile | 31 | 0 | 0 | 0 | 31 | 0,0 | 0 | R | regrouper, palier complet |
| persos-integres.spec.js | mobile | 43 | 0 | 0 | 0 | 43 | 0,0 | 0 | G | garder, regrouper |
| interface-retenue.spec.js | mobile | 4 | 0 | 0 | 0 | 4 | 0,0 | 0 | T | retirer sauf axe |
| jeu-personnages.spec.js | mobile | 11 | 0 | 0 | 0 | 11 | 0,0 | 0 | L | retirer (sauf budget et lisibilité) |
| jeu-textures.spec.js | mobile | 19 | 0 | 0 | 0 | 19 | 0,0 | 0 | R | regrouper |
| persos-sang.spec.js | mobile | 15 | 0 | 0 | 0 | 15 | 0,0 | 0 | T | retirer sauf axe et budget |

### Échecs et instables (complet)

| Fichier:ligne | Projet | Statut | Titre | Erreur |
|---|---|---|---|---|
| jeu-voix.spec.js:107 | bureau | unexpected | voix de zombies › un zombie à l'extérieur derrière un mur est joué étouffé ; le même devant une fenêtre ne l'est pas | Error: ambiance-vent  expect(received).toBe(expected) // Object.is equality |

### 25 tests les plus lents (complet)

| Durée (s) | Fichier:ligne | Projet | Titre |
|---|---|---|---|
| 53,7 | sons-integres-ambiances.spec.js:111 | mobile | boucles d'ambiance › mort : boucles et battement de cœur arrêtés (et le restent) ; « Rejouer » les relance |
| 52,6 | sons-integres-ambiances.spec.js:169 | mobile | limite de voix et hygiène › meute de 10 zombies pendant 12 s de jeu : jamais plus de maxVoices voix ; console propre |
| 49,7 | sons-integres-ambiances.spec.js:91 | mobile | boucles d'ambiance › vent et feu : une seule voix chacune, aucune avant le geste, coupées à la pause puis reprises |
| 48,8 | sons-integres-ambiances.spec.js:129 | mobile | boucles d'ambiance › ?sons=ancien : aucune boucle nouvelle, aucun son nouveau |
| 41,3 | sons-integres-ambiances.spec.js:73 | mobile | sons nouveaux sur leur événement › en jeu : la dernière planche arrachée fait craquer la fenêtre (une seule fois) |
| 38,4 | sons-integres-ambiances.spec.js:40 | mobile | sons nouveaux sur leur événement › chaque son nouveau se joue sur son événement, sous son identifiant, avec son tampon |
| 36,9 | carte-jeu.spec.js:83 | mobile | carte par défaut › axe : aucune violation (667×375 et 1440×900) |
| 35,7 | sons-integres.spec.js:105 | mobile | sons intégrés : lecture sous les identifiants du jeu › versions non préchargées : calculées au premier usage puis gardée |
| 31,5 | jeu-zones.spec.js:670 | mobile | zones : mobilier de complément, budget, interface › axe sans violation : annonce « Nouvelle zone » visible, panneau de p |
| 31,1 | jeu-sons.spec.js:163 | mobile | sons : volume, pause, voix › le journal est borné à 200 entrées |
| 29,2 | sons-integres.spec.js:81 | mobile | sons intégrés : lecture sous les identifiants du jeu › pas du joueur, planche arrachée, voix par type : le son et le tam |
| 29,1 | etage.spec.js:950 | mobile | sons, budget, interface › pause pendant le passage d'un zombie dans l'escalier : il ne bouge plus |
| 28,1 | sons-integres-ambiances.spec.js:62 | mobile | sons nouveaux sur leur événement › et pas ailleurs : pas d'intérieur, vie haute, planche arrachée sans fenêtre ouverte,  |
| 27,4 | jeu-voix.spec.js:146 | mobile | ambiance › démarre après le premier geste et s'arrête en pause |
| 26,8 | sons-integres.spec.js:130 | mobile | sons intégrés : lecture sous les identifiants du jeu › réparation : au début de la pose, tampon à la durée de pose (calc |
| 25,8 | sons-integres.spec.js:191 | mobile | sons intégrés : ?sons= › ?sons=ancien : pack d'avant (recettes chargées à la demande), voix communes à la hauteur du typ |
| 25,8 | sons-integres-ambiances.spec.js:140 | mobile | réparation à durée variable › 0,4 / 0,8 / 1,2 / 1,8 s : un tampon par durée, calculé au premier usage, joué en phase ave |
| 25,7 | sons-integres-ambiances.spec.js:193 | mobile | limite de voix et hygiène › sons nouveaux : priorité 1 calculée au chargement (une version), priorité 2 au premier usage |
| 25,4 | jeu-pause.spec.js:219 | bureau | mesures et parcours › le HUD annonce la vie par paliers de 10 % et la mort |
| 25,3 | jeu-voix.spec.js:129 | mobile | voix de zombies › un cri d'attaque part au contact, avec la hauteur de la variante |
| 25,1 | sons-integres-ambiances.spec.js:154 | mobile | réparation à durée variable › en jeu avec ?lvl=reparation:6 : son au début de la pose, à la durée de pose du niveau (0,8 |
| 25,1 | sons-integres.spec.js:148 | mobile | sons intégrés : lecture sous les identifiants du jeu › vraie réparation en jeu : son au début de la pose de la planche ( |
| 25,1 | jeu-voix.spec.js:87 | mobile | voix de zombies › les voix « fond » ne sont jouées qu'une fois leurs tampons prêts |
| 24,9 | carte-jeu.spec.js:435 | mobile | vagues, interface, caméra, budget › ?labels=1 : 7 étiquettes (lot 3g : F7 retirée) alignées sur les fenêtres (écart < 40 |
| 24,8 | jeu-vagues.spec.js:405 | bureau | vagues du lot 2 › ?wave=N invalide est ignoré |

## Totaux par catégorie

| Catégorie | Vitest (tests / s) | Suite rapide (exéc. / min) | Suite complète (exéc. / min) |
|---|---|---|---|
| D | — | — | 276 / 44,8 |
| E | — | — | 8 / 3,2 |
| F | — | 22 / 2,4 | 93 / 8,2 |
| G | 2133 / 47,9 | 294 / 17,5 | 688 / 60,4 |
| I | 16 / 3,2 | — | 12 / 1,1 |
| L | 187 / 0,7 | 7 / 0,4 | 38 / 3,4 |
| P | 4370 / 69,3 | — | 74 / 9,1 |
| R | — | 15 / 1,3 | 263 / 25,8 |
| T | 715 / 49,0 | 20 / 1,0 | 169 / 4,8 |
| V | 149 / 1,6 | — | 12 / 0,8 |

## 30 derniers commits de HEAD (hors fusions)

Documentation seule : 2 ; ciblés : 19 ; larges (racine, .github, vendor ou 4 familles et plus) : 9.

| Commit | Fichiers | Familles | Nature | Sujet |
|---|---|---|---|---|
| fd0b50a | 9 | data/i18n, doc, js, tests/e2e, tests/unit | cible | Lot 4c-C — Noms affichés : main = Recette, dev = Développement |
| 411f1e5 | 36 | .github, css, data, data/i18n, dev, doc, js, pages, racine, scripts, tests/e2e, tests/unit | large | Lot 4c-C — Publication par versions |
| 889181d | 6 | doc, scripts, tests/unit | cible | Lot 4c-B — Archives des versions |
| 188654d | 5 | data, doc, scripts, tests/unit | cible | Lot 4c-A — Inventaire et plan de publication |
| 3d60823 | 2 | tests/unit | cible | Lot 4b — CI de main : comparaison aux sons d'avant sautée sans l'historique |
| 5117312 | 2 | tests/unit | cible | Lot 4b — Tests du 3h et du 3i valables après l'entrée dans main |
| 3b12b37 | 1 | doc | doc | Lot 4b — Lighthouse et fluidité notés pour le lot d'optimisation |
| ac5f98a | 4 | doc, tests/unit | cible | Lot 4b — Règles des lots intégrés dans CLAUDE.md et conventions.md |
| 343ad05 | 1 | doc | doc | Lot 4b — Bilan : toutes les évolutions des lots fusionnés |
| 6ae841b | 3 | data, doc, tests/unit | cible | Lot 3m-C — Entrée lot-3m du journal des versions, retours du propriétaire |
| a937f55 | 1 | data | cible | Lot 3m-C — apercu.txt de lot-4b conservé après la fusion |
| d40bec3 | 9 | doc, js/game, tests/e2e, tests/unit | cible | Lot 3m-C — Finitions, bilan et fusion |
| a6cbda5 | 32 | data, data/game, js/game, racine, scripts, tests/e2e, tests/unit | large | Lot 3m-B — Personnages choisis par défaut |
| e046bee | 8 | css, doc, pages, tests/e2e, tests/unit | cible | Lot 3l — Pièce après la somme, marges de 16 px tout le temps |
| a714601 | 17 | css, data/i18n, doc, js/game, pages, tests/e2e, tests/unit | large | Lot 3l — Retours du propriétaire sur iPhone : argent à droite, pause et fin allégées, aper |
| 6d027d9 | 1 | data | cible | Lot 3l-C — apercu.txt de lot-4b conservé après la fusion |
| 985a090 | 5 | data, doc, tests/e2e, tests/unit | cible | Lot 3l-C — Finitions, bilan et fusion |
| 83bfd5c | 37 | css, data, data/i18n, doc, js, js/core, js/game, pages, racine, tests/e2e, tests/unit | large | Lot 3l-B — Interface de l'atelier à la place de l'ancienne |
| 60c3966 | 8 | css, data, doc, tests/unit | cible | Lot 3j-D — Passation pour le lot 4b (fusion à blanc dans lot-4b) |
| bd5e78f | 9 | data/game, data/i18n, doc, js/core, js/game, tests/e2e, tests/unit | large | Lot 3j-D — Recul visible au tir ; animation « enjamber » des fenêtres |
| 256fd04 | 4 | css, doc | cible | Lot 3k — Passation pour le lot 4b (intégration de l'interface retenue) |
| 15db76c | 7 | doc, js/core, js/game, tests/e2e, tests/unit | cible | Lot 3j-D — Recul du pistolet au tir ; pas de laser pendant la réparation |
| 57999da | 3 | data, doc, tests/unit | cible | Lot 3i-C — Entrée lot-3i du journal des versions (CI) |
| 56cb762 | 6 | doc, js/core, js/game, tests/unit | cible | Lot 3j-D — Mort selon le côté touché : de face, le zombie tombe en arrière |
| e0579ff | 22 | data/game, data/i18n, doc, js/core, js/game, scripts, tests/e2e, tests/unit | large | Lot 3i-C — Sons nouveaux, bilan et fusion |
| d56ace8 | 10 | css, data/game, doc, js/core, js/game, tests/e2e | large | Lot 3j-D — Tir ou réparation, laser depuis le canon, pistolet lisible |
| 61415e6 | 28 | doc, js, js/core, js/game, tests/e2e, tests/unit | large | Lot 3j-D — Variantes « riche » et sang complet par défaut |
| b15f88a | 1 | tests/e2e | cible | Lot 3i-B — Test de hauteur des voix : pack d'avant et voix par type |
| 8e59dfd | 1 | js/game | cible | Lot 3i-B — Réparation : une version prête à la même durée joue tout de suite |
| 6446fd1 | 40 | css, data, data/game, data/i18n, doc, js, js/core, js/game, pages, scripts, tests/e2e, tests/unit | large | Lot 3i-B — Sons de l'atelier à la place des anciens |

## Classement par fichier

| Fichier | Projet(s) | Cat. | Valeur | Recommandation | Raison | Groupes |
|---|---|---|---|---|---|---|
| e2e/argent.spec.js | bureau | G | garde-fou | garder, regrouper | Sauvegarde réelle : écritures, échecs de stockage, verrouillage, mode essai, multi-onglets ; 1 rechargement par test. | R : /rapporte/montant est fixe/un seul bonus/killAll\(\) et skipWave/aucun gain pendant/ (montants couverts par economie.test et bank.test ; garder un scénario d'intégration (kill → +10)) ; F : /puce d'argent/« \+N »/E2-7 : « Monde terminé »/ordre des blocs E2/ |
| e2e/atelier-carte.spec.js | bureau, mobile | F | détail de comportement | regrouper, palier complet | Collisions d'étagères précises (P1+P2…) et fenêtre U5 : un cas par meuble corrigé au lot 3g. | G : /immobile/zones actives/ (règles de carte (aucun zombie bloqué)) ; G : /appels et triangles/ (budget) ; L : /map=salle/ |
| e2e/atelier-choix.spec.js | bureau, mobile | T | page technique | retirer sauf chargement et axe | atelier-choix.html : choix des sons du lot 3h, page à retirer au lot 13. | G : /axe/se charge sans erreur/ (axe et chargement gardés tant que la page est publiée) |
| e2e/atelier-detail.spec.js | bureau, mobile | L | ancien code | retirer (comparaisons à ?detail=0), garder les budgets | Compare le rendu fin à ?detail=0 (rendu d'avant le 3g). | G : /budget/fuite/ni géométrie ni texture/axe/CLS/textures : 14 textures/ ; I : /1,8 fois le temps/ (durée réelle mesurée dans le navigateur) ; T : /visite\.html : le lien/ |
| e2e/atelier-pages.spec.js | bureau, mobile | T | page technique | retirer sauf chargement et axe | visite.html et ecarts.html : pages techniques du lot 3g. | G : /axe/se charge/ (axe et chargement gardés tant que la page est publiée) |
| e2e/atelier-retours.spec.js | bureau (rapide), mobile (complet) | F | détail de comportement | palier complet | Mur percé (images comparées), portes et grilles : retours visuels du lot 3g ; dans la suite rapide. | I : /devant un mur, visible/ (atelier-retours:60 (mobile), intermittent relevé au 4b) ; R : /sort vers l'est/ (sortie latérale couverte par atelier-retours.test (stair-walk)) ; G : /aucun matériau transparent/ (appels de dessin) |
| e2e/atelier-scenes.spec.js | bureau, mobile | T | page technique | retirer sauf axe | Scènes de 30 s de atelier-sons.html (lot 3h). | G : /axe/ |
| e2e/atelier-sons.spec.js | bureau, mobile | T | page technique | retirer sauf chargement, axe, CLS | atelier-sons.html (lot 3h), page à retirer au lot 13. | G : /axe/CLS/se charge sans erreur/ |
| e2e/atelier-visite.spec.js | bureau, mobile | F | détail de comportement | regrouper | Visite libre (?nospawn=1&wave=31) décrite de sept façons. | G : /atteint/monte par/bloqué par un mur/ (connexité de la carte à pied) ; G : /aucune sauvegarde/ |
| e2e/attente.spec.js | bureau, mobile | G | garde-fou | garder | Accueil publié : jetons, axe, requêtes externes, <noscript>, mouvement réduit ; mobile justifié (page mobile d'abord). |  |
| e2e/carte-jeu.spec.js | bureau, mobile | R | doublon e2e | regrouper, palier complet | Piliers, murs, escaliers, ouverture : couverts par maps-regles, core-collision, data-monde. | G : /bloqué/budget/axe/réseau/stockage/caméra : jamais hors/ ; F : /: un zombie va à l'emplacement/F3 \(ouest/réparation d'une fenêtre à chaque coin/quatre carrés de F8/ (le même siège sur les 8 fenêtres) ; L : /map=salle/empty=1/ |
| e2e/carte.spec.js | bureau (rapide), mobile (complet) | T | page technique | retirer sauf chargement et axe ; sortir de la suite rapide | carte.html (contrôle, à retirer au lot 13) ; dans la suite rapide. | G : /axe/se charge/ ; L : /map=salle/map= inconnu/ |
| e2e/dev.spec.js | bureau, mobile | G | garde-fou | garder | Page /dev/ publiée : journal, axe, 44 px ; mobile justifié. |  |
| e2e/etage-salle.spec.js | bureau, mobile | R | doublon e2e | regrouper, palier complet | Séquence de la porte 3 et seconde salle : couvertes par etage-directeur, zones-directeur, etage-escaliers. | G : /budget/requête/aucune limite/jamais plus/rez-de-chaussée avec les deux escaliers/ ; L : /map=salle/ |
| e2e/etage.spec.js | bureau, mobile | R | doublon e2e | regrouper, palier complet | Escalier physique, étages, apparitions : couverts par stair-walk, etage-floors, etage-zombies, etage-escaliers. | G : /budget/géométries et de textures/axe/requête/CLS/jamais plus de 10/HUD : colonne/ ; L : /map=salle/ ; F : /fps=1/ |
| e2e/interface-atelier-ecrans.spec.js | bureau | T | page technique | retirer sauf axe | Écrans fictifs de l'atelier de l'interface (lot 3k). | I : /Côte à côte/ (interface-atelier-ecrans:145, délai de 5 s sous charge) ; G : /axe/ |
| e2e/interface-atelier.spec.js | bureau | T | page technique | retirer sauf chargement, axe, cibles, CLS | atelier-interface.html (lot 3k), page à retirer au lot 13. | G : /axe/cibles/CLS/se charge/ |
| e2e/interface-integree.spec.js | bureau | G | garde-fou | garder, accélérer (regrouper les tailles) | Interface du jeu : cibles, marges, 14 px, stabilité, axe, CLS aux 7 tailles ; dans la suite rapide. | F : /compatibilité/lot 3g, visite/lot 3i, sons/lot 3j \(sang/atelier : « Actuel »/ (compatibilité des refontes du 4b, déjà couverte ailleurs) |
| e2e/interface-retenue.spec.js | bureau | T | page technique | retirer sauf axe | interface-retenue.html (lot 3k). | G : /axe/ |
| e2e/jeu-3d.spec.js | bureau | F | détail de comportement | regrouper | Paramètres ?tilt= et ?zoom= et canvas plein écran, déjà vérifiés par jeu.spec et core-camera/core-viewport. | G : /16 px/zones de sécurité/ ; L : /angles du joueur/ (?perso=actuel) |
| e2e/jeu-ambiance.spec.js | bureau, mobile | R | doublon e2e | regrouper, palier complet | Animation de vague et VHS : chronologie couverte par core-wave-splash (57) et core-vhs (32). | G : /axe/budget/requête/cibles/tient dans la fenêtre/ ; V : /3,8 s/plafonds d'opacité/horloge réelle/ (valeurs exactes ou horloge réelle) |
| e2e/jeu-chutes.spec.js | bureau, mobile | R | doublon e2e | regrouper, palier complet | Chute, relevage, invulnérabilité : couverts par core-player-down (35). | G : /budget/réseau/axe/ |
| e2e/jeu-combat.spec.js | bureau, mobile | R | doublon e2e | palier complet | Tir automatique et dégâts à l'impact : couverts par core-combat, core-projectile, core-ray. | P : /deux doigts/souris/défilement/ (entrées réelles (souris, tactile CDP), sans équivalent unitaire) |
| e2e/jeu-fenetres.spec.js | bureau, mobile | R | doublon e2e | regrouper, palier complet | Siège, arrachage, réparation : couverts par core-windows (33) et core-siege (45). | G : /budget/réseau/axe/16 px/aucun zombie n'est dans la salle/bloqué/ ; F : /planks=\$/planks=.*invalide/\?planks=/ (paramètre d'essai décliné en plusieurs cas) ; F : /fps=1/ |
| e2e/jeu-interface.spec.js | bureau (rapide), mobile (complet) | G | garde-fou | garder ; mobile en doublon | HUD : marges, 14 px, 44 px, axe, requêtes ; recoupe interface-integree (même HUD B). | F : /E2-11/flèche/restent calculées/ (élément retiré (E2-11)) ; F : /index\.html n'a aucune/ |
| e2e/jeu-monde.spec.js | bureau | R | doublon e2e | regrouper, palier complet | Monde du lot 1b sur la salle : collisions, apparitions, IA couvertes par core-collision, core-nav, core-monde-ia. | G : /bloqué/300 appels/requête/CLS/16 px/sans \?test=1/ ; P : /tactile/vrais mouvements de souris/ |
| e2e/jeu-pause.spec.js | bureau, mobile | P | protège une page | garder | Pause, touches, plein écran, parcours cliqué : intégration sans équivalent unitaire. | G : /44 px/requête/localStorage/URL/CLS/ |
| e2e/jeu-personnages.spec.js | bureau | L | ancien code | retirer (sauf budget et lisibilité) | Personnages du lot 1c (variantes, poses de pose.js avec ?perso=actuel) remplacés par les personnages v2. | G : /appels de dessin/budget/ ; G : /visible et distinct du sol/ (contraste personnages / sol) ; I : /poses des zombies/ (pose des zombies, intermittent relevé au 4b) |
| e2e/jeu-planches.spec.js | bureau, mobile | R | doublon e2e | regrouper, palier complet | Géométrie des planches et débris : couverte par core-plank-layout (36) et game-windows-mesh (24). | G : /budget/requête/sans \?test=1/42 trian/ne coûte aucun triangle/ ; G : /luminance/plusieurs couleurs/ (contraste) |
| e2e/jeu-rendu.spec.js | bureau | P | protège une page | garder | Rendu réel (laser, balle visible, boucle cachée, Three.js local) : sans équivalent unitaire. | G : /sans \?test=1/aucune requête hors du site/16 px/ ; L : /ombres lointaines/gardent leur ombre/ (mesure avec ?perso=actuel) |
| e2e/jeu-sons.spec.js | bureau, mobile | P | protège une règle de jeu | garder | Aucun son avant le geste, pause, voix, chargement : intégration audio réelle. | E : /M et le bouton « Son » coupent/ (test faux depuis le lot 3i : le journal contient le début et l’arrêt de la boucle ambiance-vent, sans champ muted ; le jeu coupe bien (gain 0, boucles arrêtées). Échoue 3/3 seul, passe sous charge (boucle pas encore lancée). Correctif : ignorer les entrées loop) ; G : /axe/requête réseau/ ; P : /téléphone : une invitation/ |
| e2e/jeu-stats.spec.js | bureau, mobile | R | doublon e2e | regrouper, palier complet | Cône, portée, dégâts, cadence, vie : couverts par core-spread (29), core-tir-stats (21), core-player-stats (37). | G : /requête/axe/300 appels/valeurs hostiles/ ; G : /même graine, mêmes angles/ (déterminisme) ; V : /cadence : intervalle/vitesse : / (une valeur par niveau) |
| e2e/jeu-textures.spec.js | bureau | R | doublon e2e | regrouper | Textures du lot 1c : couvertes par core-texgen, data-textures ; chargement qui échoue : seul ici. | G : /requête/CLS/stockage/sans \?test=1/budget/ ; P : /introuvable/ne se charge pas/aucun message d'erreur/arrière-plan/écran de préparation/ |
| e2e/jeu-vagues.spec.js | bureau | R | doublon e2e | regrouper, palier complet | Vagues sur la salle : couvertes par core-waves (46), core-wave-director (43), data-vagues. | G : /jamais plus de maxConcurrent/190/axe/budget/requête/16 px/ ; L : /rampe baisse le bassin/pack d'avant/ (pose.js (?perso=actuel) et ?sons=ancien) ; V : /\?wave=\d+ : types et allures/ |
| e2e/jeu-voix.spec.js | bureau, mobile | R | doublon e2e | palier complet | Voix de zombies : couvertes par core-zombie-voice (20), core-sound-director. | E : /derrière un mur est joué étouffé/ (test faux depuis le lot 3i, même cause que jeu-sons:93 : l’entrée de boucle ambiance-vent n’a pas de champ lowpass ; échoue dès que la boucle a démarré (suite complète du 4e, bureau). Correctif : ignorer les entrées loop) |
| e2e/jeu-zones.spec.js | bureau, mobile | R | doublon e2e | regrouper, palier complet | Porte 1, aile, fin de monde : couverts par zones (37), zones-directeur (41), zones-porte-chemin (28). | G : /budget/géométrie de la porte est libérée/axe/appel réseau/bloqué/44 px/ ; L : /map=salle/ |
| e2e/jeu.spec.js | bureau, mobile | P | protège une page | garder | Démarrage de jeu.html : plein écran, clavier (event.code), portrait, axe : fumée naturelle. | G : /axe/requête/noscript/ |
| e2e/persos-atelier.spec.js | bureau | T | page technique | retirer sauf chargement, axe, cibles, CLS | atelier-personnages.html (lot 3j), page à retirer au lot 13. | G : /axe/cibles/CLS/se charge sans erreur/localStorage/ ; L : /« Actuel » : pièces articulées/ |
| e2e/persos-integres.spec.js | bureau, mobile | G | garde-fou | garder, regrouper | Personnages par défaut : invariance de la logique, budgets 45 000 / 400, fuites, axe ; dans la suite rapide. | L : /perso=actuel/ni pose\.js ni character\.js/ ; R : /animations des allures/siège d'une fenêtre/contact : attaque/joueur : marche/escalier : pose/personnages et sang suivent/ (poses couvertes par persos-animations et persos-jeu (unitaires) ; doublon de persos-jeu.spec) |
| e2e/persos-jeu.spec.js | bureau, mobile | F | doublon de persos-integres.spec | fusionner dans persos-integres, palier complet | Essai du lot 3j-D : mêmes poses, invariance, budgets et fuites que persos-integres.spec (lot 3m). | G : /invariance/budget/fuite/axe/console propre/sans \?test=1/ ; P : /tir ou réparation/aucun laser pendant la réparation/ (règle « tir ou réparation » (lot 3j)) ; L : /perso=actuel/ |
| e2e/persos-sang.spec.js | bureau, mobile | T | page technique | retirer sauf axe et budget | Sections sang et mini-arène de atelier-personnages.html. | G : /axe/budget/≤ 3 appels/ |
| e2e/publication.spec.js | bureau, mobile | G | garde-fou | garder | Site assemblé (racine, next/, archives, lots/) : construction et publication du site, axe. |  |
| e2e/sauvegarde.spec.js | bureau, mobile | G | garde-fou | garder | sauvegarde.html : codec, verrouillage, effacement, une seule clé ; mobile justifié. |  |
| e2e/sons-integres-ambiances.spec.js | bureau, mobile | R | doublon e2e | palier complet | Sons nouveaux sur leur événement : couverts par sons-integres-ambiances.test (22). | E : /son nouveau se joue sur son événement/et pas ailleurs/dernière planche arrachée/vent et feu/ (échecs hérités en mobile (3 tests, 3 relances sur 3 aux lots 3m à 4c) ; non reproduits au 4e (suite complète, puis 3 passes isolées) ; durées mobile 25 à 54 s pour un plafond de 60 s : sensibles à la charge (délai), jeu non fautif) ; L : /sons=ancien/ ; G : /maxVoices/ |
| e2e/sons-integres.spec.js | bureau, mobile | R | doublon e2e | palier complet | Sons de l'atelier : empreintes et identifiants couverts par sons-integres.test (35). | L : /sons=ancien/ ; G : /aucun son avant le geste/axe/mode essai/identiques au rendu de Node/ ; T : /sons\.html liste/ |
| e2e/sons-page.spec.js | bureau, mobile | T | page technique | retirer sauf chargement et axe ; sortir de la suite rapide | sons.html (à retirer au lot 13) ; dans la suite rapide en bureau et en mobile. | G : /axe/se charge sans erreur/ |
| unit/atelier-analyse.test.js |  | P | outillage des sons | garder | Analyse pure (crête, niveaux) utilisée par les contrôles des sons intégrés. |  |
| unit/atelier-carte.test.js |  | G | garde-fou | garder | Carte après décisions : règles par zone, simulations sans zombie bloqué. |  |
| unit/atelier-decisions.test.js |  | P | outillage de la carte | garder | Décisions rejouables (npm run carte). |  |
| unit/atelier-decor.test.js |  | G | garde-fou | garder | Décor léger : budget de triangles, hauteurs, zones de dégagement. |  |
| unit/atelier-ecarts.test.js |  | T | page technique | garder (rapide) | ecarts.js, ecarts-svg.js, visite.js : pages ecarts.html et visite.html. |  |
| unit/atelier-hygiene.test.js |  | G | garde-fou | garder ; nettoyer les comparaisons de branche périmées | Pureté des modules de l'atelier de la carte, aucun fichier lourd. |  |
| unit/atelier-releve.test.js |  | P | outillage de la carte | garder | Relevé du modèle (scripts/modele). |  |
| unit/atelier-retours.test.js |  | P | règle de jeu | garder | Sortie latérale d'escalier, emprise des escaliers, murs au plafond. |  |
| unit/atelier-scenes.test.js |  | T | page technique | garder (rapide) | Scènes et propositions de atelier-sons.html. |  |
| unit/atelier-sons-hygiene.test.js |  | G | garde-fou | garder | Pureté de la synthèse 2, jeu inchangé par l'atelier. |  |
| unit/atelier-synth.test.js |  | G | garde-fou | garder | Synthèse 2 (sons du jeu) : rendu déterministe. |  |
| unit/atelier-textures.test.js |  | P | règle de rendu | garder | Textures fines de texgen.js. |  |
| unit/atelier-variantes.test.js |  | T | page technique | garder (rapide) | Variantes de sounds-atelier.json et page atelier-sons.html. |  |
| unit/bank.test.js |  | G | garde-fou | garder | Banque : écritures de la sauvegarde. |  |
| unit/build.test.js |  | G | garde-fou | garder | Construction du site. |  |
| unit/core-ambiance-audio.test.js |  | L | ancien code | retirer si ?sons=ancien n'est plus voulu | Table du pack d'avant (?sons=ancien). |  |
| unit/core-audio-lot3.test.js |  | L | ancien code | retirer si ?sons=ancien n'est plus voulu | Table du pack d'avant (?sons=ancien). |  |
| unit/core-audio-mix.test.js |  | P | règle de jeu | garder | Mixage des sons. |  |
| unit/core-camera.test.js |  | P | règle de jeu | garder | Caméra (perspective, suivi). |  |
| unit/core-collision.test.js |  | P | règle de jeu | garder | Collisions. |  |
| unit/core-color.test.js |  | G | garde-fou | garder | Calcul des contrastes. |  |
| unit/core-combat.test.js |  | P | règle de jeu | garder | Tir automatique. |  |
| unit/core-edge-arrow.test.js |  | P | règle de jeu | garder | Flèches de bord (module encore utilisé par game.js). |  |
| unit/core-enemy-factory.test.js |  | P | règle de jeu | garder | createEnemy. |  |
| unit/core-fog.test.js |  | P | règle de rendu | garder | Brouillard. |  |
| unit/core-footsteps.test.js |  | P | règle de jeu | garder | Pas. |  |
| unit/core-hud-windows.test.js |  | P | règle de jeu | garder | Fenêtres en alerte. |  |
| unit/core-monde-ia-lot3.test.js |  | G | garde-fou | garder | IA : aucun zombie bloqué. |  |
| unit/core-monde-ia.test.js |  | I | instable | étiqueter @instable ; garde-fou (aucun zombie bloqué) : jamais retiré | Intermittent relevé au 4b (simulation longue, délai). |  |
| unit/core-movement.test.js |  | P | règle de jeu | garder | Déplacements. |  |
| unit/core-nav.test.js |  | G | garde-fou | garder | Navigation (connexité). |  |
| unit/core-plank-layout.test.js |  | P | règle de jeu | garder | Planches (42 triangles au plus). |  |
| unit/core-player-down.test.js |  | P | règle de jeu | garder | Chutes. |  |
| unit/core-player-stats-lot3.test.js |  | P | règle de jeu | garder | Statistiques chutes et réparation. |  |
| unit/core-player-stats.test.js |  | P | règle de jeu | garder | Statistiques. |  |
| unit/core-pose-allures.test.js |  | L | ancien code | retirer si ?perso=actuel n'est plus voulu | pose.js (ancien modèle, « actuel » seulement). |  |
| unit/core-pose-lot3.test.js |  | L | ancien code | retirer si ?perso=actuel n'est plus voulu | pose.js (ancien modèle). |  |
| unit/core-pose.test.js |  | L | ancien code | retirer si ?perso=actuel n'est plus voulu | pose.js (ancien modèle). |  |
| unit/core-projectile.test.js |  | P | règle de jeu | garder | Balles. |  |
| unit/core-purity.test.js |  | G | garde-fou | garder | Pureté de js/core/. |  |
| unit/core-ray.test.js |  | P | règle de jeu | garder | Laser. |  |
| unit/core-rng.test.js |  | G | garde-fou | garder | Déterminisme du générateur. |  |
| unit/core-siege.test.js |  | P | règle de jeu | garder | Siège. |  |
| unit/core-sound-director.test.js |  | P | règle de jeu | garder (cas du pack d'avant : L) | Directeur sonore (voix par type, réparation, pack d'avant). |  |
| unit/core-spread.test.js |  | P | règle de jeu | garder | Cône de tir. |  |
| unit/core-stick-aim.test.js |  | P | règle de jeu | garder | Sticks. |  |
| unit/core-synth.test.js |  | P | règle de jeu | garder | synth.js (mélodie et tirs inchangés). |  |
| unit/core-texgen-grain.test.js |  | G | garde-fou | garder | Générateur de textures : déterminisme. |  |
| unit/core-texgen-planche.test.js |  | G | garde-fou | garder | Générateur de textures : déterminisme. |  |
| unit/core-texgen.test.js |  | G | garde-fou | garder | Générateur de textures : déterminisme. |  |
| unit/core-tir-obstacles.test.js |  | P | règle de jeu | garder | Tir et obstacles. |  |
| unit/core-tir-stats.test.js |  | P | règle de jeu | garder | Tir et statistiques. |  |
| unit/core-variants.test.js |  | P | règle de jeu | garder | Variantes. |  |
| unit/core-vec.test.js |  | P | règle de jeu | garder | Vecteurs. |  |
| unit/core-vhs.test.js |  | V | valeurs exactes | garder (rapide) | Plafonds du lot 2c écrits en dur (le test contrôle les données). |  |
| unit/core-viewport.test.js |  | P | règle de jeu | garder | Viewport. |  |
| unit/core-wave-director.test.js |  | P | règle de jeu | garder | Directeur de vagues. |  |
| unit/core-wave-splash.test.js |  | P | règle de jeu | garder | Annonce de vague. |  |
| unit/core-waves.test.js |  | P | règle de jeu | garder | Vagues. |  |
| unit/core-windows.test.js |  | P | règle de jeu | garder | Fenêtres. |  |
| unit/core-zombie-voice.test.js |  | P | règle de jeu | garder | Voix des zombies. |  |
| unit/data-ambiance.test.js |  | G | garde-fou | garder ; nettoyer les comparaisons de branche périmées | Données d'ambiance, hygiène. |  |
| unit/data-annonce-sons.test.js |  | V | valeurs exactes | garder (rapide) | Mesures des sons d'annonce. |  |
| unit/data-changelog.test.js |  | G | garde-fou | garder | Journal des versions (site). |  |
| unit/data-hud.test.js |  | G | garde-fou | garder | Contrastes du HUD. |  |
| unit/data-i18n.test.js |  | G | garde-fou | garder | Clés de texte sans orpheline. |  |
| unit/data-lot3.test.js |  | G | garde-fou | garder ; nettoyer les comparaisons de branche périmées | Données du lot 3, hygiène. |  |
| unit/data-monde.test.js |  | G | garde-fou | garder | Règles de carte (monde). |  |
| unit/data-planches.test.js |  | G | garde-fou | garder | Contraste des planches. |  |
| unit/data-sons-lot3.test.js |  | P | règle de jeu | garder | Recettes de synth.js. |  |
| unit/data-sons.test.js |  | P | règle de jeu | garder (cas du pack d'avant : L) | Recettes de synth.js et pack d'avant. |  |
| unit/data-stats.test.js |  | P | règle de jeu | garder | Données des statistiques. |  |
| unit/data-textures.test.js |  | G | garde-fou | garder | Contraste des textures. |  |
| unit/data-vagues.test.js |  | P | règle de jeu | garder | Données des vagues. |  |
| unit/economie.test.js |  | P | règle de jeu | garder | Économie. |  |
| unit/etage-directeur.test.js |  | P | règle de jeu | garder | Directeur des étages. |  |
| unit/etage-donnees.test.js |  | G | garde-fou | garder | Données d'étage, connexité. |  |
| unit/etage-escaliers.test.js |  | P | règle de jeu | garder | Escaliers. |  |
| unit/etage-floors.test.js |  | P | règle de jeu | garder | Étages. |  |
| unit/etage-fondu.test.js |  | P | règle de jeu | garder | Fondu. |  |
| unit/etage-hygiene.test.js |  | G | garde-fou | garder ; nettoyer les comparaisons de branche périmées | Hygiène de l'étage. |  |
| unit/etage-zombies.test.js |  | G | garde-fou | garder | Zombies sur deux étages : aucun zombie bloqué. |  |
| unit/furniture-model.test.js |  | P | règle de jeu | garder | Meubles. |  |
| unit/game-carte-mesh.test.js |  | G | garde-fou | garder | Maillages de la carte (budget). |  |
| unit/game-data.test.js |  | G | garde-fou | garder | JSON valides du jeu. |  |
| unit/game-windows-mesh.test.js |  | G | garde-fou | garder | Maillages des planches (42 triangles, fuites). |  |
| unit/hygiene.test.js |  | G | garde-fou | garder | Secrets, gros fichiers, dépendances. |  |
| unit/i18n.test.js |  | G | garde-fou | garder | Clés de texte. |  |
| unit/icone.test.js |  | P | protège une page | garder | Icône du site. |  |
| unit/interface-atelier-donnees.test.js |  | T | page technique | garder (rapide) | Données de l'atelier de l'interface. |  |
| unit/interface-atelier-ecrans.test.js |  | T | page technique | garder (rapide) | Écrans fictifs de l'atelier. |  |
| unit/interface-atelier-hygiene.test.js |  | G | garde-fou | garder | Atelier : jeu inchangé, aucun fichier lourd. |  |
| unit/interface-atelier-mesure.test.js |  | G | garde-fou | garder | ui-measure.js : verdicts de cibles, marges et contrastes, utilisés par interface-integree.spec. |  |
| unit/interface-atelier-mock.test.js |  | T | page technique | garder (rapide) | État simulé de l'atelier (ui-mock.js). |  |
| unit/interface-atelier-protos.test.js |  | T | page technique | garder (rapide) | Feuilles proto-a/b/c. |  |
| unit/interface-integree-retours.test.js |  | P | protège une page | garder | Retours du propriétaire sur l'interface. |  |
| unit/interface-integree.test.js |  | G | garde-fou | garder | Interface : formats, jetons, contrastes. |  |
| unit/jeu-html.test.js |  | G | garde-fou | garder | jeu.html. |  |
| unit/lot1-regles.test.js |  | G | garde-fou | garder | Invariance de la logique (simulation de 30 s à graine fixe). |  |
| unit/lots.test.js |  | P | protège une page | garder | js/lots.js. |  |
| unit/map-svg.test.js |  | T | page technique | garder (rapide) | SVG de carte.html. |  |
| unit/maps-conversion.test.js |  | P | règle de jeu | garder | Conversion du plan. |  |
| unit/maps-fidelite.test.js |  | V | valeurs exactes | garder (rapide) | Fidélité au plan relevé. |  |
| unit/maps-hygiene.test.js |  | G | garde-fou | garder | Hygiène des cartes. |  |
| unit/maps-regles.test.js |  | G | garde-fou | garder | Règles de carte (couloirs, connexité). |  |
| unit/package.test.js |  | G | garde-fou | garder | dependencies vide. |  |
| unit/personnages.test.js |  | L | ancien code | retirer si ?perso=actuel n'est plus voulu | character.js (ancien modèle). |  |
| unit/persos-actuels.test.js |  | L | ancien code | retirer si ?perso=actuel n'est plus voulu | Reproduction de character.js en v2 (« current »). |  |
| unit/persos-animations.test.js |  | P | règle de jeu | garder | Animations pose-v2 (glissement des pieds ≤ 15 %). |  |
| unit/persos-arene.test.js |  | T | page technique | garder (rapide) | Mini-arène de l'atelier des personnages. |  |
| unit/persos-donnees.test.js |  | G | garde-fou | garder | Données des personnages, pureté. |  |
| unit/persos-integres-finitions.test.js |  | P | règle de jeu | garder | Chargement allégé, retours du propriétaire. |  |
| unit/persos-integres.test.js |  | G | garde-fou | garder | Invariance, budgets. |  |
| unit/persos-jeu.test.js |  | G | garde-fou | garder ; corriger la comparaison à origin/lot-4b | Invariance des données de logique ; un cas dépend des références Git locales (échoue si origin/lot-4b manque et main est en retard). | I : /données de logique inchangées/ (dépend de origin/lot-4b et de la branche locale main) |
| unit/persos-kit.test.js |  | P | règle de jeu | garder | Kit des personnages. |  |
| unit/persos-page.test.js |  | T | page technique | garder (rapide) | atelier-personnages.html. |  |
| unit/persos-sang.test.js |  | G | garde-fou | garder | Sang : plafonds, déterminisme, budget. |  |
| unit/persos-variantes.test.js |  | P | règle de jeu | garder | Variantes des personnages. |  |
| unit/publication.test.js |  | G | garde-fou | garder | Assembleur, workflow, publication. |  |
| unit/sauvegarde-depots.test.js |  | G | garde-fou | garder | Dépôts de sauvegarde. |  |
| unit/sauvegarde-donnees.test.js |  | G | garde-fou | garder | Données de sauvegarde. |  |
| unit/sauvegarde-page.test.js |  | G | garde-fou | garder | Page de sauvegarde. |  |
| unit/sauvegarde-schema.test.js |  | G | garde-fou | garder | Schéma, migrations, codec. |  |
| unit/sons-integres-ambiances.test.js |  | P | règle de jeu | garder | Sons nouveaux et boucles. |  |
| unit/sons-integres.test.js |  | P | règle de jeu | garder | Sons intégrés. |  |
| unit/stair-walk.test.js |  | P | règle de jeu | garder | Escalier physique. |  |
| unit/structure.test.js |  | G | garde-fou | garder | Structure du dépôt. |  |
| unit/tests-audit.test.js |  | P | outillage des tests | garder | Fonctions de l'audit des tests et classement complet (lot 4e). |  |
| unit/tokens.test.js |  | G | garde-fou | garder | Jetons de couleur, contrastes. |  |
| unit/vendor-three.test.js |  | G | garde-fou | garder | Three.js copié, jamais édité. |  |
| unit/versions-archiver.test.js |  | G | garde-fou | garder | Archiveur de versions. |  |
| unit/versions-schema.test.js |  | G | garde-fou | garder | Schéma de versions.json. |  |
| unit/workflow.test.js |  | G | garde-fou | garder | Workflow : déclencheurs, permissions. |  |
| unit/zones-directeur.test.js |  | P | règle de jeu | garder | Directeur des zones. |  |
| unit/zones-hygiene.test.js |  | G | garde-fou | garder ; nettoyer les comparaisons de branche périmées | Hygiène des zones. |  |
| unit/zones-mobilier.test.js |  | P | règle de jeu | garder | Mobilier de complément. |  |
| unit/zones-porte-chemin.test.js |  | G | garde-fou | garder | Chemins par la porte (connexité). |  |
| unit/zones-rendu.test.js |  | P | règle de jeu | garder | Rendu des zones. |  |
| unit/zones-splash.test.js |  | P | règle de jeu | garder | Annonce de zone. |  |
| unit/zones.test.js |  | P | règle de jeu | garder | Zones. |  |

