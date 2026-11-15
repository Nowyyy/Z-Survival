// Scènes d'écoute de l'atelier des sons (lot 3h), pures et déterministes : une scène = 30 s d'événements sonores tirés d'une graine.
// Événement : { t (s), sonId (emplacement de sounds-atelier.json, ou « ref:<son du jeu> »), variante (null : le choix courant de la
// page), graine (version 1 à 5, jamais deux fois la même de suite pour un même son), distance (unités du jeu), etage (rdc ou etage),
// etouffement (un mur entre la source et le joueur) }. Le mixage (mixFor) reprend les règles du jeu (js/core/audio-mix.js et
// sound-director.js : gain selon la distance, étouffement 900 Hz × 0,6, autre étage 700 Hz × 0,5), en lecture seule.
import { distanceGain } from './audio-mix.js';
import { createRandom } from './synth2-dsp.js';
import { nextVersion } from './synth2.js';
import { isNum, num } from './vec.js';

export const SCENE_DURATION = 30;
export const SCENE_IDS = Object.freeze(['couloir', 'siege', 'reparation', 'meute']);
const TYPES = ['marcheur', 'petit', 'voute', 'grand'];

function builder(seed) {
  const rnd = createRandom(isNum(seed) ? Math.trunc(seed) : 1);
  let versions = { rng: (isNum(seed) ? Math.trunc(seed) : 1) >>> 0, last: {} };
  const events = [];
  const add = (t, sonId, { distance = 0, etage = 'rdc', etouffement = false } = {}) => {
    if (!(t >= 0 && t < SCENE_DURATION)) return;
    const v = nextVersion(versions, sonId, 5);
    versions = v.state;
    events.push({ t: Math.round(t * 1000) / 1000, sonId, variante: null, graine: v.version, distance: Math.max(0, Math.round(distance)), etage, etouffement });
  };
  return { rnd, add, events };
}

// Marche : un pas toutes les `step` s de `from` à `to` (léger écart aléatoire), distance fixe ou interpolée.
function walk(b, sonId, from, to, step, { distance = 0, distanceTo = null, etage = 'rdc', etouffement = false } = {}) {
  for (let t = from; t < to; t += step * (1 + 0.06 * b.rnd.signed())) {
    const u = to > from ? (t - from) / (to - from) : 0;
    b.add(t, sonId, { distance: distanceTo === null ? distance : distance + (distanceTo - distance) * u, etage, etouffement });
  }
}

