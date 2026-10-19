import { normalize } from './format';
import { OBJECTIONS } from '../content/objections';

export const DIMENSIONS = ['claridad', 'persuasion', 'confianza', 'necesidades', 'objeciones', 'cierre'] as const;
export type Dimension = (typeof DIMENSIONS)[number];
export const DIM_LABEL: Record<Dimension, string> = {
  claridad: 'Claridad',
  persuasion: 'Persuasión',
  confianza: 'Confianza',
  necesidades: 'Detección de necesidades',
  objeciones: 'Manejo de objeciones',
  cierre: 'Cierre',
};

export interface Persona {
  id: string;
  owner: string;
  business: string;
  sector: string;
  mood: string;
  context: string;
  opener: string;
}

export const PERSONAS: Persona[] = [
  { id: 'rest', owner: 'Carmen', business: 'Restaurante La Brasa', sector: 'Restaurante', mood: 'Ocupada y desconfiada', context: 'Web de 2016, reservas solo por teléfono. Los viernes no da abasto con las llamadas.', opener: 'La Brasa, dígame… Ah, ¿vendes webs?' },
  { id: 'pelu', owner: 'Javi', business: 'Barbería Javi Cuts', sector: 'Peluquería / Barbería', mood: 'Joven, directo', context: 'Solo tiene Instagram (4.000 seguidores). Las citas van por DM y se le pierden mensajes.', opener: 'Ey, vi tu mensaje. Cuéntame, pero rápido que tengo cliente.' },
  { id: 'dental', owner: 'Dra. Ruiz', business: 'Clínica Dental Sonríe', sector: 'Clínica dental', mood: 'Analítica, pregunta mucho', context: 'Web antigua, lenta en móvil. Quiere más pacientes de implantes y ortodoncia.', opener: 'Buenos días. Me ha dicho recepción que llamaba por la web.' },
  { id: 'taller', owner: 'Manolo', business: 'Talleres Hermanos Gil', sector: 'Taller mecánico', mood: 'Escéptico con internet', context: 'Sin web. Vive del boca a boca desde hace 25 años. Sus hijos le dicen que se modernice.', opener: '¿Sí? Mira, estoy con un coche en el elevador.' },
  { id: 'inmo', owner: 'Laura', business: 'Inmobiliaria Horizonte', sector: 'Inmobiliaria', mood: 'Orientada a números', context: 'Web con plantilla genérica. Depende de portales que le cobran mucho por cada lead.', opener: 'Hola. Tienes dos minutos, te escucho.' },
];

const has = (t: string, words: string[]) => words.filter((w) => t.includes(normalize(w))).length;

const BENEFIT = ['cliente', 'reserva', 'cita', 'venta', 'ingres', 'rentab', 'se paga', 'resultado', 'ganar', 'factur', 'paciente', 'llamada', 'contacto', 'google', 'encuentr', 'confianza', 'competencia', 'tiempo'];
const PROOF = ['por ejemplo', 'otro negocio', 'un cliente', 'una clinica', 'un restaurante', 'caso', 'otra barberia', 'trabaje con', 'he hecho', 'a otro'];
const HEDGES = ['creo que', 'quizas', 'a lo mejor', 'igual ', 'perdon', 'siento molestar', 'no se', 'un poquito', 'intentare', 'espero que', 'si no es molestia', 'perdona'];
const DISCOUNT = ['descuento', 'rebaja', 'mas barato', 'te lo dejo', 'bajar el precio', 'gratis'];
const ASSERTIVE = ['te propongo', 'lo que hago', 'mi trabajo', 'te garantizo', 'trabajo con', 'me encargo', 'mi recomendacion', 'lo que necesitas'];
const EMPATHY = ['entiendo', 'logico', 'normal', 'tiene sentido', 'comprendo', 'claro', 'razon', 'es habitual', 'me parece bien', 'perfecto'];
const OPEN_Q = ['como ', 'que ', 'cuanto', 'cual', 'por que', 'de donde', 'cuando', 'quien'];
const CLOSE = ['reunion', 'llamada', 'te va bien', 'te viene bien', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'manana', 'empezamos', 'quedamos', 'te envio', 'te mando', 'te paso', 'agendamos', 'cita', 'esta semana', 'semana que viene', 'minutos'];
const JARGON = ['seo', 'responsive', 'frontend', 'backend', 'cms', 'hosting', 'react', 'wordpress', 'ux', 'ui', 'framework', 'html', 'css', 'core web vitals', 'landing'];

