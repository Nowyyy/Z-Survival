# Seed — Z-Survival (jeu de survie zombies, vue de dessus en 3D)
Version 0.7 — 26/10/2026 — modifié par le propriétaire seulement.
Dépôt : Nowyyy/Z-Survival. Site : https://nowyyy.github.io/Z-Survival/

## Le jeu en une phrase
Jeu web gratuit et solo, en 3D vue de dessus : un personnage défend un bâtiment contre des vagues de zombies, gagne de l'argent à chaque partie, le garde en cas de mort et l'investit dans des améliorations permanentes. Inspiré du principe de SAS Zombie Assault TD ; aucun visuel, nom ni son repris.

## Piliers
1. Jouable en 10 secondes sur téléphone comme sur ordinateur, sans compte.
2. Mourir fait progresser : l'argent n'est jamais perdu.
3. La logique du jeu est pure (sans Three.js ni DOM), donc testée à fond : changer le rendu ne change pas les règles.
4. Aucune donnée personnelle, aucune requête externe : la sauvegarde est locale, mais le code est prêt pour une base en ligne.
5. Tout texte et tout chiffre d'équilibrage sont dans des fichiers de données.
6. Chaque écran est réalisé directement en version finale (pas de maquettes).
7. Une pièce encombrée où l'on se fait difficilement toucher : le jeu récompense le déplacement et la visée, pas le nombre de tirs.

