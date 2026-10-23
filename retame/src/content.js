/* =====================================================================
 * RÉTAME — contenido
 *
 * Reglas para añadir retos (las comprueba `npm test` y el motor en vivo):
 *  - slug único, estable y en minúsculas: forma parte de la URL pública.
 *  - Nunca reutilices el slug de un reto borrado.
 *  - Una sola respuesta correcta. Si dos respuestas pueden valer, usa
 *    opción múltiple con distractores claramente incorrectos.
 *  - Los datos numéricos llevan `check` para que la validación los
 *    recalcule (expr, seq, count, dias, edades, valores…).
 *  - Trivia: datos estables y verificables, sin "actualmente" ni récords
 *    que puedan cambiar sin fecha.
 * =================================================================== */

var CATEGORIES = [
  {
    slug: "logica", label: "Lógica", name: "Lógica", icon: "logica", color: "#5B21E8", order: 1,
    short: "Acertijos, deducción y pensamiento lateral.",
    h1: "Retos de lógica y acertijos",
    seoTitle: "Retos de lógica y acertijos con solución",
    metaDesc: "Acertijos de lógica, deducción y pensamiento lateral con solución explicada. Juega gratis, sin registro, y reta a tus amigos a superar tu marca.",
    intro: [
      "Acertijos clásicos, problemas de deducción y preguntas de pensamiento lateral. No necesitas saber datos: todo se resuelve con lo que te da el enunciado.",
      "Cada reto tiene una única respuesta correcta y una explicación. Si fallas, abre la solución: entender por qué es la mitad de la gracia."
    ],
    tips: [
      "Lee el enunciado dos veces. El dato clave suele estar en la frase que parece de relleno.",
      "Si algo parece imposible, busca la explicación que todavía no has considerado antes de descartar opciones.",
      "En los problemas de calendario, cada 7 días se repite el mismo día de la semana: solo importa el resto."
    ]
  },
  {
    slug: "matematicas", label: "Números", name: "Matemáticas", icon: "matematicas", color: "#D9480F", order: 2,
    short: "Cálculo mental, series y problemas con trampa.",
    h1: "Retos de matemáticas y cálculo mental",
    seoTitle: "Retos de matemáticas y cálculo mental",
    metaDesc: "Cálculo mental, porcentajes, series numéricas y problemas con trampa. Respuestas comprobadas y solución paso a paso. Gratis y sin registro.",
    intro: [
      "Cálculo mental, porcentajes, series numéricas y problemas cortos que parecen fáciles hasta que los haces. Todo se resuelve sin calculadora.",
      "Las respuestas se comprueban solas. Escribe el número tal cual: valen la coma y el punto para los decimales."
    ],
    tips: [
      "Para multiplicar por 25, multiplica por 100 y divide entre 4.",
      "Un porcentaje y su inverso no se anulan: subir un 10 % y bajar un 10 % deja el precio un 1 % por debajo.",
      "En una serie, mira primero la diferencia entre términos; si no es constante, mira la diferencia de las diferencias."
    ]
  },
  {
    slug: "palabras", label: "Palabras", name: "Palabras", icon: "palabras", color: "#0B7A75", order: 3,
    short: "Anagramas, sinónimos y palabras encadenadas.",
    h1: "Juegos de palabras",
    seoTitle: "Juegos de palabras: anagramas, sinónimos y más",
    metaDesc: "Anagramas, sinónimos, contrarios, palabras encadenadas y la letra que falta. Juegos de palabras en español, cortos y con solución.",
    intro: [
      "Anagramas, sinónimos, contrarios y palabras que se encadenan. Todo en español y con vocabulario de uso común.",
      "En los anagramas, los acentos y las mayúsculas no cuentan. Si una combinación de letras admite más de una palabra, las aceptamos todas."
    ],
    tips: [
      "En un anagrama, busca primero las sílabas habituales del español: -CIÓN, -ERO, -ADA.",
      "Si dudas entre dos sinónimos, descarta antes los que ya tienen pareja segura.",
      "Las palabras encadenadas empiezan por la última letra de la anterior: fíjate en cómo acaba cada una."
    ]
  },
  {
    slug: "memoria", label: "Memoria", name: "Memoria", icon: "memoria", color: "#C2255C", order: 4,
    short: "Memoriza la secuencia antes de que desaparezca.",
    h1: "Juegos de memoria",
    seoTitle: "Juegos de memoria: colores, símbolos y cifras",
    metaDesc: "Memoriza una secuencia de colores, símbolos o cifras en pocos segundos y repítela en el mismo orden. Cada partida es distinta.",
    intro: [
      "Verás una secuencia durante unos segundos. Después desaparece y tienes que repetirla en el mismo orden.",
      "Cada partida genera una secuencia nueva, así que no sirve memorizar la anterior. En un duelo, tu amigo recibe exactamente la misma que tú."
    ],
    tips: [
      "Agrupa en bloques de dos o tres: es más fácil recordar tres grupos que siete elementos sueltos.",
      "Ponle una historia a la secuencia: «la luna roja junto al árbol» se recuerda mejor que tres símbolos.",
      "Si te equivocas al tocar, usa «Deshacer» antes de completar la secuencia."
    ]
  },
  {
    slug: "trivia", label: "Trivia", name: "Trivia", icon: "trivia", color: "#1C5FD4", order: 5,
    short: "Geografía, historia, ciencia, arte, cine, música y deporte.",
    h1: "Preguntas de trivia y cultura general",
    seoTitle: "Preguntas de trivia y cultura general con respuestas",
    metaDesc: "Preguntas de cultura general de geografía, historia, ciencia, arte, cine, música y deporte. Datos verificados y respuestas explicadas.",
    intro: [
      "Preguntas de cultura general sobre geografía, historia, ciencia, arte, cine, música y deporte. Elegimos datos estables y verificables: nada de récords que cambian cada año ni preguntas trampa.",
      "Hay preguntas de opción múltiple, de verdadero o falso y de emparejar. Al terminar puedes ver todas las respuestas."
    ],
    tips: [
      "Muchas capitales no son la ciudad más grande del país: Canberra, Ottawa o Ankara son clásicos.",
      "En verdadero o falso, desconfía de las afirmaciones con «todos», «nunca» o «siempre».",
      "Al emparejar, empieza por las parejas que tengas seguras: las dudosas se resuelven solas."
    ]
  },
  {
    slug: "estimacion", label: "Estimar", name: "Estimación", icon: "estimacion", color: "#9A6700", order: 6,
    short: "No hace falta acertar exacto: basta con acercarse.",
    h1: "Retos de estimación",
    seoTitle: "Retos de estimación: ¿cuánto te acercas?",
    metaDesc: "Estima distancias, cantidades y tiempos. No hace falta acertar exacto: cuenta como acierto si caes dentro del margen indicado.",
    intro: [
      "¿Cuántos huesos tiene el cuerpo? ¿Cuántos segundos tiene un día? Escribe tu estimación: cuenta como acierto si caes dentro del margen que indica cada pregunta.",
      "Algunas preguntas son de cultura general y otras se pueden calcular de cabeza. En todas te enseñamos el valor exacto al responder."
    ],
    tips: [
      "Redondea sin miedo: 365 días son casi 400, y 24 horas son casi 25.",
      "Fíjate en la unidad que pide la pregunta: metros, kilómetros, minutos…",
      "Puedes escribir 384.400 o 384400: entendemos los dos formatos."
    ]
  },
  {
    slug: "observacion", label: "Observar", name: "Observación", icon: "observacion", color: "#2B8A3E", order: 7,
    short: "Cuenta, encuentra el intruso y detecta patrones.",
    h1: "Retos de observación",
    seoTitle: "Retos de observación: cuenta y busca el intruso",
    metaDesc: "Cuenta símbolos, encuentra el intruso y descubre qué sigue en la serie. Retos visuales cortos para entrenar la atención.",
    intro: [
      "Retos visuales para entrenar la atención: contar símbolos, encontrar el que no encaja y descubrir qué viene después en una serie.",
      "No hay prisa: la rapidez solo da un pequeño extra. Mirar con calma casi siempre puntúa más."
    ],
    tips: [
      "Para contar, recorre la fila de izquierda a derecha y lleva la cuenta en voz baja.",
      "En los patrones, busca el bloque que se repite y marca dónde empieza.",
      "El intruso no siempre es el más raro a primera vista: pregúntate qué tienen en común los demás."
    ]
  },
  {
    slug: "ordenar", label: "Ordenar", name: "Ordenar", icon: "ordenar", color: "#0C8599", order: 8,
    short: "Pon en orden fechas, planetas, números y palabras.",
    h1: "Retos de ordenar",
    seoTitle: "Retos de ordenar: fechas, planetas, números y palabras",
    metaDesc: "Ordena acontecimientos históricos, planetas, números y palabras. Toca dos elementos para intercambiarlos. Gratis y sin registro.",
    intro: [
      "Acontecimientos de la historia, planetas, números, animales o palabras: ponlos en el orden correcto.",
      "Toca un elemento y luego otro para intercambiarlos. Cuando lo tengas, pulsa «Comprobar»."
    ],
    tips: [
      "Coloca primero los extremos (el más antiguo y el más reciente) y después rellena el centro.",
      "Para ordenar fracciones, pásalas a decimales de cabeza: 1/3 ≈ 0,33 y 3/4 = 0,75.",
      "En orden alfabético, si dos palabras empiezan igual, decide la primera letra distinta."
    ]
  }
];

/* Categoría no indexable: juegos de opinión para jugar en grupo. No dan
 * puntos (no hay respuesta correcta) y no aparecen en buscadores. */
var HIDDEN_CATEGORIES = [
  { slug: "grupo", name: "En grupo", icon: "grupo", color: "#E8590C", order: 99, hidden: true,
    short: "Preguntas de opinión para comparar con tus amigos. Sin puntos." }
];

var TOPICS = {
  geografia: "Geografía", historia: "Historia", ciencia: "Ciencia", arte: "Arte y literatura",
  cine: "Cine", musica: "Música", deporte: "Deporte"
};

/* Equivalencias de la versión 1 (14 categorías) → versión 2 (8). */
var LEGACY_CATS = {
  mind: "logica", hard: "logica", acertijos: "logica", numbers: "matematicas", words: "palabras",
  observation: "observacion", culture: "trivia", geo: "trivia", history: "trivia", science: "trivia",
  movies: "trivia", music: "trivia", sports: "trivia", fun: "grupo", social: "grupo"
};
var LEGACY_TOPICS = { geo: "geografia", history: "historia", science: "ciencia", movies: "cine", music: "musica", sports: "deporte", culture: "arte" };

var FEATURED = ["balanza-nueve-monedas", "problemas-con-trampa", "secuencia-colores", "trivia-capitales-mundo", "cuestion-de-numeros-estima", "acertijo-pensamiento-lateral"];

