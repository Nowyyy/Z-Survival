// Lot 9f (Docs/ref/cache.md) : paramètres de cache v, r, rv (jamais des paramètres de partie ni de test), vérification de version, liens uniques de
// l'accueil, script en ligne de jeu.html (retrait avant tout module, même règle que sansParamsCache).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { adresseRechargement, PARAMS_CACHE, sansParamsCache, versionEmbarquee, versionPerimee } from '../../js/menu/adresse.js';
import { adresseUnique } from '../../js/accueil/home.js';
import { choixDemarrage, filtrerAdresse } from '../../js/core/graphics.js';
import { adresseRetour } from '../../js/core/menu-etat.js';

const JEU = readFileSync('jeu.html', 'utf8');
const SCRIPT = /<!-- Lot 9f : paramètres de cache[\s\S]*?<script>([\s\S]*?)<\/script>/.exec(JEU)[1];

// Exécute le script en ligne de jeu.html sur une adresse ; renvoie { adresse, rv } (adresse après replaceState, attribut data-zs-rv).
function scriptEnLigne(search, hash = '') {
  const attributs = {};
  let adresse = null;
  runInNewContext(SCRIPT, {
    location: { search, pathname: '/Z-Survival/dev/jeu.html', hash },
    history: { state: null, replaceState: (_s, _t, url) => { adresse = url; } },
    document: { documentElement: { setAttribute: (k, v) => { attributs[k] = v; } } },
    decodeURIComponent,
  });
  return { adresse, rv: attributs['data-zs-rv'] === '1' };
}

const CAS = ['', '?test=1', '?v=abc1234', '?r=123', '?rv=1&r=9', '?test=1&v=abc&wave=3', '?wave=5&r=1&labels=1&zoom=1', '?a=%20b&v=1&c', '?test=1&menu=1&seed=1&store=local&rv=1',
  '?v', '?vv=1&rr=2', '?%72=1&x=2', '?test=1&'];

describe('paramètres de cache (v, r, rv)', () => {
  it('liste', () => expect(PARAMS_CACHE).toEqual(['v', 'r', 'rv']));

  it('sansParamsCache : retire v, r, rv, garde les autres octet pour octet et dans leur ordre', () => {
    expect(sansParamsCache('?test=1&v=abc&wave=3')).toBe('?test=1&wave=3');
    expect(sansParamsCache('?v=abc1234')).toBe('');
    expect(sansParamsCache('?a=%20b&v=1&c')).toBe('?a=%20b&c');
    expect(sansParamsCache('?vv=1&rr=2')).toBe('?vv=1&rr=2');
    expect(sansParamsCache('?%72=1&x=2')).toBe('?x=2'); // « r » encodé
    expect(sansParamsCache('')).toBe('');
    expect(sansParamsCache(null)).toBe('');
  });

  it('jamais un paramètre de partie ni de test : avec ou sans v, r, rv, même démarrage et même adresse filtrée', () => {
    for (const canal of ['source', 'dev', 'release']) {
      for (const base of ['', '?test=1', '?test=1&menu=1', '?wave=5', '?gfx=faible']) {
        const avec = `${base}${base ? '&' : '?'}v=abc1234&r=1700000000000&rv=1`;
        expect(choixDemarrage(canal, sansParamsCache(avec)), `${canal} ${avec}`).toBe(choixDemarrage(canal, base));
        expect(filtrerAdresse(sansParamsCache(avec), canal)).toBe(filtrerAdresse(base, canal));
      }
    }
    expect(choixDemarrage('dev', '?v=abc1234&r=1&rv=1')).toBe('menu'); // même non retirés, ils ne lancent pas de partie
  });

  it('jamais conservés : adresse du retour au menu sans eux (adresse déjà nettoyée par jeu.html)', () => {
    expect(adresseRetour(sansParamsCache('?test=1&wave=3&r=5&v=x'))).toBe('?test=1&menu=1');
  });
});

