import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';

const load = (name) => JSON.parse(readFileSync(`data/game/${name}.json`, 'utf8'));
// Lot 1b : l'ancien room.json est la section « legacy » de world.json (salle du lot 1m, chargée par ?empty=1).
const room = load('world').legacy;
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
    expect(weapon).toMatchObject({ damage: 25, fireDelay: 0.4, laserRange: 300, bulletSpeed: 1100, bulletRadius: 4, fireRange: 1600, bulletMaxDistance: 1600, muzzleFlash: 0.08, maxBullets: 30 });
    expect(zombie).toMatchObject({ radius: 20, speed: 70, health: 50, contactDamage: 10, contactDelay: 1, maxPresent: 8, spawnInterval: 2.5 });
  });

  it('la balle porte aussi loin que le tir se déclenche, et le tir porte plus loin que le laser', () => {
    expect(weapon.bulletMaxDistance).toBe(weapon.fireRange);
    expect(weapon.fireRange).toBeGreaterThan(weapon.laserRange);
    expect(weapon.laserRange).toBe(300); // réduit au lot 1m : la vue proche ne montre pas plus loin
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

  it('render.json : valeurs de rendu cohérentes (murs de 90 au plus, caméra de 40°, inclinaison de 75° par défaut, 2 % de marge)', () => {
    const render = load('render');
    expect(render.wallHeight).toBeLessThanOrEqual(90);
    expect(render.wallThickness).toBe(40);
    expect(render.sillHeight).toBeLessThan(render.lintelBottom);
    expect(render.lintelBottom).toBeLessThan(render.wallHeight);
    expect(render.camera).toMatchObject({ fov: 40, tilt: 75, margin: 0.02, zoom: 2 });
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
