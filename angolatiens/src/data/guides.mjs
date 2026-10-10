// Guías originales. El cuerpo es HTML controlado por el equipo editorial.
// Bloques disponibles: <div class="box">, <div class="box box--warn">, <ol class="steps">,
// <pre class="prompt" data-copy> (con botón de copiar).

export const guides = [
  {
    slug: 'responder-clientes-whatsapp-email-ia',
    title: 'Cómo responder a tus clientes por WhatsApp y email con IA sin sonar a robot',
    seoTitle: 'Responder a clientes con IA por WhatsApp y email',
    description: 'Sistema práctico para contestar más rápido a las preguntas de siempre usando respuestas rápidas, plantillas y un asistente de IA, sin perder el trato personal.',
    kicker: 'Atención al cliente',
    cover: { tone: 'verde', text: 'Responder' },
    readingMin: 8,
    updated: '2026-10-10',
    tools: ['whatsapp-business', 'chatgpt', 'claude', 'manychat', 'tidio'],
    related: ['ia-proteccion-datos-rgpd', 'herramientas-ia-gratis-autonomos'],
    body: `
<p class="lead">La mayoría de los mensajes que recibe un pequeño negocio son variaciones de las mismas diez preguntas: precio, horario, disponibilidad, cómo llegar, plazos. Contestarlas una a una es lo que se come las tardes. El objetivo no es que una máquina hable por ti, sino que <strong>tú contestes en 30 segundos lo que antes te llevaba cinco minutos</strong>.</p>

<h2>Paso 1. Haz la lista de tus preguntas repetidas</h2>
<p>Durante una semana, apunta cada pregunta que te hagan por WhatsApp, email o redes. No hace falta ninguna herramienta: una nota en el móvil vale. Al final tendrás entre 8 y 15 preguntas que suponen la mayor parte de los mensajes.</p>

<h2>Paso 2. Redacta las respuestas base con ayuda de la IA</h2>
<p>Pega tu lista en un asistente como ChatGPT o Claude con este prompt. Sustituye lo que está entre corchetes:</p>
<pre class="prompt" data-copy>Actúa como el responsable de atención al cliente de [tipo de negocio] en [ciudad].
Te paso las preguntas que más nos hacen. Para cada una, escribe una respuesta:
- De 2 a 4 frases, cercana y profesional, tuteando al cliente.
- Que termine con una pregunta o siguiente paso claro (reservar, enviar foto, llamar).
- Sin inventar datos: si falta información, escribe [COMPLETAR].

Datos del negocio: horario [..], zona de servicio [..], forma de pago [..].

Preguntas:
1. ...
2. ...</pre>
<p>Revisa cada respuesta y rellena los <code>[COMPLETAR]</code>. Esta revisión es la parte importante: la IA no conoce tus precios ni tus condiciones.</p>

<h2>Paso 3. Guárdalas como respuestas rápidas</h2>
<p>En <a href="/herramientas/whatsapp-business/">WhatsApp Business</a> ve a <em>Herramientas para la empresa → Respuestas rápidas</em> y crea un atajo por respuesta (por ejemplo <code>/precio</code>, <code>/horario</code>). En Gmail puedes usar las <em>plantillas</em> de la configuración avanzada; en Outlook, las <em>firmas</em> o los <em>elementos rápidos</em>.</p>
<p>Configura también el <strong>mensaje de bienvenida</strong> y el de <strong>ausencia</strong> fuera de horario. Solo con esto ya habrás ganado tiempo, y todavía no has pagado nada.</p>

<h2>Paso 4. Para mensajes nuevos, usa la IA como borrador</h2>
<p>Cuando llegue un mensaje que no encaja en tus plantillas (una queja, un presupuesto complejo), copia el texto del cliente <strong>sin nombres ni datos personales</strong> y pide un borrador:</p>
<pre class="prompt" data-copy>Un cliente me ha escrito esto: "[mensaje sin datos personales]".
Escribe una respuesta breve en tono [cercano/formal], que:
1. Reconozca su situación en una frase.
2. Explique qué podemos hacer: [tu solución].
3. Proponga un siguiente paso concreto.
No prometas plazos ni descuentos que yo no haya indicado.</pre>

<div class="box box--warn"><strong>Ojo con los datos.</strong> No pegues en un asistente de IA nombres, teléfonos, direcciones ni datos de salud de tus clientes sin haber revisado cómo trata los datos esa herramienta. Lo explicamos en <a href="/guias/ia-proteccion-datos-rgpd/">qué puedes y qué no puedes pegar en ChatGPT</a>.</div>

<h2>Paso 5. ¿Y un chatbot que conteste solo?</h2>
<p>Tiene sentido cuando recibes muchos mensajes fuera de horario o por la web, y tus respuestas ya están bien definidas (pasos 1 a 3). Opciones:</p>
<ul>
<li><a href="/herramientas/tidio/">Tidio</a> para el chat de tu página web.</li>
<li><a href="/herramientas/manychat/">ManyChat</a> si los mensajes llegan por Instagram o WhatsApp.</li>
</ul>
<p>Empieza con las preguntas frecuentes y deja siempre una salida a una persona ("Te paso con [nombre]"). Un bot que no entiende y no deja hablar con nadie hace más daño que no tener bot.</p>

<h2>Cuánto tiempo puedes ahorrar</h2>
<p>Depende de tu volumen. Si contestas 20 mensajes repetidos al día y cada uno te lleva 3 minutos, con plantillas puedes bajar a menos de 1 minuto. Haz tu propio cálculo con la <a href="/calculadoras/ahorro-automatizacion/">calculadora de ahorro</a>.</p>
`,
  },
  {
    slug: 'presupuestos-con-ia',
    title: 'Prepara presupuestos claros en 10 minutos con IA (con plantilla)',
    seoTitle: 'Cómo hacer presupuestos con IA: método y plantilla',
    description: 'Método paso a paso para convertir notas de una visita o una llamada en un presupuesto ordenado y profesional usando un asistente de IA, sin que invente precios.',
    kicker: 'Ventas',
    cover: { tone: 'ocre', text: '10 min' },
    readingMin: 7,
    updated: '2026-10-10',
    tools: ['chatgpt', 'claude', 'holded', 'gamma'],
    related: ['verifactu-autonomos-2027', 'responder-clientes-whatsapp-email-ia'],
    body: `
<p class="lead">Un presupuesto bien presentado transmite profesionalidad y reduce las preguntas del cliente. La IA es muy buena ordenando y redactando; es mala inventando precios. Por eso el método separa las dos cosas: <strong>tú pones las cifras, la IA pone el orden y las palabras</strong>.</p>

<h2>Lo que necesitas</h2>
<div class="box"><ul>
<li>Tus notas de la visita o la llamada (vale un audio transcrito o una lista escrita deprisa).</li>
<li>Tu lista de precios o tarifas habituales.</li>
<li>Un asistente de IA: <a href="/herramientas/chatgpt/">ChatGPT</a> o <a href="/herramientas/claude/">Claude</a> en su versión gratuita sirven.</li>
</ul></div>

<h2>Paso 1. Crea tu "ficha de negocio" una sola vez</h2>
<p>Escribe en un documento: qué haces, tus condiciones habituales (forma de pago, validez del presupuesto, garantía, desplazamientos) y tu tono. En Claude puedes guardarlo en un <em>Proyecto</em>; en ChatGPT, en las instrucciones personalizadas o en un GPT propio. Así no tendrás que repetirlo.</p>

<h2>Paso 2. Pega tus notas con este prompt</h2>
<pre class="prompt" data-copy>Con mis notas de abajo, prepara un presupuesto para el cliente.
Formato:
1. Resumen del trabajo en 2-3 frases que entienda alguien no técnico.
2. Tabla de partidas: concepto | cantidad | precio unitario | total.
   USA SOLO los precios que te doy. Si falta un precio, escribe [PRECIO].
3. Qué NO incluye el presupuesto (para evitar malentendidos).
4. Plazos y condiciones: [validez 30 días, 50 % al aceptar, etc.].
5. Una frase final invitando a resolver dudas.

Mis tarifas: [lista de precios]
Notas de la visita: [notas]</pre>

<h2>Paso 3. Comprueba las cuentas</h2>
<p>Los asistentes de IA pueden equivocarse al multiplicar o sumar. <strong>Recalcula siempre los totales</strong> en tu programa de facturación o en una hoja de cálculo, y aplica allí los impuestos que correspondan.</p>

<h2>Paso 4. Pásalo a tu programa de facturación</h2>
<p>Copia las partidas a tu software de facturación (por ejemplo <a href="/herramientas/holded/">Holded</a> u otro) para que el presupuesto quede numerado y luego puedas convertirlo en factura. Con la llegada de <a href="/guias/verifactu-autonomos-2027/">Verifactu</a>, tener presupuestos y facturas en el mismo sistema te ahorrará trabajo.</p>

<h2>Paso 5 (opcional). Una propuesta visual para trabajos grandes</h2>
<p>Para proyectos de cierto importe, una presentación breve ayuda a vender. <a href="/herramientas/gamma/">Gamma</a> convierte el texto del presupuesto en una propuesta visual que puedes exportar a PDF. Revisa el diseño antes de enviarla.</p>

<div class="box"><strong>Plantilla descargable.</strong> Tienes el prompt completo y una estructura de presupuesto en <a href="/plantillas/">Plantillas</a>.</div>
`,
  },
  {
    slug: 'verifactu-autonomos-2027',
    title: 'Verifactu: qué cambia para autónomos y cómo elegir programa de facturación',
    seoTitle: 'Verifactu para autónomos: fechas y cómo elegir programa',
    description: 'Explicación clara de Verifactu y del reglamento de sistemas de facturación: a quién afecta, calendario según las fuentes consultadas y criterios para elegir software.',
    kicker: 'Gestión',
    cover: { tone: 'azul', text: 'Verifactu' },
    readingMin: 9,
    updated: '2026-10-10',
    tools: ['holded', 'make'],
    related: ['presupuestos-con-ia', 'automatizar-formulario-hoja-aviso-make'],
    body: `
<div class="box box--warn"><strong>Información general, no asesoramiento fiscal.</strong> Las fechas y obligaciones pueden cambiar. Confírmalas en la <a href="https://sede.agenciatributaria.gob.es/" rel="noopener">sede de la Agencia Tributaria</a> o con tu asesoría.</div>

<p class="lead">El Reglamento de requisitos de los sistemas informáticos de facturación (Real Decreto 1007/2023) obliga a que los programas con los que se emiten facturas garanticen que los registros no se pueden alterar. <strong>Verifactu</strong> es la modalidad en la que esos registros se envían automáticamente a la Agencia Tributaria.</p>

<h2>¿A quién afecta?</h2>
<p>En términos generales, a empresas y autónomos que emiten facturas con un programa informático. Quedan fuera, entre otros, quienes ya están en el Suministro Inmediato de Información (SII) y los contribuyentes de territorios forales con sistemas propios (como TicketBAI en el País Vasco). Revisa tu caso concreto con tu asesoría.</p>

<h2>¿Desde cuándo?</h2>
<p>Las fuentes consultadas en octubre de 2026 coinciden en este calendario tras el aplazamiento aprobado a finales de 2025:</p>
<ul>
<li><strong>1 de enero de 2027</strong>: contribuyentes del Impuesto sobre Sociedades.</li>
<li><strong>1 de julio de 2027</strong>: resto de obligados, incluidos los autónomos.</li>
</ul>
<p class="source">Fuentes: <a href="https://www.elindependiente.com/eli/2026/06/26/programas-de-facturacion-con-verifactu-cuales-cumplen-y-cuales-elegir/" rel="noopener">El Independiente (jun. 2026)</a>, <a href="https://softabase.com/es/guides/mejor-programa-facturacion-verifactu" rel="noopener">Softabase (jul. 2026)</a>. Verifica la fecha vigente en la AEAT.</p>

<h2>Lo que tienes que hacer en la práctica</h2>
<ol class="steps">
<li><strong>Averigua cómo facturas hoy.</strong> ¿Programa en la nube, programa instalado, plantilla de Word o Excel, tu asesoría?</li>
<li><strong>Pregunta a tu proveedor</strong> si su programa está adaptado al reglamento y si funciona en modalidad Verifactu. Pide su <em>declaración responsable</em>: según las fuentes consultadas, no existe una "certificación" de la AEAT, sino una declaración del fabricante.</li>
<li><strong>Si cambias de programa, hazlo con margen</strong>, no la última semana. Migrar clientes, series de facturas y productos lleva tiempo.</li>
<li><strong>Habla con tu asesoría</strong>: muchas trabajan con un programa concreto y les facilita el trabajo que uses el mismo.</li>
</ol>

<h2>Cómo elegir programa: criterios</h2>
<table class="table">
<thead><tr><th>Criterio</th><th>Qué preguntar</th></tr></thead>
<tbody>
<tr><td>Cumplimiento</td><td>¿Tiene declaración responsable? ¿Admite modalidad Verifactu?</td></tr>
<tr><td>Límites del plan</td><td>¿Cuántas facturas al año incluye el plan barato?</td></tr>
<tr><td>Presupuestos</td><td>¿Convierte presupuestos en facturas con un clic?</td></tr>
<tr><td>Asesoría</td><td>¿Tu asesoría puede acceder directamente?</td></tr>
<tr><td>Integraciones</td><td>¿Se conecta con tu banco, tu tienda online o con <a href="/herramientas/make/">Make</a>?</td></tr>
<tr><td>Salida</td><td>¿Puedes exportar tus datos si te vas?</td></tr>
</tbody></table>

<h2>¿Y qué pinta aquí la IA?</h2>
<p>Verifactu no va de IA, pero cambiar de programa es buen momento para automatizar. Por ejemplo: que cada presupuesto aceptado cree una tarea, o que los gastos que recibes por email se guarden solos en una carpeta. Lo explicamos en la guía de <a href="/guias/automatizar-formulario-hoja-aviso-make/">primera automatización con Make</a>.</p>
`,
  },
  {
    slug: 'automatizar-formulario-hoja-aviso-make',
    title: 'Tu primera automatización: del formulario web a una hoja de cálculo y un aviso',
    seoTitle: 'Primera automatización con Make paso a paso (sin programar)',
    description: 'Guía paso a paso para que cada solicitud que llega por tu web se guarde sola en una hoja de cálculo y te avise al móvil, usando el plan gratuito de Make.',
    kicker: 'Automatización',
    cover: { tone: 'rojo', text: 'Automatiza' },
    readingMin: 10,
    updated: '2026-10-10',
    tools: ['make', 'zapier', 'n8n'],
    related: ['verifactu-autonomos-2027', 'responder-clientes-whatsapp-email-ia'],
    body: `
<p class="lead">Si recibes solicitudes por un formulario y luego las copias a mano en una hoja o en tu agenda, esta es la automatización con mejor relación esfuerzo-beneficio. Se monta en una tarde y funciona sola a partir de ahí.</p>

<div class="box"><strong>Lo que vas a construir:</strong> formulario de Google (o el de tu web) → nueva fila en Google Sheets → email o notificación a tu móvil con el resumen.</div>

<h2>Antes de empezar</h2>
<ul>
<li>Una cuenta de Google (Forms y Sheets).</li>
<li>Una cuenta gratuita en <a href="/herramientas/make/">Make</a>. Según las fuentes consultadas, el plan gratuito incluye 1.000 créditos al mes; cada paso que se ejecuta consume créditos.</li>
<li>Unos 60–90 minutos la primera vez.</li>
</ul>

<h2>Paso a paso</h2>
<ol class="steps">
<li><strong>Crea el formulario.</strong> En Google Forms, con los campos mínimos: nombre, teléfono o email, qué necesita y consentimiento de privacidad. En <em>Respuestas</em>, vincúlalo a una hoja de cálculo nueva.</li>
<li><strong>Crea un escenario en Make.</strong> Pulsa <em>Create a new scenario</em> y añade el módulo <em>Google Sheets → Watch New Rows</em>. Conecta tu cuenta y elige la hoja de respuestas.</li>
<li><strong>Añade el aviso.</strong> Añade un módulo <em>Email → Send an email</em> (o <em>Telegram</em>, si lo usas). En el asunto pon "Nueva solicitud: " seguido del campo nombre; en el cuerpo, el resto de campos.</li>
<li><strong>Prueba.</strong> Pulsa <em>Run once</em>, rellena el formulario y comprueba que llega el aviso.</li>
<li><strong>Prográmalo.</strong> Activa el escenario y elige la frecuencia. En el plan gratuito el intervalo mínimo es mayor que en los de pago (15 minutos según las fuentes consultadas); para solicitudes de clientes suele ser suficiente.</li>
</ol>

<h2>Mejora opcional: que la IA clasifique la solicitud</h2>
<p>Make tiene módulos para conectar con modelos de IA (requieren una clave de API de pago del proveedor). Puedes añadir un paso que lea "qué necesita" y lo clasifique como <em>urgente / presupuesto / información</em>. Hazlo solo cuando el flujo básico funcione bien, y recuerda que enviar datos de clientes a un proveedor de IA requiere informarles en tu política de privacidad.</p>

<h2>Cuánto consume</h2>
<p>Cada solicitud ejecuta unos pocos módulos (detectar fila + enviar aviso), además de las comprobaciones programadas. Con un volumen de un pequeño negocio suele caber en el plan gratuito, pero vigila el contador de créditos el primer mes.</p>

<h2>Make, Zapier o n8n</h2>
<table class="table">
<thead><tr><th></th><th>Make</th><th>Zapier</th><th>n8n</th></tr></thead>
<tbody>
<tr><td>Facilidad</td><td>Media</td><td>Alta</td><td>Baja (técnico)</td></tr>
<tr><td>Coste al crecer</td><td>Moderado</td><td>Alto</td><td>Bajo si lo alojas tú</td></tr>
<tr><td>Interfaz</td><td>Parcialmente en español</td><td>Inglés</td><td>Inglés</td></tr>
</tbody></table>
<p>Compáralas con detalle en el <a href="/comparar/?h=make,zapier,n8n">comparador</a>.</p>
`,
  },
  {
    slug: 'contenido-redes-un-mes-una-tarde',
    title: 'Un mes de publicaciones para redes en una tarde',
    seoTitle: 'Cómo crear contenido para redes con IA: un mes en una tarde',
    description: 'Método para planificar y preparar 12 publicaciones para Instagram o Facebook de tu negocio en una tarde, con IA para las ideas y Canva para el diseño.',
    kicker: 'Marketing',
    cover: { tone: 'rosa', text: '12 posts' },
    readingMin: 7,
    updated: '2026-10-10',
    tools: ['chatgpt', 'claude', 'canva', 'manychat'],
    related: ['herramientas-ia-gratis-autonomos', 'responder-clientes-whatsapp-email-ia'],
    body: `
<p class="lead">Publicar con constancia importa más que publicar perfecto. Este método te deja preparado un mes de contenido (tres publicaciones por semana) en una sola sesión de trabajo.</p>

<h2>Paso 1. Define tres temas fijos</h2>
<p>Elige tres tipos de publicación que se repetirán: por ejemplo <em>trabajo realizado</em> (antes/después), <em>consejo útil</em> y <em>detrás del negocio</em>. Repetir formatos hace que crear sea más rápido y que tus seguidores sepan qué esperar.</p>

<h2>Paso 2. Pide las ideas a la IA</h2>
<pre class="prompt" data-copy>Soy [profesión] en [ciudad]. Mis clientes suelen ser [tipo de cliente]
y lo que más me preguntan es [dudas habituales].
Propón 12 publicaciones para Instagram para el próximo mes, repartidas entre:
- Trabajo realizado
- Consejo útil
- Detrás del negocio
Para cada una: título, texto de 60-100 palabras, idea de foto que puedo hacer
yo con el móvil y una llamada a la acción. Nada de emojis en exceso
ni promesas exageradas.</pre>

<h2>Paso 3. Haz tú las fotos</h2>
<p>Las fotos reales de tu trabajo funcionan mejor que las imágenes generadas, y además son tuyas. Dedica media hora a hacer las fotos que la IA te ha sugerido.</p>

<h2>Paso 4. Diseña con una plantilla fija en Canva</h2>
<p>En <a href="/herramientas/canva/">Canva</a> crea una plantilla con tus colores y tu logo para cada uno de los tres temas. Después solo tienes que cambiar la foto y el texto. Programa las publicaciones desde Meta Business Suite (gratuito) o desde el planificador de Canva si tu plan lo incluye.</p>

<h2>Paso 5. Prepara la respuesta a los mensajes</h2>
<p>Si una publicación funciona, llegarán mensajes. Ten listas tus <a href="/guias/responder-clientes-whatsapp-email-ia/">respuestas rápidas</a>. Si recibes muchos mensajes con la misma palabra ("precio", "cita"), <a href="/herramientas/manychat/">ManyChat</a> puede responder automáticamente.</p>

<div class="box box--warn"><strong>Fotos de clientes:</strong> pide permiso por escrito antes de publicar imágenes en las que aparezca un cliente o su casa.</div>
`,
  },
  {
    slug: 'ia-proteccion-datos-rgpd',
    title: 'Qué puedes pegar en ChatGPT y qué no: IA y protección de datos para pequeños negocios',
    seoTitle: 'IA y RGPD para autónomos: qué datos puedes usar en ChatGPT',
    description: 'Cómo usar asistentes de IA cumpliendo el RGPD: qué datos evitar, cómo anonimizar, qué revisar en cada herramienta y qué contar a tus clientes.',
    kicker: 'Privacidad',
    cover: { tone: 'tinta', text: 'RGPD' },
    readingMin: 8,
    updated: '2026-10-10',
    tools: ['chatgpt', 'claude', 'gemini', 'copilot'],
    related: ['responder-clientes-whatsapp-email-ia', 'automatizar-formulario-hoja-aviso-make'],
    body: `
<div class="box box--warn"><strong>Información general, no asesoramiento jurídico.</strong> Si tratas datos sensibles (salud, menores, datos financieros), consulta con un profesional. La <a href="https://www.aepd.es/" rel="noopener">AEPD</a> publica guías y herramientas gratuitas para pymes.</div>

<p class="lead">Usar IA en tu negocio es compatible con el Reglamento General de Protección de Datos (RGPD), pero exige algunas precauciones. La regla más útil cabe en una frase: <strong>si no lo enviarías por email a un desconocido, no lo pegues sin pensar en un asistente de IA</strong>.</p>

<h2>Semáforo de datos</h2>
<table class="table">
<thead><tr><th>Puedes usar</th><th>Con precaución</th><th>Evita</th></tr></thead>
<tbody><tr>
<td>Textos sin datos personales, tus tarifas, descripciones de servicios, borradores propios</td>
<td>Mensajes de clientes tras quitar nombre, teléfono, dirección y cualquier dato identificativo</td>
<td>Datos de salud, DNI, datos bancarios, datos de menores, documentos completos de clientes</td>
</tr></tbody></table>

<h2>Cómo anonimizar en 20 segundos</h2>
<p>Antes de pegar un texto, sustituye: nombres por <code>[CLIENTE]</code>, teléfonos y emails por <code>[CONTACTO]</code>, direcciones por <code>[DIRECCIÓN]</code>. La IA trabaja igual de bien y tú reduces el riesgo.</p>

<h2>Qué revisar en cada herramienta</h2>
<ol class="steps">
<li><strong>Uso de tus datos para entrenar.</strong> Muchas herramientas permiten desactivarlo en la configuración. Las versiones para empresas suelen no usar tus datos para entrenar por defecto: compruébalo en sus condiciones.</li>
<li><strong>Contrato de encargado del tratamiento.</strong> Si vas a tratar datos personales de clientes con una herramienta (por ejemplo, un chatbot o una automatización), necesitas un acuerdo de tratamiento de datos (art. 28 RGPD). Los proveedores serios lo ofrecen, a menudo como "DPA".</li>
<li><strong>Dónde se guardan los datos.</strong> Si salen del Espacio Económico Europeo, el proveedor debe ofrecer garantías adecuadas para la transferencia internacional.</li>
<li><strong>Historial.</strong> Borra las conversaciones que contengan información delicada y revisa cuánto tiempo se conservan.</li>
</ol>

<h2>Qué contar a tus clientes</h2>
<p>Si un chatbot o una automatización trata datos de tus clientes, tu política de privacidad debe mencionar a ese proveedor como encargado del tratamiento y la finalidad. Si un cliente habla con un bot, díselo claramente: es una exigencia de transparencia y genera confianza.</p>

<h2>Lista rápida antes de empezar con una herramienta</h2>
<div class="box"><ul class="checklist">
<li>He desactivado el entrenamiento con mis datos (si la opción existe).</li>
<li>Sé qué datos voy a meter y he descartado los sensibles.</li>
<li>Tengo el acuerdo de tratamiento si hay datos de clientes.</li>
<li>He actualizado mi política de privacidad.</li>
</ul></div>
`,
  },
  {
    slug: 'herramientas-ia-gratis-autonomos',
    title: 'Las herramientas de IA gratuitas que de verdad le sirven a un autónomo',
    seoTitle: 'Herramientas de IA gratis para autónomos: cuáles sirven',
    description: 'Selección de herramientas con plan gratuito útil para autónomos y pequeños negocios, qué puedes hacer con cada una sin pagar y cuándo compensa dar el salto al plan de pago.',
    kicker: 'Herramientas',
    cover: { tone: 'azul', text: '0 €' },
    readingMin: 6,
    updated: '2026-10-10',
    tools: ['chatgpt', 'claude', 'gemini', 'canva', 'make', 'whatsapp-business', 'brevo', 'notion'],
    related: ['contenido-redes-un-mes-una-tarde', 'automatizar-formulario-hoja-aviso-make'],
    body: `
<p class="lead">Antes de pagar ninguna suscripción, aprovecha lo gratuito. Con estas herramientas puedes cubrir la redacción, el diseño, la atención al cliente y una primera automatización sin gastar nada. Los límites de cada plan cambian: revísalos en la web oficial.</p>

<h2>El kit gratuito mínimo</h2>
<table class="table">
<thead><tr><th>Necesidad</th><th>Herramienta</th><th>Qué puedes hacer gratis</th></tr></thead>
<tbody>
<tr><td>Redactar y resumir</td><td><a href="/herramientas/chatgpt/">ChatGPT</a>, <a href="/herramientas/claude/">Claude</a> o <a href="/herramientas/gemini/">Gemini</a></td><td>Emails, presupuestos, textos para redes, resúmenes de documentos</td></tr>
<tr><td>Diseño</td><td><a href="/herramientas/canva/">Canva</a></td><td>Publicaciones, carteles y presentaciones con plantillas</td></tr>
<tr><td>Atención al cliente</td><td><a href="/herramientas/whatsapp-business/">WhatsApp Business</a></td><td>Respuestas rápidas, mensajes de bienvenida y ausencia, catálogo</td></tr>
<tr><td>Automatización</td><td><a href="/herramientas/make/">Make</a></td><td>Unos pocos flujos sencillos con el límite mensual de créditos</td></tr>
<tr><td>Email a clientes</td><td><a href="/herramientas/brevo/">Brevo</a></td><td>Boletines con un límite diario de envíos</td></tr>
<tr><td>Organización</td><td><a href="/herramientas/notion/">Notion</a></td><td>Notas, tareas y un CRM sencillo para uso individual</td></tr>
</tbody></table>

<h2>Cuándo compensa pagar</h2>
<p>Paga cuando el límite gratuito te frene <strong>de forma repetida</strong> en una tarea que te ahorra tiempo o te trae clientes. Una forma sencilla de decidirlo: si la herramienta te ahorra más horas al mes de las que cuesta, a tu precio por hora, compensa. Puedes calcularlo con la <a href="/calculadoras/compensa-pagar/">calculadora de "¿me compensa pagar?"</a>.</p>

<h2>Cuidado con lo "gratis"</h2>
<ul>
<li>Revisa qué hace la herramienta con tus datos (lo explicamos en la <a href="/guias/ia-proteccion-datos-rgpd/">guía de RGPD</a>).</li>
<li>Algunas licencias gratuitas no permiten el uso comercial de lo que generas: compruébalo en herramientas de voz o imagen.</li>
<li>No acumules diez herramientas a medio usar. Tres bien aprovechadas valen más.</li>
</ul>
`,
  },
];

export const guideBySlug = Object.fromEntries(guides.map((g) => [g.slug, g]));
