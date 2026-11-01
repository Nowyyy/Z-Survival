// Atelier de l'interface (lot 3k) : HTML des propositions A, B, C (écrans de jeu ; les écrans hors partie sont dans screens.js). Une même structure
// sémantique pour les trois directions, mise en forme par css/proto-a.css, proto-b.css, proto-c.css. Chaque bloc mesuré porte data-ui (nom), data-role
// (hud, button, panel, overlay, decor, stick) et, pour les blocs de jeu, data-block (code E2-n ; E2-9 et E2-11 ne sont jamais réutilisés).
// Textes : clés existantes de fr.json (game.*) ou nouvelles clés de data/i18n/atelier-interface.json (ui3k.*), jamais en dur.

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// Icônes SVG écrites dans le code (décoratives).
export const ICONS = {
  heart: '<svg class="p-icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M8 14.5 1.8 8.3A3.6 3.6 0 0 1 8 3.9a3.6 3.6 0 0 1 6.2 4.4Z"/></svg>',
  coin: '<svg class="p-icon p-coin" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><circle cx="8" cy="8" r="6.5"/><path d="M8 4.2v7.6M5.6 6.2h3.7a1.2 1.2 0 0 1 0 2.4H6.7a1.2 1.2 0 0 0 0 2.4h3.7"/></svg>',
  person: '<svg class="p-icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M8 1.5a2.2 2.2 0 1 1 0 4.4 2.2 2.2 0 0 1 0-4.4ZM4.6 7.6c0-1 .8-1.7 1.8-1.7h3.2c1 0 1.8.7 1.8 1.7V12H10v3.5H6V12H4.6Z"/></svg>',
  pause: '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M4.5 3h2.4v10H4.5zM9.1 3h2.4v10H9.1z"/></svg>',
  stairs: '<svg class="p-icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M1.5 14.5h4v-3.5h3.5V7.5h3.5V4h2v10.5z"/></svg>',
  skull: '<svg class="p-icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M8 1.5c3.3 0 5.5 2.3 5.5 5.2 0 1.8-.9 3-2 3.7V13H4.5v-2.6c-1.1-.7-2-1.9-2-3.7C2.5 3.8 4.7 1.5 8 1.5Zm-2.3 5a1.3 1.3 0 1 0 0 2.6 1.3 1.3 0 0 0 0-2.6Zm4.6 0a1.3 1.3 0 1 0 0 2.6 1.3 1.3 0 0 0 0-2.6Z"/></svg>',
  shield: '<svg class="p-icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M8 1 14 3.4v4.2c0 3.4-2.5 6.1-6 7.4-3.5-1.3-6-4-6-7.4V3.4Z"/></svg>',
  lock: '<svg class="p-icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M4.5 7V5a3.5 3.5 0 0 1 7 0v2H13v7.5H3V7Zm2 0h3V5a1.5 1.5 0 0 0-3 0Z"/></svg>',
  check: '<svg class="p-icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="m2 8.5 1.6-1.6 2.9 2.9 6-6L14 5.4l-7.5 7.5Z"/></svg>',
  star: '<svg class="p-icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="m8 1.3 2 4.3 4.7.5-3.5 3.2 1 4.6L8 11.5l-4.2 2.4 1-4.6L1.3 6.1 6 5.6Z"/></svg>',
};

const attr = (ui, role, extra = '') => `data-ui="${ui}" data-role="${role}"${extra}`;

// Pastilles de chutes : 5 emplacements fixes, pleins pour les chutes restantes, vides sinon (forme différente, et le nombre est écrit à côté).
function pips(n, max = 5) {
  return `<span class="p-pips" aria-hidden="true">${Array.from({ length: max }, (_, i) => `<span class="p-pip${i < n ? ' is-on' : ''}"></span>`).join('')}</span>`;
}

// Barre de vie : pleine (A, C) ; aucune barre en B (retour du propriétaire : « VIE » et « 100/100 » suffisent). La largeur ne change jamais.
function lifeBar(s, dir) {
  if (dir === 'B') return '';
  return `<span class="p-bar" aria-hidden="true"><span class="p-fill" style="--ui3k-p: ${s.hpRatio.toFixed(3)}"></span></span>`;
}

