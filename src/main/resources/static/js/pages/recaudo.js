// FUN-EDC-02: control del recaudo mensual. La cuota k vence en el mes (inicio del plan + k - 1).
import { api } from '../api.js';
import { h, pageHead, select, input, btn, kpi, dataTable, exportCsv, money, verifiedBadge, today, col } from '../ui.js';

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

export default async function recaudo(root) {
  const [y, m] = today().split('-').map(Number);
  const mes = select(MESES.map((n, i) => ({ value: i + 1, label: n })), { 'aria-label': 'Mes', style: { width: 'auto' } });
  mes.value = String(m);
  const anio = input({ type: 'number', min: 2020, max: 2100, value: y, 'aria-label': 'Año', style: { width: '100px' } });
  const k = {
    esperado: kpi('Esperado en el mes', 'var(--primary)'), recaudado: kpi('Recaudado en el mes', 'var(--green)'),
    pendientes: kpi('Con cuota pendiente', 'var(--amber)'), sinVerificar: kpi('Pagos sin verificar', 'var(--red)'),
  };
  let data = { pendientes: [], sin_verificar: [] };
  const pendCols = [
    { label: 'Propietario', key: 'propietario' }, { label: 'Cédula', key: 'cedula', nowrap: true },
    { label: 'Semana', key: 'semana', num: true }, { label: 'Cuota', key: 'cuota', num: true },
    col.money('Valor', 'valor'), { label: 'Correo', key: 'correo' },
  ];
  const verCols = [
    { label: 'Propietario', key: 'propietario' }, { label: 'Semana', key: 'semana', num: true },
    { label: 'Cuota', key: 'numero_cuota', num: true }, col.date('Fecha', 'fecha_pago'), col.money('Valor', 'valor'),
    { label: 'Estado', value: () => false, format: verifiedBadge, csv: () => 'Sin verificar' },
  ];
  const t1 = dataTable({ columns: pendCols, pageSize: 1000, load: async () => ({ data: data.pendientes }), empty: 'Todos los propietarios tienen registrada la cuota del mes.' });
  const t2 = dataTable({ columns: verCols, pageSize: 1000, load: async () => ({ data: data.sin_verificar }), empty: 'No hay pagos sin verificar.' });

  root.append(
    pageHead('Recaudo mensual', 'Quién no ha pagado la cuota del mes y qué pagos falta verificar', h('span', { class: 'label' }, 'Periodo'), mes, anio),
    h('div', { class: 'kpis' }, Object.values(k).map((x) => x.el)),
    h('div', { class: 'grid-2' },
      h('section', { class: 'card' }, h('div', { class: 'card-head' }, h('h2', {}, 'Cuota del mes sin pago registrado'),
        btn('Exportar', { icon: 'download', size: 'sm', onclick: () => exportCsv(`cuotas_pendientes_${anio.value}-${String(mes.value).padStart(2, '0')}`, pendCols, data.pendientes) })), t1.el),
      h('section', { class: 'card' }, h('div', { class: 'card-head' }, h('h2', {}, 'Pagos sin verificar'),
        btn('Exportar', { icon: 'download', size: 'sm', onclick: () => exportCsv('pagos_sin_verificar', verCols, data.sin_verificar) })), t2.el)),
  );

  async function load() {
    const a = Number(anio.value);
    if (!Number.isInteger(a) || a < 2020 || a > 2100) return;
    try {
      data = (await api('/recaudo', { query: { anio: a, mes: mes.value } })).data;
      k.esperado.set(money(data.esperado.valor), `${data.esperado.cuotas} cuotas vencen en ${MESES[mes.value - 1].toLowerCase()}`);
      k.recaudado.set(money(data.recaudado.valor), `${data.recaudado.pagos} pagos con fecha en el mes`);
      k.pendientes.set(data.pendientes.length, 'sin pago de la cuota del mes');
      k.sinVerificar.set(data.sin_verificar.length, 'en total, de cualquier mes');
    } catch (e) {
      data = { pendientes: [], sin_verificar: [] };
      k.esperado.set('—', e.message);
    }
    await Promise.all([t1.reload(), t2.reload()]);
  }
  mes.addEventListener('change', load);
  anio.addEventListener('change', load);
  await load();
}
