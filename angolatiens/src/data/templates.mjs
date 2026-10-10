// Plantillas gratuitas. Cada una se publica también como archivo .txt descargable.
export const templates = [
  {
    id: 'respuestas-frecuentes',
    title: 'Respuestas a preguntas frecuentes',
    cat: 'Atención al cliente',
    use: 'Genera las respuestas rápidas de WhatsApp o email a partir de tu lista de preguntas.',
    guide: 'responder-clientes-whatsapp-email-ia',
    text: `Actúa como el responsable de atención al cliente de [tipo de negocio] en [ciudad].
Te paso las preguntas que más nos hacen. Para cada una, escribe una respuesta:
- De 2 a 4 frases, cercana y profesional, tuteando al cliente.
- Que termine con una pregunta o siguiente paso claro (reservar, enviar foto, llamar).
- Sin inventar datos: si falta información, escribe [COMPLETAR].

Datos del negocio: horario [..], zona de servicio [..], forma de pago [..].

Preguntas:
1. ...
2. ...`,
  },
  {
    id: 'presupuesto',
    title: 'Presupuesto desde notas de visita',
    cat: 'Ventas',
    use: 'Convierte tus notas en un presupuesto ordenado usando solo tus tarifas.',
    guide: 'presupuestos-con-ia',
    text: `Con mis notas de abajo, prepara un presupuesto para el cliente.
Formato:
1. Resumen del trabajo en 2-3 frases que entienda alguien no técnico.
2. Tabla de partidas: concepto | cantidad | precio unitario | total.
   USA SOLO los precios que te doy. Si falta un precio, escribe [PRECIO].
3. Qué NO incluye el presupuesto (para evitar malentendidos).
4. Plazos y condiciones: [validez 30 días, 50 % al aceptar, etc.].
5. Una frase final invitando a resolver dudas.

Mis tarifas: [lista de precios]
Notas de la visita: [notas]`,
  },
  {
    id: 'respuesta-resena',
    title: 'Respuesta a una reseña',
    cat: 'Reputación',
    use: 'Borrador para responder reseñas de Google positivas o negativas.',
    guide: 'responder-clientes-whatsapp-email-ia',
    text: `Escribe una respuesta pública a esta reseña de mi negocio ([tipo de negocio]):
"[texto de la reseña]"

Requisitos:
- Máximo 80 palabras, tono amable y profesional.
- Si es negativa: agradece, reconoce el problema sin excusas, explica qué
  vamos a hacer y ofrece continuar por privado en [teléfono o email del negocio].
- Si es positiva: agradece de forma concreta mencionando lo que valoró.
- No ofrezcas descuentos ni compensaciones.
- No repitas datos personales del cliente.`,
  },
  {
    id: 'plan-contenido',
    title: 'Plan de contenido mensual',
    cat: 'Marketing',
    use: 'Doce ideas de publicaciones con texto, foto sugerida y llamada a la acción.',
    guide: 'contenido-redes-un-mes-una-tarde',
    text: `Soy [profesión] en [ciudad]. Mis clientes suelen ser [tipo de cliente]
y lo que más me preguntan es [dudas habituales].
Propón 12 publicaciones para Instagram para el próximo mes, repartidas entre:
- Trabajo realizado
- Consejo útil
- Detrás del negocio
Para cada una: título, texto de 60-100 palabras, idea de foto que puedo hacer
yo con el móvil y una llamada a la acción. Nada de emojis en exceso
ni promesas exageradas.`,
  },
  {
    id: 'email-seguimiento',
    title: 'Seguimiento de un presupuesto sin respuesta',
    cat: 'Ventas',
    use: 'Recordatorio educado para un cliente que no ha contestado a tu presupuesto.',
    guide: 'presupuestos-con-ia',
    text: `Escribe un email breve de seguimiento para un cliente al que envié un
presupuesto hace [número] días y no ha respondido.
Trabajo presupuestado: [descripción].
Tono: cercano, sin presionar.
Incluye: recordatorio en una frase, una pregunta para resolver dudas,
y la fecha de validez del presupuesto ([fecha]).
Máximo 90 palabras. Asunto incluido.`,
  },
  {
    id: 'procedimiento',
    title: 'Convertir una tarea en procedimiento',
    cat: 'Organización',
    use: 'Documenta una tarea para delegarla o automatizarla después.',
    guide: 'automatizar-formulario-hoja-aviso-make',
    text: `Te voy a describir cómo hago una tarea de mi negocio. Conviértela en un
procedimiento claro:
1. Objetivo de la tarea en una frase.
2. Cuándo se hace y cada cuánto.
3. Pasos numerados, con la herramienta que se usa en cada paso.
4. Qué pasos son repetitivos y podrían automatizarse (márcalos con [AUTO]).
5. Errores habituales y cómo evitarlos.

Mi descripción: [cuéntalo como si se lo explicaras a alguien nuevo]`,
  },
];

// Recurso en formato hoja de cálculo (CSV) para detectar qué automatizar.
export const csvResources = [
  {
    file: 'inventario-tareas-automatizables.csv',
    title: 'Inventario de tareas automatizables',
    use: 'Apunta tus tareas repetitivas durante una semana y descubre cuáles conviene automatizar primero.',
    content: `Tarea;Veces por semana;Minutos por vez;Horas al mes (calc.);Herramientas que usas;¿Siempre igual? (sí/no);Prioridad (1-3);Notas
Responder preguntas de precio por WhatsApp;30;3;=B2*C2*433/6000;WhatsApp;sí;1;
Copiar solicitudes del formulario a la hoja;10;4;=B3*C3*433/6000;Gmail, Sheets;sí;1;
Preparar presupuestos;5;40;=B4*C4*433/6000;Word;no;2;
`,
  },
];
