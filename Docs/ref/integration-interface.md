# Plan d'intégration de l'interface (pour le lot 4b)

Ce plan part des propositions de `atelier-interface.html` (lot 3k). Rien n'est intégré au lot 3k. Le propriétaire choisit, par écran, une direction et ses macros (« Mes choix »). `node scripts/interface/projection.mjs '<Mes choix>'` imprime pour ce choix le nombre d'éléments, de règles CSS et de tests concernés. Mesures de référence : `Docs/ref/interface-actuelle.md` (actuel) et `Docs/lots/lot-3k.md` (directions).

## Correspondance des blocs `E2-n` (identifiants conservés, E2-9 et E2-11 jamais réutilisés)
| Bloc | Aujourd'hui (`jeu.html`) | Proposition (A, B, C) | Changement de DOM |
|---|---|---|---|
| E2-2 HUD | `#hud` (vie, chutes, restants ou compte à rebours, tués, étage), `#hud-money` (+ `#hud-gain`), `#hud-wave` (hors bloc) | trois colonnes fixes : gauche (vie, chutes, étage ; B : chrono, vie, chutes, étage), centre (vague « N / 40 » + « Renforcée », restants), droite (argent selon la macro, « Mode essai » ; B : tués) | `.hud-left` devient trois conteneurs `.hud-tl`, `.hud-tc`, `.hud-tr` ; **ids conservés** (`#hud-bar`, `#hud-fill`, `#hud-life`, `#hud-chutes`, `#hud-remaining`, `#hud-next`, `#hud-kills`, `#hud-floor`, `#hud-money`, `#hud-money-text`, `#hud-gain`, `#hud-wave`) ; `data-block="E2-2"` sur le conteneur commun ; ajouts : `#hud-trial` (mode essai), B : `#hud-chrono`, `#hud-rec` ; A : pastilles de chutes (5 `span`) ; B : vie en texte seulement (« VIE 100/100 », `#hud-fill` retiré) |
| E2-5 Pause | `#btn-pause` 44 px | A, B : 44 px ; C : 52 px | aucun |
| E2-6 pause | `#pause-panel` | mêmes boutons et ids ; écran bas : trois colonnes, volume en dernière ligne | ordre : `#btn-restart` avant `#volume-row` |
| E2-7 fin | `#end-panel` | mêmes lignes et ids ; icône (crâne ou coche) dans le titre, étoile pour le record | ajout de deux `svg` décoratifs |
| E2-10 à terre | `#down` (texte à 84 % de la hauteur, dans la zone des pouces) | texte sur une ligne, bas à 4 px au-dessus de la moitié de l'écran, barre de compte à rebours | ajout `#down-bar` ; CSS `.down-body` déplacé |
| E2-3, E2-4 sticks | `#stick-left`, `#stick-right` | mêmes ; C : base 128 px, pastille 60 px | aucun |
| E2-8 annonce | `#wave-announce` | **inchangée** (cohérence vérifiée : Rubik Wet Paint, `--game-splash-*`, marges de sécurité) | aucun |

## Fichiers à modifier
- `jeu.html` : conteneurs du HUD ci-dessus, ajouts listés ; aucun nouveau bloc E2.
- `css/game.css` : remplacer la section « HUD (E2-2, lot 3a) » par la base commune (`css/atelier-interface.css`, section « Base commune », classes `p-*` renommées `hud-*`) et la feuille de la direction retenue (`css/proto-a|b|c.css`, sélecteurs `.ui3k-dir-x` retirés) ; marges : `--edge-*` passe de `max(16 px, zone − 28 px)` à `16 px + zone` (règle du lot ; à confirmer par le propriétaire, qui avait demandé des bords plus proches au lot 4) ; unités de conteneur (`cq*`) remplacées par `vw`/`vh`, `@container ui3k` par `@media`.
- `js/game/hud.js` : écrire les nouveaux textes (« N / 40 », restants avec zéro devant en B, tués sur 4 chiffres en B, chrono en B, pastilles en A) ; seulement quand la valeur change (comme aujourd'hui).
- `js/game/ui.js` : icônes de l'écran de fin, ordre volume / recommencer ; `js/game/game.js` : `updateDownView` (barre), chrono de jeu pour B (temps de jeu, jamais l'horloge réelle).

