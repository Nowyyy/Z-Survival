# Sons à intégrer (lot 3i) : à quoi sert chaque son

Fiche d'intégration des choix du propriétaire (lot 3h). Source des choix : `data/game/sounds-atelier-choix.txt` (variante et réglages de chaque emplacement, au format de « Mes choix ») ; recettes : `data/game/sounds-atelier.json` (moteur `js/core/synth2.js`) ; plan détaillé : `Docs/ref/integration-sons.md`. **Aucun son n'a été écouté par l'agent** ; les déclencheurs proposés ci-dessous sont à valider en jeu.

## Règles communes
- **Taille** : la limite de 8 Mo est levée par le propriétaire (lot 3h, après les choix). Au lot 3i, relever ou retirer le plafond du test `data-sons` (« mémoire audio 8 Mo au plus ») et la mention de `CLAUDE.md` ; garder les voix **par type** (un jeu de tampons par type de zombie, timbres propres) plutôt que la hauteur de lecture.
- **Format** : Float32 mono, 22 050 Hz. **Même identifiant** quand le son remplace un son du jeu (« remplace » ci-dessous) : directeur de sons et appels inchangés ; **nouvel identifiant** sinon (« nouveau ») : ajouter l'événement au directeur de sons (`js/core/sound-director.js`) et un délai minimal dans `audio.json`.
- **Niveaux** : réglés « tels qu'entendus » avec le gain de catégorie actuel d'`audio.json` ; ne pas changer ces gains. Spatialisation par défaut : distance (`distanceGain`), étouffement par les murs, autre étage étouffé (règles existantes) ; « non spatialisé » = son du joueur ou d'interface, au centre.
- **Versions** : jouer les versions au hasard sans répéter la précédente (`pickVariant`, comme aujourd'hui).
- **Gardés tels quels** : mélodie de début de manche, annonces de vague, tir, douille, impacts de balles, `joueur-chute` et `joueur-releve` (choix « actuel »), `joueur-blesse`, `joueur-mort`, `zombie-grognement`, `zombie-plainte`, `zombie-souffle`, sons d'interface, `ambiance`.

## Pas
| Identifiant | Choix | Sert à / quand le jouer | Remarques |
|---|---|---|---|
| `pas` (remplace) | `pas-joueur-dur` C, hauteur −3 | Pas du joueur sur sol dur (carrelage, béton) : événement `playerStep` existant. | 4 versions ; non spatialisé (balance gauche/droite du pied, comme aujourd'hui). |
| `pas-exterieur` (nouveau) | `pas-joueur-exterieur` A | Pas du joueur dehors (terre, herbe). | Choisir `pas` ou `pas-exterieur` selon la surface sous le joueur (nouvelle donnée de carte : intérieur / extérieur). |
| `pas-escalier` (nouveau) | `pas-joueur-escalier` C, hauteur −3 | Pas du joueur dans un escalier (tube de `stair-walk.js`). | Remplace `pas` tant que le joueur est dans l'escalier. |
| `pas-zombie-lent` (nouveau) | A | Pas d'un zombie à l'allure `lent`. | Même logique que `pas-zombie` (3 plus proches, à moins de 450). |
| `pas-zombie` (remplace) | `pas-zombie-marche` A | Pas d'un zombie à l'allure `marche`. | 3 versions. |
| `pas-zombie-course` (nouveau) | A | Pas d'un zombie à l'allure `course`. | Cadence plus serrée : délai minimal plus court (environ 0,06 s). |
| `zombie-rampe` (nouveau) | B | Frottement d'un zombie rampant (allure `rampe`, aujourd'hui muette dans `silentGaits`). | 1 s ; un frottement par cycle de foulée, 2 plus proches au plus. |

## Voix des zombies (une recette par type : marcheur, petit, voûté, grand)
| Identifiants | Choix | Sert à / quand le jouer |
|---|---|---|
| `zombie-gemissement` (marcheur, remplace) + `zombie-gemissement-petit`, `-voute`, `-grand` (nouveaux) | errance : C pour les quatre types | Voix d'errance tirées par `zombie-voice.js` (type « gemissement ») : choisir l'identifiant du type du zombie qui parle, lu à la hauteur 1 (la hauteur par type est dans la recette, ne plus appliquer `zombieRate`). |
| `zombie-attaque` + `-petit`, `-voute`, `-grand` | attaque : marcheur C (hauteur −6, durée × 0,7), petit C, voûté C, grand C | Cri d'attaque au contact (`zombieAttack`). |
| `zombie-blessure` + `-petit`, `-voute`, `-grand` | touché : marcheur B (hauteur −5), petit C, voûté C, grand C | Zombie touché sans mourir (`zombieHit`, `killed: false`), à l'impact. |
| `zombie-mort` + `-petit`, `-voute`, `-grand` | mort : marcheur C, petit C (hauteur +3), voûté C, grand C | Mort d'un zombie (`zombieHit`, `killed: true`). |

## Planches, fenêtre
| Identifiant | Choix | Sert à / quand le jouer | Remarques |
|---|---|---|---|
| `planche-arrachee` (remplace) | `planche-arrachage` A | Un zombie arrache une planche (`plankTorn`) : bois qui gémit, éclate puis tombe (0,95 s). | Contient déjà la chute : ne pas jouer `planche-chute` en plus pour la même planche. Traverse l'ouverture (jamais étouffé), 120 ms par fenêtre. |
| `planche-posee` (remplace) | `reparation` C | Le joueur répare une planche (`plankRepaired`) : raclement puis 2 à 5 coups de marteau. | **Durée = durée de réparation** du niveau de la statistique `reparation` (0,4 à 1,8 s) : calculer le tampon pour ce niveau (ou jouer `planche-coup` coup par coup avec `repairSequence`). Déclencher au **début** de la pose. |
| `planche-coup` (nouveau, facultatif) | `reparation-coup` C | Un coup de marteau seul (même marteau que la réparation). | Seulement si la réparation est jouée coup par coup ; sinon inutile. |
| `planche-craquement` (nouveau) | A | La dernière planche d'une fenêtre cède (ou une planche qui va lâcher : arrachage à plus de 80 %). | 0,85 s ; traverse l'ouverture. |
| `planche-chute` (nouveau) | A | Une planche tombe au sol sans arrachage (débris projeté, porte qui bouscule, etc.). | Rebonds secs, 0,75 s. |
| `zombie-escalade` (nouveau) | `escalade` C | Un zombie franchit la fenêtre (mode `escalade` de `siege.js`) : prises sur l'appui, frottement, réception. | 1,05 s ; jouer au début de l'escalade, à la position de la fenêtre. |

## Joueur, ambiance, interface
| Identifiant | Choix | Sert à / quand le jouer | Remarques |
|---|---|---|---|
| `joueur-coeur` (nouveau) | B | Battement de cœur quand la vie est basse (seuil à régler, par exemple ≤ 25 %). | 1,6 s, à relancer en boucle tant que la vie reste basse ; non spatialisé ; s'arrête à terre et à la mort. |
| `ambiance-vent` (nouveau) | A | Vent qui passe par les fenêtres. | Boucle de 10 s sans raccord ; volume selon la distance à la fenêtre ouverte la plus proche (ou fond constant faible). |
| `ambiance-grincements` (nouveau) | B | Bois du bâtiment qui travaille, de temps en temps. | 3,5 s ; au hasard, toutes les 20 à 60 s, position aléatoire dans le bâtiment. |
| `ambiance-lointains` (nouveau) | B | Gémissements lointains pendant les pauses entre les manches (pause de 12 s). | 3,8 s ; une fois par pause, après « Vague N terminée » ; déjà filtré comme lointain : non spatialisé. |
| `ambiance-feu` (nouveau) | B | Feu qui crépite près des sources de feu ajoutées au décor. | Boucle de 8 s sans raccord ; spatialisé à la position du feu (plusieurs feux : une source par feu proche). |
| `porte-enfoncee` (nouveau) | A | Le bloc d'une porte s'enfonce dans le sol à l'ouverture d'une zone (en 1,2 s, à 3,6 s de la pause). | 1,2 s, aligné sur l'animation ; spatialisé à la position de la porte. |
| `interface-achat` (nouveau) | B, durée × 0,85 | Validation d'un achat dans la boutique (lot 5). | « Ka-ching » de 1,06 s ; non spatialisé. |

## Écartés (choix « aucun »)
`ambiance-neon` (pas de néon dans le jeu), `joueur-essouffle` (pas de sprint), `interface-piece` (pas de son de pièce ramassée).
