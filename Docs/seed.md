# Seed — Z-Survival (jeu de survie zombies, vue de dessus)
Version 0.5 — 26/10/2026 — modifié par le propriétaire seulement.
Dépôt : Nowyyy/Z-Survival. Site : https://nowyyy.github.io/Z-Survival/

## Le jeu en une phrase
Jeu web gratuit et solo : un personnage défend un bâtiment contre des vagues de zombies, gagne de l'argent à chaque partie, le garde en cas de mort et l'investit dans des améliorations permanentes. Inspiré du principe de SAS Zombie Assault TD ; aucun visuel, nom ni son repris.

## Piliers
1. Jouable en 10 secondes sur téléphone comme sur ordinateur, sans compte.
2. Mourir fait progresser : l'argent n'est jamais perdu.
3. La logique du jeu est pure (sans Phaser ni DOM), donc testée à fond.
4. Aucune donnée personnelle, aucune requête externe : la sauvegarde est locale, mais le code est prêt pour une base en ligne.
5. Tout texte et tout chiffre d'équilibrage sont dans des fichiers de données.
6. Chaque écran est réalisé directement en version finale (pas de maquettes).

## Contrôles
| Plateforme | Déplacement | Visée | Tir |
|---|---|---|---|
| Ordinateur | Touches physiques W, A, S, D et flèches (lues par `event.code` : Z, Q, S, D en AZERTY) | Souris | Un tir part automatiquement quand le laser touche un ennemi |
| Mobile (paysage) | Stick gauche flottant (moitié gauche de l'écran) | Stick droit flottant (moitié droite) | Idem |
- Aucun bouton de tir.
- Le laser rouge est une aide à la visée : il ne blesse jamais. Il déclenche le tir.
- Chaque tir crée une balle visible (flash de bouche, balle avec courte traînée, étincelle à l'impact). Les dégâts sont appliqués seulement à l'impact de la balle ; une balle peut rater un zombie qui a bougé.
- Sur ordinateur, le jeu occupe toute la fenêtre du navigateur : canvas à 100 %, sans bandes noires ; la caméra s'adapte (on voit plus de décor sur un écran large, jamais plus de salle). Touche F pour le plein écran réel.
- Sur téléphone, le jeu se joue en paysage ; en portrait, un message demande de tourner l'appareil.
- Touches Échap ou P : pause ; M : son.

## Écrans (codes de blocs `E<écran>-<n>`)
Chaque écran est livré en version finale au lot indiqué du plan.
| Écran | Fichier | Blocs dans l'ordre | Lot |
|---|---|---|---|
| E1 Menu | `index.html` (page d'attente actuelle, remplacée) | E1-1 titre ; E1-2 Jouer ; E1-3 solde d'argent ; E1-4 accès boutique ; E1-5 accès réglages ; E1-6 pied de page (légal) | 7 |
| E2 Partie | `jeu.html` | E2-1 zone de jeu ; E2-2 HUD (vie, tués, puis vague, chutes, argent) ; E2-3 stick gauche ; E2-4 stick droit ; E2-5 pause ; E2-6 panneau de pause ; E2-7 fin provisoire | 1 |
| E3 Boutique | `boutique.html` | E3-1 solde ; E3-2 liste des améliorations ; E3-3 armes ; E3-4 retour | 5 |
| E4 Fin de partie | scène ou page | E4-1 résultat ; E4-2 argent gagné ; E4-3 rejouer ; E4-4 boutique | 7 |
| E5 Réglages | `reglages.html` | E5-1 langue ; E5-2 son ; E5-3 réduire le sang ; E5-4 sauvegarde (export, import, effacer) | 7 |
| E6 Légal | `legal.html` | E6-1 mentions ; E6-2 vie privée | 7 |
Les noms de fichiers des écrans autres que `jeu.html` sont provisoires et fixés dans le prompt de leur lot.

## Mécanique
- Un niveau = une salle avec fenêtres ; les zombies entrent par les fenêtres, détruisent la barricade, puis attaquent.
- Réparation d'une fenêtre : le joueur reste à proximité ; la durée dépend de l'amélioration correspondante.
- « Tomber à terre » : à 0 de vie, le joueur tombe, se relève automatiquement après un délai en consommant une chute ; plus de chute = fin de partie.
- Vagues : générées par formule pure ; `data/waves.json` fournit les paramètres ; difficulté croissante à chaque niveau.
- Argent : gagné par ennemi tué et par vague, conservé à la mort.
- Améliorations permanentes (`data/upgrades.json`, niveaux et coûts) : vie, dégâts, cadence de tir, vitesse de déplacement, nombre de chutes, vitesse de réparation des fenêtres ; d'autres à définir.
- Armes (`data/weapons.json`) : une arme de départ, d'autres achetables ; chaque arme définit dégâts, cadence, portée, vitesse de balle.
- Tourelles (lot 9), skins de personnage et d'armes (lot 11), thèmes de niveau : poste de police, rue, restaurant (lot 10).
- Sang et particules (lot 8), avec une option « réduire le sang ».
- Les valeurs d'équilibrage sont provisoires jusqu'au lot 12.

## Contenus
| Contenu | Fournisseur | Statut |
|---|---|---|
| Textures, sprites | Générés en code (Phaser Graphics) | Provisoires |
| Sons | Synthèse Web Audio, sans fichier | Provisoires |
| Textes en français | Claude, validés par le propriétaire | Réels |
| Textes en anglais | Reportés | Voir décisions en attente |
| Équilibrage | `data/game/*.json` | À régler en test |
| Mentions légales, vie privée | Claude, relues par le propriétaire | Au lot 7, provisoires jusqu'au lot 13 |

## Design
- Style « sang noir », défini dans `css/tokens.css` : noir profond, rouge sang, os, jaune pour l'argent.
| Rôle | Valeur |
|---|---|
| Fond / surface / surélevé | `#050505` / `#131313` / `#222224` |
| Texte / texte secondaire | `#f4f1ec` / `#b8b4ae` |
| Rouge sang (zones, cadre, grands titres seulement) | `#d81414` |
| Rouge lisible en petit texte | `#ff4a3d` |
| Rouge profond (gouttes sombres) | `#7a0a0a` |
| Argent | `#ffd60a` |
| Succès / avertissement | `#7ed48b` / `#f2c94c` |
| Focus | `#9fd3ff` |
- Polices hébergées dans le dépôt : Barlow, Rubik Wet Paint (titre), Rubik Dirt (libellés).
- Les couleurs du jeu sont des variables `--game-*` dans `tokens.css`, lues par le code du jeu ; aucune couleur en dur dans le JavaScript.
- Tout état (vie, fenêtre cassée, solde) est porté aussi par une forme ou un texte, jamais par la couleur seule.
- Cibles tactiles de 44 px, contraste de 4,5:1 pour le texte (le rouge sang n'est utilisé que pour de grands textes, 3:1), `prefers-reduced-motion` respecté (secousses, flashs et particules réduits).
- Tailles de test : 375, 768 et 1440 px, plus 667×375 (téléphone en paysage) et 2560×1080 pour le jeu.

## Stack et hébergement
- HTML, CSS à variables, JavaScript en modules. Phaser est la seule bibliothèque du jeu : paquet npm en `devDependency` à version exacte, copié par `npm run vendor` vers `vendor/phaser.min.js` (versionné, jamais édité à la main). `dependencies` reste vide.
- Outils de développement : ESLint (configuration plate), Vitest, Playwright avec axe, Lighthouse.
- Arborescence de code : `js/core/` (logique pure du jeu : aucun Phaser, DOM, réseau, stockage ni horloge ; temps passé en argument ; pas de `Math.random`, générateur à graine), `js/game/` (scènes Phaser), `js/save/` (futur `SaveRepository` et adaptateurs), `data/` (textes et chiffres).
- GitHub Pages, chemins relatifs, aucune ressource externe. Déploiement depuis `main` seulement ; aperçus par branche à `/lot-N/` (fichier `apercu.txt`), page `/lots/` et menu `/dev` générés automatiquement ; une branche de lot n'est jamais supprimée.
- Sauvegarde : interface `SaveRepository` ; adaptateur `localStorage` avec schéma versionné et migrations ; export et import par code. Une base en ligne sera un nouvel adaptateur, sur décision écrite.
- Jamais conservé : position, identité, adresse IP, paramètres d'URL de test. Aucun cookie.
- Langue : français seul pour l'instant ; la structure `data/i18n/` permet d'ajouter l'anglais. `noindex` pendant le développement.
- Tests : le paramètre `?test=1` expose `window.__zs` (état du jeu, graine, apparition d'un zombie) ; `?seed=` et `?nospawn=1` fixent la graine et coupent les apparitions.
- Seuils Lighthouse mobile : `index.html` 90 / 95 / 95 et CLS ≤ 0,1 ; `jeu.html` fixés au lot 1 (performance 75, accessibilité 95, bonnes pratiques 95 visés).

## Hors périmètre (pour l'instant)
Multijoueur, comptes, classements en ligne, publicité, achats, base de données, balles perforantes ou ricochets, munitions et rechargement, images ou sons importés, anglais.

## Décisions en attente
- Anglais : abandonné ou reporté après la mise en ligne en français.
- Monétisation (le jeu reste gratuit et public).
- Date de mise en ligne officielle et passage en indexation.
- Base de données en ligne : si, quand et quel service (coûts : comptes, RGPD, clé visible dans le navigateur).

## Risques connus
Performance de Phaser sur téléphone modeste ; netteté sur écrans haute densité ; sticks multi-touch et défilement de la page ; précision des impacts de balles rapides ; sang et public mineur ; équilibrage des vagues ; version et licence de Phaser à vérifier ; tir automatique à rendre lisible pour ne pas frustrer ; audio non vérifiable par l'agent.

## Plan en lots (état)
| Lot | Sujet | État |
|---|---|---|
| 0, 0b, 0c, 0d | Socle, aperçus par branche, CI, accueil en français | fait |
| 1 | Cœur : Phaser plein écran, déplacement, visée, laser, tir automatique à balle visible, zombies de démonstration, sons de base, pause (E2) | à lancer |
| 2 | Vagues et difficulté croissante (logique pure) | à écrire |
| 3 | Fenêtres, barricades, réparation, chutes | à écrire |
| 4 | Argent, sauvegarde locale (`SaveRepository`) | à écrire |
| 5 | Boutique et améliorations (E3) | à écrire |
| 6 | Armes | à écrire |
| 7 | Menu (E1), fin de partie (E4), réglages (E5), légal (E6) | à écrire |
| 8 | Sang, particules, option « réduire le sang » | à écrire |
| 9 | Tourelles | à écrire |
| 10 | Thèmes de niveau | à écrire |
| 11 | Skins de personnage et d'armes | à écrire |
| 12 | Qualité technique : performance, équilibrage, accessibilité, nettoyage | à écrire |
| 13 | Mise en ligne : SEO, mentions légales finales, indexation | à écrire |

## Idées en attente
Base de données en ligne et sauvegarde dans le cloud, classement, achievements, mode difficile, anglais, plusieurs armes en même temps.
