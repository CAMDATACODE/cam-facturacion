// Componentes de interfaz reutilizables. Todo texto recibido se pinta con textContent.
import { icon } from './icons.js';

/** Crea un elemento: h('button', {class: 'btn', onclick}, 'Texto', otroNodo). */
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (['value', 'checked', 'disabled', 'selected', 'hidden'].includes(k)) el[k] = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

export const clear = (el, ...children) => { el.replaceChildren(); append(el, children); return el; };

// ---------- Formatos ----------
const COP = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
const DT = new Intl.DateTimeFormat('es-CO', { timeZone: 'America/Bogota', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

export const money = (v) => (v === null || v === undefined || v === '' ? '' : COP.format(Number(v)));
/** 'YYYY-MM-DD' -> 'dd/mm/aaaa' sin pasar por zona horaria. */
export const fdate = (v) => (v ? String(v).slice(0, 10).split('-').reverse().join('/') : '');
export const fdatetime = (v) => (v ? DT.format(new Date(v)) : '');
/** Hoy en Bogotá como 'YYYY-MM-DD'. */
export const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());
/** Convierte lo que escribe la persona ("750.000", "$ 750000,50") en "750000.50" para la API. */
export function toAmount(s) {
  const clean = String(s).replace(/[$\s.]/g, '').replace(',', '.');
  return /^\d{1,12}(\.\d{1,2})?$/.test(clean) ? clean : null;
}
/** Vista previa en centavos enteros: evita errores de coma flotante. */
export const cents = (s) => Math.round(Number(s) * 100);

// ---------- Estados con color ----------
const COLORS = {
  ACTIVA: 'var(--green)', PAGADA: 'var(--blue)', TRASPASADA: 'var(--gray)', VENCIDA: 'var(--red)', PENDIENTE: 'var(--amber)',
  ENVIADO: 'var(--green)', FALLIDO: 'var(--red)', RETIRADA: 'var(--gray)', CONCRETADA: 'var(--blue)',
  VENTA: 'var(--blue)', INTERCAMBIO: 'var(--purple)', LIBRE: 'var(--green)', ASIGNADA: 'var(--blue)',
  Verificado: 'var(--green)', 'Sin verificar': 'var(--amber)', Sí: 'var(--green)', No: 'var(--gray)',
};
const LABELS = { ACTIVA: 'Activa', PAGADA: 'Pagada', TRASPASADA: 'Traspasada', VENCIDA: 'Vencida', PENDIENTE: 'Pendiente',
  ENVIADO: 'Enviado', FALLIDO: 'Fallido', RETIRADA: 'Retirada', CONCRETADA: 'Concretada', VENTA: 'Venta',
  INTERCAMBIO: 'Intercambio', LIBRE: 'Libre', ASIGNADA: 'Asignada' };
export function badge(value) {
  const text = LABELS[value] || value;
  const b = h('span', { class: 'badge' }, text);
  b.style.setProperty('--c', COLORS[value] || 'var(--gray)');
  return b;
}
export const verifiedBadge = (v) => badge(v ? 'Verificado' : 'Sin verificar');

// ---------- Botones e íconos ----------
export function btn(text, { icon: ic, kind = '', onclick, type = 'button', size = '', title } = {}) {
  return h('button', { type, class: `btn ${kind ? 'btn-' + kind : ''} ${size ? 'btn-' + size : ''}`, onclick, title },
    ic ? icon(ic) : null, text);
}
export const iconBtn = (ic, title, onclick) => h('button', { type: 'button', class: 'icon-btn', title, 'aria-label': title, onclick }, icon(ic));

/** Ejecuta una acción deshabilitando el botón mientras se envía. */
export async function busy(button, fn) {
  if (button) button.disabled = true;
  try {
    return await fn();
  } finally {
    if (button) button.disabled = false;
  }
}

// ---------- Estructura ----------
export function pageHead(title, subtitle, ...actions) {
  return h('div', { class: 'page-head' },
    h('div', {}, h('h1', {}, title), subtitle ? h('p', {}, subtitle) : null),
    h('div', { class: 'actions' }, actions));
}
export const card = (title, ...content) => h('section', { class: 'card' }, title ? h('h2', {}, title) : null, content);
export function kpi(title, color) {
  const v = h('div', { class: 'v' }, '—');
  const n = h('div', { class: 'n' }, ' ');
  const el = h('div', { class: 'card kpi' }, h('div', { class: 't' }, title), v, n);
  el.style.setProperty('--accent', color);
  return { el, set(value, note) { v.textContent = value; n.textContent = note || ' '; } };
}

let fieldSeq = 0;
/** Campo con etiqueta asociada. */
export function field(label, input, hint) {
  if (!input.id) input.id = `f${++fieldSeq}`;
  return h('div', { class: 'field' }, h('label', { for: input.id }, label), input, hint ? h('div', { class: 'hint' }, hint) : null);
}
export const input = (attrs = {}) => h('input', { class: 'input', ...attrs });
export function select(options, attrs = {}) {
  const s = h('select', { class: 'input', ...attrs });
  setOptions(s, options);
  return s;
}
/** options: [{value, label}] */
export function setOptions(sel, options, keep = true) {
  const prev = sel.value;
  sel.replaceChildren(...options.map((o) => h('option', { value: String(o.value) }, o.label)));
  if (keep && options.some((o) => String(o.value) === prev)) sel.value = prev;
}
export function searchBox(placeholder, oninput) {
  const i = input({ type: 'search', placeholder, 'aria-label': placeholder });
  let t;
  i.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => oninput(i.value), 250); });
  return { el: h('div', { class: 'search' }, icon('search'), i), input: i };
}

