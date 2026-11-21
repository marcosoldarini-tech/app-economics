'use strict';

/* =========================================================
   Economics: entrate, uscite e investimenti mensili.
   Dati salvati solo sul dispositivo (localStorage).
   Importi sempre in centesimi (interi) per evitare errori di arrotondamento.
   L'app è l'originale; il file Excel/Numbers esportato (uno per anno) è l'archivio.
   ========================================================= */

const STORE_KEY = 'economics.v1';

const TYPES = {
  entrata_ric:   { label: 'Entrata fissa',  section: 'Stipendio ed entrate fisse' },
  entrata_extra: { label: 'Altro introito', section: 'Altri introiti' },
  spesa_ric:     { label: 'Spesa fissa',    section: 'Spese fisse' },
  spesa_var:     { label: 'Spesa',          section: 'Spese' },
  invest:        { label: 'Investimento',   section: 'Investimenti' },
};
const TYPE_ORDER = ['entrata_ric', 'entrata_extra', 'spesa_ric', 'spesa_var', 'invest'];
const QUICK_TYPES = ['spesa_var', 'entrata_extra', 'spesa_ric', 'entrata_ric', 'invest'];
const PLAN_TYPES = ['entrata_ric', 'spesa_ric', 'invest'];
const CAT_TYPES = ['spesa_var', 'spesa_ric'];               // tipi con categoria
const MONTHS = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'];
const MONTHS_LONG = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'];
const DEFAULT_CATS = [
  ['Abbigliamento', false], ['Altro', false], ['Benzina', false], ['Mediche', false],
  ['Spesa', false], ['Spesa con buoni pasto', true], ['Svago', false], ['Viaggi', false],
];
const DEFAULT_CATS_FIXED = ['Canoni', 'Mutuo', 'Donazioni', 'Energia', 'Altro'];
const TAB_TITLES = { mese: 'Mese', piano: 'Piano annuale', report: 'Report', impostazioni: 'Impostazioni' };
const PALETTE = ['#0f766e', '#4f46e5', '#c2410c', '#a21caf', '#0369a1', '#65a30d', '#b45309', '#db2777', '#475569', '#0891b2', '#7c3aed', '#dc2626', '#0d9488', '#9333ea'];

/* ---------- Utilità ---------- */
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const eur = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', useGrouping: 'always' });
const fmt = c => eur.format((c || 0) / 100);
const pad = n => String(n).padStart(2, '0');
const sum = (arr, f = x => x) => arr.reduce((a, x) => a + f(x), 0);
function todayISO() { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
const currentMonthKey = () => todayISO().slice(0, 7);
const currentYear = () => new Date().getFullYear();
function mkLabel(mk) { const [y, m] = mk.split('-').map(Number); return `${MONTHS_LONG[m - 1]} ${y}`; }
function shiftMonth(mk, d) {
  let [y, m] = mk.split('-').map(Number); m += d;
  while (m > 12) { m -= 12; y++; } while (m < 1) { m += 12; y--; }
  return `${y}-${pad(m)}`;
}
const yearMonths = y => Array.from({ length: 12 }, (_, i) => `${y}-${pad(i + 1)}`);
const daysInMonth = (y, m) => new Date(y, m, 0).getDate();
const dateFor = (y, m, day) => `${y}-${pad(m)}-${pad(Math.min(day, daysInMonth(y, m)))}`;
function fmtDate(iso) { const d = new Date(iso); return d.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' }); }
function fmtDay(ymd) { const [, m, d] = ymd.split('-').map(Number); return `${d} ${MONTHS[m - 1].toLowerCase()}`; }
function parseAmount(s) {
  s = String(s ?? '').trim().replace(/[\s€]/g, '');
  if (!s) return NaN;
  // Formato italiano: "1.234,56" → 1234.56 · "2.300" → 2300 · "12.5" → 12.5
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  const v = Number(s);
  return Number.isFinite(v) ? Math.round(v * 100) : NaN;
}
const amountInput = c => (c == null ? '' : (c / 100).toFixed(2).replace('.', ','));
const esc = s => String(s ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const valCls = v => (v > 0 ? 'pos' : v < 0 ? 'neg' : '');
const cssVar = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();

/* ---------- Stato e salvataggio ---------- */
function emptyState() {
  return {
    version: 2,
    tx: [],          // {id, type, amount, category, description, date:'YYYY-MM-DD', seriesId}
    series: {},      // {id, year, type, name, category, day}
    cats: DEFAULT_CATS.map(([name, excluded]) => ({ name, excluded })),  // categorie Spese
    catsFixed: DEFAULT_CATS_FIXED.map(name => ({ name })),                // categorie Spese fisse
    closed: {},      // {'YYYY-MM': {at: ISO}}
    lastExport: null,
  };
}
function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      const s = JSON.parse(raw);
      const e = emptyState();
      const st = {
        ...e, ...s,
        cats: s.cats && s.cats.length ? s.cats : e.cats,
        catsFixed: s.catsFixed && s.catsFixed.length ? s.catsFixed : e.catsFixed,
        series: s.series || {}, closed: s.closed || {}, tx: s.tx || [], version: 2,
      };
      st.tx.forEach(t => { if (t.type === 'spesa_ric' && !t.category) t.category = 'Altro'; });
      Object.values(st.series).forEach(x => { if (x.type === 'spesa_ric' && !x.category) x.category = 'Altro'; });
      return st;
    }
  } catch (err) { console.error(err); }
  return emptyState();
}
let state = load();
function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); return true; }
  catch (err) { console.error(err); toast('Attenzione: impossibile salvare sul dispositivo'); return false; }
}

const ui = { tab: 'mese', month: currentMonthKey(), planYear: currentYear(), reportYear: currentYear(), exportYear: currentYear() };

const catList = type => (type === 'spesa_ric' ? state.catsFixed : state.cats);
const listByKey = key => (key === 'fixed' ? state.catsFixed : state.cats);
const catByName = (n, type = 'spesa_var') => catList(type).find(c => c.name === n);
const isExcludedCat = n => !!(catByName(n, 'spesa_var') || {}).excluded;
const isExcludedTx = t => t.type === 'spesa_var' && isExcludedCat(t.category);
const isClosed = mk => !!state.closed[mk];
const monthOf = t => t.date.slice(0, 7);

function totals(mk) {
  const t = { entrata_ric: 0, entrata_extra: 0, spesa_ric: 0, spesa_var: 0, invest: 0, escluse: 0 };
  let count = 0;
  for (const x of state.tx) {
    if (monthOf(x) !== mk) continue;
    count++;
    if (isExcludedTx(x)) { t.escluse += x.amount; continue; }
    t[x.type] += x.amount;
  }
  t.entrate = t.entrata_ric + t.entrata_extra;
  t.spese = t.spesa_ric + t.spesa_var;
  t.gl = t.entrate - t.spese;
  t.gll = t.gl - t.invest;
  t.count = count;
  return t;
}

/* Statistiche per categoria di un anno: Spese + Spese fisse, mese per mese. */
function categoryStats(y) {
  const rows = [];
  for (const type of CAT_TYPES) {
    const names = [...catList(type).map(c => c.name)];
    state.tx.forEach(t => { if (t.type === type && t.date.startsWith(y + '-') && !names.includes(t.category)) names.push(t.category); });
    for (const name of names) {
      const months = Array(12).fill(0);
      state.tx.forEach(t => { if (t.type === type && t.category === name && t.date.startsWith(y + '-')) months[Number(t.date.slice(5, 7)) - 1] += t.amount; });
      const total = sum(months);
      rows.push({ type, group: TYPES[type].section, name, months, total, excluded: type === 'spesa_var' && isExcludedCat(name) });
    }
  }
  const varNames = new Set(rows.filter(r => r.type === 'spesa_var').map(r => r.name));
  rows.forEach(r => { r.label = r.type === 'spesa_ric' && varNames.has(r.name) ? `${r.name} (fisse)` : r.name; });
  return rows;
}

/* ---------- Toast e bottom sheet ---------- */
let toastTimer;
function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg; el.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

const sheet = document.getElementById('sheet');
let sheetCancel = null;
function openSheet(html, onMount, onCancel) {
  sheetCancel = onCancel || null;
  sheet.innerHTML = `<div class="sheet-inner">${html}</div>`;
  if (!sheet.open) sheet.showModal();
  if (onMount) onMount(sheet);
}
function closeSheet() { sheetCancel = null; if (sheet.open) sheet.close(); }
function cancelSheet() { const c = sheetCancel; closeSheet(); if (c) c(); }
sheet.addEventListener('click', e => { if (e.target === sheet) cancelSheet(); });
sheet.addEventListener('cancel', e => { e.preventDefault(); cancelSheet(); });

