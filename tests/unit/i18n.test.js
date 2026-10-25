import { describe, it, expect } from 'vitest';
import { DEFAULT_LANG, SUPPORTED_LANGS, otherLanguage, pickLanguage, translate } from '../../js/i18n.js';

describe('pickLanguage', () => {
  it('prend le français sans aucune information', () => {
    expect(pickLanguage()).toBe('fr');
    expect(pickLanguage({})).toBe('fr');
  });

  it('préfère le choix mémorisé aux langues du navigateur', () => {
    expect(pickLanguage({ stored: 'en', browserLanguages: ['fr-FR'] })).toBe('en');
  });

  it('ignore un choix mémorisé invalide', () => {
    expect(pickLanguage({ stored: 'de', browserLanguages: ['en-US'] })).toBe('en');
    expect(pickLanguage({ stored: 42, browserLanguages: [] })).toBe('fr');
  });

  it('lit la première langue prise en charge du navigateur', () => {
    expect(pickLanguage({ browserLanguages: ['de-DE', 'en-GB', 'fr'] })).toBe('en');
    expect(pickLanguage({ browserLanguages: ['EN_us'] })).toBe('en');
  });

  it('se replie sur le français si aucune langue n\'est prise en charge', () => {
    expect(pickLanguage({ browserLanguages: ['de', 'ja'] })).toBe('fr');
  });

  it('accepte une chaîne seule et ignore les valeurs absurdes', () => {
    expect(pickLanguage({ browserLanguages: 'en-US' })).toBe('en');
    expect(pickLanguage({ browserLanguages: [null, undefined, 3, ''] })).toBe('fr');
  });
});

describe('otherLanguage', () => {
  it('bascule entre fr et en', () => {
    expect(otherLanguage('fr')).toBe('en');
    expect(otherLanguage('en')).toBe('fr');
  });
});

describe('translate', () => {
  it('lit une clé existante', () => {
    expect(translate({ a: 'x' }, 'a')).toBe('x');
  });

  it('se replie sur le dictionnaire de secours', () => {
    expect(translate({}, 'a', { a: 'secours' })).toBe('secours');
  });

  it('renvoie la clé si elle est absente partout, sans exception', () => {
    expect(translate({}, 'absente', {})).toBe('absente');
    expect(translate(undefined, 'k')).toBe('k');
    expect(translate(null, 'k', null)).toBe('k');
  });

  it('conserve une chaîne vide valide', () => {
    expect(translate({ a: '' }, 'a', { a: 'x' })).toBe('');
  });
});

describe('constantes', () => {
  it('le français est la langue par défaut et fait partie des langues prises en charge', () => {
    expect(DEFAULT_LANG).toBe('fr');
    expect(SUPPORTED_LANGS).toEqual(['fr', 'en']);
  });
});
