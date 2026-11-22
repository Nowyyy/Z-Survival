// Lot 5d — Harnais de comparaison de la logique du jeu (preuve d'identité des réécritures sans allocation). Playwright Chromium, aucune dépendance
// nouvelle ; résultats écrits hors du dépôt (dossier temporaire par défaut, --out pour un autre dossier).
//
// Usage : node scripts/perf/trace-logique.mjs [--base http://localhost:4180 (sinon un serveur local est lancé depuis le dossier courant)]
//         [--out dossier] [--scenarios 1,2,3,4,5,6] [--steps 600] [--os (matrices des os aux pas 100, 300 et 600, voir plus bas)]
//         [--extra '&decor=avant' (lot 9i : paramètres ajoutés à chaque adresse)] [--relance N (lot 9d : partie libérée puis recréée N fois dans la page avant les pas)]
//         node scripts/perf/trace-logique.mjs --compare dossierA dossierB  (compare deux exécutions pas à pas ; code 1 au premier écart)
//         node scripts/perf/trace-logique.mjs --reference [fichier] dossier  (lot 9j : compare une exécution à la référence enregistrée,
//         scripts/perf/trace-reference.json par défaut ; code 1 au premier écart)
//         node scripts/perf/trace-logique.mjs --enregistre dossierA dossierB  (lot 9j : deux exécutions identiques → nouvelle référence)
//
// Six scénarios (jeu.html?test=1&seed=1…, 667 × 375, onglet « caché » : la boucle d'images ne démarre jamais, seul step() fait avancer la
// partie, une image dessinée après chaque pas, donc les poses aussi) : (1) R1 manche 5 (zombies, tirs automatiques, siège, réparation) ;
// (2) ?wave=21&floor=1, le joueur prend l'escalier (marche automatique) ; (3) ?wave=31&floor=1 (deux étages, zombies dans les escaliers) ;
// (4) mort puis « Rejouer » ; (5) ?map=salle ; (6) R2 près d'une fenêtre, ?gfx=faible. Chaque pas : actions déterministes (setInput, planches,
// escalier, chute), step(0.05), puis empreinte de getState() logique (positions, vies, tués, vague, argent, étage, planches, balles, zombies,
// tirs, laser, caméra, journaux) : sérialisation qui garde les nombres exacts (String(n) relit le même double ; -0, NaN et Infinity écrits
// tels quels), puis SHA-256. Écrit, par scénario, un fichier JSONL (pas, empreinte, état) et un résumé (empreinte finale, empreinte de chaîne).
//
// Lot 9j : chaque pas porte aussi deux empreintes séparées : « logique » (tous les champs sauf pose) et « pose » (le champ pose seul : animation
// du joueur, apparence et triangles de son personnage, champ que les lots de rendu changent) ; le résumé donne leurs chaînes (empreinte des
// empreintes de chaque pas : deux chaînes égales ⇔ empreintes identiques à chaque pas). La référence (scripts/perf/trace-reference.json : date,
// hash de la base, champs couverts) garde, par scénario, les finales et les trois chaînes ; --reference compare les trois, et dit à part si seul
// le champ pose diffère.
//
// --os : exécution séparée (elle dessine une image de plus aux pas 100, 300 et 600 par sampleScreen, ce qui peut changer l'état visuel : ne pas
// la comparer à une exécution sans --os) ; relève alors la matrice monde (16 nombres) de chaque os (THREE.Bone) de la scène.
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : fallback;
};
const flag = (name) => args.includes(`--${name}`);
// Lot 9i : --extra '&decor=avant' : paramètres ajoutés à l'adresse de chaque scénario (références d'avant un lot).
const EXTRA = (() => {
  const i = args.indexOf('--extra');
  return i >= 0 && i + 1 < args.length ? args[i + 1] : '';
})();
const sha = (s) => createHash('sha256').update(s).digest('hex');

