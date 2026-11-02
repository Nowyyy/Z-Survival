import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { renderVariant, resolveAtelier } from '../../js/core/synth2.js';
import { parseChoices } from '../../js/core/atelier-choices.js';
import { measureSound } from '../../js/core/atelier-check.js';
import { pickVariant } from '../../js/core/audio-mix.js';
import { createRng } from '../../js/core/rng.js';
import { createDirector, direct, soundTable, voiceFor } from '../../js/core/sound-director.js';
import { DEFAULT_MODE, SOUND_MODES, bufferName, checkChoices, durationRange, isAtelier, packStats, parseSoundMode, renderSpec, seedCount } from '../../js/core/sound-choice.js';
import { renderChoice } from '../../js/core/sound-render.js';
import { integrate } from '../../scripts/sons/integrer.mjs';
import { planSounds, resolveJobs } from '../../js/game/sound-loader.js';

// Lot 3i-B : sons de l'atelier (lot 3h) à la place des anciens, d'après Docs/ref/sons-a-integrer.md. Aucun son n'est écouté : mesures seules.
const read = (f) => JSON.parse(readFileSync(f, 'utf8'));
const git = (args) => {
  try {
    return execSync(`git ${args}`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    return null;
  }
};
const MAIN = ['origin/main', 'main'].find((b) => git(`rev-parse --verify --quiet ${b}`) !== null) ?? null;
const choix = read('data/game/sounds-choix.json');
const atelierRaw = read('data/game/sounds-atelier.json');
const atelier = resolveAtelier(atelierRaw);
const slots = new Map(atelier.slots.map((s) => [s.id, s]));
const { sounds } = read('data/game/sounds.json');
const legacy = read('data/game/sounds-legacy.json').sounds;
const audio = read('data/game/audio.json');
const voice = read('data/game/zombie-voice.json');
const byId = new Map(sounds.map((s) => [s.id, s]));
const owner = parseChoices(readFileSync('data/game/sounds-atelier-choix.txt', 'utf8'), atelier.slots).choices;
const B = choix.choix.filter((c) => c.part === 'B'); // partie C : sons-integres-ambiances.test.js
const REPLACED = ['pas', 'pas-zombie', 'zombie-gemissement', 'zombie-attaque', 'zombie-blessure', 'zombie-mort', 'planche-arrachee', 'planche-posee'];
// Gardés tels quels (fiche) : mélodie, annonces, tir, douille, impacts, chute et relevage du joueur, joueur blessé et mort, trois voix, interface, ambiance.
const KEPT = ['tir', 'douille', 'impact-zombie', 'impact-bois', 'impact-metal', 'impact-pierre', 'impact-voiture', 'vague-annonce', 'vague-renforcee', 'vague-fin', 'joueur-chute', 'joueur-releve', 'joueur-blesse', 'joueur-mort', 'zombie-grognement', 'zombie-plainte', 'zombie-souffle', 'ui-pause', 'ui-reprise', 'ambiance'];
const mainSounds = MAIN ? JSON.parse(git(`show ${MAIN}:data/game/sounds.json`) ?? 'null')?.sounds ?? null : null;
const rendered = new Map(B.map((c) => [c.id, renderChoice(byId.get(c.id), { seed: 1 })]));

describe('table des choix (data/game/sounds-choix.json)', () => {
  it.each(B.map((c) => [c.id, c]))('%s : emplacement et variante existent dans sounds-atelier.json', (_, c) => {
    const slot = slots.get(c.slot);
    expect(slot, c.slot).toBeDefined();
    expect(slot.variants.some((v) => v.id === c.variant)).toBe(true);
  });

  it('aucun identifiant en double, aucun problème selon checkChoices', () => {
    expect(new Set(B.map((c) => c.id)).size).toBe(B.length);
    expect(checkChoices(choix, slots)).toEqual([]);
  });

  it('variante et réglages = ceux du propriétaire (sounds-atelier-choix.txt), source = la fiche', () => {
    for (const c of B) {
      expect(owner[c.slot].variant, c.id).toBe(c.variant);
      expect(owner[c.slot].macros, c.id).toEqual(c.macros);
      expect(c.source).toBe('sons-a-integrer.md');
    }
  });

  it('5 graines pour la priorité 1, sauf indication de la fiche (pas du joueur : 4, pas des zombies : 3)', () => {
    const expected = { pas: 4, 'pas-zombie': 3 };
    for (const c of B.filter((x) => x.priority === 1)) expect(c.seeds, c.id).toBe(expected[c.id] ?? 5);
  });

  it('les 8 sons remplacés du jeu sont tous dans la table, sous leur identifiant ; voix : un jeu par type (marcheur, petit, voûté, grand)', () => {
    expect(B.filter((c) => c.replaces).map((c) => c.id).sort()).toEqual([...REPLACED].sort());
    for (const base of ['zombie-gemissement', 'zombie-attaque', 'zombie-blessure', 'zombie-mort']) for (const t of ['petit', 'voute', 'grand']) expect(byId.has(`${base}-${t}`), `${base}-${t}`).toBe(true);
  });

  it('les choix « actuel » et « aucun » ne sont pas intégrés et sont listés comme tels', () => {
    const listed = new Set(choix.nonIntegres.map((n) => n.slot));
    for (const [slot, c] of Object.entries(owner)) if (c.variant === 'actuel' || c.variant === 'aucun') expect(listed.has(slot), slot).toBe(true);
  });

  it('sounds.json et sounds-legacy.json sont à jour par rapport à la table (scripts/sons/integrer.mjs idempotent)', () => {
    const out = integrate({ sounds: read('data/game/sounds.json'), legacy: read('data/game/sounds-legacy.json'), choix, atelierRaw });
    expect(out.sounds.sounds).toEqual(sounds);
    expect(out.legacy.sounds).toEqual(legacy);
  });

  it('chaque entrée de l\'atelier porte la recette résolue de sa variante (identique à resolveAtelier)', () => {
    for (const c of B) {
      const e = byId.get(c.id);
      expect(isAtelier(e)).toBe(true);
      expect(e.atelier.slot.variants[0].recipe).toEqual(slots.get(c.slot).variants.find((v) => v.id === c.variant).recipe);
      expect(e.atelier.slot.bufferLevelDb).toBe(slots.get(c.slot).bufferLevelDb);
      expect(e.variants).toBe(c.seeds);
    }
  });
});

describe('anciens sons : déplacés, recettes conservées', () => {
  it('sounds-legacy.json contient exactement les 8 recettes remplacées', () => {
    expect(legacy.map((r) => r.id).sort()).toEqual([...REPLACED].sort());
  });

  it.each(REPLACED)('%s : recette d\'avant identique à celle de main (comparaison d\'objet)', (id) => {
    if (!mainSounds) return;
    expect(legacy.find((r) => r.id === id)).toEqual(mainSounds.find((r) => r.id === id));
  });

  it.each(KEPT)('%s : recette gardée, identique à main (mélodie, coups de feu, impacts…)', (id) => {
    expect(isAtelier(byId.get(id))).toBe(false);
    if (mainSounds) expect(byId.get(id)).toEqual(mainSounds.find((r) => r.id === id));
  });
});

describe('rendu des sons intégrés (format du jeu)', () => {
  it.each(B.map((c) => [c.id, c]))('%s : déterministe octet pour octet, Float32 mono 22 050 Hz, égal au rendu de l\'atelier', (id, c) => {
    const a = rendered.get(id);
    const b = renderChoice(byId.get(id), { seed: 1 });
    expect(a.samples).toBeInstanceOf(Float32Array);
    expect(a.sampleRate).toBe(22050);
    expect(Buffer.from(a.samples.buffer).equals(Buffer.from(b.samples.buffer))).toBe(true);
    const ref = renderVariant(slots.get(c.slot), c.variant, c.macros, 1);
    expect(Buffer.from(a.samples.buffer).equals(Buffer.from(ref.samples.buffer))).toBe(true);
  });

  it.each(B.map((c) => [c.id, c]))('%s : crête ≤ −3 dBFS, aucun NaN, bouts nuls (pas de clic), durée = durée annoncée', (id) => {
    const { samples, duration } = rendered.get(id);
    let peak = 0;
    for (const v of samples) {
      expect(Number.isFinite(v)).toBe(true);
      peak = Math.max(peak, Math.abs(v));
    }
    expect(20 * Math.log10(peak)).toBeLessThanOrEqual(-3 + 1e-6);
    expect(Math.abs(samples[0])).toBeLessThan(1e-3);
    expect(Math.abs(samples[samples.length - 1])).toBeLessThan(1e-3);
    expect(Math.abs(duration - byId.get(id).duration)).toBeLessThan(1e-4);
  });

  it.each(B.map((c) => [c.id, c]))('%s : durée dans les bornes de l\'atelier et niveau relatif au tir à ±3 dB de sa cible', (id, c) => {
    const slot = slots.get(c.slot);
    const m = measureSound(rendered.get(id).samples, 22050, slot, atelier.levelRef);
    const [lo, hi] = slot.target.duration;
    // Hors cible motivée (outOfTarget dans sounds-choix.json : réglage du propriétaire) : la durée mesurée est rapportée, à 5 % de la borne au plus.
    const tol = c.outOfTarget?.duration ? 0.05 * lo : 1e-6;
    expect(m.duration).toBeGreaterThanOrEqual(lo - tol);
    expect(m.duration).toBeLessThanOrEqual(hi + 1e-6);
    // Gain propre au son (gainDb, sounds-choix.json : seul le pas du joueur, +1 dB) compris : niveau tel qu'entendu en jeu.
    const heard = m.levelRel + (c.gainDb ?? 0);
    expect(Math.abs(heard - slot.target.level), `${id} : ${heard.toFixed(2)} dB pour ${slot.target.level}`).toBeLessThanOrEqual(3);
  });

  it('les graines donnent des versions différentes (aucune version en double)', () => {
    for (const c of B) {
      const e = byId.get(c.id);
      const sums = new Set(Array.from({ length: seedCount(e) }, (_, k) => renderChoice(e, { seed: k + 1 }).samples.reduce((s, v, i) => s + v * ((i % 7) + 1), 0).toFixed(6)));
      expect(sums.size, c.id).toBe(seedCount(e));
    }
  });

  it('réparation : la durée suit la durée de pose (0,4 à 1,8 s) ; tampon nommé par durée', () => {
    const e = byId.get('planche-posee');
    expect(durationRange(e)).toEqual({ min: 0.4, max: 1.8 });
    expect(renderChoice(e, { seed: 2, durationSec: 0.8 }).duration).toBeCloseTo(0.8, 3);
    expect(bufferName('planche-posee', 2, 0.8, e)).toBe('planche-posee@80-2');
    expect(bufferName('planche-posee', 2, 1.8, e)).toBe('planche-posee-2');
    expect(bufferName('pas', 3, 0.8, byId.get('pas'))).toBe('pas-3');
  });
});

describe('tirage sans répétition immédiate', () => {
  it.each(B.filter((c) => c.seeds > 1).map((c) => [c.id, c.seeds]))('%s : 300 tirages de pickVariant, jamais deux fois la même version, toutes tirées', (_, n) => {
    let rng = createRng(11);
    let last = null;
    const seen = new Set();
    for (let i = 0; i < 300; i += 1) {
      const r = pickVariant(n, last, rng);
      expect(r.variant).not.toBe(last);
      expect(r.variant).toBeGreaterThanOrEqual(0);
      expect(r.variant).toBeLessThan(n);
      seen.add(r.variant);
      last = r.variant;
      rng = r.rng;
    }
    expect(seen.size).toBe(n);
  });
});

describe('directeur de sons : accueil des nouveaux tampons', () => {
  const table = soundTable(sounds);
  const oldTable = soundTable([...sounds.filter((s) => !isAtelier(s)), ...legacy]);
  const cfg = (t) => ({ audio, voice, materials: { sounds: {} }, sounds: t });
  const frame = (events, time = 1) => ({ time, listener: { x: 0, y: 0 }, walls: [], paused: false, events });

  it('voix par type : identifiant du type, hauteur 1 ; pack d\'avant : son commun à la hauteur du type', () => {
    expect(voiceFor(table, 'zombie-mort', 'petit', audio.zombieRate)).toEqual({ sound: 'zombie-mort-petit', rate: 1 });
    expect(voiceFor(table, 'zombie-mort', 'marcheur', audio.zombieRate)).toEqual({ sound: 'zombie-mort', rate: 1 });
    expect(voiceFor(oldTable, 'zombie-mort', 'petit', audio.zombieRate)).toEqual({ sound: 'zombie-mort', rate: audio.zombieRate.petit });
    expect(voiceFor(table, 'zombie-grognement', 'grand', audio.zombieRate)).toEqual({ sound: 'zombie-grognement', rate: audio.zombieRate.grand });
  });

  it.each(['petit', 'voute', 'grand', 'marcheur'])('zombie %s touché, tué et qui attaque : la voix de son type', (kind) => {
    const suffix = kind === 'marcheur' ? '' : `-${kind}`;
    const out = direct(createDirector(1), frame([{ type: 'zombieHit', x: 50, y: 0, killed: false, zombie: kind }, { type: 'zombieHit', x: 60, y: 0, killed: true, zombie: kind }, { type: 'zombieAttack', x: 20, y: 0, zombie: kind }]), cfg(table));
    const names = out.requests.map((r) => r.sound);
    expect(names).toEqual(expect.arrayContaining([`zombie-blessure${suffix}`, `zombie-mort${suffix}`, `zombie-attaque${suffix}`]));
    for (const r of out.requests.filter((q) => q.category === 'voix')) expect(r.rate).toBe(1);
  });

  it('réparation de l\'atelier : au début de la pose (durée, reprise), rien à la planche posée ; arrêt si interrompue', () => {
    const start = direct(createDirector(1), frame([{ type: 'plankRepairStart', x: 10, y: 0, windowId: 'F1', duration: 1.2, progress: 0.25 }]), cfg(table));
    expect(start.requests).toHaveLength(1);
    expect(start.requests[0]).toMatchObject({ sound: 'planche-posee', durationSec: 1.2, key: 'F1' });
    expect(start.requests[0].offset).toBeCloseTo(0.3, 6);
    expect(direct(createDirector(1), frame([{ type: 'plankRepaired', x: 10, y: 0, windowId: 'F1' }]), cfg(table)).requests).toEqual([]);
    expect(direct(createDirector(1), frame([{ type: 'plankRepairStop', windowId: 'F1' }]), cfg(table)).stops).toEqual([{ sound: 'planche-posee', key: 'F1' }]);
  });

  it('pack d\'avant : la planche posée sonne à la fin de la pose, jamais au début', () => {
    expect(direct(createDirector(1), frame([{ type: 'plankRepairStart', x: 10, y: 0, windowId: 'F1', duration: 1.2, progress: 0 }]), cfg(oldTable)).requests).toEqual([]);
    expect(direct(createDirector(1), frame([{ type: 'plankRepaired', x: 10, y: 0, windowId: 'F1' }]), cfg(oldTable)).requests.map((r) => r.sound)).toEqual(['planche-posee']);
    expect(direct(createDirector(1), frame([{ type: 'plankRepairStop', windowId: 'F1' }]), cfg(oldTable)).stops).toEqual([]);
  });

  it('autre étage : réparation étouffée (× floorGain, passe-bas floorLowpass)', () => {
    const f = { ...frame([{ type: 'plankRepairStart', x: 10, y: 0, windowId: 'F1', duration: 1.8, progress: 0, floor: 'etage' }]), floor: 'rdc' };
    const r = direct(createDirector(1), f, cfg(table)).requests[0];
    expect(r.lowpass).toBe(true);
    expect(r.lowpassHz).toBe(audio.floorLowpass);
    expect(r.gain).toBeCloseTo(audio.floorGain, 6);
  });

  it('pause : rien ne sonne (ni réparation, ni voix)', () => {
    const out = direct(createDirector(1), { ...frame([{ type: 'plankRepairStart', x: 10, y: 0, windowId: 'F1', duration: 1.8 }, { type: 'zombieHit', x: 1, y: 1, zombie: 'petit' }]), paused: true }, cfg(table));
    expect(out.requests).toEqual([]);
  });
});

describe('?sons= : mode des sons', () => {
  it.each(SOUND_MODES)('« %s » est reconnu', (m) => {
    expect(parseSoundMode(`?sons=${m}`)).toBe(m);
  });
  it.each(['', '?sons=', '?sons=a', '?sons=D', '?sons=CHOIX', '?sons=ancien2', '?sons=%3Cscript%3E', '?sons=ancien&sons=B', '?sons=__proto__', '?sons=constructor', '?autre=1'])('« %s » : défaut, sans erreur', (q) => {
    expect(parseSoundMode(q)).toBe(DEFAULT_MODE);
  });
  it('accepte un URLSearchParams et un objet hostile sans lever', () => {
    expect(parseSoundMode(new URLSearchParams('sons=B'))).toBe('B');
    expect(parseSoundMode({ getAll: () => { throw new Error('x'); } })).toBe(DEFAULT_MODE);
    expect(parseSoundMode(null)).toBe(DEFAULT_MODE);
  });
  it('?sons= n\'est pas un paramètre du mode essai (save.json, readOnlyParams)', () => {
    expect(read('data/game/save.json').readOnlyParams ?? []).not.toContain('sons');
  });
  it('A, B, C : la variante demandée avec les réglages par défaut ; un emplacement sans cette variante garde le choix', () => {
    const spec = renderSpec(byId.get('pas'), { mode: 'B', slots });
    expect(spec.variant).toBe('B');
    expect(spec.macros).toEqual({});
    const choix0 = renderSpec(byId.get('pas'), { mode: 'choix', slots });
    expect(choix0.variant).toBe('C');
    expect(choix0.macros).toEqual(byId.get('pas').atelier.macros);
    const noD = renderSpec(byId.get('pas'), { mode: 'D', slots });
    expect(noD.variant).toBe('C');
  });
});

describe('chargeur : aucun octet du pack ancien par défaut', () => {
  it('sound-loader.js et audio.js n\'importent le pack ancien et l\'atelier que dynamiquement', () => {
    for (const f of ['js/game/sound-loader.js', 'js/game/audio.js', 'js/game/main.js']) {
      const src = readFileSync(f, 'utf8');
      expect(src, f).not.toMatch(/^import[^;]*sound-legacy/m);
      expect(src, f).not.toMatch(/^import[^;]*sound-atelier'/m);
      expect(src, f).not.toMatch(/^import[^;]*sounds-legacy\.json/m);
    }
    expect(readFileSync('js/game/sound-loader.js', 'utf8')).toMatch(/import\('\.\/sound-legacy\.js'\)/);
  });
  it('mode choix : les tâches restent les mêmes (aucun chargement du pack ancien)', async () => {
    const jobs = planSounds(sounds, 'essentiel');
    expect(await resolveJobs(jobs, 'choix')).toBe(jobs);
    expect(await resolveJobs(jobs, 'B')).toBe(jobs);
  });
  it('planSounds : les versions préchargées de chaque son de l\'atelier, nommées id-k', () => {
    const jobs = planSounds(sounds);
    for (const c of B) {
      const e = byId.get(c.id);
      expect(jobs.filter((j) => j.recipe.id === c.id).map((j) => j.name)).toEqual(Array.from({ length: e.preload ?? e.variants }, (_, k) => `${c.id}-${k + 1}`));
    }
  });
});

describe('poids et mémoire (limite de huit mégaoctets levée par le propriétaire)', () => {
  // Décision du propriétaire (lot 3h) : plus aucun plafond de conception. Seul garde-fou : 64 Mo, valeur PROVISOIRE pour attraper une
  // erreur de génération (emballement), pas une limite de conception.
  const RUNAWAY_GUARD_BYTES = 64 * 1024 * 1024;
  const items = [];
  for (const s of sounds) {
    if (!isAtelier(s)) continue;
    for (let k = 1; k <= seedCount(s); k += 1) items.push(renderChoice(s, { seed: k }));
  }
  const stats = packStats(items);

  it('packStats : octets = somme des tampons × 4, mémoire décodée = échantillons × 4 × canaux (mono)', () => {
    expect(stats.bytes).toBe(items.reduce((n, i) => n + i.samples.length * 4, 0));
    expect(stats.decodedBytes).toBe(stats.bytes);
    expect(packStats([{ samples: new Float32Array(10), channels: 2 }])).toEqual({ buffers: 1, samples: 10, bytes: 40, decodedBytes: 80 });
    expect(packStats(null)).toEqual({ buffers: 0, samples: 0, bytes: 0, decodedBytes: 0 });
    console.info(`sons de l'atelier intégrés : ${stats.buffers} tampons, ${stats.bytes} octets (${(stats.bytes / 1048576).toFixed(2)} Mo), mémoire décodée estimée ${(stats.decodedBytes / 1048576).toFixed(2)} Mo`);
  });

  it('garde-fou d\'emballement (provisoire) : le pack de l\'atelier reste sous 64 Mo', () => {
    expect(stats.bytes).toBeLessThan(RUNAWAY_GUARD_BYTES);
  });

  it('plus aucune comparaison à la limite de huit mégaoctets dans le code, les données, les pages, les scripts et les tests', () => {
    // Motif construit par morceaux, pour que ce test ne se trouve pas lui-même (les huit mégaoctets écrits de toutes les façons connues).
    const eight = 8;
    const pattern = [`(^|[^0-9.,])${eight} ?M` + 'o\\b', `(^|[^0-9.,])${eight} ?MB\\b`, `\\b${2 ** 23}\\b`, `(^|[^0-9.])${eight * 1e6}\\b`, `${eight}_000_000`.replace('_000_000', '_0{3}_0{3}'), `${eight} \\* 1024 \\* 1024`, `${eight} \\* ${2 ** 20}`].join('|');
    const out = git(`grep -nIE "${pattern}" -- js data scripts tests '*.html' css`);
    if (out === null) return; // aucune correspondance (git grep sort en erreur) ou pas de dépôt
    expect(out.split('\n').filter(Boolean)).toEqual([]);
  });
});

describe('hygiène du lot 3i', () => {
  const code = (f) => readFileSync(f, 'utf8').split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
  it('js/core/sound-choice.js : ni Math.random, Date.now, document, window, réseau, stockage ni horloge', () => {
    expect(code('js/core/sound-choice.js')).not.toMatch(/Math\.random|Date\.now|performance\.now|\bdocument\b|(?<![\w.'-])window\s*[.[(]|\bfetch\s*\(|localStorage|sessionStorage|setTimeout|AudioContext/);
  });
  it('js/core/ entier : aucun Math.random, Date.now, document ni window', () => {
    for (const f of readdirSync('js/core').filter((n) => n.endsWith('.js'))) expect(code(`js/core/${f}`), f).not.toMatch(/Math\.random|Date\.now|\bdocument\.|(?<![\w.'-])window\s*[.[(]/);
  });
  it('aucun fichier audio, image ou police ajouté par le lot', () => {
    const base = git('merge-base HEAD origin/lot-4b')?.trim();
    if (!base) return;
    const added = (git(`diff --name-only --diff-filter=A ${base}`) ?? '').split('\n').filter(Boolean);
    expect(added.filter((f) => /\.(mp3|ogg|wav|flac|m4a|aac|png|jpe?g|gif|webp|svg|ico|woff2?|ttf|otf)$/i.test(f))).toEqual([]);
  });
  // data/changelog.json : entrée lot-3i ajoutée à la demande du propriétaire (CI rouge sans elle : data-changelog exige une entrée par bilan).
  it('fichiers interdits au lot inchangés', () => {
    const base = git('merge-base HEAD origin/lot-4b')?.trim();
    if (!base) return;
    // Lot 3l (interface intégrée) : jeu.html, css/game.css, js/game/hud.js et js/game/ui.js sont modifiés par ce lot autorisé, sur sa branche puis dans lot-4b.
    // Lot 3l (demande du propriétaire) : js/game/main.js reçoit ?fin=monde (aperçu de l'écran de victoire, mode essai seulement).
    const files = ['index.html', 'js/game/world.js', 'js/game/character.js', 'js/game/effects.js', 'CLAUDE.md', 'Docs/ref/conventions.md', 'Docs/seed.md', 'tests/unit/data-changelog.test.js', 'tests/e2e/dev.spec.js', '.github', 'package.json', 'package-lock.json', 'data/game/save.json'];
    expect((git(`diff --name-only ${base} -- ${files.join(' ')}`) ?? '').split('\n').filter(Boolean)).toEqual([]);
  });
  it('apercu.txt : jeu.html, hifi (titre « Sons intégrés » sur lot-3i, celui de lot-4b après la fusion)', () => {
    const text = readFileSync('apercu.txt', 'utf8').split('\n');
    expect(text[0]).toBe('jeu.html');
    expect(text).toContain('type: hifi');
    expect(text.some((l) => l === 'titre: Sons intégrés' || l === 'titre: Intégration des refontes' || l === 'titre: Interface intégrée')).toBe(true); // lot 3l : sa branche
  });
  it('les textes de sons.html du lot sont dans un fichier séparé (data/i18n/sons-integres.json, clés dev.* en français)', () => {
    expect(existsSync('data/i18n/sons-integres.json')).toBe(true);
    for (const k of Object.keys(read('data/i18n/sons-integres.json'))) expect(k.startsWith('dev.sons.')).toBe(true);
  });
});
