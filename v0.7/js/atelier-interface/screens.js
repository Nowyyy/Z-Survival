// Atelier de l'interface (lot 3k-C) : prototypes des écrans hors partie (E1 menu, E3 boutique, E5 réglages, classement) et propositions de priorité 2.
// Logique pure (prix fictifs, états des boutons, niveaux de sang, verrouillage des mondes, règles du pseudo) et HTML (chaînes, textes échappés).
// FAUSSES DONNÉES (data/game/ui-atelier.json, « fake ») : rien n'est réel, rien n'est enregistré, aucune connexion ni requête vers un service.
import { formatMoney } from '../core/economy.js';
import { formatChrono } from '../core/ui-mock.js';
import { esc, ICONS } from './render.js';

const isObject = (o) => o !== null && typeof o === 'object' && !Array.isArray(o);
const int = (v, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? Math.floor(v) : d);

// ---------- Logique pure ----------
// Niveau maximal d'une amélioration (player-stats.json : maxLevel commun, ou extra[stat].maxLevel).
export function maxLevelOf(stat, stats) {
  const extra = stats?.extra?.[stat]?.maxLevel;
  if (Number.isInteger(extra)) return extra;
  return Number.isInteger(stats?.maxLevel) ? stats.maxLevel : 10;
}

// Prix fictif du niveau suivant : base × croissance^niveau × multiplicateur de la statistique, arrondi à la dizaine (jamais négatif).
export function fakePrice(stat, level, fake) {
  const p = fake?.price ?? {};
  const base = typeof p.base === 'number' && p.base > 0 ? p.base : 150;
  const growth = typeof p.growth === 'number' && p.growth >= 1 ? p.growth : 1.5;
  const mul = typeof p.statMul?.[stat] === 'number' && p.statMul[stat] > 0 ? p.statMul[stat] : 1;
  const l = Math.max(0, Math.min(50, int(level)));
  return Math.max(0, Math.round((base * growth ** l * mul) / 10) * 10);
}

// État du bouton « Acheter » : 'max' (niveau maximal), 'available' (assez d'argent) ou 'insufficient'.
export function buyState(level, max, price, balance) {
  if (int(level) >= int(max, 10)) return 'max';
  return int(balance) >= int(price, Infinity) ? 'available' : 'insufficient';
}

// Lignes de la boutique : [{ stat, level, max, price (null au maximum), state }].
export function shopRows(fake, stats) {
  const list = Array.isArray(fake?.stats) ? fake.stats : [];
  const balance = int(fake?.balance);
  return list.map((stat) => {
    const max = maxLevelOf(stat, stats);
    const level = Math.max(0, Math.min(max, int(fake?.levels?.[stat])));
    const price = level >= max ? null : fakePrice(stat, level, fake);
    return { stat, level, max, price, state: buyState(level, max, price, balance) };
  });
}

// Armes fictives : [{ id, price, state: 'owned' | 'available' | 'insufficient' }].
export function weaponRows(fake) {
  const balance = int(fake?.balance);
  return (Array.isArray(fake?.weapons) ? fake.weapons : []).filter((w) => isObject(w) && typeof w.id === 'string').map((w) => ({
    id: w.id, price: int(w.price), state: w.owned ? 'owned' : int(balance) >= int(w.price) ? 'available' : 'insufficient',
  }));
}

// Mondes : le premier toujours ouvert ; un monde n'est ouvert que si le précédent l'est et qu'il est marqué ouvert (« Termine le monde précédent »).
export function worldRows(fake) {
  const list = Array.isArray(fake?.worlds) ? fake.worlds.filter((w) => isObject(w) && typeof w.id === 'string') : [];
  let open = true;
  return list.map((w, i) => {
    const unlocked = i === 0 || (open && w.unlocked === true);
    open = unlocked;
    return { id: w.id, unlocked, bestWave: unlocked ? int(w.bestWave) : 0 };
  });
}

// Niveaux de sang (lot 3j : ?sang=0|reduit|1) ; valeur inconnue : complet ('1').
export const BLOOD_LEVELS = ['0', 'reduit', '1'];
export const bloodLevel = (v) => (BLOOD_LEVELS.includes(v) ? v : '1');

