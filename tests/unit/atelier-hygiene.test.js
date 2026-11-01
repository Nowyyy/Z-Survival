import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { renderSound, variantCount } from '../../js/core/synth.js';
import { dbfs, shortLevel } from '../../js/core/audio-analysis.js';

// Lot 3h : hygiène de l'atelier des sons. Le jeu, son moteur sonore et ses sons restent intacts ; les nouveaux modules sont purs ;
// les données de l'atelier renvoient à de vrais sons du jeu.
const git = (args) => {
  try {
    return execSync(`git ${args}`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    return null;
  }
};
// Base de comparaison : origin/main si elle existe (CI, session), sinon main ; null si aucune (copie sans dépôt) : tests sautés.
const BASE = ['origin/main', 'main'].find((b) => git(`rev-parse --verify --quiet ${b}`) !== null) ?? null;
const NEW_CORE = ['audio-analysis', 'synth2', 'synth2-dsp', 'synth2-sources', 'atelier-check'].map((n) => `js/core/${n}.js`);
// Moteur sonore existant, page des sons actuels et tests de sons : jamais modifiés par ce lot.
const ENGINE = ['js/core/synth.js', 'js/core/sound-director.js', 'js/core/audio-mix.js', 'js/core/zombie-voice.js', 'js/core/footsteps.js', 'js/game/audio.js', 'js/game/sound-loader.js',
  'data/game/sounds.json', 'data/game/audio.json', 'data/game/zombie-voice.json', 'data/game/sound-materials.json', 'sons.html', 'js/sons/main.js', 'css/sons.css', 'scripts/planche-sons.mjs',
  'tests/unit/core-synth.test.js', 'tests/unit/data-sons.test.js', 'tests/unit/data-sons-lot3.test.js', 'tests/unit/data-annonce-sons.test.js', 'tests/unit/core-audio-mix.test.js', 'tests/unit/core-sound-director.test.js',
  'tests/unit/core-zombie-voice.test.js', 'tests/unit/core-audio-lot3.test.js', 'tests/unit/core-ambiance-audio.test.js', 'tests/unit/helpers/dsp.js', 'tests/e2e/jeu-sons.spec.js', 'tests/e2e/jeu-voix.spec.js', 'tests/e2e/sons-page.spec.js'];
const GAME = ['jeu.html', 'js/game', 'css/game.css', 'index.html', 'CLAUDE.md', 'Docs/ref/conventions.md', 'Docs/seed.md', 'data/changelog.json', 'tests/unit/data-changelog.test.js', 'tests/e2e/dev.spec.js', '.github'];
const code = (f) => readFileSync(f, 'utf8').split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
const atelier = JSON.parse(readFileSync('data/game/sounds-atelier.json', 'utf8'));
const { sounds } = JSON.parse(readFileSync('data/game/sounds.json', 'utf8'));
const audio = JSON.parse(readFileSync('data/game/audio.json', 'utf8'));
const ids = new Set(sounds.map((s) => s.id));

describe('hygiène du lot 3h : pureté et fichiers', () => {
  it.each(NEW_CORE)('%s : ni Math.random, Date.now, performance.now, document, window, réseau, stockage, minuteur ni Web Audio', (f) => {
    expect(code(f)).not.toMatch(/Math\.random|Date\.now|performance\.now|\bdocument\b|(?<![\w.'-])window\s*[.[(]|\bfetch\s*\(|localStorage|sessionStorage|indexedDB|setTimeout|setInterval|requestAnimationFrame|AudioContext|AudioBuffer|THREE/);
  });

  it('aucun fichier audio, image, police ou modèle ajouté depuis main', () => {
    if (!BASE) return;
    const added = [...(git(`diff --name-only --diff-filter=A ${BASE}`) ?? '').split('\n'), ...(git('ls-files --others --exclude-standard') ?? '').split('\n')].filter(Boolean);
    expect(added.filter((f) => /\.(wav|mp3|ogg|m4a|flac|webm|aac|opus|aiff?|png|jpe?g|gif|webp|avif|ico|bmp|svg|woff2?|ttf|otf|eot|glb|gltf|obj)$/i.test(f))).toEqual([]);
  });

  it('le moteur sonore existant, sa page d\'écoute et ses tests sont inchangés (diff vide)', () => {
    if (!BASE) return;
    expect((git(`diff --name-only ${BASE} -- ${ENGINE.join(' ')}`) ?? '').split('\n').filter(Boolean)).toEqual([]);
  });

  it('le jeu (jeu.html, js/game/, css/game.css), index.html, CLAUDE.md, conventions, seed, journal des versions et workflow sont inchangés', () => {
    if (!BASE) return;
    expect((git(`diff --name-only ${BASE} -- ${GAME.join(' ')}`) ?? '').split('\n').filter(Boolean)).toEqual([]);
  });

  it('les recettes de la mélodie, des annonces, du tir et des impacts sont identiques à celles de main', () => {
    if (!BASE) return;
    const before = JSON.parse(git(`show ${BASE}:data/game/sounds.json`)).sounds;
    for (const id of ['vague-annonce', 'vague-renforcee', 'vague-fin', 'tir', 'douille', 'impact-zombie', 'impact-bois', 'impact-metal', 'impact-pierre', 'impact-voiture']) {
      expect(sounds.find((s) => s.id === id), id).toEqual(before.find((s) => s.id === id));
    }
  });

  it('aucune dépendance nouvelle (dependencies et devDependencies inchangées)', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
    expect(pkg.dependencies ?? {}).toEqual({});
    if (!BASE) return;
    const before = JSON.parse(git(`show ${BASE}:package.json`));
    expect(pkg.devDependencies).toEqual(before.devDependencies);
  });

  it('aucune couleur en dur dans les nouveaux fichiers de js/ et de data/', () => {
    for (const f of [...NEW_CORE, 'data/game/sounds-atelier.json', 'scripts/sons/inventaire.mjs']) expect(readFileSync(f, 'utf8'), f).not.toMatch(/#[0-9a-fA-F]{3,8}\b|\b(?:rgb|rgba|hsl|hsla)\(/);
  });

  it('les scripts de scripts/sons/ n\'écrivent aucun fichier (sortie standard seulement)', () => {
    for (const f of readdirSync('scripts/sons').map((n) => `scripts/sons/${n}`)) expect(readFileSync(f, 'utf8'), f).not.toMatch(/writeFile|appendFile|createWriteStream|mkdirSync/);
  });

  it('synth2.js n\'importe pas js/core/synth.js (le moteur du jeu n\'est pas touché, pas même indirectement)', () => {
    for (const f of NEW_CORE) expect(readFileSync(f, 'utf8'), f).not.toMatch(/from '\.\/synth\.js'/);
  });
});

describe('données de l\'atelier (data/game/sounds-atelier.json)', () => {
  it('est marqué provisoire, versionné, au format du jeu (22 050 Hz, mono, Float32)', () => {
    expect(atelier._provisoire).toMatch(/PROVISOIRE/);
    expect(atelier.version).toBe(1);
    expect(atelier.sampleRate).toBe(22050);
    expect(sounds.filter((s) => s.category === 'voix').every((s) => s.sampleRate === atelier.sampleRate)).toBe(true);
    expect(atelier.format).toEqual({ channels: 1, type: 'Float32', bytesPerSample: 4 });
  });

  it('identifiants d\'emplacement uniques, une cible par emplacement, aucune cible orpheline', () => {
    const slotIds = atelier.slots.map((s) => s.id);
    expect(new Set(slotIds).size).toBe(slotIds.length);
    expect(Object.keys(atelier.targets).sort()).toEqual([...slotIds].sort());
  });

  it('chaque son « actuel » existe dans sounds.json (ou vaut null), avec la hauteur de lecture du jeu pour les voix', () => {
    for (const s of atelier.slots) {
      if (s.current !== null) expect(ids.has(s.current), s.id).toBe(true);
      if (s.group === 'voix') expect(Object.values(audio.zombieRate)).toContain(s.currentRate);
    }
  });

  it('chaque référence renvoie à un son existant de sounds.json : mélodie, annonces, tir, impacts', () => {
    for (const r of atelier.references) expect(ids.has(r.source), r.id).toBe(true);
    expect(atelier.references.map((r) => r.source)).toEqual(expect.arrayContaining(['vague-annonce', 'vague-renforcee', 'vague-fin', 'tir', 'impact-bois']));
  });

  it('le gain de catégorie de chaque emplacement (dB) est celui d\'audio.json', () => {
    for (const s of atelier.slots) expect(s.gainDb, s.id).toBeCloseTo(20 * Math.log10(audio.categoryGain[s.category]), 1);
  });

  it('le niveau de référence est le niveau court mesuré du tir du jeu (±0,2 dB)', () => {
    const tir = sounds.find((s) => s.id === 'tir');
    const levels = Array.from({ length: variantCount(tir) }, (_, v) => {
      const r = renderSound(tir, v);
      return dbfs(shortLevel(r.samples, r.sampleRate));
    });
    expect(Math.abs(levels.reduce((a, b) => a + b, 0) / levels.length - atelier.levelRef.dbfs)).toBeLessThan(0.2);
  });

  it('chaque cible est cohérente (bornes croissantes) et dit sa source (prompt ou agent)', () => {
    for (const [id, t] of Object.entries(atelier.targets)) {
      for (const k of ['duration', 'centroid', 'peakHz', 'f0', 'hnr', 'attackMs', 'hits']) if (t[k]) expect(t[k][0] < t[k][1], `${id}.${k}`).toBe(true);
      expect(['prompt', 'agent']).toContain(t.source);
    }
  });

  it('la priorité 1 couvre pas, voix (4 types × 4 actions), planches, fenêtre et joueur ; les pas d\'escalier y sont (ETAGE = oui)', () => {
    const p1 = atelier.slots.filter((s) => s.priority === 1);
    expect(existsSync('js/core/stair-walk.js')).toBe(true);
    for (const id of ['pas-joueur-dur', 'pas-joueur-exterieur', 'pas-joueur-escalier', 'pas-zombie-lent', 'pas-zombie-marche', 'pas-zombie-course', 'zombie-rampe', 'planche-arrachage', 'reparation', 'planche-craquement', 'planche-chute', 'escalade', 'joueur-souffle-terre', 'joueur-relevage']) {
      expect(p1.map((s) => s.id), id).toContain(id);
    }
    for (const type of ['marcheur', 'petit', 'voute', 'grand']) for (const a of ['errance', 'attaque', 'touche', 'mort']) expect(p1.map((s) => s.id)).toContain(`voix-${type}-${a}`);
  });
});
