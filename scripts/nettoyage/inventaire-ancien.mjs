// Lot 5e-C1 — Inventaire, en lecture seule, de tout ce qui nomme l'ancien modèle de personnages (?perso=actuel, pose.js, character.js) et
// l'ancien pack de sons (?sons=ancien, sound-legacy.js, sounds-legacy.json). Node natif, sans dépendance ; n'écrit rien dans le dépôt.
//   node scripts/nettoyage/inventaire-ancien.mjs [--json <fichier hors dépôt>] [--court]
//   node scripts/nettoyage/inventaire-ancien.mjs --remesure --base http://localhost:4173 [--persos actuel,A]
//     remesure les références de rendu des garde-fous mesurés avec &perso=actuel&sang=0 (atelier-carte, atelier-detail, argent, carte-jeu,
//     jeu-rendu) avec une autre variante, mêmes scènes et mêmes gestes que les tests ; Playwright Chromium (rendu logiciel : comptes exacts).
// Chaque ligne trouvée par `git grep` reçoit une nature : (a) code du jeu, (b) test propre à l'ancien modèle ou pack (classement à confirmer
// à la lecture), (c) garde-fou (fichier de tests/selection.json « garde-fous »), (d) atelier ou page technique, (e) script, (f) documentation,
// (h) historique (bilans, journal : jamais modifié) ou hors sujet (autre sens d'« actuel » ou d'« ancien » : interface actuelle, version actuelle,
// ancienne salle…). Le classement automatique est un point de départ : l'annexe du plan le corrige à la main. Les contenus lus sont des données.
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const argv = process.argv.slice(2);
const opt = (n, d) => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : d);
const ROOT = resolve(opt('--racine', resolve(import.meta.dirname, '..', '..')));
const JSON_OUT = opt('--json', null);
if (JSON_OUT && !relative(ROOT, resolve(JSON_OUT)).startsWith('..')) {
  console.error('Refusé : --json est dans le dépôt.');
  process.exit(2);
}
if (argv.includes('--remesure')) {
  const { chromium } = await import('@playwright/test');
  const BASE = opt('--base', 'http://localhost:4173');
  const PERSOS = opt('--persos', 'actuel,A').split(',');
  const U = (px) => px * 5 + 800;
const SCENES = {
  R1: { url: '&nospawn=1', at: [U(300), U(300)], floor: 'rdc', wave: 10, zombies: 10 },
  R2: { url: '&nospawn=1', at: [U(311), U(335)], floor: 'rdc', wave: 10, zombies: 10 },
  R3: { url: '&nospawn=1&wave=11', at: [U(110), U(120)], floor: 'rdc', wave: 11, zombies: 10 },
  U1: { url: '&nospawn=1&wave=21&floor=1', at: [U(100), U(120)], floor: 'etage', wave: 21, zombies: 10 },
  U4: { url: '&nospawn=1&wave=31&floor=1', at: [U(215), U(290)], floor: 'etage', wave: 31, zombies: 10 },
  V1: { url: '&nospawn=1&wave=31', at: [U(300), U(300)], floor: 'rdc', zombies: 0 },
  V2: { url: '&nospawn=1&wave=31&floor=1', at: [U(100), U(120)], floor: 'etage', zombies: 0 },
};
  const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 667, height: 375 } });