const SPECIFIC: Record<string, string[]> = {
  precio: ['inversion', 'rentab', 'se paga', 'cuanto te deja', 'ticket', 'fracciona', 'plazos', 'mitad', '50%', 'al mes'],
  ya_tengo_web: ['movil', 'convierte', 'contactos', 'te llegan', 'detalle', 'he visto', 'boton', 'lenta', 'reservar'],
  desinteres: ['una pregunta', 'antes de irme', 'solo', 'te mando', 'he visto', 'permiso'],
  tiempo: ['minutos', 'me encargo', 'tu solo', 'cuando', 'fecha', 'semana'],
  pensarlo: ['dudas', 'que parte', 'del 1 al 10', 'que te frena', 'que necesitas', 'precio, los plazos'],
  aporta: ['clientes', 'reservas', 'citas', 'resultado', 'ejemplo', 'google', 'al mes'],
  oferta: ['opcion', 'plan', 'incluye', '€', 'euros', 'pago', 'basico', 'premium', 'recomend'],
};

const OBJ_HINT: Record<string, string> = {
  precio: 'convierte el precio en retorno (ticket medio × clientes nuevos) y ofrece fraccionar el pago.',
  ya_tengo_web: 'señala un fallo concreto de su web actual (móvil, botón de reservar, velocidad) y pregunta cuántos contactos le trae.',
  desinteres: 'pide permiso para una sola pregunta o para enviar algo breve.',
  tiempo: 'reduce el esfuerzo ("20 minutos y yo me encargo") y propone dos huecos concretos.',
  pensarlo: 'descubre la duda real: ¿precio, plazos o resultado? Del 1 al 10, ¿qué falta para el 10?',
  aporta: 'habla de resultados medibles para su negocio: clientes, reservas, llamadas al mes.',
  oferta: 'presenta tres opciones con precio, empezando por la premium, y recomienda la del medio.',
};

export interface Evaluation {
  score: number;
  breakdown: Record<Dimension, number>;
  tips: string[];
  strengths: string[];
}

export function evaluate(answer: string, objectionId: string): Evaluation {
  const raw = answer.trim();
  const t = ' ' + normalize(raw) + ' ';
  const words = raw.split(/\s+/).filter(Boolean);
  const wc = words.length;
  const sentences = raw.split(/[.!?¿¡]+/).filter((s) => s.trim().length > 0);
  const avgSentence = wc / Math.max(1, sentences.length);
  const questions = (raw.match(/\?/g) || []).length;
  const numbers = (raw.match(/\d/g) || []).length > 0;

  const b = {} as Record<Dimension, number>;
  // Claridad
  let c = 70;
  if (wc < 6) c = 25;
  else if (wc < 12) c = 55;
  else if (wc <= 70) c = 85;
  else if (wc <= 110) c = 65;
  else c = 40;
  if (avgSentence > 28) c -= 15;
  c -= has(t, JARGON) * 10;
  b.claridad = c;

  // Persuasión
  let p = 30 + has(t, BENEFIT) * 12 + has(t, PROOF) * 15 + (numbers ? 12 : 0);
  if (/\btu\b|\btus\b|\bte\b|\bvuestro|\busted/.test(t)) p += 8;
  b.persuasion = p;

  // Confianza
  let conf = 80 - has(t, HEDGES) * 15 - has(t, DISCOUNT) * 20 + has(t, ASSERTIVE) * 8;
  if ((raw.match(/!/g) || []).length > 2) conf -= 10;
  if (wc < 6) conf -= 20;
  b.confianza = conf;

  // Detección de necesidades
  let n = 20 + Math.min(2, questions) * 25 + (questions ? has(t, OPEN_Q) * 6 : 0);
  if (questions > 3) n -= 15; // interrogatorio
  b.necesidades = n;

  // Manejo de objeciones
  let o = 25 + Math.min(1, has(t, EMPATHY)) * 25 + has(t, SPECIFIC[objectionId] ?? []) * 12;
  if (/\bpero\b/.test(t) && has(t, EMPATHY)) o -= 5; // "entiendo, pero…" invalida lo anterior
  if (has(t, DISCOUNT) && objectionId === 'precio') o -= 20;
  b.objeciones = o;

  // Cierre
  let cl = 15 + Math.min(2, has(t, CLOSE)) * 25;
  if (/\d{1,2}(:\d{2})?\s?(h|horas)\b|a las \d/.test(t)) cl += 15;
  if (/\?\s*$/.test(raw)) cl += 10;
  b.cierre = cl;

  for (const k of DIMENSIONS) b[k] = Math.round(Math.max(0, Math.min(100, b[k])));
  const weights: Record<Dimension, number> = { claridad: 1, persuasion: 1.2, confianza: 1, necesidades: 1, objeciones: 1.4, cierre: 1.2 };
  const total = DIMENSIONS.reduce((s, k) => s + b[k] * weights[k], 0) / DIMENSIONS.reduce((s, k) => s + weights[k], 0);

  const tips: string[] = [];
  const strengths: string[] = [];
  const sorted = [...DIMENSIONS].sort((x, y) => b[x] - b[y]);
  const TIP: Record<Dimension, string> = {
    claridad:
      wc > 70
        ? 'Demasiado largo. En una objeción, responde en 2-3 frases. Corta todo lo que no ayude a avanzar.'
        : wc < 12
          ? 'Muy corto. Reconoce la objeción, aporta un argumento y propone algo.'
          : 'Evita tecnicismos (SEO, responsive, CMS…). Habla de resultados: clientes, reservas, llamadas.',
    persuasion: 'Habla del resultado para su negocio (clientes, reservas, dinero) y usa un número o un ejemplo concreto.',
    confianza: has(t, DISCOUNT)
      ? 'Ofrecer descuento al primer "no" transmite que tu precio no era real. Defiende el valor primero.'
      : 'Elimina muletillas de inseguridad ("creo que", "a lo mejor", "perdona"). Afirma con calma.',
    necesidades: questions === 0 ? 'No has hecho ninguna pregunta. Una buena pregunta vale más que tres argumentos.' : 'Haz preguntas abiertas (¿cómo…?, ¿qué…?, ¿cuánto…?) que hagan hablar al cliente.',
    objeciones: has(t, EMPATHY) ? `Responde a la objeción concreta: ${OBJ_HINT[objectionId] ?? 'reencuadra hacia el valor para su negocio.'}` : 'Primero valida ("tiene sentido", "es lógico") sin "pero" y luego reencuadra la objeción hacia el valor.',
    cierre: 'Termina siempre con un siguiente paso concreto: día, hora y formato ("¿te va bien el jueves a las 11?").',
  };
  const STRENGTH: Record<Dimension, string> = {
    claridad: 'Respuesta clara y de longitud adecuada.',
    persuasion: 'Hablas en términos de beneficio para el cliente.',
    confianza: 'Transmites seguridad, sin justificarte.',
    necesidades: 'Buenas preguntas para entender la situación.',
    objeciones: 'Validas la objeción y la reencuadras bien.',
    cierre: 'Propones un siguiente paso concreto.',
  };
  for (const k of sorted.slice(0, 3)) if (b[k] < 70) tips.push(TIP[k]);
  for (const k of [...sorted].reverse().slice(0, 2)) if (b[k] >= 70) strengths.push(STRENGTH[k]);
  return { score: Math.round(total), breakdown: b, tips, strengths };
}

