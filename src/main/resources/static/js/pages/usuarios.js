// SUPERADMIN: cuentas de los administradores (secretarias) que gestionan la información.
import { api } from '../api.js';
import { h, pageHead, field, input, select, btn, iconBtn, dataTable, toast, busy, dialog, confirmar, badge, col } from '../ui.js';

const ROLES = { SUPERADMIN: 'Superadministrador', ADMIN: 'Administrador' };
// Roles que se pueden asignar (el primero es el predeterminado). PROPIETARIO se crea desde Propietarios.
const ROL_OPCIONES = [{ value: 'ADMIN', label: ROLES.ADMIN }, { value: 'SUPERADMIN', label: ROLES.SUPERADMIN }];

export default async function usuarios(root, { user }) {
  const columns = [
    { label: 'Nombre', key: 'nombre' }, { label: 'Usuario', key: 'usuario', nowrap: true },
    { label: 'Rol', key: 'rol', format: (v) => ROLES[v] || v },
    { label: 'Activa', value: (r) => (r.activo ? 'Sí' : 'No'), format: (v) => badge(v) },
    col.datetime('Creado', 'creado_en'),
  ];
  const table = dataTable({
    columns, pageSize: 100,
    load: () => api('/usuarios'),
    actions: (row) => [
      iconBtn('edit', 'Editar nombre, usuario y rol', () => editar(row)),
      row.rol === 'ADMIN' ? iconBtn(row.activo ? 'x' : 'check', row.activo ? 'Desactivar' : 'Activar', () => cambiarEstado(row)) : null,
      row.rol === 'ADMIN' || row.id === user.id ? iconBtn('key', 'Cambiar contraseña', () => cambiarPassword(row)) : null,
      // Eliminar definitivamente: solo el superadministrador, y nunca su propia cuenta. El servidor lo vuelve a validar.
      user.rol === 'SUPERADMIN' && row.id !== user.id ? iconBtn('trash', 'Eliminar definitivamente', () => eliminar(row)) : null,
    ],
  });

  const nombre = input({ maxlength: 120, autocomplete: 'off' });
  const usuario = input({ maxlength: 40, autocomplete: 'off' });
  const password = input({ type: 'password', maxlength: 128, autocomplete: 'new-password' });
  const rol = select(ROL_OPCIONES, { 'aria-label': 'Rol' });
  const error = h('p', { class: 'form-error', role: 'alert' });
  const crear = btn('Crear cuenta', { icon: 'plus', kind: 'primary', type: 'submit' });
  const form = h('form', { novalidate: true, onsubmit: save },
    field('Nombre completo', nombre), field('Usuario', usuario, 'Empieza con letra; sin espacios.'), field('Contraseña inicial', password),
    field('Rol', rol, 'El superadministrador también crea y elimina cuentas y ve el historial.'),
    error, h('div', { class: 'form-actions' }, crear),
    h('p', { class: 'hint', style: { marginTop: '14px' } }, 'Los administradores registran propietarios, semanas, pagos y comprobantes. No pueden crear ni eliminar cuentas ni ver el historial.'));

  root.append(
    pageHead('Administradores', 'Cuentas con acceso a la administración del sistema'),
    h('div', { class: 'split' }, h('section', { class: 'card' }, table.el),
      h('section', { class: 'card side' }, h('h2', { style: { marginBottom: '14px' } }, 'Nueva cuenta'), form)),
  );

  async function save(e) {
    e.preventDefault();
    error.textContent = '';
    await busy(crear, async () => {
      try {
        await api('/usuarios', { method: 'POST', body: { nombre: nombre.value, usuario: usuario.value, password: password.value, rol: rol.value } });
        toast('Cuenta creada.');
        form.reset();
        table.reload();
      } catch (err) {
        error.textContent = err.message;
      }
    });
  }

  async function editar(row) {
    const nom = input({ maxlength: 120, autocomplete: 'off' });
    nom.value = row.nombre;
    const usr = input({ maxlength: 40, autocomplete: 'off' });
    usr.value = row.usuario;
    const rolSel = select(ROL_OPCIONES, { 'aria-label': 'Rol' });
    rolSel.value = row.rol;
    const propia = row.id === user.id;
    rolSel.disabled = propia; // nadie cambia su propio rol (evita quedarse sin acceso)
    const v = await dialog('Editar cuenta', h('div', {},
      field('Nombre completo', nom), field('Usuario', usr),
      field('Rol', rolSel, propia ? 'No puede cambiar su propio rol.' : 'Siempre debe quedar un superadministrador activo.')),
    [{ label: 'Cancelar', value: null }, { label: 'Guardar', value: 'ok', kind: 'primary' }]);
    if (v !== 'ok') return;
    try {
      await api(`/usuarios/${row.id}`, { method: 'PUT', body: { nombre: nom.value, usuario: usr.value, rol: rolSel.value } });
      toast('Cuenta actualizada.');
      table.reload();
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  async function eliminar(row) {
    const clave = input({ type: 'password', maxlength: 128, autocomplete: 'current-password' });
    const v = await dialog('Eliminar cuenta definitivamente', h('div', {},
      h('p', {}, `Se eliminará para siempre la cuenta de ${row.nombre} (${row.usuario}). Esta acción no se puede deshacer.`),
      h('p', { class: 'hint' }, 'Solo se pueden eliminar cuentas sin actividad registrada. Si ya registró pagos u otros cambios, desactívela para quitarle el acceso.'),
      field('Confirme con su contraseña', clave)),
    [{ label: 'Cancelar', value: null }, { label: 'Eliminar', value: 'ok', kind: 'danger' }]);
    if (v !== 'ok') return;
    try {
      await api(`/usuarios/${row.id}`, { method: 'DELETE', body: { password: clave.value } });
      toast('Cuenta eliminada.');
      table.reload();
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  async function cambiarEstado(row) {
    const activo = !row.activo;
    if (!await confirmar(activo ? 'Activar cuenta' : 'Desactivar cuenta',
      `¿${activo ? 'Activar' : 'Desactivar'} la cuenta de ${row.nombre}?${activo ? '' : ' Perderá el acceso de inmediato.'}`,
      { ok: activo ? 'Activar' : 'Desactivar', danger: !activo })) return;
    try {
      await api(`/usuarios/${row.id}/estado`, { method: 'PATCH', body: { activo } });
      toast(activo ? 'Cuenta activada.' : 'Cuenta desactivada.');
      table.reload();
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  async function cambiarPassword(row) {
    const nueva = input({ type: 'password', maxlength: 128, autocomplete: 'new-password' });
    const v = await dialog('Cambiar contraseña', h('div', {}, h('p', {}, `${row.nombre} (${row.usuario})`), field('Nueva contraseña', nueva)),
      [{ label: 'Cancelar', value: null }, { label: 'Guardar', value: 'ok', kind: 'primary' }]);
    if (v !== 'ok') return;
    try {
      await api(`/usuarios/${row.id}/password`, { method: 'PUT', body: { password: nueva.value } });
      toast('Contraseña actualizada.');
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  await table.reload();
}