// Pseudo du classement : 3 à 20 caractères après suppression des espaces aux bords ; lettres (accents compris), chiffres, espace, tiret, souligné.
// Renvoie { ok, value, error } avec error parmi 'empty', 'short', 'long', 'chars'.
export function validatePseudo(raw, rules = { min: 3, max: 20 }) {
  const min = int(rules?.min, 3);
  const max = int(rules?.max, 20);
  const value = typeof raw === 'string' ? raw.trim().replace(/\s+/g, ' ') : '';
  if (value === '') return { ok: false, value, error: 'empty' };
  const length = [...value].length;
  if (length < min) return { ok: false, value, error: 'short' };
  if (length > max) return { ok: false, value: [...value].slice(0, max).join(''), error: 'long' };
  if (!/^[\p{L}\p{N} _-]+$/u.test(value)) return { ok: false, value, error: 'chars' };
  return { ok: true, value, error: null };
}

// Classement d'un monde : lignes triées par rang, plus la ligne du joueur (marquée) si elle concerne ce monde.
export function boardRows(fake, worldId) {
  const rows = Array.isArray(fake?.leaderboard?.[worldId]) ? fake.leaderboard[worldId].filter(isObject) : [];
  const sorted = [...rows].sort((a, b) => int(a.rank) - int(b.rank)).map((r) => ({ rank: int(r.rank), pseudo: String(r.pseudo ?? ''), wave: int(r.wave), time: formatChrono(int(r.time)), me: false }));
  const p = fake?.player;
  if (isObject(p) && p.world === worldId) sorted.push({ rank: int(p.rank), pseudo: String(p.pseudo ?? ''), wave: int(p.wave), time: formatChrono(int(p.time)), me: true });
  return sorted;
}

// ---------- HTML ----------
const attr = (ui, role, extra = '') => `data-ui="${ui}" data-role="${role}"${extra}`;
const btn = (ui, label, { cls = 'p-btn-quiet', extra = '', icon = '' } = {}) => `<button class="p-btn ${cls}" type="button" ${attr(ui, 'button', ' data-notext')}${extra}>${icon}<span>${esc(label)}</span></button>`;
const pageHead = (title, t, fake, { back = true } = {}) => `<header class="p-page-head">
    ${back ? btn('retour', t('ui3k.common.back'), { extra: ` aria-label="${esc(t('ui3k.common.back'))}"` }) : ''}
    <h2 class="p-title p-page-title">${esc(title)}</h2>
    <p class="p-block p-balance" ${attr('solde', 'hud')}>${ICONS.coin}<span class="p-value">${esc(formatMoney(fake?.balance))}</span></p>
  </header>`;
const fakeNote = (t) => `<p class="p-note p-fake" ${attr('fictif', 'hud')}>${esc(t('ui3k.common.fake'))}</p>`;
const pips = (level, max) => `<span class="p-levels" aria-hidden="true">${Array.from({ length: max }, (_, i) => `<span class="p-lv${i < level ? ' is-on' : ''}"></span>`).join('')}</span>`;

// E1 menu (point de départ : index.html, titre en Rubik Wet Paint, mention « contenu provisoire »).
export function renderMenu(dir, t, fake) {
  const worlds = worldRows(fake).map((w, i) => `<li class="p-card p-world${w.unlocked ? '' : ' is-locked'}" ${attr(`monde-${i + 1}`, 'hud')}>
      <span class="p-card-title">${w.unlocked ? '' : ICONS.lock}${esc(t('ui3k.menu.world', { n: i + 1 }))}</span>
      <span class="p-card-sub">${esc(w.unlocked ? t('ui3k.menu.best', { n: w.bestWave }) : t('ui3k.menu.locked'))}</span>
    </li>`).join('');
  return `<div class="p-page p-menu" data-block="E1" data-ui="page" data-role="overlay" data-notext>
    <header class="p-page-head p-menu-head">
      <h2 class="p-menu-title" ${attr('titre', 'hud')}>${esc(t('app.title'))}</h2>
      <p class="p-block p-balance" ${attr('solde', 'hud')}>${ICONS.coin}<span class="p-value">${esc(formatMoney(fake?.balance))}</span></p>
    </header>
    <div class="p-menu-body">
      <div class="p-menu-play">${btn('jouer', t('ui3k.menu.play'), { cls: 'p-btn-main p-btn-big' })}</div>
      <section class="p-menu-worlds" aria-label="${esc(t('ui3k.menu.worlds'))}"><ul class="p-cards">${worlds}</ul></section>
    </div>
    <nav class="p-menu-nav" aria-label="${esc(t('ui3k.menu.nav'))}">
      ${btn('boutique', t('ui3k.menu.shop'))}${btn('reglages', t('ui3k.menu.settings'))}${btn('classement', t('ui3k.menu.board'))}
    </nav>
    <footer class="p-menu-foot" ${attr('pied', 'hud')}><span>${esc(t('app.provisional'))}</span> <span>${esc(t('ui3k.menu.legal'))}</span> <span>${esc(t('ui3k.common.fake'))}</span></footer>
  </div>`;
}