function ask(title, body, okLabel = 'Conferma', danger = false) {
  return new Promise(resolve => {
    openSheet(`
      <h2>${title}</h2><p>${body}</p>
      <div class="actions">
        <button class="btn" data-r="0">Annulla</button>
        <button class="btn ${danger ? 'danger' : 'primary'}" data-r="1">${okLabel}</button>
      </div>`,
      s => s.querySelectorAll('[data-r]').forEach(b => { b.onclick = () => { closeSheet(); resolve(b.dataset.r === '1'); }; }),
      () => resolve(false));
  });
}

function catChips(type, selected) {
  return catList(type).map(c => `<button type="button" class="chip ${c.name === selected ? 'on' : ''}" data-cat="${esc(c.name)}">${esc(c.name)}${c.excluded ? ' <small>fuori calcolo</small>' : ''}</button>`).join('');
}

/* ---------- Render ---------- */
let charts = [];
function destroyCharts() { charts.forEach(c => c.destroy()); charts = []; }

function render(scrollTop = false) {
  destroyCharts();
  document.querySelectorAll('.tabbar button').forEach(b => b.classList.toggle('active', b.dataset.tab === ui.tab));
  document.getElementById('title').textContent = TAB_TITLES[ui.tab];
  document.getElementById('fab').hidden = ui.tab !== 'mese' || isClosed(ui.month);
  const v = document.getElementById('view');
  ({ mese: renderMonth, piano: renderPlan, report: renderReport, impostazioni: renderSettings })[ui.tab](v);
  if (scrollTop) window.scrollTo(0, 0);
}

function line(label, val, cls = '', sub = '') {
  return `<div class="line ${cls}"><span>${label}${sub ? `<small>${sub}</small>` : ''}</span><span>${fmt(val)}</span></div>`;
}
function txRow(t, showCat) {
  const name = t.description || t.category || TYPES[t.type].label;
  const sub = fmtDay(t.date) + (showCat && t.category ? ` · ${t.category}` : '') + (t.seriesId ? ' · pianificata' : '');
  return `<button class="tx" data-act="edit" data-id="${t.id}">
    <span><span class="txname">${esc(name)}</span><span class="txsub">${esc(sub)}</span></span>
    <span class="txamt">${fmt(t.amount)}</span></button>`;
}

/* ----- Vista Mese ----- */
function renderMonth(v) {
  const mk = ui.month, t = totals(mk), closed = state.closed[mk];
  const txs = state.tx.filter(x => monthOf(x) === mk).sort((a, b) => a.date.localeCompare(b.date));
  let h = `
    <div class="periodnav">
      <button class="iconbtn" data-act="prev" aria-label="Mese precedente">‹</button>
      <div class="center"><div class="ptitle">${mkLabel(mk)}</div>
        ${mk !== currentMonthKey() ? '<button class="link" data-act="today">Torna al mese corrente</button>' : ''}</div>
      <button class="iconbtn" data-act="next" aria-label="Mese successivo">›</button>
    </div>
    <section class="card summary">
      <span class="badge ${closed ? 'ok' : 'warn'}">${closed ? 'Concluso il ' + fmtDate(closed.at) : 'Provvisorio'}</span>
      <div class="kpis">
        <div><div class="lbl">Gain/Loss</div><div class="big ${valCls(t.gl)}">${fmt(t.gl)}</div></div>
        <div><div class="lbl">Gain/Loss liquido</div><div class="big ${valCls(t.gll)}">${fmt(t.gll)}</div></div>
      </div>
      ${line('Entrate', t.entrate)}
      ${line('Uscite', -t.spese)}
      ${line('Investimenti', -t.invest)}
      ${t.escluse ? line('Fuori calcolo', t.escluse, 'muted', 'es. spesa con buoni pasto, solo per i report') : ''}
    </section>`;

  for (const k of TYPE_ORDER) {
    const items = txs.filter(x => x.type === k);
    const counted = sum(items.filter(x => !isExcludedTx(x)), x => x.amount);
    h += `<section class="card"><div class="sec-h"><h3>${TYPES[k].section}</h3><span>${fmt(counted)}</span></div>`;
    if (!items.length) h += '<p class="empty">Nessuna voce</p>';
    if (CAT_TYPES.includes(k)) {
      const names = [...catList(k).map(c => c.name), ...new Set(items.map(x => x.category).filter(n => !catByName(n, k)))];
      for (const n of names) {
        const g = items.filter(x => x.category === n);
        if (!g.length) continue;
        const excl = k === 'spesa_var' && isExcludedCat(n);
        h += `<div class="subh"><span>${esc(n)}${excl ? '<span class="tag">fuori calcolo</span>' : ''}</span><span>${fmt(sum(g, x => x.amount))}</span></div>`;
        h += g.map(x => txRow(x, false)).join('');
      }
    } else {
      h += items.map(x => txRow(x, false)).join('');
    }
    if (!closed) h += `<button class="addrow" data-act="add" data-type="${k}">+ Aggiungi</button>`;
    h += '</section>';
  }

  h += closed
    ? `<button class="btn block outline" data-act="reopen">Riapri il mese</button>`
    : `<button class="btn block primary" data-act="close-month">Mese concluso</button>`;
  v.innerHTML = h;
}

/* ----- Inserimento / modifica movimento ----- */
function openTxSheet(tx, presetType) {
  const isNew = !tx;
  const mk = ui.month;
  const d = tx ? { ...tx } : {
    type: presetType || 'spesa_var', amount: null, category: '', description: '',
    date: mk === currentMonthKey() ? todayISO() : `${mk}-01`,
  };
  const locked = !isNew && isClosed(monthOf(d));
  const series = d.seriesId && state.series[d.seriesId];
  const typeList = series ? [d.type] : QUICK_TYPES;

  openSheet(`
    <h2>${isNew ? 'Nuovo movimento' : 'Modifica movimento'}</h2>
    ${locked ? '<p class="note warn">Questo mese è concluso: riaprilo per modificare i movimenti.</p>' : ''}
    ${series ? `<p class="note">Fa parte della voce pianificata «${esc(series.name)}»: la modifica vale solo per questo mese. Per cambiare più mesi usa la sezione Piano.</p>` : ''}
    <div class="chips" id="f-types">${typeList.map(k => `<button type="button" class="chip ${k === d.type ? 'on' : ''}" data-type="${k}">${TYPES[k].label}</button>`).join('')}</div>
    <label class="fld"><span>Importo (€)</span><input id="f-amt" class="amount" inputmode="decimal" autocomplete="off" placeholder="0,00" value="${amountInput(d.amount)}"></label>
    <div class="fld" id="f-catwrap"><span>Categoria</span><div class="chips" id="f-cats"></div></div>
    <label class="fld"><span>Descrizione</span><input id="f-desc" autocomplete="off" placeholder="Facoltativa" value="${esc(d.description)}"></label>
    <label class="fld"><span>Data</span><input id="f-date" type="date" value="${d.date}"></label>
    <div class="actions">
      ${!isNew && !locked ? '<button class="btn danger" id="f-del">Elimina</button><span class="spacer"></span>' : ''}
      <button class="btn" id="f-cancel">${locked ? 'Chiudi' : 'Annulla'}</button>
      ${locked ? '' : '<button class="btn primary" id="f-save">Salva</button>'}
    </div>`,
  s => {
    const catwrap = s.querySelector('#f-catwrap'), cats = s.querySelector('#f-cats');
    const syncCat = () => {
      catwrap.hidden = !CAT_TYPES.includes(d.type);
      if (!catwrap.hidden) {
        if (d.category && !catByName(d.category, d.type)) d.category = '';
        cats.innerHTML = catChips(d.type, d.category);
      }
    };
    syncCat();
    s.querySelector('#f-types').onclick = e => {
      const b = e.target.closest('[data-type]'); if (!b || locked) return;
      d.type = b.dataset.type;
      s.querySelectorAll('#f-types .chip').forEach(c => c.classList.toggle('on', c === b));
      syncCat();
    };
    cats.onclick = e => {
      const b = e.target.closest('[data-cat]'); if (!b || locked) return;
      d.category = b.dataset.cat;
      cats.querySelectorAll('.chip').forEach(c => c.classList.toggle('on', c === b));
    };
    s.querySelector('#f-cancel').onclick = closeSheet;
    if (locked) { s.querySelectorAll('input').forEach(i => { i.disabled = true; }); return; }
    if (isNew) s.querySelector('#f-amt').focus();

    const del = s.querySelector('#f-del');
    if (del) del.onclick = async () => {
      if (!(await ask('Eliminare il movimento?', `${esc(d.description || d.category || TYPES[d.type].label)} · ${fmt(d.amount)}`, 'Elimina', true))) { openTxSheet(tx); return; }
      state.tx = state.tx.filter(x => x.id !== tx.id); save(); render(); toast('Movimento eliminato');
    };
    s.querySelector('#f-save').onclick = () => {
      const amount = parseAmount(s.querySelector('#f-amt').value);
      const date = s.querySelector('#f-date').value;
      if (!Number.isFinite(amount) || amount === 0) return toast('Inserisci un importo valido');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return toast('Inserisci una data');
      if (isClosed(date.slice(0, 7))) return toast(`${mkLabel(date.slice(0, 7))} è concluso: riaprilo prima`);
      if (CAT_TYPES.includes(d.type) && !d.category) return toast('Scegli una categoria');
      const rec = {
        id: tx ? tx.id : uid(), type: d.type, amount, date,
        category: CAT_TYPES.includes(d.type) ? d.category : '',
        description: s.querySelector('#f-desc').value.trim(),
        seriesId: d.seriesId || null,
      };
      if (tx) state.tx = state.tx.map(x => (x.id === tx.id ? rec : x)); else state.tx.push(rec);
      save(); closeSheet();
      if (monthOf(rec) !== ui.month) ui.month = monthOf(rec);
      render(); toast(isNew ? 'Movimento aggiunto' : 'Modifica salvata');
    };
  });
}

