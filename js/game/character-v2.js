// Personnages du lot 3j, architecture « os rigides » : toutes les pièces d'une variante sont fusionnées en une géométrie par matière
// (js/core/character-parts.js, mergeParts), chaque sommet lié à un seul os (poids 1) ; un SkinnedMesh par matière, plus un maillage-proxy
// d'ombre (≤ 64 triangles) : il projette l'ombre et, dans la passe principale, sa matière n'écrit ni couleur ni profondeur (Three.js 0.186.1
// ne dessine dans la passe d'ombre que les objets visibles de la caméra principale : WebGLShadowMap teste object.layers avec elle).
// Géométries et matériaux partagés entre tous les personnages d'une variante, jamais recréés à l'image ; chaque personnage a ses os.
import * as THREE from 'three';
import { expandParts, jointMatrices, jointsOf, mergeParts } from '../core/character-parts.js';
import { createRng, nextFloat } from '../core/rng.js';
import { DEATHS, addPoseInto, blendPosesInto, copyPoseInto, createPose, createPoseWork, cycleSeconds, poseAtInto, rigOf, toucheInto } from '../core/pose-v2.js';
import { partRgb, pickOutfit, resolveVariant, wearTier } from '../core/persos-variants.js';
import { PALETTE_REGION, createPersoTexture, persoRegionRect, persoSpec, regionFactor } from '../core/texgen-persos.js';

const KICK_TIME = 0.25; // durée du recul du pistolet du joueur (secondes de jeu)
const NO_PARAMS = Object.freeze({});

// Sphère englobante fixe (repère du personnage) : couvre toutes les poses, chute au sol comprise ; sert au culling hors champ.
const BOUNDS = new THREE.Sphere(new THREE.Vector3(0, 28, 0), 62);

// Géométrie fusionnée d'une liste de pièces : attributs position, normal, uv, color, skinIndex, skinWeight ; un groupe par matière.
// options : { joints (articulations effectives), rect(part), color(part), materials (ordre des matières) }.
export function rigidGeometry(parts, options = {}) {
  return rigidBuild(parts, options).geometry;
}

// Géométrie et groupes de mergeParts (le jeu en lit les pièces de chaque triangle : une seule fusion par tenue).
function rigidBuild(parts, { joints, rect = null, color = null, materials = null } = {}) {
  const rest = jointMatrices(joints, {}, 1);
  const groups = mergeParts(parts, { joints, matrices: rest, rect, color });
  const order = materials ?? groups.map((g) => g.material);
  const sorted = order.map((m) => groups.find((g) => g.material === m)).filter(Boolean);
  const count = sorted.reduce((n, g) => n + g.positions.length / 3, 0);
  const pos = new Float32Array(count * 3);
  const nor = new Float32Array(count * 3);
  const uv = new Float32Array(count * 2);
  const col = new Float32Array(count * 3);
  const idx = new Uint16Array(count * 4);
  const geometry = new THREE.BufferGeometry();
  let start = 0;
  for (const g of sorted) {
    const n = g.positions.length / 3;
    pos.set(g.positions, start * 3);
    nor.set(g.normals, start * 3);
    uv.set(g.uvs, start * 2);
    col.set(g.colors, start * 3);
    g.bones.forEach((b, i) => { idx[(start + i) * 4] = b; });
    geometry.addGroup(start, n, order.indexOf(g.material));
    start += n;
  }
  geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geometry.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geometry.setAttribute('skinIndex', new THREE.BufferAttribute(idx, 4));
  const weights = new Float32Array(idx.length);
  for (let i = 0; i < weights.length; i += 4) weights[i] = 1;
  geometry.setAttribute('skinWeight', new THREE.BufferAttribute(weights, 4));
  geometry.boundingSphere = BOUNDS.clone();
  return { geometry, groups };
}

