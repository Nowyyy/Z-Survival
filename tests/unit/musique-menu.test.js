// Lot 8i-C : musique des menus. Partition pure (js/core/musique-menu.js) : variantes valides, déterminisme, couches qui entrent et sortent,
// variations d'un tour à l'autre, continuité de la boucle (niveaux, filtre du bourdon, rendu hors ligne : aucun saut de phase ni de niveau à la
// jointure) ; états de la musique (js/core/sons-menu.js : silence, attente du geste, musique, baisse, fondu, arrêt).
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { COUCHES_MUSIQUE, dureeCycle, dureeMesure, filtreBourdon, lireMusique, mesuresCycle, niveaux, notesMesure, rendreMusique, sectionDe } from '../../js/core/musique-menu.js';
import { avancerMusique, creerMusique, EVENEMENTS_MUSIQUE, lireSons, MODES_MUSIQUE, niveauMusique } from '../../js/core/sons-menu.js';

const brut = JSON.parse(readFileSync('data/menu/sons.json', 'utf8'));
const { catalogue } = lireSons(brut);
const variantes = catalogue.musique.variantes.map(lireMusique);
const SR = 11025;
// Niveau moyen (dB) de fenêtres de `largeur` s, tous les `pas` s.
function fenetres(x, largeur = 0.05, pas = 0.025) {
  const n = Math.round(largeur * SR);
  const h = Math.round(pas * SR);
  const out = [];
  for (let i = 0; i + n <= x.length; i += h) {
    let s = 0;
    for (let k = i; k < i + n; k += 1) s += x[k] * x[k];
    out.push(10 * Math.log10(s / n + 1e-9));
  }
  return out;
}
// Plus grand saut de niveau (dB) entre fenêtres voisines autour de l'échantillon `centre` (± 0,1 s).
function sautAutour(x, centre) {
  const f = fenetres(x);
  const k = Math.round(centre / Math.round(0.025 * SR));
  let max = 0;
  for (let i = Math.max(1, k - 4); i <= Math.min(f.length - 1, k + 4); i += 1) max = Math.max(max, Math.abs(f[i] - f[i - 1]));
  return max;
}

describe('partition de la musique des menus', () => {
  it('trois variantes valides, variante par défaut connue, réglages du fondu et de la baisse', () => {
    expect(variantes.length).toBe(3);
    expect(variantes.every(Boolean)).toBe(true);
    expect(variantes.map((v) => v.id)).toEqual(['A', 'B', 'C']);
    expect(catalogue.musique.variantes.map((v) => v.id)).toContain(catalogue.musique.defaut);
    expect(catalogue.musique.baisseOuverture).toBeGreaterThan(0);
    expect(catalogue.musique.baisseOuverture).toBeLessThanOrEqual(1);
    expect(catalogue.musique.fonduJouer).toBeGreaterThan(0.2);
    expect(lireMusique(null)).toBeNull();
    expect(lireMusique({ sections: [], couches: {} })).toBeNull();
  });
  it('un tour dure de une à trois minutes ; les notes d\'une mesure sont déterministes, dans la mesure, audibles et bornées', () => {
    for (const v of variantes) {
      expect(dureeCycle(v)).toBeGreaterThanOrEqual(60);
      expect(dureeCycle(v)).toBeLessThanOrEqual(180);
      for (let m = 0; m < mesuresCycle(v) * 2; m += 1) {
        const notes = notesMesure(v, m);
        expect(notesMesure(v, m)).toEqual(notes);
        for (const n of notes) {
          expect(COUCHES_MUSIQUE).toContain(n.couche);
          expect(n.t).toBeGreaterThanOrEqual(0);
          expect(n.t).toBeLessThan(dureeMesure(v));
          expect(n.freq).toBeGreaterThan(30);
          expect(n.freq).toBeLessThan(8000);
          expect(n.gain).toBeGreaterThan(0);
          expect(n.gain).toBeLessThanOrEqual(1);
          expect(n.duree).toBeGreaterThan(0);
        }
      }
    }
  });
  it('les couches entrent et sortent : chaque couche est absente de certaines mesures et présente dans d\'autres', () => {
    for (const v of variantes) {
      const total = mesuresCycle(v);
      for (const c of ['pouls', 'ostinato', 'nappe']) {
        const presence = Array.from({ length: total }, (_, m) => notesMesure(v, m).some((n) => n.couche === c));
        expect(presence.includes(true), `${v.id} ${c}`).toBe(true);
        expect(presence.includes(false), `${v.id} ${c}`).toBe(true);
      }
    }
  });
  it('variations : d\'un tour à l\'autre, les notes changent (motifs, accords, cloches), la structure reste', () => {
    for (const v of variantes) {
      const total = mesuresCycle(v);
      const tour = (c) => JSON.stringify(Array.from({ length: total }, (_, m) => notesMesure(v, c * total + m).map((n) => [n.couche, n.t, Math.round(n.freq)])));
      const tours = [0, 1, 2, 3].map(tour);
      expect(new Set(tours).size).toBeGreaterThanOrEqual(3);
      for (let m = 0; m < total; m += 1) {
        const a = sectionDe(v, m);
        const b = sectionDe(v, m + 2 * total);
        expect([b.index, b.rang, b.cycle]).toEqual([a.index, a.rang, a.cycle + 2]);
      }
    }
  });
});