async function closeMonth() {
  const mk = ui.month, t = totals(mk);
  const ok = await ask(`Concludere ${mkLabel(mk)}?`,
    `Gain/Loss <b>${fmt(t.gl)}</b> · Liquido <b>${fmt(t.gll)}</b>.<br>I valori diventano definitivi e i movimenti del mese non saranno più modificabili. Potrai sempre riaprire il mese.`,
    'Mese concluso');
  if (!ok) return;
  state.closed[mk] = { at: new Date().toISOString() };
  save(); render();
  const y = Number(mk.slice(0, 4));
  if (await ask(`Aggiornare l'archivio ${y}?`, `Esporta ora il file <b>Economics ${y}.xlsx</b> e salvalo su iCloud Drive, sostituendo quello precedente.`, 'Esporta')) exportXlsx(y);
}
async function reopenMonth() {
  const mk = ui.month;
  if (!(await ask(`Riaprire ${mkLabel(mk)}?`, 'Il Gain/Loss torna provvisorio finché non concludi di nuovo il mese.', 'Riapri'))) return;
  delete state.closed[mk]; save(); render();
}

/* ----- Vista Piano annuale ----- */
const seriesTx = id => state.tx.filter(t => t.seriesId === id).sort((a, b) => a.date.localeCompare(b.date));

function renderPlan(v) {
  const y = ui.planYear;
  const list = Object.values(state.series).filter(s => s.year === y);
  const prev = Object.values(state.series).filter(s => s.year === y - 1);
  const tot = k => sum(state.tx.filter(t => t.type === k && t.seriesId && t.date.startsWith(y + '-')), t => t.amount);
  const te = tot('entrata_ric'), ts = tot('spesa_ric'), ti = tot('invest');

  let h = `
    <div class="periodnav">
      <button class="iconbtn" data-act="plan-prev" aria-label="Anno precedente">‹</button>
      <div class="center"><div class="ptitle">${y}</div></div>
      <button class="iconbtn" data-act="plan-next" aria-label="Anno successivo">›</button>
    </div>
    <section class="card summary">
      <div class="lbl">Previsione annua delle voci pianificate</div>
      ${line('Stipendio ed entrate fisse', te)}
      ${line('Spese fisse', -ts)}
      ${line('Investimenti', -ti)}
      <div class="line"><b>Netto pianificato</b><b class="${valCls(te - ts - ti)}">${fmt(te - ts - ti)}</b></div>
    </section>`;

  for (const k of PLAN_TYPES) {
    const ss = list.filter(s => s.type === k).sort((a, b) => (a.category || '').localeCompare(b.category || '') || a.name.localeCompare(b.name));
    h += `<section class="card"><div class="sec-h"><h3>${TYPES[k].section}</h3></div>`;
    if (!ss.length) h += '<p class="empty">Nessuna voce</p>';
    for (const s of ss) {
      const tx = seriesTx(s.id);
      const amts = [...new Set(tx.map(t => t.amount))];
      const amtTxt = !tx.length ? '—' : amts.length === 1 ? `${fmt(amts[0])}/mese` : `da ${fmt(Math.min(...amts))} a ${fmt(Math.max(...amts))}`;
      const monthsTxt = tx.length === 12 ? 'Tutti i mesi' : tx.length ? tx.map(t => MONTHS[Number(t.date.slice(5, 7)) - 1]).join(', ') : 'Nessun mese';
      h += `<button class="series" data-act="edit-series" data-id="${s.id}">
        <span><span class="txname">${esc(s.name)}</span><span class="txsub">${s.category ? esc(s.category) + ' · ' : ''}${monthsTxt} · ${amtTxt}</span></span>
        <span class="txamt">${fmt(sum(tx, t => t.amount))}</span></button>`;
    }
    h += `<button class="addrow" data-act="add-series" data-type="${k}">+ Aggiungi</button></section>`;
  }
  if (prev.length) h += `<button class="btn block outline" data-act="copy-prev">Copia le voci dal ${y - 1}</button>`;
  h += `<p class="help">Ogni voce pianificata crea un movimento nei mesi scelti; ogni mese resta modificabile dalla vista Mese. Per una mensilità aggiuntiva (es. tredicesima) crea una voce a parte con il solo mese interessato.</p>`;
  v.innerHTML = h;
}

