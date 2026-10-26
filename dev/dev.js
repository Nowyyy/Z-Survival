import { startPage } from '../js/page.js';
import { lotLabel, splitLots } from '../js/lots.js';

async function loadLots() {
  try {
    const response = await fetch('../lots.json');
    if (!response.ok) return null;
    const data = await response.json();
    return splitLots(data.lots);
  } catch {
    return null;
  }
}

const lots = await loadLots();
const latestLink = document.getElementById('latest');
const latestLabel = latestLink.querySelector('[data-label]');
const latestMeta = latestLink.querySelector('[data-meta]');
const picker = document.getElementById('picker');
const select = document.getElementById('previous');
const note = document.getElementById('note');

const formatDate = (iso, lang) => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat(lang, { dateStyle: 'medium' }).format(date);
};

function render({ t, lang }) {
  const latest = lots?.latest ?? null;
  const previous = lots?.previous ?? [];

  latestLink.hidden = !latest;
  if (latest) {
    latestLink.href = `../lots/${latest.name}/`;
    latestLabel.textContent = t('dev.latest').replace('{lot}', lotLabel(latest.name));
    latestMeta.textContent = formatDate(latest.date, lang);
  }

  const chosen = select.value;
  select.replaceChildren(new Option(t('dev.choose'), ''));
  for (const lot of previous) {
    const date = formatDate(lot.date, lang);
    select.add(new Option(date ? `${lotLabel(lot.name)} · ${date}` : lotLabel(lot.name), `../lots/${lot.name}/`));
  }
  select.value = [...select.options].some((o) => o.value === chosen) ? chosen : '';
  picker.hidden = !lots;
  select.disabled = previous.length === 0;
  picker.querySelector('button').disabled = previous.length === 0;

  note.textContent = lots === null ? t('dev.unavailable') : latest ? '' : t('dev.noLots');
  note.hidden = note.textContent === '';
  if (lots && previous.length === 0) select.options[0].textContent = t('dev.noPrevious');
}

picker.addEventListener('submit', (event) => {
  event.preventDefault();
  if (select.value) location.assign(select.value);
});

await startPage({ base: '../', render });