describe('boucle sans coupure', () => {
  it('niveaux des couches continus d\'une mesure à la suivante, bouclage compris', () => {
    for (const v of variantes) {
      const total = mesuresCycle(v);
      for (let m = 0; m < total + 2; m += 1) {
        const fin = niveaux(v, m, 1);
        const debut = niveaux(v, m + 1, 0);
        for (const c of COUCHES_MUSIQUE) expect(debut[c], `${v.id} mesure ${m} ${c}`).toBeCloseTo(fin[c], 9);
      }
    }
  });
  it('filtre du bourdon périodique sur le tour (même valeur au bouclage), sans marche entre deux mesures', () => {
    for (const v of variantes) {
      const total = mesuresCycle(v);
      expect(filtreBourdon(v, total)).toBeCloseTo(filtreBourdon(v, 0), 9);
      const etendue = v.bourdon.lp[1] - v.bourdon.lp[0];
      for (let m = 0; m < total; m += 1) expect(Math.abs(filtreBourdon(v, m + 1) - filtreBourdon(v, m))).toBeLessThan(etendue * 0.5);
    }
  });
  it('rendu hors ligne : à la jointure, aucun saut de niveau plus grand qu\'aux autres changements de section, aucun saut de phase', () => {
    for (const v of variantes) {
      const total = mesuresCycle(v);
      const bar = dureeMesure(v);
      const centre = Math.round(2 * bar * SR);
      // Jointure : dernière mesure du tour → première du suivant.
      const jointure = rendreMusique(v, total - 2, 4, SR);
      const sautJointure = sautAutour(jointure, centre);
      // Autres changements de section du tour.
      const autres = [];
      let m = 0;
      for (const s of v.sections.slice(0, -1)) {
        m += s.mesures;
        autres.push(sautAutour(rendreMusique(v, m - 2, 4, SR), centre));
      }
      expect(sautJointure, `${v.id} : ${sautJointure.toFixed(1)} dB contre ${autres.map((a) => a.toFixed(1))}`).toBeLessThanOrEqual(Math.max(...autres) * 1.25 + 1);
      // Phase : le plus grand écart entre deux échantillons voisins à la jointure (± 5 ms) ne dépasse pas celui du reste de l'extrait.
      const ecart = (a, b) => {
        let max = 0;
        for (let i = Math.max(1, a); i < Math.min(jointure.length, b); i += 1) max = Math.max(max, Math.abs(jointure[i] - jointure[i - 1]));
        return max;
      };
      const marge = Math.round(0.005 * SR);
      expect(ecart(centre - marge, centre + marge)).toBeLessThanOrEqual(ecart(0, jointure.length) + 1e-9);
      expect(ecart(centre - marge, centre + marge)).toBeLessThan(0.5);
      // Aucun silence à la jointure : le bourdon tient.
      const f = fenetres(jointure);
      const k = Math.round(centre / Math.round(0.025 * SR));
      for (let i = k - 8; i <= k + 8; i += 1) expect(f[i], `${v.id} fenêtre ${i}`).toBeGreaterThan(-40);
    }
  });
  it('le rendu d\'un extrait ne dépend pas de son découpage : deux moitiés rendues à part égalent l\'extrait entier (notes tenues comprises)', () => {
    const v = variantes[0];
    const entier = rendreMusique(v, 6, 4, SR);
    const a = rendreMusique(v, 6, 2, SR);
    const b = rendreMusique(v, 8, 2, SR);
    let max = 0;
    for (let i = 0; i < a.length; i += 1) max = Math.max(max, Math.abs(entier[i] - a[i]));
    for (let i = 0; i < b.length; i += 1) max = Math.max(max, Math.abs(entier[a.length + i] - b[i]));
    expect(max).toBeLessThan(1e-6);
  });
});

