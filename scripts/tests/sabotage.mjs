// Lot 4e-B — Contrôle par sabotage de la sélection par zone. UNIQUEMENT dans une copie jetable (git worktree dans un dossier temporaire,
// supprimée à la fin) : rien n'est modifié dans l'arbre de travail, rien n'est commité ni poussé.
// Pour chaque cassure minimale : sélection calculée (--base HEAD de la copie, et une fois --depuis-version), seuls les tests sélectionnés
// sont lancés (Vitest d'abord, puis Playwright du palier standard si Vitest ne voit rien), et au moins un doit échouer. Pour une cassure
// « entre zones », chaque zone exigée doit avoir au moins un test qui échoue parmi ses propres tests sélectionnés.
// Témoin : avant chaque cassure, une modification neutre du même fichier (une ligne vide ajoutée) passe par les mêmes tests Vitest ; les
// tests qui échouent déjà avec elle (détecteurs de changement qui comparent à une branche, échecs dus à l'environnement) ne comptent pas.
//
// Usage : node scripts/tests/sabotage.mjs [--cas Z1,X2] [--sortie <résultats.json>]
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { createConnection } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..', '..');
const val = (n) => {
  const i = process.argv.indexOf(n);
  return i < 0 ? undefined : process.argv[i + 1];
};

// Cassures : id, fichier, texte exact (présent une seule fois), remplacement, description, zones exigées (cassures entre zones).
export const CASSURES = [
  { id: 'Z1', fichier: 'js/core/spread.js', avant: 'return Math.min(1, Math.max(0, speed / maxSpeed));', apres: 'return Math.min(1, Math.max(0, 1 - speed / maxSpeed));', quoi: 'fonction pure : ratio de vitesse du cône inversé' },
  { id: 'Z2', fichier: 'js/core/siege.js', avant: 'const step = clampDt(dt);', apres: 'const step = -clampDt(dt);', quoi: 'signe du pas de temps du siège inversé' },
  { id: 'Z3', fichier: 'data/game/windows.json', avant: '"tearTime": 2.2,', apres: '"tearTime": 3.2,', quoi: 'donnée : arrachage d\'une planche 2,2 → 3,2 s' },
  { id: 'Z4', fichier: 'js/game/hud.js', avant: 'if (node.hidden !== hidden) node.hidden = hidden;', apres: 'if (node.hidden !== hidden) node.hidden = !hidden;', quoi: 'module de js/game : visibilité des blocs du HUD inversée' },
  { id: 'Z5', fichier: 'css/game-ui.css', avant: '--edge-top: calc(var(--game-margin) + var(--safe-top));', apres: '--edge-top: calc(var(--safe-top));', quoi: 'feuille de style : marge haute de 16 px supprimée' },
  { id: 'Z6', fichier: 'jeu.html', avant: '<p id="hud-wave" class=', apres: '<p id="hud-manche" class=', quoi: 'page HTML : identifiant du bloc de manche changé' },
  { id: 'Z7', fichier: '.github/workflows/pages.yml', avant: 'permissions:\n  contents: read\n', apres: 'permissions:\n  contents: write\n', quoi: 'workflow : droits d\'écriture' },
  { id: 'Z8', fichier: 'js/core/stairs.js', avant: 'stairTime: posNum(r.stairTime, d.stairTime),', apres: 'stairTime: posNum(r.stairTime, d.stairTime) * 2,', quoi: 'durée d\'escalier doublée' },
  { id: 'Z9', fichier: 'js/core/texgen.js', avant: 'export const MAX_SIZE = 1024;', apres: 'export const MAX_SIZE = 512;', quoi: 'constante : taille maximale des textures' },
  { id: 'Z10', fichier: 'js/core/pose-v2.js', avant: 'const TAU = Math.PI * 2;', apres: 'const TAU = Math.PI;', quoi: 'constante des poses (2π → π)' },
  { id: 'Z11', fichier: 'js/core/sound-director.js', avant: 'if (own && table?.[own]) return { sound: own, rate: 1 };', apres: 'if (own && table?.[own]) return { sound: own, rate: 2 };', quoi: 'hauteur de lecture des sons propres doublée' },
  { id: 'Z12', fichier: 'js/core/save.js', avant: 'export const SCHEMA_VERSION = 1;', apres: 'export const SCHEMA_VERSION = 2;', quoi: 'version du schéma de sauvegarde' },
  { id: 'X1', fichier: 'js/core/economy.js', avant: 'export const repairMoney = (params) => Math.max(0, Math.round(num(params?.repairMoney)));', apres: 'export const repairMoney = (params) => Math.max(0, Math.round(num(params?.repairMoney)) + 1);', quoi: 'économie : une planche posée rapporte 1 de plus', zones: ['interface'] },
  { id: 'X2', fichier: 'data/game/waves.json', avant: '"maxConcurrent": { "base": 6, "every": 2, "cap": 10 },', apres: '"maxConcurrent": { "base": 6, "every": 2, "cap": 12 },', quoi: 'vagues : 12 zombies simultanés au lieu de 10', zones: ['vagues', 'siege'] },
  // X3 : --game-floor (premier essai) n'est lu par aucun test des personnages (leurs contrastes portent sur les sols texturés) : non
  // détectée en zone personnages. --game-tile-a (carrelage) entre dans les sols de référence du HUD et des personnages.
  { id: 'X3', fichier: 'css/tokens.css', avant: '--game-tile-a: #4d5156;', apres: '--game-tile-a: #d8dce0;', quoi: 'jeton : carrelage clair (--game-tile-a)', zones: ['interface', 'personnages'] },
  // X4 : changer seulement la constante du générateur (premier essai) donne d'autres tirages tout aussi valides : aucune zone ne doit
  // échouer pour cela (non détectée en zone vagues). La cassure retenue fausse le contrat du module partagé : nextInt sort de [0, max).
  { id: 'X4', fichier: 'js/core/rng.js', avant: 'return { value: Math.min(n - 1, Math.floor(value * n)), rng: next };', apres: 'return { value: Math.floor(value * n) + 1, rng: next };', quoi: 'module partagé : nextInt décalé de 1 (sort de [0, max))', zones: 'importeurs' },
];

