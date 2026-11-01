import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { ERROR_CODES, defaultSave } from '../../js/core/save.js';
import { readLevels } from '../../js/game/levels-source.js';
import { canReplace, confirmStep, errorKey, levelRows, previewRows, recordKey, rowKey, savedAtDate, statKey, stateKey, stateName } from '../../js/sauvegarde/logic.js';

const load = (name) => JSON.parse(readFileSync(`data/game/${name}.json`, 'utf8'));
const stats = load('player-stats');
const fr = JSON.parse(readFileSync('data/i18n/fr.json', 'utf8'));
const withStats = (s) => ({ ...defaultSave(), stats: { ...defaultSave().stats, ...s } });

describe('priorité des niveaux : ?lvl= > sauvegarde > zéros', () => {
  it('sans ?lvl= ni sauvegarde : zéros, source « default »', () => {
    const r = readLevels('', stats);
    expect(r.source).toBe('default');
    expect(Object.values(r.levels).every((v) => v === 0)).toBe(true);
    expect(r.warnings).toEqual([]);
  });

  it('la sauvegarde donne les niveaux, source « save » (neuf statistiques, dont chutes et reparation)', () => {
    const r = readLevels('', stats, withStats({ degats: 2, precision: 5, chutes: 3, reparation: 7 }));
    expect(r.source).toBe('save');
    expect(r.levels).toMatchObject({ degats: 2, precision: 5, chutes: 3, reparation: 7, portee: 0 });
  });

  it('?lvl= l\'emporte sur la sauvegarde, source « url », sans mélange avec elle', () => {
    const r = readLevels('?lvl=degats:3', stats, withStats({ degats: 9, portee: 4 }));
    expect(r.source).toBe('url');
    expect(r.levels.degats).toBe(3);
    expect(r.levels.portee).toBe(0);
  });

  it('?lvl=all:5 est borné par statistique (chutes à 5, les autres à 5)', () => {
    const r = readLevels('?lvl=all:5', stats, null);
    expect(r.source).toBe('url');
    expect(Object.values(r.levels).every((v) => v === 5)).toBe(true);
    expect(readLevels('?lvl=all:99', stats).levels).toMatchObject({ degats: 10, chutes: 5, reparation: 10 });
  });

  it('?lvl= vide est ignoré : la sauvegarde s\'applique', () => {
    expect(readLevels('?lvl=', stats, withStats({ vie: 2 })).source).toBe('save');
    expect(readLevels('?lvl=%20', stats, withStats({ vie: 2 })).levels.vie).toBe(2);
  });

  it.each(['?lvl=__proto__:5', '?lvl=degats:abc', '?lvl=,,,', '?lvl=degats:-3', `?lvl=${'a:1,'.repeat(500)}`])('valeur hostile %s : pas d\'exception, niveaux valides', (search) => {
    const r = readLevels(search, stats, withStats({ vie: 4 }));
    expect(r.source).toBe('url');
    for (const v of Object.values(r.levels)) expect(Number.isInteger(v) && v >= 0 && v <= 10).toBe(true);
  });

  it('une sauvegarde hors bornes est bornée avec avertissement', () => {
    const r = readLevels('', stats, withStats({ degats: 99 }));
    expect(r.levels.degats).toBe(10);
    expect(r.warnings.length).toBeGreaterThan(0);
  });

  it.each([null, undefined, 5, 'x', { stats: null }, { stats: 4 }])('sauvegarde inutilisable %j : zéros, source « default »', (save) => {
    expect(readLevels('', stats, save).source).toBe('default');
  });
});

