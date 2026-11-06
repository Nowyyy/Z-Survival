# `CLAUDE.md` pour V0.6 (lot 5f)

Consolidation de `CLAUDE.md` à la publication de V0.6 : lignes des bilans 5a à 5h ajoutées, lignes déplacées vers `Docs/ref/conventions.md`, rien de perdu.

## Mesure
- Avant : **8 994 caractères** (`wc -m` en UTF-8, ou `[...texte].length`). Le prompt du lot attendait 8 287 : le lot 5g (commit `aa4e220`, « CLAUDE.md et conventions.md à jour ») a ajouté ses lignes sans retirer d'autres, d'où un dépassement de la limite de 8 400 (`Docs/seed.md`). Sans `LC_ALL` en UTF-8, `wc -m` compte les octets (9 191).
- Test qui la vérifie : `tests/unit/hygiene.test.js` exige seulement **moins de 12 000** ; la limite de 8 400 n'est vérifiée par aucun test (idée du lot 4g, toujours ouverte).
- Après : **8 140 caractères** (marge de 260 sous 8 400, au moins 150 exigés). 75 → 64 lignes ; 18 lignes retirées, 7 ajoutées ou réécrites.
- Vérification par script : chaque ligne de règle retirée de `CLAUDE.md` est présente mot pour mot dans `conventions.md` (section « consolidation du lot 5f ») : 0 ligne perdue.

## Lignes des bilans (ligne par ligne)

