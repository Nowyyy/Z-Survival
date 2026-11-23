// Lot 9k — Joueur automatique de l'équilibrage (joueur du lot 9e, scripts/perf/difficulte.mjs, avec les achats d'armes) : Chromium, jeu.html?test=1
// (sauvegarde en mémoire), step(0.05) seulement, aucune durée réelle. Il reste immobile au départ, vise le zombie le plus proche de son étage
// (tir automatique du jeu quand le laser touche), ne répare pas ; arme à verrou ou à pompe : il garde la visée entre deux tirs (même règle).
// Achats : dès que la vague d'achat d'une arme est atteinte et que ses Zollars (gagnés − dépensés) suffisent, il prend l'arme (le déplacement
// jusqu'à la caisse n'est pas joué) ; arme à sec : rachat des munitions s'il peut payer, sinon retour au Colt (et rachat dès qu'il peut).
// Avant le lot 9k-C, le jeu ne retire aucun Zollar : le script tient lui-même les dépenses (donnerArme et remplirMunitions du débogage).
// Profils : nu (aucun objet) ; equipe (niveaux de l'équipement de référence, scripts/equilibrage/modele.mjs, par ?lvl=).
// Tables de remplacement (proposition, état d'avant) : servies à la place des fichiers du jeu par interception, rien n'est écrit dans le dépôt.
//
// Usage : node scripts/equilibrage/joueur.mjs [--profils nu,equipe] [--seeds 1,2,3,4,5,6] [--max-pas 160000] [--paralleles 4]
//         [--armes fichier.json (à la place de data/game/armes-partie.json)] [--waves fichier.json] [--enemies fichier.json]
//         [--achats '[{"arme":"winchester1897","vague":11},…]' | --achats aucun] [--rachat 0.35 (part du prix)] [--base URL] [--out fichier.json]
// Sortie : une ligne par partie, puis le fichier JSON (par partie et par vague : temps, tués, dégâts reçus, Zollars, tirs et dégâts par arme).
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';
import { EQUIPEMENT_REFERENCE, lvlParam, niveauxReference } from './modele.mjs';

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 && i + 1 < args.length ? args[i + 1] : d; };
const lire = (f) => JSON.parse(readFileSync(f, 'utf8'));
const PROFILS = opt('profils', 'nu,equipe').split(',');
const SEEDS = opt('seeds', '1,2,3,4,5,6').split(',').map(Number);
const MAX = Number(opt('max-pas', '160000'));
const PARALLELES = Number(opt('paralleles', '4'));
const RACHAT = Number(opt('rachat', '0.35'));
const ARMES = opt('armes', null);
const WAVES = opt('waves', null);
const ENEMIES = opt('enemies', null);
const EXTRA = opt('extra', '');
// Visée : « proche » (lot 9e : le zombie le plus proche de son étage) ou « menace » (d'abord les zombies entrés, puis ceux qui grimpent ou
// arrachent une planche, puis les autres ; le plus proche dans chaque groupe).
const VISEE = opt('visee', 'proche');
// Poste : à l'ouverture de la porte 1, le joueur va juste à l'est de la porte (salle de départ) et n'en bouge plus. Resté au départ (joueur du
// lot 9e) ou posté dans une autre pièce, il fait boucler des zombies : le plus court chemin vers lui ressort par une fenêtre ouverte et rentre
// par une autre, le siège les renvoie à la première (défaut des chemins relevé au lot 9k, Docs/ref/armes-en-main.md) ; près de la porte, le chemin
// intérieur reste le plus court. « aucun » : il ne bouge jamais (joueur du lot 9e). Les achats ne le déplacent pas (trajet jusqu'à la caisse non joué).
const POSTE = opt('poste', '1600,2010') === 'aucun' ? null : opt('poste', '1600,2010').split(',').map(Number);
// Manche bloquée : aucun dégât porté pendant BLOQUE secondes de jeu alors que des zombies restent : la partie s'arrête (« bloquée »).
const BLOQUE = Number(opt('bloque', '150'));
// Réparation (--repare, choix du propriétaire après la partie B : « joueur qui répare ») : sans zombie entré à son étage, le joueur va vers la
// fenêtre la plus abîmée de la salle de départ (son point de réparation, en marchant droit, glissement contre les obstacles) et s'y arrête : la
// partie répare seule (joueur proche, sans viser). Zombie entré : il s'arrête et tire. Rien à réparer : il retourne à son poste. Coincé plus
// d'une seconde : il est posé au but (compté). Sans --repare : joueur du lot 9e (immobile).
const REPARE = args.includes('--repare');
const ZONES_REPARE = opt('zones-repare', 'depart').split(',');
// Départ à une vague d'achat (mesure « avec chaque arme ») : --depart 21 --arme-depart kar98k --zollars-depart 3250 : partie lancée à la vague,
// toutes les fenêtres ouvertes (?planks=0 : état d'une partie où le joueur ne répare jamais), l'arme donnée, un budget de départ (Zollars en poche
// à l'ouverture de la pièce, mesurés sur les parties complètes) pour les rachats.
const DEPART = Number(opt('depart', '1'));
const ARME_DEPART = opt('arme-depart', null);
const ZOLLARS_DEPART = Number(opt('zollars-depart', '0'));
const tableArmes = lire(ARMES ?? 'data/game/armes-partie.json');
const achatsTxt = opt('achats', null);
const ACHATS = achatsTxt === 'aucun' ? [] : achatsTxt ? JSON.parse(achatsTxt) : [{ arme: 'winchester1897', vague: 11 }, { arme: 'kar98k', vague: 21 }, { arme: 'thompson', vague: 31 }];
for (const a of ACHATS) {
  const e = tableArmes.armes[a.arme];
  a.prix ??= e.prix;
  a.rachat ??= e.rachat ?? Math.round((e.prix * RACHAT) / 10) * 10;
}
const niveauxEq = niveauxReference(lire('data/menu/objets.json'), lire('data/menu/personnages.json'), lire('data/game/player-stats.json'), EQUIPEMENT_REFERENCE);
const LVL = { nu: '', equipe: `&lvl=${lvlParam(niveauxEq)}` };

