// FUN-CMP-01 y FUN-CMP-02: comprobantes emitidos, su consulta y estado de envío.
import { api } from '../api.js';
import { h, pageHead, select, btn, iconBtn, dataTable, searchBox, exportCsv, toast, busy, confirmar, col } from '../ui.js';
import { enviarCorreo } from './comprobante.js';

export default async function comprobantes(root) {
  let q = '';
  const envio = select([{ value: '', label: 'Todos' }, { value: 'PENDIENTE', label: 'Pendiente' }, { value: 'ENVIADO', label: 'Enviado' }, { value: 'FALLIDO', label: 'Fallido' }],
    { 'aria-label': 'Estado de envío', style: { width: 'auto' } });
  const pendientes = btn('Emitir pendientes', { icon: 'receipt', kind: 'primary', onclick: emitirPendientes });
  const columns = [
    { label: 'Número', key: 'numero', nowrap: true }, col.datetime('Emisión', 'fecha_emision'),
    { label: 'Propietario', key: 'propietario' }, { label: 'Semana', key: 'semana', num: true },
    { label: 'Cuota', key: 'numero_cuota', num: true }, col.money('Valor', 'valor'),
    { label: 'Correo', key: 'correo_destino' }, col.badge('Envío', 'estado_envio'),
  ];
  const table = dataTable({
    columns,
    load: async (p) => {
      const r = await api('/comprobantes', { query: { q, estado_envio: envio.value, ...p } });
      pendientes.lastChild.textContent = `Emitir pendientes (${r.pendientes_por_emitir})`;
      pendientes.disabled = r.pendientes_por_emitir === 0;
      return r;
    },
    onRowClick: (row) => { location.hash = `#/comprobante/${row.id}`; },
    actions: (row) => [
      iconBtn('eye', 'Ver e imprimir', () => { location.hash = `#/comprobante/${row.id}`; }),
      iconBtn('mail', 'Enviar por correo', async () => { if (await enviarCorreo(row.id)) table.reload(); }),
    ],
    empty: 'No hay comprobantes con ese criterio.',
  });
  const search = searchBox('Buscar por número, cédula o nombre', (v) => { q = v; table.reload(true); });
  envio.addEventListener('change', () => table.reload(true));

  root.append(
    pageHead('Comprobantes', 'Soportes de pago emitidos y su estado de envío', pendientes,
      btn('Exportar', { icon: 'download', onclick: async () => exportCsv('comprobantes', columns, await table.all()) })),
    h('section', { class: 'card' }, h('div', { class: 'toolbar' }, search.el, h('span', { class: 'label' }, 'Envío'), envio), table.el),
  );

  async function emitirPendientes() {
    if (!await confirmar('Emitir comprobantes', '¿Emitir comprobante para todos los pagos verificados que aún no lo tienen?', { ok: 'Emitir' })) return;
    await busy(pendientes, async () => {
      try {
        const r = await api('/comprobantes/emitir-pendientes', { method: 'POST' });
        toast(`${r.data.emitidos} comprobantes emitidos.`);
        table.reload();
      } catch (e) {
        toast(e.message, 'error');
      }
    });
  }

  await table.reload();
}
