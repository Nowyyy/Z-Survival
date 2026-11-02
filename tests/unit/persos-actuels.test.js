import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { characterStats, expandParts, fkPose } from '../../js/core/character-parts.js';
import { computePose } from '../../js/core/pose.js';
import { fromV1 } from '../../js/core/pose-v2.js';
import { createCharacter, createKit } from '../../js/game/character.js';
import { createRigidCharacter, rigidShared } from '../../js/game/character-v2.js';
import { characters, load, skeletons } from '../../scripts/personnages/lib.mjs';

// Lot 3j-A : la description de data/game/characters-v2.json (current) reproduit à l'identique les personnages de js/game/character.js,
// et le prototype « os rigides » place les sommets exactement où les pièces articulées les placent.
const variants = load('zombie-variants');
const stub = { region: () => ({ u0: 0.1, v0: 0.1, u1: 0.2, v1: 0.2 }), texture: () => new THREE.Texture() };
const kit = createKit({ textures: stub, variants, hit: '#ffffff' });
const make = (slot) => (slot.current.kind === 'player' ? createCharacter(kit, 'player') : createCharacter(kit, 'zombie', slot.current.index));
const meshesOf = (c) => {
  const out = [];
  c.root.traverse((o) => o.isMesh && out.push(o));
  return out;
};
const worldBox = (meshes) => {
  const b = new THREE.Box3();
  const v = new THREE.Vector3();
  for (const m of meshes) {
    m.updateWorldMatrix(true, false);
    const p = m.geometry.attributes.position;
    for (let i = 0; i < p.count; i += 1) b.expandByPoint(v.fromBufferAttribute(p, i).applyMatrix4(m.matrixWorld));
  }
  return b;
};
const STATES = [['repos', {}], ['marche', { phase: 1.1, time: 0.7 }], ['rampe', { state: 'rampe', phase: 2, time: 0.3 }]];
const slots = characters.slots.map((s) => [s.id, s]);
const poseFor = (slot, input) => computePose({ seed: 3, amount: 0.7, ...input, state: input.state ?? (slot.current.kind === 'player' ? 'marche' : 'zombie') });
const traits = (slot) => ({ lean: slot.current.lean, headTilt: slot.current.headTilt, armLift: slot.current.armLift });