// Inverses des matrices de repos des os (partagées par tous les personnages d'une variante).
export function boneInverses(joints) {
  const rest = jointMatrices(joints, {}, 1);
  return joints.map((j) => {
    const { m, t } = rest[j.id];
    return new THREE.Matrix4().set(m[0], m[1], m[2], t[0], m[3], m[4], m[5], t[1], m[6], m[7], m[8], t[2], 0, 0, 0, 1).invert();
  });
}

// Un personnage : groupe racine (échelle), os (Bone), SkinnedMesh du corps et proxy d'ombre (même squelette).
// shared : { geometry, shadowGeometry, materials, shadowMaterial, joints, inverses }.
export function createRigidCharacter(shared) {
  const root = new THREE.Group();
  const bones = new Map();
  for (const j of shared.joints) {
    const bone = new THREE.Bone();
    bone.name = j.id;
    bone.position.set(j.offset[0], j.offset[1], j.offset[2]);
    bone.rotation.order = 'YXZ';
    (j.parent ? bones.get(j.parent) : root).add(bone);
    bones.set(j.id, bone);
  }
  const list = shared.joints.map((j) => bones.get(j.id));
  const skeleton = new THREE.Skeleton(list, shared.inverses);
  const body = new THREE.SkinnedMesh(shared.geometry, shared.materials.length === 1 ? shared.materials[0] : shared.materials);
  body.castShadow = false;
  body.boundingSphere = BOUNDS.clone();
  root.add(body);
  body.bind(skeleton, new THREE.Matrix4());
  let shadow = null;
  if (shared.shadowGeometry) {
    shadow = new THREE.SkinnedMesh(shared.shadowGeometry, shared.shadowMaterial);
    shadow.castShadow = true;
    shadow.boundingSphere = BOUNDS.clone();
    root.add(shadow);
    shadow.bind(skeleton, new THREE.Matrix4());
  }
  const offsets = new Map(shared.joints.map((j) => [j.id, j.offset]));
  return {
    root,
    body,
    shadow,
    skeleton,
    bones,
    // pose : { angles: { joint: [x, y, z] }, offsets: { joint: [dx, dy, dz] } } ; les articulations absentes reviennent au repos.
    setAngles(pose) {
      const angles = pose?.angles ?? {};
      const extra = pose?.offsets ?? {};
      for (const [id, bone] of bones) {
        const a = angles[id];
        if (a) bone.rotation.set(a[0], a[1], a[2]);
        else bone.rotation.set(0, 0, 0);
        const o = offsets.get(id);
        const e = extra[id];
        bone.position.set(o[0] + (e ? e[0] : 0), o[1] + (e ? e[1] : 0), o[2] + (e ? e[2] : 0));
      }
    },
  };
}

// Données partagées d'une variante : géométrie du corps (une par jeu de couleurs `color`), proxy d'ombre, inverses des os.
export function rigidShared(variant, { skeletons, rect, color, materials, shadowMaterial, materialOrder = null }) {
  const joints = jointsOf(variant, skeletons);
  const parts = expandParts(variant);
  const shadowParts = Array.isArray(variant.shadow) ? expandParts({ parts: variant.shadow }) : parts.filter((p) => p.casts === true);
  return {
    joints,
    inverses: boneInverses(joints),
    geometry: rigidGeometry(parts, { joints, rect, color, materials: materialOrder }),
    shadowGeometry: shadowParts.length > 0 ? rigidGeometry(shadowParts.map((p) => ({ ...p, material: 'body' })), { joints }) : null,
    materials,
    shadowMaterial,
  };
}

// --- Kit du jeu et de l'atelier (lot 3j-B) ---------------------------------------------------------------------------------------------
// Textures (js/core/texgen-persos.js) : un atlas par type de zombie (4 tuiles = paliers de blessure, une matière par palier qui partage
// l'image : seul le décalage de texture change), un pour le joueur ; matières partagées ; géométries par tenue (pièces facultatives) et par
// palier d'usure (seule la couleur des sommets change : les autres attributs sont partagés). Animations : js/core/pose-v2.js.

