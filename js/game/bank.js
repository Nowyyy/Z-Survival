// Banque du jeu (lot 4 ; lot 8h : deux monnaies) : relie les événements de la partie (kill, planche, début et fin de manche, fin du monde, fin de partie)
// à l'économie (js/core/economy.js, seul endroit où l'argent est calculé) et à la progression v2 (js/save/, via SaveRepository, format v2). Le temps
// arrive de l'extérieur (horloge de jeu en millisecondes, horloge murale pour la date enregistrée) : aucune horloge ici, aucun stockage direct, aucune
// exception.
//
// Lot 9a (Docs/ref/economie.md) : médailles (manches, monde) et diamants (portes, milliers, paliers, premier monde, jour) intervertis à l'écran ;
// la monnaie jaune s'appelle « Zollars » ; lot 9b : noms du code = noms affichés. Retour du propriétaire après
// le lot 9a : médailles et diamants d'une partie écrits seulement à sa fin (mort, monde terminé), perdus à « Quitter » ou « Recommencer » (les
// mentions « écrit à chaque manche » ou « au gain » ci-dessous ne valent plus que pour les statistiques et le record).
//
// Lot 8h (Docs/ref/sauvegarde-v2.md) :
//   - monnaie JAUNE : 10 par zombie tué par balle, 1 par planche posée (et « giveMoney » des tests) ; remise à 0 à chaque partie (début, Rejouer,
//     Recommencer), JAMAIS écrite ; ?money=N (mode essai) fixe son départ ;
//   - MÉDAILLES : bonus de fin de manche et prime de fin du monde (mêmes valeurs qu'avant, economy.json), en histoire et en infini ; écrite à
//     chaque manche terminée (opération « gain » à identifiant unique : jamais comptée deux fois, jamais perdue d'une écriture échouée : reprise à la
//     suivante) ; plafond du solde dans js/core/progression.js ;
//   - statistiques du Profil (zombies tués, parties histoire et infini, temps de jeu hors pauses) et record par monde et par mode, écrits avec la même
//     opération : fin de manche, fin de partie, pause, page cachée ou fermée.
// Lot 8k (Docs/ref/economie.md) : DIAMANTS (gardés, paient les caisses), écrits AU GAIN (même opération « gain ») : porte ouverte, chaque millier
// de zombies tués par balle dans la partie, palier de manches franchi pour la première fois (histoire par monde, infini par carte), premier monde
// terminé, première partie du jour (fin d'une partie qui a terminé au moins une manche, date locale). Les montants des paliers, du monde et du jour
// sont décidés par la progression la plus récente (js/core/progression.js : jamais deux fois) ; la banque n'en garde qu'une prévision pour
// l'affichage (« +N » de la partie, E2-7).
import { createLedger, diamantJour, diamantMonde, diamantPalier, diamantPorte, diamantsZombies, formatMoney, jourLocal, killMoney, ledgerAdd, paliersNouveaux, repairMoney, waveBonus, worldBonus } from '../core/economy.js';
import { emptyGainView, moneyGainView, pruneGains } from '../core/money-gain.js';
import { solde, soldeDiamants } from '../core/progression.js';

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

// prev (retour après le lot 9a) : diamants prévus des paliers, du premier monde et de la partie du jour (décidés à l'écriture), pour le solde affiché.
const vide = () => ({ medailles: 0, tues: 0, tempsMs: 0, partie: null, record: 0, monde: null, diamants: 0, palier: 0, mondeFini: false, jour: 0, prev: 0 });
const estVide = (p) => p.medailles === 0 && p.tues === 0 && p.tempsMs === 0 && p.partie === null && p.record === 0 && p.monde === null && p.diamants === 0 && p.palier === 0 && !p.mondeFini && p.jour === 0;
// Diamants gagnés pendant la partie, par source (écran de fin E2-7).
const diamantsVides = () => ({ portes: 0, zombies: 0, paliers: 0, monde: 0, jour: 0 });

