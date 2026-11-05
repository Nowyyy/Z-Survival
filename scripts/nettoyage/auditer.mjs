// Lot 5c-A — Audit de nettoyage, en lecture seule : inventaire des candidats à la suppression avec leurs preuves de non-usage.
// Node natif, sans dépendance. N'écrit RIEN dans le dépôt : rapport Markdown sur la sortie standard, détail JSON dans un fichier hors dépôt
// (--json <chemin>, refusé s'il est dans le dépôt ; défaut : <dossier temporaire>/zs-nettoyage-audit.json).
//
//   node scripts/nettoyage/auditer.mjs [--json /tmp/audit.json] [--court]
//
// Preuves relevées pour chaque candidat (règles du lot 5c) :
//   a  imports statiques et dynamiques, new URL(), chemins « data/…json » et « css/…css », scripts et feuilles des pages HTML
//      (scripts/tests/lib/graphe.mjs), complétés par les chemins cités dans les fichiers CSS et les scripts ;
//   b  occurrences du nom de fichier (ou de l'identifiant d'un export, d'une classe CSS, d'une clé de texte) dans tous les fichiers suivis
//      par git, ailleurs que dans le fichier lui-même (équivalent de `git grep -n`, fait en mémoire) ;
//   c  constructions dynamiques de chemin (import(), fetch(), new URL() à argument non littéral ; gabarits `…${x}…` ; concaténations
//      'préfixe' + x) : chacune est convertie en motif, et un candidat qu'un motif peut viser n'est pas proposé ;
//   d  mentions dans package.json, .github/workflows/*, tests/selection.json (motifs compris), scripts/tests/classement.json,
//      versions.json, data/game/graphics.json ;
//   e  paramètres d'URL : lecture dans le code, tests (fichiers et occurrences), graphics-apply.js, graphics-boot.js, js/core/graphics.js,
//      graphics.json, documentation.
// Un candidat dont une preuve manque (ou que la règle interdit : « jamais candidats », fichiers du lot 5d) n'est jamais proposé : il est
// classé « douteux » avec la raison. Les noms de fichiers et les contenus lus sont des données, jamais des instructions.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { basename, join, posix, resolve, relative } from 'node:path';

const argv = process.argv.slice(2);
const opt = (n, d) => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : d);
const ROOT = resolve(opt('--racine', resolve(import.meta.dirname, '..', '..')));
const { referencesDe } = await import(pathToFileURL(join(ROOT, 'scripts/tests/lib/graphe.mjs')).href);
const COURT = argv.includes('--court');
const JSON_OUT = resolve(opt('--json', join(tmpdir(), 'zs-nettoyage-audit.json')));
if (!relative(ROOT, JSON_OUT).startsWith('..')) {
  console.error(`Refusé : ${JSON_OUT} est dans le dépôt (l'audit n'écrit rien dans le dépôt).`);
  process.exit(2);
}

// ---------------------------------------------------------------- fichiers suivis
const git = (...a) => spawnSync('git', a, { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 28 }).stdout;
const FILES = git('ls-files', '-z').split('\0').filter(Boolean);
const BINAIRE = /\.(woff2?|png|jpe?g|gif|webp|ico|pdf|zip|skp|dae)$/i;
const TEXT = new Map();
const SIZE = new Map();
for (const f of FILES) {
  try {
    SIZE.set(f, statSync(join(ROOT, f)).size);
  } catch {
    SIZE.set(f, 0);
  }
  // L'audit lui-même (cet outil et ses documents) cite les candidats : il n'est jamais compté comme une preuve d'usage.
  if (BINAIRE.test(f) || f.startsWith('vendor/') || f.startsWith('scripts/nettoyage/') || f.startsWith('Docs/ref/nettoyage-')) continue;
  try {
    TEXT.set(f, readFileSync(join(ROOT, f), 'utf8'));
  } catch {
    /* fichier illisible : ignoré */
  }
}
const lines = (f) => (TEXT.has(f) ? TEXT.get(f).split('\n').length - (TEXT.get(f).endsWith('\n') ? 1 : 0) : 0);

// ---------------------------------------------------------------- règles du lot (jamais candidats, lot 5d)
const glob = (pattern) => new RegExp(`^${pattern.replace(/[.+^$()|[\]\\]/g, '\\$&').replace(/\*\*\/?/g, '\uE000').replace(/\*/g, '[^/]*').replace(/\?/g, '[^/]').replace(/\uE000/g, '.*')}$`);
const matchAny = (f, patterns) => patterns.some((p) => glob(p).test(f));
const selection = JSON.parse(TEXT.get('tests/selection.json'));
const GARDE_FOUS = new Set(selection['garde-fous'].map((g) => g.fichier));
const LOT_5D = ['js/core/collision.js', 'js/core/pose-v2.js', 'js/core/character-parts.js'];
const LOT_5D_TESTS = FILES.filter((f) => f.startsWith('tests/') && LOT_5D.some((m) => (TEXT.get(f) ?? '').includes(basename(m)) && (TEXT.get(f) ?? '').includes('import')) && /\b(collision|pose-v2|character-parts)\b/.test(TEXT.get(f) ?? ''));
const JAMAIS = [
  'Docs/lots/**', 'Docs/seed.md', 'data/changelog.json', 'tests/budget*.json', 'tests/dernier-complet.json', 'tests/selection.json',
  'scripts/tests/**', 'scripts/versions/**', 'scripts/site/**', 'scripts/assemble.mjs', 'scripts/perf/**', 'scripts/nettoyage/**',
  'js/save/**', 'js/core/save.js', 'sauvegarde.html', 'js/sauvegarde/**', 'css/sauvegarde.css', 'data/game/world.json', 'data/game/decor.json',
  'data/game/graphics.json', 'js/core/graphics.js', 'js/game/graphics-apply.js', 'js/game/graphics-boot.js', '.github/**', 'versions.json',
  'package.json', 'package-lock.json', 'CLAUDE.md', 'README.md', 'Docs/ref/conventions.md', '.gitignore', 'eslint.config.js',
  'playwright.config.js', 'vitest.config.js', 'build-info.json', 'apercu.txt', 'vendor/**', 'jeu.html', 'index.html', 'dev/**',
];
function interdit(f) {
  if (LOT_5D.includes(f)) return 'réservé au lot 5d';
  if (LOT_5D_TESTS.includes(f)) return 'test d\'un fichier du lot 5d';
  if (GARDE_FOUS.has(f)) return 'fichier de test garde-fou (tests/selection.json)';
  if (matchAny(f, JAMAIS)) return 'jamais candidat (règle du lot)';
  return null;
}

