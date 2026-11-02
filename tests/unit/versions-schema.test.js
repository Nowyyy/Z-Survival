// Lot 4c-A : schéma de versions.json (scripts/versions/schema.mjs) et cohérence avec data/changelog.json → versions.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import {
  checkChangelogConsistency, compareIds, isSafeRelativePath, isValidBranch, isValidDate, labelOf, STATUSES, validateVersions, versionPath,
} from '../../scripts/versions/schema.mjs';

const real = JSON.parse(readFileSync('versions.json', 'utf8'));
const changelog = JSON.parse(readFileSync('data/changelog.json', 'utf8'));
const clone = () => structuredClone(real);
const errorsOf = (data) => validateVersions(data).errors.join('\n');

describe('versions.json du dépôt', () => {
  it('est valide', () => {
    expect(validateVersions(real)).toEqual({ ok: true, errors: [] });
  });

  it('liste V0.1 à V0.5 dans l\'ordre, V0.5 actuelle et latest', () => {
    expect(real.versions.map((v) => [v.id, v.branch])).toEqual([['v0.1', 'lot-1'], ['v0.2', 'lot-1d'], ['v0.3', 'lot-2c'], ['v0.4', 'lot-3e'], ['v0.5', 'lot-4b']]);
    expect(real.latest).toBe('v0.5');
    expect(real.versions.filter((v) => v.status === 'actuelle').map((v) => v.id)).toEqual(['v0.5']);
  });

  it('est cohérent avec data/changelog.json (versions), dans les deux sens', () => {
    expect(checkChangelogConsistency(real, changelog)).toEqual({ ok: true, errors: [] });
    expect(real.versions.map((v) => v.label)).toEqual(changelog.versions.map((v) => v.version));
  });

  it('gèle des hash qui existent dans le dépôt et désignent la bonne branche (V0.1 à V0.4 : tête de la branche ; V0.5 : fusion de lot-4b dans main)', () => {
    let history = true;
    try {
      execFileSync('git', ['cat-file', '-e', `${real.versions[0].ref}^{commit}`], { stdio: 'ignore' });
    } catch {
      history = false; // clone superficiel (CI) : rien à vérifier ici
    }
    if (!history) return;
    for (const v of real.versions) {
      execFileSync('git', ['cat-file', '-e', `${v.ref}^{commit}`]);
      const parents = execFileSync('git', ['log', '-1', '--format=%P', v.ref], { encoding: 'utf8' }).trim().split(' ');
      if (v.id === 'v0.5') expect(parents).toHaveLength(2);
    }
  });

  it('dev : branche dev servie à next/', () => {
    expect(real.dev).toEqual({ branch: 'dev', path: 'next/' });
  });
});

describe('validateVersions : champs', () => {
  it.each(['id', 'label', 'title', 'date', 'branch', 'ref', 'entry', 'status', 'note'])('champ manquant : %s', (key) => {
    const data = clone();
    delete data.versions[1][key];
    expect(errorsOf(data)).toContain(`champ « ${key} » manquant`);
  });

  it('champ inconnu refusé (version et racine)', () => {
    const data = clone();
    data.versions[0].extra = 1;
    data.autre = true;
    expect(errorsOf(data)).toMatch(/champ inconnu « extra »/);
    expect(errorsOf(data)).toMatch(/champ inconnu « autre »/);
  });

  it('schema autre que 1 refusé', () => {
    expect(errorsOf({ ...clone(), schema: 2 })).toContain('schema');
  });

  it('versions vide ou absente refusée', () => {
    expect(errorsOf({ ...clone(), versions: [] })).toContain('au moins une version');
    expect(errorsOf({ ...clone(), versions: 'v0.1' })).toContain('tableau attendu');
  });

  it('libellé incohérent avec l\'identifiant refusé', () => {
    const data = clone();
    data.versions[0].label = 'V0.9';
    expect(errorsOf(data)).toContain('label invalide');
  });

  it('date impossible refusée', () => {
    for (const date of ['2026-13-01', '2026-02-30', '26-10-26', '2026-10-26T00:00:00Z', 20261026]) {
      const data = clone();
      data.versions[0].date = date;
      expect(errorsOf(data), String(date)).toContain('date invalide');
    }
  });

  it('identifiant au mauvais format refusé', () => {
    for (const id of ['V0.1', '0.1', 'v0.1.2', 'v01.1', 'v0.x', '', null]) {
      const data = clone();
      data.versions[0].id = id;
      expect(errorsOf(data), String(id)).toContain('id invalide');
    }
  });
});

