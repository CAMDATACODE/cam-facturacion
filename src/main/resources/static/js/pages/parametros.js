// FUN-REP-01: condiciones de la acción que usan las nuevas asignaciones.
import { api } from '../api.js';
import { h, pageHead, card, field, input, btn, toast, busy, confirmar, money, fdatetime, toAmount, cents } from '../ui.js';

export default async function parametros(root) {
  const total = input({ inputmode: 'decimal' });
  const cuotas = input({ type: 'number', min: 1, max: 120 });
  const cuota = input({ inputmode: 'decimal' });
  const info = h('p', { class: 'hint' }, ' ');
  const vista = h('p', { class: 'muted' }, ' ');
  const error = h('p', { class: 'form-error', role: 'alert' });
  const guardar = btn('Guardar', { icon: 'check', kind: 'primary', type: 'submit' });
  const calcular = btn('Calcular cuota', { icon: 'refresh', onclick: () => {
    const t = toAmount(total.value);
    const n = Number(cuotas.value);
    if (t && n > 0) cuota.value = String(Math.round(cents(t) / n) / 100);
    preview();
  } });
  for (const i of [total, cuotas, cuota]) i.addEventListener('input', preview);

  root.append(
    pageHead('Parámetros', 'Condiciones de la acción'),
    h('div', { class: 'grid-2' },
      card('Condiciones vigentes', h('form', { novalidate: true, onsubmit: save },
        field('Valor total de la acción', total), field('Número de cuotas', cuotas),
        field('Valor de la cuota', cuota), h('div', { class: 'form-actions', style: { marginTop: '-4px', marginBottom: '14px' } }, calcular),
        vista, info, error, h('div', { class: 'form-actions' }, guardar))),
      card('Importante', h('p', { class: 'notice' }, 'Un cambio aquí solo aplica a las nuevas asignaciones. Las adquisiciones existentes conservan sus condiciones y los pagos históricos no se modifican.'))),
  );

  // Vista previa con centavos enteros; el servidor y PostgreSQL validan de nuevo.
  function preview() {
    const t = toAmount(total.value);
    const c = toAmount(cuota.value);
    const n = Number(cuotas.value);
    if (!t || !c || !Number.isInteger(n) || n < 1) { vista.textContent = ' '; return; }
    const ok = cents(c) * n === cents(t);
    vista.textContent = `${n} × ${money(c)} = ${money((cents(c) * n) / 100)} ${ok ? '✓ coincide con el valor total' : '✗ no coincide con el valor total'}`;
    vista.style.color = ok ? 'var(--green)' : 'var(--red)';
  }

  async function load() {
    const { data } = await api('/parametros');
    total.value = String(Number(data.valor_total));
    cuotas.value = data.num_cuotas;
    cuota.value = String(Number(data.valor_cuota));
    info.textContent = `Última actualización: ${fdatetime(data.actualizado_en)}${data.actualizado_por ? ` por ${data.actualizado_por}` : ''}`;
    preview();
  }

  async function save(e) {
    e.preventDefault();
    error.textContent = '';
    const t = toAmount(total.value);
    const c = toAmount(cuota.value);
    const n = Number(cuotas.value);
    if (!t || !c || !Number.isInteger(n) || n < 1 || n > 120) { error.textContent = 'Revise los valores: deben ser mayores que cero y las cuotas entre 1 y 120.'; return; }
    if (cents(c) * n !== cents(t)) { error.textContent = 'El número de cuotas por el valor de la cuota debe ser igual al valor total.'; return; }
    if (!await confirmar('Guardar parámetros', '¿Guardar las nuevas condiciones? Solo afectan las próximas asignaciones.', { ok: 'Guardar' })) return;
    await busy(guardar, async () => {
      try {
        await api('/parametros', { method: 'PUT', body: { valor_total: t, num_cuotas: n, valor_cuota: c } });
        toast('Parámetros guardados.');
        await load();
      } catch (err) {
        error.textContent = err.message;
      }
    });
  }

  await load();
}