/** Transición entre rondas: reacciona a tu respuesta y encadena la siguiente objeción con coherencia. */
const TRANSITIONS = {
  good: ['Vale, eso tiene sentido. Aun así…', 'Hmm, no lo había visto así. Pero dime una cosa:', 'Bueno, eso me cuadra más. Ahora,'],
  mid: ['Ya… no sé.', 'Eso dicen todos.', 'Puede ser, pero…'],
  bad: ['No me has convencido.', 'Mira, no lo veo.', 'Sigo igual que antes.'],
};
export function transition(score: number, seed: number) {
  const pool = score >= 70 ? TRANSITIONS.good : score >= 45 ? TRANSITIONS.mid : TRANSITIONS.bad;
  return pool[seed % pool.length];
}

export function closingLine(score: number) {
  if (score >= 70) return 'Vale, me has convencido bastante. Mándame la propuesta por escrito y lo vemos esta semana.';
  if (score >= 45) return 'Bueno… déjame pensarlo y ya te digo algo.';
  return 'Mira, de momento no. Gracias por llamar.';
}

export function modelAnswer(objectionId: string, ticket: string): string {
  const o = OBJECTIONS.find((x) => x.id === objectionId);
  if (o) return o.response.replace('{ticket}', ticket);
  if (objectionId === 'aporta')
    return 'Te aporta algo muy concreto: que la gente que ya te busca acabe contactándote en vez de irse a la competencia. Por ejemplo, con un botón de reserva visible y una web rápida en móvil, un negocio como el tuyo suele notar más contactos en el primer mes. ¿Cuántos clientes nuevos te gustaría sumar al mes?';
  return 'Te propongo tres opciones: una básica para empezar a captar clientes, la recomendada con reservas y SEO local, y una completa con mantenimiento incluido. La mayoría de negocios como el tuyo eligen la del medio. ¿Te explico en 10 minutos qué incluye cada una, el martes o el jueves?';
}

/** Siguiente objeción en función de cómo va la conversación. */
export function nextObjection(used: string[], score: number): string {
  const order = score >= 70 ? ['oferta', 'pensarlo', 'precio', 'tiempo'] : ['aporta', 'precio', 'ya_tengo_web', 'desinteres', 'pensarlo'];
  return order.find((o) => !used.includes(o)) ?? 'pensarlo';
}

export const OBJECTION_TEXT: Record<string, string> = {
  precio: 'Es demasiado caro.',
  ya_tengo_web: 'Ya tengo página.',
  desinteres: 'No me interesa.',
  tiempo: 'Ahora mismo no.',
  pensarlo: 'Tengo que pensarlo.',
  aporta: '¿Qué me aporta?',
  oferta: 'Hazme una oferta.',
};