describe('validateVersions : cohérence', () => {
  it('doublon d\'identifiant refusé', () => {
    const data = clone();
    data.versions[1].id = 'v0.1';
    data.versions[1].label = 'V0.1';
    expect(errorsOf(data)).toContain('id en double « v0.1 »');
  });

  it('doublon de hash refusé', () => {
    const data = clone();
    data.versions[2].ref = data.versions[1].ref;
    expect(errorsOf(data)).toContain('ref en double');
  });

  it('latest inexistant refusé', () => {
    expect(errorsOf({ ...clone(), latest: 'v0.9' })).toContain('latest : identifiant de version inexistant');
  });

  it('latest qui n\'est pas la version actuelle refusé', () => {
    expect(errorsOf({ ...clone(), latest: 'v0.4' })).toContain('latest : doit désigner la version « actuelle »');
  });

  it('zéro ou deux versions actuelles refusées', () => {
    const none = clone();
    none.versions[4].status = 'archive';
    expect(errorsOf(none)).toContain('exactement une version « actuelle » (trouvé 0)');
    const two = clone();
    two.versions[3].status = 'actuelle';
    expect(errorsOf(two)).toContain('(trouvé 2)');
  });

  it('statut inconnu refusé', () => {
    const data = clone();
    data.versions[0].status = 'publiée';
    expect(errorsOf(data)).toContain('status inconnu');
    expect(STATUSES).toEqual(['actuelle', 'archive', 'indisponible']);
  });

  it('version indisponible sans raison refusée, avec raison acceptée', () => {
    const data = clone();
    data.versions[0].status = 'indisponible';
    expect(errorsOf(data)).toContain('donne sa raison');
    data.versions[0].note = 'Le build échoue : paquet introuvable.';
    expect(validateVersions(data).ok).toBe(true);
  });

  it('ordre non chronologique refusé ; v0.10 après v0.9', () => {
    const data = clone();
    data.versions.reverse();
    expect(errorsOf(data)).toContain('ordre chronologique');
    expect(['v0.10', 'v0.9', 'v1.0', 'v0.2'].sort(compareIds)).toEqual(['v0.2', 'v0.9', 'v0.10', 'v1.0']);
    expect(() => compareIds('x', 'v0.1')).toThrow(RangeError);
  });

  it('hash invalide refusé (court, majuscules, non hexadécimal, branche à la place)', () => {
    for (const ref of ['1ffbf76', '1FFBF76E8521A8CFC384B603E90D422842D5D8E3', 'z'.repeat(40), 'lot-1', '', 42]) {
      const data = clone();
      data.versions[0].ref = ref;
      expect(errorsOf(data), String(ref)).toContain('ref invalide');
    }
  });

  it('dev invalide refusé', () => {
    expect(errorsOf({ ...clone(), dev: { branch: 'dev', path: '/next/' } })).toContain('dev.path invalide');
    expect(errorsOf({ ...clone(), dev: { branch: 'dev', path: 'next' } })).toContain('dev.path invalide');
    expect(errorsOf({ ...clone(), dev: { branch: '-x', path: 'next/' } })).toContain('dev.branch invalide');
    expect(errorsOf({ ...clone(), dev: null })).toContain('dev : objet attendu');
  });
});

