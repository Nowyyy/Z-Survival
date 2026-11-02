// Textures générées en code (aucun fichier image). Dessinées à TS fois la taille affichée pour rester nettes sous zoom.
export const TS = 2;

function bake(scene, key, width, height, draw) {
  const g = scene.make.graphics({ x: 0, y: 0, add: false });
  draw(g);
  g.generateTexture(key, width, height);
  g.destroy();
}

// Disque irrégulier déterministe (le zombie), centré en (cx, cy).
function blob(g, cx, cy, radius, points) {
  const pts = [];
  for (let i = 0; i < points; i += 1) {
    const a = (i / points) * Math.PI * 2;
    const k = 0.86 + 0.14 * Math.sin(i * 2.7 + 1.3) * Math.cos(i * 1.1);
    pts.push({ x: cx + Math.cos(a) * radius * k, y: cy + Math.sin(a) * radius * k });
  }
  g.fillPoints(pts, true);
  return pts;
}

export function makeTextures(scene, palette, cfg) {
  const { room, player, zombie } = cfg;

  const pr = player.radius * TS;
  const ps = Math.ceil(pr * 2 + 8 * TS);
  bake(scene, 'player', ps, ps, (g) => {
    g.fillStyle(palette.dark, 1).fillCircle(ps / 2, ps / 2, pr + 2 * TS);
    g.fillStyle(palette.player, 1).fillCircle(ps / 2, ps / 2, pr);
    g.fillStyle(palette.dark, 0.35).fillCircle(ps / 2 - pr * 0.25, ps / 2, pr * 0.45);
  });

  const gw = Math.ceil(18 * TS);
  const gh = Math.ceil(12 * TS);
  bake(scene, 'gun', gw, gh, (g) => {
    g.fillStyle(palette.dark, 1).fillRect(0, gh * 0.2, gw, gh * 0.6);
    g.fillStyle(palette.border, 1).fillRect(2 * TS, gh * 0.3, gw - 4 * TS, gh * 0.4);
    g.fillStyle(palette.dark, 1).fillRect(0, gh * 0.55, 8 * TS, gh * 0.45);
  });

  if (zombie) {
    const zr = zombie.radius * TS;
    const zs = Math.ceil(zr * 2 + 8 * TS);
    for (const [key, fill] of [['zombie', palette.zombie], ['zombie-hit', palette.hit]]) {
      bake(scene, key, zs, zs, (g) => {
        g.fillStyle(palette.dark, 1);
        blob(g, zs / 2, zs / 2, zr + 2 * TS, 14);
        g.fillStyle(fill, 1);
        blob(g, zs / 2, zs / 2, zr, 14);
        g.fillStyle(palette.dark, 1);
        g.fillCircle(zs / 2 + zr * 0.45, zs / 2 - zr * 0.35, zr * 0.14);
        g.fillCircle(zs / 2 + zr * 0.45, zs / 2 + zr * 0.35, zr * 0.14);
      });
    }
  }

  // Salle : sol quadrillé, quatre murs, trois ouvertures de fenêtre (décor, sans fonction).
  const rw = room.width * TS;
  const rh = room.height * TS;
  const wall = room.wall * TS;
  bake(scene, 'room', rw, rh, (g) => {
    g.fillStyle(palette.floor, 1).fillRect(0, 0, rw, rh);
    g.lineStyle(1 * TS, palette.dark, 0.35);
    for (let x = 100; x < room.width; x += 100) g.lineBetween(x * TS, wall, x * TS, rh - wall);
    for (let y = 100; y < room.height; y += 100) g.lineBetween(wall, y * TS, rw - wall, y * TS);
    g.fillStyle(palette.wall, 1);
    g.fillRect(0, 0, rw, wall).fillRect(0, rh - wall, rw, wall).fillRect(0, 0, wall, rh).fillRect(rw - wall, 0, wall, rh);
    g.lineStyle(2 * TS, palette.dark, 1).strokeRect(wall, wall, rw - 2 * wall, rh - 2 * wall);
    const half = (room.windowSize / 2) * TS;
    for (const w of room.windows) {
      const vertical = w.x < room.wall || w.x > room.width - room.wall;
      const cx = w.x * TS;
      const cy = w.y * TS;
      const x = vertical ? cx - wall / 2 : cx - half;
      const y = vertical ? cy - half : cy - wall / 2;
      const bw = vertical ? wall : half * 2;
      const bh = vertical ? half * 2 : wall;
      g.fillStyle(palette.dark, 1).fillRect(x, y, bw, bh);
      g.lineStyle(2 * TS, palette.border, 1);
      if (vertical) for (let i = 1; i < 4; i += 1) g.lineBetween(x, y + (bh * i) / 4, x + bw, y + (bh * i) / 4);
      else for (let i = 1; i < 6; i += 1) g.lineBetween(x + (bw * i) / 6, y, x + (bw * i) / 6, y + bh);
    }
  });

  // Décor extérieur, dessiné à demi-échelle (aplat avec quelques taches) puis agrandi.
  const total = { w: room.width + 2 * room.margin, h: room.height + 2 * room.margin };
  bake(scene, 'decor', total.w / 2, total.h / 2, (g) => {
    g.fillStyle(palette.ground, 1).fillRect(0, 0, total.w / 2, total.h / 2);
    g.fillStyle(palette.dark, 0.5);
    for (let i = 0; i < 40; i += 1) {
      const x = ((i * 977) % total.w) / 2;
      const y = ((i * 613 + 211) % total.h) / 2;
      g.fillCircle(x, y, 18 + ((i * 29) % 40));
    }
  });
}
