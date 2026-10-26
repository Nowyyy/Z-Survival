# Seed — Z-Survival (jeu de survie zombies, vue de dessus en 3D)
Version 0.10 — 26/10/2026 — modifié par le propriétaire seulement.
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
8. Tout est généré en code : textures, modèles, sons. Aucun fichier image, modèle 3D ou son importé.

## Contrôles
| Plateforme | Déplacement | Visée | Tir |
|---|---|---|---|
| Ordinateur | Touches physiques W, A, S, D et flèches (lues par `event.code` : Z, Q, S, D en AZERTY) | Souris | Un tir part automatiquement quand la ligne de visée touche ou frôle un ennemi |
| Mobile (paysage) | Stick gauche flottant (moitié gauche de l'écran) | Stick droit flottant (moitié droite) | Idem |
- Aucun bouton de tir.
- Le laser rouge (300 unités de long, qui s'estompe sur son dernier tiers) est une aide à la visée : il ne blesse jamais. Un tir part quand la ligne de visée passe à moins de 24 unités du bord d'un zombie, jusqu'à 1600 unités, sans mur ni meuble entre les deux. La balle suit la vraie visée et peut donc rater.
- Chaque tir crée une balle visible (flash de bouche, balle avec courte traînée, étincelle à l'impact). Les dégâts sont appliqués seulement à l'impact de la balle.
- Murs, meubles et décor solide arrêtent le laser et les balles (une balle arrêtée ne fait aucun dégât) ; les fenêtres les laissent passer.
- Le canvas occupe toute la fenêtre du navigateur. Vue du dessus inclinée à 75° (`?tilt=60|75|90` pour essayer). Vue proche : la caméra suit le joueur avec lissage, ne sort jamais du monde ; zoom 2 par défaut, `?zoom=1` montre toute la zone. Touche F pour le plein écran réel.
- Sur téléphone, le jeu se joue en paysage ; en portrait, un message demande de tourner l'appareil.
- Touches Échap ou P : pause ; M : son.

## Écrans (codes de blocs `E<écran>-<n>`)
Chaque écran est livré en version finale au lot indiqué du plan.
| Écran | Fichier | Blocs dans l'ordre | Lot |
|---|---|---|---|
| E1 Menu | `index.html` (page d'attente actuelle, remplacée) | E1-1 titre ; E1-2 Jouer ; E1-3 solde d'argent ; E1-4 accès boutique ; E1-5 accès réglages ; E1-6 pied de page (légal) | 7 |
| E2 Partie | `jeu.html` | E2-1 zone de jeu ; E2-2 HUD (vie, tués, puis vague, chutes, argent) ; E2-3 stick gauche ; E2-4 stick droit ; E2-5 pause ; E2-6 panneau de pause ; E2-7 fin provisoire | 1 à 1m (fait) |
| E3 Boutique | `boutique.html` | E3-1 solde ; E3-2 liste des améliorations ; E3-3 armes ; E3-4 retour | 5 |
| E4 Fin de partie | scène ou page | E4-1 résultat ; E4-2 argent gagné ; E4-3 rejouer ; E4-4 boutique | 7 |
| E5 Réglages | `reglages.html` | E5-1 langue ; E5-2 son ; E5-3 réduire le sang ; E5-4 sauvegarde (export, import, effacer) | 7 |
| E6 Légal | `legal.html` | E6-1 mentions ; E6-2 vie privée | 7 |
Les noms de fichiers des écrans autres que `jeu.html` sont provisoires et fixés dans le prompt de leur lot. Le HUD (en HTML au-dessus du canvas) et les panneaux restent à au moins 16 px des bords, plus les zones de sécurité du téléphone.

## Mécanique
- Un niveau = une salle de 2000 × 1200 unités dans un monde de 3600 × 2800, entouré d'un décor extérieur (route, trottoir, voitures abandonnées, arbres, buissons, lampadaires, barrières). Valeurs provisoires dans `data/game/world.json` et `decor.json`.
- Murs de 40 d'épaisseur et 60 de haut. Trois fenêtres (ouvertures dans les murs, 140 de large) : nord au centre, ouest et est à mi-hauteur.
- La salle contient 14 meubles (tables, comptoirs, caisses, armoires, colonnes, étagères, hauteur 70 au plus). Ils bloquent le joueur, les zombies, les balles et le laser. Couloirs libres d'au moins 90 unités ; zone de départ du joueur libre ; au moins deux itinéraires depuis chaque fenêtre ; l'espace libre est connexe.
- Les zombies naissent à l'extérieur, hors de la vue (12 points d'apparition, jamais plus de 8 présents, un toutes les 2,5 s, valeurs provisoires), traversent le décor par des couloirs d'approche de 160 de large sans décor solide, et entrent par les fenêtres.
- Les zombies poursuivent le joueur en ligne droite quand la voie est libre, sinon contournent les meubles (champ de flux sur une grille de 20 unités).
- Fenêtres et barricades : les zombies cassent les planches des fenêtres (lot 3) ; jusque-là, les fenêtres sont passables pour les zombies seulement, fermées au joueur par des barrières invisibles.
- Réparation d'une fenêtre : le joueur reste à proximité ; la durée dépend de l'amélioration correspondante.
- « Tomber à terre » : à 0 de vie, le joueur tombe, se relève automatiquement après un délai en consommant une chute ; plus de chute = fin de partie.
- Vagues : générées par formule pure ; `data/waves.json` fournit les paramètres ; difficulté croissante à chaque niveau.
- Argent : gagné par ennemi tué et par vague, conservé à la mort.
- Améliorations permanentes (`data/upgrades.json`, niveaux et coûts) : vie, dégâts, cadence de tir, vitesse de déplacement, nombre de chutes, vitesse de réparation des fenêtres ; d'autres à définir.
- Armes (`data/weapons.json`) : une arme de départ (pistolet), d'autres achetables ; chaque arme définit dégâts, cadence, portée, vitesse de balle, tolérance de visée.
- Tourelles (lot 9), skins de personnage et d'armes (lot 11), thèmes de niveau : poste de police, rue, restaurant (lot 10).
- Sang et particules (lot 8), avec une option « réduire le sang ».
- Les valeurs d'équilibrage sont provisoires jusqu'au lot 12.

## Personnages et rendu
- Personnages articulés en 3D, vus du dessus : bassin, tronc, tête, deux bras (épaule et coude), deux jambes (hanche et genou), arme tenue en main. Le joueur tourne le tronc vers la visée, les jambes suivent le déplacement, léger recul au tir. Les zombies ont les bras tendus, une démarche traînante et un déphasage propre à chacun ; au lot 1c, quatre variantes de zombies (taille, tenue, teint, posture).
- Les angles des articulations viennent d'une fonction pure (`pose.js`, testée) ; le rendu ne fait que les appliquer.
- Géométries et matériaux partagés entre tous les personnages ; ombres portées (carte d'ombres 1024, la lumière suit la caméra) ; seuls les meubles, les voitures et les personnages projettent une ombre ; les murs et le décor léger non.
- Budget de dessin : au plus 300 appels de dessin avec 8 zombies et ombres actives (objectif 240 à partir du lot 1c), au plus 15 000 triangles. Le décor est créé une seule fois (maillages fusionnés ou instances), jamais par image.
- Paramètres de diagnostic dans l'URL : `?fps=1` (images par seconde), `?dpr=1`, `?shadows=0`, `?tilt=`, `?zoom=`.

## Contenus
| Contenu | Fournisseur | Statut |
|---|---|---|
| Textures, matériaux, modèles | Générés en code (fonctions pures déterministes, géométries Three.js) | Couleurs unies jusqu'au lot 1c, textures ensuite |
| Sons | Synthèse Web Audio, sans fichier ; retravaillés au lot 1d (sons en couches, filtres, réverbération, grognements et bruits de zombies occasionnels) | Provisoires jusqu'au lot 1d |
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
- Les couleurs du jeu sont des variables `--game-*` dans `tokens.css`, lues par le code du jeu (`js/game/palette.js`) ; aucune couleur en dur dans le JavaScript.
- Tout état (vie, fenêtre cassée, solde) est porté aussi par une forme ou un texte, jamais par la couleur seule.
- Lisibilité : contraste d'au moins 3:1 entre les personnages et le sol, 4,5:1 pour le laser et la balle (testé à partir du lot 1c).
- Cibles tactiles de 44 px, contraste de 4,5:1 pour le texte (le rouge sang n'est utilisé que pour de grands textes, 3:1), `prefers-reduced-motion` respecté (secousses, flashs et particules réduits).
- Tailles de test : 375, 768 et 1440 px, plus 667×375 (téléphone en paysage) et 2560×1080 pour le jeu.

## Stack et hébergement
- HTML, CSS à variables, JavaScript en modules. **Three.js 0.186.1** (MIT) est la bibliothèque de rendu : paquet npm en `devDependency` à version exacte, fichiers copiés par `npm run vendor:three` vers `vendor/three/` (versionnés, jamais édités à la main), chargés par `importmap` locale, sans CDN. `dependencies` reste vide. Phaser a été retiré au lot 1m.
- Outils de développement : ESLint (configuration plate), Vitest, Playwright avec axe, Lighthouse.
- Arborescence de code : `js/core/` (logique pure du jeu : aucun Three.js, DOM, réseau, stockage ni horloge ; temps passé en argument ; pas de `Math.random`, générateur à graine), `js/game/` (rendu et entrées), `js/save/` (futur `SaveRepository` et adaptateurs), `data/` (textes et chiffres).
- Le monde est dans le plan (x, y) pour la logique ; dans Three.js, (x, 0, y) ; le haut de l'écran est le nord.
- GitHub Pages, chemins relatifs, aucune ressource externe. Déploiement depuis `main` seulement ; aperçus par branche (fichier `apercu.txt`) à `/lots/lot-N/` (page `/lots/` et menu `/dev` générés automatiquement ; le menu ouvre la page de la première ligne de `apercu.txt`) ; une branche de lot n'est jamais supprimée. La branche `lot-0t` (test Three.js contre Phaser) n'est pas fusionnée et reste en ligne.
- Sauvegarde : interface `SaveRepository` ; adaptateur `localStorage` avec schéma versionné et migrations ; export et import par code. Une base en ligne sera un nouvel adaptateur, sur décision écrite.
- Jamais conservé : position, identité, adresse IP, paramètres d'URL de test. Aucun cookie.
- Langue : français seul pour l'instant ; la structure `data/i18n/` permet d'ajouter l'anglais. `noindex` pendant le développement.
- Tests : le paramètre `?test=1` expose `window.__zs` (état du jeu, graine, apparition d'un zombie, avance de la simulation, vue d'ensemble, rendu) ; `?empty=1` charge un monde sans meubles ni décor solide (pour les tests à coordonnées fixes) ; `?seed=` et `?nospawn=1` fixent la graine et coupent les apparitions.
- Seuils Lighthouse mobile : `index.html` 90 / 95 / 95 et CLS ≤ 0,1 ; `jeu.html` performance 45 (mesuré 55), accessibilité 95, bonnes pratiques 95, CLS ≤ 0,1. Le poids de Three.js (environ 2,1 Mo) pèse sur le score ; les mesures de fluidité sur téléphone comptent plus que le score simulé.

## Hors périmètre (pour l'instant)
Multijoueur, comptes, classements en ligne, publicité, achats, base de données, balles perforantes ou ricochets, munitions et rechargement, images, sons ou modèles 3D importés (tout est généré en code), anglais, caméra libre ou rotative, cartes de relief et post-traitement.

## Décisions en attente
- Zone morte de la caméra (0 aujourd'hui : la caméra suit toujours le joueur).
- Sons : synthèse améliorée (par défaut) ou enregistrements libres de droits (il faudrait lever « sons importés » et vérifier les licences).
- Anglais : abandonné ou reporté après la mise en ligne en français.
- Monétisation (le jeu reste gratuit et public).
- Date de mise en ligne officielle et passage en indexation.
- Base de données en ligne : si, quand et quel service (coûts : comptes, RGPD, clé visible dans le navigateur).
- Seuil de performance Lighthouse de `jeu.html` (45 proposé, mesuré 55).

## Risques connus
Fluidité de la 3D sur téléphone modeste (ombres, résolution, nombre de zombies) ; temps de génération des textures sur téléphone (lot 1c) ; coût du champ de flux sur téléphone (non mesuré, environ 15 ms en Node) ; budget d'appels de dessin presque atteint (300 sur 300 avec 8 zombies avant le lot 1c) ; poids de Three.js au chargement ; netteté sur écrans haute densité ; sticks multi-touch ; précision des impacts de balles rapides ; équilibrage (pièce trop dure ou trop facile) ; sang et public mineur ; tir automatique à rendre lisible ; audio non vérifiable par l'agent ; l'API de Three.js évolue (toujours lire le paquet installé).

## Plan en lots (état)
| Lot | Sujet | État |
|---|---|---|
| 0, 0b, 0c, 0d | Socle, aperçus par branche, CI, accueil en français | fait |
| 0t | Test jetable Three.js contre Phaser (branche non fusionnée, à conserver) | fait |
| 1 | Cœur du jeu en Phaser | fait, remplacé par 1m |
| 1m | Migration du rendu : Three.js remplace Phaser, personnages articulés, ombres, HUD HTML, caméra qui suit | fait |
| 1b | Monde plus grand, meubles, chemin des zombies, décor extérieur provisoire, apparitions hors vue, collisions du laser et des balles | fait |
| 1c | Textures générées en code et personnages finaux (4 variantes de zombies), budget de dessin | à lancer |
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
Base de données en ligne et sauvegarde dans le cloud, classement, achievements, mode difficile, anglais, plusieurs armes en même temps, caméra qui s'incline selon la vitesse, variantes de zombies spéciales.
