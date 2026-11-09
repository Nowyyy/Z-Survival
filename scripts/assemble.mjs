// Assemble le site publié dans _site/ (lot 4c : publication par versions ; lot 5g : nouvelle organisation des adresses).
//  - index.html (racine) = page « en construction », autonome (style en ligne, aucune ressource, noindex, sans lien) ; rien d'autre à la racine que les dossiers ci-dessous ;
//  - Recette/ = build de main (channel « release ») + build-info.json + versions.json + site-info.json (scripts/site/site-info.mjs, lu par l'accueil) ;
//  - dev/ = build de dev (channel « dev ») dont index.html est remplacé par une redirection vers ../Recette/ ; sans build de dev (absent, ou sans index.html
//    ni jeu.html) : dev/index.html = « Aucun build de développement pour l'instant » ;
//  - next/index.html = redirection vers ../dev/jeu.html (vers ../dev/ sans build de dev) ; lots/index.html = redirection vers ../Recette/ (aucun lots/lot-*) ;
//  - v0.N/ = dossiers de la branche archive, copiés tels quels s'ils existent (sinon la version est publiée « indisponible »).
// Lot 5h : noms-versions-et-lots.txt (scripts/site/noms.mjs) du build de dev, sinon de main, l'emporte sur les textes de versions.json et du journal
// dans site-info.json (jamais dans Recette/versions.json) ; une ligne fautive ou un identifiant inconnu est ignoré et signalé, sans jamais faire échouer.
// Lot 5h : 404.html à la racine (page autonome, servie par GitHub Pages pour toute adresse inconnue) : son script en ligne (corrigerCasse de
// scripts/site/casse.mjs) renvoie /recette/… (toute casse sauf « Recette ») vers /Recette/… en gardant la requête et le fragment ; sinon « Page introuvable. ».
// Aucun dossier recette/ ; l'assemblage échoue si deux chemins du site ne diffèrent que par la casse.
// Lot 5l : canal de la page de jeu. jeu.html porte <meta name="zs-canal" content="source"> ; l'assembleur écrit « release » dans Recette/jeu.html,
// « dev » dans dev/jeu.html et « archive » dans v0.N/jeu.html (seulement si la balise existe : les versions déjà archivées n'en ont pas et restent
// identiques octet pour octet ; jamais d'échec). Le jeu lit la balise sans requête (menu de débogage et paramètres réservés, Docs/ref/debug.md).
// Les pages produites sont autonomes (style en ligne, couleurs du système, icône en data:), en chemins relatifs, noindex ; les redirections ont
// un <meta http-equiv="refresh"> immédiat et un lien visible. Pur et déterministe (aucun réseau ; aucune horloge : les dates viennent des entrées,
// « genere » de site-info.json est injectée) ; échoue avec un message clair si le build de main n'a pas d'index.html ou de jeu.html, si la version
// actuelle est introuvable, si site-info.json est invalide ou si le site dépasse le plafond (900 Mo par défaut, la limite publiée étant 1 Go).
//
// Ligne de commande (arguments ou variables d'environnement) :
//   node scripts/assemble.mjs --main <build de main> [--dev <build de dev>] [--archive <dossier de la branche archive>]
//        [--versions versions.json] [--out _site] [--max-mb 900] [--main-sha <hash>] [--main-date <ISO>] [--dev-sha <hash>] [--dev-date <ISO>] [--genere <ISO>]
//   Variables : SITE_MAIN, SITE_DEV, SITE_ARCHIVE, SITE_VERSIONS, SITE_OUT, SITE_MAX_MB, MAIN_SHA, MAIN_DATE, DEV_SHA, DEV_DATE, SITE_GENERE.
//   Sans --main : le build de l'arbre courant (npm run build) sert de Recette ; le hash et la date viennent alors de git. Sans --genere : l'heure courante.
import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { cheminsEnCollision, corrigerCasse } from './site/casse.mjs';
import { NOMS_FICHIER, appliquerNoms, formatErreur, parseNoms } from './site/noms.mjs';
import { buildSiteInfo, validateSiteInfo } from './site/site-info.mjs';
import { labelOf, validateVersions } from './versions/schema.mjs';

