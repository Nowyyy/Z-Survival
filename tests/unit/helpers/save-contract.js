// Suite de contrat de SaveRepository (lot 4), exécutée sur chaque adaptateur. `make()` renvoie { repo, external(save), reset() } :
// repo = l'adaptateur à tester, external(save) simule la modification de la sauvegarde par une autre page.
import { describe, it, expect } from 'vitest';
import { defaultSave } from '../../../js/core/save.js';
import { REPOSITORY_METHODS, STATUSES, isRepository } from '../../../js/save/repository.js';

export function runContract(name, make, { writes = true } = {}) {
  describe(`contrat SaveRepository : ${name}`, () => {
    it('a toutes les méthodes de l\'interface', () => {
      const { repo } = make();
      expect(isRepository(repo)).toBe(true);
      for (const m of REPOSITORY_METHODS) expect(typeof repo[m]).toBe('function');
    });

    it('load() d\'un dépôt neuf : statut connu, sauvegarde par défaut, aucun avertissement', () => {
      const { repo } = make();
      const r = repo.load();
      expect(STATUSES).toContain(r.status);
      expect(r.status).toBe('empty');
      expect(r.save).toEqual(defaultSave());
      expect(r.warnings).toEqual([]);
    });

    it('load() renvoie un nouvel objet à chaque appel (modifier le résultat ne change rien)', () => {
      const { repo } = make();
      const a = repo.load();
      a.save.money = 12345;
      a.save.stats.degats = 9;
      expect(repo.load().save.money).toBe(0);
      expect(repo.load().save.stats.degats).toBe(0);
    });

    it('info() décrit l\'adaptateur', () => {
      const { repo } = make();
      const info = repo.info();
      expect(['local', 'memory']).toContain(info.kind);
      expect(typeof info.readOnly).toBe('boolean');
      expect(typeof info.locked).toBe('boolean');
      expect(STATUSES).toContain(info.status);
      expect(Object.keys(info).sort()).toEqual(['key', 'kind', 'locked', 'readOnly', 'status']);
    });

    if (writes) {
      it('commit() applique une différence et renvoie la sauvegarde fusionnée', () => {
        const { repo } = make();
        const r = repo.commit({ money: 10, earned: 10, bestWave: 3 }, 1000);
        expect(r.ok).toBe(true);
        expect(r.applied).toBe(true);
        expect(r.save.money).toBe(10);
        expect(r.save.earned).toBe(10);
        expect(r.save.records.bestWave).toBe(3);
        expect(r.save.rev).toBe(1);
        expect(r.save.savedAt).toBe(1000);
        expect(repo.load().save).toEqual(r.save);
        expect(repo.load().status).toBe('ok');
      });

      it('deux commit() de suite s\'additionnent', () => {
        const { repo } = make();
        repo.commit({ money: 10, earned: 10, runs: 1 }, 1);
        const r = repo.commit({ money: 7, earned: 7, runs: 1, bestWave: 2 }, 2);
        expect(r.save.money).toBe(17);
        expect(r.save.records.runs).toBe(2);
        expect(r.save.rev).toBe(2);
      });

      it('commit() avec une différence hostile ne lève pas et n\'invente rien', () => {
        const { repo } = make();
        for (const bad of [null, undefined, 5, 'x', [], { money: 'abc' }, { money: -5 }]) expect(() => repo.commit(bad, 1)).not.toThrow();
        expect(repo.load().save.money).toBe(0);
      });

      it('replace() remplace toute la sauvegarde (import) et nettoie les valeurs', () => {
        const { repo } = make();
        repo.commit({ money: 99, earned: 99 }, 1);
        const incoming = { ...defaultSave(), money: 500, earned: 800, stats: { ...defaultSave().stats, degats: 4 } };
        const r = repo.replace(incoming, 5);
        expect(r.ok).toBe(true);
        expect(r.save.money).toBe(500);
        expect(r.save.stats.degats).toBe(4);
        expect(repo.load().save.money).toBe(500);
        expect(repo.replace({ ...incoming, money: 1e12, stats: { degats: 99 } }, 6).save.money).toBe(9_999_999);
        expect(repo.load().save.stats.degats).toBe(10);
      });

      it('replace() avec un objet hostile ne lève pas', () => {
        const { repo } = make();
        for (const bad of [null, undefined, 5, 'x', []]) expect(() => repo.replace(bad, 1)).not.toThrow();
      });

      it('clear() remet la sauvegarde par défaut', () => {
        const { repo } = make();
        repo.commit({ money: 50, earned: 50 }, 1);
        const r = repo.clear();
        expect(r.ok).toBe(true);
        expect(repo.load().save).toEqual(defaultSave());
        expect(repo.load().status).toBe('empty');
      });
    }

    it('subscribe() est appelée quand une autre page modifie la sauvegarde, puis plus après le désabonnement', () => {
      const { repo, external } = make();
      const seen = [];
      const stop = repo.subscribe((save) => seen.push(save.money));
      expect(typeof stop).toBe('function');
      external({ ...defaultSave(), money: 42 });
      expect(seen).toEqual([42]);
      stop();
      external({ ...defaultSave(), money: 43 });
      expect(seen).toEqual([42]);
    });

    it('subscribe() ignore ce qui n\'est pas une fonction', () => {
      const { repo } = make();
      expect(() => repo.subscribe(null)()).not.toThrow();
      expect(() => repo.subscribe(undefined)()).not.toThrow();
    });

    it('requestPersistence() ne lève pas et répond true, false ou null', async () => {
      const { repo } = make();
      expect([true, false, null]).toContain(await repo.requestPersistence());
    });

    it('aucune méthode ne lève, même appelée dans le désordre', () => {
      const { repo } = make();
      expect(() => {
        repo.clear();
        repo.load();
        repo.commit({}, 1);
        repo.replace(defaultSave(), 2);
        repo.clear();
        repo.info();
      }).not.toThrow();
    });
  });
}
