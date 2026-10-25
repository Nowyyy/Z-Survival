# Bilan du lot 0 — Socle, jetons et publication

Branche `lot-0` · comparaison : https://github.com/Nowyyy/mobile-games/compare/main...lot-0

## Ce qui est fait
- **0-A Socle et outillage** : arborescence, `package.json` (devDependencies exactes, aucune dépendance d'exécution), ESLint plat, Vitest, Playwright (mobile 375 px, bureau 1440 px), scripts `build`, `serve`, `lighthouse`, `CLAUDE.md`, `Docs/ref/conventions.md`, `Docs/ref/environnement.md`.
- **0-B Jetons et page d'attente** : `css/tokens.css`, `css/base.css`, police Barlow (OFL) hébergée, `index.html` bilingue fr/en (bascule, `lang` mis à jour, choix mémorisé, `noscript`, `noindex`), `js/i18n.js` pur.
- **0-C Publication et bilan** : `.github/workflows/pages.yml`, tests du workflow et du build, ce bilan.

## Palette proposée (à valider par le propriétaire)
Thème sombre vert-noir « survie », ambre comme couleur d'action.
| Rôle | Valeur |
|---|---|
| Fond / surface / surélevé | `#0e110f` / `#181d19` / `#222924` |
| Texte / texte secondaire | `#e9eee7` / `#a7b2a5` |
| Action (texte dessus) | `#e0892f` (`#140d05`) |
| Danger / succès / avertissement | `#ff7a6b` / `#7ed48b` / `#f2c94c` |
| Focus | `#9fd3ff` |
Chaque paire texte/fond est testée à 4,5:1 minimum (`tests/unit/tokens.test.js`).

## Preuves
- `npm run lint` : sans avertissement. `npm test` : 8 fichiers, 99 tests verts.
- `npm run test:e2e` : 26 tests verts (13 par projet : jetons, aucune couleur en dur, bascule de langue au clic, mémorisation, cible 44 px, aucune requête externe et console propre, pas de débordement à 375/768/1440 px, axe fr et en, sans JavaScript, réduction de mouvement).
- Lighthouse mobile (page locale) : performance 100, accessibilité 100, bonnes pratiques 100, CLS 0. Seuils : 90 / 95 / 95, CLS ≤ 0,1.
- Captures à 375, 768 et 1440 px regardées : contenu aligné à gauche dans une colonne centrée, badge ambre, titre, message, barre animée, mention de titre provisoire, bouton « English » de 44 px de haut ; rien ne déborde.
- `npm run build` : `_site/` contient `index.html`, `css`, `js`, `data`, `fonts`, `vendor` ; ni `Docs/`, ni `tests/`, ni `node_modules`.

## Points à savoir
- Le propriétaire a rempli `Docs/seed.md` après la partie A ; le test « seed vide » est devenu « seed existe ». Je n'ai jamais écrit dans ce fichier.
- Le prompt annonçait un « modèle de bilan » absent du texte reçu ; la structure ci-dessus est la mienne.
- Le `<noscript>` est bilingue en dur (l'i18n a besoin de JavaScript) : seule exception à « pas de texte en dur ».
- Le test « sans JavaScript » lance Chromium avec `--blink-settings=scriptEnabled=false` : l'option Playwright `javaScriptEnabled: false` laisse `<noscript>` masqué.
- Actions du workflow épinglées par SHA complet, lus sur les dépôts officiels `actions/*` (tags v4.2.2, v4.4.0, v5.0.0, v3.0.1, v4.0.5). Le workflow n'a pas pu être exécuté ici : sa première exécution aura lieu sur GitHub.
- La source de GitHub Pages doit être réglée sur « GitHub Actions » par le propriétaire (je ne touche à aucun réglage).
- Branche de session `claude/nifty-faraday-x2nlvz` : non utilisée, comme demandé par le prompt (`lot-0`).

## Reste à faire
Rien dans le périmètre du lot 0. Prochain : lot 0b (aperçus par branche).
