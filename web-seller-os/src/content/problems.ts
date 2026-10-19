// Catálogo de problemas web con su traducción comercial.
// "argument" se usa en llamadas; "hook" es la versión corta para mensajes escritos.

import { lowerFirst } from '../lib/format';

export interface WebProblem {
  id: string;
  label: string;
  area: 'diseño' | 'móvil' | 'velocidad' | 'confianza' | 'conversión' | 'contacto' | 'contenido' | 'seo';
  /** Impacto en ventas del cliente: 1-10 */
  weight: number;
  argument: string;
  hook: string;
  question: string;
  fix: string;
}

export const WEB_PROBLEMS: WebProblem[] = [
  {
    id: 'no_web',
    label: 'No tiene web',
    area: 'conversión',
    weight: 10,
    argument:
      'Ahora mismo, cuando alguien busca {sector} en {ciudad} y compara opciones, {negocio} directamente no aparece con una web propia. Ese cliente acaba en la competencia sin que usted llegue a saber que existía.',
    hook: 'he visto que no tenéis web propia y cuando alguien os busca en Google solo encuentra la ficha',
    question: '¿Cómo os encuentran hoy los clientes nuevos que no os conocían?',
    fix: 'Web profesional de captación con información clara, ubicación y contacto directo.',
  },
  {
    id: 'outdated_design',
    label: 'Diseño anticuado',
    area: 'diseño',
    weight: 7,
    argument:
      'La web transmite una imagen más antigua que la del propio negocio. El cliente juzga en 3 segundos: si la web parece descuidada, asume que el servicio también lo es, aunque no sea verdad.',
    hook: 'la web no está a la altura de lo que hacéis en realidad, da una imagen más antigua',
    question: '¿Sientes que la web refleja la calidad real de lo que ofreces?',
    fix: 'Rediseño visual actual, coherente con la marca y con fotos reales del negocio.',
  },
  {
    id: 'slow',
    label: 'Web lenta',
    area: 'velocidad',
    weight: 8,
    argument:
      'La web tarda demasiado en cargar, sobre todo en móvil. Más de la mitad de las visitas se van si una página tarda más de 3 segundos: son clientes que ya estaban interesados y se pierden antes de ver nada.',
    hook: 'he probado la web desde el móvil y tarda bastante en cargar',
    question: '¿Sabéis cuántas visitas recibe la web y cuántas acaban contactando?',
    fix: 'Optimización de imágenes, hosting rápido y código ligero para cargar en menos de 2 segundos.',
  },
  {
    id: 'bad_mobile',
    label: 'Mala versión móvil',
    area: 'móvil',
    weight: 9,
    argument:
      'La mayoría de sus clientes le buscan desde el móvil, y ahí la web se ve mal: textos pequeños, botones difíciles de pulsar, cosas descolocadas. Es la versión que más gente ve y la que peor funciona.',
    hook: 'desde el móvil la web se ve descolocada y cuesta leerla',
    question: '¿Has mirado tu web desde el móvil como si fueras un cliente nuevo?',
    fix: 'Diseño mobile-first: pensado primero para el móvil, con botones grandes y lectura cómoda.',
  },
  {
    id: 'weak_cta',
    label: 'CTA poco visible',
    area: 'conversión',
    weight: 9,
    argument:
      'El botón para reservar o contactar está escondido. El cliente que ya ha decidido que le interesa tiene que buscar cómo dar el siguiente paso, y cada segundo que busca es una oportunidad de que se vaya.',
    hook: 'el botón para contactar o reservar casi no se ve',
    question: 'Cuando alguien entra en la web, ¿qué quieres que haga exactamente?',
    fix: 'Un único botón de acción principal, visible en todo momento y repetido en los puntos clave.',
  },
  {
    id: 'no_trust',
    label: 'No transmite confianza',
    area: 'confianza',
    weight: 8,
    argument:
      'No hay reseñas, ni fotos reales, ni casos de clientes. Un cliente nuevo no tiene motivos para elegirle a usted antes que a otro. La confianza se construye antes de la primera llamada.',
    hook: 'no se ven reseñas ni trabajos reales, y es justo lo que más convence a un cliente nuevo',
    question: '¿Cuál es el motivo principal por el que tus clientes actuales te eligen?',
    fix: 'Sección de reseñas de Google, fotos reales, casos de éxito y datos de experiencia.',
  },
  {
    id: 'no_whatsapp',
    label: 'Falta WhatsApp',
    area: 'contacto',
    weight: 7,
    argument:
      'Hoy la mayoría prefiere escribir por WhatsApp antes que llamar. Sin un botón directo, mucha gente que no se atreve a llamar simplemente no contacta.',
    hook: 'no hay botón de WhatsApp, y hoy mucha gente prefiere escribir antes que llamar',
    question: '¿Por qué canal te llegan más clientes ahora mismo?',
    fix: 'Botón flotante de WhatsApp con mensaje predefinido.',
  },
  {
    id: 'no_form',
    label: 'Falta formulario',
    area: 'contacto',
    weight: 6,
    argument:
      'No hay forma de dejar una solicitud fuera de horario. Quien le busca un domingo por la noche no tiene dónde dejar sus datos, y el lunes ya ha llamado a otro.',
    hook: 'no hay forma de dejar una solicitud fuera de horario',
    question: '¿Qué pasa con la gente que os busca cuando estáis cerrados?',
    fix: 'Formulario corto (3 campos) con aviso inmediato al móvil.',
  },
  {
    id: 'bad_structure',
    label: 'Mala estructura',
    area: 'contenido',
    weight: 6,
    argument:
      'La información está desordenada: el cliente no encuentra rápido qué ofrecen, cuánto cuesta o dónde están. Si tiene que pensar, se va.',
    hook: 'cuesta encontrar lo importante: servicios, precios y cómo llegar',
    question: '¿Qué preguntas te hacen siempre los clientes antes de comprar?',
    fix: 'Arquitectura clara: qué hacemos, para quién, por qué nosotros, precios orientativos y contacto.',
  },
  {
    id: 'bad_seo',
    label: 'SEO deficiente',
    area: 'seo',
    weight: 7,
    argument:
      'La web no está preparada para aparecer en Google cuando alguien busca {sector} en {ciudad}. Tiene una web, pero nadie nueva llega a ella por búsqueda.',
    hook: 'buscando {sector} en {ciudad} no aparecéis en los primeros resultados',
    question: '¿Te llegan clientes que te han encontrado buscando en Google?',
    fix: 'SEO local: títulos, descripciones, ficha de Google optimizada y contenido por servicio.',
  },
  {
    id: 'outdated_info',
    label: 'Información desactualizada',
    area: 'contenido',
    weight: 5,
    argument:
      'Hay información antigua (horarios, precios, servicios, fechas). Eso genera dudas y llamadas innecesarias, y da sensación de negocio poco activo.',
    hook: 'he visto información que parece desactualizada',
    question: '¿Cada cuánto actualizáis la web? ¿Os resulta fácil hacerlo?',
    fix: 'Gestor de contenidos sencillo para que el negocio actualice horarios y precios solo.',
  },
  {
    id: 'no_https',
    label: 'Sin HTTPS / "No seguro"',
    area: 'confianza',
    weight: 6,
    argument:
      'El navegador marca la web como "No segura". Para muchos clientes eso es motivo directo para cerrar la página, y Google la penaliza.',
    hook: 'el navegador marca la web como "no segura"',
    question: '¿Sabías que Chrome avisa a tus visitas de que tu web no es segura?',
    fix: 'Certificado SSL y migración a HTTPS.',
  },
  {
    id: 'bad_images',
    label: 'Imágenes pobres o de stock',
    area: 'diseño',
    weight: 5,
    argument:
      'Las imágenes son genéricas o de poca calidad. No enseñan el local, el equipo ni el trabajo real, que es lo que de verdad genera confianza.',
    hook: 'las fotos no le hacen justicia al sitio',
    question: '¿Tenéis fotos buenas del local, del equipo o de vuestros trabajos?',
    fix: 'Fotos reales optimizadas, galería de trabajos y equipo.',
  },
  {
    id: 'weak_copy',
    label: 'Textos poco claros',
    area: 'contenido',
    weight: 6,
    argument:
      'Los textos hablan del negocio, pero no del cliente. No responden a "¿qué gano yo?" y no hay una frase que explique en 5 segundos por qué elegirles.',
    hook: 'los textos no dejan claro por qué elegiros a vosotros y no a otro',
    question: 'Si tuvieras que explicar en una frase por qué elegirte, ¿qué dirías?',
    fix: 'Copy orientado a beneficios con una propuesta de valor clara arriba del todo.',
  },
  {
    id: 'no_social',
    label: 'Redes desconectadas',
    area: 'confianza',
    weight: 3,
    argument:
      'Las redes sociales y la web no están conectadas. El cliente que viene de Instagram no encuentra continuidad, y el que entra en la web no ve que el negocio está activo.',
    hook: 'tenéis buen Instagram pero la web no lo aprovecha',
    question: '¿De dónde vienen la mayoría de tus clientes: Instagram, Google o boca a boca?',
    fix: 'Integración de redes, feed de Instagram y enlaces cruzados.',
  },
  {
    id: 'no_booking',
    label: 'Sin reservas / citas online',
    area: 'conversión',
    weight: 8,
    argument:
      'Para reservar o pedir cita hay que llamar. Cada llamada perdida en hora punta es un cliente que reserva en otro sitio que sí le deja hacerlo en dos clics.',
    hook: 'para reservar hay que llamar, y en hora punta eso son clientes que se pierden',
    question: '¿Cuántas llamadas crees que no podéis coger en un día normal?',
    fix: 'Sistema de reservas o citas online integrado con el calendario del negocio.',
  },
  {
    id: 'no_analytics',
    label: 'Sin medición',
    area: 'seo',
    weight: 3,
    argument:
      'No hay forma de saber cuántas personas visitan la web ni cuántas acaban contactando. Sin datos, es imposible mejorar.',
    hook: 'no estáis midiendo cuánta gente entra ni cuánta contacta',
    question: '¿Sabéis cuántas personas visitan la web cada mes?',
    fix: 'Analítica básica y seguimiento de contactos y reservas.',
  },
];

