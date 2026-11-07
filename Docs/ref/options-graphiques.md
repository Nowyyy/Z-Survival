# Options graphiques (lot 5j)

Écran **Options** de la pause (bloc `E2-12`) : préréglages **Auto, Faible, Moyen, Élevé, Perso** et une ligne par réglage graphique. Aucune option ne touche la logique du jeu (`getState()` logique identique pour toute combinaison, test `tests/e2e/graphismes.spec.js`, 12 vecteurs tirés d'une graine). Les valeurs des préréglages sont **provisoires** (lot 5b) et identiques à celles d'avant ce lot.

## Fichiers
- `data/game/graphics.json` (schéma 2) : `sections`, `options`, `presets` (un vecteur complet par préréglage), `auto` (inchangé).
- `js/core/graphics.js` (pur) : `parseGraphics`, `parseOptions`, `vectorSettings` (vecteur → réglages du rendu, forme `{ live, load }` du lot 5b), `valueFor`, `effectiveOptions`, `setOption`, `choosePreset`, `pendingReload`, `sanitizeCustom`, `nearestPreset` ; `settingsFor`, `resolvePreset`, `autoDecision` inchangés.
- `js/game/graphics-boot.js` : vecteur effectif au chargement. `js/game/graphics-apply.js` : options « live » à chaud, options « load » en attente, Auto, `getState().graphics`.
- `js/game/options-menu.js` : l'écran, **importé à la première ouverture** (aucun fichier de plus chargé par défaut : 113 fichiers JavaScript).
- `js/save/device-settings.js` : stockage `zs.device.v1` schéma 2.

## Options
| id | section | groupe | valeurs (libellé) | Faible | Moyen | Élevé | réglages fixés |
|---|---|---|---|---|---|---|---|
| `resolution` | Image | live | basse (Basse), moyenne (Moyenne), haute (Haute) | basse | moyenne | haute | `dprMax` 1 / 1,5 / 2 |
| `anticrenelage` | Image | load | non (Coupé), oui (Activé) | non | non | oui | `anticrenelage` |
| `ombres` | Image | live | aucune (Aucune), basses (Basse), hautes (Haute) | aucune | basses | hautes | `ombres`, `ombreTaille` 512 / 512 / 1 024 |
| `vhs` | Image | live | off (Coupé), statique (Statique), anime (Animé) | off | statique | anime | `vhs` |
| `carte` | Carte | load | reduit (Réduit), complet (Complet) | reduit | complet | complet | `decor` (décor léger intérieur) |
| `textures` | Carte | load | simples (Simple), fines (Riche) | simples | fines | fines | `texturesFines` |
| `brume` | Carte | live | simple (Simple), reduite (Réduite), complete (Complète) | simple | reduite | complete | `brouillard` |
| `feux` | Carte | live | reduits (Réduit), complets (Complet) | reduits | complets | complets | `feux.voitureFoyers` 1 / 2, `feux.particules` 0,5 / 1, `feux.lueur` |
| `fumee` | Carte | live | coupee (Coupée), moitie (Moitié), complete (Complète) | coupee | moitie | complete | `feux.fumeeHelico` 0 / 0,5 / 1 |
| `personnages` | Personnages | load | simples (Simple), riches (Riche) | simples | simples | riches | `personnages` A / table des choix |
| `sang` | Personnages | live | reduit (Réduit), complet (Complet) | reduit | reduit | complet | `sang` |
| `cadavres` | Personnages | live | 0 (Aucun), 1, 2 | 0 | 1 | 2 | `cadavres` |

Les sous-réglages des feux se regroupent en deux options : foyers de la voiture, particules et lueur des autres feux bougent ensemble dans les trois préréglages (`feux`) ; la fumée de l'hélicoptère a trois niveaux (`fumee`).

## Règles
- **Préréglage** : Faible, Moyen, Élevé fixent toutes les options (leur vecteur). **Auto** (défaut) : Moyen sur téléphone ou pointeur grossier, Élevé sinon ; baisse d'un cran entre deux manches (inchangé) : seules les options « live » baissent, les « load » restent celles du chargement.
- **Perso** : modifier une option depuis tout autre choix (Auto compris) passe sur Perso ; les autres options gardent leur valeur du moment. Le vecteur Perso est gardé à part : revenir sur Perso après un autre préréglage le restaure ; première fois sans configuration : les valeurs du moment.
- **Appliquer** : une option `live` s'applique tout de suite ; une option `load` est enregistrée tout de suite, marquée « S'appliquera au rechargement », et la barre « Recharger maintenant » (confirmation « Cette partie sera perdue ») reste visible tant qu'une option `load` diffère du jeu en cours. Aucun rechargement sans ce bouton.
- **Priorités** : paramètre explicite de l'adresse (`?vhs=`, `?detail=`, `?shadows=`, `?dpr=`, `?perso=`, `?sang=`) > réglages enregistrés > défauts. Une option imposée est grisée avec « Imposé par l'adresse » (« valeur de l'adresse » si elle n'est pas dans la liste, par exemple `?dpr=1.25`) et n'entre jamais dans Perso. `?gfx=` choisit le préréglage, n'écrit jamais rien et verrouille l'écran ; `?gfx=perso` utilise le Perso enregistré. `?usure=` n'est pas une option de l'écran.
- **Mouvement réduit** : l'effet VHS reste coupé (comme avant) ; l'option est grisée avec « Désactivé (mouvement réduit) ».

## Stockage
Clé `zs.device.v1` (aucune autre clé) : `{ "v": 2, "graphics": "auto" | "faible" | "moyen" | "eleve" | "perso", "custom": { "<option>": "<valeur>" } | null }`. Schéma 1 (`{ v: 1, graphics }`) lu comme `{ graphics, custom: null }`, réécrit en schéma 2 au prochain choix seulement. Forme de `custom` vérifiée au stockage (32 paires au plus, identifiants et valeurs courts) ; options inconnues ignorées et valeurs inconnues ou absentes ramenées à celles du préréglage le plus proche (le plus de valeurs égales ; à égalité Moyen, Élevé, Faible) par `js/core/graphics.js`. JSON illisible ou version future : Auto, jamais écrasé (message dans l'écran). Stockage indisponible : mémoire de la page et message. `?test=1` sans `&store=local` : mémoire.

## `getState().graphics` (sous `?test=1`)
`choice` (choisi), `preset` (effectif ; en Auto, le préréglage en cours), `vector` (valeurs effectives), `origins` (`preset`, `perso`, `adresse`), `imposed`, `running` (valeurs du chargement), `pending` (options « load » en attente), `custom`, `locked`, `reloadRequested` ; et, comme au lot 5b, `live`, `load`, `overridden`, `pixelRatio`, `shadows`, `vhs`, `world`, `storage`.

## Ajouter une option (lot 5k : lampes et lumières)
1. **Réglage du rendu** : si l'option fixe un réglage nouveau, l'ajouter à `SETTING_KEYS.live` ou `.load` et le vérifier dans `parseLive` ou `parseLoad` (`js/core/graphics.js`), avec la valeur de l'Élevé dans `ELEVE` (rendu actuel inchangé).
2. **Données** (`data/game/graphics.json`) : une entrée de `options` (`id`, `section`, `group`, `texte`, `valeurs` : `id`, `texte`, `reglages`) et sa valeur dans chacun des trois vecteurs de `presets`. Une section nouvelle s'ajoute à `sections` (`id`, `texte`).
3. **Textes** : les clés `texte` dans `data/i18n/fr.json` seulement (le jeu est en français ; `tests/unit/data-i18n.test.js` interdit les clés `game.*` dans `en.json`).
4. **Application** : option `live` : la lire dans `applyLive` (`js/game/graphics-apply.js`) et l'appliquer à chaud (comparer à la valeur déjà appliquée si l'opération coûte ou efface quelque chose) ; option `load` : la lire au chargement dans `gfx.settings.load` (fichiers de démarrage). L'écran n'a rien à changer : il lit la liste des options.
5. **Tests** : `tests/unit/graphics-options.test.js` (nombre d'options, vecteurs figés, groupes) ; vérifier que les vecteurs d'avant restent identiques ; e2e : l'effet de l'option à chaud ou au rechargement, l'invariance (12 vecteurs) inclut automatiquement la nouvelle option.