const portLibre = (port) => new Promise((ok) => {
  const s = createConnection({ port, host: '127.0.0.1' });
  s.once('connect', () => { s.destroy(); ok(false); });
  s.once('error', () => ok(true));
});

function run(cwd, cmd, args, env = {}) {
  const t0 = Date.now();
  const r = spawnSync(cmd, args, { cwd, encoding: 'utf8', env: { ...process.env, ...env }, maxBuffer: 512 * 1024 * 1024 });
  return { code: r.status ?? 1, out: `${r.stdout ?? ''}${r.stderr ?? ''}`, s: (Date.now() - t0) / 1000 };
}

// Fichiers Vitest en échec (rapport JSON) ; fichiers Playwright en échec (rapport JSON).
function vitestEchecs(cwd, fichiers) {
  if (!fichiers.length) return { echecs: [], s: 0 };
  const sortie = join(cwd, '.sabotage-vitest.json');
  const r = run(cwd, 'npx', ['vitest', 'run', '--reporter=json', `--outputFile=${sortie}`, ...fichiers]);
  const j = existsSync(sortie) ? JSON.parse(readFileSync(sortie, 'utf8')) : null;
  rmSync(sortie, { force: true });
  const echecs = (j?.testResults ?? []).filter((f) => f.status === 'failed').map((f) => f.name.replace(`${cwd}/`, ''));
  if (!j && r.code) echecs.push('(Vitest n\'a pas pu démarrer)');
  return { echecs, s: r.s };
}
function playwrightEchecs(cwd, fichiers) {
  if (!fichiers.length) return { echecs: [], s: 0 };
  const sortie = join(cwd, '.sabotage-pw.json');
  const r = run(cwd, 'npx', ['playwright', 'test', '--reporter=json', '--grep-invert', '@instable|@lent', '--max-failures=1', ...fichiers], { E2E_FULL: '1', PLAYWRIGHT_JSON_OUTPUT_NAME: sortie });
  const j = existsSync(sortie) ? JSON.parse(readFileSync(sortie, 'utf8')) : null;
  rmSync(sortie, { force: true });
  const echecs = new Set();
  const walk = (s) => {
    for (const sp of s.specs ?? []) if (sp.tests.some((t) => t.status === 'unexpected')) echecs.add(`tests/e2e/${sp.file}`);
    for (const c of s.suites ?? []) walk(c);
  };
  for (const s of j?.suites ?? []) walk(s);
  if (!j && r.code) echecs.add('(Playwright n\'a pas pu démarrer)');
  return { echecs: [...echecs], s: r.s };
}

