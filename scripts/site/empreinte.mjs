// Lot 9f (Docs/ref/cache.md) : adresses à l'empreinte du déploiement, dans le site construit seulement (jamais dans les sources ni sur le serveur
// local des tests). GitHub Pages fait garder chaque fichier 10 minutes au navigateur (Cache-Control: max-age=600) : sans empreinte, une page neuve
// peut charger des modules anciens. À la construction, chaque adresse relative vers un fichier du site (.js, .json, .css, polices, images, sons,
// .txt) reçoit ?v=<version> (hash court du commit) : imports statiques et dynamiques, carte d'imports, fetch, préchargements, new URL(…,
// import.meta.url) des calculateurs, url() des feuilles de styles, src et href des pages. Les pages (.html) ne sont pas réécrites : ce sont des
// entrées de navigation, protégées par la vérification de version au démarrage de jeu.html et les liens uniques de l'accueil (?r=).
// Un module chargé une fois avec et une fois sans empreinte serait chargé deux fois (deux états) : controlerEmpreintes() liste toute adresse
// relative restée sans empreinte et build.mjs échoue s'il en reste (déclarations : DECLARATIONS, avec leur raison).
// Pur (hors versionDuBuild et appliquerEmpreintes, qui lisent le disque et git) ; Node natif, sans dépendance.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import { join, posix, relative } from 'node:path';

// Extensions des fichiers du site que le code charge (les pages .html n'en font pas partie).
export const EXTENSIONS = Object.freeze(['js', 'mjs', 'json', 'css', 'txt', 'svg', 'png', 'jpg', 'jpeg', 'webp', 'gif', 'mp3', 'ogg', 'wav', 'woff2', 'woff', 'ttf', 'otf']);
// Fichiers écrits après la construction, à la racine du dossier publié (assembleur, archiveur) : réécrits même s'ils manquent au build.
export const GENERES = Object.freeze(['build-info.json', 'site-info.json', 'versions.json']);
// Fichiers texte réécrits (et contrôlés).
export const TEXTES = Object.freeze(['.html', '.js', '.mjs', '.css']);
// Premiers dossiers du site : une chaîne qui commence par l'un d'eux sans finir par une extension est une adresse construite (forme dynamique).
export const DOSSIERS = Object.freeze(['data', 'js', 'css', 'fonts', 'assets', 'vendor']);
// Formes déclarées (chaînes qui ressemblent à une adresse mais n'en sont pas une, ou adresses construites autrement) : { fichier, texte (début de la
// chaîne, guillemets compris) ou formes (toutes les chaînes de ces formes dans le fichier), raison }. Une déclaration qui ne sert plus fait aussi
// échouer le contrôle (liste toujours à jour).
export const DECLARATIONS = Object.freeze([
  { fichier: 'vendor/three/three.core.js', formes: ['inconnue', 'suffixe'], raison: 'exemples de la documentation de Three.js (commentaires), jamais chargés' },
  { fichier: 'js/core/ecarts.js', texte: '`params.json`', raison: 'commentaire : nom d\'un fichier du modèle de relevé, jamais chargé' },
  { fichier: 'js/ecarts/main.js', texte: '\'data/game/maps/rez-de-chaussee\'', raison: 'dossier de base des gabarits `${DIR}/….json`, réécrits un par un' },
  { fichier: 'js/game/main.js', texte: '\'data/game\'', raison: 'dossier de base (carte « salle ») des gabarits `${mapDir}/….json`, réécrits un par un' },
  { fichier: 'js/game/main.js', texte: '`data/game/maps/${', raison: 'dossier de base des gabarits `${mapDir}/….json`, réécrits un par un' },
]);

