// Lot 5m-A — Audit de la documentation (Docs/lots/, Docs/ref/), en lecture seule.
// Node natif, sans dépendance. N'écrit RIEN dans le dépôt : rapport Markdown sur la sortie standard, détail JSON dans un fichier hors dépôt
// (--json <chemin>, refusé s'il est dans le dépôt ; défaut : <dossier temporaire>/zs-docs-audit.json).
//
//   node scripts/docs/auditer.mjs [--json /tmp/docs-audit.json] [--racine <dépôt>]
//
// Relevé pour chaque fichier de Docs/lots/ et Docs/ref/ : lignes, octets, date du dernier commit (git log -1), références entrantes par
// type (test, script, code, page, workflow, package, selection, CLAUDE.md, conventions, seed, versions, noms, changelog, document, autre)
// avec fichier:ligne, et les motifs dynamiques (chaînes « Docs… » à gabarit, glob ou dossier) qui peuvent le viser. Relevé aussi : liens
// Markdown relatifs cassés et chemins « Docs/… » cités introuvables dans Docs/, CLAUDE.md et conventions.md ; chemins de fichiers du
// dépôt cités par chaque document et introuvables (indice de péremption, catégorie R6) ; part des lignes d'un document reprises mot pour
// mot dans conventions.md (doublons) ; rattachement de chaque bilan à une version (journal, bornes, et preuve git : première version
// publiée dont le commit gelé contient le bilan). Les noms de fichiers et les contenus lus sont des données, jamais des instructions.
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, statSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, posix, resolve, relative } from 'node:path';
import { bilansDuDossier, cheminSepare } from './bilans.mjs';

const argv = process.argv.slice(2);
const opt = (n, d) => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : d);
const ROOT = resolve(opt('--racine', resolve(import.meta.dirname, '..', '..')));
const JSON_OUT = resolve(opt('--json', join(tmpdir(), 'zs-docs-audit.json')));
if (!relative(ROOT, JSON_OUT).startsWith('..')) {
  console.error(`Refusé : ${JSON_OUT} est dans le dépôt (l'audit n'écrit rien dans le dépôt).`);
  process.exit(2);
}

