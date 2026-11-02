// FUN-SEM-02: asignar semanas a propietarios (adquisición de la acción) y cambiar de titular.
import { api, apiAll } from '../api.js';
import { h, pageHead, field, input, select, setOptions, btn, iconBtn, dataTable, searchBox, exportCsv, toast, busy, dialog, money, today, col } from '../ui.js';

export default async function asignaciones(root) {
  let q = '';
  const estado = select(['VIGENTES', 'ACTIVA', 'PAGADA', 'TRASPASADA', 'TODAS'].map((v) => ({ value: v, label: v === 'VIGENTES' ? 'Vigentes' : v === 'TODAS' ? 'Todas' : v[0] + v.slice(1).toLowerCase() })),
    { 'aria-label': 'Estado', style: { width: 'auto' } });
  const columns = [
    { label: 'Propietario', key: 'propietario' }, { label: 'Cédula', key: 'cedula', nowrap: true },
    { label: 'Semana', key: 'semana', num: true }, col.date('Inicio plan', 'fecha_inicio'),
    col.money('Valor cuota', 'valor_cuota'), { label: 'Pagadas', value: (r) => `${r.cuotas_pagadas} / ${r.num_cuotas}`, num: true },
    col.money('Saldo', 'saldo'), col.badge('Estado', 'estado'),
  ];
  const table = dataTable({
    columns, pageSize: 25,
    load: (p) => api('/adquisiciones', { query: { q, estado: estado.value, ...p } }),
    actions: (row) => (row.estado === 'TRASPASADA' ? null : iconBtn('swap', 'Cambiar titular', () => traspaso(row))),
  });
  const search = searchBox('Buscar por cédula, nombre o semana', (v) => { q = v; table.reload(true); });
  estado.addEventListener('change', () => table.reload(true));

  const propietario = select([]);
  const semana = select([]);
  const inicio = input({ type: 'date', value: today().slice(0, 8) + '01' });
  const condiciones = h('p', { class: 'muted', style: { margin: 0 } }, '—');
  const error = h('p', { class: 'form-error', role: 'alert' });
  const asignar = btn('Asignar semana', { icon: 'check', kind: 'primary', type: 'submit' });
  const form = h('form', { novalidate: true, onsubmit: save },
    field('Propietario', propietario), field('Semana libre', semana), field('Inicio del plan de cuotas', inicio),
    h('div', { class: 'field' }, h('span', { class: 'label' }, 'Condiciones vigentes'), condiciones),
    error, h('div', { class: 'form-actions' }, asignar),
    h('p', { class: 'hint', style: { marginTop: '14px' } }, 'Una semana pertenece a un solo propietario a la vez; un propietario puede tener varias.'));

  root.append(
    pageHead('Asignaciones', 'Vínculo entre propietarios y semanas (adquisiciones de la acción)',
      btn('Exportar', { icon: 'download', onclick: async () => exportCsv('asignaciones', columns, await table.all()) })),
    h('div', { class: 'split' },
      h('section', { class: 'card' }, h('div', { class: 'toolbar' }, search.el, estado), table.el),
      h('section', { class: 'card side' }, h('h2', { style: { marginBottom: '14px' } }, 'Nueva asignación'), form)),
  );

  let owners = [];
  async function loadOptions() {
    try {
      owners = await apiAll('/propietarios');
      setOptions(propietario, owners.map((p) => ({ value: p.id, label: `${p.nombre} — ${p.cedula}` })));
      const libres = (await api('/semanas', { query: { estado: 'libres' } })).data;
      setOptions(semana, libres.length ? libres.map((s) => ({ value: s.id, label: `Semana ${s.numero} (${s.fecha_checkin.split('-').reverse().join('/')})` }))
        : [{ value: '', label: 'No hay semanas libres' }]);
      const p = (await api('/parametros')).data;
      condiciones.textContent = `${money(p.valor_total)} en ${p.num_cuotas} cuotas de ${money(p.valor_cuota)}`;
    } catch (e) {
      error.textContent = e.message;
    }
  }

  async function save(e) {
    e.preventDefault();
    error.textContent = '';
    if (!semana.value) { error.textContent = 'No hay una semana libre seleccionada.'; return; }
    await busy(asignar, async () => {
      try {
        await api('/adquisiciones', { method: 'POST', body: { propietario_id: Number(propietario.value), semana_id: Number(semana.value), fecha_inicio: inicio.value } });
        toast('Semana asignada.');
        await Promise.all([table.reload(), loadOptions()]);
      } catch (err) {
        error.textContent = err.message;
      }
    });
  }

  async function traspaso(row) {
    const nuevo = select(owners.filter((o) => o.id !== row.propietario_id).map((o) => ({ value: o.id, label: `${o.nombre} — ${o.cedula}` })));
    const v = await dialog('Cambiar titular', h('div', {},
      h('p', {}, `Semana ${row.semana} — titular actual: ${row.propietario}`),
      field('Nuevo titular', nuevo),
      h('p', { class: 'notice' }, 'Los pagos anteriores quedan en el historial del titular actual y el nuevo titular inicia un plan con las mismas condiciones. Procedimiento pendiente de confirmar con CAM.')),
    [{ label: 'Cancelar', value: null }, { label: 'Cambiar titular', value: 'ok', kind: 'primary' }]);
    if (v !== 'ok') return;
    try {
      await api(`/adquisiciones/${row.id}/traspaso`, { method: 'POST', body: { nuevo_propietario_id: Number(nuevo.value) } });
      toast('Titular actualizado.');
      table.reload();
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  await Promise.all([table.reload(), loadOptions()]);
}
