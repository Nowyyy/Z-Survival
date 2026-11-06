// Lot 4e-B — Sélection des tests par zone (fonctions pures : aucune lecture de fichier, aucun appel à git).
// Fichiers modifiés → zones touchées → fermeture inverse (une zone touchée rejoue toutes celles qui en dépendent, directement ou non)
// → fichiers Vitest et Playwright. Tout fichier qu'aucune zone ne revendique rejoue tout ; la documentation seule ne rejoue rien ;
// les fichiers de « rejeu-total » (paquets, configurations, table, budget, workflows, jetons de couleur…) rejouent tout.
import { correspond } from './glob.mjs';

export const estTest = (f) => /^tests\/(?:unit\/[^/]+\.test\.js|e2e\/[^/]+\.spec\.js)$/.test(f);

export function estDocumentation(chemin, table) {
  const doc = table.documentation ?? { inclus: ['Docs/**', '**/*.md'], exclus: [] };
  return correspond(chemin, doc.inclus) && !correspond(chemin, doc.exclus);
}

export const declencheRejeuTotal = (chemin, table) => correspond(chemin, table['rejeu-total'] ?? []);
export const zonesDe = (chemin, table) => table.zones.filter((z) => correspond(chemin, z.sources)).map((z) => z.id);

// Cycles dans les dépendances : liste des cycles trouvés (vide si aucun). Un identifiant inconnu est signalé à part.
export function cyclesDe(table) {
  const dep = new Map(table.zones.map((z) => [z.id, z.dependances ?? []]));
  const cycles = [];
  const etat = new Map();
  const visite = (id, chemin) => {
    if (etat.get(id) === 'fait') return;
    if (etat.get(id) === 'en cours') {
      cycles.push([...chemin.slice(chemin.indexOf(id)), id].join(' → '));
      return;
    }
    etat.set(id, 'en cours');
    for (const d of dep.get(id) ?? []) visite(d, [...chemin, id]);
    etat.set(id, 'fait');
  };
  for (const id of dep.keys()) visite(id, []);
  return cycles;
}

// Fermeture inverse : les zones touchées et toutes celles qui en dépendent. Refuse une table à cycle (la fermeture serait sans fin).
export function fermetureInverse(touchees, table) {
  const cycles = cyclesDe(table);
  if (cycles.length) throw new Error(`dépendances cycliques entre zones : ${cycles[0]}`);
  const parents = new Map(table.zones.map((z) => [z.id, []]));
  for (const z of table.zones) for (const d of z.dependances ?? []) parents.get(d)?.push(z.id);
  const out = new Map();
  const file = [...touchees].map((id) => [id, null]);
  while (file.length) {
    const [id, via] = file.shift();
    if (out.has(id)) continue;
    out.set(id, via);
    for (const p of parents.get(id) ?? []) if (!out.has(p)) file.push([p, id]);
  }
  return out; // id → zone par laquelle elle est atteinte (null si touchée directement)
}

const uniq = (a) => [...new Set(a)].sort();

/**
 * @param {object} o
 * @param {string[]} o.fichiers fichiers modifiés (relatifs à la racine)
 * @param {object} o.table tests/selection.json
 * @param {string} [o.base] référence de comparaison (pour les raisons)
 * @param {string|null} [o.forcerTout] raison d'un rejeu total imposé (--tout, complet périodique, version introuvable)
 * @param {string[]} [o.vitestChanged] fichiers rendus par `vitest list --changed <base>` (graphe d'imports de Vitest)
 */
export function selectionner({ fichiers, table, base = 'base', forcerTout = null, vitestChanged = [] }) {
  const toutesZones = table.zones.map((z) => z.id);
  const res = { base, mode: 'zones', raison: '', fichiers: uniq(fichiers), documentation: [], declencheurs: [], inconnus: [], testsModifies: [], touchees: {}, rejouees: [], sautees: [], vitest: [], e2e: [], complet: [], fumee: [...(table.fumee ?? [])] };
  for (const f of res.fichiers) {
    if (estDocumentation(f, table)) res.documentation.push(f);
    else if (declencheRejeuTotal(f, table)) res.declencheurs.push(f);
    else if (estTest(f)) res.testsModifies.push(f);
    else {
      const zs = zonesDe(f, table);
      if (!zs.length) res.inconnus.push(f);
      for (const z of zs) (res.touchees[z] ??= []).push(f);
    }
  }
  if (forcerTout) res.raison = forcerTout;
  else if (res.declencheurs.length) res.raison = `fichier qui impose le rejeu total : ${res.declencheurs.slice(0, 3).join(', ')}`;
  else if (res.inconnus.length) res.raison = `fichier qu'aucune zone ne revendique (défaut « ${table.defaut ?? 'tout'} ») : ${res.inconnus.slice(0, 3).join(', ')}`;
  if (res.raison) {
    res.mode = 'tout';
    res.rejouees = toutesZones.map((id) => ({ id, raison: 'rejeu total' }));
    for (const z of table.zones) {
      res.vitest.push(...z.vitest);
      res.e2e.push(...z.e2e);
      res.complet.push(...z.complet);
    }
    res.vitest.push(...(table.toujours ?? []));
  } else {
    const fermeture = fermetureInverse(Object.keys(res.touchees), table);
    for (const id of toutesZones) {
      if (!fermeture.has(id)) {
        res.sautees.push({ id, raison: `aucune source ni dépendance modifiée depuis ${base}` });
        continue;
      }
      const via = fermeture.get(id);
      const raison = via === null ? `source modifiée : ${res.touchees[id].slice(0, 2).join(', ')}${res.touchees[id].length > 2 ? '…' : ''}` : `dépend de « ${via} »`;
      res.rejouees.push({ id, raison });
      const z = table.zones.find((x) => x.id === id);
      res.vitest.push(...z.vitest);
      res.e2e.push(...z.e2e);
      res.complet.push(...z.complet);
    }
    if (!res.fichiers.length) res.raison = 'aucun fichier modifié';
    else if (res.documentation.length === res.fichiers.length) res.raison = 'documentation seule : rien à rejouer';
    else res.raison = `${res.rejouees.length} zone(s) rejouée(s) sur ${toutesZones.length}`;
    // Les tests modifiés eux-mêmes, les « toujours » (si quelque chose d'autre que la documentation change) et le graphe de Vitest.
    const horsDoc = res.fichiers.length > res.documentation.length;
    for (const t of res.testsModifies) (t.startsWith('tests/unit/') ? res.vitest : res.e2e).push(t);
    if (horsDoc) res.vitest.push(...(table.toujours ?? []), ...vitestChanged);
  }
  res.vitest = uniq(res.vitest);
  res.e2e = uniq(res.e2e);
  res.complet = uniq(res.complet.filter((f) => !res.e2e.includes(f)));
  if (res.mode === 'zones' && res.fichiers.length === res.documentation.length) res.fumee = [];
  return res;
}

