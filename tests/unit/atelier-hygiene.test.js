// Lot 3g : hygiène de l'atelier de la carte (pureté des nouveaux modules, aucun fichier image, modèle ou son ajouté, règles inchangées).
import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { seedProblems } from './helpers/seed.js';
// Lot 4c (publication par versions, seul lot autorisé à modifier le workflow) : workflow, accueil, ses textes et tests du journal modifiés ; ce garde-fou de branche
// (comparaison à main ou à lot-4b) n'a plus de sens pour eux après l'entrée dans main : ils sortent de la liste.
// Lot 4e : workflow de tests ajouté (.github/workflows/tests.yml, autorisé par le prompt du lot ; pages.yml intact).
const LOT_4C = ['.github/workflows/pages.yml', '.github/workflows/tests.yml', 'index.html', 'data/i18n/fr.json', 'tests/unit/data-changelog.test.js', 'tests/e2e/dev.spec.js'];
const notLot4c = (files) => (files ?? []).filter((f) => !LOT_4C.includes(f));

const git = (args) => {
  try {
    return execSync(`git ${args}`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).split('\n').filter(Boolean);
  } catch {
    return null;
  }
};
// Commit de `main` au lancement du lot 3g (base de la branche lot-3g).
const BASE = '4b3f41c';
// main après le lot 4 (récupéré dans la branche lot-3g, sans fusion dans main).
const MAIN = 'c166e53';
const code = (f) => readFileSync(f, 'utf8').split('\n').filter((l) => !l.trim().startsWith('//')).join('\n').replace(/\s\/\/.*$/gm, '');
const NEW_CORE = ['releve', 'ecarts', 'ecarts-svg', 'visite', 'mobilier-aspect', 'portes-aspect', 'see-through', 'decor-vivant'].map((n) => `js/core/${n}.js`);
const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(`${dir}/${e.name}`) : [`${dir}/${e.name}`]));