const TAU = Math.PI * 2;
const GAIT_ANIM = { lent: 'marcheLente', marche: 'marche', rampe: 'rampe', course: 'course' };
export const SLOT_OF_TYPE = { marcheur: 'marcheur', petit: 'petit', voute: 'voute', grand: 'grand' };
const TILE_OFFSETS = [[0, 0], [0.5, 0], [0, 0.5], [0.5, 0.5]];
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const num = (v, d = 0) => (Number.isFinite(v) ? v : d);
// Déchirure d'un triangle : hachage déterministe de son indice.
const torn = (i, seed) => {
  let h = Math.imul(i + 1, 2654435761) ^ Math.imul(seed + 7, 40503);
  h = Math.imul(h ^ (h >>> 15), 2246822519);
  return ((h ^ (h >>> 13)) >>> 0) / 4294967296;
};

// options : { characters, poses (données), lookup (jeton -> [r, g, b]), hit (couleur du flash), choice ('A' | 'B' | 'C' | 'riche'),
// zombieIds (ordre des variantes de zombie-variants.json), seed, wear () => palier (0 à 3), macros: { slot: { taille, ... } },
// styleOf: { slot: 'A' | ... | 'actuel' } (variante de chaque personnage ; actuel : ancien modèle, voir handles), outfitOf: { slot: indice }
// (atelier : tenue imposée) ; lot 3m (table des choix) : styleAnim: { slot: 'A' | 'B' | 'C' } (style d'animation), outfitsOf: { slot:
// 'toutes' | [identifiants de tenues] } (tenues tirées), animMacros: { slot: { amplitude, rythme, lourdeur } }.
export function createV2Kit(options) {
  const { characters, poses } = options;
  // Jetons lus une fois chacun (getComputedStyle est lent : des milliers d'appels par géométrie sinon).
  const tokenCache = new Map();
  const lookup = (token) => {
    if (!tokenCache.has(token)) tokenCache.set(token, options.lookup(token));
    return tokenCache.get(token);
  };
  const skeletons = poses.skeletons;
  const zombieIds = options.zombieIds ?? ['marcheur', 'petit', 'grand', 'voute'];
  const hitMat = new THREE.MeshBasicMaterial({ color: options.hit ?? 0xffffff });
  // Proxy d'ombre : invisible dans la passe principale (aucune couleur, aucune profondeur), projeté dans la passe d'ombre.
  const shadowMat = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
  const blood = [lookup('--sang-frais'), lookup('--sang-sec')];
  const slots = new Map(characters.slots.map((s) => [s.id, s]));
  const textures = [];
  let rng = createRng(Number.isFinite(options.seed) ? options.seed : 1);
  const kits = new Map();

  // Lot 3m : variante d'un emplacement avec le style d'animation de la table des choix ; tenues retenues (indices ; aucune reconnue : toutes).
  function variantOf(slotId, choice) {
    const slot = slots.get(slotId);
    const base = slot.variants.find((v) => v.id === choice) ?? slot.variants.find((v) => v.id === 'A');
    const style = options.styleAnim?.[slotId];
    return { slot, variant: ['A', 'B', 'C'].includes(style) ? { ...base, style } : base };
  }
  function allowedOutfits(slotId, variant) {
    const all = (variant.outfits ?? [{}]).map((_, i) => i);
    const list = options.outfitsOf?.[slotId];
    if (!Array.isArray(list)) return all;
    const picked = all.filter((i) => list.includes(variant.outfits?.[i]?.id));
    return picked.length ? picked : all;
  }
  function slotKit(slotId, choice) {
    const key = `${slotId}:${choice}`;
    if (kits.has(key)) return kits.get(key);
    const { slot, variant } = variantOf(slotId, choice);
    const isPlayer = variant.kind === 'player';
    const spec = persoSpec({ size: isPlayer ? 128 : 256, tiles: isPlayer ? 1 : 2, seed: 11 + characters.slots.indexOf(slot) * 17, blood });
    const tex = createPersoTexture(spec);
    const base = new THREE.DataTexture(new Uint8Array(tex.data.buffer), tex.width, tex.height, THREE.RGBAFormat);
    base.colorSpace = THREE.SRGBColorSpace;
    base.generateMipmaps = true;
    base.minFilter = THREE.LinearMipmapLinearFilter;
    base.magFilter = THREE.LinearFilter;
    base.needsUpdate = true;
    textures.push({ id: key, texture: base, bytes: tex.bytes });
    const factors = Object.fromEntries(Object.values(PALETTE_REGION).map((k) => [k, regionFactor(tex, spec, k)]));
    // Lot 3m (levier de chargement 1) : matières de blessure (tuiles 1 à 3 de l'atlas) créées au premier usage (premier palier de blessure),
    // pas au démarrage : seule la tuile 0 (corps propre) est envoyée à la carte graphique avec le personnage.
    const woundTiles = TILE_OFFSETS.slice(0, isPlayer ? 1 : 4);
    const wound = woundTiles.map(() => null);
    const woundAt = (i) => {
      if (!wound[i]) {
        const t = i === 0 ? base : base.clone();
        t.offset.set(...woundTiles[i]);
        t.needsUpdate = i !== 0 ? true : t.needsUpdate;
        wound[i] = new THREE.MeshLambertMaterial({ map: t, vertexColors: true });
      }
      return wound[i];
    };
    woundAt(0);
    const glow = new THREE.MeshBasicMaterial({ color: new THREE.Color().setRGB(...lookup('--perso-lampe').map((c) => c / 255), THREE.SRGBColorSpace), vertexColors: false });
    const k = { slot, variant, isPlayer, spec, factors, wound, woundAt, glow, geoms: new Map(), shared: new Map(), lastOutfit: null, allowed: allowedOutfits(slotId, variant) };
    kits.set(key, k);
    return k;
  }

  // Variante concrète d'un emplacement (macros de l'atelier comprises) ; tenue et palier d'usure donnés.
  const resolved = (k, outfit, wear) => resolveVariant(k.variant, { macros: options.macros?.[k.slot.id], outfit, wear, wearTiers: characters.wearTiers });

  // Géométrie (tenue, usure) : pièces fusionnées une fois par tenue ; couleurs par triangle (déchirures) par palier.
  function geometryFor(k, outfit, wear) {
    const key = `${outfit}:${wear}`;
    if (k.geoms.has(key)) return k.geoms.get(key);
    const res = resolved(k, outfit, wear);
    let shared = k.shared.get(outfit);
    if (!shared) {
      const joints = jointsOf(res, skeletons);
      const parts = expandParts(res);
      const rect = (p) => persoRegionRect(k.spec, PALETTE_REGION[p.palette] ?? 'sombre');
      const order = parts.some((p) => p.material === 'glow') ? ['body', 'glow'] : ['body'];
      const { geometry, groups } = rigidBuild(parts, { joints, rect, color: () => [1, 1, 1], materials: order });
      const triParts = order.flatMap((m) => groups.find((g) => g.material === m)?.parts ?? []);
      const shadowParts = Array.isArray(res.shadow) ? expandParts({ parts: res.shadow }) : [];
      shared = { joints, parts, geometry, triParts, inverses: boneInverses(joints), shadowGeometry: shadowParts.length ? rigidGeometry(shadowParts, { joints }) : null, order };
      k.shared.set(outfit, shared);
    }
    const colors = new Float32Array(shared.geometry.attributes.position.count * 3);
    const tearRgb = lookup(res.palette.dechirure) ?? [0, 0, 0];
    const tears = Number(res.wear?.tears) || 0;
    // Les couleurs des jetons sont en sRGB ; le rendu travaille en linéaire (les textures aussi sont déclarées sRGB). Une conversion par
    // couleur (pièce ou déchirure), pas par sommet ; Math.fround : la valeur sRGB passe en flottant 32 bits avant la conversion.
    const linear = new Map();
    const linearOf = (key, rgb) => {
      if (!linear.has(key)) {
        const [r, g, b] = rgb.map((x) => Math.fround(x / 255));
        const c = new THREE.Color().setRGB(r, g, b, THREE.SRGBColorSpace);
        linear.set(key, [c.r, c.g, c.b]);
      }
      return linear.get(key);
    };
    shared.triParts.forEach((pi, t) => {
      const part = shared.parts[pi];
      const c = part.cloth && torn(t, outfit) < tears ? linearOf('dechirure', tearRgb) : linearOf(pi, partRgb(part, res, lookup));
      for (let v = 0; v < 3; v += 1) colors.set(c, (t * 3 + v) * 3);
    });
    const g = new THREE.BufferGeometry();
    for (const name of ['position', 'normal', 'uv', 'skinIndex', 'skinWeight']) g.setAttribute(name, shared.geometry.getAttribute(name));
    const color = new THREE.BufferAttribute(colors, 3);
    g.setAttribute('color', color);
    for (const gr of shared.geometry.groups) g.addGroup(gr.start, gr.count, gr.materialIndex);
    g.boundingSphere = shared.geometry.boundingSphere;
    const out = { geometry: g, shared, res };
    k.geoms.set(key, out);
    return out;
  }

  // Un personnage v2 : même interface que createCharacter (root, kind, variant, gun, readPose, setFlash, setPose) plus setWound,
  // setOutfit, setAnim (atelier) et dispose.
  function kitOf(kind, variantIndex, opts) {
    const slotId = kind === 'player' ? 'joueur' : SLOT_OF_TYPE[zombieIds[variantIndex % zombieIds.length]] ?? 'marcheur';
    const choice = opts.choice ?? options.styleOf?.[slotId] ?? options.choice ?? 'A';
    return { slotId, choice, k: slotKit(slotId, choice) };
  }
  const wearNow = () => Math.max(0, Math.min(3, Math.floor(num(options.wear ? options.wear() : 0, 0))));

  function create(kind, variantIndex = 0, opts = {}) {
    const { slotId, choice, k } = kitOf(kind, variantIndex, opts);
    let outfit = Number.isInteger(opts.outfit) ? opts.outfit : k.allowed[0] ?? 0;
    let wear = k.isPlayer ? 0 : Math.max(0, Math.min(3, Math.floor(num(opts.wear, options.wear ? options.wear() : 0))));
    let current = geometryFor(k, outfit, wear);
    const rig = createRigidCharacter({ ...current.shared, geometry: current.geometry, materials: [k.woundAt(0), k.glow].slice(0, current.shared.order.length), shadowMaterial: shadowMat });
    const root = rig.root;
    root.scale.setScalar(current.res.scale);
    root.userData.v2 = true;
    let gait = rigOf(current.res, skeletons);
    let woundTier = 0;
    let flashing = false;
    const state = { shotAt: -10, lastRecoil: 0, anim: null, prev: null, prevPose: null, since: 0, hurtAt: -10, lastFlash: 0, attackAt: -10, lastCooldown: 0, downWas: false, upAt: -10, time: 0, phase: 0, pose: null };
    const materials = () => [flashing ? hitMat : k.woundAt(Math.min(woundTier, k.wound.length - 1)), k.glow].slice(0, current.shared.order.length);
    const applyMaterials = () => {
      const m = materials();
      rig.body.material = m.length === 1 ? m[0] : m;
    };
    const setGeometry = () => {
      current = geometryFor(k, outfit, wear);
      rig.body.geometry = current.geometry;
      if (rig.shadow && current.shared.shadowGeometry) rig.shadow.geometry = current.shared.shadowGeometry;
      root.scale.setScalar(current.res.scale);
      gait = rigOf(current.res, skeletons);
    };
    // Tenue tirée à chaque apparition (le jeu réutilise ses personnages) : jamais la même que la précédente de ce type.
    if (!k.isPlayer && opts.outfit === undefined) {
      root.addEventListener('added', () => {
        // Lot 3m : tirée parmi les tenues retenues (k.allowed ; k.lastOutfit : rang de la précédente dans cette liste).
        const r = pickOutfit(rng, k.allowed.length, k.lastOutfit);
        rng = r.rng;
        k.lastOutfit = r.index;
        outfit = k.allowed[r.index] ?? 0;
        wear = options.wear ? Math.max(0, Math.min(3, options.wear())) : wear;
        woundTier = 0;
        state.anim = null;
        state.hurtAt = -10;
        setGeometry();
        applyMaterials();
      });
    }
    // Lot 5d : poses écrites dans les tampons de ce personnage (créés une fois, réécrits à chaque image, jamais partagés) ; paramètres
    // d'animation (macros puis extra, comme { ...macros, ...extra }) réécrits dans un objet réutilisé (clé absente = undefined).
    const buf = { cur: createPose(), prev: createPose(), blend: createPose(), hurt: createPose(), add: createPose(), work: createPoseWork(), params: {} };
    const xMove = { twist: 0, recoil: 0 };
    const xRepair = { repairTime: 0 };
    const xSill = { sill: 0 };
    const macros = () => options.animMacros?.[slotId] ?? NO_PARAMS;
    const params = (extra = NO_PARAMS) => {
      const p = buf.params;
      for (const key in p) p[key] = undefined;
      for (const key in macros()) p[key] = macros()[key];
      for (const key in extra) p[key] = extra[key];
      return p;
    };
    function show(anim, phase, extra = NO_PARAMS, time = state.time) {
      if (anim !== state.anim) {
        state.prevPose = state.pose ? copyPoseInto(buf.prev, state.pose) : null;
        state.since = time;
        state.anim = anim;
      }
      let pose = poseAtInto(buf.cur, buf.work, gait, anim, phase, params(extra), poses);
      const blend = Number(poses.durations?.blend) || 0.15;
      if (state.prevPose && time - state.since < blend && !DEATHS.includes(anim)) pose = blendPosesInto(buf.blend, state.prevPose, pose, (time - state.since) / blend);
      if (time - state.hurtAt < (Number(poses.durations?.touche) || 0.25)) pose = addPoseInto(buf.add, pose, toucheInto(buf.hurt, gait, (time - state.hurtAt) / (Number(poses.durations?.touche) || 0.25), macros(), poses));
      state.pose = pose;
      state.phase = phase;
      rig.setAngles(pose);
      for (const [id, bone] of rig.bones) bone.scale.setScalar(pose.scales?.[id] ?? 1);
    }
    const cycle = (anim, extra) => cycleSeconds(gait, anim, params(extra), poses) ?? 1;
    // Bout du canon (avant de la glissière, repère de l'articulation « prop ») : le laser, l'éclair et les balles en partent à l'image.
    const slide = current.shared.parts.find((p) => p.id === 'gunSlide');
    const tip = slide ? new THREE.Vector3(slide.offset?.[0] ?? 0, slide.offset?.[1] ?? 0, (slide.offset?.[2] ?? 0) + (slide.dims?.d ?? 0) / 2) : null;
    const propBone = rig.bones.get('prop');
    const muzzleAt = new THREE.Vector3();
    const muzzleOut = { x: 0, y: 0, height: 0 };
    return {
      root,
      kind,
      variant: variantIndex,
      gun: null,
      v2: true,
      slot: slotId,
      choice,
      body: rig.body,
      shadow: rig.shadow,
      get outfit() { return outfit; },
      get wear() { return wear; },
      readPose() {
        return { anim: state.anim, phase: state.phase, outfit, wear, wound: woundTier, choice, slot: slotId, triangles: current.geometry.attributes.position.count / 3, hurt: state.time - state.hurtAt < (Number(poses.durations?.touche) || 0.25) };
      },
      // Joueur : position du bout du canon dans le monde ({ x, y } du plan de jeu, height) après setPose et la pose de root ; null sans arme.
      muzzle() {
        if (!tip || !propBone || kind !== 'player') return null;
        root.updateMatrixWorld(true);
        muzzleAt.copy(tip).applyMatrix4(propBone.matrixWorld);
        muzzleOut.x = muzzleAt.x;
        muzzleOut.y = muzzleAt.z;
        muzzleOut.height = muzzleAt.y;
        return muzzleOut;
      },
      setFlash(on) {
        flashing = Boolean(on);
        applyMaterials();
      },
      // Palier de blessure (0 à 3) : matière partagée, aucune géométrie en plus.
      setWound(tier) {
        const t = Math.max(0, Math.min(3, Math.floor(num(tier))));
        if (t !== woundTier) {
          woundTier = t;
          applyMaterials();
        }
      },
      setOutfit(index, w = wear) {
        outfit = Math.max(0, Math.min((k.variant.outfits?.length ?? 1) - 1, Math.floor(num(index))));
        wear = k.isPlayer ? 0 : Math.max(0, Math.min(3, Math.floor(num(w))));
        setGeometry();
        applyMaterials();
      },
      // Atelier : animation et phase imposées.
      setAnim(anim, phase, extra = {}, time = 0) {
        state.time = time;
        if (anim === 'touche') {
          state.hurtAt = time - Math.max(0, Math.min(1, num(phase))) * (Number(poses.durations?.touche) || 0.25);
          show(k.isPlayer ? 'repos' : 'attente', 0, extra, time);
        } else show(anim, phase, extra, time);
      },
      // Jeu : pose v1 calculée par le jeu (ignorée), entrée de computePose et entité (zombie : ennemi ; joueur : { down, repairing, repairTime, hurt }).
      setPose(_v1, input = {}, entity = null) {
        const time = num(input.time);
        state.time = time;
        if (kind === 'player') {
          const e = entity ?? {};
          if (e.hurt) state.hurtAt = time;
          const down = e.down === 'terre';
          if (state.downWas && !down) state.upAt = time;
          state.downWas = down;
          const relev = Number(poses.durations?.relevage) || 0.8;
          if (down) show('terre', time / cycle('terre'));
          else if (time - state.upAt < relev) show('relevage', (time - state.upAt) / relev);
          else if (e.repairing) {
            xRepair.repairTime = e.repairTime;
            show('reparation', time / cycle('reparation', xRepair), xRepair);
          } else {
            const twist = Number.isFinite(input.aim) && Number.isFinite(input.facing) ? wrap(input.aim - input.facing) : 0;
            // Recul visible : le jeu ne le garde que 0,12 s (RECOIL_TIME) ; ici, chaque nouveau coup de feu le relance pour KICK_TIME.
            const fired = num(input.recoil);
            if (fired > state.lastRecoil + 0.3) state.shotAt = time;
            state.lastRecoil = fired;
            const recoil = Math.max(0, 1 - (time - state.shotAt) / KICK_TIME);
            xMove.twist = twist;
            xMove.recoil = recoil;
            if (num(input.amount) > 0.12) show('marche', num(input.phase) / TAU, xMove);
            else show('repos', time / cycle('repos'), xMove);
          }
          return;
        }
        const e = entity ?? {};
        if (num(e.flash) > state.lastFlash + 1e-6) state.hurtAt = time;
        state.lastFlash = num(e.flash);
        if (num(e.hitCooldown) > state.lastCooldown + 1e-6 && num(e.hitCooldown) > 0.5) state.attackAt = time;
        state.lastCooldown = num(e.hitCooldown);
        const attack = Number(poses.durations?.attaque) || 1;
        if (input.state === 'arracher') show('arracher', num(input.phase) / TAU);
        // Passage de la fenêtre : « enjamber », piloté par la progression (climb.t) ; avant le passage, il marche jusqu'au bord extérieur.
        else if (input.state === 'escalade' && num(e.climb?.t) > 0) {
          xSill.sill = options.sill;
          show('enjamber', num(e.climb.t), xSill);
        } else if (input.state === 'escalade') show(GAIT_ANIM[e.gait] ?? 'marche', num(input.phase) / TAU);
        else if (e.mode === 'escalier') show(e.gait === 'rampe' ? 'rampe' : 'escalier', num(input.phase) / TAU);
        else if (time - state.attackAt < attack && e.gait !== 'rampe') show('attaque', (time - state.attackAt) / attack);
        else if (e.mode === 'attente' || num(input.amount, 0.7) < 0.2) show(e.gait === 'rampe' ? 'rampe' : 'attente', e.gait === 'rampe' ? num(input.phase) / TAU : time / cycle('attente'));
        else show(GAIT_ANIM[e.gait] ?? 'marche', num(input.phase) / TAU);
      },
      dispose() {
        rig.skeleton.dispose();
      },
    };
  }

  return {
    create,
    slotKit,
    // Préparation d'avance (jeu : une tâche par appel, hors de l'image) : texture d'une variante de zombie et géométrie d'une tenue au palier
    // d'usure du moment. Caches purs : aucun effet sur le jeu ni sur le hasard. Renvoie le nombre de tenues de la variante.
    prewarm(variantIndex, outfit = 0) {
      const { k } = kitOf('zombie', variantIndex, {});
      const outfits = k.allowed.length;
      geometryFor(k, k.allowed[Math.max(0, Math.min(outfits - 1, outfit))], wearNow());
      return outfits;
    },
    // Lot 3m : ce personnage est-il un personnage v2 ? (variante « actuel » de la table ou de l'adresse : l'ancien modèle le construit).
    handles(kind, variantIndex = 0) {
      const slotId = kind === 'player' ? 'joueur' : SLOT_OF_TYPE[zombieIds[variantIndex % zombieIds.length]] ?? 'marcheur';
      return (options.styleOf?.[slotId] ?? options.choice) !== 'actuel';
    },
    // Lot 3m : réglages appliqués à chaque personnage (variante, style d'animation, tenues retenues, macros), sans rien construire.
    choices() {
      return Object.fromEntries(characters.slots.map((s) => {
        const choice = options.styleOf?.[s.id] ?? options.choice ?? 'A';
        if (choice === 'actuel') return [s.id, { variante: 'actuel' }];
        const { variant } = variantOf(s.id, choice);
        const res = resolveVariant(variant, { macros: options.macros?.[s.id], wearTiers: characters.wearTiers });
        return [s.id, { variante: variant.id, style: variant.style, tenues: allowedOutfits(s.id, variant).map((i) => variant.outfits?.[i]?.id ?? String(i)), macros: res.macroValues, animation: { ...(options.animMacros?.[s.id] ?? {}) } }];
      }));
    },
    resolved: (slotId, choice, outfit = 0, wear = 0) => resolved(slotKit(slotId, choice), outfit, wear),
    textureBytes: () => textures.reduce((s, t) => s + t.bytes, 0),
    textureCount: () => textures.length,
    // Proposition de priorité 2 (données seulement) : coût estimé de la lueur des yeux (deux petites sphères émissives = un appel de plus).
    wearFor: (wave) => wearTier(wave, characters.wearByWave),
    random: () => {
      const r = nextFloat(rng);
      rng = r.rng;
      return r.value;
    },
    dispose() {
      for (const t of textures) t.texture.dispose();
      for (const k of kits.values()) {
        for (const m of [...k.wound, k.glow]) m?.dispose();
        for (const g of k.geoms.values()) g.geometry.dispose();
        for (const s of k.shared.values()) {
          s.geometry.dispose();
          s.shadowGeometry?.dispose();
        }
      }
      hitMat.dispose();
      shadowMat.dispose();
    },
  };
}