export const PROBLEM_BY_ID: Record<string, WebProblem> = Object.fromEntries(WEB_PROBLEMS.map((p) => [p.id, p]));

export function problemLabel(id: string) {
  if (id.startsWith('custom:')) return id.slice(7);
  return PROBLEM_BY_ID[id]?.label ?? id;
}

/** Beneficio principal según sector: qué significa "más clientes" para ese negocio. */
export function sectorOutcome(sector: string): { unit: string; verb: string; hook: string } {
  const s = sector.toLowerCase();
  if (/restaur|bar|cafet/.test(s)) return { unit: 'reservas', verb: 'reservar mesa', hook: 'más mesas llenas entre semana' };
  if (/pelu|barber|estétic|spa/.test(s)) return { unit: 'citas', verb: 'pedir cita', hook: 'la agenda llena sin depender del teléfono' };
  if (/dental|clínica|salud|fisio|veterin/.test(s)) return { unit: 'primeras visitas', verb: 'pedir cita', hook: 'más pacientes nuevos cada mes' };
  if (/gimnas|fitness/.test(s)) return { unit: 'altas', verb: 'apuntarse', hook: 'más altas sin depender de la temporada' };
  if (/inmobil/.test(s)) return { unit: 'captaciones', verb: 'pedir una valoración', hook: 'más propietarios que os llaman para vender' };
  if (/abogad|asesor/.test(s)) return { unit: 'consultas', verb: 'pedir una consulta', hook: 'más consultas de clientes que ya vienen confiando' };
  if (/reform|constru/.test(s)) return { unit: 'presupuestos', verb: 'pedir presupuesto', hook: 'más presupuestos de obras que de verdad os interesan' };
  if (/taller|mecán/.test(s)) return { unit: 'citas de taller', verb: 'pedir cita', hook: 'más coches en el taller sin pelearse por precio' };
  if (/tienda|retail/.test(s)) return { unit: 'ventas', verb: 'comprar', hook: 'vender también cuando la tienda está cerrada' };
  if (/hotel|aloja/.test(s)) return { unit: 'reservas directas', verb: 'reservar', hook: 'más reservas directas sin pagar comisión a Booking' };
  if (/academ|forma/.test(s)) return { unit: 'matrículas', verb: 'apuntarse', hook: 'más matrículas sin depender del boca a boca' };
  if (/foto|event/.test(s)) return { unit: 'encargos', verb: 'pedir presupuesto', hook: 'clientes que llegan ya convencidos por vuestro portfolio' };
  return { unit: 'clientes', verb: 'contactar', hook: 'más clientes nuevos cada mes' };
}

