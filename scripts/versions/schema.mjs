// Schéma de versions.json (lot 4c) : liste des versions publiées du site. Module pur, sans dépendance, sans accès disque ni réseau.
// Forme : { schema: 1, latest: "v0.5", versions: [{ id, label, title, date, branch, ref, entry, status, note }], dev: { branch: "dev", path: "next/" } }
//  - id : « v0.N » (dossier de l'archive : v0.N/) ; label : « V0.N » (le même numéro, affiché) ;
//  - ref : hash complet (40 caractères hexadécimaux) du commit gelé ; branch : branche source (jamais supprimée) ;
//  - entry : première page à ouvrir dans le dossier de la version (chemin relatif sûr, par exemple jeu.html) ;
//  - status : « actuelle » (servie à la racine, une seule, = latest), « archive » (dossier v0.N/ de la branche archive), « indisponible » (non construite : la raison est dans note).

export const SCHEMA_VERSION = 1;
export const STATUSES = Object.freeze(['actuelle', 'archive', 'indisponible']);
export const ID_RE = /^v(0|[1-9]\d{0,2})\.(0|[1-9]\d{0,2})$/;
export const REF_RE = /^[0-9a-f]{40}$/;
export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const BRANCH_RE = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,99}$/;
const VERSION_KEYS = ['id', 'label', 'title', 'date', 'branch', 'ref', 'entry', 'status', 'note'];
const MAX_TEXT = 300;
const MAX_VERSIONS = 200;

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const isText = (value, max = MAX_TEXT) => typeof value === 'string' && value.length <= max && ![...value].some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127);

// Libellé affiché d'un identifiant : v0.4 → V0.4.
export function labelOf(id) {
  return typeof id === 'string' && ID_RE.test(id) ? `V${id.slice(1)}` : '';
}

// Chemin relatif sûr (entrée d'une version, dossier du build de développement) : lettres, chiffres, « . _ - / », sans « .. », sans « / » initial,
// sans « // », sans schéma (« javascript: », « https: ») ni barre oblique inverse. Le dernier caractère peut être « / » (dossier) si allowDir.
export function isSafeRelativePath(path, { allowDir = false } = {}) {
  if (typeof path !== 'string' || path.length === 0 || path.length > 200) return false;
  if (!/^[A-Za-z0-9._/-]+$/.test(path)) return false;
  if (path.startsWith('/') || path.startsWith('.') || path.includes('//') || path.split('/').some((part) => part === '..' || part === '.')) return false;
  if (path.endsWith('/') && !allowDir) return false;
  return true;
}

export function isValidDate(value) {
  if (typeof value !== 'string' || !DATE_RE.test(value)) return false;
  const time = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
}

export function isValidBranch(name) {
  return typeof name === 'string' && BRANCH_RE.test(name) && !name.includes('..') && !name.includes('//') && !name.endsWith('/') && !name.endsWith('.lock');
}

function checkVersion(version, index, errors) {
  const where = `versions[${index}]`;
  if (!isObject(version)) {
    errors.push(`${where} : objet attendu`);
    return;
  }
  for (const key of VERSION_KEYS) if (!Object.hasOwn(version, key)) errors.push(`${where} : champ « ${key} » manquant`);
  for (const key of Object.keys(version)) if (!VERSION_KEYS.includes(key)) errors.push(`${where} : champ inconnu « ${key} »`);
  if (Object.hasOwn(version, 'id') && !(typeof version.id === 'string' && ID_RE.test(version.id))) errors.push(`${where} : id invalide (attendu v0.N)`);
  if (Object.hasOwn(version, 'label') && version.label !== labelOf(version.id)) errors.push(`${where} : label invalide (attendu ${labelOf(version.id) || 'V0.N'})`);
  if (Object.hasOwn(version, 'title') && !(isText(version.title, 120) && version.title.trim().length >= 3)) errors.push(`${where} : title invalide (3 à 120 caractères)`);
  if (Object.hasOwn(version, 'date') && !isValidDate(version.date)) errors.push(`${where} : date invalide (AAAA-MM-JJ)`);
  if (Object.hasOwn(version, 'branch') && !isValidBranch(version.branch)) errors.push(`${where} : branch invalide`);
  if (Object.hasOwn(version, 'ref') && !(typeof version.ref === 'string' && REF_RE.test(version.ref))) errors.push(`${where} : ref invalide (hash complet de 40 caractères attendu)`);
  if (Object.hasOwn(version, 'entry') && !isSafeRelativePath(version.entry)) errors.push(`${where} : entry invalide (chemin relatif sûr attendu)`);
  if (Object.hasOwn(version, 'status') && !STATUSES.includes(version.status)) errors.push(`${where} : status inconnu`);
  if (Object.hasOwn(version, 'note') && !isText(version.note)) errors.push(`${where} : note invalide (texte de ${MAX_TEXT} caractères au plus)`);
  if (version.status === 'indisponible' && isText(version.note) && version.note.trim() === '') errors.push(`${where} : une version indisponible donne sa raison dans note`);
}