export const DEFAULT_MAX_BYTES = 900 * 1024 * 1024;
export class AssembleError extends Error {}

const SHA_RE = /^[0-9a-f]{7,40}$/;

// Lot 5l : balise de canal de jeu.html. Valeurs écrites par l'assembleur (un futur assembleur de production écrira « prod »). Une balise écrite
// autrement que <meta name="zs-canal" content="…"> n'est pas reconnue (le test de jeu.html vérifie la forme exacte de la source).
export const CANAUX_PUBLIES = Object.freeze(['release', 'dev', 'archive', 'prod']);
export const CANAL_META_RE = /<meta name="zs-canal" content="[a-z]{0,16}">/g;
export const CANAL_MAX_OCTETS = 4 * 1024 * 1024;

// Texte de la page avec la balise de canal réécrite (toutes ses occurrences) ; canal inconnu ou entrée qui n'est pas une chaîne : inchangée.
export function ecrireCanal(html, canal) {
  if (typeof html !== 'string' || !CANAUX_PUBLIES.includes(canal)) return html;
  return html.replace(CANAL_META_RE, `<meta name="zs-canal" content="${canal}">`);
}

// Réécrit la balise de canal d'un fichier publié. Jamais d'exception : absent, dossier, lien symbolique (jamais suivi : il pourrait viser hors du site),
// fichier de plus de 4 Mo ou sans balise : rien n'est écrit (octets inchangés). Lecture et écriture octet pour octet (latin1) : un fichier qui n'est
// pas de l'UTF-8 valide garde ses octets. Renvoie vrai si le fichier a été réécrit.
export function ecrireCanalFichier(path, canal) {
  try {
    const info = lstatSync(path);
    if (!info.isFile() || info.size > CANAL_MAX_OCTETS) return false;
    const before = readFileSync(path, 'latin1');
    const after = ecrireCanal(before, canal);
    if (after === before) return false;
    writeFileSync(path, after, 'latin1');
    return true;
  } catch {
    return false;
  }
}

// Date ISO normalisée en UTC (seconde près), ou '' si invalide.
export function utcDate(value) {
  const time = typeof value === 'string' && value ? Date.parse(value) : NaN;
  return Number.isFinite(time) ? new Date(time).toISOString().replace(/\.\d{3}Z$/, 'Z') : '';
}

export function buildInfo({ channel, version, branch, sha, date }) {
  return { channel, version, branch, sha: SHA_RE.test(sha ?? '') ? sha.slice(0, 7) : '', date: utcDate(date) };
}

// Taille totale d'un dossier (octets) et nombre de fichiers.
export function dirStats(dir) {
  let bytes = 0;
  let files = 0;
  const walk = (current) => {
    for (const name of readdirSync(current)) {
      const path = join(current, name);
      const info = statSync(path);
      if (info.isDirectory()) walk(path);
      else {
        bytes += info.size;
        files += 1;
      }
    }
  };
  if (existsSync(dir)) walk(dir);
  return { bytes, files };
}

const escapeText = (text) => String(text).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
const escapeHtml = (text) => String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// Textes des pages produites : data/i18n/fr.json du build de main (clés site.*), sinon textes par défaut (un build de main plus ancien n'a pas ces clés).
export const SITE_TEXT_DEFAULTS = Object.freeze({
  'site.construction.title': 'Z-Survival · en construction',
  'site.construction.text': 'Z-Survival est en construction.',
  'site.redirect.title': 'Z-Survival · redirection',
  'site.redirect.recette': 'Aller à l\'accueil de la Recette',
  'site.redirect.dev': 'Aller au dernier build de développement',
  'site.dev.title': 'Z-Survival · build de développement',
  'site.dev.none': 'Aucun build de développement pour l\'instant',
  'site.dev.back': 'Revenir à l\'accueil de la Recette',
  'site.notFound.title': 'Z-Survival · page introuvable',
  'site.notFound.text': 'Page introuvable.',
  'site.notFound.noscript': 'Sans JavaScript, une adresse écrite /recette/ en minuscules n\'est pas corrigée : écris /Recette/ avec un R majuscule.',
});
export function siteTexts(mainDir) {
  try {
    const dict = JSON.parse(readFileSync(join(mainDir, 'data/i18n/fr.json'), 'utf8'));
    return Object.fromEntries(Object.entries(SITE_TEXT_DEFAULTS).map(([key, value]) => [key, typeof dict[key] === 'string' && dict[key].trim() ? dict[key] : value]));
  } catch {
    return { ...SITE_TEXT_DEFAULTS };
  }
}