// HUD (E2-2) et bouton Pause (E2-5). macros.argent : haut-gauche, haut-droite ou sous-vague.
export function renderHud(s, dir, macros, t) {
  const life = `<div class="p-block p-life${s.lowHp ? ' is-low' : ''}" ${attr('vie', 'hud')} role="progressbar" aria-valuemin="0" aria-valuemax="${s.maxHp}" aria-valuenow="${s.hp}" aria-label="${esc(t('game.hud.lifeLabel'))}">
    ${dir === 'B' ? `<span class="p-label">${esc(t('ui3k.hud.lifeShort'))}</span>` : ICONS.heart}${lifeBar(s, dir)}<span class="p-value p-life-text">${esc(t('game.hud.life', { hp: s.hp, max: s.maxHp }))}</span></div>`;
  const chutes = `<div class="p-block p-chutes" ${attr('chutes', 'hud')} aria-label="${esc(t('game.down.chutes.label', { n: s.chutes }))}">${dir === 'A' ? pips(s.chutes) : ICONS.person}<span class="p-value">${esc(t('game.down.chutes', { n: s.chutes }))}</span></div>`;
  const waveText = dir === 'B' ? `<span class="p-label">${esc(t('ui3k.hud.waveShort'))}</span><span class="p-value">${esc(t('ui3k.hud.waveOf', { n: String(s.wave).padStart(2, '0'), max: s.maxWave }))}</span>`
    : dir === 'C' ? `<span class="p-value">${esc(t('ui3k.hud.waveOf', { n: s.wave, max: s.maxWave }))}</span><span class="p-label">${esc(t('ui3k.hud.waveWord'))}</span>`
      : `<span class="p-value">${esc(t('game.wave.hudOf', { n: s.wave, max: s.maxWave }))}</span>`;
  const reinforced = `<span class="p-tag${s.reinforced ? '' : ' is-empty'}">${s.reinforced ? esc(t('ui3k.hud.reinforced')) : ''}</span>`;
  const wave = `<div class="p-block p-wave" ${attr('vague', 'hud')}>${waveText}${reinforced}</div>`;
  const remaining = `<div class="p-block p-remaining" ${attr('restants', 'hud')}>${dir === 'B' ? `<span class="p-label">${esc(t('ui3k.hud.remainingShort'))}</span><span class="p-value">${String(s.remaining).padStart(2, '0')}</span>` : `${dir === 'C' ? ICONS.skull : ''}<span class="p-value">${esc(t(s.remaining === 1 ? 'game.wave.remaining.one' : 'game.wave.remaining', { n: s.remaining }))}</span>`}</div>`;
  const floor = s.multiFloor ? `<div class="p-block p-floor" ${attr('etage', 'hud')}>${ICONS.stairs}<span class="p-value">${esc(t(s.floor === 'etage' ? 'game.hud.floor.etage' : 'game.hud.floor.rdc'))}</span></div>` : '';
  const money = `<div class="p-block p-money" ${attr('argent', 'hud')} aria-label="${esc(t('game.hud.moneyLabel', { n: s.moneyText }))}">${ICONS.coin}<span class="p-value">${esc(s.moneyCompact)}</span></div>`;
  const trial = s.trial ? `<div class="p-block p-trial" ${attr('essai', 'hud')}>${esc(t('ui3k.hud.trial'))}</div>` : '';
  const chrono = dir === 'B' ? `<div class="p-block p-chrono" ${attr('chrono', 'hud')}><span class="p-rec" data-blink="rec" data-blink-cycles="1" aria-hidden="true"></span><span class="p-label">${esc(t('ui3k.hud.rec'))}</span><span class="p-value">${esc(s.chronoText)}</span></div>` : '';
  const kills = dir === 'B' ? `<div class="p-block p-kills" ${attr('tues', 'hud')}><span class="p-label">${esc(t('ui3k.hud.killsShort'))}</span><span class="p-value">${String(s.kills).padStart(4, '0')}</span></div>` : '';
  const pause = `<button class="p-pause" type="button" data-block="E2-5" ${attr('pause', 'button')} aria-label="${esc(t('game.pause.open'))}">${ICONS.pause}</button>`;
  const corners = dir === 'B' ? '<span class="p-corner p-corner-tl" aria-hidden="true"></span><span class="p-corner p-corner-tr" aria-hidden="true"></span>' : '';
  const pos = macros?.argent ?? 'haut-droite';
  const tl = { A: [life, chutes, floor], B: [chrono, life, chutes, floor], C: [life, chutes, floor] }[dir];
  // B (retour du propriétaire) : « Restants » passe à droite au-dessus des tués, l'argent sous la vague (macro « sous-vague » par défaut).
  const tc = dir === 'B' ? [wave, trial] : [wave, remaining];
  const tr = { A: [trial], B: [remaining, kills], C: [trial] }[dir];
  if (pos === 'haut-gauche') tl.push(money);
  else if (pos === 'sous-vague') tc.splice(1, 0, money);
  else if (dir === 'B') tr.push(money);
  else tr.unshift(money);
  return `<div class="p-hud" data-block="E2-2">${corners}<div class="p-cluster p-tl">${tl.join('')}</div><div class="p-cluster p-tc">${tc.join('')}</div><div class="p-cluster p-tr">${tr.join('')}</div></div>${pause}`;
}

