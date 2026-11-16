import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { infiniJouable, lireMondes } from '../../js/core/menu-etat.js';
import { appliquerOps, defaultProgression, solde, soldeDiamants } from '../../js/core/progression.js';

// Lot 9a (décision du propriétaire) : une carte de l'onglet Infini n'est jouable que si son monde a été terminé en entier en histoire (progression v2,
// champ « mondes ») ; outil de débogage « Marquer le monde 1 terminé » sans aucun gain.
const lire = (p) => JSON.parse(readFileSync(p, 'utf8'));
const params = { save: lire('data/game/save.json'), economy: lire('data/game/economy.json'), stats: lire('data/game/player-stats.json') };
describe('Infini : carte jouable seulement si son monde a été terminé (save.mondes)', () => {
  const mondes = lireMondes(lire('data/menu/mondes.json'));
  const m1 = mondes.find((m) => m.id === 'batiment');
  it('monde jouable et terminé : jouable ; pas terminé : verrouillé avec sa raison ; monde à venir : verrouillé comme avant', () => {
    expect(infiniJouable(m1, ['batiment'])).toEqual({ jouable: true, raison: null });
    expect(infiniJouable(m1, [])).toEqual({ jouable: false, raison: 'termine' });
    expect(infiniJouable(m1, null)).toEqual({ jouable: false, raison: 'termine' });
    expect(infiniJouable(m1, ['monde-2'])).toEqual({ jouable: false, raison: 'termine' });
    expect(infiniJouable(mondes.find((m) => m.id === 'monde-2'), ['batiment', 'monde-2'])).toEqual({ jouable: false, raison: 'avenir' });
    expect(infiniJouable(null, ['batiment'])).toEqual({ jouable: false, raison: 'avenir' });
  });
});

describe('outil de débogage « Marquer le monde 1 terminé » : monde terminé, aucun gain', () => {
  it('l\'opération de l\'outil ajoute « batiment » aux mondes terminés ; soldes, totaux, records, mondes récompensés et paliers inchangés', () => {
    const avant = appliquerOps(defaultProgression(), [{ id: 'g1', t: 'gain', medailles: 40, diamants: 70 }], 1, params).save;
    const apres = appliquerOps(avant, [{ id: 'm1', t: 'gain', monde: 'batiment' }], 2, params).save;
    expect(apres.mondes).toEqual(['batiment']);
    expect([solde(apres), soldeDiamants(apres), apres.medailles, apres.diamants, apres.records, apres.mondesFinis, apres.paliers]).toEqual([40, 70, avant.medailles, avant.diamants, avant.records, avant.mondesFinis, avant.paliers]);
    expect(infiniJouable(lireMondes(lire('data/menu/mondes.json'))[0], apres.mondes)).toEqual({ jouable: true, raison: null });
    const src = readFileSync('js/menu/equipement-etat.js', 'utf8');
    expect(src).toMatch(/marquerMondeTermine\(monde\) \{\n\s+return ecrire\(\[\{ id: nouvelId\(\), t: 'gain', monde \}\]\);/);
    expect(readFileSync('js/menu/debogage.js', 'utf8')).toMatch(/eq\.marquerMondeTermine\('batiment'\)/);
  });
});
