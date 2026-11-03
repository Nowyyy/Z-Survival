// Lot 4f-A — Agrégation des durées d'une exécution de tests en CI (fonctions pures ; scripts/tests/bilan-duree.mjs lit les artefacts).
//
// Entrées (horodatages en millisecondes depuis l'époque Unix) :
//   tranches : [{ palier, index, debutTache, finNpmCi, finNavigateur, debutTests, finTests, tests, workers, reussis, echoues, instables, ignores, sommeTestsMs, code }]
//   unitaires : { debutTache, finNpmCi, finLint, finVitest, code } ou null
//   projection : sortie « projection » de la tâche planifier (lib/budget.mjs → projectionCompacte) ou null
//   declenchement : création de l'exécution (API de GitHub, created_at) ; fin : fin de la dernière tâche mesurée (sinon : la plus tardive des fins lues)

const s = (ms) => Math.round(ms / 1000);
const fini = (x) => typeof x === 'number' && Number.isFinite(x);

export function dureeTranche(t) {
  const installation = fini(t.debutTests) && fini(t.debutTache) ? t.debutTests - t.debutTache : null;
  const tests = fini(t.finTests) && fini(t.debutTests) ? t.finTests - t.debutTests : null;
  const tache = fini(t.finTests) && fini(t.debutTache) ? t.finTests - t.debutTache : null;
  const parallelisme = tests > 0 && fini(t.sommeTestsMs) ? Number((t.sommeTestsMs / tests).toFixed(2)) : null;
  return {
    index: t.index,
    installationSecondes: installation === null ? null : s(installation),
    npmCiSecondes: fini(t.finNpmCi) && fini(t.debutTache) ? s(t.finNpmCi - t.debutTache) : null,
    testsSecondes: tests === null ? null : s(tests),
    tacheSecondes: tache === null ? null : s(tache),
    parallelisme,
    workers: t.workers ?? null,
    tests: t.tests ?? 0,
    reussis: t.reussis ?? 0,
    echoues: t.echoues ?? 0,
    instables: t.instables ?? 0,
    ignores: t.ignores ?? 0,
    code: t.code ?? null,
  };
}

/**
 * @param {{tranches: object[], unitaires?: object|null, projection?: object|null, declenchement?: number, fin?: number, objectifSecondes: number, palier?: string}} o
 */
export function bilanDuree({ tranches = [], unitaires = null, projection = null, declenchement, fin, objectifSecondes, palier = '' }) {
  const lignes = [...tranches].sort((a, b) => a.index - b.index).map(dureeTranche);
  const fins = [...tranches.map((t) => t.finTests), unitaires?.finVitest].filter(fini);
  const debuts = [...tranches.map((t) => t.debutTache), unitaires?.debutTache].filter(fini);
  const finRetenue = fini(fin) ? fin : fins.length ? Math.max(...fins) : null;
  const debutRetenu = fini(declenchement) ? declenchement : debuts.length ? Math.min(...debuts) : null;
  const totalSecondes = finRetenue !== null && debutRetenu !== null ? s(finRetenue - debutRetenu) : null;
  const inst = lignes.map((l) => l.installationSecondes).filter(fini);
  const plusLongue = lignes.filter((l) => fini(l.tacheSecondes)).sort((a, b) => b.tacheSecondes - a.tacheSecondes)[0] ?? null;
  const sommeTests = tranches.reduce((x, t) => x + (t.sommeTestsMs ?? 0), 0);
  const sommePhases = tranches.reduce((x, t) => x + (fini(t.finTests) && fini(t.debutTests) ? t.finTests - t.debutTests : 0), 0);
  const proj = new Map((projection?.tranches ?? []).map((t) => [t.index, t.secondes]));
  const depassements = [];
  for (const t of tranches) {
    const l = dureeTranche(t);
    const p = proj.get(t.index);
    if (fini(t.finTests) && debutRetenu !== null && s(t.finTests - debutRetenu) > objectifSecondes) depassements.push({ index: t.index, raison: `finit à ${s(t.finTests - debutRetenu)} s du déclenchement (objectif ${objectifSecondes} s)` });
    else if (fini(p) && fini(l.testsSecondes) && l.testsSecondes > p * 1.2 && l.testsSecondes - p > 30) depassements.push({ index: t.index, raison: `tests ${l.testsSecondes} s pour ${p} s projetés` });
  }
  const unit = unitaires ? {
    npmCiSecondes: fini(unitaires.finNpmCi) && fini(unitaires.debutTache) ? s(unitaires.finNpmCi - unitaires.debutTache) : null,
    lintSecondes: fini(unitaires.finLint) && fini(unitaires.finNpmCi) ? s(unitaires.finLint - unitaires.finNpmCi) : null,
    vitestSecondes: fini(unitaires.finVitest) && fini(unitaires.finLint) ? s(unitaires.finVitest - unitaires.finLint) : null,
    tacheSecondes: fini(unitaires.finVitest) && fini(unitaires.debutTache) ? s(unitaires.finVitest - unitaires.debutTache) : null,
    code: unitaires.code ?? null,
  } : null;
  const tenu = totalSecondes !== null && totalSecondes <= objectifSecondes;
  const verdict = totalSecondes === null ? 'OBJECTIF NON MESURÉ (horodatages manquants)' : tenu ? 'OBJECTIF TENU' : `OBJECTIF NON TENU (${totalSecondes} s pour ${objectifSecondes} s)`;
  const somme = (k) => lignes.reduce((x, l) => x + (l[k] ?? 0), 0);
  return {
    palier,
    tranches: lignes,
    nombreDeTranches: lignes.length,
    totalSecondes,
    objectifSecondes,
    installation: inst.length ? { moyenneSecondes: s((inst.reduce((a, b) => a + b, 0) / inst.length) * 1000), maxSecondes: Math.max(...inst) } : null,
    trancheLaPlusLongue: plusLongue ? { index: plusLongue.index, secondes: plusLongue.tacheSecondes, testsSecondes: plusLongue.testsSecondes } : null,
    parallelisme: sommePhases > 0 ? Number((sommeTests / sommePhases).toFixed(2)) : null,
    workers: [...new Set(lignes.map((l) => l.workers).filter((w) => w !== null))].sort((a, b) => a - b),
    tests: { executions: somme('tests'), reussis: somme('reussis'), echoues: somme('echoues'), instables: somme('instables'), ignores: somme('ignores') },
    unitaires: unit,
    comparaison: projection ? {
      totalProjeteSecondes: projection.totalSecondes,
      trancheProjeteeSecondes: projection.trancheLaPlusLongueSecondes,
      facteurProjete: projection.facteur,
      installationProjeteeSecondes: projection.installationSecondes,
      nMinimal: projection.nMinimal,
      nUtilise: projection.nUtilise,
      ecartTotalSecondes: totalSecondes === null ? null : totalSecondes - projection.totalSecondes,
    } : null,
    depassements,
    tenu,
    verdict,
  };
}

