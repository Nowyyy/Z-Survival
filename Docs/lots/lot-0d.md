# Bilan du lot 0d — Accueil en français seulement

Branche `lot-0d`.

## Ce qui est fait
- Le bouton de langue est retiré de la page d'accueil, comme du menu `/dev/` : les deux pages sont en français (`startPage({ lang: 'fr' })`). La langue se réglera dans le jeu.
- `data/i18n/en.json`, `js/i18n.js` et le support facultatif du bouton dans `js/page.js` restent en place pour le futur réglage de la langue.
- Tests Playwright adaptés : la page est en français et sans bouton même avec un navigateur en anglais ; les tests de bascule, de mémorisation et de taille du bouton de langue sont retirés avec le bouton.

## Vérifications
- Lint sans avertissement, 130 tests unitaires, 44 tests Playwright (22 par projet), Lighthouse : performance 92, accessibilité 100, bonnes pratiques 100, CLS 0.
