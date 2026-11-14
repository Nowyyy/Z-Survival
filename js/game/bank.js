// Banque du jeu (lot 4 ; lot 8h : deux monnaies) : relie les événements de la partie (kill, planche, début et fin de manche, fin du monde, fin de partie)
// à l'économie (js/core/economy.js, seul endroit où l'argent est calculé) et à la progression v2 (js/save/, via SaveRepository, format v2). Le temps
// arrive de l'extérieur (horloge de jeu en millisecondes, horloge murale pour la date enregistrée) : aucune horloge ici, aucun stockage direct, aucune
// exception.
//
// Lot 8h (Docs/ref/sauvegarde-v2.md) :
//   - monnaie JAUNE : 10 par zombie tué par balle, 1 par planche posée (et « giveMoney » des tests) ; remise à 0 à chaque partie (début, Rejouer,
//     Recommencer), JAMAIS écrite ; ?money=N (mode essai) fixe son départ ;
//   - monnaie BLEUE : bonus de fin de manche et prime de fin du monde (mêmes valeurs qu'avant, economy.json), en histoire et en infini ; écrite à
//     chaque manche terminée (opération « gain » à identifiant unique : jamais comptée deux fois, jamais perdue d'une écriture échouée : reprise à la
//     suivante) ; plafond du solde dans js/core/progression.js ;
//   - statistiques du Profil (zombies tués, parties histoire et infini, temps de jeu hors pauses) et record par monde et par mode, écrits avec la même
//     opération : fin de manche, fin de partie, pause, page cachée ou fermée.
import { createLedger, formatMoney, killMoney, ledgerAdd, repairMoney, waveBonus, worldBonus } from '../core/economy.js';
import { emptyGainView, moneyGainView, pruneGains } from '../core/money-gain.js';
import { solde } from '../core/progression.js';

// Identifiant de partie : 8 octets aléatoires (crypto), sinon l'heure et un compteur (aucun générateur pseudo-aléatoire).
let runCounter = 0;
export function newRunId() {
  try {
    return Array.from(globalThis.crypto.getRandomValues(new Uint8Array(6)), (b) => b.toString(16).padStart(2, '0')).join('');
  } catch {
    runCounter += 1;
    return `r${Date.now().toString(36)}${runCounter}`;
  }
}

const vide = () => ({ bleu: 0, tues: 0, tempsMs: 0, partie: null, record: 0, monde: null });
const estVide = (p) => p.bleu === 0 && p.tues === 0 && p.tempsMs === 0 && p.partie === null && p.record === 0 && p.monde === null;