describe('script en ligne de jeu.html (avant tout module)', () => {
  it('placé avant la carte d\'imports et tout module ; balise de version vide en source', () => {
    const i = JEU.indexOf('<!-- Lot 9f : paramètres de cache');
    expect(i).toBeGreaterThan(0);
    expect(i).toBeLessThan(JEU.indexOf('<script type="importmap">'));
    expect(i).toBeLessThan(JEU.indexOf('<script type="module"'));
    expect(JEU).toContain('<meta name="zs-version" content="">');
    expect(SCRIPT).not.toMatch(/localStorage|sessionStorage|indexedDB|cookie/);
  });

  it('même résultat que sansParamsCache ; rv noté ; aucune réécriture sans paramètre de cache', () => {
    for (const s of CAS) {
      const r = scriptEnLigne(s, '#retour');
      const attendu = PARAMS_CACHE.some((p) => s.replace(/^\?/, '').split('&').some((m) => decodeURIComponent(m.split('=')[0]) === p));
      if (!attendu) {
        expect(r.adresse, s).toBe(null);
        continue;
      }
      expect(r.adresse, s).toBe(`/Z-Survival/dev/jeu.html${sansParamsCache(s)}#retour`);
      expect(r.rv, s).toBe(/(^|[?&])rv(=|&|$)/.test(s));
    }
  });
});

describe('vérification de version', () => {
  const doc = (content) => ({ querySelector: (sel) => (sel === 'meta[name="zs-version"]' && content !== null ? { getAttribute: () => content } : null) });

  it('version embarquée : 7 caractères hexadécimaux, sinon null (source : vide)', () => {
    expect(versionEmbarquee(doc('abc1234'))).toBe('abc1234');
    expect(versionEmbarquee(doc(''))).toBe(null);
    expect(versionEmbarquee(doc(null))).toBe(null);
    expect(versionEmbarquee(doc('ABC1234'))).toBe(null);
    expect(versionEmbarquee(null)).toBe(null);
  });

  it('périmée seulement si les deux versions sont connues et différentes', () => {
    expect(versionPerimee('abc1234', { sha: 'abc1234' })).toBe(false);
    expect(versionPerimee('abc1234', { sha: 'abc1234def' })).toBe(false);
    expect(versionPerimee('abc1234', { sha: 'fff0000' })).toBe(true);
    expect(versionPerimee('abc1234', { sha: '' })).toBe(false);
    expect(versionPerimee('abc1234', null)).toBe(false);
    expect(versionPerimee(null, { sha: 'fff0000' })).toBe(false);
    expect(versionPerimee('abc1234', { channel: 'source' })).toBe(false);
  });

  it('adresse du rechargement : mêmes paramètres, rv=1 et r unique, fragment', () => {
    const loc = { pathname: '/Z-Survival/dev/jeu.html', search: '?test=1&menu=1&r=5&v=x', hash: '' };
    expect(adresseRechargement(loc, 1700000000123)).toBe('/Z-Survival/dev/jeu.html?test=1&menu=1&rv=1&r=1700000000123');
    expect(adresseRechargement({ ...loc, search: '' }, 42, '#retour')).toBe('/Z-Survival/dev/jeu.html?rv=1&r=42#retour');
    expect(adresseRechargement({ ...loc, search: '', hash: '#plein-ecran' }, 42)).toBe('/Z-Survival/dev/jeu.html?rv=1&r=42#plein-ecran');
  });
});

describe('liens uniques de l\'accueil', () => {
  it('r=<maintenant> ajouté ou remplacé ; autres paramètres et fragment gardés', () => {
    expect(adresseUnique('jeu.html', 1700000000000)).toBe('jeu.html?r=1700000000000');
    expect(adresseUnique('../dev/jeu.html', 5)).toBe('../dev/jeu.html?r=5');
    expect(adresseUnique('jeu.html?r=4', 5)).toBe('jeu.html?r=5');
    expect(adresseUnique('jeu.html?a=1&r=4#x', 5)).toBe('jeu.html?a=1&r=5#x');
    expect(adresseUnique(undefined, Number.NaN)).toBe('?r=0');
  });

  it('accueil : posé au clic et au clic du milieu sur « Jouer » et « Dernier build de développement »', () => {
    const main = readFileSync('js/accueil/main.js', 'utf8');
    expect(main).toMatch(/document\.getElementById\('play'\), document\.getElementById\('dev-link'\)/);
    expect(main).toContain("addEventListener('click', unique)");
    expect(main).toContain("addEventListener('auxclick', unique)");
  });
});
