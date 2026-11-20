// Lot 9g — Section « Époque » de l'atelier des personnages : variantes d'époque (Seconde Guerre mondiale) du Survivant, du personnage 2 et
// des quatre types de zombies (data/game/persos-epoque.json, construites par js/core/persos-variants.js), comparées à l'apparence actuelle,
// dans le rendu du jeu (render.json, sols du jeu, lune ; lampe à huile de lumieres.json en « Éclairage »). Un seul moteur WebGL, hors page :
// chaque vue est dessinée puis recopiée dans son canevas 2D, seulement quand elle est à l'écran. Rien n'est enregistré : le texte du fichier
// de choix (data/game/persos-epoque-choix.json) est à copier. Le jeu ne lit rien de cette section.
import * as THREE from 'three';
import { createV2Kit } from '../game/character-v2.js';
import { characterStats } from '../core/character-parts.js';
import { SUFFIXE_SIMPLE, lireChoixEpoque, resolveVariant, slotsWithEpoch } from '../core/persos-variants.js';
import { tenueArme } from '../core/armes/tenue-jeu.js';
import { creerArmesEnMain } from '../armes/en-main.js';
import { chargerArmes } from '../game/armes-chargement.js';
import { createStage, viewCamera } from './scene.js';

export const PERSOS = ['survivant', 'personnage-2', 'marcheur', 'petit', 'voute', 'grand'];
export const LETTRES = ['A', 'B', 'C'];
const SLOT = (perso) => (perso === 'survivant' || perso === 'personnage-2' ? 'joueur' : perso);
const ZOMBIES = ['marcheur', 'petit', 'voute', 'grand'];
const ANIMS = { joueur: ['repos', 'marche'], zombie: ['marche', 'course', 'rampe', 'attaque', 'attente', 'marcheLente'] };
const ARMES = ['aucune', 'm1911', 'thompson', 'garand'];
const GAIT_OF = { marcheLente: 'lent', marche: 'marche', rampe: 'rampe', course: 'course' };
const TAU = Math.PI * 2;
// Id de variante : époque (lettre) ou apparence actuelle (riche au niveau complet, A au niveau simple).
export function variantId(perso, lettre, niveau) {
  if (lettre === 'actuelle') return niveau === 'simple' ? 'A' : 'riche';
  const base = perso === 'personnage-2' ? `para-${lettre}` : `epoque-${lettre}`;
  return niveau === 'simple' ? `${base}${SUFFIXE_SIMPLE}` : base;
}

const json = (path) => fetch(path).then((r) => (r.ok ? r.json() : Promise.reject(new Error(`${path} : ${r.status}`))));

