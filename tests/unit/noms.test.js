// Lot 5h-A : fichier des noms (noms-versions-et-lots.txt) et son analyseur pur (scripts/site/noms.mjs).
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { appliquerNoms, formatErreur, MAX_DESCRIPTION, MAX_NOM, NOMS_FICHIER, parseNoms } from '../../scripts/site/noms.mjs';
import { cleanText, MAX_TITLE } from '../../scripts/site/site-info.mjs';

const versions = JSON.parse(readFileSync('versions.json', 'utf8'));
const changelog = JSON.parse(readFileSync('data/changelog.json', 'utf8'));
const lignes = (r) => r.erreurs.map((e) => e.ligne);
const bloc = (r, id) => r.blocs.find((b) => b.id === id);

describe('parseNoms : cas valides', () => {
  it('blocs de version et de lot, commentaires, lignes vides, ordre du fichier', () => {
    const r = parseNoms('# titre\n\n[v0.6]\nnom: V0.6\ndescription: Une version.\n\n  # commentaire indenté\n[lot-5a]\nversion: v0.6\nnom: Voiture\ndescription: Elle brûle.\nafficher: non\n');
    expect(r.erreurs).toEqual([]);
    expect(r.blocs).toEqual([
      { id: 'v0.6', type: 'version', ligne: 3, nom: 'V0.6', description: 'Une version.' },
      { id: 'lot-5a', type: 'lot', ligne: 8, version: 'v0.6', nom: 'Voiture', description: 'Elle brûle.', afficher: false },
    ]);
  });
  it('CRLF, BOM UTF-8 (texte et octets), espaces autour des valeurs et des clés', () => {
    const texte = '\uFEFF[lot-5b]\r\n  nom  :   Réglage   \r\n\tdescription:\tTexte\t\r\nafficher: OUI\r\n';
    for (const entree of [texte, new TextEncoder().encode(texte), Buffer.from(texte.slice(1), 'utf8')]) {
      const r = parseNoms(entree);
      expect(r.erreurs).toEqual([]);
      expect(r.blocs[0]).toMatchObject({ id: 'lot-5b', nom: 'Réglage', description: 'Texte', afficher: true });
    }
    expect(parseNoms(Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('[v0.1]\nnom: V0.1\n')])).blocs[0]).toMatchObject({ id: 'v0.1', nom: 'V0.1' });
  });
  it('le premier deux-points sépare la clé : les textes peuvent contenir des deux-points', () => {
    const r = parseNoms('[v0.2]\ndescription: Jeu en Three.js : monde, textures : sons\nnom: V0.2 : bêta\n');
    expect(r.erreurs).toEqual([]);
    expect(bloc(r, 'v0.2')).toMatchObject({ description: 'Jeu en Three.js : monde, textures : sons', nom: 'V0.2 : bêta' });
  });
  it('limites de longueur exactes : nom 60, description 200 (caractères, pas octets)', () => {
    const nom = 'é'.repeat(MAX_NOM);
    const description = '🧟'.repeat(MAX_DESCRIPTION);
    const ok = parseNoms(`[lot-x]\nnom: ${nom}\ndescription: ${description}\n`);
    expect(ok.erreurs).toEqual([]);
    expect(bloc(ok, 'lot-x')).toMatchObject({ nom, description });
    const long = parseNoms(`[lot-x]\nnom: ${nom}a\ndescription: ${description}a\n`);
    expect(lignes(long)).toEqual([2, 3]);
    expect(long.erreurs[0].message).toMatch(/Nom trop long \(61 caractères, 60 au plus\)/);
    expect(long.erreurs[1].message).toMatch(/Description trop longue \(201 caractères, 200 au plus\)/);
  });
  it('texte vide, seulement des commentaires, sans fin de ligne finale', () => {
    expect(parseNoms('')).toEqual({ blocs: [], erreurs: [] });
    expect(parseNoms('# a\n#b\n\n')).toEqual({ blocs: [], erreurs: [] });
    expect(parseNoms('[v0.1]\nnom: V0.1').blocs[0].nom).toBe('V0.1');
  });
});

