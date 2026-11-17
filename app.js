/* Popis Magacin – web aplikacija (PWA). Radi offline, instalira se na početni ekran telefona. */
'use strict';
(function () {
  const APP_VERSION = '8';

// ═════════════════════════════════════════════════════════════ UVOZ (XLSX, XLS, XML, CSV)

const CYR = {
  'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'ђ': 'dj', 'е': 'e', 'ж': 'z', 'з': 'z', 'и': 'i', 'ј': 'j',
  'к': 'k', 'л': 'l', 'љ': 'lj', 'м': 'm', 'н': 'n', 'њ': 'nj', 'о': 'o', 'п': 'p', 'р': 'r', 'с': 's', 'т': 't',
  'ћ': 'c', 'у': 'u', 'ф': 'f', 'х': 'h', 'ц': 'c', 'ч': 'c', 'џ': 'dz', 'ш': 's', 'đ': 'dj'
};
const ALIASES = {
  sifra: ['sifra', 'sif', 'sifraartikla', 'sifraartikal', 'sifartikla', 'artikalsifra', 'code', 'kod', 'sku', 'id', 'sifraproizvoda', 'sifraroba'],
  naziv: ['naziv', 'nazivartikla', 'nazivartikal', 'artikal', 'artikl', 'name', 'opis', 'nazivroba', 'roba', 'description', 'nazivproizvoda', 'proizvod'],
  barkod: ['barkod', 'barcode', 'bar', 'ean', 'ean13', 'barkodartikla', 'upc', 'bkod'],
  kolicina: ['kolicina', 'kol', 'qty', 'quantity', 'stanje', 'zaliha', 'kolic', 'komada', 'kom', 'knjigovodstveno', 'knjigovodstvenostanje'],
  popisano: ['popisano', 'popisanakolicina', 'popisanakol', 'popis', 'brojano', 'counted', 'stvarno', 'stvarnostanje', 'stvarnakolicina']
};
const ALIAS_TO_FIELD = {};
for (const f of Object.keys(ALIASES)) for (const a of ALIASES[f]) ALIAS_TO_FIELD[a] = f;

function norm(text) {
  let s = String(text == null ? '' : text).trim().toLowerCase();
  let out = '';
  for (const ch of s) out += (CYR[ch] !== undefined ? CYR[ch] : ch);
  return out.normalize('NFD').replace(/[^a-z0-9]/g, '');
}

function cellText(v) {
  if (v == null) return '';
  if (typeof v === 'boolean') return String(v);
  if (typeof v === 'number') {
    if (!isFinite(v)) return '';
    if (Number.isInteger(v) && Math.abs(v) < 1e15) return String(v);
    return String(v);
  }
  if (v instanceof Date) return '';
  return String(v).trim();
}

const SCI = /^\d+(\.\d+)?[eE][+-]?\d+$/;
const DOTZERO = /^(\d+)\.0+$/;
function fixBarcode(s) {
  s = (s || '').trim();
  if (SCI.test(s)) {
    const n = Number(s);
    return Number.isSafeInteger(n) ? String(n) : s;
  }
  const m = DOTZERO.exec(s);
  return m ? m[1] : s;
}

function toNumber(v) {
  if (v == null) return 0;
  if (typeof v === 'number') return v;
  let s = String(v).trim().replace(/ /g, '').replace(/ /g, '');
  if (!s) return 0;
  if (s.includes(',') && s.includes('.')) {
    s = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else if (s.includes(',')) {
    s = s.replace(',', '.');
  }
  const n = Number(s);
  return isFinite(n) ? n : 0;
}
const isNumeric = (v) => /^-?\d+([.,]\d+)?$/.test(String(v == null ? '' : v).trim());

function mapHeader(row) {
  const m = {};
  row.forEach((c, i) => {
    const f = ALIAS_TO_FIELD[norm(c)];
    if (f && !(f in m)) m[f] = i;
  });
  return m;
}

function rowsToRecords(rows) {
  let headerIdx = -1, mapping = {};
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const m = mapHeader(rows[i]);
    if (Object.keys(m).length >= 2) { headerIdx = i; mapping = m; break; }
  }
  let start;
  if (headerIdx < 0) {
    mapping = { sifra: 0, naziv: 1, barkod: 2, kolicina: 3 };
    start = (rows.length && rows[0].length > 3 && cellText(rows[0][3]) && !isNumeric(rows[0][3])) ? 1 : 0;
  } else {
    start = headerIdx + 1;
  }
  const records = [];
  for (const r of rows.slice(start)) {
    const rec = {};
    for (const f of Object.keys(mapping)) rec[f] = mapping[f] < r.length ? cellText(r[mapping[f]]) : '';
    records.push(rec);
  }
  return { records, hasHeader: headerIdx >= 0 };
}

function buildResult(records, fmt) {
  const items = [];
  let noBarcode = 0;
  for (const r of records) {
    const sifra = (r.sifra || '').trim();
    const naziv = (r.naziv || '').trim();
    const barkod = fixBarcode(r.barkod || '');
    if (!sifra && !naziv && !barkod) continue;
    items.push({ sifra, naziv, barkod, kolicina: toNumber(r.kolicina), popisano: 0, scanned: false, unknown: false, added: [] });
    if (!barkod) noBarcode++;
  }
  if (!items.length) throw new Error('Nisu pronađeni artikli. Provjerite da fajl ima kolone: ŠIFRA, NAZIV, BARKOD, KOLIČINA.');
  const warnings = [];   // artikli bez barkoda su dozvoljeni: barkod im se može dodijeliti pri skeniranju
  if (noBarcode === items.length) warnings.push('Tabela nema barkodova. Barkod možete dodijeliti šifri kad skenirate artikal.');
  else if (noBarcode) warnings.push(noBarcode + ' artikala nema barkod. Barkod im možete dodijeliti skeniranjem.');
  const seen = new Set(), dups = new Set();
  for (const it of items) if (it.barkod) { if (seen.has(it.barkod)) dups.add(it.barkod); seen.add(it.barkod); }
  if (dups.size) warnings.push(dups.size + ' barkodova se ponavlja u više artikala (popisana količina ide prvom).');
  return { items, warnings, format: fmt };
}

function pickSheet(workbook) {
  let fallback = null;
  for (const name of workbook.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1, raw: true, defval: '', blankrows: false });
    const { records, hasHeader } = rowsToRecords(rows);
    if (hasHeader && records.length) return records;
    if (!fallback && records.length) fallback = records;
  }
  return fallback || [];
}

