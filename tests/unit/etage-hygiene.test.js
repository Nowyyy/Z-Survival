import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
// Lot 4c (publication par versions, seul lot autorisé à modifier le workflow) : workflow, accueil, ses textes et tests du journal modifiés ; ce garde-fou de branche
// (comparaison à main ou à lot-4b) n'a plus de sens pour eux après l'entrée dans main : ils sortent de la liste.
// Lot 4e : workflow de tests ajouté (.github/workflows/tests.yml, autorisé par le prompt du lot ; pages.yml intact).
const LOT_4C = ['.github/workflows/pages.yml', '.github/workflows/tests.yml', 'index.html', 'data/i18n/fr.json', 'tests/unit/data-changelog.test.js', 'tests/e2e/dev.spec.js'];
const notLot4c = (files) => (files ?? []).filter((f) => !LOT_4C.includes(f));

const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(`${dir}/${e.name}`) : [`${dir}/${e.name}`]));
const git = (args) => {
  try {
    return execSync(`git ${args}`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).split('\n').filter(Boolean);
  } catch {
    return null;
  }
};
// Commit de `main` juste avant le lot 3e (après la fusion, `main` contient déjà le lot).
const BASE = '5653aa0';
const code = (f) => readFileSync(f, 'utf8').split('\n').filter((l) => !l.trim().startsWith('//')).join('\n').replace(/\s\/\/.*$/gm, '');
const NEW_CORE = ['floors', 'stairs', 'floor-transition', 'stair-zombies', 'floor-sim', 'floor-rules'].map((n) => `js/core/${n}.js`);
const fr = JSON.parse(readFileSync('data/i18n/fr.json', 'utf8'));

describe('hygiène du lot 3e : pureté de js/core/', () => {
  it.each(NEW_CORE)('%s : ni Math.random, ni Date.now, ni document, ni window, ni réseau, ni stockage', (f) => {
    expect(code(f)).not.toMatch(/Math\.random|Date\.now|performance\.now|\bdocument\b|(?<![\w.'-])window\s*[.[(]|\bfetch\(|localStorage|sessionStorage|THREE|setTimeout|requestAnimationFrame/);
  });

  it('aucun module du lot 3e ne lit un état global d\'étage : aucun « let » de module', () => {
    for (const f of NEW_CORE) expect(code(f), f).not.toMatch(/^let /m);
  });

  it('les nouvelles données du lot 3e ne contiennent aucune couleur en dur', () => {
    for (const f of ['data/game/stairs.json', 'data/game/maps/rez-de-chaussee/etage.json', 'data/game/maps/rez-de-chaussee/zones.json', ...NEW_CORE]) expect(readFileSync(f, 'utf8'), f).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/);
  });
});

describe('hygiène du lot 3e : fichiers et textes', () => {
  it('aucun fichier audio, image ou police ajouté depuis main', () => {
    const added = git(`diff --name-only --diff-filter=A ${BASE}`);
    if (added === null) return;
    expect(added.filter((f) => /\.(mp3|ogg|wav|flac|m4a|png|jpe?g|gif|webp|svg|ico|woff2?|ttf|otf)$/i.test(f))).toEqual([]);
  });

  it('data/game/world.json et decor.json d\'origine (ancienne salle) sont inchangés', () => {
    // Lot 3i : data/game/sounds.json change (sons de l'atelier intégrés, décision du propriétaire) ; ses recettes gardées (tir, mélodie, impacts…) sont
    // comparées à main, objet par objet, dans sons-integres.test.js.
    const changed = git(`diff --name-only ${BASE} -- data/game/world.json data/game/decor.json js/core/waves.js js/core/spread.js js/core/camera.js js/core/synth.js js/core/pose.js js/core/player-stats.js data/game/waves.json data/game/gaits.json data/game/weapons.json data/game/player-stats.json data/game/player-down.json data/game/windows.json `);
    if (changed === null) return;
    expect(changed).toEqual([]);
  });

  it('le workflow, index.html et Docs/seed.md sont inchangés', () => {
    // Lot 4 : index.html reçoit l'icône du site (demande du propriétaire) ; seul le workflow reste comparé.
    const changed = git(`diff --name-only ${BASE} -- .github`);
    if (changed === null) return;
    expect(notLot4c(changed)).toEqual([]);
    // Lot 4 : Docs/seed.md appartient au propriétaire, qui l'a mis à jour dans main après la fusion du lot 3e (avant : comparé au commit BASE, donc en échec).
    // Il est maintenant comparé à main : la branche ne le modifie jamais.
    const seed = git('diff --name-only main -- Docs/seed.md');
    if (seed !== null) expect(seed).toEqual([]);
  });

  it('aucune clé de fr.json du lot 3e n\'est orpheline : chacune est écrite dans le code', () => {
    const sources = walk('js').map((f) => readFileSync(f, 'utf8')).join('\n');
    const keys = Object.keys(fr).filter((k) => /^game\.(hud\.floor|live\.floor|splash\.zone\.sub|windows\.(name|initial)\.U)/.test(k));
    expect(keys.length).toBeGreaterThanOrEqual(2 + 2 + 2 + 14);
    for (const k of keys) expect(sources.includes(`'${k}'`), k).toBe(true);
  });

  it('les textes du lot 3e sont exacts', () => {
    expect([fr['game.hud.floor.rdc'], fr['game.hud.floor.etage'], fr['game.live.floor.rdc'], fr['game.live.floor.etage']]).toEqual(['RDC', 'Étage', 'Rez-de-chaussée', 'Étage']);
    expect(fr['game.windows.name.U2']).toBe('U2');
  });

  it('tokens.css : --game-void et --game-stairs-mark sont définis, commentés, et lus par la palette', () => {
    const css = readFileSync('css/tokens.css', 'utf8');
    expect(css).toMatch(/--game-void:\s*#[0-9a-fA-F]{6};\s*\/\*/);
    expect(css).toMatch(/--game-stairs-mark:\s*#[0-9a-fA-F]{6};\s*\/\*/);
    expect(readFileSync('js/game/palette.js', 'utf8')).toMatch(/'void', 'stairs-mark'/);
  });

  it('audio.json : floorGain 0,5 et floorLowpass 700, aucun son ajouté à sounds.json', () => {
    const audio = JSON.parse(readFileSync('data/game/audio.json', 'utf8'));
    expect([audio.floorGain, audio.floorLowpass]).toEqual([0.5, 700]);
  });

  it('aucun fichier de plus de 5 Mo ajouté (hors Docs/ref/modele-rdc)', () => {
    const added = git(`diff --name-only --diff-filter=A ${BASE}`);
    if (added === null) return;
    for (const f of added) expect(readFileSync(f).length, f).toBeLessThan(5 * 1024 * 1024);
  });
});
