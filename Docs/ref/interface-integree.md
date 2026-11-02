# Interface intégrée (lot 3l)

L'interface de jeu de `jeu.html` est celle que le propriétaire a retenue dans l'atelier du lot 3k (`Docs/ref/passation-interface-4b.md`, copie au format « Mes choix » : `Docs/ref/interface-a-integrer.md`). Rien n'est réglable par le joueur : les macros choisies sont figées dans les jetons. Aucune police, image ni son ajouté ; icônes en SVG écrit dans `jeu.html` ou `js/game/hud.js`.

## Directions retenues, par écran
| Écran | Bloc | Direction | Macros figées | Fichiers |
|---|---|---|---|---|
| HUD | E2-2 | B « caméscope » (3 retouches du propriétaire) | texte M (15,75 px), densité compacte (4 px), fond léger (78 %), contour aucun, argent sous la vague | `jeu.html` (`#hud`), `css/game-ui.css`, `js/game/hud.js`, `js/core/hud-format.js` |
| Bouton Pause | E2-5 | B | carré, angles droits, `--hud-pause-size` (≈ 45 px) | `css/game-ui.css` |
| Pause | E2-6 | B | cadre 2 px, titre Rubik Dirt ; écran bas : 3 colonnes, volume en dernier | `jeu.html`, `css/game-ui.css`, `js/game/ui.js` |
| Mort, monde terminé | E2-7 | B | crâne ou coche dans le titre, pièce, étoile du record ; « Rejouer », « Revenir au menu principal » (sans action) | idem |
| À terre | E2-10 | B, sans cadre blanc | texte sous l'argent (colonne centrale), barre du compte à rebours ; voile plein écran inchangé | `jeu.html` (`#down`, `#down-body`), `js/game/hud.js` (`updateDown`) |
| Sticks | E2-3, E2-4 | A « sobre » | anneau 2 px, pastille ronde de 44 px, repos à 50 % | `css/game-ui.css` |
| Annonce de vague | E2-8 | inchangée (animation et mélodie du lot 2c) | — | — |
| Menu, boutique, réglages, classement | E1, E3, E5 | non intégrés (menu : « plus tard » ; autres : non choisis) | — | restent dans l'atelier |

Ne reviennent pas : flèches vers les fenêtres, ligne « Fenêtres », indicateur de réparation ; E2-9 et E2-11 ne sont jamais réutilisés.

## Jetons ajoutés (`css/tokens.css`, bloc final « Interface intégrée (lot 3l) »)
`--hud-text-scale` (1,125 : macro « texte M »), `--hud-fs` (14 px × l'échelle), `--hud-row` (ligne de la colonne de droite, 1,3 × `--hud-fs`), `--hud-pause-size` (max(44 px, 2 lignes + l'espace)), `--hud-target` (44 px). Aucune couleur nouvelle : les jetons existants (`--hud-bg`, `--hud-bg-alpha`, `--hud-gap`, `--color-*`, `--font-label`, `--game-down-*`) servent tels quels. `css/game-ui.css` ajoute `--edge-top` (16 px + zone de sécurité du haut) à côté des `--edge-left` et `--edge-right` du lot 4 (`css/game.css`).

## Table des identifiants (`jeu.html`)
Conservés (mêmes ids, rôle identique) : `#hud` (E2-2, devenu le conteneur des trois colonnes), `#hud-bar` (vie, `role="progressbar"`), `#hud-life`, `#hud-chutes`, `#hud-chutes-icons`, `#hud-chutes-text`, `#hud-floor`, `#hud-wave`, `#hud-money`, `#hud-money-text`, `#hud-gain`, `#hud-remaining`, `#hud-next`, `#hud-kills`, `#down` (E2-10, voile), `#down-title`, `#down-sub`, `#btn-pause`, `#stick-left`, `#stick-right`, `#sound-hint`, `#hud-live`, `#pause-panel` et tous ses boutons, `#volume-row`, `#end-panel`, `#end-title`, `#end-kills`, `#end-wave`, `#end-earned`, `#end-bonus`, `#end-balance`, `#end-best`, `#end-record`, `#end-save`, `#btn-replay`, `#wave-announce`, `#labels`, `#rotate`. Champs de `getState()` inchangés (`time` existait déjà : temps de jeu).

