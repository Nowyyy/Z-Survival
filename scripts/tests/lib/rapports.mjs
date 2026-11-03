// Lot 4e-A — Fonctions pures de l'audit des tests : lecture des rapports JSON (Vitest, Playwright), estimation statique des chargements
// de page, totaux par catégorie, classement des fichiers modifiés par les commits. Aucune lecture de fichier ici : les scripts
// (mesurer.mjs, resumer.mjs) lisent et écrivent ; ces fonctions ne font que calculer.

const ANSI = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, "g"); // codes de couleur du terminal
const rel = (path, root) => (root && path.startsWith(`${root}/`) ? path.slice(root.length + 1) : path).replaceAll('\\', '/');

// Rapport JSON de Vitest → une ligne par fichier : tests, réussis, échoués, ignorés, somme des durées des tests, durée du fichier.
export function vitestParFichier(report, root = '') {
  return (report?.testResults ?? []).map((f) => {
    const tests = f.assertionResults ?? [];
    const count = (s) => tests.filter((t) => t.status === s).length;
    return {
      fichier: rel(f.name, root),
      tests: tests.length,
      ok: count('passed'),
      ko: count('failed'),
      ignores: tests.length - count('passed') - count('failed'),
      msTests: Math.round(tests.reduce((s, t) => s + (t.duration ?? 0), 0)),
      msFichier: Math.round((f.endTime ?? 0) - (f.startTime ?? 0)),
    };
  }).sort((a, b) => a.fichier.localeCompare(b.fichier));
}

// Rapport JSON de Playwright → une ligne par exécution (test × projet) : fichier, ligne, titre complet, projet, statut, durée
// (toutes tentatives comprises), tentatives, premier message d'erreur.
export function playwrightTests(report) {
  const out = [];
  const walk = (suite, file, titles) => {
    const f = suite.file ?? file;
    const t = suite.title && suite.title !== f ? [...titles, suite.title] : titles;
    for (const spec of suite.specs ?? []) {
      for (const test of spec.tests ?? []) {
        const results = test.results ?? [];
        const err = results.flatMap((r) => r.errors ?? (r.error ? [r.error] : [])).find((e) => e?.message);
        out.push({
          fichier: `tests/e2e/${spec.file ?? f}`.replace('tests/e2e/tests/e2e/', 'tests/e2e/'),
          ligne: spec.line,
          titre: [...t, spec.title].join(' › '),
          projet: test.projectName,
          statut: test.status,
          ms: Math.round(results.reduce((s, r) => s + (r.duration ?? 0), 0)),
          tentatives: results.length,
          erreur: err ? String(err.message).replace(ANSI, '').split('\n').slice(0, 3).join(' ').slice(0, 300) : undefined,
        });
      }
    }
    for (const child of suite.suites ?? []) walk(child, f, t);
  };
  for (const s of report?.suites ?? []) walk(s, s.file, []);
  return out;
}

// Exécutions → une ligne par fichier et par projet : exécutions, réussies, échouées, instables (réussies au rejeu), ignorées, durée.
export function playwrightParFichier(tests) {
  const map = new Map();
  for (const t of tests) {
    const key = `${t.fichier}|${t.projet}`;
    const row = map.get(key) ?? { fichier: t.fichier, projet: t.projet, tests: 0, ok: 0, ko: 0, instables: 0, ignores: 0, ms: 0 };
    row.tests++;
    if (t.statut === 'expected') row.ok++;
    else if (t.statut === 'unexpected') row.ko++;
    else if (t.statut === 'flaky') row.instables++;
    else row.ignores++;
    row.ms += t.ms;
    map.set(key, row);
  }
  return [...map.values()].sort((a, b) => a.fichier.localeCompare(b.fichier) || a.projet.localeCompare(b.projet));
}