let BASE = opt('base', null);
let server = null;
if (!BASE) {
  const port = String(4300 + (process.pid % 600)); // un port par exécution (plusieurs mesures peuvent tourner en même temps)
  server = spawn('node', ['scripts/serve.mjs'], { stdio: 'ignore', env: { ...process.env, PORT: port } });
  await new Promise((r) => setTimeout(r, 800));
  BASE = `http://localhost:${port}`;
}
const browser = await chromium.launch();

async function partie(profil, seed) {
  const context = await browser.newContext({ viewport: { width: 667, height: 375 } });
  const page = await context.newPage();
  await page.addInitScript(() => Object.defineProperty(Document.prototype, 'hidden', { get: () => true, configurable: true }));
  const servir = (nom, fichier) => fichier && page.route(`**/data/game/${nom}`, (route) => route.fulfill({ contentType: 'application/json', body: readFileSync(fichier, 'utf8') }));
  await servir('armes-partie.json', ARMES);
  await servir('waves.json', WAVES);
  await servir('enemies.json', ENEMIES);
  await page.goto(`${BASE}/jeu.html?test=1&seed=${seed}&wave=${DEPART}${DEPART > 1 ? '&planks=0' : ''}${ZOLLARS_DEPART > 0 ? `&zollars=${ZOLLARS_DEPART}` : ''}${LVL[profil]}${EXTRA}`);
  await page.waitForFunction(() => window.__zs, null, { timeout: 180000 });
  const r = await page.evaluate(({ max, achats, visee, poste, bloque, armeDepart, zollarsDepart, repare, zonesRepare }) => {
    const zs = window.__zs;
    const byWave = {};
    const W = (w) => (byWave[w] ??= { debut: null, fin: null, tues: 0, degats: 0, zollarsDebut: null, tirs: {}, tire: {}, utile: {}, chutes: 0 });
    const hp = new Map(); // id → vie à la dernière lecture
    let wave = 0; let lastHp = null; let lastChutes = null; let lastKills = 0;
    let depense = -zollarsDepart; const faits = []; const rachats = [];
    if (armeDepart) { zs.donnerArme(armeDepart); faits.push({ arme: armeDepart, vague: 0, t: 0, zollars: zollarsDepart, prix: 0 }); }
    let prev = null; // { id, chargeur, reserve } de l'arme active à la dernière lecture
    let aim = 0;
    let s;
    let dernierDegat = 0; let bloquee = false;
    let move = { x: 0, y: 0 }; let maison = null; let suivi = null; let poses = 0; let reparees = 0; let lastPlanks = null;
    for (let i = 0; i < max; i += 1) {
      if (i % 4 === 0) {
        s = zs.getState();
        if (s.dead || s.worldOver) break;
        const t = s.time;
        const p = s.player;
        if (s.waves.wave !== wave) {
          if (byWave[wave]) byWave[wave].fin = t;
          wave = s.waves.wave;
          W(wave).debut = t;
          W(wave).zollarsDebut = s.caisses?.liste?.length ? s.caisses.zollars : s.economy.earnedRun - depense;
        }
        const ww = W(wave);
        if (poste && !poste.fait && s.zones?.doors?.find((d) => d.id === 'porte-1')?.open) { zs.setPlayer(poste[0], poste[1]); poste.fait = true; }
        const a = s.armes;
        const id = a?.actif ?? 'm1911';
        const em = a?.emplacements?.[a.emplacements.findIndex((x) => x.id === id)];
        // Tirs : cartouches parties depuis la dernière lecture (ce joueur ne recharge qu'à chargeur vide ; un chargeur qui monte se recharge).
        if (prev && em && prev.id === id) {
          const tirs = Math.max(0, prev.chargeur - em.chargeur);
          if (tirs > 0) {
            ww.tirs[id] = (ww.tirs[id] ?? 0) + tirs;
            ww.tire[id] = (ww.tire[id] ?? 0) + tirs * a.damage * (a.plombs ?? 1);
          }
        }
        prev = em ? { id, chargeur: em.chargeur } : null;
        // Dégâts portés : vie perdue par les zombies (un zombie disparu a perdu sa dernière vie lue) ; attribués à l'arme active.
        let best = null; let bd = Infinity;
        const vus = new Set();
        let utile = 0;
        for (const e of s.enemies) {
          vus.add(e.id);
          const avant = hp.get(e.id) ?? e.maxHp;
          if (e.hp < avant) utile += avant - e.hp;
          hp.set(e.id, e.hp);
          const d = Math.hypot(e.x - p.x, e.y - p.y) + (visee === 'menace' ? (e.mode === 'dedans' || e.mode === 'libre' ? 0 : e.mode === 'escalade' || e.mode === 'arrache' ? 1e4 : 2e4) : 0);
          if ((e.floor ?? 'rdc') === (s.floor?.current ?? 'rdc') && e.mode !== 'escalier' && d < bd) { bd = d; best = e; }
        }
        for (const [k, v] of hp) if (!vus.has(k)) { utile += v; hp.delete(k); }
        if (utile > 0) ww.utile[id] = (ww.utile[id] ?? 0) + utile;
        if (utile > 0 || s.enemies.length === 0) dernierDegat = t;
        else if (t - dernierDegat > bloque) { bloquee = true; break; }
        ww.tues += s.kills - lastKills;
        lastKills = s.kills;
        if (lastHp !== null && p.health < lastHp) ww.degats += lastHp - p.health;
        lastHp = p.health;
        if (lastChutes !== null && p.down.chutes < lastChutes) ww.chutes += lastChutes - p.down.chutes;
        lastChutes = p.down.chutes;
        if (best) aim = Math.atan2(best.y - p.y, best.x - p.x);
        if (repare) {
          maison ??= { x: p.x, y: p.y };
          if (poste?.fait && !maison.poste) maison = { x: poste[0], y: poste[1], poste: true };
          const etage = s.floor?.current ?? 'rdc';
          const menace = s.enemies.some((e) => (e.floor ?? 'rdc') === etage && (e.mode === 'dedans' || e.mode === 'libre') && Math.hypot(e.x - p.x, e.y - p.y) < 700);
          const planks = (s.windows ?? []).filter((w) => zonesRepare.includes(w.zone)).reduce((n, w) => n + (w.planks ?? 0), 0);
          if (lastPlanks !== null && planks > lastPlanks) reparees += planks - lastPlanks;
          lastPlanks = planks;
          let but = null;
          if (!menace && p.down.state === 'debout') {
            const abimees = (s.windows ?? []).filter((w) => w.active && w.floor === etage && zonesRepare.includes(w.zone) && w.planks < w.maxPlanks);
            abimees.sort((u, v) => u.planks - v.planks || Math.hypot(u.repairSpot.x - p.x, u.repairSpot.y - p.y) - Math.hypot(v.repairSpot.x - p.x, v.repairSpot.y - p.y));
            but = abimees[0]?.repairSpot ?? maison;
          }
          const d = but ? Math.hypot(but.x - p.x, but.y - p.y) : 0;
          move = but && d > 45 ? { x: (but.x - p.x) / d, y: (but.y - p.y) / d } : { x: 0, y: 0 };
          // Coincé (moins de 2 parcourus en 1 s en marchant) : posé au but.
          if (move.x || move.y) {
            if (!suivi || Math.hypot(p.x - suivi.x, p.y - suivi.y) > 2) suivi = { x: p.x, y: p.y, t };
            else if (t - suivi.t > 1) { zs.setPlayer(but.x, but.y); poses += 1; suivi = null; }
          } else suivi = null;
        }
        // Achats : la prochaine arme du plan dès sa vague et dès que les Zollars suffisent. Depuis le lot 9k-C, l'achat se fait dans le jeu : le joueur
        // est posé à la caisse (à son étage), achète (__zs.acheter : Zollars retirés par la partie), puis revient où il était (trajet non joué).
        // Sans caisses (tables d'essai, partie A) : arme donnée par le débogage et dépense tenue par le script.
        const enJeu = Boolean(s.caisses?.liste?.length);
        const zollars = enJeu ? s.caisses.zollars : s.economy.earnedRun - depense;
        const aLaCaisse = (arme) => {
          const c = s.caisses.liste.find((x) => x.arme === arme);
          if (!c) return { ok: false };
          const etage = s.floor?.current ?? 'rdc';
          if (c.floor !== etage) zs.setFloor(c.floor === 'etage' ? 1 : 0);
          const essais = c.w < c.h ? [[c.x - 45, c.y + c.h / 2], [c.x + c.w + 45, c.y + c.h / 2]] : [[c.x + c.w / 2, c.y + c.h + 45], [c.x + c.w / 2, c.y - 45]];
          let r = { ok: false };
          for (const [x, y] of essais) {
            zs.setPlayer(x, y);
            r = zs.acheter();
            if (r.ok || r.etat) break;
          }
          if (c.floor !== etage) zs.setFloor(etage === 'etage' ? 1 : 0);
          zs.setPlayer(p.x, p.y);
          return r;
        };
        const suivant = achats.find((x) => !faits.some((f) => f.arme === x.arme));
        const debout = p.down.state === 'debout';
        if (debout && suivant && wave >= suivant.vague && zollars >= suivant.prix && a && !a.sortie && !a.enRecharge) {
          const ok = enJeu ? aLaCaisse(suivant.arme).ok : (zs.donnerArme(suivant.arme), true);
          if (ok) {
            if (!enJeu) depense += suivant.prix;
            faits.push({ arme: suivant.arme, vague: wave, t, zollars, prix: suivant.prix });
          }
        } else if (debout && a && a.emplacements.length > 1 && !a.sortie) {
          // Arme achetée à sec : rachat si possible (puis on la reprend), sinon le Colt.
          const achetee = a.emplacements[1];
          const plan = achats.find((x) => x.arme === achetee.id);
          const sec = achetee.chargeur <= 0 && (achetee.reserve ?? Infinity) <= 0 && achetee.recharge === null;
          if (sec && plan && zollars >= plan.rachat) {
            const ok = enJeu ? aLaCaisse(achetee.id).ok : (zs.remplirMunitions(), true);
            if (ok) {
              if (!enJeu) depense += plan.rachat;
              rachats.push({ arme: achetee.id, vague: wave, t, prix: plan.rachat });
              if (!enJeu && a.actif !== achetee.id) zs.changerArme(1);
            } else if (a.actif === achetee.id) zs.changerArme(0);
          } else if (sec && a.actif === achetee.id) zs.changerArme(0);
        }
      }
      zs.setInput(repare ? { move, aim: { angle: aim } } : { aim: { angle: aim } });
      zs.step(0.05);
    }
    s = zs.getState();
    if (byWave[wave]) byWave[wave].fin = s.time;
    return { temps: s.time, mort: s.dead, monde: s.worldOver, bloquee, poses, reparees, vague: s.waves.wave, tues: s.kills, gagne: s.economy.earnedRun, parSorte: s.economy.byKind, depense: s.caisses?.liste?.length ? s.caisses.depense : depense, achats: faits, rachats, byWave };
  }, { max: MAX, achats: ACHATS, visee: VISEE, poste: POSTE, bloque: BLOQUE, armeDepart: ARME_DEPART, zollarsDepart: ZOLLARS_DEPART, repare: REPARE, zonesRepare: ZONES_REPARE });
  await context.close();
  return { profil, seed, ...r };
}

