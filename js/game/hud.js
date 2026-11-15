// HUD en HTML (bloc E2-2), lot 3l : direction B « caméscope » de l'atelier (lot 3k). Trois colonnes de blocs de taille fixe écrits une fois dans jeu.html :
// à gauche REC + chrono (temps de jeu), VIE « 64/100 » (role="progressbar", sans barre), chutes (une silhouette « + » et le nombre) et étage, « Mode essai » ;
// au centre « VAGUE 07 / 40 » (+ « Renforcée »), l'argent (et son « +N »), puis le texte de l'état à terre (E2-10) ; à droite « RESTANTS 05 » (ou « DÉBUT 3 s »
// pendant l'attente) et « TUÉS 57 ». N'écrit dans le DOM que si une valeur change. L'annonce de vague (E2-8) est dans js/game/splash-view.js.
import { displayHealth } from '../core/combat.js';
import { formatMoney, formatMoneyCompact } from '../core/economy.js';
import { downView, formatChrono, killsText, pad2, waveParts } from '../core/hud-format.js';
import { DOWN_TEXTS, FLOOR_TEXTS, HUD_TEXTS, MONEY_TEXTS, fmt } from './texts.js';

const SVG = 'http://www.w3.org/2000/svg';
const SILHOUETTE = 'M5 1.5a2 2 0 1 1 0 4 2 2 0 0 1 0-4ZM2 7.5c0-1 .8-1.7 1.8-1.7h2.4c1 0 1.8.7 1.8 1.7V12H6.5v3.5h-3V12H2Z';
const PLUS = 'M12.5 1.5v5M10 4h5'; // petit « + » à côté de la tête : une chute restante = un revive

// Icône de silhouette des chutes (SVG en ligne, décorative).
function silhouette() {
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const path = document.createElementNS(SVG, 'path');
  path.setAttribute('d', SILHOUETTE);
  const plus = document.createElementNS(SVG, 'path');
  plus.setAttribute('d', PLUS);
  plus.setAttribute('class', 'hud-plus');
  svg.append(path, plus);
  return svg;
}

