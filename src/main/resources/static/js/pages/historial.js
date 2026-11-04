// SUPERADMIN: historial de todos los cambios (tabla auditoria, llenada por triggers de MySQL).
import { api } from '../api.js';
import { h, pageHead, field, input, select, btn, dataTable, exportCsv, col } from '../ui.js';

const TABLAS = { propietarios: 'Propietarios', usuarios: 'Usuarios', semanas: 'Semanas', parametros: 'Parámetros', adquisiciones: 'Asignaciones',
  pagos: 'Pagos', comprobantes: 'Comprobantes', ofertas: 'Ofertas', mensajes: 'Mensajes' };
const ACCIONES = { INSERT: 'Creó', UPDATE: 'Modificó', DELETE: 'Eliminó' };

/** Texto con lo que cambió: "campo: antes → después". */
function cambios(r) {
  const antes = r.antes ? JSON.parse(r.antes) : {};
  const despues = r.despues ? JSON.parse(r.despues) : {};
  const show = (v) => (v === null || v === undefined ? '—' : typeof v === 'boolean' ? (v ? 'sí' : 'no') : String(v));
  if (r.accion === 'UPDATE') {
    return Object.keys(despues).filter((k) => JSON.stringify(antes[k]) !== JSON.stringify(despues[k]))
      .map((k) => (k === 'password_cambiada' ? 'contraseña cambiada' : `${k}: ${show(antes[k])} → ${show(despues[k])}`)).join(' · ');
  }
  return Object.entries(r.accion === 'INSERT' ? despues : antes).map(([k, v]) => `${k}: ${show(v)}`).join(' · ');
}

export default async function historial(root) {
  const tabla = select([{ value: '', label: 'Todas las tablas' }, ...Object.entries(TABLAS).map(([value, label]) => ({ value, label }))], { 'aria-label': 'Tabla' });
  const desde = input({ type: 'date' });
  const hasta = input({ type: 'date' });
  const columns = [
    col.datetime('Fecha', 'fecha'), { label: 'Usuario', key: 'usuario' },
    { label: 'Acción', key: 'accion', format: (v) => ACCIONES[v] || v },
    { label: 'Tabla', key: 'tabla', format: (v) => TABLAS[v] || v }, { label: 'Registro', key: 'registro_id', num: true },
    { label: 'Cambios', value: cambios, wrap: true },
  ];
  const query = () => ({ tabla: tabla.value, desde: desde.value, hasta: hasta.value });
  const table = dataTable({ columns, pageSize: 50, load: (p) => api('/auditoria', { query: { ...query(), ...p } }), empty: 'No hay cambios registrados con esos filtros.' });
  for (const f of [tabla, desde, hasta]) f.addEventListener('change', () => table.reload(true));

  root.append(
    pageHead('Historial de cambios', 'Quién creó, modificó o eliminó cada registro y cuándo',
      btn('Exportar', { icon: 'download', onclick: async () => exportCsv('historial', columns, await table.all()) })),
    h('section', { class: 'card' },
      h('div', { class: 'toolbar' }, field('Tabla', tabla), field('Desde', desde), field('Hasta', hasta)),
      table.el),
  );
  await table.reload();
}