## Champs de `getState()` et éléments
`player.health`, `player.maxHp` → vie (barre et « x/y ») ; `down.chutes` (via `setChutes`) → chutes ; `save.balance` / `bank.balance()` → argent (`formatMoneyCompact`) ; `waves.wave` + `wavesPerWorld` → vague ; `waves.reinforced` → « Renforcée » ; étage du joueur → étage ; `waves.remaining` → restants ; `kills` → tués (B) ; `time` → chrono (B) ; `save.status`, `save.readOnly` → pause et « Mode essai » ; `getState().hud` (hauteur, largeur) à étendre aux trois colonnes.

## Clés de `fr.json` à ajouter (depuis `data/i18n/atelier-interface.json`, préfixe `ui3k.` à renommer en `game.`)
HUD : `ui3k.hud.waveOf` (« {n} / {max} »), `ui3k.hud.reinforced`, `ui3k.hud.trial` ; B : `ui3k.hud.lifeShort`, `waveShort`, `remainingShort`, `killsShort`, `rec` ; C : `ui3k.hud.waveWord` ; sticks : `ui3k.sticks.move`, `ui3k.sticks.aim` ; priorité 2 : `ui3k.p2.low`. Écrans hors partie : `ui3k.menu.*`, `ui3k.shop.*`, `ui3k.settings.*`, `ui3k.board.*`, `ui3k.common.*` (aux lots 5, 7, 7b, 7c). Les clés `game.*` existantes sont réutilisées telles quelles.

## Variables à ajouter à `tokens.css`
Aucune couleur nouvelle : les propositions n'utilisent que des jetons existants (`--hud-bg`, `--hud-radius`, `--color-*`, `--font-*`, `--game-down-*`, `--game-splash-*`, `--game-laser`). Réglages des macros à poser en jetons du HUD : `--hud-text-scale` (1, 1,125, 1,375), `--hud-bg-alpha` (existe : 0,78 ; transparent 0, plein 1), `--hud-outline` (0, 1, 2 px), `--hud-density-gap` (4 ou 10 px), `--hud-pause-size` et `--hud-target` (44 ou 52 px). Variables propres à l'atelier, **non** à intégrer : `--ui3k-safe-*`, `--ui3k-sys`, `--ui3k-p`, `--ui3k-edge-*` (remplacées par `--safe-*`, `--edge-*`).

## Tests existants à adapter (sélecteurs et tailles qui changent)
- `jeu-interface.spec.js` : `#hud` ≤ 300 × 96 px et ordre `E2-2, E2-8, E2-10, E2-5, E2-3, E2-4` (le HUD passe à trois colonnes ; la vague 16 px devient 17,3 px en A, M) ; marges `--edge-*` ; `.hud-left` cité par l'expression régulière des marges.
- `argent.spec.js` : largeurs fixes `#hud` 12,5 rem, `#hud-money` 5,5 rem, `#hud-wave` 9 rem (deviennent les largeurs en em de la direction) ; pire cas ≤ 300 × 96 ; position de l'argent selon la macro.
- `etage.spec.js`, `etage-salle.spec.js`, `jeu-zones.spec.js` : HUD 96 × 300, puce « Étage » ; `data-hud.test.js` : section CSS « HUD (E2-2, lot 3a) », tailles de police autorisées, fond sur `.hud` seulement (A est transparent par défaut : test à réécrire avec le contour) ; `data-vagues.test.js`, `jeu-vagues.spec.js` : `#hud-wave` ; `jeu-chutes.spec.js` : `#down` (position), chutes ; `jeu-pause.spec.js` et les autres fichiers listés par `projection.mjs` (sélecteurs `#btn-pause`, `#pause-panel`, `#end-panel` conservés : adaptation légère).
- Nouveaux tests : reprendre `tests/e2e/interface-atelier*.spec.js` sur `jeu.html` (aucun chevauchement, zone sûre, pouces, 14 px, 44 px, contraste 4,5:1, 0 px de déplacement) et `interface-atelier-mesure.test.js` pour les calculs.