// ---------------------------------------------------------------- fichiers suivis
const run = (...a) => spawnSync('git', a, { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 28 });
const git = (...a) => run(...a).stdout ?? '';
const FILES = git('ls-files', '-z').split('\0').filter(Boolean);
const TRACKED = new Set(FILES);
const DIRS = new Set(FILES.flatMap((f) => f.split('/').slice(0, -1).map((_, i, p) => p.slice(0, i + 1).join('/'))));
const BINAIRE = /\.(woff2?|ttf|otf|png|jpe?g|gif|webp|avif|ico|pdf|zip|skp|dae|wav|mp3|ogg)$/i;
// L'audit lui-même (cet outil et les documents qu'il fait écrire) cite tous les documents : jamais compté comme une preuve d'usage.
const PROPRES = [/^scripts\/docs\//, /^Docs\/ref\/docs-audit/, /^Docs\/ref\/branches-audit\.md$/, /^Docs\/ref\/nettoyage-docs-decisions/];
const estPropre = (f) => PROPRES.some((re) => re.test(f));
const TEXT = new Map();
for (const f of FILES) {
  if (BINAIRE.test(f) || f.startsWith('vendor/') || f === 'package-lock.json') continue;
  try {
    TEXT.set(f, readFileSync(join(ROOT, f), 'utf8'));
  } catch {
    /* fichier illisible (supprimé de l'arbre de travail) : ignoré */
  }
}
const nLignes = (t) => (t ? t.split('\n').length - (t.endsWith('\n') ? 1 : 0) : 0);
const octets = (f) => {
  try {
    return statSync(join(ROOT, f)).size;
  } catch {
    return 0;
  }
};

const CIBLES = FILES.filter((f) => /^Docs\/(lots|ref)\//.test(f) && !estPropre(f)).sort();
const PAR_NOM = new Map();
for (const c of CIBLES) {
  const nom = posix.basename(c);
  PAR_NOM.set(nom, [...(PAR_NOM.get(nom) ?? []), c]);
}
// Un nom de fichier porté aussi par un fichier hors cibles est ambigu : ses mentions nues comptent quand même (prudence).
const AMBIGUS = new Set(FILES.filter((f) => !CIBLES.includes(f) && PAR_NOM.has(posix.basename(f))).map((f) => posix.basename(f)));
// Lot 5m-B : bilans regroupés par version (Docs/lots/versions/v0.N.md, scripts/docs/bilans.mjs). Leur ancien chemin (Docs/lots/lot-N.md)
// et leur ancien nom de fichier se résolvent vers le fichier groupé ; cités hors des bilans, ils sont listés (« anciens chemins »).
const BILANS = (() => {
  try {
    return [...bilansDuDossier(ROOT).values()];
  } catch (e) {
    console.error(`Bilans illisibles : ${e.message}`);
    return [];
  }
})();
const ALIAS = new Map(BILANS.filter((b) => b.groupe).map((b) => [cheminSepare(b.lot), b.groupe]));
for (const [ancien, g] of ALIAS) if (!PAR_NOM.has(posix.basename(ancien))) PAR_NOM.set(posix.basename(ancien), [g]);
const anciensChemins = [];

// ---------------------------------------------------------------- type d'un fichier qui référence
function typeDe(f) {
  if (f === 'tests/selection.json' || f === 'scripts/tests/classement.json') return 'selection';
  if (f.startsWith('tests/')) return 'test';
  if (f.startsWith('scripts/')) return 'script';
  if (f.startsWith('js/') || f.startsWith('css/')) return 'code';
  if (f.endsWith('.html')) return 'page';
  if (f.startsWith('.github/')) return 'workflow';
  if (f === 'package.json') return 'package';
  if (f === 'CLAUDE.md') return 'claude';
  if (f === 'Docs/ref/conventions.md') return 'conventions';
  if (f === 'Docs/seed.md') return 'seed';
  if (f === 'versions.json') return 'versions';
  if (f === 'noms-versions-et-lots.txt') return 'noms';
  if (f === 'data/changelog.json') return 'changelog';
  if (f.startsWith('Docs/lots/')) return 'bilan';
  if (f.startsWith('Docs/')) return 'document';
  return 'autre';
}
const TYPES = ['test', 'script', 'code', 'page', 'workflow', 'package', 'selection', 'claude', 'conventions', 'seed', 'versions', 'noms', 'changelog', 'bilan', 'document', 'autre'];
const EXECUTABLE = new Set(['test', 'script', 'code', 'page', 'workflow', 'package', 'selection']);

// ---------------------------------------------------------------- références par chemin ou par nom
const TOKEN = /[A-Za-z0-9_.\-/]*[A-Za-z0-9_-]\.md(?![A-Za-z0-9_-])/g;
const refs = new Map(CIBLES.map((c) => [c, []]));
const citesDocsIntrouvables = [];
const cheminsIntrouvables = new Map(); // document → [chemins du dépôt cités et absents]
const ROOTS_CODE = /^(js|css|data|scripts|tests|Docs|vendor|fonts|dev|\.github)\//;
const TOKEN_FICHIER = /(?<![A-Za-z0-9_.\-/])(?:js|css|data|scripts|tests|Docs|fonts|dev|\.github)\/[A-Za-z0-9_.\-/]*[A-Za-z0-9_-]\.(?:m?js|json|css|html|md|py|txt|yml)(?![A-Za-z0-9_-])/g;

function resoudre(src, token) {
  const net = token.replace(/^\.\//, '');
  const candidats = [net, posix.normalize(posix.join(posix.dirname(src), token))];
  for (const c of candidats) if (TRACKED.has(c) || DIRS.has(c)) return c;
  return null;
}

for (const [src, texte] of TEXT) {
  if (estPropre(src)) continue;
  const lignes = texte.split('\n');
  for (let i = 0; i < lignes.length; i += 1) {
    const ligne = lignes[i];
    for (const m of ligne.matchAll(TOKEN)) {
      const token = m[0].replace(/^[.]+(?=[A-Za-z])/, '');
      const nom = posix.basename(token);
      const vise = PAR_NOM.get(nom);
      const lieu = `${src}:${i + 1}`;
      if (!vise) {
        if (token.startsWith('Docs/') && (src.startsWith('Docs/') || src === 'CLAUDE.md') && !resoudre(src, token)) citesDocsIntrouvables.push({ lieu, chemin: token });
        continue;
      }
      if (!token.includes('/')) {
        const ancien = ALIAS.has(`Docs/lots/${nom}`) && vise.length === 1 && vise[0] === ALIAS.get(`Docs/lots/${nom}`);
        for (const c of vise) if (c !== src) refs.get(c).push({ lieu, de: src, type: typeDe(src), sorte: ancien ? 'ancien nom (regroupé)' : AMBIGUS.has(nom) ? 'nom (ambigu)' : 'nom' });
        if (ancien && typeDe(src) !== 'bilan') anciensChemins.push({ lieu, chemin: token, groupe: vise[0], annote: /\*\(Lot 5m/.test(ligne) });
        continue;
      }
      const r = resoudre(src, token) ?? resoudre(src, token.replace(/^(\.\.\/)+/, ''));
      const alias = r ? null : [token.replace(/^\.\//, ''), posix.normalize(posix.join(posix.dirname(src), token))].map((x) => ALIAS.get(x)).find(Boolean);
      if (alias) {
        if (alias !== src) refs.get(alias).push({ lieu, de: src, type: typeDe(src), sorte: 'ancien chemin (regroupé)' });
        if (typeDe(src) !== 'bilan') anciensChemins.push({ lieu, chemin: token, groupe: alias, annote: /\*\(Lot 5m/.test(ligne) });
        continue;
      }
      if (r && refs.has(r)) {
        if (r !== src) refs.get(r).push({ lieu, de: src, type: typeDe(src), sorte: 'chemin' });
      } else if (!r) {
        // Chemin partiel ou ancien qui finit par le nom d'une cible : compté (prudence), et signalé s'il vise Docs/.
        for (const c of vise) if (c !== src && (c.endsWith(`/${token.replace(/^(\.\.\/)+/, '')}`) || token.endsWith(c))) refs.get(c).push({ lieu, de: src, type: typeDe(src), sorte: 'chemin partiel' });
        if (token.startsWith('Docs/') && (src.startsWith('Docs/') || src === 'CLAUDE.md')) citesDocsIntrouvables.push({ lieu, chemin: token });
      }
    }
    if (CIBLES.includes(src)) {
      for (const m of ligne.matchAll(TOKEN_FICHIER)) {
        const p = m[0];
        if (!ROOTS_CODE.test(p) || TRACKED.has(p) || DIRS.has(p)) continue;
        cheminsIntrouvables.set(src, [...(cheminsIntrouvables.get(src) ?? []), p]);
      }
    }
  }
}

// ---------------------------------------------------------------- liens Markdown relatifs
const liensCasses = [];
const SOURCES_LIENS = FILES.filter((f) => (f.startsWith('Docs/') || f === 'CLAUDE.md') && f.endsWith('.md'));
let nLiens = 0;
for (const f of SOURCES_LIENS) {
  const lignes = (TEXT.get(f) ?? '').split('\n');
  lignes.forEach((ligne, i) => {
    for (const m of ligne.matchAll(/\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
      const cible = m[1];
      if (/^(https?:|mailto:|#)/.test(cible)) continue;
      nLiens += 1;
      const chemin = posix.normalize(posix.join(posix.dirname(f), decodeURI(cible.split('#')[0])));
      if (!existsSync(join(ROOT, chemin))) liensCasses.push({ lieu: `${f}:${i + 1}`, lien: cible });
    }
  });
}

// ---------------------------------------------------------------- motifs dynamiques
// Chaînes contenant « Docs » dans le code, les tests, les scripts, les pages, les workflows et la configuration : gabarit (${…}), glob (*),
// dossier (sans extension) ou concaténation ('…/' + x). Chaque motif devient une expression ; les cibles qu'il peut viser sont listées.
// Les motifs connus pour ne rien lire (listes d'exclusion) sont marqués « sans lecture » avec la raison ; tout autre motif compte comme lecture.
// contient: '' : toutes les lignes du fichier (outil entier).
const SANS_LECTURE = [
  { de: 'scripts/site/e2e-site.mjs', contient: 'const SKIP', raison: 'dossiers ignorés par le serveur de test (exclusion)' },
  { de: 'tests/unit/tests-selection.test.js', contient: 'const SKIP', raison: 'dossiers ignorés par la recherche de fichiers (exclusion)' },
  { de: 'tests/unit/build.test.js', contient: "for (const bad of", raison: 'chemins interdits dans le build (absence vérifiée)' },
  { de: 'tests/selection.json', contient: '"exclus"', raison: 'classement « documentation seule » (aucune lecture de contenu)' },
  { de: 'tests/selection.json', contient: '"inclus"', raison: 'classement « documentation seule » (aucune lecture de contenu)' },
  { de: 'tests/unit/tests-selection.test.js', contient: 'documentation:', raison: 'table de sélection d\'essai (données)' },
  { de: 'tests/unit/tests-selection.test.js', contient: 'correspond(', raison: 'appel d\'une fonction pure sur une chaîne' },
  { de: 'tests/unit/tests-selection.test.js', contient: 'selectionner({', raison: 'appel d\'une fonction pure sur des chaînes' },
  { de: 'tests/unit/tests-audit.test.js', contient: 'familleDuChemin', raison: 'appel d\'une fonction pure sur une chaîne' },
  { de: 'tests/unit/tests-selection.test.js', contient: "it('documentation seule", raison: 'titre d\'un test' },
  { de: 'tests/unit/persos-jeu.test.js', contient: "!f.startsWith('Docs/')", raison: 'exclusion d\'une liste de fichiers modifiés' },
  { de: '.github/workflows/tests.yml', contient: 'paths-ignore', raison: 'déclencheur : la documentation seule ne lance rien' },
  { de: 'tests/selection.json', contient: '"sources"', raison: 'motif de zone : reste valable sans ce fichier (classement, aucune lecture)' },
  { de: 'scripts/tests/lib/selection.mjs', contient: 'inclus:', raison: 'classement par défaut « documentation seule »' },
  { de: 'scripts/nettoyage/inventaire-ancien.mjs', contient: "return 'h'", raison: 'classement « historique » par préfixe' },
  { de: 'scripts/nettoyage/auditer.mjs', contient: '', raison: 'outil d\'audit du lot 5c : inventorie ou exclut les documents, ne dépend d\'aucun' },
];
const motifs = [];
const globVersRe = (g) => new RegExp(`^${g.split(/\*\*\/?/).map((p) => p.replace(/[.+^$()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*').replace(/\?/g, '[^/]')).join('.*')}$`);
for (const [src, texte] of TEXT) {
  if (estPropre(src) || !EXECUTABLE.has(typeDe(src))) continue;
  texte.split('\n').forEach((ligne, i) => {
    for (const m of ligne.matchAll(/(['"`])((?:(?!\1).)*?Docs(?:(?!\1).)*?)\1/g)) {
      for (const brut of m[2].split(/\s+/).filter((x) => /(^|\/)Docs(\/|$)/.test(x))) {
        const morceau = brut.replace(/[,;)]+$/, '');
        let re = null;
        let forme = null;
        if (morceau.includes('${')) {
          forme = 'gabarit';
          re = new RegExp(`^${morceau.split(/\$\{[^}]*\}/).map((p) => p.replace(/[.*+?^$()|[\]\\{}]/g, '\\$&')).join('.*')}`);
        } else if (/[*?]/.test(morceau)) {
          forme = 'glob';
          re = globVersRe(morceau);
        } else if (!/\.[A-Za-z0-9]+$/.test(morceau) || morceau.endsWith('/')) {
          forme = 'dossier';
          const base = morceau.replace(/\/$/, '');
          re = new RegExp(`^${base.replace(/[.*+?^$()|[\]\\{}]/g, '\\$&')}(/|$)`);
        } else if (new RegExp(`${m[1]}\\s*\\+`).test(ligne.slice(m.index + m[0].length - 1, m.index + m[0].length + 3))) {
          forme = 'concaténation';
          re = new RegExp(`^${morceau.replace(/[.*+?^$()|[\]\\{}]/g, '\\$&')}`);
        }
        if (!re) continue;
        const exclusion = SANS_LECTURE.find((r) => r.de === src && ligne.includes(r.contient));
        const vises = CIBLES.filter((c) => re.test(c));
        if (vises.length === 0) continue;
        // Motif qui couvre tout un dossier (Docs/lots, Docs/ref ou Docs) : lecture du dossier entier, listée à part (test à adapter ou sans effet
        // d'un retrait), jamais une preuve d'usage d'un document précis.
        const entier = ['Docs/lots/', 'Docs/ref/', 'Docs/'].some((d) => { const tous = CIBLES.filter((c) => c.startsWith(d)); return tous.length > 0 && tous.every((c) => vises.includes(c)) && vises.every((c) => c.startsWith(d)); });
        motifs.push({ lieu: `${src}:${i + 1}`, de: src, type: typeDe(src), motif: morceau, forme, lecture: !exclusion, entier, raison: exclusion?.raison ?? '', vises });
      }
    }
  });
}

// ---------------------------------------------------------------- rattachement des bilans aux versions
const changelog = JSON.parse(TEXT.get('data/changelog.json') ?? '{"lots":[]}');
const versions = JSON.parse(TEXT.get('versions.json') ?? '{"versions":[]}').versions ?? [];
const BORNES = { 'lot-1': 'v0.1', 'lot-1d': 'v0.2', 'lot-2c': 'v0.3', 'lot-3e': 'v0.4', 'lot-4b': 'v0.5' };
const parJournal = new Map();
{
  let courante = 'v0.1';
  const ordre = ['v0.1', 'v0.2', 'v0.3', 'v0.4', 'v0.5', 'v0.6'];
  for (const e of changelog.lots ?? []) {
    if (e.version) {
      parJournal.set(e.name, { version: e.version, regle: 'champ « version »' });
      continue;
    }
    parJournal.set(e.name, { version: courante, regle: BORNES[e.name] ? `borne de ${courante}` : `ordre du journal (avant la borne de ${courante})` });
    if (BORNES[e.name]) courante = ordre[ordre.indexOf(BORNES[e.name]) + 1];
  }
}
// Bilans séparés et regroupés ; la preuve git cherche l'ancien chemin séparé dans le commit gelé de chaque version.
const parGit = new Map();
for (const b of BILANS) {
  const v = versions.find((x) => run('cat-file', '-e', `${x.ref}:${cheminSepare(b.lot)}`).status === 0);
  parGit.set(b.lot, v ? v.id : null);
}
const rattachement = BILANS.map((b) => {
  const lot = b.lot;
  const c = b.fichier;
  const j = parJournal.get(lot) ?? { version: null, regle: 'absent du journal' };
  const g = parGit.get(lot);
  const doutes = [];
  if (!parJournal.has(lot)) doutes.push('absent de data/changelog.json');
  if (g && j.version && g !== j.version) doutes.push(`journal : ${j.version} ; présent pour la première fois dans le commit gelé de ${g}`);
  if (!g && j.version && versions.some((v) => v.id === j.version)) doutes.push(`absent du commit gelé de ${j.version} (publié après, par main)`);
  if (j.regle.startsWith('ordre') && j.version === 'v0.6') doutes.push('après la borne de V0.5, sans champ « version » : V0.6 par déduction');
  return { fichier: c, lot, groupe: b.groupe, journal: j.version, regle: j.regle, git: g, doutes };
});

// ---------------------------------------------------------------- catégories
const PUBLIEES = new Set(versions.map((v) => v.id));
// Version en cours de développement (lot 5q : v0.8 ; avant : v0.7, publiée au lot 5p) : ses bilans restent séparés (catégorie « V0.8 »).
const EN_COURS = 'v0.8';
const CAT_EN_COURS = EN_COURS.toUpperCase();
const R_REGLES = [
  ['R1', /^Docs\/ref\/fusion-[^/]+\.md$/, 'manifeste de fusion terminé'],
  ['R2', /^Docs\/ref\/(nettoyage-|tests-audit|tests-decisions|claude-md-|tests-chargement)[^/]*\.md$/, 'audit, plan ou décisions terminés'],
  ['R3', /^Docs\/ref\/[^/]*-actuel(le)?s?\.md$/, 'état des lieux d\'avant refonte'],
  ['R4', /^Docs\/ref\/(passation-[^/]*|[^/]*-a-integrer|integration-[^/]*)\.md$/, 'passation ou choix d\'atelier'],
  ['R5', /^Docs\/ref\/(atelier-[^/]*|ecarts-[^/]*|visite[^/]*|affinage)\.md$/, 'page technique (lot 13)'],
];
function categorieDe(c) {
  if (!c.endsWith('.md')) return 'autre';
  if (c.startsWith('Docs/lots/versions/')) return 'groupe';
  if (c.startsWith('Docs/lots/')) {
    const r = rattachement.find((x) => x.fichier === c);
    if (r && r.journal && r.journal !== EN_COURS && PUBLIEES.has(r.journal)) return 'L1';
    return CAT_EN_COURS;
  }
  for (const [k, re] of R_REGLES) if (re.test(c)) return k;
  return 'autre';
}

// Lignes d'un document reprises mot pour mot dans conventions.md (au moins 60 caractères, hors titres) : indice de doublon.
const conv = new Set((TEXT.get('Docs/ref/conventions.md') ?? '').split('\n').map((l) => l.trim()).filter((l) => l.length >= 60));
const inventaire = CIBLES.map((c) => {
  const t = TEXT.get(c) ?? '';
  const longues = t.split('\n').map((l) => l.trim()).filter((l) => l.length >= 60 && !l.startsWith('#'));
  const r = refs.get(c);
  const parType = Object.fromEntries(TYPES.map((k) => [k, r.filter((x) => x.type === k).length]).filter(([, n]) => n > 0));
  const lus = motifs.filter((m) => m.lecture && !m.entier && m.vises.includes(c));
  return {
    fichier: c,
    lignes: nLignes(t),
    octets: octets(c),
    date: git('log', '-1', '--format=%cs', '--', c).trim(),
    categorie: categorieDe(c),
    references: r,
    parType,
    motifs: lus.map((m) => ({ lieu: m.lieu, motif: m.motif, forme: m.forme })),
    introuvables: [...new Set(cheminsIntrouvables.get(c) ?? [])],
    cites: [...new Set((t.match(TOKEN_FICHIER) ?? []))].length,
    doublonConventions: longues.length ? Math.round((100 * longues.filter((l) => conv.has(l)).length) / longues.length) : 0,
  };
});

// Statut : « candidat » seulement sans aucune référence d'un type exécutable, de CLAUDE.md, conventions, seed, versions, noms, changelog,
// ni d'un document qui reste, ni lecture nominative par motif ; sinon « douteux » avec les raisons. Les bilans (L1) sont regroupés, pas
// retirés : les chemins de CLAUDE.md, conventions.md et des documents qui restent se corrigent (listés) ; seule une lecture par un test, un
// script, le seed ou un motif nominatif les rend « douteux ». Pour R1 à R5, deux formes de « douteux » sont distinguées pour la décision :
// cité seulement par l'historique (bilans, journal), ou seulement par l'historique et par d'autres candidats R (levé si eux aussi partent).
// Les références de type « donnée » (chaîne passée à une fonction pure, titre de test) sont listées sans compter comme une lecture.
const REF_DONNEE = [
  { de: 'tests/unit/tests-audit.test.js', contient: 'familleDuChemin(', raison: 'chaîne passée à une fonction pure (famille d\'un chemin)' },
  { de: 'tests/unit/tests-selection.test.js', contient: 'selectionner({', raison: 'chaîne passée à une fonction pure (sélection)' },
  { de: 'tests/unit/atelier-sons-hygiene.test.js', contient: "it('journal des versions", raison: 'titre d\'un test qui lit data/changelog.json' },
];
const R_CAT = new Set(['R1', 'R2', 'R3', 'R4', 'R5']);
const PAR_FICHIER = new Map(inventaire.map((e) => [e.fichier, e]));
for (const e of inventaire) {
  e.raisons = [];
  e.dures = [];
  e.historique = [];
  e.documents = [];
  for (const x of e.references) {
    const ligne = (TEXT.get(x.de) ?? '').split('\n')[Number(x.lieu.split(':').at(-1)) - 1] ?? '';
    const donnee = REF_DONNEE.find((r) => r.de === x.de && ligne.includes(r.contient));
    if (donnee) x.donnee = donnee.raison;
    else if (x.type === 'bilan' || x.type === 'changelog') e.historique.push(x);
    else if (x.type === 'document') e.documents.push(x);
    else e.dures.push(x);
  }
}
// Bilans (L1) : regroupés, jamais retirés ; « douteux » si un test, un script, le seed ou un fichier hors Docs/ les lit nommément.
for (const e of inventaire.filter((x) => x.categorie === 'L1')) {
  const dures = e.dures.filter((x) => !['claude', 'conventions'].includes(x.type));
  e.raisons = [...dures.map((x) => `${x.type} ${x.lieu}`), ...e.motifs.map((m) => `motif ${m.lieu} (${m.motif})`)];
  e.corrections = [...e.dures.filter((x) => ['claude', 'conventions'].includes(x.type)), ...e.documents].map((x) => x.lieu);
  e.statut = e.raisons.length ? 'douteux' : 'candidat';
}
// R1 à R5 : point fixe. S = documents sans référence « dure » (exécutable, CLAUDE.md, conventions, seed, versions, noms, autre, motif
// nominatif) ; on en retire tout document cité par un document qui n'est pas dans S. Dans S : « candidat » (aucune citation par l'historique)
// ou « douteux (historique seulement) » (cité par des bilans ou le journal : regroupable sans perte, retrait seulement sur décision).
const S = new Set(inventaire.filter((e) => R_CAT.has(e.categorie) && e.dures.length === 0 && e.motifs.length === 0).map((e) => e.fichier));
for (let change = true; change;) {
  change = false;
  for (const f of [...S]) {
    if (PAR_FICHIER.get(f).documents.some((x) => !S.has(x.de))) {
      S.delete(f);
      change = true;
    }
  }
}
for (const e of inventaire.filter((x) => R_CAT.has(x.categorie))) {
  const restants = e.documents.filter((x) => !S.has(x.de));
  e.raisons = [...e.dures.map((x) => `${x.type} ${x.lieu}`), ...e.motifs.map((m) => `motif ${m.lieu} (${m.motif})`), ...restants.map((x) => `document qui reste ${x.lieu}`)];
  if (S.has(e.fichier)) e.statut = e.historique.length ? 'douteux (historique seulement)' : 'candidat';
  else e.statut = e.dures.length || e.motifs.length ? 'douteux' : 'douteux (document qui reste)';
  if (e.historique.length) e.raisons.push(`historique : ${[...new Set(e.historique.map((x) => x.de.replace('Docs/lots/', '')))].join(', ')}`);
}
for (const e of inventaire.filter((x) => ['autre', CAT_EN_COURS, 'groupe'].includes(x.categorie))) e.statut = 'garder';

// ---------------------------------------------------------------- rapport
const out = [];
const p = (s = '') => out.push(s);
const fmt = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
const total = (xs) => ({ n: xs.length, lignes: xs.reduce((s, x) => s + x.lignes, 0), octets: xs.reduce((s, x) => s + x.octets, 0) });
p('# Audit de la documentation — sortie de scripts/docs/auditer.mjs');
p();
p(`Racine : ${ROOT} ; commit ${git('rev-parse', '--short', 'HEAD').trim()} ; ${CIBLES.length} documents (Docs/lots/ et Docs/ref/).`);
p();
p('## Catégories');
p();
p('| Catégorie | Documents | Lignes | Octets | Candidats | Douteux | Douteux (historique seulement) | Références entrantes |');
p('|---|---|---|---|---|---|---|---|');
for (const k of ['L1', 'R1', 'R2', 'R3', 'R4', 'R5', CAT_EN_COURS, 'groupe', 'autre']) {
  const xs = inventaire.filter((e) => e.categorie === k);
  const t = total(xs);
  p(`| ${k} | ${t.n} | ${fmt(t.lignes)} | ${fmt(t.octets)} | ${xs.filter((e) => e.statut === 'candidat').length} | ${xs.filter((e) => e.statut === 'douteux' || e.statut === 'douteux (document qui reste)').length} | ${xs.filter((e) => e.statut === 'douteux (historique seulement)').length} | ${xs.reduce((s, e) => s + e.references.length, 0)} |`);
}
p();
p('## Inventaire');
p();
p('| Document | Cat. | Lignes | Octets | Dernier commit | Références (par type) | Motifs | Statut |');
p('|---|---|---|---|---|---|---|---|');
for (const e of inventaire) {
  const types = Object.entries(e.parType).map(([k, n]) => `${k} ${n}`).join(', ') || '—';
  p(`| \`${e.fichier}\` | ${e.categorie} | ${e.lignes} | ${fmt(e.octets)} | ${e.date} | ${types} | ${e.motifs.length || '—'} | ${e.statut} |`);
}
p();
p('## Raisons des « douteux » et chemins à corriger');
p();
for (const e of inventaire.filter((x) => x.statut.startsWith('douteux'))) p(`- \`${e.fichier}\` (${e.statut}) : ${e.raisons.join(' ; ')}`);
p();
p('Bilans (L1) : citations à corriger en partie B si le bilan est regroupé (CLAUDE.md, conventions.md, documents qui restent) :');
p();
for (const e of inventaire.filter((x) => x.categorie === 'L1' && x.corrections.length)) p(`- \`${e.fichier}\` : ${e.corrections.join(' ; ')}`);
p();
p('## Références entrantes hors bilans et journal (fichier:ligne)');
p();
for (const e of inventaire) {
  const r = e.references.filter((x) => x.type !== 'bilan' && x.type !== 'changelog');
  if (r.length) p(`- \`${e.fichier}\` : ${r.map((x) => `${x.lieu} (${x.type}, ${x.sorte}${x.donnee ? ` ; donnée : ${x.donnee}` : ''})`).join(' ; ')}`);
}
p();
p('## Citations par les bilans et le journal (nombre)');
p();
for (const e of inventaire) {
  const r = e.references.filter((x) => x.type === 'bilan' || x.type === 'changelog');
  if (r.length) p(`- \`${e.fichier}\` : ${r.length} (${[...new Set(r.map((x) => x.de.replace('Docs/lots/', '')))].join(', ')})`);
}
p();
p('## Motifs dynamiques');
p();
p('| Lieu | Motif | Forme | Lecture | Portée | Documents visés |');
p('|---|---|---|---|---|---|');
for (const m of motifs) p(`| \`${m.lieu}\` | \`${m.motif}\` | ${m.forme} | ${m.lecture ? 'oui' : `non (${m.raison})`} | ${m.entier ? 'dossier entier' : 'nominative'} | ${m.vises.length} |`);
p();
p('## Rattachement des bilans aux versions');
p();
p('| Bilan | Fichier | Journal | Règle | Preuve git (1re version gelée qui le contient) | Doutes |');
p('|---|---|---|---|---|---|');
for (const r of rattachement) p(`| ${r.lot} | \`${r.fichier}\` | ${r.journal ?? '—'} | ${r.regle} | ${r.git ?? '—'} | ${r.doutes.join(' ; ') || '—'} |`);
p();
p('## Liens et chemins de documents cassés');
p();
p(`- Liens Markdown relatifs dans Docs/ et CLAUDE.md : ${nLiens} relevé(s), ${liensCasses.length} cassé(s).`);
for (const l of liensCasses) p(`  - \`${l.lieu}\` → \`${l.lien}\``);
p(`- Chemins \`Docs/…\` cités introuvables dans Docs/ et CLAUDE.md : ${citesDocsIntrouvables.length}.`);
for (const l of citesDocsIntrouvables) p(`  - \`${l.lieu}\` → \`${l.chemin}\``);
p(`- Anciens chemins de bilans regroupés encore cités hors des bilans : ${anciensChemins.length} (dont annotés *(Lot 5m : …)* : ${anciensChemins.filter((x) => x.annote).length}).`);
for (const l of anciensChemins) p(`  - \`${l.lieu}\` → \`${l.chemin}\` (dans \`${l.groupe}\`)${l.annote ? ' — annoté' : ''}`);
p();
p('## Indices de péremption (R6) et de doublon');
p();
p('| Document | Cat. | Chemins du dépôt cités | Introuvables | Lignes reprises dans conventions.md |');
p('|---|---|---|---|---|');
for (const e of inventaire.filter((x) => x.fichier.startsWith('Docs/ref/') && x.fichier !== 'Docs/ref/conventions.md')) p(`| \`${e.fichier}\` | ${e.categorie} | ${e.cites} | ${e.introuvables.length}${e.introuvables.length ? ` (${e.introuvables.slice(0, 6).map((x) => `\`${x}\``).join(', ')}${e.introuvables.length > 6 ? ', …' : ''})` : ''} | ${e.doublonConventions} % |`);
p();
process.stdout.write(`${out.join('\n')}\n`);
writeFileSync(JSON_OUT, `${JSON.stringify({ racine: ROOT, inventaire, motifs, rattachement, liensCasses, citesDocsIntrouvables, anciensChemins }, null, 1)}\n`);
console.error(`Détail JSON : ${JSON_OUT}`);
