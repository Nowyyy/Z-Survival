import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { seedProblems } from './helpers/seed.js';
import { bilansChangesDepuis } from '../../scripts/docs/bilans.mjs';
// Lot 4c (publication par versions, seul lot autorisé à modifier le workflow) : workflow, accueil, ses textes et tests du journal modifiés ; ce garde-fou de branche
// (comparaison à main ou à lot-4b) n'a plus de sens pour eux après l'entrée dans main : ils sortent de la liste.
// Lot 4e : workflow de tests ajouté (.github/workflows/tests.yml, autorisé par le prompt du lot ; pages.yml intact).
const LOT_4C = ['.github/workflows/pages.yml', '.github/workflows/tests.yml', 'index.html', 'data/i18n/fr.json', 'tests/unit/data-changelog.test.js', 'tests/e2e/dev.spec.js'];
const notLot4c = (files) => (files ?? []).filter((f) => !LOT_4C.includes(f));

const git = (args) => {
  try {
    return execSync(`git ${args}`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).split('\n').filter(Boolean);
  } catch {
    return null; // pas de dépôt git ou de branche main : rien à comparer
  }
};
// Commit de `main` juste avant le lot 3c : après la fusion, `main` contient déjà le lot.
const BASE = '5669eb1';
const showMain = (path) => {
  try {
    return JSON.parse(execSync(`git show ${BASE}:${path}`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }));
  } catch {
    return null;
  }
};
const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(`${dir}/${e.name}`) : [`${dir}/${e.name}`]));
const fr = JSON.parse(readFileSync('data/i18n/fr.json', 'utf8'));
const code = (f) => readFileSync(f, 'utf8').split('\n').filter((l) => !l.trim().startsWith('//')).join('\n').replace(/\s\/\/.*$/gm, '');
const strip = (o) => Object.fromEntries(Object.entries(o).filter(([k]) => k !== '_provisoire'));

