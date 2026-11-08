// Lot 5m-B — Regroupe les bilans de Docs/lots/ d'une ou plusieurs versions publiées en un fichier par version
// (Docs/lots/versions/v0.N.md : sommaire, puis le texte intégral de chaque bilan, sans modification, dans l'ordre du journal).
// Node natif, sans dépendance, idempotent. Jamais de perte : le fichier groupé est écrit, relu sur le disque, et chaque bilan y est
// retrouvé octet pour octet (et par son empreinte SHA-256) avant la suppression de son fichier séparé ; au moindre écart, rien n'est supprimé.
//
//   node scripts/docs/regrouper.mjs --version v0.6 [--version …] [--rattacher lot-3h=v0.5]… [--garder lot-5a]… [--dry-run] [--racine <dépôt>]
//
// Rattachement : data/changelog.json (champ « version », sinon ordre du journal et bornes de scripts/docs/bilans.mjs), corrigé par
// --rattacher ; --garder laisse un bilan séparé. Seules les versions de versions.json (publiées) sont acceptées. Un bilan déjà groupé et
// encore présent séparément (reprise après une interruption) n'est supprimé que si les deux textes sont identiques. Les chemins cités par
// les autres documents ne sont pas réécrits : `node scripts/docs/auditer.mjs` liste les anciens chemins de bilans encore cités.
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { BilanError, LOT_RE, VERSION_RE, cheminGroupe, cheminSepare, composerGroupe, lireGroupe, sha256, versionParJournal } from './bilans.mjs';

// Plan du regroupement, sans rien écrire. Renvoie { groupes: [{ version, fichier, bilans: [{ lot, source, texte, titre }], avant: Buffer|null,
// apres: Buffer, change }], aSupprimer: [chemins séparés] }.
export function planifier({ racine, versions, rattacher = {}, garder = [] }) {
  const lireJson = (f) => JSON.parse(readFileSync(join(racine, f), 'utf8'));
  const journal = lireJson('data/changelog.json').lots ?? [];
  const publiees = new Set((lireJson('versions.json').versions ?? []).map((v) => v.id));
  for (const v of versions) {
    if (!VERSION_RE.test(v)) throw new BilanError(`version invalide : ${JSON.stringify(v)}`);
    if (!publiees.has(v)) throw new BilanError(`${v} n'est pas une version publiée de versions.json : rien à regrouper`);
  }
  for (const [lot, v] of Object.entries(rattacher)) {
    if (!LOT_RE.test(lot) || !VERSION_RE.test(v)) throw new BilanError(`rattachement invalide : ${lot}=${v}`);
  }
  for (const lot of garder) if (!LOT_RE.test(lot)) throw new BilanError(`nom de lot invalide : ${JSON.stringify(lot)}`);
  const rang = new Map(journal.map((e, i) => [e.name, i]));
  const titre = new Map(journal.map((e) => [e.name, e.titre]));
  const version = versionParJournal(journal);
  for (const [lot, v] of Object.entries(rattacher)) version.set(lot, v);
  const groupes = [];
  const aSupprimer = [];
  for (const v of versions) {
    const fichier = cheminGroupe(v);
    const avant = existsSync(join(racine, fichier)) ? readFileSync(join(racine, fichier)) : null;
    const dejaGroupes = avant ? lireGroupe(avant) : [];
    const parLot = new Map(dejaGroupes.map((b) => [b.lot, { lot: b.lot, source: fichier, texte: b.texte }]));
    for (const [lot, vv] of version) {
      if (vv !== v || garder.includes(lot)) continue;
      const sep = cheminSepare(lot);
      if (!existsSync(join(racine, sep))) continue;
      const texte = readFileSync(join(racine, sep));
      if (parLot.has(lot)) {
        if (!parLot.get(lot).texte.equals(texte)) throw new BilanError(`${lot} : déjà groupé dans ${fichier} avec un autre texte que ${sep} : rien n'est fait`);
      } else parLot.set(lot, { lot, source: sep, texte });
      aSupprimer.push(sep);
    }
    if (parLot.size === 0) continue;
    for (const lot of parLot.keys()) if (!rang.has(lot)) throw new BilanError(`${lot} : absent de data/changelog.json (ordre inconnu)`);
    const bilans = [...parLot.values()].sort((a, b) => rang.get(a.lot) - rang.get(b.lot)).map((b) => ({ ...b, titre: titre.get(b.lot) }));
    const apres = composerGroupe({ version: v, bilans });
    verifierGroupe(apres, bilans);
    groupes.push({ version: v, fichier, bilans, avant, apres, change: !avant || !avant.equals(apres) });
  }
  return { groupes, aSupprimer };
}