// Icône du site (lot 4g) : le « Z » 48 × 48 de scripts/icone.mjs, écrit en adresse data: PNG dans index.html. L'assembleur l'extrait de index.html du build
// de main et la recopie en ligne dans les pages qu'il produit (lot 5g : plus de fichier icone.png, les pages sont autonomes) ; null sans icône PNG lisible.
const PNG_SIGNATURE = '89504e470d0a1a0a';
export function siteIcon(indexHtml) {
  const match = /<link rel="icon"[^>]*href="data:image\/png;base64,([A-Za-z0-9+/=]+)"/.exec(String(indexHtml ?? ''));
  if (!match) return null;
  const png = Buffer.from(match[1], 'base64');
  return png.length > 24 && png.subarray(0, 8).toString('hex') === PNG_SIGNATURE ? png : null;
}
const iconHref = (png) => (png ? `data:image/png;base64,${png.toString('base64')}` : 'data:,');

// Style en ligne des pages produites : police et couleurs du système en thème sombre (Canvas, CanvasText, LinkText : contraste fourni par le navigateur,
// aucune couleur écrite en dur), texte de 18 px, lien de 44 px de haut au moins, focus visible. Aucune ressource externe.
const PAGE_STYLE = ':root{color-scheme:dark}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:16px;box-sizing:border-box;'
  + 'background:Canvas;color:CanvasText;font:400 1.125rem/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;text-align:center}'
  + 'h1{font-size:2rem;margin:0 0 .5em}p{margin:.5em 0}a{color:LinkText;display:inline-flex;align-items:center;min-height:44px;padding:0 8px}'
  + 'a:focus-visible{outline:3px solid CanvasText;outline-offset:2px}';

function page({ title, body, icon = null, refresh = null, script = null }) {
  const meta = refresh ? `\n  <meta http-equiv="refresh" content="0; url=${escapeHtml(refresh)}">` : '';
  const inline = script ? `\n  <script>${script}</script>` : '';
  return `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex">
  <meta name="color-scheme" content="dark">${meta}
  <title>${escapeText(title)}</title>
  <link rel="icon" href="${escapeHtml(iconHref(icon))}">
  <style>${PAGE_STYLE}</style>${inline}
</head>
<body>
  <main>
${body}
  </main>
</body>
</html>
`;
}

// Page « en construction » de la racine : un titre et une phrase, sans lien.
export function constructionPage({ texts = SITE_TEXT_DEFAULTS, icon = null } = {}) {
  return page({ title: texts['site.construction.title'], icon, body: `    <h1>Z-Survival</h1>\n    <p>${escapeText(texts['site.construction.text'])}</p>` });
}

// Redirection immédiate vers target (chemin relatif), avec un lien visible pour qui n'est pas redirigé.
export function redirectPage({ target, label, texts = SITE_TEXT_DEFAULTS, icon = null }) {
  return page({ title: texts['site.redirect.title'], icon, refresh: target, body: `    <h1>Z-Survival</h1>\n    <p><a href="${escapeHtml(target)}">${escapeText(label)}</a></p>` });
}

// Page 404 (racine du site publié, servie à toute profondeur : aucun lien ni chemin relatif). Le script corrige la casse de « recette »
// (corrigerCasse, recopiée telle quelle) et remplace l'adresse (location.replace : pas d'entrée d'historique) ; sinon, la page reste « Page introuvable. ».
export const NOT_FOUND_SCRIPT = `(function () { const corrigerCasse = ${corrigerCasse.toString()};
  const cible = corrigerCasse(location.pathname);
  if (cible !== null) location.replace(cible + location.search + location.hash); })();`;