// ---------------------------------------------------------------- index des mots (b)
// Deux index : identifiants JavaScript ([A-Za-z_$][\w$]*) et jetons de chemin ([\w.-]+, donc « pose.js », « hud-live », « game.gfx.lowered »).
const ID = new Map();
const TOK = new Map();
const add = (m, k, f) => {
  let s = m.get(k);
  if (!s) m.set(k, (s = new Set()));
  s.add(f);
};
for (const [f, src] of TEXT) {
  for (const m of src.matchAll(/[A-Za-z_$][\w$]*/g)) add(ID, m[0], f);
  for (const m of src.matchAll(/\w[\w.-]*\w|\w/g)) {
    add(TOK, m[0], f);
    // « a.b.c » : aussi chaque suffixe après un point (« pose.js » dans « core/pose.js » est déjà séparé par « / »)
  }
}
const where = (set, except = []) => [...(set ?? [])].filter((f) => !except.includes(f));
function linesOf(f, needle, max = 3) {
  const out = [];
  const src = TEXT.get(f) ?? '';
  const re = needle instanceof RegExp ? needle : new RegExp(`(?<![\\w$.-])${needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w$-]|\\.[\\w$])`);
  src.split('\n').forEach((l, i) => {
    if (out.length < max && re.test(l)) out.push(`${f}:${i + 1}`);
  });
  return out;
}
const zoneOf = (f) => (f.startsWith('tests/') ? 'tests' : f.startsWith('Docs/') || f.endsWith('.md') ? 'doc' : f.startsWith('.github/') ? 'ci' : 'code');

