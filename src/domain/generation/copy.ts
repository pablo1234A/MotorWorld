import type { ResolvedAttribute } from "../categories";
import type { ConditionCode, Language, Tone } from "../product";

/**
 * Banco de redacción del generador por plantillas.
 *
 * Todo lo que hay aquí son formas de DECIR datos que el usuario ya ha dado:
 * ninguna frase añade hechos sobre el producto. Las alternativas de cada frase
 * se eligen de forma determinista con una semilla, de modo que dos productos no
 * se leen igual y «Volver a generar» ofrece otra redacción con los mismos datos.
 */

export type Family = "tech" | "fashion" | "home" | "vehicle" | "sport" | "property" | "tools" | "media" | "generic";

const FAMILY_BY_SLUG: Record<string, Family> = {
  moviles: "tech",
  electronica: "tech",
  ordenadores: "tech",
  videojuegos: "tech",
  electrodomesticos: "tech",
  ropa: "fashion",
  calzado: "fashion",
  accesorios: "fashion",
  belleza: "fashion",
  bebes: "fashion",
  muebles: "home",
  decoracion: "home",
  vehiculos: "vehicle",
  motocicletas: "vehicle",
  bicicletas: "sport",
  deportes: "sport",
  inmuebles: "property",
  herramientas: "tools",
  maquinaria: "tools",
  "libros-musica": "media",
  coleccionismo: "media",
};

export function familyOf(slug: string | null | undefined): Family {
  return (slug && FAMILY_BY_SLUG[slug]) || "generic";
}

/** Familias en las que la marca se antepone al nombre («Apple iPhone 13», «Volkswagen Golf»). */
export const BRAND_FIRST: ReadonlySet<Family> = new Set<Family>(["tech", "vehicle"]);

// --- Semilla y selección determinista -------------------------------------------
export function seedFrom(text: string, variation = 0): number {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) + variation * 7919;
}

/** Elige una alternativa. `slot` hace que cada frase del anuncio varíe de forma independiente. */
export function pick<T>(options: readonly T[], seed: number, slot: number): T {
  return options[(seed + slot * 31) % options.length]!;
}

// --- Estado ---------------------------------------------------------------------
type ConditionCopy = { phrase: string; sentence: string[] };

/** Frases de estado sin género gramatical (sirven para «el móvil» y para «la bicicleta»). */
export const CONDITION_COPY: Record<Language, Record<Exclude<ConditionCode, "custom">, ConditionCopy>> = {
  es: {
    new: { phrase: "a estrenar", sentence: ["Es un artículo nuevo, a estrenar.", "A estrenar.", "Nuevo, sin uso."] },
    like_new: { phrase: "prácticamente sin uso", sentence: ["Apenas tiene uso y no presenta marcas apreciables.", "Prácticamente sin uso.", "Como nuevo, sin marcas apreciables."] },
    very_good: { phrase: "en muy buen estado", sentence: ["Está en muy buen estado.", "Se conserva muy bien.", "Muy buen estado general."] },
    good: { phrase: "en buen estado", sentence: ["Está en buen estado, con las señales normales del uso.", "Buen estado general, con el desgaste propio del uso.", "En buen estado; se nota que se ha usado."] },
    acceptable: { phrase: "en estado aceptable", sentence: ["Tiene señales de uso evidentes.", "Estado aceptable, con marcas de uso visibles.", "Se nota el uso: presenta marcas visibles."] },
    refurbished: { phrase: "reacondicionado", sentence: ["Es un artículo reacondicionado.", "Reacondicionado para su venta.", "Artículo reacondicionado."] },
    for_parts: { phrase: "para reparar o para piezas", sentence: ["Se vende para reparar o para aprovechar piezas.", "Para reparar o para piezas.", "Para reparar o despiece."] },
  },
  en: {
    new: { phrase: "brand new", sentence: ["Brand new and unused.", "New, never used.", "New, unused item."] },
    like_new: { phrase: "barely used", sentence: ["Barely used, with no noticeable marks.", "Hardly used.", "Like new, with no visible marks."] },
    very_good: { phrase: "in very good condition", sentence: ["In very good condition.", "Very well kept.", "Very good overall condition."] },
    good: { phrase: "in good condition", sentence: ["In good condition, with normal signs of use.", "Good overall condition with the usual wear.", "In good condition; it has clearly been used."] },
    acceptable: { phrase: "in acceptable condition", sentence: ["Shows evident signs of use.", "Acceptable condition with visible wear.", "Clearly used: it has visible marks."] },
    refurbished: { phrase: "refurbished", sentence: ["This is a refurbished item.", "Refurbished for resale.", "Refurbished item."] },
    for_parts: { phrase: "for parts or repair", sentence: ["Sold for parts or repair.", "For repair or parts.", "For repair or spare parts."] },
  },
};

