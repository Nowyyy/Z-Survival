// Outils de test des textures : jetons de css/tokens.css, spécifications de data/game/textures.json.
import { readFileSync } from 'node:fs';
import { parseColor } from '../../../js/core/color.js';
import { buildSpec } from '../../../js/core/texgen.js';

export const tokenCss = readFileSync('css/tokens.css', 'utf8');
export const tokens = Object.fromEntries([...tokenCss.matchAll(/(--[a-z0-9-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
export const lookup = (token) => parseColor(tokens[token]);
export const texturesJson = JSON.parse(readFileSync('data/game/textures.json', 'utf8'));
export const specs = texturesJson.textures.map((entry) => buildSpec(entry, lookup));
