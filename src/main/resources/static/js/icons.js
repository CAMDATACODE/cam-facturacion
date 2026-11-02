// Íconos de línea (SVG) en una cuadrícula de 24x24.
const P = {
  home: 'M3 11l9-8 9 8M6 10v11h12V10M10 21v-6h4v6',
  users: 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21v-1a6 6 0 0 1 12 0v1M16 3.5a4 4 0 0 1 0 7.5M18 14a5 5 0 0 1 4 5v2',
  calendar: 'M4 5h16v16H4zM4 10h16M8 3v4M16 3v4',
  key: 'M7 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM11 13h10v4M17 13v3',
  cash: 'M2 6h20v12H2zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM5 9v0M19 15v0',
  receipt: 'M5 3h14v18l-3-2-3 2-3-2-3 2-2-2zM9 8h6M9 12h6',
  chart: 'M3 21h18M5 21V12h3v9M11 21V6h3v15M17 21V9h3v12',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l4 2',
  chat: 'M4 5h16v11H10l-5 4 1-4H4z M8 9h8M8 12h5',
  gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1',
  logout: 'M10 4H4v16h6M9 12h12M17 8l4 4-4 4',
  search: 'M10 17a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM15 15l6 6',
  plus: 'M12 5v14M5 12h14',
  check: 'M5 12l5 5 9-10',
  trash: 'M4 6h16M6 6l1 15h10l1-15M9 6V3h6v3',
  print: 'M7 3h10v5H7zM3 8h18v9H3zM7 14h10v7H7z',
  mail: 'M3 5h18v14H3zM3 7l9 6 9-6',
  download: 'M12 3v12M7 10l5 5 5-5M4 20h16',
  edit: 'M4 20v-4L16 4l4 4L8 20zM13 7l4 4',
  swap: 'M4 8h16M16 4l4 4-4 4M20 16H4M8 12l-4 4 4 4',
  send: 'M3 11l18-8-7 18-3-8z',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  x: 'M6 6l12 12M18 6L6 18',
  menu: 'M4 6h16M4 12h16M4 18h16',
  back: 'M15 6l-6 6 6 6',
  refresh: 'M20 12a8 8 0 1 1-2.3-5.7M20 4v5h-5',
};

export function icon(name) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', P[name] || P.home);
  svg.append(path);
  return svg;
}

/** Logo oficial de CAM (static/img/logo-cam.png), sobre fondo blanco para que se lea en zonas oscuras. */
export function logo() {
  const d = document.createElement('div');
  d.className = 'logo-card';
  const img = document.createElement('img');
  img.src = '/img/logo-cam.png';
  img.alt = 'CAM Proyectos Inmobiliarios Constructora';
  d.append(img);
  return d;
}
