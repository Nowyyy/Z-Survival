// Lot 8g (retours du propriétaire : « retire le rectangle opaque à l'extérieur », puis « laisse le fond à l'intérieur du logo ») : copie du logo de
// Noven Studio sans le fond noir autour de l'ovale. Original fourni par le propriétaire : Docs/studio/noven-studio-logo.png (PNG RGBA 480 × 290, fond
// noir opaque ; jamais retouché, non publié) ; copie publiée : assets/studio/noven-studio-logo-transparent.png. Transformation : le noir (composante
// la plus forte sous SEUIL_NOIR) relié aux bords de l'image (remplissage depuis les bords, 4 voisins) devient transparent ; l'intérieur de l'ovale,
// fermé par le contour bleu, garde son fond noir ; les pixels du liseré extérieur (voisins de la zone retirée) sont démélangés du noir (alpha =
// composante la plus forte / celle du bleu du contour, couleur divisée par alpha) : bord net, sans halo sombre. Aucun module : décodage et encodage
// PNG (zlib de Node), sortie reproductible ; métadonnées (XMP) non recopiées.
//
// Usage : node scripts/studio/noven-transparent.mjs (vérifie : code 1 si la copie manque ou diffère) · node scripts/studio/noven-transparent.mjs --ecrire
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { deflateSync, inflateSync } from 'node:zlib';

const ROOT = resolve(import.meta.dirname, '..', '..');
export const ORIGINAL = 'Docs/studio/noven-studio-logo.png';
export const SORTIE = 'assets/studio/noven-studio-logo-transparent.png';
export const SEUIL_NOIR = 40; // composante la plus forte sous 40/255 : noir du fond (bruit de l'image reçue compris)
const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

// PNG RGBA 8 bits non entrelacé → { largeur, hauteur, pixels (Uint8Array RGBA) }.
export function decoderPng(buf) {
  if (!buf.subarray(0, 8).equals(SIGNATURE)) throw new Error('signature PNG absente');
  let i = 8;
  let ihdr = null;
  const idat = [];
  while (i < buf.length) {
    const n = buf.readUInt32BE(i);
    const type = buf.toString('latin1', i + 4, i + 8);
    const data = buf.subarray(i + 8, i + 8 + n);
    if (type === 'IHDR') ihdr = { largeur: data.readUInt32BE(0), hauteur: data.readUInt32BE(4), bits: data[8], couleur: data[9], entrelace: data[12] };
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    i += 12 + n;
  }
  if (!ihdr || ihdr.bits !== 8 || ihdr.couleur !== 6 || ihdr.entrelace !== 0) throw new Error('PNG RGBA 8 bits non entrelacé attendu');
  const { largeur, hauteur } = ihdr;
  const brut = inflateSync(Buffer.concat(idat));
  const ligne = largeur * 4;
  const px = new Uint8Array(ligne * hauteur);
  for (let y = 0; y < hauteur; y += 1) {
    const filtre = brut[y * (ligne + 1)];
    const src = y * (ligne + 1) + 1;
    const dst = y * ligne;
    for (let x = 0; x < ligne; x += 1) {
      const a = x >= 4 ? px[dst + x - 4] : 0;
      const b = y > 0 ? px[dst - ligne + x] : 0;
      const c = x >= 4 && y > 0 ? px[dst - ligne + x - 4] : 0;
      let p = brut[src + x];
      if (filtre === 1) p += a;
      else if (filtre === 2) p += b;
      else if (filtre === 3) p += (a + b) >> 1;
      else if (filtre === 4) {
        const q = a + b - c;
        const pa = Math.abs(q - a);
        const pb = Math.abs(q - b);
        const pc = Math.abs(q - c);
        p += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      } else if (filtre !== 0) throw new Error(`filtre PNG inconnu : ${filtre}`);
      px[dst + x] = p & 0xff;
    }
  }
  return { largeur, hauteur, pixels: px };
}

