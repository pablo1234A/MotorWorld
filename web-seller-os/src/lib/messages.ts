import { PROBLEM_BY_ID, fillTemplate, sectorOutcome } from '../content/problems';

export type MsgChannel = 'whatsapp' | 'instagram' | 'email' | 'llamada' | 'seguimiento' | 'reunion';
export const MSG_CHANNEL_LABEL: Record<MsgChannel, string> = {
  whatsapp: 'WhatsApp',
  instagram: 'Instagram DM',
  email: 'Email',
  llamada: 'Llamada',
  seguimiento: 'Seguimiento',
  reunion: 'Reunión',
};

export type MsgGoal = 'abrir' | 'reunion' | 'auditoria' | 'reactivar' | 'propuesta';
export const MSG_GOAL_LABEL: Record<MsgGoal, string> = {
  abrir: 'Abrir conversación',
  reunion: 'Conseguir reunión',
  auditoria: 'Ofrecer auditoría gratis',
  reactivar: 'Reactivar lead frío',
  propuesta: 'Cerrar propuesta',
};

export interface MsgInput {
  channel: MsgChannel;
  goal: MsgGoal;
  business: string;
  sector: string;
  city: string;
  problem: string; // id del catálogo o texto libre
  owner: string;
  me: string;
}

export interface GeneratedMessage {
  subject?: string;
  body: string;
  note?: string;
}

function hookFor(input: MsgInput) {
  const p = PROBLEM_BY_ID[input.problem];
  const vars = { negocio: input.business, sector: input.sector.toLowerCase() || 'vuestro sector', ciudad: input.city || 'la zona' };
  if (p) return fillTemplate(p.hook, vars);
  if (input.problem.trim()) return input.problem.trim().replace(/\.$/, '').replace(/^./, (c) => c.toLowerCase());
  return 'he estado mirando cómo os encuentran los clientes por internet y hay un par de cosas fáciles de mejorar';
}

const hi = (owner: string, casual = true) => (owner.trim() ? `${casual ? 'Hola' : 'Hola'} ${owner.trim().split(' ')[0]}` : 'Hola');

