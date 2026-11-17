// Lot 9c-G (retours du propriétaire : « adapter les bras et les mains du perso pour tenir les armes ») — Tenue d'une arme dans l'atelier :
// buste tourné selon le genre de tenue, arme placée dans le repère du personnage, bras calculés (cinématique inverse à deux os) pour poser
// la main droite sur la poignée et la main gauche sur sa prise. AUCUN fichier du personnage n'est modifié : les rotations sont posées sur
// les os d'un personnage de l'atelier après sa pose « repos ». Aperçu pour le lot d'intégration (poses à reporter dans pose-v2).
import * as THREE from 'three';

// Réglages par tenue : rotation du buste (bassin → colonne et poitrine, radians ; négatif = épaule gauche vers l'avant), tête ramenée
// vers l'avant, position de l'arme (x, y du repère du personnage) et inclinaison (x, radians ; négatif = bouche vers le haut).
export const TENUES = Object.freeze({
  poing: { buste: 0, x: -1.5, y: 40, z: 12, inclinaison: 0 },
  epaule: { buste: -0.9, x: null, y: null, inclinaison: 0 },
  hanche: { buste: -0.6, x: -3, y: 36, inclinaison: -0.06 },
  tube: { buste: -0.9, x: null, y: null, inclinaison: 0 },
});
const POLE = { R: new THREE.Vector3(-0.7, -1, -0.35), L: new THREE.Vector3(0.7, -1, -0.35) };
const PAUME = 1.8; // centre de la paume sous le poignet (pièce handL/handR du personnage)
const v3 = (a) => new THREE.Vector3(a[0], a[1], a[2]);

function os(root) {
  const g = (n) => root.getObjectByName(n);
  return { spine: g('spine'), chest: g('chest'), neck: g('neck'), head: g('head'), R: [g('shoulderR'), g('elbowR'), g('wristR')], L: [g('shoulderL'), g('elbowL'), g('wristL')] };
}

// Cinématique inverse d'un bras : épaule, coude, poignet ; cible (repère monde) = centre de la paume. Renvoie l'écart restant (unités).
function bras([epaule, coude, poignet], cible, pole) {
  epaule.parent.updateMatrixWorld(true);
  const S = epaule.getWorldPosition(new THREE.Vector3());
  const L1 = coude.position.length();
  const L2 = poignet.position.length() + PAUME;
  const vers = cible.clone().sub(S);
  const dist = Math.min(L1 + L2 - 1e-3, Math.max(Math.abs(L1 - L2) + 1e-3, vers.length()));
  const dir = vers.clone().normalize();
  const a = (L1 * L1 - L2 * L2 + dist * dist) / (2 * dist);
  const h = Math.sqrt(Math.max(0, L1 * L1 - a * a));
  const p = pole.clone().sub(dir.clone().multiplyScalar(pole.dot(dir))).normalize();
  const E = S.clone().add(dir.clone().multiplyScalar(a)).add(p.multiplyScalar(h));
  const W = S.clone().add(dir.clone().multiplyScalar(dist));
  const u = E.clone().sub(S).normalize();
  const f = W.clone().sub(E).normalize();
  // Repère de l'épaule : l'os pend selon −y ; l'avant-bras plie dans le plan (y, z) local, vers +z (rotation du coude autour de x, négative).
  const Y = u.clone().negate();
  let Z = f.clone().sub(u.clone().multiplyScalar(f.dot(u)));
  if (Z.lengthSq() < 1e-8) Z = pole.clone().cross(u).cross(u).negate();
  Z.normalize();
  const X = new THREE.Vector3().crossVectors(Y, Z);
  const monde = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(X, Y, Z));
  const parent = epaule.parent.getWorldQuaternion(new THREE.Quaternion());
  epaule.quaternion.copy(parent.invert().multiply(monde));
  coude.rotation.set(-Math.acos(Math.max(-1, Math.min(1, u.dot(f)))), 0, 0);
  poignet.rotation.set(0, 0, 0);
  return vers.length() - dist;
}

