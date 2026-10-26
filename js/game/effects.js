// Effets visibles : laser, balles (pool fixe) avec traînée, flash de bouche, étincelles d'impact. Géométries et matériaux partagés,
// aucun objet créé à l'image. Le laser ne sert qu'à viser : il n'a aucun effet sur la logique.
import * as THREE from 'three';

export const MAX_BULLET_MESHES = 30;
export const MAX_SPARKS = 12;
export const SPARK_TIME = 0.18;
const ANGLE_TO_YAW = Math.PI / 2;

const basic = (color, extra = {}) => new THREE.MeshBasicMaterial({ color, fog: false, ...extra });

export function createEffects(scene, palette, { gunHeight, bulletRadius }) {
  const box = new THREE.BoxGeometry(1, 1, 1);
  const ball = new THREE.SphereGeometry(1, 10, 8);
  const laserMat = basic(palette.laser);
  const glowMat = basic(palette.laser, { transparent: true, opacity: 0.22, depthWrite: false });
  const bulletMat = basic(palette.bullet);
  const trailMat = basic(palette.bullet, { transparent: true, opacity: 0.45, depthWrite: false });
  const muzzleMat = basic(palette.muzzle);
  const hitMat = basic(palette.hit);

  const make = (geometry, material, visible = false) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.visible = visible;
    scene.add(mesh);
    return mesh;
  };
  const laser = make(box, laserMat);
  const glow = make(box, glowMat);
  const dot = make(ball, laserMat);
  const flashOuter = make(ball, muzzleMat);
  const flashCore = make(ball, hitMat);
  const bullets = Array.from({ length: MAX_BULLET_MESHES }, () => ({ head: make(box, bulletMat), trail: make(box, trailMat) }));
  const sparks = Array.from({ length: MAX_SPARKS }, () => make(ball, hitMat));

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
        segment(laser, from.x, from.y, ray.end.x, ray.end.y, gunHeight, thick);
        segment(glow, from.x, from.y, ray.end.x, ray.end.y, gunHeight, thick * 2.6);
        dot.position.set(ray.end.x, gunHeight, ray.end.y);
        dot.scale.setScalar(Math.max(ray.hit ? 3.2 : 2, (ray.hit ? 3.5 : 2.5) * upp));
        dot.visible = true;
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
        laser.visible = false;
        glow.visible = false;
        dot.visible = false;
        flashOuter.visible = false;
        flashCore.visible = false;
      }

      const thick = Math.max(bulletRadius * 0.8, 2.4 * upp);
      for (let i = 0; i < bullets.length; i += 1) {
        const b = frame.bullets[i];
        const slot = bullets[i];
        if (!b) {
          slot.head.visible = false;
          slot.trail.visible = false;
          continue;
        }
        const len = bulletRadius * 4;
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
