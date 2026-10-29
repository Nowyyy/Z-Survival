import { describe, it, expect } from 'vitest';
import { fogGrid, fogOpacity } from '../../js/core/fog.js';
import { layout } from './helpers/carte.js';
import { readFileSync } from 'node:fs';

const render = JSON.parse(readFileSync('data/game/render.json', 'utf8'));
const f = render.fog;
const area = { x: -f.wallPad, y: -f.wallPad, w: layout.size.width + 2 * f.wallPad, h: layout.size.height + 2 * f.wallPad };

describe('fog.js : mur de brouillard (lot 3b)', () => {
  it('opacité nulle jusqu\'à near, 1 à partir de far, croissante entre les deux', () => {
    expect(fogOpacity(0, 100, 300)).toBe(0);
    expect(fogOpacity(100, 100, 300)).toBe(0);
    expect(fogOpacity(300, 100, 300)).toBe(1);
    expect(fogOpacity(1000, 100, 300)).toBe(1);
    let last = 0;
    for (let d = 100; d <= 300; d += 20) {
      expect(fogOpacity(d, 100, 300)).toBeGreaterThanOrEqual(last);
      last = fogOpacity(d, 100, 300);
    }
  });

  it('entrées hostiles : aucune exception, opaque sans bâtiment valide', () => {
    for (const bad of [undefined, null, NaN, 'x', {}, [], [null]]) {
      expect(() => fogOpacity(bad, bad, bad)).not.toThrow();
      expect(() => fogGrid(bad, bad, bad, bad, bad)).not.toThrow();
    }
    expect(fogGrid([], { x: 0, y: 0, w: 200, h: 200 }, 10, 50).data.every((v) => v === 255)).toBe(true);
  });

  it('carte : transparente dans le bâtiment et près des murs, opaque loin ; les apparitions (450 et 650 du mur) sont dans la brume', () => {
    const g = fogGrid(layout.floor, area, f.wallNear, f.wallFar, f.wallCell);
    const at = (x, y) => g.data[Math.floor((y - area.y) / (area.h / g.rows)) * g.cols + Math.floor((x - area.x) / (area.w / g.cols))];
    expect(at(layout.start.x, layout.start.y)).toBe(0);
    expect(at(area.x + 10, area.y + 10)).toBe(255);
    for (const w of layout.windows) {
      const n = { nord: [0, -1], sud: [0, 1], est: [1, 0], ouest: [-1, 0] }[w.side];
      expect(at(w.x + n[0] * 60, w.y + n[1] * 60), `${w.id} près du mur`).toBeLessThan(10);
    }
    for (const p of layout.spawnPoints) expect(at(p.x, p.y), p.id).toBeGreaterThan(100);
  });

  it('ne modifie pas ses arguments et reste déterministe', () => {
    const floor = JSON.parse(JSON.stringify(layout.floor));
    const a = fogGrid(floor, area, f.wallNear, f.wallFar, f.wallCell);
    const b = fogGrid(floor, area, f.wallNear, f.wallFar, f.wallCell);
    expect(floor).toEqual(layout.floor);
    expect(Array.from(a.data)).toEqual(Array.from(b.data));
  });
});
