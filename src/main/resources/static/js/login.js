import { api, setCsrf } from './api.js';
import { logo } from './icons.js';
import { h } from './ui.js';

document.getElementById('brand').append(logo());

// Si ya hay sesión, ir directo al panel.
api('/auth/me').then(() => location.replace('/app.html')).catch(() => {});

const form = document.getElementById('login');
const error = document.getElementById('error');
const enviar = document.getElementById('enviar');

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  error.textContent = '';
  const usuario = form.usuario.value.trim();
  const password = form.password.value;
  if (!usuario || !password) {
    error.textContent = 'Escriba su usuario y contraseña.';
    (usuario ? form.password : form.usuario).focus();
    return;
  }
  enviar.disabled = true;
  enviar.textContent = 'Ingresando…';
  try {
    const r = await api('/auth/login', { method: 'POST', body: { usuario, password } });
    setCsrf(r.data.csrfToken);
    location.replace('/app.html');
  } catch (err) {
    error.textContent = err.message;
    form.password.value = '';
    form.password.focus();
  } finally {
    enviar.disabled = false;
    enviar.textContent = 'Ingresar';
  }
});
