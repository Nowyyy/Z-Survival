# Lot 9k — Armes à acheter sur la carte : trois caisses (pompe, Kar98k, Thompson), achat et rachat en Zollars, équilibrage provisoire (V0.9)

- **Base** : `origin/dev` `5d3d766` (bilan 9j présent, Tests verts) ; branche `lot-9k` ; commits : A `26890f6` (relevé), B `f00ac85`, `5117261`, `416bf15` (proposition et deux révisions, arrêt), C `ddf268c` (caisses), D `d020c65` (équilibrage), E (ce bilan). Fiches : `Docs/ref/armes.md` (relevé), `Docs/ref/armes-en-main.md` (proposition, résultats C et D).
- **Choix du propriétaire** : « Un minimum dur », le joueur meurt et progresse par ses objets (à la Archero) ; armes : **dégâts et prix seulement** (chargeur, réserve, cadence, rechargement gardés) ; **vie des zombies plus régulière, coups inchangés** ; joueur automatique qui répare ; **pompe et Kar98k faibles assumés** ; places A (Thompson en B, forcée), touche B ; « Go comme ça, on testera ».
## Caisses
| Pièce (ouverture) | Place | Arme | Prix | Rachat |
|---|---|---|---|---|
| Aile (manche 11) | A, mur est (1440, 1205) | Winchester M1897 | 750 Z | 260 Z |
| Étage gauche (21) | A, mur est (1440, 1491) | Kar98k | 2 400 Z | 840 Z |
| Étage droite (31) | B, mur est (2215, 2300) | Thompson M1928 | 5 000 Z | 1 750 Z |
- **Achat** : **B** au clavier ; message à deux cases sous le joueur (« Acheter Winchester M1897 — 750 Z », « Munitions — 260 Z », grisé « Il manque N Z ») ; bouton tactile au-dessus des emplacements (44 px) ; refus expliqués : Zollars, recharge, changement d'arme, à terre, munitions pleines ; son `arme-achat`. L'arme va dans le second emplacement, le Colt reste dans le premier ; rien n'est écrit (Zollars dépensés en mémoire, `bank.js`). Logique pure `js/core/armes/achat.js` ; débogage « Armes ouvertes ». Carte : `caisses-armes.json` → `npm run carte` : obstacles `caisse-arme` 70 × 30, 22 de haut, tirs par-dessus ; les bidons de l'aile cèdent la place.
## Équilibrage
| Arme | Dégâts (avant) | Dégâts/s théoriques | Aisance 1 / 10 / 11 / 21 / 31 / 40 |
|---|---|---|---|
| Colt M1911 | 50 (25) | 125 | 2,27 / 0,51 / 0,48 / 0,19 / 0,13 / 0,10 |
| Winchester | 55 × 8 (=) | 489 | 1,16 / 0,73 / 0,69 / 0,36 / 0,28 / 0,21 |
| Kar98k | 320 (=) | 305 | 0,75 / 0,47 / 0,45 / 0,23 / 0,20 / 0,18 |
| Thompson | 150 (90) | 1 667 | 7,08 / 3,43 / 3,24 / 1,37 / 1,08 / 0,76 |
- Zombies : vie +10 %/manche jusqu'à la 20, puis ×1,04 (marcheur 50 / 95 / 151 / 223 / 318 aux manches 1 / 10 / 21 / 31 / 40 ; avant : 50 / 275 / 785 / 1 500 / 1 500) ; coups, nombres, vitesses inchangés. Joueur automatique (graines 1–6, répare) : sans équipement 7–10 (médiane 10), jamais la 11 ; équipement de référence : 10–12, deux graines achètent le pompe et tiennent jusqu'à 15 et 18 ; Thompson donnée à la 31 : 31 sans, 33–37 avec. Gains par manche identiques ; par partie (médianes, Colt seul) : 1 299 Z, 190 médailles, 50 diamants.
- **Zombies et chemins** : Vitesses, apparitions, types et chemins inchangés ; arrivées (manche 10, graines 1–6) identiques ; `blocage.mjs` : 0 coincé avec les caisses.
- **Preuves** : 1 trace : `?equilibrage=avant` identique à chaque pas à la référence 9j ; nouvelle référence (`scripts/perf/trace-reference.json`, base `d020c65`). 2 arrivées identiques. 3 aucun blocage. 4 rendu : U1, U4 +3 appels, +1 198 triangles (pire cas Élevé 40 749 / 84). 5 Lighthouse `jeu.html` médiane 80, `index.html` 90. 6 aucune écriture, aucune requête externe (`achat-armes.spec`).
- **Tests adaptés** : Données changées (raison en commentaire) : maps-conversion, furniture-model, tirs-traverse, data-vagues, core-waves, zones-hygiene, lot1-regles, hygiènes atelier/étage/cartes, persos-jeu, sauvegarde-donnees, armes-partie, graphismes, carte-jeu, argent, jeu-combat, jeu-vagues ; en E : budgets `carte-jeu` (référence remesurée sur `dev`, par format) et `decor-epoque-jeu` (+3 appels des caisses), `persos-integres` (visée détournée), `jeu-sons` (zombie de la manche 10) ; journal (data-changelog, publication). Nouveaux : achat-armes (unitaire, e2e), equilibrage-armes, lot9k-gel.
- **CI** : A, B verts ; C et D rouges (budgets de rendu, puis Colt à 50 : tests ci-dessus), corrigés en E ; E : résultat dans la Pull Request de fusion.
- **Points ouverts** : Ressenti (dureté, intérêt de chaque arme, prix) : jugé par le propriétaire seulement. Progression plafonnée : vie et régénération au niveau 10 dès l'équipement de référence ; Kar98k piège à la carte 1 ; budget `carte-jeu` déjà dépassé sur `dev` avant ce lot (décor des murs 9j).
- **Idées** : Objets plus forts ou plafonds plus hauts (`objets.json`, `player-stats.json`) ; perforation du Kar98k ; boîte mystère.
- **Entrée du journal** : `lot-9k` (v0.9, 2026-11-23) « Armes à acheter sur la carte » (4 points) ; bloc `[lot-9k]` (`afficher: oui`) ; entrée et bloc du lot 9j déjà complets sur `dev` (éboulis fin, décor des murs), vérifiés.
- **Lignes à ajouter à `CLAUDE.md` et `conventions.md`** : `CLAUDE.md` : « Achat d'armes (lot 9k) : caisses-armes.json → npm run carte ; js/core/armes/achat.js ; touche B ; Zollars dépensés en mémoire (bank.js), jamais écrits ; ?test=1&equilibrage=avant ; Docs/ref/armes-en-main.md. » ; `conventions.md` : « Caisses d'armes : obstacles kind `caisse-arme` (tirs par-dessus), dessin `js/game/caisses-armes-mesh.js`, étage du joueur seulement. »
- **Passages du seed à réécrire par le propriétaire** : l. 3 (lots faits : ajouter 9k) ; l. 6 et l. 125 (« serviront à acheter des armes », « rien ne s'achète encore ») ; l. 93 (« s'achèteront sur la carte (lot 6) ») ; l. 94 (« à venir : achat d'armes sur la carte »).
## À faire par moi
1. Sur PC et téléphone, jouer une partie jusqu'à la manche 21 au moins sans équipement, puis une avec l'équipement de référence, en achetant les armes.
2. Dire si chaque arme « suit » assez, trop ou pas assez, et si les prix sont justes.
3. Valeurs dans `data/game/armes-partie.json` (et `waves.json` → `hp`) : provisoires, modifiables sans lot.
