// FUN-PRO-01, FUN-PRO-02 y FUN-SEM-03: registrar, buscar y editar propietarios; ver sus semanas; acceso a la comunidad.
import { api } from '../api.js';
import { h, clear, pageHead, card, field, input, btn, iconBtn, badge, dataTable, searchBox, exportCsv, toast, busy, dialog, fdate } from '../ui.js';

export default async function propietarios(root) {
  let q = '';
  let editId = null;
  const columns = [
    { label: 'Cédula', key: 'cedula', nowrap: true },
    { label: 'Nombre', key: 'nombre', csv: (v) => v, format: (v, r) => h('div', {}, h('div', {}, v), h('div', { class: 'hint' }, r.correo)) },
    { label: 'Correo', key: 'correo', csvOnly: true },
    { label: 'Semanas', key: 'semanas', num: true },
    { label: 'Comunidad', key: 'acceso_comunidad', format: (v) => badge(v ? 'Sí' : 'No') },
  ];
  const table = dataTable({
    columns,
    load: (p) => api('/propietarios', { query: { q, ...p } }),
    onRowClick: (row) => edit(row.id),
    actions: (row) => iconBtn('edit', 'Editar', () => edit(row.id)),
    empty: 'No hay propietarios con ese criterio.',
  });
  const search = searchBox('Buscar por cédula o nombre', (v) => { q = v; table.reload(true); });

  // Formulario
  const title = h('h2', {}, 'Nuevo propietario');
  const cedula = input({ inputmode: 'numeric', maxlength: 15, autocomplete: 'off' });
  const nombre = input({ maxlength: 120, autocomplete: 'off' });
  const correo = input({ type: 'email', maxlength: 150, autocomplete: 'off' });
  const clave = input({ type: 'password', maxlength: 128, autocomplete: 'new-password' });
  const claveField = field('Contraseña de la comunidad (opcional)', clave, 'Su usuario será la cédula.');
  const error = h('p', { class: 'form-error', role: 'alert' });
  const guardar = btn('Guardar', { icon: 'check', kind: 'primary', type: 'submit' });
  const nuevo = btn('Nuevo', { icon: 'plus', onclick: reset });
  const acceso = btn('Cambiar contraseña de la comunidad', { icon: 'key', onclick: cambiarAcceso, size: 'sm' });
  const semanas = h('div', {});
  const form = h('form', { novalidate: true, onsubmit: save },
    field('Cédula', cedula), field('Nombre completo', nombre), field('Correo electrónico', correo), claveField,
    error, h('div', { class: 'form-actions' }, guardar, nuevo));
  const extra = h('div', { hidden: true }, h('hr', { style: { border: 0, borderTop: '1px solid var(--border)', margin: '18px 0' } }),
    h('div', { class: 'card-head' }, h('h2', {}, 'Semanas del propietario')), semanas, h('div', { style: { marginTop: '12px' } }, acceso));

  root.append(
    pageHead('Propietarios', 'Registro y consulta de los titulares de semanas',
      btn('Exportar', { icon: 'download', onclick: async () => exportCsv('propietarios', columns, await table.all()) })),
    h('div', { class: 'split' },
      h('section', { class: 'card' }, h('div', { class: 'toolbar' }, search.el), table.el),
      h('section', { class: 'card side' }, title, form, extra)),
  );
  title.style.marginBottom = '14px';

  function reset() {
    editId = null;
    form.reset();
    cedula.disabled = false;
    claveField.hidden = false;
    extra.hidden = true;
    title.textContent = 'Nuevo propietario';
    error.textContent = '';
    table.select(null);
    cedula.focus();
  }

  async function edit(id) {
    try {
      const { data } = await api(`/propietarios/${id}`);
      editId = id;
      cedula.value = data.cedula;
      cedula.disabled = true;
      nombre.value = data.nombre;
      correo.value = data.correo;
      claveField.hidden = true;
      extra.hidden = false;
      title.textContent = 'Editar propietario';
      error.textContent = '';
      acceso.lastChild.textContent = data.acceso_comunidad ? 'Cambiar contraseña de la comunidad' : 'Dar acceso a la comunidad';
      clear(semanas, data.semanas.length
        ? h('div', { class: 'table-wrap' }, h('table', {}, h('thead', {}, h('tr', {}, h('th', {}, 'Semana'), h('th', {}, 'Check-in'), h('th', {}, 'Estado'))),
          h('tbody', {}, data.semanas.map((s) => h('tr', {}, h('td', {}, `Semana ${s.semana}`), h('td', { class: 'nowrap' }, fdate(s.fecha_checkin)), h('td', {}, badge(s.estado)))))))
        : h('p', { class: 'muted' }, 'Sin semanas asignadas.'));
    } catch (e) {
      toast(e.message, 'error');
    }
  }

  async function save(e) {
    e.preventDefault();
    error.textContent = '';
    // Validación previa en el navegador; la API y PostgreSQL vuelven a validar.
    if (!editId && !/^\d{5,15}$/.test(cedula.value.trim())) return fail('La cédula debe tener solo números (5 a 15 dígitos).', cedula);
    if (nombre.value.trim().length < 3) return fail('Escriba el nombre completo.', nombre);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(correo.value.trim())) return fail('El correo no es válido.', correo);
    if (!editId && clave.value && clave.value.length < 4) return fail('La contraseña debe tener al menos 4 caracteres.', clave);
    await busy(guardar, async () => {
      try {
        if (editId) {
          await api(`/propietarios/${editId}`, { method: 'PUT', body: { nombre: nombre.value, correo: correo.value } });
          toast('Datos actualizados.');
        } else {
          const body = { cedula: cedula.value.trim(), nombre: nombre.value, correo: correo.value };
          if (clave.value) body.password = clave.value;
          await api('/propietarios', { method: 'POST', body });
          toast('Propietario registrado.');
          reset();
        }
        table.reload();
      } catch (err) {
        error.textContent = err.message;
      }
    });
  }

  function fail(msg, el) {
    error.textContent = msg;
    el.focus();
  }

  async function cambiarAcceso() {
    const pass = input({ type: 'password', maxlength: 128, autocomplete: 'new-password' });
    const v = await dialog('Contraseña de la comunidad', h('div', {},
      h('p', { class: 'muted' }, `Usuario: ${cedula.value}. El propietario entrará con esta contraseña.`), field('Nueva contraseña', pass)),
    [{ label: 'Cancelar', value: null }, { label: 'Guardar', value: 'ok', kind: 'primary' }]);
    if (v !== 'ok') return;
    try {
      const r = await api(`/propietarios/${editId}/acceso`, { method: 'PUT', body: { password: pass.value } });
      toast(r.data.creado ? `Acceso creado. Usuario: ${r.data.usuario}` : 'Contraseña actualizada.');
      edit(editId);
      table.reload();
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  await table.reload();
}