// ctx : { t, $, characters, poses, render, camera, palette, lookup, floors, enemies, gaits, player, zombieIds, testMode }.
export async function initEpoque(ctx) {
  const { t, $, characters, poses, render, camera, palette, lookup, floors, enemies, gaits, player, testMode } = ctx;
  const [epoque, choixJson, armes] = await Promise.all([json('data/game/persos-epoque.json'), json('data/game/persos-epoque-choix.json').catch(() => null), chargerArmes(null)]);
  const slots = slotsWithEpoch(characters.slots, epoque);
  const chars = { ...characters, slots };
  const slotOf = (id) => slots.find((s) => s.id === id);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const state = {
    perso: 'marcheur', lettre: 'A', tenue: 0, niveau: 'complet', anim: 'marche', arme: 'm1911', sol: 'carrelage', lumiere: 'eclairage', usure: 0, horde: 'choix',
    playing: !testMode && !reduced, time: 0,
    choix: lireChoixEpoque(choixJson, epoque, PERSOS, SLOT),
  };

  // --- Moteur unique, hors page ------------------------------------------------------------------------------------------------------------
  let renderer = null;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
  } catch {
    renderer = null;
  }
  const kitOpts = { characters: chars, poses, lookup, hit: palette.hit, zombieIds: ctx.zombieIds, seed: 9, wear: () => state.usure };
  const kit = createV2Kit(kitOpts);
  const kitArme = createV2Kit({ ...kitOpts, sansPistolet: true });
  const armesKit = armes ? creerArmesEnMain({ donnees: armes.donnees, choix: armes.choix, palette: armes.palette, poses: armes.poses }) : null;
  const zIndex = (slot) => Math.max(0, ctx.zombieIds.indexOf(slot));

  // Scène : sol, lune (soleil de render.json), lumière ambiante ; lampe à huile (lumieres.json) en « Éclairage » (Élevé).
  const lum = await json('data/game/lumieres.json');
  const stage = createStage({ render, palette, floors });
  const ambient = stage.scene.children.find((o) => o.isAmbientLight);
  const base = { ambient: ambient?.intensity ?? 1, sun: stage.sun.intensity };
  const lamp = new THREE.PointLight(palette.lampLight, lum.intensite, lum.distance, lum.decroissance);
  lamp.position.set(-140, 60, -90); // à distance moyenne, comme une lampe murale de la carte (pas au-dessus des personnages)
  stage.scene.add(lamp);
  function applyLight() {
    const ecl = state.lumiere === 'eclairage';
    if (ambient) ambient.intensity = base.ambient * (ecl ? Math.max(lum.plancherAmbiance, lum.ambiance) : 1);
    stage.sun.intensity = base.sun * (ecl ? lum.lune.intensite : 1);
    lamp.visible = ecl;
    stage.ground.set(state.sol);
  }

  // --- Personnages --------------------------------------------------------------------------------------------------------------------------
  const lettreDe = (id) => (typeof id === 'string' ? id.slice(-1) : 'A');
  const tenues = (perso, lettre, niveau = state.niveau) => slotOf(SLOT(perso)).variants.find((v) => v.id === variantId(perso, lettre, niveau))?.outfits ?? [];
  const tenuesAvec = new Map();
  function tenueArmeDe(variant, id) {
    const key = `${variant.id}:${id}`;
    if (!tenuesAvec.has(key)) tenuesAvec.set(key, armesKit ? tenueArme({ variant, skeletons: poses.skeletons, posesV2: poses, posesArmes: armes.poses, id, corps: characters.corps }) : null);
    return tenuesAvec.get(key);
  }
  function make(perso, lettre, outfit, opts = {}) {
    const slot = SLOT(perso);
    const id = variantId(perso, lettre, opts.niveau ?? state.niveau);
    const armed = slot === 'joueur' && (opts.arme ?? state.arme) !== 'aucune' && armesKit;
    const k = armed ? kitArme : kit;
    const n = Math.max(1, tenues(perso, lettre, opts.niveau ?? state.niveau).length || slotOf(slot).variants.find((v) => v.id === id)?.outfits.length || 1);
    const c = k.create(slot === 'joueur' ? 'player' : 'zombie', zIndex(slot), { choice: id, outfit: Math.min(outfit, n - 1), wear: state.usure });
    const ch = { c, perso, slot, lettre, id, anim: opts.anim ?? null, arme: armed ? opts.arme ?? state.arme : null, offset: opts.offset ?? 0 };
    if (armed) {
      const variant = slotOf('joueur').variants.find((v) => v.id === id);
      const tn = tenueArmeDe(variant, ch.arme);
      if (tn) c.setArme({ id: ch.arme, mesh: armesKit.mesh(ch.arme).clone(), angles: tn.angles, local: tn.local, pointe: armesKit.pointe(ch.arme), pivot: tn.pivot, poignets: tn.poignets });
    }
    return ch;
  }
  // Phase d'une animation au temps donné (même règle que la vue principale de l'atelier : vitesse de l'allure et foulée).
  function animate(ch, time) {
    const anim = ch.anim ?? state.anim;
    const tm = time + ch.offset;
    if (ch.slot === 'joueur') {
      const walk = anim === 'marche';
      const phase = walk ? ((tm * player.speed) / poses.strides.joueur) * TAU : 0;
      ch.c.setPose(null, { time: tm, amount: walk ? 1 : 0, phase, aim: 0, facing: 0, recoil: 0, avant: 1, lateral: 0 }, { down: null, repairing: false, hurt: false });
      return;
    }
    const g = GAIT_OF[anim];
    let phase;
    if (g) phase = (tm * gaits.gaits[g].speed * (enemies.variants[ch.slot]?.speedMul ?? 1)) / poses.strides[anim];
    else if (anim === 'attaque') phase = (tm % (poses.durations.attaque + 0.4)) / poses.durations.attaque;
    else phase = tm / 2.4;
    ch.c.setAnim(anim, anim === 'attaque' ? Math.min(1, phase) : phase, {}, tm);
  }

  // Groupes de chaque vue (une scène partagée : seuls les personnages de la vue dessinée sont visibles).
  const groups = { gros: [], jeu: [], tenues: [], horde: [] };
  const roots = new THREE.Group();
  stage.scene.add(roots);
  function clear(list) {
    for (const ch of list) {
      ch.c.root.removeFromParent();
      ch.c.dispose?.();
    }
    list.length = 0;
  }
  const place = (ch, x, z, yaw = 0) => {
    ch.c.root.position.set(x, 0, z);
    ch.c.root.rotation.y = yaw;
    roots.add(ch.c.root);
    return ch;
  };
  function rebuild() {
    for (const k of Object.keys(groups)) clear(groups[k]);
    const isZ = SLOT(state.perso) !== 'joueur';
    if (!ANIMS[isZ ? 'zombie' : 'joueur'].includes(state.anim)) state.anim = isZ ? 'marche' : 'marche';
    groups.gros.push(place(make(state.perso, state.lettre, state.tenue), 0, 0));
    // Vue du jeu : actuelle, A, B, C côte à côte (même tenue, même animation).
    // Retour du propriétaire (« on distingue difficilement le personnage 2 du personnage 1 ») : le Survivant retenu à côté, pour comparer.
    const rang = [...['actuelle', ...LETTRES].map((l) => [state.perso, l, state.tenue]), ...(state.perso === 'personnage-2' ? [['survivant', lettreDe(state.choix.survivant), 0]] : [])];
    const pas = rang.length > 4 ? 50 : 64;
    rang.forEach(([p, l, o], i) => groups.jeu.push(place(make(p, l, o), (i - (rang.length - 1) / 2) * pas, 0, 0.35)));
    // Planche des tenues (sous-variantes).
    const list = tenues(state.perso, state.lettre);
    list.forEach((_, i) => groups.tenues.push(place(make(state.perso, state.lettre, i), (i - (list.length - 1) / 2) * 52, 0, 0.35)));
    // Horde : vingt zombies mélangés (types, tenues, allures), autour du Survivant armé.
    const hordeAnims = ['marche', 'course', 'marche', 'rampe', 'attaque', 'marcheLente'];
    for (let i = 0; i < 20; i += 1) {
      const type = ZOMBIES[i % 4];
      // Choix : variantes retenues du type (liste du fichier de choix, A et B pour les zombies), tour à tour.
      const retenues = [state.choix[type]].flat().map(lettreDe);
      const lettre = state.horde === 'choix' ? retenues[Math.floor(i / 4) % retenues.length] : state.horde === 'melange' ? LETTRES[i % 3] : state.horde;
      const a = (i / 20) * TAU + 0.3;
      const r = 110 + (i % 3) * 38;
      const ch = make(type, lettre, Math.floor(i / 4) + (i % 4), { anim: hordeAnims[i % hordeAnims.length], offset: i * 0.37 });
      groups.horde.push(place(ch, Math.cos(a) * r * 1.5, Math.sin(a) * r, Math.atan2(-Math.cos(a), -Math.sin(a))));
    }
    groups.horde.push(place(make('survivant', lettreDe(state.choix.survivant), 0, { anim: 'repos', arme: 'thompson' }), 0, 0, 0.5));
  }

  // --- Vues ---------------------------------------------------------------------------------------------------------------------------------
  const cam = new THREE.PerspectiveCamera();
  const VIEWS = {
    gros: { canvas: $('ep-canvas-gros'), group: 'gros', view: 'orbite', zoom: 1.6 },
    jeu: { canvas: $('ep-canvas-jeu'), group: 'jeu', view: 'jeu', zoom: 1 },
    zoom3: { canvas: $('ep-canvas-zoom3'), group: 'jeu', view: 'jeu', zoom: 3 },
    // 1920 × 1080 : même cadrage que le jeu (la distance de la caméra ne dépend que du rapport largeur / hauteur, js/core/viewport.js).
    hd: { canvas: $('ep-canvas-hd'), group: 'horde', view: 'jeu', zoom: 1080 / 375 },
    tenues: { canvas: $('ep-canvas-tenues'), group: 'tenues', view: 'jeu', zoom: 2 },
    horde: { canvas: $('ep-canvas-horde'), group: 'horde', view: 'jeu', zoom: 1 },
  };
  const visible = new Set(Object.keys(VIEWS));
  if ('IntersectionObserver' in window && !testMode) {
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        const key = e.target.dataset.vue;
        if (e.isIntersecting) visible.add(key);
        else visible.delete(key);
      }
    });
    for (const [key, v] of Object.entries(VIEWS)) {
      v.canvas.dataset.vue = key;
      io.observe(v.canvas);
    }
  }
  const info = {};
  function drawView(key) {
    const v = VIEWS[key];
    if (!renderer || !v.canvas) return;
    const w = v.canvas.width;
    const h = v.canvas.height;
    for (const [name, list] of Object.entries(groups)) for (const ch of list) ch.c.root.visible = name === v.group;
    const yaw = key === 'gros' ? (state.playing ? state.time * 0.6 : 0.6) : 0;
    const vc = viewCamera(cam, { view: v.view, width: w, height: h, zoom: v.zoom, yaw, gameDistance: camera.distance, fov: render.camera.fov, tilt: render.camera.tilt });
    stage.setFog(key === 'gros' ? camera.distance : vc.distance);
    renderer.setPixelRatio(1);
    renderer.setSize(w, h, false);
    renderer.render(stage.scene, cam);
    info[key] = { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, width: w, height: h };
    const g = v.canvas.getContext('2d');
    g.drawImage(renderer.domElement, 0, 0, w, h);
  }
  function draw(all = false) {
    for (const list of Object.values(groups)) for (const ch of list) animate(ch, state.time);
    for (const key of Object.keys(VIEWS)) if (all || visible.has(key)) drawView(key);
  }

  // --- Budgets (purs : characterStats, maximum sur les tenues) -----------------------------------------------------------------------------
  function budgetOf(perso, lettre, niveau) {
    const v = slotOf(SLOT(perso)).variants.find((x) => x.id === variantId(perso, lettre, niveau));
    if (!v) return null;
    let triangles = 0;
    let appels = 0;
    for (let o = 0; o < Math.max(1, v.outfits.length); o += 1) {
      const st = characterStats(resolveVariant(v, { outfit: o, wearTiers: characters.wearTiers }), { skeletons: poses.skeletons });
      triangles = Math.max(triangles, st.triangles);
      appels = Math.max(appels, st.calls + st.shadowCalls);
    }
    return { triangles, appels };
  }
  const budgets = [];
  function buildBudgets() {
    const body = $('ep-budgets');
    body.textContent = '';
    budgets.length = 0;
    for (const perso of PERSOS) {
      for (const niveau of ['complet', 'simple']) {
        const ref = budgetOf(perso, 'actuelle', niveau);
        const row = { perso, niveau, actuelle: ref, variantes: {} };
        const tr = document.createElement('tr');
        const cell = (text, head = false) => {
          const td = document.createElement(head ? 'th' : 'td');
          if (head) td.scope = 'row';
          td.textContent = text;
          tr.append(td);
          return td;
        };
        cell(`${t(`dev.epoque.perso.${perso}`)} — ${t(`dev.epoque.niveau.${niveau}`)}`, true);
        cell(t('dev.epoque.budget.cell', { tri: ref.triangles, appels: ref.appels }));
        for (const l of LETTRES) {
          const b = budgetOf(perso, l, niveau);
          const pct = Math.round((1000 * (b.triangles - ref.triangles)) / ref.triangles) / 10;
          row.variantes[l] = { ...b, ecart: pct };
          const td = cell(t('dev.epoque.budget.cellPct', { tri: b.triangles, appels: b.appels, pct: `${pct > 0 ? '+' : ''}${String(pct).replace('.', ',')}` }));
          if (pct > 10 || b.appels > 4) td.classList.add('persos-out');
        }
        budgets.push(row);
        body.append(tr);
      }
    }
  }

  // --- Contrôles ------------------------------------------------------------------------------------------------------------------------------
  const fill = (select, options, value) => {
    select.textContent = '';
    for (const [v, label] of options) {
      const o = document.createElement('option');
      o.value = String(v);
      o.textContent = label;
      select.append(o);
    }
    select.value = String(value);
  };
  function syncControls() {
    const slot = SLOT(state.perso);
    fill($('ep-perso'), PERSOS.map((p) => [p, t(`dev.epoque.perso.${p}`)]), state.perso);
    fill($('ep-lettre'), LETTRES.map((l) => [l, t(`dev.epoque.lettre.${state.perso === 'personnage-2' ? 'p2' : slot === 'joueur' ? 'p1' : 'z'}.${l}`)]), state.lettre);
    const list = tenues(state.perso, state.lettre);
    state.tenue = Math.min(state.tenue, Math.max(0, list.length - 1));
    fill($('ep-tenue'), list.map((o, i) => [i, t('dev.epoque.tenue.n', { n: i + 1, label: o.label })]), state.tenue);
    fill($('ep-niveau'), ['complet', 'simple'].map((n) => [n, t(`dev.epoque.niveau.${n}`)]), state.niveau);
    const anims = ANIMS[slot === 'joueur' ? 'joueur' : 'zombie'];
    fill($('ep-anim'), anims.map((a) => [a, t(`dev.persos.anim.${a}`)]), state.anim);
    fill($('ep-arme'), ARMES.map((a) => [a, t(`dev.epoque.arme.${a}`)]), state.arme);
    $('ep-arme').disabled = slot !== 'joueur';
    fill($('ep-sol'), ['carrelage', 'herbe', 'route', 'escalier'].map((s) => [s, t(`dev.persos.sol.${s}`)]), state.sol);
    fill($('ep-lumiere'), ['eclairage', 'lune'].map((s) => [s, t(`dev.epoque.lumiere.${s}`)]), state.lumiere);
    fill($('ep-usure'), [0, 1, 2, 3].map((i) => [i, t('dev.persos.usure.palier', { n: i })]), state.usure);
    fill($('ep-horde-lettre'), [['choix', t('dev.epoque.horde.choix.fichier')], ['melange', t('dev.epoque.horde.melange')], ...LETTRES.map((l) => [l, t('dev.epoque.horde.lettre', { l })]), ['actuelle', t('dev.epoque.horde.actuelle')]], state.horde);
    const v = slotOf(slot).variants.find((x) => x.id === variantId(state.perso, state.lettre, state.niveau));
    $('ep-intent').textContent = v ? `${v.label} : ${v.intent}` : '';
    $('ep-jeu-legende').textContent = t('dev.epoque.jeu.legende');
  }
  function updateChoices() {
    for (const p of PERSOS) {
      const node = $(`ep-choix-${p}`);
      const kind = p === 'personnage-2' ? 'p2' : SLOT(p) === 'joueur' ? 'p1' : 'z';
      const seules = LETTRES.map((l) => [variantId(p, l, 'complet'), t(`dev.epoque.lettre.${kind}.${l}`)]);
      // Zombies : une variante ou plusieurs, tirées tour à tour (retour du propriétaire : A et B mélangés).
      const listes = kind === 'z' ? [[['A', 'B'], 'dev.epoque.choix.ab'], [LETTRES, 'dev.epoque.choix.abc']].map(([ls, key]) => [ls.map((l) => variantId(p, l, 'complet')).join(','), t(key)]) : [];
      if (node) fill(node, [...seules, ...listes], [state.choix[p]].flat().join(','));
    }
    $('ep-choix-texte').value = JSON.stringify({ version: 1, choix: state.choix }, null, 2);
  }
  const on = (id, key, parse = (v) => v, after = () => {}) => $(id).addEventListener('change', () => {
    state[key] = parse($(id).value);
    after();
    rebuild();
    syncControls();
    draw(true);
  });
  on('ep-perso', 'perso', String, () => { state.tenue = 0; });
  on('ep-lettre', 'lettre');
  on('ep-tenue', 'tenue', Number);
  on('ep-niveau', 'niveau');
  on('ep-anim', 'anim');
  on('ep-arme', 'arme');
  on('ep-sol', 'sol', String, applyLight);
  on('ep-lumiere', 'lumiere', String, applyLight);
  on('ep-usure', 'usure', Number);
  on('ep-horde-lettre', 'horde');
  for (const p of PERSOS) {
    $(`ep-choix-${p}`).addEventListener('change', () => {
      const v = $(`ep-choix-${p}`).value.split(',');
      state.choix[p] = v.length > 1 ? v : v[0];
      updateChoices();
    });
  }
  $('ep-play').addEventListener('click', () => {
    state.playing = !state.playing;
    $('ep-play').textContent = t(state.playing ? 'dev.persos.pause' : 'dev.persos.play');
    $('ep-play').setAttribute('aria-pressed', String(state.playing));
  });
  $('ep-copier').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText($('ep-choix-texte').value);
      $('ep-copie').textContent = t('dev.persos.copied');
    } catch {
      $('ep-choix-texte').select();
      $('ep-copie').textContent = t('dev.persos.copy.failed');
    }
  });
  $('ep-play').textContent = t(state.playing ? 'dev.persos.pause' : 'dev.persos.play');
  $('ep-play').setAttribute('aria-pressed', String(state.playing));
  if (!renderer) $('ep-webgl').hidden = false;

  applyLight();
  rebuild();
  syncControls();
  updateChoices();
  buildBudgets();
  draw(true);

  let last = null;
  const loop = (now) => {
    requestAnimationFrame(loop);
    const dt = last === null ? 0 : Math.min(0.1, (now - last) / 1000);
    last = now;
    if (testMode || document.hidden || !state.playing) return;
    state.time += dt;
    draw();
  };
  requestAnimationFrame(loop);

  return {
    getState: () => ({
      ready: true, webgl: Boolean(renderer), perso: state.perso, lettre: state.lettre, tenue: state.tenue, niveau: state.niveau, anim: state.anim, arme: state.arme, sol: state.sol, lumiere: state.lumiere, usure: state.usure, horde: state.horde, playing: state.playing, time: state.time,
      choix: structuredClone(state.choix), texte: $('ep-choix-texte').value,
      vues: structuredClone(info),
      groupes: Object.fromEntries(Object.entries(groups).map(([k, list]) => [k, list.map((ch) => ({ perso: ch.perso, slot: ch.slot, id: ch.id, outfit: ch.c.outfit, triangles: ch.c.readPose().triangles, arme: ch.c.arme }))])),
      budgets: structuredClone(budgets),
      textures: { count: kit.textureCount() + kitArme.textureCount(), bytes: kit.textureBytes() + kitArme.textureBytes() },
    }),
    set(id, value) {
      const node = $(id);
      if (!node) return false;
      node.value = String(value);
      node.dispatchEvent(new Event('change'));
      return true;
    },
    step(seconds) {
      state.time += Math.max(0, Number(seconds) || 0);
      draw(true);
      return state.time;
    },
    render: () => draw(true),
  };
}