// Noms des fonctions locales d'un fichier de test qui appellent page.goto (ex. « open ») : leurs appels comptent comme des chargements.
export function chargeurs(source) {
  const names = new Set();
  const re = /(?:async\s+function\s+(\w+)\s*\(|const\s+(\w+)\s*=\s*async\s*\()/g;
  let m;
  const starts = [];
  while ((m = re.exec(source))) starts.push({ name: m[1] ?? m[2], index: m.index });
  for (let i = 0; i < starts.length; i++) {
    const end = i + 1 < starts.length ? starts[i + 1].index : source.length;
    const body = source.slice(starts[i].index, Math.min(end, starts[i].index + 1200));
    if (/\.goto\(/.test(body)) names.add(starts[i].name);
  }
  return [...names];
}

// Estimation statique des chargements de page par test : appels de page.goto et des chargeurs locaux dans le corps du test
// (des lignes [ligne, prochaine ligne de test ou de bloc[), plus ceux des beforeEach du fichier. Les boucles qui créent plusieurs tests
// à la même ligne donnent la même estimation à chaque exemplaire (une ligne = un test du rapport).
export function navigationsParLigne(source, lignes) {
  const loaders = chargeurs(source);
  const lines = source.split('\n');
  const callRe = new RegExp(`(?:\\.goto\\(|\\b(?:${loaders.length ? loaders.join('|') : '\\b__aucun__'})\\()`, 'g');
  const defRe = new RegExp(`(?:async\\s+function\\s+(?:${loaders.join('|') || '__aucun__'})\\b|const\\s+(?:${loaders.join('|') || '__aucun__'})\\s*=)`);
  const countIn = (from, to) => {
    let n = 0;
    for (let i = from; i < to && i < lines.length; i++) {
      if (defRe.test(lines[i])) continue;
      n += (lines[i].match(callRe) ?? []).length;
    }
    return n;
  };
  const bounds = [];
  lines.forEach((l, i) => { if (/^\s*(?:test|test\.describe)(?:\.\w+)?\(|^\s*for\s*\(/.test(l)) bounds.push(i); });
  let before = 0;
  lines.forEach((l, i) => {
    if (/test\.beforeEach\(/.test(l)) before += countIn(i, (bounds.find((b) => b > i) ?? i + 15));
  });
  const res = {};
  for (const ligne of new Set(lignes)) {
    const start = ligne - 1;
    const next = bounds.find((b) => b > start) ?? lines.length;
    res[ligne] = countIn(start, next) + before;
  }
  return res;
}

// Totaux par catégorie : classement = [{fichier, categorie, mobile?, groupes?: [{motif, categorie, projet?}]}] ;
// mesures = [{fichier, titre, ms, projet?}]. Un test prend la catégorie du premier groupe dont le motif (expression régulière sur le
// titre, sans casse) correspond et dont le projet (s'il est donné) est le sien ; sinon, pour une exécution du projet mobile, la catégorie
// « mobile » du fichier, sauf si le test est un garde-fou (G) ou garde un intérêt propre (P) ; sinon la catégorie du fichier.
export function categorieDe(classement, fichier, titre, projet) {
  const c = classement.find((x) => x.fichier === fichier);
  if (!c) return '?';
  let base = c.categorie;
  let parGroupe = false;
  for (const g of c.groupes ?? []) {
    if (g.projet && g.projet !== projet) continue;
    if (new RegExp(g.motif, 'i').test(titre)) {
      base = g.categorie;
      parGroupe = true;
      break;
    }
  }
  if (projet === 'mobile' && c.mobile && !['G', 'P', 'E', 'I'].includes(base) && !(parGroupe && base === c.mobile)) return c.mobile;
  return base;
}

export function totauxParCategorie(classement, mesures) {
  const out = {};
  for (const m of mesures) {
    const cat = categorieDe(classement, m.fichier, m.titre ?? '', m.projet);
    const row = out[cat] ?? (out[cat] = { tests: 0, ms: 0, fichiers: new Set() });
    row.tests++;
    row.ms += m.ms ?? 0;
    row.fichiers.add(m.fichier);
  }
  return Object.fromEntries(Object.entries(out).map(([k, v]) => [k, { tests: v.tests, ms: v.ms, fichiers: v.fichiers.size }]));
}

// Classement d'un fichier modifié par un commit : « doc » (documentation seule), un dossier de premier niveau, ou « autre ».
export function familleDuChemin(path) {
  if (/^Docs\//.test(path) || /\.md$/i.test(path)) return 'doc';
  const m = /^(js\/core|js\/game|js|data\/game|data\/i18n|data|css|tests\/unit|tests\/e2e|scripts|\.github|dev|vendor|fonts)\//.exec(path);
  if (m) return m[1];
  if (/\.html$/.test(path)) return 'pages';
  if (path === 'apercu.txt' || path === 'versions.json' || path === 'build-info.json') return 'data';
  return 'racine';
}

// Pour une liste de commits [{hash, fichiers: [...]}] : familles touchées et nature : « doc » (documentation seule), « large » (racine du
// dépôt — package.json, configurations —, .github, vendor, ou au moins 3 familles de code hors tests), sinon « cible ».
export function natureDesCommits(commits) {
  return commits.map((c) => {
    const familles = [...new Set(c.fichiers.map(familleDuChemin))].sort();
    const code = familles.filter((f) => f !== 'doc');
    const source = code.filter((f) => !f.startsWith('tests/'));
    let nature = 'cible';
    if (!code.length) nature = 'doc';
    else if (source.some((f) => ['racine', 'vendor', '.github'].includes(f)) || source.length >= 3) nature = 'large';
    return { hash: c.hash, sujet: c.sujet, fichiers: c.fichiers.length, familles, nature };
  });
}
