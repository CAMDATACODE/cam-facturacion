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
    actions: (row) => (row.estado === 'TRASPASADA' ? null : [
      iconBtn('key', 'Vender o ceder (cambiar titular)', () => traspaso(row)),
      iconBtn('swap', 'Intercambiar con otra semana', () => intercambio(row)),
    ]),
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

  const pendientes = (row) => `${row.num_cuotas - row.cuotas_pagadas} cuotas pendientes · saldo ${money(row.saldo)}`;

  // Venta o cesión: la deuda sigue a la semana. El vendedor debe estar al día; la modalidad define quién paga lo que falta.
  async function traspaso(row) {
    const nuevo = select(owners.filter((o) => o.id !== row.propietario_id).map((o) => ({ value: o.id, label: `${o.nombre} — ${o.cedula}` })));
    const modalidad = select([
      { value: 'COMPRADOR_ASUME', label: 'El comprador asume el saldo pendiente' },
      { value: 'VENDEDOR_PAGA', label: 'El vendedor paga todo antes (paz y salvo)' },
    ]);
    const v = await dialog('Vender o ceder la semana', h('div', {},
      h('p', {}, `Semana ${row.semana} — titular actual: ${row.propietario}`),
      h('p', { class: 'muted' }, pendientes(row)),
      field('Nuevo titular', nuevo), field('¿Quién paga lo que falta?', modalidad),
      h('p', { class: 'notice' }, 'Los pagos ya hechos quedan en el historial del titular actual. El nuevo titular recibe solo las cuotas que faltan. '
        + 'En ambos casos el titular actual no puede tener cuotas vencidas.')),
    [{ label: 'Cancelar', value: null }, { label: 'Cambiar titular', value: 'ok', kind: 'primary' }]);
    if (v !== 'ok') return;
    try {
      await api(`/adquisiciones/${row.id}/traspaso`, { method: 'POST', body: { nuevo_propietario_id: Number(nuevo.value), modalidad: modalidad.value } });
      toast('Titular actualizado.');
      await Promise.all([table.reload(), loadOptions()]);
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  // Intercambio: cada propietario recibe la semana del otro con su saldo pendiente.
  async function intercambio(row) {
    let otras;
    try {
      otras = (await apiAll('/adquisiciones', { estado: 'VIGENTES' })).filter((a) => a.propietario_id !== row.propietario_id);
    } catch (err) {
      toast(err.message, 'error');
      return;
    }
    const otra = select(otras.map((a) => ({ value: a.id, label: `Semana ${a.semana} — ${a.propietario} (${a.num_cuotas - a.cuotas_pagadas} pendientes)` })));
    const v = await dialog('Intercambiar semanas', h('div', {},
      h('p', {}, `Semana ${row.semana} — ${row.propietario}`), h('p', { class: 'muted' }, pendientes(row)),
      field('Intercambiar con', otra),
      h('p', { class: 'notice' }, 'Cada propietario se queda con la semana del otro y con las cuotas que le falten a esa semana. Los dos deben estar al día.')),
    [{ label: 'Cancelar', value: null }, { label: 'Intercambiar', value: 'ok', kind: 'primary' }]);
    if (v !== 'ok' || !otra.value) return;
    try {
      await api(`/adquisiciones/${row.id}/intercambio`, { method: 'POST', body: { otra_adquisicion_id: Number(otra.value) } });
      toast('Semanas intercambiadas.');
      table.reload();
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  await Promise.all([table.reload(), loadOptions()]);
}