// --- Atributos convertidos en lenguaje natural ----------------------------------
type Clause = (value: string) => string;
const lower = (value: string) => (/^[A-ZÁÉÍÓÚÑ][a-záéíóúñ]/.test(value) ? value.charAt(0).toLowerCase() + value.slice(1) : value);

/**
 * Cómo se dice cada atributo dentro de una frase. Los que no están aquí se
 * muestran como «Etiqueta: valor» en la lista de características.
 */
export const ATTRIBUTE_CLAUSES: Record<Language, Record<string, Clause>> = {
  es: {
    almacenamiento: (v) => `${v} de almacenamiento`,
    ram: (v) => `${v} de RAM`,
    color: (v) => `color ${lower(v)}`,
    procesador: (v) => `procesador ${v}`,
    tarjeta_grafica: (v) => `gráfica ${v}`,
    sistema_operativo: (v) => `${v}`,
    tamano_pantalla: (v) => `pantalla de ${v}`,
    resolucion: (v) => `resolución ${v}`,
    plataforma: (v) => `para ${v}`,
    formato: (v) => `formato ${lower(v)}`,
    talla: (v) => `talla ${v}`,
    material: (v) => `de ${lower(v)}`,
    genero: (v) => `para ${v.toLowerCase()}`,
    temporada: (v) => `temporada ${v.toLowerCase()}`,
    tipo: (v) => `tipo ${lower(v)}`,
    plazas: (v) => `${v}`,
    anio: (v) => `año ${v}`,
    kilometros: (v) => `${v}`,
    combustible: (v) => (/^(gasolina|glp|gnc)$/i.test(v) ? `motor de ${/^g[ln][pc]$/i.test(v) ? v : lower(v)}` : `motor ${lower(v)}`),
    transmision: (v) => `cambio ${lower(v)}`,
    potencia: (v) => `${v}`,
    cilindrada: (v) => `${v}`,
    puertas: (v) => `${v} puertas`,
    talla_cuadro: (v) => `cuadro talla ${v}`,
    tamano_rueda: (v) => `ruedas de ${v}`,
    material_cuadro: (v) => `cuadro de ${lower(v)}`,
    marchas: (v) => `${v} marchas`,
    operacion: (v) => (/^venta$/i.test(v) ? "" : `en ${v.toLowerCase()}`),
    superficie: (v) => `${v}`,
    habitaciones: (v) => `${v.replace(/\s*hab\.?$/, "")} ${v.startsWith("1 ") || v === "1" ? "habitación" : "habitaciones"}`,
    banos: (v) => `${v} ${v === "1" ? "baño" : "baños"}`,
    planta: (v) => `planta ${v}`,
    alimentacion: (v) => `alimentación ${lower(v)}`,
    contenido: (v) => `${v}`,
    autor: (v) => `de ${v}`,
    idioma: (v) => `en ${lower(v)}`,
    conectividad: (v) => `conexión ${lower(v)}`,
    megapixeles: (v) => `${v}`,
    horas_uso: (v) => `${v} de uso`,
    estilo: (v) => `estilo ${lower(v)}`,
    capacidad: (v) => `capacidad ${v}`,
    deporte: (v) => `para ${lower(v)}`,
  },
  en: {
    almacenamiento: (v) => `${v} of storage`,
    ram: (v) => `${v} of RAM`,
    color: (v) => `${lower(v)} colour`,
    procesador: (v) => `${v} processor`,
    tamano_pantalla: (v) => `${v.replace("pulgadas", "inch")} screen`,
    resolucion: (v) => `${v} resolution`,
    plataforma: (v) => `for ${v}`,
    talla: (v) => `size ${v}`,
    material: (v) => `made of ${lower(v)}`,
    anio: (v) => `${v} model year`,
    kilometros: (v) => `${v}`,
    combustible: (v) => `${lower(v)}`,
    transmision: (v) => `${lower(v)} gearbox`,
    potencia: (v) => `${v.replace("CV", "hp")}`,
    plazas: (v) => `${v.replace("plazas", "seats")}`,
    superficie: (v) => `${v}`,
    habitaciones: (v) => `${v.replace(/\s*hab\.?$/, "")} bedrooms`,
    banos: (v) => `${v} bathrooms`,
    marchas: (v) => `${v} gears`,
  },
};

/** Atributos sí/no dichos como rasgo cuando son afirmativos. */
export const BOOLEAN_CLAUSES: Record<Language, Record<string, string>> = {
  es: { libre: "libre de operador", smart_tv: "con Smart TV", ascensor: "con ascensor", electrica: "con asistencia eléctrica", precintado: "con el precinto original" },
  en: { libre: "carrier unlocked", smart_tv: "with Smart TV", ascensor: "with lift", electrica: "with electric assist", precintado: "factory sealed" },
};