describe('logique pure de sauvegarde.html', () => {
  it('chaque code d\'erreur a un message existant ; un code inconnu retombe sur « bad-schema »', () => {
    for (const code of ERROR_CODES) expect(fr[errorKey(code)], code).toBeTruthy();
    expect(errorKey('???')).toBe(errorKey('bad-schema'));
    expect(errorKey(undefined)).toBe(errorKey('bad-schema'));
  });

  it.each([['ok', 'saved'], ['empty', 'empty'], ['corrupt', 'locked'], ['future', 'locked'], ['unavailable', 'unavailable'], ['???', 'empty'], [undefined, 'empty']])('état (%s) → %s, avec son texte', (status, name) => {
    expect(stateName(status)).toBe(name);
    expect(fr[stateKey(name)]).toBeTruthy();
  });

  it('toutes les clés de noms (statistiques, records, lignes) existent dans fr.json', () => {
    for (const id of ['degats', 'portee', 'precision', 'cadence', 'vitesse', 'vie', 'regen', 'chutes', 'reparation']) expect(fr[statKey(id)], id).toBeTruthy();
    for (const id of ['bestWave', 'bestKills', 'runs', 'worldsCompleted']) expect(fr[recordKey(id)], id).toBeTruthy();
    for (const id of ['money', 'earned', 'levelsSum', 'bestWave']) expect(fr[rowKey(id)], id).toBeTruthy();
  });

  it('aperçu d\'un import : lignes de solde, de total, de niveaux et de records, avec ce qui change', () => {
    const current = { ...defaultSave(), money: 100, earned: 100, records: { bestWave: 4, bestKills: 0, runs: 1, worldsCompleted: 0 } };
    const incoming = { ...withStats({ degats: 3 }), money: 500, earned: 100, records: { bestWave: 4, bestKills: 10, runs: 2, worldsCompleted: 0 } };
    const rows = previewRows(current, incoming);
    expect(rows.map((r) => r.id)).toEqual(['money', 'earned', 'levelsSum', 'bestWave', 'bestKills', 'runs', 'worldsCompleted']);
    const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
    expect(byId.money).toMatchObject({ current: 100, incoming: 500, changed: true });
    expect(byId.earned.changed).toBe(false);
    expect(byId.levelsSum).toMatchObject({ current: 0, incoming: 3, changed: true });
    expect(byId.bestWave.changed).toBe(false);
    expect(byId.runs).toMatchObject({ current: 1, incoming: 2, changed: true });
  });

  it('aperçu des niveaux : neuf lignes, chaque niveau comparé', () => {
    const rows = levelRows(withStats({ degats: 1, chutes: 2 }), withStats({ degats: 1, chutes: 4, reparation: 9 }));
    expect(rows).toHaveLength(9);
    expect(rows.find((r) => r.id === 'degats')).toMatchObject({ current: 1, incoming: 1, changed: false });
    expect(rows.find((r) => r.id === 'chutes')).toMatchObject({ current: 2, incoming: 4, changed: true });
    expect(rows.find((r) => r.id === 'reparation')).toMatchObject({ incoming: 9, changed: true });
  });

  it.each([null, undefined, 5, 'x'])('aperçu avec une sauvegarde hostile %j : zéros, sans exception', (bad) => {
    expect(previewRows(bad, bad).every((r) => r.current === 0 && r.incoming === 0 && !r.changed)).toBe(true);
    expect(levelRows(bad, bad).every((r) => !r.changed)).toBe(true);
  });

  it('« Remplacer ma sauvegarde » n\'est actif qu\'après une vérification réussie ET la case cochée', () => {
    expect(canReplace(true, true)).toBe(true);
    expect(canReplace(true, false)).toBe(false);
    expect(canReplace(false, true)).toBe(false);
    expect(canReplace(undefined, 'oui')).toBe(false);
  });

  it('confirmation en deux temps avec case : armer, cocher, confirmer', () => {
    let s = { armed: false, acknowledged: false };
    expect(confirmStep(s, 'confirm').run).toBe(false);
    s = confirmStep(s, 'ack').state;
    expect(s).toEqual({ armed: false, acknowledged: false }); // on ne coche rien avant d'armer
    s = confirmStep(s, 'arm').state;
    expect(confirmStep(s, 'confirm').run).toBe(false); // armé mais case non cochée
    s = confirmStep(s, 'ack').state;
    expect(s).toEqual({ armed: true, acknowledged: true });
    const done = confirmStep(s, 'confirm');
    expect(done.run).toBe(true);
    expect(done.state).toEqual({ armed: false, acknowledged: false });
  });

  it('confirmation sans case (Repartir de zéro) : deux clics suffisent, annuler désarme, décocher refuse', () => {
    let s = confirmStep({}, 'arm', { needsAck: false }).state;
    expect(confirmStep(s, 'confirm', { needsAck: false }).run).toBe(true);
    s = confirmStep(s, 'cancel').state;
    expect(confirmStep(s, 'confirm', { needsAck: false }).run).toBe(false);
    s = confirmStep(confirmStep(confirmStep({}, 'arm').state, 'ack').state, 'unack').state;
    expect(confirmStep(s, 'confirm').run).toBe(false);
  });

  it.each([undefined, null, 'x'])('confirmStep avec un état %j ou une action inconnue : pas d\'exception, rien n\'est lancé', (bad) => {
    expect(confirmStep(bad, 'confirm').run).toBe(false);
    expect(confirmStep({ armed: true }, '???').run).toBe(false);
  });

  it('date de la dernière écriture : absente = « jamais » (null)', () => {
    expect(savedAtDate(0)).toBeNull();
    expect(savedAtDate(-1)).toBeNull();
    expect(savedAtDate(NaN)).toBeNull();
    expect(savedAtDate('x')).toBeNull();
    expect(savedAtDate(1_700_000_000_000)).toBeInstanceOf(Date);
  });
});