var CHALLENGES = [
  /* ----------------------------- LÓGICA ----------------------------- */
  {
    slug: "balanza-nueve-monedas", cat: "logica", kind: "opcion_multiple", difficulty: 3, duration: 100, v: 2,
    title: "La balanza de las 9 monedas",
    excerpt: "Una moneda es falsa y pesa menos. ¿Cuántas pesadas necesitas para encontrarla?",
    description: "Un clásico de lógica que casi todo el mundo resuelve mal la primera vez. La clave está en no comparar las monedas de dos en dos.",
    solution: "Con 2 pesadas. Divide las 9 monedas en 3 grupos de 3. Pesada 1: grupo A contra grupo B. Si equilibran, la falsa está en el grupo C; si no, en el que pesa menos. Con ese grupo de 3, pesada 2: una moneda contra otra. Si equilibran, la falsa es la tercera; si no, la que pesa menos. Con 27 monedas basta añadir una pesada más (3 × 3 × 3 = 27).",
    data: { preguntas: [
      { pregunta: "Tienes 9 monedas iguales y sabes que una pesa menos que las demás. Con una balanza de dos platos, ¿cuál es el mínimo número de pesadas para encontrarla siempre?", opciones: ["3 pesadas", "2 pesadas", "4 pesadas", "8 pesadas"], correcta: 1, explica: "Cada pesada divide las candidatas entre tres: 9 → 3 → 1." },
      { pregunta: "Si tuvieras 27 monedas y una falsa más ligera, ¿cuántas pesadas como mínimo necesitarías?", opciones: ["4 pesadas", "9 pesadas", "3 pesadas", "13 pesadas"], correcta: 2, explica: "27 → 9 → 3 → 1: tres pesadas." },
      { pregunta: "En la primera pesada, el grupo A pesa más que el grupo B. La moneda falsa es más ligera. ¿Dónde está?", opciones: ["En el grupo A", "En el grupo B", "En el grupo C", "No se puede saber"], correcta: 1, explica: "Si la falsa pesa menos, está en el plato que sube: el del grupo B." }
    ] }
  },
  {
    slug: "secuencia-imposible", cat: "logica", kind: "secuencia", difficulty: 4, duration: 80, v: 2,
    title: "La secuencia imposible",
    excerpt: "Cuatro series, cuatro patrones distintos. La segunda es la que más se falla.",
    description: "Series numéricas con patrones distintos: sumas, multiplicaciones y diferencias que crecen. Encuentra la regla y elige el siguiente número.",
    solution: "1) Fibonacci: cada número es la suma de los dos anteriores → 13. 2) Las diferencias crecen de 2 en 2 (+4, +6, +8, +10, +12) → 42. 3) Se multiplica por 2 → 48. 4) Se multiplica por 2 → 80.",
    data: { preguntas: [
      { pregunta: "Continúa la secuencia:", visual: "1, 1, 2, 3, 5, 8, ?", opciones: ["11", "12", "13", "15"], correcta: 2, check: { seq: [1, 1, 2, 3, 5, 8] }, explica: "Cada número es la suma de los dos anteriores: 5 + 8 = 13." },
      { pregunta: "Continúa la secuencia:", visual: "2, 6, 12, 20, 30, ?", opciones: ["40", "42", "44", "36"], correcta: 1, check: { seq: [2, 6, 12, 20, 30] }, explica: "Las diferencias son +4, +6, +8, +10… la siguiente es +12." },
      { pregunta: "Continúa la secuencia:", visual: "3, 6, 12, 24, ?", opciones: ["36", "48", "30", "42"], correcta: 1, check: { seq: [3, 6, 12, 24] }, explica: "Cada número es el doble del anterior." },
      { pregunta: "Continúa la secuencia:", visual: "5, 10, 20, 40, ?", opciones: ["60", "70", "80", "90"], correcta: 2, check: { seq: [5, 10, 20, 40] }, explica: "Cada número es el doble del anterior." }
    ] }
  },
  {
    slug: "logica-familias-y-edades", cat: "logica", kind: "opcion_multiple", difficulty: 4, duration: 100, v: 2,
    title: "Lógica: edades, calendarios y trenes",
    excerpt: "Tres problemas que se resuelven razonando, no adivinando.",
    description: "Problemas de deducción con los datos justos: edades, días de la semana y dos trenes que se cruzan. Plantea antes de calcular.",
    solution: "La mayor tiene 20 años (x + 2x = 30 → x = 10). 100 días son 14 semanas y 2 días: de martes a jueves. Los trenes se acercan a 60 + 40 = 100 km/h: 200 ÷ 100 = 2 horas.",
    data: { preguntas: [
      { pregunta: "Dos personas tienen juntas 30 años. Una tiene el doble de edad que la otra. ¿Cuántos años tiene la mayor?", opciones: ["15", "18", "20", "22"], correcta: 2, check: { edades: { k: 2, S: 30, m: 0, ask: "mayor" } }, explica: "x + 2x = 30 → x = 10. La mayor tiene 20." },
      { pregunta: "Si hoy es martes, ¿qué día de la semana será dentro de 100 días?", opciones: ["Miércoles", "Jueves", "Viernes", "Sábado"], correcta: 1, check: { dias: { start: 1, n: 100, past: false } }, explica: "100 = 14 semanas + 2 días. Martes + 2 = jueves." },
      { pregunta: "Dos trenes salen a la vez el uno hacia el otro, separados por 200 km: uno va a 60 km/h y el otro a 40 km/h. ¿Cuántas horas tardan en cruzarse?", opciones: ["1 hora", "1,5 horas", "2 horas", "2,5 horas"], correcta: 2, check: { expr: "200/(60+40)" }, explica: "Se acercan a 100 km/h entre los dos: 200 ÷ 100 = 2 horas." }
    ] }
  },
  {
    slug: "acertijo-pensamiento-lateral", cat: "logica", kind: "opcion_multiple", difficulty: 4, duration: 110, v: 2,
    title: "Acertijos de pensamiento lateral",
    excerpt: "La respuesta parece imposible hasta que la ves.",
    description: "Tres acertijos clásicos de pensamiento lateral. Cada uno tiene una explicación perfectamente lógica que casi nunca es la primera que se te ocurre.",
    solution: "1) Estaba jugando al Monopoly: el «coche» es su ficha y el «hotel», una casilla que no puede pagar. 2) Es bajito: solo alcanza el botón del 8; con el paraguas llega al 12. 3) Tenía hipo y el susto se lo quitó.",
    data: { preguntas: [
      { pregunta: "Un hombre empuja su coche hasta un hotel y, al llegar, sabe que está arruinado. ¿Qué ha pasado?", opciones: ["El coche se averió en la puerta del hotel", "Estaba jugando al Monopoly", "El hotel era suyo y había quebrado", "Había olvidado la cartera"], correcta: 1, explica: "Su ficha es el coche y ha caído en una casilla con hotel que no puede pagar." },
      { pregunta: "Un hombre vive en un piso 12. Cada mañana baja en ascensor. Al volver, sube en ascensor hasta el 8 y el resto andando, salvo los días de lluvia, que sube directo al 12. ¿Por qué?", opciones: ["Quiere hacer ejercicio", "El ascensor falla a partir del 8", "Es bajito y no alcanza el botón del 12", "Visita a un vecino del 8"], correcta: 2, explica: "Solo llega al botón del 8. Los días de lluvia pulsa el 12 con la punta del paraguas." },
      { pregunta: "Un hombre entra en un bar y pide un vaso de agua. El camarero saca una pistola y le apunta. El hombre dice «gracias» y se va tranquilo. ¿Qué ha pasado?", opciones: ["Tenía hipo y el susto se lo quitó", "Eran amigos y era una broma", "Era un ensayo de teatro", "El camarero le confundió con otro"], correcta: 0, explica: "Pidió agua para quitarse el hipo; el susto se lo quitó antes." }
    ] }
  },
  {
    slug: "la-cerilla-primero", cat: "logica", kind: "opcion_multiple", difficulty: 3, duration: 60, v: 2,
    title: "El acertijo de la cerilla y otras trampas",
    excerpt: "Tres preguntas con truco. Lee despacio.",
    description: "Preguntas cortas con trampa: la respuesta está en el propio enunciado, pero la mente salta a la conclusión equivocada.",
    solution: "1) La cerilla: sin encenderla no puedes prender nada más. 2) Pesan lo mismo: un kilo es un kilo. 3) Le quedan 9: «mueren todas menos 9».",
    data: { preguntas: [
      { pregunta: "Entras de noche en una cabaña a oscuras con una sola cerilla. Dentro hay una vela, una lámpara de aceite y una chimenea con leña. ¿Qué enciendes primero?", opciones: ["La vela", "La lámpara de aceite", "La cerilla", "La chimenea"], correcta: 2, explica: "Sin encender antes la cerilla no puedes prender nada." },
      { pregunta: "¿Qué pesa más: un kilo de paja o un kilo de hierro?", opciones: ["El kilo de hierro", "Pesan lo mismo", "El kilo de paja", "Depende del volumen"], correcta: 1, explica: "Los dos pesan un kilo." },
      { pregunta: "Un granjero tiene 17 ovejas. Mueren todas menos 9. ¿Cuántas le quedan?", opciones: ["8", "9", "17", "0"], correcta: 1, explica: "«Todas menos 9» significa que sobreviven 9." }
    ] }
  },
  {
    slug: "deduccion-pura", cat: "logica", kind: "opcion_multiple", difficulty: 3, duration: 90, v: 2,
    title: "Deducción pura",
    excerpt: "Mentiras, etiquetas equivocadas y una carrera. Solo hace falta razonar.",
    description: "Tres problemas de deducción en los que el enunciado contiene toda la información. Descarta lo imposible y lo que queda es la respuesta.",
    solution: "1) Ana: si Luis dijera la verdad, los dos dirían la verdad, y solo uno lo hace. 2) Mezcla: la caja «Mezcla» tiene solo manzanas, así que la caja «Naranjas» (que no puede tener naranjas) tiene la mezcla. 3) Segundo: ocupas el puesto de quien adelantas.",
    data: { preguntas: [
      { pregunta: "Ana dice: «Luis miente». Luis dice: «Ana y yo decimos la verdad». Solo uno de los dos dice la verdad. ¿Quién?", opciones: ["Ana", "Luis", "Los dos", "Ninguno"], correcta: 0, explica: "Si Luis dijera la verdad, los dos la dirían. Por tanto, miente Luis y dice la verdad Ana." },
      { pregunta: "Hay tres cajas: una con manzanas, otra con naranjas y otra con mezcla. Las tres etiquetas están mal puestas. Sacas una fruta de la caja «Mezcla» y es una manzana. ¿Qué hay en la caja con la etiqueta «Naranjas»?", opciones: ["Manzanas", "Naranjas", "Mezcla", "No se puede saber"], correcta: 2, explica: "La caja «Mezcla» no puede tener mezcla: tiene manzanas. La caja «Naranjas» no puede tener naranjas, así que tiene la mezcla." },
      { pregunta: "En una carrera adelantas al que va segundo. ¿En qué posición vas ahora?", opciones: ["Primero", "Segundo", "Tercero", "Depende"], correcta: 1, explica: "Ocupas su puesto: vas segundo." }
    ] }
  },

  /* --------------------------- MATEMÁTICAS -------------------------- */
  {
    slug: "calculo-relampago", cat: "matematicas", kind: "respuesta_texto", difficulty: 2, duration: 55, v: 2,
    title: "Cálculo relámpago",
    excerpt: "Seis operaciones, menos de un minuto. ¿Aguantas el ritmo?",
    description: "Cálculo mental puro: tablas, divisiones, porcentajes y potencias. Escribe solo el número.",
    solution: "56, 12, 33, 20, 32 y 80.",
    data: { preguntas: [
      { pregunta: "7 × 8 = ?", respuesta: 56, check: { expr: "7*8" } },
      { pregunta: "144 ÷ 12 = ?", respuesta: 12, check: { expr: "144/12" } },
      { pregunta: "15 + 27 − 9 = ?", respuesta: 33, check: { expr: "15+27-9" } },
      { pregunta: "¿Cuál es el 25 % de 80?", respuesta: 20, check: { expr: "80*25/100" } },
      { pregunta: "2⁵ = ?", respuesta: 32, check: { expr: "2^5" } },
      { pregunta: "9² − 1 = ?", respuesta: 80, check: { expr: "9^2-1" } }
    ] }
  },
  {
    slug: "trucos-de-calculo-mental", cat: "matematicas", kind: "respuesta_texto", difficulty: 3, duration: 75, v: 2,
    title: "Trucos de cálculo mental",
    excerpt: "Cinco operaciones que tienen atajo. ¿Lo ves?",
    description: "Operaciones que parecen largas pero tienen un atajo: multiplicar por 25, por 99, restar desde 1.000 o dividir entre 0,5.",
    solution: "25 × 16 = 400 (16 × 100 ÷ 4). 99 × 7 = 693 (700 − 7). 1.000 − 386 = 614. 15 × 15 = 225. 48 ÷ 0,5 = 96 (dividir entre 0,5 es multiplicar por 2).",
    data: { preguntas: [
      { pregunta: "25 × 16 = ?", respuesta: 400, check: { expr: "25*16" }, explica: "16 × 100 ÷ 4 = 400." },
      { pregunta: "99 × 7 = ?", respuesta: 693, check: { expr: "99*7" }, explica: "100 × 7 − 7 = 693." },
      { pregunta: "1.000 − 386 = ?", respuesta: 614, check: { expr: "1000-386" } },
      { pregunta: "15 × 15 = ?", respuesta: 225, check: { expr: "15*15" }, explica: "Truco de los acabados en 5: 1 × 2 = 2, y se añade 25 → 225." },
      { pregunta: "48 ÷ 0,5 = ?", respuesta: 96, check: { expr: "48/0.5" }, explica: "Dividir entre 0,5 es lo mismo que multiplicar por 2." }
    ] }
  },
  {
    slug: "porcentajes-y-rebajas", cat: "matematicas", kind: "opcion_multiple", difficulty: 3, duration: 80, v: 1,
    title: "Porcentajes y rebajas",
    excerpt: "Descuentos, subidas y precios por kilo. Las cuentas de todos los días.",
    description: "Porcentajes de la vida real: rebajas, subidas que no se compensan y reglas de tres. Sin calculadora.",
    solution: "1) 40 € − 25 % = 30 €. 2) 1,10 × 0,90 = 0,99: queda un 1 % más barato. 3) 4,50 € ÷ 3 = 1,50 € el kilo; 5 kg = 7,50 €. 4) Son iguales: 30 % de 70 = 21 y 70 % de 30 = 21.",
    data: { preguntas: [
      { pregunta: "Una camiseta cuesta 40 €. Con un 25 % de descuento, ¿cuánto pagas?", opciones: ["32 €", "30 €", "35 €", "15 €"], correcta: 1, check: { expr: "40*0.75" }, explica: "El 25 % de 40 es 10: pagas 30 €." },
      { pregunta: "Un precio sube un 10 % y después baja un 10 %. Comparado con el precio inicial, ¿cómo queda?", opciones: ["Igual que al principio", "Un 1 % más caro", "Un 1 % más barato", "Un 10 % más barato"], correcta: 2, explica: "1,10 × 0,90 = 0,99: un 1 % por debajo." },
      { pregunta: "Si 3 kg de manzanas cuestan 4,50 €, ¿cuánto cuestan 5 kg?", opciones: ["6,00 €", "7,00 €", "9,00 €", "7,50 €"], correcta: 3, check: { expr: "4.5/3*5" }, explica: "1,50 € el kilo × 5 = 7,50 €." },
      { pregunta: "¿Qué es mayor: el 30 % de 70 o el 70 % de 30?", opciones: ["Son iguales", "El 30 % de 70", "El 70 % de 30", "Depende del redondeo"], correcta: 0, explica: "0,3 × 70 = 21 y 0,7 × 30 = 21." }
    ] }
  },
  {
    slug: "problemas-con-trampa", cat: "matematicas", kind: "opcion_multiple", difficulty: 3, duration: 75, v: 1,
    title: "Tres problemas con trampa",
    excerpt: "La primera respuesta que se te ocurre es incorrecta. Las tres veces.",
    description: "Tres problemas famosos porque casi todo el mundo falla el primer intento: un bate y una pelota, cinco máquinas y un nenúfar que crece.",
    solution: "1) La pelota cuesta 0,05 €: 0,05 + 1,05 = 1,10. 2) 5 minutos: cada máquina hace una pieza en 5 minutos. 3) 47 días: si dobla su tamaño cada día, la víspera de cubrir el lago cubría la mitad.",
    data: { preguntas: [
      { pregunta: "Un bate y una pelota cuestan 1,10 € en total. El bate cuesta 1 € más que la pelota. ¿Cuánto cuesta la pelota?", opciones: ["0,10 €", "0,05 €", "0,01 €", "0,15 €"], correcta: 1, check: { expr: "(1.10-1)/2" }, explica: "Si la pelota costara 0,10 €, el bate costaría 1,10 € y el total, 1,20 €." },
      { pregunta: "5 máquinas tardan 5 minutos en hacer 5 piezas. ¿Cuánto tardan 100 máquinas en hacer 100 piezas?", opciones: ["100 minutos", "20 minutos", "5 minutos", "1 minuto"], correcta: 2, explica: "Cada máquina tarda 5 minutos por pieza, trabajen las que trabajen." },
      { pregunta: "Un nenúfar dobla su tamaño cada día. Si tarda 48 días en cubrir el lago entero, ¿cuántos días tarda en cubrir la mitad?", opciones: ["24", "36", "46", "47"], correcta: 3, check: { expr: "48-1" }, explica: "Un día antes de cubrirlo entero, cubría la mitad." }
    ] }
  },
  {
    slug: "sigue-la-logica-numerica", cat: "matematicas", kind: "secuencia", difficulty: 3, duration: 55, v: 2,
    title: "Números: sigue la serie",
    excerpt: "Dos series, dos patrones distintos. ¿Los ves?",
    description: "Series numéricas de dificultad media. Una se divide, otra se suma a sí misma.",
    solution: "Primera serie: cada número es la mitad del anterior → 6,25. Segunda: cada número es la suma de los dos anteriores → 21.",
    data: { preguntas: [
      { pregunta: "Continúa la serie:", visual: "100 → 50 → 25 → 12,5 → ?", opciones: ["6,25", "6", "7,5", "5"], correcta: 0, check: { seq: [100, 50, 25, 12.5] }, explica: "Se divide entre 2 cada vez." },
      { pregunta: "Continúa la serie:", visual: "2 → 3 → 5 → 8 → 13 → ?", opciones: ["18", "20", "21", "19"], correcta: 2, check: { seq: [2, 3, 5, 8, 13] }, explica: "Cada número es la suma de los dos anteriores: 8 + 13 = 21." }
    ] }
  },

  /* ----------------------------- PALABRAS ---------------------------- */
  {
    slug: "palabra-desordenada-naturaleza", cat: "palabras", kind: "respuesta_texto", difficulty: 2, duration: 60, v: 2,
    title: "Palabra desordenada: naturaleza",
    excerpt: "Reordena las letras y descubre la palabra escondida.",
    description: "Cuatro anagramas de la naturaleza, de menos a más. Los acentos y las mayúsculas no cuentan.",
    solution: "ÁRBOL (también valen LABOR y LOBAR), SOL (también LOS), NUBE y MAR.",
    data: { preguntas: [
      { pregunta: "Reordena estas letras para formar una palabra:", visual: "R O B L A", respuesta: "árbol", acepta: ["labor", "lobar"], explica: "ÁRBOL (también valen LABOR y LOBAR)." },
      { pregunta: "Reordena estas letras:", visual: "O S L", respuesta: "sol", acepta: ["los"] },
      { pregunta: "Reordena estas letras:", visual: "B U N E", respuesta: "nube", acepta: [] },
      { pregunta: "Reordena estas letras:", visual: "R M A", respuesta: "mar", acepta: [] }
    ] }
  },
  {
    slug: "palabras-encadenadas", cat: "palabras", kind: "opcion_multiple", difficulty: 3, duration: 60, v: 2,
    title: "Palabras encadenadas",
    excerpt: "Cada palabra empieza por la última letra de la anterior.",
    description: "Vocabulario y agilidad: elige la palabra que encaja con la definición y empieza donde terminó la anterior.",
    solution: "SESERA → ASCENDER → ROJO: cada palabra empieza por la última letra de la anterior.",
    data: { preguntas: [
      { pregunta: "Empieza por S y es una forma coloquial de llamar a la cabeza o al juicio.", opciones: ["Sombrero", "Sesera", "Sótano", "Saliva"], correcta: 1 },
      { pregunta: "Empieza por la última letra de SESERA y significa «subir».", opciones: ["Avanzar", "Apagar", "Ascender", "Atrapar"], correcta: 2 },
      { pregunta: "Empieza por la última letra de ASCENDER y es el color de la sangre.", opciones: ["Rojo", "Rosa", "Rubio", "Ruido"], correcta: 0 }
    ] }
  },
  {
    slug: "letra-que-falta", cat: "palabras", kind: "opcion_multiple", difficulty: 2, duration: 50, v: 1,
    title: "La letra que falta",
    excerpt: "Cinco palabras con un hueco. Solo una letra encaja.",
    description: "Completa cada palabra con la letra que falta. Ojo con las que se suelen escribir mal.",
    solution: "MARIPOSA, BIBLIOTECA, TORMENTA, HORIZONTE y CALENDARIO.",
    data: { preguntas: [
      { pregunta: "¿Qué letra falta?", visual: "MA _ IPOSA", opciones: ["L", "R", "T", "N"], correcta: 1, check: { fill: "MA_IPOSA", word: "MARIPOSA" } },
      { pregunta: "¿Qué letra falta?", visual: "BIB _ IOTECA", opciones: ["L", "R", "T", "N"], correcta: 0, check: { fill: "BIB_IOTECA", word: "BIBLIOTECA" } },
      { pregunta: "¿Qué letra falta?", visual: "TOR _ ENTA", opciones: ["R", "P", "M", "B"], correcta: 2, check: { fill: "TOR_ENTA", word: "TORMENTA" } },
      { pregunta: "¿Qué letra falta?", visual: "HORI _ ONTE", opciones: ["S", "C", "G", "Z"], correcta: 3, check: { fill: "HORI_ONTE", word: "HORIZONTE" } },
      { pregunta: "¿Qué letra falta?", visual: "CALEN _ ARIO", opciones: ["T", "D", "B", "R"], correcta: 1, check: { fill: "CALEN_ARIO", word: "CALENDARIO" } }
    ] }
  },
  {
    slug: "duelo-de-parejas-rapidas", cat: "palabras", kind: "emparejar", difficulty: 2, duration: 45, v: 2,
    title: "Parejas que siempre van juntas",
    excerpt: "Palabras que nunca van solas. Únelas antes de que se te olviden.",
    description: "Parejas de palabras que en español siempre aparecen juntas. Ideal para retar a alguien: gana quien las une más rápido.",
    solution: "Sal y pimienta, día y noche, arriba y abajo, blanco y negro, ida y vuelta, pregunta y respuesta.",
    data: { parejas: [{ a: "Sal", b: "Pimienta" }, { a: "Día", b: "Noche" }, { a: "Arriba", b: "Abajo" }, { a: "Blanco", b: "Negro" }, { a: "Ida", b: "Vuelta" }, { a: "Pregunta", b: "Respuesta" }] }
  },
  {
    slug: "sinonimos-y-antonimos", cat: "palabras", kind: "emparejar", difficulty: 2, duration: 45, v: 2,
    title: "Sinónimos que se buscan",
    excerpt: "Cada palabra tiene su pareja de significado. Encuéntrala.",
    description: "Vocabulario básico: une cada palabra con su sinónimo.",
    solution: "Feliz – contento, veloz – rápido, triste – apenado, grande – enorme.",
    data: { parejas: [{ a: "Feliz", b: "Contento" }, { a: "Veloz", b: "Rápido" }, { a: "Triste", b: "Apenado" }, { a: "Grande", b: "Enorme" }] }
  },

  /* ------------------------------ MEMORIA ---------------------------- */
  {
    slug: "secuencia-colores", cat: "memoria", kind: "memoria", difficulty: 2, duration: 60, v: 1,
    title: "Secuencia de colores",
    excerpt: "Dos rondas: 4 colores y luego 6. ¿Hasta dónde llegas?",
    description: "Memoriza una secuencia de colores y repítela en el mismo orden. Cada partida es distinta; en un duelo, tu amigo recibe la misma que tú.",
    solution: "La secuencia cambia en cada partida. Truco: nombra los colores en voz baja en grupos de dos o tres.",
    data: { preguntas: [
      { pregunta: "Memoriza estos 4 colores.", pool: ["🔴", "🟠", "🟡", "🟢", "🔵", "🟣", "🟤", "⚫"], n: 4, mostrar_ms: 3500 },
      { pregunta: "Ahora, 6 colores.", pool: ["🔴", "🟠", "🟡", "🟢", "🔵", "🟣", "🟤", "⚫"], n: 6, mostrar_ms: 5000 }
    ] }
  },
  {
    slug: "memoria-secuencia-simbolos", cat: "memoria", kind: "memoria", difficulty: 3, duration: 60, v: 2,
    title: "La secuencia de símbolos",
    excerpt: "Cinco símbolos, cuatro segundos y medio. Repite el orden exacto.",
    description: "Memoriza el orden de los símbolos antes de que desaparezcan y repítelo tocando en el mismo orden.",
    solution: "La secuencia cambia en cada partida. Truco: inventa una historia con los símbolos.",
    data: { preguntas: [{ pregunta: "Memoriza el orden de estos símbolos.", pool: ["⭐", "🔺", "🔵", "⬛", "❤️", "🌙", "🍀", "⚡"], n: 5, mostrar_ms: 4500 }] }
  },
  {
    slug: "memoriza-la-ruta", cat: "memoria", kind: "memoria", difficulty: 3, duration: 60, v: 2,
    title: "Memoriza la ruta",
    excerpt: "Cinco paradas de un viaje. ¿Recuerdas en qué orden?",
    description: "Memoriza el orden de las paradas de una ruta (montaña, mar, desierto…) y repítelo.",
    solution: "La ruta cambia en cada partida. Truco: imagina que haces el viaje de verdad.",
    data: { preguntas: [{ pregunta: "Memoriza el orden de esta ruta.", pool: ["🧭", "🌊", "⛰️", "🌳", "🏜️", "🏝️", "🌋", "🏕️"], n: 5, mostrar_ms: 5000 }] }
  },
  {
    slug: "memoriza-cifras", cat: "memoria", kind: "memoria", difficulty: 4, duration: 60, v: 1,
    title: "Siete cifras",
    excerpt: "Un número de 7 cifras aparece unos segundos. Repítelo.",
    description: "Como recordar un número de teléfono sin apuntarlo: siete cifras distintas durante unos segundos.",
    solution: "Las cifras cambian en cada partida. Truco: agrúpalas como un teléfono (3 + 2 + 2).",
    data: { preguntas: [{ pregunta: "Memoriza estas 7 cifras en orden.", pool: ["1", "2", "3", "4", "5", "6", "7", "8", "9"], n: 7, mostrar_ms: 4500 }] }
  },

  /* ------------------------------ TRIVIA ----------------------------- */
  {
    slug: "trivia-capitales-mundo", cat: "trivia", topic: "geografia", kind: "opcion_multiple", difficulty: 2, duration: 65, v: 2,
    title: "Capitales que casi todo el mundo confunde",
    excerpt: "Cinco países cuya capital no es su ciudad más famosa.",
    description: "Capitales que se confunden con la ciudad más grande o más conocida del país. Un clásico de la cultura general.",
    solution: "Canberra (no Sídney), Ottawa (no Toronto), Brasilia (no Río de Janeiro), Ankara (no Estambul) y Rabat (no Casablanca).",
    data: { preguntas: [
      { pregunta: "¿Cuál es la capital de Australia?", opciones: ["Sídney", "Canberra", "Melbourne", "Perth"], correcta: 1 },
      { pregunta: "¿Cuál es la capital de Canadá?", opciones: ["Toronto", "Vancouver", "Ottawa", "Montreal"], correcta: 2 },
      { pregunta: "¿Cuál es la capital de Brasil?", opciones: ["Río de Janeiro", "São Paulo", "Salvador", "Brasilia"], correcta: 3 },
      { pregunta: "¿Cuál es la capital de Turquía?", opciones: ["Estambul", "Ankara", "Esmirna", "Bursa"], correcta: 1 },
      { pregunta: "¿Cuál es la capital de Marruecos?", opciones: ["Rabat", "Casablanca", "Marrakech", "Fez"], correcta: 0 }
    ] }
  },
  {
    slug: "planeta-en-records", cat: "trivia", topic: "geografia", kind: "opcion_multiple", difficulty: 2, duration: 55, v: 1,
    title: "El planeta en récords",
    excerpt: "El océano más grande, el país más extenso y la montaña más alta.",
    description: "Cuatro preguntas de geografía física con datos estables: océanos, países, desiertos y montañas.",
    solution: "El Pacífico es el océano más grande, Rusia el país más extenso, el Sáhara está en África y el Everest es la montaña más alta sobre el nivel del mar.",
    data: { preguntas: [
      { pregunta: "¿Cuál es el océano más grande del planeta?", opciones: ["Atlántico", "Índico", "Pacífico", "Ártico"], correcta: 2 },
      { pregunta: "¿Cuál es el país más extenso del mundo?", opciones: ["Rusia", "Canadá", "China", "Estados Unidos"], correcta: 0 },
      { pregunta: "¿En qué continente está el desierto del Sáhara?", opciones: ["Asia", "África", "Oceanía", "América"], correcta: 1 },
      { pregunta: "¿Cuál es la montaña más alta del mundo sobre el nivel del mar?", opciones: ["K2", "Aconcagua", "Kilimanjaro", "Everest"], correcta: 3 }
    ] }
  },
  {
    slug: "verdad-o-mentira-datos-curiosos", cat: "trivia", topic: "ciencia", kind: "verdadero_falso", difficulty: 1, duration: 40, v: 2,
    title: "¿Verdad o mentira? Datos curiosos",
    excerpt: "Cinco afirmaciones de ciencia. Solo algunas son ciertas.",
    description: "Datos de naturaleza y ciencia, algunos muy repetidos y falsos. Eliges verdadero o falso: no hay término medio.",
    solution: "Son verdaderas la 1.ª, la 3.ª y la 5.ª. Los pulpos tienen tres corazones y la Gran Muralla China no se ve a simple vista desde la Luna.",
    data: { preguntas: [
      { pregunta: "El corazón de un colibrí puede latir más de 1.000 veces por minuto.", respuesta: true },
      { pregunta: "Los pulpos tienen un solo corazón.", respuesta: false, explica: "Tienen tres." },
      { pregunta: "El agua de mar contiene oro en cantidades muy pequeñas.", respuesta: true },
      { pregunta: "La Gran Muralla China se ve a simple vista desde la Luna.", respuesta: false, explica: "Es un mito: es demasiado estrecha." },
      { pregunta: "El sonido viaja más rápido en el agua que en el aire.", respuesta: true }
    ] }
  },
  {
    slug: "historia-fechas-clave", cat: "trivia", topic: "historia", kind: "opcion_multiple", difficulty: 3, duration: 65, v: 2,
    title: "Historia: cuatro fechas clave",
    excerpt: "Cuatro años que cambiaron el mundo. ¿Los tienes?",
    description: "Fechas de la historia universal ampliamente documentadas: la Luna, el Muro de Berlín, la Segunda Guerra Mundial y la Revolución francesa.",
    solution: "1969 (Apolo 11), 1989 (caída del Muro de Berlín), 1945 (fin de la Segunda Guerra Mundial) y 1789 (Revolución francesa).",
    data: { preguntas: [
      { pregunta: "¿En qué año llegó el ser humano a la Luna por primera vez?", opciones: ["1965", "1969", "1972", "1958"], correcta: 1 },
      { pregunta: "¿En qué año cayó el Muro de Berlín?", opciones: ["1987", "1991", "1989", "1985"], correcta: 2 },
      { pregunta: "¿En qué año terminó la Segunda Guerra Mundial?", opciones: ["1943", "1944", "1946", "1945"], correcta: 3 },
      { pregunta: "¿En qué año comenzó la Revolución francesa?", opciones: ["1789", "1799", "1804", "1776"], correcta: 0 }
    ] }
  },
  {
    slug: "inventos-que-cambiaron-el-mundo", cat: "trivia", topic: "historia", kind: "opcion_multiple", difficulty: 2, duration: 55, v: 2,
    title: "Inventos que cambiaron el mundo",
    excerpt: "Tres inventos, tres momentos que marcaron un antes y un después.",
    description: "Historia de la tecnología: quién, cuándo y qué se inventó.",
    solution: "Edison patentó en 1880 una bombilla incandescente de larga duración, Gutenberg desarrolló la imprenta de tipos móviles en el siglo XV y los hermanos Wright hicieron volar el primer avión propulsado y controlado.",
    data: { preguntas: [
      { pregunta: "¿Qué inventor estadounidense patentó en 1880 una bombilla incandescente de larga duración?", opciones: ["Tesla", "Edison", "Bell", "Franklin"], correcta: 1 },
      { pregunta: "¿En qué siglo desarrolló Gutenberg la imprenta de tipos móviles?", opciones: ["Siglo XIII", "Siglo XVII", "Siglo XV", "Siglo XIX"], correcta: 2 },
      { pregunta: "¿Con qué invento se asocia a los hermanos Wright?", opciones: ["El avión", "El automóvil", "El teléfono", "La radio"], correcta: 0 }
    ] }
  },
  {
    slug: "museos-y-genios", cat: "trivia", topic: "arte", kind: "opcion_multiple", difficulty: 2, duration: 65, v: 2,
    title: "Museos, libros y premios",
    excerpt: "Arte, libros y premios que todo el mundo menciona alguna vez.",
    description: "Cultura general de pintura, literatura y premios internacionales.",
    solution: "La Mona Lisa está en el Louvre, «La noche estrellada» es de Van Gogh, «Cien años de soledad» se escribió en español y no existe un Nobel de Matemáticas.",
    data: { preguntas: [
      { pregunta: "¿Qué museo de París alberga la Mona Lisa?", opciones: ["Museo de Orsay", "El Louvre", "Centro Pompidou", "Petit Palais"], correcta: 1 },
      { pregunta: "¿Quién pintó «La noche estrellada»?", opciones: ["Monet", "Dalí", "Van Gogh", "Picasso"], correcta: 2 },
      { pregunta: "¿En qué idioma se escribió originalmente «Cien años de soledad»?", opciones: ["Español", "Portugués", "Inglés", "Italiano"], correcta: 0 },
      { pregunta: "¿Cuál de estos premios Nobel NO existe?", opciones: ["Física", "Literatura", "Paz", "Matemáticas"], correcta: 3 }
    ] }
  },
  {
    slug: "arte-y-autores", cat: "trivia", topic: "arte", kind: "emparejar", difficulty: 3, duration: 50, v: 2,
    title: "Corrientes artísticas y sus pintores",
    excerpt: "Une cada estilo con su pintor más representativo.",
    description: "Historia del arte: cuatro corrientes y sus máximos exponentes.",
    solution: "Cubismo – Picasso, surrealismo – Dalí, impresionismo – Monet, fauvismo – Matisse.",
    data: { parejas: [{ a: "Cubismo", b: "Picasso" }, { a: "Surrealismo", b: "Dalí" }, { a: "Impresionismo", b: "Monet" }, { a: "Fauvismo", b: "Matisse" }] }
  },
  {
    slug: "empareja-cine-generos", cat: "trivia", topic: "cine", kind: "emparejar", difficulty: 3, duration: 75, v: 2,
    title: "Películas y géneros",
    excerpt: "Une cada película con su género.",
    description: "Cultura de cine: toca una película y después su género para emparejarlos.",
    solution: "El laberinto del fauno – fantasía, Una noche en la ópera – comedia, Cantando bajo la lluvia – musical, El resplandor – terror, Origen – ciencia ficción, Toy Story – animación.",
    data: { parejas: [{ a: "El laberinto del fauno", b: "Fantasía" }, { a: "Una noche en la ópera", b: "Comedia" }, { a: "Cantando bajo la lluvia", b: "Musical" }, { a: "El resplandor", b: "Terror" }, { a: "Origen", b: "Ciencia ficción" }, { a: "Toy Story", b: "Animación" }] }
  },
  {
    slug: "cine-verdad-o-mentira", cat: "trivia", topic: "cine", kind: "verdadero_falso", difficulty: 1, duration: 40, v: 2,
    title: "Cine: ¿verdad o mentira?",
    excerpt: "Cuatro afirmaciones sobre el mundo del cine.",
    description: "Datos verificables sobre cine y los premios Óscar.",
    solution: "Verdadero, verdadero, falso y verdadero: el cine sonoro llegó después del mudo, los Óscar los entrega la Academia de Hollywood, no todas las ganadoras son en blanco y negro y «blockbuster» designa un gran éxito comercial.",
    data: { preguntas: [
      { pregunta: "El cine sonoro llegó después que el cine mudo.", respuesta: true },
      { pregunta: "Los premios Óscar los entrega la Academia de Hollywood.", respuesta: true },
      { pregunta: "Todas las películas ganadoras del Óscar a mejor película están en blanco y negro.", respuesta: false },
      { pregunta: "El término «blockbuster» se usa para películas de gran éxito comercial.", respuesta: true }
    ] }
  },
  {
    slug: "musica-ritmo-y-memoria", cat: "trivia", topic: "musica", kind: "opcion_multiple", difficulty: 2, duration: 55, v: 2,
    title: "Música: lo básico",
    excerpt: "Notas, teclas, instrumentos y un compositor sordo.",
    description: "Teoría musical básica e instrumentos. No hace falta oído, solo memoria.",
    solution: "7 notas (do, re, mi, fa, sol, la, si), el piano tiene 88 teclas, el oboe es de viento y la Novena Sinfonía es de Beethoven.",
    data: { preguntas: [
      { pregunta: "¿Cuántas notas tiene la escala musical básica (do, re, mi…)?", opciones: ["5", "6", "7", "8"], correcta: 2 },
      { pregunta: "¿Qué instrumento tiene normalmente 88 teclas?", opciones: ["Órgano", "Piano", "Acordeón", "Clave"], correcta: 1 },
      { pregunta: "¿Cuál de estos instrumentos NO es de cuerda?", opciones: ["Violín", "Guitarra", "Contrabajo", "Oboe"], correcta: 3 },
      { pregunta: "¿Qué compositor, sordo en sus últimos años, escribió la Novena Sinfonía?", opciones: ["Beethoven", "Mozart", "Bach", "Chopin"], correcta: 0 }
    ] }
  },
  {
    slug: "adivina-el-instrumento", cat: "trivia", topic: "musica", kind: "opcion_multiple", difficulty: 2, duration: 55, v: 2,
    title: "Adivina el instrumento",
    excerpt: "Tres descripciones, tres instrumentos. ¿Los tienes?",
    description: "Pistas descriptivas sobre instrumentos musicales. Elige el que encaja.",
    solution: "Contrabajo, conga y oboe (en «Pedro y el lobo», el pato es el oboe).",
    data: { preguntas: [
      { pregunta: "Es el instrumento de cuerda frotada más grande y grave de la orquesta.", opciones: ["Violonchelo", "Contrabajo", "Viola", "Arpa"], correcta: 1 },
      { pregunta: "Instrumento de percusión alto, con forma de barril, que se toca con las manos. Es típico de la música cubana.", opciones: ["Conga", "Bombo", "Triángulo", "Pandereta"], correcta: 0 },
      { pregunta: "Instrumento de viento madera con lengüeta doble. En «Pedro y el lobo», de Prokófiev, representa al pato.", opciones: ["Flauta", "Trompeta", "Oboe", "Saxofón"], correcta: 2 }
    ] }
  },
  {
    slug: "deporte-reglas-y-records", cat: "trivia", topic: "deporte", kind: "opcion_multiple", difficulty: 2, duration: 60, v: 2,
    title: "Deporte: reglas básicas",
    excerpt: "¿Cuánto sabes del reglamento de los deportes más populares?",
    description: "Preguntas de reglamento de baloncesto, tenis y Juegos Olímpicos.",
    solution: "5 jugadores en pista, cada 4 años, 1 punto por tiro libre y 3 sets para ganar a cinco sets.",
    data: { preguntas: [
      { pregunta: "¿Cuántos jugadores tiene un equipo de baloncesto en pista?", opciones: ["4", "5", "6", "7"], correcta: 1 },
      { pregunta: "¿Cada cuántos años se celebran los Juegos Olímpicos de verano?", opciones: ["Cada 2 años", "Cada 3 años", "Cada 4 años", "Cada 5 años"], correcta: 2 },
      { pregunta: "¿Cuántos puntos vale un tiro libre en baloncesto?", opciones: ["1", "2", "3", "Depende de la distancia"], correcta: 0 },
      { pregunta: "En un partido de tenis a cinco sets, ¿cuántos sets hay que ganar?", opciones: ["2", "4", "5", "3"], correcta: 3 }
    ] }
  },

  /* ---------------------------- ESTIMACIÓN --------------------------- */
  {
    slug: "cuestion-de-numeros-estima", cat: "estimacion", kind: "estimar", difficulty: 3, duration: 75, v: 2,
    title: "A ojo: el cuerpo y la Luna",
    excerpt: "No hace falta acertar exacto: basta con acercarse.",
    description: "Escribe tu estimación. Cuenta como acierto si caes dentro del margen indicado en cada pregunta.",
    solution: "El cuerpo humano adulto tiene 206 huesos, la Luna está a unos 384.400 km de media y un adulto tiene unos 5 litros de sangre.",
    data: { preguntas: [
      { pregunta: "¿Cuántos huesos tiene el cuerpo humano adulto?", respuesta: 206, tolerancia: 10 },
      { pregunta: "¿A qué distancia media está la Luna de la Tierra, en kilómetros?", respuesta: 384400, tolerancia: 20000 },
      { pregunta: "¿Cuántos litros de sangre tiene, de media, una persona adulta?", respuesta: 5, tolerancia: 1 }
    ] }
  },
  {
    slug: "estima-el-record", cat: "estimacion", kind: "estimar", difficulty: 2, duration: 60, v: 2,
    title: "Atletismo a ojo",
    excerpt: "Un récord histórico, una maratón y una pista. Acércate.",
    description: "Datos de atletismo con fecha y medida exactas. Acércate lo más que puedas.",
    solution: "Usain Bolt corrió los 100 m en 9,58 s en Berlín (2009), una maratón mide 42,195 km y una vuelta a la pista por la calle 1 son 400 m.",
    data: { preguntas: [
      { pregunta: "¿En cuántos segundos corrió Usain Bolt los 100 metros en el Mundial de Berlín de 2009?", respuesta: 9.58, tolerancia: 0.3 },
      { pregunta: "¿Cuántos kilómetros mide una maratón?", respuesta: 42.195, tolerancia: 1 },
      { pregunta: "¿Cuántos metros mide una vuelta a una pista de atletismo al aire libre por la calle 1?", respuesta: 400, tolerancia: 20 }
    ] }
  },
  {
    slug: "estima-el-planeta", cat: "estimacion", kind: "estimar", difficulty: 3, duration: 75, v: 1,
    title: "A ojo: el planeta Tierra",
    excerpt: "El Everest, el ecuador y la luz del Sol.",
    description: "Tres medidas del planeta. No hace falta exactitud: vale con caer dentro del margen.",
    solution: "El Everest mide unos 8.849 m, la circunferencia de la Tierra en el ecuador es de unos 40.075 km y la luz del Sol tarda unos 8,3 minutos en llegar.",
    data: { preguntas: [
      { pregunta: "¿Cuántos metros mide de alto el Everest?", respuesta: 8849, tolerancia: 150 },
      { pregunta: "¿Cuántos kilómetros mide la circunferencia de la Tierra en el ecuador?", respuesta: 40075, tolerancia: 2000 },
      { pregunta: "¿Cuántos minutos tarda la luz del Sol en llegar a la Tierra?", respuesta: 8.3, tolerancia: 1 }
    ] }
  },
  {
    slug: "estima-el-tiempo", cat: "estimacion", kind: "estimar", difficulty: 3, duration: 80, v: 1,
    title: "Cuentas de tiempo a ojo",
    excerpt: "Segundos de un día, horas de un año. Se puede calcular… o estimar.",
    description: "Tres preguntas sobre el tiempo que se pueden calcular de cabeza. Si no te da tiempo, estima.",
    solution: "Un día tiene 86.400 segundos (24 × 60 × 60), un año normal tiene 8.760 horas (365 × 24) y 80 años son unos 29.220 días (contando los bisiestos).",
    data: { preguntas: [
      { pregunta: "¿Cuántos segundos tiene un día?", respuesta: 86400, tolerancia: 3000, check: { expr: "24*60*60" } },
      { pregunta: "¿Cuántas horas tiene un año que no es bisiesto?", respuesta: 8760, tolerancia: 400, check: { expr: "365*24" } },
      { pregunta: "¿Cuántos días, aproximadamente, son 80 años?", respuesta: 29220, tolerancia: 1500, check: { expr: "80*365.25" } }
    ] }
  },

  /* ---------------------------- OBSERVACIÓN -------------------------- */
  {
    slug: "patron-de-figuras", cat: "observacion", kind: "secuencia", difficulty: 2, duration: 45, v: 2,
    title: "El patrón de figuras",
    excerpt: "Sigue el ritmo de la serie y adivina qué viene después.",
    description: "Reconocimiento de patrones visuales: cada serie repite un bloque. Encuéntralo y elige la figura que sigue.",
    solution: "1) Se repite 🔺🔺🔵 → 🔵. 2) Se repite ⭐🌙🌙 → 🌙. 3) Se repite 🔴🟡🔵🟢 → 🟢.",
    data: { preguntas: [
      { pregunta: "¿Qué figura sigue?", visual: "🔺 🔺 🔵 🔺 🔺 🔵 🔺 🔺 ?", opciones: ["🔺", "🔵", "⬛", "⭐"], correcta: 1, emoji: true, check: { pattern: true } },
      { pregunta: "¿Qué figura sigue?", visual: "⭐ 🌙 🌙 ⭐ 🌙 🌙 ⭐ 🌙 ?", opciones: ["⭐", "🔵", "🌙", "🍀"], correcta: 2, emoji: true, check: { pattern: true } },
      { pregunta: "¿Qué figura sigue?", visual: "🔴 🟡 🔵 🟢 🔴 🟡 🔵 🟢 🔴 🟡 🔵 ?", opciones: ["🔴", "🟡", "🟣", "🟢"], correcta: 3, emoji: true, check: { pattern: true } }
    ] }
  },
  {
    slug: "cuenta-rapido", cat: "observacion", kind: "opcion_multiple", difficulty: 2, duration: 50, v: 1,
    title: "Cuenta rápido",
    excerpt: "Tres filas de símbolos. ¿Cuántas veces aparece cada uno?",
    description: "Observación pura: cuenta cuántas veces aparece el símbolo que te pedimos. No hay prisa: contar bien puntúa más que contar rápido.",
    solution: "6 triángulos, 5 manzanas y 7 lunas.",
    data: { preguntas: [
      { pregunta: "¿Cuántas veces aparece 🔺?", visual: "🔺 🔵 🔺 🔺 ⬛ 🔵 🔺 ⬛ 🔺 🔵 🔺 🔵", opciones: ["5", "6", "7", "8"], correcta: 1, check: { count: "🔺" } },
      { pregunta: "¿Cuántas veces aparece 🍎?", visual: "🍎 🍋 🍎 🍇 🍋 🍎 🍋 🍋 🍇 🍎 🍋 🍇 🍋 🍎", opciones: ["4", "6", "5", "7"], correcta: 2, check: { count: "🍎" } },
      { pregunta: "¿Cuántas veces aparece 🌙?", visual: "⭐ 🌙 ⭐ ⭐ 🌙 ⭐ 🌙 🌙 ⭐ 🌙 ⭐ ⭐ 🌙 ⭐ 🌙 ⭐", opciones: ["6", "7", "8", "9"], correcta: 1, check: { count: "🌙" } }
    ] }
  },
  {
    slug: "encuentra-el-intruso", cat: "observacion", kind: "opcion_multiple", difficulty: 2, duration: 45, v: 1,
    title: "Encuentra el intruso",
    excerpt: "Todos tienen algo en común… menos uno.",
    description: "En cada grupo hay un elemento que no encaja. Descubre qué tienen en común los demás.",
    solution: "1) 🥕 es una verdura; el resto, frutas. 2) 🐟 no es un mamífero. 3) ⛵ no circula por carretera. 4) 🎸 no es un balón.",
    data: { preguntas: [
      { pregunta: "¿Cuál no pertenece al grupo?", opciones: ["🍎", "🍌", "🥕", "🍇", "🍓"], correcta: 2, emoji: true, explica: "La zanahoria es una verdura; el resto son frutas." },
      { pregunta: "¿Cuál no pertenece al grupo?", opciones: ["🐶", "🐱", "🦊", "🐻", "🐟"], correcta: 4, emoji: true, explica: "El pez no es un mamífero." },
      { pregunta: "¿Cuál no pertenece al grupo?", opciones: ["🚗", "⛵", "🚌", "🚕", "🚓"], correcta: 1, emoji: true, explica: "El velero no circula por carretera." },
      { pregunta: "¿Cuál no pertenece al grupo?", opciones: ["🎸", "⚽", "🏀", "🎾", "🏐"], correcta: 0, emoji: true, explica: "La guitarra no es un balón." }
    ] }
  },
  {
    slug: "letras-con-patron", cat: "observacion", kind: "secuencia", difficulty: 3, duration: 55, v: 1,
    title: "Letras con patrón",
    excerpt: "Tres series de letras. Cada una salta de una forma distinta.",
    description: "Series de letras del abecedario con saltos regulares. Cuenta los huecos y encuentra la siguiente.",
    solution: "1) Salta una letra: A, C, E, G → I. 2) Los saltos crecen: +1, +2, +3, +4 → K. 3) Hacia atrás, saltando una: Z, X, V, T → R.",
    data: { preguntas: [
      { pregunta: "¿Qué letra sigue?", visual: "A, C, E, G, ?", opciones: ["H", "I", "J", "K"], correcta: 1, check: { letters: ["A", "C", "E", "G"] } },
      { pregunta: "¿Qué letra sigue?", visual: "A, B, D, G, ?", opciones: ["J", "I", "K", "L"], correcta: 2, check: { letters: ["A", "B", "D", "G"] } },
      { pregunta: "¿Qué letra sigue?", visual: "Z, X, V, T, ?", opciones: ["R", "S", "Q", "P"], correcta: 0, check: { letters: ["Z", "X", "V", "T"] } }
    ] }
  },

  /* ------------------------------ ORDENAR ---------------------------- */
  {
    slug: "observacion-orden-alfabetico", cat: "ordenar", kind: "ordenar", difficulty: 3, duration: 70, v: 2,
    title: "Orden alfabético",
    excerpt: "Seis palabras revueltas. Déjalas en orden alfabético.",
    description: "Atención al detalle: toca dos palabras para intercambiarlas hasta dejarlas en orden alfabético.",
    solution: "cuadro, espejo, lámpara, puerta, reloj, ventana.",
    data: { preguntas: [{ pregunta: "Ordena estas palabras alfabéticamente.", elementos: ["cuadro", "espejo", "lámpara", "puerta", "reloj", "ventana"], check: { alfabetico: true } }] }
  },
  {
    slug: "ordena-de-menor-a-mayor", cat: "ordenar", kind: "ordenar", difficulty: 3, duration: 80, v: 1,
    title: "De menor a mayor",
    excerpt: "Fracciones, decimales y potencias mezclados. Ordénalos.",
    description: "Dos rondas de números escritos de formas distintas. Pásalos a la misma forma de cabeza y ordénalos de menor a mayor.",
    solution: "1) 1/3 (0,33) < 2/5 (0,4) < 0,5 < 0,7 < 3/4 (0,75). 2) 5 < 2³ (8) < 3² (9) < √100 (10) < 2⁴ (16).",
    data: { preguntas: [
      { pregunta: "Ordena de menor a mayor.", elementos: ["1/3", "2/5", "0,5", "0,7", "3/4"], check: { valores: [1 / 3, 0.4, 0.5, 0.7, 0.75] } },
      { pregunta: "Ordena de menor a mayor.", elementos: ["5", "2³", "3²", "√100", "2⁴"], check: { valores: [5, 8, 9, 10, 16] } }
    ] }
  },
  {
    slug: "ordena-el-reino-animal", cat: "ordenar", kind: "ordenar", difficulty: 2, duration: 60, v: 1,
    title: "Ordena el reino animal",
    excerpt: "Por tamaño y por número de patas.",
    description: "Dos rondas: ordena estos animales por tamaño y luego por el número de patas.",
    solution: "1) Hormiga < ratón < gato < caballo < elefante. 2) Serpiente (0) < gallina (2) < perro (4) < hormiga (6) < araña (8).",
    data: { preguntas: [
      { pregunta: "Ordénalos de más pequeño a más grande (un adulto típico).", elementos: ["Hormiga", "Ratón", "Gato", "Caballo", "Elefante"], check: { valores: [0.000005, 0.02, 4, 500, 5000] } },
      { pregunta: "Ordénalos de menos a más patas.", elementos: ["Serpiente", "Gallina", "Perro", "Hormiga", "Araña"], check: { valores: [0, 2, 4, 6, 8] } }
    ] }
  },
  {
    slug: "ordena-lo-absurdo", cat: "ordenar", kind: "ordenar", difficulty: 1, duration: 40, v: 2,
    title: "Ordena la mañana",
    excerpt: "Pon en orden los pasos de una mañana cualquiera.",
    description: "Reto ligero para calentar: toca dos pasos para intercambiarlos hasta dejarlos en orden.",
    solution: "Suena el despertador → te levantas de la cama → sales de casa → llegas al trabajo.",
    data: { preguntas: [{ pregunta: "Pon en orden lo que pasa una mañana de lunes.", elementos: ["Suena el despertador", "Te levantas de la cama", "Sales de casa", "Llegas al trabajo"] }] }
  },

  /* ------------------------ EN GRUPO (no indexado) ------------------- */
  {
    slug: "preguntas-absurdas", cat: "grupo", kind: "opcion_multiple", difficulty: 1, duration: 45, v: 2,
    title: "Preguntas absurdas",
    excerpt: "No hay respuestas correctas. Solo para reírte con tus amigos.",
    description: "Juego de opinión: no hay acierto ni error, así que no da puntos. Sirve para jugar acompañado y comparar lo que elegiría cada uno.",
    solution: "No hay solución: es un juego de opinión.",
    data: { preguntas: [
      { pregunta: "Si pudieras tener un superpoder solo para el desayuno, ¿cuál elegirías?", opciones: ["Teletransporte a la cocina", "Convertir cualquier cosa en tostada", "Leer la mente del camarero", "Nunca quemar el pan"], correcta: 0, libre: true },
      { pregunta: "¿Cuál de estos inventos cambiaría más tu lunes?", opciones: ["Un botón que alarga las horas", "Café que funciona al instante", "Teletransporte al trabajo", "Lunes automático en viernes"], correcta: 0, libre: true },
      { pregunta: "Si tu mascota pudiera hablar una hora al día, ¿qué preferirías que te contara?", opciones: ["Qué piensa de ti de verdad", "Dónde esconde sus cosas", "Qué hace cuando no estás", "Sus quejas sobre la comida"], correcta: 0, libre: true }
    ] }
  },
  {
    slug: "que-preferirias-en-grupo", cat: "grupo", kind: "opcion_multiple", difficulty: 1, duration: 45, v: 2,
    title: "¿Qué preferirías? En grupo",
    excerpt: "Sin respuestas correctas: para comparar con tus amigos.",
    description: "Juego de opinión pensado para jugar acompañado y comentar las respuestas de cada uno. No da puntos.",
    solution: "No hay solución: es un juego de opinión.",
    data: { preguntas: [
      { pregunta: "¿Cuál prefieres para un fin de semana perfecto?", opciones: ["Playa sin plan", "Montaña con ruta", "Ciudad nueva", "Sofá y maratón de series"], correcta: 0, libre: true },
      { pregunta: "¿Qué serías más capaz de hacer por un amigo?", opciones: ["Madrugar para acompañarle", "Prestarle tu ropa favorita", "Cocinarle cada día una semana", "Acompañarle al médico"], correcta: 0, libre: true },
      { pregunta: "Si el grupo tuviera que mudarse de ciudad junto, ¿qué pesaría más?", opciones: ["El clima", "El trabajo disponible", "Estar cerca de la familia", "La vida social"], correcta: 0, libre: true }
    ] }
  }
];

