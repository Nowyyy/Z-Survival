// Atelier de l'interface (lot 3k) : « Actuel » = le vrai jeu (jeu.html, même origine), piloté seulement par les hooks existants de window.__zs
// (?test=1). Aucun fichier du jeu n'est modifié : on lit son DOM, on injecte au plus une feuille de style dans son document (zones de sécurité
// simulées, masquage de l'interface pour les directions A, B, C) et on fige sa boucle d'images comme le font les tests (requestAnimationFrame neutralisé,
// le temps n'avance que par step()). Ce qu'aucun hook ne permet est signalé, jamais imité.

export const GAME_URL = 'jeu.html?test=1&seed=1';
const LEVEL_VIE = 12; // vie maximale + 12 par niveau de la statistique « vie » (player-stats.json, rappel pour reproduire maxHp)

// Paramètres d'adresse propres à un état (mode essai : sauvegarde en lecture seule, comme dans le jeu).
export function actuelUrl(state, { vhs = true, extra = '' } = {}) {
  const parts = [GAME_URL];
  if (!vhs) parts.push('vhs=0');
  if (state?.floor === 'etage') parts.push(`wave=${Math.max(21, state.wave)}`, 'floor=1');
  else if (state?.trial) parts.push(`wave=${state.wave}`);
  if (extra) parts.push(extra);
  return parts.join('&');
}

// Éléments mesurés de l'interface actuelle, par écran.
export function actuelItems(screen) {
  // E1 « actuel » : la page d'attente index.html (titre, état, bandeaux).
  if (screen === 'menu') return [{ name: 'titre', selector: '.title', role: 'hud' }, { name: 'statut', selector: '.status', role: 'hud' }, { name: 'badge', selector: '.crumb', role: 'hud' }, { name: 'pied', selector: '.foot .zone', role: 'hud' }];
  const hud = [
    { name: 'hud', selector: '#hud', role: 'hud' },
    { name: 'argent', selector: '#hud-money', role: 'hud' },
    { name: 'gain', selector: '#hud-gain', role: 'hud', parent: 'argent' },
    { name: 'vague', selector: '#hud-wave', role: 'hud' },
    { name: 'pause', selector: '#btn-pause', role: 'button', target: true },
    { name: 'son', selector: '#sound-hint', role: 'button', target: true },
  ];
  if (screen === 'pause') return [{ name: 'panneau', selector: '#pause-panel .panel', role: 'panel', noText: true }, { name: 'pause-texte', selector: '#pause-panel .panel', role: 'overlay' }, { name: 'bouton', selector: '#pause-panel button, #pause-panel input', role: 'button', target: true, all: true, parent: 'panneau', noText: true }];
  if (screen === 'fin-mort' || screen === 'fin-monde') return [{ name: 'panneau', selector: '#end-panel .panel', role: 'panel', noText: true }, { name: 'fin-texte', selector: '#end-panel .panel', role: 'overlay' }, { name: 'bouton', selector: '#end-panel .button', role: 'button', target: true, all: true, parent: 'panneau', noText: true }];
  if (screen === 'a-terre') return [...hud, { name: 'a-terre', selector: '#down .down-body', role: 'hud' }];
  if (screen === 'sticks') return [...hud, { name: 'stick-gauche', selector: '#stick-left .stick-base', role: 'stick' }, { name: 'stick-droit', selector: '#stick-right .stick-base', role: 'stick' }];
  return hud;
}

export const ACTUEL_HUD_NAMES = ['hud', 'argent', 'gain', 'vague', 'pause'];

// Zones de sécurité simulées : le jeu lit env(safe-area-inset-*) par un élément sonde (js/game/safe-area.js) ; on impose le padding de la sonde
// puis on relance sa lecture par un événement resize. Renvoie les variables publiées par le jeu.
export function injectSafeArea(doc, safe) {
  let style = doc.getElementById('ui3k-safe');
  if (!style) {
    style = doc.createElement('style');
    style.id = 'ui3k-safe';
    doc.head.append(style);
  }
  const s = { top: 0, right: 0, bottom: 0, left: 0, ...(safe ?? {}) };
  style.textContent = `.safe-probe { padding: ${s.top}px ${s.right}px ${s.bottom}px ${s.left}px !important; }`;
  doc.defaultView.dispatchEvent(new doc.defaultView.Event('resize'));
  return ['top', 'right', 'bottom', 'left'].map((k) => doc.documentElement.style.getPropertyValue(`--safe-${k}`));
}

// Masque l'interface du jeu (directions A, B, C) : règles display: none injectées de l'extérieur, le canvas, le voile d'étage et l'effet VHS restent.
export const GAME_UI_SELECTORS = ['.hud-left', '#hud-wave', '#btn-pause', '#down', '#stick-left', '#stick-right', '#sound-hint', '#pause-panel', '#end-panel', '#wave-announce', '#labels', '#rotate'];
export function hideGameInterface(doc) {
  if (doc.getElementById('ui3k-hide')) return;
  const style = doc.createElement('style');
  style.id = 'ui3k-hide';
  style.textContent = `${GAME_UI_SELECTORS.join(', ')} { display: none !important; }`;
  doc.head.append(style);
}

