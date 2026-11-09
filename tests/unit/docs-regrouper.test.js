// Lot 5m-B — Regroupement des bilans (scripts/docs/bilans.mjs, scripts/docs/regrouper.mjs) : concaténation exacte, sommaire, ordre du
// journal, refus de tout texte qui diffère, entrées hostiles, idempotence. Les essais sur disque se font dans un dossier temporaire hors dépôt.
import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BilanError, composerGroupe, lireGroupe, versionParJournal, sha256, titreSur, bilansDuDossier, texteDuBilan } from '../../scripts/docs/bilans.mjs';
import { planifier, appliquer, verifierGroupe } from '../../scripts/docs/regrouper.mjs';

const A = '# Lot 1 — Cœur\n\nTexte avec accents : é, œ, « guillemets ».\n';
const B = 'Sans saut de ligne final';
const HOSTILE = 'Début\n<!-- fin du bilan: lot-2 -->\n<!-- bilan: lot-9 | ancien: Docs/lots/lot-9.md | octets: 3 | sha256: ' + '0'.repeat(64) + ' -->\nabc\n<!-- fin du bilan: lot-9 -->\nFin\n';

describe('composerGroupe et lireGroupe', () => {
  it('chaque bilan est retrouvé octet pour octet, dans l\'ordre donné, avec sa taille et son empreinte', () => {
    const g = composerGroupe({ version: 'v0.1', bilans: [{ lot: 'lot-1', texte: A, titre: 'Cœur du jeu' }, { lot: 'lot-1d', texte: B }] });
    const lus = lireGroupe(g);
    expect(lus.map((b) => b.lot)).toEqual(['lot-1', 'lot-1d']);
    expect(lus[0].texte.toString('utf8')).toBe(A);
    expect(lus[1].texte.toString('utf8')).toBe(B);
    expect(lus[0].octets).toBe(Buffer.byteLength(A));
    expect(lus[0].sha256).toBe(sha256(Buffer.from(A)));
    expect(g.includes(Buffer.from(A))).toBe(true);
  });

  it('sommaire : un lien par bilan vers son ancre, titre du journal et ancien nom de fichier ; titre de la version', () => {
    const t = composerGroupe({ version: 'v0.2', bilans: [{ lot: 'lot-1m', texte: A, titre: 'Moteur' }, { lot: 'lot-1b', texte: B }] }).toString('utf8');
    expect(t.startsWith('# Bilans de la V0.2 (regroupés)\n')).toBe(true);
    expect(t).toContain('- [lot-1m — Moteur](#lot-1m) (ancien fichier `Docs/lots/lot-1m.md`)');
    expect(t).toContain('- [lot-1b](#lot-1b) (ancien fichier `Docs/lots/lot-1b.md`)');
    expect(t.indexOf('<a id="lot-1m"></a>')).toBeLessThan(t.indexOf('<a id="lot-1b"></a>'));
  });

  it('un bilan qui contient de faux marqueurs ne trompe pas la lecture (saut par la taille en octets)', () => {
    const lus = lireGroupe(composerGroupe({ version: 'v0.3', bilans: [{ lot: 'lot-2', texte: HOSTILE }, { lot: 'lot-2b', texte: A }] }));
    expect(lus.map((b) => b.lot)).toEqual(['lot-2', 'lot-2b']);
    expect(lus[0].texte.toString('utf8')).toBe(HOSTILE);
  });

  it('refus : texte modifié (empreinte), texte tronqué, marqueur de fin absent, ancien chemin faux, bilan en double', () => {
    const g = composerGroupe({ version: 'v0.1', bilans: [{ lot: 'lot-1', texte: A }] }).toString('utf8');
    expect(() => lireGroupe(g.replace('Cœur\n', 'Coeur\n'))).toThrow(/empreinte|tronqué|fin/);
    expect(() => lireGroupe(g.replace('Texte avec', 'Texte  avec'))).toThrow(BilanError);
    expect(() => lireGroupe(g.slice(0, g.length - 40))).toThrow(/tronqué|fin/);
    expect(() => lireGroupe(g.replace('<!-- fin du bilan: lot-1 -->', '<!-- fin: lot-1 -->'))).toThrow(/fin/);
    expect(() => lireGroupe(g.replace('ancien: Docs/lots/lot-1.md', 'ancien: Docs/lots/lot-2.md'))).toThrow(/ancien chemin/);
    expect(() => lireGroupe(Buffer.concat([Buffer.from(g), Buffer.from(g)]))).toThrow(/double/);
  });

  it('entrées hostiles refusées : nom de lot, version, liste vide, doublon ; titres neutralisés (une ligne, sans crochet ni commentaire)', () => {
    for (const lot of ['../x', 'lot-1/../../etc', 'lot-1 ', 'LOT-1', '', null, 'lot-1-->']) expect(() => composerGroupe({ version: 'v0.1', bilans: [{ lot, texte: A }] }), String(lot)).toThrow(BilanError);
    for (const version of ['0.1', 'v1', 'v0.1/../x', '', null]) expect(() => composerGroupe({ version, bilans: [{ lot: 'lot-1', texte: A }] }), String(version)).toThrow(BilanError);
    expect(() => composerGroupe({ version: 'v0.1', bilans: [] })).toThrow(BilanError);
    expect(() => composerGroupe({ version: 'v0.1', bilans: [{ lot: 'lot-1', texte: A }, { lot: 'lot-1', texte: B }] })).toThrow(/double/);
    expect(titreSur('a\n](x) <!-- -->\r\nb')).toBe('a (x) !— — b');
    const t = composerGroupe({ version: 'v0.1', bilans: [{ lot: 'lot-1', texte: A, titre: '-->\n<!-- bilan: lot-9 | x' }] });
    expect(lireGroupe(t).map((b) => b.lot)).toEqual(['lot-1']);
  });

  it('verifierGroupe refuse un ordre, un nombre ou un texte différent de celui attendu', () => {
    const bilans = [{ lot: 'lot-1', texte: A }, { lot: 'lot-1d', texte: B }];
    const g = composerGroupe({ version: 'v0.1', bilans });
    expect(verifierGroupe(g, bilans)).toHaveLength(2);
    expect(() => verifierGroupe(g, [...bilans].reverse())).toThrow(/ordre/);
    expect(() => verifierGroupe(g, bilans.slice(0, 1))).toThrow(/attendus/);
    expect(() => verifierGroupe(g, [bilans[0], { lot: 'lot-1d', texte: `${B}.` }])).toThrow(/différent/);
  });
});