/* =====================================================================
 * Bancos para los generadores. Solo datos estables y verificables.
 * =================================================================== */
var FACT_BANKS = {
  ciencia: [
    ["El corazón de un colibrí puede latir más de 1.000 veces por minuto.", true],
    ["Los pulpos tienen tres corazones.", true],
    ["El agua hierve a menor temperatura en altitudes elevadas.", true],
    ["La luz del Sol tarda unos 8 minutos en llegar a la Tierra.", true],
    ["Los diamantes están hechos de carbono.", true],
    ["El hueso más largo del cuerpo humano es el fémur.", true],
    ["Los tiburones no tienen huesos: su esqueleto es de cartílago.", true],
    ["El Sol es una estrella.", true],
    ["El ser humano solo usa el 10 % de su cerebro.", false],
    ["Los murciélagos son ciegos.", false],
    ["Venus es el planeta más caliente del sistema solar, aunque Mercurio está más cerca del Sol.", true],
    ["El agua y el aceite se mezclan de forma natural.", false],
    ["El oxígeno es el gas más abundante en la atmósfera terrestre.", false],
    ["Los pingüinos son aves, aunque no vuelan.", true],
    ["Las ballenas son peces.", false],
    ["El sonido no puede propagarse en el vacío.", true],
    ["La Luna tiene luz propia.", false],
    ["El ADN tiene forma de doble hélice.", true],
    ["Los rayos nunca caen dos veces en el mismo sitio.", false],
    ["Las plantas producen oxígeno mediante la fotosíntesis.", true]
  ],
  arte: [
    ["El Museo del Louvre está en París.", true],
    ["La Gioconda la pintó Leonardo da Vinci.", true],
    ["El Taj Mahal está en la India.", true],
    ["«Don Quijote de la Mancha» lo escribió Miguel de Cervantes.", true],
    ["«El cascanueces» es un ballet de Chaikovski.", true],
    ["La Torre Eiffel se construyó en el siglo XX.", false],
    ["El alfabeto griego tiene 24 letras.", true],
    ["Shakespeare escribió «Romeo y Julieta».", true],
    ["El Coliseo romano está en Atenas.", false],
    ["Machu Picchu está en Perú.", true],
    ["«Origami» es una palabra japonesa que designa el arte de plegar papel.", true],
    ["Pablo Picasso fue un pintor español.", true],
    ["La ópera nació en Italia.", true],
    ["«El principito» lo escribió Antoine de Saint-Exupéry.", true],
    ["El Museo del Prado está en Barcelona.", false],
    ["Frida Kahlo fue una pintora mexicana.", true],
    ["La Sagrada Familia es obra de Antoni Gaudí.", true]
  ],
  historia: [
    ["La Segunda Guerra Mundial terminó en 1945.", true],
    ["Cristóbal Colón llegó a América en 1492.", true],
    ["El Imperio romano de Occidente cayó en el siglo V.", true],
    ["La Revolución francesa comenzó en 1789.", true],
    ["El Muro de Berlín cayó en 1989.", true],
    ["La Primera Guerra Mundial empezó en 1914.", true],
    ["Las pirámides de Egipto se construyeron después del Imperio romano.", false],
    ["Gandhi lideró un movimiento de resistencia no violenta en la India.", true],
    ["El ser humano llegó a la Luna por primera vez en 1969.", true],
    ["La Guerra Fría enfrentó a Estados Unidos y la Unión Soviética.", true],
    ["El Imperio inca tuvo su centro en el actual Perú.", true],
    ["El Titanic se hundió en 1912.", true],
    ["La imprenta de Gutenberg es anterior a la llegada de Colón a América.", true],
    ["La Revolución francesa fue anterior a la independencia de Estados Unidos.", false],
    ["Cleopatra vivió más cerca en el tiempo de la llegada a la Luna que de la construcción de la Gran Pirámide.", true],
    ["Los vikingos usaban cascos con cuernos en combate.", false]
  ],
  cine: [
    ["El cine sonoro llegó después que el cine mudo.", true],
    ["Los premios Óscar los entrega la Academia de Hollywood.", true],
    ["El término «blockbuster» se usa para películas de gran éxito comercial.", true],
    ["El cine nació a finales del siglo XIX.", true],
    ["Charles Chaplin fue una estrella del cine mudo.", true],
    ["Un cortometraje dura más de dos horas por definición.", false],
    ["Hollywood está en California.", true],
    ["Bollywood es la industria de cine de Nigeria.", false],
    ["Un remake es una nueva versión de una película ya existente.", true],
    ["El festival de Cannes se celebra en Francia.", true],
    ["Los premios Goya son los premios del cine español.", true],
    ["«Psicosis» la dirigió Steven Spielberg.", false],
    ["El festival de San Sebastián se celebra en Italia.", false],
    ["«El padrino» está ambientada en el mundo de la mafia.", true],
    ["Pixar es un estudio de cine de animación.", true],
    ["«Titanic» ganó el Óscar a mejor película.", true],
    ["La saga de Harry Potter empezó como una serie de libros.", true],
    ["Un tráiler es un avance promocional de una película.", true]
  ],
  musica: [
    ["La escala musical básica tiene 7 notas.", true],
    ["El piano es un instrumento de cuerda percutida.", true],
    ["Beethoven siguió componiendo cuando ya estaba sordo.", true],
    ["El violín tiene cuatro cuerdas.", true],
    ["El jazz nació en Europa.", false],
    ["La ópera combina canto, orquesta y teatro.", true],
    ["El reguetón se originó en Escandinavia.", false],
    ["El compás de 4/4 es uno de los más comunes en la música popular.", true],
    ["Mozart fue un compositor del Barroco tardío.", false],
    ["La guitarra eléctrica se popularizó en el siglo XX.", true],
    ["Un coro está formado por un único cantante.", false],
    ["El flamenco es originario de Andalucía.", true],
    ["La trompeta es un instrumento de cuerda.", false],
    ["Un cuarteto de cuerda tiene cuatro músicos.", true]
  ],
  deporte: [
    ["Un partido de fútbol dura 90 minutos reglamentarios.", true],
    ["En baloncesto, un equipo juega con cinco jugadores en pista.", true],
    ["Los Juegos Olímpicos de verano se celebran cada cuatro años.", true],
    ["El tenis se juega solo en individuales, nunca en parejas.", false],
    ["La maratón olímpica mide unos 42 kilómetros.", true],
    ["En el rugby se puede pasar el balón hacia delante con la mano.", false],
    ["El Tour de Francia es una carrera ciclista por etapas.", true],
    ["El voleibol se juega con seis jugadores por equipo en pista.", true],
    ["En golf gana quien más golpes da.", false],
    ["La Fórmula 1 es una competición de motociclismo.", false],
    ["El waterpolo se juega en una piscina.", true],
    ["En ajedrez, la dama puede moverse en diagonal.", true],
    ["Un triatlón combina natación, ciclismo y carrera a pie.", true],
    ["En fútbol, el portero puede coger el balón con la mano en cualquier zona del campo.", false]
  ],
  geografia: [
    ["El Nilo está en África.", true],
    ["El río Amazonas desemboca en el océano Atlántico.", true],
    ["El Everest está en los Andes.", false],
    ["El océano Pacífico es el más grande del planeta.", true],
    ["Madrid es la capital de Portugal.", false],
    ["El Sáhara es un desierto africano.", true],
    ["Islandia está en el hemisferio sur.", false],
    ["Canadá tiene frontera con Estados Unidos.", true],
    ["La orilla del mar Muerto está por debajo del nivel del mar.", true],
    ["Rusia es el país más extenso del mundo.", true],
    ["Las islas Canarias están en el mar Mediterráneo.", false],
    ["El Amazonas atraviesa Brasil.", true]
  ]
};

