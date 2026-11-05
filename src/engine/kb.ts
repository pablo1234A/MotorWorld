/**
 * Industry knowledge base for the local (deterministic) engine.
 * Copy uses tokens: {name} business name, {city} location, {offer} first offering,
 * {audience} target audience. Every list has several options so the seeded generator
 * can produce different sites for similar briefs.
 *
 * Content marked `sample: true` (testimonials, figures) is illustrative and the QA
 * system asks the user to replace it with real data before publishing.
 */
import type { ProjectKind, SectionType } from "./schema";

export interface ItemSeed {
  title: string;
  text: string;
  icon?: string;
  meta?: string;
  price?: string;
  badge?: string;
  features?: string[];
}

export interface PagePlan {
  name: string;
  path: string;
  sections: SectionType[];
}

export interface KindProfile {
  label: string;
  names: string[];
  home: SectionType[];
  pages: PagePlan[];
  hero: { eyebrow: string[]; heading: string[]; sub: string[]; ctas: Array<[string, string]> };
  features: { heading: string[]; sub: string[]; items: ItemSeed[] };
  showcase: Array<{ eyebrow: string; heading: string; body: string }>;
  steps?: { heading: string; items: ItemSeed[] };
  stats?: ItemSeed[];
  testimonials: ItemSeed[];
  faq: ItemSeed[];
  cta: { heading: string[]; sub: string[]; label: string };
  pricing?: ItemSeed[];
  products?: ItemSeed[];
  menu?: ItemSeed[];
  team?: ItemSeed[];
  timeline?: ItemSeed[];
  logos?: string[];
  marquee?: string[];
  imagery: string[];
  contact: { heading: string; sub: string; fields: "contact" | "booking" | "testdrive" | "quote" | "enroll" };
}

const FAQ_GENERIC: ItemSeed[] = [
  { title: "¿Cuánto tardáis en responder?", text: "Respondemos todas las consultas en menos de 24 horas laborables. Si es urgente, llámanos y te atendemos en el momento." },
  { title: "¿Trabajáis fuera de {city}?", text: "Sí. Nuestra base está en {city}, pero trabajamos con clientes de todo el país y, cuando el proyecto lo requiere, nos desplazamos." },
  { title: "¿Cómo son los pagos?", text: "Emitimos factura con todos los conceptos detallados. Aceptamos tarjeta y transferencia, y para proyectos largos lo dividimos en hitos." },
];