// Valide un objet versions.json. Renvoie { ok, errors } ; ne lève jamais d'exception, quelle que soit l'entrée.
export function validateVersions(data) {
  const errors = [];
  if (!isObject(data)) return { ok: false, errors: ['objet attendu à la racine'] };
  if (data.schema !== SCHEMA_VERSION) errors.push(`schema : ${SCHEMA_VERSION} attendu`);
  for (const key of Object.keys(data)) if (!['schema', 'latest', 'versions', 'dev'].includes(key)) errors.push(`champ inconnu « ${key} »`);
  const versions = Array.isArray(data.versions) ? data.versions : null;
  if (!versions) errors.push('versions : tableau attendu');
  else if (versions.length === 0) errors.push('versions : au moins une version');
  else if (versions.length > MAX_VERSIONS) errors.push(`versions : ${MAX_VERSIONS} au plus`);
  else {
    versions.forEach((version, index) => checkVersion(version, index, errors));
    const ids = versions.map((v) => (isObject(v) ? v.id : undefined));
    const dup = ids.filter((id, i) => typeof id === 'string' && ids.indexOf(id) !== i);
    for (const id of new Set(dup)) errors.push(`versions : id en double « ${id} »`);
    const refs = versions.map((v) => (isObject(v) ? v.ref : undefined)).filter((r) => typeof r === 'string');
    for (const ref of new Set(refs.filter((r, i) => refs.indexOf(r) !== i))) errors.push(`versions : ref en double « ${ref.slice(0, 12)} »`);
    const current = versions.filter((v) => isObject(v) && v.status === 'actuelle');
    if (current.length !== 1) errors.push(`versions : exactement une version « actuelle » (trouvé ${current.length})`);
    if (typeof data.latest !== 'string' || !ids.includes(data.latest)) errors.push('latest : identifiant de version inexistant');
    else if (current.length === 1 && current[0].id !== data.latest) errors.push('latest : doit désigner la version « actuelle »');
    const order = ids.filter((id) => typeof id === 'string' && ID_RE.test(id));
    const sorted = [...order].sort(compareIds);
    if (order.length === ids.length && order.join() !== sorted.join()) errors.push('versions : ordre chronologique attendu (v0.1 en premier)');
  }
  if (!isObject(data.dev)) errors.push('dev : objet attendu');
  else {
    if (!isValidBranch(data.dev.branch)) errors.push('dev.branch invalide');
    if (!(isSafeRelativePath(data.dev.path, { allowDir: true }) && data.dev.path.endsWith('/'))) errors.push('dev.path invalide (dossier relatif terminé par « / »)');
    for (const key of Object.keys(data.dev)) if (!['branch', 'path'].includes(key)) errors.push(`dev : champ inconnu « ${key} »`);
  }
  return { ok: errors.length === 0, errors };
}

// Ordre des identifiants : v0.2 < v0.10 < v1.0.
export function compareIds(a, b) {
  const [, a1, a2] = ID_RE.exec(a) ?? [];
  const [, b1, b2] = ID_RE.exec(b) ?? [];
  if (a1 === undefined || b1 === undefined) throw new RangeError('Identifiant de version invalide');
  return Number(a1) - Number(b1) || Number(a2) - Number(b2);
}

// Cohérence avec data/changelog.json : chaque version de versions.json a son entrée dans changelog.versions (même libellé, même branche)
// et réciproquement. Renvoie { ok, errors }.
export function checkChangelogConsistency(versionsData, changelog) {
  const errors = [];
  const ours = Array.isArray(versionsData?.versions) ? versionsData.versions.filter(isObject) : [];
  const theirs = Array.isArray(changelog?.versions) ? changelog.versions.filter(isObject) : [];
  for (const v of ours) {
    const match = theirs.find((c) => c.version === v.label);
    if (!match) errors.push(`${v.id} : absente de changelog.versions`);
    else if (match.lot !== v.branch) errors.push(`${v.id} : branche ${v.branch} ≠ lot ${match.lot} du journal`);
  }
  for (const c of theirs) if (!ours.some((v) => v.label === c.version)) errors.push(`${c.version} : absente de versions.json`);
  const latest = ours.find((v) => v.id === versionsData?.latest);
  const enCours = theirs.filter((c) => c.enCours === true).map((c) => c.version);
  if (latest && enCours.length > 0 && !enCours.includes(latest.label)) errors.push(`la version en cours du journal (${enCours.join(', ')}) n'est pas latest (${latest.label})`);
  return { ok: errors.length === 0, errors };
}

// Adresse relative d'une version depuis la racine du site : '' pour l'actuelle (la racine), 'v0.N/' pour une archive, null si indisponible.
export function versionPath(version) {
  if (!isObject(version) || !ID_RE.test(version.id ?? '')) return null;
  if (version.status === 'actuelle') return '';
  if (version.status === 'archive') return `${version.id}/`;
  return null;
}
