# Économie : trois monnaies, médailles, caisses à pitié (lot 8k, V0.8 ; interversion du lot 9a, V0.9)

## 0. Lot 9a : médailles et diamants intervertis, Zollars (décision du propriétaire après la V0.8)
| Monnaie (nom à l'écran) | Champ du code et de la sauvegarde | Se gagne | Sert à | Icône, couleur |
|---|---|---|---|---|
| **Zollars** (jaune) | aucun (journal `createLedger`, jamais écrit) | 10 par zombie tué par balle, 1 par planche ; 0 à chaque partie | armes sur la carte (lot 6) : rien encore | pièce, `--color-money` |
| **Médailles** | `bleu` (`gagne`, `depense`) ; économie : `waveBonus*`, `reinforcedBonusMul`, `worldBonus`, `maxBleu` | **20 par manche terminée** (30 renforcée), **500 par fin de monde** | **améliorer objets et personnages, fusion, offres du jour** | médaille, `--color-money-medaille` |
| **Diamants** | `medailles` (`gagne`, `depense`, `jour`) ; économie : `medaille*`, `maxMedailles` | **+10 par porte**, **+10 tous les 1 000 zombies**, **+50 par palier de 5 manches** (première fois), **+300 au premier monde**, **+100 à la première partie du jour** | **les trois caisses** (100 ; ×10 : 1 000 ; pitié inchangée) | gemme, `--color-money-blue` |
- **Valeurs inchangées** ; seules les places des monnaies changent. **Choix des noms internes** : les champs gardent leur nom, qui dit désormais **l'origine** du solde (`bleu` = manches et monde, `medailles` = progrès et jour), et l'écran seul fait foi. Raison : chaque solde suit déjà la façon dont il a été gagné, donc l'interversion des soldes et des totaux demandée est exactement un échange de **noms d'écran** ; aucune donnée n'est déplacée, rien ne peut être appliqué deux fois (rechargement, onglets, import `ZS2` d'avant ou de ce lot), pitié, paliers, mondes et jour sont intacts, et la V0.8 de la Recette, qui partage `zs.save.v2`, lit les mêmes champs sans rien pouvoir défaire (détail : `sauvegarde-v2.md`, section 13). Une migration qui échangerait les champs aurait exigé une marque de format que la V0.8 efface en réécrivant (champ inconnu) : risque de double échange, donc écarté.
- **Écran** : chaque emplacement garde son champ ; icône, couleur et nom suivent la monnaie : en-tête du menu (`#menu-solde` : médailles, puis `#menu-medailles` : diamants), pause (`#pause-balance` : médailles, `.pause-medailles` : diamants), écran de fin (« Solde médailles » puis « Solde diamants », chacun avec son « +gain »), fin de manche (`#hud-bleu-manche` : médaille), portes, milliers et paliers (`#hud-medailles-manche` : gemme), « +N » de fin de manche (`#hud-gain-bleu` : médaille), Boutique (gemme et « Il manque N diamants » ; nom accessible « · prix en diamants : »), « Rouvrir » (diamants, solde des caisses : il lisait la bleue à tort depuis le lot 8k), Inventaire, Fusion, Personnages et offres (« Il manque N médailles », « Médailles insuffisantes »), Profil (« Médailles gagnées » = `bleu.gagne`, « Diamants gagnés » = `medailles.gagne`), `sauvegarde.html`, outils de débogage (« Ajouter 10 000 médailles » : `bleu` ; « Ajouter 1 000 diamants » : `medailles`). Zollars : HUD (nom accessible « Zollars : N »), confirmation de « Quitter » (« les Zollars de cette partie seront perdus »), « Zollars de départ » (débogage).
- **« Quitter » et « Recommencer »** ne créditent rien de plus que ce qui a déjà été écrit (manches, portes, milliers, paliers) ; **la partie du jour se compte à la mort ou à la fin du monde seulement** (`bank.runEnd`, raisons `death` et `world`). Avant : +100 de la monnaie des caisses à « Quitter » ou « Recommencer » si une manche était terminée.
- Les sections 1 à 6 ci-dessous décrivent le lot 8k avec les **noms d'écran de la V0.8** (« diamants » = champ `bleu`, « médailles » = champ `medailles`) : lire avec la table ci-dessus.