// options : { repository (format v2), mode, economy (makeEconomy), save (save.json), clock() -> ms de jeu, wall() -> ms (date), reducedMotion,
//             partie: { mode: 'histoire' | 'infini', monde }, runId() (identifiant de partie, tests) }
export function createBank({ repository, mode, economy, clock, wall, reducedMotion = false, partie = {}, runId = newRunId }) {
  const modeJeu = partie.mode === 'infini' ? 'infini' : 'histoire';
  const monde = typeof partie.monde === 'string' && partie.monde !== '' ? partie.monde : 'batiment';
  const departJaune = Number.isInteger(mode?.money) && mode.money >= 0 ? mode.money : 0;
  const loaded = repository.load();
  let saved = loaded.save;
  let ledger = createLedger(); // monnaie jaune de la partie (jamais écrite)
  let pending = vide(); // ce qui attend d'être écrit (médailles, diamants, statistiques, record)
  let opId = null; // identifiant de l'opération en attente (gardé tant qu'elle n'est pas écrite : jamais deux fois)
  let seq = 0;
  let gains = []; // [{ at, amount }] pour le « +N » jaune du HUD
  let gainView = emptyGainView();
  let gainsMedailles = []; // « +N » des médailles (fin de manche, fin du monde)
  let gainMedaillesView = emptyGainView();
  let lastCommit = { ok: true, at: null, error: null };
  let failed = false;
  let persistAsked = false;
  let lastClock = clock();
  let id = runId();
  const run = { started: false, ended: false, baseline: 0, reached: 0, paid: new Set(), worldPaid: false, medailles: 0, tues: 0, diamants: diamantsVides(), palierVu: 0 };
  let diamantGain = { n: 0, gain: 0 }; // lot 8k : dernier gain de diamants (n : numéro, pour l'affichage de la partie)
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
  // Retour du propriétaire après le lot 9a : les médailles et les diamants d'une partie (manches, monde, portes, milliers, paliers, premier monde,
  // partie du jour) ne sont écrits qu'à la FIN de la partie, mort ou monde terminé (flush avec { gains: true }) ; « Quitter », « Recommencer »,
  // la page fermée en cours de partie les perdent. Les autres écritures (manche terminée, pause, page cachée) ne portent que les statistiques
  // et le record de manche.
  const statsVides = (p) => p.tues === 0 && p.tempsMs === 0 && p.partie === null && p.record === 0 && p.monde === null;
  const sansGains = (p) => ({ ...p, medailles: 0, diamants: 0, palier: 0, mondeFini: false, jour: 0, prev: 0 });

  // dus : gains d'une partie finie (mort, monde) que l'écriture n'a pas encore pu enregistrer (écriture échouée) : réessayés à chaque écriture
  // suivante, jamais perdus, même après « Rejouer » ; une partie abandonnée ensuite ne perd que ses propres gains.
  let dus = null;
  const gainsDe = (p) => ({ medailles: p.medailles, diamants: p.diamants, palier: p.palier, mondeFini: p.mondeFini, jour: p.jour, prev: p.prev });
  function flush(reason = 'auto', { gains = false } = {}) {
    // g : gains écrits par cette opération : tous ceux en attente (fin de partie), sinon seulement ceux d'une partie finie encore dus, sinon aucun.
    const g = gains ? gainsDe(pending) : dus;
    prendreTemps();
    if (g === null ? statsVides(pending) : !dirty()) return { ok: true, skipped: true, reason };
    opId ??= `${id}.${(seq += 1)}`;
    const op = { id: opId, t: 'gain', medailles: g ? g.medailles : 0, tues: pending.tues, tempsMs: pending.tempsMs, partie: pending.partie, record: pending.record > 0 ? { mode: modeJeu, monde, manche: pending.record } : null, monde: pending.monde };
    // Lot 8k : diamants (les montants voyagent dans l'opération : même résultat dans tous les onglets).
    if (g && g.diamants > 0) op.diamants = g.diamants;
    if (g && g.palier > 0) op.palier = { mode: modeJeu, monde, manche: g.palier, pas: economy.diamantPalierPas, gain: diamantPalier(economy) };
    if (g?.mondeFini) op.mondeFini = { id: monde, gain: diamantMonde(economy) };
    if (g && g.jour > 0) op.jour = { n: g.jour, gain: diamantJour(economy) };
    const result = repository.commit([op], wall());
    if (result.ok) {
      // Les gains non écrits (partie en cours) restent en attente jusqu'à la fin de la partie.
      const reste = gains || !g ? (gains ? null : gainsDe(pending)) : { medailles: pending.medailles - g.medailles, diamants: pending.diamants - g.diamants, palier: pending.palier > g.palier ? pending.palier : 0, mondeFini: pending.mondeFini && !g.mondeFini, jour: pending.jour > g.jour ? pending.jour : 0, prev: pending.prev - g.prev };
      pending = { ...vide(), ...(reste ?? {}) };
      if (g) dus = null;
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
  function addMedailles(amount) {
    if (!Number.isInteger(amount) || amount <= 0) return 0;
    pending.medailles += amount;
    run.medailles += amount;
    gainsMedailles.push({ at: clock(), amount });
    return amount;
  }

  // Lot 8k : diamants gagnés (prévision pour l'affichage) ; retour après le lot 9a : écrits à la fin de la partie.
  function addDiamants(source, n) {
    if (!Number.isInteger(n) || n <= 0) return 0;
    run.diamants[source] += n;
    diamantGain = { n: diamantGain.n + 1, gain: n };
    return n;
  }
  const diamantsTotal = () => Object.values(run.diamants).reduce((n, v) => n + v, 0);

  // Monnaie jaune de la partie (départ ?money=N en mode essai).
  const balance = () => Math.min(economy.maxMoney, departJaune + ledger.earnedRun);
  // Soldes des médailles et des diamants : progression lue (ou écrite) plus ce qui attend d'être écrit.
  const soldeMedailles = () => Math.min(economy.maxMedailles ?? 9_999_999, solde(saved) + pending.medailles);
  const soldeDiam = () => Math.min(economy.maxDiamants ?? 9_999_999, soldeDiamants(saved) + pending.diamants + pending.prev);

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
      // Lot 8k : un millier de zombies tués dans la partie → diamants ; retour après le lot 9a : écrits à la fin de la partie.
      const m = diamantsZombies(run.tues, run.tues + 1, economy);
      run.tues += 1;
      const gained = addGain('kill', killMoney(type, wave, economy));
      if (m > 0) {
        pending.diamants += m;
        addDiamants('zombies', m);
      }
      return gained;
    },
    // Lot 8k : une porte vient de s'ouvrir pendant la partie (événement doorOpen : lecture seule) → diamants ; retour après le lot 9a : écrits à
    // la fin de la partie. Renvoie le gain.
    door() {
      if (run.ended || !run.started) return 0;
      const m = diamantPorte(economy);
      if (m <= 0) return 0;
      pending.diamants += m;
      addDiamants('portes', m);
      return m;
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
    // Fin d'une manche : bonus en médailles (une seule fois par manche), écriture immédiate (statistiques ; les gains attendent la fin). Renvoie { bonus }.
    waveEnd(wave, reinforced) {
      if (run.ended || run.paid.has(wave)) return { bonus: 0 };
      run.paid.add(wave);
      const bonus = addMedailles(waveBonus(wave, reinforced === true, economy));
      pending.record = Math.max(pending.record, wave);
      // Lot 8k : palier de manches franchi pour la première fois (prévision d'après la progression lue ; décidé à l'écriture).
      const deja = Math.max(saved?.paliers?.[modeJeu]?.[monde] ?? 0, run.palierVu);
      const nouveaux = paliersNouveaux(deja, wave, economy);
      if (nouveaux.length) {
        run.palierVu = nouveaux.at(-1);
        pending.palier = Math.max(pending.palier, wave);
        pending.prev += addDiamants('paliers', nouveaux.length * diamantPalier(economy));
      }
      flush('wave');
      return { bonus };
    },
    // Fin du monde : prime en médailles une seule fois par partie, monde terminé. Renvoie { bonus }.
    worldEnd() {
      if (run.ended || run.worldPaid) return { bonus: 0 };
      run.worldPaid = true;
      pending.monde = monde;
      // Lot 8k : premier monde terminé (une seule fois pour toujours).
      if (!(saved?.mondesFinis ?? []).includes(monde)) {
        pending.mondeFini = true;
        pending.prev += addDiamants('monde', diamantMonde(economy));
      }
      return { bonus: addMedailles(worldBonus(economy)) };
    },
    // Fin de partie (mort, monde terminé, « Quitter », « Recommencer ») : écriture immédiate. La manche atteinte est la dernière manche DÉMARRÉE.
    // Lot 9a, puis retour du propriétaire : à la mort (« death ») ou à la fin du monde (« world »), les médailles et diamants de la partie sont
    // écrits (partie du jour comprise) ; à « Quitter » et « Recommencer », ils sont PERDUS (seuls les statistiques et le record sont écrits).
    // Renvoie le bilan pour l'écran de fin : { earned (Zollars perdus), world (prime du monde, en médailles), balance (Zollars), medailles (gagnées
    // pendant la partie), soldeMedailles, reached, best (record du mode et du monde), record (battu), mode, ok, status, diamants { sources, total, solde } }.
    runEnd({ reason }) {
      if (run.ended) return null;
      const reached = run.started ? run.reached : 0;
      const record = run.started && reached > run.baseline && !mode.readOnly;
      // Lot 8k : première partie du jour (au moins une manche terminée ; jour local de l'appareil).
      const jour = jourLocal(new Date(wall()));
      if ((reason === 'death' || reason === 'world') && run.paid.size > 0 && jour > (saved?.diamants?.jour ?? 0)) {
        pending.jour = jour;
        pending.prev += addDiamants('jour', diamantJour(economy));
      }
      const fin = reason === 'death' || reason === 'world';
      if (!fin) {
        pending = { ...sansGains(pending), ...(dus ?? {}) };
        run.medailles = 0;
        run.diamants = diamantsVides();
      }
      const result = flush(`run-${reason}`, { gains: fin });
      if (fin && !result.ok) dus = gainsDe(pending);
      run.ended = true;
      return {
        earned: ledger.earnedRun, world: run.worldPaid ? worldBonus(economy) : 0, balance: balance(), medailles: run.medailles, soldeMedailles: soldeMedailles(),
        reached, best: Math.max(recordDe(saved), reached), record, mode: modeJeu, ok: result.ok, status: status(),
        diamants: { ...run.diamants, total: diamantsTotal(), solde: soldeDiam() },
      };
    },
    // Nouvelle partie (Rejouer, Recommencer) : écrit ce qui attend, puis remet à zéro la partie (monnaie jaune comprise) ; nouvel identifiant.
    restart() {
      flush('restart');
      pending = { ...sansGains(pending), ...(dus ?? {}) }; // une partie abandonnée ne lègue jamais ses gains à la suivante (une partie finie, oui)
      ledger = createLedger();
      run.started = false;
      run.ended = false;
      run.baseline = 0;
      run.reached = 0;
      run.paid = new Set();
      run.worldPaid = false;
      run.medailles = 0;
      run.tues = 0;
      run.diamants = diamantsVides();
      run.palierVu = 0;
      lastClock = clock();
      id = runId();
      seq = 0;
      gains = [];
      gainView = emptyGainView();
      gainsMedailles = [];
      gainMedaillesView = emptyGainView();
    },
    // Écriture immédiate (ouverture de la pause, page cachée ou fermée, hook de test).
    flush,
    // À appeler à chaque image : mise à jour des « +N » (Zollars et médailles). Aucune écriture regroupée : la monnaie jaune n'est jamais écrite.
    tick() {
      const now = clock();
      gains = pruneGains(gains, now, economy);
      gainView = moneyGainView(gains, now, economy, gainView, { reducedMotion });
      gainsMedailles = pruneGains(gainsMedailles, now, economy);
      gainMedaillesView = moneyGainView(gainsMedailles, now, economy, gainMedaillesView, { reducedMotion });
    },
    giveMoney: (n) => addGain('test', n),
    balance,
    soldeMedailles,
    // Lot 8k : solde des diamants (écrit, plus ce qui attend) ; dernier gain { n, gain } pour l'affichage de la partie ; diamants de la partie.
    soldeDiamants: () => soldeDiam(),
    gainDiamants: () => diamantGain,
    diamantsPartie: () => ({ ...run.diamants, total: diamantsTotal() }),
    gain: () => gainView,
    gainMedailles: () => gainMedaillesView,
    status,
    // Pour les écrans de fin et de pause : { balance (Zollars), soldeMedailles, soldeDiamants, status, earnedRun, medaillesRun, readOnly, pending }.
    summary: () => ({ balance: balance(), soldeMedailles: soldeMedailles(), soldeDiamants: soldeDiam(), status: status(), earnedRun: ledger.earnedRun, medaillesRun: run.medailles, readOnly: mode.readOnly === true, pending: pending.medailles }),
    snapshot() {
      const info = repository.info();
      return {
        kind: info.kind, mode: mode.kind, status: status(), readOnly: mode.readOnly === true, locked: info.locked, key: info.key,
        balance: balance(), pending: pending.medailles,
        medailles: { solde: soldeMedailles(), run: run.medailles, pending: pending.medailles, gainText: gainMedaillesView.visible ? gainMedaillesView.text : '' },
        diamants: { solde: soldeDiam(), run: { ...run.diamants, total: diamantsTotal() }, tues: run.tues, gagne: saved?.diamants?.gagne ?? 0, paliers: structuredClone(saved?.paliers ?? {}), mondesFinis: [...(saved?.mondesFinis ?? [])], jour: saved?.diamants?.jour ?? 0 },
        partie: { mode: modeJeu, monde, id },
        saved: { medailles: solde(saved), gagne: saved?.medailles?.gagne ?? 0, niveaux: { ...(saved?.niveaux ?? {}) }, records: structuredClone(saved?.records ?? {}), profil: { ...(saved?.profil ?? {}) }, rev: saved?.rev ?? 0 },
        lastCommit: { ...lastCommit }, reasons: [...(mode.reasons ?? [])], writes,
        economy: { earnedRun: ledger.earnedRun, killsRun: ledger.killsRun, byKind: { ...ledger.byKind }, gainText: gainView.visible ? gainView.text : '' },
      };
    },
    format: formatMoney,
    dispose: unsubscribe,
  };
}
