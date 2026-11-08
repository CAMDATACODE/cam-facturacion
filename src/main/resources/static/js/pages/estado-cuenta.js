// FUN-EDC-01: estado de cuenta por propietario (abonado, cuotas pagadas y pendientes, saldo).
import { api, apiAll, apiUpload } from '../api.js';
import { h, pageHead, select, setOptions, btn, kpi, dataTable, exportCsv, money, col, dialog, toast, busy } from '../ui.js';

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

  // Importar pagos desde Excel (.xlsx) o CSV.
  const archivo = h('input', { type: 'file', accept: '.xlsx,.csv', hidden: true, 'aria-label': 'Archivo a importar' });
  const importar = btn('Importar', { icon: 'upload', onclick: abrirImportar });
  archivo.addEventListener('change', subir);

  root.append(
    archivo,
    pageHead('Estado de cuenta', 'Avance de pago de la acción de cada propietario', propietario, importar,
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

  async function abrirImportar() {
    const info = h('div', {},
      h('p', {}, 'Cargue un archivo .xlsx o .csv con un pago por fila. La primera fila debe tener estos encabezados:'),
      h('p', { style: { fontFamily: 'monospace', fontSize: '13px' } }, 'cedula · semana · cuota · fecha_pago · valor · verificado'),
      h('p', { class: 'hint' }, 'Fecha: AAAA-MM-DD o DD/MM/AAAA. Valor: 750000 o 750.000. Verificado (opcional): Sí/No; si se deja vacío el pago queda sin verificar. '
        + 'Las cuotas ya registradas se omiten, por lo que puede volver a cargar el mismo archivo sin duplicar pagos.'));
    const r = await dialog('Importar pagos', info, [
      { label: 'Cancelar', value: null }, { label: 'Descargar plantilla', value: 'plantilla' }, { label: 'Elegir archivo', value: 'archivo', kind: 'primary' }]);
    if (r === 'plantilla') plantilla();
    if (r === 'archivo') archivo.click();
  }

  function plantilla() {
    const csv = '\uFEFFcedula;semana;cuota;fecha_pago;valor;verificado\r\n1234567890;1;1;2026-11-05;750000;Sí\r\n';
    const a = h('a', { href: URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })), download: 'plantilla_importar_pagos.csv' });
    document.body.append(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  async function subir() {
    const file = archivo.files[0];
    archivo.value = '';
    if (!file) return;
    await busy(importar, async () => {
      try {
        toast(`Importando ${file.name}…`);
        const { data: r } = await apiUpload('/estado-cuenta/importar', file);
        const lista = r.errores.length
          ? h('ul', { style: { maxHeight: '180px', overflowY: 'auto', paddingLeft: '18px', fontSize: '13px' } },
            r.errores.map((e) => h('li', {}, `Fila ${e.fila}: ${e.mensaje}`)),
            r.errores_truncados ? h('li', {}, 'Hay más errores; corrija estos y vuelva a cargar el archivo.') : null)
          : null;
        await dialog('Resultado de la importación', h('div', {},
          h('p', {}, `Filas leídas: ${r.filas}. Pagos importados: ${r.importadas}. Omitidos (ya registrados): ${r.omitidas}. Con error: ${r.con_error}.`),
          lista), [{ label: 'Cerrar', value: true, kind: 'primary' }]);
        await load();
      } catch (e) {
        toast(e.message, 'error');
      }
    });
  }

  const owners = await apiAll('/propietarios');
  setOptions(propietario, [{ value: '', label: '— Todos los propietarios —' }, ...owners.map((p) => ({ value: p.id, label: `${p.nombre} — ${p.cedula}` }))]);
  await load();
}