export const VERSION_RE = /^[0-9a-f]{7}$/;
const EXT = EXTENSIONS.join('|');
const SEGMENT = '(?:[A-Za-z0-9_\\-]|\\$\\{[^{}`\'"]*\\})';
// Chaîne (guillemets simples, doubles ou gabarit) qui est une adresse relative vers un fichier du site, avec sa requête éventuelle.
const LITTERAL_RE = new RegExp(`(['"\`])((?:\\.{1,2}/)*${SEGMENT}(?:${SEGMENT}|[./])*\\.(?:${EXT}))(\\?[^'"\`\\s<>]*)?\\1`, 'g');
// Suffixe seul (« '.json' ») : adresse construite par concaténation.
const SUFFIXE_RE = new RegExp(`(['"\`])\\.(?:${EXT})\\1`, 'g');
// Préfixe de dossier du site sans extension (« 'data/game/' ») : adresse construite.
const PREFIXE_RE = new RegExp(`(['"\`])((?:\\.{1,2}/)*(?:${DOSSIERS.join('|')})/[^'"\`\\s<>]*)\\1`, 'g');
const URL_CSS_RE = /url\(\s*(['"]?)([^'")\s]+)\1\s*\)/g;

const avecVersion = (requete) => /(?:^\?|&)v=/.test(requete ?? '');
const ajouter = (requete, version) => (requete ? `${requete}&v=${version}` : `?v=${version}`);
const relative_ = (adresse) => !/^(?:[a-z][a-z0-9+.-]*:|\/|#)/i.test(adresse);

// Fichier visé par une adresse relative (sans requête), depuis le fichier qui la contient (fichier) ou depuis la racine (pages servies à la racine
// du dossier publié : fetch et liens se résolvent contre la page). Renvoie vrai si le fichier existe dans le site ou est un fichier généré.
export function cibleExiste(adresse, fichier, existe) {
  if (adresse.includes('${')) return true; // gabarit : forme vérifiée à l'exécution (test des requêtes du site construit)
  const depuisFichier = posix.normalize(posix.join(posix.dirname(fichier), adresse));
  const depuisRacine = posix.normalize(adresse);
  return [depuisFichier, depuisRacine].some((p) => !p.startsWith('..') && (GENERES.includes(p) || existe(p)));
}

// Texte d'un fichier .html, .js ou .css avec ses adresses à l'empreinte. existe(chemin relatif à la racine du site) → booléen.
export function reecrire(texte, fichier, version, existe) {
  let out = texte.replace(LITTERAL_RE, (tout, q, adresse, requete) => {
    if (avecVersion(requete) || !cibleExiste(adresse, fichier, existe)) return tout;
    return `${q}${adresse}${ajouter(requete, version)}${q}`;
  });
  if (fichier.endsWith('.css') || fichier.endsWith('.html')) {
    out = out.replace(URL_CSS_RE, (tout, q, adresse) => {
      const [chemin, requete] = adresse.split(/(?=\?)/);
      if (!relative_(adresse) || avecVersion(requete) || !chemin.match(new RegExp(`\\.(?:${EXT})$`)) || !cibleExiste(chemin, fichier, existe)) return tout;
      return `url(${q}${chemin}${ajouter(requete, version)}${q})`;
    });
  }
  return out;
}

// Adresses relatives restées sans empreinte dans un texte (après réécriture) : [{ fichier, texte, forme }]. forme : 'adresse' (fichier connu ou
// gabarit), 'inconnue' (fichier absent du site), 'suffixe' ou 'prefixe' (adresse construite), 'css'.
export function adressesSansEmpreinte(texte, fichier, existe) {
  const out = [];
  for (const m of texte.matchAll(LITTERAL_RE)) {
    if (avecVersion(m[3])) continue;
    out.push({ fichier, texte: m[0], forme: cibleExiste(m[2], fichier, existe) ? 'adresse' : 'inconnue' });
  }
  for (const m of texte.matchAll(SUFFIXE_RE)) out.push({ fichier, texte: m[0], forme: 'suffixe' });
  for (const m of texte.matchAll(PREFIXE_RE)) {
    if (new RegExp(`\\.(?:${EXT})(?:\\?|$)`).test(m[2]) || m[2].endsWith('.html') || /\.html[?#]/.test(m[2])) continue;
    out.push({ fichier, texte: m[0], forme: 'prefixe' });
  }
  if (fichier.endsWith('.css') || fichier.endsWith('.html')) {
    for (const m of texte.matchAll(URL_CSS_RE)) {
      const [chemin, requete] = m[2].split(/(?=\?)/);
      if (relative_(m[2]) && !avecVersion(requete) && !/\.html$/.test(chemin)) out.push({ fichier, texte: m[0], forme: 'css' });
    }
  }
  return out;
}

// Fichiers texte du site (chemins relatifs, séparateur « / »).
export function fichiersTexte(racine) {
  const out = [];
  const walk = (dir) => {
    for (const nom of readdirSync(dir).sort()) {
      const p = join(dir, nom);
      if (statSync(p).isDirectory()) walk(p);
      else if (TEXTES.some((e) => nom.endsWith(e))) out.push(relative(racine, p).split('\\').join('/'));
    }
  };
  walk(racine);
  return out;
}

// Contrôle : { restes, inutiles } ; restes = adresses sans empreinte non déclarées ; inutiles = déclarations qui ne correspondent plus à rien
// (seulement celles dont le fichier est dans le site, liste fichiers ; sans liste : toutes).
export function controlerEmpreintes(entrees, declarations = DECLARATIONS, fichiers = null) {
  const utilisees = new Set();
  const restes = [];
  for (const r of entrees) {
    const d = declarations.findIndex((x) => x.fichier === r.fichier && (x.texte ? r.texte.startsWith(x.texte) : x.formes?.includes(r.forme)));
    if (d >= 0) utilisees.add(d);
    else restes.push(r);
  }
  return { restes, inutiles: declarations.filter((d, i) => !utilisees.has(i) && (!fichiers || fichiers.includes(d.fichier))) };
}

// Version du build : ZS_BUILD_SHA (archiveur, sites de test), sinon le commit de l'arbre construit (git, seulement si cwd est la racine du
// dépôt), sinon une empreinte du contenu (avertissement : la vérification de version recharge alors une fois). Toujours 7 caractères hexadécimaux.
export function versionDuBuild({ env = process.env, cwd = process.cwd(), contenu = null } = {}) {
  const imposee = String(env.ZS_BUILD_SHA ?? '').trim().toLowerCase();
  if (/^[0-9a-f]{7,40}$/.test(imposee)) return { version: imposee.slice(0, 7), source: 'ZS_BUILD_SHA' };
  const git = (args) => spawnSync('git', ['-C', cwd, ...args], { encoding: 'utf8' });
  const racine = git(['rev-parse', '--show-toplevel']);
  if (racine.status === 0) {
    let memeDossier;
    try {
      memeDossier = realpathSync(racine.stdout.trim()) === realpathSync(cwd);
    } catch {
      memeDossier = false;
    }
    const sha = memeDossier ? git(['rev-parse', 'HEAD']) : null;
    if (sha?.status === 0 && /^[0-9a-f]{40}$/.test(sha.stdout.trim())) return { version: sha.stdout.trim().slice(0, 7), source: 'git' };
  }
  const h = createHash('sha1');
  for (const [nom, octets] of contenu ?? []) h.update(nom).update(octets);
  return { version: h.digest('hex').slice(0, 7), source: 'contenu' };
}

// Balise de version de jeu.html (lue par js/menu/demarrage.js, comparée à build-info.json). La source porte content="" ; le build écrit la version.
export const VERSION_META_RE = /<meta name="zs-version" content="[0-9a-f]{0,7}">/;
export const ecrireVersionMeta = (html, version) => html.replace(VERSION_META_RE, `<meta name="zs-version" content="${version}">`);

// Réécrit tout le site construit (racine) et le contrôle. Renvoie { version, source, fichiers, reecrits, adresses, restes, inutiles }.
export function appliquerEmpreintes(racine, { env = process.env, cwd = process.cwd() } = {}) {
  const fichiers = fichiersTexte(racine);
  const lire = (f) => readFileSync(join(racine, f), 'utf8');
  const { version, source } = versionDuBuild({ env, cwd, contenu: fichiers.map((f) => [f, readFileSync(join(racine, f))]) });
  const existe = (p) => {
    try {
      return statSync(join(racine, p)).isFile();
    } catch {
      return false;
    }
  };
  let reecrits = 0;
  let adresses = 0;
  const entrees = [];
  for (const f of fichiers) {
    const avant = lire(f);
    let apres = reecrire(avant, f, version, existe);
    if (f === 'jeu.html') apres = ecrireVersionMeta(apres, version);
    adresses += (apres.match(new RegExp(`[?&]v=${version}`, 'g')) ?? []).length;
    if (apres !== avant) {
      writeFileSync(join(racine, f), apres);
      reecrits += 1;
    }
    entrees.push(...adressesSansEmpreinte(apres, f, existe));
  }
  const { restes, inutiles } = controlerEmpreintes(entrees, DECLARATIONS, fichiers);
  const meta = existsSync(join(racine, 'jeu.html')) && !lire('jeu.html').includes(`<meta name="zs-version" content="${version}">`);
  if (meta) restes.push({ fichier: 'jeu.html', texte: '<meta name="zs-version" content="">', forme: 'version absente' });
  return { version, source, fichiers: fichiers.length, reecrits, adresses, restes, inutiles };
}