const BUY = { available: 'ui3k.shop.buy', insufficient: 'ui3k.shop.insufficient', max: 'ui3k.shop.max', owned: 'ui3k.shop.owned' };
const BUY_ICON = { available: ICONS.coin, insufficient: ICONS.lock, max: ICONS.check, owned: ICONS.check };

// E3 boutique : 9 améliorations (niveaux en pastilles, prix fictif, bouton à trois états) ou 3 armes fictives.
export function renderShop(dir, t, fake, stats, tab = 'ameliorations') {
  const tabs = ['ameliorations', 'armes'].map((id) => `<button class="p-btn p-tab" type="button" aria-pressed="${tab === id}" data-action="tab:${id}" ${attr(`onglet-${id}`, 'button', ' data-notext')}>${esc(t(`ui3k.shop.tab.${id}`))}</button>`).join('');
  const body = tab === 'armes'
    ? weaponRows(fake).map((w) => `<li class="p-card p-item is-${w.state}" ${attr(`arme-${w.id}`, 'hud')}>
        <span class="p-card-title">${esc(t(`ui3k.shop.weapon.${w.id}`))}</span>
        <span class="p-card-sub">${w.state === 'owned' ? esc(t('ui3k.shop.equipped')) : `${ICONS.coin}${esc(formatMoney(w.price))}`}</span>
        ${btn(`acheter-${w.id}`, t(BUY[w.state]), { cls: `p-buy is-${w.state}`, icon: BUY_ICON[w.state], extra: w.state === 'available' ? '' : ' aria-disabled="true"' })}
      </li>`).join('')
    : shopRows(fake, stats).map((r) => `<li class="p-card p-item is-${r.state}" ${attr(`amelioration-${r.stat}`, 'hud')}>
        <span class="p-card-title">${esc(t(`game.save.page.stat.${r.stat}`))} <span class="p-card-level">${esc(t('ui3k.shop.level', { n: r.level, max: r.max }))}</span></span>
        ${pips(r.level, r.max)}
        <span class="p-card-sub">${r.price === null ? '' : `${ICONS.coin}${esc(formatMoney(r.price))}`}</span>
        ${btn(`acheter-${r.stat}`, t(BUY[r.state]), { cls: `p-buy is-${r.state}`, icon: BUY_ICON[r.state], extra: r.state === 'available' ? '' : ' aria-disabled="true"' })}
      </li>`).join('');
  return `<div class="p-page p-shop" data-block="E3" data-ui="page" data-role="overlay" data-notext>
    ${pageHead(t('ui3k.shop.title'), t, fake)}
    <div class="p-tabs" role="group" aria-label="${esc(t('ui3k.shop.title'))}">${tabs}</div>
    <div class="p-scroll" tabindex="0" role="region" aria-label="${esc(t('ui3k.shop.title'))}"><ul class="p-cards p-grid">${body}</ul></div>
    ${fakeNote(t)}
  </div>`;
}

