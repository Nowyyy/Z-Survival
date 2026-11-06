// Fichier des noms (lot 5h) : noms-versions-et-lots.txt, à la racine du dépôt, que le propriétaire modifie pour changer le nom et la description
// des versions et des lots affichés sur l'accueil de la Recette. Module pur : aucun accès disque, réseau ni horloge, aucune dépendance ; jamais
// d'exception, quelle que soit l'entrée (texte vide ou très long, caractères de contrôle, HTML, __proto__, doublons, CRLF, BOM, UTF-8 invalide).
//
// Format (une ligne = une information) :
//   # commentaire          (ligne qui commence par « # », espaces initiales permises)
//                          (ligne vide)
//   [v0.6]                 (début d'un bloc : version « v<nombre>.<nombre> », tout autre identifiant en minuscules = lot, par exemple « lot-5a »)
//   nom: V0.6              (version : l'étiquette affichée ; lot : le titre ; 60 caractères au plus)
//   description: …         (une ligne, 200 caractères au plus)
//   version: v0.6          (lot seulement : version de rattachement, remplace celle de data/changelog.json)
//   afficher: oui          (lot seulement : « oui » ou « non » ; « non » retire le lot des « Évolutions en cours de développement »)
// Le séparateur est le premier deux-points de la ligne (les textes peuvent en contenir) ; espaces autour des valeurs retirées.
//
// parseNoms(entrée) → { blocs, erreurs } ; entrée : texte (string) ou octets (Uint8Array, Buffer) ; blocs : liste dans l'ordre du fichier
// de { id, type: 'version' | 'lot', ligne, nom?, description?, version?, afficher? } ; erreurs : [{ ligne, message }] (français, ligne à partir de 1).
// Une ligne fautive est ignorée, le reste du fichier reste valable ; un bloc d'en-tête invalide ou en double est ignoré en entier.
//
// appliquerNoms({ versions, changelog }, noms) → { versions, changelog, inconnus } : copies de versions.json et de data/changelog.json où le fichier
// l'emporte (version : label ← nom, title ← description ; lot : titre ← nom, points[0] ← description, version ← version, afficher: non → lot retiré).
// Les dates, ref, status, entry et l'ordre ne changent jamais. inconnus : identifiants du fichier qui ne désignent ni une version de versions.json,
// ni une version cible d'un lot, ni un lot du journal (ignorés par l'appelant, avec un avertissement).

export const NOMS_FICHIER = 'noms-versions-et-lots.txt';
export const MAX_NOM = 60;
export const MAX_DESCRIPTION = 200;
export const VERSION_ID_RE = /^v\d+\.\d+$/;
const LOT_ID_RE = /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/;
const CLES = Object.freeze({ nom: 'tous', description: 'tous', version: 'lot', afficher: 'lot' });
const LIGNE_MAX_AFFICHEE = 40;

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);

// Extrait court et sûr d'une valeur pour un message d'erreur (caractères de contrôle remplacés, longueur bornée).
function extrait(value) {
  const flat = [...String(value)].map((c) => (c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127 ? ' ' : c)).join('');
  const chars = [...flat];
  return chars.length > LIGNE_MAX_AFFICHEE ? `${chars.slice(0, LIGNE_MAX_AFFICHEE - 1).join('')}…` : flat;
}

// Longueur d'une séquence UTF-8 valide qui commence à i (1 à 4), ou 0 si les octets ne sont pas de l'UTF-8 valide (surlongueur, surrogate, > U+10FFFF).
function utf8Sequence(bytes, i) {
  const b0 = bytes[i];
  if (b0 < 0x80) return 1;
  const cont = (k) => i + k < bytes.length && (bytes[i + k] & 0xc0) === 0x80;
  if (b0 >= 0xc2 && b0 <= 0xdf) return cont(1) ? 2 : 0;
  if (b0 >= 0xe0 && b0 <= 0xef) {
    if (!cont(1) || !cont(2)) return 0;
    const b1 = bytes[i + 1];
    if (b0 === 0xe0 && b1 < 0xa0) return 0;
    if (b0 === 0xed && b1 >= 0xa0) return 0;
    return 3;
  }
  if (b0 >= 0xf0 && b0 <= 0xf4) {
    if (!cont(1) || !cont(2) || !cont(3)) return 0;
    const b1 = bytes[i + 1];
    if (b0 === 0xf0 && b1 < 0x90) return 0;
    if (b0 === 0xf4 && b1 >= 0x90) return 0;
    return 4;
  }
  return 0;
}

