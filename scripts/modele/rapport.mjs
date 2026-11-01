// Rapport d'écarts carte / modèle (lot 3g) : lit releve.json, plan.json, etage.json (s'il existe) et ecarts-decisions.json (s'il existe),
// écrit Docs/ref/ecarts-modele.md et le brouillon data/game/maps/rez-de-chaussee/ecarts-decisions.json.
// L'accord du propriétaire (`approved`) déjà présent dans ecarts-decisions.json est conservé. Usage : node scripts/modele/rapport.mjs [--ecrire]
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { compareFloor, countByLevel, draftDecisions, openMid } from '../../js/core/ecarts.js';
import { LEVELS } from '../../js/core/releve.js';

const DIR = 'data/game/maps/rez-de-chaussee';
const read = (f) => JSON.parse(readFileSync(f, 'utf8'));
const releve = read(`${DIR}/releve.json`);
const plans = { rdc: read(`${DIR}/plan.json`), ...(existsSync(`${DIR}/etage.json`) ? { etage: read(`${DIR}/etage.json`) } : {}) };
const decisionsFile = `${DIR}/ecarts-decisions.json`;
const previous = existsSync(decisionsFile) ? read(decisionsFile).decisions ?? [] : [];
const NAMES = { rdc: 'Rez-de-chaussée', etage: 'Étage' };
const fmt = (v) => String(v).replace('.', ',');
const cell = (v) => String(v ?? '').replace(/\|/g, '/');

const results = Object.fromEntries(Object.entries(plans).map(([f, p]) => [f, compareFloor(p, releve, f, { decisions: previous })]));
const allRows = Object.values(results).flatMap((r) => r.rows);
// Une décision par ligne qui propose un changement, plus les lignes « plus-60 » (à approuver) ; les écarts sous 15 et les « garder » ne sont pas des décisions.
const decisions = draftDecisions(allRows.filter((r) => r.action !== 'garder'), previous);

const L = [];
L.push('# Écarts entre la carte et le modèle 3D (lot 3g)', '');
L.push('Généré par `node scripts/modele/rapport.mjs --ecrire` d\'après `releve.json` (lui-même tiré du modèle par `scripts/modele/extraire.py` et `scripts/modele/releve.mjs`). Ne pas éditer à la main : relancer le script. Méthode, calage et procédure : `Docs/ref/affinage.md`. Page visuelle : `ecarts.html`.', '');
L.push('## Calage', '');
L.push(`- Formule (celle du lot 3e) : ${releve.calage.formule} ; scale ${fmt(releve.calage.scale)}, ox ${fmt(releve.calage.ox)}, oy ${fmt(releve.calage.oy)}.`);
L.push(`- Résidu : **${fmt(releve.calage.residu.score)} %** des pixels du contour de \`plan.json\` à 1 px au plus de la coupe pleine du modèle à 1,2 m ; meilleur décalage trouvé ${fmt(releve.calage.residu.meilleur.dx)}, ${fmt(releve.calage.residu.meilleur.dy)} px (${fmt(releve.calage.residu.meilleur.score)} %), moins de 15 unités : le calage du lot 3e est gardé.`);
L.push('- Le mobilier relevé au lot 3b (M1 à M36) est en moyenne 9 unités au sud des objets du modèle (écart systématique, sous le seuil de 15 : ignoré).', '');
L.push('## Résumé (nombre d\'écarts par niveau et par nature)', '');
L.push('| Étage | Niveau | mur | ouverture | fenêtre | pilier | escalier | meuble | objet |', '|---|---|---|---|---|---|---|---|---|');
for (const [f, r] of Object.entries(results)) {
  const c = countByLevel(r.rows);
  for (const lv of LEVELS) L.push(`| ${NAMES[f]} | ${lv} | ${['mur', 'ouverture', 'fenetre', 'pilier', 'escalier', 'meuble', 'objet'].map((n) => c[lv]?.[n] ?? 0).join(' | ')} |`);
}
L.push('', 'Niveaux : **moins-15** ignoré ; **15-60** appliqué en partie B par `scripts/modele/appliquer-decisions.mjs` quand le modèle est net ; **plus-60** signalé, jamais appliqué sans `approved: true`. Les escaliers, les portes et leurs ouvertures ne changent pas dans ce lot (`garder`), quel que soit l\'écart.', '');

for (const [f, r] of Object.entries(results)) {
  L.push(`## ${NAMES[f]} : écarts par élément`, '');
  L.push(`Écarts 15-60 encore ouverts (ni corrigés ni gardés par une décision) : ${openMid(r.rows).map((x) => x.id).join(', ') || 'aucun'}.`, '');
  L.push('| Élément | Nature | Modèle | Écart (unités) | Niveau | Proposition | Décision (ecarts-decisions.json) | Raison | Détails |', '|---|---|---|---|---|---|---|---|---|');
  const order = ['mur', 'ouverture', 'fenetre', 'pilier', 'escalier', 'meuble', 'objet'];
  for (const row of [...r.rows].sort((a, b) => order.indexOf(a.nature) - order.indexOf(b.nature))) {
    const dec = row.decision ? `${row.decision.action}${row.decision.approved === false ? ' (à approuver)' : ''}${row.decision.action !== row.action ? ` : ${cell(row.decision.reason)}` : ''}` : '—';
    L.push(`| ${cell(row.id)} | ${row.nature} | ${cell(row.ref ?? 'aucun')} | ${fmt(row.delta)} | ${row.level} | ${row.action}${row.to ? ` → ${cell(JSON.stringify(row.to))}` : ''} | ${dec} | ${cell(row.reason)} | ${cell(row.details)} |`);
  }
  L.push('');
  const furniture = r.rows.filter((x) => x.nature === 'meuble');
  const prov = furniture.filter((x) => /^[PQ]\d/.test(x.id));
  L.push(`**Pièces provisoires associées à un objet du modèle** : ${prov.filter((x) => x.ref).map((x) => `${x.id} → ${x.ref}`).join(', ') || 'aucune'}.`);
  L.push(`**Pièces provisoires sans objet du modèle** (restent \`provisional\`) : ${prov.filter((x) => !x.ref).map((x) => x.id).join(', ') || 'aucune'}.`);
  L.push(`**Pièces déjà relevées sur le modèle** : ${furniture.filter((x) => !/^[PQ]\d/.test(x.id)).map((x) => `${x.id} → ${x.ref ?? 'aucun'}`).join(', ')}.`, '');
  L.push(`**Objets du modèle sans équivalent** : ${r.unmatchedObjects.map((g) => `${g.key} (${g.klass}, ${g.components.join(' + ')})`).join(', ') || 'aucun'}. Les meubles sont proposés comme pièces solides (partie B, 12 au plus au rez-de-chaussée, 8 à l'étage) ; le décor léger va au catalogue de la partie C.`, '');
  L.push(`**Objets au-dessus de 1,2 m** (luminaires, caisses posées haut) : ${r.high.map((o) => `${o.id} (${o.component}, ${fmt(o.bottom)} à ${fmt(o.top)} m)`).join(', ') || 'aucun'}.`, '');
}

