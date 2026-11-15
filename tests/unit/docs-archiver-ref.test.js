// Lot 8l-D — Archivage des fiches terminées de Docs/ref (scripts/docs/archiver-ref.mjs) : recopie exacte, sommaire, refus de tout texte qui
// diffère, fiches protégées et chemins hostiles refusés, idempotence, suppression seulement après relecture. Essais dans un dossier temporaire.
import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ArchiveError, composerArchive, lireArchive, planifier, appliquer } from '../../scripts/docs/archiver-ref.mjs';
import { sha256 } from '../../scripts/docs/bilans.mjs';

const A = '# Audit des tests (lot 4e)\n\nTexte avec accents : é, œ, « guillemets ».\n';
const B = 'Sans saut de ligne final';
const HOSTILE = 'Début\n<!-- fin de la fiche: b -->\n<!-- fiche: z | ancien: Docs/ref/z.md | octets: 3 | sha256: ' + '0'.repeat(64) + ' -->\nabc\n<!-- fin de la fiche: z -->\nFin\n';
const ARCH = 'Docs/ref/archives/essai.md';
const muet = () => {};

describe('composerArchive et lireArchive', () => {
  it('chaque fiche est retrouvée octet pour octet, dans l\'ordre, avec sa taille et son empreinte ; sommaire avec titre et ancien fichier', () => {
    const t = composerArchive({ titre: 'Archives', fiches: [{ nom: 'a', texte: A }, { nom: 'b', texte: B }, { nom: 'c', texte: HOSTILE }] });
    const lues = lireArchive(t);
    expect(lues.map((f) => f.nom)).toEqual(['a', 'b', 'c']);
    expect(lues.map((f) => f.texte.toString('utf8'))).toEqual([A, B, HOSTILE]);
    expect(lues[0].octets).toBe(Buffer.byteLength(A));
    expect(lues[0].sha256).toBe(sha256(Buffer.from(A)));
    const s = t.toString('utf8');
    expect(s.startsWith('# Archives\n')).toBe(true);
    expect(s).toContain('- [a — Audit des tests (lot 4e)](#a) (ancien fichier `Docs/ref/a.md`)');
    expect(s).toContain('- [b](#b) (ancien fichier `Docs/ref/b.md`)');
  });

  it('refuse une archive modifiée, tronquée ou sans marqueur de fin ; refuse fiche en double, protégée ou hors de Docs/ref', () => {
    const t = composerArchive({ titre: 'x', fiches: [{ nom: 'a', texte: A }] }).toString('utf8');
    expect(() => lireArchive(t.replace('accents', 'accentz'))).toThrow(ArchiveError);
    expect(() => lireArchive(t.replace('<!-- fin de la fiche: a -->', ''))).toThrow(ArchiveError);
    expect(() => lireArchive(t.slice(0, t.indexOf('Texte') + 3))).toThrow(ArchiveError);
    expect(() => composerArchive({ titre: 'x', fiches: [{ nom: 'a', texte: A }, { nom: 'a', texte: B }] })).toThrow(/double/);
    expect(() => composerArchive({ titre: 'x', fiches: [{ nom: 'conventions', texte: A }] })).toThrow(/protégée/);
    expect(() => composerArchive({ titre: 'x', fiches: [{ nom: '../seed', texte: A }] })).toThrow(ArchiveError);
    expect(() => composerArchive({ titre: 'x', fiches: [] })).toThrow(ArchiveError);
  });
});

describe('archiver-ref.mjs sur un dépôt factice (dossier temporaire)', () => {
  const depot = () => {
    const d = mkdtempSync(join(tmpdir(), 'zs-archiver-'));
    mkdirSync(join(d, 'Docs/ref'), { recursive: true });
    writeFileSync(join(d, 'Docs/ref/a.md'), A);
    writeFileSync(join(d, 'Docs/ref/b.md'), HOSTILE);
    writeFileSync(join(d, 'Docs/ref/garde.md'), B);
    return d;
  };

  it('archive, relit, puis supprime les originaux ; garde le reste ; mêmes textes après ; idempotent', () => {
    const d = depot();
    const rapport = appliquer(planifier({ racine: d, archive: ARCH, fiches: ['Docs/ref/a.md', 'Docs/ref/b.md'], titre: 'Essai' }), { racine: d, log: muet });
    expect(rapport.map((r) => [r.nom, r.octets])).toEqual([['a', Buffer.byteLength(A)], ['b', Buffer.byteLength(HOSTILE)]]);
    expect([existsSync(join(d, 'Docs/ref/a.md')), existsSync(join(d, 'Docs/ref/b.md')), existsSync(join(d, 'Docs/ref/garde.md'))]).toEqual([false, false, true]);
    const ecrit = readFileSync(join(d, ARCH));
    expect(lireArchive(ecrit).map((f) => f.texte.toString('utf8'))).toEqual([A, HOSTILE]);
    const plan = planifier({ racine: d, archive: ARCH, fiches: ['Docs/ref/a.md'], titre: 'Essai' });
    expect([plan.change, plan.aSupprimer]).toEqual([false, []]);
    rmSync(d, { recursive: true, force: true });
  });

  it('à blanc : rien n\'est écrit ni supprimé ; texte différent d\'une fiche déjà archivée : refusé, rien de supprimé ; archive hors de Docs/ref/archives : refusée', () => {
    const d = depot();
    appliquer(planifier({ racine: d, archive: ARCH, fiches: ['Docs/ref/a.md'], titre: 'Essai' }), { racine: d, dryRun: true, log: muet });
    expect([existsSync(join(d, ARCH)), existsSync(join(d, 'Docs/ref/a.md'))]).toEqual([false, true]);
    appliquer(planifier({ racine: d, archive: ARCH, fiches: ['Docs/ref/a.md'], titre: 'Essai' }), { racine: d, log: muet });
    writeFileSync(join(d, 'Docs/ref/a.md'), `${A}ajout`);
    expect(() => planifier({ racine: d, archive: ARCH, fiches: ['Docs/ref/a.md'], titre: 'Essai' })).toThrow(/autre texte/);
    expect(existsSync(join(d, 'Docs/ref/a.md'))).toBe(true);
    expect(() => planifier({ racine: d, archive: 'Docs/lots/x.md', fiches: ['Docs/ref/b.md'] })).toThrow(ArchiveError);
    expect(() => planifier({ racine: d, archive: ARCH, fiches: ['Docs/ref/absente.md'] })).toThrow(/absente/);
    rmSync(d, { recursive: true, force: true });
  });
});
