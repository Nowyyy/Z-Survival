// Lot 4e-B — Budget de durée des paliers de tests (fonctions pures). Projection du palier complet en CI :
//   N = ceil(somme_cumulée × facteurDesequilibre ÷ (facteurParallelisme × testsParTrancheSecondes))
//   répartition gloutonne (le plus lourd d'abord, dans la tranche la moins chargée), durée d'une tranche = somme ÷ facteurParallelisme,
//   temps total = installationSecondes + tranche la plus longue. Deux projections : facteur mesuré, et 1,0 (hypothèse prudente).

// Unités de répartition : un test (granularité « test », --test-list) ou un fichier entier (« fichier »).
export function unites(tests, granularite = 'test') {
  if (granularite === 'test') return tests.map((t) => ({ ...t, cle: t.cle ?? `${t.projet}|${t.fichier}|${t.titre}`, ms: t.ms ?? 0, tests: [t] }));
  const map = new Map();
  for (const t of tests) {
    const cle = `${t.projet}|${t.fichier}`;
    const u = map.get(cle) ?? { cle, projet: t.projet, fichier: t.fichier, ms: 0, tests: [] };
    u.ms += t.ms ?? 0;
    u.tests.push(t);
    map.set(cle, u);
  }
  return [...map.values()];
}

export function nombreDeTranches(sommeSecondes, b, facteur) {
  return Math.max(1, Math.ceil((sommeSecondes * b.facteurDesequilibre) / (facteur * b.testsParTrancheSecondes)));
}

// Glouton par durée : trie du plus lourd au plus léger, chaque unité va dans la tranche la moins chargée (à égalité : la première).
export function repartir(listeUnites, n) {
  const tranches = Array.from({ length: n }, (_, i) => ({ index: i + 1, ms: 0, unites: [] }));
  const tri = [...listeUnites].sort((a, b) => b.ms - a.ms || a.cle.localeCompare(b.cle));
  for (const u of tri) {
    let min = tranches[0];
    for (const t of tranches) if (t.ms < min.ms) min = t;
    min.ms += u.ms;
    min.unites.push(u);
  }
  return tranches;
}

export function projection(listeUnites, b, facteur, nImpose) {
  const somme = listeUnites.reduce((s, u) => s + u.ms, 0) / 1000;
  const n = nImpose ?? nombreDeTranches(somme, b, facteur);
  const tranches = repartir(listeUnites, n);
  const plusLongue = Math.max(0, ...tranches.map((t) => t.ms)) / 1000 / facteur;
  const lourde = [...listeUnites].sort((x, y) => y.ms - x.ms)[0];
  return {
    facteur,
    sommeSecondes: Math.round(somme),
    tranches: n,
    trancheLaPlusLongueSecondes: Math.round(plusLongue),
    totalSecondes: Math.round(b.installationSecondes + plusLongue),
    uniteLaPlusLourde: lourde ? { cle: lourde.cle, secondes: Math.round(lourde.ms / 1000 / facteur) } : null,
    repartition: tranches,
  };
}

/**
 * Projection complète d'un palier et contrôles du budget.
 * @param {object[]} tests [{projet, fichier, titre, ms}]
 * @param {object} b tests/budget.json
 * @param {object} [o] {granularite, referenceSecondes (somme cumulée de la mesure de référence), etiquette}
 */
export function evaluer(tests, b, o = {}) {
  const u = unites(tests, o.granularite ?? 'test');
  const mesuree = projection(u, b, b.facteurParallelisme);
  const prudente = projection(u, b, 1.0);
  const erreurs = [];
  const avertissements = [];
  if (mesuree.tranches > b.tranchesMax) {
    const capacite = (b.tranchesMax * b.facteurParallelisme * b.testsParTrancheSecondes) / b.facteurDesequilibre;
    erreurs.push(`${mesuree.tranches} tranches nécessaires pour tranchesMax = ${b.tranchesMax} : calcul à retirer ≈ ${Math.ceil((mesuree.sommeSecondes - capacite) / 60)} min cumulées`);
  }
  if (mesuree.totalSecondes > b.completCibleSecondes) erreurs.push(`temps projeté ${mesuree.totalSecondes} s > objectif ${b.completCibleSecondes} s (hypothèse mesurée)`);
  if (mesuree.uniteLaPlusLourde && mesuree.uniteLaPlusLourde.secondes > b.testsParTrancheSecondes) {
    erreurs.push(`unité trop lourde pour une tranche : ${mesuree.uniteLaPlusLourde.cle} (${mesuree.uniteLaPlusLourde.secondes} s > ${b.testsParTrancheSecondes} s) : la découper`);
  }
  let ajout = null;
  if (typeof o.referenceSecondes === 'number') {
    ajout = Math.round(mesuree.sommeSecondes - o.referenceSecondes);
    if (ajout > b.ajoutMaxParLotSecondes) erreurs.push(`ajout de ${ajout} s de calcul au complet (plus de ${b.ajoutMaxParLotSecondes} s) : retirer ou regrouper d'abord`);
  }
  if (prudente.tranches > b.tranchesMax || prudente.totalSecondes > b.completCibleSecondes) {
    const p16 = projection(u, b, 1.0, Math.min(b.tranchesMax, prudente.tranches));
    avertissements.push(`hypothèse prudente (parallélisme 1,0) : ${prudente.tranches} tranches nécessaires ; avec ${p16.tranches} tranches, tranche la plus longue ${p16.trancheLaPlusLongueSecondes} s, total ${p16.totalSecondes} s (objectif ${b.completCibleSecondes} s)`);
  }
  return { etiquette: o.etiquette ?? '', ok: erreurs.length === 0, erreurs, avertissements, ajoutSecondes: ajout, mesuree, prudente };
}