/** Genera 3 variantes naturales y breves para el canal y objetivo elegidos. */
export function generateMessages(input: MsgInput): GeneratedMessage[] {
  const b = input.business.trim() || 'vuestro negocio';
  const out = sectorOutcome(input.sector);
  const hook = hookFor(input);
  const me = input.me.trim() || 'yo';
  const h = hi(input.owner);
  const city = input.city.trim();

  switch (input.channel) {
    case 'whatsapp':
    case 'instagram': {
      const emoji = input.channel === 'instagram' ? ' 🙌' : '';
      if (input.goal === 'reactivar')
        return [
          { body: `${h}, ¿qué tal va todo por ${b}? Hace unas semanas hablamos de la web. No te escribo para insistir: he visto que ${hook}. Si en algún momento os encaja, aquí estoy.` },
          { body: `${h}! Me acordé de vosotros porque acabo de terminar algo parecido para otro negocio de ${input.sector.toLowerCase() || 'vuestro sector'}. ¿Seguís con la idea de mejorar la web o lo dejamos para más adelante?` },
          { body: `${h}, una pregunta rápida: ¿lo de la web sigue en pausa o ya no es prioridad? Me sirve cualquier respuesta, ¡gracias!` },
        ];
      if (input.goal === 'propuesta')
        return [
          { body: `${h}, ¿pudiste echarle un ojo a la propuesta? Si te surge cualquier duda la vemos en 10 minutos por llamada, sin compromiso.` },
          { body: `${h}! Te escribo por la propuesta de ${b}. Si te encaja, esta semana tengo hueco para empezar y la tendríais lista en unas 2-3 semanas. ¿Lo vemos?` },
          { body: `${h}, para ponértelo fácil: ¿qué parte te genera más dudas, el precio, los plazos o el resultado? Así lo ajusto a lo que necesitáis.` },
        ];
      if (input.goal === 'auditoria')
        return [
          { body: `${h}${emoji} He estado mirando la web de ${b} y ${hook}. Te he preparado un mini análisis con 5 puntos concretos para conseguir más ${out.unit}. ¿Te lo paso por aquí?` },
          { body: `${h}! Me dedico a mejorar webs de negocios${city ? ` de ${city}` : ''}. Con la vuestra me he fijado en que ${hook}. Tengo un pequeño informe gratuito, ¿te interesa verlo?` },
          { body: `${h}, una cosa rápida: ${hook}. Es fácil de arreglar y suele notarse en ${out.unit}. Si quieres te mando lo que he visto, sin compromiso.` },
        ];
      if (input.goal === 'reunion')
        return [
          { body: `${h}, soy ${me}. He visto que ${hook}. Tengo un par de ideas para que ${b} consiga ${out.hook}. ¿Te va bien una llamada de 15 minutos el martes o el jueves?` },
          { body: `${h}${emoji} Te escribo porque ${hook}, y creo que se puede convertir en ${out.unit} con pocos cambios. ¿Te parece si lo vemos 15 min esta semana?` },
          { body: `${h}! Me encanta lo que hacéis en ${b}. Tengo una propuesta concreta para ${out.hook}. ¿Cuándo te viene mejor una llamada corta, mañana o el viernes?` },
        ];
      return [
        { body: `${h}${emoji} He visto ${b}${city ? ` aquí en ${city}` : ''} y me ha gustado mucho. Una pregunta: ${hook}, ¿lo gestionáis así a propósito?` },
        { body: `${h}! Soy ${me}, ayudo a negocios como el vuestro a conseguir ${out.unit} por internet. Me he fijado en que ${hook}. ¿Os llegan muchos clientes por la web ahora mismo?` },
        { body: `${h}, perdona la intrusión. Estaba buscando ${input.sector.toLowerCase() || 'negocios'}${city ? ` en ${city}` : ''} y he dado con vosotros. ${hook.charAt(0).toUpperCase() + hook.slice(1)}. ¿Es algo que os preocupa o de momento os funciona bien así?` },
      ];
    }
    case 'email': {
      const sign = `\n\nUn saludo,\n${me}`;
      if (input.goal === 'propuesta')
        return [
          { subject: `Propuesta web para ${b}`, body: `${h},\n\nTe escribo para saber si pudiste revisar la propuesta. Si te encaja, podríamos empezar la semana que viene y tenerla publicada en 2-3 semanas.\n\nSi tienes cualquier duda, la resolvemos en una llamada de 10 minutos. ¿Te va bien el jueves?${sign}` },
          { subject: `¿Alguna duda con la propuesta?`, body: `${h},\n\nPara ponértelo fácil: ¿hay algo de la propuesta que quieras ajustar (alcance, plazos o forma de pago)? Prefiero adaptarla a que se quede en el cajón.${sign}` },
          { subject: `${b}: siguiente paso`, body: `${h},\n\nResumo lo que hablamos: el objetivo es ${out.hook}, empezando por resolver que ${hook}.\n\nSi te parece bien, te envío el calendario de trabajo y empezamos. ¿Lo confirmamos?${sign}` },
        ];
      if (input.goal === 'reactivar')
        return [
          { subject: `¿Sigue en pie lo de la web?`, body: `${h},\n\nHace un tiempo hablamos sobre la web de ${b}. No quiero insistir, solo saber si sigue siendo algo que os interese o si lo cierro por mi parte.\n\nCualquier respuesta me sirve.${sign}` },
          { subject: `Una idea para ${b}`, body: `${h},\n\nMe acordé de vosotros: ${hook}. He visto que sigue igual y es de las cosas que más ${out.unit} hacen perder.\n\nSi en algún momento queréis retomarlo, aquí estoy.${sign}` },
          { subject: `Último mensaje`, body: `${h},\n\nEste es mi último email para no ser pesado. Si más adelante queréis mejorar la web de ${b}, solo tenéis que responder a este correo.\n\nMucha suerte con todo.${sign}` },
        ];
      return [
        {
          subject: `${b}: una idea para conseguir más ${out.unit}`,
          body: `${h},\n\nSoy ${me}. He estado mirando la web de ${b} y ${hook}.\n\nEs un detalle que hace que parte de la gente que os busca no llegue a ${out.verb}. Tengo un par de ideas concretas para solucionarlo.\n\n¿Te parece si lo vemos en 15 minutos esta semana?${sign}`,
        },
        {
          subject: `Pequeño análisis de la web de ${b}`,
          body: `${h},\n\nTe he preparado un mini análisis gratuito de vuestra web con 5 puntos de mejora. El más importante: ${hook}.\n\n¿Te lo envío? No tiene ningún compromiso.${sign}`,
        },
        {
          subject: `Pregunta rápida`,
          body: `${h},\n\nUna pregunta rápida: ¿cuántos clientes os llegan al mes a través de la web?\n\nLo pregunto porque ${hook}, y en negocios de ${input.sector.toLowerCase() || 'vuestro sector'} suele marcar bastante diferencia.${sign}`,
        },
      ];
    }
    case 'llamada':
      return [
        {
          body: `APERTURA (10 s)\n"${h}, soy ${me}. Te llamo porque he estado mirando ${b} por internet y he visto algo concreto. ¿Tienes 2 minutos?"\n\nGANCHO\n"${hook.charAt(0).toUpperCase() + hook.slice(1)}. ¿Os llegan muchos clientes por la web ahora mismo?"\n\nPREGUNTAS\n• ¿Cómo os encuentran hoy los clientes nuevos?\n• ¿Qué pasa cuando alguien os busca en Google desde el móvil?\n• Si consiguierais más ${out.unit}, ¿podríais atenderlas?\n\nCIERRE\n"Te propongo una cosa: te enseño en 15 minutos lo que he visto y cómo lo solucionaría. ¿Te va mejor el martes o el jueves?"`,
          note: 'Guion de llamada en frío. Sonríe al hablar: se nota.',
        },
        {
          body: `"${h}, soy ${me}. Seré breve: trabajo con negocios${city ? ` de ${city}` : ''} para que consigan ${out.hook}.\n\nHe visto que ${hook}. No sé si es algo que os preocupa…" (silencio, deja que responda)\n\nSi dice que sí → "¿Qué habéis probado hasta ahora?"\nSi dice que no → "Perfecto. Solo una pregunta: ¿cuántos clientes nuevos os llegan al mes por internet?"\n\nCierre: "¿Te parece si lo vemos con calma 15 minutos esta semana?"`,
          note: 'Versión con pausa estratégica.',
        },
        {
          body: `SI CONTESTA OTRA PERSONA\n"Hola, ¿me pasas con ${input.owner || 'el responsable'}? Es sobre la web de ${b}, una cosa rápida."\n\nSI NO ESTÁ\n"¿A qué hora suele estar? Le llamo entonces." (anota la hora y crea la llamada en el calendario)\n\nBUZÓN DE VOZ (máx. 20 s)\n"${h}, soy ${me}. He visto que ${hook} y tengo una idea para solucionarlo. Te escribo por WhatsApp para que lo veas cuando puedas."`,
          note: 'Recepción, ausencia y buzón de voz.',
        },
      ];
    case 'seguimiento':
      return [
        { body: `${h}, ¿pudiste ver mi mensaje del otro día sobre la web de ${b}? Te dejo una idea rápida: ${hook}, y arreglarlo suele traducirse en más ${out.unit}. ¿Lo hablamos?` },
        { body: `${h}! Sé que andarás liado/a. Solo quería saber si te interesa que te enseñe lo que vi en la web o si lo dejamos para más adelante. Cualquier respuesta me vale 🙂` },
        { body: `${h}, te paso un ejemplo de cómo quedaría la portada de ${b} con el botón de ${out.verb} bien visible. ¿Te lo enseño en 5 minutos mañana?` },
      ];
    case 'reunion':
      return [
        { body: `${h}, te confirmo nuestra llamada de mañana para hablar de la web de ${b}. Serán unos 15-20 minutos. Si te surge algo, dímelo y lo movemos sin problema.` },
        {
          body: `AGENDA DE LA REUNIÓN (20 min)\n1. Cómo os llegan hoy los clientes (5 min, que hable el cliente)\n2. Lo que he visto: ${hook} (5 min)\n3. Qué cambiaría y qué resultado esperar: ${out.hook} (5 min)\n4. Opciones, precio y siguiente paso (5 min)\n\nObjetivo: salir con fecha para la propuesta o el inicio.`,
          note: 'Estructura para preparar la reunión.',
        },
        { body: `${h}, gracias por tu tiempo hoy. Resumo: el objetivo es ${out.hook}, empezando por resolver que ${hook}. Te envío la propuesta mañana y la repasamos el jueves. ¿Te va bien a la misma hora?` },
      ];
  }
}