// ---------- Avisos y diálogos ----------
export function toast(message, type = 'ok') {
  let box = document.querySelector('.toasts');
  if (!box) { box = h('div', { class: 'toasts', role: 'status', 'aria-live': 'polite' }); document.body.append(box); }
  const t = h('div', { class: `toast ${type === 'error' ? 'error' : ''}` }, message);
  box.append(t);
  setTimeout(() => t.remove(), type === 'error' ? 6000 : 3500);
}

/** Diálogo modal. Devuelve el valor del botón pulsado (o null si se cierra). */
export function dialog(title, body, buttons) {
  return new Promise((resolve) => {
    const d = h('dialog', { 'aria-labelledby': 'dlg-title' });
    const done = (v) => { d.close(); d.remove(); resolve(v); };
    d.append(
      h('div', { class: 'd-body' }, h('h2', { id: 'dlg-title' }, title), body),
      h('div', { class: 'd-actions' }, buttons.map((b) => btn(b.label, { kind: b.kind, onclick: () => done(b.value) }))),
    );
    d.addEventListener('cancel', (e) => { e.preventDefault(); done(null); });
    document.body.append(d);
    d.showModal();
  });
}
export const confirmar = (title, message, { ok = 'Confirmar', danger = false } = {}) =>
  dialog(title, h('p', {}, message), [{ label: 'Cancelar', value: false }, { label: ok, value: true, kind: danger ? 'danger' : 'primary' }])
    .then((v) => v === true);

/** Muestra el error de la API en el formulario o como aviso. */
export function showError(e, target) {
  const msg = e?.message || 'Ocurrió un error inesperado.';
  if (target) target.textContent = msg;
  else toast(msg, 'error');
}

// ---------- Tablas ----------
/**
 * Tabla con carga, lista vacía, error y paginación.
 * columns: [{label, value(row) | key, format, num, nowrap}]; load({limit, offset}) => {data, total}
 */
