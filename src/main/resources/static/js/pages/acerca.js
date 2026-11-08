// Información del proyecto y del equipo de desarrollo.
import { h, pageHead, card } from '../ui.js';

const EQUIPO = ['Juan Steven Gómez Díaz', 'Luis Alejandro Gómez Eugenio', 'José Alejandro Hurtado Mantilla', 'David Santiago Jaimes Campo'];

export default async function acerca(root) {
  const dato = (label, value) => h('div', { class: 'field' }, h('span', { class: 'label' }, label), h('p', { style: { margin: 0 } }, value));
  root.append(
    pageHead('Acerca del proyecto', 'Sistema de facturación para proyectos inmobiliarios de la Constructora CAM'),
    h('div', { class: 'grid-2' },
      card('Equipo de desarrollo', h('ul', {}, EQUIPO.map((n) => h('li', {}, n)))),
      card('Institución',
        dato('Universidad', 'Unidades Tecnológicas de Santander (UTS)'),
        dato('Programa', 'Tecnología en Desarrollo de Sistemas Informáticos'),
        dato('Asignaturas', 'Planeación de Sistemas Informáticos · Motores de Base de Datos'),
        dato('Docentes', 'Elsa Patricia Carvajal Valero · Laura Cristina Duarte Quintero'),
        dato('Lugar y año', 'Bucaramanga, Santander · 2026')),
      card('Cliente', h('p', {}, 'CAM PROYECTOS INMOBILIARIOS S.A.S. — control de cuotas de las semanas de uso de la vivienda turística, comprobantes, estados de cuenta y comunidad de intercambio entre propietarios.')),
      card('Tecnología', h('p', {}, 'Java 17 · Spring Boot 3 · MySQL 8 · HTML, CSS y JavaScript.'))),
  );
}