// Fige la boucle d'images (le temps n'avance plus que par step()).
export function freeze(win) {
  win.requestAnimationFrame = () => 0;
}

const tap = (win, type, id, x, y) => {
  const root = win.document.getElementById('game-root');
  root.dispatchEvent(new win.PointerEvent(type, { pointerType: 'touch', pointerId: id, clientX: x, clientY: y, bubbles: true, isPrimary: id === 11 }));
};

// Amène le jeu à l'écran et à l'état demandés par les hooks ; renvoie { available, notes } (notes : écarts avec l'état demandé, en clair).
// state : sortie de mockState (js/core/ui-mock.js).
export function driveActuel(win, screen, state) {
  const zs = win.__zs;
  const notes = [];
  if (!zs) return { available: false, notes: ['hooks de test absents'] };
  if (['menu', 'boutique', 'reglages', 'classement'].includes(screen)) return { available: false, notes: ['écran absent du jeu actuel'] };
  freeze(win);
  const level = (state.maxHp - 100) / LEVEL_VIE;
  if (state.maxHp !== 100) {
    if (Number.isInteger(level) && level >= 0 && level <= 10) zs.setLevels({ vie: level });
    else notes.push(`vie maximale ${state.maxHp} non reproductible (100 + 12 par niveau)`);
  }
  const remaining = Math.max(1, state.remaining);
  zs.setWaveParams({ total: { base: remaining, linear: 0, quadratic: 0, cap: remaining } });
  if (screen === 'fin-monde') {
    zs.startWave(40);
    zs.step(3.2);
    zs.skipWave();
    zs.step(0.3);
    return { available: true, notes };
  }
  const urlWave = state.floor === 'etage' || state.trial;
  if (!urlWave && state.wave > 1) zs.startWave(state.wave);
  if (state.money > 0) zs.giveMoney(state.money);
  zs.step(3.3); // compte à rebours de début de manche : la manche commence, le « +N » de l'argent est retombé
  if (state.remaining === 0) notes.push('0 restant non reproductible : au moins 1');
  zs.setChutes(screen === 'fin-mort' ? 0 : state.chutes);
  const s0 = zs.getState();
  if (state.hp < s0.player.maxHp && screen !== 'fin-mort' && screen !== 'a-terre') {
    // Vie : un zombie frappe le joueur (visée détournée pour qu'il ne soit pas abattu) jusqu'à la vie voulue, puis il est retiré sans compter de tué.
    // On s'arrête avant un coup qui éloignerait de la cible ou ferait tomber le joueur.
    const p = s0.player;
    zs.setInput({ aim: { angle: Math.PI } });
    zs.spawnEnemy(p.x + 34, p.y, { type: 'marcheur' });
    const hit = Math.max(1, zs.getState().enemies.at(-1)?.damage ?? 10);
    for (let i = 0; i < 600; i += 1) {
      const h = zs.getState().player.health;
      if (h <= state.hp || h - hit <= 0 || state.hp - (h - hit) > h - state.hp) break;
      zs.step(0.05);
    }
    zs.killAll();
    zs.setInput({});
    const hp = Math.round(zs.getState().player.health);
    if (hp !== state.hp) notes.push(`vie ${hp} au lieu de ${state.hp} (approchée par des coups de zombie)`);
  }
  if (state.kills > 0) notes.push(`tués : ${s0.kills} (aucun hook ne règle le nombre de tués)`);
  if (screen === 'a-terre') {
    if (state.chutes < 1) zs.setChutes(1);
    zs.downPlayer();
    zs.step(0.1);
    const mode = state.down?.mode === 'grace' ? 'grace' : 'down';
    const secs = state.down?.seconds ?? 5;
    if (mode === 'down') zs.step(Math.max(0, 5 - secs));
    else zs.step(5 + Math.max(0, 2 - secs) + 0.1);
  } else if (screen === 'fin-mort') {
    zs.downPlayer();
    zs.step(0.2);
  } else if (screen === 'pause') {
    win.document.getElementById('btn-pause').click();
  } else if (screen === 'sticks') {
    const w = win.innerWidth;
    const h = win.innerHeight;
    tap(win, 'pointerdown', 12, w * 0.8, h * 0.7);
    tap(win, 'pointerup', 12, w * 0.8, h * 0.7);
    tap(win, 'pointerdown', 11, w * 0.18, h * 0.7);
    tap(win, 'pointermove', 11, w * 0.18 + 30, h * 0.7 - 20);
    zs.step(0.05);
  }
  if (!['saved', 'memory'].includes(state.save) && !state.trial) notes.push(`état de sauvegarde « ${state.save} » non reproductible (mémoire en ?test=1)`);
  return { available: true, notes };
}
