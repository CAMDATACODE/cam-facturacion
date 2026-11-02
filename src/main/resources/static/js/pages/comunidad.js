// Supervisión de la comunidad por la secretaria: ver ofertas y conversaciones, cerrar o eliminar.
import { api } from '../api.js';
import { h, pageHead, select, iconBtn, dataTable, confirmar, col } from '../ui.js';
import { chatPanel, changeOffer } from '../chat.js';

export default async function comunidad(root) {
  const estado = select([{ value: 'ACTIVA', label: 'Activas' }, { value: 'RETIRADA', label: 'Retiradas' }, { value: 'CONCRETADA', label: 'Concretadas' }, { value: '', label: 'Todas' }],
    { 'aria-label': 'Estado', style: { width: 'auto' } });
  const chat = chatPanel({ canWrite: false });
  const columns = [
    col.datetime('Publicada', 'publicada_en'), { label: 'Propietario', key: 'autor' }, { label: 'Semana', key: 'semana', num: true },
    col.badge('Tipo', 'tipo'), col.money('Precio', 'precio'), { label: 'Descripción', key: 'descripcion', wrap: true },
    col.badge('Estado', 'estado'), { label: 'Mensajes', key: 'mensajes', num: true },
  ];
  const table = dataTable({
    columns, pageSize: 1000,
    load: () => api('/ofertas', { query: { estado: estado.value } }),
    onRowClick: (row) => chat.load(row.id),
    actions: (row) => [
      row.estado === 'ACTIVA' ? iconBtn('check', 'Marcar como concretada', () => act(row, 'CONCRETADA')) : null,
      row.estado === 'ACTIVA' ? iconBtn('x', 'Retirar', () => act(row, 'RETIRADA')) : null,
      iconBtn('trash', 'Eliminar', () => act(row, 'ELIMINAR')),
    ],
    empty: 'No hay ofertas con ese estado.',
  });
  estado.addEventListener('change', () => { chat.load(null); table.reload(true); });

  async function act(row, accion) {
    if (await changeOffer(row.id, accion, { confirmar })) { chat.load(null); table.reload(); }
  }

  root.append(
    pageHead('Comunidad', 'Ofertas de venta e intercambio publicadas por los propietarios'),
    h('div', { class: 'split' }, h('section', { class: 'card' }, h('div', { class: 'toolbar' }, h('span', { class: 'label' }, 'Estado'), estado), table.el), chat.el),
  );
  await table.reload();
}