**Nom affiché** (retour du propriétaire après le lot 8k) : la monnaie bleue s'appelle **« diamants »** dans tout le jeu (gemme bleue) ; le code et la sauvegarde gardent `bleu`. Fiche de référence (lot 8k, branche `lot-8k`, base `origin/dev` `3c25e3a`, seed 0.33). Décisions du propriétaire : prompt du lot 8k. **Toutes les valeurs sont provisoires et se règlent sans lot** dans `data/game/economy.json` et `data/menu/caisses.json` (section 6). Les noms de fichiers et de clés sont des données.

## 1. Trois monnaies
| Monnaie | Se gagne | Sert à | Gardée | Code |
|---|---|---|---|---|
| **Jaune** | 10 par zombie tué par balle, 1 par planche posée | armes sur la carte (lot 6, V0.9) | non (0 à chaque partie, jamais écrite) | `js/core/economy.js`, `js/game/bank.js` (journal `createLedger`) |
| **Diamants** (ex-bleue) | **20 par manche terminée** (×1,5 renforcée), **500** à chaque fin de monde (répétable) | améliorer un objet ou un personnage, fusion, offres du jour | oui (plafond 9 999 999) | `bank.waveEnd`, `bank.worldEnd` → opération `gain` (`bleu`) |
| **Médailles** (nom provisoire) | portes, milliers de zombies, paliers, premier monde terminé, première partie du jour (section 2) | **caisses** (100 ; ×10 : 1 000) | oui (plafond 9 999 999) | `bank.door`, `bank.kill`, `bank.waveEnd`, `bank.worldEnd`, `bank.runEnd` → opération `gain` (`medailles`, `palier`, `mondeFini`, `jour`) |
- Calcul de l'argent et des médailles : `js/core/economy.js` seulement (`waveBonus`, `worldBonus`, `medaillePorte`, `medaillesZombies`, `paliersNouveaux`, `medaillePalier`, `medailleMonde`, `medailleJour`, `jourLocal`).
- Départ : solde bleu gardé ; médailles 0 ; paliers et mondes « récompensés » vides pour tous, **aucun crédit rétroactif** (les records et mondes terminés d'avant le lot ne servent pas à les remplir).

## 2. Gains de médailles (écrits au moment du gain, jamais perdus ensuite)
| Source | Gain | Répétable | Moment d'écriture | Jamais deux fois |
|---|---|---|---|---|
| Porte ouverte (événement `doorOpen`, lecture seule) | 10 | oui, à chaque partie | aussitôt | identifiant d'opération (journal) |
| Chaque millier de zombies tués par balle dans la partie | 10 | oui (compteur remis à 0 à chaque partie) | au millième tué | identifiant d'opération |
| Palier : toutes les 5 manches **terminées**, par monde (histoire) et par carte (infini) | 50 | non | fin de la manche | `paliers[mode][monde]` = plus haut palier récompensé ; crédit = paliers au-delà de la valeur la plus récente |
| Premier monde terminé | 300 | non | fin du monde | `mondesFinis` |
| Première partie du jour (date locale), au moins une manche terminée | 100 | une fois par jour | fin de partie (mort, monde, Quitter, Recommencer) | `medailles.jour` : crédité seulement si le jour est plus grand |
- Affichage : en partie, médaille puis « solde (+gain) » sous les diamants pendant `bleuManche.duree` s de jeu (`js/game/bleu-manche.js`, bloc à part, gains rapprochés additionnés, aucune animation) ; pause (gemme puis médaille) ; E2-7 (retour du propriétaire : à gauche vague atteinte avec « Record » en jaune sur la même ligne, meilleure manche, zombies tués ; à droite « Solde diamants : N » puis « +gain », « Solde médailles : N » puis « +gain » ; plus de jaune perdue, de prime du monde ni de sources) ; en-tête du menu (« Diamants : N », « Médailles : N ») ; Profil (« Médailles gagnées », total) ; `sauvegarde.html`.
- Modes sans écriture (mode essai, `?endless=1`, `?test=1` en mémoire) : affichées pour la session, jamais écrites.

## 3. Caisses : une par rubrique
| Rubrique | `id` | Dessin (menu et 3D) | Teinte | Chances de base |
|---|---|---|---|---|
| Équipement | `equipement` | `militaire` (caisse à munitions) | `--rarete-rare` | commun 54, peu commun 30, rare 10, épique 5, légendaire 1 |
| Personnages | `personnages` | `veterans` (malle) | `--rarete-epique` | rare 94, épique 5, légendaire 1 |
| Cosmétiques | `cosmetiques` | `tenues` (valise) | `--rarete-peu-commun` | commun 54, peu commun 30, rare 10, épique 5, légendaire 1 |
- Les neuf anciennes caisses (ravitaillement, militaire, élite ; recrues, vétérans, légendes ; tenues, mode, haute couture) sont fusionnées ; leurs dessins restent acceptés par le code.
- **Personnages** : chacun a une rareté (`data/menu/personnages.json` → `rarete` ; provisoire : Survivant, [Personnage 2], [3] rares ; [4], [5] épiques ; [6] légendaire) ; tirage d'une rareté, puis d'un personnage de cette rareté ; nouveau = débloqué, doublon = +1 niveau (lot 8e).
- Effets de l'ouverture 3D inchangés (lot 8f) : un personnage nouveau prend les effets de la teinte de sa caisse (épique), un doublon ceux du commun.

## 4. Pitié (compteur propre à chaque rubrique)
- **Épique ou mieux garanti au 10e tirage** sans épique ni légendaire. **Légendaire** : chance de base jusqu'au 50e tirage sans légendaire, puis +5 points par tirage (6 % au 51e… 96 % au 69e), **garanti au 70e**. Hors légendaire, les autres raretés gardent leurs proportions de base ; à la garantie épique, seules les raretés hautes restent.
- Compteurs `pitie[rubrique] = { e, l }` (tirages depuis le dernier épique ou mieux, depuis le dernier légendaire) ; un compteur repart à 0 quand sa rareté ou mieux tombe ; ×10 = dix tirages qui avancent les compteurs dans l'ordre (`tirerPitie` de `js/core/caisses.js` : même graine et mêmes compteurs, même résultat).
- Achat : compteurs relus juste avant le tirage ; prix en médailles, contenu et nouveaux compteurs dans **la même opération** (`achat` avec `monnaie: 'medailles'`, `pitie: { r, de, a }`) ; refusée en entier si les compteurs ne sont plus `de` (autre onglet : « Achat annulé… réessaie »).
- Mesuré (100 000 tirages par rubrique) : jamais plus de 9 tirages de suite sans épique, au plus 64 sans légendaire ; légendaire 2,36 à 2,37 % ; épique ou mieux ≈ 13,8 % ; légendaire en 42,1 à 42,4 tirages en moyenne (calcul exact : 42,6).
- **Aperçu à droite de chaque caisse** (retour du propriétaire : une seule caisse laissait la droite vide) : « Ta pitié dans cette caisse » (légendaire seulement : jauge N / 70 avec un repère au tirage où la chance monte, tirages avant la garantie, chance au prochain tirage ; retour du propriétaire : **plus aucune information sur la garantie épique** affichée, ni ici ni dans « Voir les chances », la règle restant appliquée au tirage), puis « Légendaires possibles » (six au plus, « et N autres »). Sur téléphone (hauteur ≤ 520 px), colonne des rubriques et bandeau de la Boutique plus étroits.
- « Voir les chances » : chances de base, règle de pitié du légendaire (valeurs lues dans les données), « Légendaire garanti dans N tirages au plus » ; boutons grisés « Il manque N médailles » avec leur raison.
- Outils de débogage (canaux `source` et `dev`) : « Ajouter 1 000 médailles », « Remettre la pitié à zéro » (avec ceux du lot 8h).

## 5. Format v2 (champs ajoutés, `v` reste 2) : `Docs/ref/sauvegarde-v2.md`, section 12.

## 6. Ce que le propriétaire règle sans lot
- `data/game/economy.json` : `waveBonusBase` (20), `waveBonusPerWave` (0 : gain fixe ; > 0 refait grandir la bleue avec la manche), `reinforcedBonusMul` (1,5), `worldBonus` (500), `maxBleu` ; `medaillePorte` (10), `medailleZombies` (10) et `medailleZombiesPas` (1 000), `medaillePalier` (50) et `medaillePalierPas` (5), `medailleMonde` (300), `medailleJour` (100), `maxMedailles` (9 999 999) ; jaune : `killWaveGrowth`, `killGrowthCap`, `repairMoney`, `maxMoney`.
- `data/menu/caisses.json` : par caisse `nom`, `prix`, `prix10`, `chances` (somme 100), `modele`, `teinte` ; `pitie.haute` (`rarete`, `garanti`), `pitie.top` (`rarete`, `douce`, `pas`, `garanti`) ; `offres` (offres du jour, en bleu).
- `data/menu/personnages.json` : `rarete` de chaque personnage ; `data/menu/raretes.json` (`prixFusion`), `objets.json` (`prixAmelioration`), `personnages.json` (`prixAmelioration`) : en bleu.
