// Banque du jeu (lot 4) : relie les événements de la partie (kill, début et fin de manche, fin du monde, fin de partie) à l'argent (js/core/economy.js, seul
// endroit où l'argent est calculé) et à la sauvegarde (js/save/, via SaveRepository). Le temps arrive de l'extérieur (horloge de jeu en millisecondes pour
// le regroupement des écritures, horloge murale pour la date enregistrée) : aucune horloge ici, aucun stockage direct, aucune exception.
//
// Écritures : le montant en attente est écrit par différences (commit) soit toutes les `autosaveMs` quand quelque chose attend, soit tout de suite
// (fin de manche, fin de partie, pause, Recommencer, page cachée). Un commit échoué n'efface rien : le montant et les records en attente sont repris
// au commit suivant (jamais perdus, jamais comptés deux fois).
import { createLedger, formatMoney, killMoney, ledgerAdd, ledgerPending, ledgerTake, repairMoney, waveBonus, worldBonus } from '../core/economy.js';
import { emptyGainView, moneyGainView, pruneGains } from '../core/money-gain.js';

const ZERO_META = { runs: 0, worlds: 0, bestWave: 0, bestKills: 0 };
const isDelta = (m) => m.runs > 0 || m.worlds > 0 || m.bestWave > 0 || m.bestKills > 0;

