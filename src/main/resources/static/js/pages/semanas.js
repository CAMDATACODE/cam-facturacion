// FUN-SEM-01: semanas de uso de la vivienda turística y su titular.
import { api } from '../api.js';
import { h, pageHead, field, input, select, btn, iconBtn, dataTable, exportCsv, toast, busy, col } from '../ui.js';

export default async function semanas(root) {
  let editId = null;
  const filtro = select([{ value: 'todas', label: 'Todas' }, { value: 'libres', label: 'Libres' }, { value: 'asignadas', label: 'Asignadas' }],
    { 'aria-label': 'Mostrar', style: { width: 'auto' } });
  const columns = [
    { label: 'Semana', key: 'numero', num: true },
    col.date('Check-in', 'fecha_checkin'), col.date('Check-out', 'fecha_checkout'),
    { label: 'Noches', key: 'noches', num: true },
    { label: 'Titular', key: 'titular', format: (v) => v || '—' },
    col.badge('Estado', 'estado'),
  ];
  const table = dataTable({
    columns, pageSize: 100,
    load: () => api('/semanas', { query: { estado: filtro.value } }),
    onRowClick: edit, actions: (row) => iconBtn('edit', 'Editar', () => edit(row)),
  });
  filtro.addEventListener('change', () => table.reload(true));

  const title = h('h2', { style: { marginBottom: '14px' } }, 'Nueva semana');
  const numero = input({ type: 'number', min: 1, max: 999 });
  const checkin = input({ type: 'date' });
  const checkout = input({ type: 'date' });
  const error = h('p', { class: 'form-error', role: 'alert' });
  const guardar = btn('Guardar', { icon: 'check', kind: 'primary', type: 'submit' });
  // Las noches siempre se calculan con las fechas elegidas; no hay un valor fijo.
  const noches = h('div', { class: 'muted' }, ' ');
  const showNoches = () => {
    const n = diffDays(checkin.value, checkout.value);
    noches.textContent = n === null ? ' ' : n > 0 ? `Noches: ${n}` : 'El check-out debe ser posterior al check-in.';
  };
  checkin.addEventListener('change', showNoches);
  checkout.addEventListener('change', showNoches);
  const form = h('form', { novalidate: true, onsubmit: save },
    field('Número de semana', numero), field('Fecha de check-in', checkin), field('Fecha de check-out', checkout), noches,
    error, h('div', { class: 'form-actions' }, guardar, btn('Nueva', { icon: 'plus', onclick: reset })));

  root.append(
    pageHead('Semanas', 'Semanas de uso de la vivienda turística y su titular actual',
      btn('Exportar', { icon: 'download', onclick: () => exportCsv('semanas', columns, table.rows()) })),
    h('div', { class: 'split' },
      h('section', { class: 'card' }, h('div', { class: 'toolbar' }, h('span', { class: 'label' }, 'Mostrar'), filtro), table.el),
      h('section', { class: 'card side' }, title, form)),
  );

  async function reset() {
    editId = null;
    form.reset();
    error.textContent = '';
    noches.textContent = ' ';
    title.textContent = 'Nueva semana';
    table.select(null);
    const max = Math.max(0, ...table.rows().map((r) => r.numero));
    numero.value = max + 1;
  }

  function edit(row) {
    editId = row.id;
    numero.value = row.numero;
    checkin.value = row.fecha_checkin;
    checkout.value = row.fecha_checkout;
    title.textContent = `Editar semana ${row.numero}`;
    error.textContent = '';
    showNoches();
    table.select(row.id);
  }

  async function save(e) {
    e.preventDefault();
    error.textContent = '';
    if (!checkin.value || !checkout.value) { error.textContent = 'Indique las dos fechas.'; return; }
    if (checkout.value <= checkin.value) { error.textContent = 'La fecha de check-out debe ser posterior a la de check-in.'; return; }
    await busy(guardar, async () => {
      try {
        const body = { numero: Number(numero.value), fecha_checkin: checkin.value, fecha_checkout: checkout.value };
        await api(editId ? `/semanas/${editId}` : '/semanas', { method: editId ? 'PUT' : 'POST', body });
        toast('Semana guardada.');
        await table.reload();
        reset();
      } catch (err) {
        error.textContent = err.message;
      }
    });
  }

  await table.reload();
  reset();
}

/** Noches entre dos fechas AAAA-MM-DD; null si falta alguna. */
function diffDays(from, to) {
  if (!from || !to) return null;
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);
}