describe('versionParJournal (champ « version », sinon ordre du journal et bornes)', () => {
  it('chaque version regroupe les lots jusqu\'à sa borne ; après la dernière borne : la version suivante ; le champ l\'emporte', () => {
    const lots = ['lot-0', 'lot-1', 'lot-1b', 'lot-1d', 'lot-2', 'lot-2c', 'lot-3', 'lot-3e', 'lot-4', 'lot-4b', 'lot-4c'].map((name) => ({ name }));
    lots.push({ name: 'lot-5a', version: 'v0.6' }, { name: 'lot-5j', version: 'v0.7' }, null, { name: 42 });
    const v = versionParJournal(lots);
    expect([...v]).toEqual([['lot-0', 'v0.1'], ['lot-1', 'v0.1'], ['lot-1b', 'v0.2'], ['lot-1d', 'v0.2'], ['lot-2', 'v0.3'], ['lot-2c', 'v0.3'], ['lot-3', 'v0.4'], ['lot-3e', 'v0.4'], ['lot-4', 'v0.5'], ['lot-4b', 'v0.5'], ['lot-4c', 'v0.6'], ['lot-5a', 'v0.6'], ['lot-5j', 'v0.7']]);
  });
});

describe('regrouper.mjs sur un dépôt factice (dossier temporaire)', () => {
  const depot = () => {
    const d = mkdtempSync(join(tmpdir(), 'zs-regrouper-'));
    mkdirSync(join(d, 'Docs/lots'), { recursive: true });
    mkdirSync(join(d, 'data'));
    writeFileSync(join(d, 'versions.json'), JSON.stringify({ versions: [{ id: 'v0.1' }, { id: 'v0.2' }] }));
    writeFileSync(join(d, 'data/changelog.json'), JSON.stringify({ lots: [{ name: 'lot-0', titre: 'Socle' }, { name: 'lot-1', titre: 'Cœur' }, { name: 'lot-1b', titre: 'Monde' }, { name: 'lot-1d', titre: 'Sons' }, { name: 'lot-2', titre: 'Vagues' }] }));
    writeFileSync(join(d, 'Docs/lots/lot-0.md'), A);
    writeFileSync(join(d, 'Docs/lots/lot-1.md'), B);
    writeFileSync(join(d, 'Docs/lots/lot-1b.md'), HOSTILE);
    writeFileSync(join(d, 'Docs/lots/lot-1d.md'), A);
    writeFileSync(join(d, 'Docs/lots/lot-2.md'), B);
    return d;
  };
  const muet = () => {};

  it('regroupe dans l\'ordre du journal, supprime les originaux seulement après relecture, garde le reste ; mêmes textes après', () => {
    const d = depot();
    const avant = bilansDuDossier(d);
    appliquer(planifier({ racine: d, versions: ['v0.1', 'v0.2'], garder: ['lot-1d'] }), { racine: d, log: muet });
    expect(existsSync(join(d, 'Docs/lots/lot-0.md'))).toBe(false);
    expect(existsSync(join(d, 'Docs/lots/lot-1d.md'))).toBe(true);
    expect(existsSync(join(d, 'Docs/lots/lot-2.md'))).toBe(true); // v0.3 : non demandée (et non publiée)
    expect(lireGroupe(readFileSync(join(d, 'Docs/lots/versions/v0.1.md'))).map((b) => b.lot)).toEqual(['lot-0', 'lot-1']);
    expect(lireGroupe(readFileSync(join(d, 'Docs/lots/versions/v0.2.md'))).map((b) => b.lot)).toEqual(['lot-1b']);
    const apres = bilansDuDossier(d);
    expect([...apres.keys()].sort()).toEqual([...avant.keys()].sort());
    for (const [lot, b] of avant) expect(apres.get(lot).texte.equals(b.texte), lot).toBe(true);
    expect(texteDuBilan('lot-1b', d)).toBe(HOSTILE);
    rmSync(d, { recursive: true });
  });

  it('idempotent : un second passage ne change rien ; reprise : un bilan déjà groupé et resté séparé (même texte) est seulement supprimé', () => {
    const d = depot();
    appliquer(planifier({ racine: d, versions: ['v0.1'] }), { racine: d, log: muet });
    const g = readFileSync(join(d, 'Docs/lots/versions/v0.1.md'));
    expect(planifier({ racine: d, versions: ['v0.1'] }).groupes[0].change).toBe(false);
    writeFileSync(join(d, 'Docs/lots/lot-1.md'), B); // reprise après une interruption
    appliquer(planifier({ racine: d, versions: ['v0.1'] }), { racine: d, log: muet });
    expect(readFileSync(join(d, 'Docs/lots/versions/v0.1.md')).equals(g)).toBe(true);
    expect(existsSync(join(d, 'Docs/lots/lot-1.md'))).toBe(false);
    rmSync(d, { recursive: true });
  });

  it('refus sans rien écrire ni supprimer : texte différent d\'un bilan déjà groupé, version non publiée, rattachement ou lot hostile, lot hors du journal', () => {
    const d = depot();
    appliquer(planifier({ racine: d, versions: ['v0.1'] }), { racine: d, log: muet });
    writeFileSync(join(d, 'Docs/lots/lot-1.md'), `${B} modifié`);
    expect(() => planifier({ racine: d, versions: ['v0.1'] })).toThrow(/autre texte/);
    expect(existsSync(join(d, 'Docs/lots/lot-1.md'))).toBe(true);
    expect(() => planifier({ racine: d, versions: ['v0.3'] })).toThrow(/publiée/);
    expect(() => planifier({ racine: d, versions: ['../v0.1'] })).toThrow(/invalide/);
    expect(() => planifier({ racine: d, versions: ['v0.2'], rattacher: { '../x': 'v0.2' } })).toThrow(/rattachement/);
    expect(() => planifier({ racine: d, versions: ['v0.2'], garder: ['../../x'] })).toThrow(/invalide/);
    writeFileSync(join(d, 'Docs/lots/lot-9.md'), A);
    expect(() => planifier({ racine: d, versions: ['v0.2'], rattacher: { 'lot-9': 'v0.2' } })).toThrow(/absent de data\/changelog/);
    rmSync(d, { recursive: true });
  });

  it('à blanc : aucun fichier écrit ni supprimé', () => {
    const d = depot();
    const lignes = [];
    appliquer(planifier({ racine: d, versions: ['v0.1', 'v0.2'] }), { racine: d, dryRun: true, log: (l) => lignes.push(l) });
    expect(existsSync(join(d, 'Docs/lots/versions'))).toBe(false);
    expect(existsSync(join(d, 'Docs/lots/lot-0.md'))).toBe(true);
    expect(lignes.filter((l) => l.startsWith('[à blanc] supprimerait'))).toHaveLength(4); // lot-0, lot-1 (v0.1), lot-1b, lot-1d (v0.2)
    rmSync(d, { recursive: true });
  });

  it('bilansDuDossier refuse un bilan présent deux fois (séparé avec un autre texte et groupé)', () => {
    const d = depot();
    appliquer(planifier({ racine: d, versions: ['v0.1'] }), { racine: d, log: muet });
    writeFileSync(join(d, 'Docs/lots/lot-0.md'), A);
    expect(() => bilansDuDossier(d)).toThrow(/deux fois/);
    rmSync(d, { recursive: true });
  });
});