const SCENES = {
  // Couloir : le joueur marche sur le carrelage par séquences, des gémissements lointains derrière les murs.
  couloir(b) {
    walk(b, 'pas-joueur-dur', 0.2, 8, 0.52);
    walk(b, 'pas-joueur-dur', 10.4, 18.5, 0.5);
    walk(b, 'pas-joueur-dur', 21, 29.5, 0.54);
    for (let t = 1.5 + 2 * b.rnd.next(); t < 29; t += 5 + 3 * b.rnd.next()) {
      b.add(t, `voix-${TYPES[Math.floor(b.rnd.next() * TYPES.length)]}-errance`, { distance: 600 + 400 * b.rnd.next(), etouffement: true });
    }
  },
  // Siège d'une fenêtre : approche, une réparation, quatre planches arrachées (2,2 s chacune) qui tombent, voix, escalade, un coup de feu.
  siege(b, { repairDuration }) {
    walk(b, 'pas-zombie-marche', 0.3, 6.5, 0.62, { distance: 700, distanceTo: 260 });
    b.add(2.1, 'voix-marcheur-errance', { distance: 480 });
    b.add(3.6, 'reparation', { distance: 60 });
    b.add(3.6 + repairDuration + 0.4, 'pas-joueur-dur', { distance: 0 });
    b.add(7.0, 'voix-marcheur-attaque', { distance: 260 });
    for (let k = 0; k < 4; k += 1) {
      const t = 9 + 2.2 * k;
      if (k % 2 === 1) b.add(t - 0.6, 'planche-craquement', { distance: 250 });
      b.add(t, 'planche-arrachage', { distance: 250 });
      b.add(t + 0.35, 'planche-chute', { distance: 240 });
      if (k === 1) b.add(t + 1.0, 'voix-petit-errance', { distance: 420 });
      if (k === 2) b.add(t + 0.9, 'voix-marcheur-attaque', { distance: 250 });
    }
    b.add(17.6, 'escalade', { distance: 250 });
    walk(b, 'pas-zombie-course', 19.2, 21, 0.35, { distance: 230, distanceTo: 120 });
    b.add(20.4, 'voix-marcheur-attaque', { distance: 130 });
    b.add(21.2, 'ref:tir', { distance: 0 });
    b.add(21.25, 'voix-marcheur-mort', { distance: 120 });
    walk(b, 'pas-zombie-marche', 23, 28.5, 0.65, { distance: 600, distanceTo: 320 });
    b.add(25.5, 'voix-petit-attaque', { distance: 330 });
  },
  // Réparation : quatre planches à la durée choisie (0,4 à 1,8 s), quelques pas vers la fenêtre suivante, et ainsi de suite.
  reparation(b, { repairDuration }) {
    let t = 0.3;
    while (t < SCENE_DURATION) {
      for (let k = 0; k < 4 && t + repairDuration < SCENE_DURATION; k += 1) {
        b.add(t, 'reparation', { distance: 50 });
        t += repairDuration + 0.3;
      }
      for (let k = 0; k < 6 && t < SCENE_DURATION; k += 1) {
        b.add(t, 'pas-joueur-dur', { distance: 0 });
        t += 0.46;
      }
      if (t < SCENE_DURATION - 1) b.add(t, `voix-${TYPES[Math.floor(b.rnd.next() * TYPES.length)]}-errance`, { distance: 700, etouffement: true });
      t += 0.4;
    }
  },
  // Meute à l'escalier : le joueur monte, la meute arrive en bas (rez-de-chaussée, entendue à travers le plancher), puis monte.
  meute(b) {
    walk(b, 'pas-joueur-escalier', 0.2, 5.8, 0.42, { etage: 'rdc' });
    walk(b, 'pas-zombie-course', 6, 14, 0.36, { distance: 520, distanceTo: 260, etage: 'rdc' });
    walk(b, 'pas-zombie-marche', 7, 18, 0.62, { distance: 600, distanceTo: 300, etage: 'rdc' });
    b.add(7.5, 'zombie-rampe', { distance: 420, etage: 'rdc' });
    b.add(12.5, 'zombie-rampe', { distance: 330, etage: 'rdc' });
    for (let t = 8 + b.rnd.next(); t < 16; t += 1.6 + 1.2 * b.rnd.next()) b.add(t, `voix-${TYPES[Math.floor(b.rnd.next() * TYPES.length)]}-${b.rnd.next() < 0.5 ? 'attaque' : 'errance'}`, { distance: 300 + 200 * b.rnd.next(), etage: 'rdc' });
    walk(b, 'pas-zombie-course', 16, 24, 0.34, { distance: 260, distanceTo: 90, etage: 'etage' });
    b.add(18.5, 'zombie-rampe', { distance: 200, etage: 'etage' });
    for (let t = 17 + b.rnd.next(); t < 29; t += 1.2 + b.rnd.next()) b.add(t, `voix-${TYPES[Math.floor(b.rnd.next() * TYPES.length)]}-attaque`, { distance: 90 + 150 * b.rnd.next(), etage: 'etage' });
  },
};
// Étage du joueur pendant la scène (la meute : en haut de l'escalier dès 6 s).
const LISTENER = { couloir: [[0, 'rdc']], siege: [[0, 'rdc']], reparation: [[0, 'rdc']], meute: [[0, 'rdc'], [6, 'etage']] };

// Scène id avec sa graine ; options : repairDuration (s, 0,4 à 1,8 : la durée choisie pour la réparation). Nouvel objet, trié par t.
export function createScene(id, seed = 1, options = {}) {
  const repairDuration = options?.repairDuration ?? 1.8;
  const name = SCENE_IDS.includes(id) ? id : 'couloir';
  const b = builder(seed);
  SCENES[name](b, { repairDuration: Math.min(1.8, Math.max(0.4, num(repairDuration, 1.8))) });
  const events = b.events.sort((x, y) => x.t - y.t || (x.sonId < y.sonId ? -1 : 1));
  return { id: name, seed: isNum(seed) ? Math.trunc(seed) : 1, duration: SCENE_DURATION, listener: LISTENER[name].map(([t, floor]) => ({ t, floor })), events };
}

// Étage du joueur à l'instant t.
export function listenerFloor(scene, t) {
  const list = Array.isArray(scene?.listener) ? scene.listener : [];
  let floor = 'rdc';
  for (const l of list) if (num(t) >= num(l.t)) floor = l.floor;
  return floor;
}

// Gain et étouffement d'un événement (règles du jeu, audio.json) : { gain (0 à 1), lowpassHz (null si aucun) }.
export function mixFor(event, audio, floor = 'rdc') {
  let gain = distanceGain(num(event?.distance), num(audio?.referenceDistance, 150), num(audio?.maxDistance, 1100));
  let lowpassHz = null;
  if (event?.etage && event.etage !== floor) {
    gain *= num(audio?.floorGain, 0.5);
    lowpassHz = num(audio?.floorLowpass, 700);
  } else if (event?.etouffement === true) {
    gain *= num(audio?.muffle?.gain, 0.6);
    lowpassHz = num(audio?.muffle?.lowpass, 900);
  }
  return { gain, lowpassHz };
}
