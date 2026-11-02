// FUN-PAG-01 a FUN-PAG-05: registrar, verificar, consultar, emitir comprobante y anular pagos de cuotas.
import { api, apiAll } from '../api.js';
import { h, clear, pageHead, field, input, select, setOptions, btn, iconBtn, dataTable, searchBox, exportCsv, toast, busy,
  confirmar, money, today, toAmount, verifiedBadge, col } from '../ui.js';

export default async function pagos(root) {
  let q = '';
  const verif = select([{ value: '', label: 'Todos' }, { value: 'false', label: 'Sin verificar' }, { value: 'true', label: 'Verificados' }],
    { 'aria-label': 'Estado de verificación', style: { width: 'auto' } });
  const solo = input({ type: 'checkbox' });
  const columns = [
    { label: 'Propietario', key: 'propietario' }, { label: 'Semana', key: 'semana', num: true },
    { label: 'Cuota', value: (r) => `${r.numero_cuota} / ${r.num_cuotas}`, num: true, csv: (v, r) => r.numero_cuota },
    col.date('Fecha de pago', 'fecha_pago'), col.money('Valor', 'valor'),
    { label: 'Estado', key: 'verificado', format: verifiedBadge, csv: (v) => (v ? 'Verificado' : 'Sin verificar') },
    { label: 'Comprobante', key: 'comprobante', nowrap: true, format: (v) => v || '—' },
    { label: 'Registró', key: 'registrado_por' },
  ];
  const table = dataTable({
    columns, pageSize: 20,
    load: (p) => api('/pagos', { query: { q, verificado: verif.value, adquisicion_id: solo.checked ? adq.value : '', ...p } }),
    actions: rowActions,
    empty: 'No hay pagos con ese criterio.',
  });
  const search = searchBox('Buscar por cédula o nombre', (v) => { q = v; table.reload(true); });
  verif.addEventListener('change', () => table.reload(true));
  solo.addEventListener('change', () => table.reload(true));

  // Formulario de registro
  const adq = select([], { required: true });
  const resumen = h('div', { class: 'muted' }, ' ');
  const barra = h('span', { style: { width: '0%' } });
  const cuota = input({ type: 'number', min: 1, max: 24, required: true });
  const fecha = input({ type: 'date', value: today(), max: today(), required: true });
  const valor = input({ inputmode: 'decimal', required: true, autocomplete: 'off' });
  const verificado = input({ type: 'checkbox', checked: true });
  const error = h('p', { class: 'form-error', role: 'alert' });
  const registrar = btn('Registrar pago', { icon: 'plus', kind: 'primary', type: 'submit' });
  adq.addEventListener('change', () => { loadResumen(); if (solo.checked) table.reload(true); });
  valor.placeholder = 'Ej.: 750000';
  const form = h('form', { novalidate: true, onsubmit: save },
    h('div', { class: 'form-grid' },
      field('Propietario y semana', adq), field('Número de cuota', cuota), field('Fecha de pago', fecha), field('Valor', valor),
      h('div', { class: 'field span-2' }, resumen, h('div', { class: 'progress', role: 'presentation' }, barra)),
      h('div', { class: 'end span-2' }, h('label', { class: 'check' }, verificado, 'El dinero ya fue confirmado (verificado)'), registrar)),
    error);

  root.append(
    pageHead('Pagos de cuotas', 'Registro y control de las cuotas mensuales de cada adquisición',
      btn('Exportar', { icon: 'download', onclick: async () => exportCsv('historial_pagos', columns, await table.all()) })),
    h('div', { class: 'stack' },
      h('section', { class: 'card' }, h('h2', { style: { marginBottom: '14px' } }, 'Registrar pago'), form),
      h('section', { class: 'card' },
        h('div', { class: 'card-head' }, h('h2', {}, 'Historial de pagos')),
        h('div', { class: 'toolbar' }, search.el, verif, h('label', { class: 'check' }, solo, 'Solo la adquisición elegida')),
        table.el)),
  );

  function rowActions(row) {
    return [
      row.verificado ? null : iconBtn('check', 'Verificar pago', () => verificar(row)),
      row.verificado ? iconBtn('receipt', row.comprobante ? 'Ver comprobante' : 'Emitir comprobante', () => comprobante(row)) : null,
      row.comprobante ? null : iconBtn('trash', 'Anular pago', () => anular(row)),
    ];
  }

  async function loadAdquisiciones() {
    const rows = await apiAll('/adquisiciones', { estado: 'VIGENTES' });
    rows.sort((a, b) => a.propietario.localeCompare(b.propietario, 'es') || a.semana - b.semana);
    setOptions(adq, rows.map((r) => ({ value: r.id, label: `${r.propietario} — Semana ${r.semana}` })));
  }

  /** Avance de la adquisición y siguiente cuota pendiente. */
  async function loadResumen() {
    if (!adq.value) { resumen.textContent = 'No hay adquisiciones vigentes.'; return; }
    try {
      const { data } = await api(`/adquisiciones/${adq.value}/resumen`);
      clear(resumen, h('b', { style: { color: 'var(--text)' } }, `${data.cuotas_pagadas} de ${data.num_cuotas} cuotas pagadas`), ` · Saldo ${money(data.saldo)}`);
      barra.style.width = `${(data.cuotas_pagadas * 100) / data.num_cuotas}%`;
      cuota.max = data.num_cuotas;
      cuota.value = data.siguiente_cuota ?? '';
      valor.value = String(Number(data.valor_cuota));
      registrar.disabled = data.siguiente_cuota === null;
      if (data.siguiente_cuota === null) resumen.append(' · Plan completo');
    } catch (e) {
      resumen.textContent = e.message;
    }
  }

  async function save(e) {
    e.preventDefault();
    error.textContent = '';
    const amount = toAmount(valor.value);
    const n = Number(cuota.value);
    if (!adq.value) { error.textContent = 'Seleccione el propietario y la semana.'; return; }
    if (!Number.isInteger(n) || n < 1 || n > Number(cuota.max)) { error.textContent = `La cuota debe estar entre 1 y ${cuota.max}.`; cuota.focus(); return; }
    if (!fecha.value) { error.textContent = 'Indique la fecha de pago.'; fecha.focus(); return; }
    if (!amount || Number(amount) <= 0) { error.textContent = 'Escriba un valor mayor que cero.'; valor.focus(); return; }
    await busy(registrar, async () => {
      try {
        await api('/pagos', { method: 'POST', body: { adquisicion_id: Number(adq.value), numero_cuota: n, fecha_pago: fecha.value, valor: amount, verificado: verificado.checked } });
        toast(`Pago de la cuota ${n} registrado.`);
        await Promise.all([loadResumen(), table.reload()]);
      } catch (err) {
        error.textContent = err.message;
      }
    });
  }

  async function verificar(row) {
    try {
      const r = await api(`/pagos/${row.id}/verificacion`, { method: 'PATCH' });
      toast(r.data.cambiado ? 'Pago marcado como verificado.' : 'Ese pago ya estaba verificado.');
      table.reload();
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  async function comprobante(row) {
    try {
      if (!row.comprobante) {
        const r = await api(`/pagos/${row.id}/comprobante`, { method: 'POST' });
        toast(`Comprobante ${r.data.numero} emitido.`);
      }
      location.hash = `#/comprobante/${row.id}`;
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  async function anular(row) {
    if (!await confirmar('Anular pago', `¿Anular el pago de la cuota ${row.numero_cuota} de ${row.propietario}? Esta acción no se puede deshacer.`,
      { ok: 'Anular', danger: true })) return;
    try {
      await api(`/pagos/${row.id}`, { method: 'DELETE' });
      toast('Pago anulado.');
      await Promise.all([loadResumen(), table.reload()]);
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  await Promise.all([table.reload(), loadAdquisiciones().then(loadResumen).catch((e) => { error.textContent = e.message; })]);
}