// Pose la tenue. perso : personnage de createV2Kit (après setAnim('repos')) ; arme : données (prises) ; s : unités par mm ; objet : maillage de
// l'arme (ajouté au repère du personnage). Renvoie { tenue, ecarts: { droite, gauche }, position, dos (mm, repère de l'arme : réservoirs),
// lacet (degrés : rotation des réservoirs avec le buste) }.
export function poserTenue(perso, arme, s, objet) {
  const prises = arme.prises ?? { tenue: 'poing' };
  const t = TENUES[prises.tenue] ?? TENUES.poing;
  const o = os(perso.root);
  perso.root.updateMatrixWorld(true);
  o.spine.rotation.y += t.buste / 2;
  o.chest.rotation.y += t.buste / 2;
  if (o.neck) o.neck.rotation.y -= t.buste / 2; // le regard reste dans l'axe de l'arme
  if (o.head) o.head.rotation.y -= t.buste / 2;
  perso.root.updateMatrixWorld(true);
  const local = (v) => perso.root.worldToLocal(v.clone());
  const epauleR = local(o.R[0].getWorldPosition(new THREE.Vector3()));
  const epauleL = local(o.L[0].getWorldPosition(new THREE.Vector3()));
  const rot = new THREE.Euler(t.inclinaison, 0, 0);
  const versMonde = (mm) => v3(mm).multiplyScalar(s).applyEuler(rot);
  const G = prises.gauche ? versMonde(prises.gauche) : new THREE.Vector3(2.4, -0.6, 0.8);
  const R = 0.96 * (o.R[1].position.length() + o.R[2].position.length() + PAUME);
  const ok = (P) => P.distanceTo(epauleR) <= R && P.clone().add(G).distanceTo(epauleL) <= R;
  const P = new THREE.Vector3();
  if (prises.tenue === 'poing') P.set(t.x, t.y, t.z);
  else if (prises.tenue === 'epaule' || prises.tenue === 'tube') {
    // Appui : crosse au creux de l'épaule droite, ou tube posé sur l'épaule ; on recule l'arme tant qu'une main ne l'atteint pas.
    const A = versMonde(prises.appui ?? [0, -40, -400]);
    const creux = epauleR.clone().add(prises.tenue === 'tube' ? new THREE.Vector3(1.5, 4.5, 0) : new THREE.Vector3(2.5, -2.5, 3.5));
    P.copy(creux).sub(A);
    for (let i = 0; i < 80 && !ok(P); i += 1) P.z -= 0.5;
  } else {
    P.set(t.x, t.y, 22);
    for (let i = 0; i < 80 && !ok(P); i += 1) P.z -= 0.5;
  }
  objet.position.copy(P);
  objet.rotation.copy(rot);
  perso.root.add(objet);
  perso.root.updateMatrixWorld(true);
  const monde = (v) => perso.root.localToWorld(v.clone());
  const droite = bras(o.R, monde(P), POLE.R);
  const gauche = bras(o.L, monde(P.clone().add(G)), POLE.L);
  perso.root.updateMatrixWorld(true);
  // Réservoirs (lance-flammes) : sur le dos, tournés avec le buste ; décalage rendu dans le repère de l'arme, en mm.
  const dosPerso = new THREE.Vector3(0, 2, -14.5).applyAxisAngle(new THREE.Vector3(0, 1, 0), t.buste).add(new THREE.Vector3(0, 40, 0));
  const dos = dosPerso.clone().sub(P).applyEuler(new THREE.Euler(-t.inclinaison, 0, 0)).divideScalar(s);
  return { tenue: prises.tenue, ecarts: { droite, gauche }, position: P.toArray(), dos: dos.toArray().map((x) => Math.round(x)), lacet: Math.round((t.buste * 180) / Math.PI) };
}
