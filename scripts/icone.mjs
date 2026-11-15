// Génère l'icône du site (« Z » en lettres de sang sur fond noir, incliné de 13° comme le Z du logo depuis le lot 8a, police Rubik Wet Paint du dépôt,
// couleurs lues dans css/tokens.css) et l'écrit en adresses data: PNG dans
// les pages (<link rel="icon"> et <link rel="apple-touch-icon">) : aucun fichier image n'est ajouté au dépôt.
// Usage : node scripts/icone.mjs            imprime la taille des deux images ;
//         node scripts/icone.mjs --ecrire   met à jour index.html et jeu.html (lot 5g : dev/index.html, le journal, est supprimé) ;
//         node scripts/icone.mjs --png      écrit icone-180.png dans le dossier courant (pour la regarder ; à ne pas versionner).
import { readFileSync, writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const tokens = readFileSync('css/tokens.css', 'utf8');
const token = (name) => new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`).exec(tokens)?.[1] ?? (() => { throw new Error(`jeton --${name} introuvable`); })();
const BG = token('color-bg');
const RED = token('color-action');
const font = readFileSync('fonts/rubik-wet-paint-latin-400-normal.woff2').toString('base64');

const html = (size) => `<!doctype html><html><head><style>
@font-face { font-family: "Wet"; src: url(data:font/woff2;base64,${font}) format("woff2"); }
html, body { margin: 0; width: ${size}px; height: ${size}px; background: ${BG}; overflow: hidden; }
body { display: flex; align-items: center; justify-content: center; }
span { display: inline-block; font-family: "Wet"; font-size: ${Math.round(size * 0.7)}px; line-height: 1; color: ${RED}; transform: rotate(13deg); }
</style></head><body><span>Z</span></body></html>`;

const browser = await chromium.launch();
const out = {};
for (const size of [180, 48]) {
  const page = await (await browser.newContext({ viewport: { width: size, height: size }, deviceScaleFactor: 1 })).newPage();
  await page.setContent(html(size));
  await page.evaluate(() => document.fonts.ready);
  out[size] = await page.screenshot({ type: 'png', clip: { x: 0, y: 0, width: size, height: size } });
}
await browser.close();
const uri = (size) => `data:image/png;base64,${out[size].toString('base64')}`;
console.log(`apple-touch-icon 180×180 : ${out[180].length} octets ; icône 48×48 : ${out[48].length} octets`);

if (process.argv.includes('--png')) writeFileSync('icone-180.png', out[180]);
if (process.argv.includes('--ecrire')) {
  const block = `<link rel="icon" type="image/png" sizes="48x48" href="${uri(48)}">\n  <link rel="apple-touch-icon" sizes="180x180" href="${uri(180)}">`;
  for (const file of ['index.html', 'jeu.html']) {
    let text = readFileSync(file, 'utf8');
    const before = text;
    text = text.replace(/<link rel="icon"[^>]*>(\n {2}<link rel="apple-touch-icon"[^>]*>)?/, () => block);
    if (text === before && !text.includes('apple-touch-icon')) throw new Error(`${file} : <link rel="icon"> introuvable`);
    writeFileSync(file, text);
    console.log(`${file} : icône écrite`);
  }
}
