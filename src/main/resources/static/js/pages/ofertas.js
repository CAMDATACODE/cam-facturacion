// FUN-COM-02 y FUN-COM-03: ofertas activas con filtros por tipo y fecha, y conversación.
import { api } from '../api.js';
import { h, clear, pageHead, select, badge, money, fdate, fdatetime } from '../ui.js';
import { chatPanel } from '../chat.js';

export default async function ofertas(root) {
  const tipo = select([{ value: '', label: 'Todas' }, { value: 'VENTA', label: 'Venta' }, { value: 'INTERCAMBIO', label: 'Intercambio' }],
    { 'aria-label': 'Tipo', style: { width: 'auto' } });
  const dias = select([{ value: '', label: 'Cualquier fecha' }, { value: 7, label: 'Últimos 7 días' }, { value: 30, label: 'Últimos 30 días' }, { value: 90, label: 'Últimos 90 días' }],
    { 'aria-label': 'Fecha de publicación', style: { width: 'auto' } });
  const list = h('div', { class: 'offers' });
  const chat = chatPanel({ canWrite: true });
  tipo.addEventListener('change', load);
  dias.addEventListener('change', load);

  root.append(
    pageHead('Ofertas activas', 'Semanas que los propietarios venden o quieren intercambiar'),
    h('div', { class: 'split' },
      h('section', {}, h('div', { class: 'toolbar' }, h('span', { class: 'label' }, 'Tipo'), tipo, h('span', { class: 'label' }, 'Publicadas'), dias), list),
      chat.el),
  );

  async function load() {
    clear(list, h('p', { class: 'state' }, 'Cargando…'));
    chat.load(null);
    try {
      const { data } = await api('/ofertas', { query: { tipo: tipo.value, dias: dias.value } });
      clear(list, data.length ? data.map(offerCard) : h('p', { class: 'state' }, 'No hay ofertas activas con ese filtro.'));
    } catch (e) {
      clear(list, h('p', { class: 'state error' }, e.message));
    }
  }

  function offerCard(o) {
    const c = h('article', { class: 'card offer', tabindex: 0, 'aria-label': `Semana ${o.semana}, ${o.tipo}` },
      h('div', { class: 'top' }, badge(o.tipo), h('span', { class: 'muted' }, fdatetime(o.publicada_en))),
      h('h3', {}, `Semana ${o.semana}`),
      h('div', { class: 'muted' }, `${fdate(o.fecha_checkin)} – ${fdate(o.fecha_checkout)}`),
      o.precio ? h('div', { class: 'price' }, money(o.precio)) : null,
      h('p', { style: { margin: 0 } }, o.descripcion),
      h('div', { class: 'meta' }, h('span', {}, `Publicada por ${o.autor}`), h('span', {}, `${o.mensajes} mensaje(s)`)));
    const open = () => {
      list.querySelectorAll('.offer.selected').forEach((x) => x.classList.remove('selected'));
      c.classList.add('selected');
      chat.load(o.id);
      if (matchMedia('(max-width: 1180px)').matches) chat.el.scrollIntoView({ behavior: 'smooth' });
    };
    c.addEventListener('click', open);
    c.addEventListener('keydown', (e) => { if (e.key === 'Enter') open(); });
    return c;
  }

  await load();
}
