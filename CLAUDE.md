# mobile-games

Jeu web de survie zombies en vue de dessus, hébergé sur GitHub Pages (dépôt Nowyyy/mobile-games).
Mobile d'abord, bilingue fr/en, sans dépendance d'exécution (Phaser viendra au lot 2).
Avant de modifier une page, lis `Docs/ref/conventions.md`.

## Arborescence
```
index.html (page d'attente) · dev/ (menu /dev : main, dernier lot, anciens lots) · css/ (tokens.css, base.css)
js/ (main.js, page.js, i18n.js, splat.js, lots.js)
js/core/ logique pure · js/game/ scènes Phaser · js/save/ sauvegarde
data/i18n/{fr,en}.json · fonts/ · vendor/ · scripts/ (build, assemble, serve, lighthouse)
tests/unit (Vitest) · tests/e2e (Playwright) · Docs/seed.md (propriétaire)
Docs/ref/ (environnement, conventions) · Docs/lots/ (bilans) · .github/workflows/ (lot 0-C)
```

## Commandes (vérifiées)
- `npm ci` : installe · `npm run lint` · `npm test` (Vitest) · `npm run test:e2e` (Playwright, serveur auto sur :4173)
- `npm run build` : copie index.html, dev, css, js, data, fonts, vendor dans `_site/`
- `npm run assemble` : site complet = build de main + `_site/lots/<lot>/` pour chaque branche `origin/lot-*` + `_site/lots.json` (exige tout l'historique git)
- `npm run lighthouse` : Lighthouse mobile (seuils : performance 90, accessibilité 95, bonnes pratiques 95, CLS ≤ 0,1 ; le script échoue sous les seuils)
- Playwright utilise le Chromium préinstallé : ne jamais lancer `playwright install` (voir `Docs/ref/environnement.md`).

## Publication
- URL du jeu : `https://nowyyy.github.io/<nom du dépôt>/` (cible : dépôt nommé `Z-Survival`). La racine = main. `/dev/` = menu (main, dernier lot, menu déroulant des anciens lots). `/lots/lot-N/` = aperçu de chaque branche de lot.
- `.github/workflows/pages.yml` : sur Pull Request et sur push de `main` ou `lot-*`, lint + Vitest + Playwright. Sur `main` (push ou `workflow_dispatch`), `npm run assemble` puis déploiement de `_site/` seulement. Un push sur `lot-*` relance le workflow sur `main` (job `refresh`, seul à avoir `actions: write`).
- Droits minimaux, actions épinglées par SHA complet, ni `pull_request_target` ni secrets. Source Pages : « GitHub Actions » (réglage du propriétaire).
- Tous les chemins sont relatifs : le site marche quel que soit le nom du dépôt et sous `/lots/…`.

## Git
- Une branche par lot : `lot-N`. Un commit par partie : « Lot N-X — titre ».
- Push de `lot-N` seulement, puis comparer `git rev-parse HEAD` et `git ls-remote origin lot-N`.
- Jamais de force-push, jamais de fusion dans `main`, pas de Pull Request sans demande. Tags facultatifs.
- Une branche de lot n'est jamais supprimée. Arbre propre avant de commencer.
- Une seule partie par session, puis arrêt.

## Règles durables
- Jetons : aucune couleur en dur hors `css/tokens.css`.
- Données : textes dans `data/i18n/*.json`, jamais en dur ; mêmes clés dans les deux langues.
- Accessibilité : cibles 44 px, contraste 4,5:1, focus visible, `prefers-reduced-motion`, axe sans violation.
- Exception texte : le message `<noscript>` de `index.html` est bilingue en dur (le i18n a besoin de JS).
- Style « sang noir » : noir, rouge sang, os, jaune pour l'argent. Le texte sur du rouge est posé sur une zone rouge pleine (`.zone`), jamais sur les taches ; les taches (canvas, `js/splat.js`) sont autour.
- Polices (OFL) dans `fonts/`, licence copiée à côté : Barlow, Rubik Wet Paint (titre), Rubik Dirt (libellés, majuscules seulement, chargée après l'affichage pour tenir le seuil Lighthouse).
- Honnêteté : tout contenu fictif ou provisoire est marqué comme tel.
- `Docs/seed.md` : appartient au propriétaire, jamais modifié par Claude (rempli depuis le lot 0-A).
- La logique du jeu vit dans `js/core/`, sans Phaser, DOM, réseau, stockage ni horloge.
- Le workflow `.github/workflows/pages.yml` n'est modifiable que si le prompt du lot l'autorise.
