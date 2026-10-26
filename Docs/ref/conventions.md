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
- `Docs/seed.md` appartient au propriétaire : on ne le modifie jamais.

## Architecture
- **La logique du jeu vit dans `js/core/`, sans Phaser, DOM, réseau, stockage ni horloge.** Tout ce dont elle a besoin (temps, hasard, données) lui est passé en paramètre.
- `js/game/` : scènes Phaser. `js/save/` : `SaveRepository` et adaptateurs de stockage.

## Style « sang noir »
- Rouge sang (`--color-action`) pour les zones, le cadre et les grands titres ; pour du petit texte rouge sur fond sombre, `--color-action-text`. Jaune (`--color-money`) réservé à l'argent.
- Un texte posé sur du rouge l'est sur une zone rouge pleine (`.zone`, texte `--color-on-action`) ; les taches de sang sont dessinées autour, jamais sous le texte.
- Tout état est aussi porté par une forme ou un texte, jamais par la couleur seule.
- Polices lourdes (Rubik Dirt) : chargées après le premier affichage, pour garder Lighthouse performance à 90 ou plus.
