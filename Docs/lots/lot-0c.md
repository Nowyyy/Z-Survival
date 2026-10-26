# Bilan du lot 0c — CI sans installation de navigateur

Branche `lot-0c`.

## Ce qui est fait
- L'étape `npx playwright install --with-deps chromium` est supprimée du workflow (elle durait environ 3 min 30 s par run).
- En CI (`CI=true`), `playwright.config.js` et le test « sans JavaScript » utilisent `channel: 'chrome'` : Playwright pilote le Chrome déjà installé sur `ubuntu-latest`.
- Test unitaire ajouté : le workflow n'installe aucun navigateur.

## Points à savoir
- Ce changement ne peut être validé qu'en CI : en local, il n'y a pas de Chrome, donc les tests locaux utilisent toujours le Chromium de Playwright.
- Risque : la version de Chrome du runner change sans prévenir. Si un test casse après une mise à jour du runner, le repli est de remettre l'étape `playwright install` ou un cache de `~/.cache/ms-playwright`.

## Menu /dev en français seulement
- Le bouton de langue est retiré de `/dev/` ; la page est toujours en français (`startPage({ lang: 'fr' })`). La langue se réglera dans le jeu.
- Les clés `dev.*` n'existent que dans `data/i18n/fr.json` ; le test « mêmes clés fr/en » les ignore et vérifie qu'aucune n'est en anglais.
- Constat : après un déploiement, un navigateur qui a visité le site dans les 10 minutes précédentes peut afficher d'anciens CSS et textes (GitHub Pages envoie `cache-control: max-age=600`). Un rechargement ou l'attente de 10 minutes suffit.