// --- Lot 9j : référence enregistrée -----------------------------------------------------------------------------------------------------
const REFERENCE = new URL('./trace-reference.json', import.meta.url);
if (flag('enregistre')) {
  const i = args.indexOf('--enregistre');
  const [a, b] = [args[i + 1], args[i + 2]];
  const ra = JSON.parse(readFileSync(join(a, 'resume.json'), 'utf8'));
  const rb = JSON.parse(readFileSync(join(b, 'resume.json'), 'utf8'));
  const cle = (r) => JSON.stringify(r.scenarios.map((sc) => [sc.id, sc.pas, sc.finale, sc.chaine, sc.chaineLogique, sc.chainePose]));
  if (cle(ra) !== cle(rb)) {
    console.log('Les deux exécutions diffèrent : aucune référence enregistrée.');
    process.exit(1);
  }
  const doc = {
    _provisoire: 'Référence de scripts/perf/trace-logique.mjs (lot 9j) : deux exécutions de suite, identiques à chaque pas, sur la base nommée. Ne jamais éditer à la main : relancer le script (--enregistre).',
    date: opt('date', new Date().toISOString().slice(0, 10)),
    base: opt('hash', ''),
    pas: ra.steps,
    champs: ra.champs,
    pose: 'chaine : tous les champs ; chaineLogique : tous sauf pose ; chainePose : pose seul',
    scenarios: ra.scenarios.map((sc) => ({ id: sc.id, nom: sc.nom, pas: sc.pas, finale: sc.finale, finaleLogique: sc.finaleLogique, chaine: sc.chaine, chaineLogique: sc.chaineLogique, chainePose: sc.chainePose })),
  };
  writeFileSync(REFERENCE, `${JSON.stringify(doc, null, 1)}\n`);
  console.log(`Référence enregistrée : ${fileURLToPath(REFERENCE)}`);
  process.exit(0);
}
if (flag('reference')) {
  const i = args.indexOf('--reference');
  const rest = args.slice(i + 1).filter((x) => !x.startsWith('--'));
  const fichier = rest.length > 1 ? rest[0] : fileURLToPath(REFERENCE);
  const dossier = rest.at(-1);
  const ref = JSON.parse(readFileSync(fichier, 'utf8'));
  const run = JSON.parse(readFileSync(join(dossier, 'resume.json'), 'utf8'));
  let bad = 0;
  for (const r of ref.scenarios) {
    const sc = run.scenarios.find((x) => x.id === r.id);
    if (!sc) {
      console.log(`${r.id} : absent de ${dossier}`);
      bad += 1;
      continue;
    }
    // Exécution d'un ancien format (sans empreintes séparées) : seule la chaîne complète se compare.
    const ancien = sc.chaineLogique === undefined;
    const logique = ancien ? sc.chaine === r.chaine : sc.chaineLogique === r.chaineLogique;
    const pose = ancien ? sc.chaine === r.chaine : sc.chainePose === r.chainePose;
    if (logique && pose && sc.chaine === r.chaine) console.log(`${r.id} : ${sc.pas} pas, identiques à chaque pas à la référence du ${ref.date} (finale ${sc.finale.slice(0, 16)})`);
    else {
      bad += 1;
      console.log(ancien ? `${r.id} : ÉCART à la référence (ancien format : chaîne complète seulement)` : `${r.id} : ÉCART à la référence : logique ${logique ? 'identique' : 'DIFFÉRENTE'}, pose ${pose ? 'identique' : 'DIFFÉRENTE'} (comparer pas à pas avec --compare)`);
    }
  }
  process.exit(bad ? 1 : 0);
}