// Complet périodique : rejeu total si aucun complet n'a été enregistré, ou si la version actuelle a plus de `max` versions de retard.
// versions : versions.json (liste ordonnée) ; dernier : tests/dernier-complet.json (null ou {version, hash, date}).
export function completPeriodique(versions, dernier, max) {
  if (!dernier) return 'aucun palier complet enregistré (tests/dernier-complet.json vaut null) : le premier palier de publication est complet';
  const ids = (versions?.versions ?? []).map((v) => v.id);
  const actuelle = (versions?.versions ?? []).find((v) => v.status === 'actuelle')?.id;
  const i = ids.indexOf(dernier.version);
  const j = ids.indexOf(actuelle);
  if (i < 0) return `version du dernier complet inconnue (${dernier.version}) : palier complet`;
  if (j < 0) return null;
  if (j - i > max) return `dernier complet sur ${dernier.version}, ${j - i} versions de retard (plus de ${max}) : palier complet`;
  return null;
}

// Base d'une publication : le champ ref de la version « actuelle » de versions.json (sur origin/main).
export function refDeVersionActuelle(versions) {
  const v = (versions?.versions ?? []).find((x) => x.status === 'actuelle');
  if (!v) return { erreur: 'aucune version « actuelle » dans versions.json' };
  if (!v.ref || !/^[0-9a-f]{7,40}$/.test(v.ref)) return { erreur: `version ${v.id} sans ref valide` };
  return { id: v.id, ref: v.ref };
}

// Contrôle de la table (tests/selection.json). fichiersTests, fichiersSources : listes de chemins existants.
// aretes : dépendances réelles entre zones (lib/graphe.mjs) ; existe(chemin) : vrai si le fichier existe.
export function controlerTable(table, { fichiersTests, fichiersSources, existe, aretes = [], tousFichiers = fichiersSources }) {
  const erreurs = [];
  const ids = new Set(table.zones.map((z) => z.id));
  if (ids.size !== table.zones.length) erreurs.push('identifiant de zone en double');
  for (const z of table.zones) {
    for (const d of z.dependances ?? []) if (!ids.has(d)) erreurs.push(`zone ${z.id} : dépendance inconnue « ${d} »`);
    for (const f of [...z.vitest, ...z.e2e, ...z.complet]) if (!existe(f)) erreurs.push(`zone ${z.id} : fichier de test absent ${f}`);
    for (const m of z.sources) if (!tousFichiers.some((f) => correspond(f, [m]))) erreurs.push(`zone ${z.id} : motif sans fichier ${m}`);
  }
  for (const f of [...(table.toujours ?? []), ...(table.fumee ?? [])]) if (!existe(f)) erreurs.push(`fichier de test absent ${f}`);
  for (const g of table['garde-fous'] ?? []) if (!existe(g.fichier)) erreurs.push(`garde-fou absent ${g.fichier}`);
  for (const c of cyclesDe(table)) erreurs.push(`cycle : ${c}`);
  const listes = new Set([...(table.toujours ?? []), ...(table.fumee ?? []), ...table.zones.flatMap((z) => [...z.vitest, ...z.e2e, ...z.complet])]);
  for (const t of fichiersTests) if (!listes.has(t)) erreurs.push(`test sans zone : ${t}`);
  for (const f of fichiersSources) {
    if (!zonesDe(f, table).length && !declencheRejeuTotal(f, table)) erreurs.push(`source sans zone ni rejeu total : ${f}`);
  }
  const fermee = (a, b) => {
    const vus = new Set();
    const pile = [a];
    while (pile.length) {
      const x = pile.pop();
      if (x === b) return true;
      if (vus.has(x)) continue;
      vus.add(x);
      pile.push(...(table.zones.find((z) => z.id === x)?.dependances ?? []));
    }
    return false;
  };
  for (const a of aretes) if (!fermee(a.de, a.vers)) erreurs.push(`dépendance non déclarée : ${a.de} → ${a.vers} (${a.exemple})`);
  return erreurs;
}