| Source | Texte (résumé fidèle ; texte intégral dans le bilan) | Décision |
|---|---|---|
| 4g | aucune section « Lignes à ajouter » (consolidation déjà faite) | rien à reprendre |
| 5a-1 | Épaves : `epaves.json` → `decor.json` par `npm run carte`, `js/core/epaves.js`, voiture en flammes, hélicoptère dans l'angle du L… | `conventions.md` seulement (« Lignes des bilans des lots 5a à 5e ») ; mot-clé « épaves » dans la ligne « V0.6 » de `CLAUDE.md` |
| 5a-2 | Couleurs `--game-wreck-*`, `--game-car-*`, `--game-crater-*`, `--game-smoke-light` | `conventions.md` seulement (la règle des jetons de `CLAUDE.md` couvre déjà le principe) |
| 5a-3 | `fire.js` : `spots`, `glow: false`, `flames: false`, `smoke { alpha, color, rise }` | `conventions.md` seulement |
| 5a-4 | Impact sur zombie : `impact-chair` (B) sous `impact-zombie` ; `?sons=ancien` = ancien « cling » ; douille −20,4 dB | `conventions.md` seulement, **sans** « `?sons=ancien` = ancien cling » (périmé : retiré au lot 5e ; noté en fin de ligne) |
| 5a-5 | `ringingPartials` / `ringMs` : aucun partiel au-dessus de 2 kHz plus long que la cible | `conventions.md` seulement |
| 5b-1 | Mesure : `?perf=1` (`profiler.js`, `perf-panel.js`, `perf-stats.js`), `?cap=`, `scripts/perf/` | `conventions.md` ; `?perf=1` cité dans la ligne « V0.6 » de `CLAUDE.md` |
| 5b-2 | Préréglages : `graphics.json` ; `?gfx=` > `zs.device.v1` > auto ; Auto baisse d'un cran, jamais de remontée | `conventions.md` ; priorité résumée dans la ligne « V0.6 » de `CLAUDE.md` |
| 5b-3 | Stockage : seules clés `zs.save.v1` et `zs.device.v1` | `conventions.md` ; `zs.device.v1` cité dans la ligne « V0.6 » |
| 5b-4 | Rendu : `renderer.compile` sous l'écran de préparation ; un préréglage ne touche jamais la logique ; seuils d'Auto | `conventions.md` ; « jamais d'effet sur la logique » dans la ligne « V0.6 » |
| 5b-5 | `?gfx=`, `?perf=`, `?cap=` hors de `readOnlyParams` | `conventions.md` seulement |
| 5c-1 | Nettoyage : `scripts/nettoyage/auditer.mjs`, preuve rejouée, fichiers figés jamais candidats | `conventions.md` seulement |
| 5c-2 | Notes de péremption : ligne gardée mot pour mot, correction en fin de ligne *(Lot N : …)* | `conventions.md` seulement (appliquée par ce lot) |
| 5d-1 | Allocations : `collision.js` et poses sans allocation ; variantes `Into` | `conventions.md` ; « allocations » dans la ligne « V0.6 » |
| 5d-2 | Optimisation de la logique : identité au bit près contre l'oracle (`tests/unit/helpers/oracle/`), `trace-logique.mjs` | `conventions.md` ; « identité au bit près, oracle » dans la ligne « V0.6 » |
| 5d-3 | V8 et champs flottants : lire chaque champ une fois | `conventions.md` seulement |
| 5d-4 | Poses `Into` : articulation absente = `undefined`, poses propres à chaque personnage | `conventions.md` seulement |
| 5d-5 | Mesure : `mesurer.mjs --gc`, `--ref-memes-reglages`, `synthese-allocations.mjs` | `conventions.md` seulement |
| 5e-1 | Repli des personnages : table absente ou variante inconnue → A ; `?perso=actuel` et `?sons=ancien` retirés | `conventions.md`, reformulée sans citer les valeurs retirées ; « repli en variante A » dans la ligne « V0.6 » |
| 5e-2 | Références de rendu des tests : variante A (`&perso=A&sang=0`), une par projet si le mobile diffère | `conventions.md` seulement (déjà en partie dans « Personnages v2 et sang → Budget ») |
| 5g-1 | Site : `/` en construction ; `/Recette/` = main ; `/dev/` = dev ; `/next/`, `/lots/` ; `/v0.N/` ; liens relatifs | **déjà présente** (ligne « URL » ajoutée au lot 5g), **fusionnée** avec 5h-3 dans la ligne « URL » réécrite ; détail dans « Site et publication (V0.6) » |
| 5g-2 | Accueil : `site-info.json` (assembleur) ; évolutions = lots de dev non publiés ; `textContent` | déjà présente ; **fusionnée** avec 5h-5 (ligne « Accueil » réécrite) |
| 5g-3 | Journal : chaque lot ajoute son entrée à `lots` avec `version: "<cible>"` (v0.N) et `date` ; plus de liste `versions` | déjà présente ; raccourcie (« plus de liste versions ni de page /dev/ » retiré : la page n'existe plus, rien à rappeler) et déplacée sous « Publication » |
| 5g-4 | `pages.yml` : assembleur de la branche qui déclenche ; jamais de déclenchement manuel sur `main` avant une publication | **déjà présente** (ligne « CI ») : gardée telle quelle |
| 5h-1 | Noms affichés : `noms-versions-et-lots.txt` l'emporte sur `versions.json` et `changelog.json` ; lu dans le build de dev, sinon de main | **ajoutée** à `CLAUDE.md` (ligne « Noms affichés », fusionnée avec 5h-2 et 5h-4) |
| 5h-2 | Les agents ne modifient jamais les textes du propriétaire ; un lot ajoute au plus son bloc | **ajoutée** (même ligne) |
| 5h-3 | `/recette/` (toute casse) → `/Recette/` par `404.html` ; jamais de dossier `recette/` | **ajoutée** à la ligne « URL » (remplace « `/recette/` (minuscules) : 404 ») ; « aucun chemin qui ne diffère que par la casse » dans `conventions.md` |
| 5h-4 | Une faute dans le fichier des noms fait échouer `noms.test` (quick) et bloque le déploiement de dev | **ajoutée** (ligne « Noms affichés ») |
| 5h-5 | Accueil : étiquette = `label` de `site-info.json` si valide (1 à 60, sans contrôle), sinon `V<id>` | **ajoutée** à la ligne « Accueil » |

Règles demandées par le prompt et où elles sont : adresses du site (ligne « URL »), `site-info.json` et la règle des évolutions (« Accueil »), entrée de chaque lot dans `lots` avec `version` et `date` (« Journal »), fichier des noms, priorité, branche lue et textes du propriétaire (« Noms affichés »), redirection `/recette/` (« URL »), étiquette (« Accueil »), faute → `noms.test` → déploiement bloqué (« Noms affichés »), assembleur de la branche qui déclenche et pas de déclenchement manuel (« CI »).

## Lignes de `CLAUDE.md` déplacées vers `conventions.md`

Destination : section « Règles détaillées déplacées de `CLAUDE.md` (consolidation du lot 5f, V0.6, aucune règle supprimée) », texte intégral ; la ligne de renvoi finale de `CLAUDE.md` les nomme (« vagues, stats, chutes, planches, HUD, escaliers, fondu, visibilité, portes, interface, décor : lot 5f »).

| Ligne d'avant | Sujet | Décision |
|---|---|---|
| 10 | `npm run assemble` | réécrite (raccourcie, avec l'aperçu local) ; texte d'avant dans la section |
| 11 | Aperçu local du menu (`npm run site`, `serve:site`, `e2e-site.mjs`) | fusionnée dans la ligne 10 ; détail (adresses de `e2e-site.mjs`) dans « Site et publication (V0.6) » |
| 17 | URL et adresses | réécrite (`/recette/` → `/Recette/` par `404.html`) ; texte d'avant, avec sa note de péremption |
| 53 | Vagues | déplacée |
| 55 | Statistiques | déplacée |
| 58 | Chutes | déplacée |
| 59 | Planches | déplacée |
| 60 | HUD | déplacée |
| 61 | `jeu.html` (apple-mobile-web-app-capable) | déplacée |
| 62 | Journal | réécrite (voir 5g-3) |
| 63 | Accueil | réécrite (voir 5g-2, 5h-5) |
| 66 | Escaliers | déplacée |
| 67 | Fondu | déplacée |
| 68 | Visibilité | déplacée |
| 69 | Portes | déplacée |
| 73 | Interface | déplacée |
| 74 | Décor léger | déplacée |
| 75 | Renvoi final vers `conventions.md` | réécrite (nomme les lignes déplacées) ; ligne « V0.6 (lots 5a à 5e) » ajoutée avant elle |

## Éléments périmés (aucune mention restante hors historique et bilans)

- `CLAUDE.md` : aucune mention de `?perso=actuel`, `?sons=ancien`, `?murs=bas`, « 12 pièces et 700 triangles », « 8 Mo », `/lots/lot-N/`, `/next/` comme build de développement (seulement la redirection `/next/` → `../dev/jeu.html`), journal par version, `changelog.json → versions`, « racine = version publiée ».
- `conventions.md` : ces mentions ne restent que dans des lignes historiques (consolidations, mot pour mot) suivies d'une note *(Lot N : …)*. Notes ajoutées par ce lot : « Journal des versions » (section « Jeu »), « Journal de `/dev` » (section du lot 4b), « Journal des versions : … dev.spec » (consolidation du lot 4g), ancienne ligne « URL » (consolidation du lot 5f : `/recette/` : 404).
- `Docs/ref/publication-versions.md`, `site-adresses.md` : les sections du lot 4c et le relevé du lot 5g décrivent l'état d'avant ; elles sont annoncées comme périmées en tête du document (bandeaux 5g, 5h et 5f).

## Passages du seed à réécrire par le propriétaire

`Docs/seed.md` (version 0.24, du propriétaire) n'est pas modifié. Passages périmés après ce lot, par sujet :

- **Version publiée et adresses** : l. 3 (« Site : …/Z-Survival/ — version publiée : V0.6 … `dev` (`…/next/`) ») : la racine affiche « en construction » ; la version publiée est sous `…/Recette/` ; le build de `dev` est `…/dev/jeu.html` (`/next/` n'est qu'une redirection). L. 53 (« **V0.6 (racine)** ») : V0.6 est servie sous `/Recette/`, la racine n'est plus une version.
- **Accueil et journal** : l. 40 (E1 : « `index.html` : accueil de version … versions précédentes, journal ») : plus de journal ; l'accueil lit `site-info.json` (Recette, dernier build de développement, évolutions en cours, versions précédentes).
- **Publication par versions** : l. 121 (« `main` = version publiée (racine du site) ; `dev` … publiée sur `/next/` ; `/dev/` = journal par version (`data/changelog.json` → `versions`) ; `/lots/` renvoie à la racine ; … le propriétaire dit quand une version est ajoutée ») : `main` → `/Recette/`, `dev` → `/dev/`, `/lots/` → `/Recette/`, journal par version et liste `versions` supprimés ; chaque lot porte `version` et `date` dans `lots` ; redirection `/recette/` par `404.html`.
- **`/next/`** : l. 137 (« Panneau `?perf=1` : à retirer ou limiter à `/next/` au lot 13 ») : le build de développement est `/dev/`.
- **Ancien modèle et ancien pack** : l. 162 (plan en lots, 5e) est historique et juste ; aucune autre mention trouvée dans la version 0.24.
- **`?perso=actuel`, `?sons=ancien`, `?murs=bas`** : l. 128 et 160 les citent comme anciennes valeurs ou comme travail fait (juste) ; à retirer seulement si le propriétaire veut une liste sans historique.
- **Fichier des noms** : absent du seed : `noms-versions-et-lots.txt` (noms et descriptions affichés, priorité sur `versions.json` et le journal, lu dans `dev`, une faute bloque le déploiement de `dev`).
- **Plan en lots** : l. 151 à 170 : les lots 5g (nouvelles adresses, accueil refait) et 5h (fichier des noms, redirection `/recette/`) manquent ; la ligne 5f (« `dev` vers `main`, archivage de V0.5, journal, documentation ») parle encore du journal (il n'y a plus que l'entrée de `lots`).
- **Limite de `CLAUDE.md`** : l. 130 (« limite 8 400 caractères ») est juste ; le test ne vérifie que 12 000 (voir « Mesure »).