// Panneau de pause (E2-6).
export function renderPause(s, dir, t) {
  const rows = [
    `<p class="p-line p-balance">${ICONS.coin}<span>${esc(t('game.pause.balance', { n: s.moneyText }))}</span></p>`,
    `<p class="p-note" data-status="${esc(s.save)}">${esc(t(`game.save.status.${s.save}`))}</p>`,
    s.nextZone ? `<p class="p-line">${esc(t('game.pause.nextZone', { n: s.nextZone }))}</p>` : '',
  ].join('');
  const b = (key, cls = 'p-btn-quiet', extra = '') => `<button class="p-btn ${cls}" type="button" ${attr(`btn-${key.split('.').pop()}`, 'button', ' data-parent="panneau" data-notext')}${extra}>${esc(t(key))}</button>`;
  return `<div class="p-modal" data-block="E2-6" role="dialog" aria-modal="true" aria-labelledby="p-pause-title" data-ui="voile" data-role="overlay" data-notext>
    <div class="p-panel p-panel-pause" ${attr('panneau', 'panel')}>
      <h2 id="p-pause-title" class="p-title">${esc(t('game.pause.title'))}</h2>
      <div class="p-facts">${rows}</div>
      <div class="p-actions">
        ${b('game.pause.resume', 'p-btn-main')}
        ${b('game.pause.fullscreen')}
        <button class="p-btn p-btn-quiet" type="button" aria-pressed="true" ${attr('btn-son', 'button', ' data-parent="panneau" data-notext')}>${esc(t('game.sound.on'))}</button>
        <button class="p-btn p-btn-quiet" type="button" aria-pressed="true" ${attr('btn-vhs', 'button', ' data-parent="panneau" data-notext')}>${esc(t('game.vhs.on'))}</button>
        ${b('game.pause.restart')}
        <div class="p-volume" ${attr('volume', 'button', ' data-parent="panneau" data-notext')}><label for="p-volume-${dir}">${esc(t('game.volume'))}</label><input id="p-volume-${dir}" type="range" min="0" max="100" step="10" value="80"><output for="p-volume-${dir}">${esc(t('game.volume.value', { n: 80 }))}</output></div>
      </div>
    </div>
  </div>`;
}