export function createHud(dict, root = document) {
  const el = (id) => root.getElementById(id);
  const els = {
    chrono: el('hud-chrono-text'), bar: el('hud-bar'), life: el('hud-life'), chutes: el('hud-chutes'), chuteIcons: el('hud-chutes-icons'), chuteText: el('hud-chutes-text'),
    floor: el('hud-floor'), floorText: el('hud-floor-text'), trial: el('hud-trial'), wave: el('hud-wave'), waveText: el('hud-wave-text'), reinforced: el('hud-reinforced'),
    money: el('hud-money'), moneyText: el('hud-money-text'), gain: el('hud-gain'), gainBleu: el('hud-gain-bleu'), gainBleuText: el('hud-gain-bleu-text'), remaining: el('hud-remaining'), remainingText: el('hud-remaining-text'),
    next: el('hud-next'), nextText: el('hud-next-text'), kills: el('hud-kills-text'),
    down: el('down'), downBody: el('down-body'), downTitle: el('down-title-text'), downSub: el('down-sub'), downFill: el('down-fill'),
  };
  const shown = {}; // dernières valeurs écrites, par nom
  // Écrit seulement si la valeur a changé depuis la dernière écriture.
  const changed = (key, value) => {
    if (shown[key] === value) return false;
    shown[key] = value;
    return true;
  };
  const setText = (node, text) => {
    if (node.textContent !== text) node.textContent = text;
  };
  const setHidden = (node, hidden) => {
    if (node.hidden !== hidden) node.hidden = hidden;
  };

  return {
    // player : { health, maxHealth } ; waves : sortie de wave-director.info() ; extras : { chutes, floor, maxWave, money: { balance, gain }, time, trial }.
    update(player, killCount, waves, extras = {}) {
      const hp = displayHealth(player.health);
      if (changed('life', `${hp}/${player.maxHealth}`)) {
        setText(els.life, fmt(dict['game.hud.life'], { hp, max: player.maxHealth }));
        els.bar.setAttribute('aria-valuenow', String(hp));
        els.bar.setAttribute('aria-valuemax', String(player.maxHealth));
      }
      if (changed('chrono', formatChrono(extras.time))) setText(els.chrono, shown.chrono);
      if (changed('kills', killsText(killCount))) setText(els.kills, shown.kills);
      // Vague : en permanence pendant les manches (vague à venir pendant l'attente) ; sans vagues (visite libre), le bloc est invisible mais garde sa place.
      const active = Boolean(waves?.active);
      const waiting = active && waves.phase === 'attente';
      const fighting = active && !waiting;
      if (changed('active', active)) els.wave.dataset.idle = String(!active);
      if (active) {
        const { n, max } = waveParts(waves.wave, extras.maxWave);
        if (changed('wave', `${n}/${max}`)) setText(els.waveText, max === null ? n : fmt(dict[HUD_TEXTS.waveOf], { n, max }));
        if (changed('reinforced', waves.reinforced === true)) setText(els.reinforced, shown.reinforced ? dict[HUD_TEXTS.reinforced] : '');
      }
      // Colonne de droite, ligne 1 : « RESTANTS 05 » pendant la manche, « DÉBUT 3 s » pendant l'attente, vide sans vagues (même boîte, taille fixe).
      setHidden(els.remaining, !fighting);
      setHidden(els.next, !waiting);
      if (fighting && changed('remaining', pad2(waves.remaining))) setText(els.remainingText, shown.remaining);
      if (waiting && changed('next', Math.ceil(waves.waitLeft))) setText(els.nextText, fmt(dict[HUD_TEXTS.nextValue], { n: shown.next }));
      // Lot 3e : « RDC » ou « Étage », seulement quand la carte a des étages (extras.floor nul sinon).
      if (changed('floor', extras.floor ?? null)) {
        setHidden(els.floor, !extras.floor);
        setText(els.floorText, extras.floor ? dict[FLOOR_TEXTS.chip[extras.floor]] : '');
        els.floor.dataset.floor = extras.floor ?? '';
      }
      if (changed('trial', extras.trial === true)) setHidden(els.trial, !shown.trial);
      // Lot 4 : argent (montant court, aria-label avec le montant entier) et « +N » (décoratif, aria-hidden), écrits seulement s'ils changent.
      if (extras.money && changed('money', extras.money.balance)) {
        setText(els.moneyText, formatMoneyCompact(shown.money));
        els.money.setAttribute('aria-label', fmt(dict[MONEY_TEXTS.chip], { n: formatMoney(shown.money) }));
      }
      const gainText = extras.money?.gain?.visible ? extras.money.gain.text : '';
      if (changed('gain', gainText)) {
        setText(els.gain, gainText);
        setHidden(els.gain, gainText === '');
        els.gain.dataset.animate = extras.money?.gain?.animate === false ? 'false' : 'true';
      }
      // Lot 8h : « +N » bleu discret (fin de manche, fin du monde ; décoratif, aria-hidden : l'annonce de fin de manche le dit en texte).
      const bleu = extras.money?.gainBleu?.visible ? extras.money.gainBleu.text : '';
      if (els.gainBleu && changed('gainBleu', bleu)) {
        setText(els.gainBleuText, bleu);
        setHidden(els.gainBleu, bleu === '');
        els.gainBleu.dataset.animate = extras.money?.gainBleu?.animate === false ? 'false' : 'true';
      }
      if (changed('chutes', extras.chutes)) {
        const n = Number.isInteger(extras.chutes) && extras.chutes > 0 ? extras.chutes : 0;
        // Retour du propriétaire (lot 4) : une seule silhouette, seul le nombre à côté change.
        if (els.chuteIcons.childElementCount === 0) els.chuteIcons.replaceChildren(silhouette());
        setText(els.chuteText, fmt(dict[DOWN_TEXTS.chutes], { n }));
        els.chutes.setAttribute('aria-label', fmt(dict[DOWN_TEXTS.chutesLabel], { n }));
      }
    },

    // E2-10 : état à terre. Le voile (#down) reste en plein écran ; le texte est dans la colonne centrale, sous l'argent : « À terre », « Tu te relèves
    // dans N s » et la barre (N / 5), puis « Protégé N s » (bouclier, barre sur 2 s). down : sim.down ; params : data/game/player-down.json.
    updateDown(down, dead, params) {
      const v = downView(down, dead, params);
      if (changed('downMode', v.mode)) {
        setHidden(els.down, v.mode === null);
        setHidden(els.downBody, v.mode === null);
        els.down.dataset.mode = v.mode ?? '';
        els.downBody.dataset.mode = v.mode ?? '';
        setHidden(els.downSub, v.mode !== 'terre');
        setText(els.downTitle, v.mode === 'terre' ? dict[DOWN_TEXTS.title] : '');
        shown.downSeconds = null;
      }
      if (v.mode !== null && changed('downSeconds', v.seconds)) {
        if (v.mode === 'terre') setText(els.downSub, fmt(dict[DOWN_TEXTS.countdown], { n: v.seconds }));
        else setText(els.downTitle, fmt(dict[DOWN_TEXTS.grace], { n: v.seconds }));
        els.downFill.style.setProperty('--down-p', v.ratio.toFixed(3));
      }
    },
  };
}