export function notFoundPage({ texts = SITE_TEXT_DEFAULTS, icon = null } = {}) {
  return page({ title: texts['site.notFound.title'], icon, script: NOT_FOUND_SCRIPT,
    body: `    <h1>Z-Survival</h1>\n    <p>${escapeText(texts['site.notFound.text'])}</p>\n    <noscript><p>${escapeText(texts['site.notFound.noscript'])}</p></noscript>` });
}

// Chemins relatifs de tous les fichiers et dossiers d'un dossier (séparateur « / »).
export function listPaths(dir) {
  const out = [];
  const walk = (current, prefix) => {
    for (const name of readdirSync(current)) {
      const rel = prefix ? `${prefix}/${name}` : name;
      out.push(rel);
      if (statSync(join(current, name)).isDirectory()) walk(join(current, name), rel);
    }
  };
  if (existsSync(dir)) walk(dir, '');
  return out;
}

// Message simple avec un lien de retour (dev/ sans build de développement).
export function messagePage({ title, message, back, backLabel, icon = null }) {
  return page({ title, icon, body: `    <h1>Z-Survival</h1>\n    <p>${escapeText(message)}</p>\n    <p><a href="${escapeHtml(back)}">${escapeText(backLabel)}</a></p>` });
}

// Dossiers d'un build que l'assembleur retire toujours (ils appartiennent à l'organisation du site, jamais à un build) : anciens aperçus, journal,
// anciennes adresses, dossiers des versions.
const FOREIGN = ['lots', 'lots.json', 'next', 'dev', 'Recette', 'site-info.json', 'icone.png'];
const readJsonFile = (path) => {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
};

// Fichier des noms (lot 5h) : noms-versions-et-lots.txt du build de dev, sinon de celui de main, sinon aucun. Jamais d'exception :
// renvoie { source: 'dev' | 'main' | null, noms: résultat de parseNoms }.
export function readNomsFile({ devDir = null, mainDir = null } = {}) {
  for (const [source, dir] of [['dev', devDir], ['main', mainDir]]) {
    if (!dir) continue;
    try {
      return { source, noms: parseNoms(readFileSync(join(dir, NOMS_FICHIER))) };
    } catch {
      // absent ou illisible : source suivante
    }
  }
  return { source: null, noms: { blocs: [], erreurs: [] } };
}