// --- Comparaison de deux exécutions ----------------------------------------------------------------------------------------------------
if (flag('compare')) {
  const i = args.indexOf('--compare');
  const [a, b] = [args[i + 1], args[i + 2]];
  const sa = JSON.parse(readFileSync(join(a, 'resume.json'), 'utf8'));
  let bad = 0;
  for (const sc of sa.scenarios) {
    const fa = join(a, `scenario-${sc.id}.jsonl`);
    const fb = join(b, `scenario-${sc.id}.jsonl`);
    if (!existsSync(fb)) {
      console.log(`${sc.id} : absent de ${b}`);
      bad += 1;
      continue;
    }
    const la = readFileSync(fa, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    const lb = readFileSync(fb, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    let first = null;
    for (let k = 0; k < Math.max(la.length, lb.length); k += 1) {
      if (la[k]?.empreinte !== lb[k]?.empreinte) {
        first = k;
        break;
      }
    }
    if (first === null) console.log(`${sc.id} : ${la.length} pas, empreintes identiques à chaque pas (finale ${la.at(-1).empreinte.slice(0, 16)})`);
    else {
      bad += 1;
      const ea = la[first]?.etat ?? '';
      const eb = lb[first]?.etat ?? '';
      let c = 0;
      while (c < ea.length && ea[c] === eb[c]) c += 1;
      console.log(`${sc.id} : PREMIER ÉCART au pas ${la[first]?.pas ?? first} : …${ea.slice(Math.max(0, c - 120), c + 80)}…\n   contre …${eb.slice(Math.max(0, c - 120), c + 80)}…`);
    }
    const oa = join(a, `os-${sc.id}.json`);
    const ob = join(b, `os-${sc.id}.json`);
    if (existsSync(oa) && existsSync(ob)) {
      const same = readFileSync(oa, 'utf8') === readFileSync(ob, 'utf8');
      const n = JSON.parse(readFileSync(oa, 'utf8')).map((p) => `${p.pas}: ${p.bones} os`).join(', ');
      console.log(`   matrices des os (${n}) : ${same ? 'identiques' : 'DIFFÉRENTES'}`);
      if (!same) bad += 1;
    }
  }
  process.exit(bad ? 1 : 0);
}

// Champs logiques lus dans getState() (même liste que KEYS dans la page, plus bas).
const CHAMPS = ['time', 'dead', 'worldOver', 'player', 'economy', 'kills', 'waves', 'floor', 'aim', 'shots', 'enemies', 'bullets', 'windows', 'debris', 'laser', 'laserEnd', 'camera', 'stairLog', 'events', 'spawnLog', 'pose', 'stats'];
const STEPS = Math.max(1, Number(opt('steps', '600')) || 600);
const OUT = opt('out', join(tmpdir(), 'zs-trace', String(Date.now())));
const BONES = flag('os');
const ONLY = opt('scenarios', '1,2,3,4,5,6').split(',').filter(Boolean);
const U = (px) => px * 5 + 800; // unités du jeu depuis les pixels du plan (scripts/perf/mesurer.mjs)
export const SCENARIOS = [
  { id: '1', nom: 'R1 manche 5 : zombies, tirs, siège, réparation', query: '&wave=5', at: [U(300), U(300)] },
  { id: '2', nom: '?wave=21&floor=1 : le joueur prend l\'escalier', query: '&wave=21&floor=1' },
  { id: '3', nom: '?wave=31&floor=1 : deux étages, zombies dans les escaliers', query: '&wave=31&floor=1' },
  { id: '4', nom: 'mort puis « Rejouer »', query: '&wave=3' },
  { id: '5', nom: '?map=salle', query: '&map=salle' },
  { id: '6', nom: 'R2 près d\'une fenêtre, ?gfx=faible', query: '&wave=5&gfx=faible', at: [U(311), U(335)] },
].filter((s) => ONLY.includes(s.id));

let server = null;
let BASE = opt('base', null);
if (!BASE) {
  server = spawn('node', ['scripts/serve.mjs'], { stdio: 'ignore', env: { ...process.env, PORT: '4192' } });
  await new Promise((r) => setTimeout(r, 800));
  BASE = 'http://localhost:4192';
}
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const CHECKPOINTS = [100, 300, 600];
const RELANCE = Math.max(0, Number(opt('relance', '0')) || 0); // lot 9d

async function run(sc) {
  const context = await browser.newContext({ viewport: { width: 667, height: 375 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  // Onglet « caché » : requestAnimationFrame ne fait jamais tourner la boucle d'images (même méthode que tests/e2e/graphismes.spec.js).
  await page.addInitScript(() => Object.defineProperty(Document.prototype, 'hidden', { get: () => true, configurable: true }));
  await page.goto(`${BASE}/jeu.html?test=1&seed=1${sc.query}${EXTRA}`);
  await page.waitForFunction(() => window.__zs || document.getElementById('game-error')?.hidden === false, null, { timeout: 180000 });
  // Lot 9d : --relance N : la partie est libérée puis recréée N fois dans la même page (window.__zsCycle) avant les pas : la trace doit rester
  // identique à celle d'une première partie (garantie « deuxième partie = première »).
  for (let r = 0; r < RELANCE; r += 1) {
    await page.evaluate(async () => {
      window.__zsCycle.liberer();
      await window.__zsCycle.demarrer();
    });
    await page.waitForFunction(() => window.__zs, null, { timeout: 180000 });
  }
  if (BONES) {
    await page.evaluate(async () => {
      const THREE = await import('three');
      window.__skels = new Set();
      const update = THREE.Skeleton.prototype.update;
      THREE.Skeleton.prototype.update = function patched(...a) {
        window.__skels.add(this);
        return update.apply(this, a);
      };
    });
  }
  // Préparation et fonctions de la page : sérialisation exacte, état logique, actions du pas i.
  await page.evaluate(({ id, at }) => {
    const zs = window.__zs;
    const ser = (v) => {
      if (typeof v === 'number') return Object.is(v, -0) ? '-0' : String(v);
      if (v === null) return 'null';
      if (v === undefined) return 'undefined';
      if (typeof v === 'string') return JSON.stringify(v);
      if (typeof v === 'boolean') return String(v);
      if (Array.isArray(v)) return `[${v.map(ser).join(',')}]`;
      if (typeof v === 'object') return `{${Object.keys(v).map((k) => `${JSON.stringify(k)}:${ser(v[k])}`).join(',')}}`;
      return `?${typeof v}`;
    };
    // Champs logiques de getState() (aucun champ de rendu, de son, de mesure ni d'horloge réelle).
    const KEYS = ['time', 'dead', 'worldOver', 'player', 'economy', 'kills', 'waves', 'floor', 'aim', 'shots', 'enemies', 'bullets', 'windows', 'debris', 'laser', 'laserEnd', 'camera', 'stairLog', 'events', 'spawnLog', 'pose', 'stats'];
    window.__logic = () => {
      const s = zs.getState();
      const o = {};
      for (const k of KEYS) o[k] = s[k];
      return ser(o);
    };
    // Lot 9j : une seule lecture de getState() par pas : état complet (empreinte d'avant), tous les champs sauf pose, pose seul.
    window.__parts = () => {
      const s = zs.getState();
      const o = {};
      const sans = {};
      for (const k of KEYS) {
        o[k] = s[k];
        if (k !== 'pose') sans[k] = s[k];
      }
      return [ser(o), ser(sans), ser(s.pose)];
    };
    const state = zs.getState();
    if (at) zs.setPlayer(at[0], at[1]);
    // Dégâts et cadence au maximum (sans rien stocker) : des tués, donc de l'argent et les animations de mort, dans les 600 pas.
    if (id !== '4') zs.setLevels({ degats: 10, cadence: 10, portee: 10 });
    // Fenêtre la plus proche du joueur, une planche : siège, entrée et réparation.
    const p = zs.getState().player;
    const wins = (state.windows ?? []).filter((w) => Number.isFinite(w.planks)).map((w) => ({ w, d: Math.hypot(w.x - p.x, w.y - p.y) })).sort((a, b) => a.d - b.d);
    const win = wins[0]?.w ?? null;
    if (win && (id === '1' || id === '6')) zs.setPlanks(win.id, 1);
    const spot = win?.repairSpot ?? null;
    const toward = spot ? Math.atan2(spot.y - p.y, spot.x - p.x) : 0;
    window.__act = (i) => {
      const aim = { angle: (i * 0.037) % (Math.PI * 2) };
      if (id === '1' || id === '6') {
        if (i < 120) zs.setInput({ aim, move: { x: Math.cos(toward), y: Math.sin(toward) } });
        else if (i < 360) zs.setInput({ aim: { angle: toward + Math.PI } });
        else if (i < 480) zs.setInput({ aim, move: { x: -Math.cos(toward) * 0.6, y: -Math.sin(toward) * 0.6 } });
        else zs.setInput({ aim });
      } else if (id === '2') {
        if (i === 20) zs.useStair('escalier-depart');
        if (i === 320) zs.useStair('escalier-aile');
        zs.setInput({ aim });
      } else if (id === '3') {
        const m = Math.floor(i / 100) % 4;
        zs.setInput({ aim, move: [{ x: 0.5, y: 0 }, { x: 0, y: 0.5 }, { x: -0.5, y: 0 }, { x: 0, y: -0.5 }][m] });
        if (i === 250) zs.useStair('escalier-depart');
      } else if (id === '4') {
        if (i === 60) zs.setChutes(0);
        if (i === 61) zs.downPlayer();
        if (i === 150) document.getElementById('btn-replay')?.click();
        zs.setInput({ aim, move: i < 60 || i > 150 ? { x: 0.4, y: -0.3 } : undefined });
      } else {
        zs.setInput({ aim, move: { x: Math.cos(i * 0.02), y: Math.sin(i * 0.013) } });
      }
    };
  }, { id: sc.id, at: sc.at ?? null });
  const lines = [];
  const bones = [];
  const CHUNK = 50;
  for (let i = 0; i < STEPS; i += CHUNK) {
    const part = await page.evaluate(({ from, to }) => {
      const out = [];
      for (let k = from; k < to; k += 1) {
        window.__act(k);
        window.__zs.step(0.05);
        out.push(window.__parts());
      }
      return out;
    }, { from: i, to: Math.min(STEPS, i + CHUNK) });
    for (const [etat, logique, pose] of part) lines.push({ pas: lines.length + 1, empreinte: sha(etat), logique: sha(logique), pose: sha(pose), etat });
    if (BONES) {
      for (const cp of CHECKPOINTS.filter((c) => c > i && c <= i + CHUNK && c <= STEPS)) {
        // Seuls les pas multiples de CHUNK sont atteints ici : 100, 300 et 600 le sont.
        if (cp !== Math.min(STEPS, i + CHUNK)) continue;
        bones.push({ pas: cp, ...(await page.evaluate(() => {
          window.__zs.sampleScreen(0, 0, 1, 1);
          let scene = null;
          for (const sk of window.__skels) {
            let o = sk.bones[0];
            while (o?.parent) o = o.parent;
            if (o?.isScene) scene = o;
          }
          const mats = [];
          scene?.traverse((o) => {
            if (o.isBone) mats.push(`${o.name}:${o.matrixWorld.elements.map((v) => (Object.is(v, -0) ? '-0' : String(v))).join(',')}`);
          });
          return { bones: mats.length, matrices: mats };
        })) });
      }
    }
  }
  const last = await page.evaluate(() => {
    const s = window.__zs.getState();
    return { time: s.time, kills: s.kills, enemies: s.enemies.length, dead: s.dead };
  });
  await context.close();
  const file = join(OUT, `scenario-${sc.id}.jsonl`);
  writeFileSync(file, `${lines.map((l) => JSON.stringify(l)).join('\n')}\n`);
  if (BONES) writeFileSync(join(OUT, `os-${sc.id}.json`), JSON.stringify(bones));
  const chain = sha(lines.map((l) => l.empreinte).join(''));
  const chaineLogique = sha(lines.map((l) => l.logique).join(''));
  const chainePose = sha(lines.map((l) => l.pose).join(''));
  return { id: sc.id, nom: sc.nom, pas: lines.length, finale: lines.at(-1).empreinte, finaleLogique: lines.at(-1).logique, chaine: chain, chaineLogique, chainePose, erreurs: errors, temps: last.time, kills: last.kills, zombies: last.enemies, mort: last.dead, os: BONES ? bones.map((b) => b.bones) : null };
}

const summary = [];
for (const sc of SCENARIOS) {
  const r = await run(sc);
  summary.push(r);
  console.log(`scénario ${r.id} (${r.nom}) : ${r.pas} pas, finale ${r.finale.slice(0, 16)}, chaîne ${r.chaine.slice(0, 16)}, temps ${r.temps}, tués ${r.kills}, zombies ${r.zombies}${r.os ? `, os ${r.os.join('/')}` : ''}${r.erreurs.length ? `, ERREURS ${r.erreurs.join(' | ')}` : ''}`);
}
writeFileSync(join(OUT, 'resume.json'), JSON.stringify({ base: BASE, steps: STEPS, os: BONES, champs: CHAMPS, extra: EXTRA, scenarios: summary }, null, 1));
console.log(`Résultats : ${OUT}`);
await browser.close();
server?.kill();
