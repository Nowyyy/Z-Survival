# Adresses du site (lot 5g)

> **Lot 5l (balise de canal)** : `jeu.html` porte `<meta name="zs-canal" content="source">` ; l'assembleur réécrit la valeur dans les copies publiées : `release` dans `Recette/jeu.html`, `dev` dans `dev/jeu.html`, `archive` dans `v0.N/jeu.html` (seulement si la balise existe : les versions déjà archivées restent identiques octet pour octet ; jamais d'échec). Un futur assembleur de production écrira `prod`. Le jeu lit la balise sans requête : menu de débogage et paramètres d'adresse réservés aux canaux `source`, `dev`, `release` (`Docs/ref/debug.md`). Le rapport de l'assembleur dit, par dossier, si la balise a été réécrite.

> **Lot 5i (accueil retouché, option B)** : sur `/Recette/`, le bandeau dit « Recette » seulement (avant : « Recette · Version V0.6 ») ; la version est dans le bouton « Jouer - V0.6 » ; la colonne de droite s'appelle « Toutes les versions » : carte « Version actuelle » (nom, description complète, sans lien), puis « Versions précédentes ». Les mentions « Recette · Version … » et « Versions précédentes » (titre de colonne) plus bas décrivent l'état d'avant. Détail en fin de document (« Accueil retouché (lot 5i) »).

> **Lot 5f (publication de V0.6)** : l'état transitoire du risque (b) ci-dessous (ancien accueil sous `/Recette/`, liens en 404) prend fin quand `dev` (avec `lot-5f`) est fusionné dans `main` ; `/Recette/` affiche alors « Recette · Version V0.6 » et les versions précédentes V0.5 à V0.1 ; `/v0.5/` s'ajoute aux archives (son `index.html`, ancien accueil du lot 4c, demande `versions.json` : 404 en console, attendu ; entrée `v0.5/jeu.html` propre). Vérifié en local seulement (« Contrôle local de la publication » en fin de document).

Plan écrit en partie A (base `origin/dev` `775f1d1`), avant tout changement du site. Les noms de branches, de fichiers et le contenu du journal sont des données.

## Ce que fait le site aujourd'hui (relevé)

1. `pages.yml` (job `deploy`, push de `main` ou `dev`) extrait `main` (dossier `main/`), et si elles existent `dev` (`dev/`) et `archive` (`archive/`) ; `npm ci && npm run build` dans `main/` et `dev/`.
2. Il appelle **l'assembleur de `main`** : `node main/scripts/assemble.mjs --main main/_site --versions main/versions.json --out _site [--dev dev/_site] [--archive archive]`.
3. Racine du site = build de `main` (accueil `index.html`, jeu `jeu.html`) + `build-info.json` (canal `release`) + `versions.json` + `icone.png`.
4. `next/` = build de `dev` + `build-info.json` (canal `dev`, hash court, date UTC) + copie de `versions.json` ; sans `dev` : page « Aucun build de développement pour l'instant ».
5. `lots/index.html` = page de renvoi vers `../` (« Les aperçus par lot ont été retirés. ») ; aucun `lots/lot-*`, aucun `lots.json`.
6. `v0.N/` = dossiers de la branche `archive`, copiés tels quels s'ils existent (sinon la version est publiée `indisponible`).
7. `dev/` = journal des versions (`dev/index.html`, `dev/dev.js`) copié par `scripts/build.mjs` ; il lit `../build-info.json`, `versions.json` et `data/changelog.json` (liste `versions` + `lots`).
8. L'accueil (`js/accueil/main.js` + `home.js`, pur) lit `build-info.json` et `versions.json` du dossier courant, puis `next/build-info.json` (racine publiée seulement).
9. Il affiche « Recette · Version V0.5 », « Jouer » (entrée de la version actuelle), « Développement » (dernier build → `next/`, « Journal des versions » → `dev/`), « Versions précédentes » (liens `v0.N/<entrée>`).
10. Dans `next/`, le même accueil montre un bandeau « Build de développement — hash — date » et masque « Développement ».
11. `tests.yml` ne nomme aucun chemin du site assemblé (il teste le site de test de `scripts/site/e2e-site.mjs`, port 4174).
12. `pages.yml` nomme des chemins du site assemblé dans **la ligne d'appel de l'assembleur** (`--out _site`, `main/_site`, `dev/_site`) et dans des commentaires ; `upload-pages-artifact` envoie `_site`.
13. Comme `main` et `dev` appellent tous deux `main/scripts/assemble.mjs`, **un déploiement depuis `dev` utiliserait l'ancien assembleur de `main`** : la nouvelle organisation n'apparaîtrait qu'après la publication (lot 5f).
14. Ce qui change : `/` devient une page « en construction », le build de `main` passe sous `/Recette/`, celui de `dev` sous `/dev/`, le journal disparaît, l'accueil lit un seul `site-info.json`.