// Clé de durée d'un test et durée retenue : mesure exacte (projet, fichier, titre), sinon médiane du fichier et du projet,
// sinon médiane du projet, sinon médiane générale (un test nouveau n'est jamais compté pour zéro).
// Les étiquettes (@instable, @lent) ajoutées aux titres ne changent pas la clé.
export const sansEtiquette = (titre) => titre.replace(/\s@(?:instable|lent)\b/g, '');

export function dureesDepuisMesure(tests, mesure) {
  const exact = new Map();
  const parFichier = new Map();
  const parProjet = new Map();
  const tous = [];
  for (const m of mesure) {
    exact.set(`${m.projet}|${m.fichier}|${sansEtiquette(m.titre)}`, m.ms);
    for (const [map, k] of [[parFichier, `${m.projet}|${m.fichier}`], [parProjet, m.projet]]) {
      const l = map.get(k) ?? [];
      l.push(m.ms);
      map.set(k, l);
    }
    tous.push(m.ms);
  }
  const med = (l) => (l?.length ? [...l].sort((a, b) => a - b)[Math.floor(l.length / 2)] : null);
  return tests.map((t) => {
    const k = `${t.projet}|${t.fichier}|${sansEtiquette(t.titre)}`;
    if (exact.has(k)) return { ...t, ms: exact.get(k), source: 'mesure' };
    const f = med(parFichier.get(`${t.projet}|${t.fichier}`));
    if (f !== null) return { ...t, ms: f, source: 'médiane du fichier' };
    const p = med(parProjet.get(t.projet));
    return { ...t, ms: p ?? med(tous) ?? 5000, source: p !== null ? 'médiane du projet' : 'médiane générale' };
  });
}

// Ligne d'un fichier --test-list de Playwright : « [projet] › fichier relatif à tests/e2e › titres ».
export const ligneTestList = (t) => `[${t.projet}] › ${t.fichier.replace(/^tests\/e2e\//, '')} › ${t.titre}`;

// Lot 4f-A — Palier standard réparti en tranches (projets de standardProjets seulement, le bureau) :
//   N_standard = clamp(1, tranchesMaxStandard, ceil(somme × facteurDesequilibre ÷ (facteurParallelisme × (standardCibleSecondes − installationSecondes))))
//   aucun test Playwright → 0 tranche (seulement la tâche « unitaires »).
export function nombreDeTranchesStandard(sommeSecondes, b, facteur = b.facteurParallelisme) {
  const utile = Math.max(1, b.standardCibleSecondes - b.installationSecondes);
  const brut = Math.ceil((sommeSecondes * b.facteurDesequilibre) / (facteur * utile));
  return Math.min(b.tranchesMaxStandard, Math.max(1, brut));
}

/**
 * Plan d'un palier : N minimal, N utilisé et projection avec N utilisé.
 *  - complet, publication : N minimal = nombreDeTranches (hypothèse mesurée) ; N utilisé = tranchesMax dès que le nombre d'unités le permet.
 *  - standard : N = nombreDeTranchesStandard (8 au plus) ; avertissement au-delà de standardCibleSecondes, erreur au-delà de standardMaxSecondes.
 *  - aucune unité : 0 tranche.
 * @param {object[]} tests [{projet, fichier, titre, ms}] (déjà filtrés : projets, étiquettes)
 */
