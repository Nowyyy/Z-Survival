// Lot 8l-D — Regroupe des fiches terminées de Docs/ref/ (audits, plans, relevés d'anciens lots) dans un fichier d'archive
// (Docs/ref/archives/<nom>.md : sommaire, puis le texte intégral de chaque fiche, sans modification). Même contrat que
// scripts/docs/regrouper.mjs pour les bilans : jamais de perte ; le fichier d'archive est écrit, relu sur le disque, et chaque fiche y est
// retrouvée octet pour octet (et par son empreinte SHA-256) avant la suppression de son fichier ; au moindre écart, rien n'est supprimé.
// Node natif, sans dépendance, idempotent. Les chemins cités par les autres documents ne sont pas réécrits (scripts/docs/auditer.mjs).
//
//   node scripts/docs/archiver-ref.mjs --archive Docs/ref/archives/<nom>.md --fiche Docs/ref/<a>.md [--fiche …] [--titre <texte>] [--dry-run]
//
// Format (chaque fiche recopiée octet pour octet ; la lecture saute le texte par sa longueur, un faux marqueur ne la trompe pas) :
//   <a id="<nom>"></a>
//   <!-- fiche: <nom> | ancien: Docs/ref/<nom>.md | octets: N | sha256: <64 hex> -->
//   <texte exact>
//   <!-- fin de la fiche: <nom> -->
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { sha256 } from './bilans.mjs';