describe('hygiène du lot 3c : pureté et fichiers', () => {
  it('js/core/zones.js ne touche ni Math.random, ni Date.now, ni document, ni window, ni le réseau, et n\'importe que floors.js, shape.js et vec.js (lot 3e : floors.js)', () => {
    const src = code('js/core/zones.js');
    expect(src).not.toMatch(/Math\.random|Date\.now|performance\.now|\bdocument\.|\bwindow\.|\bfetch\(|localStorage|sessionStorage|document\.cookie/);
    expect([...src.matchAll(/from '([^']+)'/g)].map((m) => m[1]).sort()).toEqual(['./floors.js', './shape.js', './vec.js']);
  });

  it('aucun Math.random, Date.now, document ni window dans js/core/ (wave-director, wave-splash, zones, layout, nav, siege compris)', () => {
    for (const f of walk('js/core').filter((n) => n.endsWith('.js'))) {
      expect(code(f), f).not.toMatch(/Math\.random|Date\.now|\bdocument\b|\bwindow\./);
    }
  });

  it('aucun fichier audio, image ou police ajouté depuis main (hors Docs/ref/modele-rdc/, exception documentée)', () => {
    const added = git('diff --name-only --diff-filter=A main');
    if (added === null) return;
    const files = [...added, ...(git('ls-files --others --exclude-standard') ?? [])].filter((f) => !f.startsWith('Docs/ref/modele-rdc/'));
    expect(files.filter((f) => /\.(wav|mp3|ogg|m4a|flac|webm|aac|opus|aiff?|png|jpe?g|gif|webp|avif|ico|bmp|svg|woff2?|ttf|otf|eot)$/i.test(f))).toEqual([]);
  });

  it('règles de tir, statistiques, chutes, caméra, sons, textures, fenêtres, ancienne salle et plan des murs : git diff vide', () => {
    // Lot 3i : data/game/sounds.json change (sons de l'atelier intégrés, décision du propriétaire) ; ses recettes gardées (tir, mélodie, impacts…) sont
    // comparées à main, objet par objet, dans sons-integres.test.js.
    const changed = git('diff --name-only main -- js/core/waves.js js/core/spread.js js/core/player-stats.js js/core/camera.js js/core/synth.js data/game/gaits.json data/game/weapons.json data/game/player-stats.json data/game/player-down.json data/game/windows.json  data/game/world.json data/game/decor.json');
    if (changed !== null) expect(changed).toEqual([]);
  });

  it('le workflow, Docs/seed.md et les bilans existants sont inchangés (index.html : icône du site ajoutée au lot 4)', () => {
    // Lot 5b : Docs/seed.md n'est plus comparé à un commit figé (le propriétaire le met à jour) : seuls ses commits le modifient (tests/unit/helpers/seed.js).
    const seed = seedProblems();
    if (seed !== null) expect(seed).toEqual([]);
    // Lot 5m : les bilans sont comparés à main par leur texte, séparés ou regroupés (scripts/docs/bilans.mjs), vrai avant et après la
    // publication du regroupement ; avant : `git diff --name-only main -- .github Docs/lots/lot-1.md … Docs/lots/lot-3b.md` (une assertion).
    const changed = git('diff --name-only main -- .github');
    if (changed !== null) expect(notLot4c(changed)).toEqual([]);
    const bilans = bilansChangesDepuis('main', ['lot-1', 'lot-2', 'lot-2b', 'lot-2c', 'lot-3', 'lot-3a', 'lot-3b']);
    if (bilans !== null) expect(bilans).toEqual([]);
  });

  it('aucune dépendance d\'exécution ni nouvelle dépendance de développement', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
    expect(pkg.dependencies ?? {}).toEqual({});
    const before = showMain('package.json');
    if (before) expect(pkg.devDependencies).toEqual(before.devDependencies);
  });

  it('la carte ne change pas les murs, fenêtres, piliers, escalier, départ ni contour : seul le mobilier est complété', () => {
    const before = showMain('data/game/maps/rez-de-chaussee/plan.json');
    if (!before) return;
    const now = JSON.parse(readFileSync('data/game/maps/rez-de-chaussee/plan.json', 'utf8'));
    for (const key of ['bbox', 'contour', 'walls', 'openings', 'pillarSize', 'pillars', 'ramp', 'start']) expect(now[key], key).toEqual(before[key]);
    // Lot 3g (avant : fenêtres identiques) : les fenêtres ne changent que par ecarts-decisions.json (recalage de 50 au plus, ou F7 retirée à la demande du propriétaire).
    const { decisions } = JSON.parse(readFileSync('data/game/maps/rez-de-chaussee/ecarts-decisions.json', 'utf8'));
    const removed = decisions.filter((d) => d.floor === 'rdc' && d.action === 'retirer' && d.approved === true).map((d) => d.id);
    expect(now.windows.map((w) => w.id), 'windows').toEqual(before.windows.map((w) => w.id).filter((id) => !removed.includes(id)));
    for (const w of now.windows) expect(w, w.id).toEqual(before.windows.find((q) => q.id === w.id));
    // Lot 3e : l'escalier existant est seulement marqué (role) et le second escalier est ajouté ; rien d'autre ne change.
    // Lot 3e (mise à jour) : l'emprise de l'escalier courbe est redessinée (escalier physique arrondi).
    const strip = (list) => list.map((st) => (st.id === 'escalier-courbe' ? { id: st.id } : Object.fromEntries(Object.entries(st).filter(([k]) => k !== 'role'))));
    expect(strip(now.stairs.slice(0, before.stairs.length)), 'stairs').toEqual(strip(before.stairs));
  });
});

describe('hygiène du lot 3c : données et textes', () => {
  it('waves.json et splash.json : toutes les clés d\'avant sont intactes, seules des clés sont ajoutées', () => {
    for (const f of ['waves', 'splash']) {
      const before = showMain(`data/game/${f}.json`);
      if (!before) continue;
      const now = JSON.parse(readFileSync(`data/game/${f}.json`, 'utf8'));
      for (const [k, v] of Object.entries(strip(before))) expect(now[k], `${f}.${k}`).toEqual(v);
      expect(Object.keys(now).length).toBeGreaterThan(Object.keys(before).length);
    }
  });

  it('les nouvelles clés de waves.json sont celles du prompt : 40 manches, pause de 12 s, annonce à 3,0 s, ouverture à 3,6 s, enfoncement de 1,2 s', () => {
    const w = JSON.parse(readFileSync('data/game/waves.json', 'utf8'));
    expect([w.wavesPerWorld, w.doorIntermission, w.doorSplashAt, w.doorOpenAt, w.doorSinkTime]).toEqual([40, 12, 3, 3.6, 1.2]);
    expect(w._provisoire).toMatch(/provisoire/);
  });

  it('textes de zone dans fr.json, avec leurs gabarits, et aucun texte de zone en dur dans js/core/ ni dans le HUD', () => {
    expect(fr['game.splash.zone.title']).toBe('Nouvelle zone');
    expect(fr['game.splash.zone.subtitle']).toBe('Une porte s\'ouvre');
    expect(fr['game.pause.nextZone']).toBe('Prochaine zone : manche {n}');
    expect(fr['game.end.world']).toBe('Monde terminé');
    expect(fr['game.live.zone']).toMatch(/Nouvelle zone/);
    expect(fr['game.live.world']).toMatch(/Monde terminé/);
    for (const f of walk('js/core')) expect(code(f), f).not.toMatch(/Nouvelle zone|Monde terminé|Prochaine zone/);
  });

  it('chaque clé de zone de fr.json est utilisée dans le code (aucune orpheline)', () => {
    const sources = walk('js').map((f) => readFileSync(f, 'utf8')).join('\n');
    for (const k of Object.keys(fr).filter((q) => /^game\.(splash\.zone|pause\.nextZone|end\.world|live\.zone|live\.world)/.test(q))) expect(sources.includes(`'${k}'`), k).toBe(true);
  });

  it('aucune couleur en dur dans zones.json, zones.js ni les nouveaux textes ; zones.json est marqué provisoire et ses portes planned n\'ont pas d\'ouverture', () => {
    const raw = readFileSync('data/game/maps/rez-de-chaussee/zones.json', 'utf8');
    expect(raw).toMatch(/provisoire/i);
    expect(raw + readFileSync('js/core/zones.js', 'utf8')).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/);
    const z = JSON.parse(raw);
    for (const d of z.doors.filter((q) => q.planned)) expect(d.opening).toBeNull();
    expect(z.doors.filter((q) => !q.planned)).toHaveLength(3); // lot 3e : les portes 1, 2 (escalier de l'aile) et 3 (second escalier et porte de l'étage)
  });

  it('Docs/ref/modele-rdc/ n\'existe pas (aucun modèle 3D fourni) : le mobilier ajouté est donc marqué provisoire', () => {
    expect(existsSync('Docs/ref/modele-rdc')).toBe(false);
    const plan = JSON.parse(readFileSync('data/game/maps/rez-de-chaussee/plan.json', 'utf8'));
    expect(plan.furniture.filter((f) => f.provisional === true).length).toBeGreaterThanOrEqual(8);
  });
});
