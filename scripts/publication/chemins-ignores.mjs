// Lot 5q — Contrôle de publication : chemins ignorés par le workflow Tests, lus dans le texte de .github/workflows/tests.yml (jamais recopiés).
// Fonctions PURES (aucun disque, réseau ni git), sans dépendance : analyse limitée à la forme réelle du fichier (bloc `on:` → `push:` →
// `paths-ignore:` en liste entre crochets ou en liste à tirets). Toute autre forme (fichier absent, `paths:` à côté, liste sur plusieurs lignes,
// motif que GitHub interprète autrement : `?`, `+`, `[`, `]`, `{`, `}`, `!`) rend { erreur } : le contrôle est alors « NON VÉRIFIABLE », jamais « OK ».
// Correspondance des motifs comme les filtres de chemins de GitHub : `*` = zéro ou plusieurs caractères sauf `/` ; `**` = zéro ou plusieurs
// caractères quelconques ; `**/` = zéro ou plusieurs dossiers (`**/*.md` vise aussi `README.md` à la racine) ; le reste est littéral.

const NON_GERES = /[?+[\]{}]|^!/;
const indentation = (l) => l.length - l.trimStart().length;
const significative = (l) => l.trim() !== '' && !l.trimStart().startsWith('#');

// Retire un commentaire « # » hors guillemets (précédé d'une espace ou en début de valeur).
function sansCommentaire(s) {
  let guillemet = null;
  for (let i = 0; i < s.length; i += 1) {
    const c = s[i];
    if (guillemet) {
      if (c === '\\' && guillemet === '"') i += 1;
      else if (c === guillemet) {
        if (guillemet === "'" && s[i + 1] === "'") i += 1;
        else guillemet = null;
      }
    } else if (c === "'" || c === '"') guillemet = c;
    else if (c === '#' && (i === 0 || /\s/.test(s[i - 1]))) return s.slice(0, i).trimEnd();
  }
  return guillemet ? null : s.trimEnd();
}