export function planDuPalier(tests, b, palier, o = {}) {
  const u = unites(tests, o.granularite ?? 'test');
  const somme = u.reduce((s, x) => s + x.ms, 0) / 1000;
  if (!u.length) return { palier, nMinimal: 0, nUtilise: 0, sommeSecondes: 0, projection: null, erreurs: [], avertissements: [] };
  const erreurs = [];
  const avertissements = [];
  let nMinimal;
  let nUtilise;
  if (palier === 'standard') {
    nMinimal = nombreDeTranchesStandard(somme, b);
    nUtilise = Math.min(nMinimal, u.length);
  } else {
    nMinimal = nombreDeTranches(somme, b, b.facteurParallelisme);
    nUtilise = Math.min(b.tranchesMax, u.length);
  }
  const p = projection(u, b, b.facteurParallelisme, nUtilise);
  if (palier === 'standard') {
    const brut = Math.ceil((somme * b.facteurDesequilibre) / (b.facteurParallelisme * Math.max(1, b.standardCibleSecondes - b.installationSecondes)));
    if (brut > b.tranchesMaxStandard) avertissements.push(`${brut} tranches nécessaires pour tenir ${b.standardCibleSecondes} s ; limité à tranchesMaxStandard = ${b.tranchesMaxStandard}`);
    if (p.totalSecondes > b.standardMaxSecondes) erreurs.push(`temps projeté ${p.totalSecondes} s > maximum du standard ${b.standardMaxSecondes} s`);
    else if (p.totalSecondes > b.standardCibleSecondes) avertissements.push(`temps projeté ${p.totalSecondes} s > cible du standard ${b.standardCibleSecondes} s (maximum ${b.standardMaxSecondes} s)`);
  } else {
    if (nMinimal > b.tranchesMax) erreurs.push(`${nMinimal} tranches nécessaires pour tranchesMax = ${b.tranchesMax}`);
    if (p.totalSecondes > b.completCibleSecondes) erreurs.push(`temps projeté ${p.totalSecondes} s > objectif ${b.completCibleSecondes} s avec ${nUtilise} tranches`);
  }
  return { palier, nMinimal, nUtilise, sommeSecondes: Math.round(somme), projection: p, erreurs, avertissements };
}

// Résumé compact de la projection (sortie « projection » de la tâche planifier, lue par bilan-duree).
export function projectionCompacte(plan, b) {
  const p = plan.projection;
  return {
    palier: plan.palier,
    nMinimal: plan.nMinimal,
    nUtilise: plan.nUtilise,
    sommeSecondes: plan.sommeSecondes,
    facteur: b.facteurParallelisme,
    installationSecondes: b.installationSecondes,
    trancheLaPlusLongueSecondes: p ? p.trancheLaPlusLongueSecondes : 0,
    totalSecondes: p ? p.totalSecondes : 0,
    tranches: p ? p.repartition.map((t) => ({ index: t.index, secondes: Math.round(t.ms / 1000 / b.facteurParallelisme), executions: t.unites.reduce((s, x) => s + x.tests.length, 0) })) : [],
  };
}

// Lot 5n (T4) — Compléter la mesure de référence sans la refaire : les tests d'un rapport Playwright (mesure locale des seuls tests sans
// durée, jamais le palier complet) remplacent ou ajoutent leur entrée (clé projet | fichier | titre sans étiquette) ; tout le reste de la mesure
// (autres tests, étapes, cumul de référence du complet) est inchangé. Un test ignoré à l'exécution garde « ignore: true ».
// Renvoie { mesure, remplaces, ajoutes } (nouvel objet, l'entrée n'est pas modifiée).
export function completerMesure(mesure, mesures, { date = null, commit = null, note = '' } = {}) {
  const cle = (t) => `${t.projet}|${t.fichier}|${sansEtiquette(t.titre)}`;
  const nouveaux = new Map();
  for (const t of mesures) nouveaux.set(cle(t), { projet: t.projet, fichier: t.fichier, titre: t.titre, ms: Math.round(t.ms ?? 0), ...(t.statut === 'skipped' ? { ignore: true } : {}) });
  let remplaces = 0;
  const tests = (mesure.tests ?? []).map((m) => {
    const n = nouveaux.get(cle(m));
    if (!n) return m;
    nouveaux.delete(cle(m));
    remplaces += 1;
    return n;
  });
  const ajoutes = [...nouveaux.values()];
  const complements = [...(mesure.complements ?? []), { date, commit, remplaces, ajoutes: ajoutes.length, note }];
  return { mesure: { ...mesure, complements, tests: [...tests, ...ajoutes] }, remplaces, ajoutes: ajoutes.length };
}

// Lot 5n (T6) — Remise explicite de la référence du complet (décision du propriétaire) : complet.cumulSecondes devient le cumul projeté
// avec les durées mesurées d'aujourd'hui ; l'ancienne référence est gardée dans complet.referencesPrecedentes. Ce n'est pas un allègement :
// l'ajout maximal par lot (ajoutMaxParLotSecondes de tests/budget.json) se compte désormais depuis cette référence.
export function remettreReference(mesure, cumulSecondes, { date = null, commit = null, raison = '' } = {}) {
  const avant = mesure.complet ?? {};
  const ancienne = { cumulSecondes: avant.cumulSecondes ?? null, date: mesure.referenceDate ?? mesure.date ?? null, commit: mesure.referenceCommit ?? mesure.commit ?? null };
  return {
    ...mesure,
    referenceDate: date,
    referenceCommit: commit,
    complet: { ...avant, cumulSecondes: Math.round(cumulSecondes), referencesPrecedentes: [...(avant.referencesPrecedentes ?? []), ancienne], raisonReference: raison },
  };
}
