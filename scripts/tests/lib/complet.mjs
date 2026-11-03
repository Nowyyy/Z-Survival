// Lot 4e-B — Enregistrement du dernier palier complet réussi (fonction pure).
// rapport : rapport JSON de Playwright (fusionné si le palier a tourné en tranches) ; attendus : fichiers e2e qui doivent y figurer ;
// vitestOk : résultat de Vitest complet. Un test en quarantaine (test.fixme, décision du propriétaire) est ignoré, donc n'empêche rien.
export function verdictComplet({ rapport, attendus, vitestOk }) {
  if (!rapport?.stats) return { ok: false, raison: 'rapport Playwright absent ou illisible' };
  const s = rapport.stats;
  if (vitestOk !== true) return { ok: false, raison: 'Vitest complet absent ou en échec' };
  if ((s.unexpected ?? 0) > 0) return { ok: false, raison: `${s.unexpected} test(s) en échec` };
  if ((s.expected ?? 0) === 0) return { ok: false, raison: 'aucun test réussi : rapport vide' };
  const vus = new Set();
  const walk = (suite) => {
    if (suite.file) vus.add(suite.file.replace(/^tests\/e2e\//, ''));
    for (const c of suite.suites ?? []) walk(c);
  };
  for (const su of rapport.suites ?? []) walk(su);
  const manquants = attendus.map((f) => f.replace(/^tests\/e2e\//, '')).filter((f) => !vus.has(f));
  if (manquants.length) return { ok: false, raison: `fichiers absents du rapport (tranche manquante ?) : ${manquants.slice(0, 5).join(', ')}` };
  return { ok: true, raison: `${s.expected} réussis, ${s.flaky ?? 0} instables, ${s.skipped ?? 0} ignorés` };
}