function decodeText(bytes) {
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^﻿/, ''); }
  catch (e) { return new TextDecoder('windows-1250').decode(bytes); }
}

function parseCsv(text) {
  const first = (text.split(/\r?\n/).find((l) => l.trim()) || '');
  const count = (d) => first.split(d).length - 1;
  const delim = [';', ',', '\t'].reduce((a, b) => (count(b) > count(a) ? b : a));
  const rows = [];
  let row = [], cell = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQ) {
      if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else inQ = false; }
      else cell += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === delim) { row.push(cell); cell = ''; }
    else if (ch === '\n') { row.push(cell); cell = ''; rows.push(row); row = []; }
    else if (ch !== '\r') cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rowsToRecords(rows).records;
}

const local = (n) => n.split(':').pop();
const kids = (el) => Array.from(el.children);

function collectGeneric(el, out) {
  const vals = {};
  for (const a of Array.from(el.attributes)) {
    const f = ALIAS_TO_FIELD[norm(local(a.name))];
    if (f && !(f in vals)) vals[f] = (a.value || '').trim();
  }
  for (const ch of kids(el)) {
    const f = ALIAS_TO_FIELD[norm(local(ch.nodeName))];
    if (f && !(f in vals) && ch.children.length === 0) vals[f] = (ch.textContent || '').trim();
  }
  if (Object.keys(vals).length >= 2) { out.push(vals); return; }
  for (const ch of kids(el)) collectGeneric(ch, out);
}

function parseXml(text) {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) throw new Error('XML fajl nije ispravan.');
  const root = doc.documentElement;
  if (local(root.nodeName) === 'Workbook') {            // Excel 2003 "XML Spreadsheet"
    const tables = [];
    const find = (el) => { if (local(el.nodeName) === 'Table') { tables.push(el); return; } kids(el).forEach(find); };
    find(root);
    let fallback = null;
    for (const table of tables) {
      const rows = [];
      for (const row of kids(table).filter((e) => local(e.nodeName) === 'Row')) {
        const cells = [];
        for (const cell of kids(row).filter((e) => local(e.nodeName) === 'Cell')) {
          const idxAttr = Array.from(cell.attributes).find((a) => local(a.name) === 'Index');
          if (idxAttr) { const idx = parseInt(idxAttr.value, 10); while (cells.length < idx - 1) cells.push(''); }
          const data = kids(cell).find((e) => local(e.nodeName) === 'Data');
          cells.push(data ? data.textContent.trim() : '');
        }
        rows.push(cells);
      }
      const { records, hasHeader } = rowsToRecords(rows);
      if (hasHeader && records.length) return records;
      if (!fallback && records.length) fallback = records;
    }
    return fallback || [];
  }
  const out = [];
  collectGeneric(root, out);
  return out;
}

function sniff(b) {
  if (b[0] === 0x50 && b[1] === 0x4B) return 'xlsx';
  if (b[0] === 0xD0 && b[1] === 0xCF && b[2] === 0x11 && b[3] === 0xE0) return 'xls';
  if ((b[0] === 0xFF && b[1] === 0xFE) || (b[0] === 0xFE && b[1] === 0xFF)) return 'xml';
  let i = 0;
  if (b[0] === 0xEF && b[1] === 0xBB && b[2] === 0xBF) i = 3;
  while (i < b.length && (b[i] === 32 || b[i] === 9 || b[i] === 13 || b[i] === 10)) i++;
  return b[i] === 0x3C ? 'xml' : 'csv';
}

function parseFile(buffer) {
  const bytes = new Uint8Array(buffer);
  const kind = sniff(bytes);
  try {
    let records;
    if (kind === 'xlsx' || kind === 'xls') records = pickSheet(XLSX.read(bytes, { type: 'array' }));
    else if (kind === 'xml') records = parseXml(decodeText(bytes));
    else records = parseCsv(decodeText(bytes));
    return buildResult(records, kind.toUpperCase());
  } catch (e) {
    if (e && /^Nisu|^Nijedan|^XML fajl/.test(e.message)) throw e;
    throw new Error('Fajl se ne može pročitati kao ' + kind.toUpperCase() + ': ' + (e && e.message ? e.message : e));
  }
}

// ═════════════════════════════════════════════════════════════ PODACI (IndexedDB)

let state = { items: [], nextId: 1, device: '' };
let idx = { b: new Map(), t: new Map(), s: new Map(), sl: new Map() };
let persistOk = true;