describe('validateVersions : entrées hostiles', () => {
  it('ne lève jamais d\'exception', () => {
    for (const bad of [null, undefined, 0, 'x', [], [1], { versions: [null, 1, 'a', []] }, { versions: [{ id: { toString: null } }] }, Object.create(null)]) {
      expect(() => validateVersions(bad)).not.toThrow();
      expect(validateVersions(bad).ok).toBe(false);
    }
  });

  it('entrée de page hostile refusée (absolue, remontée, schéma, protocole relatif, barre inverse, encodage)', () => {
    for (const entry of ['/jeu.html', '../jeu.html', 'a/../../b', 'javascript:alert(1)', '//evil.example/x', 'https://evil.example/', 'a\\b', '%2e%2e/x', 'jeu.html?x=<script>', '', ' jeu.html', 'dossier/']) {
      const data = clone();
      data.versions[0].entry = entry;
      expect(errorsOf(data), entry).toContain('entry invalide');
    }
  });

  it('textes avec caractères de contrôle ou trop longs refusés', () => {
    const data = clone();
    data.versions[0].title = 'a\u0000b';
    data.versions[1].note = 'x'.repeat(301);
    expect(errorsOf(data)).toContain('title invalide');
    expect(errorsOf(data)).toContain('note invalide');
  });

  it('nom de branche hostile refusé', () => {
    for (const branch of ['-rf', '../main', 'a..b', 'main.lock', 'a b', 'x/', '', 'refs//heads']) expect(isValidBranch(branch), branch).toBe(false);
    for (const branch of ['main', 'dev', 'lot-1d', 'archive', 'release/v1']) expect(isValidBranch(branch), branch).toBe(true);
  });

  it('__proto__ et clés inattendues ne polluent rien', () => {
    const data = JSON.parse(JSON.stringify(real).replace('"schema":1', '"__proto__":{"polluted":true},"schema":1'));
    validateVersions(data);
    expect({}.polluted).toBeUndefined();
  });
});

describe('aides', () => {
  it('labelOf, isValidDate, isSafeRelativePath', () => {
    expect(labelOf('v0.4')).toBe('V0.4');
    expect(labelOf('x')).toBe('');
    expect(isValidDate('2026-11-02')).toBe(true);
    expect(isSafeRelativePath('next/', { allowDir: true })).toBe(true);
    expect(isSafeRelativePath('next/')).toBe(false);
    expect(isSafeRelativePath('pages/menu.html')).toBe(true);
  });

  it('versionPath : racine pour l\'actuelle, v0.N/ pour une archive, null si indisponible', () => {
    expect(versionPath(real.versions[4])).toBe('');
    expect(versionPath(real.versions[0])).toBe('v0.1/');
    expect(versionPath({ ...real.versions[0], status: 'indisponible' })).toBeNull();
    expect(versionPath(null)).toBeNull();
    expect(versionPath({ id: '../x', status: 'archive' })).toBeNull();
  });

  it('cohérence avec le journal : écarts détectés dans les deux sens', () => {
    const extra = { ...changelog, versions: [...changelog.versions, { version: 'V0.6', lot: 'lot-5' }] };
    expect(checkChangelogConsistency(real, extra).errors).toContain('V0.6 : absente de versions.json');
    const fewer = { ...changelog, versions: changelog.versions.slice(1) };
    expect(checkChangelogConsistency(real, fewer).errors).toContain('v0.1 : absente de changelog.versions');
    const moved = { ...changelog, versions: changelog.versions.map((v) => (v.version === 'V0.2' ? { ...v, lot: 'lot-1c' } : v)) };
    expect(checkChangelogConsistency(real, moved).errors.join()).toContain('v0.2 : branche lot-1d ≠ lot lot-1c');
    const otherCurrent = { ...changelog, versions: changelog.versions.map((v) => ({ ...v, enCours: v.version === 'V0.4' })) };
    expect(checkChangelogConsistency(real, otherCurrent).ok).toBe(false);
    expect(checkChangelogConsistency(null, null)).toEqual({ ok: true, errors: [] });
  });
});