describe('hygiène du lot 3g : modules purs', () => {
  it.each(NEW_CORE)('%s : ni Math.random, Date.now, document, window, réseau, stockage, horloge ni Three.js', (f) => {
    expect(code(f)).not.toMatch(/Math\.random|Date\.now|performance\.now|\bdocument\b|(?<![\w.'-])window\s*[.[(]|\bfetch\(|localStorage|sessionStorage|indexedDB|THREE|setTimeout|setInterval|requestAnimationFrame/);
  });

  it('aucun « let » de module (aucun état global)', () => {
    for (const f of NEW_CORE) expect(code(f), f).not.toMatch(/^let /m);
  });

  it('aucune couleur en dur dans les nouveaux modules, pages et données', () => {
    const files = [...NEW_CORE, 'js/visite/main.js', 'js/ecarts/main.js', 'data/game/maps/rez-de-chaussee/ecarts-decisions.json', 'visite.html', 'ecarts.html'];
    for (const f of files) expect(readFileSync(f, 'utf8'), f).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/);
  });
});

describe('hygiène du lot 3g : fichiers', () => {
  it('aucun fichier audio, image, police ou modèle 3D ajouté depuis la base', () => {
    const added = git(`diff --name-only --diff-filter=A ${BASE}`);
    if (added === null) return;
    expect(added.filter((f) => /\.(mp3|ogg|wav|flac|m4a|png|jpe?g|gif|webp|svg|ico|woff2?|ttf|otf|dae|skp|zip|glb|gltf|obj|fbx|kmz)$/i.test(f))).toEqual([]);
  });

  it('le modèle n\'est pas dans le dépôt (ni ses images)', () => {
    const tracked = git('ls-files') ?? walk('.').filter((f) => !f.includes('node_modules'));
    expect(tracked.filter((f) => /model\.dae|Sanstitre|Fencing_Wood_Old|material_\d+\.jpg/i.test(f))).toEqual([]);
  });

  it('les scripts de relevé sont versionnés dans scripts/modele/ et sans dépendance', () => {
    for (const f of ['scripts/modele/lecture_collada.py', 'scripts/modele/extraire.py', 'scripts/modele/releve.mjs', 'scripts/modele/rapport.mjs']) expect(existsSync(f), f).toBe(true);
    for (const f of ['scripts/modele/lecture_collada.py', 'scripts/modele/extraire.py']) expect(readFileSync(f, 'utf8'), f).not.toMatch(/^\s*(import|from)\s+(numpy|lxml|trimesh|collada|PIL)\b/m);
  });

  it('aucun fichier de plus de 5 Mo dans les données de la carte', () => {
    for (const f of walk('data/game/maps')) expect(statSync(f).size, f).toBeLessThan(5 * 1024 * 1024);
  });

  // Lot 3i : data/game/sounds.json retiré de la liste (sons de l'atelier intégrés, décision du propriétaire) ; ses recettes gardées sont comparées à main
  // dans sons-integres.test.js.
  // Lot 5e : js/core/pose.js sort de la liste (ancien modèle supprimé, fichier absent).
  it('règles de jeu inchangées depuis la base (tir, vagues, stats, chutes, siège, caméra, sons, sauvegarde, ancienne salle)', () => {
    const files = ['js/core/waves.js', 'js/core/wave-director.js', 'js/core/projectile.js', 'js/core/ray.js', 'js/core/spread.js', 'js/core/player-stats.js', 'js/core/player-down.js', 'js/core/siege.js', 'js/core/camera.js', 'js/core/synth.js',
      'data/game/waves.json', 'data/game/gaits.json', 'data/game/weapons.json', 'data/game/player-stats.json', 'data/game/player-down.json', 'data/game/windows.json', 'data/game/world.json', 'data/game/decor.json'];
    const changed = git(`diff --name-only ${BASE} -- ${files.join(' ')}`);
    if (changed === null) return;
    expect(changed).toEqual([]);
  });

  // data/changelog.json, data-changelog et dev.spec : entrée « lot-3g » ajoutée à la demande du propriétaire (le bilan de Docs/lots/ l'exige).
  it('fichiers réservés aux autres lots inchangés (jeu, HUD, interface, CLAUDE.md, conventions, workflow, index, seed)', () => {
    // js/game/game.js : une ligne (sortie de l'escalier par le côté, retour du propriétaire) ; js/core/stair-walk.js : option sideExit (même retour).
    // main (lot 4) récupéré dans la branche : la comparaison se fait avec ce main (MAIN), pas avec la base du lot.
    // Lot 3l (interface intégrée, fusionnée dans lot-4b) : jeu.html, css/game.css, js/game/hud.js et js/game/ui.js sont modifiés par ce lot autorisé ; ils sortent de la liste.
    // Lot 4b (demande du propriétaire) : CLAUDE.md et conventions.md reçoivent les règles de tous les lots intégrés ; ils sortent de la liste.
    // Lot 5b : Docs/seed.md n'est plus comparé à un commit figé (le propriétaire le met à jour) : seuls ses commits le modifient (tests/unit/helpers/seed.js).
    const seed = seedProblems();
    if (seed !== null) expect(seed).toEqual([]);
    const changed = git(`diff --name-only ${MAIN} -- js/game/levels-source.js data/game/enemies.json .github index.html`);
    if (changed === null) return;
    expect(notLot4c(changed)).toEqual([]);
  });

  // Branche lot-3g : l'aperçu s'ouvre sur visite.html ; une fois fusionné dans une branche d'intégration (lot-4b), sur la page de celle-ci (jeu.html).
  it('l\'aperçu de la branche s\'ouvre sur visite.html ou, après intégration, sur jeu.html (accepté par parseEntry)', async () => {
    const { parseEntry } = await import('../../js/lots.js');
    expect(['visite.html', 'jeu.html']).toContain(parseEntry(readFileSync('apercu.txt', 'utf8')));
    expect(readFileSync('apercu.txt', 'utf8')).toMatch(/type: hifi/);
  });

  it('npm run build publie visite.html et ecarts.html', () => {
    expect(readFileSync('scripts/build.mjs', 'utf8')).toMatch(/'visite\.html', 'ecarts\.html'/);
  });
});
