// Estructura de la aplicación: sesión, menú según el rol y navegación por #/ruta.
import { api, setCsrf } from './api.js';
import { icon, logo } from './icons.js';
import { h, clear, toast } from './ui.js';

const MENUS = {
  ADMIN: [
    ['inicio', 'Inicio', 'home'], ['propietarios', 'Propietarios', 'users'], ['semanas', 'Semanas', 'calendar'],
    ['asignaciones', 'Asignaciones', 'key'], ['pagos', 'Pagos de cuotas', 'cash'], ['comprobantes', 'Comprobantes', 'receipt'],
    ['estado-cuenta', 'Estado de cuenta', 'chart'], ['recaudo', 'Recaudo mensual', 'clock'], ['comunidad', 'Comunidad', 'chat'],
    ['parametros', 'Parámetros', 'gear'], ['acerca', 'Acerca del proyecto', 'info'],
  ],
  PROPIETARIO: [['ofertas', 'Ofertas activas', 'home'], ['publicar', 'Publicar oferta', 'plus'], ['mis-ofertas', 'Mis ofertas', 'chat'],
    ['acerca', 'Acerca del proyecto', 'info']],
};
// El superadministrador ve todo lo de ADMIN más las cuentas de administradores y el historial de cambios.
MENUS.SUPERADMIN = [...MENUS.ADMIN.slice(0, -1), ['usuarios', 'Administradores', 'shield'], ['historial', 'Historial de cambios', 'clock'],
  MENUS.ADMIN.at(-1)];
const ROLES = { SUPERADMIN: 'Superadministrador', ADMIN: 'Secretaria · Administración', PROPIETARIO: 'Propietario' };
// Rutas internas que no aparecen en el menú.
const EXTRA = { SUPERADMIN: ['comprobante'], ADMIN: ['comprobante'], PROPIETARIO: [] };

const shell = document.getElementById('shell');
const main = document.getElementById('main');
const sidebar = document.getElementById('sidebar');
const menuBtn = document.getElementById('menu');
let user;

async function start() {
  try {
    const r = await api('/auth/me');
    user = r.data.usuario;
    setCsrf(r.data.csrfToken);
  } catch {
    location.replace('/');
    return;
  }
  buildSidebar();
  window.addEventListener('hashchange', route);
  route();
}

function buildSidebar() {
  const initials = user.nombre.split(/\s+/).slice(0, 2).map((p) => p[0]).join('').toUpperCase();
  const nav = h('nav', { class: 'nav' }, MENUS[user.rol].map(([id, label, ic]) => h('a', { href: `#/${id}`, 'data-id': id }, icon(ic), label)));
  nav.addEventListener('click', () => toggleMenu(false));
  clear(sidebar,
    h('div', { class: 'brand' }, logo(), h('small', {}, 'SISTEMA DE FACTURACIÓN')),
    h('div', { class: 'nav-title' }, 'MENÚ'),
    nav,
    h('div', { class: 'user-box' },
      h('div', { class: 'avatar', 'aria-hidden': 'true' }, initials),
      h('div', { class: 'who' }, h('b', {}, user.nombre), h('span', {}, ROLES[user.rol])),
      h('button', { class: 'icon-btn', type: 'button', title: 'Cerrar sesión', 'aria-label': 'Cerrar sesión', onclick: logout }, icon('logout'))));
  menuBtn.append(icon('menu'));
  menuBtn.addEventListener('click', () => toggleMenu(!shell.classList.contains('menu-open')));
}

function toggleMenu(open) {
  shell.classList.toggle('menu-open', open);
  menuBtn.setAttribute('aria-expanded', String(open));
}

async function logout() {
  try {
    await api('/auth/logout', { method: 'POST' });
  } finally {
    location.replace('/');
  }
}

async function route() {
  const [id = '', ...params] = location.hash.replace(/^#\/?/, '').split('/');
  const allowed = [...MENUS[user.rol].map((m) => m[0]), ...EXTRA[user.rol]];
  if (!allowed.includes(id)) {
    location.replace(`#/${MENUS[user.rol][0][0]}`);
    return;
  }
  for (const a of sidebar.querySelectorAll('.nav a')) {
    if (a.dataset.id === id || (id === 'comprobante' && a.dataset.id === 'comprobantes')) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  }
  clear(main, h('p', { class: 'state' }, 'Cargando…'));
  try {
    const mod = await import(`./pages/${id}.js`);
    const page = h('div', {});
    clear(main, page);
    await mod.default(page, { user, params });
    document.title = `${main.querySelector('h1')?.textContent || 'CAM'} · Sistema de facturación CAM`;
    main.focus({ preventScroll: true });
  } catch (e) {
    clear(main, h('p', { class: 'state error' }, e.message || 'No se pudo abrir la pantalla.'));
    toast(e.message || 'No se pudo abrir la pantalla.', 'error');
  }
}

start();