function openDb() {
  return new Promise((res, rej) => {
    if (!window.indexedDB) return rej(new Error('IndexedDB nije dostupan'));
    const r = indexedDB.open('popis-magacin', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('kv');
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function loadState() {
  try {
    const db = await openDb();
    return await new Promise((res, rej) => {
      const q = db.transaction('kv').objectStore('kv').get('state');
      q.onsuccess = () => res(q.result || null);
      q.onerror = () => rej(q.error);
    });
  } catch (e) { persistOk = false; return null; }
}
let saveTimer = null;
async function saveNow() {
  clearTimeout(saveTimer); saveTimer = null;
  if (!persistOk) return;
  try {
    const db = await openDb();
    await new Promise((res, rej) => {
      const tx = db.transaction('kv', 'readwrite');
      tx.objectStore('kv').put(state, 'state');
      tx.oncomplete = res; tx.onerror = () => rej(tx.error);
    });
  } catch (e) { persistOk = false; }
}
function save() { clearTimeout(saveTimer); saveTimer = setTimeout(saveNow, 100); }
window.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && saveTimer) saveNow(); });
window.addEventListener('pagehide', () => { if (saveTimer) saveNow(); });

const trimZeros = (s) => s.replace(/^0+/, '');
function rebuildIndex() {
  idx = { b: new Map(), t: new Map(), s: new Map(), sl: new Map() };
  for (const it of state.items) indexItem(it);
}
function indexBarcode(it, code) {
  if (!code) return;
  if (!idx.b.has(code)) idx.b.set(code, it);
  const t = trimZeros(code);
  if (t && !idx.t.has(t)) idx.t.set(t, it);
}
function indexItem(it) {
  indexBarcode(it, it.barkod);
  (it.added || []).forEach((c) => indexBarcode(it, c));
  if (it.sifra && !idx.s.has(it.sifra)) idx.s.set(it.sifra, it);
  if (it.sifra && !idx.sl.has(it.sifra.toLowerCase())) idx.sl.set(it.sifra.toLowerCase(), it);
}
function findByBarcode(code) {
  const c = (code || '').trim();
  if (!c) return null;
  if (idx.b.has(c)) return idx.b.get(c);
  const t = trimZeros(c);
  return (t && idx.t.get(t)) || null;
}
function findBySifra(sifra) {
  const c = (sifra || '').trim();
  if (!c) return null;
  return idx.s.get(c) || idx.sl.get(c.toLowerCase()) || null;
}
function findByCode(code) {                       // polje „Barkod / Šifra“: prvo barkod, pa šifra
  return findByBarcode(code) || findBySifra(code);
}
// Jedna šifra može imati više barkodova, ali jedan barkod pripada samo jednoj šifri.
function assignBarcode(it, code) {
  code = (code || '').trim();
  if (!code) return { ok: false, error: 'Barkod je prazan.' };
  const owner = findByBarcode(code);
  if (owner && owner !== it) {
    return { ok: false, error: 'Barkod je već dodijeljen šifri ' + (owner.sifra || '(bez šifre)') + ' (' + owner.naziv + ').' };
  }
  if (owner === it) return { ok: true, already: true };
  it.added = (it.added || []).concat(code);
  indexBarcode(it, code); save();
  return { ok: true };
}
function addCount(it, delta) { it.popisano = Math.max(0, round3(it.popisano + delta)); it.scanned = true; save(); }
function setCount(it, v) { it.popisano = Math.max(0, round3(v)); it.scanned = true; save(); }
function replaceAll(items) {
  state.items = items.map((it) => Object.assign({ id: 0 }, it));
  state.items.forEach((it) => { it.id = state.nextId++; });
  rebuildIndex(); save();
}
function resetCounts() {
  state.items = state.items.filter((it) => !it.unknown);
  state.items.forEach((it) => { it.popisano = 0; it.scanned = false; });
  rebuildIndex(); save();
}
function clearAll() {                              // briše sve artikle i popisane količine iz memorije
  state.items = []; state.nextId = 1;
  rebuildIndex();
  return saveNow();
}
function stats() {
  let total = 0, counted = 0, unknown = 0;
  for (const it of state.items) {
    if (it.unknown) unknown++; else { total++; if (it.scanned) counted++; }
  }
  return { total, counted, unknown };
}
const round3 = (x) => Math.round(x * 1000) / 1000;
const fmtQty = (x) => String(round3(x));
const parseQty = (s) => { const n = Number(String(s).trim().replace(',', '.')); return String(s).trim() !== '' && isFinite(n) ? n : NaN; };

// ═════════════════════════════════════════════════════════════ IZVOZ

const HEADERS = ['ŠIFRA', 'NAZIV', 'BARKOD', 'KOLIČINA', 'POPISANO', 'RAZLIKA', 'NOVI BARKODOVI'];
function exportRows() {
  return state.items.map((it) => [
    it.sifra, it.naziv, it.barkod, it.kolicina,
    it.scanned ? it.popisano : null,
    it.scanned ? round3(it.popisano - it.kolicina) : null,
    (it.added && it.added.length) ? it.added.join(', ') : null
  ]);
}
function buildXlsx() {
  const ws = XLSX.utils.aoa_to_sheet([HEADERS].concat(exportRows()));
  ws['!cols'] = [14, 44, 20, 12, 12, 12, 30].map((w) => ({ wch: w }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Popis');
  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  return new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}
function buildCsv() {
  const cell = (v) => {
    if (v == null) return '';
    if (typeof v === 'number') return String(v).replace('.', ',');
    const s = String(v);
    return /[;"\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const lines = [HEADERS.join(';')].concat(exportRows().map((r) => r.map(cell).join(';')));
  return new Blob(['﻿' + lines.join('\r\n') + '\r\n'], { type: 'text/csv;charset=utf-8' });
}
function fileStamp() {
  const d = new Date(), p = (n) => String(n).padStart(2, '0');
  const dev = (state.device || '').replace(/[^A-Za-z0-9_-]+/g, '');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + '_' + p(d.getHours()) + p(d.getMinutes()) + (dev ? '_' + dev : '');
}
function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}

// ═════════════════════════════════════════════════════════════ POMOĆNO (UI)

function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  for (const k of Object.keys(attrs || {})) {
    const v = attrs[k];
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'value') el.value = v;
    else if (k === 'checked' || k === 'disabled') { el[k] = !!v; }
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) if (c != null && c !== false) el.append(c.nodeType ? c : document.createTextNode(String(c)));
  return el;
}

let dialogCount = 0, lastClose = 0;
function dialog({ title, body, actions }) {
  const root = document.getElementById('modal-root');
  const box = h('div', { class: 'dialog', role: 'dialog', 'aria-modal': 'true', 'aria-label': title || '' },
    title ? h('h2', {}, title) : null, body,
    h('div', { class: 'actions' }, (actions || []).map((a) => {
      const b = h('button', { class: 'btn' + (a.danger ? ' danger' : ''), disabled: a.disabled }, a.label);
      b.addEventListener('click', () => { if (a.onClick) a.onClick(close); else close(); });
      a.el = b; return b;
    })));
  const scrim = h('div', { class: 'scrim' }, box);
  scrim.addEventListener('click', (e) => { if (e.target === scrim) close(); });
  root.append(scrim);
  dialogCount++;
  function close() { if (!scrim.isConnected) return; scrim.remove(); dialogCount--; lastClose = Date.now(); if (dialog.onClose) dialog.onClose(); }
  return { close, box, actions };
}
function info(text, onOk) {
  dialog({ body: h('p', { style: 'color:var(--text)' }, text), actions: [{ label: 'U redu', onClick: (c) => { c(); if (onOk) onOk(); } }] });
}
function confirmDialog(title, text, okLabel, onOk, danger) {
  dialog({ title, body: h('p', {}, text), actions: [
    { label: 'Otkaži' }, { label: okLabel, danger, onClick: (c) => { c(); onOk(); } }] });
}
function toast(msg) {
  const t = h('div', { class: 'toast' }, msg); document.body.append(t); setTimeout(() => t.remove(), 2500);
}
// naziv koji ne stane u jedan red: slova se smanje za 30% i naziv prelazi u sljedeći red
function fitName(el) {
  if (!el) return;
  el.classList.remove('small');
  if (el.scrollWidth > el.clientWidth + 1) el.classList.add('small');
}

function qtyDialog({ title, label, initial, onSave, note }) {
  const input = h('input', { type: 'text', inputmode: 'decimal', value: initial, 'aria-label': label, class: 'qty-input', maxlength: '5', size: '5' });
  const wrap = h('label', { class: 'field qty-field' }, label, input);
  const d = dialog({ title, body: note ? h('div', { class: 'stack' }, wrap, note) : wrap, actions: [
    { label: 'Otkaži' },
    { label: 'Sačuvaj', onClick: (c) => { const v = parseQty(input.value); if (!(v >= 0)) return; c(); onSave(v); } }] });
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') d.actions[1].el.click(); });
  setTimeout(() => { input.focus(); input.select(); }, 100);
  fitName(d.box.querySelector('h2'));
  d.input = input;
  return d;
}

// zvuk i vibracija
let audio = null;
function beep(ok) {
  try {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    const o = audio.createOscillator(), g = audio.createGain();
    o.type = ok ? 'sine' : 'square'; o.frequency.value = ok ? 1000 : 220;
    g.gain.value = 0.15; o.connect(g); g.connect(audio.destination);
    o.start(); o.stop(audio.currentTime + (ok ? 0.12 : 0.35));
  } catch (e) { /* bez zvuka */ }
  try { navigator.vibrate && navigator.vibrate(ok ? 40 : [80, 60, 80]); } catch (e) { /* ignoriši */ }
}

// ═════════════════════════════════════════════════════════════ EKRANI

const app = () => document.getElementById('app');
let stopScanner = null;
let installEvent = null;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installEvent = e; if (route() === 'home') render(); });
window.addEventListener('appinstalled', () => { installEvent = null; if (route() === 'home') render(); });