const TABLE_CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = TABLE_CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function bloc(type, data) {
  const t = Buffer.from(type, 'latin1');
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  t.copy(out, 4);
  data.copy(out, 8);
  out.writeUInt32BE(crc(Buffer.concat([t, data])), 8 + data.length);
  return out;
}
export function encoderPng({ largeur, hauteur, pixels }) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(largeur, 0);
  ihdr.writeUInt32BE(hauteur, 4);
  ihdr.set([8, 6, 0, 0, 0], 8);
  const ligne = largeur * 4;
  const brut = Buffer.alloc((ligne + 1) * hauteur);
  for (let y = 0; y < hauteur; y += 1) Buffer.from(pixels.buffer, pixels.byteOffset + y * ligne, ligne).copy(brut, y * (ligne + 1) + 1);
  return Buffer.concat([SIGNATURE, bloc('IHDR', ihdr), bloc('IDAT', deflateSync(brut, { level: 9 })), bloc('IEND', Buffer.alloc(0))]);
}

// Composante la plus forte d'un pixel (après son alpha d'origine), de 0 à 255.
const fort = (p, i) => Math.max(p[i], p[i + 1], p[i + 2]) * (p[i + 3] / 255);

// Composante la plus forte du bleu du contour : médiane des pixels nettement bleus et vifs (référence du démélange du liseré).
export function forceContour(pixels) {
  const v = [];
  for (let i = 0; i < pixels.length; i += 4) if (pixels[i + 2] > pixels[i] + 60 && pixels[i + 2] > 120) v.push(fort(pixels, i));
  v.sort((x, y) => x - y);
  return v.length ? v[v.length >> 1] : 255;
}

// Fond extérieur → transparent (copie des pixels RGBA) : remplissage depuis les bords sur le noir ; liseré démélangé ; le reste inchangé.
export function fondExterieurTransparent({ largeur, hauteur, pixels }) {
  const n = largeur * hauteur;
  const dehors = new Uint8Array(n);
  const pile = [];
  const essayer = (x, y) => {
    const k = y * largeur + x;
    if (dehors[k] || fort(pixels, k * 4) >= SEUIL_NOIR) return;
    dehors[k] = 1;
    pile.push(k);
  };
  for (let x = 0; x < largeur; x += 1) {
    essayer(x, 0);
    essayer(x, hauteur - 1);
  }
  for (let y = 0; y < hauteur; y += 1) {
    essayer(0, y);
    essayer(largeur - 1, y);
  }
  while (pile.length) {
    const k = pile.pop();
    const x = k % largeur;
    const y = (k - x) / largeur;
    if (x > 0) essayer(x - 1, y);
    if (x < largeur - 1) essayer(x + 1, y);
    if (y > 0) essayer(x, y - 1);
    if (y < hauteur - 1) essayer(x, y + 1);
  }
  const M = forceContour(pixels);
  const out = Uint8Array.from(pixels);
  for (let k = 0; k < n; k += 1) {
    const i = k * 4;
    if (dehors[k]) {
      out.fill(0, i, i + 4);
      continue;
    }
    const x = k % largeur;
    const y = (k - x) / largeur;
    let bord = false;
    for (let dy = -1; dy <= 1 && !bord; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        const xx = x + dx;
        const yy = y + dy;
        if (xx >= 0 && yy >= 0 && xx < largeur && yy < hauteur && dehors[yy * largeur + xx]) {
          bord = true;
          break;
        }
      }
    }
    if (!bord) continue;
    const m = fort(pixels, i);
    const a = Math.min(1, m / M);
    if (a >= 1) continue;
    const a0 = pixels[i + 3] / 255;
    for (let c = 0; c < 3; c += 1) out[i + c] = Math.min(255, Math.round((pixels[i + c] * a0) / a));
    out[i + 3] = Math.round(a * 255);
  }
  return out;
}

export function copieTransparente(png) {
  const img = decoderPng(png);
  return encoderPng({ ...img, pixels: fondExterieurTransparent(img) });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const attendu = copieTransparente(readFileSync(resolve(ROOT, ORIGINAL)));
  if (process.argv.includes('--ecrire')) {
    writeFileSync(resolve(ROOT, SORTIE), attendu);
    console.log(`${SORTIE} écrit (${attendu.length} octets)`);
  } else {
    let actuel = null;
    try {
      actuel = readFileSync(resolve(ROOT, SORTIE));
    } catch {
      // absente
    }
    if (!actuel || !actuel.equals(attendu)) {
      console.error(`${SORTIE} absente ou périmée : node scripts/studio/noven-transparent.mjs --ecrire`);
      process.exit(1);
    }
    console.log(`${SORTIE} à jour`);
  }
}
