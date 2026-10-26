import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { DEFAULT_FOV, DEFAULT_TILT, TILTS, cameraPosition, fitDistance, groundView, parseTilt, parseZoom, ZOOMS, projectGround } from '../../js/core/viewport.js';

const room = JSON.parse(readFileSync('data/game/room.json', 'utf8'));
const WINDOWS = [[375, 667], [667, 375], [768, 1024], [1440, 900], [1920, 1080], [2560, 1080], [800, 1200], [100, 100]];
const rad = (d) => (d * Math.PI) / 180;

// Oracle indépendant de viewport.js : projection par un vrai repère de caméra (vecteurs), sans les formules fermées.
function project(point, camera, target, fov, aspect) {
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const unit = (a) => a.map((v) => v / Math.hypot(...a));
  const forward = unit(sub(target, camera));
  const right = unit(cross(forward, [0, 0, -1]));
  const up = cross(right, forward);
  const v = sub(point, camera);
  const depth = dot(v, forward);
  const t = Math.tan(rad(fov) / 2);
  return { depth, x: dot(v, right) / (depth * t * aspect), y: dot(v, up) / (depth * t) };
}

function roomVisible(w, h, tilt) {
  const aspect = w / h;
  const d = fitDistance(aspect, room, tilt, DEFAULT_FOV);
  const c = cameraPosition({ x: room.width / 2, y: room.height / 2 }, d, tilt);
  const corners = [[0, 0], [room.width, 0], [0, room.height], [room.width, room.height]];
  return corners.map(([x, z]) => project([x, 0, z], [c.x, c.y, c.z], [room.width / 2, 0, room.height / 2], DEFAULT_FOV, aspect));
}

describe('viewport.js : toute la salle est visible', () => {
  for (const tilt of TILTS) {
    it.each(WINDOWS)(`inclinaison ${tilt}°, fenêtre %i×%i : les quatre coins de la salle sont à l'écran`, (w, h) => {
      for (const p of roomVisible(w, h, tilt)) {
        expect(p.depth).toBeGreaterThan(0);
        expect(Math.abs(p.x)).toBeLessThanOrEqual(1 + 1e-9);
        expect(Math.abs(p.y)).toBeLessThanOrEqual(1 + 1e-9);
      }
    });
  }

  it('la marge de 5 % est réelle : le plus proche bord est à 1/1,05 du bord de l\'écran au plus', () => {
    const pts = roomVisible(1440, 900, 90);
    const worst = Math.max(...pts.flatMap((p) => [Math.abs(p.x), Math.abs(p.y)]));
    expect(worst).toBeCloseTo(1 / 1.05, 6);
  });

  it('la distance est exacte : un peu moins ferait sortir un coin de l\'écran', () => {
    for (const [w, h] of [[1440, 900], [667, 375], [800, 1200]]) {
      const aspect = w / h;
      const d = fitDistance(aspect, room, 75, DEFAULT_FOV) * 0.97;
      const c = cameraPosition({ x: room.width / 2, y: room.height / 2 }, d, 75);
      const out = [[0, 0], [room.width, 0], [0, room.height], [room.width, room.height]].some(([x, z]) => {
        const p = project([x, 0, z], [c.x, c.y, c.z], [room.width / 2, 0, room.height / 2], DEFAULT_FOV, aspect);
        return Math.abs(p.x) > 1 / 1.05 + 1e-9 || Math.abs(p.y) > 1 / 1.05 + 1e-9;
      });
      expect(out).toBe(true);
    }
  });

  it('projectGround est d\'accord avec l\'oracle', () => {
    const aspect = 1440 / 900;
    const d = fitDistance(aspect, room, 60, DEFAULT_FOV);
    const c = cameraPosition({ x: 0, y: 0 }, d, 60);
    for (const [dx, dz] of [[300, 200], [-700, -400], [800, 450]]) {
      const mine = projectGround(dx, dz, d, 60, DEFAULT_FOV, aspect);
      const ref = project([dx, 0, dz], [c.x, c.y, c.z], [0, 0, 0], DEFAULT_FOV, aspect);
      expect(mine.x).toBeCloseTo(ref.x, 9);
      expect(mine.y).toBeCloseTo(ref.y, 9);
    }
  });
});

describe('viewport.js : fitDistance', () => {
  it('croît quand la fenêtre est plus étroite (largeur décroissante, hauteur fixe)', () => {
    for (const tilt of TILTS) {
      let previous = 0;
      for (const aspect of [3, 2.4, 1.78, 1.33, 1, 0.75, 0.56]) {
        const d = fitDistance(aspect, room, tilt, DEFAULT_FOV);
        expect(d).toBeGreaterThanOrEqual(previous);
        previous = d;
      }
    }
  });

  it('une salle plus grande demande une distance plus grande', () => {
    expect(fitDistance(1.6, { width: 3200, height: 1800 }, 75, DEFAULT_FOV)).toBeGreaterThan(fitDistance(1.6, room, 75, DEFAULT_FOV));
  });

  it('une marge plus grande éloigne la caméra', () => {
    expect(fitDistance(1.6, room, 75, DEFAULT_FOV, 0.2)).toBeGreaterThan(fitDistance(1.6, room, 75, DEFAULT_FOV, 0.05));
  });

  it('pour la vue strictement verticale, la formule est celle du cône', () => {
    const t = Math.tan(rad(DEFAULT_FOV) / 2);
    expect(fitDistance(2, { width: 1000, height: 100 }, 90, DEFAULT_FOV, 0)).toBeCloseTo(500 / (t * 2), 6);
    expect(fitDistance(0.5, { width: 100, height: 1000 }, 90, DEFAULT_FOV, 0)).toBeCloseTo(500 / t, 6);
  });
});

