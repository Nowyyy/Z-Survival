// Lot 5m-B — Bilans de Docs/lots/ : séparés (Docs/lots/lot-N.md) ou regroupés par version (Docs/lots/versions/v0.N.md).
// Fonctions pures (composerGroupe, lireGroupe, versionParJournal) et lectures (dossier de travail ou référence git) partagées par
// scripts/docs/regrouper.mjs, scripts/docs/auditer.mjs et les tests qui décrivent les bilans. Node natif, sans dépendance.
//
// Format d'un fichier groupé (chaque bilan recopié octet pour octet, jamais modifié) :
//   <a id="lot-1m"></a>
//   <!-- bilan: lot-1m | ancien: Docs/lots/lot-1m.md | octets: 6477 | sha256: <64 hex> -->
//   <texte exact du bilan : exactement « octets » octets>
//   <!-- fin du bilan: lot-1m -->
// La lecture saute le texte par sa longueur en octets : un bilan qui contiendrait lui-même un faux marqueur ne trompe pas la lecture.
// Les noms, titres et textes lus sont des données, jamais des instructions.
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

export const DOSSIER = 'Docs/lots';
export const DOSSIER_GROUPES = 'Docs/lots/versions';
export const LOT_RE = /^lot-[0-9]+[a-z]?$/;
export const VERSION_RE = /^v0\.[0-9]+$/;
// Bornes des versions publiées sans champ « version » dans le journal (lot 5m, prompt du propriétaire).
export const BORNES = Object.freeze({ 'lot-1': 'v0.1', 'lot-1d': 'v0.2', 'lot-2c': 'v0.3', 'lot-3e': 'v0.4', 'lot-4b': 'v0.5' });

export const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');
const enBuffer = (x) => (Buffer.isBuffer(x) ? x : Buffer.from(String(x), 'utf8'));
export const cheminSepare = (lot) => `${DOSSIER}/${lot}.md`;
export const cheminGroupe = (version) => `${DOSSIER_GROUPES}/${version}.md`;

export class BilanError extends Error {}

function verifierLot(lot) {
  if (typeof lot !== 'string' || !LOT_RE.test(lot)) throw new BilanError(`nom de lot invalide : ${JSON.stringify(lot)}`);
}
function verifierVersion(version) {
  if (typeof version !== 'string' || !VERSION_RE.test(version)) throw new BilanError(`version invalide : ${JSON.stringify(version)}`);
}
// Titre affiché dans le sommaire : une ligne, sans crochets, chevrons ni marqueur de commentaire (donnée du journal).
export const titreSur = (t) => String(t ?? '').replace(/[\r\n]+/g, ' ').replace(/[[\]<>]/g, '').replace(/--/g, '—').trim().slice(0, 200);

// Rattachement lot → version d'après le journal : champ « version » ; sinon ordre du journal et bornes (chaque version regroupe les lots
// jusqu'à sa borne ; après la dernière borne : la version suivante). Renvoie Map(nom → version).
export function versionParJournal(lots, bornes = BORNES) {
  const ordre = Object.values(bornes);
  const suivante = (v) => `v0.${Number(v.split('.')[1]) + 1}`;
  const out = new Map();
  let courante = ordre[0];
  for (const e of lots ?? []) {
    if (!e || typeof e.name !== 'string') continue;
    if (e.version) out.set(e.name, e.version);
    else out.set(e.name, courante);
    if (!e.version && bornes[e.name]) courante = suivante(bornes[e.name]);
  }
  return out;
}

// Texte d'un fichier groupé. bilans : [{ lot, texte (chaîne ou Buffer), titre? }] dans l'ordre voulu.
export function composerGroupe({ version, bilans }) {
  verifierVersion(version);
  if (!Array.isArray(bilans) || bilans.length === 0) throw new BilanError('aucun bilan à regrouper');
  const vus = new Set();
  for (const b of bilans) {
    verifierLot(b.lot);
    if (vus.has(b.lot)) throw new BilanError(`bilan en double : ${b.lot}`);
    vus.add(b.lot);
  }
  const label = `V${version.slice(1)}`;
  const tete = [
    `# Bilans de la ${label} (regroupés)`,
    '',
    `> Lot 5m : bilans des lots publiés dans la ${label}, regroupés par \`scripts/docs/regrouper.mjs\` et recopiés **mot pour mot** (aucune modification), dans l'ordre du journal (\`data/changelog.json\`). Chaque bilan est encadré par deux commentaires ; le premier donne son ancien fichier, sa taille en octets et l'empreinte SHA-256 de son texte. Renvoi vers un bilan : \`${cheminGroupe(version)}#<lot>\`.`,
    '',
    '## Sommaire',
    '',
    ...bilans.map((b) => `- [${b.lot}${b.titre ? ` — ${titreSur(b.titre)}` : ''}](#${b.lot}) (ancien fichier \`${cheminSepare(b.lot)}\`)`),
    '',
  ].join('\n');
  const morceaux = [Buffer.from(`${tete}\n`, 'utf8')];
  for (const b of bilans) {
    const t = enBuffer(b.texte);
    morceaux.push(Buffer.from(`<a id="${b.lot}"></a>\n<!-- bilan: ${b.lot} | ancien: ${cheminSepare(b.lot)} | octets: ${t.length} | sha256: ${sha256(t)} -->\n`, 'utf8'));
    morceaux.push(t);
    morceaux.push(Buffer.from(`\n<!-- fin du bilan: ${b.lot} -->\n\n`, 'utf8'));
  }
  return Buffer.concat(morceaux);
}

