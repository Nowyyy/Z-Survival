// Lot 3k-B : feuilles des propositions (proto-a, proto-b, proto-c), textes de l'atelier, rendu HTML des directions, « Mes choix », macros aux limites.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { mockState, worstCase } from '../../js/core/ui-mock.js';
import { tokensFromCss } from '../../js/core/ui-measure.js';
import { MACRO_KEYS, normalizeChoice, parseChoices, serializeChoices } from '../../js/atelier-interface/choices.js';
import { esc, renderDown, renderEnd, renderGameScreen, renderHud, renderPause, renderSticks } from '../../js/atelier-interface/render.js';

const cfg = JSON.parse(readFileSync('data/game/ui-atelier.json', 'utf8'));
const fr = JSON.parse(readFileSync('data/i18n/fr.json', 'utf8'));
const own = JSON.parse(readFileSync('data/i18n/atelier-interface.json', 'utf8'));
const dict = { ...fr, ...own };
const t = (k, p) => String(dict[k] ?? `!${k}`).replace(/\{(\w+)\}/g, (_, x) => String(p?.[x] ?? ''));
const tokens = tokensFromCss(readFileSync('css/tokens.css', 'utf8'));
const PROTOS = ['proto-a', 'proto-b', 'proto-c'];
const css = Object.fromEntries([...PROTOS, 'atelier-interface'].map((n) => [n, readFileSync(`css/${n}.css`, 'utf8')]));
const strip = (text) => text.replace(/\/\*[\s\S]*?\*\//g, '');
const DIRS = ['A', 'B', 'C'];
const MACROS = { A: cfg.macroDefaults.A, B: cfg.macroDefaults.B, C: cfg.macroDefaults.C };
const combat = mockState(cfg.states.find((s) => s.id === 'combat').params, cfg);

describe('feuilles proto-*.css : variables, couleurs, interdits', () => {
  const defined = new Set([...Object.keys(tokens), ...Object.values(css).flatMap((text) => [...text.matchAll(/(--ui3k-[a-z0-9-]+):/g)].map((m) => m[1]))]);

  it.each(PROTOS)('%s : n\'utilise que des variables définies (tokens.css ou --ui3k-*)', (name) => {
    for (const m of strip(css[name]).matchAll(/var\((--[a-z0-9-]+)/g)) {
      expect(m[1].startsWith('--ui3k-') || Object.hasOwn(tokens, m[1]), `${name} : ${m[1]}`).toBe(true);
      if (!m[1].startsWith('--ui3k-pause-size') && !m[1].startsWith('--ui3k-target')) expect(defined.has(m[1]), `${name} : ${m[1]} non défini`).toBe(true);
    }
  });

  it.each(PROTOS)('%s : aucune couleur en dur (hexadécimale, fonctionnelle ou nommée)', (name) => {
    const text = strip(css[name]);
    expect(text).not.toMatch(/#[0-9a-fA-F]{3,8}\b|\b(?:rgb|rgba|hsl|hsla|hwb|lab|lch|oklab|oklch)\(/);
    expect(text).not.toMatch(/:\s*(?:black|white|red|yellow|gray|grey)\s*;/);
  });

  it.each(PROTOS.flatMap((n) => ['filter', 'mix-blend-mode', 'backdrop-filter'].map((p) => [n, p])))('%s : aucun %s', (name, prop) => {
    expect(strip(css[name])).not.toMatch(new RegExp(`(^|[\\s;{])${prop}\\s*:`));
  });

  it('base commune des propositions (dans atelier-interface.css, après « Base commune ») : ni filter, ni mix-blend-mode, ni backdrop-filter', () => {
    const base = strip(css['atelier-interface'].slice(css['atelier-interface'].indexOf('/* ---------- Base commune')));
    expect(base).not.toMatch(/(^|[\s;{])(filter|mix-blend-mode|backdrop-filter)\s*:/);
  });

  it('le simulateur de daltonisme (filter) ne s\'applique qu\'au cadre d\'aperçu (.ui3k-viewport)', () => {
    const page = strip(css['atelier-interface']);
    for (const m of page.matchAll(/([^{}]+)\{[^}]*\bfilter\s*:/g)) expect(m[1].trim()).toMatch(/^\.ui3k-viewport\[data-cvd=/);
  });

  it('seule la direction B anime quelque chose : le point REC, 1 s par cycle (≤ 2 clignotements par seconde), coupé sous prefers-reduced-motion', () => {
    expect(strip(css['proto-a'])).not.toMatch(/animation|@keyframes|transition/);
    expect(strip(css['proto-c'])).not.toMatch(/animation|@keyframes|transition/);
    const b = strip(css['proto-b']);
    expect(b).toMatch(/animation: ui3k-rec 1s steps\(1, end\) infinite;/);
    expect(b).toMatch(/@media \(prefers-reduced-motion: reduce\) \{\s*\.ui3k-dir-b \.p-rec \{\s*animation: none;/);
    expect(strip(css['atelier-interface'])).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*animation: none !important;/);
  });

  it('aucune unité vw ni vh dans les propositions (la scène est mise à l\'échelle : unités de conteneur ou em)', () => {
    for (const name of PROTOS) expect(strip(css[name]), name).not.toMatch(/\d(vw|vh|dvh)\b/);
  });

  it('C : cibles de 52 px (Pause et boutons des panneaux)', () => {
    expect(css['proto-c']).toMatch(/--ui3k-pause-size: 52px;/);
    expect(css['proto-c']).toMatch(/--ui3k-target: 52px;/);
  });
});

describe('textes : clés existantes de fr.json ou de atelier-interface.json', () => {
  const sources = readdirSync('js/atelier-interface').map((f) => readFileSync(`js/atelier-interface/${f}`, 'utf8'));
  const html = readFileSync('atelier-interface.html', 'utf8') + readFileSync('interface-retenue.html', 'utf8');

  it('chaque clé littérale t(\'…\') des scripts existe', () => {
    for (const src of sources) for (const m of src.matchAll(/\bt\('([a-zA-Z0-9.-]+)'/g)) expect(dict[m[1]], m[1]).toBeDefined();
  });

  it('chaque data-i18n de la page existe', () => {
    for (const m of html.matchAll(/data-i18n(?:-title)?="([^"]+)"/g)) expect(dict[m[1]], m[1]).toBeDefined();
  });

  it('chaque clé de atelier-interface.json est utilisée (littérale, préfixe dynamique ou page)', () => {
    const all = [...sources, html].join('\n');
    const prefixes = (k) => k.split('.').slice(0, -1).map((_, i, parts) => `${parts.slice(0, i + 1).join('.')}.\${`);
    const used = (k) => all.includes(`'${k}'`) || all.includes(`"${k}"`) || prefixes(k).some((p) => all.includes(p));
    for (const k of Object.keys(own)) expect(used(k), k).toBe(true);
  });

  it('les écrans de jeu des propositions ne lisent que des clés existantes (aucun « ! » de clé manquante)', () => {
    for (const dir of DIRS) {
      for (const screen of cfg.gameScreens) expect(renderGameScreen(screen, worstCase(cfg), dir, MACROS[dir], t, { worldBonusText: '500' }), `${dir} ${screen}`).not.toMatch(/!game\.|!ui3k\./);
    }
  });

  it('les libellés des états, écrans, directions, macros et zones de sécurité existent tous', () => {
    for (const s of cfg.states) expect(own[`atelier.state.${s.id}`], s.id).toBeDefined();
    for (const s of cfg.screens) expect(own[`atelier.screen.${s}`], s).toBeDefined();
    for (const d of cfg.directions) expect(own[`atelier.direction.${d}`] && own[`atelier.direction.desc.${d}`], d).toBeTruthy();
    for (const [k, list] of Object.entries(cfg.macros)) for (const v of list) expect(own[`atelier.macro.${k}.${v}`], `${k}.${v}`).toBeDefined();
    for (const p of cfg.safePresets) expect(own[`atelier.safe.${p.id}`], p.id).toBeDefined();
    for (const s of cfg.saveStatuses) expect(fr[`game.save.status.${s}`] && own[`atelier.save.${s}`], s).toBeTruthy();
  });
});

describe('rendu HTML des directions (écrans de jeu)', () => {
  it.each(DIRS)('%s : HUD complet (vie, chutes, argent, vague « / 40 », étage, restants) et Pause, codes E2-2 et E2-5', (dir) => {
    const html = renderHud(combat, dir, MACROS[dir], t);
    for (const ui of ['vie', 'chutes', 'argent', 'vague', 'etage', 'restants', 'pause']) expect(html).toContain(`data-ui="${ui}"`);
    expect(html).toContain('data-block="E2-2"');
    expect(html).toContain('data-block="E2-5"');
    expect(html).toMatch(/7 \/ 40|07 \/ 40/);
  });

  it('B seul a le chronomètre, le point REC et les tués ; les coins de cadre sont décoratifs', () => {
    const b = renderHud(combat, 'B', MACROS.B, t);
    expect(b).toContain('data-ui="chrono"');
    expect(b).toContain('data-blink="rec"');
    expect(b).toContain('08:32');
    expect(b).toContain('data-ui="tues"');
    expect(b).toMatch(/class="p-corner p-corner-tl" aria-hidden="true"/);
    for (const dir of ['A', 'C']) expect(renderHud(combat, dir, MACROS[dir], t)).not.toContain('data-ui="chrono"');
  });

  it('mode essai : mention visible dans le HUD et sur l\'écran de fin', () => {
    const s = mockState({ trial: true }, cfg);
    for (const dir of DIRS) {
      expect(renderHud(s, dir, MACROS[dir], t)).toContain('Mode essai');
      expect(renderEnd({ ...s, end: 'death' }, dir, t, '500')).toContain(esc(fr['game.end.trial']));
    }
  });

  it('chutes en pastilles (A) : 5 emplacements, pleins pour les chutes restantes, et le nombre écrit', () => {
    const html = renderHud(mockState({ chutes: 3 }, cfg), 'A', MACROS.A, t);
    expect((html.match(/p-pip is-on/g) ?? []).length).toBe(3);
    expect((html.match(/class="p-pip[ "]/g) ?? []).length).toBe(5);
    expect(html).toContain('aria-label="Chutes restantes : 3"');
  });

  it('B (retours du propriétaire) : vie sans barre (« Vie » et « 64/100 »), « Vague » et « Restants » en entier, tués sans zéros devant (place réservée pour 4 chiffres), « Mode essai » à gauche sous chutes + étage', () => {
    const html = renderHud(mockState({ hp: 64, kills: 57, trial: true }, cfg), 'B', MACROS.B, t);
    const life = html.slice(html.indexOf('data-ui="vie"'), html.indexOf('data-ui="chutes"'));
    expect(life).not.toMatch(/p-bar|p-seg|p-fill/);
    expect(life).toContain('>Vie<');
    expect(life).toContain('64/100');
    expect(html).toContain('>Vague<');
    expect(html).toContain('>Restants<');
    expect(html).toContain('>57<');
    expect(html).not.toContain('>0057<');
    expect(html.indexOf('data-ui="essai"')).toBeLessThan(html.indexOf('p-cluster p-tc'));
    expect(html.indexOf('data-ui="etage"')).toBeLessThan(html.indexOf('data-ui="essai"'));
  });

  it('B : restants et tués à droite, de même largeur, ensemble de la hauteur du bouton Pause (44 px au moins) ; REC, VIE et chutes + étage alignés à droite ; à terre sans cadre', () => {
    const b = css['proto-b'];
    const w = (sel) => new RegExp(`\\.ui3k-dir-b \\.${sel} \\{[^}]*?width: ([^;]+);`).exec(b)[1];
    expect(w('p-remaining')).toBe(w('p-kills'));
    expect(w('p-life')).toBe(w('p-chrono'));
    expect(w('p-floor')).toBe(`calc(${w('p-chrono')} - ${w('p-chutes')} - var(--ui3k-gap))`);
    expect(b).toMatch(/\.ui3k-dir-b \.p-tl \{[^}]*width: calc\(8\.8em \+ 0\.35em\);[^}]*padding: 0\.35em 0 0 0\.35em;/);
    const html = renderHud(combat, 'B', MACROS.B, t);
    const tr = html.slice(html.indexOf('p-cluster p-tr'));
    expect(tr.indexOf('data-ui="restants"')).toBeLessThan(tr.indexOf('data-ui="tues"'));
    expect(tr).not.toContain('data-ui="argent"');
    const tc = html.slice(html.indexOf('p-cluster p-tc'), html.indexOf('p-cluster p-tr'));
    expect(tc.indexOf('data-ui="vague"')).toBeLessThan(tc.indexOf('data-ui="argent"'));
    expect(b).toMatch(/--ui3k-pause-size: max\(44px, calc\(2 \* var\(--ui3k-row\) \+ var\(--ui3k-gap\)\)\);/);
    expect(b).toMatch(/\.ui3k-dir-b \.p-tr \.p-block \{\s*height: calc\(\(var\(--ui3k-pause-size\) - var\(--ui3k-gap\)\) \/ 2\);/);
    expect(b).not.toMatch(/\.ui3k-dir-b \.p-down-body \{[^}]*border:/);
  });

  it('pause : reprendre, plein écran, son, effet VHS, recommencer, volume ; solde, état de la sauvegarde, prochaine zone', () => {
    const html = renderPause(mockState({ money: 1234, save: 'failed', nextZone: 20 }, cfg), 'A', t);
    for (const k of ['game.pause.resume', 'game.pause.fullscreen', 'game.sound.on', 'game.vhs.on', 'game.pause.restart', 'game.volume', 'game.save.status.failed']) expect(html, k).toContain(esc(fr[k]));
    expect(html).toContain('Prochaine zone : manche 20');
    expect(html).toContain('data-block="E2-6"');
  });

  it('fin de partie : mort et monde terminé (vague atteinte, argent gagné, solde, record, bonus de fin de monde, rejouer, « Revenir au menu principal » non branché)', () => {
    const death = renderEnd(mockState({ end: 'death', wave: 14, earned: 1840, record: true }, cfg), 'C', t, '500');
    expect(death).toContain(esc(fr['game.end.title']));
    expect(death).toContain('Vague atteinte : 14');
    expect(death).toContain(esc(fr['game.end.record']));
    expect(death).not.toContain('sauvegarde.html'); // retour du propriétaire : « Voir ma sauvegarde » remplacé
    expect(death).toMatch(/<button class="p-btn p-btn-quiet" type="button" data-ui="btn-menu"[^>]*>Revenir au menu principal<\/button>/);
    expect(death).not.toContain('Bonus de fin de monde');
    const world = renderEnd(mockState({ end: 'world' }, cfg), 'C', t, '500');
    expect(world).toContain(esc(fr['game.end.world']));
    expect(world).toContain('Bonus de fin de monde : 500');
    expect(world).toContain('Vague atteinte : 40');
    expect(world).toContain('data-block="E2-7"');
  });

  it('à terre : « À terre » et le compte à rebours de 5 s ; protection : « Protégé N s » avec un bouclier (forme, pas seulement la couleur)', () => {
    const down = renderDown(mockState({ down: 'down', downSeconds: 5 }, cfg), 'A', t);
    expect(down).toContain('À terre');
    expect(down).toContain('Tu te relèves dans 5 s');
    expect(down).toContain('data-block="E2-10"');
    const grace = renderDown(mockState({ down: 'grace', downSeconds: 2 }, cfg), 'A', t);
    expect(grace).toContain('Protégé 2 s');
    expect(grace).toContain('M8 1 14 3.4');
  });

  it('sticks : E2-3 actif à gauche, E2-4 au repos à droite ; aide de démarrage facultative', () => {
    const html = renderSticks('C', t);
    expect(html).toMatch(/is-active" data-block="E2-3"/);
    expect(html).toMatch(/is-idle" data-block="E2-4"/);
    expect(html).not.toContain('Toucher ici');
    expect(renderSticks('C', t, { help: true })).toContain('Toucher ici pour bouger');
  });

  it('jamais E2-9 ni E2-11, ni flèches vers les fenêtres, ni ligne « Fenêtres », ni indicateur de réparation', () => {
    for (const dir of DIRS) {
      for (const screen of cfg.gameScreens) {
        const html = renderGameScreen(screen, worstCase(cfg), dir, MACROS[dir], t, { worldBonusText: '500', help: true });
        expect(html).not.toMatch(/E2-9|E2-11|edge-arrow|Fenêtre|fenêtre|Réparation|réparation/);
      }
    }
  });

  it('position de l\'argent : la colonne change selon la macro', () => {
    const where = (argent) => {
      const html = renderHud(combat, 'A', { ...MACROS.A, argent }, t);
      const i = html.indexOf('data-ui="argent"');
      return ['p-tl', 'p-tc', 'p-tr'].filter((c) => html.indexOf(c) < i).at(-1);
    };
    expect(where('haut-gauche')).toBe('p-tl');
    expect(where('sous-vague')).toBe('p-tc');
    expect(where('haut-droite')).toBe('p-tr');
  });

  it('textes échappés (aucune injection de HTML)', () => {
    const evil = (k) => (k === 'game.pause.title' ? '<img src=x onerror=1>' : t(k));
    expect(renderPause(combat, 'A', evil)).not.toContain('<img');
    expect(esc('<a href="x">&\'</a>')).toBe('&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;');
  });
});

describe('« Mes choix » : format, lecture, entrées hostiles', () => {
  const choices = { screens: { pause: { direction: 'A', ...cfg.macroDefaults.A }, hud: { direction: 'B', ...cfg.macroDefaults.B }, menu: { direction: 'actuel', texte: 'L' } }, priority2: { 'retour-degats': 'B' } };

  it('format exact : une ligne par écran (ordre des écrans), puis priorite2', () => {
    expect(serializeChoices(choices, cfg)).toBe([
      'ecran=hud;direction=B;argent=sous-vague;texte=M;densite=compacte;fond=leger;contour=aucun',
      'ecran=pause;direction=A;argent=haut-droite;texte=M;densite=compacte;fond=transparent;contour=fin',
      'ecran=menu;direction=actuel',
      'priorite2=retour-degats:B',
    ].join('\n'));
  });

  it('aller-retour : parseChoices(serializeChoices(x)) redonne x normalisé, sans avertissement', () => {
    const { choices: back, warnings } = parseChoices(serializeChoices(choices, cfg), cfg);
    expect(warnings).toEqual([]);
    expect(back.screens.hud).toEqual({ direction: 'B', ...cfg.macroDefaults.B });
    expect(back.screens.menu).toEqual({ direction: 'actuel' });
    expect(back.priority2).toEqual({ 'retour-degats': 'B' });
  });

  it('exemple de la consigne lu tel quel', () => {
    const { choices: c, warnings } = parseChoices('ecran=hud;direction=B;argent=haut-droite;texte=M;densite=compacte;fond=leger;contour=fin\npriorite2=retour-degats:B', cfg);
    expect(warnings).toEqual([]);
    expect(c.screens.hud.contour).toBe('fin');
  });

  it.each([
    ['écran inconnu', 'ecran=jeu;direction=A', 'écran inconnu'],
    ['direction inconnue', 'ecran=hud;direction=Z', 'direction inconnue'],
    ['valeur de macro inconnue', 'ecran=hud;direction=A;texte=XL', 'valeur ignorée'],
    ['champ illisible', 'ecran=hud;direction=A;??', 'champ illisible'],
    ['proposition inconnue', 'priorite2=confettis:A', 'proposition inconnue'],
    ['variante inconnue', 'priorite2=retour-degats:C', 'proposition inconnue'],
  ])('%s : ligne ignorée ou réduite, avertissement', (_n, text, warn) => {
    const r = parseChoices(text, cfg);
    expect(r.warnings.join(' ')).toMatch(warn);
  });

  it.each([undefined, null, 42, {}, [], '', '\n\n', ';;;', '='.repeat(10)])('entrée hostile %s : aucune exception, choix vides', (v) => {
    expect(() => parseChoices(v, cfg)).not.toThrow();
    expect(parseChoices(v, cfg).choices).toEqual({ screens: {}, priority2: {} });
  });

  it('__proto__, constructor, prototype ignorés ; texte tronqué à 4 000 caractères', () => {
    const r = parseChoices('ecran=hud;direction=A;__proto__=x;constructor=y', cfg);
    expect(r.choices.screens.hud).toEqual({ direction: 'A' });
    expect(({}).x).toBeUndefined();
    const long = `${'ecran=hud;direction=A\n'.repeat(400)}ecran=pause;direction=B`;
    expect(parseChoices(long, cfg).choices.screens.pause).toBeUndefined();
  });

  it('normalizeChoice : direction obligatoire, macros invalides retirées, « actuel » sans macros', () => {
    expect(normalizeChoice({ direction: 'C', fond: 'plein', texte: 'XL' }, cfg)).toEqual({ direction: 'C', fond: 'plein' });
    expect(normalizeChoice({ direction: 'actuel', fond: 'plein' }, cfg)).toEqual({ direction: 'actuel' });
    expect(normalizeChoice({ fond: 'plein' }, cfg)).toBeNull();
    expect(normalizeChoice(null, cfg)).toBeNull();
    expect(MACRO_KEYS).toEqual(['argent', 'texte', 'densite', 'fond', 'contour']);
  });

  it('sérialisation hostile : objets vides, écrans inconnus ignorés', () => {
    expect(serializeChoices(null, cfg)).toBe('');
    expect(serializeChoices({ screens: { jeu: { direction: 'A' } }, priority2: { x: 'A' } }, cfg)).toBe('');
    expect(serializeChoices({ screens: { hud: { direction: 'A' } } }, null)).toBe('');
  });
});

describe('macros aux limites : débordement calculé à 667×375 (largeurs fixes en em, texte S, M, L)', () => {
  // Largeurs déclarées dans les feuilles (em) des blocs de la première rangée : vie (ou colonne de gauche), vague, argent en haut à droite, et Pause.
  const width = (name, sel) => {
    const m = new RegExp(`\\.ui3k-dir-${name} \\.${sel} \\{[^}]*?\\bwidth: ([\\d.]+)em;`).exec(css[`proto-${name}`]);
    return m ? Number(m[1]) : 0;
  };
  const LAYOUT = {
    a: { tl: ['p-life', 'p-chutes', 'p-floor'], tc: ['p-wave'], tr: ['p-money'], pause: 44, pad: 0 },
    b: { tl: ['p-chrono'], tc: ['p-wave'], tr: ['p-remaining'], pause: 47, pad: 0.35 },
    c: { tl: ['p-tl'], tc: ['p-wave'], tr: ['p-money'], pause: 52, pad: 0 },
  };
  it.each(['a', 'b', 'c'].flatMap((d) => ['S', 'M', 'L'].map((s) => [d, s])))('direction %s, texte %s : les trois colonnes ne se touchent pas', (d, size) => {
    const px = 14 * cfg.macroValues.texte[size];
    const l = LAYOUT[d];
    const col = (list) => Math.max(...list.map((s) => width(d, s))) * px;
    for (const s of [...l.tl, ...l.tc, ...l.tr]) expect(width(d, s), `${d} ${s}`).toBeGreaterThan(0);
    const W = 667;
    const tlRight = 16 + (l.pad * px) + col(l.tl);
    const tcLeft = W / 2 - col(l.tc) / 2;
    const tcRight = W / 2 + col(l.tc) / 2;
    const trLeft = W - 16 - (l.pad * px) - l.pause - 4 - col(l.tr);
    expect(tlRight, 'gauche / centre').toBeLessThanOrEqual(tcLeft);
    expect(tcRight, 'centre / droite').toBeLessThanOrEqual(trLeft);
  });
});

describe('publication : aperçu et build', () => {
  // Lot 3l (fusion dans lot-4b) : garde-fou de branche retiré (Docs/ref/fusion-3k.md, point 3) ; apercu.txt garde la première ligne de lot-4b (jeu.html).
  it('apercu.txt : la première ligne n\'est jamais une page de l\'atelier (acceptée par parseEntry)', async () => {
    const { parseEntry } = await import('../../js/lots.js');
    const text = readFileSync('apercu.txt', 'utf8');
    expect(parseEntry(text)).not.toBeNull();
    expect(parseEntry(text)).not.toMatch(/^(atelier-interface|interface-retenue)\.html$/);
    expect(text).toMatch(/^type: hifi$/m);
  });

  it('scripts/build.mjs copie la page sur une ligne à part (fusion sans conflit avec la liste ENTRIES)', () => {
    const build = readFileSync('scripts/build.mjs', 'utf8');
    expect(build).toMatch(/^ENTRIES\.push\('atelier-interface\.html', 'interface-retenue\.html'\);/m);
    expect(build.split('\n').find((l) => l.startsWith('const ENTRIES'))).not.toContain('atelier-interface');
  });

  it.each(['atelier-interface.html', 'interface-retenue.html'])('%s : noindex, lang="fr", noscript, aucun id dupliqué, aucun style en ligne, aucune ressource externe', (page) => {
    const html = readFileSync(page, 'utf8');
    expect(html).toContain('<html lang="fr">');
    expect(html).toContain('name="robots" content="noindex"');
    expect(html).toContain('<noscript>');
    const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
    expect(new Set(ids).size).toBe(ids.length);
    expect(html).not.toMatch(/\sstyle="/);
    expect(html).not.toMatch(/(src|href)="(https?:)?\/\//);
  });
});

describe('interface retenue (choix du propriétaire)', () => {
  it('à terre en B : le texte est dans la colonne centrale juste sous l\'argent ; seul le voile reste en plein écran', () => {
    const html = renderGameScreen('a-terre', mockState({ down: 'down', downSeconds: 3 }, cfg), 'B', MACROS.B, t);
    const tc = html.slice(html.indexOf('p-cluster p-tc'), html.indexOf('p-cluster p-tr'));
    expect(tc.indexOf('data-ui="argent"')).toBeLessThan(tc.indexOf('data-ui="a-terre"'));
    expect(tc).toContain('p-down-body is-inline');
    expect((html.match(/data-ui="a-terre"/g) ?? []).length).toBe(1);
    expect(html).toContain('data-block="E2-10"');
    expect(css['atelier-interface']).toMatch(/\.p-down-body\.is-inline \{\s*position: static;\s*transform: none;/);
  });

  it('HUD, pause, fins et à terre en B, sticks en A ; le menu n\'est pas encore choisi', () => {
    expect(cfg.retenue).toMatchObject({ hud: 'B', pause: 'B', 'fin-mort': 'B', 'fin-monde': 'B', 'a-terre': 'B', sticks: 'A' });
    expect(cfg.retenue.menu).toBeUndefined();
  });

  it('la page ne charge que les feuilles des directions retenues (A pour les sticks, B), jamais C', () => {
    const page = readFileSync('interface-retenue.html', 'utf8');
    expect(page).toContain('css/proto-b.css');
    expect(page).toContain('css/proto-a.css');
    expect(page).not.toContain('proto-c.css');
  });

  it('les sticks de B ne s\'appliquent qu\'aux sticks posés directement dans l\'écran B (une couche A imbriquée garde le style A)', () => {
    expect(css['proto-b']).toMatch(/\.ui3k-dir-b > \.p-stick \.p-stick-base \{/);
    expect(css['proto-b']).not.toMatch(/\.ui3k-dir-b \.p-stick-base/);
  });
});