// Octets → lignes de texte (BOM retiré, CRLF accepté) ; une ligne qui contient des octets invalides est marquée (invalide: true).
function linesFromBytes(bytes) {
  const lines = [];
  let i = bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf ? 3 : 0;
  let text = '';
  let invalid = false;
  const push = () => {
    lines.push({ text: text.endsWith('\r') ? text.slice(0, -1) : text, invalid });
    text = '';
    invalid = false;
  };
  while (i < bytes.length) {
    if (bytes[i] === 0x0a) {
      push();
      i += 1;
      continue;
    }
    const n = utf8Sequence(bytes, i);
    if (n === 0) {
      invalid = true;
      i += 1;
      continue;
    }
    let code;
    if (n === 1) code = bytes[i];
    else if (n === 2) code = ((bytes[i] & 0x1f) << 6) | (bytes[i + 1] & 0x3f);
    else if (n === 3) code = ((bytes[i] & 0x0f) << 12) | ((bytes[i + 1] & 0x3f) << 6) | (bytes[i + 2] & 0x3f);
    else code = ((bytes[i] & 0x07) << 18) | ((bytes[i + 1] & 0x3f) << 12) | ((bytes[i + 2] & 0x3f) << 6) | (bytes[i + 3] & 0x3f);
    text += String.fromCodePoint(code);
    i += n;
  }
  push();
  return lines;
}

// Texte → lignes (BOM retiré, CRLF accepté) ; une moitié de paire de substitution isolée rend la ligne invalide (impossible à écrire en UTF-8).
function linesFromString(input) {
  const body = input.startsWith('\uFEFF') ? input.slice(1) : input;
  return body.split('\n').map((raw) => {
    const text = raw.endsWith('\r') ? raw.slice(0, -1) : raw;
    return { text, invalid: /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(text) };
  });
}

function toLines(input) {
  if (typeof input === 'string') return linesFromString(input);
  if (input instanceof Uint8Array) return linesFromBytes(input);
  return null;
}

