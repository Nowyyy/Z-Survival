# mobile-games

Jeu web de survie zombies en vue de dessus, hébergé sur GitHub Pages (dépôt Nowyyy/mobile-games).
Mobile d'abord, bilingue fr/en, sans dépendance d'exécution (Phaser viendra au lot 2).
Avant de modifier une page, lis `Docs/ref/conventions.md`.

## Arborescence
```
index.html, css/ (tokens.css, base.css : lot 0-B), js/ (main.js, i18n.js : lot 0-B)
js/core/ logique pure · js/game/ scènes Phaser · js/save/ sauvegarde
data/i18n/{fr,en}.json · fonts/ · vendor/ · scripts/ (build, serve, lighthouse)
tests/unit (Vitest) · tests/e2e (Playwright) · Docs/seed.md (VIDE, propriétaire)
Docs/ref/ (environnement, conventions) · Docs/lots/ (bilans) · .github/workflows/ (lot 0-C)
```

## Commandes (vérifiées)
- `npm ci` : installe · `npm run lint` · `npm test` (Vitest) · `npm run test:e2e` (Playwright, serveur auto sur :4173)
- `npm run build` : copie index.html, css, js, data, fonts, vendor dans `_site/`
- `npm run lighthouse` : Lighthouse mobile (seuils fixés en partie B : perf 90, accessibilité 95, bonnes pratiques 95)
- Playwright utilise le Chromium préinstallé : ne jamais lancer `playwright install` (voir `Docs/ref/environnement.md`).

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
- Honnêteté : tout contenu fictif ou provisoire est marqué comme tel.
- `Docs/seed.md` : vide, jamais modifié par Claude.
- La logique du jeu vit dans `js/core/`, sans Phaser, DOM, réseau, stockage ni horloge.
- Le workflow `.github/workflows/pages.yml` n'est modifiable que si le prompt du lot l'autorise.
