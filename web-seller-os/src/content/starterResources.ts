import type { Resource } from '../data/types';

/** Pack opcional de plantillas. Solo se importa si el usuario lo pide. */
export const STARTER_RESOURCES: Partial<Resource>[] = [
  {
    kind: 'guion',
    title: 'Llamada en frío en 60 segundos',
    tags: ['llamada', 'apertura'],
    body: '1. "Hola [nombre], soy [tú]. Te llamo por algo concreto que he visto en vuestra web, ¿tienes 2 minutos?"\n2. Gancho: el problema nº1 que has detectado.\n3. Pregunta: "¿Os llegan clientes por la web ahora mismo?"\n4. Escucha. No vendas todavía.\n5. Cierre: "¿Te enseño en 15 minutos cómo lo solucionaría? ¿Martes o jueves?"',
  },
  {
    kind: 'plantilla',
    title: 'Estructura de propuesta en 1 página',
    tags: ['propuesta'],
    body: '• Situación actual (lo que he visto)\n• Objetivo (en su idioma: más reservas, más citas…)\n• Solución (3-5 puntos, sin tecnicismos)\n• Plazos (fechas concretas)\n• Inversión: 3 opciones (premium, recomendada, básica)\n• Garantía y forma de pago\n• Siguiente paso con fecha',
  },
  {
    kind: 'tecnica',
    title: 'Regla 70/30',
    tags: ['reunión', 'escucha'],
    body: 'En una reunión de ventas, el cliente debe hablar el 70% del tiempo. Si hablas más tú, estás presentando, no vendiendo. Prepara 5 preguntas abiertas antes de cada reunión.',
  },
  {
    kind: 'mensaje',
    title: 'Pedir reseña + referido tras la entrega',
    tags: ['postventa', 'referidos'],
    body: '¡Hola [nombre]! Me alegra mucho que estés contento/a con la web. Dos favores rápidos: ¿me dejarías una reseña en Google (te paso el enlace)? Y si conoces a algún negocio al que le pueda ayudar igual, me encantaría que me presentaras. ¡Gracias!',
  },
  {
    kind: 'respuesta',
    title: '"¿Por qué tú y no una agencia?"',
    tags: ['objeción'],
    body: 'Porque trabajas directamente conmigo: sin intermediarios, sin cuentas que cambian de manos y con respuesta el mismo día. Las agencias tienen estructura que pagar; yo pongo ese dinero en tu proyecto.',
  },
  {
    kind: 'prompt',
    title: 'Prompt: textos para la home de un cliente',
    tags: ['ia', 'copy'],
    body: 'Actúa como copywriter de conversión. Escribe los textos de la página de inicio para [negocio], un/a [sector] en [ciudad]. Cliente ideal: [descripción]. Diferenciales: [x, y, z]. Estructura: titular (máx 8 palabras), subtítulo, 3 beneficios, prueba social, CTA principal "[acción]". Tono cercano, sin tecnicismos.',
  },
];
