// Comunicación con la API (/api del mismo origen). Agrega el token CSRF en las escrituras.
let csrfToken = null;

export function setCsrf(token) { csrfToken = token; }

export class ApiFailure extends Error {
  constructor(status, codigo, mensaje) {
    super(mensaje);
    this.status = status;
    this.codigo = codigo;
  }
}

export async function api(path, { method = 'GET', body, query } = {}) {
  const url = new URL(`/api${path}`, location.origin);
  if (query) for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v);
  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (method !== 'GET' && csrfToken) headers['X-CSRF-Token'] = csrfToken;
  let res;
  try {
    res = await fetch(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), credentials: 'same-origin' });
  } catch {
    throw new ApiFailure(0, 'SIN_CONEXION', 'No hay conexión con el servidor. Revise su internet e intente de nuevo.');
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    // Sesión vencida: volver al ingreso.
    if (res.status === 401 && !['/auth/login', '/auth/me'].includes(path)) location.replace('/');
    throw new ApiFailure(res.status, json.error?.codigo || 'ERROR', json.error?.mensaje || 'Ocurrió un error inesperado.');
  }
  return json;
}

/** Recorre todas las páginas de una lista (máximo 100 por solicitud). */
export async function apiAll(path, query = {}) {
  const out = [];
  for (let offset = 0; ; offset += 100) {
    const r = await api(path, { query: { ...query, limit: 100, offset } });
    out.push(...r.data);
    if (out.length >= r.total || r.data.length === 0) return out;
  }
}
