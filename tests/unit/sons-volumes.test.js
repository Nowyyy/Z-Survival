// Lot 8i-E : volumes du jeu et de la musique. Calcul des gains (sourdine, 0 %, 100 %, loi du volume ; js/core/sons-menu.js, utilisé par les
// sons du menu et par le module audio de la partie) ; empreintes SHA-256 des tampons de la partie identiques à celles relevées sur la base du
// lot (tests/unit/helpers/sons-partie-empreintes.json) : le lot ne change que la façon de régler leur volume.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { gainsVolumes, normaliserVolume, VOLUME_DEFAUT, VOLUME_PAS } from '../../js/core/sons-menu.js';
import { empreintes } from '../../scripts/menu/empreintes-partie.mjs';

describe('gains des volumes', () => {
  it('« Son coupé » coupe tout, quels que soient les volumes', () => {
    for (const jeu of [0, 50, 100]) for (const musique of [0, 50, 100]) expect(gainsVolumes({ coupe: true, jeu, musique })).toEqual({ effets: 0, musique: 0 });
  });
  it('0 % = silence, 100 % = plein niveau ; par défaut : son activé, plein niveau', () => {
    expect(gainsVolumes({ jeu: 0, musique: 0 })).toEqual({ effets: 0, musique: 0 });
    expect(gainsVolumes({ jeu: 100, musique: 100 })).toEqual({ effets: 1, musique: 1 });
    expect(gainsVolumes()).toEqual({ effets: 1, musique: 1 });
    expect(VOLUME_DEFAUT).toBe(100);
  });
  it('loi du volume : linéaire (n / 100), croissante, celle de la partie depuis le lot 8c', () => {
    let avant = -1;
    for (let n = 0; n <= 100; n += VOLUME_PAS) {
      const g = gainsVolumes({ jeu: n, musique: 100 - n });
      expect(g.effets).toBeCloseTo(n / 100, 12);
      expect(g.musique).toBeCloseTo((100 - n) / 100, 12);
      expect(g.effets).toBeGreaterThan(avant);
      avant = g.effets;
    }
  });
  it('les deux volumes sont indépendants : le volume du jeu ne change pas la musique, et inversement', () => {
    expect(gainsVolumes({ jeu: 0, musique: 80 })).toEqual({ effets: 0, musique: 0.8 });
    expect(gainsVolumes({ jeu: 30, musique: 0 })).toEqual({ effets: 0.3, musique: 0 });
  });
  it('valeurs hors bornes ou invalides : bornées à 0 et 100, valeur par défaut sinon', () => {
    expect(gainsVolumes({ jeu: 250, musique: -40 })).toEqual({ effets: 1, musique: 0 });
    expect(gainsVolumes({ jeu: 'x', musique: null })).toEqual({ effets: 1, musique: 1 });
    expect(gainsVolumes({ jeu: NaN, musique: undefined })).toEqual({ effets: 1, musique: 1 });
  });
  it('normaliserVolume : pas de 10 le plus proche, bornes, valeur par défaut', () => {
    expect([0, 4, 5, 14, 15, 96, 100, 130, -3].map((n) => normaliserVolume(n))).toEqual([0, 0, 10, 10, 20, 100, 100, 100, 0]);
    expect(normaliserVolume(null)).toBe(100);
    expect(normaliserVolume('', 60)).toBe(60);
    expect(normaliserVolume('70')).toBe(70);
    expect(normaliserVolume(33, 100, 1)).toBe(33);
  });
});

describe('tampons de la partie', () => {
  const reference = JSON.parse(readFileSync('tests/unit/helpers/sons-partie-empreintes.json', 'utf8'));
  it('empreintes SHA-256 identiques à la base du lot pour chaque tampon (toutes les versions de chaque son de data/game/sounds.json)', () => {
    expect(Object.keys(empreintes).length).toBe(Object.keys(reference).length);
    expect(Object.keys(empreintes).length).toBeGreaterThanOrEqual(180);
    for (const [nom, sha] of Object.entries(reference)) expect(empreintes[nom], nom).toBe(sha);
  });
  it('le module audio de la partie applique la même loi (sourdine, n / 100) à ses deux gains généraux, la mélodie d\'annonce dans la musique, sans module du menu', () => {
    const src = readFileSync('js/game/audio.js', 'utf8');
    expect(src).toContain('const masterGain = () => (muted ? 0 : config.audio.masterGain * (volume / 100));');
    expect(src).toContain('const musicGain = () => (muted ? 0 : config.audio.masterGain * (musicVolume / 100));');
    // Même loi que gainsVolumes, à tous les pas (le gain de data/game/audio.json en facteur).
    const k = JSON.parse(readFileSync('data/game/audio.json', 'utf8')).masterGain;
    for (const coupe of [false, true]) {
      for (let n = 0; n <= 100; n += 10) {
        const g = gainsVolumes({ coupe, jeu: n, musique: 100 - n });
        expect(k * g.effets).toBeCloseTo(coupe ? 0 : k * (n / 100), 12);
        expect(k * g.musique).toBeCloseTo(coupe ? 0 : k * ((100 - n) / 100), 12);
      }
    }
    expect(src).toMatch(/const MUSIQUE = 'annonce'/);
    expect(src).toMatch(/r\.category === MUSIQUE \? compressorMusique : compressor/);
    // Aucun module de synthèse du menu dans la partie.
    expect(src).not.toMatch(/^import .*(menu\/sons\/|sons-menu)/m);
  });
});
