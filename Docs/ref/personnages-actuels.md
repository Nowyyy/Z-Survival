# Personnages actuels : état des lieux mesuré (lot 3j-A)

*Retiré du jeu au lot 5e : l'ancien modèle (`js/core/pose.js`, `js/game/character.js`, `?perso=actuel`) et le script `scripts/personnages/inventaire.mjs` qui produisait ces mesures n'existent plus ; document gardé comme état des lieux historique.*

Mesures de `node scripts/personnages/inventaire.mjs` (Node, sans rendu). Caméra du jeu à 667 × 375 : distance 704,5, inclinaison 75°, champ 40°, 1,37 unité par pixel au sol. Silhouette : rasterisation des triangles posés (pose de marche du jeu), moyenne sur 4 orientations ; « lum. vue » : luminance de la couleur moyenne visible (régions d'atlas, sans éclairage) ; contraste avec la couleur moyenne de chaque sol (même méthode que `tests/unit/personnages.test.js`, le béton d'escalier utilise la texture des murs).

| Personnage | Pièces | Triangles | Appels (pièces + ombres) | Emprise / 1,3 r | Hauteur | Aire (px) | Aspect | Lum. vue | Carrelage | Herbe | Terre | Route | Trottoir | Escalier |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| joueur | 12 | 680 | 17 (12 + 5) | 26,77 / 23,40 | 61,30 | 268,0 | 0,967 | 0,243 | 2,87 | 3,87 | 3,76 | 3,73 | 3,51 | 1,85 |
| marcheur | 11 | 624 | 16 (11 + 5) | 28,18 / 26,00 | 60,70 | 267,0 | 0,933 | 0,330 | 3,72 | 5,02 | 4,88 | 4,84 | 4,55 | 2,39 |
| petit | 11 | 624 | 16 (11 + 5) | 26,05 / 24,18 | 56,45 | 230,0 | 0,926 | 0,347 | 3,89 | 5,25 | 5,10 | 5,06 | 4,76 | 2,50 |
| voute | 11 | 624 | 16 (11 + 5) | 27,60 / 25,48 | 59,49 | 261,0 | 0,937 | 0,303 | 3,46 | 4,67 | 4,53 | 4,50 | 4,23 | 2,23 |
| grand | 11 | 624 | 16 (11 + 5) | 30,07 / 27,82 | 64,95 | 307,6 | 0,937 | 0,259 | 3,03 | 4,09 | 3,97 | 3,94 | 3,70 | 1,95 |

Articulations : 12 (joueur, poignet droit pour l'arme) ou 11. Ombres : bassin, tronc, tête, deux cuisses (5 appels de la passe d'ombre par personnage). Atlas : 256 × 256, 349 525 octets avec mipmaps, 35 ms de génération en Node.

## Ce qui manque, en chiffres (sans jugement esthétique)

1. **Coût de dessin** : 16 à 17 appels par personnage ; 10 zombies et le joueur = 177 appels sur les 203 mesurés en R1 (87 %). Les personnages sont la première dépense d'appels du jeu.
2. **Silhouettes confondues** : les 4 types n'ont que l'échelle (0,93 à 1,07) et deux angles (tête, bras) pour se distinguer. Écarts d'aire : marcheur / voûté 2,2 %, petit / voûté 11,9 % (sous 12 %) ; écarts d'aspect : 0,0 à 1,2 % pour toutes les paires (même forme, même proportion largeur / hauteur).
3. **Lisibilité sur le béton d'escalier** : aucun personnage n'atteint 3:1 (1,85 à 2,50) avec la couleur moyenne réellement vue ; le joueur est aussi sous 3:1 sur le carrelage (2,87). Le test existant passe parce qu'il ne mesure que la couleur dominante (veste, tenues) et ne compte pas l'escalier.
4. **Emprise** : bras tendus devant, l'emprise debout dépasse 1,3 × le rayon de collision pour les 5 personnages (de 1,08 à 1,14 fois la limite).
5. **Personnalité** : mêmes 11 pièces et mêmes formes (capsules, sphères) pour les 4 zombies ; aucune pièce propre à un type (pas d'accessoire, pas de vêtement distinctif), même pose de base (inclinaison 0,14 rad) ; le voûté ne diffère du marcheur que par 0,28 rad de tête.
6. **Animations** : aucune attaque, aucune réaction au tir (un flash de 0,1 s), aucune mort (le zombie disparaît), aucune réparation (le joueur reste en pose d'arrêt), aucune attente devant une fenêtre ; glissement des pieds en marche : amplitude de hanche 0,385 rad pour une foulée de 52 (le pied d'appui recule d'environ 20 unités par demi-cycle au lieu de 26 : glissement d'environ 22 %).
7. **Usure, tenues** : une tenue par type, aucune variation selon la manche.

L'agent ne juge ni le beau ni le caractère effrayant : ces chiffres sont des mesures, pas des avis.
