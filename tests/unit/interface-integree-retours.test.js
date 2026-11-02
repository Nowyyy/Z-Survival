// Lot 3l-C : retours du propriétaire appliqués dans le CSS et les données (Docs/ref/passation-interface-4b.md, § 2), priorité 2 non retenue (rien d'implémenté),
// compatibilité avec les autres refontes de lot-4b (visite libre du lot 3g, sons du lot 3i ; lot 3j absent de lot-4b).
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';

const uiCss = readFileSync('css/game-ui.css', 'utf8');
const html = readFileSync('jeu.html', 'utf8');
const hudJs = readFileSync('js/game/hud.js', 'utf8');
const gameJs = readdirSync('js/game').map((f) => readFileSync(`js/game/${f}`, 'utf8')).join('\n');
const fr = JSON.parse(readFileSync('data/i18n/fr.json', 'utf8'));
const rule = (sel) => {
  const esc = sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|\\n)${esc} \\{([^}]*)\\}`).exec(uiCss)?.[2] ?? '';
};
const choices = readFileSync('Docs/ref/interface-a-integrer.md', 'utf8');

describe('retours du propriétaire (1re retouche)', () => {
  it('vie sans barre : « VIE » et « 64/100 » seulement (aucun élément de barre dans le bloc de vie)', () => {
    const start = html.indexOf('id="hud-bar"');
    const life = html.slice(html.indexOf('>', start) + 1, html.indexOf('id="hud-chutes"')); // contenu du bloc de vie, sans sa balise
    expect(life).toContain('data-i18n="game.hud.lifeShort"');
    expect(life).toContain('id="hud-life"');
    expect(life).not.toMatch(/fill|bar"/);
    expect(hudJs).not.toMatch(/scaleX|hud-fill/);
  });

  it('« VAGUE » et « RESTANTS » en entier (plus « VAG », « RST »)', () => {
    expect(fr['game.hud.waveShort']).toBe('Vague');
    expect(fr['game.hud.remainingShort']).toBe('Restants');
    expect(Object.values(fr)).not.toContain('Vag');
    expect(Object.values(fr)).not.toContain('Rst');
  });

  it('étage de largeur fixe (« RDC » comme « Étage ») : 8,8 em − 3 em − l\'espace, centré', () => {
    expect(rule('.hud-floor')).toMatch(/justify-content: center;\s*width: calc\(8\.8em - 3em - var\(--hud-gap\)\);/);
  });

  it('tués prévus pour 4 chiffres : boîte de 8,6 em alignée à droite', () => {
    expect(rule('.hud-remaining,\n.hud-kills')).toMatch(/justify-content: flex-end;\s*width: 8\.6em;/);
  });
});

describe('retours du propriétaire (2e et 3e retouches)', () => {
  // Retour après l'intégration (avant : argent sous la vague, au centre) : argent à droite sous les tués, « +N » sous le bouton Pause.
  it('restants en haut à droite au-dessus des tués, puis l\'argent ; la colonne centrale ne garde que la vague et l\'état à terre', () => {
    const tr = html.slice(html.indexOf('class="hud-col hud-tr"'));
    expect(tr.indexOf('id="hud-remaining"')).toBeLessThan(tr.indexOf('id="hud-kills"'));
    expect(tr.indexOf('id="hud-kills"')).toBeLessThan(tr.indexOf('id="hud-money"'));
    const tc = html.slice(html.indexOf('class="hud-col hud-tc"'), html.indexOf('class="hud-col hud-tr"'));
    expect(tc).not.toContain('id="hud-money"');
    expect(rule('.hud-money')).toMatch(/grid-area: 3 \/ 1;/);
    expect(rule('.hud-gain')).toMatch(/left: calc\(100% \+ var\(--hud-gap\)\);[\s\S]*min-width: var\(--hud-pause-size\);/);
  });

  it('REC, VIE et la ligne chutes + étage s\'arrêtent au même bord droit (8,8 em)', () => {
    expect(rule('.hud-chrono,\n.hud-life,\n.hud-trial')).toMatch(/width: 8\.8em;/);
    expect(rule('.hud-chutes')).toMatch(/width: 3em;/);
    expect(rule('.hud-tl')).toMatch(/width: calc\(8\.8em \+ 0\.35em\);[\s\S]*padding: 0\.35em 0 0 0\.35em;/);
  });

  it('les deux premières lignes de droite tiennent dans la hauteur du bouton Pause (l\'argent en troisième ligne, même hauteur)', () => {
    expect(rule('.hud-tr')).toMatch(/grid-template-rows: repeat\(3, calc\(\(var\(--hud-pause-size\) - var\(--hud-gap\)\) \/ 2\)\);\s*row-gap: var\(--hud-gap\);/);
    expect(rule('.pause-button')).toMatch(/width: var\(--hud-pause-size\);\s*height: var\(--hud-pause-size\);/);
  });

  it('tués sans zéros devant ; vague et restants sur deux chiffres', async () => {
    const { killsText, pad2 } = await import('../../js/core/hud-format.js');
    expect(killsText(57)).toBe('57');
    expect(pad2(5)).toBe('05');
    expect(hudJs).toMatch(/killsText\(killCount\)/);
  });

  it('fins : « Voir ma sauvegarde » retiré, « Revenir au menu principal » (sans action)', () => {
    expect(html).not.toContain('end-save-link');
    expect(html).toContain('data-i18n="game.end.menu"');
    expect(gameJs).not.toMatch(/getElementById\('btn-menu'\)|\$\('btn-menu'\)/);
  });

  it('à terre : texte dans la colonne centrale sous la vague (l\'argent est parti à droite), sans cadre blanc, angles droits', () => {
    const body = rule('.down-body');
    expect(body).not.toMatch(/border(-width|-color)?:/);
    expect(body).not.toMatch(/border-radius/);
    expect(html.indexOf('id="down-body"')).toBeGreaterThan(html.indexOf('id="hud-wave"'));
    expect(html.indexOf('id="down-body"')).toBeLessThan(html.indexOf('class="hud-col hud-tr"'));
  });

  it('« Mode essai » dans la colonne de gauche, sous chutes + étage', () => {
    const tl = html.slice(html.indexOf('class="hud-col hud-tl"'), html.indexOf('class="hud-col hud-tc"'));
    expect(tl.indexOf('id="hud-trial"')).toBeGreaterThan(tl.indexOf('id="hud-floor"'));
  });
});

describe('priorité 2 : aucune proposition retenue, rien d\'implémenté', () => {
  it('la source des choix dit « priorite2=aucune »', () => {
    expect(choices).toMatch(/^priorite2=aucune$/m);
  });

  it.each([['retour de dégâts', /p2-|damage-flash|hurt-flash|playerHurt/], ['alerte de vie faible', /low-?hp|vie-faible|is-low/], ['aide de démarrage', /p-hint|start-help|aide-demarrage/], ['curseur de visée', /aim-cursor|crosshair-ring|curseur-visee/], ['« Nouvelle zone » remise en forme', /zone-banner|nouvelle-zone/]])('%s : aucune règle ni aucun code dans l\'interface du jeu', (_, re) => {
    expect(uiCss).not.toMatch(re);
    expect(html).not.toMatch(re);
    expect(hudJs).not.toMatch(re);
    expect(readFileSync('js/game/ui.js', 'utf8')).not.toMatch(re);
  });
});

describe('compatibilité avec les refontes de lot-4b', () => {
  it('lot 3i (sons) : aucune interface ne dépend d\'un son (hud.js, ui.js, hud-format.js n\'importent aucun module de son ; le HUD n\'en parle pas)', () => {
    for (const f of ['js/game/hud.js', 'js/game/ui.js', 'js/core/hud-format.js']) {
      for (const m of readFileSync(f, 'utf8').matchAll(/from '([^']+)'/g)) expect(m[1], f).not.toMatch(/audio|synth|sound|voice|footsteps/);
    }
    for (const f of ['js/game/hud.js', 'js/core/hud-format.js']) expect(readFileSync(f, 'utf8'), f).not.toMatch(/audio|synth|AudioContext/i);
  });

  it('lot 3g (visite libre) : sans vagues, le bloc de vague est invisible (sa place reste) et la ligne 1 de droite est vide', () => {
    expect(hudJs).toMatch(/els\.wave\.dataset\.idle = String\(!active\)/);
    expect(rule('.hud-wave[data-idle="true"]')).toMatch(/visibility: hidden;/);
    expect(hudJs).toMatch(/setHidden\(els\.remaining, !fighting\);\s*setHidden\(els\.next, !waiting\);/);
  });

  it('lot 3j (sang, personnages v2) : absent de lot-4b au moment du lot 3l (vérification faite en e2e quand il y sera)', () => {
    expect(existsSync('Docs/lots/lot-3j.md')).toBe(false);
  });

  it('ordre des couches : HUD (z-index 2) au-dessus du voile à terre (z-index 1) et sous les panneaux (z-index 10)', () => {
    expect(rule('.hud')).toMatch(/z-index: 2;/);
    expect(rule('.panel-wrap')).toMatch(/z-index: 10;/);
    expect(readFileSync('css/game.css', 'utf8')).toMatch(/\.down \{[^}]*z-index: 1;/);
  });
});
