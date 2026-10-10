// Configuración global. Los campos marcados como PENDIENTE deben completarse
// antes de publicar (ver docs/PENDIENTES.md).
export const site = {
  name: 'Angolatiens',
  tagline: 'Inteligencia artificial práctica para autónomos y pequeños negocios',
  // PENDIENTE: dominio definitivo. Se usa en canonical, sitemap y datos estructurados.
  url: 'https://www.angolatiens.com',
  lang: 'es-ES',
  // Fecha de la última revisión editorial de precios y condiciones.
  reviewed: '2026-10-10',
  reviewedLabel: 'octubre de 2026',
  // PENDIENTE: datos del titular (obligatorios por el art. 10 LSSI).
  owner: {
    name: '[PENDIENTE: nombre y apellidos o razón social del titular]',
    nif: '[PENDIENTE: NIF]',
    address: '[PENDIENTE: domicilio]',
    email: '[PENDIENTE: correo de contacto]',
  },
  // Si se rellena, los formularios de contacto y lista de espera abren el cliente de correo.
  contactEmail: '',
};

export const nav = [
  { href: '/herramientas/', label: 'Herramientas' },
  { href: '/comparar/', label: 'Comparador' },
  { href: '/guias/', label: 'Guías' },
  { href: '/negocios/', label: 'Por negocio' },
  { href: '/plantillas/', label: 'Plantillas' },
  { href: '/calculadoras/', label: 'Calculadoras' },
  { href: '/novedades/', label: 'Novedades' },
];

export const categories = {
  asistentes: { label: 'Asistentes de IA', short: 'Asistentes' },
  automatizacion: { label: 'Automatización', short: 'Automatización' },
  clientes: { label: 'Atención al cliente', short: 'Clientes' },
  contenido: { label: 'Contenido y diseño', short: 'Contenido' },
  organizacion: { label: 'Organización y reuniones', short: 'Organización' },
  gestion: { label: 'Facturación y gestión', short: 'Gestión' },
  web: { label: 'Web y email', short: 'Web y email' },
};