const route = () => (location.hash.replace('#/', '') || 'home');
function go(r) { location.hash = '#/' + r; }
function render() {
  if (stopScanner) { stopScanner(); stopScanner = null; }
  const r = route();
  app().replaceChildren();
  if (r === 'scan' && stats().total > 0) scanScreen();
  else if (r === 'list' && stats().total > 0) listScreen();
  else homeScreen();
}
window.addEventListener('hashchange', render);

function appbar(title, back) {
  return h('div', { class: 'appbar' },
    back ? h('button', { class: 'back', onclick: () => history.length > 1 ? history.back() : go('home') }, '← Nazad') : null, title);
}

// ── početni ekran
function homeScreen() {
  const st = stats();
  const empty = st.total === 0 && st.unknown === 0;
  const pct = st.total ? Math.floor(st.counted * 100 / st.total) : 0;
  const fileInput = h('input', { type: 'file', style: 'display:none', onchange: () => { const f = fileInput.files[0]; fileInput.value = ''; if (f) importFile(f); } });
  const busy = h('div', { class: 'progress', style: 'display:none' }, h('i'));
  const isStandalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);

  async function importFile(file) {
    const doImport = async () => {
      busy.style.display = '';
      try {
        const res = parseFile(await file.arrayBuffer());
        replaceAll(res.items); await saveNow();
        busy.style.display = 'none';
        info('Uvezeno ' + res.items.length + ' artikala (' + res.format + ').' + (res.warnings.length ? '\n\n' + res.warnings.join('\n') : ''), render);
      } catch (e) { busy.style.display = 'none'; info('Uvoz nije uspio:\n' + (e.message || e)); }
    };
    if (stats().total > 0) confirmDialog('Zamijeniti postojeće podatke?',
      'Uvoz će zamijeniti trenutnu listu artikala i obrisati popisane količine. Ako vam treba, prvo izvezite rezultate.', 'Uvezi', doImport);
    else doImport();
  }

  const deviceInput = h('input', { type: 'text', value: state.device || '', placeholder: 'npr. Tel1 ili Marko', 'aria-label': 'Oznaka telefona', maxlength: '20' });
  deviceInput.addEventListener('input', () => { state.device = deviceInput.value; save(); });

  app().append(
    appbar('Popis Magacin'),
    h('div', { class: 'page' },
      !persistOk ? h('div', { class: 'warn' }, 'Pregledač ne dozvoljava trajno čuvanje podataka (privatni prozor?). Podaci će nestati kad zatvorite aplikaciju – izvezite ih prije toga.') : null,
      h('div', { class: 'card' },
        empty ? [h('div', { class: 'big' }, 'Nema učitanih artikala.'), h('div', {}, 'Uvezite fajl (XML, XLS ili XLSX) sa kolonama ŠIFRA, NAZIV, BARKOD, KOLIČINA.')]
          : [h('div', { class: 'big' }, 'Artikala u listi: ' + st.total), h('div', {}, 'Popisano: ' + st.counted + ' (' + pct + '%)'),
             st.unknown ? h('div', {}, 'Novih artikala (nisu bili u listi): ' + st.unknown) : null]),
      busy,
      h('button', { class: 'btn primary', onclick: () => fileInput.click() }, 'Uvezi fajl artikala…'), fileInput,
      h('button', { class: 'btn primary', disabled: st.total === 0, onclick: () => go('scan') }, 'Skeniraj i popisuj'),
      h('button', { class: 'btn', disabled: st.total === 0, onclick: () => go('list') }, 'Lista artikala / ručni unos'),
      h('button', { class: 'btn', disabled: st.total === 0, onclick: exportDialog }, 'Izvezi rezultate popisa'),
      h('label', { class: 'field', style: 'margin-top:6px' }, 'Oznaka telefona (Ulazi u ime izvezenog fajla)', deviceInput),
      h('button', { class: 'btn danger', disabled: st.total === 0, onclick: () => confirmDialog('Novi popis?',
        'Sve popisane količine će biti obrisane, a lista artikala ostaje. Ovo se ne može poništiti.', 'Obriši količine',
        () => { resetCounts(); render(); }, true) }, 'Novi popis (poništi popisane količine)'),
      h('button', { class: 'btn danger', disabled: state.items.length === 0, onclick: () => confirmDialog('Obrisati sve artikle?',
        'Svi artikli i popisane količine će biti trajno obrisani iz memorije telefona. Prije toga izvezite rezultate. Ovo se ne može poništiti.', 'Obriši sve',
        async () => { await clearAll(); render(); toast('Memorija je očišćena.'); }, true) }, 'Obriši listu artikala (očisti memoriju)'),
      installEvent && !isStandalone ? h('button', { class: 'btn', onclick: async () => { installEvent.prompt(); await installEvent.userChoice; installEvent = null; render(); } }, 'Instaliraj aplikaciju na telefon') : null,
      !isStandalone && !installEvent ? h('div', { class: 'note' }, isIos
        ? 'Za instalaciju: Safari → dugme Podijeli → „Dodaj na početni ekran“.'
        : 'Za instalaciju: u meniju pregledača (⋮) izaberite „Instaliraj aplikaciju“ ili „Dodaj na početni ekran“.') : null,
      h('div', { class: 'note' }, 'Podržani formati uvoza: XLSX, XLS, XML i CSV sa kolonama ŠIFRA, NAZIV, BARKOD, KOLIČINA (BARKOD može biti prazan). Podaci se čuvaju na ovom telefonu i rade bez interneta.'),
      h('div', { class: 'note', id: 'app-version', style: 'text-align:center' }, 'Verzija aplikacije: ' + APP_VERSION)
    ));
}