describe('parseNoms : chaque erreur a sa ligne et un message clair en français', () => {
  const cas = [
    ['clé inconnue', '[lot-5a]\ntitre: x\n', 2, /Clé inconnue « titre » : clés possibles nom, description, version et afficher/],
    ['bloc sans identifiant', '[]\nnom: x\n', 1, /Bloc sans identifiant/],
    ['en-tête mal formé', '[lot-5a\nnom: x\n', 1, /En-tête de bloc mal formé/],
    ['identifiant invalide', '[lot 5a]\n', 1, /Identifiant de bloc invalide « lot 5a »/],
    ['version mal formée en en-tête', '[v0.6.1]\n', 1, /Identifiant de bloc invalide « v0\.6\.1 » \(une version s'écrit v<nombre>\.<nombre>/],
    ['majuscules', '[Lot-5A]\n', 1, /écris-le en minuscules \(« lot-5a »\)/],
    ['majuscules (version)', '[V0.6]\n', 1, /écris-le en minuscules \(« v0\.6 »\)/],
    ['identifiant en double', '[lot-5a]\nnom: a\n\n[lot-5a]\nnom: b\n', 4, /Identifiant en double « lot-5a »/],
    ['valeur vide', '[lot-5a]\nnom:   \n', 2, /Valeur vide pour « nom »/],
    ['afficher autre que oui ou non', '[lot-5a]\nafficher: peut-être\n', 2, /« afficher » vaut « peut-être » .* écris oui ou non/],
    ['version mal formée', '[lot-5a]\nversion: 0.6\n', 2, /Version mal formée « 0\.6 » .* v<nombre>\.<nombre>/],
    ['version V majuscule', '[lot-5a]\nversion: V0.6\n', 2, /Version mal formée « V0\.6 »/],
    ['clé de lot dans une version', '[v0.6]\nafficher: oui\n', 2, /réservée aux lots/],
    ['ligne hors bloc', 'nom: x\n', 1, /hors de tout bloc/],
    ['ligne sans deux-points', '[lot-5a]\nnom V0.6\n', 2, /Ligne incomprise « nom V0\.6 »/],
    ['clé en double', '[lot-5a]\nnom: a\nnom: b\n', 3, /Clé « nom » en double/],
    ['caractère de contrôle', '[lot-5a]\nnom: a\u0007b\n', 2, /Caractère de contrôle/],
  ];
  it.each(cas)('%s', (_nom, texte, ligne, motif) => {
    const r = parseNoms(texte);
    expect(r.erreurs.length, JSON.stringify(r.erreurs)).toBe(1);
    expect(r.erreurs[0].ligne).toBe(ligne);
    expect(r.erreurs[0].message).toMatch(motif);
    expect(formatErreur(r.erreurs[0])).toBe(`${NOMS_FICHIER}, ligne ${ligne} : ${r.erreurs[0].message}`);
  });
  it('une ligne fautive est ignorée, le reste du bloc et du fichier reste valable', () => {
    const r = parseNoms('[lot-5a]\nnom: Bon\nafficher: bof\ndescription: Bonne\n\n[lot-5a]\nnom: doublon\n\n[lot-5b]\nnom: Autre\n');
    expect(lignes(r)).toEqual([3, 6]);
    expect(r.blocs).toEqual([{ id: 'lot-5a', type: 'lot', ligne: 1, nom: 'Bon', description: 'Bonne' }, { id: 'lot-5b', type: 'lot', ligne: 9, nom: 'Autre' }]);
  });
  it('UTF-8 invalide : la ligne fautive est signalée et ignorée, les autres sont lues', () => {
    const octets = Buffer.concat([Buffer.from('[lot-5a]\nnom: caf'), Buffer.from([0xe9]), Buffer.from('\ndescription: Bonne\n'), Buffer.from([0xc0, 0x80, 0x0a, 0xed, 0xa0, 0x80, 0x0a, 0xf4, 0x90, 0x80, 0x80, 0x0a])]);
    const r = parseNoms(octets);
    expect(lignes(r)).toEqual([2, 4, 5, 6]);
    for (const e of r.erreurs) expect(e.message).toMatch(/pas de l'UTF-8 valide/);
    expect(r.blocs).toEqual([{ id: 'lot-5a', type: 'lot', ligne: 1, description: 'Bonne' }]);
    expect(parseNoms('[lot-5a]\nnom: a\uD800b\n').erreurs[0]).toMatchObject({ ligne: 2, message: expect.stringMatching(/UTF-8/) });
  });
});

describe('parseNoms : entrées hostiles (jamais d\'exception)', () => {
  it.each([
    ['null', null], ['nombre', 42], ['objet', { toString: () => { throw new Error('piège'); } }], ['tableau', ['[v0.1]']],
  ])('%s : « fichier illisible », aucun bloc', (_n, entree) => {
    expect(() => parseNoms(entree)).not.toThrow();
    expect(parseNoms(entree)).toEqual({ blocs: [], erreurs: [{ ligne: 0, message: expect.stringMatching(/illisible/) }] });
  });
  it('__proto__, constructor, HTML, très long, octets aléatoires', () => {
    const r = parseNoms('[__proto__]\nnom: x\n[constructor]\n__proto__: y\nconstructor: z\n[lot-5a]\nnom: <img src=x onerror=alert(1)>\n');
    expect(lignes(r)).toEqual([1, 4, 5]);
    expect(bloc(r, 'lot-5a').nom).toBe('<img src=x onerror=alert(1)>');
    expect(Object.prototype.nom).toBeUndefined();
    expect({}.polluted).toBeUndefined();
    const enorme = `[lot-5a]\nnom: ${'a'.repeat(1_000_000)}\n${'x\n'.repeat(20_000)}`;
    const big = parseNoms(enorme);
    expect(big.erreurs[0].message.length).toBeLessThan(200);
    expect(big.erreurs).toHaveLength(20_001);
    let seed = 7;
    const bytes = Uint8Array.from({ length: 50_000 }, () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) & 0xff);
    expect(() => parseNoms(bytes)).not.toThrow();
  });
});

describe('appliquerNoms : le fichier l\'emporte, dates, ref, status, entry et ordre inchangés', () => {
  const v = { schema: 1, latest: 'v0.2', versions: [
    { id: 'v0.1', label: 'V0.1', title: 'Ancien titre', date: '2026-10-01', ref: 'a'.repeat(40), entry: 'jeu.html', status: 'archive', note: '' },
    { id: 'v0.2', label: 'V0.2', title: 'Titre actuel', date: '2026-10-02', ref: 'b'.repeat(40), entry: 'jeu.html', status: 'actuelle', note: '' },
  ] };
  const c = { lots: [
    { name: 'lot-1', titre: 'Ancien', points: ['p1'] },
    { name: 'lot-5a', version: 'v0.3', date: '2026-11-04', titre: 'Épaves', points: ['Premier point', 'Second'] },
    { name: 'lot-5b', version: 'v0.3', titre: 'Graphismes', points: ['Réglage'] },
  ] };
  it('version : label ← nom, title ← description ; lot : titre ← nom, points[0] ← description, version ← version ; entrées non modifiées', () => {
    const noms = parseNoms('[v0.2]\nnom: V0.2 bêta\ndescription: Nouveau titre\n[lot-5a]\nnom: Voiture\ndescription: Elle brûle.\nversion: v0.2\n');
    const before = JSON.stringify({ v, c });
    const r = appliquerNoms({ versions: v, changelog: c }, noms);
    expect(JSON.stringify({ v, c })).toBe(before);
    expect(r.inconnus).toEqual([]);
    expect(r.versions.versions[1]).toEqual({ ...v.versions[1], label: 'V0.2 bêta', title: 'Nouveau titre' });
    expect(r.versions.versions[0]).toEqual(v.versions[0]);
    expect(r.changelog.lots[1]).toEqual({ ...c.lots[1], titre: 'Voiture', points: ['Elle brûle.', 'Second'], version: 'v0.2' });
    expect(r.changelog.lots.map((l) => l.name)).toEqual(['lot-1', 'lot-5a', 'lot-5b']);
  });
  it('afficher: non retire le lot ; afficher: oui le garde', () => {
    const r = appliquerNoms({ versions: v, changelog: c }, parseNoms('[lot-5a]\nafficher: non\n[lot-5b]\nafficher: oui\n'));
    expect(r.changelog.lots.map((l) => l.name)).toEqual(['lot-1', 'lot-5b']);
  });
  it('identifiants inconnus signalés et ignorés ; version cible d\'un lot connue', () => {
    const r = appliquerNoms({ versions: v, changelog: c }, parseNoms('[v0.3]\nnom: V0.3\n[v0.9]\nnom: V0.9\n[lot-9z]\nnom: X\n'));
    expect(r.inconnus).toEqual(['v0.9', 'lot-9z']);
    expect(r).toMatchObject({ versions: v, changelog: c });
  });
  it('fichier vide ou absent, données absentes ou hostiles : aucune exception, copies inchangées', () => {
    expect(appliquerNoms({ versions: v, changelog: c }, parseNoms(''))).toEqual({ versions: v, changelog: c, inconnus: [] });
    expect(appliquerNoms({ versions: v, changelog: c }, null)).toEqual({ versions: v, changelog: c, inconnus: [] });
    expect(appliquerNoms(null, parseNoms('[v0.1]\nnom: x\n'))).toEqual({ versions: null, changelog: null, inconnus: ['v0.1'] });
    const hostile = { versions: { versions: [null, 3, { id: '__proto__' }] }, changelog: { lots: 'non' } };
    expect(() => appliquerNoms(hostile, [{ id: '__proto__', type: 'lot', nom: 'x' }, null, 'x'])).not.toThrow();
    expect(() => appliquerNoms({ versions: { f: () => 1 } }, [])).not.toThrow();
  });
});

// Contrôles permanents (à chaque push, et dans « quick » de pages.yml : une faute de frappe bloque le déploiement de dev, décision du propriétaire) :
// aucune erreur, identifiants connus, aucun bloc pour un lot ancien. Contrôles du contenu initial (lot 5h) : seulement tant que le fichier est celui
// livré au lot 5h (empreinte SHA-256 ci-dessous) ; dès que le propriétaire le modifie, ils sont sautés (ses textes ne sont jamais imposés par un test).
const INITIAL_SHA256 = '1aa831f864273af229dc0bb04cc5bbce9d9bd50ab6cbb28ceabaa75ed411719f';

describe(`fichier commité ${NOMS_FICHIER}`, () => {
  const octets = readFileSync(NOMS_FICHIER);
  const noms = parseNoms(octets);
  const lotsAvecVersion = changelog.lots.filter((l) => typeof l.version === 'string');
  const initial = createHash('sha256').update(octets).digest('hex') === INITIAL_SHA256;

  it('aucune erreur (sinon : numéro de ligne et message)', () => {
    expect(noms.erreurs.map(formatErreur), `Fautes dans ${NOMS_FICHIER} :\n${noms.erreurs.map(formatErreur).join('\n')}`).toEqual([]);
  });
  it.skipIf(!initial)('fichier initial : en-tête : format en 5 lignes, exemple et marche à suivre pour corriger une faute', () => {
    const texte = octets.toString('utf8');
    const entete = texte.slice(0, texte.indexOf('\n[')).split('\n');
    expect(entete.slice(0, 5).every((l) => l.startsWith('# ') && l.length > 20)).toBe(true);
    expect(texte).toContain('# Exemple :');
    expect(texte).toContain('# Pour corriger une faute : modifie la ligne, valide ; la Recette est mise à jour après le déploiement de `dev`.');
  });
  it.skipIf(!initial)('fichier initial : V0.1 à V0.5 : étiquette et description exactement celles affichées avant le lot 5h (V<id>, titre de versions.json borné à 120)', () => {
    // Lot 5f : V0.6 ajoutée à versions.json (titre recopié du bloc [v0.6], borné à 120 ; le bloc est vérifié par le test suivant) ; avant : versions.json = V0.1 à V0.5 exactement.
    for (const ver of versions.versions.filter((x) => x.id !== 'v0.6')) {
      expect(bloc(noms, ver.id), ver.id).toEqual({ id: ver.id, type: 'version', ligne: expect.any(Number), nom: `V${ver.id.slice(1)}`, description: cleanText(ver.title, MAX_TITLE) });
    }
    expect(versions.versions.map((x) => x.id)).toEqual(['v0.1', 'v0.2', 'v0.3', 'v0.4', 'v0.5', 'v0.6']);
  });
  it.skipIf(!initial)('fichier initial : v0.6 en brouillon ; un bloc par lot portant « version », dans l\'ordre du journal, sans identifiant de lot dans les textes', () => {
    expect(bloc(noms, 'v0.6')).toMatchObject({ nom: 'V0.6', description: expect.any(String) });
    const lots = noms.blocs.filter((b) => b.type === 'lot');
    expect(lots.map((b) => b.id)).toEqual(lotsAvecVersion.map((l) => l.name));
    for (const b of lots) {
      expect(b, b.id).toMatchObject({ version: lotsAvecVersion.find((l) => l.name === b.id).version, afficher: true, nom: expect.any(String), description: expect.any(String) });
      expect(`${b.nom} ${b.description}`, b.id).not.toMatch(/lot-?\d|\.json|\.mjs|\.js\b/i);
    }
  });
  it('chaque identifiant est connu ; aucun bloc pour un lot sans « version » dans le journal', () => {
    expect(appliquerNoms({ versions, changelog }, noms).inconnus).toEqual([]);
    const anciens = new Set(changelog.lots.filter((l) => typeof l.version !== 'string').map((l) => l.name));
    expect(noms.blocs.filter((b) => anciens.has(b.id)).map((b) => b.id)).toEqual([]);
  });
});