export class ArchiveError extends Error {}
const FICHE_RE = /^Docs\/ref\/([a-z0-9][a-z0-9.-]{0,80})\.md$/;
const ARCHIVE_RE = /^Docs\/ref\/archives\/[a-z0-9][a-z0-9.-]{0,80}\.md$/;
// Fiches jamais archivées (lues par des règles de CLAUDE.md, par des tests ou par des scripts).
export const PROTEGEES = Object.freeze(['conventions', 'environnement', 'etage', 'tests-paliers', 'publication-versions', 'site-adresses', 'controle-publication', 'debug', 'lampes', 'options-graphiques', 'menu-principal', 'sauvegarde-v2', 'economie', 'affinage']);
const enBuffer = (x) => (Buffer.isBuffer(x) ? x : Buffer.from(String(x), 'utf8'));
const nomDe = (chemin) => {
  const m = FICHE_RE.exec(chemin);
  if (!m) throw new ArchiveError(`fiche refusée (Docs/ref/<nom>.md attendu) : ${JSON.stringify(chemin)}`);
  if (PROTEGEES.includes(m[1])) throw new ArchiveError(`fiche protégée, jamais archivée : ${chemin}`);
  return m[1];
};
const titreSur = (t) => String(t ?? '').replace(/[\r\n]+/g, ' ').replace(/[[\]<>]/g, '').replace(/--/g, '—').trim().slice(0, 200);
const premierTitre = (texte) => titreSur((/^#\s+(.+)$/m.exec(enBuffer(texte).toString('utf8')) ?? [])[1] ?? '');

// Texte d'une archive. fiches : [{ nom, texte }] dans l'ordre voulu.
export function composerArchive({ titre, fiches }) {
  if (!Array.isArray(fiches) || fiches.length === 0) throw new ArchiveError('aucune fiche à archiver');
  const vus = new Set();
  for (const f of fiches) {
    nomDe(`Docs/ref/${f.nom}.md`);
    if (vus.has(f.nom)) throw new ArchiveError(`fiche en double : ${f.nom}`);
    vus.add(f.nom);
  }
  const tete = [
    `# ${titreSur(titre) || 'Fiches archivées de Docs/ref'}`,
    '',
    '> Fiches terminées de `Docs/ref/` (audits, plans, relevés d\'anciens lots), regroupées par `scripts/docs/archiver-ref.mjs` et recopiées **mot pour mot** (aucune modification). Chaque fiche est encadrée par deux commentaires ; le premier donne son ancien fichier, sa taille en octets et l\'empreinte SHA-256 de son texte. Les chemins qu\'elles citent sont ceux de leur époque. Renvoi : `<ce fichier>#<nom>`.',
    '',
    '## Sommaire',
    '',
    ...fiches.map((f) => `- [${f.nom}${premierTitre(f.texte) ? ` — ${premierTitre(f.texte)}` : ''}](#${f.nom}) (ancien fichier \`Docs/ref/${f.nom}.md\`)`),
    '',
  ].join('\n');
  const morceaux = [Buffer.from(`${tete}\n`, 'utf8')];
  for (const f of fiches) {
    const t = enBuffer(f.texte);
    morceaux.push(Buffer.from(`<a id="${f.nom}"></a>\n<!-- fiche: ${f.nom} | ancien: Docs/ref/${f.nom}.md | octets: ${t.length} | sha256: ${sha256(t)} -->\n`, 'utf8'));
    morceaux.push(t);
    morceaux.push(Buffer.from(`\n<!-- fin de la fiche: ${f.nom} -->\n\n`, 'utf8'));
  }
  return Buffer.concat(morceaux);
}

const DEBUT_RE = /<!-- fiche: ([a-z0-9][a-z0-9.-]{0,80}) \| ancien: (Docs\/ref\/[a-z0-9][a-z0-9.-]{0,80}\.md) \| octets: ([0-9]{1,9}) \| sha256: ([0-9a-f]{64}) -->\n/g;
// Fiches d'une archive : [{ nom, ancien, octets, sha256, texte (Buffer) }] ; refuse une archive incohérente.
export function lireArchive(contenu) {
  const buf = enBuffer(contenu);
  const brut = buf.toString('latin1'); // un octet = un caractère
  const out = [];
  const vus = new Set();
  DEBUT_RE.lastIndex = 0;
  for (let m = DEBUT_RE.exec(brut); m; m = DEBUT_RE.exec(brut)) {
    const [entete, nom, ancien, octets, empreinte] = m;
    if (ancien !== `Docs/ref/${nom}.md`) throw new ArchiveError(`${nom} : ancien chemin inattendu ${ancien}`);
    if (vus.has(nom)) throw new ArchiveError(`fiche en double : ${nom}`);
    const debut = m.index + entete.length;
    const fin = debut + Number(octets);
    if (fin > buf.length) throw new ArchiveError(`${nom} : texte tronqué`);
    const texte = buf.subarray(debut, fin);
    if (sha256(texte) !== empreinte) throw new ArchiveError(`${nom} : empreinte SHA-256 différente (texte modifié)`);
    const finMarque = `\n<!-- fin de la fiche: ${nom} -->\n`;
    if (brut.slice(fin, fin + finMarque.length) !== finMarque) throw new ArchiveError(`${nom} : marqueur de fin absent`);
    vus.add(nom);
    out.push({ nom, ancien, octets: Number(octets), sha256: empreinte, texte: Buffer.from(texte) });
    DEBUT_RE.lastIndex = fin + finMarque.length;
  }
  return out;
}

export function verifierArchive(contenu, fiches) {
  const lues = lireArchive(contenu);
  if (lues.length !== fiches.length) throw new ArchiveError(`${lues.length} fiches lues pour ${fiches.length} attendues`);
  fiches.forEach((f, i) => {
    if (lues[i].nom !== f.nom) throw new ArchiveError(`ordre inattendu : ${lues[i].nom} au lieu de ${f.nom}`);
    if (!lues[i].texte.equals(enBuffer(f.texte))) throw new ArchiveError(`${f.nom} : texte différent après archivage`);
  });
  return lues;
}

// Plan sans écriture : fiches déjà archivées gardées (dans leur ordre), puis les nouvelles. Une fiche déjà archivée et encore présente
// (reprise après une interruption) n'est supprimée que si les deux textes sont identiques.
export function planifier({ racine, archive, fiches, titre }) {
  if (!ARCHIVE_RE.test(archive)) throw new ArchiveError(`archive refusée (Docs/ref/archives/<nom>.md attendu) : ${JSON.stringify(archive)}`);
  const avant = existsSync(join(racine, archive)) ? readFileSync(join(racine, archive)) : null;
  const liste = avant ? lireArchive(avant).map((f) => ({ nom: f.nom, texte: f.texte })) : [];
  const aSupprimer = [];
  for (const chemin of fiches) {
    const nom = nomDe(chemin);
    if (!existsSync(join(racine, chemin))) {
      if (liste.some((f) => f.nom === nom)) continue;
      throw new ArchiveError(`fiche absente : ${chemin}`);
    }
    const texte = readFileSync(join(racine, chemin));
    const deja = liste.find((f) => f.nom === nom);
    if (deja && !deja.texte.equals(texte)) throw new ArchiveError(`${nom} : déjà archivée avec un autre texte que ${chemin} : rien n'est fait`);
    if (!deja) liste.push({ nom, texte });
    aSupprimer.push(chemin);
  }
  const apres = composerArchive({ titre, fiches: liste });
  verifierArchive(apres, liste);
  return { archive, fiches: liste, avant, apres, change: !avant || !avant.equals(apres), aSupprimer };
}

export function appliquer(plan, { racine, dryRun = false, log = console.log } = {}) {
  if (!dryRun && plan.change) {
    mkdirSync(dirname(join(racine, plan.archive)), { recursive: true });
    writeFileSync(join(racine, plan.archive), plan.apres);
    verifierArchive(readFileSync(join(racine, plan.archive)), plan.fiches); // relu sur le disque avant toute suppression
  }
  log(`${dryRun ? '[à blanc] ' : ''}${plan.archive} : ${plan.fiches.length} fiches${plan.change ? '' : ' (inchangé)'}`);
  const rapport = [];
  const ecrit = dryRun ? plan.apres : readFileSync(join(racine, plan.archive));
  const lues = lireArchive(ecrit);
  for (const chemin of plan.aSupprimer) {
    const nom = nomDe(chemin);
    const texte = readFileSync(join(racine, chemin));
    const trouvee = lues.find((f) => f.nom === nom);
    if (!trouvee || !trouvee.texte.equals(texte)) throw new ArchiveError(`${chemin} : introuvable mot pour mot dans ${plan.archive} : non supprimé`);
    if (!dryRun) unlinkSync(join(racine, chemin));
    rapport.push({ nom, ancien: chemin, octets: texte.length, sha256: sha256(texte) });
    log(`${dryRun ? '[à blanc] supprimerait' : 'supprimé'} ${chemin}`);
  }
  return rapport;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const argv = process.argv.slice(2);
  const tous = (n) => argv.flatMap((a, i) => (a === n ? [argv[i + 1]] : []));
  const racine = resolve(tous('--racine')[0] ?? resolve(import.meta.dirname, '..', '..'));
  const archive = tous('--archive')[0];
  const fiches = tous('--fiche');
  if (!archive || fiches.length === 0) {
    console.error('Usage : node scripts/docs/archiver-ref.mjs --archive Docs/ref/archives/<nom>.md --fiche Docs/ref/<a>.md [--fiche …] [--titre <texte>] [--dry-run]');
    process.exit(2);
  }
  try {
    const rapport = appliquer(planifier({ racine, archive, fiches, titre: tous('--titre')[0] }), { racine, dryRun: argv.includes('--dry-run') });
    console.log('\n| Fiche | Ancien fichier | Octets | SHA-256 |\n|---|---|---|---|');
    for (const r of rapport) console.log(`| ${r.nom} | \`${r.ancien}\` | ${r.octets} | \`${r.sha256}\` |`);
  } catch (e) {
    if (!(e instanceof ArchiveError)) throw e;
    console.error(`Refusé : ${e.message}`);
    process.exit(1);
  }
}