export function dataTable({ columns: allColumns, load, pageSize = 20, empty = 'No hay registros.', actions, onRowClick, rowKey = 'id' }) {
  const columns = allColumns.filter((c) => !c.csvOnly);
  const tbody = h('tbody');
  const info = h('span');
  const prev = btn('Anterior', { size: 'sm' });
  const next = btn('Siguiente', { size: 'sm' });
  const pager = h('div', { class: 'pager' }, info, h('div', { class: 'btns' }, prev, next));
  const heads = columns.map((c) => h('th', { class: c.num ? 'num' : '', scope: 'col' }, c.label));
  if (actions) heads.push(h('th', { class: 'num', scope: 'col' }, h('span', { class: 'sr-only' }, 'Acciones')));
  const el = h('div', {}, h('div', { class: 'table-wrap' }, h('table', {}, h('thead', {}, h('tr', {}, heads)), tbody)), pager);
  let offset = 0;
  let total = 0;
  let rows = [];
  let selected = null;

  const state = (text, cls = '') => clear(tbody, h('tr', {}, h('td', { colspan: heads.length, class: `state ${cls}` }, text)));

  function cell(c, row) {
    const raw = c.value ? c.value(row) : row[c.key];
    const content = c.format ? c.format(raw, row) : raw;
    return h('td', { class: `${c.num ? 'num' : ''} ${c.wrap ? 'wrap' : ''}` }, content);
  }

  function paint() {
    if (!rows.length) { state(empty); } else {
      clear(tbody, rows.map((row) => {
        const tr = h('tr', { class: `${onRowClick ? 'clickable' : ''} ${selected === row[rowKey] ? 'selected' : ''}` },
          columns.map((c) => cell(c, row)),
          actions ? h('td', { class: 'actions' }, actions(row)) : null);
        if (onRowClick) {
          tr.tabIndex = 0;
          const go = () => { selected = row[rowKey]; paint(); onRowClick(row); };
          tr.addEventListener('click', (e) => { if (!e.target.closest('button')) go(); });
          tr.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
        }
        return tr;
      }));
    }
    const from = total ? offset + 1 : 0;
    info.textContent = `${from}–${Math.min(offset + rows.length, total)} de ${total}`;
    prev.disabled = offset === 0;
    next.disabled = offset + pageSize >= total;
    pager.hidden = total <= pageSize && offset === 0;
  }

  async function reload(resetPage = false) {
    if (resetPage) offset = 0;
    state('Cargando…');
    try {
      const r = await load({ limit: pageSize, offset });
      rows = r.data;
      total = r.total ?? r.data.length;
      if (!rows.length && offset > 0) { offset = Math.max(0, offset - pageSize); return reload(); }
      paint();
    } catch (e) {
      rows = [];
      state(e.message || 'No se pudo cargar la información.', 'error');
      pager.hidden = true;
    }
  }
  prev.addEventListener('click', () => { offset = Math.max(0, offset - pageSize); reload(); });
  next.addEventListener('click', () => { offset += pageSize; reload(); });

  return {
    el,
    reload,
    rows: () => rows,
    select(id) { selected = id; paint(); },
    /** Todas las filas de la consulta actual, para exportar. */
    async all() {
      const out = [];
      for (let o = 0; ; o += 100) {
        const r = await load({ limit: 100, offset: o });
        out.push(...r.data);
        if (out.length >= (r.total ?? r.data.length) || !r.data.length) return out;
      }
    },
  };
}

// ---------- Exportar (FUN-REP-02) ----------
/** Descarga un CSV que Excel abre directamente (separador ';' y BOM UTF-8), con las mismas columnas de la tabla. */
export function exportCsv(name, columns, rows) {
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const plain = (c, row) => {
    const raw = c.value ? c.value(row) : row[c.key];
    if (c.csv) return c.csv(raw, row);
    if (typeof raw === 'boolean') return raw ? 'Sí' : 'No';
    if (c.money) return String(raw ?? '').replace('.', ',');
    if (c.date) return fdate(raw);
    if (c.datetime) return fdatetime(raw);
    return raw;
  };
  const lines = [columns.map((c) => esc(c.label)).join(';'), ...rows.map((r) => columns.map((c) => esc(plain(c, r))).join(';'))];
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const a = h('a', { href: URL.createObjectURL(blob), download: `${name}_${today()}.csv` });
  document.body.append(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  toast(`Archivo exportado (${rows.length} filas).`);
}

/** Columnas de uso frecuente. */
export const col = {
  money: (label, key) => ({ label, key, num: true, money: true, format: money }),
  date: (label, key) => ({ label, key, nowrap: true, date: true, format: fdate }),
  datetime: (label, key) => ({ label, key, nowrap: true, datetime: true, format: fdatetime }),
  badge: (label, key) => ({ label, key, format: (v) => badge(v) }),
  num: (label, key) => ({ label, key, num: true }),
};
