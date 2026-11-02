// Visée à la souris : point d'écran -> point du sol (plan y = 0) avec l'API de Three.js. Aucun objet n'est créé à l'appel.
import * as THREE from 'three';

const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const hit = new THREE.Vector3();

// point : { x, y } en pixels CSS dans la fenêtre ; rect : rectangle du canvas. Renvoie { x, y } (plan de jeu) ou null.
export function pickGround(camera, point, rect) {
  if (!point || !(rect.width > 0) || !(rect.height > 0)) return null;
  ndc.set(((point.x - rect.left) / rect.width) * 2 - 1, -((point.y - rect.top) / rect.height) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  return raycaster.ray.intersectPlane(plane, hit) ? { x: hit.x, y: hit.z } : null;
}

const probe = new THREE.Vector3();

// Point de la scène (x, hauteur, z du jeu = y logique) -> pixels CSS { x, y } dans un rectangle { width, height } (0 haut gauche) (un petit objet par appel).
export function screenPoint(camera, x, height, z, size) {
  probe.set(x, height, z).project(camera);
  return { x: ((probe.x + 1) / 2) * size.width, y: ((1 - probe.y) / 2) * size.height };
}