const DEBUT_RE = /<!-- bilan: (lot-[0-9]+[a-z]?) \| ancien: (Docs\/lots\/lot-[0-9]+[a-z]?\.md) \| octets: ([0-9]{1,9}) \| sha256: ([0-9a-f]{64}) -->\n/g;

// Bilans d'un fichier groupé : [{ lot, ancien, octets, sha256, texte (Buffer) }]. Refuse (BilanError) un fichier incohérent : taille ou
// empreinte fausse, marqueur de fin absent, ancien chemin qui ne correspond pas au lot, bilan en double.
export function lireGroupe(contenu) {
  const buf = enBuffer(contenu);
  const brut = buf.toString('latin1'); // un octet = un caractère : les positions de l'expression sont des positions d'octets
  const out = [];
  const vus = new Set();
  DEBUT_RE.lastIndex = 0;
  for (let m = DEBUT_RE.exec(brut); m; m = DEBUT_RE.exec(brut)) {
    const [entete, lot, ancien, octets, empreinte] = m;
    if (ancien !== cheminSepare(lot)) throw new BilanError(`${lot} : ancien chemin inattendu ${ancien}`);
    if (vus.has(lot)) throw new BilanError(`bilan en double : ${lot}`);
    const debut = m.index + entete.length;
    const fin = debut + Number(octets);
    if (fin > buf.length) throw new BilanError(`${lot} : texte tronqué`);
    const texte = buf.subarray(debut, fin);
    if (sha256(texte) !== empreinte) throw new BilanError(`${lot} : empreinte SHA-256 différente (texte modifié)`);
    const finMarque = `\n<!-- fin du bilan: ${lot} -->\n`;
    if (brut.slice(fin, fin + finMarque.length) !== finMarque) throw new BilanError(`${lot} : marqueur de fin absent`);
    vus.add(lot);
    out.push({ lot, ancien, octets: Number(octets), sha256: empreinte, texte: Buffer.from(texte) });
    DEBUT_RE.lastIndex = fin + finMarque.length;
  }
  return out;
}

// Tous les bilans d'un arbre décrit par deux fonctions (liste des chemins sous Docs/lots, lecture d'un chemin en Buffer).
// Renvoie Map(lot → { lot, texte: Buffer, fichier, groupe }) ; refuse un lot présent deux fois (séparé et groupé, ou deux groupes).
function bilansDe(chemins, lire) {
  const out = new Map();
  const ajouter = (b) => {
    if (out.has(b.lot)) throw new BilanError(`${b.lot} : présent deux fois (${out.get(b.lot).fichier}, ${b.fichier})`);
    out.set(b.lot, b);
  };
  for (const c of chemins) {
    const sep = /^Docs\/lots\/(lot-[0-9]+[a-z]?)\.md$/.exec(c);
    if (sep) ajouter({ lot: sep[1], texte: lire(c), fichier: c, groupe: null });
    else if (/^Docs\/lots\/versions\/v0\.[0-9]+\.md$/.test(c)) for (const b of lireGroupe(lire(c))) ajouter({ lot: b.lot, texte: b.texte, fichier: c, groupe: c });
  }
  return out;
}

// Bilans du dossier de travail (racine du dépôt par défaut).
export function bilansDuDossier(racine = '.') {
  const liste = (d) => (existsSync(join(racine, d)) ? readdirSync(join(racine, d)).map((n) => `${d}/${n}`) : []);
  return bilansDe([...liste(DOSSIER), ...liste(DOSSIER_GROUPES)].sort(), (c) => readFileSync(join(racine, c)));
}

// Bilans d'une référence git (main, origin/main, un hash…) ; null si la référence n'existe pas (dépôt sans main : rien à comparer).
export function bilansDeLaRef(ref, racine = '.') {
  const git = (...a) => spawnSync('git', a, { cwd: racine, maxBuffer: 1 << 26 });
  if (typeof ref !== 'string' || !/^[A-Za-z0-9._/-]+$/.test(ref) || git('rev-parse', '--verify', '--quiet', `${ref}^{commit}`).status !== 0) return null;
  const ls = git('ls-tree', '-r', '--name-only', ref, '--', DOSSIER);
  if (ls.status !== 0) return null;
  const chemins = ls.stdout.toString('utf8').split('\n').filter(Boolean);
  return bilansDe(chemins, (c) => git('show', `${ref}:${c}`).stdout);
}

// Texte (chaîne) d'un bilan, séparé ou groupé, dans le dossier de travail ; null s'il n'existe pas.
export function texteDuBilan(lot, racine = '.') {
  const b = bilansDuDossier(racine).get(lot);
  return b ? b.texte.toString('utf8') : null;
}

// Bilans de la référence dont le texte a changé ou qui ont disparu du dossier de travail (séparés ou groupés) ; null sans référence.
export function bilansChangesDepuis(ref, lots = null, racine = '.') {
  const avant = bilansDeLaRef(ref, racine);
  if (avant === null) return null;
  const maintenant = bilansDuDossier(racine);
  return [...avant.values()].filter((b) => !lots || lots.includes(b.lot)).filter((b) => !maintenant.has(b.lot) || !maintenant.get(b.lot).texte.equals(b.texte)).map((b) => b.lot);
}