## Effets attendus
- **CLS** : blocs de taille fixe, aucune police nouvelle ; atelier mesuré à 0 au chargement (1 440 px), ≤ 0,1 aux trois largeurs testées. Jeu actuel : 0,0008.
- **Poids du CSS** : `game.css` 26 422 octets (7 307 compressés) ; base commune des propositions 17 646 octets dont environ la moitié pour les écrans hors partie et la priorité 2 ; directions : A 2 978, B 4 929, C 3 323 octets. Le HUD intégré resterait sous +6 Ko non compressés.
- **Lighthouse** (`jeu.html` à 45, marge nulle) : aucun triangle ni appel de dessin ajouté (interface HTML) ; éléments du DOM du HUD (HUD + Pause) : actuel ≈ 30, A 35, B 51, C 34 ; B ajoute la seule animation (point REC, `opacity`, 1 par seconde). À mesurer au lot 4b avant de choisir B.

## Ce que les écrans hors partie demandent aux futurs lots
- **E1 menu (lot 7)** : page à part de `index.html`, choix du monde (déverrouillage : `records.worldsCompleted` de la sauvegarde), solde (`money`).
- **E3 boutique (lot 5)** : prix réels (`economy.json`), achat = nouveau type de commit de sauvegarde (débit), niveaux de `stats` ; états du bouton : disponible, argent insuffisant, niveau maximal (`player-stats.json`, chutes : 5).
- **E5 réglages (lot 7)** : langue, son, volume, effet VHS en sauvegarde (nouveau champ = nouvelle version de schéma) ; niveau de sang du lot 3j (`?sang=0|reduit|1`) ; E5-4 remplace `sauvegarde.html`.
- **Classement (lots 7b, 7c)** : compte Google réel (7b), service de classement et règles du pseudo (3 à 20 caractères, `validatePseudo`) (7c) ; aucune connexion au lot 3k.

## Choix du propriétaire (après le lot 3k) et retouches faites dans l'atelier
Choix : HUD, pause, fin (mort et monde terminé), à terre : **B** ; sticks : **A** ; menu : plus tard (boutique, réglages, classement : non choisis). Macros non précisées : celles par défaut. Retouches de B déjà faites dans l'atelier : vie sans barre (« VIE » et « 100/100 ») ; « VAGUE » et « RESTANTS » en entier ; étage de largeur fixe (« RDC » comme « Étage », vérifié par la stabilité) ; argent et tués de même largeur (7 em), tués sur 4 chiffres (jusqu'à 9 999) ; ces deux lignes tiennent ensemble dans la hauteur du bouton Pause (Pause = max(44 px, 2 lignes de 1,3 em + l'espace)) ; « Mode essai » passe au centre sous les restants ; à terre sans cadre blanc. Mesures après retouche : 0 hors cible aux 7 tailles dans les 8 cas de jeu (macros par défaut), stabilité 0 px ; hors cible rapporté : texte L + aérée à 812×375, texte « À terre » contre l'étage.
Deuxième retouche (page `interface-retenue.html`) : « Restants » passe en haut à droite au-dessus des tués (même largeur, les deux lignes dans la hauteur de Pause), l'argent passe sous la vague (macro de B par défaut : `sous-vague`) ; REC, VIE et la ligne chutes + étage s'arrêtent au même bord droit (celui de REC, 8,8 em). Mesures : 0 hors cible aux 7 tailles (combat, pire cas, à terre), stabilité 0 px.
