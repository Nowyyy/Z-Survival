import { describe, it, expect } from 'vitest';
import { MAX_CHIPS, urgentWindows, windowChips } from '../../js/core/hud-windows.js';
import { deepFreeze, WEIRD } from './helpers/monde.js';

const fr = JSON.parse(await import('node:fs').then((fs) => fs.readFileSync('data/i18n/fr.json', 'utf8')));
const LABELS = { 'fenetre-nord': 'N', 'fenetre-ouest': 'O', 'fenetre-est': 'E', 'fenetre-sud': 'S' };
const P = { labels: LABELS };
const w = (id, planks, attacked = false, maxPlanks = 4) => ({ id: `fenetre-${id}`, planks, maxPlanks, attacked });
const ids = (list) => list.map((c) => c.id.replace('fenetre-', ''));

describe('hud-windows.js : quelles fenêtres, dans quel ordre', () => {
  it('rien à afficher quand aucune fenêtre n\'est attaquée ni ouverte', () => {
    expect(windowChips([w('nord', 4), w('ouest', 3), w('est', 1)], P)).toEqual({ chips: [], more: 0 });
  });

  it('une fenêtre abîmée mais non attaquée n\'apparaît pas', () => {
    expect(windowChips([w('nord', 2)], P).chips).toEqual([]);
  });

  it('une fenêtre attaquée apparaît avec ses planches, son initiale, attacked vrai et open faux', () => {
    expect(windowChips([w('nord', 3, true)], P).chips).toEqual([{ id: 'fenetre-nord', label: 'N', planks: 3, max: 4, attacked: true, open: false }]);
  });

  it('une fenêtre sans planche est ouverte, qu\'elle soit attaquée ou non', () => {
    expect(windowChips([w('est', 0)], P).chips).toEqual([{ id: 'fenetre-est', label: 'E', planks: 0, max: 4, attacked: false, open: true }]);
    expect(windowChips([w('est', 0, true)], P).chips[0]).toMatchObject({ open: true, attacked: true });
  });

  it('tri par urgence : ouverte d\'abord, puis le moins de planches, puis attaquée', () => {
    const list = [w('nord', 3, true), w('ouest', 0), w('est', 1, true), w('sud', 1, true)];
    expect(ids(urgentWindows(list, P))).toEqual(['ouest', 'est', 'sud', 'nord']);
  });

  it('à planches égales : l\'attaquée avant l\'autre ; 0 planche passe toujours avant une fenêtre intacte attaquée', () => {
    expect(ids(urgentWindows([w('nord', 0), w('ouest', 0, true)], P))).toEqual(['ouest', 'nord']);
    expect(ids(urgentWindows([w('nord', 2, true), w('ouest', 2, true)], P))).toEqual(['nord', 'ouest']);
    expect(ids(urgentWindows([w('nord', 0), w('ouest', 4, true)], P))).toEqual(['nord', 'ouest']);
  });

  it('ordre stable : l\'ordre d\'origine départage deux fenêtres identiques', () => {
    expect(ids(urgentWindows([w('est', 2, true), w('nord', 2, true), w('ouest', 2, true)], P))).toEqual(['est', 'nord', 'ouest']);
  });

  it('au plus 3 puces, et le nombre des autres dans more', () => {
    const four = [w('nord', 1, true), w('ouest', 2, true), w('est', 3, true), w('sud', 3, true)];
    const out = windowChips(four, P);
    expect(MAX_CHIPS).toBe(3);
    expect(ids(out.chips)).toEqual(['nord', 'ouest', 'est']);
    expect(out.more).toBe(1);
  });

  it('quatre fenêtres attaquées : trois puces et « +1 », triées par urgence', () => {
    const out = windowChips([w('sud', 4, true), w('est', 1, true), w('ouest', 2, true), w('nord', 3, true)], P);
    expect(ids(out.chips)).toEqual(['est', 'ouest', 'nord']);
    expect(out.more).toBe(1);
  });

  it('exactement 3 alertes : aucune fenêtre en plus', () => {
    expect(windowChips([w('nord', 1, true), w('ouest', 0), w('est', 2, true)], P).more).toBe(0);
  });

  it('maxChips règle le plafond (entier d\'au moins 1)', () => {
    const list = [w('nord', 0), w('ouest', 0), w('est', 0)];
    expect(windowChips(list, { ...P, maxChips: 2 })).toMatchObject({ more: 1 });
    expect(windowChips(list, { ...P, maxChips: 2 }).chips).toHaveLength(2);
    expect(windowChips(list, { ...P, maxChips: 0 }).chips).toHaveLength(3);
    expect(windowChips(list, { ...P, maxChips: 'x' }).chips).toHaveLength(3);
  });

  it.each([0, 1, 2, 3, 4])('%i planche(s) : valeurs conservées, ouverte seulement à 0', (n) => {
    const chip = windowChips([w('nord', n, true)], P).chips[0];
    expect([chip.planks, chip.open, chip.max]).toEqual([n, n === 0, 4]);
  });

  it('max vient de maxPlanks de la fenêtre (4 par défaut), planches bornées à [0, max]', () => {
    expect(windowChips([{ id: 'a', planks: 9, maxPlanks: 6, attacked: true }], P).chips[0]).toMatchObject({ planks: 6, max: 6 });
    expect(windowChips([{ id: 'a', planks: -3, attacked: true }], P).chips[0]).toMatchObject({ planks: 0, max: 4, open: true });
    expect(windowChips([{ id: 'a', planks: 2.9, attacked: true }], P).chips[0].planks).toBe(2);
  });

  it('le libellé vient des données (labels), jamais du code ; une fenêtre inconnue garde un libellé vide', () => {
    expect(windowChips([w('nord', 0)], { labels: { 'fenetre-nord': 'Z' } }).chips[0].label).toBe('Z');
    expect(windowChips([w('nord', 0)], { labels: {} }).chips[0].label).toBe('');
    expect(windowChips([w('nord', 0)], {}).chips[0].label).toBe('');
    expect(windowChips([{ id: 'fenetre-inconnue', planks: 0 }], P).chips[0]).toMatchObject({ id: 'fenetre-inconnue', label: '' });
  });

  it('les initiales de fr.json (game.windows.initial.*) sont une lettre majuscule par fenêtre', () => {
    for (const side of ['nord', 'ouest', 'est', 'sud']) expect(fr[`game.windows.initial.${side}`], side).toMatch(/^\p{Lu}$/u);
  });

  it('fenêtres inconnues ou invalides ignorées : identifiant absent, vide, non texte', () => {
    expect(windowChips([{ planks: 0 }, { id: '', planks: 0 }, { id: 7, planks: 0 }, null, 'x', 4], P)).toEqual({ chips: [], more: 0 });
  });

  it('attacked doit valoir exactement true : un texte ou 1 ne compte pas', () => {
    expect(windowChips([{ id: 'a', planks: 2, attacked: 'oui' }, { id: 'b', planks: 2, attacked: 1 }], P).chips).toEqual([]);
  });

  it('entrées hostiles : rien, jamais d\'exception', () => {
    for (const bad of WEIRD) {
      expect(() => windowChips(bad, bad)).not.toThrow();
      expect(() => urgentWindows(bad, bad)).not.toThrow();
      expect(windowChips(bad, P)).toEqual({ chips: [], more: 0 });
    }
    expect(windowChips([w('nord', NaN, true)], P).chips[0]).toMatchObject({ planks: 0, open: true });
    expect(windowChips([w('nord', 1, true)], { labels: 'x' }).chips[0].label).toBe('');
  });

  it('arguments gelés : aucune modification', () => {
    const list = deepFreeze([w('nord', 1, true), w('est', 0)]);
    const params = deepFreeze({ labels: { ...LABELS }, maxChips: 2 });
    expect(() => windowChips(list, params)).not.toThrow();
    expect(list[0].planks).toBe(1);
  });

  it('déterministe : mêmes arguments, même résultat ; le résultat est neuf à chaque appel', () => {
    const list = [w('nord', 1, true), w('est', 0)];
    expect(windowChips(list, P)).toEqual(windowChips(list, P));
    expect(windowChips(list, P).chips).not.toBe(windowChips(list, P).chips);
  });
});
