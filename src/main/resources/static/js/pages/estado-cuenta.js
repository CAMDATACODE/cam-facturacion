// FUN-EDC-01: estado de cuenta por propietario (abonado, cuotas pagadas y pendientes, saldo).
import { api, apiAll } from '../api.js';
import { h, pageHead, select, setOptions, btn, kpi, dataTable, exportCsv, money, col } from '../ui.js';

export default async function estadoCuenta(root) {
  const propietario = select([{ value: '', label: '— Todos los propietarios —' }], { 'aria-label': 'Propietario', style: { width: 'min(340px, 100%)' } });
  const k = {
    abonado: kpi('Total abonado', 'var(--green)'), pagadas: kpi('Cuotas pagadas', 'var(--blue)'),
    pendientes: kpi('Cuotas pendientes', 'var(--amber)'), saldo: kpi('Saldo restante', 'var(--red)'),
  };
  const resumenCols = [
    { label: 'Propietario', key: 'propietario' }, { label: 'Cédula', key: 'cedula', nowrap: true },
    { label: 'Semana', key: 'semana', num: true }, col.money('Valor acción', 'valor_total'),
    { label: 'Pagadas', key: 'cuotas_pagadas', num: true }, { label: 'Pendientes', key: 'cuotas_pendientes', num: true },
    col.money('Abonado', 'total_abonado'), col.money('Saldo', 'saldo'), col.badge('Estado', 'estado'),
  ];
  const cuotaCols = [
    { label: 'Semana', key: 'semana', num: true }, { label: 'Cuota', key: 'cuota', num: true },
    col.date('Vence', 'vence'), col.date('Fecha de pago', 'fecha_pago'), col.money('Valor', 'valor'), col.badge('Estado', 'estado'),
  ];
  let filas = [];
  const titulo = h('h2', {}, 'Resumen por propietario y semana');
  const host = h('div', {});
  let table;

  root.append(
    pageHead('Estado de cuenta', 'Avance de pago de la acción de cada propietario', propietario,
      btn('Exportar', { icon: 'download', onclick: () => exportCsv('estado_de_cuenta', propietario.value ? cuotaCols : resumenCols, filas) })),
    h('div', { class: 'kpis' }, Object.values(k).map((x) => x.el)),
    h('section', { class: 'card' }, h('div', { class: 'card-head' }, titulo), host),
  );

  async function load() {
    const id = propietario.value;
    table = dataTable({
      columns: id ? cuotaCols : resumenCols, pageSize: 1000,
      load: async () => {
        const { data } = await api('/estado-cuenta', { query: { propietario_id: id } });
        const r = data.resumen;
        k.abonado.set(money(r.total_abonado), `de ${money(r.valor_total)}`);
        k.pagadas.set(r.cuotas_pagadas, `${r.semanas} semana(s)`);
        k.pendientes.set(r.cuotas_pendientes, 'por pagar');
        k.saldo.set(money(r.saldo), 'frente al valor de la acción');
        filas = data.filas;
        return { data: filas, total: filas.length };
      },
      empty: 'Sin información.',
    });
    titulo.textContent = id ? 'Cuotas del propietario (una fila por cuota del plan)' : 'Resumen por propietario y semana';
    host.replaceChildren(table.el);
    await table.reload();
  }
  propietario.addEventListener('change', load);

  const owners = await apiAll('/propietarios');
  setOptions(propietario, [{ value: '', label: '— Todos los propietarios —' }, ...owners.map((p) => ({ value: p.id, label: `${p.nombre} — ${p.cedula}` }))]);
  await load();
}