// Valeur scalaire YAML simple : 'texte' ('' = '), "texte" (\\ et \" seulement), ou texte nu. null si illisible.
function scalaire(brut) {
  const s = brut.trim();
  if (s === '') return null;
  if (s.startsWith("'")) return /^'(?:[^']|'')*'$/.test(s) ? s.slice(1, -1).replace(/''/g, "'") : null;
  if (s.startsWith('"')) return /^"(?:[^"\\]|\\["\\])*"$/.test(s) ? s.slice(1, -1).replace(/\\(["\\])/g, '$1') : null;
  if (/^[[\]{},&*|>%@`]/.test(s) || /:\s|\s#/.test(s)) return null;
  return s;
}

// Liste entre crochets sur une ligne : [a, 'b', "c"]. null si illisible.
function listeEntreCrochets(s) {
  if (!s.startsWith('[') || !s.endsWith(']')) return null;
  const corps = s.slice(1, -1);
  const items = [];
  let courant = '';
  let guillemet = null;
  for (let i = 0; i < corps.length; i += 1) {
    const c = corps[i];
    if (guillemet) {
      courant += c;
      if (c === '\\' && guillemet === '"') {
        courant += corps[i + 1] ?? '';
        i += 1;
      } else if (c === guillemet) {
        if (guillemet === "'" && corps[i + 1] === "'") {
          courant += "'";
          i += 1;
        } else guillemet = null;
      }
    } else if (c === "'" || c === '"') {
      guillemet = c;
      courant += c;
    } else if (c === ',') {
      items.push(courant);
      courant = '';
    } else courant += c;
  }
  if (guillemet) return null;
  if (courant.trim() !== '' || items.length) items.push(courant);
  const valeurs = items.map(scalaire);
  return valeurs.every((v) => typeof v === 'string') ? valeurs : null;
}

// Bloc enfant d'une clé : les lignes qui suivent la ligne d'indice `i`, plus indentées qu'elle, jusqu'à la première qui ne l'est pas.
function blocEnfant(lignes, i) {
  const base = indentation(lignes[i]);
  const out = [];
  for (let k = i + 1; k < lignes.length; k += 1) {
    if (significative(lignes[k]) && indentation(lignes[k]) <= base) break;
    out.push(k);
  }
  return out;
}

// Clés directes (premier niveau d'indentation) d'un bloc : [{ cle, indice, valeur }].
function clesDirectes(lignes, indices) {
  const utiles = indices.filter((k) => significative(lignes[k]));
  if (utiles.length === 0) return [];
  const niveau = indentation(lignes[utiles[0]]);
  const out = [];
  for (const k of utiles) {
    if (indentation(lignes[k]) !== niveau) continue;
    const m = lignes[k].trim().match(/^(['"]?)([\w-]+)\1:(?:\s+(.*))?$/);
    if (m) out.push({ cle: m[2], indice: k, valeur: m[3] ?? '' });
    else if (!lignes[k].trim().startsWith('- ')) out.push({ cle: null, indice: k, valeur: lignes[k].trim() });
  }
  return out;
}

// { motifs: [..] } ou { erreur: '…' } : motifs `paths-ignore` du déclencheur `push` du texte d'un workflow.
export function lirePathsIgnore(texte) {
  if (typeof texte !== 'string' || texte.trim() === '') return { erreur: 'tests.yml absent ou vide' };
  const lignes = texte.replace(/^\uFEFF/, '').split(/\r\n|\n|\r/);
  if (lignes.some((l) => /^\t|^ *\t/.test(l))) return { erreur: 'tests.yml : tabulation dans l\'indentation' };
  const racine = lignes.map((l, k) => ({ l, k })).filter(({ l }) => significative(l) && indentation(l) === 0 && /^(on|'on'|"on"):(\s|$)/.test(l));
  if (racine.length !== 1) return { erreur: `tests.yml : ${racine.length === 0 ? 'aucun' : 'plusieurs'} bloc « on: »` };
  if (sansCommentaire(racine[0].l.replace(/^(on|'on'|"on"):/, '')) !== '') return { erreur: 'tests.yml : déclencheurs « on: » sur une ligne (aucun paths-ignore lisible)' };
  const push = clesDirectes(lignes, blocEnfant(lignes, racine[0].k)).filter((c) => c.cle === 'push');
  if (push.length !== 1) return { erreur: `tests.yml : ${push.length === 0 ? 'aucun' : 'plusieurs'} déclencheur « push »` };
  if (sansCommentaire(push[0].valeur) !== '') return { erreur: 'tests.yml : « push » sans bloc (aucun paths-ignore)' };
  const cles = clesDirectes(lignes, blocEnfant(lignes, push[0].indice));
  if (cles.some((c) => c.cle === 'paths')) return { erreur: 'tests.yml : « paths » dans push (forme non gérée)' };
  const pi = cles.filter((c) => c.cle === 'paths-ignore');
  if (pi.length !== 1) return { erreur: `tests.yml : ${pi.length === 0 ? 'aucun' : 'plusieurs'} « paths-ignore » dans push` };
  const valeur = sansCommentaire(pi[0].valeur);
  let motifs;
  if (valeur === null) return { erreur: 'tests.yml : paths-ignore illisible (guillemet non fermé)' };
  if (valeur !== '') {
    motifs = listeEntreCrochets(valeur);
    if (motifs === null) return { erreur: 'tests.yml : paths-ignore illisible (liste entre crochets sur une ligne attendue)' };
  } else {
    motifs = [];
    const base = indentation(lignes[pi[0].indice]);
    for (let k = pi[0].indice + 1; k < lignes.length; k += 1) {
      const l = lignes[k];
      if (!significative(l)) continue;
      if (indentation(l) < base || !l.trimStart().startsWith('- ')) break;
      const v = sansCommentaire(l.trimStart().slice(2));
      const s = v === null ? null : scalaire(v);
      if (typeof s !== 'string') return { erreur: `tests.yml : paths-ignore illisible (ligne ${k + 1})` };
      motifs.push(s);
    }
  }
  if (motifs.length === 0) return { erreur: 'tests.yml : paths-ignore vide' };
  const nonGere = motifs.find((m) => m === '' || NON_GERES.test(m));
  if (nonGere !== undefined) return { erreur: `tests.yml : motif non géré par le contrôle « ${nonGere} »` };
  return { motifs };
}

const echapper = (c) => c.replace(/[.*+?^${}()|[\]\\/-]/g, '\\$&');

// Expression régulière d'un motif de filtre de chemins GitHub (motifs déjà validés par lirePathsIgnore).
export function motifEnRegex(motif) {
  let re = '';
  for (let i = 0; i < motif.length;) {
    if (motif.startsWith('**/', i)) {
      re += '(?:[^]*/)?';
      i += 3;
    } else if (motif.startsWith('**', i)) {
      re += '[^]*';
      i += 2;
    } else if (motif[i] === '*') {
      re += '[^/]*';
      i += 1;
    } else {
      const c = String.fromCodePoint(motif.codePointAt(i));
      re += echapper(c);
      i += c.length;
    }
  }
  return new RegExp(`^${re}$`, 'u');
}

// Le chemin (relatif à la racine du dépôt, séparateur « / ») est-il visé par l'un des motifs ? Un chemin qui n'est pas une chaîne n'est jamais ignoré.
export function estIgnore(chemin, motifs) {
  if (typeof chemin !== 'string' || chemin === '' || !Array.isArray(motifs)) return false;
  return motifs.some((m) => typeof m === 'string' && m !== '' && !NON_GERES.test(m) && motifEnRegex(m).test(chemin));
}