function openSeriesSheet(sid, presetType) {
  const y = ui.planYear;
  const s = sid ? state.series[sid] : null;
  const isNew = !s;
  const txs = s ? seriesTx(sid) : [];
  const present = new Set(txs.map(t => Number(t.date.slice(5, 7))));
  const lastAmt = txs.length ? txs[txs.length - 1].amount : null;
  const openMonths = Array.from({ length: 12 }, (_, i) => i + 1).filter(m => !isClosed(`${y}-${pad(m)}`));
  const defFrom = y === currentYear() ? (openMonths.find(m => m >= new Date().getMonth() + 1) || openMonths[0]) : openMonths[0];
  let type = s ? s.type : (presetType || 'entrata_ric');
  let category = s ? (s.category || '') : '';

  openSheet(`
    <h2>${isNew ? 'Nuova voce pianificata' : 'Modifica voce pianificata'} · ${y}</h2>
    ${isNew ? `<div class="chips" id="s-types">${PLAN_TYPES.map(k => `<button type="button" class="chip ${k === type ? 'on' : ''}" data-type="${k}">${TYPES[k].label}</button>`).join('')}</div>`
            : `<p class="note">${TYPES[type].label}</p>`}
    <label class="fld"><span>Descrizione</span><input id="s-name" autocomplete="off" placeholder="es. Stipendio, Mutuo, PAC" value="${esc(s ? s.name : '')}"></label>
    <div class="fld" id="s-catwrap"><span>Categoria</span><div class="chips" id="s-cats"></div></div>
    <label class="fld"><span>Importo mensile (€)</span><input id="s-amt" class="amount" inputmode="decimal" placeholder="0,00" value="${amountInput(lastAmt)}"></label>
    ${!isNew && openMonths.length ? `<label class="fld"><span>Se cambi l'importo, applicalo da</span><select id="s-from">${openMonths.map(m => `<option value="${m}" ${m === defFrom ? 'selected' : ''}>${MONTHS_LONG[m - 1]}</option>`).join('')}</select></label>` : ''}
    <div class="fld"><span>Mesi</span>
      <div class="chips" id="s-quick" style="margin-bottom:8px">
        <button type="button" class="chip" data-q="all">Tutti i 12</button>
        <button type="button" class="chip" data-q="odd">Gen, Mar, Mag…</button>
        <button type="button" class="chip" data-q="even">Feb, Apr, Giu…</button>
        <button type="button" class="chip" data-q="none">Nessuno</button>
      </div>
      <div class="monthgrid">
      ${MONTHS.map((n, i) => {
        const m = i + 1, closed = isClosed(`${y}-${pad(m)}`);
        const checked = isNew ? !closed : present.has(m);
        return `<label><input type="checkbox" value="${m}" ${checked ? 'checked' : ''} ${closed ? 'disabled' : ''}>${n}</label>`;
      }).join('')}
    </div></div>
    <label class="fld"><span>Giorno del mese</span><input id="s-day" type="number" inputmode="numeric" min="1" max="31" value="${s ? s.day : 1}"></label>
    ${openMonths.length < 12 ? '<p class="help">I mesi conclusi sono bloccati.</p>' : ''}
    <div class="actions">
      ${!isNew ? '<button class="btn danger" id="s-del">Elimina</button><span class="spacer"></span>' : ''}
      <button class="btn" id="s-cancel">Annulla</button>
      <button class="btn primary" id="s-save">Salva</button>
    </div>`,
  el => {
    const catwrap = el.querySelector('#s-catwrap'), cats = el.querySelector('#s-cats');
    const syncCat = () => {
      catwrap.hidden = !CAT_TYPES.includes(type);
      if (!catwrap.hidden) { if (category && !catByName(category, type)) category = ''; cats.innerHTML = catChips(type, category); }
    };
    syncCat();
    cats.onclick = e => {
      const b = e.target.closest('[data-cat]'); if (!b) return;
      category = b.dataset.cat;
      cats.querySelectorAll('.chip').forEach(c => c.classList.toggle('on', c === b));
    };
    const types = el.querySelector('#s-types');
    if (types) types.onclick = e => {
      const b = e.target.closest('[data-type]'); if (!b) return;
      type = b.dataset.type;
      types.querySelectorAll('.chip').forEach(c => c.classList.toggle('on', c === b));
      syncCat();
    };
    el.querySelector('#s-quick').onclick = e => {
      const b = e.target.closest('[data-q]'); if (!b) return;
      el.querySelectorAll('.monthgrid input:not(:disabled)').forEach(i => {
        const m = Number(i.value);
        i.checked = b.dataset.q === 'all' || (b.dataset.q === 'odd' && m % 2 === 1) || (b.dataset.q === 'even' && m % 2 === 0);
      });
    };
    el.querySelector('#s-cancel').onclick = closeSheet;
    const del = el.querySelector('#s-del');
    if (del) del.onclick = async () => {
      const ok = await ask(`Eliminare «${esc(s.name)}»?`, 'Verranno rimossi i movimenti di questa voce nei mesi non conclusi. Quelli dei mesi conclusi restano come storico.', 'Elimina', true);
      if (!ok) { openSeriesSheet(sid); return; }
      state.tx = state.tx.filter(t => !(t.seriesId === sid && !isClosed(monthOf(t))));
      state.tx.forEach(t => { if (t.seriesId === sid) t.seriesId = null; });
      delete state.series[sid];
      save(); render(); toast('Voce eliminata');
    };
    el.querySelector('#s-save').onclick = () => {
      const name = el.querySelector('#s-name').value.trim();
      const amount = parseAmount(el.querySelector('#s-amt').value);
      const day = Math.max(1, Math.min(31, parseInt(el.querySelector('#s-day').value, 10) || 1));
      const months = [...el.querySelectorAll('.monthgrid input:checked:not(:disabled)')].map(i => Number(i.value));
      if (!name) return toast('Inserisci una descrizione');
      if (CAT_TYPES.includes(type) && !category) return toast('Scegli una categoria');
      if (!Number.isFinite(amount) || amount <= 0) return toast('Inserisci un importo valido');
      const cat = CAT_TYPES.includes(type) ? category : '';

      if (isNew) {
        if (!months.length) return toast('Seleziona almeno un mese');
        const id = uid();
        state.series[id] = { id, year: y, type, name, category: cat, day };
        for (const m of months) state.tx.push({ id: uid(), type, amount, category: cat, description: name, date: dateFor(y, m, day), seriesId: id });
      } else {
        const fromSel = el.querySelector('#s-from');
        const from = fromSel ? Number(fromSel.value) : 13;
        const amountChanged = amount !== lastAmt;
        Object.assign(s, { name, day, category: cat });
        for (const m of openMonths) {
          const t = state.tx.find(x => x.seriesId === sid && x.date.startsWith(`${y}-${pad(m)}`));
          const want = months.includes(m);
          if (want && !t) state.tx.push({ id: uid(), type: s.type, amount, category: cat, description: name, date: dateFor(y, m, day), seriesId: sid });
          else if (!want && t) state.tx = state.tx.filter(x => x !== t);
          else if (want && t) {
            t.description = name; t.category = cat; t.date = dateFor(y, m, day);
            if (amountChanged && m >= from) t.amount = amount;
          }
        }
      }
      save(); closeSheet(); render(); toast('Piano aggiornato');
    };
  });
}

async function copyPrevYear() {
  const y = ui.planYear;
  const prev = Object.values(state.series).filter(s => s.year === y - 1);
  const already = new Set(Object.values(state.series).filter(s => s.year === y).map(s => s.type + '|' + s.name));
  const todo = prev.filter(s => !already.has(s.type + '|' + s.name));
  if (!todo.length) return toast(`Le voci del ${y - 1} sono già presenti`);
  if (!(await ask(`Copiare ${todo.length} voci dal ${y - 1}?`, "Ogni voce viene ricreata negli stessi mesi (esclusi quelli conclusi), con l'importo dell'ultimo mese dell'anno precedente. Potrai poi modificarle.", 'Copia'))) return;
  for (const p of todo) {
    const ptx = seriesTx(p.id);
    const last = ptx[ptx.length - 1];
    if (!last) continue;
    const months = new Set(ptx.map(t => Number(t.date.slice(5, 7))));
    const id = uid();
    state.series[id] = { id, year: y, type: p.type, name: p.name, category: p.category || '', day: p.day };
    for (const m of months) {
      if (isClosed(`${y}-${pad(m)}`)) continue;
      state.tx.push({ id: uid(), type: p.type, amount: last.amount, category: p.category || '', description: p.name, date: dateFor(y, m, p.day), seriesId: id });
    }
  }
  save(); render(); toast('Voci copiate');
}

/* ----- Vista Report ----- */
function dataYears() {
  const ys = new Set(state.tx.map(t => Number(t.date.slice(0, 4))));
  ys.add(currentYear());
  return [...ys].sort((a, b) => a - b);
}

function renderReport(v) {
  const y = ui.reportYear;
  const mks = yearMonths(y);
  const T = mks.map(totals);
  const A = k => sum(T, t => t[k]);
  const withData = T.filter(t => t.count > 0).length;
  const closedN = mks.filter(isClosed).length;
  const spese = A('spese');
  const cs = categoryStats(y).filter(r => r.total);
  const counted = cs.filter(r => !r.excluded).sort((a, b) => b.total - a.total);
  const pct = r => (r.excluded || !spese ? '—' : (r.total / spese * 100).toFixed(1).replace('.', ',') + '%');

  let h = `<div class="yearchips">${dataYears().map(yy => `<button class="chip ${yy === y ? 'on' : ''}" data-act="rep-year" data-y="${yy}">${yy}</button>`).join('')}</div>
    <p class="help">${closedN} mesi conclusi su 12${withData > closedN ? ' · i mesi non conclusi sono provvisori' : ''}</p>
    <div class="kgrid">
      <div class="card"><div class="lbl">Entrate</div><div class="big">${fmt(A('entrate'))}</div></div>
      <div class="card"><div class="lbl">Uscite</div><div class="big">${fmt(spese)}</div></div>
      <div class="card"><div class="lbl">Gain/Loss</div><div class="big ${valCls(A('gl'))}">${fmt(A('gl'))}</div></div>
      <div class="card"><div class="lbl">Gain/Loss liquido</div><div class="big ${valCls(A('gll'))}">${fmt(A('gll'))}</div></div>
      <div class="card"><div class="lbl">Investimenti</div><div class="big inv">${fmt(A('invest'))}</div></div>
      <div class="card"><div class="lbl">Liquido medio/mese</div><div class="big ${valCls(A('gll'))}">${fmt(withData ? Math.round(A('gll') / withData) : 0)}</div></div>
    </div>

    <section class="card"><h3>Entrate, uscite e investimenti</h3><div class="chartbox"><canvas id="c1"></canvas></div></section>
    <section class="card"><h3>Gain/Loss mensile e liquido cumulato</h3><div class="chartbox"><canvas id="c2"></canvas></div></section>

    <section class="card"><h3>Uscite per categoria</h3>
      ${cs.length ? `<div class="chartbox"><canvas id="c3"></canvas></div>
      <div class="tablewrap"><table><thead><tr><th>Categoria</th><th>Gruppo</th><th>Totale</th><th>Media/mese</th><th>% uscite</th></tr></thead><tbody>
      ${[...counted, ...cs.filter(r => r.excluded)].map(r => `<tr><td>${esc(r.name)}${r.excluded ? '<span class="tag">fuori calcolo</span>' : ''}</td><td>${r.type === 'spesa_ric' ? 'Fisse' : 'Spese'}</td><td>${fmt(r.total)}</td><td>${fmt(Math.round(r.total / Math.max(withData, 1)))}</td><td>${pct(r)}</td></tr>`).join('')}
      </tbody></table></div>` : '<p class="empty">Nessuna uscita</p>'}
    </section>

    <section class="card"><h3>Categorie mese per mese</h3>
      ${cs.length ? `<div class="tablewrap"><table><thead><tr><th>Categoria</th>${MONTHS.map(m => `<th>${m}</th>`).join('')}<th>Anno</th><th>%</th></tr></thead><tbody>
      ${cs.map(r => `<tr><td>${esc(r.label)}${r.excluded ? '<span class="tag">fuori calcolo</span>' : ''}</td>${r.months.map(c => `<td>${c ? fmt(c) : ''}</td>`).join('')}<td><b>${fmt(r.total)}</b></td><td>${pct(r)}</td></tr>`).join('')}
      <tr class="total"><td>Totale uscite</td>${T.map(t => `<td>${fmt(t.spese)}</td>`).join('')}<td>${fmt(spese)}</td><td>100%</td></tr>
      </tbody></table></div><p class="help">Scorri la tabella in orizzontale. Le categorie fuori calcolo non entrano nel totale uscite.</p>` : '<p class="empty">Nessuna uscita</p>'}
    </section>

    <section class="card"><h3>Prospetto ${y}</h3><div class="tablewrap"><table>
      <thead><tr><th>Mese</th><th>Entrate</th><th>Uscite</th><th>Gain/Loss</th><th>Invest.</th><th>Liquido</th><th></th></tr></thead><tbody>
      ${T.map((t, i) => `<tr><td>${MONTHS[i]}</td><td>${fmt(t.entrate)}</td><td>${fmt(t.spese)}</td><td class="${valCls(t.gl)}">${fmt(t.gl)}</td><td>${fmt(t.invest)}</td><td class="${valCls(t.gll)}">${fmt(t.gll)}</td><td>${isClosed(mks[i]) ? '✓' : ''}</td></tr>`).join('')}
      <tr class="total"><td>Totale</td><td>${fmt(A('entrate'))}</td><td>${fmt(spese)}</td><td class="${valCls(A('gl'))}">${fmt(A('gl'))}</td><td>${fmt(A('invest'))}</td><td class="${valCls(A('gll'))}">${fmt(A('gll'))}</td><td></td></tr>
      </tbody></table></div><p class="help">✓ = mese concluso</p></section>`;

  const years = dataYears();
  if (years.length > 1) {
    h += `<section class="card"><h3>Confronto tra anni</h3><div class="tablewrap"><table>
      <thead><tr><th>Anno</th><th>Entrate</th><th>Uscite</th><th>Gain/Loss</th><th>Invest.</th><th>Liquido</th></tr></thead><tbody>
      ${years.map(yy => { const TT = yearMonths(yy).map(totals); const S = k => sum(TT, t => t[k]);
        return `<tr><td>${yy}</td><td>${fmt(S('entrate'))}</td><td>${fmt(S('spese'))}</td><td class="${valCls(S('gl'))}">${fmt(S('gl'))}</td><td>${fmt(S('invest'))}</td><td class="${valCls(S('gll'))}">${fmt(S('gll'))}</td></tr>`; }).join('')}
      </tbody></table></div></section>`;
  }
  v.innerHTML = h;
  drawCharts(T, counted);
}

function drawCharts(T, catRows) {
  if (typeof Chart === 'undefined') {
    document.querySelectorAll('.chartbox').forEach(b => { b.outerHTML = '<p class="empty">Grafici non disponibili: apri l\'app una volta con la connessione attiva.</p>'; });
    return;
  }
  Chart.defaults.color = cssVar('--muted');
  Chart.defaults.borderColor = cssVar('--border');
  Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;
  const money = { callback: v => eur.format(v).replace(',00', '') };
  const tip = { callbacks: { label: c => `${c.dataset.label || c.label}: ${eur.format(c.parsed.y ?? c.parsed)}` } };
  const pos = cssVar('--pos'), neg = cssVar('--neg'), inv = cssVar('--inv'), acc = cssVar('--accent');
  const e = k => T.map(t => t[k] / 100);

  charts.push(new Chart(document.getElementById('c1'), {
    type: 'bar',
    data: { labels: MONTHS, datasets: [
      { label: 'Entrate', data: e('entrate'), backgroundColor: pos, borderRadius: 4 },
      { label: 'Uscite', data: e('spese'), backgroundColor: neg, borderRadius: 4 },
      { label: 'Investimenti', data: e('invest'), backgroundColor: inv, borderRadius: 4 },
    ] },
    options: { maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { boxWidth: 10 } }, tooltip: tip }, scales: { y: { ticks: money }, x: { grid: { display: false } } } },
  }));

  let run = 0;
  const cum = T.map(t => (run += t.gll) / 100);
  charts.push(new Chart(document.getElementById('c2'), {
    data: { labels: MONTHS, datasets: [
      { type: 'bar', label: 'Gain/Loss', data: e('gl'), backgroundColor: e('gl').map(v => (v >= 0 ? pos : neg)), borderRadius: 4, order: 2 },
      { type: 'bar', label: 'Liquido', data: e('gll'), backgroundColor: e('gll').map(v => (v >= 0 ? pos + '88' : neg + '88')), borderRadius: 4, order: 2 },
      { type: 'line', label: 'Liquido cumulato', data: cum, borderColor: acc, backgroundColor: acc, tension: .3, pointRadius: 2, order: 1 },
    ] },
    options: { maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { boxWidth: 10 } }, tooltip: tip }, scales: { y: { ticks: money }, x: { grid: { display: false } } } },
  }));

  const c3 = document.getElementById('c3');
  if (c3 && catRows.length) charts.push(new Chart(c3, {
    type: 'doughnut',
    data: { labels: catRows.map(r => r.label), datasets: [{ data: catRows.map(r => r.total / 100), backgroundColor: catRows.map((_, i) => PALETTE[i % PALETTE.length]), borderColor: cssVar('--surface'), borderWidth: 2 }] },
    options: { maintainAspectRatio: false, cutout: '58%', plugins: { legend: { position: 'right', labels: { boxWidth: 10 } }, tooltip: { callbacks: { label: c => `${c.label}: ${eur.format(c.parsed)}` } } } },
  }));
}

/* ----- Vista Impostazioni ----- */
function isStandalone() { return window.navigator.standalone === true || matchMedia('(display-mode: standalone)').matches; }

function catSection(key, title, help) {
  const list = listByKey(key);
  const type = key === 'fixed' ? 'spesa_ric' : 'spesa_var';
  const used = n => state.tx.filter(t => t.type === type && t.category === n).length;
  return `<section class="card"><h3>${title}</h3>${help ? `<p class="help">${help}</p>` : ''}
    ${list.map((c, i) => `<div class="catrow">
      <button class="name" data-act="cat-rename" data-list="${key}" data-i="${i}">${esc(c.name)} <small class="txsub" style="display:inline">${used(c.name) ? '· ' + used(c.name) + ' mov.' : ''}</small></button>
      ${key === 'var' ? `<label class="switch"><input type="checkbox" data-chg="cat-excl" data-i="${i}" ${c.excluded ? 'checked' : ''}>fuori calcolo</label>` : ''}
      <button class="x" data-act="cat-delete" data-list="${key}" data-i="${i}" aria-label="Elimina ${esc(c.name)}">×</button></div>`).join('')}
    <div class="addcat"><input id="newcat-${key}" placeholder="Nuova categoria" autocomplete="off"><button class="btn primary" data-act="cat-add" data-list="${key}">Aggiungi</button></div>
  </section>`;
}

function renderSettings(v) {
  const years = dataYears();
  if (!years.includes(ui.exportYear)) ui.exportYear = years[years.length - 1];
  v.innerHTML = `
    ${isStandalone() ? '' : `<section class="card"><h3>Installa sull'iPhone</h3><div class="help"><ol>
      <li>Apri questa pagina in <b>Safari</b>.</li><li>Tocca <b>Condividi</b> → <b>Aggiungi alla schermata Home</b>.</li>
      <li>Usa sempre l'icona sulla Home: i dati inseriti nella scheda di Safari restano separati da quelli dell'app installata.</li></ol></div></section>`}

    <section class="card"><h3>Archivio Numbers</h3>
      <p class="help">Un file per anno (<b>Economics ${ui.exportYear}.xlsx</b>) con i fogli Stipendio, Altri introiti, Spese, Spese fisse, Investimenti, Prospetto e Prospetto categorie. Salvalo su iCloud Drive e aprilo con Numbers.</p>
      <label class="fld"><span>Anno da esportare</span><select data-chg="export-year">${years.map(y => `<option value="${y}" ${y === ui.exportYear ? 'selected' : ''}>${y}</option>`).join('')}</select></label>
      <button class="btn block primary" data-act="export">Esporta ${ui.exportYear}</button>
      <button class="btn block" data-act="import">Importa da file .xlsx</button>
      <p class="help">L'import sostituisce solo gli anni contenuti nel file; gli altri anni restano invariati. Funziona con i file esportati dall'app e con il tuo file Numbers storico, esportato da Numbers in formato Excel.</p>
      <p class="help">${state.lastExport ? 'Ultimo export: ' + fmtDate(state.lastExport) : 'Nessun export ancora effettuato.'} · ${state.tx.length} movimenti salvati</p>
    </section>

    ${catSection('var', 'Categorie delle spese', '"Fuori calcolo": la categoria compare nei report ma non entra nel Gain/Loss.')}
    ${catSection('fixed', 'Categorie delle spese fisse', '')}

    <section class="card"><h3>Dati</h3>
      <p class="help" id="persist">I dati restano solo su questo dispositivo.</p>
      <button class="btn block danger" data-act="wipe">Cancella tutti i dati</button>
    </section>`;
  if (navigator.storage && navigator.storage.persisted) {
    navigator.storage.persisted().then(p => {
      const el = document.getElementById('persist');
      if (el) el.textContent = `I dati restano solo su questo dispositivo. Archiviazione persistente: ${p ? 'sì' : 'non garantita, esporta regolarmente'}.`;
    }).catch(() => {});
  }
}

function renameCategory(key, i) {
  const list = listByKey(key), c = list[i];
  const type = key === 'fixed' ? 'spesa_ric' : 'spesa_var';
  openSheet(`<h2>Rinomina categoria</h2>
    <label class="fld"><span>Nome</span><input id="r-name" value="${esc(c.name)}" autocomplete="off"></label>
    <div class="actions"><button class="btn" id="r-cancel">Annulla</button><button class="btn primary" id="r-save">Salva</button></div>`,
  s => {
    s.querySelector('#r-cancel').onclick = closeSheet;
    s.querySelector('#r-save').onclick = () => {
      const n = s.querySelector('#r-name').value.trim();
      if (!n) return toast('Inserisci un nome');
      if (n !== c.name && list.some(x => x.name === n)) return toast('Esiste già una categoria con questo nome');
      state.tx.forEach(t => { if (t.type === type && t.category === c.name) t.category = n; });
      Object.values(state.series).forEach(x => { if (x.type === type && x.category === c.name) x.category = n; });
      c.name = n; save(); closeSheet(); render();
    };
  });
}
async function deleteCategory(key, i) {
  const list = listByKey(key), c = list[i];
  const type = key === 'fixed' ? 'spesa_ric' : 'spesa_var';
  const n = state.tx.filter(t => t.type === type && t.category === c.name).length;
  if (n && c.name === 'Altro') return toast('"Altro" è in uso e non può essere eliminata');
  const ok = await ask(`Eliminare «${esc(c.name)}»?`, n ? `I ${n} movimenti di questa categoria passeranno ad "Altro".` : 'La categoria non è usata da nessun movimento.', 'Elimina', true);
  if (!ok) return;
  if (n) {
    if (!list.some(x => x.name === 'Altro')) list.push(key === 'fixed' ? { name: 'Altro' } : { name: 'Altro', excluded: false });
    state.tx.forEach(t => { if (t.type === type && t.category === c.name) t.category = 'Altro'; });
    Object.values(state.series).forEach(x => { if (x.type === type && x.category === c.name) x.category = 'Altro'; });
  }
  list.splice(list.indexOf(c), 1);
  save(); render();
}

/* ---------- Export Excel (un file per anno) ---------- */
async function saveFile(blob, filename) {
  const file = new File([blob], filename, { type: blob.type });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file] }); return true; }
    catch (err) { if (err.name === 'AbortError') return false; }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = filename;
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
  return true;
}

// Data ISO → numero seriale Excel (indipendente dal fuso orario)
const excelSerial = ymd => { const [y, m, d] = ymd.split('-').map(Number); return (Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86400000; };
const euro = c => Math.round(c) / 100;

/* Crea un foglio: headers + righe (array di array). fmts: {colIndex: formato numerico} */
function makeSheet(headers, rows, fmts = {}, widths = []) {
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  for (let r = 1; r <= rows.length; r++) {
    for (const [c, z] of Object.entries(fmts)) {
      const cell = ws[XLSX.utils.encode_cell({ r, c: Number(c) })];
      if (cell && cell.t === 'n') cell.z = z;
    }
  }
  ws['!cols'] = widths.map(w => ({ wch: w }));
  return ws;
}
const F_DATE = 'dd/mm/yyyy', F_MONTH = 'mmmm yyyy', F_EUR = '#,##0.00 "€"', F_PCT = '0.0%';

function buildWorkbook(y) {
  const wb = XLSX.utils.book_new();
  const txY = type => state.tx.filter(t => t.type === type && t.date.startsWith(y + '-')).sort((a, b) => a.date.localeCompare(b.date) || (a.category || '').localeCompare(b.category || ''));

  XLSX.utils.book_append_sheet(wb, makeSheet(['Mese', 'Importo', 'Descrizione'],
    txY('entrata_ric').map(t => [excelSerial(t.date), euro(t.amount), t.description || 'Stipendio']),
    { 0: F_MONTH, 1: F_EUR }, [16, 12, 26]), 'Stipendio');

  XLSX.utils.book_append_sheet(wb, makeSheet(['Data', 'Importo', 'Descrizione'],
    txY('entrata_extra').map(t => [excelSerial(t.date), euro(t.amount), t.description]),
    { 0: F_DATE, 1: F_EUR }, [12, 12, 30]), 'Altri introiti');

  XLSX.utils.book_append_sheet(wb, makeSheet(['Data', 'Importo', 'Categoria', 'Descrizione'],
    txY('spesa_var').map(t => [excelSerial(t.date), euro(t.amount), t.category, t.description]),
    { 0: F_DATE, 1: F_EUR }, [12, 12, 22, 30]), 'Spese');

  XLSX.utils.book_append_sheet(wb, makeSheet(['Mese', 'Importo', 'Categoria', 'Descrizione'],
    txY('spesa_ric').map(t => [excelSerial(t.date), euro(t.amount), t.category, t.description]),
    { 0: F_MONTH, 1: F_EUR }, [16, 12, 16, 30]), 'Spese fisse');

  XLSX.utils.book_append_sheet(wb, makeSheet(['Mese', 'Importo', 'Descrizione'],
    txY('invest').map(t => [excelSerial(t.date), euro(t.amount), t.description || 'Investimenti']),
    { 0: F_MONTH, 1: F_EUR }, [16, 12, 26]), 'Investimenti');

  // Prospetto: Gain/Loss mostrato solo per i mesi chiusi
  const mks = yearMonths(y), T = mks.map(totals);
  const pRows = mks.map((mk, i) => {
    const t = T[i], c = isClosed(mk);
    return [excelSerial(mk + '-01'), euro(t.entrate), euro(t.spese), c ? euro(t.gl) : '', euro(t.invest), c ? euro(t.gll) : '', c ? 'Sì' : 'No'];
  });
  const closedT = T.filter((_, i) => isClosed(mks[i]));
  pRows.push(['Totale', euro(sum(T, t => t.entrate)), euro(sum(T, t => t.spese)), euro(sum(closedT, t => t.gl)), euro(sum(T, t => t.invest)), euro(sum(closedT, t => t.gll)), `${closedT.length}/12`]);
  XLSX.utils.book_append_sheet(wb, makeSheet(['Mese', 'Entrate', 'Uscite', 'Gain/Loss', 'Investimenti', 'Gain/Loss liquido', 'Mese chiuso'],
    pRows, { 0: F_MONTH, 1: F_EUR, 2: F_EUR, 3: F_EUR, 4: F_EUR, 5: F_EUR }, [16, 12, 12, 12, 12, 16, 11]), 'Prospetto');

  // Prospetto categorie: categorie × mesi, totale anno e % sulle uscite
  const spese = sum(T, t => t.spese);
  const cs = categoryStats(y).filter(r => r.total);
  const cRows = cs.map(r => [r.type === 'spesa_ric' ? 'Spese fisse' : 'Spese', r.name, ...r.months.map(c => (c ? euro(c) : '')), euro(r.total), r.excluded ? 'fuori calcolo' : (spese ? r.total / spese : 0)]);
  cRows.push(['Totale uscite', '', ...T.map(t => euro(t.spese)), euro(spese), spese ? 1 : 0]);
  const cf = { 14: F_EUR, 15: F_PCT }; for (let c = 2; c < 14; c++) cf[c] = F_EUR;
  XLSX.utils.book_append_sheet(wb, makeSheet(['Gruppo', 'Categoria', ...MONTHS, 'Totale anno', '% uscite'],
    cRows, cf, [12, 22, ...Array(12).fill(10), 12, 9]), 'Prospetto categorie');

  // Categorie (impostazioni dell'app, per un ripristino completo)
  XLSX.utils.book_append_sheet(wb, makeSheet(['Gruppo', 'Categoria', 'Fuori calcolo'],
    [...state.cats.map(c => ['Spese', c.name, c.excluded ? 'Sì' : 'No']), ...state.catsFixed.map(c => ['Spese fisse', c.name, 'No'])],
    {}, [12, 22, 13]), 'Categorie');
  return wb;
}

async function exportXlsx(y = ui.exportYear) {
  if (typeof XLSX === 'undefined') return toast("Libreria Excel non caricata: apri l'app una volta con la connessione attiva");
  const out = XLSX.write(buildWorkbook(y), { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  if (await saveFile(blob, `Economics ${y}.xlsx`)) {
    state.lastExport = new Date().toISOString(); save();
    if (ui.tab === 'impostazioni') render();
  }
}

/* ---------- Import Excel (tollerante) ----------
   Cerca le tabelle in tutti i fogli in base alle intestazioni (Data/Mese + Importo),
   anche con titoli sopra o più tabelle nello stesso foglio, e le classifica
   in base al nome del foglio o al titolo della tabella. */
const norm = s => String(s ?? '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const COLS = {
  date: ['data', 'mese', 'giorno'],
  amount: ['importo', 'valore', 'ammontare', 'euro'],
  category: ['categoria'],
  desc: ['descrizione', 'descrittivo', 'causale', 'note', 'nota', 'dettaglio'],
  closed: ['mese chiuso', 'chiuso', 'concluso', 'conferma', 'stato'],
  invest: ['investimenti', 'investimento'],
};
function colIndex(hdr, key) {
  let i = hdr.findIndex(h => COLS[key].includes(h));
  if (i < 0) i = hdr.findIndex(h => h && COLS[key].some(w => h.startsWith(w)));
  return i;
}
const isBlankRow = r => !r || r.every(v => v === '' || v == null);
// Riga-titolo: solo testo, al massimo 2 celle piene (es. "Spese fisse")
const isTitleRow = r => { const f = (r || []).filter(v => v !== '' && v != null); return f.length > 0 && f.length <= 2 && f.every(v => typeof v === 'string'); };

function findTables(ws, sheetName) {
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' });
  const tables = [];
  const isHeader = r => {
    const h = r.map(norm);
    return colIndex(h, 'date') >= 0 && (colIndex(h, 'amount') >= 0 || colIndex(h, 'closed') >= 0 || colIndex(h, 'invest') >= 0 || h.some(x => x.startsWith('entrate') || x.startsWith('gain')));
  };
  for (let i = 0; i < rows.length; i++) {
    if (!isHeader(rows[i])) continue;
    const hdr = rows[i].map(norm);
    // Titolo: fino a 2 righe sopra con solo testo (max 2 celle piene)
    const title = rows.slice(Math.max(0, i - 2), i).filter(isTitleRow).flat().join(' ');
    const data = []; let blanks = 0, j = i + 1;
    for (; j < rows.length; j++) {
      if (isHeader(rows[j])) break;
      if (isBlankRow(rows[j])) { if (++blanks >= 3) break; continue; }
      blanks = 0; data.push(rows[j]);
    }
    tables.push({ sheet: sheetName, title, hdr, rows: data, indexInSheet: tables.length });
    i = j - 1;
  }
  return tables;
}

function classify(t) {
  const name = norm(t.sheet), title = norm(t.title);
  if (/prospetto|riepilogo|riassunt/.test(name + ' ' + title) || t.hdr.some(h => h.startsWith('gain') || h.startsWith('entrate'))) return 'prospetto';
  const kw = s => (/invest/.test(s) ? 'invest' : /fiss|ricorr/.test(s) ? 'spesa_ric' : /stipend/.test(s) ? 'entrata_ric'
    : /introit|extra|altre entrate/.test(s) ? 'entrata_extra' : /spes|uscit/.test(s) ? 'spesa_var' : null);
  return kw(title) || kw(name) || (/entrat/.test(name + ' ' + title) ? (t.indexInSheet === 0 ? 'entrata_ric' : 'entrata_extra') : null);
}

function normDate(v, fallbackYear) {
  if (v instanceof Date) return `${v.getFullYear()}-${pad(v.getMonth() + 1)}-${pad(v.getDate())}`;
  if (typeof v === 'number') { if (v < 1) return null; const d = XLSX.SSF.parse_date_code(v); return d ? `${d.y}-${pad(d.m)}-${pad(d.d)}` : null; }
  const s = norm(v);
  if (!s) return null;
  let m = s.match(/^(\d{4})-(\d{1,2})(?:-(\d{1,2}))?/);
  if (m) return `${m[1]}-${pad(m[2])}-${pad(m[3] || 1)}`;
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (m) return `${m[3].length === 2 ? '20' + m[3] : m[3]}-${pad(m[2])}-${pad(m[1])}`;
  m = s.match(/^(\d{1,2})[/.-](\d{4})$/);
  if (m) return `${m[2]}-${pad(m[1])}-01`;
  const mi = MONTHS_LONG.findIndex(n => s.startsWith(norm(n).slice(0, 3)));
  if (mi >= 0) { const yy = (s.match(/(\d{4})/) || [])[1] || fallbackYear; if (yy) return `${yy}-${pad(mi + 1)}-01`; }
  return null;
}
const toCents = v => (typeof v === 'number' ? Math.round(v * 100) : parseAmount(v));
const truthy = v => v === true || v === 1 || /^(si|s|x|✓|✔|true|vero|chiuso|concluso|ok|yes)$/.test(norm(v));

function parseWorkbook(wb) {
  const tables = wb.SheetNames.flatMap(n => findTables(wb.Sheets[n], n));
  const out = { tx: [], closed: {}, cats: null, skipped: [] };
  const recognized = [];
  const pros = [];
  for (const t of tables) {
    const kind = classify(t);
    if (!kind) continue;
    if (kind === 'prospetto') { pros.push(t); continue; }
    recognized.push(`${t.sheet}${t.title ? ' / ' + t.title : ''} → ${TYPES[kind].section}`);
    const di = colIndex(t.hdr, 'date'), ai = colIndex(t.hdr, 'amount'), ci = colIndex(t.hdr, 'category'), dsi = colIndex(t.hdr, 'desc');
    t.rows.forEach((r, k) => {
      const date = normDate(r[di]);
      const amount = Math.abs(toCents(r[ai]));
      if (!date || !Number.isFinite(amount) || amount === 0) {
        if (!isBlankRow(r) && !isTitleRow(r) && !/^totale/.test(norm(r[di]))) out.skipped.push(`${t.sheet} riga ${k + 1}`);
        return;
      }
      const category = CAT_TYPES.includes(kind) ? (String(ci >= 0 ? r[ci] : '').trim() || 'Altro') : '';
      let description = dsi >= 0 ? String(r[dsi] ?? '').trim() : '';
      if (!description && kind === 'entrata_ric') description = 'Stipendio';
      if (!description && kind === 'invest') description = 'Investimenti';
      if (!description && kind === 'spesa_ric') description = category;
      out.tx.push({ id: uid(), type: kind, amount, date, category, description, seriesId: null });
    });
  }
  // Anno di riferimento (per mesi scritti come "Gennaio")
  const yc = {}; out.tx.forEach(t => { const y = t.date.slice(0, 4); yc[y] = (yc[y] || 0) + 1; });
  const mainYear = Object.entries(yc).sort((a, b) => b[1] - a[1])[0]?.[0];

  const hasInvest = out.tx.some(t => t.type === 'invest');
  for (const p of pros) {
    const mi = colIndex(p.hdr, 'date'), ci = colIndex(p.hdr, 'closed'), ii = colIndex(p.hdr, 'invest');
    if (ci >= 0 || (ii >= 0 && !hasInvest)) recognized.push(`${p.sheet} → mesi chiusi${ii >= 0 && !hasInvest ? ' e investimenti' : ''}`);
    p.rows.forEach(r => {
      const d = normDate(r[mi], mainYear); if (!d) return;
      const mk = d.slice(0, 7);
      if (ci >= 0 && truthy(r[ci])) out.closed[mk] = { at: new Date().toISOString() };
      if (ii >= 0 && !hasInvest) {
        const a = Math.abs(toCents(r[ii]));
        if (Number.isFinite(a) && a) out.tx.push({ id: uid(), type: 'invest', amount: a, date: mk + '-01', category: '', description: 'Investimenti', seriesId: null });
      }
    });
  }
  // Foglio Categorie (export dell'app)
  const cws = wb.SheetNames.find(n => norm(n) === 'categorie');
  if (cws) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[cws], { defval: '' });
    out.cats = { var: [], fixed: [] };
    rows.forEach(r => {
      const n = String(r['Categoria'] || '').trim(); if (!n) return;
      if (/fiss/.test(norm(r['Gruppo']))) out.cats.fixed.push({ name: n });
      else out.cats.var.push({ name: n, excluded: truthy(r['Fuori calcolo']) });
    });
  }
  // Ricostruisce le voci pianificate: stesso anno + tipo + descrizione + categoria
  const series = {};
  out.tx.filter(t => PLAN_TYPES.includes(t.type)).forEach(t => {
    const key = [t.date.slice(0, 4), t.type, t.description, t.category].join('|');
    if (!series[key]) series[key] = { id: uid(), year: Number(t.date.slice(0, 4)), type: t.type, name: t.description, category: t.category, day: Number(t.date.slice(8, 10)) };
    t.seriesId = series[key].id;
  });
  out.series = Object.values(series);
  out.years = [...new Set([...out.tx.map(t => t.date.slice(0, 4)), ...Object.keys(out.closed).map(k => k.slice(0, 4))])].sort();
  out.recognized = recognized;
  return out;
}

async function importXlsx(file) {
  if (typeof XLSX === 'undefined') return toast("Libreria Excel non caricata: apri l'app una volta con la connessione attiva");
  try {
    const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
    const r = parseWorkbook(wb);
    if (!r.tx.length) throw new Error('nessuna tabella riconosciuta (servono colonne Data/Mese e Importo)');
    const yrs = r.years.join(', ');
    const current = state.tx.filter(t => r.years.includes(t.date.slice(0, 4))).length;
    const ok = await ask(`Importare ${yrs}?`,
      `Trovati <b>${r.tx.length}</b> movimenti, ${r.series.length} voci pianificate e ${Object.keys(r.closed).length} mesi chiusi.<br>
       <small>${r.recognized.map(esc).join('<br>')}</small><br>
       I dati attuali di ${yrs} (${current} movimenti) verranno sostituiti; gli altri anni restano invariati.
       ${r.skipped.length ? `<br>Righe ignorate perché incomplete: ${r.skipped.slice(0, 8).map(esc).join(', ')}${r.skipped.length > 8 ? '…' : ''}` : ''}`,
      'Importa', true);
    if (!ok) return;
    const inYears = d => r.years.includes(d.slice(0, 4));
    state.tx = state.tx.filter(t => !inYears(t.date)).concat(r.tx);
    Object.keys(state.series).forEach(id => { if (r.years.includes(String(state.series[id].year))) delete state.series[id]; });
    r.series.forEach(s => { state.series[s.id] = s; });
    Object.keys(state.closed).forEach(mk => { if (inYears(mk)) delete state.closed[mk]; });
    Object.assign(state.closed, r.closed);
    if (r.cats && r.cats.var.length) state.cats = r.cats.var;
    if (r.cats && r.cats.fixed.length) state.catsFixed = r.cats.fixed;
    // Categorie presenti nei dati ma non in elenco
    for (const t of r.tx) {
      if (!CAT_TYPES.includes(t.type)) continue;
      const list = catList(t.type);
      if (!list.some(c => c.name === t.category)) list.push(t.type === 'spesa_ric' ? { name: t.category } : { name: t.category, excluded: false });
    }
    save(); render(); toast('Dati importati');
  } catch (err) {
    console.error(err);
    toast('Import non riuscito: ' + (err.message || 'file non valido'));
  }
}

/* ---------- Eventi ---------- */
const ACTIONS = {
  prev: () => { ui.month = shiftMonth(ui.month, -1); render(); },
  next: () => { ui.month = shiftMonth(ui.month, 1); render(); },
  today: () => { ui.month = currentMonthKey(); render(); },
  edit: el => { const t = state.tx.find(x => x.id === el.dataset.id); if (t) openTxSheet(t); },
  add: el => openTxSheet(null, el.dataset.type),
  'close-month': closeMonth,
  reopen: reopenMonth,
  'plan-prev': () => { ui.planYear--; render(); },
  'plan-next': () => { ui.planYear++; render(); },
  'add-series': el => openSeriesSheet(null, el.dataset.type),
  'edit-series': el => openSeriesSheet(el.dataset.id),
  'copy-prev': copyPrevYear,
  'rep-year': el => { ui.reportYear = Number(el.dataset.y); render(); },
  'cat-rename': el => renameCategory(el.dataset.list, Number(el.dataset.i)),
  'cat-delete': el => deleteCategory(el.dataset.list, Number(el.dataset.i)),
  'cat-add': el => {
    const key = el.dataset.list, list = listByKey(key);
    const inp = document.getElementById('newcat-' + key); const n = inp.value.trim();
    if (!n) return toast('Inserisci un nome');
    if (list.some(c => c.name === n)) return toast('Categoria già presente');
    list.push(key === 'fixed' ? { name: n } : { name: n, excluded: false }); save(); render();
  },
  export: () => exportXlsx(ui.exportYear),
  import: () => document.getElementById('importFile').click(),
  wipe: async () => {
    if (!(await ask('Cancellare tutti i dati?', "Movimenti, piano, categorie e mesi conclusi verranno eliminati da questo dispositivo. L'operazione non si può annullare: esporta prima l'archivio.", 'Cancella tutto', true))) return;
    state = emptyState(); save(); render(); toast('Dati cancellati');
  },
};

const view = document.getElementById('view');
view.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (el && ACTIONS[el.dataset.act]) ACTIONS[el.dataset.act](el, e);
});
view.addEventListener('change', e => {
  const ex = e.target.closest('[data-chg="cat-excl"]');
  if (ex) { state.cats[Number(ex.dataset.i)].excluded = ex.checked; save(); }
  const ey = e.target.closest('[data-chg="export-year"]');
  if (ey) { ui.exportYear = Number(ey.value); render(); }
});
view.addEventListener('keydown', e => {
  if (e.key === 'Enter' && e.target.id && e.target.id.startsWith('newcat-')) ACTIONS['cat-add'](e.target.nextElementSibling);
});
document.getElementById('importFile').addEventListener('change', e => {
  const f = e.target.files[0]; e.target.value = '';
  if (f) importXlsx(f);
});
document.querySelector('.tabbar').addEventListener('click', e => {
  const b = e.target.closest('[data-tab]'); if (!b) return;
  ui.tab = b.dataset.tab; render(true);
});
document.getElementById('fab').addEventListener('click', () => openTxSheet(null));
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (ui.tab === 'report') render(); });

/* ---------- Avvio ---------- */
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register('sw.js').catch(err => console.warn('SW', err));
}
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
render();