export const KB: Record<ProjectKind, KindProfile> = {
  landing: {
    label: "Landing page",
    names: ["Lumen", "Norte", "Vela", "Origo", "Brisa"],
    home: ["navbar", "hero", "logos", "features", "showcase", "steps", "testimonials", "faq", "cta", "footer"],
    pages: [{ name: "Contacto", path: "/contacto", sections: ["navbar", "contact", "faq", "footer"] }],
    hero: {
      eyebrow: ["Nuevo", "Disponible ya", "Hecho para {audience}"],
      heading: ["{offer}, sin complicaciones.", "Todo lo que necesitas de {offer}, en un solo lugar.", "La forma más directa de conseguir {offer}."],
      sub: [
        "{name} reúne lo esencial y elimina el resto. Empieza hoy y nota la diferencia desde la primera semana.",
        "Diseñado con {audience} en mente: claro, rápido y pensado para que obtengas resultados sin curva de aprendizaje.",
      ],
      ctas: [["Empezar ahora", "#contacto"], ["Ver cómo funciona", "#como-funciona"]],
    },
    features: {
      heading: ["Por qué {name}", "Pensado al detalle"],
      sub: ["Tres razones concretas por las que nuestros clientes no vuelven atrás."],
      items: [
        { title: "Listo en minutos", text: "Configuración guiada y valores por defecto sensatos. Sin manuales de cuarenta páginas.", icon: "bolt" },
        { title: "Resultados medibles", text: "Sabes en todo momento qué funciona y qué no, con datos claros y sin ruido.", icon: "chart" },
        { title: "Soporte de personas", text: "Te atiende alguien que conoce el producto y tu caso, no un guion.", icon: "chat" },
        { title: "Seguro por diseño", text: "Tus datos cifrados y bajo tu control. Puedes exportarlos cuando quieras.", icon: "shield" },
      ],
    },
    showcase: [
      { eyebrow: "Cómo te ayuda", heading: "Menos tareas repetitivas, más tiempo para lo importante", body: "{name} automatiza lo que haces una y otra vez y te avisa solo cuando necesitas intervenir. El resultado: jornadas más cortas y decisiones mejor informadas." },
      { eyebrow: "Hecho para crecer", heading: "Funciona igual con diez clientes que con diez mil", body: "Empieza pequeño y escala sin migraciones ni sorpresas. La misma herramienta te acompaña en cada etapa." },
    ],
    steps: {
      heading: "Cómo funciona",
      items: [
        { title: "Cuéntanos qué necesitas", text: "Un formulario breve, sin compromiso. Te respondemos en menos de 24 horas." },
        { title: "Lo ponemos en marcha", text: "Configuramos todo contigo y te dejamos funcionando el mismo día." },
        { title: "Mides y mejoras", text: "Revisamos los resultados juntos y ajustamos lo necesario." },
      ],
    },
    testimonials: [
      { title: "Laura Martín", meta: "Directora de operaciones", text: "Lo implantamos en una tarde y en la primera semana recuperamos horas que antes se iban en hojas de cálculo." },
      { title: "Daniel Ortega", meta: "Fundador", text: "Lo que más valoro es la claridad: sé exactamente qué está pasando sin tener que preguntar a nadie." },
      { title: "Marta Gil", meta: "Responsable de marketing", text: "El soporte marca la diferencia. Respuestas rápidas y de alguien que entiende el problema." },
    ],
    faq: FAQ_GENERIC,
    cta: { heading: ["¿Empezamos?", "Tu próximo paso empieza aquí"], sub: ["Escríbenos y te proponemos un plan concreto en menos de 24 horas."], label: "Hablar con nosotros" },
    logos: ["Acme", "Northwind", "Globex", "Initech", "Umbrella", "Hooli"],
    imagery: ["modern workspace natural light", "team collaboration studio", "product detail minimal"],
    contact: { heading: "Hablemos", sub: "Cuéntanos qué necesitas y te respondemos en menos de 24 horas.", fields: "contact" },
  },

  store: {
    label: "Tienda online",
    names: ["Atelier Nube", "Casa Olmo", "Mercado Sal", "Hilo & Barro"],
    home: ["navbar", "hero", "products", "showcase", "features", "testimonials", "newsletter", "footer"],
    pages: [
      { name: "Tienda", path: "/tienda", sections: ["navbar", "products", "features", "footer"] },
      { name: "Nosotros", path: "/nosotros", sections: ["navbar", "showcase", "timeline", "footer"] },
      { name: "Contacto", path: "/contacto", sections: ["navbar", "contact", "faq", "footer"] },
    ],
    hero: {
      eyebrow: ["Nueva colección", "Hecho a mano", "Envío gratis desde 50 €"],
      heading: ["{offer} que se notan en el día a día.", "Objetos con oficio para casas con carácter.", "{offer}, elegidos uno a uno."],
      sub: ["Seleccionamos cada pieza por su calidad y su origen. Envío en 24–48 h y devoluciones gratuitas durante 30 días."],
      ctas: [["Ver la tienda", "/tienda"], ["Nuestra historia", "/nosotros"]],
    },
    features: {
      heading: ["Comprar aquí es sencillo"],
      sub: ["Sin letra pequeña."],
      items: [
        { title: "Envío en 24–48 h", text: "Preparamos tu pedido el mismo día si lo haces antes de las 14:00.", icon: "truck" },
        { title: "Devolución gratuita", text: "Tienes 30 días para cambiar de opinión. Te enviamos la etiqueta.", icon: "refresh" },
        { title: "Pago seguro", text: "Pagos procesados por Stripe. Nunca almacenamos los datos de tu tarjeta.", icon: "lock" },
      ],
    },
    showcase: [
      { eyebrow: "Origen", heading: "Trabajamos con pequeños talleres que conocemos por su nombre", body: "Cada producto de {name} tiene detrás a una persona y un proceso. Visitamos los talleres, probamos las piezas y solo vendemos lo que usaríamos en casa." },
      { eyebrow: "Cuidado", heading: "Piezas pensadas para durar años, no temporadas", body: "Materiales nobles, acabados honestos y reparaciones posibles. Si algo falla, te ayudamos a arreglarlo." },
    ],
    products: [
      { title: "Taza de gres esmaltada", text: "Torneada a mano. 350 ml. Apta para lavavajillas.", price: "24", badge: "Nuevo" },
      { title: "Manta de lana merino", text: "Tejida en telar. 130 × 180 cm.", price: "89" },
      { title: "Set de cuencos (4)", text: "Gres con esmalte mate en tonos tierra.", price: "56" },
      { title: "Jarrón de barro cocido", text: "Pieza única con pequeñas variaciones de color.", price: "42" },
      { title: "Tabla de olivo", text: "Madera de olivo con acabado de aceite natural.", price: "38" },
      { title: "Vela de cera de soja", text: "60 horas de combustión. Aroma a higuera.", price: "19", badge: "Más vendido" },
    ],
    testimonials: [
      { title: "Clara R.", meta: "Compra verificada", text: "Llegó en dos días y mejor empaquetado que nada que haya pedido nunca. Las tazas son preciosas." },
      { title: "Javier P.", meta: "Compra verificada", text: "Se nota el oficio. La manta es de las que se heredan." },
      { title: "Inés T.", meta: "Compra verificada", text: "Tuve que cambiar una talla y fue facilísimo. Repetiré." },
    ],
    faq: [
      { title: "¿Cuánto cuesta el envío?", text: "4,90 € a península. Gratis en pedidos superiores a 50 €." },
      { title: "¿Puedo devolver un producto?", text: "Sí, dispones de 30 días desde la recepción. La devolución es gratuita." },
      { title: "¿Hacéis envíos internacionales?", text: "Enviamos a toda la Unión Europea. El coste se calcula al finalizar la compra." },
    ],
    cta: { heading: ["10 % en tu primer pedido"], sub: ["Suscríbete y recibe novedades antes que nadie. Un correo al mes, sin spam."], label: "Suscribirme" },
    timeline: [
      { title: "El primer taller", meta: "2019", text: "Empezamos vendiendo cerámica de un único taller en ferias de {city}." },
      { title: "La tienda online", meta: "2021", text: "Abrimos la tienda online y sumamos cinco talleres más." },
      { title: "Hoy", meta: "2026", text: "Más de veinte artesanos y miles de pedidos enviados con cuidado." },
    ],
    imagery: ["handmade ceramics studio", "artisan product still life", "cozy home interior details"],
    contact: { heading: "¿Dudas con tu pedido?", sub: "Escríbenos y te respondemos en el día.", fields: "contact" },
  },

  saas: {
    label: "SaaS",
    names: ["Flowbase", "Orbit", "Ledgerly", "Pulsar", "Nimbo"],
    home: ["navbar", "hero", "logos", "features", "showcase", "stats", "pricing", "testimonials", "faq", "cta", "footer"],
    pages: [
      { name: "Precios", path: "/precios", sections: ["navbar", "pricing", "faq", "cta", "footer"] },
      { name: "Contacto", path: "/contacto", sections: ["navbar", "contact", "footer"] },
    ],
    hero: {
      eyebrow: ["Nuevo: automatizaciones con IA", "v2.0 ya disponible", "Para equipos que se mueven rápido"],
      heading: ["{offer} para equipos que no tienen tiempo que perder.", "Deja de perseguir hojas de cálculo. Empieza a decidir.", "La plataforma de {offer} que tu equipo sí va a usar."],
      sub: ["{name} conecta tus herramientas, automatiza el trabajo repetitivo y te muestra lo que importa en un único panel. Configuración en 5 minutos."],
      ctas: [["Probar gratis 14 días", "/precios"], ["Ver demo", "#producto"]],
    },
    features: {
      heading: ["Todo lo que tu equipo necesita", "Hecho para el trabajo real"],
      sub: ["Sin módulos que no vas a usar. Cada función resuelve un problema concreto."],
      items: [
        { title: "Automatizaciones", text: "Reglas visuales que mueven datos entre tus herramientas mientras duermes.", icon: "bolt" },
        { title: "Paneles en tiempo real", text: "Métricas actualizadas al segundo, compartibles con un enlace.", icon: "chart" },
        { title: "Permisos granulares", text: "Cada persona ve exactamente lo que necesita. Auditoría completa.", icon: "lock" },
        { title: "API abierta", text: "REST y webhooks documentados. Integra lo que quieras.", icon: "code" },
        { title: "Colaboración", text: "Comentarios, menciones e historial en cada registro.", icon: "users" },
        { title: "Cumplimiento RGPD", text: "Datos alojados en la UE y cifrados en reposo y en tránsito.", icon: "shield" },
      ],
    },
    showcase: [
      { eyebrow: "Automatiza", heading: "Del caos de pestañas a un flujo que se ejecuta solo", body: "Define una vez cómo se mueve la información y {name} se encarga del resto: avisos, asignaciones, informes. Tu equipo trabaja en lo que requiere criterio." },
      { eyebrow: "Decide", heading: "Una sola fuente de verdad para todo el equipo", body: "Se acabaron las cifras que no cuadran entre departamentos. Todos miran el mismo panel, con los mismos datos, al mismo tiempo." },
    ],
    stats: [
      { title: "-38 %", text: "tiempo en tareas manuales", value: 38 },
      { title: "5 min", text: "para la primera automatización" },
      { title: "99,95 %", text: "disponibilidad garantizada" },
      { title: "+1.200", text: "equipos lo usan a diario", value: 1200 },
    ],
    pricing: [
      { title: "Starter", price: "0", meta: "/mes", text: "Para probar con tu equipo.", features: ["Hasta 3 usuarios", "5 automatizaciones", "Paneles básicos", "Soporte por email"] },
      { title: "Pro", price: "29", meta: "/usuario/mes", text: "Para equipos en crecimiento.", badge: "Más popular", features: ["Usuarios ilimitados", "Automatizaciones ilimitadas", "API y webhooks", "Soporte prioritario"] },
      { title: "Empresa", price: "A medida", meta: "", text: "Seguridad y control avanzados.", features: ["SSO y SCIM", "Auditoría avanzada", "SLA 99,95 %", "Gestor de cuenta"] },
    ],
    testimonials: [
      { title: "Sergio Llorente", meta: "COO, empresa logística", text: "Sustituimos cuatro herramientas por una. El equipo lo adoptó sin formación." },
      { title: "Ana Beltrán", meta: "Head of Ops", text: "La primera automatización la montamos en una reunión. Ahora tenemos más de cuarenta." },
      { title: "Pablo Ríos", meta: "CTO", text: "La API es limpia y la documentación, de las mejores que he visto." },
    ],
    faq: [
      { title: "¿Necesito tarjeta para la prueba?", text: "No. Pruébalo 14 días con todas las funciones y decide después." },
      { title: "¿Puedo migrar mis datos?", text: "Sí. Importación desde CSV, Excel y las herramientas más habituales. Te ayudamos sin coste." },
      { title: "¿Dónde se almacenan los datos?", text: "En centros de datos de la Unión Europea, cifrados en reposo y en tránsito." },
      { title: "¿Puedo cancelar cuando quiera?", text: "Sí, sin permanencia. Exportas tus datos y listo." },
    ],
    cta: { heading: ["Empieza gratis hoy", "Tu equipo te lo va a agradecer"], sub: ["14 días con todas las funciones. Sin tarjeta."], label: "Crear cuenta gratis" },
    logos: ["Northwind", "Globex", "Initech", "Vandelay", "Stark", "Wayne"],
    imagery: ["software dashboard interface dark", "team working laptops office", "abstract data visualization"],
    contact: { heading: "Habla con ventas", sub: "Te enseñamos {name} con tus propios casos de uso.", fields: "quote" },
  },

  corporate: {
    label: "Web corporativa",
    names: ["Arteaga & Asociados", "Grupo Vértice", "Meridia Consulting", "Solvia Ingeniería"],
    home: ["navbar", "hero", "stats", "features", "showcase", "team", "testimonials", "cta", "contact", "footer"],
    pages: [
      { name: "Servicios", path: "/servicios", sections: ["navbar", "features", "steps", "faq", "cta", "footer"] },
      { name: "Nosotros", path: "/nosotros", sections: ["navbar", "showcase", "timeline", "team", "footer"] },
      { name: "Contacto", path: "/contacto", sections: ["navbar", "contact", "footer"] },
    ],
    hero: {
      eyebrow: ["Desde 2004 en {city}", "Consultoría independiente", "Más de 300 proyectos"],
      heading: ["Criterio experto para decisiones que no admiten errores.", "{offer} con la experiencia de quien lo ha hecho cientos de veces.", "Acompañamos a empresas en {offer} de principio a fin."],
      sub: ["En {name} combinamos especialización técnica y cercanía. Un único equipo responsable de tu proyecto, de la primera reunión a la entrega."],
      ctas: [["Solicitar una reunión", "/contacto"], ["Nuestros servicios", "/servicios"]],
    },
    features: {
      heading: ["Servicios", "En qué podemos ayudarte"],
      sub: ["Áreas en las que acumulamos más experiencia y resultados."],
      items: [
        { title: "Diagnóstico", text: "Analizamos la situación actual y te entregamos un informe con prioridades claras.", icon: "search" },
        { title: "Estrategia", text: "Plan de acción con plazos, responsables y presupuesto realista.", icon: "target" },
        { title: "Ejecución", text: "Coordinamos el proyecto y respondemos por los resultados.", icon: "wrench" },
        { title: "Seguimiento", text: "Indicadores trimestrales y revisión continua del plan.", icon: "chart" },
      ],
    },
    showcase: [
      { eyebrow: "Cómo trabajamos", heading: "Un equipo, un interlocutor, cero sorpresas", body: "Asignamos un responsable que conoce tu caso de principio a fin. Informes quincenales, presupuesto cerrado y compromisos por escrito." },
      { eyebrow: "Nuestra historia", heading: "Más de veinte años resolviendo problemas complejos en {city}", body: "Nacimos como un pequeño despacho y hoy somos un equipo multidisciplinar. Lo que no ha cambiado es la forma de trabajar: cerca del cliente y con rigor." },
    ],
    stats: [
      { title: "22", text: "años de experiencia", value: 22 },
      { title: "+300", text: "proyectos completados", value: 300 },
      { title: "94 %", text: "clientes que repiten", value: 94 },
      { title: "18", text: "especialistas en plantilla", value: 18 },
    ],
    team: [
      { title: "Elena Arteaga", meta: "Socia directora", text: "Veinte años liderando proyectos de transformación." },
      { title: "Tomás Rivas", meta: "Director técnico", text: "Ingeniero especializado en procesos y calidad." },
      { title: "Lucía Campos", meta: "Responsable de clientes", text: "Tu interlocutora desde el primer día." },
    ],
    timeline: [
      { title: "Fundación", meta: "2004", text: "Abrimos la primera oficina en {city} con tres personas." },
      { title: "Expansión", meta: "2014", text: "Incorporamos nuevas áreas de especialidad y duplicamos el equipo." },
      { title: "Hoy", meta: "2026", text: "Un equipo de 18 especialistas y clientes en todo el país." },
    ],
    testimonials: [
      { title: "Ricardo Fuentes", meta: "Director general, industria", text: "Rigurosos, claros y siempre disponibles. Cumplieron plazos y presupuesto." },
      { title: "Beatriz Lara", meta: "CFO", text: "El diagnóstico inicial ya justificó la inversión. Muy recomendables." },
    ],
    faq: FAQ_GENERIC,
    cta: { heading: ["Hablemos de tu proyecto"], sub: ["Primera reunión sin coste. Te decimos con franqueza si podemos ayudarte."], label: "Solicitar reunión" },
    imagery: ["modern office architecture", "business meeting professional", "city skyline glass building"],
    contact: { heading: "Solicita una reunión", sub: "Te contactamos en menos de 24 horas laborables.", fields: "quote" },
  },

  portfolio: {
    label: "Portfolio",
    names: ["Irene Sanz", "Studio Marea", "Hugo Vidal", "Nadia Ferrer"],
    home: ["navbar", "hero", "gallery", "showcase", "timeline", "testimonials", "contact", "footer"],
    pages: [
      { name: "Proyectos", path: "/proyectos", sections: ["navbar", "gallery", "cta", "footer"] },
      { name: "Sobre mí", path: "/sobre-mi", sections: ["navbar", "showcase", "timeline", "footer"] },
    ],
    hero: {
      eyebrow: ["Portfolio 2019 — 2026", "Disponible para nuevos proyectos", "{city}"],
      heading: ["{offer} con intención. Cada detalle cuenta.", "Diseño identidades y espacios que la gente recuerda.", "Hago {offer} para marcas que quieren decir algo."],
      sub: ["Soy {name}. Trabajo con marcas y estudios que buscan un punto de vista propio, desde {city} para cualquier lugar."],
      ctas: [["Ver proyectos", "/proyectos"], ["Escríbeme", "#contacto"]],
    },
    features: { heading: ["Servicios"], sub: [""], items: [
      { title: "Dirección de arte", text: "Concepto visual y coherencia en cada pieza.", icon: "palette" },
      { title: "Identidad", text: "Sistemas de marca que funcionan en cualquier soporte.", icon: "gem" },
      { title: "Fotografía", text: "Producto, espacio y retrato con luz natural.", icon: "camera" },
    ] },
    showcase: [
      { eyebrow: "Sobre mí", heading: "Diez años mirando con atención", body: "He trabajado para estudios, editoriales y marcas independientes. Me interesa el oficio, la tipografía y las cosas hechas con paciencia." },
    ],
    timeline: [
      { title: "Estudio propio", meta: "2022 — hoy", text: "Proyectos de identidad y dirección de arte para clientes nacionales e internacionales." },
      { title: "Directora de arte", meta: "2018 — 2022", text: "Agencia creativa en {city}. Campañas para marcas de moda y cultura." },
      { title: "Diseñadora", meta: "2015 — 2018", text: "Estudio editorial. Libros, revistas y exposiciones." },
    ],
    testimonials: [
      { title: "Marcos D.", meta: "Fundador, marca de moda", text: "Entendió la marca mejor que nosotros. El resultado superó lo que imaginábamos." },
      { title: "Sofía L.", meta: "Editora", text: "Rigurosa, sensible y siempre a tiempo. Un placer trabajar juntas." },
    ],
    faq: FAQ_GENERIC,
    cta: { heading: ["¿Tienes un proyecto en mente?"], sub: ["Cuéntamelo. Respondo a todos los mensajes."], label: "Escríbeme" },
    imagery: ["minimal architecture photography", "editorial fashion photography", "graphic design studio desk"],
    contact: { heading: "Trabajemos juntos", sub: "Cuéntame tu proyecto, plazos y presupuesto aproximado.", fields: "contact" },
  },

  restaurant: {
    label: "Restaurante",
    names: ["Brasa Norte", "Casa Lumbre", "La Despensa", "Mar de Fondo"],
    home: ["navbar", "hero", "showcase", "menu", "gallery", "testimonials", "contact", "footer"],
    pages: [
      { name: "Carta", path: "/carta", sections: ["navbar", "menu", "cta", "footer"] },
      { name: "Reservas", path: "/reservas", sections: ["navbar", "contact", "faq", "footer"] },
    ],
    hero: {
      eyebrow: ["Cocina de temporada en {city}", "Abierto de martes a domingo", "Producto local · Fuego lento"],
      heading: ["Cocina de mercado, fuego lento y sobremesas largas.", "Lo que el mercado trae hoy, cocinado con calma.", "{offer} como en casa, pero mejor."],
      sub: ["En {name} cocinamos con producto de cercanía y una carta que cambia con las estaciones. Reserva tu mesa en un minuto."],
      ctas: [["Reservar mesa", "/reservas"], ["Ver la carta", "/carta"]],
    },
    features: { heading: ["La casa"], sub: [""], items: [
      { title: "Producto local", text: "Trabajamos con productores a menos de 100 km.", icon: "leaf" },
      { title: "Brasa de encina", text: "Carnes y verduras al fuego, sin prisas.", icon: "flame" },
      { title: "Bodega propia", text: "Más de 120 referencias, muchas de pequeños productores.", icon: "wine" },
    ] },
    showcase: [
      { eyebrow: "Nuestra historia", heading: "Una cocina que empieza cada mañana en el mercado", body: "Cada día elegimos el producto en el mercado de {city} y decidimos la carta en función de lo que encontramos. Por eso nuestros platos cambian, pero el cuidado no." },
    ],
    menu: [
      { title: "Croquetas de jamón ibérico", text: "Bechamel suave, 6 unidades", price: "12", meta: "Para empezar" },
      { title: "Tomate de temporada", text: "Aceite de arbequina, sal en escamas, albahaca", price: "11", meta: "Para empezar" },
      { title: "Alcachofas a la brasa", text: "Romesco y almendra tostada", price: "14", meta: "Para empezar" },
      { title: "Arroz meloso de setas", text: "Setas de temporada y parmesano curado", price: "19", meta: "Principales" },
      { title: "Lubina a la brasa", text: "Verduras asadas y emulsión de limón", price: "24", meta: "Principales" },
      { title: "Presa ibérica", text: "Patata confitada y pimientos de Padrón", price: "23", meta: "Principales" },
      { title: "Torrija caramelizada", text: "Helado de vainilla de Madagascar", price: "8", meta: "Postres" },
      { title: "Tarta de queso", text: "Cremosa, al horno", price: "7", meta: "Postres" },
    ],
    testimonials: [
      { title: "Gonzalo M.", meta: "Reseña", text: "La lubina a la brasa, de las mejores que he probado. Servicio atento y sin prisas." },
      { title: "Patricia V.", meta: "Reseña", text: "Ambiente acogedor y una carta de vinos con mucho criterio. Volveremos." },
      { title: "Andrés C.", meta: "Reseña", text: "Producto de primera y precios honestos. Reservad con antelación." },
    ],
    faq: [
      { title: "¿Tenéis opciones vegetarianas?", text: "Sí, y adaptamos platos para alergias e intolerancias. Indícalo al reservar." },
      { title: "¿Se puede reservar para grupos?", text: "Aceptamos grupos de hasta 14 personas con menú cerrado. Escríbenos." },
      { title: "¿Hay terraza?", text: "Sí, de abril a octubre. Pídela al reservar, según disponibilidad." },
    ],
    cta: { heading: ["Te guardamos la mesa"], sub: ["Martes a domingo · 13:00–16:00 y 20:00–23:30"], label: "Reservar ahora" },
    imagery: ["restaurant interior warm light", "plated food fine dining", "wood fire grill cooking"],
    contact: { heading: "Reserva tu mesa", sub: "Confirmamos tu reserva por email en menos de 2 horas.", fields: "booking" },
  },

  dealership: {
    label: "Concesionario",
    names: ["Motor Vértice", "Autos Cumbre", "Garaje Central", "Ruta Premium"],
    home: ["navbar", "hero", "products", "features", "stats", "showcase", "testimonials", "contact", "footer"],
    pages: [
      { name: "Inventario", path: "/inventario", sections: ["navbar", "products", "cta", "footer"] },
      { name: "Financiación", path: "/financiacion", sections: ["navbar", "showcase", "steps", "faq", "footer"] },
      { name: "Contacto", path: "/contacto", sections: ["navbar", "contact", "footer"] },
    ],
    hero: {
      eyebrow: ["Vehículos revisados con garantía", "Concesionario en {city}", "Financiación en 24 h"],
      heading: ["Tu próximo coche, revisado, garantizado y listo para la carretera.", "Conduce hoy el coche que llevas meses mirando.", "{offer} con garantía y sin letra pequeña."],
      sub: ["En {name} cada vehículo pasa una inspección de 150 puntos. Prueba de conducción sin compromiso y financiación a tu medida."],
      ctas: [["Ver inventario", "/inventario"], ["Pedir prueba de conducción", "#contacto"]],
    },
    features: {
      heading: ["Por qué comprar en {name}"],
      sub: ["Comprar un coche debería ser emocionante, no estresante."],
      items: [
        { title: "Inspección de 150 puntos", text: "Mecánica, carrocería y electrónica revisadas por nuestro taller.", icon: "wrench" },
        { title: "Garantía de 12 meses", text: "Ampliable hasta 36 meses. Válida en toda la red.", icon: "shield" },
        { title: "Financiación flexible", text: "Respuesta en 24 h y cuotas adaptadas a ti.", icon: "card" },
        { title: "Tasamos tu coche", text: "Te ofrecemos un precio justo por tu vehículo actual.", icon: "gauge" },
      ],
    },
    showcase: [
      { eyebrow: "Financiación", heading: "Cuotas claras, respuesta en 24 horas", body: "Trabajamos con varias entidades para encontrar la mejor condición para ti. Sin comisiones ocultas y con toda la documentación explicada." },
      { eyebrow: "Taller propio", heading: "El mismo equipo que revisa tu coche lo mantiene después", body: "Nuestro taller oficial se encarga de las revisiones y del mantenimiento, con recambio original y precios cerrados." },
    ],
    products: [
      { title: "SUV híbrido 2023", text: "32.000 km · Automático · Híbrido", price: "27900", meta: "2023", badge: "Etiqueta ECO", features: ["32.000 km", "Automático", "Híbrido", "140 CV"] },
      { title: "Berlina diésel 2021", text: "58.000 km · Manual · Diésel", price: "18500", meta: "2021", features: ["58.000 km", "Manual", "Diésel", "150 CV"] },
      { title: "Compacto gasolina 2022", text: "24.000 km · Manual · Gasolina", price: "15900", meta: "2022", badge: "Garantía 24 m", features: ["24.000 km", "Manual", "Gasolina", "110 CV"] },
      { title: "Eléctrico 2024", text: "9.000 km · Automático · 100 % eléctrico", price: "33400", meta: "2024", badge: "Etiqueta 0", features: ["9.000 km", "Automático", "Eléctrico", "420 km autonomía"] },
      { title: "Familiar 7 plazas 2020", text: "71.000 km · Automático · Diésel", price: "21900", meta: "2020", features: ["71.000 km", "Automático", "Diésel", "7 plazas"] },
      { title: "Deportivo 2019", text: "45.000 km · Automático · Gasolina", price: "39900", meta: "2019", features: ["45.000 km", "Automático", "Gasolina", "300 CV"] },
    ],
    stats: [
      { title: "+2.500", text: "vehículos entregados", value: 2500 },
      { title: "150", text: "puntos de inspección", value: 150 },
      { title: "4,8/5", text: "valoración media" },
      { title: "24 h", text: "respuesta de financiación" },
    ],
    steps: {
      heading: "Financia tu coche en 3 pasos",
      items: [
        { title: "Elige tu vehículo", text: "Encuentra el coche en nuestro inventario o pídenos uno concreto." },
        { title: "Solicita la financiación", text: "Rellena el formulario y te respondemos en 24 horas." },
        { title: "Recógelo", text: "Firmamos y te lo entregamos revisado, limpio y con la ITV al día." },
      ],
    },
    testimonials: [
      { title: "Raúl G.", meta: "Cliente", text: "Me tasaron mi coche a un precio justo y en dos días tenía el nuevo. Trato excelente." },
      { title: "Cristina N.", meta: "Cliente", text: "Transparentes con el historial del coche y con la financiación. Muy recomendable." },
    ],
    faq: [
      { title: "¿Los coches tienen garantía?", text: "Todos incluyen 12 meses de garantía, ampliable hasta 36." },
      { title: "¿Puedo dejar mi coche como parte del pago?", text: "Sí. Lo tasamos sin compromiso y descontamos el importe." },
      { title: "¿Qué necesito para financiar?", text: "DNI, última nómina y cuenta bancaria. Te ayudamos con todo el papeleo." },
    ],
    cta: { heading: ["Pruébalo antes de decidir"], sub: ["Reserva una prueba de conducción sin compromiso."], label: "Reservar prueba" },
    imagery: ["luxury car showroom", "car detail headlight dark", "car on open road dusk"],
    contact: { heading: "Reserva una prueba de conducción", sub: "Elige el vehículo y el día. Te confirmamos la cita en menos de 2 horas.", fields: "testdrive" },
  },

  webapp: {
    label: "Aplicación web",
    names: ["Taskly", "Reservo", "Plannr", "Kanbo"],
    home: ["navbar", "hero", "features", "dashboard", "steps", "pricing", "faq", "cta", "footer"],
    pages: [{ name: "Precios", path: "/precios", sections: ["navbar", "pricing", "faq", "footer"] }],
    hero: {
      eyebrow: ["Beta abierta", "Gratis para siempre en el plan básico"],
      heading: ["{offer} sin hojas de cálculo.", "Organiza {offer} en un solo lugar."],
      sub: ["{name} es la aplicación web que sustituye notas sueltas, correos y hojas de cálculo por un flujo claro que todo el equipo entiende."],
      ctas: [["Crear cuenta", "/precios"], ["Ver el panel", "#panel"]],
    },
    features: { heading: ["Funciones"], sub: ["Lo justo, bien hecho."], items: [
      { title: "Tablero visual", text: "Arrastra, suelta y ve el estado de todo de un vistazo.", icon: "layers" },
      { title: "Recordatorios", text: "Avisos por email y en el navegador antes de cada fecha límite.", icon: "clock" },
      { title: "Informes", text: "Exporta a CSV o comparte un enlace de solo lectura.", icon: "chart" },
    ] },
    showcase: [{ eyebrow: "Panel", heading: "Todo bajo control en una pantalla", body: "Un panel que muestra lo importante y esconde lo demás." }],
    steps: { heading: "Empieza en tres pasos", items: [
      { title: "Crea tu cuenta", text: "Solo necesitas un email." },
      { title: "Importa tus datos", text: "Desde CSV o empezando de cero." },
      { title: "Invita a tu equipo", text: "Cada persona con su rol y permisos." },
    ] },
    stats: [
      { title: "1.284", text: "Tareas completadas", value: 1284 },
      { title: "92 %", text: "A tiempo", value: 92 },
      { title: "37", text: "En curso", value: 37 },
      { title: "4,2 h", text: "Tiempo medio de respuesta" },
    ],
    pricing: [
      { title: "Básico", price: "0", meta: "/mes", text: "Para uso personal.", features: ["1 tablero", "Recordatorios", "Exportar CSV"] },
      { title: "Equipo", price: "9", meta: "/usuario/mes", text: "Para equipos pequeños.", badge: "Recomendado", features: ["Tableros ilimitados", "Roles y permisos", "Informes compartidos"] },
    ],
    testimonials: [{ title: "Noelia F.", meta: "Coordinadora", text: "Por fin todo el equipo mira el mismo sitio." }],
    faq: FAQ_GENERIC,
    cta: { heading: ["Pruébalo hoy"], sub: ["Gratis, sin tarjeta."], label: "Crear cuenta" },
    imagery: ["clean app interface laptop", "productivity desk setup"],
    contact: { heading: "Contacto", sub: "¿Dudas? Escríbenos.", fields: "contact" },
  },

  dashboard: {
    label: "Dashboard",
    names: ["Métrica", "Panel Norte", "Insight"],
    home: ["navbar", "hero", "dashboard", "stats", "features", "footer"],
    pages: [],
    hero: {
      eyebrow: ["Datos en tiempo real"],
      heading: ["Tus métricas clave, de un vistazo."],
      sub: ["{name} reúne ventas, tráfico y operaciones en un panel claro y compartible."],
      ctas: [["Ver panel", "#panel"]],
    },
    features: { heading: ["Fuentes de datos"], sub: [""], items: [
      { title: "Ventas", text: "Conecta tu tienda o tu CRM.", icon: "cart" },
      { title: "Tráfico", text: "Visitas y conversiones por canal.", icon: "trending" },
      { title: "Operaciones", text: "Pedidos, incidencias y tiempos.", icon: "box" },
    ] },
    showcase: [],
    stats: [
      { title: "48.920 €", text: "Ingresos (30 días)", value: 48920 },
      { title: "3,4 %", text: "Conversión" },
      { title: "12.480", text: "Visitas", value: 12480 },
      { title: "312", text: "Pedidos", value: 312 },
    ],
    testimonials: [],
    faq: [],
    cta: { heading: ["Conecta tus datos"], sub: [""], label: "Empezar" },
    imagery: ["data analytics screen"],
    contact: { heading: "Contacto", sub: "", fields: "contact" },
  },

  education: {
    label: "Plataforma educativa",
    names: ["Academia Faro", "Aula Viva", "Escuela Prisma", "Campus Nodo"],
    home: ["navbar", "hero", "stats", "products", "features", "team", "testimonials", "pricing", "faq", "newsletter", "footer"],
    pages: [
      { name: "Cursos", path: "/cursos", sections: ["navbar", "products", "faq", "footer"] },
      { name: "Contacto", path: "/contacto", sections: ["navbar", "contact", "footer"] },
    ],
    hero: {
      eyebrow: ["Nuevas convocatorias abiertas", "Formación práctica", "Clases en directo y grabadas"],
      heading: ["Aprende {offer} con proyectos reales y mentores que trabajan en ello.", "De cero a profesional en {offer}, a tu ritmo.", "Formación en {offer} que se nota en tu trabajo."],
      sub: ["En {name} aprendes haciendo: proyectos guiados, correcciones personalizadas y una comunidad que te acompaña."],
      ctas: [["Ver cursos", "/cursos"], ["Clase gratuita", "#newsletter"]],
    },
    features: { heading: ["Cómo aprendes"], sub: ["Método probado con miles de alumnos."], items: [
      { title: "Proyectos reales", text: "Cada módulo termina con un proyecto para tu portfolio.", icon: "target" },
      { title: "Mentoría 1:1", text: "Correcciones individuales cada semana.", icon: "users" },
      { title: "Certificado", text: "Acredita lo aprendido al terminar.", icon: "award" },
      { title: "Acceso de por vida", text: "Revisa el contenido siempre que lo necesites.", icon: "book" },
    ] },
    showcase: [{ eyebrow: "Metodología", heading: "Menos teoría, más práctica", body: "Cada concepto se aplica en un ejercicio el mismo día. Así se aprende de verdad." }],
    products: [
      { title: "Fundamentos", text: "8 semanas · Nivel inicial", price: "190", meta: "Inicial", features: ["24 lecciones", "3 proyectos", "Certificado"] },
      { title: "Profesional", text: "12 semanas · Nivel intermedio", price: "390", meta: "Intermedio", badge: "Más elegido", features: ["40 lecciones", "6 proyectos", "Mentoría 1:1"] },
      { title: "Especialización", text: "10 semanas · Nivel avanzado", price: "490", meta: "Avanzado", features: ["30 lecciones", "Proyecto final", "Bolsa de empleo"] },
    ],
    stats: [
      { title: "+8.000", text: "alumnos formados", value: 8000 },
      { title: "4,9/5", text: "valoración media" },
      { title: "87 %", text: "mejora su empleo en 6 meses", value: 87 },
    ],
    team: [
      { title: "Carmen Ibáñez", meta: "Directora académica", text: "15 años formando profesionales." },
      { title: "Óscar Méndez", meta: "Mentor", text: "Trabaja en el sector desde 2012." },
      { title: "Julia Soto", meta: "Mentora", text: "Especialista en proyectos prácticos." },
    ],
    pricing: [
      { title: "Mensual", price: "39", meta: "/mes", text: "Acceso a todos los cursos.", features: ["Todos los cursos", "Comunidad", "Cancela cuando quieras"] },
      { title: "Anual", price: "349", meta: "/año", text: "Ahorra 2 meses.", badge: "Ahorra 25 %", features: ["Todo lo del mensual", "Mentoría mensual", "Certificados"] },
    ],
    testimonials: [
      { title: "Alba R.", meta: "Alumna", text: "Terminé el curso con un portfolio real y a los dos meses cambié de trabajo." },
      { title: "Iván S.", meta: "Alumno", text: "La mentoría es lo mejor. Correcciones concretas que te hacen avanzar." },
    ],
    faq: [
      { title: "¿Necesito conocimientos previos?", text: "No para el curso de Fundamentos. Los demás indican el nivel recomendado." },
      { title: "¿Las clases son en directo?", text: "Hay sesiones en directo semanales y todo queda grabado." },
      { title: "¿Puedo pagar a plazos?", text: "Sí, hasta en 3 plazos sin intereses." },
    ],
    cta: { heading: ["Recibe una clase gratuita"], sub: ["Te la enviamos por email y decides si es para ti."], label: "Quiero la clase" },
    imagery: ["students learning laptop", "classroom workshop modern", "online course study desk"],
    contact: { heading: "Inscríbete", sub: "Reserva tu plaza en la próxima convocatoria.", fields: "enroll" },
  },

  experience3d: {
    label: "Experiencia 3D",
    names: ["Prisma", "Aether", "Nova Lab", "Halo"],
    home: ["navbar", "scene3d", "marquee", "showcase", "features", "gallery", "cta", "footer"],
    pages: [{ name: "Contacto", path: "/contacto", sections: ["navbar", "contact", "footer"] }],
    hero: {
      eyebrow: ["Experiencia interactiva", "Mueve el cursor"],
      heading: ["{offer} como nunca lo habías visto.", "Una nueva dimensión para {name}."],
      sub: ["Explora, gira y descubre cada detalle. Diseñado para sentirse, no solo para mirarse."],
      ctas: [["Explorar", "#explorar"], ["Contactar", "/contacto"]],
    },
    features: { heading: ["Detalles"], sub: [""], items: [
      { title: "Materiales", text: "Acabados que reaccionan a la luz.", icon: "gem" },
      { title: "Precisión", text: "Cada pieza medida al detalle.", icon: "target" },
      { title: "Rendimiento", text: "Fluido en cualquier dispositivo.", icon: "bolt" },
    ] },
    showcase: [
      { eyebrow: "Concepto", heading: "La forma sigue a la luz", body: "Cada superficie de {name} está pensada para jugar con la luz y el movimiento." },
      { eyebrow: "Proceso", heading: "Del boceto a la pantalla", body: "Un proceso iterativo entre diseño, ingeniería y movimiento." },
    ],
    testimonials: [],
    faq: [],
    cta: { heading: ["¿Creamos algo juntos?"], sub: ["Cuéntanos tu idea."], label: "Hablemos" },
    marquee: ["Interacción", "Luz", "Movimiento", "Profundidad", "Detalle"],
    imagery: ["abstract 3d render iridescent", "futuristic product render"],
    contact: { heading: "Hablemos", sub: "Cuéntanos tu proyecto.", fields: "contact" },
  },

  interactive: {
    label: "Experiencia interactiva",
    names: ["Kinesis", "Relato", "Orbe"],
    home: ["navbar", "hero", "marquee", "steps", "showcase", "gallery", "cta", "footer"],
    pages: [],
    hero: {
      eyebrow: ["Haz scroll"],
      heading: ["Una historia que se cuenta mientras bajas.", "{offer}, capítulo a capítulo."],
      sub: ["{name} convierte cada desplazamiento en un paso de la historia."],
      ctas: [["Empezar", "#capitulos"]],
    },
    features: { heading: [""], sub: [""], items: [] },
    showcase: [
      { eyebrow: "Capítulo 1", heading: "El origen", body: "Todo empieza con una pregunta sencilla." },
      { eyebrow: "Capítulo 2", heading: "El giro", body: "La respuesta cambia la forma de mirar el problema." },
    ],
    steps: { heading: "Capítulos", items: [
      { title: "Descubrir", text: "Observa sin prisa." },
      { title: "Entender", text: "Conecta las piezas." },
      { title: "Actuar", text: "Da el siguiente paso." },
    ] },
    testimonials: [],
    faq: [],
    cta: { heading: ["Continúa la historia"], sub: [""], label: "Contactar" },
    marquee: ["Scroll", "Historia", "Ritmo", "Pausa", "Descubrimiento"],
    imagery: ["cinematic landscape night", "abstract light trails"],
    contact: { heading: "Contacto", sub: "", fields: "contact" },
  },
};