function exportDialog() {
  const base = 'popis_' + fileStamp();
  const save = (blob, name) => { d.close(); download(blob, name); toast('Sačuvano u folder Preuzimanja: ' + name); };
  const d = dialog({ title: 'Izvoz rezultata',
    body: h('div', { class: 'stack' },
      h('p', {}, 'Fajl sadrži kolone ŠIFRA, NAZIV, BARKOD, KOLIČINA, POPISANO, RAZLIKA i NOVI BARKODOVI (barkodovi koje ste dodijelili šiframa) i otvara se u Excelu.'),
      h('p', {}, 'Fajl se sprema u folder Preuzimanja (Downloads) na telefonu.'),
      h('button', { class: 'btn primary', onclick: () => save(buildXlsx(), base + '.xlsx') }, 'Izvezi u folder (XLSX)'),
      h('button', { class: 'btn', onclick: () => save(buildCsv(), base + '.csv') }, 'Izvezi u folder (CSV)')),
    actions: [{ label: 'Zatvori' }] });
}

// ── lista / ručni unos
function editDialog(it, done) {
  const f = (label, val, id) => h('label', { class: 'field' }, label, h('input', { type: 'text', value: val || '', id, autocomplete: 'off' }));
  const err = h('div', { class: 'hint is-bad', id: 'edit-err' });
  const body = h('div', { class: 'stack' }, f('Naziv artikla', it.naziv, 'ed-naziv'), f('Šifra', it.sifra, 'ed-sifra'), f('Barkod', it.barkod, 'ed-barkod'), f('Dodijeljeni barkodovi (više njih odvojite zarezom)', (it.added || []).join(', '), 'ed-added'), err);
  dialog({ title: 'Uredi artikal', body, actions: [
    { label: 'Otkaži' },
    { label: 'Sačuvaj', onClick: (close) => {
      const naziv = body.querySelector('#ed-naziv').value.trim();
      const sifra = body.querySelector('#ed-sifra').value.trim();
      const barkod = body.querySelector('#ed-barkod').value.trim();
      if (!sifra) { err.textContent = 'Šifra ne smije biti prazna.'; return; }
      const dupS = state.items.find((x) => x !== it && x.sifra.toLowerCase() === sifra.toLowerCase());
      if (dupS) { err.textContent = 'Šifra već postoji: ' + dupS.naziv; return; }
      const added = [...new Set(body.querySelector('#ed-added').value.split(/[,;\s]+/).map((x) => x.trim()).filter((x) => x && x !== barkod))];
      for (const c of [barkod].concat(added)) {
        if (!c) continue;
        const dupB = findByBarcode(c);
        if (dupB && dupB !== it) { err.textContent = 'Barkod ' + c + ' je već kod šifre ' + dupB.sifra + ' (' + dupB.naziv + ').'; return; }
      }
      it.naziv = naziv; it.sifra = sifra; it.barkod = barkod; it.added = added;
      rebuildIndex(); save(); close(); done();
    } }] });
}