describe('description fidèle des personnages actuels', () => {
  it.each(slots)('%s : mêmes pièces et mêmes triangles que js/game/character.js', (_id, slot) => {
    const meshes = meshesOf(make(slot));
    const s = characterStats(slot.current, { architecture: 'articulated', skeletons });
    expect(s.pieces).toBe(meshes.length);
    expect(s.triangles).toBe(meshes.reduce((n, m) => n + m.geometry.attributes.position.count / 3, 0));
    expect(s.casters).toBe(meshes.filter((m) => m.castShadow).length);
  });

  it.each(slots)('%s : échelle, inclinaison et écarts de posture lus dans zombie-variants.json', (_id, slot) => {
    const c = slot.current;
    const src = c.kind === 'player' ? { scale: 1, headTilt: 0, armLift: 0 } : variants.zombie.variants[c.index];
    expect([c.scale, c.headTilt, c.armLift]).toEqual([src.scale, src.headTilt, src.armLift]);
    expect(c.dominant).toBe(c.kind === 'player' ? variants.player.dominant : src.dominant);
    expect(c.lean).toBe(c.kind === 'player' ? 0 : 0.14);
  });

  const posed = slots.flatMap(([id, slot]) => STATES.filter(([s]) => slot.current.kind !== 'player' || s !== 'rampe').map(([s, input]) => [id, s, slot, input]));
  it.each(posed)('%s, pose %s : chaque pièce occupe la même boîte que dans le jeu (à 1e-3 près)', (_id, _s, slot, input) => {
    const c = make(slot);
    const pose = poseFor(slot, input);
    c.setPose(pose);
    c.root.updateMatrixWorld(true);
    const { boxes } = fkPose(slot.current, fromV1(pose, traits(slot)), { skeletons });
    const pieces = [...new Set(boxes.map((b) => b.piece))].filter((p) => p !== 'gun');
    const meshes = meshesOf(c).filter((m) => m !== c.gun);
    expect(pieces).toHaveLength(meshes.length);
    for (const piece of pieces) {
      const mine = boxes.filter((b) => b.piece === piece);
      const min = [0, 1, 2].map((k) => Math.min(...mine.map((b) => b.min[k])));
      const max = [0, 1, 2].map((k) => Math.max(...mine.map((b) => b.max[k])));
      const found = meshes.some((m) => {
        const b = worldBox([m]);
        return [0, 1, 2].every((k) => Math.abs(b.min.getComponent(k) - min[k]) < 1e-3 && Math.abs(b.max.getComponent(k) - max[k]) < 1e-3);
      });
      expect(found, piece).toBe(true);
    }
  });

  it.each(slots)('%s : os rigides et pièces articulées placent les sommets au même endroit (boîte de tout le corps)', (_id, slot) => {
    const noGun = { ...slot.current, parts: slot.current.parts.filter((p) => !p.id.startsWith('gun')) };
    const shared = rigidShared(noGun, { skeletons, rect: () => ({ u0: 0, v0: 0, u1: 1, v1: 1 }), color: () => [1, 1, 1], materials: [new THREE.MeshLambertMaterial()], shadowMaterial: new THREE.MeshBasicMaterial() });
    const rigid = createRigidCharacter(shared);
    const art = make(slot);
    const pose = poseFor(slot, { phase: 0.9, time: 1.3 });
    art.setPose(pose);
    rigid.setAngles(fromV1(pose, traits(slot)));
    for (const r of [art.root, rigid.root]) {
      r.scale.setScalar(slot.current.scale);
      r.updateMatrixWorld(true);
    }
    art.root.scale.setScalar(slot.current.scale);
    art.root.updateMatrixWorld(true);
    rigid.skeleton.update();
    const a = worldBox(meshesOf(art).filter((m) => m !== art.gun));
    const b = new THREE.Box3();
    const v = new THREE.Vector3();
    for (let i = 0; i < rigid.body.geometry.attributes.position.count; i += 1) b.expandByPoint(rigid.body.getVertexPosition(i, v).applyMatrix4(rigid.body.matrixWorld));
    for (let k = 0; k < 3; k += 1) {
      expect(b.min.getComponent(k)).toBeCloseTo(a.min.getComponent(k), 3);
      expect(b.max.getComponent(k)).toBeCloseTo(a.max.getComponent(k), 3);
    }
  });

  it.each(slots)('%s : prototype os rigides, une seule géométrie partagée, 1 appel de corps et un proxy d\'ombre (couleur et profondeur coupées)', (_id, slot) => {
    const shared = rigidShared(slot.current, { skeletons, rect: () => ({ u0: 0, v0: 0, u1: 1, v1: 1 }), color: () => [1, 1, 1], materials: [new THREE.MeshLambertMaterial()], shadowMaterial: new THREE.MeshBasicMaterial() });
    const a = createRigidCharacter(shared);
    const b = createRigidCharacter(shared);
    expect(a.body.geometry).toBe(b.body.geometry);
    expect(a.body.material).toBe(b.body.material);
    expect(a.skeleton).not.toBe(b.skeleton);
    expect(a.body.geometry.groups).toHaveLength(1);
    expect(a.shadow.castShadow).toBe(true);
    expect(a.body.castShadow).toBe(false);
    expect(a.shadow.skeleton).toBe(a.skeleton);
    expect(a.body.geometry.attributes.position.count / 3).toBe(expandParts(slot.current).reduce((n, p) => n + (p.kind === 'box' ? 12 : 0), 0) + characterStats({ ...slot.current, parts: slot.current.parts.filter((p) => p.kind !== 'box') }, { skeletons }).triangles);
  });
});