## Adresses : avant → après

| Adresse | Avant | Après |
|---|---|---|
| `/` (`/index.html`) | accueil du build de `main` | page « Z-Survival est en construction. » (autonome, style en ligne, police du système, `noindex`, sans lien) |
| `/jeu.html` | jeu du build de `main` | 404 (plus rien à la racine que `index.html`) |
| `/Recette/` | — (404) | accueil du build de `main` + `site-info.json`, `versions.json`, `build-info.json` |
| `/Recette/jeu.html` | — | jeu du build de `main` (« Jouer ») |
| `/recette/` (minuscules) | — | 404 (GitHub Pages distingue la casse ; aucune redirection) — **lot 5h** : statut 404, puis redirection vers `/Recette/` par `404.html` (ci-dessous) |
| `/dev/` | journal des versions | build de `dev` ; son `index.html` est remplacé par une redirection vers `../Recette/` |
| `/dev/jeu.html` | — (404) | jeu du build de `dev` (« Dernier build de développement ») ; sans `dev` : absent, `dev/index.html` = « Aucun build de développement pour l'instant » |
| `/next/` | build de `dev` | redirection vers `../dev/jeu.html` |
| `/lots/` | page de renvoi vers `../` | redirection vers `../Recette/` ; aucun `lots/lot-*` |
| `/v0.N/` | archives (branche `archive`) | **inchangées** |
| `/sauvegarde.html` | page technique du build de `main` | `/Recette/sauvegarde.html` (et `/dev/sauvegarde.html`) ; `/sauvegarde.html` : 404 |
| pages techniques (`carte.html`, `visite.html`, `atelier-*.html`, `sons.html`, `ecarts.html`, `interface-retenue.html`) | à la racine | sous `/Recette/` et `/dev/` ; 404 à la racine |
| `/versions.json`, `/build-info.json`, `/icone.png` | à la racine | sous `/Recette/` (`versions.json`, `build-info.json`) ; plus d'`icone.png` (l'icône est en ligne dans les pages produites) |

Toutes les adresses internes restent **relatives** (le site est servi sous `/Z-Survival/`).

## `site-info.json` (écrit par l'assembleur dans `Recette/`)

```
{ schema: 1, genere: "<date UTC>",
  recette: { id, label, title, date, ref, entry: "jeu.html" },
  dev: { present, sha, date, entry: "../dev/jeu.html" },
  evolutions: [{ id, title, text, date, version }],
  precedentes: [{ id, label, title, note, entry: "../v0.N/<entrée>", status }] }
```
- `recette` : la version `latest` (statut `actuelle`) du `versions.json` de `main` ; `entry` = son entrée (`jeu.html`).
- `precedentes` : **toutes les autres versions** de ce fichier, la plus récente en haut ; `status` `archive` (lien `../v0.N/<entrée>`) ou `indisponible` (`entry: null`, raison dans `note`) ; une archive absente de la branche `archive` est `indisponible`.
- `evolutions` : les entrées de `lots` du `data/changelog.json` **du build de `dev`** dont `version` est une chaîne valide (`^v\d+\.\d+$`) **absente** des identifiants du `versions.json` de `main` ; la plus récente en haut (ordre inverse du fichier, qui est chronologique) ; 20 au plus ; `text` = premier point de l'entrée ; liste vide si `dev` est absent.
- `dev.sha` et `dev.date` : ceux du `build-info.json` écrit pour le build de `dev` ; `present: false`, `sha: ""`, `date: ""` sans build de `dev`.
- Entrées hostiles du journal (titre vide, champ manquant, `version` invalide, texte très long, HTML) : ignorées ou bornées (titre 120, texte 300 caractères, caractères de contrôle retirés) ; l'accueil les insère par `textContent`, jamais comme du HTML.
- `genere` : seule valeur non déterministe, injectable (`--genere`).
- Arbre source : `site-info.json` à la racine du dépôt (canal `source`, comme `build-info.json` depuis le lot 4c) évite une requête en échec quand le dépôt est servi en local (tests, Lighthouse) ; le build ne le copie pas, l'assembleur l'écrit dans `Recette/`.