// Analyse le fichier des noms. Jamais d'exception.
export function parseNoms(input) {
  const blocs = [];
  const erreurs = [];
  let lines;
  try {
    lines = toLines(input);
  } catch {
    lines = null;
  }
  if (lines === null) return { blocs, erreurs: [{ ligne: 0, message: 'Fichier illisible : texte attendu.' }] };
  const seen = new Set();
  let current = null; // bloc en cours (objet de blocs), ou 'ignore' après un en-tête refusé, ou null avant le premier en-tête
  const fail = (ligne, message) => erreurs.push({ ligne, message });
  lines.forEach(({ text, invalid }, index) => {
    const ligne = index + 1;
    if (invalid) {
      fail(ligne, 'Caractères illisibles : la ligne contient des octets qui ne sont pas de l\'UTF-8 valide (enregistre le fichier en UTF-8) ; ligne ignorée.');
      return;
    }
    const trimmed = text.trim();
    if (trimmed === '' || trimmed.startsWith('#')) return;
    if (trimmed.startsWith('[')) {
      const match = /^\[([^\]]*)\]$/.exec(trimmed);
      const id = match ? match[1].trim() : '';
      if (!match) {
        fail(ligne, `En-tête de bloc mal formé « ${extrait(trimmed)} » : écris l'identifiant entre crochets, par exemple [v0.6] ou [lot-5a] ; bloc ignoré.`);
        current = 'ignore';
      } else if (!id) {
        fail(ligne, 'Bloc sans identifiant : écris l\'identifiant entre les crochets, par exemple [v0.6] ou [lot-5a] ; bloc ignoré.');
        current = 'ignore';
      } else if (id !== id.toLowerCase() && (VERSION_ID_RE.test(id.toLowerCase()) || LOT_ID_RE.test(id.toLowerCase()))) {
        fail(ligne, `Identifiant « ${extrait(id)} » : écris-le en minuscules (« ${extrait(id.toLowerCase())} ») ; bloc ignoré.`);
        current = 'ignore';
      } else if (!VERSION_ID_RE.test(id) && (!LOT_ID_RE.test(id) || /^v\d/.test(id))) {
        const hint = /^v\d/.test(id) ? ' (une version s\'écrit v<nombre>.<nombre>, par exemple v0.6)' : ' (lettres minuscules, chiffres et tirets, par exemple lot-5a)';
        fail(ligne, `Identifiant de bloc invalide « ${extrait(id)} »${hint} ; bloc ignoré.`);
        current = 'ignore';
      } else if (seen.has(id)) {
        fail(ligne, `Identifiant en double « ${id} » : il a déjà un bloc plus haut ; ce second bloc est ignoré.`);
        current = 'ignore';
      } else {
        seen.add(id);
        current = { id, type: VERSION_ID_RE.test(id) ? 'version' : 'lot', ligne };
        blocs.push(current);
      }
      return;
    }
    if (current === 'ignore') return; // lignes d'un bloc refusé : déjà signalé par son en-tête
    const colon = text.indexOf(':');
    if (colon < 0) {
      fail(ligne, `Ligne incomprise « ${extrait(trimmed)} » : écris « clé: valeur » (nom, description, version ou afficher), un en-tête [identifiant] ou un commentaire commençant par # ; ligne ignorée.`);
      return;
    }
    const key = text.slice(0, colon).trim().toLowerCase();
    const value = text.slice(colon + 1).trim().replace(/\t/g, ' ');
    if (current === null) {
      fail(ligne, `Ligne « ${extrait(trimmed)} » hors de tout bloc : écris d'abord un en-tête comme [v0.6] ou [lot-5a] ; ligne ignorée.`);
      return;
    }
    if (!own(CLES, key)) {
      fail(ligne, `Clé inconnue « ${extrait(key)} » : clés possibles nom, description, version et afficher ; ligne ignorée.`);
      return;
    }
    if (CLES[key] === 'lot' && current.type === 'version') {
      fail(ligne, `Clé « ${key} » réservée aux lots : un bloc de version (${current.id}) n'accepte que nom et description ; ligne ignorée.`);
      return;
    }
    if (own(current, key)) {
      fail(ligne, `Clé « ${key} » en double dans le bloc ${current.id} : seule la première est gardée ; ligne ignorée.`);
      return;
    }
    if (value === '') {
      fail(ligne, `Valeur vide pour « ${key} » (bloc ${current.id}) : écris un texte après le deux-points, ou supprime la ligne ; ligne ignorée.`);
      return;
    }
    if ([...value].some((c) => c.charCodeAt(0) < 32 || (c.charCodeAt(0) >= 127 && c.charCodeAt(0) <= 159))) {
      fail(ligne, `Caractère de contrôle dans « ${key} » (bloc ${current.id}) : texte simple sur une ligne attendu ; ligne ignorée.`);
      return;
    }
    const length = [...value].length;
    if (key === 'nom' && length > MAX_NOM) {
      fail(ligne, `Nom trop long (${length} caractères, ${MAX_NOM} au plus) dans le bloc ${current.id} ; ligne ignorée.`);
      return;
    }
    if (key === 'description' && length > MAX_DESCRIPTION) {
      fail(ligne, `Description trop longue (${length} caractères, ${MAX_DESCRIPTION} au plus) dans le bloc ${current.id} ; ligne ignorée.`);
      return;
    }
    if (key === 'version' && !VERSION_ID_RE.test(value)) {
      fail(ligne, `Version mal formée « ${extrait(value)} » dans le bloc ${current.id} : écris v<nombre>.<nombre>, par exemple v0.6 ; ligne ignorée.`);
      return;
    }
    if (key === 'afficher') {
      const answer = value.toLowerCase();
      if (answer !== 'oui' && answer !== 'non') {
        fail(ligne, `« afficher » vaut « ${extrait(value)} » dans le bloc ${current.id} : écris oui ou non ; ligne ignorée.`);
        return;
      }
      current.afficher = answer === 'oui';
      return;
    }
    current[key] = value;
  });
  return { blocs, erreurs };
}