// Écran de fin (E2-7) : mort ou monde terminé.
export function renderEnd(s, dir, t, worldBonusText) {
  const world = s.end === 'world';
  const line = (cls, html) => `<p class="p-line ${cls}">${html}</p>`;
  const facts = [
    line('p-big', `<span>${esc(t('game.wave.reached', { n: s.wave }))}</span>`),
    line('', `<span>${esc(t('game.end.kills', { n: s.kills }))}</span>`),
    line('p-money-line', `${ICONS.coin}<span>${esc(t('game.end.earned', { n: s.earnedText }))}</span>`),
    world ? line('p-money-line', `${ICONS.coin}<span>${esc(t('game.end.worldBonus', { n: worldBonusText }))}</span>`) : '',
    line('', `<span>${esc(t('game.end.balance', { n: s.moneyText }))}</span>`),
    line('', `<span>${esc(t('game.end.best', { n: s.bestWave }))}</span>`),
    s.record ? line('p-record', `${ICONS.star}<span>${esc(t('game.end.record'))}</span>`) : '',
    s.trial ? `<p class="p-note">${esc(t('game.end.trial'))}</p>` : '',
  ].join('');
  return `<div class="p-modal" data-block="E2-7" role="alertdialog" aria-modal="true" aria-labelledby="p-end-title" data-ui="voile" data-role="overlay" data-notext>
    <div class="p-panel p-panel-end" ${attr('panneau', 'panel')}>
      <h2 id="p-end-title" class="p-title">${world ? ICONS.check : ICONS.skull}<span>${esc(t(world ? 'game.end.world' : 'game.end.title'))}</span></h2>
      <div class="p-facts">${facts}</div>
      <div class="p-actions">
        <button class="p-btn p-btn-main" type="button" ${attr('btn-rejouer', 'button', ' data-parent="panneau" data-notext')}>${esc(t('game.end.replay'))}</button>
        <a class="p-btn p-btn-quiet" href="sauvegarde.html" target="_blank" rel="noopener" ${attr('btn-sauvegarde', 'button', ' data-parent="panneau" data-notext')}>${esc(t('game.end.saveLink'))}</a>
      </div>
    </div>
  </div>`;
}

// État à terre (E2-10) : voile de bord, compte à rebours de 5 s (texte + barre), puis « Protégé N s ».
export function renderDown(s, dir, t) {
  const grace = s.down.mode === 'grace';
  const total = grace ? 2 : 5;
  const ratio = Math.max(0, Math.min(1, s.down.seconds / total));
  const body = grace
    ? `<p class="p-down-title">${ICONS.shield}<span>${esc(t('game.down.grace', { n: s.down.seconds }))}</span></p>`
    : `<p class="p-down-title">${esc(t('game.down.title'))}</p><p class="p-down-sub">${esc(t('game.down.countdown', { n: s.down.seconds }))}</p>`;
  return `<div class="p-down${grace ? ' is-grace' : ''}" data-block="E2-10" aria-hidden="true">
    <div class="p-down-veil" data-ui="voile-terre" data-role="overlay" data-notext></div>
    <div class="p-down-body" ${attr('a-terre', 'hud')}>${body}<span class="p-down-bar" aria-hidden="true"><span class="p-fill" style="--ui3k-p: ${ratio.toFixed(3)}"></span></span></div>
  </div>`;
}

// Sticks flottants (E2-3 gauche actif, E2-4 droit au repos) et aide de démarrage facultative.
export function renderSticks(dir, t, { help = false } = {}) {
  const stick = (id, block, active) => `<div class="p-stick${active ? ' is-active' : ' is-idle'}" data-block="${block}" ${attr(id, 'stick', ' data-notext')}><span class="p-stick-base"></span><span class="p-stick-knob"></span></div>`;
  const hints = help ? `<p class="p-hint p-hint-left" ${attr('aide-gauche', 'decor')}>${esc(t('ui3k.sticks.move'))}</p><p class="p-hint p-hint-right" ${attr('aide-droite', 'decor')}>${esc(t('ui3k.sticks.aim'))}</p>` : '';
  return `${stick('stick-gauche', 'E2-3', true)}${stick('stick-droit', 'E2-4', false)}${hints}`;
}

// Écran de jeu complet d'une direction : le HUD est toujours dessous, l'écran demandé par-dessus.
export function renderGameScreen(screen, s, dir, macros, t, extra = {}) {
  const hud = renderHud(s, dir, macros, t);
  if (screen === 'pause') return hud + renderPause(s, dir, t);
  if (screen === 'fin-mort' || screen === 'fin-monde') return hud + renderEnd({ ...s, end: screen === 'fin-monde' ? 'world' : 'death' }, dir, t, extra.worldBonusText ?? '');
  if (screen === 'a-terre') return hud + renderDown(s.down.mode === 'none' ? { ...s, down: { mode: 'down', seconds: 5 } } : s, dir, t);
  if (screen === 'sticks') return hud + renderSticks(dir, t, { help: Boolean(extra.help) });
  return hud;
}