## Règle du champ `version` (journal)
Chaque entrée de `lots` des lots 5a à 5g porte `version: "v0.6"` (version cible). Les entrées plus anciennes n'en ont pas et sont ignorées par `evolutions`. **Règle pour la suite** : chaque lot ajoute son entrée à `lots` avec `version: <version cible>` ; un test vérifie la forme (`^v\d+\.\d+$` quand présent). La liste `versions` de `data/changelog.json` est supprimée.

## Fichiers
- **Modifiés** : `scripts/assemble.mjs`, `scripts/site/e2e-site.mjs` (site de test : `dev`, évolutions, 12 versions), `scripts/site/local.mjs` (si besoin), `index.html`, `css/accueil.css`, `js/accueil/home.js`, `js/accueil/main.js`, `data/changelog.json` (liste `versions` retirée, `version` sur 5a à 5g, entrée `lot-5g`), `data/i18n/fr.json` (`home.*`, `site.*`), `data/i18n/en.json` (mêmes clés : `data-i18n` exige la parité, règle durable de `CLAUDE.md`), `scripts/build.mjs` (plus de `dev/`), `css/tokens.css` (bloc de l'accueil seulement, si besoin), `Docs/ref/publication-versions.md`, `Docs/ref/verification-versions.md` (faits périmés).
- **Ajoutés** : `scripts/site/site-info.mjs` (construction et validation de `site-info.json`, pur), `site-info.json` (arbre source), `Docs/ref/site-adresses.md`, `Docs/lots/lot-5g.md`.
- **Supprimés** : `dev/index.html`, `dev/dev.js`, `tests/e2e/dev.spec.js`.

## Tests à adapter
`tests/unit/publication.test.js` (assembleur, accueil, journal, workflow), `tests/unit/data-changelog.test.js`, `tests/unit/versions-schema.test.js` (cohérence avec `changelog.versions`, liste supprimée), `tests/unit/data-i18n.test.js`, `tests/unit/build.test.js`, `tests/unit/structure.test.js`, `tests/unit/icone.test.js` (pages `dev/`), `tests/e2e/publication.spec.js` (refait sur la nouvelle organisation), `tests/e2e/attente.spec.js` (accueil servi depuis le dépôt), `tests/e2e/fumee.spec.js` (`/dev/` retiré des pages publiées du serveur de développement), `tests/e2e/dev.spec.js` (supprimé, équivalents dans `publication.spec.js`), `tests/selection.json` et `scripts/tests/classement.json` (zone `accueil`, garde-fous), `playwright.config.js` (nom `dev` retiré des listes `ESSENTIAL` et `PAGES`). Chaque test retiré est listé « avant / après » avec ses assertions (`scripts/tests/compter.mjs`).

## Workflows : lignes qui nomment un chemin
- `tests.yml` : **aucune**.
- `pages.yml` : la ligne d'appel de l'assembleur (`node main/scripts/assemble.mjs --main main/_site --versions main/versions.json --out _site …`) et ses commentaires. **Nécessité** : sans changement, un déploiement depuis `dev` garde l'ancienne organisation (assembleur de `main`). Seule modification prévue : l'assembleur de la **branche qui déclenche** (`dev/scripts/assemble.mjs` pour un push de `dev`, `main/scripts/assemble.mjs` sinon), mêmes arguments ; commentaires mis à jour. Déclencheurs, permissions, concurrence, étapes de téléversement et de déploiement inchangés, aucune action nouvelle.
- Limite : si `npm run build` échoue dans `dev`, l'étape « Build de dev » échoue et le déploiement s'arrête (comportement actuel, non modifiable sans toucher d'autres lignes) ; l'assembleur, lui, traite un build de `dev` sans `jeu.html` comme absent.

## Risques
- (a) **Casse** : `/Recette/` avec un R majuscule ; `/recette/` donne 404 (aucune redirection possible sans fichier dédié, refusé par la décision).
- (b) **État transitoire** : tant que `main` n'a pas le nouvel accueil (avant le lot 5f), `/Recette/` affiche l'**ancien** accueil déplacé ; « Jouer » (`jeu.html` → `/Recette/jeu.html`) marche, mais ses liens relatifs `next/`, `dev/` (journal, retiré de `Recette/` par l'assembleur) et `v0.N/…` pointent vers `/Recette/next/`, `/Recette/dev/` et `/Recette/v0.N/`, qui n'existent pas (404), et il affiche « Aucun build de développement pour l'instant ».
- (c) **Stockage partagé** : `localStorage` appartient au domaine `nowyyy.github.io`, pas au chemin : `/Recette/`, `/dev/` et `/v0.N/` lisent et écrivent la **même** sauvegarde `zs.save.v1` (et `zs.device.v1`) ; une version de développement peut migrer une sauvegarde que la Recette lira ensuite.
- (d) **Raccourcis** : un raccourci d'écran d'accueil vers `…/Z-Survival/jeu.html` ou `…/Z-Survival/` ne mène plus au jeu ; à refaire sur `…/Recette/jeu.html`.
- (e) **Déclenchement manuel sur `main`** avant la publication : le workflow de `main` (ancien assembleur) redéploierait l'ancienne organisation, jusqu'au prochain push de `dev`.

## Retour arrière
Annuler la fusion de `lot-5g` dans `dev` (`git revert -m 1 <hash de la fusion>` dans une branche, fusionnée dans `dev`) : au déploiement suivant de `dev`, `pages.yml` reprend l'assembleur de `main` et le site revient à l'ancienne organisation (racine = `main`, `next/` = `dev`, journal `/dev/`).

## Lot 5h — relevé (partie A, base `origin/dev` `05b5c5a`)

1. `assembleSite` (`scripts/assemble.mjs`) appelle `buildSiteInfo` (`scripts/site/site-info.mjs`) après la copie des archives, puis `validateSiteInfo`, et écrit `Recette/site-info.json`.
2. `recette` : version `latest` du `versions.json` de `main` : `id`, `label` **recalculé** (`V<id>`), `title` (← `title`, borné à 120), `date`, `ref`, `entry`.
3. `precedentes` : les autres versions, la plus récente en haut : `id`, `label` **recalculé** (`V<id>`), `title`, `note`, `entry` (`../v0.N/<entrée>` ou `null`), `status`.
4. `evolutions` : lots du `data/changelog.json` **du build de `dev`** dont `version` n'est pas publiée : `id` ← `name`, `title` ← `titre`, `text` ← `points[0]` (bornés 120 / 300), `date`, `version`.
5. Le champ `label` de `versions.json` n'est lu nulle part : `validateSiteInfo` exige `label === "V<id>"`, et l'accueil (`js/accueil/home.js`) recalcule lui aussi `V<id>` pour « Recette · Version … » et pour chaque version précédente ; `recette.title` n'est pas affiché.
6. `npm run build` (`scripts/build.mjs`) copie dans `_site/` une liste fixe : les pages HTML nommées, `apercu.txt`, `css/`, `js/`, `data/` (en entier), `fonts/`, `vendor/` ; un autre fichier de la racine n'est pas copié.
7. `pages.yml` : `deploy` a `needs: quick` ; `quick` (`npm ci`, `npm run lint`, `npm test`) tourne sur le commit poussé (`main` ou `dev`) : **un test Vitest qui échoue sur `dev` bloque le déploiement** (rien n'est modifié).
8. `scripts/site/serve.mjs` : `resolveRequest` → `path.resolve`, puis `stat` / `readFile` : la casse est **celle du système de fichiers** (sensible sous Linux, insensible sous Windows et macOS par défaut).
9. Chemin inconnu (ou hors du préfixe `--base`) : réponse 404 `text/plain` « Not found » ; aucune page `404.html` servie.
10. Conséquence : appliquer les noms dans l'assembleur avant `buildSiteInfo` (sur des copies de `versions.json` et du journal) suffit pour les titres, les textes, `version` et `afficher` ; **l'étiquette (`nom` d'une version) n'apparaîtrait pas sans modifier `js/accueil/home.js`** : arrêt après la partie A ; le propriétaire a ensuite autorisé ce seul changement (étiquette lue dans `site-info.json` si valide, sinon `V<id>`) et celui de `validateSiteInfo`.

## Redirection `/recette/` → `/Recette/` (lot 5h)

- **Comment** : GitHub Pages distingue la casse et sert `404.html` de la racine du site publié (`/Z-Survival/404.html`) pour toute adresse inconnue, avec le statut 404. L'assembleur écrit cette page (autonome : style et script en ligne, icône `data:`, `noindex`, `lang="fr"`, aucun lien ni ressource). Son script applique `corrigerCasse` (`scripts/site/casse.mjs`, recopiée telle quelle par `toString`) à `location.pathname` : le **premier** segment qui vaut `recette` en minuscules sans être exactement `Recette` devient `Recette`, puis `location.replace(chemin + location.search + location.hash)` (requête et fragment gardés, aucune entrée d'historique). Sinon : aucune redirection, texte « Page introuvable. » et `<noscript>`.
- **Aucune boucle** : chaque correction retire un segment fautif ; sur `/Recette/…`, rien n'est corrigé (`/Recette/inconnu` reste une 404).
- **Pourquoi pas de dossier `recette/`** : sur Windows et macOS (systèmes de fichiers insensibles à la casse), `recette/` et `Recette/` seraient le même dossier (copie, extraction, `git checkout`). L'assembleur **échoue** si deux chemins du site ne diffèrent que par la casse (`cheminsEnCollision`).
- **Serveur local** (`scripts/site/serve.mjs`) : imite GitHub Pages — chaque segment est comparé au contenu réel de son dossier (sensible à la casse sur tout système) ; adresse inconnue : 404 avec `404.html` de la racine servie (sinon du dossier de premier niveau : sites de test `full/`, `bare/`, `many/`, `noms/`).
- **Limites** : la redirection exige JavaScript ; toute adresse inconnue reçoit la page 404 (statut 404) ; non vérifié sur le site publié.

## Fichier des noms `noms-versions-et-lots.txt` (lot 5h)

- **Où** : à la racine du dépôt ; `npm run build` le copie dans la sortie (publié sous `/Recette/` et `/dev/` : textes publics). Analyseur pur : `scripts/site/noms.mjs`.
- **Format** : commentaires `#`, lignes vides, un bloc par version (`[v0.6]`) ou par lot (`[lot-5a]`, minuscules) ; `clé: valeur` (premier deux-points) ; clés `nom` (60 au plus ; version : étiquette, lot : titre), `description` (une ligne, 200 au plus), et pour un lot seulement `version` (`^v\d+\.\d+$`, remplace celle du journal) et `afficher` (`oui` ou `non`). CRLF, BOM et espaces acceptés.
- **Priorité** : le fichier l'emporte dans `site-info.json` : version → `label` ← `nom`, `title` ← `description` ; lot → `title` ← `nom`, `text` ← `description`, `version` ← `version`, `afficher: non` → absent des évolutions. Absent du fichier = texte d'origine ; dates, `ref`, `status`, `entry` et ordre jamais changés ; `Recette/versions.json` reste celui de `main`.
- **Branche lue** : le fichier du **build de `dev`**, sinon de `main`, sinon aucun. Une modification sur `dev` apparaît sur `/Recette/` **après le déploiement de `dev`** (CI `quick` puis `deploy`, quelques minutes).
- **Erreurs** : l'assembleur n'échoue jamais à cause du fichier (ligne fautive ignorée, nombre d'erreurs et messages dans son journal, identifiant inconnu ignoré avec un avertissement). Mais `tests/unit/noms.test.js` analyse le fichier commité et **échoue à la moindre erreur** (numéro de ligne et message en français) ; comme `quick` précède `deploy` dans `pages.yml`, **une faute de frappe sur `dev` bloque le déploiement** jusqu'à sa correction (accepté par le propriétaire). Corriger : lire le message du test (onglet Actions, job `quick`, étape `npm test`), modifier la ligne indiquée, valider.
- **Contrôles du contenu initial** (textes de V0.1 à V0.5, un bloc par lot, `afficher: oui`) : seulement tant que le fichier est celui livré au lot 5h (empreinte SHA-256) ; ensuite, les textes du propriétaire ne sont jamais imposés par un test.

## Contrôle local de la publication (lot 5f)
Site assemblé par `node scripts/site/local.mjs --main HEAD --dev HEAD --archive origin/archive --assembleur dev` (branche `lot-5f`, commit 5f-B ; archive `92631da`) : 1 174 fichiers, 25,4 Mo ; `Recette/site-info.json` : 0 évolution, 5 versions précédentes ; servi par `scripts/site/serve.mjs` sous `/Z-Survival/`, Chromium 667×375 :
- `/` : « Z-Survival est en construction. », aucun lien ; `/Recette/` : « Recette · Version V0.6 », « Jouer » → `jeu.html`, « Aucune évolution depuis la version Recette. », versions précédentes V0.5 → V0.1 ; `/Recette/jeu.html` et `/dev/jeu.html` : jeu chargé (canvas), aucune erreur ;
- `/next/` → `/dev/jeu.html` ; `/lots/` et `/dev/` → `/Recette/` ; `/recette/` et `/RECETTE/jeu.html?x=1#b` → `/Recette/…` (après la 404 attendue de la page qui corrige la casse) ;
- `/v0.5/jeu.html` à `/v0.1/jeu.html` : chargés sans ressource manquante ni erreur ; `/v0.5/` : une 404 (`versions.json`), voir le bandeau ;
- **non vérifié** : le site publié, le déploiement réel, l'esthétique.

## Accueil retouché (lot 5i)

- **Adresses** : aucune ne change. `site-info.json` garde sa structure (`recette`, `precedentes`, `evolutions`, `dev`).
- **Données** : `recette.title` et `precedentes[].title` sont bornés à **200** caractères (`MAX_VERSION_TITLE`, `scripts/site/site-info.mjs` ; avant : 120, tronqués avec « … ») : la description du fichier des noms (200 au plus) passe en entier. `validateSiteInfo` suit la même borne. Les évolutions gardent 120 / 300.
- **Page** : bandeau `#version` = `home.badge` (« Recette », texte fixe) ; bouton `#play` = `home.playVersion` (« Jouer - {version} »), étiquette = `label` de la Recette s'il fait 20 caractères au plus, sinon `V<id>` (`playLabel`, `js/accueil/home.js`) ; sans `site-info.json` valide : « Jouer ». Région `#versions-region` (« Toutes les versions », focusable) : carte `#current-card` (« Version actuelle », nom, description ; masquée si vide), sous-titre « Versions précédentes », liste `#previous-list`.
- **Hauteur** : dès 640 × 520 px, la grille remplit `.screen` (min-height 100dvh, repli 100vh) ; les régions des évolutions et des versions s'étirent jusqu'au pied (base 0, au moins 6rem) ; si le contenu dépasse, la page s'allonge (rien n'est coupé). Sous 520 px de haut et sous 640 px de large : comportement d'avant (hauteurs bornées).
- **Publication suivante** : la carte lit `recette`, la liste lit `precedentes` : quand `latest` change, l'ancienne Recette rejoint la liste en tête, sans modification de code.
- **Contrôle local** (`local.mjs --main HEAD --dev HEAD --archive origin/archive --assembleur dev`, 1 174 fichiers, 25,4 Mo) : `recette.title` de V0.6 = 142 caractères (description complète) ; `/Recette/` à 667×375, 1440×900, 375×812, 1200×1300 sans erreur ni requête externe ; « Jouer - V0.6 » → `Recette/jeu.html` chargé ; `/v0.5/` à `/v0.1/jeu.html` : 200 ; listes de fichiers des archives identiques à `origin/archive` (54, 93, 108, 142, 253).