export const FORM_PRESETS = {
  contact: [
    { name: "nombre", label: "Nombre", type: "text", required: true },
    { name: "email", label: "Email", type: "email", required: true },
    { name: "mensaje", label: "¿En qué podemos ayudarte?", type: "textarea", required: true },
  ],
  quote: [
    { name: "nombre", label: "Nombre", type: "text", required: true },
    { name: "empresa", label: "Empresa", type: "text", required: false },
    { name: "email", label: "Email", type: "email", required: true },
    { name: "telefono", label: "Teléfono", type: "tel", required: false },
    { name: "mensaje", label: "Cuéntanos tu proyecto", type: "textarea", required: true },
  ],
  booking: [
    { name: "nombre", label: "Nombre", type: "text", required: true },
    { name: "email", label: "Email", type: "email", required: true },
    { name: "telefono", label: "Teléfono", type: "tel", required: true },
    { name: "fecha", label: "Fecha", type: "date", required: true },
    { name: "comensales", label: "Comensales", type: "select", required: true, options: ["1", "2", "3", "4", "5", "6", "7", "8+"] },
    { name: "notas", label: "Alergias o comentarios", type: "textarea", required: false },
  ],
  testdrive: [
    { name: "nombre", label: "Nombre", type: "text", required: true },
    { name: "email", label: "Email", type: "email", required: true },
    { name: "telefono", label: "Teléfono", type: "tel", required: true },
    { name: "vehiculo", label: "Vehículo de interés", type: "text", required: false },
    { name: "fecha", label: "Fecha preferida", type: "date", required: true },
  ],
  enroll: [
    { name: "nombre", label: "Nombre", type: "text", required: true },
    { name: "email", label: "Email", type: "email", required: true },
    { name: "curso", label: "Curso", type: "select", required: true, options: ["Fundamentos", "Profesional", "Especialización"] },
    { name: "mensaje", label: "¿Algo que debamos saber?", type: "textarea", required: false },
  ],
} as const;
