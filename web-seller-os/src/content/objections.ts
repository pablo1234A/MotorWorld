export interface Objection {
  id: string;
  category: string;
  phrase: string;
  meaning: string;
  dont: string[];
  ask: string[];
  response: string;
  conversation: { who: 'cliente' | 'tú'; text: string }[];
  close: string;
}

export const OBJECTIONS: Objection[] = [
  {
    id: 'precio',
    category: 'Precio',
    phrase: '"Es demasiado caro."',
    meaning:
      'Casi nunca significa "no tengo el dinero". Significa "todavía no veo que lo que gano valga más que lo que pago". Es un problema de valor percibido, no de precio.',
    dont: [
      'Bajar el precio al momento: confirma que estaba inflado.',
      'Justificarte con tus horas de trabajo: al cliente le dan igual.',
      'Decir "es que es lo normal" o compararte con agencias caras.',
    ],
    ask: [
      '¿Caro comparado con qué?',
      '¿Cuánto te deja de media un cliente nuevo?',
      'Si la web te trajera 2 clientes al mes, ¿seguiría pareciendo caro?',
    ],
    response:
      'Lo entiendo, y prefiero que lo hablemos claro. Más que el precio, lo que importa es si te sale rentable. Si un cliente nuevo te deja unos {ticket} y la web te trae solo dos al mes, se paga sola en pocas semanas. ¿Te parece si miramos los números juntos?',
    conversation: [
      { who: 'cliente', text: 'Uf, 1.200 € es mucho para una web.' },
      { who: 'tú', text: 'Te entiendo. Una pregunta: ¿cuánto te deja de media un cliente nuevo?' },
      { who: 'cliente', text: 'Pues unos 150 € la primera vez, y luego repiten.' },
      { who: 'tú', text: 'Entonces con 8 clientes nuevos está pagada, y a partir de ahí todo es beneficio durante años. ¿Crees que la web puede traerte 8 clientes en unos meses?' },
      { who: 'cliente', text: 'Visto así… sí, seguramente.' },
    ],
    close:
      'Si el problema es el pago de golpe, podemos dividirlo: 50% al empezar y 50% al publicarla. ¿Empezamos así?',
  },
  {
    id: 'tiempo',
    category: 'Tiempo',
    phrase: '"Ahora mismo no tengo tiempo."',
    meaning:
      'Teme que el proyecto le quite horas que no tiene. O es una forma educada de quitarse de encima a alguien que no ha generado suficiente interés.',
    dont: ['Insistir con "son solo 5 minutos" sin aportar nada.', 'Darle una charla larga justo cuando ha dicho que no tiene tiempo.'],
    ask: ['¿Cuándo te viene mejor, esta semana o la que viene?', 'Si yo me encargo de todo y tú solo validas, ¿te encaja?'],
    response:
      'Justo por eso trabajo así: tú me dedicas 20 minutos al principio y yo me encargo de todo lo demás. Tú solo das el visto bueno. ¿Te va mejor el martes o el jueves para esos 20 minutos?',
    conversation: [
      { who: 'cliente', text: 'Ahora no puedo, estoy hasta arriba.' },
      { who: 'tú', text: 'Normal, se nota que tenéis movimiento. Precisamente por eso: el proceso está pensado para que tú no pierdas tiempo. Una llamada de 20 minutos y yo hago el resto.' },
      { who: 'cliente', text: '¿Solo 20 minutos?' },
      { who: 'tú', text: 'Solo eso al principio. ¿Te va mejor el martes a primera hora o el jueves por la tarde?' },
    ],
    close: 'Ofrece dos huecos concretos. Nunca preguntes "¿cuándo te viene bien?" en abierto.',
  },
  {
    id: 'desinteres',
    category: 'Desinterés',
    phrase: '"No me interesa."',
    meaning:
      'Reacción automática ante un desconocido que vende algo. No ha rechazado tu propuesta: todavía no la conoce. Rechaza la interrupción.',
    dont: ['Responder con más argumentos de golpe.', 'Ponerte a la defensiva o hacerle sentir mal.', 'Insistir tres veces seguidas.'],
    ask: ['¿Puedo preguntarte una cosa antes de irme?', '¿Es porque ya estáis contentos con cómo os llegan clientes, o por otro motivo?'],
    response:
      'Sin problema, no te quiero hacer perder tiempo. Solo una pregunta antes de irme: ¿estáis contentos con los clientes que os llegan por internet ahora mismo?',
    conversation: [
      { who: 'cliente', text: 'No me interesa, gracias.' },
      { who: 'tú', text: 'Sin problema. Solo una cosa antes de irme: ¿os llegan clientes nuevos por Google ahora mismo?' },
      { who: 'cliente', text: 'Pues la verdad es que pocos, casi todo es boca a boca.' },
      { who: 'tú', text: 'Es lo más habitual. Te mando en 2 minutos lo que he visto de vuestra web y lo miras cuando puedas, ¿vale?' },
    ],
    close: 'Convierte el "no" en un micro-sí: permiso para enviar algo concreto y breve.',
  },
  {
    id: 'ya_tengo_web',
    category: 'Ya tengo web',
    phrase: '"Ya tengo página web."',
    meaning: 'Piensa que tener web = problema resuelto. No distingue entre tener una web y tener una web que trae clientes.',
    dont: ['Criticar su web directamente ("es horrible").', 'Decir "pero la tuya está mal hecha".'],
    ask: ['¿Cuántos clientes os llegan al mes a través de la web?', '¿La habéis mirado últimamente desde el móvil?'],
    response:
      'Lo sé, la he visto. Por eso te escribo: tener web y que la web te traiga clientes son dos cosas distintas. He visto un par de detalles concretos que hacen que gente interesada se vaya sin contactar. ¿Te los enseño en 5 minutos?',
    conversation: [
      { who: 'cliente', text: 'Ya tenemos web, nos la hizo un chico hace años.' },
      { who: 'tú', text: 'Sí, la he visto. ¿Os llegan contactos a través de ella?' },
      { who: 'cliente', text: 'Alguno… pocos.' },
      { who: 'tú', text: 'He visto que en móvil el botón de reservar casi no aparece, y la mayoría de visitas vienen del móvil. Eso solo ya explica bastante. ¿Te lo enseño?' },
    ],
    close: 'Usa la auditoría: "Te preparo un informe gratis de 5 puntos y lo vemos juntos el jueves".',
  },
  {
    id: 'lo_hago_yo',
    category: 'Lo hago yo',
    phrase: '"Me la hago yo con Wix / una plantilla."',
    meaning: 'Quiere ahorrar dinero y subestima el tiempo y el conocimiento necesarios para que una web venda.',
    dont: ['Despreciar Wix o las plantillas.', 'Decirle que no va a saber.'],
    ask: ['¿Cuántas horas crees que te llevaría?', '¿Cuánto vale una hora de tu trabajo en tu negocio?'],
    response:
      'Claro que puedes, las herramientas están muy bien. La diferencia no está en la herramienta, sino en saber qué poner, en qué orden y cómo hacer que la gente contacte. Tú eres experto en lo tuyo; yo en que una web convierta. Y tus horas valen más atendiendo clientes.',
    conversation: [
      { who: 'cliente', text: 'Creo que me la haré yo con Wix.' },
      { who: 'tú', text: '¡Buena opción si tienes tiempo! ¿Cuántas horas calculas?' },
      { who: 'cliente', text: 'No sé, unos fines de semana.' },
      { who: 'tú', text: 'Unas 30-40 horas para que quede bien. Si tu hora vale 40 €, ya son 1.200-1.600 €, sin contar que no sabrás si convierte. Yo te la entrego en 2 semanas y medida.' },
    ],
    close: '"Si quieres, empezamos por la estructura y los textos, que es lo que más impacto tiene."',
  },
  {
    id: 'conocido',
    category: 'Tengo un conocido',
    phrase: '"Tengo un conocido / sobrino que me la hace."',
    meaning: 'Lealtad o ahorro. A menudo ese conocido lleva meses "a punto de hacerla".',
    dont: ['Criticar al conocido.', 'Competir por precio con alguien que lo hace gratis.'],
    ask: ['¿Cuándo tenía pensado tenerla lista?', '¿Qué es lo más importante para ti que consiga la web?'],
    response:
      'Genial que tengas a alguien de confianza. Solo una cosa: lo que yo hago no es solo diseñarla, es pensar cómo convertir visitas en clientes. Si quieres, te dejo un informe con los 5 puntos clave para que se los pases. Si más adelante no avanza, aquí estoy.',
    conversation: [
      { who: 'cliente', text: 'Me la va a hacer mi sobrino, que sabe de esto.' },
      { who: 'tú', text: 'Perfecto. ¿Para cuándo la tendréis?' },
      { who: 'cliente', text: 'Bueno… lleva diciendo que la hace desde el verano.' },
      { who: 'tú', text: 'Te dejo mi auditoría gratis para que le sirva de guía. Y si en un mes no está, me llamas y la tenemos en dos semanas.' },
    ],
    close: 'Programa un seguimiento a 30 días: muchas veces el conocido nunca entrega.',
  },
  {
    id: 'no_gastar',
    category: 'No quiero gastar',
    phrase: '"No quiero gastar dinero ahora."',
    meaning: 'Ve la web como gasto, no como inversión. Puede haber miedo real por la situación del negocio.',
    dont: ['Presionar con urgencia falsa.', 'Ignorar su preocupación.'],
    ask: ['¿Qué tendría que pasar para que lo vieras como una inversión?', '¿Cuál es tu temporada fuerte?'],
    response:
      'Lo entiendo, y no quiero que esto sea un gasto. La idea es que se pague sola. Podemos empezar con lo mínimo que genera clientes: una página con lo esencial y el botón de contacto bien puesto. Y crecer cuando dé resultados.',
    conversation: [
      { who: 'cliente', text: 'Ahora no quiero gastar, el mes está flojo.' },
      { who: 'tú', text: 'Te entiendo. Precisamente en los meses flojos es cuando más se nota no tener por dónde entrar clientes nuevos. ¿Y si empezamos con una versión básica que se pague sola?' },
    ],
    close: 'Ofrece una versión de entrada o pago fraccionado. Siempre con fecha de inicio concreta.',
  },
  {
    id: 'consultarlo',
    category: 'Tengo que consultarlo',
    phrase: '"Tengo que consultarlo con mi socio / pareja."',
    meaning: 'Puede ser real (decisión compartida) o una forma de ganar tiempo sin decir que no.',
    dont: ['Decir "vale, ya me dices" y desaparecer.', 'Presionar para que decida sin el socio.'],
    ask: ['¿Qué crees que va a preguntarte?', '¿Te parece si lo vemos los tres juntos 15 minutos?', 'Tú personalmente, ¿lo ves?'],
    response:
      'Me parece lógico. Para que no tengas que explicarlo tú todo, ¿por qué no hacemos una llamada corta los tres? Así resuelvo sus dudas directamente. ¿Os viene bien el jueves?',
    conversation: [
      { who: 'cliente', text: 'Tengo que hablarlo con mi socia.' },
      { who: 'tú', text: 'Claro. Tú, personalmente, ¿lo ves claro?' },
      { who: 'cliente', text: 'Yo sí, pero ella es la que lleva las cuentas.' },
      { who: 'tú', text: 'Entonces hagamos 15 minutos los tres y le enseño los números. ¿Jueves a las 17h?' },
    ],
    close: 'Consigue una reunión con el decisor real, con fecha y hora.',
  },
  {
    id: 'no_hace_falta',
    category: 'No me hace falta',
    phrase: '"No me hace falta, ya tengo clientes."',
    meaning: 'Le va bien y no siente dolor. Hay que mostrar el coste de oportunidad o el riesgo de depender de una sola fuente.',
    dont: ['Discutir que sí le hace falta.', 'Asustar con catastrofismo.'],
    ask: ['¿De dónde vienen la mayoría?', '¿Qué pasaría si mañana bajara el boca a boca?', '¿Te gustaría elegir mejor a tus clientes?'],
    response:
      'Me alegra mucho, eso significa que hacéis bien vuestro trabajo. La pregunta es otra: ¿podríais cobrar más o elegir mejor a quién atender? Una buena web no solo trae más clientes, trae mejores clientes y te permite subir precios.',
    conversation: [
      { who: 'cliente', text: 'No necesito, tengo trabajo de sobra.' },
      { who: 'tú', text: '¡Genial! ¿Y estás cobrando lo que te gustaría?' },
      { who: 'cliente', text: 'Hombre, siempre se podría más.' },
      { who: 'tú', text: 'Con demanda de sobra, una web que transmita nivel te permite subir precios sin perder clientes. ¿Lo hablamos?' },
    ],
    close: 'Cambia el ángulo de "más clientes" a "mejores clientes y mejores precios".',
  },
  {
    id: 'pensarlo',
    category: 'Quiero pensarlo',
    phrase: '"Déjame pensarlo."',
    meaning: 'Queda alguna duda sin resolver que no te ha dicho. Tu trabajo es descubrir cuál.',
    dont: ['Responder "vale, piénsalo" y colgar.', 'Presionar con "la oferta acaba hoy" si no es verdad.'],
    ask: ['¿Qué parte te genera más dudas: el precio, los plazos o el resultado?', 'Del 1 al 10, ¿cómo de seguro estás?, ¿qué haría falta para que fuera un 10?'],
    response:
      'Claro, es lógico. Para ayudarte a pensarlo: ¿qué es lo que más dudas te genera ahora mismo, el precio, los plazos o si va a funcionar?',
    conversation: [
      { who: 'cliente', text: 'Déjame que lo piense.' },
      { who: 'tú', text: 'Por supuesto. Del 1 al 10, ¿cómo lo ves ahora mismo?' },
      { who: 'cliente', text: 'Un 7.' },
      { who: 'tú', text: '¿Qué tendría que pasar para que fuera un 10?' },
      { who: 'cliente', text: 'Saber que voy a ver resultados.' },
      { who: 'tú', text: 'Entonces te propongo esto: medimos los contactos durante 3 meses y si no mejoran, el mantenimiento te sale gratis.' },
    ],
    close: 'Fija el seguimiento antes de colgar: "¿Te llamo el viernes a las 12 y me dices?"',
  },
];

export const ROLEPLAY_OBJECTIONS = [
  { id: 'precio', text: 'Es demasiado caro.' },
  { id: 'ya_tengo_web', text: 'Ya tengo página.' },
  { id: 'desinteres', text: 'No me interesa.' },
  { id: 'tiempo', text: 'Ahora mismo no.' },
  { id: 'pensarlo', text: 'Tengo que pensarlo.' },
  { id: 'aporta', text: '¿Qué me aporta?' },
  { id: 'oferta', text: 'Hazme una oferta.' },
];