// ---------------------------------------------------------------- graphe (a)
const SOURCES = FILES.filter((f) => TEXT.has(f) && /\.(m?js|html|css)$/.test(f) && !f.startsWith('vendor/'));
const IMPORTERS = new Map(); // fichier -> Set(fichiers qui le lisent)
const REFS = new Map();
for (const f of SOURCES) {
  const src = TEXT.get(f);
  const refs = new Set(referencesDe(f, src));
  if (f.endsWith('.css')) for (const m of src.matchAll(/url\(\s*['"]?([^'")]+)['"]?\s*\)|@import\s+['"]([^'"]+)['"]/g)) {
    const p = m[1] ?? m[2];
    if (!/^(data:|https?:|#)/.test(p)) refs.add(posix.normalize(posix.join(posix.dirname(f), p)));
  }
  // Scripts Node : chemins cités comme chaînes (« js/core/x.js », « data/…json », « scripts/…mjs »), lus par fs.
  if (f.endsWith('.mjs') || f.startsWith('tests/')) for (const m of src.matchAll(/['"`]((?:js|css|data|scripts|fonts|Docs|tests)\/[\w./-]+\.(?:m?js|json|css|html|md|txt|woff2))['"`]/g)) refs.add(m[1]);
  for (const m of src.matchAll(/['"`]([\w-]+\.html)(?:[?#][^'"`]*)?['"`]/g)) if (FILES.includes(m[1])) refs.add(m[1]);
  REFS.set(f, refs);
  for (const r of refs) add(IMPORTERS, r, f);
}

// ---------------------------------------------------------------- constructions dynamiques (c)
const DYN = [];
for (const f of SOURCES.filter((x) => /\.(m?js|html)$/.test(x))) {
  const src = TEXT.get(f);
  src.split('\n').forEach((l, i) => {
    const at = `${f}:${i + 1}`;
    for (const m of l.matchAll(/\b(import|fetch|new URL|loadJson|json|readFileSync|read)\(\s*([^)'"][^)]*|`[^`]*\$\{[^`]*`)/g)) {
      DYN.push({ at, kind: m[1], expr: m[2].trim().slice(0, 120) });
    }
    for (const m of l.matchAll(/`([^`]*\$\{[^`]*)`/g)) {
      const t = m[1];
      if (/(^|\/)(js|css|data|fonts|scripts)\/|\.(json|js|css|html|mjs)\b/.test(t)) DYN.push({ at, kind: 'gabarit', expr: t.slice(0, 120) });
    }
    for (const m of l.matchAll(/['"]((?:\.{0,2}\/)?(?:js|css|data|fonts)\/[\w./-]*)['"]\s*\+/g)) DYN.push({ at, kind: 'concaténation', expr: `${m[1]} + …` });
  });
}
// Motif d'une construction : le gabarit avec ${…} remplacé par « n'importe quoi » ; une expression sans partie littérale (variable seule)
// peut viser tout fichier de son type : on garde l'emplacement pour la lecture humaine, et on la résout quand la variable est un littéral connu.
const dynRegexes = [];
for (const d of DYN) {
  let lit = d.expr.replace(/^`|`$/g, '');
  if (d.kind === 'concaténation') lit = `${lit.replace(/ \+ …$/, '')}\${x}`;
  if (!lit.includes('${')) continue;
  const dir = posix.dirname(d.at.split(':')[0]);
  let pat = lit.replace(/\$\{[^}]*\}/g, '\uE000').replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\uE000/g, '.*');
  if (lit.startsWith('./') || lit.startsWith('../')) pat = posix.join(dir, lit).replace(/\$\{[^}]*\}/g, '\uE000').replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\uE000/g, '.*');
  pat = pat.replace(/^(\\\.\\\.\/)+/, '');
  if (pat.replace(/\.\*/g, '').length < 3) continue;
  d.regex = pat;
  dynRegexes.push({ re: new RegExp(`(^|/)${pat}$`), d });
}
const dynFor = (f) => dynRegexes.filter(({ re }) => re.test(f)).map(({ d }) => `${d.at} \`${d.expr}\``);

// ---------------------------------------------------------------- mentions de configuration (d)
const CONFIG = ['package.json', ...FILES.filter((f) => f.startsWith('.github/workflows/')), 'tests/selection.json', 'scripts/tests/classement.json', 'versions.json', 'data/game/graphics.json'];
const selectionGlobs = [];
(function collect(node) {
  if (Array.isArray(node)) node.forEach(collect);
  else if (node && typeof node === 'object') Object.values(node).forEach(collect);
  else if (typeof node === 'string' && /[*/]/.test(node) && !node.includes(' ')) selectionGlobs.push(node);
})(selection);
function configFor(f) {
  const out = [];
  const name = basename(f);
  for (const c of CONFIG) if (c !== f && TEXT.has(c) && TEXT.get(c).includes(name)) out.push(`${c} (« ${name} »)`);
  const g = selectionGlobs.filter((p) => p.includes('*') && glob(p).test(f));
  if (g.length) out.push(`tests/selection.json (motif ${g.join(', ')})`);
  return out;
}

// ---------------------------------------------------------------- preuve d'un fichier
function preuveFichier(f) {
  const name = basename(f);
  const importers = where(IMPORTERS.get(f), [f]);
  const nameHits = where(TOK.get(name), [f]);
  const dyn = dynFor(f);
  const conf = configFor(f);
  return {
    a: importers,
    b: nameHits.map((x) => ({ f: x, zone: zoneOf(x), lignes: linesOf(x, name, 2) })),
    c: dyn,
    d: conf,
  };
}

// ---------------------------------------------------------------- inventaire : fichiers sans aucun lecteur
// Fichiers lus par le site ou les outils (js/, css/, data/, fonts/, dev/, assistants de tests) ; les pages, les scripts (N4), les fichiers
// de tests et la documentation (N5) sont des points d'entrée : traités à part.
const ENTREES_PAGES = FILES.filter((f) => /^[\w-]+\.html$/.test(f) || f === 'dev/index.html');
const fichiers = [];
const lusParTestsSeuls = [];
for (const f of FILES) {
  if (!/^(js|css|data|fonts|dev)\//.test(f) && !(f.startsWith('tests/') && !/\.(test|spec)\.js$/.test(f))) continue;
  if (ENTREES_PAGES.includes(f)) continue;
  const p = preuveFichier(f);
  const lecteursCode = p.a.filter((x) => !x.startsWith('tests/'));
  if (lecteursCode.length || p.c.some((d) => !d.startsWith('tests/'))) continue; // lu par du code (littéral ou chemin construit) : vivant
  const raison = interdit(f);
  const exacts = p.d.filter((x) => !x.includes('(motif'));
  if (p.a.length) {
    lusParTestsSeuls.push({ fichier: f, octets: SIZE.get(f), lignes: lines(f), tests: p.a, interdit: raison });
    continue;
  }
  let verdict;
  if (raison) verdict = `jamais candidat : ${raison}`;
  else if (p.c.length) verdict = 'douteux : un chemin construit peut le viser (c)';
  else if (p.b.some((h) => h.zone !== 'doc') || exacts.length) verdict = 'douteux : nom cité hors documentation (b, d)';
  else verdict = p.b.length ? 'candidat (nom cité seulement dans la documentation)' : 'candidat';
  fichiers.push({ fichier: f, octets: SIZE.get(f), lignes: lines(f), preuve: p, verdict });
}

// Étendue d'une déclaration exportée (ligne de départ, lignes, octets) : accolades équilibrées pour une fonction, jusqu'au « ; » de fin
// d'instruction (crochets équilibrés) pour une constante.
function etendue(src, n) {
  const m = new RegExp(`^export\\s+(?:async\\s+)?(?:function\\*?|const|let|class)\\s+${n.replace(/\$/g, '\\$')}\\b`, 'm').exec(src);
  if (!m) return { ligne: null, lignesDecl: 0, octetsDecl: 0 };
  let depth = 0;
  let i = m.index;
  let seen = false;
  for (; i < src.length; i += 1) {
    const c = src[i];
    if ('({['.includes(c)) {
      depth += 1;
      seen = true;
    } else if (')}]'.includes(c)) depth -= 1;
    if (depth === 0 && ((c === ';') || (c === '}' && seen && /function|class/.test(m[0])))) break;
  }
  const text = src.slice(m.index, i + 1);
  return { ligne: src.slice(0, m.index).split('\n').length, lignesDecl: text.split('\n').length, octetsDecl: Buffer.byteLength(text) };
}

// ---------------------------------------------------------------- exports (N1 : exports morts)
const exportsMorts = [];
const exportsTestsSeuls = [];
for (const f of FILES.filter((x) => /^(js|scripts)\/.*\.m?js$/.test(x) && TEXT.has(x))) {
  const src = TEXT.get(f);
  const names = new Set();
  for (const m of src.matchAll(/^export\s+(?:async\s+)?(?:function\*?|const|let|class)\s+([A-Za-z_$][\w$]*)/gm)) names.add(m[1]);
  for (const m of src.matchAll(/^export\s*\{([^}]*)\}/gm)) for (const part of m[1].split(',')) {
    const n = part.trim().split(/\s+as\s+/).pop();
    if (n) names.add(n);
  }
  for (const n of names) {
    if (n === 'default') continue;
    const others = where(ID.get(n), [f]);
    const inside = (src.match(new RegExp(`(?<![\\w$])(?<![^.]\\.)${n.replace(/\$/g, '\\$')}(?![\\w$])`, 'g')) ?? []).length - 1;
    const code = others.filter((x) => zoneOf(x) === 'code');
    const tests = others.filter((x) => zoneOf(x) === 'tests');
    const docs = others.filter((x) => zoneOf(x) === 'doc');
    // Accès dynamique à un module (m[name], Object.keys(mod)…) : signalé par la présence d'un import(…) dont on lit des clés calculées.
    const row = { fichier: f, export: n, interne: inside, code, tests, docs, interdit: interdit(f), ...etendue(src, n) };
    if (!code.length && !tests.length) exportsMorts.push(row);
    else if (!code.length && tests.length) exportsTestsSeuls.push(row);
  }
}

// ---------------------------------------------------------------- règles CSS (N1)
const cssUnused = [];
const jsPrefixes = new Set();
for (const [f, src] of TEXT) {
  if (!/\.(m?js|html)$/.test(f)) continue;
  for (const m of src.matchAll(/(?:^|[\s`'"])([\w-]+-)\$\{/g)) jsPrefixes.add(m[1]);
  for (const m of src.matchAll(/[`'"]([\w-]+-)['"]\s*\+/g)) jsPrefixes.add(m[1]);
  for (const m of src.matchAll(/[`'"]([\w-]+)\$\{/g)) jsPrefixes.add(m[1]);
}
for (const f of FILES.filter((x) => x.startsWith('css/') && x.endsWith('.css'))) {
  const src = TEXT.get(f).replace(/\/\*[\s\S]*?\*\//g, '');
  const sels = new Set();
  for (const m of src.matchAll(/([^{}]+)\{/g)) {
    const sel = m[1];
    if (sel.trim().startsWith('@')) continue;
    for (const s of sel.matchAll(/[.#](-?[A-Za-z_][\w-]*)/g)) sels.add(`${s[0][0]}${s[1]}`);
  }
  for (const s of sels) {
    const id = s.slice(1);
    if (/^\d/.test(id)) continue;
    const users = where(TOK.get(id), []).filter((x) => !x.startsWith('css/') && zoneOf(x) !== 'doc');
    if (users.length) continue;
    const prefix = [...jsPrefixes].filter((p) => id.startsWith(p) && p.length >= 3);
    cssUnused.push({ fichier: f, selecteur: s, lignes: linesOf(f, new RegExp(`\\${s[0]}${id}(?![\\w-])`), 3), autresCss: where(TOK.get(id), [f]).filter((x) => x.startsWith('css/')), prefixeDynamique: prefix, tests: where(TOK.get(id)).filter((x) => zoneOf(x) === 'tests') });
  }
}

// Jetons CSS (--x) jamais lus : ni var(--x), ni chaîne « x » ou « --x » dans le code (palette.js lit des noms construits : préfixes relevés).
const cssVarsUnused = [];
const tokensSrc = FILES.filter((x) => x.startsWith('css/')).map((x) => [x, TEXT.get(x)]);
const defined = new Map();
for (const [f, src] of tokensSrc) for (const m of src.matchAll(/(--[\w-]+)\s*:/g)) if (!defined.has(m[1])) defined.set(m[1], f);
const varPrefixes = new Set();
for (const [f, src] of TEXT) {
  if (!/\.(m?js|html|css)$/.test(f)) continue;
  for (const m of src.matchAll(/[`'"](--[\w-]*?)\$\{/g)) varPrefixes.add(m[1]);
  for (const m of src.matchAll(/[`'"](--[\w-]+-)['"]\s*\+/g)) varPrefixes.add(m[1]);
  for (const m of src.matchAll(/var\(\s*(--[\w-]*?)\$\{/g)) varPrefixes.add(m[1]);
}
for (const [v, f] of defined) {
  let used = false;
  for (const [g, src] of TEXT) {
    if (zoneOf(g) === 'doc') continue;
    const n = src.split(v).length - 1;
    const defs = (src.match(new RegExp(`${v.replace(/[-]/g, '\\-')}\\s*:`, 'g')) ?? []).length;
    if (n - defs > 0) {
      used = true;
      break;
    }
    const suffixes = [v.slice(2), ...[...varPrefixes].filter((pr) => pr.length > 3 && v.startsWith(pr)).map((pr) => v.slice(pr.length)), ...(v.startsWith('--game-') ? [v.slice(7)] : [])];
    if (/\.m?js$/.test(g) && suffixes.filter((x) => x.length > 2).some((x) => new RegExp(`['"\`]${x.replace(/-/g, '\\-')}['"\`]`).test(src))) {
      used = true;
      break;
    }
  }
  if (used) continue;
  const prefix = [...varPrefixes].filter((p) => v.startsWith(p) && p.length > 3);
  cssVarsUnused.push({ jeton: v, fichier: f, prefixeDynamique: prefix, lignes: linesOf(f, new RegExp(`${v}\\s*:`), 1) });
}

// ---------------------------------------------------------------- clés de texte (N1)
const keyPrefixes = new Set();
for (const [f, src] of TEXT) {
  if (!/\.(m?js|html)$/.test(f) || f.startsWith('tests/')) continue;
  for (const m of src.matchAll(/(?:^|[\s`'"(])([a-z][\w-]*(?:\.[\w-]+)*[.-])\$\{/g)) keyPrefixes.add(m[1]);
  for (const m of src.matchAll(/['"]([a-z][\w-]*(?:\.[\w-]+)*\.)['"]\s*\+/g)) keyPrefixes.add(m[1]);
  for (const m of src.matchAll(/[`]([a-z][\w-]*(?:\.[\w-]+)*[\w-])\$\{/g)) keyPrefixes.add(m[1]);
}
const clesOrphelines = [];
for (const f of FILES.filter((x) => x.startsWith('data/i18n/') && x.endsWith('.json'))) {
  const dict = JSON.parse(TEXT.get(f));
  const i18nFiles = FILES.filter((x) => x.startsWith('data/i18n/'));
  for (const k of Object.keys(dict)) {
    if (k.startsWith('_')) continue;
    const users = where(TOK.get(k), i18nFiles);
    const code = users.filter((x) => zoneOf(x) === 'code');
    if (code.length) continue;
    const prefix = [...keyPrefixes].filter((p) => k.startsWith(p) && p.length >= 4);
    clesOrphelines.push({ fichier: f, cle: k, prefixeDynamique: prefix, tests: users.filter((x) => zoneOf(x) === 'tests'), docs: users.filter((x) => zoneOf(x) === 'doc') });
  }
}

// ---------------------------------------------------------------- paramètres d'URL (N2, e)
const PARAMS = new Map();
const PRESET_FILES = ['js/core/graphics.js', 'js/game/graphics-boot.js', 'js/game/graphics-apply.js', 'data/game/graphics.json'];
for (const [f, src] of TEXT) {
  if (!/^js\/.*\.js$/.test(f) && !/^[\w-]+\.html$/.test(f)) continue;
  if (!/URLSearchParams|location\.search|search\b|query\b/.test(src)) continue;
  const re = /\b(?:get|has|getAll|int|flag|num|pick|param|bool|value)\(\s*'([a-z][\w]*)'|\[\?&\]\)?([a-z]+)=|\(\?:\^\|\[\?&\]\)([a-z]+)=/g;
  src.split('\n').forEach((l, i) => {
    if (!/search|query|params|URLSearchParams|\bq\b|\bget\(/.test(l) && !/\[\?&\]/.test(l)) return;
    for (const m of l.matchAll(re)) {
      const n = m[1] ?? m[2] ?? m[3];
      if (!n) continue;
      if (!PARAMS.has(n)) PARAMS.set(n, { code: new Set(), tests: new Map(), presets: new Set(), docs: new Set() });
      PARAMS.get(n).code.add(`${f}:${i + 1}`);
    }
  });
}
for (const [n, p] of PARAMS) {
  const re = new RegExp(`[?&]${n}=|['"]${n}['"]`, 'g');
  const reUrl = new RegExp(`[?&]${n}=`, 'g');
  for (const [f, src] of TEXT) {
    if (f.startsWith('tests/')) {
      const c = (src.match(reUrl) ?? []).length;
      if (c) p.tests.set(f, c);
    } else if (PRESET_FILES.includes(f)) {
      if (re.test(src)) p.presets.add(...linesOf(f, new RegExp(`[?&]${n}=|['"]${n}['"]|\\b${n}:`), 3));
      re.lastIndex = 0;
    } else if (zoneOf(f) === 'doc' && reUrl.test(src)) p.docs.add(f);
    reUrl.lastIndex = 0;
  }
}

// ---------------------------------------------------------------- fermeture exclusive (code retenu en vie par un fichier ou un mode)
// Fichiers atteints seulement depuis l'ensemble de départ : un fichier entre si tous ses lecteurs (code) sont déjà dans l'ensemble.
function exclusif(depart) {
  const set = new Set(depart);
  let changed = true;
  while (changed) {
    changed = false;
    for (const f of SOURCES.concat(FILES.filter((x) => x.startsWith('data/') || x.startsWith('fonts/')))) {
      if (set.has(f) || f.startsWith('tests/') || ENTREES_PAGES.includes(f)) continue;
      const imp = where(IMPORTERS.get(f), [f]).filter((x) => !x.startsWith('tests/') && !x.startsWith('Docs/'));
      if (dynFor(f).some((d) => !d.startsWith('tests/') && !set.has(d.split(':')[0]))) continue; // visé par un chemin construit hors de l'ensemble
      if (imp.length && imp.every((x) => set.has(x))) {
        set.add(f);
        changed = true;
      }
    }
  }
  return [...set];
}
const pages = {};
for (const page of ENTREES_PAGES.filter((f) => !['index.html', 'jeu.html', 'dev/index.html'].includes(f))) {
  const ex = exclusif([page]);
  const tests = FILES.filter((x) => x.startsWith('tests/') && (TEXT.get(x) ?? '').includes(page));
  const scripts = FILES.filter((x) => x.startsWith('scripts/') && (TEXT.get(x) ?? '').includes(page));
  pages[page] = { fichiers: ex, octets: ex.reduce((s, x) => s + (SIZE.get(x) ?? 0), 0), lignes: ex.reduce((s, x) => s + lines(x), 0), tests, scripts, interdit: interdit(page) };
}

const testsDe = (liste) => [...new Set(liste.flatMap((x) => where(IMPORTERS.get(x)).filter((t) => t.startsWith('tests/'))))].sort();
const groupe = (depart) => {
  const ex = exclusif(depart);
  return { depart, fichiers: ex, octets: ex.reduce((s, x) => s + (SIZE.get(x) ?? 0), 0), lignes: ex.reduce((s, x) => s + lines(x), 0), tests: testsDe(ex), gardeFous: testsDe(ex).filter((t) => GARDE_FOUS.has(t)), lot5d: testsDe(ex).filter((t) => LOT_5D_TESTS.includes(t)) };
};
const TECHNIQUES = ENTREES_PAGES.filter((f) => !['index.html', 'jeu.html', 'dev/index.html', 'sauvegarde.html'].includes(f));
const groupes = {
  'pages techniques (toutes, sauf sauvegarde.html)': groupe(TECHNIQUES),
  'atelier des sons (atelier-sons.html + atelier-choix.html)': groupe(['atelier-sons.html', 'atelier-choix.html']),
  'atelier de l\'interface (atelier-interface.html + interface-retenue.html)': groupe(['atelier-interface.html', 'interface-retenue.html']),
  'atelier de la carte (carte.html + visite.html + ecarts.html)': groupe(['carte.html', 'visite.html', 'ecarts.html']),
  '?perso=actuel (ancien modèle)': groupe(['js/core/pose.js', 'js/game/character.js']),
  '?sons=ancien (pack d\'avant)': groupe(['js/game/sound-legacy.js', 'data/game/sounds-legacy.json']),
};

// ---------------------------------------------------------------- scripts (N4)
const scriptsN4 = [];
const DOC_ACTIVE = FILES.filter((f) => (f.startsWith('Docs/ref/') || f === 'CLAUDE.md' || f === 'README.md') && f.endsWith('.md'));
for (const f of FILES.filter((x) => x.startsWith('scripts/') && /\.(mjs|py|js)$/.test(x))) {
  const name = basename(f);
  const pkg = TEXT.get('package.json').includes(f) || TEXT.get('package.json').includes(name);
  const ci = FILES.filter((x) => x.startsWith('.github/') && TEXT.get(x).includes(name));
  const docs = DOC_ACTIVE.filter((x) => TEXT.get(x).includes(name));
  const bilans = FILES.filter((x) => x.startsWith('Docs/lots/') && TEXT.get(x).includes(name));
  const imp = where(IMPORTERS.get(f), [f]);
  const autres = where(TOK.get(name), [f]).filter((x) => zoneOf(x) !== 'doc' && !x.startsWith('.github/') && x !== 'package.json');
  scriptsN4.push({ fichier: f, octets: SIZE.get(f), lignes: lines(f), packageJson: pkg, ci, docs, bilans, importe: imp, autres, interdit: interdit(f) });
}

// ---------------------------------------------------------------- documentation (N5)
const docsN5 = [];
const existing = new Set(FILES);
for (const f of FILES.filter((x) => x.startsWith('Docs/ref/') && x.endsWith('.md'))) {
  const src = TEXT.get(f);
  const cited = new Set();
  for (const m of src.matchAll(/`([\w./-]+\.(?:m?js|json|css|html|md|py|txt))`/g)) cited.add(m[1]);
  const missing = [...cited].filter((c) => !existing.has(c) && !FILES.some((x) => x.endsWith(`/${c}`)) && !/^(_site|node_modules|lighthouse|test-results)/.test(c));
  const lecteurs = FILES.filter((x) => x !== f && (TEXT.get(x) ?? '').includes(basename(f)));
  docsN5.push({ fichier: f, octets: SIZE.get(f), lignes: lines(f), cites: cited.size, absents: missing, citePar: lecteurs.filter((x) => !x.startsWith('Docs/lots/')), citeParBilans: lecteurs.filter((x) => x.startsWith('Docs/lots/')).length });
}

// ---------------------------------------------------------------- doublons (N6)
// Fonctions de premier niveau (function f(…) {…} et const f = (…) => …) : corps normalisé (espaces, commentaires) ; mêmes corps dans deux
// fichiers, ou même nom et même nombre de paramètres dans plusieurs fichiers.
const fns = [];
for (const f of FILES.filter((x) => /^(js|scripts|tests)\/.*\.m?js$/.test(x) && TEXT.has(x))) {
  const src = TEXT.get(f);
  const re = /^(?:export\s+)?(?:async\s+)?function\s+([\w$]+)\s*\(([^)]*)\)\s*\{/gm;
  for (const m of src.matchAll(re)) {
    let depth = 0;
    let i = m.index + m[0].length - 1;
    for (; i < src.length; i += 1) {
      if (src[i] === '{') depth += 1;
      else if (src[i] === '}') {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    const body = src.slice(m.index + m[0].length, i);
    fns.push({ f, name: m[1], params: m[2].split(',').filter((x) => x.trim()).length, body });
  }
  for (const m of src.matchAll(/^(?:export\s+)?const\s+([\w$]+)\s*=\s*(?:async\s*)?\(([^)]*)\)\s*=>\s*(.+);$/gm)) fns.push({ f, name: m[1], params: m[2].split(',').filter((x) => x.trim()).length, body: m[3] });
}
const norm = (b) => b.replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, '');
const byBody = new Map();
for (const x of fns) {
  const n = norm(x.body);
  if (n.length < 40) continue;
  const h = createHash('sha1').update(n).digest('hex');
  if (!byBody.has(h)) byBody.set(h, []);
  byBody.get(h).push(x);
}
const doublonsCorps = [...byBody.values()].filter((g) => new Set(g.map((x) => x.f)).size > 1).map((g) => ({ taille: norm(g[0].body).length, membres: g.map((x) => `${x.f} ${x.name}(${x.params})`) })).sort((a, b) => b.taille - a.taille);
const byName = new Map();
for (const x of fns.filter((y) => !y.f.startsWith('tests/'))) {
  const k = `${x.name}/${x.params}`;
  if (!byName.has(k)) byName.set(k, []);
  byName.get(k).push(x);
}
const doublonsNoms = [...byName.entries()].filter(([, g]) => new Set(g.map((x) => x.f)).size > 1).map(([k, g]) => ({ nom: k, fichiers: [...new Set(g.map((x) => x.f))] })).sort((a, b) => b.fichiers.length - a.fichiers.length);

// ---------------------------------------------------------------- dépendances de développement (N7)
const pkg = JSON.parse(TEXT.get('package.json'));
const devDeps = Object.keys(pkg.devDependencies ?? {}).map((dep) => {
  const importers = FILES.filter((f) => TEXT.has(f) && !f.startsWith('Docs/') && f !== 'package.json' && f !== 'package-lock.json' && new RegExp(`(from\\s*|import\\s*\\(\\s*|require\\(\\s*)['"]${dep.replace(/[/.]/g, '\\$&')}(?:/[^'"]*)?['"]`).test(TEXT.get(f)));
  const bin = dep.split('/').pop();
  const cli = FILES.filter((f) => TEXT.has(f) && (f === 'package.json' || f.startsWith('.github/') || f.startsWith('scripts/')) && new RegExp(`\\b(npx|node_modules/\\.bin/)\\s*${bin}\\b|"${bin}\\s|'${bin}'|\\bnpx', \\['${bin}'`).test(TEXT.get(f)));
  return { paquet: dep, version: pkg.devDependencies[dep], importePar: importers, cli };
});

// ---------------------------------------------------------------- sortie
const out = { racine: ROOT, tete: git('rev-parse', 'HEAD').trim(), fichiersSuivis: FILES.length, dynamiques: DYN, fichiers, exportsMorts, exportsTestsSeuls, cssUnused, cssVarsUnused, clesOrphelines, params: Object.fromEntries([...PARAMS].map(([k, v]) => [k, { code: [...v.code], tests: Object.fromEntries(v.tests), presets: [...v.presets], docs: [...v.docs] }])), pages, groupes, lusParTestsSeuls, scriptsN4, docsN5, doublonsCorps, doublonsNoms, devDeps, lot5d: { fichiers: LOT_5D, tests: LOT_5D_TESTS } };
writeFileSync(JSON_OUT, JSON.stringify(out, null, 1));

const P = (s) => console.log(s);
P(`# Audit de nettoyage (outil du lot 5c) — ${out.tete.slice(0, 7)}, ${FILES.length} fichiers suivis`);
P(`Détail JSON : ${JSON_OUT}`);
P(`\n## Constructions dynamiques (c) : ${DYN.length}`);
if (!COURT) for (const d of DYN) P(`- ${d.at} [${d.kind}] \`${d.expr}\`${d.regex ? ` → motif \`${d.regex}\`` : ''}`);
P(`\n## Fichiers sans lecteur dans le code (a) : ${fichiers.length}`);
for (const x of fichiers) P(`- ${x.fichier} (${x.octets} o, ${x.lignes} l.) : ${x.verdict} ; b=${x.preuve.b.map((h) => h.lignes[0] ?? h.f).join(', ') || '∅'} ; c=${x.preuve.c.join(', ') || '∅'} ; d=${x.preuve.d.join(', ') || '∅'}`);
P(`\n## Exports sans aucun usage hors de leur fichier : ${exportsMorts.length}`);
for (const x of exportsMorts) P(`- ${x.fichier}:${x.ligne} \`${x.export}\` (${x.lignesDecl} l., ${x.octetsDecl} o) : interne ${x.interne}${x.interdit ? ` (${x.interdit})` : ''}${x.docs.length ? ` ; doc ${x.docs.join(', ')}` : ''}`);
P(`\n## Exports utilisés seulement par des tests : ${exportsTestsSeuls.length}`);
for (const x of exportsTestsSeuls) P(`- ${x.fichier} \`${x.export}\` : interne ${x.interne} ; tests ${x.tests.join(', ')}${x.interdit ? ` (${x.interdit})` : ''}`);
P(`\n## Sélecteurs CSS sans usage hors CSS : ${cssUnused.length}`);
for (const x of cssUnused) P(`- ${x.lignes[0] ?? x.fichier} \`${x.selecteur}\`${x.prefixeDynamique.length ? ` (préfixe dynamique ${x.prefixeDynamique.join(', ')})` : ''}${x.tests.length ? ` ; tests ${x.tests.join(', ')}` : ''}`);
P(`\n## Jetons CSS jamais lus : ${cssVarsUnused.length}`);
for (const x of cssVarsUnused) P(`- ${x.lignes[0] ?? x.fichier} \`${x.jeton}\`${x.prefixeDynamique.length ? ` (préfixe dynamique ${x.prefixeDynamique.join(', ')})` : ''}`);
P(`\n## Clés de texte sans usage dans le code : ${clesOrphelines.length}`);
for (const x of clesOrphelines) P(`- ${x.fichier} \`${x.cle}\`${x.prefixeDynamique.length ? ` (préfixe dynamique ${x.prefixeDynamique.join(', ')})` : ''}${x.tests.length ? ` ; tests ${x.tests.length}` : ''}`);
P(`\n## Paramètres d'URL : ${PARAMS.size}`);
for (const [n, v] of out.params ? Object.entries(out.params) : []) P(`- ?${n} : code ${v.code.length} (${v.code.slice(0, 3).join(', ')}) ; tests ${Object.keys(v.tests).length} fichiers / ${Object.values(v.tests).reduce((s, c) => s + c, 0)} occurrences ; préréglages ${v.presets.join(', ') || '∅'} ; docs ${v.docs.length}`);
P(`\n## Pages techniques (fermeture exclusive)`);
for (const [p, v] of Object.entries(pages)) P(`- ${p} : ${v.fichiers.length} fichiers, ${v.octets} o, ${v.lignes} l. ; tests ${v.tests.length} ; scripts ${v.scripts.join(', ') || '∅'}${v.interdit ? ` (${v.interdit})` : ''}`);
P(`\n## Groupes (code retenu en vie, fermeture exclusive ; tests qui lisent ces fichiers)`);
for (const [n, g] of Object.entries(groupes)) P(`- ${n} : ${g.fichiers.length} fichiers, ${g.octets} o, ${g.lignes} l. (${g.fichiers.join(', ')}) ; tests ${g.tests.length} (garde-fous ${g.gardeFous.join(', ') || '∅'} ; lot 5d ${g.lot5d.join(', ') || '∅'})`);
P(`\n## Fichiers lus seulement par des tests : ${lusParTestsSeuls.length}`);
for (const x of lusParTestsSeuls) P(`- ${x.fichier} (${x.octets} o, ${x.lignes} l.) : ${x.tests.join(', ')}${x.interdit ? ` (${x.interdit})` : ''}`);
P(`\n## Scripts (N4)`);
for (const x of scriptsN4) P(`- ${x.fichier} (${x.octets} o, ${x.lignes} l.) : package.json ${x.packageJson ? 'oui' : 'non'} ; CI ${x.ci.length} ; docs ${x.docs.join(', ') || '∅'} ; bilans ${x.bilans.length} ; importé par ${x.importe.join(', ') || '∅'} ; autres ${x.autres.join(', ') || '∅'}${x.interdit ? ` (${x.interdit})` : ''}`);
P(`\n## Documentation de référence (N5)`);
for (const x of docsN5) P(`- ${x.fichier} (${x.octets} o, ${x.lignes} l.) : ${x.cites} fichiers cités, absents : ${x.absents.join(', ') || '∅'} ; cité par ${x.citePar.length} fichiers hors bilans, ${x.citeParBilans} bilans`);
P(`\n## Doublons (N6) : corps identiques ${doublonsCorps.length}, mêmes noms ${doublonsNoms.length}`);
for (const g of doublonsCorps.slice(0, COURT ? 15 : 200)) P(`- (${g.taille} car.) ${g.membres.join(' | ')}`);
for (const g of doublonsNoms.slice(0, COURT ? 15 : 200)) P(`- ${g.nom} : ${g.fichiers.join(', ')}`);
P(`\n## Dépendances de développement (N7)`);
for (const d of devDeps) P(`- ${d.paquet}@${d.version} : importé par ${d.importePar.length} fichiers (${d.importePar.slice(0, 3).join(', ')}) ; ligne de commande ${d.cli.join(', ') || '∅'}`);

// ---------------------------------------------------------------- synthèse : candidats dont toutes les preuves automatiques tiennent
// (le classement final, les anciens modes N2 et les pages N3 se lisent dans Docs/ref/nettoyage-audit.md : ils demandent une lecture humaine).
const n1Exports = exportsMorts.filter((x) => x.interne === 0 && !x.interdit && !x.tests.length);
const n1Jetons = cssVarsUnused.filter((x) => !x.prefixeDynamique.length);
const n1Css = cssUnused.filter((x) => !x.prefixeDynamique.length && !x.tests.length);
const n1Fichiers = fichiers.filter((x) => x.verdict.startsWith('candidat'));
const n4 = scriptsN4.filter((x) => !x.interdit && !x.packageJson && !x.ci.length && !x.docs.length && !x.importe.length && x.autres.every((a) => a === 'tests/selection.json'));
const n5 = docsN5.filter((x) => !x.citePar.length && !/^Docs\/ref\/(conventions|tests-)/.test(x.fichier));
const somme = (l, k = 'octets') => l.reduce((s, x) => s + (x[k] ?? 0), 0);
P(`\n## Synthèse automatique (preuves a à d tenues ; à confirmer par la lecture)`);
P(`- N1 exports morts : ${n1Exports.length} (${somme(n1Exports, 'lignesDecl')} l., ${somme(n1Exports, 'octetsDecl')} o) : ${n1Exports.map((x) => `${x.fichier}:${x.ligne} ${x.export}`).join(', ')}`);
P(`- N1 jetons CSS jamais lus : ${n1Jetons.length} : ${n1Jetons.map((x) => x.jeton).join(', ') || '∅'} ; sélecteurs CSS sans préfixe dynamique : ${n1Css.length}`);
P(`- N1 fichiers sans lecteur : ${n1Fichiers.map((x) => x.fichier).join(', ') || '∅'}`);
P(`- N4 scripts ni appelés ni documentés : ${n4.length} (${somme(n4, 'lignes')} l., ${somme(n4)} o) : ${n4.map((x) => x.fichier).join(', ')}`);
P(`- N5 documents de référence cités par aucun fichier (hors bilans) : ${n5.map((x) => x.fichier).join(', ') || '∅'}`);
P(`- N7 dépendances jamais importées ni appelées : ${devDeps.filter((d) => !d.importePar.length && !d.cli.length).map((d) => d.paquet).join(', ') || '∅'}`);
