// Inicio de la secretaria: indicadores del recaudo, gráfico de 12 meses y últimos pagos.
import { api } from '../api.js';
import { h, clear, pageHead, card, kpi, money, fdate, verifiedBadge, btn, showError } from '../ui.js';

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

export default async function inicio(root) {
  const k = {
    propietarios: kpi('Propietarios', 'var(--primary)'), semanas: kpi('Semanas asignadas', 'var(--gold)'),
    recaudado: kpi('Total recaudado', 'var(--green)'), saldo: kpi('Saldo por cobrar', 'var(--amber)'),
    cuotas: kpi('Cuotas pagadas', 'var(--blue)'), sinVerificar: kpi('Pagos sin verificar', 'var(--amber)'),
    sinEnviar: kpi('Comprobantes sin enviar', 'var(--red)'), ofertas: kpi('Ofertas activas', 'var(--purple)'),
  };
  const chart = h('div', {}, h('p', { class: 'state' }, 'Cargando…'));
  const ultimos = h('div', {}, h('p', { class: 'state' }, 'Cargando…'));
  const refresh = btn('Actualizar', { icon: 'refresh', onclick: () => load() });
  root.append(
    pageHead('Inicio', 'Resumen del recaudo de la acción y de la comunidad de propietarios', refresh),
    h('div', { class: 'kpis' }, Object.values(k).map((x) => x.el)),
    h('div', { class: 'grid-2' }, card('Recaudo de los últimos 12 meses', chart), card('Últimos pagos registrados', ultimos)),
  );

  async function load() {
    try {
      const { data } = await api('/dashboard');
      const i = data.indicadores;
      k.propietarios.set(i.propietarios, 'registrados');
      k.semanas.set(`${i.semanas_asignadas} / ${i.semanas}`, 'con titular vigente');
      k.recaudado.set(money(i.recaudado), 'suma de cuotas pagadas');
      k.saldo.set(money(i.saldo), 'frente al valor de las acciones');
      k.cuotas.set(`${i.cuotas_pagadas} / ${i.cuotas_plan}`,
        i.cuotas_plan ? `${(i.cuotas_pagadas * 100 / i.cuotas_plan).toFixed(1)} % del plan` : '');
      k.sinVerificar.set(i.pagos_sin_verificar, 'por confirmar recepción');
      k.sinEnviar.set(i.comprobantes_sin_enviar, 'pendientes o fallidos');
      k.ofertas.set(i.ofertas_activas, 'en la comunidad');
      clear(chart, barChart(data.recaudo_mensual));
      clear(ultimos, data.ultimos_pagos.length ? h('div', { class: 'table-wrap' }, h('table', {},
        h('thead', {}, h('tr', {}, ['Propietario', 'Semana', 'Cuota', 'Fecha', 'Valor', 'Estado'].map((t, n) => h('th', { class: n >= 1 && n <= 2 || n === 4 ? 'num' : '' }, t)))),
        h('tbody', {}, data.ultimos_pagos.map((p) => h('tr', {},
          h('td', {}, p.propietario), h('td', { class: 'num' }, p.semana), h('td', { class: 'num' }, p.numero_cuota),
          h('td', { class: 'nowrap' }, fdate(p.fecha_pago)), h('td', { class: 'num' }, money(p.valor)), h('td', {}, verifiedBadge(p.verificado))))))) :
        h('p', { class: 'state' }, 'Aún no hay pagos.'));
    } catch (e) {
      showError(e);
      clear(chart, h('p', { class: 'state error' }, e.message));
      clear(ultimos, h('p', { class: 'state error' }, e.message));
    }
  }
  await load();
}

/** Gráfico de barras en SVG; el mes actual va en dorado. */
function barChart(rows) {
  const NS = 'http://www.w3.org/2000/svg';
  const W = 600; const H = 260; const top = 24; const bottom = 26;
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('class', 'chart');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'Recaudo por mes: ' + rows.map((r) => `${r.mes} ${money(r.valor)}`).join(', '));
  const el = (tag, attrs, text) => {
    const e = document.createElementNS(NS, tag);
    for (const [a, v] of Object.entries(attrs)) e.setAttribute(a, v);
    if (text !== undefined) e.textContent = text;
    svg.append(e);
  };
  const max = Math.max(1, ...rows.map((r) => Number(r.valor)));
  for (let g = 0; g <= 3; g++) el('line', { x1: 0, x2: W, y1: top + (H - top - bottom) * g / 3, y2: top + (H - top - bottom) * g / 3, stroke: '#eef1f5' });
  const slot = W / rows.length;
  const bw = slot * 0.56;
  rows.forEach((r, i) => {
    const v = Number(r.valor);
    const bh = (H - top - bottom) * v / max;
    const x = i * slot + (slot - bw) / 2;
    const y = H - bottom - bh;
    el('rect', { x, y, width: bw, height: Math.max(bh, 2), rx: 5, fill: i === rows.length - 1 ? '#c9a24b' : '#1f4e79' });
    el('text', { x: x + bw / 2, y: H - 8, 'text-anchor': 'middle' }, MESES[Number(r.mes.slice(5)) - 1]);
    if (v > 0) el('text', { x: x + bw / 2, y: y - 6, 'text-anchor': 'middle', class: 'val' }, `${(v / 1e6).toFixed(1).replace('.', ',')}M`);
  });
  return svg;
}
