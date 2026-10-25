# Conventions

Avant de modifier une page, relis ce fichier.

## Règles de base
- Mobile d'abord : vérifier à 375, 768 et 1440 px ; ruptures à 768 et 1200 px.
- Cibles tactiles d'au moins 44 px ; contraste d'au moins 4,5:1 ; `prefers-reduced-motion` respecté.
- `noindex` pendant le développement.
- HTML, CSS à variables, JavaScript en modules (`type="module"`), chemins relatifs, aucune ressource externe, aucune dépendance d'exécution (Phaser arrive au lot 2, dans `vendor/`).
- Aucune couleur en dur hors `css/tokens.css`.
- Textes dans `data/i18n/fr.json` et `data/i18n/en.json`, jamais en dur. Contenus provisoires marqués comme tels.
- Outils de développement seulement : ESLint (configuration plate), Vitest, Playwright, `@axe-core/playwright`, Lighthouse. Versions exactes, `package-lock.json` versionné.
- `Docs/seed.md` appartient au propriétaire : il reste vide, on ne le modifie jamais.

## Architecture
- **La logique du jeu vit dans `js/core/`, sans Phaser, DOM, réseau, stockage ni horloge.** Tout ce dont elle a besoin (temps, hasard, données) lui est passé en paramètre.
- `js/game/` : scènes Phaser. `js/save/` : `SaveRepository` et adaptateurs de stockage.
