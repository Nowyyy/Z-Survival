// Lot 8f : textures de l'ouverture en 3D, dessinées sur canevas au chargement (aucune image) : béton, bois, métal peint, porte roulante, bande
// jaune et noire, tapis, « ? », rayon, lueur, étoile, sang, cartes des objets et marques des zombies. Couleurs : jetons --ouv-* de css/ouvertures.css
// (couleur(nom) → « #rrggbb », lue par un témoin) ; bruit déterministe (js/core/rng.js, jamais le hasard du navigateur). Chaque texture est créée une fois
// par ouverture et libérée avec elle (liberer()).
import * as THREE from 'three';
import { createRng, nextFloat } from '../../core/rng.js';

const toile = (w, h) => {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
};

// Générateur déterministe : f() dans [0, 1).
// Tache de sang du légendaire : rayon de la partie pleine (part de la demi-taille de l'image) ; bord de l'écoulement (part de la hauteur du
// masque, depuis le haut). scene.js en déduit la taille de la tache et l'avancée de l'écoulement.
export const TACHE_R = 0.8;
export const VIDANGE_BORD = 0.5;

function hasard(graine) {
  let r = createRng(graine);
  return () => {
    const n = nextFloat(r);
    r = n.rng;
    return n.value;
  };
}

export function creerTextures({ couleur, anisotropie = 1 }) {
  const toutes = new Set();
  const garder = (t, { srgb = true, repeter = false } = {}) => {
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    if (repeter) t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = anisotropie;
    t.needsUpdate = true;
    toutes.add(t);
    return t;
  };
  const tex = (canvas, opts) => garder(new THREE.CanvasTexture(canvas), opts);

  // Taches et grain sur une surface (base, plus clair, plus sombre).
  function grain(ctx, w, h, f, clair, sombre, n, taille) {
    for (let i = 0; i < n; i += 1) {
      ctx.globalAlpha = 0.05 + f() * 0.12;
      ctx.fillStyle = f() < 0.5 ? clair : sombre;
      const s = 1 + f() * taille;
      ctx.fillRect(f() * w, f() * h, s, s);
    }
    ctx.globalAlpha = 1;
  }

  function beton(graine = 3, joints = true) {
    const [c, ctx] = toile(256, 256);
    const f = hasard(graine);
    ctx.fillStyle = couleur('--ouv-beton');
    ctx.fillRect(0, 0, 256, 256);
    grain(ctx, 256, 256, f, couleur('--ouv-beton-clair'), couleur('--ouv-beton-sombre'), 2600, 3);
    // Taches d'humidité et d'huile.
    for (let i = 0; i < 7; i += 1) {
      ctx.globalAlpha = 0.12 + f() * 0.12;
      ctx.fillStyle = couleur('--ouv-beton-sombre');
      ctx.beginPath();
      ctx.ellipse(f() * 256, f() * 256, 10 + f() * 30, 6 + f() * 18, f() * 3, 0, Math.PI * 2);
      ctx.fill();
    }
    // Fissures.
    ctx.globalAlpha = 0.55;
    ctx.strokeStyle = couleur('--ouv-beton-sombre');
    ctx.lineWidth = 1;
    for (let i = 0; i < 3; i += 1) {
      let x = f() * 256;
      let y = f() * 256;
      ctx.beginPath();
      ctx.moveTo(x, y);
      for (let k = 0; k < 6; k += 1) {
        x += (f() - 0.5) * 40;
        y += (f() - 0.3) * 30;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    if (joints) {
      ctx.globalAlpha = 0.8;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, 1);
      ctx.lineTo(256, 1);
      ctx.moveTo(1, 0);
      ctx.lineTo(1, 256);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    return tex(c, { repeter: true });
  }

  // Planches de bois (veines, joints sombres, clous).
  function bois(base = '--ouv-bois', graine = 5, planches = 4) {
    const [c, ctx] = toile(256, 256);
    const f = hasard(graine);
    const h = 256 / planches;
    for (let p = 0; p < planches; p += 1) {
      ctx.fillStyle = couleur(p % 2 ? base : '--ouv-bois-clair');
      ctx.globalAlpha = 1;
      ctx.fillRect(0, p * h, 256, h);
      ctx.fillStyle = couleur(base);
      ctx.globalAlpha = 0.45;
      ctx.fillRect(0, p * h, 256, h);
      ctx.strokeStyle = couleur('--ouv-bois-sombre');
      for (let v = 0; v < 9; v += 1) {
        ctx.globalAlpha = 0.18 + f() * 0.2;
        ctx.lineWidth = 0.6 + f() * 1.4;
        const y0 = p * h + f() * h;
        ctx.beginPath();
        ctx.moveTo(0, y0);
        ctx.bezierCurveTo(80, y0 + (f() - 0.5) * 8, 170, y0 + (f() - 0.5) * 8, 256, y0 + (f() - 0.5) * 6);
        ctx.stroke();
      }
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = couleur('--ouv-bois-sombre');
      ctx.fillRect(0, p * h, 256, 3);
    }
    ctx.globalAlpha = 1;
    grain(ctx, 256, 256, f, couleur('--ouv-bois-clair'), couleur('--ouv-bois-sombre'), 900, 2);
    return tex(c, { repeter: true });
  }

  // Métal peint (rayures, usure claire sur les bords, rivets).
  function metal(base, graine = 7) {
    const [c, ctx] = toile(128, 128);
    const f = hasard(graine);
    ctx.fillStyle = couleur(base);
    ctx.fillRect(0, 0, 128, 128);
    grain(ctx, 128, 128, f, couleur('--ouv-arme-clair'), couleur('--ouv-polymere'), 700, 2);
    ctx.strokeStyle = couleur('--ouv-arme-clair');
    for (let i = 0; i < 14; i += 1) {
      ctx.globalAlpha = 0.12 + f() * 0.18;
      ctx.lineWidth = 0.6;
      const x = f() * 128;
      const y = f() * 128;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + (f() - 0.5) * 30, y + (f() - 0.5) * 8);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    return tex(c, { repeter: true });
  }

  // Retour du propriétaire (« pourrait-on ajouter des textures sur l'arme ? La lunette… ») : chaque face d'une pièce du fusil reçoit l'image
  // entière (coordonnées des boîtes), donc le bord de l'image = les arêtes de la pièce : arêtes usées plus claires, rayures, grain.
  function bordUse(ctx, n, f, clair, largeur, alpha) {
    ctx.strokeStyle = clair;
    for (let i = 0; i < 90; i += 1) {
      const cote = Math.floor(f() * 4);
      const t = f() * n;
      const l = 6 + f() * 22;
      ctx.globalAlpha = alpha * (0.5 + f() * 0.5);
      ctx.lineWidth = 1 + f() * largeur;
      const e = f() * largeur;
      ctx.beginPath();
      if (cote === 0) { ctx.moveTo(t, e); ctx.lineTo(t + l, e); }
      else if (cote === 1) { ctx.moveTo(t, n - e); ctx.lineTo(t + l, n - e); }
      else if (cote === 2) { ctx.moveTo(e, t); ctx.lineTo(e, t + l); }
      else { ctx.moveTo(n - e, t); ctx.lineTo(n - e, t + l); }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
  // Métal bruni du fusil : base sombre, brossé, rayures, arêtes usées.
  function armeUsee() {
    const [c, ctx] = toile(128, 128);
    const f = hasard(71);
    ctx.fillStyle = couleur('--ouv-arme');
    ctx.fillRect(0, 0, 128, 128);
    const g = ctx.createLinearGradient(0, 0, 0, 128);
    g.addColorStop(0, couleur('--ouv-arme-clair'));
    g.addColorStop(1, couleur('--ouv-arme-sombre'));
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
    ctx.globalAlpha = 1;
    // Brossé (traits horizontaux fins).
    for (let y = 0; y < 128; y += 2) {
      ctx.globalAlpha = 0.05 + f() * 0.08;
      ctx.fillStyle = couleur(f() < 0.5 ? '--ouv-arme-clair' : '--ouv-arme-sombre');
      ctx.fillRect(0, y, 128, 1);
    }
    grain(ctx, 128, 128, f, couleur('--ouv-arme-use'), couleur('--ouv-arme-sombre'), 500, 1.5);
    ctx.strokeStyle = couleur('--ouv-arme-use');
    for (let i = 0; i < 18; i += 1) {
      ctx.globalAlpha = 0.15 + f() * 0.25;
      ctx.lineWidth = 0.5 + f() * 0.6;
      const x = f() * 128;
      const y = f() * 128;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + (f() - 0.5) * 34, y + (f() - 0.5) * 10);
      ctx.stroke();
    }
    bordUse(ctx, 128, f, couleur('--ouv-arme-use'), 3, 0.55);
    ctx.globalAlpha = 1;
    return tex(c);
  }
  // Polymère (garde-main, chargeur, poignée, crosse) : grain moucheté, arêtes un peu plus claires.
  function polymere() {
    const [c, ctx] = toile(128, 128);
    const f = hasard(73);
    ctx.fillStyle = couleur('--ouv-polymere');
    ctx.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 1600; i += 1) {
      ctx.globalAlpha = 0.12 + f() * 0.2;
      ctx.fillStyle = couleur(f() < 0.5 ? '--ouv-polymere-clair' : '--ouv-arme-sombre');
      ctx.fillRect(f() * 128, f() * 128, 1.5, 1.5);
    }
    bordUse(ctx, 128, f, couleur('--ouv-polymere-clair'), 3, 0.6);
    return tex(c);
  }
  // Cuir des gants : marbrures douces, plis légers, reflets usés ; aucun trait sur les bords (retour du propriétaire : « la main fait très cubique » :
  // les coutures et l'usure des bords dessinaient les faces des pièces).
  function gantCuir() {
    const [c, ctx] = toile(128, 128);
    const f = hasard(79);
    ctx.fillStyle = couleur('--ouv-gant');
    ctx.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 26; i += 1) {
      const x = f() * 128;
      const y = f() * 128;
      const r = 10 + f() * 26;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, couleur(f() < 0.5 ? '--ouv-gant-clair' : '--ouv-gant-sombre'));
      g.addColorStop(1, 'transparent');
      ctx.globalAlpha = 0.18 + f() * 0.12;
      ctx.fillStyle = g;
      ctx.fillRect(x - r, y - r, 2 * r, 2 * r);
    }
    grain(ctx, 128, 128, f, couleur('--ouv-gant-clair'), couleur('--ouv-gant-sombre'), 500, 1.5);
    ctx.strokeStyle = couleur('--ouv-gant-sombre');
    ctx.lineCap = 'round';
    for (let i = 0; i < 6; i += 1) {
      ctx.globalAlpha = 0.15 + f() * 0.15;
      ctx.lineWidth = 0.8 + f();
      const x = 20 + f() * 88;
      const y = 20 + f() * 88;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x + 10, y + (f() - 0.5) * 10, x + 18 + f() * 10, y + (f() - 0.5) * 8);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    return tex(c, { repeter: true });
  }
  // Tissu des manches : grain fin, plis qui font le tour du bras (bandes douces dans le sens de la longueur de l'image), sans quadrillage.
  function tissu() {
    const [c, ctx] = toile(128, 128);
    const f = hasard(83);
    ctx.fillStyle = couleur('--ouv-manche');
    ctx.fillRect(0, 0, 128, 128);
    grain(ctx, 128, 128, f, couleur('--ouv-manche-clair'), couleur('--ouv-manche-sombre'), 1400, 1);
    for (let i = 0; i < 6; i += 1) {
      const y = f() * 128;
      const h = 6 + f() * 12;
      const g = ctx.createLinearGradient(0, y - h, 0, y + h);
      g.addColorStop(0, 'transparent');
      g.addColorStop(0.45, couleur('--ouv-manche-clair'));
      g.addColorStop(0.55, couleur('--ouv-manche-sombre'));
      g.addColorStop(1, 'transparent');
      ctx.globalAlpha = 0.35 + f() * 0.2;
      ctx.fillStyle = g;
      ctx.fillRect(0, y - h, 128, 2 * h);
    }
    ctx.globalAlpha = 1;
    return tex(c, { repeter: true });
  }
  // Verre de la lunette : bleu profond, bord plus clair, reflet en arc et petit éclat.
  function lentilleVerre() {
    const [c, ctx] = toile(64, 64);
    const g = ctx.createRadialGradient(28, 26, 2, 32, 32, 32);
    g.addColorStop(0, couleur('--ouv-lentille-bord'));
    g.addColorStop(0.55, couleur('--ouv-lentille'));
    g.addColorStop(0.9, couleur('--ouv-lentille'));
    g.addColorStop(1, couleur('--ouv-lentille-bord'));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    ctx.strokeStyle = couleur('--ouv-reflet');
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(32, 32, 22, Math.PI * 1.05, Math.PI * 1.45);
    ctx.stroke();
    ctx.globalAlpha = 0.8;
    ctx.fillStyle = couleur('--ouv-reflet');
    ctx.beginPath();
    ctx.arc(41, 21, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    return tex(c);
  }

  // Porte roulante : lames horizontales.
  function porte() {
    const [c, ctx] = toile(128, 256);
    const f = hasard(11);
    ctx.fillStyle = couleur('--ouv-porte');
    ctx.fillRect(0, 0, 128, 256);
    for (let y = 0; y < 256; y += 16) {
      ctx.fillStyle = couleur('--ouv-porte-rainure');
      ctx.fillRect(0, y, 128, 3);
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = couleur('--ouv-beton-clair');
      ctx.fillRect(0, y + 3, 128, 1);
      ctx.globalAlpha = 1;
    }
    grain(ctx, 128, 256, f, couleur('--ouv-beton-clair'), couleur('--ouv-porte-rainure'), 600, 2);
    return tex(c, { repeter: true });
  }

  // Bande jaune et noire (hachures à 45°).
  function bande() {
    const [c, ctx] = toile(128, 32);
    ctx.fillStyle = couleur('--ouv-bande-noire');
    ctx.fillRect(0, 0, 128, 32);
    ctx.fillStyle = couleur('--ouv-bande-jaune');
    for (let x = -32; x < 160; x += 32) {
      ctx.beginPath();
      ctx.moveTo(x, 32);
      ctx.lineTo(x + 16, 32);
      ctx.lineTo(x + 48, 0);
      ctx.lineTo(x + 32, 0);
      ctx.closePath();
      ctx.fill();
    }
    return tex(c, { repeter: true });
  }

  // Bande du tapis : caoutchouc à nervures transversales (défile par décalage de texture).
  function tapis() {
    const [c, ctx] = toile(64, 64);
    const f = hasard(13);
    ctx.fillStyle = couleur('--ouv-tapis');
    ctx.fillRect(0, 0, 64, 64);
    ctx.fillStyle = couleur('--ouv-tapis-rainure');
    for (let x = 0; x < 64; x += 16) ctx.fillRect(x, 0, 5, 64);
    grain(ctx, 64, 64, f, couleur('--ouv-tapis-rainure'), couleur('--ouv-noir'), 200, 1.5);
    return tex(c, { repeter: true });
  }

  // « ? » blanc sur fond transparent (teinté par la matière), avec un halo doux.
  function question(police) {
    const [c, ctx] = toile(128, 128);
    ctx.font = `104px ${police}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = couleur('--ouv-q');
    ctx.globalAlpha = 0.25;
    for (const [dx, dy] of [[-4, 0], [4, 0], [0, -4], [0, 4]]) ctx.fillText('?', 64 + dx, 70 + dy);
    ctx.globalAlpha = 1;
    ctx.fillText('?', 64, 70);
    return tex(c);
  }

  // Dégradé vertical (rayon : opaque en bas, transparent en haut), en luminance (teinté par la matière).
  function degrade() {
    const [c, ctx] = toile(16, 128);
    const g = ctx.createLinearGradient(0, 128, 0, 0);
    g.addColorStop(0, couleur('--ouv-q'));
    g.addColorStop(1, couleur('--ouv-noir'));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 16, 128);
    // Bords latéraux adoucis.
    const h = ctx.createLinearGradient(0, 0, 16, 0);
    h.addColorStop(0, couleur('--ouv-noir'));
    h.addColorStop(0.35, couleur('--ouv-q'));
    h.addColorStop(0.65, couleur('--ouv-q'));
    h.addColorStop(1, couleur('--ouv-noir'));
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = h;
    ctx.fillRect(0, 0, 16, 128);
    return tex(c, { srgb: false });
  }

  // Lueur ronde (luminance), pour les halos, la boule de feu et les particules.
  function lueur() {
    const [c, ctx] = toile(64, 64);
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, couleur('--ouv-q'));
    g.addColorStop(0.35, couleur('--ouv-carte-doux'));
    g.addColorStop(1, couleur('--ouv-noir'));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    return tex(c, { srgb: false });
  }

  // Étoile à quatre branches (flamme du canon, étincelles, éclat de l'explosion), luminance.
  function etoile() {
    const [c, ctx] = toile(64, 64);
    ctx.fillStyle = couleur('--ouv-noir');
    ctx.fillRect(0, 0, 64, 64);
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 30);
    g.addColorStop(0, couleur('--ouv-q'));
    g.addColorStop(1, couleur('--ouv-noir'));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(32, 2);
    ctx.lineTo(36, 28);
    ctx.lineTo(62, 32);
    ctx.lineTo(36, 36);
    ctx.lineTo(32, 62);
    ctx.lineTo(28, 36);
    ctx.lineTo(2, 32);
    ctx.lineTo(28, 28);
    ctx.closePath();
    ctx.fill();
    return tex(c, { srgb: false });
  }

  // Retour du propriétaire (« pas de gros bloc rectangulaire : une tache qui s'écoule en plusieurs filets, comme les filets du Z du logo ») :
  // tache de sang sur la « vitre » (légendaire) : ellipse pleine (rayon TACHE_R de la demi-taille, opaque : elle cache la carte), bord bosselé,
  // caillots plus sombres, gouttes projetées autour ; alpha.
  function tache() {
    const [c, ctx] = toile(256, 256);
    const f = hasard(43);
    ctx.clearRect(0, 0, 256, 256);
    const r = TACHE_R * 128;
    ctx.fillStyle = couleur('--ouv-sang');
    ctx.beginPath();
    ctx.arc(128, 128, r, 0, Math.PI * 2);
    ctx.fill();
    for (let i = 0; i < 22; i += 1) {
      const a = (i / 22) * Math.PI * 2 + f() * 0.2;
      const b = 6 + f() * 12;
      ctx.beginPath();
      ctx.arc(128 + Math.cos(a) * (r + b * 0.3), 128 + Math.sin(a) * (r + b * 0.3), b, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = couleur('--ouv-sang-sec');
    for (let i = 0; i < 9; i += 1) {
      const a = f() * Math.PI * 2;
      const d = f() * r * 0.75;
      ctx.globalAlpha = 0.25 + f() * 0.3;
      ctx.beginPath();
      ctx.ellipse(128 + Math.cos(a) * d, 128 + Math.sin(a) * d, 8 + f() * 22, 6 + f() * 14, f() * 3, 0, Math.PI * 2);
      ctx.fill();
    }
    for (let i = 0; i < 30; i += 1) {
      const a = f() * Math.PI * 2;
      const d = r + 14 + f() * (128 - r - 16);
      ctx.globalAlpha = 0.7 + f() * 0.3;
      ctx.fillStyle = couleur(f() < 0.7 ? '--ouv-sang' : '--ouv-sang-sec');
      ctx.beginPath();
      ctx.arc(128 + Math.cos(a) * d, 128 + Math.sin(a) * d, 1.5 + f() * 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    return tex(c);
  }

  // Écoulement de la tache (masque d'opacité, canal vert : clair = sang, noir = vitre propre) : sous un bord ondulé (ligne VIDANGE_BORD du haut,
  // à ± 4 % près), du sang ; au-dessus, rien, sauf des filets fins qui pendent derrière le bord. Décalé vers le bas au fil de l'écoulement.
  function vidange() {
    const [c, ctx] = toile(128, 256);
    const f = hasard(47);
    ctx.fillStyle = couleur('--ouv-noir');
    ctx.fillRect(0, 0, 128, 256);
    ctx.fillStyle = couleur('--ouv-q');
    const bord = VIDANGE_BORD * 256;
    ctx.beginPath();
    ctx.moveTo(0, 256);
    for (let x = 0; x <= 128; x += 8) ctx.lineTo(x, bord + (f() - 0.5) * 18);
    ctx.lineTo(128, 256);
    ctx.closePath();
    ctx.fill();
    for (let i = 0; i < 9; i += 1) {
      const x = 6 + f() * 116;
      const w = 1.5 + f() * 3;
      const long = 24 + f() * 70;
      ctx.beginPath();
      ctx.moveTo(x - w, bord + 10);
      ctx.quadraticCurveTo(x - w * 0.5, bord - long * 0.6, x - w * 0.25, bord - long);
      ctx.lineTo(x + w * 0.25, bord - long);
      ctx.quadraticCurveTo(x + w * 0.5, bord - long * 0.6, x + w, bord + 10);
      ctx.closePath();
      ctx.fill();
    }
    return tex(c, { srgb: false });
  }

  // Filet de sang (corps, étiré en longueur) : trait vertical aux bords adoucis, ombre à droite, reflet à gauche (comme les coulures du logo).
  function filet() {
    const [c, ctx] = toile(32, 32);
    ctx.clearRect(0, 0, 32, 32);
    ctx.fillStyle = couleur('--ouv-sang');
    ctx.fillRect(5, 0, 22, 32);
    ctx.globalAlpha = 0.5;
    ctx.fillRect(3, 0, 2, 32);
    ctx.fillRect(27, 0, 2, 32);
    ctx.globalAlpha = 0.45;
    ctx.fillStyle = couleur('--ouv-sang-sec');
    ctx.fillRect(20, 0, 7, 32);
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = couleur('--ouv-q');
    ctx.fillRect(9, 0, 2, 32);
    ctx.globalAlpha = 1;
    return tex(c);
  }

  // Hauts des filets (retours du propriétaire : « le haut des coulures ne doit pas être rectangulaire mais imparfait », puis « chaque goutte ne
  // doit pas être identique dans son irrégularité ») : planche de n cases de 32 × 64, une forme tirée par case (graine propre) : même colonne que
  // le corps (bords, ombre et reflet, raccord sans couture en bas), bord du haut bosselé à hauteurs et pentes variables, 0 à 2 gouttelettes
  // détachées au-dessus. Case k : u de k / n à (k + 1) / n.
  function hautsFilets(n) {
    const [c, ctx] = toile(32 * n, 64);
    ctx.clearRect(0, 0, 32 * n, 64);
    for (let k = 0; k < n; k += 1) {
      const f = hasard(61 + k * 13);
      const ox = 32 * k;
      // Bord du haut : une famille de forme par case (pointe décalée, biseau, fourche, bosses arrondies, fil fin qui monte), réglée au hasard.
      const type = k % 5;
      const bruit = () => (f() - 0.5) * 5;
      let pts;
      if (type === 0) {
        const px = 9 + f() * 14; // pointe haute, décalée
        pts = [[5, 64], [5, 40 + bruit()], [px - 4, 22 + bruit()], [px, 2 + f() * 4], [px + 3, 20 + bruit()], [27, 34 + bruit()], [27, 64]];
      } else if (type === 1) {
        const haut = 6 + f() * 8; // biseau : haut d'un côté, bas de l'autre, bosselé
        pts = [[5, 64], [5, haut], [10, haut + 6 + bruit()], [15, haut + 12 + bruit()], [20, haut + 20 + bruit()], [27, haut + 30 + bruit()], [27, 64]];
      } else if (type === 2) {
        const a = 7 + f() * 5; // fourche : deux pointes de hauteurs différentes
        pts = [[5, 64], [5, 34 + bruit()], [a, 6 + f() * 6], [16, 26 + bruit()], [20 + f() * 4, 12 + f() * 10], [27, 32 + bruit()], [27, 64]];
      } else if (type === 3) {
        pts = [[5, 64], [5, 28 + bruit()]]; // bosses arrondies irrégulières
        for (let i = 1; i < 6; i += 1) pts.push([5 + (22 * i) / 6, 10 + f() * 16]);
        pts.push([27, 26 + bruit()], [27, 64]);
      } else {
        const fx = 12 + f() * 8; // fil fin qui monte au-dessus d'un bord presque plat
        pts = [[5, 64], [5, 34 + bruit()], [fx - 3, 30 + bruit()], [fx - 0.8, 1], [fx + 0.8, 1], [fx + 3, 30 + bruit()], [27, 36 + bruit()], [27, 64]];
      }
      const forme = new Path2D();
      forme.moveTo(ox + pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length - 1; i += 1) {
        const [x, y] = pts[i];
        const [nx, ny] = pts[i + 1];
        forme.quadraticCurveTo(ox + x, y, ox + (x + nx) / 2, (y + ny) / 2);
      }
      forme.lineTo(ox + 27, 64);
      forme.closePath();
      ctx.fillStyle = couleur('--ouv-sang');
      ctx.fill(forme);
      // Gouttelettes détachées (0 à 2), au-dessus du bord.
      const gouttelettes = Math.floor(f() * 3);
      for (let g = 0; g < gouttelettes; g += 1) {
        ctx.beginPath();
        ctx.ellipse(ox + 8 + f() * 16, 2.5 + f() * 6, 1.2 + f() * 1.3, 1.6 + f() * 1.6, f() - 0.5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.save();
      ctx.clip(forme);
      ctx.globalAlpha = 0.45;
      ctx.fillStyle = couleur('--ouv-sang-sec');
      ctx.fillRect(ox + 20, 0, 7, 64);
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = couleur('--ouv-q');
      ctx.fillRect(ox + 9, 20, 2, 44);
      ctx.restore();
      // Bords adoucis, comme le corps, sous la partie irrégulière.
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = couleur('--ouv-sang');
      ctx.fillRect(ox + 3, 40, 2, 24);
      ctx.fillRect(ox + 27, 40, 2, 24);
      ctx.globalAlpha = 1;
    }
    return tex(c);
  }

  // Goutte au bout d'un filet : col à la largeur du filet (moitié de la largeur de l'image) puis renflement rond, ombre et brillant.
  function goutte() {
    const [c, ctx] = toile(64, 64);
    ctx.clearRect(0, 0, 64, 64);
    ctx.fillStyle = couleur('--ouv-sang');
    ctx.beginPath();
    ctx.moveTo(18, 0);
    ctx.bezierCurveTo(18, 16, 11, 22, 11, 38);
    ctx.arc(32, 40, 21, Math.PI, 0, true);
    ctx.bezierCurveTo(53, 22, 46, 16, 46, 0);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 0.45;
    ctx.fillStyle = couleur('--ouv-sang-sec');
    ctx.beginPath();
    ctx.arc(36, 43, 15, -0.6, 1.9);
    ctx.fill();
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = couleur('--ouv-q');
    ctx.beginPath();
    ctx.ellipse(25, 40, 4, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    return tex(c);
  }

  // Volute (flamme ou fumée de l'explosion) : nuage irrégulier blanc, opacité en dégradé (teinté par la matière).
  function bouffee() {
    const [c, ctx] = toile(128, 128);
    const f = hasard(23);
    ctx.clearRect(0, 0, 128, 128);
    for (let i = 0; i < 14; i += 1) {
      const a = f() * Math.PI * 2;
      const d = f() * 30;
      const x = 64 + Math.cos(a) * d;
      const y = 64 + Math.sin(a) * d;
      const r = 18 + f() * 26;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, couleur('--ouv-q'));
      g.addColorStop(1, couleur('--ouv-q'));
      ctx.globalAlpha = 0.22 + f() * 0.2;
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    // Bord adouci : opacité ramenée à zéro vers l'extérieur.
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'destination-in';
    const m = ctx.createRadialGradient(64, 64, 20, 64, 64, 62);
    m.addColorStop(0, couleur('--ouv-q'));
    m.addColorStop(1, 'transparent');
    ctx.fillStyle = m;
    ctx.fillRect(0, 0, 128, 128);
    return tex(c);
  }

  // Éclaboussure de sang sur la « vitre » (zombie écrasé contre l'écran) : tache centrale, gouttes projetées, alpha.
  function eclaboussure() {
    const [c, ctx] = toile(256, 256);
    const f = hasard(29);
    ctx.clearRect(0, 0, 256, 256);
    ctx.fillStyle = couleur('--ouv-sang');
    for (let i = 0; i < 6; i += 1) {
      ctx.globalAlpha = 0.3 + f() * 0.25;
      ctx.beginPath();
      ctx.ellipse(128 + (f() - 0.5) * 50, 128 + (f() - 0.5) * 34, 10 + f() * 20, 7 + f() * 14, f() * 3, 0, Math.PI * 2);
      ctx.fill();
    }
    // Giclures en rayons (traits fins qui partent du centre).
    ctx.strokeStyle = couleur('--ouv-sang');
    ctx.lineCap = 'round';
    for (let i = 0; i < 16; i += 1) {
      const a = f() * Math.PI * 2;
      const d0 = 18 + f() * 20;
      const d1 = d0 + 30 + f() * 60;
      ctx.globalAlpha = 0.5 + f() * 0.4;
      ctx.lineWidth = 1.5 + f() * 3.5;
      ctx.beginPath();
      ctx.moveTo(128 + Math.cos(a) * d0, 128 + Math.sin(a) * d0 * 0.8);
      ctx.lineTo(128 + Math.cos(a) * d1, 128 + Math.sin(a) * d1 * 0.8);
      ctx.stroke();
    }
    for (let i = 0; i < 46; i += 1) {
      const a = f() * Math.PI * 2;
      const d = 50 + f() * 70;
      ctx.globalAlpha = 0.55 + f() * 0.4;
      ctx.fillStyle = couleur(f() < 0.7 ? '--ouv-sang' : '--ouv-sang-sec');
      ctx.beginPath();
      ctx.arc(128 + Math.cos(a) * d, 128 + Math.sin(a) * d * 0.8, 1.5 + f() * 6, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    return tex(c);
  }

  // Carte de l'objet (nom, rareté écrite, ligne de détail) : fond sombre, bord de la couleur de la rareté.
  function carte(canvasTex, { nom, ligne2, ligne3, bord, grand }) {
    const c = canvasTex.image;
    const ctx = c.getContext('2d');
    const w = c.width;
    const h = c.height;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = couleur('--ouv-carte');
    ctx.strokeStyle = bord;
    ctx.lineWidth = 14;
    const r = 22;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(7, 7, w - 14, h - 14, r);
    else ctx.rect(7, 7, w - 14, h - 14);
    ctx.fill();
    ctx.stroke();
    // Fond teinté de la rareté.
    ctx.globalAlpha = 0.16;
    ctx.fillStyle = bord;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = couleur('--ouv-carte-texte');
    const taille = (texte, max, px) => {
      let s = px;
      ctx.font = `700 ${s}px Barlow, sans-serif`;
      while (s > 20 && ctx.measureText(texte).width > max) {
        s -= 2;
        ctx.font = `700 ${s}px Barlow, sans-serif`;
      }
    };
    taille(nom, w - 70, grand ? 64 : 58);
    ctx.fillText(nom, w / 2, ligne3 ? h * 0.36 : h * 0.42);
    ctx.font = `400 ${grand ? 38 : 36}px Barlow, sans-serif`;
    ctx.fillStyle = couleur('--ouv-carte-doux');
    ctx.fillText(ligne2, w / 2, ligne3 ? h * 0.6 : h * 0.68);
    if (ligne3) {
      taille(ligne3, w - 80, 30);
      ctx.font = ctx.font.replace('700', '400');
      ctx.fillText(ligne3, w / 2, h * 0.8);
    }
    canvasTex.needsUpdate = true;
  }
  function toileCarte() {
    const [c] = toile(512, 288);
    return tex(c);
  }

  // Marque au-dessus de la tête d'un zombie (« ! », « !! », « !!! »).
  function marque(texte, jeton, police) {
    const [c, ctx] = toile(256, 128);
    ctx.font = `96px ${police}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 10;
    ctx.strokeStyle = couleur('--ouv-noir');
    ctx.strokeText(texte, 128, 70);
    ctx.fillStyle = couleur(jeton);
    ctx.fillText(texte, 128, 70);
    return tex(c);
  }

  return {
    beton, bois, metal, armeUsee, polymere, gantCuir, tissu, lentilleVerre, porte, bande, tapis, question, degrade, lueur, etoile, tache, vidange, filet, hautsFilets, goutte, bouffee, eclaboussure, carte, toileCarte, marque,
    nombre: () => toutes.size,
    toutes: () => [...toutes],
    liberer() {
      for (const t of toutes) t.dispose();
      toutes.clear();
    },
  };
}