async function open(url, freeze = true) {
  await page.goto(`${BASE}${url}`);
  await page.waitForFunction(() => (window.__zs?.getState()?.time ?? 0) > 0.05, null, { timeout: 120000 });
  if (!freeze) return;
  await page.evaluate(() => { window.requestAnimationFrame = () => 0; });
  await page.evaluate(() => new Promise((r) => setTimeout(r, 150)));
  await page.evaluate(() => window.__zs.step(0.05));
}
const scene = (sc) => page.evaluate(({ at, floor, wave, zombies }) => {
  const zs = window.__zs;
  zs.setPlayer(at[0], at[1]);
  zs.setInput({ aim: { angle: Math.PI } });
  const T = ['marcheur', 'petit', 'voute', 'grand'];
  const G = ['lent', 'marche', 'rampe', 'course'];
  for (let i = 0; i < zombies; i += 1) zs.spawnEnemy(at[0] + 40 + (i % 5) * 30, at[1] + (Math.floor(i / 5) - 0.5) * 60, { type: T[i % 4], gait: G[(i + Math.floor(i / 4)) % 4], wave, floor });
  zs.step(0.05);
  zs.sampleScreen(0, 0, 8, 8);
  const r = zs.getState().render;
  return [r.calls, r.triangles];
}, { zombies: 10, ...sc });
const start = () => page.evaluate(() => {
  const zs = window.__zs;
  const p = zs.getState().player;
  const fl = zs.getState().floor?.player ?? 'rdc';
  zs.setInput({ aim: { angle: Math.PI } });
  const T = ['marcheur', 'petit', 'voute', 'grand'];
  const G = ['lent', 'marche', 'rampe', 'course'];
  for (let i = 0; i < 10; i += 1) zs.spawnEnemy(p.x + 40 + (i % 5) * 30, p.y + (Math.floor(i / 5) - 0.5) * 60, { type: T[i % 4], gait: G[(i + Math.floor(i / 4)) % 4], wave: 10, floor: typeof fl === 'string' ? fl : 'rdc' });
  zs.step(0.05);
  zs.sampleScreen(0, 0, 8, 8);
  const s = zs.getState();
  return [s.render.calls, s.render.triangles];
});
const out = {};
for (const perso of PERSOS) {
  const q = `&perso=${perso}&sang=0`;
  const o = (out[perso] = { carte: {}, detail0: {}, detail1: {}, argent0: {}, argent1: {}, carteJeu: null, ombres: null });
  for (const [id, sc] of Object.entries(SCENES)) {
    await open(`/jeu.html?test=1&seed=1&vhs=0${sc.url}&shadows=1&detail=0${q}`);
    o.detail0[id] = await scene(sc);
    if (id[0] !== 'V') o.carte[id] = o.detail0[id];
    await open(`/jeu.html?test=1&seed=1&vhs=0${sc.url}&shadows=1${q}`);
    o.detail1[id] = await scene(sc);
  }
  for (const [name, extra] of [['R1', '&nospawn=1'], ['U1', '&wave=21&floor=1&nospawn=1']]) {
    await open(`/jeu.html?test=1&store=local&seed=1&shadows=1${q}${extra}&detail=0`);
    o.argent0[name] = await start();
    await open(`/jeu.html?test=1&store=local&seed=1&shadows=1${q}${extra}`);
    o.argent1[name] = await start();
  }
  await open(`/jeu.html?test=1&seed=1&nospawn=1&vhs=0&shadows=1${q}`);
  o.carteJeu = await page.evaluate(() => {
    const zs = window.__zs;
    const first = zs.getState().windowPositions[0];
    zs.setPlayer(first.x, first.y + 110);
    zs.setInput({ aim: { angle: Math.PI } });
    const p = zs.getState().player;
    const T = ['marcheur', 'petit', 'voute', 'grand'];
    const G = ['lent', 'marche', 'rampe', 'course'];
    for (let i = 0; i < 10; i += 1) zs.spawnEnemy(p.x + 70 + (i % 5) * 45, p.y + 20 + Math.floor(i / 5) * 90 + (i % 2) * 15, { type: T[i % 4], gait: G[(i + Math.floor(i / 4)) % 4], wave: 10 });
    zs.step(0.05);
    zs.sampleScreen(0, 0, 8, 8);
    const r = zs.getState().render;
    return [r.calls, r.triangles];
  });
  // jeu-rendu « les zombies lointains gardent leur ombre » : appels ajoutés par un zombie lointain, avec et sans ombres.
  const added = async (extra) => {
    await open(`/jeu.html?test=1&empty=1&nospawn=1&seed=1${extra}`, false);
    await page.evaluate(() => window.__zs.setInput({ aim: { angle: -Math.PI / 2 } }));
    const base = await page.evaluate(() => window.__zs.getState().render.calls);
    await page.evaluate(() => window.__zs.spawnEnemy(1560, 100));
    await page.waitForFunction((b) => window.__zs.getState().render.calls > b, base, { timeout: 30000 }).catch(() => null);
    return (await page.evaluate(() => window.__zs.getState().render.calls)) - base;
  };
  o.ombres = { avec: await added(`&zoom=1${q}`), sans: await added(`&zoom=1&shadows=0${q}`) };
  console.error(`${perso} : fait`);
}
console.log(JSON.stringify(out, null, 1));
await browser.close();
  process.exit(0);
}
const MOTIFS = ['actuel', 'pose\\.js', 'character\\.js', 'legacy', '\\bancien\\b', 'loadLegacy', 'legacyMode', 'PERSO_LOADS'];
const out = spawnSync('git', ['grep', '-n', '-I', '-E', MOTIFS.join('|'), '--', '.', ':!vendor', ':!package-lock.json', ':!scripts/nettoyage', ':!Docs/ref/nettoyage-*'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 28 }).stdout;
const selection = JSON.parse(readFileSync(join(ROOT, 'tests/selection.json'), 'utf8'));
const GARDE = new Set(selection['garde-fous'].map((g) => g.fichier));
// Sujet : personnages (P) ou sons (S) ; une ligne qui ne parle ni de l'un ni de l'autre est hors sujet.
const PERSO = /perso|personnage|pose\.js|character\.js|computePose|createKit|v1|articul|PERSO_LOADS|variante|slot|squelette|silhouette|zombie|joueur|ombre/i;
const SONS = /legacy|son|sound|pack|recette|synth|audio|loadLegacy|legacyMode/i;
const HORS = /interface actuelle|interface-actuelle|actuel\.js|version actuelle|versions? « actuelle|actuelle\b|ancienne salle|anciens? (lots?|pages?|noms?|branches?|bilans?|déclencheurs?|tests?|seuils?|blocs?)|ancien seuil|\bmap=salle/i;
// Fichiers où « actuel » ou « ancien » a un autre sens : interface actuelle (atelier de l'interface), choix « actuel » d'un son de l'atelier
// (garder la recette de synth.js de sounds.json, pas le pack d'avant), salle du lot 1m (world.legacy), version « actuelle » du site.
const FICHIERS_HORS = /^(js\/atelier-interface\/|data\/i18n\/atelier-interface\.json|data\/game\/ui-atelier\.json|scripts\/interface\/|js\/core\/atelier-choices\.js|js\/core\/layout\.js|data\/game\/world\.json|scripts\/versions\/|scripts\/assemble\.mjs|js\/accueil\/|js\/sauvegarde\/|tests\/unit\/versions-|tests\/unit\/publication\.test\.js|tests\/e2e\/dev\.spec\.js|tests\/unit\/interface-)/;
const DOMAINE_PERSO = /perso|personnage|character|pose|graphics|skeleton|blood|sang|variants/i;
function nature(f, line) {
  if (FICHIERS_HORS.test(f) && !/pose\.js|character\.js|legacy|perso=actuel|sons=ancien/.test(line)) return 'h';
  if (/\.legacy\b|world\.legacy|section « legacy »|legacy: true|\(legacy\)|portées du lot 1|ancien room\.json|ancien fichier sans floors|ancien decor\.json|ancien code/.test(line) && !/sounds?-legacy|loadLegacy|legacyMode/.test(line)) return 'h';
  if (f.startsWith('Docs/lots/') || f === 'data/changelog.json' || f === 'Docs/seed.md' || f.startsWith('tests/unit/helpers/oracle/')) return 'h';
  const p = /pose\.js|character\.js|PERSO_LOADS|perso=actuel|variante actuel|personnages? actuels?|modèle actuel|ancien modèle/i.test(line) || (/actuel/i.test(line) && (PERSO.test(line) || DOMAINE_PERSO.test(f)));
  const s = /legacy|sons=ancien|'ancien'|"ancien"|pack (d'avant|ancien)|sons? anciens?|anciennes? recettes?/i.test(line) || (/\bancien\b/i.test(line) && SONS.test(line));
  if (!p && !s) return 'h';
  if (HORS.test(line) && !/pose\.js|character\.js|legacy|perso=actuel|sons=ancien/.test(line)) return 'h';
  const sujet = p && s ? 'P+S' : p ? 'P' : 'S';
  let n;
  if (/^(Docs\/|CLAUDE\.md|README\.md)/.test(f)) n = 'f';
  else if (/^(atelier-|sons\.html)|^js\/atelier-|^data\/i18n\/atelier-|^css\/atelier-/.test(f)) n = 'd';
  else if (f.startsWith('scripts/')) n = 'e';
  else if (f.startsWith('tests/')) n = GARDE.has(f) ? 'c' : 'b';
  else n = 'a';
  return `${n}:${sujet}`;
}
const rows = out.split('\n').filter(Boolean).map((l) => {
  const m = /^([^:]+):(\d+):(.*)$/.exec(l);
  return m ? { fichier: m[1], ligne: Number(m[2]), nature: nature(m[1], m[3]), texte: m[3].trim().slice(0, 240) } : null;
}).filter(Boolean);
const parFichier = new Map();
for (const r of rows) {
  if (!parFichier.has(r.fichier)) parFichier.set(r.fichier, []);
  parFichier.get(r.fichier).push(r);
}
const compte = (k) => rows.filter((r) => r.nature.startsWith(k)).length;
console.log(`# Inventaire de l'ancien modèle et de l'ancien pack — ${rows.length} lignes, ${parFichier.size} fichiers`);
console.log(`Natures : a ${compte('a')} · b ${compte('b')} · c ${compte('c')} · d ${compte('d')} · e ${compte('e')} · f ${compte('f')} · h (historique ou hors sujet) ${compte('h')}`);
for (const [f, list] of [...parFichier].sort()) {
  const vus = list.filter((r) => r.nature !== 'h');
  if (!vus.length) continue;
  if (argv.includes('--court')) console.log(`- ${f} : ${vus.map((r) => `${r.ligne} ${r.nature}`).join(', ')}`);
  else for (const r of vus) console.log(`- ${f}:${r.ligne} [${r.nature}] ${r.texte}`);
}
if (JSON_OUT) writeFileSync(JSON_OUT, `${JSON.stringify(rows, null, 1)}\n`);
