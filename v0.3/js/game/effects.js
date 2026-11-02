// Effets visibles : laser, balles (pool fixe) avec traînée, flash de bouche, étincelles d'impact. Géométries et matériaux partagés,
// aucun objet créé à l'image. Le laser ne sert qu'à viser : il n'a aucun effet sur la logique.
import * as THREE from 'three';

export const MAX_BULLET_MESHES = 30;
export const MAX_SPARKS = 12;
export const SPARK_TIME = 0.18;
const FADE_START = 0.65; // le laser s'estompe sur le dernier tiers quand il s'arrête à la portée
const ANGLE_TO_YAW = Math.PI / 2;

const basic = (color, extra = {}) => new THREE.MeshBasicMaterial({ color, fog: false, ...extra });

export function createEffects(scene, palette, { gunHeight, bulletRadius }) {
  const box = new THREE.BoxGeometry(1, 1, 1);
  const ball = new THREE.SphereGeometry(1, 10, 8);
  // Laser : ruban posé à plat (largeur en pixels écran constante). Version pleine (arrêté par un ennemi ou un mur) et version qui
  // s'estompe vers le bout (arrêtée par la portée) : une texture de dégradé sert de masque de transparence.
  const ribbon = new THREE.PlaneGeometry(1, 1);
  ribbon.rotateX(-Math.PI / 2);
  ribbon.translate(0.5, 0, 0);
  const fadeData = new Uint8Array(256 * 4);
  for (let i = 0; i < 256; i += 1) {
    const t = i / 255;
    const k = t < FADE_START ? 1 : (1 - (t - FADE_START) / (1 - FADE_START)) ** 1.5;
    fadeData.fill(Math.round(k * 255), i * 4, i * 4 + 4);
  }
  const fadeMap = new THREE.DataTexture(fadeData, 256, 1);
  fadeMap.wrapS = THREE.ClampToEdgeWrapping;
  fadeMap.magFilter = THREE.LinearFilter;
  fadeMap.minFilter = THREE.LinearFilter;
  fadeMap.needsUpdate = true;
  const laserMat = basic(palette.laser);
  const glowMat = basic(palette.laser, { transparent: true, opacity: 0.22, depthWrite: false });
  const laserFadeMat = basic(palette.laser, { transparent: true, alphaMap: fadeMap, depthWrite: false });
  const glowFadeMat = basic(palette.laser, { transparent: true, opacity: 0.22, alphaMap: fadeMap, depthWrite: false });
  // Transparentes et rangées après le halo du laser : une balle en vol se détache toujours du trait.
  const bulletMat = basic(palette.bullet, { transparent: true });
  const trailMat = basic(palette.bullet, { transparent: true, opacity: 0.45, depthWrite: false });
  const ORDER = { glow: 1, trail: 2, head: 3 };
  const muzzleMat = basic(palette.muzzle);
  const hitMat = basic(palette.hit);

  const laserHeight = gunHeight - 1.5;
  const make = (geometry, material, visible = false) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.visible = visible;
    scene.add(mesh);
    return mesh;
  };
  const laser = make(ribbon, laserMat);
  const glow = make(ribbon, glowMat);
  const laserFade = make(ribbon, laserFadeMat);
  const glowFade = make(ribbon, glowFadeMat);
  glow.renderOrder = ORDER.glow;
  glowFade.renderOrder = ORDER.glow;
  laserFade.renderOrder = ORDER.glow;
  // Cône de tir : deux lignes ténues (même ruban et même matériau que le halo du laser, opacité 0,22) à ± le demi-angle lissé.
  const coneLines = [make(ribbon, glowMat), make(ribbon, glowMat)];
  for (const line of coneLines) line.renderOrder = ORDER.glow;
  const dot = make(ball, laserMat);
  const flashOuter = make(ball, muzzleMat);
  const flashCore = make(ball, hitMat);
  const bullets = Array.from({ length: MAX_BULLET_MESHES }, () => {
    const slot = { head: make(box, bulletMat), trail: make(box, trailMat) };
    slot.head.renderOrder = ORDER.head;
    slot.trail.renderOrder = ORDER.trail;
    return slot;
  });
  const sparks = Array.from({ length: MAX_SPARKS }, () => make(ball, hitMat));

  // Pose un ruban à plat de (ax, ay) à (bx, by), à hauteur y, de largeur width.
  function strip(mesh, ax, ay, bx, by, y, width) {
    mesh.position.set(ax, y, ay);
    mesh.rotation.y = -Math.atan2(by - ay, bx - ax);
    mesh.scale.set(Math.max(0.01, Math.hypot(bx - ax, by - ay)), 1, width);
    mesh.visible = true;
  }

  // Pose un trait entre deux points du plan de jeu, à hauteur y, d'épaisseur thick.
  function segment(mesh, ax, ay, bx, by, y, thick) {
    const len = Math.max(0.01, Math.hypot(bx - ax, by - ay));
    mesh.position.set((ax + bx) / 2, y, (ay + by) / 2);
    mesh.rotation.y = ANGLE_TO_YAW - Math.atan2(by - ay, bx - ax);
    mesh.scale.set(thick, thick, len);
    mesh.visible = true;
  }

  return {
    // frame : { laser: { from, ray } | null, bullets, sparks: [{ x, y, age }], flash (secondes restantes), flashSize, unitsPerPixel }
    update(frame) {
      const upp = Math.max(1e-3, frame.unitsPerPixel);
      if (frame.laser) {
        const { from, ray } = frame.laser;
        const thick = Math.max(1.2, 2 * upp);
        // Arrêté par un ennemi, un meuble ou un mur : trait plein et point ; arrêté par la portée : le trait s'estompe, sans point.
        const faded = !ray.hit && !ray.stoppedByWall && !ray.stoppedBy;
        const [line, halo, offLine, offHalo] = faded ? [laserFade, glowFade, laser, glow] : [laser, glow, laserFade, glowFade];
        strip(line, from.x, from.y, ray.end.x, ray.end.y, laserHeight, thick);
        strip(halo, from.x, from.y, ray.end.x, ray.end.y, laserHeight, thick * 2.6);
        offLine.visible = false;
        offHalo.visible = false;
        // Cône : de l'arme, ± le demi-angle de l'axe, sur la longueur du laser effectif (pas arrêtées par les obstacles : repère de dispersion).
        const cone = frame.laser.cone;
        for (let i = 0; i < 2; i += 1) {
          if (!cone) {
            coneLines[i].visible = false;
            continue;
          }
          const a = cone.angle + (i === 0 ? -cone.half : cone.half);
          strip(coneLines[i], from.x, from.y, from.x + Math.cos(a) * cone.length, from.y + Math.sin(a) * cone.length, laserHeight, thick);
        }
        dot.position.set(ray.end.x, laserHeight, ray.end.y);
        dot.scale.setScalar(Math.max(ray.hit ? 3.2 : 2, (ray.hit ? 3.5 : 2.5) * upp));
        dot.visible = !faded;
        const flashing = frame.flash > 0;
        flashOuter.visible = flashing;
        flashCore.visible = flashing;
        if (flashing) {
          flashOuter.position.set(from.x, gunHeight, from.y);
          flashCore.position.copy(flashOuter.position);
          flashOuter.scale.setScalar(frame.flashSize);
          flashCore.scale.setScalar(frame.flashSize * 0.45);
        }
      } else {
        for (const mesh of [laser, glow, laserFade, glowFade, dot, ...coneLines]) mesh.visible = false;
        flashOuter.visible = false;
        flashCore.visible = false;
      }

      const thick = Math.max(bulletRadius * 1.2, 3.5 * upp);
      for (let i = 0; i < bullets.length; i += 1) {
        const b = frame.bullets[i];
        const slot = bullets[i];
        if (!b) {
          slot.head.visible = false;
          slot.trail.visible = false;
          continue;
        }
        const len = bulletRadius * 5;
        segment(slot.head, b.x - b.dirX * len, b.y - b.dirY * len, b.x, b.y, gunHeight, thick);
        const tail = b.trail.length > 0 ? b.trail[b.trail.length - 1] : null;
        if (tail) segment(slot.trail, tail.x, tail.y, b.x - b.dirX * len, b.y - b.dirY * len, gunHeight, thick * 0.6);
        else slot.trail.visible = false;
      }

      for (let i = 0; i < sparks.length; i += 1) {
        const s = frame.sparks[i];
        if (!s) {
          sparks[i].visible = false;
          continue;
        }
        sparks[i].position.set(s.x, gunHeight, s.y);
        sparks[i].scale.setScalar(Math.max(1, (7 - 5 * (s.age / SPARK_TIME)) * Math.max(1, upp * 0.8)));
        sparks[i].visible = true;
      }
    },
  };
}
