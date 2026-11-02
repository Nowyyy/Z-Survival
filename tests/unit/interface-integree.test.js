// Lot 3l : interface de l'atelier intégrée au jeu (HUD, pause, fins, à terre en direction B ; sticks en direction A). Formats purs du HUD, textes, feuilles de
// style, table des identifiants, structure de jeu.html et hygiène du lot (fichiers interdits inchangés, aucune dépendance ni fichier binaire ajouté).
import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { downView, formatChrono, killsText, pad2, waveParts } from '../../js/core/hud-format.js';
// Lot 4c (publication par versions, seul lot autorisé à modifier le workflow) : workflow, accueil, ses textes et tests du journal modifiés ; ce garde-fou de branche
// (comparaison à main ou à lot-4b) n'a plus de sens pour eux après l'entrée dans main : ils sortent de la liste.
const LOT_4C = ['.github/workflows/pages.yml', 'index.html', 'data/i18n/fr.json', 'tests/unit/data-changelog.test.js', 'tests/e2e/dev.spec.js'];

const html = readFileSync('jeu.html', 'utf8');
const fr = JSON.parse(readFileSync('data/i18n/fr.json', 'utf8'));
const uiCss = readFileSync('css/game-ui.css', 'utf8');
const gameCss = readFileSync('css/game.css', 'utf8');
const tokensCss = readFileSync('css/tokens.css', 'utf8');
const baseCss = readFileSync('css/base.css', 'utf8');
const strip = (text) => text.replace(/\/\*[\s\S]*?\*\//g, '');
const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
const classes = new Set([...html.matchAll(/\sclass="([^"]+)"/g)].flatMap((m) => m[1].split(/\s+/)));
const gameJs = readdirSync('js/game').map((f) => readFileSync(`js/game/${f}`, 'utf8')).join('\n');

function git(cmd) {
  try {
    return execSync(`git ${cmd}`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    return null;
  }
}
// Base du lot : le point de fusion avec la branche d'intégration (lot-4b avant ce lot) ; null hors d'un dépôt complet (les tests de diff se taisent).
const BASE = git('merge-base HEAD origin/lot-4b')?.trim() || null;
const changedSince = (paths) => (BASE ? (git(`diff --name-only ${BASE} -- ${paths}`) ?? '').split('\n').filter(Boolean) : []);

describe('formats du HUD (js/core/hud-format.js, pur)', () => {
  it.each([[0, '00'], [7, '07'], [40, '40'], [123, '123'], [7.9, '07']])('pad2(%s) = %s', (n, out) => {
    expect(pad2(n)).toBe(out);
  });

  it.each([[-3], [Number.NaN], [Number.POSITIVE_INFINITY], ['12'], [null], [undefined], [{}]])('pad2 : entrée hostile %s → « 00 »', (n) => {
    expect(pad2(n)).toBe('00');
  });

  it('tués sans zéros devant, place pour 4 chiffres et au-delà', () => {
    expect(killsText(0)).toBe('0');
    expect(killsText(57)).toBe('57');
    expect(killsText(9999)).toBe('9999');
    expect(killsText(-1)).toBe('0');
    expect(killsText(Number.NaN)).toBe('0');
  });

  it.each([[0, '00:00'], [0.99, '00:00'], [59.9, '00:59'], [60, '01:00'], [605, '10:05'], [3599, '59:59'], [3600, '1:00:00'], [3661.5, '1:01:01'], [36000, '10:00:00']])('chrono %s s → %s', (t, out) => {
    expect(formatChrono(t)).toBe(out);
  });

  it.each([[-5], [Number.NaN], [Number.NEGATIVE_INFINITY], ['30'], [null]])('chrono : entrée hostile %s → « 00:00 »', (t) => {
    expect(formatChrono(t)).toBe('00:00');
  });

  it('chrono : largeur fixe sous une heure (5 caractères, chiffres tabulaires en CSS)', () => {
    for (let t = 0; t < 3600; t += 137) expect(formatChrono(t)).toHaveLength(5);
  });

  it('vague : « 07 » et le maximum du monde ; sans maximum, au-delà ou maximum invalide : pas de « / 40 »', () => {
    expect(waveParts(7, 40)).toEqual({ n: '07', max: 40 });
    expect(waveParts(40, 40)).toEqual({ n: '40', max: 40 });
    expect(waveParts(41, 40)).toEqual({ n: '41', max: null });
    expect(waveParts(3, null)).toEqual({ n: '03', max: null });
    expect(waveParts(3, 0)).toEqual({ n: '03', max: null });
    expect(waveParts(3, 2.5)).toEqual({ n: '03', max: null });
  });

  it('à terre : compte à rebours de 5 s, secondes arrondies au supérieur, barre = secondes / 5', () => {
    expect(downView({ state: 'terre', timeLeft: 5, grace: 0 }, false, { downDuration: 5, graceTime: 2 })).toEqual({ mode: 'terre', seconds: 5, ratio: 1 });
    expect(downView({ state: 'terre', timeLeft: 3.2, grace: 0 }, false, { downDuration: 5, graceTime: 2 })).toEqual({ mode: 'terre', seconds: 4, ratio: 0.8 });
    expect(downView({ state: 'terre', timeLeft: 0.01, grace: 0 }, false, {})).toEqual({ mode: 'terre', seconds: 1, ratio: 0.2 });
  });

  it('protection après le relevage : « grace » sur 2 s ; rien après la mort ni debout sans protection', () => {
    expect(downView({ state: 'debout', timeLeft: 0, grace: 1.5 }, false, { graceTime: 2 })).toEqual({ mode: 'grace', seconds: 2, ratio: 1 });
    expect(downView({ state: 'debout', timeLeft: 0, grace: 0.5 }, false, { graceTime: 2 })).toEqual({ mode: 'grace', seconds: 1, ratio: 0.5 });
    expect(downView({ state: 'debout', grace: 1 }, true, {}).mode).toBeNull();
    expect(downView({ state: 'debout', grace: 0 }, false, {}).mode).toBeNull();
  });

  it('à terre : entrées hostiles sans exception (état absent, durées invalides, temps négatif)', () => {
    expect(downView(null, false).mode).toBeNull();
    expect(downView(undefined, undefined, null).mode).toBeNull();
    expect(downView({ state: 'terre', timeLeft: -2 }, false, { downDuration: -1 })).toEqual({ mode: 'terre', seconds: 0, ratio: 0 });
    expect(downView({ state: 'terre', timeLeft: 99 }, false, { downDuration: 5 }).ratio).toBe(1);
    expect(downView({ state: 'terre', timeLeft: Number.NaN }, false, {}).seconds).toBe(0);
  });

  it('module pur : ni Math.random, Date.now, performance.now, document, window, stockage, réseau ni minuteur ; imports seulement dans js/core/', () => {
    const src = readFileSync('js/core/hud-format.js', 'utf8');
    expect(src).not.toMatch(/Math\.random|Date\.now|performance\.now|\bdocument\b|\bwindow\b|localStorage|sessionStorage|indexedDB|\bfetch\s*\(|setTimeout|setInterval|requestAnimationFrame|THREE/);
    for (const m of src.matchAll(/from '([^']+)'/g)) expect(m[1]).toMatch(/^\.\/[a-z-]+\.js$/);
  });
});

describe('temps de jeu (getState().time) : déjà exposé par le jeu, figé en pause, remis à zéro à chaque partie', () => {
  const game = readFileSync('js/game/game.js', 'utf8');
  it('sim.time avance seulement dans step() (somme des pas bornés), qui n\'est pas appelé en pause, à la mort ni en fin de monde', () => {
    expect(game).toMatch(/function step\(dt\) \{[\s\S]{0,200}sim\.time \+= dt;/);
    expect(game).toMatch(/const dt = last === null \? 0 : clampDt\(/);
    expect(game).toMatch(/if \(!paused && !sim\.dead && !sim\.worldOver\) step\(dt\);/);
  });

  it('nouvelle partie : time repart de 0 ; le chrono du HUD lit sim.time (jamais l\'horloge réelle)', () => {
    expect(game).toMatch(/time: 0,/);
    expect(game).toMatch(/hud\.update\([^\n]*time: sim\.time/);
    expect(readFileSync('js/game/hud.js', 'utf8')).not.toMatch(/Date\.now|performance\.now/);
  });
});

describe('textes (data/i18n/fr.json)', () => {
  const NEW = { 'game.hud.rec': 'Rec', 'game.hud.lifeShort': 'Vie', 'game.hud.waveShort': 'Vague', 'game.hud.waveOf': '{n} / {max}', 'game.hud.reinforced': 'Renforcée', 'game.hud.remainingShort': 'Restants', 'game.hud.nextShort': 'Début', 'game.hud.nextValue': '{n} s', 'game.hud.killsShort': 'Tués', 'game.hud.trial': 'Mode essai', 'game.end.menu': 'Revenir au menu principal' };

  it.each(Object.entries(NEW))('%s = « %s »', (key, value) => {
    expect(fr[key]).toBe(value);
  });

  it('clés retirées (plus aucun usage) : game.hud.kills, game.hud.kills.one, game.wave.hud, game.wave.next', () => {
    for (const k of ['game.hud.kills', 'game.hud.kills.one', 'game.wave.hud', 'game.wave.next']) expect(fr[k], k).toBeUndefined();
  });

  it('chaque clé data-i18n de jeu.html existe, sans valeur vide, et aucune clé ui3k.* (atelier) n\'est entrée dans fr.json', () => {
    const used = [...html.matchAll(/data-i18n(?:-label)?="([^"]+)"/g)].map((m) => m[1]);
    expect(used.length).toBeGreaterThan(20);
    for (const k of used) expect(fr[k]?.trim(), k).toBeTruthy();
    expect(Object.keys(fr).filter((k) => k.startsWith('ui3k.'))).toEqual([]);
  });

  it('les clés game.* sont seulement en français (aucune dans en.json)', () => {
    const en = JSON.parse(readFileSync('data/i18n/en.json', 'utf8'));
    for (const k of Object.keys(NEW)) expect(en[k]).toBeUndefined();
  });
});

describe('feuilles de style de l\'interface (css/game-ui.css, css/game.css, css/tokens.css)', () => {
  const defined = new Set([...[tokensCss, gameCss, uiCss, baseCss].join('\n').matchAll(/(--[a-z0-9-]+)\s*:/gi)].map((m) => m[1]));

  it('toutes les variables utilisées par game-ui.css sont définies (jetons, game.css, game-ui.css) ou posées par le code (--down-p, --safe-*)', () => {
    const used = [...uiCss.matchAll(/var\((--[a-z0-9-]+)/g)].map((m) => m[1]);
    const byCode = ['--down-p'];
    for (const v of used) expect(defined.has(v) || byCode.includes(v), v).toBe(true);
    expect(gameJs).toMatch(/setProperty\('--down-p'/);
  });

  it('le bloc « Interface intégrée (lot 3l) » est le dernier de tokens.css et ne contient aucune couleur', () => {
    const at = tokensCss.lastIndexOf('/* Interface intégrée (lot 3l) */');
    expect(at).toBeGreaterThan(0);
    const block = tokensCss.slice(at);
    expect(block).toMatch(/--hud-text-scale: 1\.125;/);
    expect(strip(block)).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i);
  });

  it('une seule animation dans game-ui.css : le point REC, 1 s en steps(1) (1 clignotement par seconde), coupée sous prefers-reduced-motion', () => {
    const anims = [...strip(uiCss).matchAll(/animation:\s*([^;]+);/g)].map((m) => m[1].trim());
    expect(anims).toEqual(['hud-rec 1s steps(1, end) infinite', 'none']);
    expect(uiCss).toMatch(/@media \(prefers-reduced-motion: reduce\) \{\s*\.hud-rec \{\s*animation: none;/);
    expect(strip(uiCss)).not.toMatch(/transition\s*:/);
  });

  it('aucune règle CSS du jeu ne vise un identifiant absent de jeu.html (avant : #edges, #hud-fill, .hud-left… ; après : aucun)', () => {
    for (const css of [gameCss, uiCss]) {
      const selectors = strip(css).replace(/\{[^{}]*\}/g, '{}');
      for (const m of selectors.matchAll(/#([a-z][a-z0-9-]*)/gi)) expect(ids.has(m[1]), `#${m[1]}`).toBe(true);
    }
  });

  it('aucune classe orpheline dans game-ui.css : chaque classe est dans jeu.html ou posée par le code du jeu', () => {
    const selectors = strip(uiCss).replace(/\{[^{}]*\}/g, '{}').replace(/@media[^{]*\{/g, '');
    for (const m of selectors.matchAll(/\.([a-z][a-z0-9-]*)/gi)) {
      expect(classes.has(m[1]) || gameJs.includes(`'${m[1]}'`) || gameJs.includes(`"${m[1]}"`), `.${m[1]}`).toBe(true);
    }
  });

  it('les anciennes règles du HUD (lot 3a et lot 4) ont quitté game.css', () => {
    for (const sel of ['.hud-left', '.hud-chip', '.hud-bar', '.hud-fill', '.hud-life-row', '.hud-chips', '.panel-text', 'a.button', '.down-body', '.stick-knob', '.pause-button']) {
      expect(strip(gameCss), sel).not.toContain(`${sel} {`);
    }
  });

  it('jeu.html charge game-ui.css juste après game.css (aucune autre feuille ajoutée)', () => {
    const sheets = [...html.matchAll(/<link rel="stylesheet" href="([^"]+)">/g)].map((m) => m[1]);
    expect(sheets).toEqual(['css/tokens.css', 'css/base.css', 'css/game.css', 'css/game-ui.css']);
  });

  // Retour du propriétaire sur iPhone : 16 px à gauche et à droite, toujours (avant, dans ce lot : 16 px + zone de sécurité, lue de façon inégale par Safari).
  it('marges : 16 px à gauche et à droite sans la zone de sécurité ; en haut, 16 px + zone (--edge-left, --edge-right, --edge-top)', () => {
    expect(gameCss).toMatch(/--edge-left: var\(--game-margin\);/);
    expect(gameCss).toMatch(/--edge-right: var\(--game-margin\);/);
    expect(uiCss).toMatch(/--edge-top: calc\(var\(--game-margin\) \+ var\(--safe-top\)\);/);
    expect(uiCss).toMatch(/\.hud \{[^}]*top: var\(--edge-top\);[^}]*left: var\(--edge-left\);[^}]*right: var\(--edge-right\);/);
  });
});

// Table des identifiants : conservés, ajoutés, retirés (Docs/ref/interface-integree.md).
describe('identifiants de jeu.html (table de Docs/ref/interface-integree.md)', () => {
  const KEPT = ['hud', 'hud-bar', 'hud-life', 'hud-chutes', 'hud-chutes-icons', 'hud-chutes-text', 'hud-floor', 'hud-wave', 'hud-money', 'hud-money-text', 'hud-gain', 'hud-remaining', 'hud-next', 'hud-kills',
    'down', 'down-title', 'down-sub', 'btn-pause', 'stick-left', 'stick-right', 'sound-hint', 'hud-live', 'pause-panel', 'pause-title', 'pause-balance',
    'btn-resume', 'btn-fullscreen', 'btn-sound', 'btn-vhs', 'btn-restart', 'end-panel', 'end-title', 'end-kills', 'end-wave', 'end-earned', 'end-bonus',
    'end-balance', 'end-best', 'end-record', 'end-save', 'btn-replay', 'wave-announce', 'labels', 'rotate'];
  const ADDED = ['hud-chrono', 'hud-rec', 'hud-chrono-text', 'hud-floor-text', 'hud-trial', 'hud-wave-text', 'hud-reinforced', 'hud-remaining-text', 'hud-next-text', 'hud-kills-text',
    'down-body', 'down-title-text', 'down-fill', 'pause-balance-text', 'end-box', 'end-title-text', 'end-earned-text', 'end-bonus-text', 'end-record-text', 'btn-menu', 'btn-quit'];
  // Retours du propriétaire après l'intégration : « Prochaine zone », état de la sauvegarde et volume quittent la pause.
  const REMOVED = ['hud-fill', 'end-save-link', 'pause-next', 'pause-save', 'volume-row', 'volume', 'volume-value'];
  const doc = existsSync('Docs/ref/interface-integree.md') ? readFileSync('Docs/ref/interface-integree.md', 'utf8') : '';

  it.each(KEPT)('conservé : #%s', (id) => expect(ids.has(id)).toBe(true));

  it('ajoutés : présents dans jeu.html et dans la table', () => {
    for (const id of ADDED) {
      expect(ids.has(id), id).toBe(true);
      expect(doc, id).toContain(`#${id}`);
    }
  });

  it('retirés : absents de jeu.html et de tout le code du jeu, listés dans la table avec leur raison', () => {
    for (const id of REMOVED) {
      expect(ids.has(id), id).toBe(false);
      expect(gameJs, id).not.toContain(`'${id}'`);
      expect(doc, id).toMatch(new RegExp(`#${id}[^\\n]*→`));
    }
  });

  it('aucun identifiant en double', () => {
    const all = [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
    expect(all.length).toBe(new Set(all).size);
  });

  it('l\'atelier masque et mesure la nouvelle interface : sélecteurs de js/atelier-interface/actuel.js présents dans jeu.html', async () => {
    const { GAME_UI_SELECTORS, actuelItems } = await import('../../js/atelier-interface/actuel.js');
    for (const sel of GAME_UI_SELECTORS) expect(ids.has(sel.slice(1)), sel).toBe(true);
    for (const screen of ['hud', 'a-terre', 'sticks']) {
      for (const item of actuelItems(screen)) {
        const id = /^#([a-z-]+)/.exec(item.selector)?.[1];
        expect(ids.has(id), item.selector).toBe(true);
      }
    }
  });
});

describe('structure de jeu.html', () => {
  const at = (needle) => html.indexOf(needle);

  it('ordre des blocs E2 inchangé : E2-1, E2-2, E2-8, E2-10, E2-5, E2-3, E2-4, puis E2-6 et E2-7 ; ni E2-9 ni E2-11', () => {
    const order = [...html.matchAll(/data-block="(E2-\d+)"/g)].map((m) => m[1]);
    expect(order).toEqual(['E2-1', 'E2-2', 'E2-8', 'E2-10', 'E2-5', 'E2-3', 'E2-4', 'E2-6', 'E2-7']);
  });

  it('HUD en trois colonnes : REC, VIE, chutes, étage, essai à gauche ; vague et à terre au centre ; restants, début, tués, argent à droite', () => {
    const col = (cls) => html.slice(at(`class="hud-col ${cls}"`), html.indexOf('\n      </div>', at(`class="hud-col ${cls}"`)));
    expect([...col('hud-tl').matchAll(/id="(hud-[a-z]+|down-body)"/g)].map((m) => m[1]).filter((i) => !i.endsWith('-text'))).toEqual(['hud-chrono', 'hud-rec', 'hud-bar', 'hud-life', 'hud-chutes', 'hud-floor', 'hud-trial']);
    expect(col('hud-tc')).toMatch(/id="hud-wave"[\s\S]*id="down-body"/);
    expect(html.slice(at('class="hud-col hud-tr"'), at('id="wave-announce"'))).toMatch(/id="hud-remaining"[\s\S]*id="hud-next"[\s\S]*id="hud-kills"[\s\S]*id="hud-money"[\s\S]*id="hud-gain"/);
  });

  it('vie : role="progressbar" avec valeurs et nom accessible, sans barre (#hud-fill retiré, retour du propriétaire)', () => {
    expect(html).toMatch(/<div id="hud-bar" class="hud-block hud-life" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="100" data-i18n-label="game.hud.lifeLabel">/);
    expect(html).not.toContain('hud-fill');
  });

  it('décor et icônes : coins, point REC et icônes SVG décoratifs (aria-hidden), aucune image', () => {
    for (const m of html.matchAll(/<svg [^>]*>/g)) expect(m[0]).toContain('aria-hidden="true"');
    for (const m of html.matchAll(/class="hud-corner[^"]*"[^>]*>/g)) expect(m[0]).toContain('aria-hidden="true"');
    expect(html).not.toMatch(/<img|\.png|\.jpe?g|\.webp|\.svg"/);
  });

  // Retours du propriétaire : solde à côté de « PAUSE » ; deux colonnes Reprendre, Recommencer, Quitter (désactivé) | Son, Effet VHS, Plein écran ; ordre du HTML = lecture.
  it('pause : « PAUSE » et le solde en tête ; boutons Reprendre, Son, Recommencer, Effet VHS, Quitter (désactivé), Plein écran ; ni volume, ni prochaine zone, ni sauvegarde', () => {
    const order = ['pause-title', 'pause-balance', 'btn-resume', 'btn-sound', 'btn-restart', 'btn-vhs', 'btn-quit', 'btn-fullscreen'].map((id) => at(`id="${id}"`));
    expect(order.every((p, i) => p > 0 && (i === 0 || p > order[i - 1]))).toBe(true);
    expect(html).toMatch(/<button id="btn-quit" class="button button-quiet" type="button" data-i18n="game\.pause\.quit" disabled><\/button>/);
    const pause = html.slice(at('id="pause-panel"'), at('id="end-panel"'));
    expect(pause).not.toMatch(/volume|pause-next|pause-save/);
  });

  it('fin : « Rejouer » puis « Revenir au menu principal » (bouton sans lien ni action), plus de lien « Voir ma sauvegarde »', () => {
    const end = html.slice(at('id="end-panel"'), at('id="rotate"'));
    expect(end).toMatch(/id="btn-replay"[\s\S]*<button id="btn-menu" class="button button-quiet" type="button" data-i18n="game\.end\.menu"><\/button>/);
    expect(end).not.toMatch(/<a\s|sauvegarde\.html/);
    expect(readFileSync('js/game/ui.js', 'utf8')).not.toMatch(/btn-menu|menu\.addEventListener/);
  });

  // Retours du propriétaire : « Nouveau record » à la place d'« Argent gagné » (colonne de gauche), « Argent gagné » entre « Zombies tués » et « Solde » ; note
  // « Écran de fin provisoire » retirée.
  // Retour du propriétaire : le symbole d'argent vient après la somme (pause, mort, victoire).
  it('pièce après la somme : « Solde : 234 », « Argent gagné : 154 », « Bonus de fin de monde : 500 » puis le symbole', () => {
    for (const id of ['pause-balance', 'end-earned', 'end-bonus']) {
      const line = html.slice(at(`id="${id}"`), html.indexOf('</p>', at(`id="${id}"`)));
      expect(line.indexOf(`id="${id}-text"`), id).toBeLessThan(line.indexOf('hud-coin'));
      expect(line.indexOf('hud-coin'), id).toBeGreaterThan(0);
    }
  });

  it('fin : colonne de gauche vague, record, meilleure manche ; colonne de droite tués, argent gagné, bonus, solde ; plus de note « provisoire »', () => {
    const end = html.slice(at('id="end-panel"'), at('id="rotate"'));
    const cols = end.split('class="facts-col"').slice(1).map((c) => [...c.matchAll(/id="(end-[a-z]+)"/g)].map((m) => m[1]).filter((i) => !i.endsWith('text')));
    expect(cols[0]).toEqual(['end-wave', 'end-record', 'end-best']);
    expect(cols[1].slice(0, 4)).toEqual(['end-kills', 'end-earned', 'end-bonus', 'end-balance']);
    expect(end).not.toContain('game.end.provisional');
    expect(fr['game.end.provisional']).toBeUndefined();
    expect(readFileSync('js/game/ui.js', 'utf8')).not.toMatch(/btn-quit/);
  });

  it('?fin=monde (aperçu de la victoire) : seulement en mode essai et sur une carte avec fin de monde ; la dernière manche est terminée par les vrais calculs', () => {
    const main = readFileSync('js/game/main.js', 'utf8');
    expect(main).toMatch(/if \(query\.get\('fin'\) === 'monde' && saveMode\.readOnly && Number\.isInteger\(zonesJson\?\.wavesPerWorld\)\) \{\s*game\.startWave\(zonesJson\.wavesPerWorld\);\s*game\.advance\(3\.2\);\s*game\.skipWave\(\);/);
    expect(JSON.parse(readFileSync('data/game/save.json', 'utf8')).readOnlyParams).not.toContain('fin');
  });

  it('à terre : le voile (#down, E2-10) reste en plein écran, le texte (#down-body) est dans le HUD, sous la vague', () => {
    expect(html).toMatch(/<div id="down" class="down" data-block="E2-10" aria-hidden="true" hidden>\s*<div class="down-veil"><\/div>\s*<\/div>/);
    expect(at('id="down-body"')).toBeGreaterThan(at('id="hud-wave"'));
    expect(at('id="down-body"')).toBeLessThan(at('class="hud-col hud-tr"'));
  });

  it('#hud-live reste la seule région vocale du jeu, hors du HUD', () => {
    expect(html).toContain('<p id="hud-live" class="sr-only" aria-live="polite"></p>');
    expect(html.match(/aria-live=/g)).toHaveLength(2); // #loading (préparation) et #hud-live
  });
});

describe('hygiène du lot 3l (diff avec lot-4b avant le lot)', () => {
  // data/changelog.json : entrée lot-3l ajoutée à la demande du propriétaire (data-changelog exige une entrée par bilan de Docs/lots/).
  it('fichiers interdits inchangés : logique du jeu, personnages, effets, monde, index, sauvegarde, règles, tests du journal, workflow, seed', () => {
    // Lot 3j (fusionné dans lot-4b) : js/game/character.js et js/game/effects.js sont modifiés par ce lot autorisé (passation-personnages-4b.md, § 5).
    expect(changedSince('js/game/world.js js/game/windows-mesh.js index.html sauvegarde.html CLAUDE.md Docs/ref/conventions.md Docs/seed.md tests/unit/data-changelog.test.js tests/e2e/dev.spec.js .github data/game/save.json').filter((f) => !LOT_4C.includes(f))).toEqual([]);
  });

  it('js/core/ : seul hud-format.js est ajouté ; aucun module de règles du jeu modifié', () => {
    expect(changedSince('js/core').filter((f) => f !== 'js/core/hud-format.js')).toEqual([]);
  });

  it('js/game/game.js : 30 lignes ajoutées au plus (données exposées à l\'interface)', () => {
    if (!BASE) return;
    const added = (git(`diff --numstat ${BASE} -- js/game/game.js`) ?? '').trim().split(/\s+/)[0];
    expect(Number(added || 0)).toBeLessThanOrEqual(30);
  });

  it('package.json : dépendances inchangées ; aucun fichier image, police, son ou vidéo ajouté', () => {
    if (!BASE) return;
    const before = JSON.parse(git(`show ${BASE}:package.json`));
    const now = JSON.parse(readFileSync('package.json', 'utf8'));
    expect(now.dependencies).toEqual(before.dependencies);
    expect(now.devDependencies).toEqual(before.devDependencies);
    const added = [...(git(`diff --name-only --diff-filter=A ${BASE}`) ?? '').split('\n'), ...(git('ls-files --others --exclude-standard') ?? '').split('\n')].filter(Boolean);
    expect(added.filter((f) => /\.(png|jpe?g|gif|webp|avif|svg|ico|woff2?|ttf|otf|eot|mp3|wav|ogg|m4a|aac|flac|mp4|webm)$/i.test(f))).toEqual([]);
  });

  it('aucun nouveau paramètre d\'adresse en lecture seule (data/game/save.json inchangé)', () => {
    const save = JSON.parse(readFileSync('data/game/save.json', 'utf8'));
    expect(save.readOnlyParams).not.toContain('ui');
  });
});