L.push('## Inventaire des objets du modèle (à l\'intérieur du bâtiment)', '');
L.push('Règles de classement (dans l\'ordre, hauteurs au-dessus du sol de l\'étage) : composant d\'ouvrage de fenêtre (`Component_5` à `Component_8`) → relevé avec les fenêtres ; bas à plus de 1,2 m → décor léger (haut) ; côté court de moins de 0,12 m → décor léger (mince) ; sommet à 0,5 m au plus et aire de 0,6 m² au plus → décor léger (bas) ; posé au sol, sommet de 0,3 à 2,6 m, côté court d\'au moins 0,25 m → meuble ; sinon inconnu. Piliers et escaliers viennent de la coupe et des marches du bâti, pas des composants.', '');
L.push('| Objet | Composant | Étage | Boîte du plan (px) | Bas → sommet (m) | Classe (règle) |', '|---|---|---|---|---|---|');
for (const o of releve.objects.filter((x) => !x.outside)) L.push(`| ${o.id} | ${cell(o.component)} | ${o.floor} | ${fmt(o.plan.x0)}, ${fmt(o.plan.y0)} → ${fmt(o.plan.x1)}, ${fmt(o.plan.y1)} | ${fmt(o.bottom)} → ${fmt(o.top)} | ${o.klass} (${o.rule}) |`);
const outside = releve.objects.filter((x) => x.outside);
const byComp = {};
for (const o of outside) byComp[o.component] = (byComp[o.component] ?? 0) + 1;
L.push('', `Hors du bâtiment (décor extérieur du modèle, non comparé : \`decor.json\` ne change pas) : ${outside.length} objets — ${Object.entries(byComp).sort((a, b) => b[1] - a[1]).map(([c, n]) => `${c} × ${n}`).join(', ')}.`, '');
L.push('## Escaliers et fenêtres du modèle', '');
for (const s of releve.stairs) L.push(`- ${s.id} : ${fmt(s.x0)}, ${fmt(s.y0)} → ${fmt(s.x1)}, ${fmt(s.y1)} px, ${s.steps} niveaux de marche jusqu'à ${fmt(s.top)} m${s.outside ? ' (hors du bâtiment)' : ''}.`);
L.push(`- Ouvrages de fenêtre (composants) : ${releve.windows.length}, dont ${releve.windows.filter((w) => w.floor === 'rdc').length} au rez-de-chaussée et ${releve.windows.filter((w) => w.floor === 'etage').length} à l'étage (les barrières de planches du décor extérieur en font partie).`, '');
L.push('## Matières et couleurs du modèle', '');
L.push('Couleur diffuse (0 à 255) quand le modèle en donne une ; sinon le nom de l\'image de texture (jamais importée ni reproduite : les teintes du jeu restent générées en code).', '');
L.push('| Matière | Couleur (R, G, B) | Image de texture | Triangles |', '|---|---|---|---|');
for (const m of releve.materials.slice(0, 40)) L.push(`| ${cell(m.name)} | ${m.color ? m.color.map((c) => Math.round(c * 255)).join(', ') : '—'} | ${cell(m.texture ?? '—')} | ${m.triangles} |`);
L.push('');
const md = `${L.join('\n')}\n`;
const json = `${JSON.stringify({ _provisoire: 'Lot 3g : décisions rejouables (pixels du plan) appliquées aux sources par scripts/modele/appliquer-decisions.mjs. Brouillon généré par scripts/modele/rapport.mjs ; `approved: true` = accord du propriétaire (obligatoire pour le niveau plus-60). Voir Docs/ref/affinage.md.', decisions }, null, 2)}\n`;
console.log(`Lignes : ${allRows.length} ; décisions : ${decisions.length} (${decisions.filter((d) => d.level === 'plus-60').length} à approuver)`);
for (const [f, r] of Object.entries(results)) console.log(`${f} : ${JSON.stringify(countByLevel(r.rows))}`);
if (process.argv.includes('--ecrire')) {
  writeFileSync('Docs/ref/ecarts-modele.md', md);
  if (!existsSync(decisionsFile)) writeFileSync(decisionsFile, json);
  else console.log(`${decisionsFile} existe déjà : non réécrit (éditer à la main ou le supprimer pour régénérer le brouillon)`);
  console.log('Écrit : Docs/ref/ecarts-modele.md');
}
