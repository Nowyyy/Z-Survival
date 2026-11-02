// Lot 3k-C : écrans hors partie (E1 menu, E3 boutique, E5 réglages, classement), propositions de priorité 2 et projection de l'intégration.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  BLOOD_LEVELS, bloodLevel, boardRows, buyState, fakePrice, maxLevelOf, renderBoard, renderMenu, renderOffGame, renderPriority2, renderSettings, renderShop, shopRows,
  validatePseudo, weaponRows, worldRows,
} from '../../js/atelier-interface/screens.js';
import { countRules, project } from '../../scripts/interface/projection.mjs';

const cfg = JSON.parse(readFileSync('data/game/ui-atelier.json', 'utf8'));
const stats = JSON.parse(readFileSync('data/game/player-stats.json', 'utf8'));
const fr = JSON.parse(readFileSync('data/i18n/fr.json', 'utf8'));
const own = JSON.parse(readFileSync('data/i18n/atelier-interface.json', 'utf8'));
const dict = { ...fr, ...own };
const t = (k, p) => String(dict[k] ?? `!${k}`).replace(/\{(\w+)\}/g, (_, x) => String(p?.[x] ?? ''));
const fake = cfg.fake;
const css = readFileSync('css/atelier-interface.css', 'utf8');

describe('boutique : prix fictifs et états du bouton « Acheter »', () => {
  it('niveau maximal : 10 pour les 7 statistiques, 5 pour les chutes, 10 pour la réparation (player-stats.json)', () => {
    expect(maxLevelOf('degats', stats)).toBe(10);
    expect(maxLevelOf('chutes', stats)).toBe(5);
    expect(maxLevelOf('reparation', stats)).toBe(10);
    expect(maxLevelOf('x', null)).toBe(10);
  });

  it('prix fictif : croissant avec le niveau, arrondi à la dizaine, jamais négatif', () => {
    for (const stat of fake.stats) {
      const prices = Array.from({ length: 10 }, (_, l) => fakePrice(stat, l, fake));
      for (let i = 1; i < prices.length; i += 1) expect(prices[i]).toBeGreaterThan(prices[i - 1]);
      for (const p of prices) expect(p % 10).toBe(0);
    }
    expect(fakePrice('degats', -5, fake)).toBe(fakePrice('degats', 0, fake));
    expect(fakePrice('inconnu', 'x', null)).toBeGreaterThan(0);
  });

  it.each([[3, 10, 100, 500, 'available'], [3, 10, 900, 500, 'insufficient'], [10, 10, null, 500, 'max'], [5, 5, null, 0, 'max'], [0, 10, 500, 500, 'available']])('niveau %i / %i, prix %s, solde %i : %s', (level, max, price, balance, state) => {
    expect(buyState(level, max, price, balance)).toBe(state);
  });

  it('les 9 améliorations, dans l\'ordre, avec les trois états présents dans les fausses données', () => {
    const rows = shopRows(fake, stats);
    expect(rows.map((r) => r.stat)).toEqual(fake.stats);
    expect(new Set(rows.map((r) => r.state))).toEqual(new Set(['available', 'insufficient', 'max']));
    expect(rows.filter((r) => r.state === 'max').every((r) => r.price === null)).toBe(true);
  });

  it('3 armes fictives : possédée, disponible, argent insuffisant', () => {
    expect(weaponRows(fake).map((w) => w.state)).toEqual(['owned', 'available', 'insufficient']);
    expect(weaponRows(null)).toEqual([]);
  });

  it('« argent insuffisant » et « niveau maximal » distincts par le texte ET l\'icône (jamais la couleur seule)', () => {
    const html = renderShop('A', t, fake, stats);
    const block = (state) => html.split('<li').find((li) => li.includes(`is-${state}"`) && li.includes('p-buy'));
    const max = block('max');
    const poor = block('insufficient');
    expect(max).toContain(own['ui3k.shop.max']);
    expect(poor).toContain(own['ui3k.shop.insufficient'].replace("'", '&#39;'));
    expect(max).toContain('m2 8.5 1.6-1.6'); // coche
    expect(poor).toContain('M4.5 7V5a3.5'); // cadenas
    expect(poor).toContain('aria-disabled="true"');
  });

  it('onglet armes : 3 armes aux noms génériques marqués « fictif »', () => {
    const html = renderShop('C', t, fake, stats, 'armes');
    expect((html.match(/data-ui="arme-/g) ?? []).length).toBe(3);
    expect((html.match(/\(fictif\)/g) ?? []).length).toBe(3);
    expect(html).toContain('aria-pressed="true" data-action="tab:armes"');
  });
});

describe('menu (E1) : mondes et verrouillages', () => {
  it('le premier monde est ouvert ; les suivants sont verrouillés tant que le précédent ne l\'est pas', () => {
    expect(worldRows(fake).map((w) => w.unlocked)).toEqual([true, false, false]);
    expect(worldRows({ worlds: [{ id: 'a' }, { id: 'b', unlocked: false }, { id: 'c', unlocked: true }] }).map((w) => w.unlocked)).toEqual([true, false, false]);
    expect(worldRows({ worlds: [{ id: 'a' }, { id: 'b', unlocked: true }] }).map((w) => w.unlocked)).toEqual([true, true]);
    expect(worldRows(null)).toEqual([]);
  });

  it('titre du site (Rubik Wet Paint), Jouer, solde, accès boutique, réglages, classement, monde verrouillé « Termine le monde précédent », pied de page', () => {
    const html = renderMenu('B', t, fake);
    expect(html).toContain('class="p-menu-title"');
    expect(html).toContain('>Z-Survival<');
    for (const ui of ['jouer', 'solde', 'boutique', 'reglages', 'classement', 'monde-1', 'monde-2', 'monde-3', 'pied']) expect(html).toContain(`data-ui="${ui}"`);
    expect((html.match(/Termine le monde précédent/g) ?? []).length).toBe(2);
    expect(html).toContain(fr['app.provisional']);
    expect(html).toContain('Données fictives');
    expect(html).toContain('data-block="E1"');
  });
});

describe('réglages (E5) : sang, pseudo, participation', () => {
  it.each([['0', '0'], ['reduit', 'reduit'], ['1', '1'], ['beaucoup', '1'], [undefined, '1']])('niveau de sang %s → %s', (v, expected) => {
    expect(bloodLevel(v)).toBe(expected);
  });

  it('trois niveaux de sang distincts par le texte (Aucun, Réduit, Complet), celui choisi marqué par aria-pressed et une coche', () => {
    expect(BLOOD_LEVELS).toEqual(fake.blood);
    const html = renderSettings('A', t, fake, { blood: 'reduit' });
    const labels = BLOOD_LEVELS.map((b) => own[`ui3k.settings.blood.${b}`]);
    expect(new Set(labels).size).toBe(3);
    for (const l of labels) expect(html).toContain(l);
    expect(html).toMatch(/aria-pressed="true" data-action="sang:reduit"/);
    expect(html).toMatch(/aria-pressed="false" data-action="sang:0"/);
  });

  it.each([
    ['', false, 'empty'], ['ab', false, 'short'], ['abc', true, null], ['  Zoé_42  ', true, null], ['a'.repeat(20), true, null], ['a'.repeat(21), false, 'long'],
    ['joueur<script>', false, 'chars'], ['été-2026', true, null], ['x y', true, null], ['💀💀💀', false, 'chars'], [null, false, 'empty'], [42, false, 'empty'],
  ])('pseudo %j : valide = %s (%s)', (raw, ok, error) => {
    const r = validatePseudo(raw, fake.pseudo);
    expect(r.ok).toBe(ok);
    expect(r.error).toBe(error);
  });

  it('participation au classement décochée par défaut, pseudo désactivé tant qu\'elle ne l\'est pas ; règle affichée', () => {
    const off = renderSettings('C', t, fake);
    expect(off).toMatch(/data-action="join">/);
    expect(off).toMatch(/data-action="pseudo" disabled/);
    expect(off).toContain('De 3 à 20 caractères');
    const on = renderSettings('C', t, fake, { join: true, pseudo: 'ab' });
    expect(on).toMatch(/data-action="join" checked/);
    expect(on).toContain(own['ui3k.settings.pseudo.short']);
    expect(on).toContain('data-pseudo="short"');
  });

  it('langue : français seul ; lien vers sauvegarde.html ; son, volume, effet VHS', () => {
    const html = renderSettings('B', t, fake);
    expect((html.match(/<option/g) ?? []).length).toBe(1);
    expect(html).toContain('Français');
    expect(html).toContain('href="sauvegarde.html"');
    for (const k of ['game.sound.on', 'game.volume', 'game.vhs.label']) expect(html).toContain(fr[k]);
  });
});

describe('classement : fausses données, ligne du joueur, compte fictif', () => {
  it('lignes triées par rang, ligne du joueur ajoutée seulement pour son monde, temps en h:mm:ss', () => {
    const rows = boardRows(fake, 'monde-1');
    expect(rows.map((r) => r.rank)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 37]);
    expect(rows.at(-1)).toMatchObject({ me: true, pseudo: 'Exemple37', time: '23:00' });
    expect(boardRows(fake, 'monde-2').some((r) => r.me)).toBe(false);
    expect(boardRows(fake, 'monde-3')).toEqual([]);
    expect(boardRows(null, 'x')).toEqual([]);
  });

  it('ligne du joueur en évidence par le texte « Toi » et une étoile ; « Connecte-toi » et bouton Google fictif ; « Participer » une fois connecté', () => {
    const html = renderBoard('A', t, fake);
    expect(html).toMatch(/class="is-me" data-ui="ma-ligne"/);
    expect(html).toContain('>Toi<');
    expect(html).toContain(own['ui3k.board.signin']);
    expect(html).toContain('(bouton fictif)');
    expect(html).not.toMatch(/https?:|accounts\.google/);
    const signed = renderBoard('A', t, fake, { signedIn: true });
    expect(signed).toContain(own['ui3k.board.join']);
    expect(signed).not.toContain('(bouton fictif)');
  });

  it('un classement par monde : sélecteur avec les 3 mondes ; monde sans score : message', () => {
    const html = renderBoard('C', t, fake, { world: 'monde-3' });
    expect((html.match(/<option/g) ?? []).length).toBe(3);
    expect(html).toContain('value="monde-3" selected');
    expect(html).toContain(own['ui3k.board.empty']);
  });

  it('prix, armes, joueurs et scores annoncés comme fictifs sur chaque écran hors partie', () => {
    for (const screen of ['menu', 'boutique', 'reglages', 'classement']) {
      for (const dir of ['A', 'B', 'C']) expect(renderOffGame(screen, dir, t, fake, stats), `${screen} ${dir}`).toContain('Données fictives');
    }
    expect(renderOffGame('hud', 'A', t, fake, stats)).toBeNull();
  });

  it('aucune clé de texte manquante dans les quatre écrans', () => {
    for (const screen of ['menu', 'boutique', 'reglages', 'classement']) expect(renderOffGame(screen, 'B', t, fake, stats, { tab: 'armes', join: true, pseudo: 'x' })).not.toMatch(/!ui3k|!game|!app/);
  });
});

describe('propositions de priorité 2 : au plus 5, deux variantes chacune', () => {
  it('5 propositions au plus, toutes nommées dans les textes', () => {
    expect(cfg.priority2.length).toBeLessThanOrEqual(5);
    for (const p of cfg.priority2) expect(own[`atelier.p2.${p.id}`], p.id).toBeDefined();
  });

  it.each(cfg.priority2.map((p) => [p.id]))('%s : deux variantes au rendu différent, sans clé manquante', (id) => {
    const a = renderPriority2(id, 'A', t);
    const b = renderPriority2(id, 'B', t);
    expect(a).not.toBe('');
    expect(a).not.toBe(b);
    expect(a + b).not.toMatch(/!ui3k|!game/);
  });

  it('retour de dégâts : 3 impulsions de 0,4 s (2,5 par seconde, au plus 3) ; vie faible : 1 par seconde ; tout est coupé sous prefers-reduced-motion', () => {
    expect(css).toMatch(/\.p2-hit-b \{[^}]*animation: p2-pulse 0\.4s ease-out 3;/);
    expect(css).toMatch(/\.p2-low-b \.p-icon \{[^}]*animation: p2-beat 1s steps\(1, end\) infinite;/);
    expect(1 / 0.4).toBeLessThanOrEqual(cfg.rules.maxFlashPerSecond);
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\) \{\s*\.ui3k-screen \*,/);
  });

  it('proposition inconnue : rien', () => {
    expect(renderPriority2('confettis', 'A', t)).toBe('');
  });
});

describe('projection de l\'intégration (scripts/interface/projection.mjs)', () => {
  it('countRules compte les règles, y compris dans @media, sans les commentaires', () => {
    expect(countRules('.a { color: x; } /* .b { } */ @media (x) { .c { y: z; } .d { } }')).toBe(3);
    expect(countRules('')).toBe(0);
  });

  it('un écran de jeu choisi : éléments, blocs mesurés, règles CSS et tests existants à adapter', () => {
    const { rows, warnings } = project('ecran=hud;direction=A;texte=M');
    expect(warnings).toEqual([]);
    expect(rows).toHaveLength(1);
    expect(rows[0].elements).toBeGreaterThan(rows[0].measured);
    expect(rows[0].rules).toBeGreaterThan(50);
    expect(rows[0].tests).toEqual(expect.arrayContaining(['tests/e2e/jeu-interface.spec.js', 'tests/e2e/argent.spec.js', 'tests/unit/data-hud.test.js']));
  });

  it('« actuel » : rien à intégrer ; écran hors partie : renvoyé aux futurs lots ; priorité 2 lue', () => {
    const r = project('ecran=menu;direction=actuel\necran=boutique;direction=C\npriorite2=vie-faible:A');
    expect(r.rows[0]).toMatchObject({ direction: 'actuel', elements: 0, tests: [] });
    expect(r.rows[1].note).toMatch(/futur lot/);
    expect(r.priority2).toEqual({ 'vie-faible': 'A' });
  });

  it('entrée hostile : aucune exception', () => {
    for (const v of ['', '\u0000', 'ecran=hud', '; ; ;']) expect(() => project(v)).not.toThrow();
  });
});
