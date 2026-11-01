# Intégration des sons de l'atelier (plan pour le lot 3i)

Plan établi au lot 3h, **sans rien intégrer** : le lot 3i appliquera les choix du propriétaire (texte de « Mes choix »). Les poids sont au format du jeu (Float32 mono, 4 octets par échantillon, 22 050 Hz). **Aucun son n'a été écouté par l'agent.** Le plan de chaque emplacement est aussi dans `data/game/sounds-atelier.json` (champ `integration` : identifiants produits, identifiants remplacés, nombre de versions), lu par `scripts/sons/projection.mjs`.

## Principe
1. **Même identifiant** quand un emplacement remplace un son existant (`pas`, `pas-zombie`, voix, `planche-arrachee`, `planche-posee`, `joueur-chute`, `joueur-releve`) : le directeur de sons et ses appels ne changent pas. Les recettes de `synth2.js` ne passent pas par `synth.js` : le lot 3i ajoute à `sounds.json` un champ (par exemple `engine: "synth2"`, `slot`, `variant`, `macros`) et `sound-loader.js` choisit le moteur (seul changement du chargeur).
2. **Nouvel identifiant** pour un son qui n'existe pas (pas extérieur et d'escalier, allures des zombies, rampant, craquement et chute de planche, escalade, propositions) : il faut un nouvel événement dans `sound-director.js` (surface sous le joueur, allure du zombie, début d'escalade…) et une entrée `minDelay` dans `audio.json`.
3. **Niveaux** : les cibles sont des niveaux entendus (tampon + gain de catégorie d'`audio.json`, relatifs au tir) ; les gains de catégorie ne changent donc pas. Écart entendu par rapport à aujourd'hui : pas du joueur +7,5 dB (−25,5 -> −18), voix d'errance +1 dB, attaque +4 dB, chute du joueur −7,2 dB (−2,8 -> −10).
4. **Voix** : deux plans. *Par type* (défaut de la projection) : un jeu de tampons par type de zombie (identifiants `zombie-gemissement-grand`…), timbres propres à chaque type (formants, sifflement du voûté). *Hauteur de lecture* (comme aujourd'hui) : seules les voix du marcheur sont calculées, lues à `zombieRate` (le grand à 0,82…) ; 2,6 Mo de moins (2 713 320 octets avec la variante A), mais les types ne diffèrent plus que par la vitesse de lecture.
5. **Réparation** : la séquence (2 à 5 coups, 0,4 à 1,8 s) se calcule pour la durée du niveau courant de la statistique `reparation` ; autre voie, plus légère : 3 versions d'un coup seul (`reparation-coup`, 0,2 s) jouées par le directeur selon `repairSequence` (changement du directeur, à décider au lot 3i).

## Emplacement par emplacement (variante A par défaut, B pour comparaison)

| Emplacement | Actuel (octets, niveau / tir) | Identifiant(s) produit(s) dans sounds.json | Versions | Octets A / B | Niveau / tir (cible) | Tests à adapter |
|---|---|---|---|---|---|---|
| `pas-joueur-dur` | `pas` : 155232, −25,5 dB | `pas` (même identifiant) | 4 | 45872 / 59984 | −18 dB | `data-sons` (44 100 -> 22 050 Hz, 4 variantes, niveau de la catégorie pas), `core-sound-director` (playerStep), `jeu-sons` |
| `pas-joueur-exterieur` | `pas` : 155232, −25,5 dB | `pas-exterieur` (nouveau) | 4 | 56448 / 70560 | −20 dB | `data-sons` (liste des sons attendus), `core-sound-director` (nouvel événement) |
| `pas-joueur-escalier` | `pas` : 155232, −25,5 dB | `pas-escalier` (nouveau) | 4 | 49392 / 63504 | −18 dB | `data-sons` (liste des sons attendus), `core-sound-director` (nouvel événement) |
| `pas-zombie-lent` | `pas-zombie` : 70560, −17,3 dB | `pas-zombie-lent` (nouveau) | 2 | 52920 / 59976 | −16 dB | `data-sons` (liste des sons attendus), `core-sound-director` (nouvel événement) |
| `pas-zombie-marche` | `pas-zombie` : 70560, −17,3 dB | `pas-zombie` (même identifiant) | 3 | 52920 / 66156 | −16 dB | `data-sons` (2 -> 3 variantes, durée 0,4 -> 0,22 s), `core-sound-director` (pas de zombie) |
| `pas-zombie-course` | `pas-zombie` : 70560, −17,3 dB | `pas-zombie-course` (nouveau) | 2 | 26464 / 31752 | −16 dB | `data-sons` (liste des sons attendus), `core-sound-director` (nouvel événement) |
| `zombie-rampe` | aucun | `zombie-rampe` (nouveau) | 2 | 141120 / 176400 | −18 dB | `data-sons` (liste des sons attendus), `core-sound-director` (nouvel événement) |
| `voix-marcheur-errance` | `zombie-gemissement` : 423360, −11,0 dB | `zombie-gemissement` (même identifiant) | 3 | 449820 / 539784 | −10 dB | `data-sons` (« fondamentale proche de 110 Hz » -> 75-110 Hz ; durée 1,6 -> 1,7 s), `core-zombie-voice`, `jeu-voix` |
| `voix-marcheur-attaque` | `zombie-attaque` : 185220, −12,2 dB | `zombie-attaque` (même identifiant) | 3 | 198456 / 238140 | −8 dB | `data-sons` (fondamentale, durée 0,7 -> 0,75 s), `jeu-voix` (cri d'attaque) |
| `voix-marcheur-touche` | `zombie-blessure` : 119076, −12,2 dB | `zombie-blessure` (même identifiant) | 3 | 84672 / 101604 | −10 dB | `data-sons` (fondamentale, durée 0,45 -> 0,32 s) |
| `voix-marcheur-mort` | `zombie-mort` : 264600, −13,8 dB | `zombie-mort` (même identifiant) | 2 | 264600 / 317520 | −10 dB | `data-sons` (fondamentale, durée) |
| `voix-petit-errance` | `zombie-gemissement` × 1,35 : 423360, −11,0 dB | `zombie-gemissement-petit` (nouveau) ; ou hauteur de lecture : 0 tampon (le tampon du marcheur lu à zombieRate) | 3 | 323868 / 388644 | −10 dB | `data-sons` (liste des sons attendus), `core-sound-director` (nouvel événement) |
| `voix-petit-attaque` | `zombie-attaque` × 1,35 : 185220, −12,2 dB | `zombie-attaque-petit` (nouveau) ; ou hauteur de lecture : 0 tampon (le tampon du marcheur lu à zombieRate) | 3 | 142884 / 171456 | −8 dB | `data-sons` (liste des sons attendus), `core-sound-director` (nouvel événement) |
| `voix-petit-touche` | `zombie-blessure` × 1,35 : 119076, −12,2 dB | `zombie-blessure-petit` (nouveau) ; ou hauteur de lecture : 0 tampon (le tampon du marcheur lu à zombieRate) | 3 | 60960 / 73152 | −10 dB | `data-sons` (liste des sons attendus), `core-sound-director` (nouvel événement) |
| `voix-petit-mort` | `zombie-mort` × 1,35 : 264600, −13,8 dB | `zombie-mort-petit` (nouveau) ; ou hauteur de lecture : 0 tampon (le tampon du marcheur lu à zombieRate) | 2 | 190512 / 228616 | −10 dB | `data-sons` (liste des sons attendus), `core-sound-director` (nouvel événement) |
| `voix-voute-errance` | `zombie-gemissement` × 1,12 : 423360, −11,0 dB | `zombie-gemissement-voute` (nouveau) ; ou hauteur de lecture : 0 tampon (le tampon du marcheur lu à zombieRate) | 3 | 449820 / 539784 | −10 dB | `data-sons` (liste des sons attendus), `core-sound-director` (nouvel événement) |
| `voix-voute-attaque` | `zombie-attaque` × 1,12 : 185220, −12,2 dB | `zombie-attaque-voute` (nouveau) ; ou hauteur de lecture : 0 tampon (le tampon du marcheur lu à zombieRate) | 3 | 198456 / 238140 | −8 dB | `data-sons` (liste des sons attendus), `core-sound-director` (nouvel événement) |
| `voix-voute-touche` | `zombie-blessure` × 1,12 : 119076, −12,2 dB | `zombie-blessure-voute` (nouveau) ; ou hauteur de lecture : 0 tampon (le tampon du marcheur lu à zombieRate) | 3 | 84672 / 101604 | −10 dB | `data-sons` (liste des sons attendus), `core-sound-director` (nouvel événement) |
| `voix-voute-mort` | `zombie-mort` × 1,12 : 264600, −13,8 dB | `zombie-mort-voute` (nouveau) ; ou hauteur de lecture : 0 tampon (le tampon du marcheur lu à zombieRate) | 2 | 264600 / 317520 | −10 dB | `data-sons` (liste des sons attendus), `core-sound-director` (nouvel événement) |
| `voix-grand-errance` | `zombie-gemissement` × 0,82 : 423360, −11,0 dB | `zombie-gemissement-grand` (nouveau) ; ou hauteur de lecture : 0 tampon (le tampon du marcheur lu à zombieRate) | 3 | 449820 / 539784 | −8 dB | `data-sons` (liste des sons attendus), `core-sound-director` (nouvel événement) |
| `voix-grand-attaque` | `zombie-attaque` × 0,82 : 185220, −12,2 dB | `zombie-attaque-grand` (nouveau) ; ou hauteur de lecture : 0 tampon (le tampon du marcheur lu à zombieRate) | 3 | 198456 / 238140 | −6 dB | `data-sons` (liste des sons attendus), `core-sound-director` (nouvel événement) |
| `voix-grand-touche` | `zombie-blessure` × 0,82 : 119076, −12,2 dB | `zombie-blessure-grand` (nouveau) ; ou hauteur de lecture : 0 tampon (le tampon du marcheur lu à zombieRate) | 3 | 84672 / 101604 | −8 dB | `data-sons` (liste des sons attendus), `core-sound-director` (nouvel événement) |
| `voix-grand-mort` | `zombie-mort` × 0,82 : 264600, −13,8 dB | `zombie-mort-grand` (nouveau) ; ou hauteur de lecture : 0 tampon (le tampon du marcheur lu à zombieRate) | 2 | 264600 / 317520 | −8 dB | `data-sons` (liste des sons attendus), `core-sound-director` (nouvel événement) |
| `planche-arrachage` | `planche-arrachee` : 132300, −9,8 dB | `planche-arrachee` (même identifiant) | 3 | 251376 / 304284 | −12 dB | `data-sons-lot3` (attaque < 6 ms, centre de gravité 300-3 000 Hz) |
| `reparation` | `planche-posee` : 119076, −14,0 dB | `planche-posee` (même identifiant) | 3 | 476280 / 476280 | −12 dB | `data-sons-lot3` (« 2 à 3 pics séparés de 80 ms » -> 2 à 5 coups selon la durée), `core-sound-director` (plankRepaired) |
| `reparation-coup` | aucun | variante de remplacement de la réparation (coups seuls, séquence jouée par le directeur de sons) : non comptée par défaut | 0 | 0 / 0 | −12 dB | – |
| `planche-craquement` | aucun | `planche-craquement` (nouveau) | 2 | 149944 / 176400 | −14 dB | `data-sons` (liste des sons attendus), `core-sound-director` (nouvel événement) |
| `planche-chute` | aucun | `planche-chute` (nouveau) | 2 | 132304 / 167584 | −12 dB | `data-sons` (liste des sons attendus), `core-sound-director` (nouvel événement) |
| `escalade` | aucun | `zombie-escalade` (nouveau) | 2 | 264600 / 335160 | −14 dB | `data-sons` (liste des sons attendus), `core-sound-director` (nouvel événement) |
| `joueur-souffle-terre` | `joueur-chute` : 229320, −2,8 dB | `joueur-chute` (même identifiant) | 2 | 299880 / 370440 | −10 dB | `data-sons-lot3` (« pic dans les 80 premières ms, 1,0 à 1,5 s » -> grognement d'abord, 1,7 s) |
| `joueur-relevage` | `joueur-releve` : 141120, −9,6 dB | `joueur-releve` (même identifiant) | 2 | 149944 / 185224 | −12 dB | `data-sons-lot3` (0,6 à 1,0 s : tenu) |
| `ambiance-vent` | aucun | `ambiance-vent` (nouveau) | 1 | 882000 / 882000 | −24 dB | `data-sons` (liste des sons attendus), `core-sound-director` (nouvel événement) |
| `ambiance-grincements` | aucun | `ambiance-grincements` (nouveau) | 2 | 529200 / 617400 | −22 dB | `data-sons` (liste des sons attendus), `core-sound-director` (nouvel événement) |
| `ambiance-neon` | aucun | `ambiance-neon` (nouveau) | 1 | 705600 / 705600 | −30 dB | `data-sons` (liste des sons attendus), `core-sound-director` (nouvel événement) |
| `joueur-coeur` | aucun | `joueur-coeur` (nouveau) | 1 | 141120 / 141120 | −14 dB | `data-sons` (liste des sons attendus), `core-sound-director` (nouvel événement) |
| `joueur-essouffle` | aucun | `joueur-essouffle` (nouveau) | 2 | 352800 / 352800 | −14 dB | `data-sons` (liste des sons attendus), `core-sound-director` (nouvel événement) |
| `ambiance-lointains` | aucun | `ambiance-lointains` (nouveau) | 2 | 529200 / 670320 | −24 dB | `data-sons` (liste des sons attendus), `core-sound-director` (nouvel événement) |
| `porte-enfoncee` | aucun | `porte-enfoncee` (nouveau) | 1 | 105840 / 105840 | −8 dB | `data-sons` (liste des sons attendus), `core-sound-director` (nouvel événement) |
| `interface-piece` | aucun | `interface-piece` (nouveau) | 3 | 119076 / 132300 | −14 dB | `data-sons` (liste des sons attendus), `core-sound-director` (nouvel événement) |
| `interface-achat` | aucun | `interface-achat` (nouveau) | 1 | 97020 / 110252 | −12 dB | `data-sons` (liste des sons attendus), `core-sound-director` (nouvel événement) |
| `ambiance-feu` | aucun | `ambiance-feu` (nouveau) | 1 | 705600 / 705600 | −22 dB | `data-sons` (liste des sons attendus), `core-sound-director` (nouvel événement) |

## Projections (`node scripts/sons/projection.mjs`, mesurées sur cette machine)

| Choix | Voix | Poids projeté | Limite 8 Mo | Calcul au chargement (référence) |
|---|---|---|---|---|
| **Choix du propriétaire** (`Docs/ref/choix-sons-3h.txt`, emplacements cités seulement) | par type | 11 663 632 octets (11,12 Mo) | **dépassée** de 3,1 Mo | 3 022 ms (1 379 ms) |
| **Choix du propriétaire** | hauteur de lecture | 9 628 648 octets (9,18 Mo) | **dépassée** de 1,2 Mo | 2 242 ms (1 292 ms) |
| A partout (priorités 1 et 2) | par type | 15 082 536 octets (14,38 Mo) | **dépassée** de 6,4 Mo | 3 935 ms (1 399 ms) |
| B partout (priorités 1 et 2) | par type | 16 474 696 octets (15,71 Mo) | **dépassée** de 7,7 Mo | 4 398 ms (1 435 ms) |
| A partout (priorités 1 et 2) | hauteur de lecture | 12 369 216 octets (11,80 Mo) | **dépassée** de 3,8 Mo | 3 084 ms (1 458 ms) |
| B partout (priorités 1 et 2) | hauteur de lecture | 13 218 732 octets (12,61 Mo) | **dépassée** de 4,6 Mo | 3 683 ms (1 462 ms) |
| A partout, priorité 1 seule | hauteur de lecture | 8 201 760 octets (7,82 Mo) | tenue | 2 088 ms (1 428 ms) |
| B partout, priorité 1 seule | hauteur de lecture | 8 795 500 octets (8,39 Mo) | **dépassée** de 0,39 Mo | 2 187 ms (1 291 ms) |

Itération 2 : avec les choix du propriétaire (les sons encore à réécouter ne sont pas comptés), les plus gros postes sont le vent (10 s : 882 000 octets), les gémissements lointains B (2 × 3,8 s : 670 320), les voix par type et le feu s'il est retenu (8 s : 705 600). Pistes : boucles de 4 à 6 s, une seule version des gémissements lointains, voix à la hauteur de lecture.

Référence : 6 894 612 octets (6,58 Mo), 65 tampons ; le temps de référence varie de 1 219 à 1 541 ms d'une exécution à l'autre (charge de la machine). Ce qui pèse : les boucles d'ambiance (vent 10 s : 882 000 octets ; néon 8 s : 705 600), les voix par type (×4), la réparation à 1,8 s (3 × 158 760 octets), l'escalade (2 × 1,5 s). **À raccourcir si besoin** (le script les liste par poids décroissant) : boucles de 10 et 8 s -> 4 à 6 s, voix par type -> hauteur de lecture, réparation -> coups seuls, deux versions au lieu de trois pour les sons longs. Le plafond de 8 Mo et la fréquence d'échantillonnage du jeu ne changent pas (hors lot).

## Procédure (lot 3i)
1. Relire le texte de « Mes choix » du propriétaire : `node scripts/sons/projection.mjs --choix=mes-choix.txt [--voix=hauteur] [--p1]` (les lignes invalides sont signalées) ; ajuster le nombre de versions ou les durées jusqu'à tenir les 8 Mo.
2. Ajouter le moteur `synth2` au chargeur, les recettes choisies à `sounds.json` (mêmes identifiants pour les remplacements), les nouveaux événements au directeur de sons.
3. Adapter les tests listés ci-dessus (durées, fondamentales, nombre de pics, niveaux) en gardant leur intention ; garder intacts la mélodie de début de manche et les coups de feu (test d'égalité des recettes du lot 3h).
4. Écouter sur téléphone (le propriétaire), retirer `atelier-sons.html` au lot 13 avec `sons.html`.
