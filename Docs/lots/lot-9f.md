# Lot 9f — Cache des navigateurs : toujours la dernière version déployée (V0.9)
## Base
- `origin/dev` `622df2c` (bilan 9e, seed 0.38, `main` ancêtre de `dev`, CI verte) ; branche `lot-9f` (A `c849ceb`, B `7d91b75`, C `440aefb`, D) ; `origin/dev` (lot 9g, `24c15ee`) fusionné avant la Pull Request.
## Cause
- Pages (`curl -I`, `/dev/` et `/Recette/`) : `cache-control: max-age=600`, `etag`/`last-modified` du déploiement ; le CDN ignore la requête et il est purgé au déploiement : c'est le **navigateur** qui garde 10 min la page et ses modules (page ancienne, ou neuve avec des modules anciens).
## Méthode (`Docs/ref/cache.md`)
- `npm run build` met dans `_site/` chaque adresse relative vers un fichier du site à `?v=<hash court du commit>` (= `sha` de `build-info.json`) : imports statiques et dynamiques, carte d'imports, `fetch`, préchargements, `new URL(…, import.meta.url)`, `url()`, `src`/`href`, Three.js compris (copie construite) : 985 adresses. Sources et serveur des tests intacts. Version : `ZS_BUILD_SHA`, sinon `git rev-parse HEAD`.
- Contrôle bloquant (`scripts/site/empreinte.mjs`) : chaîne d'adresse sans `v=` (fichier connu ou absent, suffixe `'.json'`, préfixe `'data/…'`, `url()`) ou déclaration inutile → build refusé ; 5 déclarations motivées. L'archiveur passe `ZS_BUILD_SHA=<ref>` : les prochaines archives auront l'empreinte de leur commit (testé) ; branche `archive` et `pages.yml` intacts.
## Liens et vérification
- Accueil : « Jouer » et « Dernier build de développement » reçoivent `r=<horodatage>` au clic. `jeu.html` : script en ligne avant tout module : retire `v`, `r`, `rv` (autres paramètres octet pour octet), note `rv`. `demarrage.js` (dev, release ; `<meta name="zs-version">`) : `build-info.json?r=…` en `no-store`, partagé avec l'écran de chargement ; différent → un seul rechargement (`rv=1`), jamais après « JOUER » (partie directe : vérifiée avant). Retour au menu : bandeau « Nouvelle version disponible » + « Recharger » (`#retour`/`#plein-ecran`). Aucun stockage, service worker ni dépendance.
## Preuves
- **G1** `trace-logique` 6 × 600 identique à chaque pas (B et C, source et site construit) ; `mesurer.mjs --ref --ref-memes-reglages` (site construit) : appels, triangles, pixels à 100 % (12 cas) ; captures menu et partie 932 × 430 et 1920 × 1080 du site construit identiques au pixel. **G2** contrôle au build ; `cache.spec.js` : chaque requête (accueil, menu, onglets, « JOUER », partie ; Recette et dev) porte la version, aucun fichier sous deux adresses.
- **G3** mandataire `max-age=600`, déploiements N puis N+1 : accueil N servi du cache, lien → N+1 en entier sans rechargement ; ancienne `jeu.html` en cache → un seul rechargement puis N+1 ; `build-info.json` toujours différent → un seul rechargement ; retour au menu → bandeau (axe, 44 px), rien d'imposé, « Recharger » → N+1 ; aucune écriture, aucune requête externe.
- **G4** partie directe et `?test=1…` avec `v`, `r`, `rv` : inchangées, paramètres retirés. **G5** `publication:controle -- --avant` : 3 KO antérieurs (version non préparée, évolutions v0.9, palier complet), aucun dû au lot. **G6** Lighthouse mobile, 5 passes : `index.html` 90 (réf. 90), `jeu.html` 80 (réf. 80) ; menu du site construit : 50 fichiers (réf. 50) ; partie directe : +1 (la vérification).
## Tests adaptés
- Nouveaux : `empreinte.test.js`, `cache-adresses.test.js`, `cache.spec.js`, test de l'archiveur. Adaptés sans perte d'assertion : `publication.spec.js` (`site-info.json` avec ou sans `?v=` ; lot-9f dans les évolutions), `debug-menu.spec.js` et `canal.spec.js` (paramètre inconnu `x=` au lieu de `v=`, réservé), `liberation.test.js` (`info`), `data-changelog.test.js` (lot-9f).
## CI
- `lot-9f` : Tests verts sur B (`44627666121`), C (`44634680814`, ≈ 7 min) et D (`44638724405`) ; après la fusion de `origin/dev`, `44637141556` en échec (liste des évolutions du site de test, corrigée en D). Fusion par [Nowyyy/Z-Survival#172](https://github.com/Nowyyy/Z-Survival/pull/172) (`f00f71d`) : Tests et Pages de `dev` verts ; `/dev/jeu.html` porte `f00f71d`, comme `dev/build-info.json`.
## Points ouverts
- `site-info.json` garde le cache normal (accueil jusqu'à 10 min en retard) ; les liens vers le jeu sont toujours neufs.
## Idées
- Lire `site-info.json` sans cache (retirer son préchargement) ; bandeau sur l'accueil quand le dev a changé.
## Entrée du journal
- `lot-9f` (v0.9, 2026-11-19) « Toujours la dernière version déployée », masquée (`afficher: non`).
## Lignes à ajouter à `CLAUDE.md` et `conventions.md`
- `CLAUDE.md` (Publication) : « Cache : site construit à l'empreinte `?v=<commit>` (contrôle bloquant de build.mjs) ; `v`, `r`, `rv` réservés, retirés par jeu.html ; Docs/ref/cache.md. » — `conventions.md` : « Adresse de fichier : chaîne littérale ou gabarit finissant par l'extension, sinon déclarée dans scripts/site/empreinte.mjs. »
## Passages du seed à réécrire par le propriétaire
- « Publication par versions » et l'état de la V0.9 : cache des navigateurs fait (empreinte, vérification au démarrage, bandeau au retour au menu).
## À faire par moi
1. Après le déploiement, ouvrir `…/Recette/` puis « Dernier build de développement » sur PC et téléphone : la version affichée (« V0.9 · dev ») doit être la dernière, sans Ctrl+Maj+R (une dernière fois peut-être, si le navigateur garde une page `/dev/` d'avant le lot) ; la Recette en profitera à la publication de `main`. 2. Rapporter les retours.
