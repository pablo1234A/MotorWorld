import type { ProjectKind } from "@/engine/schema";

export const KIND_OPTIONS: Array<{ id: ProjectKind; label: string; description: string; example: string }> = [
  { id: "landing", label: "Landing page", description: "Una página enfocada a convertir.", example: "Landing para una app de meditación con lista de espera y preguntas frecuentes" },
  { id: "store", label: "Tienda online", description: "Catálogo, carrito y pagos con Stripe.", example: "Tienda online de café de especialidad que vende granos, cafeteras y cursos de barista" },
  { id: "saas", label: "SaaS", description: "Producto, precios y prueba gratis.", example: "SaaS para gestionar turnos de clínicas dentales, con precios por sede y prueba de 14 días" },
  { id: "corporate", label: "Web corporativa", description: "Servicios, equipo y contacto.", example: "Despacho de abogados laboralistas en Sevilla con 20 años de experiencia" },
  { id: "portfolio", label: "Portfolio", description: "Proyectos y trayectoria.", example: "Portfolio de un diseñador de producto en Barcelona, estilo editorial" },
  { id: "restaurant", label: "Restaurante", description: "Carta, reservas y ubicación.", example: "Restaurante japonés llamado \"Umami\" en Bilbao con barra de sushi y reservas online" },
  { id: "dealership", label: "Concesionario", description: "Inventario, financiación y pruebas.", example: "Concesionario de coches eléctricos de ocasión en Valencia con financiación" },
  { id: "webapp", label: "Aplicación web", description: "Producto con panel y planes.", example: "Aplicación web para organizar mudanzas con checklist y recordatorios" },
  { id: "dashboard", label: "Dashboard", description: "KPIs y gráficos.", example: "Dashboard de ventas para una cadena de panaderías" },
  { id: "education", label: "Educación", description: "Cursos, mentores e inscripción.", example: "Academia online de programación con bootcamps de 12 semanas y mentoría" },
  { id: "experience3d", label: "Experiencia 3D", description: "Escena WebGL interactiva.", example: "Lanzamiento 3D de unos auriculares inalámbricos llamados \"Halo\", estilo oscuro" },
  { id: "interactive", label: "Interactiva", description: "Storytelling con scroll.", example: "Experiencia interactiva que cuenta la historia de una bodega familiar capítulo a capítulo" },
];

export const KIND_LABEL: Record<string, string> = Object.fromEntries(KIND_OPTIONS.map((k) => [k.id, k.label]));

export const BRIEF_EXAMPLES = [
  "Restaurante de cocina de temporada llamado \"Casa Lumbre\" en Valencia, con reservas y carta",
  "SaaS para automatizar la facturación de autónomos, con precios y prueba gratis, estilo oscuro",
  "Concesionario premium de coches de ocasión en Madrid con financiación y pruebas de conducción",
  "Tienda online de cerámica artesanal que vende tazas, cuencos y jarrones",
  "Portfolio editorial de una fotógrafa de arquitectura en Barcelona",
  "Experiencia 3D inmersiva para el lanzamiento de una bicicleta eléctrica",
];
