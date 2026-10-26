import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';

const load = (name) => JSON.parse(readFileSync(`data/game/${name}.json`, 'utf8'));
const room = load('room');
const player = load('player');
const weapon = load('weapons').pistol;
const zombie = load('enemies').zombie;

describe('data/game/*.json', () => {
  it('chaque fichier est marqué provisoire', () => {
    for (const f of readdirSync('data/game')) expect(JSON.parse(readFileSync(`data/game/${f}`, 'utf8'))._provisoire, f).toBeTruthy();
  });

  it('contient les valeurs de départ de la spécification', () => {
    expect([room.width, room.height, room.margin]).toEqual([1600, 900, 600]);
    expect(player).toMatchObject({ radius: 18, speed: 220, health: 100 });
    expect(weapon).toMatchObject({ damage: 25, fireDelay: 0.4, laserRange: 700, bulletSpeed: 1100, bulletRadius: 4, bulletMaxDistance: 700, muzzleFlash: 0.08, maxBullets: 30 });
    expect(zombie).toMatchObject({ radius: 20, speed: 70, health: 50, contactDamage: 10, contactDelay: 1, maxPresent: 5, spawnInterval: 3 });
  });

  it('la portée de la balle égale celle du laser', () => {
    expect(weapon.bulletMaxDistance).toBe(weapon.laserRange);
  });

  it('a trois ouvertures de fenêtre sur les murs', () => {
    expect(room.windows).toHaveLength(3);
    for (const w of room.windows) {
      expect(w.x).toBeGreaterThanOrEqual(0);
      expect(w.x).toBeLessThanOrEqual(room.width);
      expect(w.y).toBeGreaterThanOrEqual(0);
      expect(w.y).toBeLessThanOrEqual(room.height);
      const onWall = w.x <= room.wall || w.x >= room.width - room.wall || w.y <= room.wall || w.y >= room.height - room.wall;
      expect(onWall).toBe(true);
    }
  });

  it('render.json : valeurs de rendu cohérentes (murs de 90 au plus, caméra de 40°, inclinaison de 75° par défaut)', () => {
    const render = load('render');
    expect(render.wallHeight).toBeLessThanOrEqual(90);
    expect(render.wallThickness).toBe(40);
    expect(render.sillHeight).toBeLessThan(render.lintelBottom);
    expect(render.lintelBottom).toBeLessThan(render.wallHeight);
    expect(render.camera).toMatchObject({ fov: 40, tilt: 75, margin: 0.05 });
    expect(render.light.shadowMap).toBe(1024);
  });

  it('ne contient que des nombres positifs (hors textes de marquage)', () => {
    const check = (obj) => {
      for (const [k, v] of Object.entries(obj)) {
        if (k.startsWith('_')) continue;
        if (Array.isArray(v)) v.forEach(check);
        else if (typeof v === 'object') check(v);
        else {
          expect(typeof v, k).toBe('number');
          expect(v, k).toBeGreaterThan(0);
        }
      }
    };
    [room, player, load('weapons'), load('enemies')].forEach(check);
  });

  it('la salle tient dans son décor et le joueur dans la salle', () => {
    expect(player.radius * 2).toBeLessThan(room.height - 2 * room.wall);
    expect(room.margin).toBeGreaterThan(0);
  });
});