| Ancien | Nouveau | Raison |
|---|---|---|
| `#hud-fill` (barre de vie) | → retiré | B : vie sans barre (« VIE » et « 64/100 ») ; la valeur reste dans `aria-valuenow` de `#hud-bar` |
| `#end-save-link` (« Voir ma sauvegarde ») | → retiré, remplacé par `#btn-menu` | choix du propriétaire (3e retouche) : « Revenir au menu principal », sans action tant que le menu n'existe pas |
| `.hud-left`, `.hud-block`, `.hud-life-row`, `.hud-chips` (rangées du lot 3a/4) | → `.hud-tl`, `.hud-tc`, `.hud-tr` (colonnes) | trois colonnes de B |
| `#hud-wave` hors de `#hud` | → dans la colonne centrale de `#hud` | B : vague au centre, argent dessous |
| `.down-body` dans `#down` | → `#down-body` dans la colonne centrale de `#hud` | retour du propriétaire : texte sous l'argent, hors de la zone des pouces |
| `#hud-kills` « 57 tués » | → `#hud-kills` = « TUÉS » + `#hud-kills-text` « 57 » | libellé et valeur séparés (B) |
| `#hud-remaining` « 5 restants », `#hud-next` « Début dans 3 s » | → libellé + `#hud-remaining-text` « 05 », `#hud-next-text` « 3 s » | même boîte (ligne 1 de la colonne de droite) |
| `#hud-wave` « Vague 7 / 40 » | → libellé + `#hud-wave-text` « 07 / 40 » + `#hud-reinforced` | B : numéro sur 2 chiffres, « RENFORCÉE » dessous |
| `#pause-balance`, `#end-earned`, `#end-bonus`, `#end-record`, `#end-title` (texte direct) | → texte dans `#pause-balance-text`, `#end-earned-text`, `#end-bonus-text`, `#end-record-text`, `#end-title-text` | une icône SVG décorative précède le texte |

Ajoutés : `#hud-chrono`, `#hud-rec`, `#hud-chrono-text` (REC et temps de jeu), `#hud-floor-text`, `#hud-trial` (« MODE ESSAI »), `#hud-wave-text`, `#hud-reinforced`, `#hud-remaining-text`, `#hud-next-text`, `#hud-kills-text`, `#down-body`, `#down-title-text`, `#down-fill` (barre), `#pause-balance-text`, `#end-box` (`data-variant` : icône du titre), `#end-title-text`, `#end-earned-text`, `#end-bonus-text`, `#end-record-text`, `#btn-menu`.
Clés de textes : ajoutées `game.hud.rec`, `lifeShort`, `waveShort`, `waveOf`, `reinforced`, `remainingShort`, `nextShort`, `nextValue`, `killsShort`, `trial`, `game.end.menu` ; retirées `game.hud.kills`, `game.hud.kills.one`, `game.wave.hud`, `game.wave.next` ; `game.wave.hudOf`, `game.wave.remaining(.one)` et `game.end.saveLink` restent (lues par l'atelier).
L'atelier suit : `js/atelier-interface/actuel.js` (éléments masqués pour A, B, C : `#hud` et non plus `.hud-left` ; éléments mesurés de « Actuel » nommés comme les blocs de B).

## Mesurer, ajouter un état ou une taille
- Mesures de l'interface réelle : `node scripts/interface/mesures.mjs [--json] [--sizes=667x375,1440x900] [--screens=hud,pause]` (serveur `scripts/serve.mjs` lancé si besoin) ; « Actuel » de `atelier-interface.html` montre désormais cette interface.
- Tailles : liste `sizes` de `data/game/ui-atelier.json` (id, largeur, hauteur, zones de sécurité simulées) ; elle sert aussi à `tests/e2e/interface-integree.spec.js`.
- États : `tests/e2e/interface-integree.spec.js` amène le jeu dans chaque état par les hooks de `?test=1` (`step`, `downPlayer`, `setChutes`, `giveMoney`, `startWave`, `skipWave`…) puis mesure avec `js/atelier-interface/measure-dom.js` et `js/core/ui-measure.js` ; un état nouveau = un appel de plus dans ce fichier.

## Modifier une macro
- Taille du texte : `--hud-text-scale` (1 = S, 1,125 = M, 1,375 = L) ; tout le HUD, Pause, les panneaux et l'état à terre suivent (tailles en em).
- Fond des blocs : `--hud-bg-alpha` (0,78 = léger ; 1 = plein). Contraste vérifié par `tests/unit/data-hud.test.js`.
- Espacement : `--hud-gap` (4 px compacte, 10 px aérée).
- Marges : règle de la maquette du lot 3k, choisie par le propriétaire au lot 3l (point ouvert § 6.1 de la passation tranché) : 16 px plus la zone de sécurité de chaque côté (`--edge-left`, `--edge-right` de `css/game.css`, `--edge-top` de `css/game-ui.css`). Avant (lot 4) : max(16 px, zone − 28 px) à gauche et à droite ; pour y revenir, remettre ces deux lignes et relancer les mesures.

## Écrans hors lot
Menu (lot 7), boutique (lot 5), réglages et leur stockage (lot 7), classement et compte (lots 7b, 7c) : maquettes dans l'atelier (`atelier-interface.html`, fausses données annoncées), exigences dans `Docs/ref/integration-interface.md`. « Revenir au menu principal » (`#btn-menu`) attend le menu ; l'accès à `sauvegarde.html` depuis le jeu reste à décider (il n'est plus sur l'écran de fin).

## Lien avec l'atelier
L'atelier reste publié (`atelier-interface.html`, `interface-retenue.html`) ; son « Actuel » charge le jeu, donc la nouvelle interface. L'ancienne interface reste visible sur l'aperçu de la branche `lot-4` : `https://nowyyy.github.io/Z-Survival/lots/lot-4/jeu.html` (forme des adresses : `scripts/assemble.mjs`, `apercu.txt` de `lot-4`).