// options : { repository, mode, economy (makeEconomy), save (save.json), clock() -> ms de jeu, wall() -> ms (date), reducedMotion }
export function createBank({ repository, mode, economy, save: saveCfg, clock, wall, reducedMotion = false }) {
  const loaded = repository.load();
  let saved = loaded.save;
  let ledger = createLedger();
  let meta = { ...ZERO_META };
  let gains = []; // [{ at, amount }] pour le « +N » du HUD
  let gainView = emptyGainView();
  let lastCommit = { ok: true, at: null, error: null };
  let failed = false;
  let dueAt = null; // instant (ms de jeu) du prochain commit regroupé, ou null
  let persistAsked = false;
  const run = { started: false, ended: false, baseline: 0, reached: 0, paid: new Set(), worldPaid: false };
  const autosave = Number.isFinite(saveCfg?.autosaveMs) ? saveCfg.autosaveMs : 2000;
  let writes = 0; // commits réussis (diagnostic)

  const dirty = () => ledgerPending(ledger) > 0 || isDelta(meta);
  const schedule = () => {
    if (dirty() && dueAt === null) dueAt = clock() + autosave;
  };
  const unsubscribe = repository.subscribe((next) => {
    saved = next;
  });

  function flush(reason = 'auto') {
    if (!dirty()) {
      dueAt = null;
      return { ok: true, skipped: true, reason };
    }
    const taken = ledgerTake(ledger);
    const delta = { ...taken.delta, ...meta };
    const result = repository.commit(delta, wall());
    if (result.ok) {
      ledger = taken.ledger;
      meta = { ...ZERO_META };
      saved = result.save ?? saved;
      failed = false;
      dueAt = null;
      writes += result.applied ? 1 : 0;
      lastCommit = { ok: true, at: clock(), error: null };
      // Hors lecture seule seulement : un stockage persistant est demandé après la première écriture réussie (au plus une fois).
      if (result.applied && !persistAsked && !mode.readOnly) {
        persistAsked = true;
        Promise.resolve(repository.requestPersistence()).catch(() => {});
      }
      return { ok: true, applied: result.applied, reason };
    }
    failed = true;
    dueAt = clock() + autosave; // nouvelle tentative plus tard, rien n'est perdu
    lastCommit = { ok: false, at: clock(), error: result.error ?? 'error' };
    return { ok: false, error: result.error ?? 'error', reason };
  }

  function addGain(kind, amount) {
    const before = ledgerPending(ledger);
    ledger = ledgerAdd(ledger, { kind, amount }, economy);
    const gained = ledgerPending(ledger) - before;
    if (gained > 0) gains.push({ at: clock(), amount: gained });
    schedule();
    return gained;
  }

  const balance = () => Math.min(economy.maxMoney, saved.money + ledgerPending(ledger));

  function status() {
    const info = repository.info();
    if (info.status === 'unavailable') return 'unavailable';
    if (info.locked) return 'locked';
    if (mode.readOnly) return 'readonly';
    if (mode.base === 'memory' || info.kind === 'memory') return 'memory';
    if (failed) return 'failed';
    return dirty() ? 'pending' : 'saved';
  }

  return {
    // Un zombie est tombé sous une balle. Renvoie le montant gagné.
    kill(type, wave) {
      if (run.ended) return 0;
      return addGain('kill', killMoney(type, wave, economy));
    },
    // Une planche vient d'être posée (réparation d'une fenêtre). Renvoie le montant gagné.
    repair() {
      if (run.ended) return 0;
      return addGain('repair', repairMoney(economy));
    },
    // Début d'une manche : la première de la partie compte une partie jouée ; la meilleure manche est demandée au prochain commit regroupé.
    waveStart(wave) {
      if (run.ended) return;
      if (!run.started) {
        run.started = true;
        run.baseline = saved.records.bestWave;
        meta.runs += 1;
      }
      run.reached = Math.max(run.reached, wave);
      meta.bestWave = Math.max(meta.bestWave, wave);
      schedule();
    },
    // Fin d'une manche : bonus (une seule fois par manche), écriture immédiate. Renvoie { bonus }.
    waveEnd(wave, reinforced) {
      if (run.ended || run.paid.has(wave)) return { bonus: 0 };
      run.paid.add(wave);
      const bonus = addGain('wave', waveBonus(wave, reinforced === true, economy));
      meta.bestWave = Math.max(meta.bestWave, wave);
      flush('wave');
      return { bonus };
    },
    // Fin du monde : gros bonus une seule fois par partie. Renvoie { bonus }.
    worldEnd() {
      if (run.ended || run.worldPaid) return { bonus: 0 };
      run.worldPaid = true;
      meta.worlds += 1;
      return { bonus: addGain('world', worldBonus(economy)) };
    },
    // Fin de partie (mort, monde terminé, ou « Recommencer ») : écriture immédiate. La manche atteinte est la dernière manche DÉMARRÉE (pas la prochaine,
    // annoncée pendant l'attente). Renvoie le bilan pour l'écran de fin.
    runEnd({ kills, reason }) {
      if (run.ended) return null;
      const reached = run.started ? run.reached : 0;
      const record = run.started && reached > run.baseline && !mode.readOnly;
      run.ended = true;
      if (run.started && kills > 0) meta.bestKills = Math.max(meta.bestKills, kills);
      const earned = ledger.earnedRun;
      const world = ledger.byKind.world;
      const result = flush(`run-${reason}`);
      return { earned, world, balance: balance(), reached, best: Math.max(saved.records.bestWave, reached), record, ok: result.ok, status: status() };
    },
    // Nouvelle partie (Rejouer, Recommencer) : écrit ce qui attend, puis remet à zéro les compteurs de la partie (le montant non écrit est gardé).
    restart() {
      flush('restart');
      ledger = { ...createLedger(), pending: ledgerPending(ledger) };
      run.started = false;
      run.ended = false;
      run.baseline = 0;
      run.reached = 0;
      run.paid = new Set();
      run.worldPaid = false;
      gains = [];
      gainView = emptyGainView();
    },
    // Écriture immédiate (ouverture de la pause, page cachée ou fermée, hook de test).
    flush,
    // À appeler à chaque image : commit regroupé échu, mise à jour du « +N ».
    tick() {
      const now = clock();
      if (dueAt !== null && now >= dueAt) flush('auto');
      gains = pruneGains(gains, now, economy);
      gainView = moneyGainView(gains, now, economy, gainView, { reducedMotion });
    },
    giveMoney: (n) => addGain('test', n),
    balance,
    gain: () => gainView,
    status,
    // Pour les écrans de fin et de pause : { balance, status, earnedRun, readOnly }.
    summary: () => ({ balance: balance(), status: status(), earnedRun: ledger.earnedRun, readOnly: mode.readOnly === true, pending: ledgerPending(ledger) }),
    snapshot() {
      const info = repository.info();
      return {
        kind: info.kind, mode: mode.kind, status: status(), readOnly: mode.readOnly === true, locked: info.locked, key: info.key,
        balance: balance(), pending: ledgerPending(ledger),
        saved: { money: saved.money, earned: saved.earned, stats: { ...saved.stats }, records: { ...saved.records }, rev: saved.rev },
        lastCommit: { ...lastCommit }, reasons: [...(mode.reasons ?? [])], writes,
        economy: { earnedRun: ledger.earnedRun, killsRun: ledger.killsRun, byKind: { ...ledger.byKind }, gainText: gainView.visible ? gainView.text : '' },
      };
    },
    format: formatMoney,
    dispose: unsubscribe,
  };
}
