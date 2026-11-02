// Mesures des animations v2 (lot 3j) par animation : période (secondes), amplitude de la hanche et de l'épaule gauches (écart max − min, rad),
// vitesse angulaire maximale, glissement maximal du pied d'appui, pire hauteur sous le sol et pénétration ; maximum sur toutes les variantes.
// Imprime, n'écrit rien. Usage : node scripts/personnages/animations.mjs
import { ANIMS_OF, animChecks, animDuration, characters, resolve, sampleAnim } from './lib.mjs';

const rows = new Map();
for (const slot of characters.slots) {
  for (const v of slot.variants.filter((x) => !x.flags?.test)) {
    const kind = slot.id === 'joueur' ? 'player' : 'zombie';
    for (const anim of ANIMS_OF(kind)) {
      const key = `${kind === 'player' ? 'joueur' : 'zombie'} ${anim}`;
      const c = animChecks(slot, v, anim, { n: 60 });
      const samples = sampleAnim(resolve(v), anim, 60);
      const span = (id) => {
        const xs = samples.map((s) => s.pose.angles[id]?.[0] ?? 0);
        return Math.max(...xs) - Math.min(...xs);
      };
      const r = rows.get(key) ?? { period: [], hip: 0, shoulder: 0, speed: 0, slide: null, low: Infinity, pen: 0 };
      r.period.push(animDuration(resolve(v), anim));
      r.hip = Math.max(r.hip, span('hipL'));
      r.shoulder = Math.max(r.shoulder, span('shoulderL'));
      r.speed = Math.max(r.speed, c.maxSpeed);
      if (c.slide !== null) r.slide = Math.max(r.slide ?? 0, c.slide);
      r.low = Math.min(r.low, c.belowGround);
      r.pen = Math.max(r.pen, c.penetration);
      rows.set(key, r);
    }
  }
}
const f = (v, d = 2) => (v === null ? '–' : v.toFixed(d));
console.log('| Animation | Période (s) | Amplitude hanche | Amplitude épaule | Vitesse max (rad/s) | Glissement max | Point le plus bas | Pénétration max |');
console.log('|---|---|---|---|---|---|---|---|');
for (const [k, r] of rows) console.log(`| ${k} | ${f(Math.min(...r.period))} à ${f(Math.max(...r.period))} | ${f(r.hip)} | ${f(r.shoulder)} | ${f(r.speed, 1)} | ${r.slide === null ? '–' : `${(100 * r.slide).toFixed(1)} %`} | ${f(r.low)} | ${f(r.pen)} |`);
