# Cache des navigateurs (lot 9f)

Relevé et plan écrits en partie A (base `origin/dev` `622df2c`), avant tout changement du site.
**État (fin du lot)** : plan réalisé tel quel en parties B et C (bilan : `Docs/lots/lot-9f.md`) ; en ligne sur `/dev/` depuis `f00f71d` ; `/Recette/` à la publication de `main`. Déclarations du contrôle : `DECLARATIONS` de `scripts/site/empreinte.mjs`.

## En-têtes servis par Pages (`curl -I`, 19/11/2026)
- `/dev/jeu.html`, `/Recette/`, `/dev/js/menu/demarrage.js`, `/dev/build-info.json` : `cache-control: max-age=600`, `expires` (+10 min), `etag` et `last-modified` identiques pour tout le déploiement (heure du déploiement), `vary: Accept-Encoding`, `access-control-allow-origin: *`.
- Le CDN (Fastly) **ignore la chaîne de requête** (un `?v=` jamais vu revient `x-cache: HIT`) et il est purgé à chaque déploiement : seul le **cache du navigateur** garde l'ancienne version 10 minutes. Le paramètre ajouté ne sert donc qu'à ce cache (clé = adresse complète).
- Effet : page ancienne servie du cache, ou page neuve qui importe des modules anciens encore en cache (mélange de deux versions).

## Chaîne de construction
- `pages.yml` : `npm ci && npm run build` dans `main/` et `dev/` (extractions git), puis `assemble.mjs` (écrit `build-info.json` : `sha` = 7 premiers caractères du commit de chaque extraction, `site-info.json`, `versions.json`). Archives : `archiver.mjs` extrait le commit par `git archive` (sans `.git`), lance son `npm run build`, écrit `build-info.json` (`sha` = `ref` sur 7 caractères).
- Les sources et le serveur local des tests (`scripts/serve.mjs`) restent sans empreinte : la réécriture vit dans `scripts/build.mjs`, sur `_site/` seulement.

## Inventaire des formes d'adresses (code de `origin/dev`)
- **Imports statiques** `import … from './x.js'` (237 modules, dont `vendor/three/three.module.js` → `./three.core.js`) et **dynamiques** `import('./x.js')` (≈ 50, toujours des chaînes littérales).
- **Carte d'imports** : `{"three":"./vendor/three/three.module.js"}` dans `jeu.html`, `atelier-armes.html`, `atelier-personnages.html`.
- **fetch** : chaînes littérales (`'data/game/x.json'`, `'css/armes.css'`, `.txt`, `.svg`), passées par variable (`fetch(path)`), et gabarits (`` `${mapDir}/world.json` ``, `` `data/menu/${n}.json` ``, `` `${base}data/i18n/accueil.${lang}.json` ``) ; aucune concaténation `+ '.json'`.
- **Préchargements** créés en code (`modulepreload` de `js/menu/menu.js` et `demarrage.js`, police, `css/menu.css`) et sélecteurs qui les retrouvent (`link[href="css/menu.css"]`).
- **Calculateurs** : `new Worker(new URL('./x.js', import.meta.url), { type: 'module' })` (3).
- **Styles** : `url("../fonts/x.woff2")` (4 polices de `css/base.css`) ; les autres `url(#…)` sont des références SVG internes.
- **Pages** : `src` et `href` (styles, scripts, préchargements de polices, de données et de modules, `site-info.json`), liens vers d'autres pages `.html`.
- **Données JSON** : aucune adresse chargée (champs `source` = métadonnées) : non réécrites.
- Fichiers écrits après la construction : `build-info.json`, `site-info.json`, `versions.json`.

## Méthode retenue : paramètre de version `?v=<hash court du commit>`
- Pourquoi : un seul geste à la construction (réécriture textuelle des chaînes et des `url()`), chemins inchangés (tests, archives, assembleur, liens) ; les noms à empreinte demanderaient de renommer 1 000 fichiers et de réécrire chaque chemin construit à l'exécution (gabarits). La version est celle que `build-info.json` publie (même commit) : `ZS_BUILD_SHA` (archiveur, sites de test), sinon `git rev-parse HEAD` de l'arbre construit.
- Toute chaîne qui est une adresse relative vers un fichier du site (vérifié sur le disque ; gabarit : par sa forme) reçoit `?v=` (ou `&v=`), dans `.html`, `.js`, `.css`, Three.js compris (copie construite seulement). Pages `.html` : non réécrites (entrées de navigation).
- **Contrôle bloquant** : après réécriture, toute chaîne d'adresse sans `v=` (fichier connu, absent, suffixe `'.json'`, préfixe `'data/…'` sans extension, `url()`) fait échouer `npm run build`, sauf déclaration (fichier, texte, raison) ; une déclaration inutile aussi.

## Plan des points 2 à 5
- **2** : `js/accueil/main.js` : au clic (et clic du milieu) sur « Jouer » et « Dernier build de développement », `href` reçoit `r=<horodatage>`.
- **3** : `jeu.html` porte `<meta name="zs-version">` (vide en source, rempli au build) ; `demarrage.js` (canaux `dev` et `release`) lit `build-info.json?r=…` avec `cache: 'no-store'`, partagé avec l'écran de chargement (même nombre de fichiers) ; version différente : un seul `location.replace` avec `rv=1&r=…` (jamais si une partie est demandée ; partie directe : vérification avant le lancement). Retour au menu (lot 9d) : nouvelle lecture ; plus récente : bandeau « Nouvelle version disponible » + « Recharger » (`#retour` ou `#plein-ecran`).
- **4** : un script en ligne de `jeu.html`, avant tout module, retire `v`, `r`, `rv` de l'adresse (`history.replaceState`, les autres paramètres gardés octet pour octet) et note `rv` sur `<html>` : aucun module ne les voit.
- **5** : la réécriture vit dans `build.mjs` : l'archiveur la reçoit avec le build de la version archivée ; il lui passe `ZS_BUILD_SHA` (pas de `.git` dans `git archive`). Branche `archive` intacte.
- **Tests** : unitaires (réécriture, contrôle, déclarations, version, adresses `v`/`r`/`rv`, liens uniques) ; e2e sur le site de test (chaque requête porte `v=`, aucun module deux fois ; scénario de cache N → N+1 avec un serveur `max-age=600`) ; trace logique, mesures, captures et Lighthouse comparés à `origin/dev`.
