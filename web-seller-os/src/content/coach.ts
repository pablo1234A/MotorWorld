export interface Training {
  technique: { name: string; what: string; how: string; example: string };
  objectionId: string;
  exercise: string;
  simulation: { situation: string; options: string[]; best: number; why: string };
}

export const TRAININGS: Training[] = [
  {
    technique: {
      name: 'Preguntar antes de presentar',
      what: 'Quien pregunta, dirige. Antes de hablar de tu servicio, descubre qué le duele al cliente.',
      how: 'Haz al menos 3 preguntas abiertas antes de mencionar precios o soluciones.',
      example: '"¿Cómo os llegan hoy los clientes nuevos?" · "¿Qué pasa cuando alguien os busca en Google?"',
    },
    objectionId: 'desinteres',
    exercise: 'Escribe 5 preguntas abiertas para un restaurante sin reservas online. Úsalas en tu próxima llamada.',
    simulation: {
      situation: 'Un dueño de peluquería te dice: "¿Y tú qué vendes exactamente?"',
      options: [
        'Hago páginas web profesionales desde 600 €, con diseño moderno y SEO.',
        'Ayudo a peluquerías a llenar la agenda sin depender del teléfono. ¿Ahora cómo os piden cita?',
        'Soy diseñador web freelance, ¿te interesa una web?',
      ],
      best: 1,
      why: 'Habla del resultado (agenda llena) y termina con una pregunta que abre conversación.',
    },
  },
  {
    technique: {
      name: 'El silencio después del precio',
      what: 'Después de decir el precio, calla. El primero que habla, cede.',
      how: 'Di el precio con seguridad, sin justificarlo, y espera. Cuenta mentalmente hasta 5.',
      example: '"La inversión es de 1.400 €." (silencio)',
    },
    objectionId: 'precio',
    exercise: 'Di tu precio en voz alta 10 veces frente al espejo sin añadir nada después. Grábate una vez.',
    simulation: {
      situation: 'Acabas de decir el precio (1.200 €) y el cliente se queda callado.',
      options: [
        'Bueno, pero si te parece mucho podemos ajustarlo un poco…',
        '(Esperas en silencio hasta que el cliente hable.)',
        'Incluye muchas cosas, te explico todo lo que lleva…',
      ],
      best: 1,
      why: 'Rellenar el silencio transmite inseguridad y suele acabar en descuento innecesario.',
    },
  },
  {
    technique: {
      name: 'Cierre por alternativa',
      what: 'No preguntes si quiere; pregunta cuál de dos opciones prefiere.',
      how: 'Ofrece dos opciones válidas: dos fechas, dos planes, dos formas de pago.',
      example: '"¿Te va mejor empezar el lunes 14 o el lunes 21?"',
    },
    objectionId: 'tiempo',
    exercise: 'Reescribe tus 3 últimos mensajes de cierre para que terminen con una alternativa.',
    simulation: {
      situation: 'La reunión ha ido bien. Quieres cerrar la siguiente cita.',
      options: ['¿Cuándo te viene bien que hablemos?', 'Ya me dices algo cuando lo veas.', '¿Te va mejor el martes a las 10 o el jueves a las 17?'],
      best: 2,
      why: 'Dos opciones concretas reducen el esfuerzo de decidir y aumentan la tasa de cita.',
    },
  },
  {
    technique: {
      name: 'Etiquetar la emoción',
      what: 'Nombrar lo que siente el cliente baja su defensa (técnica de Chris Voss).',
      how: 'Empieza con "Parece que…", "Da la sensación de que…", "Suena a que…".',
      example: '"Parece que te han vendido webs antes y no salió bien."',
    },
    objectionId: 'pensarlo',
    exercise: 'En tu próxima conversación, usa al menos 2 etiquetas antes de proponer nada.',
    simulation: {
      situation: 'El cliente dice: "Ya pagué una web hace 3 años y no sirvió para nada."',
      options: [
        'Pues conmigo será diferente, te lo garantizo.',
        'Parece que te sentiste un poco engañado con esa experiencia.',
        'Eso es porque no estaba bien hecha.',
      ],
      best: 1,
      why: 'Validar la emoción primero genera confianza; prometer o criticar genera rechazo.',
    },
  },
  {
    technique: {
      name: 'Cuantificar el dolor',
      what: 'Un problema sin número no duele. Convierte el problema en euros.',
      how: 'Pregunta: ticket medio × clientes perdidos al mes = dinero que se escapa.',
      example: '"Si perdéis 5 reservas por semana a 30 €, son 600 € al mes."',
    },
    objectionId: 'no_gastar',
    exercise: 'Calcula el "dinero perdido" de 3 prospectos de tu CRM y añádelo a sus notas.',
    simulation: {
      situation: 'Un taller te dice que la web "estaría bien pero no es urgente".',
      options: [
        '¿Cuánto os deja de media una reparación? … Si la web os trajera 4 al mes, ¿cuánto sería al año?',
        'Hoy en día todo el mundo necesita web.',
        'Vale, te escribo en unos meses.',
      ],
      best: 0,
      why: 'Al cuantificar, el cliente descubre por sí mismo el coste de no actuar.',
    },
  },
  {
    technique: {
      name: 'Prueba social específica',
      what: 'Un caso concreto de un negocio parecido convence más que cualquier argumento.',
      how: 'Usa sector + ciudad + resultado: "Una clínica en Valencia pasó de X a Y".',
      example: '"A una barbería de aquí al lado le pusimos reservas online y redujo un 40% las llamadas."',
    },
    objectionId: 'ya_tengo_web',
    exercise: 'Escribe tu mejor caso de éxito (real) en 3 frases: situación, acción, resultado. Guárdalo en Recursos.',
    simulation: {
      situation: 'El cliente duda de que una web le traiga clientes.',
      options: [
        'Las estadísticas dicen que el 80% de la gente busca en Google.',
        'A [negocio parecido] le pasó lo mismo; tras la web nueva recibe X solicitudes al mes. ¿Quieres verla?',
        'Créeme, funciona.',
      ],
      best: 1,
      why: 'Lo específico y comprobable vence a lo genérico. Usa solo casos reales.',
    },
  },
  {
    technique: {
      name: 'Hacer que el cliente lo diga',
      what: 'La gente cree lo que dice ella misma, no lo que le dices tú.',
      how: 'En lugar de afirmar el problema, pregunta para que el cliente lo verbalice.',
      example: '"¿Qué crees que piensa alguien que entra en tu web desde el móvil?"',
    },
    objectionId: 'no_hace_falta',
    exercise: 'Convierte 5 afirmaciones de tu discurso en preguntas.',
    simulation: {
      situation: 'Has visto que su web no funciona bien en móvil.',
      options: [
        'Tu web se ve fatal en móvil.',
        '¿Has probado a reservar desde el móvil en tu propia web? ¿Qué tal la experiencia?',
        'El 70% de tu tráfico es móvil y tu web no está adaptada.',
      ],
      best: 1,
      why: 'Si lo descubre él, no hay nada que discutir.',
    },
  },
  {
    technique: {
      name: 'Primer mensaje en 3 líneas',
      what: 'Los mensajes largos de desconocidos no se leen. Breve, personal y con una pregunta.',
      how: 'Línea 1: algo específico suyo. Línea 2: el problema. Línea 3: pregunta fácil de responder.',
      example: '"Hola Ana, he visto vuestras uñas en Instagram, ¡muy buen trabajo! En la web no he visto forma de pedir cita online. ¿Lo gestionáis todo por teléfono?"',
    },
    objectionId: 'desinteres',
    exercise: 'Envía hoy 5 primeros mensajes de máximo 3 líneas usando el generador de mensajes.',
    simulation: {
      situation: '¿Cuál es el mejor primer mensaje por Instagram?',
      options: [
        'Hola! Soy diseñador web y hago webs profesionales a buen precio. ¿Te interesa? Te dejo mi portfolio 👉',
        'Hola Marta, me encantan vuestros brunch 😍 He intentado reservar desde la web y no he encontrado cómo. ¿Las reservas van solo por teléfono?',
        'Buenas, ¿tenéis página web?',
      ],
      best: 1,
      why: 'Personal, específico, señala un problema real y termina con una pregunta fácil.',
    },
  },
  {
    technique: {
      name: 'El seguimiento con valor',
      what: 'Nunca hagas un seguimiento vacío ("¿lo has pensado?"). Aporta algo nuevo cada vez.',
      how: 'Cada seguimiento lleva: una idea, un dato, un ejemplo o una mini auditoría.',
      example: '"Te paso una captura de cómo quedaría tu botón de reservas en móvil, para que te hagas una idea."',
    },
    objectionId: 'pensarlo',
    exercise: 'Prepara 3 seguimientos con valor para tus prospectos atrasados.',
    simulation: {
      situation: 'Llevas 5 días sin respuesta tras enviar la propuesta.',
      options: ['Hola, ¿has podido verlo?', 'Hola Juan, he preparado un boceto rápido de cómo quedaría vuestra portada. ¿Te lo enseño en 5 min mañana?', 'Te recuerdo que la oferta caduca pronto.'],
      best: 1,
      why: 'Aportar algo tangible reactiva la conversación sin presión.',
    },
  },
  {
    technique: {
      name: 'Anclaje de precio',
      what: 'El primer número que se oye condiciona todo lo demás.',
      how: 'Presenta primero el plan premium, luego el recomendado. El recomendado parecerá razonable.',
      example: '"El plan completo con tienda online son 2.800 €. Para lo que necesitáis ahora, el plan Profesional son 1.400 €."',
    },
    objectionId: 'precio',
    exercise: 'Usa la calculadora de precios y prepara 3 opciones (mín, recomendado, premium) para tu próxima propuesta.',
    simulation: {
      situation: 'Vas a presentar precios. ¿En qué orden?',
      options: ['Del más barato al más caro.', 'Solo el precio recomendado.', 'Primero el premium, luego el recomendado, y el básico como alternativa.'],
      best: 2,
      why: 'El anclaje alto hace que el recomendado se perciba como la opción sensata.',
    },
  },
  {
    technique: {
      name: 'Reducir el riesgo',
      what: 'Mucha gente no compra por miedo a equivocarse, no por falta de interés.',
      how: 'Ofrece garantías concretas: pago fraccionado, revisiones incluidas, entrega por fases.',
      example: '"Pagas el 50% al empezar y el otro 50% solo cuando estés contento con el resultado."',
    },
    objectionId: 'no_gastar',
    exercise: 'Define tu garantía estándar y añádela a tus plantillas de propuesta.',
    simulation: {
      situation: 'El cliente dice: "¿Y si luego no me gusta?"',
      options: [
        'Seguro que te gusta, tengo buen gusto.',
        'Trabajamos por fases: ves el diseño antes de programar nada, y tienes 2 rondas de cambios incluidas.',
        'Bueno, eso es un riesgo que hay que asumir.',
      ],
      best: 1,
      why: 'Un proceso claro elimina el miedo mejor que cualquier promesa.',
    },
  },
  {
    technique: {
      name: 'Pedir referidos en el momento justo',
      what: 'El mejor momento para pedir un referido es cuando el cliente está más contento.',
      how: 'Tras entregar y recibir un "me encanta", pide 1-2 nombres concretos.',
      example: '"Me alegra mucho. ¿Conoces a algún otro negocio de la zona al que le pueda pasar lo mismo?"',
    },
    objectionId: 'conocido',
    exercise: 'Escribe a tus clientes ganados y pide 1 referido a cada uno.',
    simulation: {
      situation: 'Acabas de entregar una web y el cliente está encantado.',
      options: ['Gracias, ¡un placer!', '¿Me podrías dejar una reseña y presentarme a 1 o 2 negocios amigos?', 'Si conoces a alguien, pásale mi número.'],
      best: 1,
      why: 'Una petición concreta y en caliente multiplica la tasa de referidos.',
    },
  },
  {
    technique: {
      name: 'Resumen + siguiente paso',
      what: 'Ninguna conversación debe terminar sin un siguiente paso concreto con fecha.',
      how: 'Resume lo hablado en una frase y propone el siguiente paso con día y hora.',
      example: '"Entonces: necesitáis reservas online y aparecer en Google. Te preparo la propuesta y la vemos el jueves a las 11, ¿vale?"',
    },
    objectionId: 'consultarlo',
    exercise: 'Revisa tu pipeline: todo prospecto activo debe tener un próximo seguimiento con fecha.',
    simulation: {
      situation: 'La llamada termina. ¿Cómo cierras?',
      options: ['Bueno, pues ya hablamos.', 'Te mando info por email y me dices.', 'Resumo: X e Y. Te envío la propuesta hoy y la repasamos el jueves a las 11. ¿Te va bien?'],
      best: 2,
      why: 'Sin fecha, el proceso muere. Con fecha, hay compromiso.',
    },
  },
  {
    technique: {
      name: 'Vender el resultado, no la web',
      what: 'Nadie quiere una web. Quieren clientes, reservas, prestigio, tiempo libre.',
      how: 'Sustituye "web" por el resultado en tu discurso: "sistema para conseguir reservas".',
      example: '"No te vendo una web, te monto el sistema para que la gente reserve sin llamarte."',
    },
    objectionId: 'ya_tengo_web',
    exercise: 'Reescribe tu presentación de 30 segundos sin usar la palabra "web".',
    simulation: {
      situation: 'Te preguntan "¿a qué te dedicas?" en un evento de negocios.',
      options: [
        'Hago páginas web.',
        'Ayudo a negocios locales a conseguir clientes por internet sin depender de las redes.',
        'Soy desarrollador frontend especializado en React.',
      ],
      best: 1,
      why: 'El resultado genera curiosidad; la técnica no le importa al cliente.',
    },
  },
];

export function trainingForDay(day: string): Training {
  const d = new Date(day + 'T12:00:00');
  const start = new Date(d.getFullYear(), 0, 0);
  const doy = Math.floor((d.getTime() - start.getTime()) / 86400000);
  return TRAININGS[doy % TRAININGS.length];
}
