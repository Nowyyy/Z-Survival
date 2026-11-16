# Début de la V0.9 (lot 9a) : relevé et plan
Base `origin/dev` `119457f` (seed 0.36, bilan 8m, `main` `e6550bf` ancêtre de `dev`). Branche `lot-9a`. Relevé fait avant toute modification.

## 1. Mentions de la V0.8 comme version en cours
| Fichier | Mention | Classement | Action (partie B) |
|---|---|---|---|
| `scripts/docs/auditer.mjs` (276-278) | `EN_COURS = 'v0.8'` (bilans de la version en cours gardés séparés) | version cible | `v0.9` ; les bilans V0.8 restent séparés jusqu'au nettoyage de fin de V0.9 (seed) : catégorie « V0.8 » gardée à part |
| `menu-etat.test.js` (161), `personnage.spec.js` (817) | `versionMenu(journal réel) = V0.8`, « V0.8 · source » | version cible (dernier lot du journal) | V0.9 dès que `lot-9a` (v0.9) est dans le journal |
| `data-changelog.test.js`, `publication.test.js`, `publication.spec.js` (173-174 : « aucune évolution ») | évolutions de l'accueil vides (V0.8 publiée) | version cible | scénario « début de la V0.9 (lot 9a) » : aucune évolution v0.8, `lot-9a` visible en tête |
| `versions-schema`, `versions-archiver`, `publication.test` (V0.8 actuelle, « Jouer - V0.8 »), `publication-controle` | état publié réel (V0.8 = Recette) | historique (vrai jusqu'à la publication de la V0.9) | aucune |
| `progression.test`, `onglets-v2-simulateur.js`, `sauvegarde.spec`, `argent.spec`, `profil-garde.test` | « la V0.8 » = format v2 né en V0.8, compatibilité V0.7 ↔ V0.8 | historique | aucune (garantie 6 ajoutée à côté) |
| `scripts/publication/*.mjs` | aucune mention de version en dur (contrôle 1 généralisé au lot 8m) | — | aucune |
| `CLAUDE.md` « Tags facultatifs » | contredit le seed (plus d'étiquette) | règle | « pas de nouvelle étiquette » |

## 2. Ce que « Quitter » crédite aujourd'hui (reproduit avec la vraie banque, `js/game/bank.js`, dépôt en mémoire)
- `game.quit()` → `bank.runEnd({ reason: 'quit' })` ; `runEnd` ajoute la **première partie du jour** si au moins une manche est terminée et que le jour local n'est pas déjà crédité : **+100** de la monnaie des caisses (champ `medailles`, appelée « médailles » en V0.8).
- Mesuré : 1 manche puis Quitter : (bleu 20, medailles 0) → (20, **100**) ; 3 manches : (60, 0) → (60, **100**) ; 0 manche : rien ; « Recommencer » (`reason: 'restart'`) : **+100** aussi ; mort : +100 (voulu).
- Rien d'autre : la prime du monde n'existe qu'à la fin du monde ; manches, portes, milliers et paliers sont déjà écrits au gain (flush immédiat).
- Correctif : la partie du jour seulement pour `death` et `world` ; « Quitter » et « Recommencer » (abandon, même règle : choix du lot) n'écrivent que ce qui attend (statistiques, record de manche).

## 3. Portes : taille d'une case
- Dallage du sol (`textures.json` → `sol-salle`) : `repeat` 600 unités, `cells` 10 → **une case = 60 unités**. `porte.distance` 60 → **120** (deux cases ; distance du centre du joueur au bord du bloc, comme avant).

## 4. Hélicoptère
- Aujourd'hui : pièces dans le maillage du décor de l'atlas (`ex.scenery`, 0 appel de plus), région `tole` (genre `metal` de `texgen.js` : bruit très étiré en x (2 × 128) et bandes de panneaux → **stries de veinage**), teintes `--game-wreck-hull` (olive brûlé) : sous la lumière chaude, l'œil lit des planches.
- Site vitrine (`Nowyyy/Z-Survival-Website`, lu en lecture seule, `scene/js/helico.js`) : tôle gris neutre multipliée par la teinte de chaque pièce refroidie vers l'acier, panneaux de tailles variées décalés, joints sombres à lèvre claire, rivets sur quelques joints, trappes, écaillures, coulures de suie, rayures ; rotor de queue sur un pivot au centre de ses sommets, axe = normale de sa plus grande face.
- Plan : générateur pur `toleHelicoptere` dans `js/core/epaves.js` (bruit périodique `valueNoise` / `fbm` de `texgen.js`, couleur de base `--game-metal` passée en argument, aucune image) ; maillage « tôle » à part (une `DataTexture` de 256 px, `MeshLambertMaterial` + mur percé, sans ombre portée, réception comme le décor) ; verrière gardée dans l'atlas ; **rotor de queue** (pièces `rotor-queue-1`, `-2`) dans un maillage à part sur un pivot, angle = temps de jeu × vitesse (`reglages-partie.json` → `helicoptere.rotorDegParSeconde`), cumulé par `world.frame(dt)` (dt = 0 en pause), **0 sous mouvement réduit**. Collisions et `decor.json` inchangés (`helicopterModel` intact). Budget attendu : +2 appels, triangles du décor −(pièces déplacées), maillages coupés hors champ.

## 5. Infini
- Donnée : `save.mondes` (mondes terminés en histoire : `bank.worldEnd` → opération `gain.monde`) ; pas `mondesFinis` (récompense des diamants, aucun crédit rétroactif). Carte jouable en Infini si son monde est jouable **et** dans `mondes`.

## 6. Point 7 : sol « en bois » de la capture
- Reproduit au rez-de-chaussée, joueur en (1650, 1885), contre le mur nord, sous l'hélicoptère, près de `lampe-r4` : rectangle orangé sous le joueur = **`sacs-1`** (et `sacs-2` à côté, tourné) : **sacs de sable**, décor léger du lot 3g (`decor-interieur.world.json`, `js/core/decor-interieur.js`, catalogue `sacs` : 18 de haut, région d'atlas `bois`, **non solides par conception** : aucun effet sur collisions, chemin, tirs). Le liseré brun = **plinthes** (`plinthe`, `bois-sombre`, 8 de haut). Ce n'est pas le mur percé : capture identique avec `?percee=0`. Absent en Faible (décor léger coupé).
- Réponse : pas une collision manquante (la règle « chaque meuble bloque son rectangle » du lot 8j vise les meubles ; le décor léger est non solide par catalogue). Rien n'est changé ; idées au bilan.
- **Lot 9a-I (décision du propriétaire : « texture toile de jute avec une hitbox »)** : sacs solides et en jute ; détail dans `Docs/ref/retours-9a.md`.

## 7. Interversion des monnaies : méthode retenue
- Champs de la sauvegarde **gardés** et nommés par leur **origine** : `bleu` = gagné aux manches et au monde (V0.9 : **médailles**), `medailles` = gagné aux portes, milliers, paliers, premier monde, jour (V0.9 : **diamants**). Chaque solde suit donc déjà la façon dont il a été gagné : l'interversion se fait **à l'écran** (libellés, icônes, couleurs), aucune donnée n'est déplacée.
- Conséquences : appliquée une fois par construction (rien à réappliquer : rechargement, onglets, import ZS2 d'avant ou de ce lot) ; pitié, paliers, mondes, jour intacts ; achats atomiques inchangés ; la V0.8 de la Recette lit les mêmes champs avec ses anciens noms, ne peut rien défaire ni perdre. **Pas de marque de format** : elle ne marquerait aucune transformation (choix expliqué dans `economie.md`).

## 8. Tests prévus
- Vitest : affichage des monnaies (sauvegarde d'avant le lot : soldes intervertis à l'écran, stables après rechargement, 2 à 4 onglets, import ZS2 d'avant et de ce lot) ; « Quitter » et « Recommencer » sans crédit, jour à la mort ou au monde ; distance de porte ; texture et rotor (pur) ; règle de l'Infini.
- Playwright : fin de manche, porte, fin, pause, en-tête, Boutique, Inventaire, Fusion ; Quitter après deux manches ; Recette V0.8 et `dev` sur la même origine ; message à deux cases ; captures de l'hélicoptère ; Infini verrouillé puis débloqué (bureau et mobile, axe, 44 px).
- Références relevées sur `origin/dev` : six empreintes de `trace-logique.mjs` (finales 2850de8d…, 750fb6c0…, 9f019408…, b18d5472…, b12ec825…, 937b5d1b…) ; R1 à U4 × 3 : 45 à 94 appels, 19 307 à 37 431 triangles ; fichiers au démarrage : menu 59 (37 JS), partie 174 (126 JS), aucun externe ; 756 tests e2e / 4 714 assertions ; Lighthouse mobile (5 passes, local) : `index.html` 90, 89, 90, 90, 90 → **90**, `jeu.html` 75, 77, 77, 75, 77 → **77**, 100 / 100, CLS ≤ 0,001.