export function fillTemplate(t: string, vars: Record<string, string>) {
  return t.replace(/\{(\w+)\}/g, (_, k) => vars[k] || defaults[k] || '');
}
const defaults: Record<string, string> = { negocio: 'el negocio', sector: 'su sector', ciudad: 'su zona', nombre: '' };

/** Genera argumentos de venta personalizados a partir de los problemas detectados en un prospecto. */
export function buildArguments(problemIds: string[], vars: { negocio: string; sector: string; ciudad: string }) {
  const known = problemIds
    .map((id) => PROBLEM_BY_ID[id])
    .filter(Boolean)
    .sort((a, b) => b.weight - a.weight);
  const custom = problemIds.filter((id) => id.startsWith('custom:')).map((id) => id.slice(7));
  const outcome = sectorOutcome(vars.sector);
  const args = known.map((p) => ({
    id: p.id,
    label: p.label,
    weight: p.weight,
    text: fillTemplate(p.argument, vars),
    question: p.question,
    fix: p.fix,
  }));
  for (const c of custom) {
    args.push({
      id: 'custom:' + c,
      label: c,
      weight: 5,
      text: `He detectado esto: ${lowerFirst(c)}. Es un detalle que hace que algunos clientes duden o se vayan antes de ${outcome.verb}.`,
      question: '¿Os habíais dado cuenta de esto?',
      fix: 'Corregirlo dentro del rediseño.',
    });
  }
  const why =
    args.length === 0
      ? null
      : `${vars.negocio || 'Este negocio'} ya tiene demanda: la gente le busca. El problema es lo que pasa cuando le encuentran. ` +
        `${args
          .slice(0, 3)
          .map((a) => lowerFirst(a.label))
          .join(', ')} hacen que una parte de esas visitas no se convierta en ${outcome.unit}. ` +
        `Una web bien planteada no es un gasto de imagen: es el sistema que convierte esas visitas en ${outcome.hook}.`;
  return { args, why, outcome };
}