// options : { repository (format v2), mode, economy (makeEconomy), save (save.json), clock() -> ms de jeu, wall() -> ms (date), reducedMotion,
//             partie: { mode: 'histoire' | 'infini', monde }, runId() (identifiant de partie, tests) }
export function createBank({ repository, mode, economy, clock, wall, reducedMotion = false, partie = {}, runId = newRunId }) {
  const modeJeu = partie.mode === 'infini' ? 'infini' : 'histoire';
  const monde = typeof partie.monde === 'string' && partie.monde !== '' ? partie.monde : 'batiment';
  const departJaune = Number.isInteger(mode?.money) && mode.money >= 0 ? mode.money : 0;
  const loaded = repository.load();
  let saved = loaded.save;
  let ledger = createLedger(); // monnaie jaune de la partie (jamais écrite)
  let pending = vide(); // ce qui attend d'être écrit (bleue, statistiques, record)
  let opId = null; // identifiant de l'opération en attente (gardé tant qu'elle n'est pas écrite : jamais deux fois)
  let seq = 0;
  let gains = []; // [{ at, amount }] pour le « +N » jaune du HUD
  let gainView = emptyGainView();
  let gainsBleu = []; // « +N » bleu (fin de manche, fin du monde)
  let gainBleuView = emptyGainView();
  let lastCommit = { ok: true, at: null, error: null };
  let failed = false;
  let persistAsked = false;
  let lastClock = clock();
  let id = runId();
  const run = { started: false, ended: false, baseline: 0, reached: 0, paid: new Set(), worldPaid: false, bleu: 0 };
  let writes = 0; // écritures réussies (diagnostic)

  const unsubscribe = repository.subscribe((next) => {
    saved = next;
  });
  const recordDe = (s) => (Number.isInteger(s?.records?.[modeJeu]?.[monde]) ? s.records[modeJeu][monde] : 0);
  // Temps de jeu hors pauses, depuis la première manche de la partie : l'horloge de jeu n'avance que dans step() (jamais en pause, page cachée,
  // Options, mort ou monde fini).
  const prendreTemps = () => {
    const now = clock();
    if (run.started && !run.ended && now > lastClock) pending.tempsMs += Math.round(now - lastClock);
    lastClock = now;
  };
  const dirty = () => !estVide(pending);

  function flush(reason = 'auto') {
    prendreTemps();
    if (!dirty()) return { ok: true, skipped: true, reason };
    opId ??= `${id}.${(seq += 1)}`;
    const op = { id: opId, t: 'gain', bleu: pending.bleu, tues: pending.tues, tempsMs: pending.tempsMs, partie: pending.partie, record: pending.record > 0 ? { mode: modeJeu, monde, manche: pending.record } : null, monde: pending.monde };
    const result = repository.commit([op], wall());
    if (result.ok) {
      pending = vide();
      opId = null;
      saved = result.save ?? saved;
      failed = false;
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
    lastCommit = { ok: false, at: clock(), error: result.error ?? 'error' };
    return { ok: false, error: result.error ?? 'error', reason };
  }

  function addGain(kind, amount) {
    const before = ledger.earnedRun;
    ledger = ledgerAdd(ledger, { kind, amount }, economy);
    const gained = ledger.earnedRun - before;
    if (gained > 0) gains.push({ at: clock(), amount: gained });
    return gained;
  }
  function addBleu(amount) {
    if (!Number.isInteger(amount) || amount <= 0) return 0;
    pending.bleu += amount;
    run.bleu += amount;
    gainsBleu.push({ at: clock(), amount });
    return amount;
  }

  // Monnaie jaune de la partie (départ ?money=N en mode essai).
  const balance = () => Math.min(economy.maxMoney, departJaune + ledger.earnedRun);
  // Solde bleu : progression lue (ou écrite) plus ce qui attend d'être écrit.
  const soldeBleu = () => Math.min(economy.maxBleu ?? 9_999_999, solde(saved) + pending.bleu);

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
    // Un zombie est tombé sous une balle : monnaie jaune, un zombie de plus au Profil. Renvoie le montant gagné.
    kill(type, wave) {
      if (run.ended) return 0;
      pending.tues += 1;
      return addGain('kill', killMoney(type, wave, economy));
    },
    // Une planche vient d'être posée (réparation d'une fenêtre) : monnaie jaune. Renvoie le montant gagné.
    repair() {
      if (run.ended) return 0;
      return addGain('repair', repairMoney(economy));
    },
    // Début d'une manche : la première de la partie compte une partie jouée (histoire ou infini) ; la manche atteinte est le record en attente.
    waveStart(wave) {
      if (run.ended) return;
      if (!run.started) {
        run.started = true;
        run.baseline = recordDe(saved);
        pending.partie = modeJeu;
        lastClock = clock(); // le temps de jeu compte dès la première manche de la partie
      }
      run.reached = Math.max(run.reached, wave);
      pending.record = Math.max(pending.record, wave);
    },
    // Fin d'une manche : bonus en monnaie bleue (une seule fois par manche), écriture immédiate. Renvoie { bonus }.
    waveEnd(wave, reinforced) {
      if (run.ended || run.paid.has(wave)) return { bonus: 0 };
      run.paid.add(wave);
      const bonus = addBleu(waveBonus(wave, reinforced === true, economy));
      pending.record = Math.max(pending.record, wave);
      flush('wave');
      return { bonus };
    },
    // Fin du monde : prime en monnaie bleue une seule fois par partie, monde terminé. Renvoie { bonus }.
    worldEnd() {
      if (run.ended || run.worldPaid) return { bonus: 0 };
      run.worldPaid = true;
      pending.monde = monde;
      return { bonus: addBleu(worldBonus(economy)) };
    },
    // Fin de partie (mort, monde terminé, « Quitter », « Recommencer ») : écriture immédiate. La manche atteinte est la dernière manche DÉMARRÉE.
    // Renvoie le bilan pour l'écran de fin : { earned (jaune perdue), world (prime bleue du monde), balance (jaune), bleu (gagnée pendant la partie),
    // soldeBleu, reached, best (record du mode et du monde), record (battu), mode, ok, status }.
    runEnd({ reason }) {
      if (run.ended) return null;
      const reached = run.started ? run.reached : 0;
      const record = run.started && reached > run.baseline && !mode.readOnly;
      const result = flush(`run-${reason}`);
      run.ended = true;
      return {
        earned: ledger.earnedRun, world: run.worldPaid ? worldBonus(economy) : 0, balance: balance(), bleu: run.bleu, soldeBleu: soldeBleu(),
        reached, best: Math.max(recordDe(saved), reached), record, mode: modeJeu, ok: result.ok, status: status(),
      };
    },
    // Nouvelle partie (Rejouer, Recommencer) : écrit ce qui attend, puis remet à zéro la partie (monnaie jaune comprise) ; nouvel identifiant.
    restart() {
      flush('restart');
      ledger = createLedger();
      run.started = false;
      run.ended = false;
      run.baseline = 0;
      run.reached = 0;
      run.paid = new Set();
      run.worldPaid = false;
      run.bleu = 0;
      lastClock = clock();
      id = runId();
      seq = 0;
      gains = [];
      gainView = emptyGainView();
      gainsBleu = [];
      gainBleuView = emptyGainView();
    },
    // Écriture immédiate (ouverture de la pause, page cachée ou fermée, hook de test).
    flush,
    // À appeler à chaque image : mise à jour des « +N » (jaune et bleu). Aucune écriture regroupée : la monnaie jaune n'est jamais écrite.
    tick() {
      const now = clock();
      gains = pruneGains(gains, now, economy);
      gainView = moneyGainView(gains, now, economy, gainView, { reducedMotion });
      gainsBleu = pruneGains(gainsBleu, now, economy);
      gainBleuView = moneyGainView(gainsBleu, now, economy, gainBleuView, { reducedMotion });
    },
    giveMoney: (n) => addGain('test', n),
    balance,
    soldeBleu,
    gain: () => gainView,
    gainBleu: () => gainBleuView,
    status,
    // Pour les écrans de fin et de pause : { balance (jaune), soldeBleu, status, earnedRun, bleuRun, readOnly }.
    summary: () => ({ balance: balance(), soldeBleu: soldeBleu(), status: status(), earnedRun: ledger.earnedRun, bleuRun: run.bleu, readOnly: mode.readOnly === true, pending: pending.bleu }),
    snapshot() {
      const info = repository.info();
      return {
        kind: info.kind, mode: mode.kind, status: status(), readOnly: mode.readOnly === true, locked: info.locked, key: info.key,
        balance: balance(), pending: pending.bleu,
        bleu: { solde: soldeBleu(), run: run.bleu, pending: pending.bleu, gainText: gainBleuView.visible ? gainBleuView.text : '' },
        partie: { mode: modeJeu, monde, id },
        saved: { bleu: solde(saved), gagne: saved?.bleu?.gagne ?? 0, niveaux: { ...(saved?.niveaux ?? {}) }, records: structuredClone(saved?.records ?? {}), profil: { ...(saved?.profil ?? {}) }, rev: saved?.rev ?? 0 },
        lastCommit: { ...lastCommit }, reasons: [...(mode.reasons ?? [])], writes,
        economy: { earnedRun: ledger.earnedRun, killsRun: ledger.killsRun, byKind: { ...ledger.byKind }, gainText: gainView.visible ? gainView.text : '' },
      };
    },
    format: formatMoney,
    dispose: unsubscribe,
  };
}