describe('états de la musique des menus', () => {
  const suite = (...evts) => evts.reduce((e, ev) => avancerMusique(e, ev), creerMusique());
  it('silence, puis attente du geste, puis musique : dans les deux ordres (introduction : geste avant le menu ; retour : menu avant le geste)', () => {
    expect(creerMusique().mode).toBe('silence');
    expect(suite('geste').mode).toBe('silence'); // geste de l'introduction : le menu n'est pas encore là
    expect(suite('geste', 'pret').mode).toBe('joue'); // après l'introduction et l'écran de chargement
    expect(suite('pret').mode).toBe('attente'); // retour d'une partie : aucun geste encore
    expect(suite('pret', 'geste').mode).toBe('joue');
  });
  it('baisse pendant une ouverture, retour au plein niveau à sa fin', () => {
    expect(suite('pret', 'geste', 'ouverture').mode).toBe('baisse');
    expect(suite('pret', 'geste', 'ouverture', 'fin-ouverture').mode).toBe('joue');
  });
  it('arrêt page cachée ou son coupé, reprise au retour ; une ouverture en cours reste baissée', () => {
    expect(suite('pret', 'geste', 'cachee').mode).toBe('arret');
    expect(suite('pret', 'geste', 'cachee', 'visible').mode).toBe('joue');
    expect(suite('pret', 'geste', 'coupe').mode).toBe('arret');
    expect(suite('pret', 'geste', 'coupe', 'cachee', 'retabli').mode).toBe('arret');
    expect(suite('pret', 'geste', 'coupe', 'retabli').mode).toBe('joue');
    expect(suite('pret', 'geste', 'ouverture', 'cachee', 'visible').mode).toBe('baisse');
    expect(suite('pret', 'coupe', 'geste').mode).toBe('arret'); // son coupé avant le premier geste : jamais de musique
  });
  it('fondu à « JOUER », définitif : plus rien ne relance la musique', () => {
    let e = suite('pret', 'geste', 'jouer');
    expect(e.mode).toBe('fondu');
    for (const ev of EVENEMENTS_MUSIQUE) {
      e = avancerMusique(e, ev);
      expect(e.mode).toBe('fondu');
    }
    expect(suite('jouer').mode).toBe('fondu');
  });
  it('niveaux : plein en musique, baissé pendant une ouverture, nul ailleurs ; états figés, événement inconnu sans effet', () => {
    expect(niveauMusique('joue')).toBe(1);
    expect(niveauMusique('baisse', 0.35)).toBe(0.35);
    expect(niveauMusique('baisse', 7)).toBe(1);
    for (const m of ['silence', 'attente', 'fondu', 'arret']) expect(niveauMusique(m)).toBe(0);
    const e = suite('pret', 'geste');
    expect(Object.isFrozen(e)).toBe(true);
    expect(avancerMusique(e, 'inconnu')).toEqual(e);
    expect(MODES_MUSIQUE).toContain(e.mode);
  });
});