// E5 réglages : langue (français seul), son, volume, effet VHS, sang en trois niveaux, sauvegarde, participation au classement, pseudo.
export function renderSettings(dir, t, fake, { blood = '1', pseudo = '', join = false } = {}) {
  const level = bloodLevel(blood);
  const check = validatePseudo(pseudo, fake?.pseudo);
  const bloodButtons = BLOOD_LEVELS.map((b) => `<button class="p-btn p-choice" type="button" aria-pressed="${b === level}" data-action="sang:${b}" ${attr(`sang-${b}`, 'button', ' data-notext')}>${b === level ? ICONS.check : ''}<span>${esc(t(`ui3k.settings.blood.${b}`))}</span></button>`).join('');
  const pseudoMsg = pseudo === '' ? t('ui3k.settings.pseudo.rule', { min: fake?.pseudo?.min ?? 3, max: fake?.pseudo?.max ?? 20 }) : check.ok ? t('ui3k.settings.pseudo.ok') : t(`ui3k.settings.pseudo.${check.error}`);
  return `<div class="p-page p-settings" data-block="E5" data-ui="page" data-role="overlay" data-notext>
    ${pageHead(t('ui3k.settings.title'), t, fake)}
    <div class="p-scroll" tabindex="0" role="region" aria-label="${esc(t('ui3k.settings.title'))}"><div class="p-rows">
      <div class="p-row" ${attr('langue', 'hud')}><label for="p-lang-${dir}">${esc(t('ui3k.settings.language'))}</label><select id="p-lang-${dir}" class="p-select"><option>${esc(t('ui3k.settings.french'))}</option></select></div>
      <div class="p-row" ${attr('son', 'hud')}><span>${esc(t('ui3k.settings.sound'))}</span>${btn('btn-son', t('game.sound.on'), { extra: ' aria-pressed="true"' })}</div>
      <div class="p-row p-volume" ${attr('volume', 'hud')}><label for="p-svol-${dir}">${esc(t('game.volume'))}</label><input id="p-svol-${dir}" type="range" min="0" max="100" step="10" value="80"><output for="p-svol-${dir}">${esc(t('game.volume.value', { n: 80 }))}</output></div>
      <div class="p-row" ${attr('vhs', 'hud')}><span>${esc(t('game.vhs.label'))}</span>${btn('btn-vhs', t('game.vhs.on'), { extra: ' aria-pressed="true"' })}</div>
      <div class="p-row p-row-wide" ${attr('sang', 'hud')}><span id="p-blood-${dir}">${esc(t('ui3k.settings.blood'))}</span><div class="p-choices" role="group" aria-labelledby="p-blood-${dir}">${bloodButtons}</div></div>
      <div class="p-row" ${attr('sauvegarde', 'hud')}><span>${esc(t('ui3k.settings.save'))}</span><a class="p-btn p-btn-quiet" href="sauvegarde.html" target="_blank" rel="noopener" ${attr('lien-sauvegarde', 'button', ' data-notext')}>${esc(t('game.end.saveLink'))}</a></div>
      <div class="p-row p-row-wide" ${attr('participer', 'hud')}><label class="p-check"><input type="checkbox" data-action="join"${join ? ' checked' : ''}><span>${esc(t('ui3k.settings.join'))}</span></label></div>
      <div class="p-row p-row-wide" ${attr('pseudo', 'hud')}><label for="p-pseudo-${dir}">${esc(t('ui3k.settings.pseudo'))}</label><input id="p-pseudo-${dir}" class="p-input" type="text" maxlength="${(fake?.pseudo?.max ?? 20) + 5}" value="${esc(pseudo)}" autocomplete="off" spellcheck="false" data-action="pseudo"${join ? '' : ' disabled'}><span class="p-hint-text" data-pseudo="${check.ok ? 'ok' : check.error}">${esc(pseudoMsg)}</span></div>
    </div></div>
    ${fakeNote(t)}
  </div>`;
}

