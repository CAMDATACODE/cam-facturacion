// FUN-COM-04: el propietario retira, marca como concretada o elimina sus propias ofertas.
import { api } from '../api.js';
import { h, pageHead, iconBtn, btn, dataTable, confirmar, col } from '../ui.js';
import { chatPanel, changeOffer } from '../chat.js';

export default async function misOfertas(root) {
  const chat = chatPanel({ canWrite: true });
  const table = dataTable({
    columns: [
      col.datetime('Publicada', 'publicada_en'), { label: 'Semana', key: 'semana', num: true }, col.badge('Tipo', 'tipo'),
      col.money('Precio', 'precio'), { label: 'Descripción', key: 'descripcion', wrap: true }, col.badge('Estado', 'estado'),
      { label: 'Mensajes', key: 'mensajes', num: true },
    ],
    pageSize: 1000,
    load: () => api('/ofertas', { query: { mias: 'true' } }),
    onRowClick: (row) => chat.load(row.id),
    actions: (row) => [
      row.estado === 'ACTIVA' ? iconBtn('check', 'Marcar como concretada', () => act(row, 'CONCRETADA')) : null,
      row.estado === 'ACTIVA' ? iconBtn('x', 'Retirar', () => act(row, 'RETIRADA')) : null,
      iconBtn('trash', 'Eliminar (publicada por error)', () => act(row, 'ELIMINAR')),
    ],
    empty: 'Aún no ha publicado ofertas.',
  });

  async function act(row, accion) {
    if (await changeOffer(row.id, accion, { confirmar })) { chat.load(null); table.reload(); }
  }

  root.append(
    pageHead('Mis ofertas', 'Ofertas que usted publicó y sus conversaciones',
      btn('Publicar oferta', { icon: 'plus', kind: 'primary', onclick: () => { location.hash = '#/publicar'; } })),
    h('div', { class: 'split' }, h('section', { class: 'card' }, table.el), chat.el),
  );
  await table.reload();
}
