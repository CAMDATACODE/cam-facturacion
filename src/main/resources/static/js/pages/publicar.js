// FUN-COM-01: publicar una oferta de VENTA (con precio) o INTERCAMBIO (sin precio) sobre una semana propia.
import { api } from '../api.js';
import { h, pageHead, card, field, select, setOptions, input, btn, toast, busy, fdate, toAmount } from '../ui.js';

export default async function publicar(root) {
  const semana = select([]);
  const venta = h('input', { type: 'radio', name: 'tipo', value: 'VENTA' });
  const intercambio = h('input', { type: 'radio', name: 'tipo', value: 'INTERCAMBIO', checked: true });
  const precio = input({ inputmode: 'decimal', disabled: true, placeholder: 'Ej.: 19500000' });
  const descripcion = h('textarea', { class: 'input', maxlength: 500, placeholder: 'Ej.: Cambio mi semana por una de diciembre.' });
  const error = h('p', { class: 'form-error', role: 'alert' });
  const enviar = btn('Publicar oferta', { icon: 'send', kind: 'primary', type: 'submit' });
  for (const r of [venta, intercambio]) r.addEventListener('change', () => { precio.disabled = !venta.checked; if (!venta.checked) precio.value = ''; });

  root.append(
    pageHead('Publicar oferta', 'Ofrezca una de sus semanas a la comunidad de propietarios'),
    h('div', { class: 'split' },
      card('Nueva oferta', h('form', { novalidate: true, onsubmit: save },
        field('Su semana', semana),
        h('fieldset', { class: 'field', style: { border: 0, padding: 0, margin: '0 0 14px' } }, h('legend', { class: 'label', style: { marginBottom: '6px' } }, 'Tipo de oferta'),
          h('div', { class: 'radio-row' }, h('label', { class: 'check' }, intercambio, 'Intercambio'), h('label', { class: 'check' }, venta, 'Venta'))),
        field('Precio (solo para venta)', precio), field('Descripción', descripcion, 'Entre 5 y 500 caracteres.'),
        error, h('div', { class: 'form-actions' }, enviar))),
      h('section', { class: 'card side' }, h('h2', {}, 'Cómo funciona'),
        h('ol', { class: 'muted', style: { paddingLeft: '18px', margin: 0, display: 'grid', gap: '10px' } },
          h('li', {}, 'Publique su semana como venta (con precio) o como intercambio (sin precio).'),
          h('li', {}, 'Los demás propietarios le escriben en la conversación de la oferta.'),
          h('li', {}, 'Cuando lleguen a un acuerdo, márquela como concretada en «Mis ofertas» y comuníquese con la secretaria para el cambio de titular.')))),
  );

  async function load() {
    const { data } = await api('/mis-semanas');
    const libres = data.filter((s) => !s.con_oferta_activa);
    setOptions(semana, libres.length
      ? libres.map((s) => ({ value: s.adquisicion_id, label: `Semana ${s.semana} (${fdate(s.fecha_checkin)} – ${fdate(s.fecha_checkout)})` }))
      : [{ value: '', label: data.length ? 'Todas sus semanas ya tienen una oferta activa' : 'No tiene semanas vigentes' }]);
    enviar.disabled = !libres.length;
  }

  async function save(e) {
    e.preventDefault();
    error.textContent = '';
    const body = { adquisicion_id: Number(semana.value), tipo: venta.checked ? 'VENTA' : 'INTERCAMBIO', descripcion: descripcion.value.trim() };
    if (venta.checked) {
      body.precio = toAmount(precio.value);
      if (!body.precio || Number(body.precio) <= 0) { error.textContent = 'Escriba un precio mayor que cero.'; precio.focus(); return; }
    }
    if (body.descripcion.length < 5) { error.textContent = 'Escriba una descripción de al menos 5 caracteres.'; descripcion.focus(); return; }
    await busy(enviar, async () => {
      try {
        await api('/ofertas', { method: 'POST', body });
        toast('Oferta publicada. Ya aparece en «Ofertas activas».');
        descripcion.value = '';
        precio.value = '';
        await load();
      } catch (err) {
        error.textContent = err.message;
      }
    });
  }

  await load();
}