describe('viewport.js : inclinaisons 60, 75 et 90', () => {
  it('autorise exactement 60, 75 et 90 ; toute autre valeur donne l\'inclinaison par défaut', () => {
    expect(TILTS).toEqual([60, 75, 90]);
    expect(DEFAULT_TILT).toBe(75);
    for (const ok of ['60', '75', '90']) expect(parseTilt(ok)).toBe(Number(ok));
    for (const bad of [null, undefined, '', '45', '0', '100', '75.0', 'abc', '-75', '075', 75, NaN]) expect(parseTilt(bad)).toBe(75);
    expect(parseTilt('45', 60)).toBe(60);
  });

  it('la caméra est au sud de la cible, plus haute à 90° et plus basse à 60°', () => {
    const target = { x: 800, y: 450 };
    const [p60, p75, p90] = TILTS.map((tilt) => cameraPosition(target, 1000, tilt));
    expect(p90.z).toBeCloseTo(450, 6);
    expect(p90.y).toBeCloseTo(1000, 6);
    expect(p60.z).toBeGreaterThan(p75.z);
    expect(p75.z).toBeGreaterThan(p90.z);
    expect(p60.y).toBeLessThan(p75.y);
    expect(p75.y).toBeLessThan(p90.y);
    for (const p of [p60, p75, p90]) {
      expect(p.x).toBe(800);
      expect(Math.hypot(p.y, p.z - 450)).toBeCloseTo(1000, 6);
    }
  });

  it('plus la vue est basse, plus elle montre de profondeur au sol', () => {
    const [a60, a75, a90] = TILTS.map((tilt) => groundView(1.6, 1500, tilt, DEFAULT_FOV));
    expect(a60.height).toBeGreaterThan(a75.height);
    expect(a75.height).toBeGreaterThan(a90.height);
    expect(a60.width).toBeCloseTo(a90.width, 9);
  });

  it('groundView : vue verticale = rectangle exact du cône', () => {
    const t = Math.tan(rad(DEFAULT_FOV) / 2);
    const v = groundView(2, 1000, 90, DEFAULT_FOV);
    expect(v.width).toBeCloseTo(4000 * t, 6);
    expect(v.height).toBeCloseTo(2000 * t, 6);
    expect(v.north).toBeCloseTo(v.south, 9);
  });

  it('groundView à la distance d\'ajustement couvre la salle (profondeur) dans toutes les fenêtres', () => {
    for (const tilt of TILTS) {
      for (const [w, h] of WINDOWS) {
        const d = fitDistance(w / h, room, tilt, DEFAULT_FOV);
        const v = groundView(w / h, d, tilt, DEFAULT_FOV);
        expect(v.north).toBeGreaterThanOrEqual((room.height / 2) * 1.05 - 1e-6);
        expect(v.south).toBeGreaterThanOrEqual((room.height / 2) * 1.05 - 1e-6);
      }
    }
  });
});

describe('viewport.js : propriétés sur une grille de tailles', () => {
  it('toute la salle est visible, la distance est finie et positive, la vue couvre la salle', () => {
    for (let w = 100; w <= 3000; w += 190) {
      for (let h = 100; h <= 2000; h += 170) {
        for (const tilt of TILTS) {
          const d = fitDistance(w / h, room, tilt, DEFAULT_FOV);
          expect(Number.isFinite(d) && d > 0).toBe(true);
          for (const p of roomVisible(w, h, tilt)) {
            expect(Math.abs(p.x)).toBeLessThanOrEqual(1 + 1e-9);
            expect(Math.abs(p.y)).toBeLessThanOrEqual(1 + 1e-9);
          }
        }
      }
    }
  });
});

describe('viewport.js : entrées hostiles', () => {
  const bad = [null, undefined, NaN, Infinity, -Infinity, -5, 0, 'x', {}, [], () => 1];

  it.each(bad)('fitDistance(%s) renvoie un nombre fini', (v) => {
    for (const d of [fitDistance(v, v, v, v), fitDistance(1, v, 75, 40), fitDistance(1, { width: v, height: v }, v, v, v)]) expect(Number.isFinite(d)).toBe(true);
  });

  it.each(bad)('groundView(%s) et cameraPosition(%s) renvoient des nombres', (v) => {
    const g = groundView(v, v, v, v);
    expect([g.width, g.height].every(Number.isFinite)).toBe(true);
    const p = cameraPosition(v, v, v);
    expect([p.x, p.y, p.z].every(Number.isFinite)).toBe(true);
  });

  it('ne modifie pas ses arguments', () => {
    const frozen = Object.freeze({ width: 1600, height: 900 });
    expect(() => fitDistance(1.6, frozen, 75, 40)).not.toThrow();
    expect(frozen).toEqual({ width: 1600, height: 900 });
  });
});

describe('viewport.js : ?zoom=', () => {
  it('autorise 1, 1,25 et 1,5 ; toute autre valeur donne 1', () => {
    expect(ZOOMS).toEqual([1, 1.25, 1.5]);
    expect([parseZoom('1'), parseZoom('1.25'), parseZoom('1.5')]).toEqual([1, 1.25, 1.5]);
    for (const bad of [null, undefined, '', '2', '0', '1.3', 'x', '-1', 1.5, NaN]) expect(parseZoom(bad)).toBe(1);
  });
});