/* Anagramas: [palabra, otras palabras válidas con las mismas letras]. */
var WORD_BANK = {
  facil: [["sol", ["los"]], ["luz", []], ["pan", []], ["voz", []], ["paz", []], ["flor", []], ["nube", []], ["tren", []], ["pez", []], ["sal", ["las"]], ["gato", ["toga", "gota"]], ["leche", []], ["mano", ["mona"]], ["queso", []]],
  normal: [["árbol", ["labor", "lobar"]], ["perro", []], ["playa", []], ["fuego", []], ["nieve", []], ["noche", []], ["dulce", []], ["música", []], ["ciudad", []], ["bosque", []], ["cereza", []], ["jardín", []], ["puente", []], ["guitarra", []], ["naranja", []], ["ventana", []]],
  dificil: [["montaña", []], ["tesoro", []], ["biblioteca", []], ["universo", []], ["estrella", []], ["invierno", []], ["murciélago", []], ["escritorio", []], ["aventura", []], ["mariposa", []], ["chocolate", []], ["elefante", []], ["tormenta", []], ["horizonte", []], ["laberinto", []], ["calendario", []]]
};

var COUNTRY_CAPITALS = [
  ["España", "Madrid"], ["Francia", "París"], ["Italia", "Roma"], ["Portugal", "Lisboa"],
  ["Alemania", "Berlín"], ["Reino Unido", "Londres"], ["Grecia", "Atenas"],
  ["México", "Ciudad de México"], ["Argentina", "Buenos Aires"], ["Colombia", "Bogotá"], ["Chile", "Santiago"],
  ["Perú", "Lima"], ["Brasil", "Brasilia"], ["Canadá", "Ottawa"], ["Japón", "Tokio"],
  ["China", "Pekín"], ["India", "Nueva Delhi"], ["Rusia", "Moscú"], ["Australia", "Canberra"],
  ["Egipto", "El Cairo"], ["Turquía", "Ankara"], ["Marruecos", "Rabat"],
  ["Suecia", "Estocolmo"], ["Noruega", "Oslo"], ["Austria", "Viena"],
  ["Irlanda", "Dublín"], ["Polonia", "Varsovia"], ["Cuba", "La Habana"], ["Hungría", "Budapest"],
  ["Finlandia", "Helsinki"], ["Dinamarca", "Copenhague"], ["Bélgica", "Bruselas"], ["Venezuela", "Caracas"],
  ["Uruguay", "Montevideo"], ["Ecuador", "Quito"], ["Corea del Sur", "Seúl"], ["Kenia", "Nairobi"],
  ["Nueva Zelanda", "Wellington"], ["Tailandia", "Bangkok"], ["Vietnam", "Hanói"], ["Chequia", "Praga"],
  ["Rumanía", "Bucarest"], ["Irán", "Teherán"]
];
var CONTINENTS = [["Kenia", "África"], ["Japón", "Asia"], ["Chile", "América del Sur"], ["Noruega", "Europa"], ["Nueva Zelanda", "Oceanía"], ["Canadá", "América del Norte"], ["Egipto", "África"], ["Perú", "América del Sur"], ["Tailandia", "Asia"], ["Italia", "Europa"], ["Fiyi", "Oceanía"], ["Estados Unidos", "América del Norte"], ["Marruecos", "África"], ["Vietnam", "Asia"], ["Uruguay", "América del Sur"], ["Polonia", "Europa"]];
var SYNONYMS = [["Feliz", "Contento"], ["Veloz", "Rápido"], ["Grande", "Enorme"], ["Bonito", "Hermoso"], ["Empezar", "Comenzar"], ["Terminar", "Acabar"], ["Miedo", "Temor"], ["Cansado", "Agotado"], ["Mirar", "Observar"], ["Antiguo", "Viejo"], ["Rostro", "Cara"], ["Regalo", "Obsequio"], ["Fácil", "Sencillo"], ["Valiente", "Audaz"], ["Hablar", "Conversar"], ["Ayudar", "Auxiliar"], ["Enojado", "Furioso"]];
var ANTONYMS = [["Frío", "Caliente"], ["Alto", "Bajo"], ["Día", "Noche"], ["Abrir", "Cerrar"], ["Lleno", "Vacío"], ["Ganar", "Perder"], ["Ancho", "Estrecho"], ["Dulce", "Amargo"], ["Entrar", "Salir"], ["Mucho", "Poco"], ["Claro", "Oscuro"], ["Amor", "Odio"], ["Duro", "Blando"], ["Comprar", "Vender"], ["Pesado", "Ligero"], ["Subir", "Bajar"], ["Encender", "Apagar"], ["Rico", "Pobre"]];
var AUTHORS = [["Don Quijote", "Cervantes"], ["Cien años de soledad", "García Márquez"], ["Hamlet", "Shakespeare"], ["El señor de los anillos", "Tolkien"], ["1984", "Orwell"], ["La Odisea", "Homero"], ["Bodas de sangre", "Lorca"], ["La Gioconda", "Leonardo da Vinci"], ["Guernica", "Picasso"], ["Las meninas", "Velázquez"], ["La noche estrellada", "Van Gogh"], ["El grito", "Munch"], ["La persistencia de la memoria", "Dalí"], ["El principito", "Saint-Exupéry"], ["Rayuela", "Cortázar"], ["Ficciones", "Borges"]];
var DIRECTORS = [["Tiburón", "Spielberg"], ["El padrino", "Coppola"], ["Psicosis", "Hitchcock"], ["2001: Una odisea del espacio", "Kubrick"], ["Todo sobre mi madre", "Almodóvar"], ["El laberinto del fauno", "Guillermo del Toro"], ["Titanic", "James Cameron"], ["Origen", "Christopher Nolan"], ["Pulp Fiction", "Tarantino"], ["Alien", "Ridley Scott"], ["Regreso al futuro", "Zemeckis"], ["Mar adentro", "Amenábar"], ["Parásitos", "Bong Joon-ho"]];
var COMPOSERS = [["Mozart", "Austria"], ["Chopin", "Polonia"], ["Verdi", "Italia"], ["Manuel de Falla", "España"], ["Chaikovski", "Rusia"], ["Bach", "Alemania"], ["Debussy", "Francia"], ["Gershwin", "Estados Unidos"], ["Grieg", "Noruega"], ["Sibelius", "Finlandia"], ["Piazzolla", "Argentina"]];
var SPORT_GEAR = [["Baloncesto", "Canasta"], ["Béisbol", "Bate"], ["Golf", "Hoyo"], ["Esgrima", "Florete"], ["Bádminton", "Volante"], ["Boxeo", "Cuadrilátero"], ["Rugby", "Melé"], ["Ciclismo", "Pelotón"], ["Ajedrez", "Jaque mate"], ["Surf", "Tabla"], ["Hockey", "Stick"]];
var TEAM_SIZES = [["fútbol", 11], ["baloncesto", 5], ["voleibol", 6], ["waterpolo", 7], ["balonmano", 7], ["rugby (modalidad de 15)", 15], ["hockey sobre hielo", 6], ["fútbol sala", 5], ["béisbol", 9]];
var EVENTS = [
  ["Construcción de la Gran Pirámide de Guiza", -2560], ["Fundación de Roma (según la tradición)", -753],
  ["Caída del Imperio romano de Occidente", 476], ["Imprenta de Gutenberg", 1450], ["Llegada de Colón a América", 1492],
  ["Independencia de Estados Unidos", 1776], ["Revolución francesa", 1789], ["Batalla de Waterloo", 1815],
  ["Patente del teléfono de Bell", 1876], ["Primer vuelo de los hermanos Wright", 1903], ["Hundimiento del Titanic", 1912],
  ["Descubrimiento de la penicilina", 1928], ["Fin de la Segunda Guerra Mundial", 1945], ["Llegada del ser humano a la Luna", 1969],
  ["Caída del Muro de Berlín", 1989]
];
var PLANETS = ["Mercurio", "Venus", "Tierra", "Marte", "Júpiter", "Saturno", "Urano", "Neptuno"];
var WEEKDAYS = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"];
var NAMES = ["Ana", "Luis", "Marta", "Pablo", "Lucía", "Hugo", "Sara", "Diego", "Elena", "Mario"];
var EMOJI_POOL = ["⭐", "🔺", "🔵", "⬛", "❤️", "🌙", "🍀", "⚡", "🎵", "🌊", "🔥", "🍎", "🎯", "🌸", "💎", "☀️", "🍇", "🎈", "🧩", "🔔"];
var COLOR_POOL = ["🔴", "🟠", "🟡", "🟢", "🔵", "🟣", "🟤", "⚫"];
var COUNT_POOL = ["🍎", "🍋", "🍇", "⭐", "🌙", "🔵", "🐟", "🌸", "🍀", "🎈"];
var EMOJI_GROUPS = [
  { n: "frutas", e: ["🍎", "🍌", "🍇", "🍓", "🍒", "🍑", "🍍"] },
  { n: "animales", e: ["🐶", "🐱", "🐭", "🐰", "🦊", "🐻", "🐼"] },
  { n: "vehículos de carretera", e: ["🚗", "🚕", "🚌", "🚓", "🚑", "🚒", "🚜"] },
  { n: "fenómenos del tiempo", e: ["☀️", "🌧️", "⛅", "🌩️", "❄️", "🌪️"] },
  { n: "balones", e: ["⚽", "🏀", "🎾", "🏐", "🏈", "⚾"] },
  { n: "instrumentos musicales", e: ["🎸", "🎹", "🎺", "🥁", "🎻", "🎷"] }
];
var EST_BANKS = {
  ciencia: [
    ["¿Cuántos huesos tiene el cuerpo humano adulto?", 206, 10],
    ["¿Cuántos litros de sangre tiene, de media, una persona adulta?", 5, 1],
    ["¿A qué temperatura, en grados Celsius, hierve el agua al nivel del mar?", 100, 2],
    ["¿Cuántos pares de costillas tiene el ser humano?", 12, 1],
    ["¿Cuántos dientes tiene un adulto con la dentadura completa?", 32, 2],
    ["¿Cuántos minutos tarda la luz del Sol en llegar a la Tierra?", 8.3, 1]
  ],
  geografia: [
    ["¿A qué distancia media está la Luna de la Tierra, en kilómetros?", 384400, 20000],
    ["¿Cuántos países hay, aproximadamente, en el continente africano?", 54, 5],
    ["¿Cuántos metros mide de alto el Everest?", 8849, 150],
    ["¿Cuántos kilómetros mide la circunferencia de la Tierra en el ecuador?", 40075, 2000],
    ["¿Cuántos kilómetros mide, aproximadamente, el río Nilo?", 6650, 500]
  ],
  deporte: [
    ["¿En cuántos segundos corrió Usain Bolt los 100 metros en el Mundial de Berlín de 2009?", 9.58, 0.3],
    ["¿Cuántos hoyos tiene un recorrido de golf completo estándar?", 18, 0],
    ["¿Cuántos kilómetros mide una maratón?", 42.195, 1],
    ["¿Cuántos minutos dura un partido de baloncesto FIBA, sin contar prórrogas?", 40, 0],
    ["¿Cuántos metros mide de largo una piscina olímpica?", 50, 0]
  ],
  calculo: [
    ["¿Cuántos segundos tiene un día?", 86400, 3000, "24*60*60"],
    ["¿Cuántas horas tiene un año que no es bisiesto?", 8760, 400, "365*24"],
    ["¿Cuántos minutos tiene una semana?", 10080, 500, "7*24*60"],
    ["¿Cuántos segundos tiene una hora?", 3600, 100, "60*60"],
    ["¿Cuántos días, aproximadamente, son 80 años?", 29220, 1500, "80*365.25"],
    ["¿Cuántas horas tiene el mes de enero?", 744, 40, "31*24"]
  ]
};
var OPINION_BANK = [
  ["¿Qué añadirías a la ducha para mejorarla?", ["Un DJ personal", "Una pantalla de cine", "Café directo del grifo", "Nada, ya es perfecta"]],
  ["Si tuvieras que vivir un día como un objeto, ¿cuál elegirías?", ["Un mando a distancia", "Una nevera", "Un semáforo", "Un paraguas"]],
  ["¿Qué animal crees que sería mejor jefe?", ["Un búho", "Un león", "Un pulpo", "Una hormiga"]],
  ["Si tu vida fuera una serie, ¿qué género sería ahora mismo?", ["Comedia", "Drama", "Ciencia ficción", "Documental tranquilo"]],
  ["Si pudieras borrar una tarea doméstica del universo, ¿cuál sería?", ["Planchar", "Fregar", "Doblar calcetines", "Sacar la basura"]],
  ["¿Qué comida elegirías para el resto de tu vida?", ["Pizza", "Tortilla de patatas", "Sushi", "Tacos"]],
  ["¿Qué prefieres: poder volar o ser invisible?", ["Volar", "Ser invisible", "Las dos cosas", "Ninguna, me quedo en el sofá"]],
  ["¿Qué canción pondrías para entrar en una reunión?", ["Una épica de película", "Reguetón", "Música de ascensor", "Silencio dramático"]],
  ["¿Qué harías con un día extra a la semana?", ["Dormir", "Viajar", "Aprender algo nuevo", "Ver series"]],
  ["¿Qué plan de grupo elegirías sin dudarlo?", ["Escapada de fin de semana", "Noche de juegos de mesa", "Maratón de cocina", "Ruta en bici"]],
  ["Si el grupo ganara un viaje sorpresa, ¿qué votarías?", ["Playa", "Montaña", "Ciudad con historia", "Naturaleza salvaje"]],
  ["¿Qué regla pondrías en una cena con amigos?", ["Móviles en una caja", "Cada uno cocina un plato", "Prohibido hablar de trabajo", "El que llega tarde paga el postre"]],
  ["En un viaje en coche, ¿qué papel tienes?", ["El que pone la música", "El que conduce", "El que duerme", "El que lleva la comida"]],
  ["¿Cómo preferís celebrar un cumpleaños?", ["Cena tranquila", "Fiesta sorpresa", "Escapada", "Plan de aventura"]],
  ["¿Qué juego saca lo peor del grupo?", ["Monopoly", "Las cartas", "Pictionary", "Trivial"]]
];
