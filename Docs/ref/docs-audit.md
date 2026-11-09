# Audit de la documentation (lot 5m-A)

> Lecture seule, base `origin/dev` `2941829`. Outil : `node scripts/docs/auditer.mjs --json <fichier hors dépôt>` (Node natif, n'écrit rien dans le dépôt) ; sortie complète : `Docs/ref/docs-audit-annexe.md` (inventaire, références `fichier:ligne`, motifs, rattachement, liens). Branches : `Docs/ref/branches-audit.md`. Rien n'est déplacé ni supprimé en A.

**Règles de preuve** (lot 5c) : références entrantes par chemin (`Docs/ref/x.md`, `../ref/x.md`, chemin partiel) ou par nom de fichier (`x.md`) dans tous les fichiers suivis, plus les chaînes « Docs… » du code, des tests, des scripts, des pages, des workflows et de la configuration converties en motifs (gabarit, glob, dossier, concaténation). Un motif qui couvre un dossier entier (`readdirSync('Docs/lots')`, `walk('Docs/ref')`, `paths-ignore: Docs/**`) est listé à part : test à adapter, pas preuve d'usage d'un document précis. Chaînes passées à une fonction pure et titres de test : « donnée », sans lecture. **R1 à R5** : point fixe (un document cité par un document qui reste n'est pas candidat). **L1** (regroupement, pas retrait) : seuls un test, un script, le seed ou un fichier hors `Docs/` qui le lit nommément le rendent douteux ; les citations de `conventions.md` et des documents qui restent se corrigent en B.

## Chiffres (`Docs/lots/` et `Docs/ref/`, 91 fichiers dont `.gitkeep`, 6 306 lignes, 1 151 088 o)

| Cat. | Documents | Lignes | Octets | Candidats | Douteux | Historique seul. | Réf. entrantes | Gain si approuvé (candidats seuls) |
|---|---|---|---|---|---|---|---|---|
| L1 bilans V0.1–V0.6 | 39 | 1 453 | 334 288 | 27 | 12 | — | 52 | −22 documents (27 → 5 fichiers) ; lignes et octets ≈ +2 % (sommaires) |
| R1 manifestes de fusion | 2 | 61 | 12 993 | 0 | 2 | 0 | 22 | aucun |
| R2 audits, plans, décisions | 15 | 1 475 | 189 889 | 3 | 10 | 2 | 37 | −3 documents, −249 lignes, −30 181 o |
| R3 états des lieux d'avant | 3 | 125 | 17 040 | 0 | 3 | 0 | 33 | aucun |
| R4 passations, choix d'atelier | 7 | 500 | 76 439 | 0 | 7 | 0 | 110 | aucun |
| R5 pages techniques (lot 13) | 5 | 804 | 120 412 | 0 | 5 | 0 | 41 | garder (recommandé) |
| R6 périmés, doublons | 0 | — | — | 0 | — | — | — | aucun trouvé |
| Bilans V0.7 (5j, 5k, 5l) | 3 | 97 | 33 245 | — | — | — | 3 | restent séparés |
| Autres références actives | 17 | 1 791 | 366 782 | — | — | — | 327 | gardés |

**Après, candidats seuls (L1 et R2)** : 66 fichiers (−25), ≈ 6 180 lignes, ≈ 1 128 000 o (estimation : sommaires et marqueurs ≈ +120 lignes, +7 Ko). **Recommandation suivie** (11 douteux adaptables en exception, `lot-5a` séparé, R2) : 56 fichiers (−35), mêmes lignes et octets à ±1 %. Le regroupement réduit le **nombre** de fichiers, pas le texte (aucun bilan n'est raccourci).

## L1 — rattachement des bilans (journal, bornes, preuve git)
- Règle : champ `version` (5a à 5i : `v0.6`) ; sinon ordre du journal et bornes `lot-1`, `lot-1d`, `lot-2c`, `lot-3e`, `lot-4b`. Contrôle : première version de `versions.json` dont le commit gelé contient le bilan. **Accord pour 35 bilans sur 39** (2 désaccords, 2 absents du commit gelé).
- **Doutes** : `lot-3h` (journal : V0.4 ; présent seulement à partir du commit gelé de **V0.5**) ; `lot-4c` (après la borne de V0.5 : V0.6 par déduction ; présent dans le commit gelé de **V0.5**) ; `lot-4e`, `lot-4f`, `lot-4g` (sans `version`, V0.6 par déduction ; git : V0.6, d'accord) ; `lot-5f`, `lot-5i` (`version: "v0.6"` mais absents du commit gelé `cef11b3` : arrivés dans `main` après, par la fusion #46). **Recommandation** : V0.5 pour `lot-3h` et `lot-4c` (preuve git), à écrire en exception ; sinon la règle du journal s'applique.
- Proposé : `Docs/lots/versions/v0.1.md` … `v0.6.md` (sommaire, puis chaque bilan intégral, sans modification, dans l'ordre du journal ; ancien nom en tête). Par version : V0.1 5 (lot-0, 0b, 0c, 0d, 1), V0.2 4, V0.3 3, V0.4 6 (avec 3h), V0.5 8, V0.6 13 (avec 4c).
- **Douteux (12)** : `lot-1`, `lot-2`, `lot-2b`, `lot-2c`, `lot-3`, `lot-3a`, `lot-3b` (`zones-hygiene.test.js:63` : `git diff main --` sur ces 7 chemins) ; `lot-3j` (`interface-integree-retours.test.js:122`, `existsSync`) ; `lot-3m` (`persos-integres-finitions.test.js:143`, lit le texte) ; `lot-4c`, `lot-5g` (`publication.test.js:672, 703` : nom exclu d'une liste, garde-fous **inactifs**, `skipIf`) ; `lot-5a` (`data/game/sounds-choix.json:727`, champ `source` : **`data/game` interdit**, le chemin y resterait périmé).
- **Lectures du dossier entier** (à adapter si L1 est appliqué) : `data-changelog.test.js:34` (chaque bilan de `Docs/lots/*.md` a son entrée : ne verrait plus les bilans regroupés) ; `persos-donnees.test.js:96` (`git diff --diff-filter=MD main -- Docs/lots` : échoue dès qu'un bilan est retiré) ; `publication.test.js:672, 703` (inactifs, sans effet) ; `structure.test.js:7, 21` (le dossier reste : sans effet).
- **Ce que `data-changelog` exige** : une entrée par bilan (sens bilan → journal ; `lot-0t` a une entrée sans bilan, donc « chaque lot du journal a un bilan » serait faux). Adaptation proposée : chercher les bilans séparés **et** les bilans des fichiers groupés (marqueurs du sommaire), même assertion par bilan, plus une assertion « 39 + bilans séparés retrouvés » ; aucune retirée.
- **Chemins à corriger en B** (aucun dans `CLAUDE.md`) : `conventions.md:66, 79, 92, 101, 306` ; `etage.md:57`, `fusion-3j.md:23, 27`, `passation-personnages-4b.md:5, 53, 107`, `fusion-3k.md:17`, `integration-interface.md:3`, `passation-interface-4b.md:8`, `interface-a-integrer.md:20`, `personnages-integres.md:37, 41`, `tests-paliers.md:107`, `nettoyage-plan-ancien-decisions.md:29`, `site-adresses.md:70`. Les bilans eux-mêmes ne sont jamais modifiés (leurs citations d'autres bilans restent historiques).

## R1 à R6
- **R1** `fusion-3j.md` (lu par `persos-jeu.test.js:218`, `readFileSync`), `fusion-3k.md` (`scripts/build.mjs:11`, `interface-atelier-hygiene.test.js:39`) : douteux, rien à appliquer.
- **R2** : **candidats** `nettoyage-plan-ancien-annexe.md` (233 lignes, 29 435 o, annexe d'inventaire), `nettoyage-decisions.modele.md`, `nettoyage-plan-ancien-decisions.modele.md` (modèles vides). **Historique seulement** (cités par le bilan `lot-5e`, regroupables sans perte en exception) : `nettoyage-plan-ancien.md`, `nettoyage-plan-ancien-decisions.md`. **Douteux** : `claude-md-consolidation.md`, `claude-md-v06.md` (`conventions.md:341, 394`), `nettoyage-audit.md` (`scripts/nettoyage/auditer.mjs:565`), `tests-audit-annexe.md` (écrite par `scripts/tests/resumer.mjs:18`), `tests-decisions.md` (`scripts/tests/classement.json:3`) ; et, cités par ces documents qui restent : `nettoyage-audit-annexe.md`, `nettoyage-decisions.md`, `tests-audit.md`, `tests-chargement.md`, `tests-decisions.modele.md`.
- **R3** : `sons-actuels.md` (`scripts/sons/lister-integres.mjs:40`) ; `interface-actuelle.md`, `personnages-actuels.md` (cités par `fusion-3k.md`, `fusion-3j.md`, `passation-*`, `nettoyage-audit*`, qui restent). Code décrit retiré (`pose.js`, `character.js`, `sounds-legacy.json`) : déjà annotés au lot 5e.
- **R4** : `integration-personnages.md` (`persos-jeu.test.js:217`, `readFileSync`), `interface-a-integrer.md` (`interface-integree-retours.test.js:15`, `readFileSync` ; `css/game-ui.css:2`), `passation-personnages-4b.md` (`data/game/persos-choix.json`, 6 tests en commentaire), `passation-interface-4b.md` (`css/proto-b.css:5`, un test), `sons-a-integrer.md` (`data/game/sounds-choix.json`, 2 scripts), `integration-interface.md` (`scripts/interface/projection.mjs:16`), `integration-sons.md` (cité par `atelier-sons.md` et `sons-a-integrer.md`). Tous douteux.
- **R5** : `atelier-interface.md`, `atelier-personnages.md`, `atelier-sons.md`, `ecarts-modele.md` (écrit par `scripts/modele/rapport.mjs`, `ecarts.html`), `affinage.md` (**cité par le seed** `Docs/seed.md:49`) : 5 documents, 804 lignes, 120 412 o ; **garder jusqu'au lot 13**.
- **R6** : aucun document périmé prouvé : ceux qui citent du code retiré (`publication-versions.md`, `site-adresses.md`, `personnages-integres.md`, `tests-paliers.md`) sont des références actives, déjà annotées ; aucune ligne de 60 caractères ou plus reprise mot pour mot de `conventions.md` hors de lui-même (0 %).

## Liens et chemins cassés (avant tout changement)
- Liens Markdown relatifs dans `Docs/`, `CLAUDE.md`, `conventions.md` : **aucun** (0 lien : tout est cité en `chemin`). Chemins `Docs/…` introuvables : 5, tous `Docs/ref/fusion-3g.md` (retiré au lot 5c) dans `lot-4b.md:10`, `lot-5c.md:7` (bilans, intouchables), `nettoyage-audit.md:64`, `nettoyage-audit-annexe.md:85`, `nettoyage-decisions.md:7`.

## Effets annexes
- **Seed** : cite `affinage.md`, `etage.md`, `conventions.md`, `publication-versions.md`, `site-adresses.md` (aucun proposé au déplacement) : rien à réécrire si L1 et R2 seuls sont appliqués.
- **`CLAUDE.md`** : ne cite aucun document candidat (aucune correction) ; **8 326 caractères** (`wc -m`), et non 8 140 comme annoncé par le prompt : écart à confirmer par le propriétaire.
- **Garde-fou à respecter** : `lot1-regles.test.js:83` lit tout `Docs/ref/` (et `scripts/`) et refuse le nom de l'ancien moteur de rendu ; les nouveaux documents l'évitent.
- **Tests à adapter si L1 est appliqué** : `data-changelog.test.js:34`, `persos-donnees.test.js:96`, `zones-hygiene.test.js:63`, `interface-integree-retours.test.js:122`, `persos-integres-finitions.test.js:143` (même nombre d'assertions, lecture par une aide commune qui trouve un bilan séparé ou groupé, texte comparé à celui de `main`).

## Recommandation
- **L1 : APPROUVE**, avec en exception les 11 douteux adaptables (`lot-1`, `2`, `2b`, `2c`, `3`, `3a`, `3b`, `3j`, `3m`, `4c`, `5g` : tests adaptés, sans perte) et **`lot-5a` gardé séparé** (citation dans `data/game`) ; `lot-3h` et `lot-4c` en V0.5.
- **R2 : APPROUVE** (3 retraits sans référence) ; regroupement de `nettoyage-plan-ancien.md` et `nettoyage-plan-ancien-decisions.md` seulement par exception.
- **R1, R3, R4, R6 : REFUSE** (rien de prouvé) ; **R5 : REFUSE** (garder jusqu'au lot 13).