function listScreen() {
  const PAGE = 300;
  let query = '', onlyCounted = false, shown = PAGE;
  const listEl = h('div', { class: 'list' });
  const countEl = h('div', { class: 'list-count' });
  const search = h('input', { type: 'search', placeholder: 'Pretraga (naziv, šifra ili barkod)', 'aria-label': 'Pretraga' });
  const sw = h('input', { type: 'checkbox', role: 'switch' });

  // naziv koji ne stane u jedan red: slova se smanje za 30% i prelazi u sljedeći red
  function fitNames() {
    listEl.querySelectorAll('.row-card .t').forEach((el) => { if (el.scrollWidth > el.clientWidth + 1) el.classList.add('small'); });
  }

  // pretraga uvijek prolazi kroz CIJELU listu; prikaz se samo dijeli na stranice po 300
  function fill() {
    const q = query.trim().toLowerCase();
    const all = [];
    for (const it of state.items) {
      if (onlyCounted && !it.scanned) continue;
      if (q && !(it.naziv + ' ' + it.sifra + ' ' + it.barkod + ' ' + (it.added || []).join(' ')).toLowerCase().includes(q)) continue;
      all.push(it);
    }
    all.sort((a, b) => (b.unknown - a.unknown));
    const out = all.slice(0, shown);
    countEl.textContent = 'Prikazano ' + out.length + ' od ' + all.length + (q || onlyCounted ? ' pronađenih' : ' artikala') + ' (ukupno u bazi: ' + state.items.length + ')';
    const rows = out.map((it) => {
      const cls = it.unknown ? 'unk' : !it.scanned ? 'none' : it.popisano === it.kolicina ? 'ok' : 'diff';
      return h('div', { class: 'row-card ' + cls },
        h('button', { class: 'row-main', onclick: () => qtyDialog({
          title: it.naziv, label: 'Popisana količina (ukupno)', initial: it.scanned ? fmtQty(it.popisano) : '',
          onSave: (v) => { setCount(it, v); fill(); } }) },
          h('div', { class: 't' }, it.naziv || '(bez naziva)'),
          h('div', { class: 's' }, 'Šifra: ' + it.sifra + '   Barkod: ' + [it.barkod].concat(it.added || []).filter(Boolean).join(', ')),
          h('div', { class: 'q' }, 'Knjigovodstveno: ' + fmtQty(it.kolicina) + '    Popisano: ' + (it.scanned ? fmtQty(it.popisano) : '—'))),
        h('button', { class: 'edit-btn', 'aria-label': 'Uredi artikal', onclick: () => editDialog(it, fill) }, 'Uredi'));
    });
    if (all.length > out.length) rows.push(h('button', { class: 'btn', onclick: () => { shown += PAGE; fill(); } }, 'Prikaži još ' + Math.min(PAGE, all.length - out.length)));
    listEl.replaceChildren(...rows);
    fitNames();
  }
  let t = null;
  search.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { query = search.value; shown = PAGE; fill(); }, 200); });
  sw.addEventListener('change', () => { onlyCounted = sw.checked; shown = PAGE; fill(); });

  app().append(appbar('Lista artikala', true),
    h('div', { class: 'list-top' }, search, h('label', { class: 'switch' }, sw, 'Samo popisani')),
    countEl, listEl);
  fill();
}

// ── skeniranje
const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'code_93', 'itf', 'codabar', 'qr_code'];

