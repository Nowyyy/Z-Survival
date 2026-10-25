# Seed — mobile-games (jeu de survie zombies, vue de dessus)
Version 0.2 — 26/10/2026 — modifié par le propriétaire seulement.

## Le jeu en une phrase
Jeu web gratuit et solo : un personnage défend un bâtiment contre des vagues de zombies, gagne de l'argent à chaque partie, le garde en cas de mort et l'investit dans des améliorations permanentes. Inspiré du principe de SAS Zombie Assault TD ; aucun visuel, nom ni son repris.

## Piliers
1. Jouable en 10 secondes sur téléphone comme sur ordinateur.
2. Mourir fait progresser : l'argent n'est jamais perdu.
3. La logique du jeu est pure (sans Phaser ni DOM), donc testée à fond.
4. Aucune donnée personnelle, aucune requête externe : la sauvegarde est locale, mais le code est prêt pour une base en ligne.
5. Tout texte et tout chiffre d'équilibrage sont dans des fichiers de données.

## Contrôles
| Plateforme | Déplacement | Visée | Tir |
|---|---|---|---|
| Ordinateur | ZQSD, WASD ou flèches | Souris | Automatique quand le laser touche un ennemi |
| Mobile | Stick gauche | Stick droit | Automatique quand le laser touche un ennemi |
Un laser rouge montre où le personnage vise, sur toutes les plateformes. Aucun bouton de tir.

## Écrans (codes de blocs `E<écran>-<n>`)
| Écran | Fichier | Blocs dans l'ordre |
|---|---|---|
| E1 Menu | `index.html` | E1-1 titre ; E1-2 bouton Jouer ; E1-3 solde d'argent ; E1-4 accès boutique ; E1-5 accès réglages ; E1-6 pied de page (légal) |
| E2 Partie | scène Phaser | E2-1 zone de jeu ; E2-2 HUD (vie, chutes, vague, argent) ; E2-3 stick gauche ; E2-4 stick droit ; E2-5 pause |
| E3 Boutique | `shop.html` | E3-1 solde ; E3-2 liste des améliorations ; E3-3 armes ; E3-4 retour |
| E4 Fin de partie | scène | E4-1 résultat ; E4-2 argent gagné ; E4-3 rejouer ; E4-4 boutique |
| E5 Réglages | `settings.html` | E5-1 langue ; E5-2 son ; E5-3 réduire le sang ; E5-4 sauvegarde (export, import, effacer) |
| E6 Légal | `legal.html` | E6-1 mentions ; E6-2 vie privée |

## Mécanique
- Un niveau = une salle avec fenêtres ; les zombies entrent par les fenêtres, détruisent la barricade, puis attaquent.
- Réparation d'une fenêtre : le joueur reste à proximité ; la durée dépend de l'amélioration correspondante.
- « Tomber à terre » : à 0 de vie, le joueur tombe, se relève automatiquement après un délai en consommant une chute ; plus de chute = fin de partie.
- Vagues : générées par formule pure ; `data/waves.json` fournit les paramètres ; difficulté croissante à chaque niveau.
- Argent : gagné par ennemi tué et par vague, conservé à la mort.
- Améliorations permanentes (`data/upgrades.json`, niveaux et coûts) : vie, dégâts, cadence de tir, vitesse de déplacement, nombre de chutes, vitesse de réparation des fenêtres ; d'autres à définir.
- Armes (`data/weapons.json`) : une arme de départ, d'autres achetables.

## Contenus
| Contenu | Fournisseur | Statut |
|---|---|---|
| Textures, sprites | Générés en code (Phaser Graphics) | Provisoires |
| Sons | Synthèse Web Audio | Provisoires |
| Textes français et anglais | Claude, validés par le propriétaire | Réels |
| Équilibrage | `data/*.json` | À régler en test |

## Design
Ton sombre mais lisible ; palette définie au lot 0 (jetons CSS pour l'interface, constantes de données pour le jeu). Tout état (vie, fenêtre cassée) est porté aussi par une forme ou un texte, jamais par la couleur seule. Cibles tactiles de 44 px, contraste de 4,5:1, `prefers-reduced-motion` respecté (secousses et particules réduites).

## Stack et hébergement
- HTML, CSS à variables, JavaScript en modules. Phaser est la seule dépendance d'exécution, copié dans `vendor/` en version exacte, introduit au lot 2.
- Outils de développement : ESLint, Vitest, Playwright avec axe, Lighthouse.
- GitHub Pages, chemins relatifs, aucune ressource externe.
- Sauvegarde : interface `SaveRepository` ; adaptateur `localStorage` avec schéma versionné et migrations ; export et import par code. Une base en ligne = un nouvel adaptateur, plus tard, sur décision écrite.
- Jamais conservé : position, identité, adresse IP. Aucun cookie.
- Langues : français (par défaut) et anglais, choix mémorisé en local ; `noindex` pendant le développement.

## Hors périmètre (pour l'instant)
Multijoueur, comptes, classements en ligne, publicité, achats, base de données, skins, tourelles, thèmes de niveau autres que le premier, sons ou images importés.

## Décisions en attente
Nom du jeu ; monétisation ; date de mise en ligne.

## Risques connus
Performance de Phaser sur téléphone modeste ; sticks tactiles et défilement de la page ; sang et public mineur ; équilibrage des vagues ; version et licence de Phaser à vérifier ; tir automatique à rendre lisible (laser) pour ne pas frustrer.

## Plan en lots (état)
| Lot | Sujet | État |
|---|---|---|
| 0 | Socle, jetons, publication | à lancer |
| 0b | Aperçus par branche et page Lots | à écrire |
| 1 | Wireframes E1 à E6 | à écrire |
| 2 | Cœur : Phaser, déplacement, visée, laser, tir auto, un zombie | à écrire |
| 3 | Vagues et difficulté (logique pure) | à écrire |
| 4 | Fenêtres, barricades, réparation, chutes | à écrire |
| 5 | Argent, sauvegarde locale (`SaveRepository`) | à écrire |
| 6 | Boutique et améliorations | à écrire |
| 7 | Armes | à écrire |
| 8 | Sang et particules, option « réduire le sang » | à écrire |
| 9 | Tourelles | à écrire |
| 10 | Thèmes de niveau | à écrire |
| 11 | Skins | à écrire |
| 12 | Qualité technique | à écrire |
| 13 | Mise en ligne : légal, SEO, nom définitif | à écrire |

## Idées en attente
Base de données en ligne, classement, achievements.