// Chaque bilan attendu est retrouvé dans le contenu, octet pour octet, dans l'ordre ; rien d'autre.
export function verifierGroupe(contenu, bilans) {
  const lus = lireGroupe(contenu);
  if (lus.length !== bilans.length) throw new BilanError(`${lus.length} bilans lus pour ${bilans.length} attendus`);
  bilans.forEach((b, i) => {
    if (lus[i].lot !== b.lot) throw new BilanError(`ordre inattendu : ${lus[i].lot} au lieu de ${b.lot}`);
    if (!lus[i].texte.equals(Buffer.isBuffer(b.texte) ? b.texte : Buffer.from(b.texte, 'utf8'))) throw new BilanError(`${b.lot} : texte différent après regroupement`);
  });
  return lus;
}

export function appliquer(plan, { racine, dryRun = false, log = console.log } = {}) {
  const rapport = [];
  for (const g of plan.groupes) {
    if (!dryRun && g.change) {
      mkdirSync(join(racine, 'Docs/lots/versions'), { recursive: true });
      writeFileSync(join(racine, g.fichier), g.apres);
      verifierGroupe(readFileSync(join(racine, g.fichier)), g.bilans); // relu sur le disque avant toute suppression
    }
    for (const b of g.bilans) rapport.push({ version: g.version, lot: b.lot, source: b.source, octets: b.texte.length, sha256: sha256(b.texte) });
    log(`${dryRun ? '[à blanc] ' : ''}${g.fichier} : ${g.bilans.length} bilans${g.change ? '' : ' (inchangé)'}`);
  }
  for (const sep of plan.aSupprimer) {
    const g = plan.groupes.find((x) => x.bilans.some((b) => cheminSepare(b.lot) === sep));
    const ecrit = dryRun ? g.apres : readFileSync(join(racine, g.fichier));
    const lot = sep.slice('Docs/lots/'.length, -3);
    const trouve = lireGroupe(ecrit).find((b) => b.lot === lot);
    if (!trouve || !trouve.texte.equals(readFileSync(join(racine, sep)))) throw new BilanError(`${sep} : introuvable mot pour mot dans ${g.fichier} : non supprimé`);
    if (!dryRun) unlinkSync(join(racine, sep));
    log(`${dryRun ? '[à blanc] supprimerait' : 'supprimé'} ${sep}`);
  }
  return rapport;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const argv = process.argv.slice(2);
  const tous = (n) => argv.flatMap((a, i) => (a === n ? [argv[i + 1]] : []));
  const racine = resolve(tous('--racine')[0] ?? resolve(import.meta.dirname, '..', '..'));
  const versions = tous('--version');
  const rattacher = Object.fromEntries(tous('--rattacher').map((x) => String(x).split('=')));
  const garder = tous('--garder');
  const dryRun = argv.includes('--dry-run');
  if (versions.length === 0) {
    console.error('Usage : node scripts/docs/regrouper.mjs --version v0.N [--version …] [--rattacher lot-X=v0.N]… [--garder lot-X]… [--dry-run]');
    process.exit(2);
  }
  try {
    const rapport = appliquer(planifier({ racine, versions, rattacher, garder }), { racine, dryRun });
    console.log('\n| Version | Bilan | Source | Octets | SHA-256 |\n|---|---|---|---|---|');
    for (const r of rapport) console.log(`| ${r.version} | ${r.lot} | \`${r.source}\` | ${r.octets} | \`${r.sha256}\` |`);
  } catch (e) {
    if (!(e instanceof BilanError)) throw e;
    console.error(`Refusé : ${e.message}`);
    process.exit(1);
  }
}
