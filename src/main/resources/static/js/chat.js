// Conversación sobre una oferta (FUN-COM-03): mensajes en orden cronológico con autor, fecha y hora.
import { api } from './api.js';
import { h, clear, fdatetime, toast, busy } from './ui.js';
import { icon } from './icons.js';

export function chatPanel({ canWrite }) {
  const title = h('h2', {}, 'Conversación');
  const sub = h('p', { class: 'muted', style: { margin: '2px 0 12px' } }, 'Seleccione una oferta para ver los mensajes.');
  const msgs = h('div', { class: 'msgs', role: 'log', 'aria-live': 'polite' });
  const text = h('input', { class: 'input', placeholder: 'Escriba un mensaje…', maxlength: 1000, 'aria-label': 'Mensaje', disabled: true });
  const send = h('button', { class: 'btn btn-primary', type: 'submit', 'aria-label': 'Enviar', disabled: true }, icon('send'));
  const form = h('form', { onsubmit: submit }, text, send);
  const el = h('section', { class: 'card chat side' }, title, sub, msgs, canWrite ? form : null);
  let ofertaId = null;

  async function load(id) {
    ofertaId = id;
    if (!id) {
      title.textContent = 'Conversación';
      sub.textContent = 'Seleccione una oferta para ver los mensajes.';
      clear(msgs);
      text.disabled = send.disabled = true;
      return;
    }
    clear(msgs, h('p', { class: 'state' }, 'Cargando…'));
    try {
      const { data } = await api(`/ofertas/${id}/mensajes`);
      const o = data.oferta;
      title.textContent = `Semana ${o.semana} · ${o.tipo === 'VENTA' ? 'Venta' : 'Intercambio'}`;
      const activa = o.estado === 'ACTIVA';
      sub.textContent = activa ? (canWrite ? 'Negocie aquí con otros propietarios.' : 'Solo lectura: los mensajes los escriben los propietarios.')
        : 'La oferta ya no está activa: solo lectura.';
      text.disabled = send.disabled = !(activa && canWrite);
      clear(msgs, data.mensajes.length ? data.mensajes.map((m) => h('div', { class: `bubble ${m.es_mio ? 'mine' : ''}` },
        h('div', { class: 'who' }, `${m.autor} · ${fdatetime(m.enviado_en)}`), m.texto)) : h('p', { class: 'state' }, 'Aún no hay mensajes.'));
      msgs.scrollTop = msgs.scrollHeight;
    } catch (e) {
      clear(msgs, h('p', { class: 'state error' }, e.message));
    }
  }

  async function submit(e) {
    e.preventDefault();
    const t = text.value.trim();
    if (!t || !ofertaId) return;
    await busy(send, async () => {
      try {
        await api(`/ofertas/${ofertaId}/mensajes`, { method: 'POST', body: { texto: t } });
        text.value = '';
        await load(ofertaId);
        text.focus();
      } catch (err) {
        toast(err.message, 'error');
      }
    });
  }

  return { el, load };
}

/** Retira, marca como concretada o elimina una oferta. Devuelve true si cambió. */
export async function changeOffer(id, accion, { confirmar }) {
  const textos = {
    CONCRETADA: ['Marcar como concretada', '¿Marcar la oferta como concretada? Dejará de aparecer en las ofertas activas.', 'Concretada'],
    RETIRADA: ['Retirar oferta', '¿Retirar la oferta? Dejará de aparecer en las ofertas activas.', 'Retirar'],
    ELIMINAR: ['Eliminar oferta', '¿Eliminar la oferta y sus mensajes? Úselo solo si se publicó por error.', 'Eliminar'],
  }[accion];
  if (!await confirmar(textos[0], textos[1], { ok: textos[2], danger: accion === 'ELIMINAR' })) return false;
  try {
    if (accion === 'ELIMINAR') await api(`/ofertas/${id}`, { method: 'DELETE' });
    else await api(`/ofertas/${id}/estado`, { method: 'PATCH', body: { estado: accion } });
    toast('Oferta actualizada.');
    return true;
  } catch (e) {
    toast(e.message, 'error');
    return false;
  }
}