// Assemble le site. Entrées : dossiers (build de main, build de dev facultatif, contenu de la branche archive facultatif), objet versions.json (de main),
// métadonnées { branch, sha, date } de main et de dev, date de génération (genere). Renvoie un rapport { out, bytes, files, versions, dev, siteInfo, published } ;
// lève AssembleError en cas de problème.
export function assembleSite({ mainDir, devDir = null, archiveDir = null, versions, out = '_site', maxBytes = DEFAULT_MAX_BYTES, main = {}, dev = {}, genere }) {
  for (const file of ['index.html', 'jeu.html']) {
    if (!mainDir || !existsSync(join(mainDir, file))) throw new AssembleError(`Le build de main n'a pas de ${file} (attendu dans ${mainDir ?? '?'})`);
  }
  const check = validateVersions(versions);
  if (!check.ok) throw new AssembleError(`versions.json invalide : ${check.errors.join(' ; ')}`);
  const current = versions.versions.find((v) => v.status === 'actuelle');
  if (!current || current.id !== versions.latest) throw new AssembleError('Version actuelle introuvable dans versions.json');
  if (!existsSync(join(mainDir, current.entry))) throw new AssembleError(`Version actuelle introuvable : ${current.entry} absent du build de main`);
  // Un build de dev sans index.html ou sans jeu.html est traité comme absent (« Aucun build de développement pour l'instant »).
  const devMissing = devDir ? ['index.html', 'jeu.html'].filter((file) => !existsSync(join(devDir, file))) : [];
  const devBuilt = Boolean(devDir) && devMissing.length === 0;
  const versionDirs = versions.versions.map((v) => v.id);

  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  const texts = siteTexts(mainDir);
  const icon = siteIcon(readFileSync(join(mainDir, 'index.html'), 'utf8'));
  const label = labelOf(versions.latest);
  const json = (path, data) => writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`);

  // Racine : la page « en construction » et la page 404 (lot 5h : correction de /recette/).
  writeFileSync(join(out, 'index.html'), constructionPage({ texts, icon }));
  writeFileSync(join(out, '404.html'), notFoundPage({ texts, icon }));

  // Recette/ : build de main.
  const recetteDir = join(out, 'Recette');
  cpSync(mainDir, recetteDir, { recursive: true });
  for (const name of [...FOREIGN, ...versionDirs]) rmSync(join(recetteDir, name), { recursive: true, force: true });
  json(join(recetteDir, 'build-info.json'), buildInfo({ channel: 'release', version: label, branch: main.branch ?? 'main', sha: main.sha, date: main.date }));
  const canaux = { 'Recette/': ecrireCanalFichier(join(recetteDir, 'jeu.html'), 'release') };

  // dev/ : build de dev (son accueil renvoie à la Recette), sinon un message.
  const devOut = join(out, 'dev');
  let devInfo;
  if (devBuilt) {
    cpSync(devDir, devOut, { recursive: true });
    for (const name of [...FOREIGN, ...versionDirs]) rmSync(join(devOut, name), { recursive: true, force: true });
    writeFileSync(join(devOut, 'index.html'), redirectPage({ target: '../Recette/', label: texts['site.redirect.recette'], texts, icon }));
    canaux['dev/'] = ecrireCanalFichier(join(devOut, 'jeu.html'), 'dev');
    devInfo = buildInfo({ channel: 'dev', version: label, branch: versions.dev?.branch ?? 'dev', sha: dev.sha, date: dev.date });
    json(join(devOut, 'build-info.json'), devInfo);
  } else {
    mkdirSync(devOut, { recursive: true });
    writeFileSync(join(devOut, 'index.html'), messagePage({ title: texts['site.dev.title'], message: texts['site.dev.none'], back: '../Recette/', backLabel: texts['site.dev.back'], icon }));
    devInfo = { channel: 'dev', version: label, branch: versions.dev?.branch ?? 'dev', sha: '', date: '' };
  }

  // Anciennes adresses : next/ → dernier build de développement, lots/ → accueil de la Recette.
  mkdirSync(join(out, 'next'));
  writeFileSync(join(out, 'next', 'index.html'), redirectPage({ target: devBuilt ? '../dev/jeu.html' : '../dev/', label: texts['site.redirect.dev'], texts, icon }));
  mkdirSync(join(out, 'lots'));
  writeFileSync(join(out, 'lots', 'index.html'), redirectPage({ target: '../Recette/', label: texts['site.redirect.recette'], texts, icon }));

  // Archives : copiées seulement si elles existent ; sinon la version publiée devient « indisponible ».
  const published = structuredClone(versions);
  const report = [];
  for (const v of published.versions) {
    if (v.status === 'actuelle') {
      report.push({ id: v.id, status: 'actuelle', path: 'Recette/' });
      continue;
    }
    if (v.status !== 'archive') {
      report.push({ id: v.id, status: v.status, path: null });
      continue;
    }
    const source = archiveDir ? join(archiveDir, v.id) : null;
    if (source && existsSync(join(source, v.entry))) {
      cpSync(source, join(out, v.id), { recursive: true });
      canaux[`${v.id}/`] = ecrireCanalFichier(join(out, v.id, 'jeu.html'), 'archive');
      report.push({ id: v.id, status: 'archive', path: `${v.id}/` });
    } else {
      v.status = 'indisponible';
      v.note = v.note || 'Archive non construite : dossier absent de la branche archive.';
      report.push({ id: v.id, status: 'indisponible', path: null, missing: true });
    }
  }
  json(join(recetteDir, 'versions.json'), published);

  // site-info.json : ce que l'accueil de la Recette affiche (évolutions lues dans le journal du build de dev).
  // Lot 5h : le fichier des noms l'emporte sur les textes de versions.json et du journal (copies : Recette/versions.json reste tel quel) ;
  // une ligne fautive est ignorée, un identifiant inconnu aussi ; le fichier ne fait jamais échouer l'assemblage (repli sans les noms).
  const changelog = devBuilt ? readJsonFile(join(devDir, 'data/changelog.json')) : null;
  const nomsFile = readNomsFile({ devDir: devBuilt ? devDir : null, mainDir });
  const applied = appliquerNoms({ versions: published, changelog }, nomsFile.noms);
  const siteInput = { dev: { present: devBuilt, sha: devInfo.sha, date: devInfo.date }, genere: utcDate(genere ?? '') };
  let siteInfo = buildSiteInfo({ ...siteInput, versions: applied.versions ?? published, changelog: applied.changelog });
  const nomsReport = {
    source: nomsFile.source,
    blocs: nomsFile.noms.blocs.length,
    erreurs: nomsFile.noms.erreurs.map(formatErreur),
    // Sans journal de dev, les lots et les versions cibles ne peuvent pas être vérifiés : aucun avertissement.
    inconnus: changelog ? applied.inconnus : [],
    applique: true,
  };
  if (!validateSiteInfo(siteInfo).ok) {
    siteInfo = buildSiteInfo({ ...siteInput, versions: published, changelog });
    nomsReport.applique = false;
  }
  const siteCheck = validateSiteInfo(siteInfo);
  if (!siteCheck.ok) throw new AssembleError(`site-info.json invalide : ${siteCheck.errors.join(' ; ')}`);
  json(join(recetteDir, 'site-info.json'), siteInfo);

  // Garde-fou (lot 5h) : aucune paire de chemins qui ne diffère que par la casse (GitHub Pages la distingue, Windows et macOS non).
  const collisions = cheminsEnCollision(listPaths(out));
  if (collisions.length) throw new AssembleError(`Chemins qui ne diffèrent que par la casse : ${collisions.map(([a, b]) => `${a} / ${b}`).join(' ; ')}`);

  const stats = dirStats(out);
  if (stats.bytes > maxBytes) throw new AssembleError(`Site trop gros : ${(stats.bytes / 1024 / 1024).toFixed(1)} Mo pour un plafond de ${(maxBytes / 1024 / 1024).toFixed(0)} Mo (limite publiée : 1 Go)`);
  return { out, ...stats, versions: report, dev: { ...devInfo, built: devBuilt, missing: devMissing }, siteInfo, published, noms: nomsReport, canaux };
}

// Lecture des options (arguments, puis variables d'environnement).
export function parseOptions(argv, env = {}) {
  const map = {
    '--main': 'SITE_MAIN', '--dev': 'SITE_DEV', '--archive': 'SITE_ARCHIVE', '--versions': 'SITE_VERSIONS', '--out': 'SITE_OUT', '--max-mb': 'SITE_MAX_MB',
    '--main-sha': 'MAIN_SHA', '--main-date': 'MAIN_DATE', '--dev-sha': 'DEV_SHA', '--dev-date': 'DEV_DATE', '--genere': 'SITE_GENERE',
  };
  const options = {};
  for (const [flag, name] of Object.entries(map)) if (env[name]) options[flag.slice(2)] = env[name];
  for (let i = 0; i < argv.length; i += 1) {
    if (!(argv[i] in map)) throw new AssembleError(`Argument inconnu : ${argv[i]}`);
    const value = argv[i + 1];
    if (value === undefined || value.startsWith('--')) throw new AssembleError(`${argv[i]} : valeur manquante`);
    options[argv[i].slice(2)] = value;
    i += 1;
  }
  const maxMb = options['max-mb'] === undefined ? 900 : Number(options['max-mb']);
  if (!Number.isFinite(maxMb) || maxMb <= 0) throw new AssembleError('--max-mb : nombre positif attendu');
  for (const key of ['main-sha', 'dev-sha']) if (options[key] !== undefined && !SHA_RE.test(options[key])) throw new AssembleError(`--${key} : hash invalide`);
  if (options.genere !== undefined && !utcDate(options.genere)) throw new AssembleError('--genere : date ISO attendue');
  return { ...options, maxBytes: maxMb * 1024 * 1024 };
}

const gitInfo = (dir) => {
  const run = (args) => spawnSync('git', ['-C', dir, ...args], { encoding: 'utf8' });
  const sha = run(['rev-parse', 'HEAD']);
  const date = run(['log', '-1', '--format=%cI', 'HEAD']);
  return sha.status === 0 ? { sha: sha.stdout.trim(), date: date.stdout.trim() } : {};
};

async function main() {
  const options = parseOptions(process.argv.slice(2), process.env);
  let mainDir = options.main;
  let tmp = null;
  if (!mainDir) {
    // Sans --main : build de l'arbre courant, déplacé hors de _site/ (qui sera la sortie).
    execFileSync('node', ['scripts/build.mjs'], { stdio: 'inherit' });
    tmp = mkdtempSync(join(tmpdir(), 'zs-assemble-'));
    mainDir = join(tmp, 'main');
    cpSync('_site', mainDir, { recursive: true });
  }
  const parent = (dir) => resolve(dir, '..');
  const mainMeta = { branch: 'main', sha: options['main-sha'], date: options['main-date'] };
  if (!mainMeta.sha) Object.assign(mainMeta, gitInfo(options.main ? parent(options.main) : '.'));
  const devMeta = { sha: options['dev-sha'], date: options['dev-date'] };
  if (options.dev && !devMeta.sha) Object.assign(devMeta, gitInfo(parent(options.dev)));
  const versions = JSON.parse(readFileSync(options.versions ?? (options.main ? join(parent(options.main), 'versions.json') : 'versions.json'), 'utf8'));
  const started = Date.now();
  try {
    const result = assembleSite({ mainDir, devDir: options.dev ?? null, archiveDir: options.archive ?? null, versions, out: options.out ?? '_site', maxBytes: options.maxBytes, main: mainMeta, dev: devMeta,
      genere: options.genere ?? new Date().toISOString() });
    const lines = result.versions.map((v) => `${v.id} ${v.status}${v.path === null ? '' : ` (${v.path})`}`);
    console.log(`Site assemblé : ${result.out}/ — ${result.files} fichiers, ${(result.bytes / 1024 / 1024).toFixed(1)} Mo, ${Date.now() - started} ms`);
    const missing = result.dev.missing.length ? ` (build de dev sans ${result.dev.missing.join(', ')})` : '';
    console.log(`  dev/ : ${result.dev.built ? `dev ${result.dev.sha} (${result.dev.date})` : `aucun build de développement${missing}`}`);
    console.log(`  Recette/site-info.json : ${result.siteInfo.evolutions.length} évolutions, ${result.siteInfo.precedentes.length} versions précédentes`);
    console.log(`  versions : ${lines.join(' · ')}`);
    console.log(`  balise de canal réécrite : ${Object.entries(result.canaux).map(([dir, done]) => `${dir} ${done ? 'oui' : 'non (absente)'}`).join(' · ')}`);
    const noms = result.noms;
    console.log(`  ${NOMS_FICHIER} : ${noms.source ? `build de ${noms.source}, ${noms.blocs} blocs, ${noms.erreurs.length} erreur${noms.erreurs.length > 1 ? 's' : ''} (lignes ignorées)` : 'absent (textes d\'origine)'}${noms.applique ? '' : ' ; NON appliqué (site-info.json invalide avec les noms)'}`);
    for (const message of noms.erreurs) console.warn(`  Avertissement : ${message}`);
    for (const id of noms.inconnus) console.warn(`  Avertissement : ${NOMS_FICHIER} : identifiant inconnu « ${id} » (ni version de versions.json, ni version cible, ni lot du journal) : bloc ignoré.`);
  } finally {
    if (tmp) rmSync(tmp, { recursive: true, force: true });
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    await main();
  } catch (error) {
    console.error(`Erreur d'assemblage : ${error.message}`);
    process.exit(1);
  }
}