// Ensemble des identifiants que le fichier peut désigner : versions de versions.json, versions cibles des lots (après rattachement), lots du journal.
export function identifiantsConnus(versions, changelog) {
  const known = new Set();
  for (const v of isObject(versions) && Array.isArray(versions.versions) ? versions.versions : []) if (isObject(v) && typeof v.id === 'string') known.add(v.id);
  for (const lot of isObject(changelog) && Array.isArray(changelog.lots) ? changelog.lots : []) {
    if (!isObject(lot)) continue;
    if (typeof lot.name === 'string') known.add(lot.name);
    if (typeof lot.version === 'string' && VERSION_ID_RE.test(lot.version)) known.add(lot.version);
  }
  return known;
}

const clone = (value) => {
  try {
    return value === undefined ? value : structuredClone(value);
  } catch {
    return null;
  }
};

// Applique le fichier analysé (résultat de parseNoms, ou sa seule liste de blocs) aux copies de versions.json et du journal. Jamais d'exception.
export function appliquerNoms(infos, noms) {
  const versions = clone(isObject(infos) ? infos.versions : null) ?? null;
  const changelog = clone(isObject(infos) ? infos.changelog : null) ?? null;
  const blocs = Array.isArray(noms) ? noms : isObject(noms) && Array.isArray(noms.blocs) ? noms.blocs : [];
  const versionList = isObject(versions) && Array.isArray(versions.versions) ? versions.versions : [];
  const lotList = isObject(changelog) && Array.isArray(changelog.lots) ? changelog.lots : [];
  const versionById = new Map(versionList.filter((v) => isObject(v) && typeof v.id === 'string').map((v) => [v.id, v]));
  const lotById = new Map(lotList.filter((l) => isObject(l) && typeof l.name === 'string').map((l) => [l.name, l]));
  const valid = blocs.filter((b) => isObject(b) && typeof b.id === 'string' && (b.type === 'version' || b.type === 'lot'));
  const hidden = new Set();

  // Lots d'abord (le rattachement change les versions cibles connues).
  for (const b of valid.filter((x) => x.type === 'lot')) {
    const lot = lotById.get(b.id);
    if (!lot) continue;
    if (typeof b.nom === 'string') lot.titre = b.nom;
    if (typeof b.description === 'string') lot.points = [b.description, ...(Array.isArray(lot.points) ? lot.points.slice(1) : [])];
    if (typeof b.version === 'string' && VERSION_ID_RE.test(b.version)) lot.version = b.version;
    if (b.afficher === false) hidden.add(b.id);
  }
  for (const b of valid.filter((x) => x.type === 'version')) {
    const version = versionById.get(b.id);
    if (!version) continue;
    if (typeof b.nom === 'string') version.label = b.nom;
    if (typeof b.description === 'string') version.title = b.description;
  }
  const known = identifiantsConnus(versions, changelog);
  const inconnus = valid.filter((b) => !known.has(b.id)).map((b) => b.id);
  if (hidden.size && isObject(changelog) && Array.isArray(changelog.lots)) changelog.lots = changelog.lots.filter((l) => !(isObject(l) && hidden.has(l.name)));
  return { versions, changelog, inconnus };
}

// Message d'une erreur pour le journal de l'assembleur ou d'un test (nom du fichier et numéro de ligne).
export function formatErreur({ ligne, message }) {
  return `${NOMS_FICHIER}${ligne ? `, ligne ${ligne}` : ''} : ${message}`;
}