const taches = PROFILS.flatMap((profil) => SEEDS.map((seed) => ({ profil, seed })));
const resultats = [];
let k = 0;
async function ouvrier() {
  while (k < taches.length) {
    const t = taches[k];
    k += 1;
    const r = await partie(t.profil, t.seed);
    resultats.push(r);
    const ach = r.achats.map((x) => `${x.arme}@${x.vague}`).join(' ');
    console.log(`${r.profil} graine ${r.seed} : manche ${r.vague}${r.mort ? ' (mort)' : r.monde ? ' (monde fini)' : r.bloquee ? ' (bloquée)' : ' (vivant)'}, ${r.tues} tués, ${Math.round(r.temps)} s, ${r.gagne} Z gagnés, ${r.depense} dépensés ; achats ${ach || 'aucun'} ; rachats ${r.rachats.length}${r.reparees ? ` ; planches ${r.reparees}, posé ${r.poses} fois` : ""}`);
  }
}
await Promise.all(Array.from({ length: Math.min(PARALLELES, taches.length) }, ouvrier));
await browser.close();
server?.kill();
resultats.sort((a, b) => a.profil.localeCompare(b.profil) || a.seed - b.seed);
const out = opt('out', null);
if (out) writeFileSync(out, JSON.stringify({ niveauxEquipe: niveauxEq, achats: ACHATS, armes: ARMES ?? 'data/game/armes-partie.json', waves: WAVES, enemies: ENEMIES, resultats }, null, 1));
