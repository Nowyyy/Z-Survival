# Économie : trois monnaies, médailles, caisses à pitié (lot 8k, V0.8)

État : **relevé et plan (partie A)**, sur `origin/dev` `3c25e3a` (seed 0.33), branche `lot-8k`. Les décisions du propriétaire (prompt du lot 8k) priment ; valeurs provisoires, réglables sans lot.

## 1. Relevé (avant le lot)
- **Jaune** (`js/core/economy.js`, `js/game/bank.js`) : `bank.kill` (impact de balle, `game.js` l. 613 : 10 par zombie) et `bank.repair` (planche posée : 1) ; journal `createLedger` ; remise à 0 à chaque partie, jamais écrite ; aucune dépense (lot 6).
- **Bleue** : `bank.waveEnd` → `waveBonus` = `(10 + 2 × manche) × 1,5 renforcée` ; `bank.worldEnd` → `worldBonus` 500 ; écrite aussitôt par l'opération `gain` (`js/core/progression.js`). Dépensée dans le menu (`js/menu/equipement-etat.js`, opérations `achat`, `ameliorer`, `perso`, `fusion`) : caisses, offres du jour, améliorations, fusion. Affichée : HUD « +N », fin de manche (`js/game/bleu-manche.js`), pause, E2-7 (`js/game/ui.js`), en-tête du menu (`js/menu/menu.js`), Profil.
- **Porte ouverte** (lecture) : événement `doorOpen` du directeur de vagues (`game.js` l. 708 ; `openAfterWave` 10, 20, 30 dans `data/game/maps/rez-de-chaussee/zones.json`) ; les portes déjà ouvertes par `?wave=` ne passent pas par lui. **Zombies tués** (lecture) : `bank.kill` ne voit que les tués par balle (ni `killAll` ni `skipWave`) ; compteur de la partie dans la banque, remis à 0 par `restart`.
- **Trace logique** : `getState().economy` (jaune) est dans l'empreinte ; `getState().save` (bleue) n'y est pas. Les médailles iront sous `save` : `economy` garde sa forme.

## 2. Format v2 : champs ajoutés (`v` reste 2 ; absents = défaut ; l'ancien code les garde comme champs inconnus)
| Champ | Contenu | Défaut | Entre onglets |
|---|---|---|---|
| `medailles` | `{ gagne, depense, jour }` : compteurs croissants (solde = gagne − depense, 0 à 9 999 999) ; `jour` = dernier jour local crédité | `{ 0, 0, 0 }` | opérations à identifiant (journal) ; `jour` : crédité seulement si plus grand |
| `paliers` | `{ histoire: { monde: N }, infini: { carte: N } }` : plus haut palier **récompensé** (les paliers 5, 10… jusqu'à N sont obtenus) | vides | maximum ; crédit = paliers au-delà de la valeur la plus récente |
| `mondesFinis` | mondes dont la **première** fin a été récompensée | `[]` | union ; crédit si absent |
| `pitie` | `{ equipement, personnage, cosmetique }` × `{ e, l }` : tirages depuis le dernier épique ou mieux, depuis le dernier légendaire | 0 | achat refusé (`pitie`) si les compteurs ont changé depuis le tirage |
- **Aucun crédit rétroactif** : records et `mondes` existants ne remplissent ni `paliers` ni `mondesFinis` ; rien n'est crédité au chargement, à l'import ni à la réparation. Un `ZS2` d'avant le lot s'importe avec ces champs à leur défaut.
- **Opérations** : `gain` reçoit `medailles` (portes, milliers : montant direct), `palier { mode, monde, manche, gain }`, `mondeFini { id, gain }`, `jour { n, gain }` (les montants voyagent dans l'opération : même résultat dans tous les onglets) ; `achat` reçoit `monnaie: 'medailles'` et `pitie { r, de, a }`. Montant jamais négatif, plafond appliqué.

## 3. Valeurs (`data/game/economy.json`)
- Bleue : `waveBonusBase` 20, `waveBonusPerWave` 0 (gain fixe), `reinforcedBonusMul` 1,5, `worldBonus` 500 (répétable).
- Médailles : `medaillePorte` 10 ; `medailleZombies` 10 par `medailleZombiesPas` 1 000 tués dans la partie ; `medaillePalier` 50 par `medaillePalierPas` 5 manches terminées (première fois) ; `medailleMonde` 300 (première fois) ; `medailleJour` 100 (première partie du jour avec au moins une manche terminée) ; `maxMedailles` 9 999 999. Calcul dans `js/core/economy.js` seulement.

## 4. Caisses (`data/menu/caisses.json`) : neuf → trois
- **Équipement** (ravitaillement, militaire, élite fusionnées) : dessin `militaire` (caisse à munitions, menu et ouverture 3D). **Personnages** (recrues, vétérans, légendes) : dessin `veterans` (malle). **Cosmétiques** (tenues, mode, haute couture) : dessin `tenues` (valise). Les neuf dessins restent dans le code (aucun changement de `js/menu/ouverture/`).
- Prix 100 médailles, ×10 1 000. Chances : commun 54, peu commun 30, rare 10, épique 5, légendaire 1.
- **Personnages** (proposé) : une rareté par personnage dans `data/menu/personnages.json` (`rarete`) : Survivant, [Personnage 2], [Personnage 3] rares ; [4], [5] épiques ; [6] légendaire (provisoire) ; chances rare 94, épique 5, légendaire 1 (mêmes épique et légendaire que les autres rubriques : même pitié, même attente) ; doublon = +1 niveau (lot 8e).
- **Pitié** (`caisses.json` → `pitie`) : épique ou mieux garanti au 10e tirage sans épique ni légendaire ; légendaire à 1 % jusqu'au 50e, puis +5 points par tirage, garanti au 70e (attente 42,6 tirages). Hors légendaire, les autres raretés gardent leurs proportions de base. Un compteur repart à 0 quand sa rareté ou mieux tombe ; ×10 = dix tirages qui avancent les compteurs dans l'ordre.
- Offres du jour, améliorations, fusion, personnages : bleue (inchangé).

## 5. Tests prévus
- Vitest : gains (portes, millier exact, remise à 0, plafond) ; bleue fixe ; modes sans écriture ; migration et import ; paliers (5, 10, saut, jamais deux fois, aucun crédit au chargement) ; jour (minuit local, partie sans manche) ; 100 000 tirages par rubrique (bornes 10 et 70, taux) ; ×10 ; graine et compteurs égaux ; achats atomiques ; simulateur multi-onglets (10 000 suites) étendu aux médailles, paliers et pitié.
- Playwright : porte ouverte (+10 écrit aussitôt, gardé après fermeture), E2-7, en-tête, pause ; palier une fois ; sauvegarde préparée avec records ; deux onglets ; achats ×1 et ×10, compteurs gardés, garantie déclenchée, ouverture 3D par rubrique, axe, 44 px ; projet mobile en local.
