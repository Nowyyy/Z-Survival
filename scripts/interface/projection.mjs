// Atelier de l'interface (lot 3k-C) : projection de l'intégration (lot 4b) pour un jeu de choix au format « Mes choix ». Pour chaque écran choisi : nombre
// d'éléments HTML et de blocs mesurés de la proposition (rendu au pire cas), nombre de règles CSS concernées (feuille de la direction + base commune), tests
// existants à adapter (fichiers qui lisent les sélecteurs de ce bloc) et poids du CSS. Imprime sur la sortie standard, n'écrit rien.
// Usage : node scripts/interface/projection.mjs 'ecran=hud;direction=B;…' (ou le texte sur l'entrée standard) [--json]
import { readFileSync, readdirSync } from 'node:fs';
import { parseChoices } from '../../js/atelier-interface/choices.js';
import { renderGameScreen } from '../../js/atelier-interface/render.js';
import { renderOffGame } from '../../js/atelier-interface/screens.js';
import { worstCase } from '../../js/core/ui-mock.js';

const cfg = JSON.parse(readFileSync('data/game/ui-atelier.json', 'utf8'));
const stats = JSON.parse(readFileSync('data/game/player-stats.json', 'utf8'));
const dict = { ...JSON.parse(readFileSync('data/i18n/fr.json', 'utf8')), ...JSON.parse(readFileSync('data/i18n/atelier-interface.json', 'utf8')) };
const t = (k, p) => String(dict[k] ?? k).replace(/\{(\w+)\}/g, (_, x) => String(p?.[x] ?? ''));

// Sélecteurs du jeu actuel lus par les tests, par écran (vérifiés par grep au lot 3k ; voir Docs/ref/integration-interface.md).
export const TEST_SELECTORS = {
  hud: /#hud\b|hud-life|hud-bar|hud-kills|hud-chutes|hud-remaining|hud-next|hud-floor|hud-money|hud-gain|hud-wave|btn-pause|getState\(\)\.hud|\.hud\.(height|width|chips)/,
  pause: /pause-panel|btn-resume|btn-vhs|btn-sound|btn-restart|btn-fullscreen|#volume|pause-balance|pause-save|pause-next/,
  'fin-mort': /end-panel|end-title|btn-replay|end-save|end-earned|end-balance|end-best|end-record|end-wave|end-kills/,
  'fin-monde': /end-panel|end-title|end-bonus|btn-replay/,
  'a-terre': /#down\b|down-title|down-sub|down-body/,
  sticks: /stick-left|stick-right|stick-base|stick-knob/,
};
const testFiles = ['tests/e2e', 'tests/unit'].flatMap((d) => readdirSync(d).filter((f) => f.endsWith('.js') && !f.startsWith('interface-atelier')).map((f) => `${d}/${f}`));
const testsFor = (screen) => (TEST_SELECTORS[screen] ? testFiles.filter((f) => TEST_SELECTORS[screen].test(readFileSync(f, 'utf8'))) : []);

// Règles CSS : blocs « sélecteur { … } » (les @media et @container comptent leurs règles internes).
export function countRules(css) {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, '');
  return (text.match(/[^{}@]+\{[^{}]*\}/g) ?? []).length;
}
const base = readFileSync('css/atelier-interface.css', 'utf8');
const commonCss = base.slice(base.indexOf('/* ---------- Base commune'));
const sheet = (dir) => readFileSync(`css/proto-${dir.toLowerCase()}.css`, 'utf8');

export function project(text) {
  const { choices, warnings } = parseChoices(text, cfg);
  const state = worstCase(cfg);
  const rows = Object.entries(choices.screens).map(([screen, c]) => {
    if (c.direction === 'actuel') return { screen, direction: 'actuel', elements: 0, measured: 0, rules: 0, cssBytes: 0, tests: [], note: 'interface actuelle conservée : rien à intégrer' };
    const macros = { ...cfg.macroDefaults[c.direction], ...c };
    const html = renderOffGame(screen, c.direction, t, cfg.fake, stats, {}) ?? renderGameScreen(screen, state, c.direction, macros, t, { worldBonusText: '500' });
    const css = sheet(c.direction);
    return {
      screen,
      direction: c.direction,
      elements: (html.match(/<(?!\/)[a-z][a-z0-9]*/gi) ?? []).length,
      measured: (html.match(/data-ui="/g) ?? []).length,
      rules: countRules(css) + countRules(commonCss),
      cssBytes: Buffer.byteLength(css) + Buffer.byteLength(commonCss),
      tests: testsFor(screen),
      note: cfg.gameScreens.includes(screen) ? '' : 'écran hors partie : futur lot (5, 7, 7b, 7c)',
    };
  });
  return { rows, priority2: choices.priority2, warnings };
}

if (process.argv[1]?.endsWith('projection.mjs')) {
  const arg = process.argv.slice(2).find((a) => !a.startsWith('--'));
  const text = arg ?? (process.stdin.isTTY ? '' : readFileSync(0, 'utf8'));
  const result = project(text || 'ecran=hud;direction=A');
  if (process.argv.includes('--json')) console.log(JSON.stringify(result, null, 2));
  else {
    console.log('écran      | direction | éléments | blocs mesurés | règles CSS | CSS (octets) | tests à adapter');
    for (const r of result.rows) console.log(`${r.screen.padEnd(10)} | ${r.direction.padEnd(9)} | ${String(r.elements).padStart(8)} | ${String(r.measured).padStart(13)} | ${String(r.rules).padStart(10)} | ${String(r.cssBytes).padStart(12)} | ${r.tests.length} ${r.tests.map((f) => f.split('/').pop()).join(', ')}${r.note ? ` (${r.note})` : ''}`);
    for (const [id, v] of Object.entries(result.priority2)) console.log(`priorité 2 : ${id}, variante ${v}`);
    for (const w of result.warnings) console.log(`avertissement : ${w}`);
  }
}
