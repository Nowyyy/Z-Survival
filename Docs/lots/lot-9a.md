# Lot 9a — Début de la V0.9 : monnaies interverties, Zollars et correctifs
## Base
- `origin/dev` `119457f` (seed 0.36, bilan 8m, `main` `e6550bf` ancêtre de `dev`, CI verte), arbre propre ; branche `lot-9a` (la session proposait `claude/busy-brown-u4axdg` : j'ai suivi le prompt). Commits : A `886d93b` (relevé, `Docs/ref/debut-v09.md`), B `8ede2c4`, C `39016b6`, D `67d352b`, E `1fccfa2`, F (ce bilan). Aucune étiquette, aucune fusion.
## Début de V0.9
| Fichier | Mention | Classement | Action |
|---|---|---|---|
| `auditer.mjs` ; `data-changelog`, `publication.test`, `publication.spec`, `menu-etat.test`, `personnage.spec` | `EN_COURS = 'v0.8'` ; évolutions vides ; « V0.8 » au menu | version cible | `v0.9` (bilans V0.8 en L1, regroupés au nettoyage de fin de V0.9) ; scénario « début de la V0.9 » (aucune évolution v0.8, `lot-9a` visible) ; « V0.9 · source » ; cas du lot 8m gardés sur le journal sans v0.9 |
| `versions-schema`, `versions-archiver`, `publication.test` (V0.8 actuelle), `publication-controle`, `sauvegarde.spec`, `progression.test` | V0.8 publiée, format v2 né en V0.8 | historique | aucune |
| `CLAUDE.md` | « Tags facultatifs » | règle | « Pas de nouvelle étiquette. » (+ lignes des monnaies : 8 248 octets, 8 072 caractères, marges 152 / 328) ; `publication:controle -- --avant` : 1 KO attendu (`versions.json`), ATTENTION palier complet et branches, 12 OK |
## Monnaies
| À l'écran | Champ (gardé) | Se gagne | Sert à |
|---|---|---|---|
| **Zollars** (jaune) | aucun (jamais écrit) | 10 par zombie (balle), 1 par planche | armes (lot 6) |
| **Médailles** (bronze) | `bleu` | 20 par manche (30 renforcée), 500 par fin de monde | améliorations, fusion, offres du jour |
| **Diamants** (gemme) | `medailles` | +10 porte, +10 par 1 000 zombies, +50 palier, +300 premier monde, +100 partie du jour | caisses (100 ; ×10 : 1 000) |
- **Interversion par l'écran** : chaque champ dit déjà l'origine de son solde, donc échanger noms, icônes et couleurs intervertit exactement soldes et totaux ; aucune donnée déplacée, **aucune marque de format** (écart assumé avec le prompt : une marque ne marquerait aucune transformation, et la V0.8, qui ignore les champs inconnus, l'effacerait ; détail `economie.md` § 0, `sauvegarde-v2.md` § 13). Une seule fois par construction : rechargement, 2 à 4 onglets (simulateurs des lots 8h et 8k étendus à une sauvegarde de la V0.8), import ZS2 d'avant et réimport de ce lot : champs identiques ; pitié, paliers, mondes, jour intacts.
- Affichages : en-tête, pause, fin (médailles d'abord, puis diamants), fin de manche (médaille), portes et paliers (gemme), « +N » de manche, Boutique (gemme, « Il manque N diamants », nom accessible « prix en diamants »), Inventaire, Fusion, Personnages, offres (« Il manque N médailles »), Profil, `sauvegarde.html`, débogage ; **« Rouvrir » corrigé** (il lisait la bleue depuis le lot 8k). Zollars : HUD, Quitter, débogage. `jeu.html` : quatre icônes échangées (pause, fin, « +N »). **Recette V0.8 sur le même appareil** : mêmes champs, anciens noms, mêmes usages : rien à défaire ni à perdre (prouvé : V0.8 → dev → V0.8 → dev, même origine).
## « Quitter »
- Avant : `runEnd` créditait la **partie du jour (+100, monnaie des caisses)** à « Quitter » et à « Recommencer » si une manche était finie ; rien d'autre. Après : partie du jour à la mort ou à la fin du monde seulement ; Quitter après 1, 2 et 5 manches : soldes égaux avant / après (Vitest et Playwright).
## Portes
- Une case du dallage = 600 / 10 = **60** ; `porte.distance` **120** (défaut du code aussi) ; message jusqu'à 120 du bloc, jamais au-delà (mesuré par positions de test).
## Hélicoptère
- Bois apparent : région `tole` (bruit étiré en x et bandes, teinte olive brûlé). Tôle peinte générée en code (`toleHelicoptere`, `epaves.js` ; 256 px, ≈ 60 ms ; panneaux décalés, joints, rivets, trappes, écaillures, coulures, rayures ; base `--game-metal` ; teintes refroidies vers l'acier comme le site vitrine lu en lecture seule), rotor de queue sur pivot (72 °/s, `reglages-partie.json`), temps de jeu, figé en pause, immobile sous mouvement réduit ; collisions et `decor.json` inchangés. Captures (667 × 375, Élevé et Faible) : l'épave passe du beige olive à un gris acier riveté ; à la distance du jeu, détails discrets. **Je ne peux ni jouer sur un téléphone ni juger le rendu comme le propriétaire.** Budget (`mesurer.mjs --ref --ref-memes-reglages`) : R1, R2 −298 triangles, mêmes appels ; U1 +2 appels ; U4 +1 appel, −24 triangles ; pire cas 95 appels, 37 407 triangles ; aucune ombre de plus.
## Infini
- Carte jouable seulement si son monde est dans `mondes` (fin du monde en histoire) ; sinon cadenas, « Termine le monde 1 pour débloquer l'Infini », « Jouer » désactivé et nommé ; aucune écriture ; outil « Marquer le monde 1 terminé » (sans gain) ; bureau et mobile, axe, 44 px.
## Sol de la capture
- **Ce n'est pas une collision manquante ni le mur percé** : ce sont les **sacs de sable** `sacs-1` et `sacs-2` (décor léger du lot 3g, `decor-interieur.world.json`, 18 de haut, texture d'atlas « bois »), **non solides par conception** ; le liseré brun = **plinthes**. Même image avec `?percee=0` ; absents en Faible. Rien changé (idées plus bas).
## Preuves
- G1 trace 6 × 600 identique à chaque pas, champ d'économie (`economy`) compris, et chaîne sans lui identique. G2 hors hélicoptère : seule différence, le message de porte désormais affiché à 120 (R1, voulu) ; vue de l'hélicoptère : seuls ses pixels. G3-G6 : Vitest et Playwright ci-dessus. G7 aucune requête externe ; fichiers au démarrage identiques (menu 59, partie 174). G8 Lighthouse 5 passes : `index.html` 90 (réf. 90), `jeu.html` 75 (réf. 77), CLS ≤ 0,001. Tests du palier complet relancés en local (bureau, mode complet ; monnaies, fin de partie, vagues, zones, épaves, menu) : 351 + 351 + 192 + 139 exécutions, vertes après adaptation (2 échecs de textes corrigés et relancés) ; mobile (menu, Infini) : 221 vertes.
## Tests adaptés (tests / assertions, avant → après)
- `data-changelog` 9/81 → 9/85 ; `publication.test` 101/449 → 103/458 ; `interface-integree.test` 47/116 → 47/117 ; `sauvegarde-donnees` 29/70 → 29/71 ; textes, icônes ou comptes à valeur égale : argent, atelier-detail, boutique, caisses-pitie, debug-menu, jeu-vagues, lampes (comptes « off »), medailles, menu-onglets (monde 1 posé), menu, personnage, portes-sons, sauvegarde (V0.7 prise à son commit : le test échouait depuis la publication du lot 8m), studio, menu-garde, menu-etat, profil-garde, portes-sons-8j. Nouveaux : `monnaies-9a` (15/56 et 4/58), `correctifs-9a` (9/49 et 5/44), `infini-9a` (2/11). e2e 756/4 714 → 765/4 816 ; Vitest 7 258 → 7 290. Aucune assertion retirée.
## CI
- `lot-9a` : B `43775003528` (6 min 19), C `43779641208` (7 min 08), D `43783152184` (7 min 09), E `43786520006` (7 min 11 ; rejeu total, lot 8m-B : 6 min 18) : vertes.
## Points ouverts
- Raison de l'Infini réduite par l'ajustement des cartes à 667 × 375 ; pas de marque de format (voir Monnaies) ; titre du test caisses-pitie gardé (« médailles » = monnaie des caisses).
## Idées
- Sacs de sable : texture de toile ou de jute, ou solides comme un meuble (décision du propriétaire) ; carte de l'Infini : raison sur deux lignes.
## Entrée du journal
- `lot-9a` (v0.9, 2026-11-15) « Début de la V0.9 : médailles et diamants intervertis, Zollars » ; bloc `[lot-9a]` `afficher: oui`.
## Lignes à ajouter à `conventions.md`
- « Monnaies (lot 9a) : écran = médailles (champ bleu), diamants (champ medailles), Zollars ; Docs/ref/economie.md § 0. » « Infini : jouable après le monde terminé (mondes) ; Docs/ref/menu-principal.md. »
## Passages du seed à réécrire par le propriétaire
- Plan en lots : 9a fait ; Économie : interversion faite par l'écran (sans marque) ; risques : sacs de sable non solides ; Lighthouse `jeu.html` 75.
## À faire par moi
1. Fusionner `lot-9a` dans `dev` (« Create a merge commit »), attendre la CI et le déploiement. 2. Sur `…/dev/jeu.html` : finir une manche (médaille), passer une porte (message à deux cases, gemme), quitter (rien de plus), regarder l'hélicoptère, essayer l'Infini (verrouillé, puis outil de débogage), ouvrir une caisse en diamants, améliorer un objet en médailles. 3. Régler `economy.json`, `caisses.json`, `reglages-partie.json` si besoin. 4. Rapporter les retours.