## Contrôles
| Plateforme | Déplacement | Visée | Tir |
|---|---|---|---|
| Ordinateur | Touches physiques W, A, S, D et flèches (lues par `event.code` : Z, Q, S, D en AZERTY) | Souris | Un tir part automatiquement quand le laser touche un ennemi |
| Mobile (paysage) | Stick gauche flottant (moitié gauche de l'écran) | Stick droit flottant (moitié droite) | Idem |
- Aucun bouton de tir.
- Le laser rouge est une aide à la visée : il ne blesse jamais. Il s'arrête au premier meuble ou ennemi et déclenche le tir.
- Chaque tir crée une balle visible (flash de bouche, balle avec courte traînée, étincelle à l'impact). Les dégâts sont appliqués seulement à l'impact de la balle ; une balle peut rater un zombie qui a bougé ; une balle qui touche un meuble disparaît sans dégâts.
- Le canvas occupe toute la fenêtre du navigateur. La salle est plus grande que l'écran : la caméra suit le joueur avec une zone morte (elle ne bouge que quand le joueur approche du bord de l'écran). Touche F pour le plein écran réel.
- Caméra : vue du dessus inclinée, angle de 75° par défaut (décision en attente, voir plus bas) ; le haut de l'écran est toujours le nord.
- Sur téléphone, le jeu se joue en paysage ; en portrait, un message demande de tourner l'appareil.
- Touches Échap ou P : pause ; M : son.

## Écrans (codes de blocs `E<écran>-<n>`)
Chaque écran est livré en version finale au lot indiqué du plan.
| Écran | Fichier | Blocs dans l'ordre | Lot |
|---|---|---|---|
| E1 Menu | `index.html` (page d'attente actuelle, remplacée) | E1-1 titre ; E1-2 Jouer ; E1-3 solde d'argent ; E1-4 accès boutique ; E1-5 accès réglages ; E1-6 pied de page (légal) | 7 |
| E2 Partie | `jeu.html` | E2-1 zone de jeu ; E2-2 HUD (vie, tués, puis vague, chutes, argent) ; E2-3 stick gauche ; E2-4 stick droit ; E2-5 pause ; E2-6 panneau de pause ; E2-7 fin provisoire | 1 (fait), refait en Three.js au lot 1m |
| E3 Boutique | `boutique.html` | E3-1 solde ; E3-2 liste des améliorations ; E3-3 armes ; E3-4 retour | 5 |
| E4 Fin de partie | scène ou page | E4-1 résultat ; E4-2 argent gagné ; E4-3 rejouer ; E4-4 boutique | 7 |
| E5 Réglages | `reglages.html` | E5-1 langue ; E5-2 son ; E5-3 réduire le sang ; E5-4 sauvegarde (export, import, effacer) | 7 |
| E6 Légal | `legal.html` | E6-1 mentions ; E6-2 vie privée | 7 |
Les noms de fichiers des écrans autres que `jeu.html` sont provisoires et fixés dans le prompt de leur lot. Le HUD et les panneaux restent à au moins 16 px des bords, plus les zones de sécurité du téléphone.

## Mécanique
- Un niveau = une salle plus grande que l'écran (valeur provisoire : 2000 × 1200 unités, dans `data/game/room.json`), entourée d'un décor extérieur (route, trottoir, voitures abandonnées, arbres, lampadaires). Les zombies naissent à l'extérieur, hors de la vue, traversent le décor et entrent par les ouvertures.
- La salle contient des meubles (au moins 10 : tables, comptoirs, caisses, armoires, colonnes, étagères). Ils bloquent le joueur, les zombies, les balles et le laser. Couloirs libres d'au moins 90 unités ; zone de départ du joueur libre ; au moins deux itinéraires depuis chaque ouverture ; l'espace libre est connexe.
- Les zombies contournent les meubles (champ de flux) et poursuivent le joueur en ligne droite quand la voie est libre.
- Fenêtres et barricades : les zombies cassent les planches des fenêtres (lot 3) ; jusque-là, les ouvertures sont passables pour les zombies seulement, fermées au joueur.
- Réparation d'une fenêtre : le joueur reste à proximité ; la durée dépend de l'amélioration correspondante.
- « Tomber à terre » : à 0 de vie, le joueur tombe, se relève automatiquement après un délai en consommant une chute ; plus de chute = fin de partie.
- Vagues : générées par formule pure ; `data/waves.json` fournit les paramètres ; difficulté croissante à chaque niveau.
- Argent : gagné par ennemi tué et par vague, conservé à la mort.
- Améliorations permanentes (`data/upgrades.json`, niveaux et coûts) : vie, dégâts, cadence de tir, vitesse de déplacement, nombre de chutes, vitesse de réparation des fenêtres ; d'autres à définir.
- Armes (`data/weapons.json`) : une arme de départ, d'autres achetables ; chaque arme définit dégâts, cadence, portée, vitesse de balle.
- Tourelles (lot 9), skins de personnage et d'armes (lot 11), thèmes de niveau : poste de police, rue, restaurant (lot 10).
- Sang et particules (lot 8), avec une option « réduire le sang ».
- Les valeurs d'équilibrage sont provisoires jusqu'au lot 12.

## Personnages et rendu
- Personnages articulés en 3D, vus du dessus : bassin, tronc, tête, deux bras (épaule et coude), deux jambes (hanche et genou), arme tenue en main. Le joueur tourne le tronc vers la visée, les jambes suivent le déplacement, léger recul au tir. Les zombies ont les bras tendus, une démarche traînante et un déphasage propre à chacun.
- Les angles des articulations viennent d'une fonction pure (`pose.js`, testée) ; le rendu ne fait que les appliquer.
- Géométries et matériaux partagés entre tous les personnages ; ombres portées (carte d'ombres 1024, lumière qui suit le joueur) ; l'option « ombres » peut être coupée sur les appareils lents.
- Textures : générées en code (canvas), jamais importées : sols, murs, meubles, décor, tenues. Elles sont créées au lot 1c ; jusque-là, formes et couleurs provisoires.
- Tout le décor fixe est créé une fois (pas de recréation par image).

## Contenus
| Contenu | Fournisseur | Statut |
|---|---|---|
| Textures, matériaux, modèles | Générés en code (canvas, géométries Three.js) | Provisoires jusqu'au lot 1c |
| Sons | Synthèse Web Audio, sans fichier ; sons en couches, filtres, réverbération, grognements et bruits de zombies occasionnels | Provisoires, retravaillés au lot 1d |
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
- HTML, CSS à variables, JavaScript en modules. **Three.js 0.186.1** (MIT) est la bibliothèque de rendu : paquet npm en `devDependency` à version exacte, fichiers copiés par `npm run vendor:three` vers `vendor/three/` (versionnés, jamais édités à la main), chargés par chemin relatif ou `importmap` locale, sans CDN. `dependencies` reste vide. Phaser est retiré au lot 1m (le dossier `vendor/` ne garde que Three.js).
- Outils de développement : ESLint (configuration plate), Vitest, Playwright avec axe, Lighthouse.
- Arborescence de code : `js/core/` (logique pure du jeu : aucun Three.js, DOM, réseau, stockage ni horloge ; temps passé en argument ; pas de `Math.random`, générateur à graine), `js/game/` (rendu et entrées), `js/save/` (futur `SaveRepository` et adaptateurs), `data/` (textes et chiffres).
- Le monde est dans le plan (x, z) ; la logique pure raisonne en deux dimensions ; la hauteur n'existe que pour le rendu.
- GitHub Pages, chemins relatifs, aucune ressource externe. Déploiement depuis `main` seulement ; aperçus par branche à `/lot-N/` (fichier `apercu.txt`), page `/lots/` et menu `/dev` générés automatiquement (le menu ouvre la page de la première ligne de `apercu.txt`) ; une branche de lot n'est jamais supprimée. La branche `lot-0t` (test Three.js contre Phaser) n'est pas fusionnée et reste en ligne.
- Sauvegarde : interface `SaveRepository` ; adaptateur `localStorage` avec schéma versionné et migrations ; export et import par code. Une base en ligne sera un nouvel adaptateur, sur décision écrite.
- Jamais conservé : position, identité, adresse IP, paramètres d'URL de test. Aucun cookie.
- Langue : français seul pour l'instant ; la structure `data/i18n/` permet d'ajouter l'anglais. `noindex` pendant le développement.
- Tests : le paramètre `?test=1` expose `window.__zs` (état du jeu, graine, apparition d'un zombie, avance de la simulation, vue d'ensemble) ; `?seed=` et `?nospawn=1` fixent la graine et coupent les apparitions ; `?fps=1` affiche les images par seconde.
- Seuils Lighthouse mobile : `index.html` 90 / 95 / 95 et CLS ≤ 0,1 ; `jeu.html` performance 45 (à confirmer), accessibilité 95, bonnes pratiques 95. Le poids de Three.js (environ 2,1 Mo) pèse sur le score ; les mesures de fluidité sur téléphone comptent plus que le score simulé.

## Hors périmètre (pour l'instant)
Multijoueur, comptes, classements en ligne, publicité, achats, base de données, balles perforantes ou ricochets, munitions et rechargement, images, sons ou modèles 3D importés (tout est généré en code), anglais, caméra libre ou rotative.

## Décisions en attente
- Angle de caméra par défaut : 75° (proposé), 90° (strictement vertical) ou 60° ; à fixer après le lot 1m.
- Sons : synthèse améliorée (par défaut) ou enregistrements libres de droits (il faudrait lever « sons importés » et vérifier les licences).
- Anglais : abandonné ou reporté après la mise en ligne en français.
- Monétisation (le jeu reste gratuit et public).
- Date de mise en ligne officielle et passage en indexation.
- Base de données en ligne : si, quand et quel service (coûts : comptes, RGPD, clé visible dans le navigateur).
- Seuil de performance Lighthouse de `jeu.html` (45 proposé).

## Risques connus
Fluidité de la 3D sur téléphone modeste (ombres, résolution, nombre de zombies) ; poids de Three.js au chargement ; netteté sur écrans haute densité ; sticks multi-touch et défilement de la page ; précision des impacts de balles rapides ; chemin des zombies autour des meubles (blocages, coût de calcul) ; équilibrage de la difficulté (trop frustrant ou trop facile dans une pièce encombrée) ; sang et public mineur ; tir automatique à rendre lisible ; audio non vérifiable par l'agent ; l'API de Three.js évolue (toujours lire le paquet installé) ; migration du rendu à ne pas faire sans tests de non-régression.

## Plan en lots (état)
| Lot | Sujet | État |
|---|---|---|
| 0, 0b, 0c, 0d | Socle, aperçus par branche, CI, accueil en français | fait |
| 0t | Test jetable Three.js contre Phaser (branche non fusionnée, à conserver) | fait |
| 1 | Cœur du jeu en Phaser (vue de dessus 2D, tir à balle visible) | fait, à remplacer par 1m |
| 1m | Migration du rendu : Three.js remplace Phaser, mêmes règles et mêmes tests de logique, personnages articulés de base issus du test, caméra, ombres, entrées et HUD repris | à écrire |
| 1b | Monde plus grand, meubles, caméra à défilement, chemin des zombies, décor extérieur provisoire, apparitions hors vue, marges du HUD | à écrire (après 1m) |
| 1c | Textures et personnages finaux (joueur, zombies, arme en main) | à écrire |
| 1d | Sons retravaillés et bruits de zombies occasionnels | à écrire |
| 2 | Vagues et difficulté croissante (logique pure) | à écrire |
| 3 | Fenêtres, planches cassées par les zombies, réparation, chutes | à écrire |
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
Base de données en ligne et sauvegarde dans le cloud, classement, achievements, mode difficile, anglais, plusieurs armes en même temps, caméra qui s'incline selon la vitesse, variantes de zombies.