async function main() {
  for (const p of [4173, 4174]) if (!(await portLibre(p))) throw new Error(`port ${p} occupé : arrête le serveur (la copie jetable doit servir ses propres fichiers)`);
  const filtre = val('--cas')?.split(',');
  const cas = CASSURES.filter((c) => !filtre || filtre.includes(c.id));
  const tmp = mkdtempSync(join(tmpdir(), 'zs-sabotage-'));
  const arbre = join(tmp, 'arbre');
  execFileSync('git', ['worktree', 'add', '--detach', arbre, 'HEAD'], { cwd: ROOT, stdio: 'ignore' });
  symlinkSync(join(ROOT, 'node_modules'), join(arbre, 'node_modules'));
  // Le lien node_modules n'est pas un dossier : .gitignore (« node_modules/ ») ne le couvre pas. Exclusion locale à la copie
  // (core.excludesFile passé par l'environnement de git, sans toucher à la configuration du dépôt), sinon la sélection le verrait comme un
  // fichier inconnu et rejouerait tout.
  const exclus = join(tmp, 'exclude');
  writeFileSync(exclus, '/node_modules\n/.sabotage-*.json\n');
  const GITENV = { GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'core.excludesFile', GIT_CONFIG_VALUE_0: exclus };
  const table = JSON.parse(readFileSync(join(arbre, 'tests/selection.json'), 'utf8'));
  const resultats = [];
  try {
    for (const c of cas) {
      const t0 = Date.now();
      const chemin = join(arbre, c.fichier);
      const src = readFileSync(chemin, 'utf8');
      if (src.split(c.avant).length !== 2) throw new Error(`${c.id} : texte introuvable ou non unique dans ${c.fichier}`);
      writeFileSync(chemin, `${src}\n`);
      const selNeutre = JSON.parse(run(arbre, 'node', ['scripts/tests/selectionner.mjs', '--base', 'HEAD', '--files', c.fichier]).out);
      const neutres = new Set(vitestEchecs(arbre, selNeutre.vitest).echecs);
      writeFileSync(chemin, src.replace(c.avant, c.apres));
      const sel = JSON.parse(run(arbre, 'node', ['scripts/tests/selectionner.mjs', '--base', 'HEAD'], GITENV).out);
      const selV = JSON.parse(run(arbre, 'node', ['scripts/tests/selectionner.mjs', '--depuis-version', '--publication'], GITENV).out.replace(/^[^{]*/, ''));
      const e2eStandard = [...new Set([...sel.fumee, ...(sel.mode === 'tout' ? table.zones.flatMap((z) => z.e2e) : sel.e2e)])];
      const vitestReel = (fichiers) => { const v = vitestEchecs(arbre, fichiers); return { ...v, echecs: v.echecs.filter((f) => !neutres.has(f)) }; };
      const r = { id: c.id, temoins: [...neutres], fichier: c.fichier, quoi: c.quoi, mode: sel.mode, zones: sel.rejouees.map((z) => z.id), depuisVersion: `${selV.mode} (${selV.raison.slice(0, 60)})`, vitestLances: sel.vitest.length, e2eLances: 0, echecs: [], parZone: {} };
      if (!c.zones) {
        const v = vitestReel(sel.vitest);
        r.echecs.push(...v.echecs);
        if (!v.echecs.length) {
          r.e2eLances = e2eStandard.length;
          r.echecs.push(...playwrightEchecs(arbre, e2eStandard).echecs);
        }
        r.detectee = r.echecs.length > 0;
      } else {
        const exigees = c.zones === 'importeurs'
          ? table.zones.filter((z) => z.sources.some((s) => !s.includes('*') && existsSync(join(arbre, s)) && /\.m?js$/.test(s) && /['"]\.\/rng\.js['"]|core\/rng\.js['"]/.test(readFileSync(join(arbre, s), 'utf8')))).map((z) => z.id)
          : c.zones;
        const v = vitestReel(sel.vitest);
        r.echecs.push(...v.echecs);
        for (const id of exigees) {
          const z = table.zones.find((x) => x.id === id);
          const selectionnee = r.zones.includes(id);
          let vus = v.echecs.filter((f) => z.vitest.includes(f));
          if (selectionnee && !vus.length) {
            const e = playwrightEchecs(arbre, z.e2e.filter((f) => e2eStandard.includes(f) || sel.mode === 'tout'));
            r.e2eLances += z.e2e.length;
            vus = e.echecs;
            r.echecs.push(...vus);
          }
          // Palier publication : il joue aussi les tests « complet » des zones sélectionnées (pages techniques, règles gardées).
          if (selectionnee && !vus.length && z.complet.length) {
            const e = playwrightEchecs(arbre, z.complet);
            r.e2eLances += z.complet.length;
            vus = e.echecs.map((f) => `${f} (palier publication)`);
            r.echecs.push(...vus);
          }
          r.parZone[id] = selectionnee ? (vus.length ? vus.slice(0, 2) : []) : 'zone non sélectionnée';
        }
        r.detectee = Object.values(r.parZone).every((x) => Array.isArray(x) && x.length > 0);
      }
      r.secondes = Math.round((Date.now() - t0) / 1000);
      writeFileSync(chemin, src);
      resultats.push(r);
      console.log(`${r.id} ${r.detectee ? 'DÉTECTÉE' : 'NON DÉTECTÉE'} — ${c.fichier} (${c.quoi}) : mode ${r.mode}, zones ${r.zones.join(', ')} ; Vitest ${r.vitestLances}, e2e ${r.e2eLances} ; ${r.secondes} s ; échecs : ${r.echecs.slice(0, 3).join(', ')}${c.zones ? ` ; par zone : ${JSON.stringify(r.parZone)}` : ''} ; témoins exclus : ${r.temoins.join(', ') || 'aucun'} ; --depuis-version : ${r.depuisVersion}`);
    }
  } finally {
    execFileSync('git', ['worktree', 'remove', '--force', arbre], { cwd: ROOT, stdio: 'ignore' });
    execFileSync('git', ['worktree', 'prune'], { cwd: ROOT, stdio: 'ignore' });
    rmSync(tmp, { recursive: true, force: true });
  }
  if (val('--sortie')) writeFileSync(val('--sortie'), `${JSON.stringify(resultats, null, 2)}\n`);
  const non = resultats.filter((r) => !r.detectee);
  console.log(`\n${resultats.length - non.length}/${resultats.length} cassures détectées${non.length ? ` ; non détectées : ${non.map((r) => r.id).join(', ')}` : ''}.`);
  process.exit(non.length ? 1 : 0);
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