/** Atributos que merecen frase propia en lugar de ir en la enumeración. */
export const ATTRIBUTE_SENTENCES: Record<Language, Record<string, Clause>> = {
  es: {
    estado_bateria: (v) => `La batería conserva el ${v} de su capacidad.`,
    accesorios: (v) => `Incluye: ${lower(v)}.`,
    incluye: (v) => `Incluye: ${lower(v)}.`,
    dimensiones: (v) => `Medidas: ${v}.`,
    medidas_colchon: (v) => `Medidas: ${v}.`,
    itv: (v) => `ITV en vigor hasta ${v}.`,
    certificado_energetico: (v) => `Certificado energético: ${v}.`,
    eficiencia_energetica: (v) => `Eficiencia energética: ${v}.`,
    caducidad: (v) => `Fecha de caducidad: ${v}.`,
    tipo_carnet: (v) => `Se conduce con el carnet ${v}.`,
    edad_recomendada: (v) => `Edad recomendada: ${v}.`,
    epoca: (v) => `Época: ${v}.`,
  },
  en: {
    estado_bateria: (v) => `Battery health is at ${v}.`,
    accesorios: (v) => `Includes: ${lower(v)}.`,
    incluye: (v) => `Includes: ${lower(v)}.`,
    dimensiones: (v) => `Dimensions: ${v}.`,
    medidas_colchon: (v) => `Size: ${v}.`,
    itv: (v) => `Roadworthiness test valid until ${v}.`,
    certificado_energetico: (v) => `Energy certificate: ${v}.`,
  },
};

export function joinList(items: string[], language: Language): string {
  if (items.length <= 1) return items[0] ?? "";
  const and = language === "es" ? "y" : "and";
  const last = items[items.length - 1]!;
  // En español «y» pasa a «e» ante palabras que empiezan por «i» o «hi».
  const conjunction = language === "es" && /^h?i[^aeo]/i.test(last) ? "e" : and;
  return `${items.slice(0, -1).join(", ")} ${conjunction} ${last}`;
}

export type AttributeProse = { sentences: string[]; used: Set<string> };

/** Convierte los atributos conocidos en una o dos frases naturales. */
export function attributesToProse(attributes: ResolvedAttribute[], language: Language, exclude: Set<string> = new Set()): AttributeProse {
  const clauses: { key: string; text: string }[] = [];
  const extra: string[] = [];
  const used = new Set<string>();
  for (const attribute of attributes) {
    if (exclude.has(attribute.key)) continue;
    if (attribute.isBoolean) {
      const clause = BOOLEAN_CLAUSES[language][attribute.key];
      if (clause && attribute.value !== "No") clauses.push({ key: attribute.key, text: clause });
      continue;
    }
    const sentence = ATTRIBUTE_SENTENCES[language][attribute.key];
    if (sentence) {
      extra.push(sentence(attribute.value));
      used.add(attribute.key);
      continue;
    }
    const clause = ATTRIBUTE_CLAUSES[language][attribute.key];
    if (clause) {
      const text = clause(attribute.value);
      if (text) clauses.push({ key: attribute.key, text });
      else used.add(attribute.key);
    }
  }
  const sentences: string[] = [];
  // Una sola cláusula suelta («De lana.») queda pobre: en ese caso va a la lista.
  const onlyTraits = clauses.length === 1 && Boolean(BOOLEAN_CLAUSES[language][clauses[0]!.key]);
  if (clauses.length >= 2 || onlyTraits) {
    const selected = clauses.slice(0, 7);
    const text = joinList(selected.map((clause) => clause.text), language);
    sentences.push(`${text.charAt(0).toUpperCase()}${text.slice(1)}.`);
    for (const clause of selected) used.add(clause.key);
  }
  sentences.push(...extra);
  return { sentences, used };
}

// --- Frases de apertura, cierre y encabezados -----------------------------------
type Opening = (name: string, facts: string, condition: string) => string;
const withFacts = (facts: string, separator = ", ") => (facts ? `${separator}${facts}` : "");

