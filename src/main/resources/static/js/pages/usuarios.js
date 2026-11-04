// SUPERADMIN: cuentas de los administradores (secretarias) que gestionan la información.
import { api } from '../api.js';
import { h, pageHead, field, input, btn, iconBtn, dataTable, toast, busy, dialog, confirmar, badge, col } from '../ui.js';

const ROLES = { SUPERADMIN: 'Superadministrador', ADMIN: 'Administrador' };

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
      row.rol === 'ADMIN' ? iconBtn(row.activo ? 'x' : 'check', row.activo ? 'Desactivar' : 'Activar', () => cambiarEstado(row)) : null,
      row.rol === 'ADMIN' || row.id === user.id ? iconBtn('key', 'Cambiar contraseña', () => cambiarPassword(row)) : null,
    ],
  });

  const nombre = input({ maxlength: 120, autocomplete: 'off' });
  const usuario = input({ maxlength: 40, autocomplete: 'off' });
  const password = input({ type: 'password', maxlength: 128, autocomplete: 'new-password' });
  const error = h('p', { class: 'form-error', role: 'alert' });
  const crear = btn('Crear administrador', { icon: 'plus', kind: 'primary', type: 'submit' });
  const form = h('form', { novalidate: true, onsubmit: save },
    field('Nombre completo', nombre), field('Usuario', usuario, 'Empieza con letra; sin espacios.'), field('Contraseña inicial', password),
    error, h('div', { class: 'form-actions' }, crear),
    h('p', { class: 'hint', style: { marginTop: '14px' } }, 'Los administradores registran propietarios, semanas, pagos y comprobantes. No pueden crear otros administradores ni ver el historial.'));

  root.append(
    pageHead('Administradores', 'Cuentas que pueden editar la información del sistema'),
    h('div', { class: 'split' }, h('section', { class: 'card' }, table.el),
      h('section', { class: 'card side' }, h('h2', { style: { marginBottom: '14px' } }, 'Nuevo administrador'), form)),
  );

  async function save(e) {
    e.preventDefault();
    error.textContent = '';
    await busy(crear, async () => {
      try {
        await api('/usuarios', { method: 'POST', body: { nombre: nombre.value, usuario: usuario.value, password: password.value } });
        toast('Administrador creado.');
        form.reset();
        table.reload();
      } catch (err) {
        error.textContent = err.message;
      }
    });
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