// Classement : un tableau par monde (sélecteur), ligne du joueur en évidence (texte « Toi » et étoile), état « connecte-toi », bouton fictif.
export function renderBoard(dir, t, fake, { world = 'monde-1', signedIn = false } = {}) {
  const worlds = worldRows(fake);
  const id = worlds.some((w) => w.id === world) ? world : worlds[0]?.id;
  const rows = boardRows(fake, id);
  const body = rows.length
    ? rows.map((r) => `<tr class="${r.me ? 'is-me' : ''}"${r.me ? ` ${attr('ma-ligne', 'hud')}` : ''}><td>${r.me ? ICONS.star : ''}${r.rank}</td><td>${esc(r.pseudo)}${r.me ? ` <span class="p-me">${esc(t('ui3k.board.me'))}</span>` : ''}</td><td>${r.wave}</td><td>${esc(r.time)}</td></tr>`).join('')
    : `<tr><td colspan="4">${esc(t('ui3k.board.empty'))}</td></tr>`;
  const options = worlds.map((w, i) => `<option value="${esc(w.id)}"${w.id === id ? ' selected' : ''}>${esc(t('ui3k.menu.world', { n: i + 1 }))}</option>`).join('');
  const account = signedIn
    ? btn('participer', t('ui3k.board.join'), { cls: 'p-btn-main' })
    : `<p class="p-note" ${attr('connexion-texte', 'hud')}>${esc(t('ui3k.board.signin'))}</p>${btn('google', t('ui3k.board.google'), { extra: ' data-action="signin"' })}`;
  return `<div class="p-page p-board" data-block="classement" data-ui="page" data-role="overlay" data-notext>
    ${pageHead(t('ui3k.board.title'), t, fake)}
    <div class="p-board-bar"><label for="p-world-${dir}">${esc(t('ui3k.board.world'))}</label><select id="p-world-${dir}" class="p-select" data-action="world" ${attr('monde', 'button', ' data-notext')}>${options}</select>${account}</div>
    <div class="p-scroll" tabindex="0" role="region" aria-label="${esc(t('ui3k.board.title'))}"><table class="p-table" ${attr('tableau', 'hud')}><thead><tr><th scope="col">${esc(t('ui3k.board.rank'))}</th><th scope="col">${esc(t('ui3k.board.pseudo'))}</th><th scope="col">${esc(t('ui3k.board.wave'))}</th><th scope="col">${esc(t('ui3k.board.time'))}</th></tr></thead><tbody>${body}</tbody></table></div>
    ${fakeNote(t)}
  </div>`;
}

// Propositions de priorité 2 (au plus 5, deux variantes chacune), posées sur le HUD.
export function renderPriority2(id, variant, t) {
  const v = variant === 'B' ? 'b' : 'a';
  if (id === 'retour-degats') return `<div class="p2 p2-hit p2-hit-${v}" ${attr('lisere', 'overlay', ' data-notext')} data-blink="flash" aria-hidden="true"></div>`;
  if (id === 'vie-faible') return `<p class="p2 p2-low p2-low-${v} p-block" ${attr('vie-faible', 'hud')}>${ICONS.heart}<span>${esc(t('ui3k.p2.low'))}</span></p>`;
  if (id === 'aide-demarrage') {
    const arrow = v === 'b' ? '<span class="p2-arrow" aria-hidden="true"></span>' : '';
    return `<p class="p-hint p-hint-left p2-help-${v}" ${attr('aide-gauche', 'decor')}>${arrow}${esc(t('ui3k.sticks.move'))}</p><p class="p-hint p-hint-right p2-help-${v}" ${attr('aide-droite', 'decor')}>${arrow}${esc(t('ui3k.sticks.aim'))}</p>`;
  }
  if (id === 'curseur-visee') return `<div class="p2 p2-aim p2-aim-${v}" ${attr('curseur', 'decor', ' data-notext')} aria-hidden="true"><span></span><span></span><span></span><span></span></div>`;
  if (id === 'nouvelle-zone') return `<div class="p2 p2-zone p2-zone-${v}" ${attr('nouvelle-zone', 'hud')}><p class="p2-zone-title">${esc(t('game.splash.zone.title'))}</p><p class="p2-zone-sub">${esc(t('game.splash.zone.subtitle'))}</p></div>`;
  return '';
}

// Écran hors partie d'une direction (ou null pour un écran de jeu).
export function renderOffGame(screen, dir, t, fake, stats, sub = {}) {
  if (screen === 'menu') return renderMenu(dir, t, fake);
  if (screen === 'boutique') return renderShop(dir, t, fake, stats, sub.tab);
  if (screen === 'reglages') return renderSettings(dir, t, fake, sub);
  if (screen === 'classement') return renderBoard(dir, t, fake, sub);
  return null;
}