function scanScreen() {
  let last = null, message = '';
  let lastCode = '', stopped = false, stream = null, track = null, torch = false, timer = null, wake = null;
  const seen = {};   // kada je koji kod zadnji put viđen u kadru
  const HOLD_MS = 2000, GAP_MS = 1500;
  let hold = null;   // { code, item, t0, dlg, note, autoCount } – automatsko +1 dok se barkod drži u kadru

  const video = h('video', { playsinline: '', muted: '', autoplay: '' });
  video.muted = true;
  const msgEl = h('div', { class: 'scan-msg' }, 'Pokretanje kamere…');
  const wrap = h('div', { class: 'scan-wrap' }, video, h('div', { class: 'scan-frame' }), h('div', { class: 'scan-line' }));
  const lastEl = h('div', { class: 'last' });
  const holdEl = h('div', { class: 'hold', 'aria-live': 'polite' });
  const torchBtn = h('button', { class: 'btn torch', id: 'torch-btn', 'aria-label': 'Lampa', 'aria-pressed': 'false', style: 'display:none' });
  torchBtn.innerHTML = '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/></svg>';
  const manual = h('input', { type: 'text', inputmode: 'text', placeholder: 'Barkod / Šifra', 'aria-label': 'Barkod ili šifra',
    id: 'manual-code', autocomplete: 'off', autocapitalize: 'off' });
  const manualBtn = h('button', { class: 'btn small primary', id: 'manual-go' }, 'Traži');
  const submitManual = () => { const c = manual.value.trim(); if (c) { manual.value = ''; handleCode(c, true); } };
  manualBtn.addEventListener('click', submitManual);
  manual.addEventListener('keydown', (e) => { if (e.key === 'Enter') submitManual(); });

  function renderLast(flash) {
    const row = h('div', { class: 'row' },
      last ? h('button', { class: 'btn', onclick: () => qtyDialog({ title: last.naziv, label: 'Popisana količina (ukupno)', initial: fmtQty(last.popisano),
        onSave: (v) => { setCount(last, v); message = ''; renderLast(true); } }) }, 'Unesi količinu…') : null,
      torchBtn);                                           // sijalica uvijek dole desno
    if (!last) { lastEl.replaceChildren(holdEl, row); return; }
    const codes = [last.barkod].concat(last.added || []).filter(Boolean).join(', ');
    lastEl.replaceChildren(...[
      h('div', { class: 'name' }, last.naziv),
      h('div', { style: 'font-size:12px' }, 'Šifra: ' + last.sifra + '   Barkod: ' + codes),
      message ? h('div', { class: 'added' }, message) : null,              // „Dodano +N“ u zasebnom redu
      holdEl,
      h('div', { class: 'nums' }, 'Popisano: ' + fmtQty(last.popisano) + '    Knjigov.: ' + fmtQty(last.kolicina)),
      row].filter(Boolean));
    fitName(lastEl.querySelector('.name'));
    if (flash) { lastEl.classList.remove('flash'); void lastEl.offsetWidth; lastEl.classList.add('flash'); }
  }

  // Skeniran (ili upisan) kod: ako artikal postoji, odmah se nudi unos količine (podrazumijevano 1);
  // ako ne postoji, nudi se dodjela barkoda nekoj šifri.
  function handleCode(code, force) {
    const now = Date.now();
    const prev = seen[code] || 0;
    seen[code] = now;                                   // dok je isti barkod u kadru, stalno se osvježava
    if (dialogCount > 0) return;
    if (!force && code === lastCode && now - prev < GAP_MS) return;   // isti barkod još uvijek u kadru
    lastCode = code;
    const found = findByCode(code);
    if (!found) { beep(false); assignDialog(code); return; }
    beep(true);
    const dlg = addQtyDialog(found);
    if (!force) startHold(code, found, dlg);
  }

  function addQtyDialog(it) {
    last = it; message = ''; renderLast();
    const note = h('div', { class: 'auto-note', 'aria-live': 'polite' });
    const d = qtyDialog({ title: it.naziv, label: 'Količina (dodaje se na popisano: ' + fmtQty(it.scanned ? it.popisano : 0) + ')', initial: '1', note,
      onSave: (v) => { addCount(it, v); message = 'Dodato +' + fmtQty(v); renderLast(true); } });
    return { d, note };
  }

  // Držite li isti barkod u kadru 3 s, a ne dirate ekran, količina se sama dodaje (+1) i tako svake 3 s.
  function endHold() { hold = null; holdEl.textContent = ''; }
  function startHold(code, item, dlg) {
    hold = { code, item, t0: Date.now(), dlg: dlg.d, note: dlg.note, autoCount: 0 };
    const stop = () => { if (hold && hold.dlg === dlg.d) { dlg.note.textContent = ''; endHold(); } };
    dlg.d.box.addEventListener('pointerdown', stop);   // dodir dijaloga = korisnik sam unosi količinu
    dlg.d.input.addEventListener('input', stop);
  }
  function holdTick() {
    if (!hold || stopped) return;
    const now = Date.now();
    if (now - (seen[hold.code] || 0) > GAP_MS) { if (hold.note) hold.note.textContent = ''; endHold(); return; }   // barkod izašao iz kadra
    if (hold.dlg && !hold.dlg.box.isConnected) { endHold(); return; }                                              // dijalog zatvoren
    const left = HOLD_MS - (now - hold.t0);
    const txt = 'Barkod u kadru – automatski +1 za ' + Math.max(1, Math.ceil(left / 1000)) + ' s';
    if (hold.dlg) hold.note.textContent = txt; else holdEl.textContent = txt;
    if (left > 0) return;
    if (hold.dlg) { const d = hold.dlg; hold.dlg = null; hold.note.textContent = ''; d.close(); }
    addCount(hold.item, 1);
    last = hold.item; hold.autoCount++; hold.t0 = now;
    message = 'Dodato +' + hold.autoCount;
    renderLast(true); beep(true);
    holdEl.textContent = 'Barkod u kadru – automatski +1 za 2 s';
  }
  const holdTimer = setInterval(holdTick, 200);

  function assignDialog(code) {
    const sifra = h('input', { type: 'text', id: 'assign-sifra', 'aria-label': 'Šifra artikla', autocomplete: 'off', autocapitalize: 'off' });
    const hint = h('div', { class: 'hint', id: 'assign-hint', 'aria-live': 'polite' });
    let target = null;
    const check = () => {
      const v = sifra.value.trim();
      target = v ? findBySifra(v) : null;
      hint.className = 'hint' + (v ? (target ? ' is-ok' : ' is-bad') : '');
      hint.textContent = !v ? '' : target ? '✓ ' + target.naziv : 'Šifra ne postoji';
    };
    sifra.addEventListener('input', check);
    const d = dialog({ title: 'Barkod nije u listi',
      body: h('div', { class: 'stack' },
        h('p', {}, 'Barkod: ' + code),
        h('p', {}, 'Dodijelite ga šifri artikla. Jedna šifra može imati više barkodova.'),
        h('label', { class: 'field' }, 'Šifra artikla', sifra), hint),
      actions: [{ label: 'Preskoči' }, { label: 'Dodijeli šifri', onClick: (c) => {
        check();
        if (!target) { if (!sifra.value.trim()) { hint.className = 'hint is-bad'; hint.textContent = 'Upišite šifru.'; } beep(false); sifra.focus(); return; }
        const r = assignBarcode(target, code);
        if (!r.ok) { hint.className = 'hint is-bad'; hint.textContent = r.error; beep(false); return; }
        c(); toast('Barkod dodijeljen: ' + target.naziv); addQtyDialog(target);
      } }] });
    sifra.addEventListener('keydown', (e) => { if (e.key === 'Enter') d.actions[1].el.click(); });
    setTimeout(() => sifra.focus(), 100);
  }

  // kamera
  async function start() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      return cameraError('Kamera nije dostupna jer adresa nije „sigurna“. Otvorite aplikaciju preko https:// adrese, ili u Chrome-u (chrome://flags) uključite „Insecure origins treated as secure“ i upišite adresu ove aplikacije (vidi uputstvo).');
    }
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: false,
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } } });
    } catch (e) {
      return cameraError(e && e.name === 'NotAllowedError'
        ? 'Pristup kameri je odbijen. Dozvolite kameru u postavkama pregledača (ikona katanca pored adrese) i pokušajte ponovo.'
        : 'Kamera se ne može pokrenuti: ' + (e && e.message ? e.message : e));
    }
    if (stopped) { stream.getTracks().forEach((t) => t.stop()); return; }
    video.srcObject = stream;
    try { await video.play(); } catch (e) { /* autoplay */ }
    track = stream.getVideoTracks()[0];
    try {
      const caps = track.getCapabilities ? track.getCapabilities() : {};
      if (caps.focusMode && caps.focusMode.includes('continuous')) await track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] });
      if (caps.torch) torchBtn.style.display = '';
    } catch (e) { /* nije bitno */ }
    try { if (navigator.wakeLock) wake = await navigator.wakeLock.request('screen'); } catch (e) { /* nije bitno */ }
    msgEl.textContent = 'Skeniraj barkod artikla.';
    loop();
  }
  function cameraError(text) {
    msgEl.remove();
    wrap.append(h('div', { class: 'scan-error' }, h('div', {}, text), h('div', {}, 'Barkod možete unijeti i ručno ispod.')));
  }

  async function loop() {
    let detector = null, reader = null;
    if ('BarcodeDetector' in window) {
      try {
        const sup = await BarcodeDetector.getSupportedFormats();
        const use = FORMATS.filter((f) => sup.includes(f));
        if (use.length) detector = new BarcodeDetector({ formats: use });
      } catch (e) { detector = null; }
    }
    let canvas = null, ctx = null;
    if (!detector) {
      const hints = new Map();
      const Z = ZXing;
      hints.set(Z.DecodeHintType.POSSIBLE_FORMATS, [Z.BarcodeFormat.EAN_13, Z.BarcodeFormat.EAN_8, Z.BarcodeFormat.UPC_A, Z.BarcodeFormat.UPC_E,
        Z.BarcodeFormat.CODE_128, Z.BarcodeFormat.CODE_39, Z.BarcodeFormat.CODE_93, Z.BarcodeFormat.ITF, Z.BarcodeFormat.CODABAR, Z.BarcodeFormat.QR_CODE]);
      hints.set(Z.DecodeHintType.TRY_HARDER, true);
      reader = new Z.MultiFormatReader(); reader.setHints(hints);
      canvas = document.createElement('canvas'); ctx = canvas.getContext('2d', { willReadFrequently: true });
    }
    const tick = async () => {
      if (stopped) return;
      try {
        if (video.readyState >= 2 && video.videoWidth) {
          if (detector) {
            const found = await detector.detect(video);
            const c = found.find((b) => b.rawValue);
            if (c) handleCode(c.rawValue);
          } else {
            const scale = Math.min(1, 900 / video.videoWidth);
            canvas.width = Math.round(video.videoWidth * scale); canvas.height = Math.round(video.videoHeight * scale);
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            try {
              const Z = ZXing;
              const bmp = new Z.BinaryBitmap(new Z.HybridBinarizer(new Z.HTMLCanvasElementLuminanceSource(canvas)));
              const r = reader.decode(bmp);
              if (r && r.getText()) handleCode(r.getText());
            } catch (e) { /* nema barkoda u kadru */ }
          }
        }
      } catch (e) { /* preskoči kadar */ }
      timer = setTimeout(tick, detector ? 90 : 140);
    };
    tick();
  }

  torchBtn.addEventListener('click', async () => {
    try { torch = !torch; await track.applyConstraints({ advanced: [{ torch }] }); }
    catch (e) { torch = false; toast('Lampa nije podržana na ovom uređaju.'); }
    torchBtn.classList.toggle('on', torch); torchBtn.setAttribute('aria-pressed', String(torch));
  });

  stopScanner = () => {
    stopped = true; clearTimeout(timer); clearInterval(holdTimer);
    if (stream) stream.getTracks().forEach((t) => t.stop());
    if (wake) { try { wake.release(); } catch (e) { /* ok */ } }
  };

  app().append(appbar('Skeniranje', true), wrap, msgEl, h('div', { class: 'manual' }, manual, manualBtn), lastEl);
  renderLast();
  start();
}

// ═════════════════════════════════════════════════════════════ POKRETANJE

async function init() {
  const saved = await loadState();
  if (saved && Array.isArray(saved.items)) state = Object.assign({ items: [], nextId: 1, device: '' }, saved);
  rebuildIndex();
  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) { /* ok */ }
  if ('serviceWorker' in navigator && window.isSecureContext) {   // https, localhost ili adresa označena u Chrome zastavici
    const hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadController && !window.__reloaded) { window.__reloaded = true; location.reload(); } });   // nova verzija -> automatski ponovo učitaj
    navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then((r) => r.update()).catch(() => {});
  }
  render();
}
window.__popis = { parseFile, findByCode, findByBarcode, findBySifra, assignBarcode, get state() { return state; } };   // za testiranje
init();

})();
