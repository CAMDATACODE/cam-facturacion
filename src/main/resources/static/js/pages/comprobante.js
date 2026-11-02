// Comprobante de pago para ver, imprimir (o guardar como PDF) y enviar por correo.
import { api } from '../api.js';
import { logo } from '../icons.js';
import { h, pageHead, btn, toast, dialog, money, fdate, fdatetime, badge } from '../ui.js';

export default async function comprobante(root, { params }) {
  const pagoId = Number(params[0]);
  const { data: c } = await api(`/comprobantes/${pagoId}`);
  const saldo = Number(c.valor_total) - Number(c.abonado_a_la_fecha);
  const estadoEnvio = h('span', {}, badge(c.estado_envio));

  root.append(
    pageHead(`Comprobante ${c.numero}`, 'Soporte de pago para el propietario',
      btn('Volver', { icon: 'back', onclick: () => history.length > 1 ? history.back() : (location.hash = '#/comprobantes') }),
      btn('Imprimir / Guardar PDF', { icon: 'print', onclick: () => window.print() }),
      btn('Enviar por correo', { icon: 'mail', kind: 'primary', onclick: async () => {
        const estado = await enviarCorreo(pagoId);
        if (estado) estadoEnvio.replaceChildren(badge(estado));
      } })),
    h('p', { class: 'no-print muted', style: { marginTop: '-8px' } }, 'Estado de envío: ', estadoEnvio),
    h('article', { class: 'receipt', 'aria-label': `Comprobante ${c.numero}` },
      h('div', { class: 'r-head' },
        h('div', { class: 'brand' }, logo(), h('div', { class: 'r-company' }, h('b', {}, 'CAM PROYECTOS INMOBILIARIOS S.A.S.'), h('span', { class: 'muted' }, 'Bucaramanga, Santander'))),
        h('div', { class: 'r-num' }, h('div', { class: 'k' }, 'COMPROBANTE DE PAGO'), h('div', { class: 'n' }, `No. ${c.numero}`),
          h('div', { class: 'muted' }, `Emitido: ${fdatetime(c.fecha_emision)}`))),
      h('dl', {},
        h('dt', {}, 'Recibido de'), h('dd', {}, `${c.propietario} · C.C. ${c.cedula}`),
        h('dt', {}, 'Correo'), h('dd', {}, c.correo_destino),
        h('dt', {}, 'Concepto'), h('dd', {}, `Cuota ${c.numero_cuota} de ${c.num_cuotas} de la acción`),
        h('dt', {}, 'Semana'), h('dd', {}, `Semana ${c.semana} (check-in ${fdate(c.fecha_checkin)} – check-out ${fdate(c.fecha_checkout)})`),
        h('dt', {}, 'Fecha de pago'), h('dd', {}, fdate(c.fecha_pago)),
        h('dt', {}, 'Estado del pago'), h('dd', {}, c.verificado ? 'Verificado' : 'Sin verificar')),
      h('div', { class: 'total' }, h('span', {}, 'VALOR PAGADO'), h('b', {}, money(c.valor))),
      h('dl', {},
        h('dt', {}, 'Valor de la acción'), h('dd', {}, money(c.valor_total)),
        h('dt', {}, 'Abonado a la fecha'), h('dd', {}, money(c.abonado_a_la_fecha)),
        h('dt', {}, 'Saldo pendiente'), h('dd', {}, money(saldo)),
        h('dt', {}, 'Emitido por'), h('dd', {}, c.emitido_por)),
      h('p', { class: 'legal' }, 'Soporte de pago interno en formato digital (mensaje de datos, Ley 527 de 1999). No es una factura electrónica. ',
        'Datos personales tratados según la Ley 1581 de 2012.')),
  );
}

/**
 * Abre el programa de correo con el comprobante redactado y registra el resultado (ENVIADO o FALLIDO).
 * shortcut: usa mailto del equipo; para envío automático se necesita un servicio SMTP en el backend.
 */
export async function enviarCorreo(pagoId) {
  try {
    const { data: c } = await api(`/comprobantes/${pagoId}`);
    const saldo = Number(c.valor_total) - Number(c.abonado_a_la_fecha);
    const body = [`Señor(a) ${c.propietario}:`, '', 'Le enviamos el soporte de su pago.', '',
      `Comprobante: ${c.numero}`, `Cuota: ${c.numero_cuota} de ${c.num_cuotas}`, `Semana: ${c.semana}`,
      `Fecha de pago: ${fdate(c.fecha_pago)}`, `Valor pagado: ${money(c.valor)}`, `Saldo pendiente: ${money(saldo)}`, '',
      'Cordialmente,', 'CAM PROYECTOS INMOBILIARIOS S.A.S.'].join('\n');
    const link = h('a', { href: `mailto:${encodeURIComponent(c.correo_destino)}?subject=${encodeURIComponent(`Comprobante de pago ${c.numero}`)}&body=${encodeURIComponent(body)}` });
    link.click();
    const v = await dialog('Resultado del envío', h('p', {}, `Se abrió su programa de correo con el mensaje para ${c.correo_destino}. ¿El correo se envió correctamente?`),
      [{ label: 'Cancelar', value: null }, { label: 'No se envió', value: 'FALLIDO' }, { label: 'Sí, se envió', value: 'ENVIADO', kind: 'primary' }]);
    if (!v) return null;
    await api(`/comprobantes/${pagoId}/envio`, { method: 'PATCH', body: { estado: v } });
    toast(v === 'ENVIADO' ? 'Envío registrado como ENVIADO.' : 'Envío registrado como FALLIDO.');
    return v;
  } catch (e) {
    toast(e.message, 'error');
    return null;
  }
}