export function bilanTexte(b) {
  const L = [];
  const v = (x, u = ' s') => (x === null || x === undefined ? '—' : `${x}${u}`);
  L.push(`### Bilan de durée — palier ${b.palier} : ${b.verdict}`);
  L.push('');
  L.push(`- Durée totale (déclenchement → fin des tranches et d'unitaires) : ${v(b.totalSecondes)} (objectif ${b.objectifSecondes} s)`);
  L.push(`- Tranches : ${b.nombreDeTranches} ; installation (début de la tâche → début des tests) moyenne ${v(b.installation?.moyenneSecondes)}, maximale ${v(b.installation?.maxSecondes)}`);
  L.push(`- Tranche la plus longue : ${b.trancheLaPlusLongue ? `n° ${b.trancheLaPlusLongue.index}, ${b.trancheLaPlusLongue.secondes} s (tests ${b.trancheLaPlusLongue.testsSecondes} s)` : '—'}`);
  L.push(`- Parallélisme réel (somme des durées de tests ÷ durée des tests des tranches) : ${v(b.parallelisme, '')} ; workers : ${b.workers.join(', ') || '—'}`);
  L.push(`- Exécutions Playwright : ${b.tests.executions} (réussies ${b.tests.reussis}, échouées ${b.tests.echoues}, instables ${b.tests.instables}, ignorées ${b.tests.ignores})`);
  if (b.unitaires) L.push(`- Unitaires : npm ci ${v(b.unitaires.npmCiSecondes)}, lint ${v(b.unitaires.lintSecondes)}, Vitest ${v(b.unitaires.vitestSecondes)}, tâche ${v(b.unitaires.tacheSecondes)}${b.unitaires.code ? ' — ÉCHEC' : ''}`);
  if (b.comparaison) {
    const c = b.comparaison;
    L.push(`- Projection de budget.mjs : total ${c.totalProjeteSecondes} s, tranche la plus longue ${c.trancheProjeteeSecondes} s (parallélisme ${c.facteurProjete}, installation ${c.installationProjeteeSecondes} s, N minimal ${c.nMinimal}, N utilisé ${c.nUtilise}) ; écart réel − projeté : ${v(c.ecartTotalSecondes)}`);
  }
  L.push(`- Tranches qui dépassent : ${b.depassements.length ? b.depassements.map((d) => `n° ${d.index} (${d.raison})`).join(' ; ') : 'aucune'}`);
  if (b.tranches.length) {
    L.push('');
    L.push('| Tranche | Installation | npm ci | Tests | Tâche | Parallélisme | Workers | Exécutions | Réussies | Échouées | Ignorées |');
    L.push('|---|---|---|---|---|---|---|---|---|---|---|');
    for (const t of b.tranches) L.push(`| ${t.index} | ${v(t.installationSecondes)} | ${v(t.npmCiSecondes)} | ${v(t.testsSecondes)} | ${v(t.tacheSecondes)} | ${v(t.parallelisme, '')} | ${v(t.workers, '')} | ${t.tests} | ${t.reussis + t.instables} | ${t.echoues} | ${t.ignores} |`);
  }
  L.push('');
  L.push(b.verdict);
  return L.join('\n');
}