export const OPENINGS: Record<Language, Record<Exclude<Tone, "minimal">, Opening[]>> = {
  es: {
    professional: [
      (name, facts, condition) => `Se vende ${name}${withFacts(facts)}, ${condition}.`,
      (name, facts, condition) => `${cap(name)}${withFacts(facts)}. Se entrega ${condition}.`,
      (name, facts, condition) => `En venta: ${name}${withFacts(facts)}, ${condition}.`,
    ],
    friendly: [
      (name, facts, condition) => `¡Hola! Vendo ${name}${withFacts(facts)}, ${condition}.`,
      (name, facts, condition) => `Vendo ${name}${withFacts(facts)}. Está ${condition}.`,
      (name, facts, condition) => `Te cuento: vendo ${name}${withFacts(facts)}, ${condition}.`,
    ],
    persuasive: [
      (name, facts, condition) => `${cap(name)}${withFacts(facts, ": ")}. Se entrega ${condition} y con toda la información a la vista.`,
      (name, facts, condition) => `${cap(name)}${withFacts(facts, ": ")}. Está ${condition}; abajo tienes todos los detalles.`,
      (name, facts, condition) => `${cap(name)}, ${condition}${withFacts(facts, " · ")}. Sin letra pequeña: abajo tienes todos los detalles.`,
    ],
  },
  en: {
    professional: [
      (name, facts, condition) => `For sale: ${name}${withFacts(facts)}, ${condition}.`,
      (name, facts, condition) => `${cap(name)}${withFacts(facts)}. Supplied ${condition}.`,
    ],
    friendly: [
      (name, facts, condition) => `Hi! I'm selling this ${name}${withFacts(facts)}, ${condition}.`,
      (name, facts, condition) => `Selling my ${name}${withFacts(facts)}. It's ${condition}.`,
    ],
    persuasive: [
      (name, facts, condition) => `${cap(name)}${withFacts(facts, ": ")}. Supplied ${condition}, with every detail up front.`,
      (name, facts, condition) => `Looking for ${name}? Here are the facts${withFacts(facts, ": ")}. It's ${condition}.`,
    ],
  },
};

function cap(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

type Labels = {
  details: string[];
  specs: string;
  defects: string[];
  noteCondition: string;
  price: string;
  location: string[];
  includes: string;
  keywords: string;
  cta: Record<Tone, string[]>;
};

export const LABELS: Record<Language, Labels> = {
  es: {
    details: ["Detalles", "Características", "Ficha del producto"],
    specs: "Ficha completa",
    defects: ["A tener en cuenta", "Para que no haya sorpresas", "Importante"],
    noteCondition: "Estado",
    price: "Precio",
    location: ["Se encuentra en", "Ubicación:", "Disponible en"],
    includes: "Incluye",
    keywords: "Palabras clave",
    cta: {
      professional: ["Para cualquier consulta, puedes escribirme.", "Quedo a tu disposición para resolver cualquier duda.", "Si necesitas más información o fotografías, escríbeme."],
      friendly: ["¿Alguna duda? Escríbeme sin compromiso.", "Pregúntame lo que necesites, respondo rápido.", "Si quieres más fotos o detalles, dímelo."],
      persuasive: ["Si te encaja, escríbeme y lo concretamos hoy mismo.", "Escríbeme y te resuelvo cualquier duda antes de decidir.", "¿Te interesa? Envíame un mensaje y lo vemos."],
      minimal: [""],
    },
  },
  en: {
    details: ["Details", "Features", "Product details"],
    specs: "Full specifications",
    defects: ["Please note", "No surprises", "Worth knowing"],
    noteCondition: "Condition",
    price: "Price",
    location: ["Located in", "Location:", "Available in"],
    includes: "Includes",
    keywords: "Keywords",
    cta: {
      professional: ["Feel free to message me with any questions.", "Happy to answer any questions you may have.", "Message me if you need more details or photos."],
      friendly: ["Any questions? Just send me a message.", "Ask me anything, I reply quickly.", "Want more photos or details? Let me know."],
      persuasive: ["If it suits you, message me and we'll sort it out today.", "Message me and I'll answer any question before you decide.", "Interested? Drop me a message."],
      minimal: [""],
    },
  },
};

// --- Higiene del texto escrito por el usuario -----------------------------------
/**
 * Pule la descripción del usuario SIN cambiar sus palabras: espacios, mayúscula
 * inicial de cada frase y punto final. No reescribe ni añade contenido.
 */
export function polishUserText(value: string): string {
  const paragraphs = value
    .split(/\n{2,}/)
    .map((paragraph) =>
      paragraph
        .split("\n")
        .map((line) => line.replace(/\s+/g, " ").replace(/\s+([,.;:!?])/g, "$1").trim())
        .filter(Boolean)
        .join("\n"),
    )
    .filter(Boolean);
  return paragraphs
    .map((paragraph) => {
      let text = paragraph.replace(/(^|[.!?]\s+|\n)([a-záéíóúñ])/g, (_, prefix: string, letter: string) => `${prefix}${letter.toUpperCase()}`);
      text = text.replace(/([!?.]){2,}/g, "$1");
      if (!/[.!?:)…]$/.test(text) && !/^[•\-*]/m.test(text)) text += ".";
      return text;
    })
    .join("\n\n");
}
