/*! RÉTAME · 2026-10-23 */
(function () {
"use strict";
var CONFIG = {"name":"RÉTAME","siteUrl":"","basePath":"","owner":"","ownerId":"","ownerAddress":"","contactEmail":"","launchDay":"2026-09-21","tz":"Europe/Madrid","social":{"instagram":"","tiktok":"","x":"","youtube":""},"adsense":{"client":"","slots":{"home":"","content":"","article":""}},"consent":{"mode":"google","cmpScript":""},"analytics":{"enabled":false}};
var ICON_PATHS = {
logica: '<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.6 10.8c.6.5 1 1.2 1 2V16h5.2v-.2c0-.8.4-1.5 1-2A6 6 0 0 0 12 3z"/>',
matematicas: '<path d="M5 7h5M7.5 4.5v5M14 7h5M5 16.5l4 4M9 16.5l-4 4M14 16h5M14 20h5"/>',
palabras: '<path d="M3 19 8 5l5 14M4.8 14h6.4"/><path d="M15 12.5c.7-1 1.7-1.5 3-1.5 1.8 0 3 1 3 3v5"/><path d="M21 15.5c-.7-.4-1.6-.5-2.6-.5-2 0-3.4.9-3.4 2.3 0 1.2 1 2.2 2.6 2.2 1.6 0 2.8-.8 3.4-2"/>',
memoria: '<rect x="3.5" y="3.5" width="7" height="7" rx="1.8"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.8"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.8"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.8"/><circle cx="17" cy="17" r="1.3" fill="currentColor"/><circle cx="7" cy="7" r="1.3" fill="currentColor"/>',
trivia: '<circle cx="12" cy="12" r="9"/><path d="M9.6 9.3a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1.1.9-1.1 1.6v.6"/><path d="M12 16.8v.2"/>',
estimacion: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.2"/>',
observacion: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
ordenar: '<path d="M7 4v16M3.5 16.5 7 20l3.5-3.5"/><path d="M14 6h7M14 11h5M14 16h3"/>',
grupo: '<circle cx="9" cy="8" r="3"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><path d="M16 5.2a3 3 0 0 1 0 5.6M18 14.4c1.8.9 3 2.9 3 5.6"/>',
sorpresa: '<rect x="3.5" y="3.5" width="17" height="17" rx="4"/><circle cx="8.5" cy="8.5" r="1.1" fill="currentColor"/><circle cx="15.5" cy="15.5" r="1.1" fill="currentColor"/><circle cx="15.5" cy="8.5" r="1.1" fill="currentColor"/><circle cx="8.5" cy="15.5" r="1.1" fill="currentColor"/><circle cx="12" cy="12" r="1.1" fill="currentColor"/>',
flame: '<path d="M12 21c-3.9 0-7-2.8-7-6.6 0-2.7 1.6-4.6 3.2-6.2.4 1.6 1.3 2.7 2.4 3.1C10.4 8 12 5 14.6 3c-.2 2.8 1 4.6 2.5 6.3 1.2 1.4 1.9 3 1.9 5.1 0 3.8-3.1 6.6-7 6.6z"/>',
trophy: '<path d="M8 4h8v5a4 4 0 0 1-8 0V4z"/><path d="M8 6H4.5v1.5A3.5 3.5 0 0 0 8 11M16 6h3.5v1.5A3.5 3.5 0 0 1 16 11"/><path d="M12 13v4M8.5 20.5h7M9.5 17h5v3.5h-5z"/>',
clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.2"/>',
duel: '<path d="M14.5 17.5 3 6V3h3l11.5 11.5M13 19l6-6M16 16l4 4M19 21l2-2"/><path d="M14.5 6.5 18 3h3v3l-3.5 3.5M5 14l4 4M7 17l-3 3M3 19l2 2"/>',
share: '<circle cx="18" cy="5.5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="18.5" r="2.5"/><path d="m8.2 10.8 7.6-4.1M8.2 13.2l7.6 4.1"/>',
copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
back: '<path d="M19 12H5M11 18l-6-6 6-6"/>',
check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
x: '<path d="M6 6l12 12M18 6 6 18"/>',
chart: '<path d="M4 20V10M10 20V4M16 20v-7M21 20H3"/>',
calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
star: '<path d="m12 3.5 2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.8z"/>',
play: '<path d="M7 4.8v14.4a1 1 0 0 0 1.5.9l11.3-7.2a1 1 0 0 0 0-1.7L8.5 3.9A1 1 0 0 0 7 4.8z"/>',
menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8v.2"/>',
repeat: '<path d="M4 12a8 8 0 0 1 13.7-5.6L20 8.5M20 4v4.5h-4.5"/><path d="M20 12a8 8 0 0 1-13.7 5.6L4 15.5M4 20v-4.5h4.5"/>',
lock: '<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>',
whatsapp: '<path d="M4 20l1.2-4.1A8 8 0 1 1 8.3 19z"/><path d="M9 8.5c0 3.4 3 6.5 6.5 6.5l1-1.5-2-1-1 .8a4.5 4.5 0 0 1-2.8-2.8l.8-1-1-2z"/>',
telegram: '<path d="M21 4 3 11l6 2.2L19 7l-7.6 7.6.3 5.4 3-3.6 4.3 3.1z"/>',
bolt: '<path d="M13 3 5 13.5h6L10 21l8-10.5h-6z"/>'
};
function icon(name, label, cls) {
var p = ICON_PATHS[name] || ICON_PATHS.info;
return '<svg class="ico' + (cls ? " " + cls : "") + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"' +
(label ? ' role="img" aria-label="' + label + '"' : ' aria-hidden="true" focusable="false"') + ">" + p + "</svg>";
}
function brandMark(size) {
var s = size || 32;
return '<svg class="brand-mark" width="' + s + '" height="' + s + '" viewBox="0 0 64 64" aria-hidden="true" focusable="false">' +
'<rect width="64" height="64" rx="16" fill="#5B21E8"/>' +
'<circle cx="32" cy="32" r="18" fill="none" stroke="#fff" stroke-width="4"/>' +
'<circle cx="32" cy="32" r="9" fill="none" stroke="#fff" stroke-width="4"/>' +
'<circle cx="32" cy="32" r="3.6" fill="#FFC53D"/>' +
'<path d="M32 6v8M32 50v8M6 32h8M50 32h8" stroke="#FFC53D" stroke-width="4" stroke-linecap="round"/></svg>';
}
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
var HIDDEN_CATEGORIES = [
{ slug: "grupo", name: "En grupo", icon: "grupo", color: "#E8590C", order: 99, hidden: true,
short: "Preguntas de opinión para comparar con tus amigos. Sin puntos." }
];
var TOPICS = {
geografia: "Geografía", historia: "Historia", ciencia: "Ciencia", arte: "Arte y literatura",
cine: "Cine", musica: "Música", deporte: "Deporte"
};
var LEGACY_CATS = {
mind: "logica", hard: "logica", acertijos: "logica", numbers: "matematicas", words: "palabras",
observation: "observacion", culture: "trivia", geo: "trivia", history: "trivia", science: "trivia",
movies: "trivia", music: "trivia", sports: "trivia", fun: "grupo", social: "grupo"
};
var LEGACY_TOPICS = { geo: "geografia", history: "historia", science: "ciencia", movies: "cine", music: "musica", sports: "deporte", culture: "arte" };
var FEATURED = ["balanza-nueve-monedas", "problemas-con-trampa", "secuencia-colores", "trivia-capitales-mundo", "cuestion-de-numeros-estima", "acertijo-pensamiento-lateral"];
var CHALLENGES = [
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
var ENGINE_VERSION = 2;
var KIND_LABELS = { opcion_multiple: "Opción múltiple", secuencia: "Serie", respuesta_texto: "Escribe la respuesta", verdadero_falso: "Verdadero o falso", ordenar: "Ordenar", emparejar: "Emparejar", estimar: "Estimación", memoria: "Memoria" };
var TIERS = ["facil", "normal", "dificil", "experto"];
var TIER_LABELS = { todas: "Cualquiera", facil: "Fácil", normal: "Normal", dificil: "Difícil", experto: "Experto" };
var ALL_CATS = CATEGORIES.concat(HIDDEN_CATEGORIES);
var PUBLIC_CATS = CATEGORIES.slice().sort(function (a, b) { return a.order - b.order; });
var catBySlug = {}, chBySlug = {};
ALL_CATS.forEach(function (c) { catBySlug[c.slug] = c; });
function esc(v) {
return String(v === null || v === undefined ? "" : v).replace(/[&<>"']/g, function (c) {
return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
});
}
function norm(v) {
return String(v).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9ñ ]/g, "").replace(/\s+/g, " ").trim();
}
function fmt(n) { return Number(n || 0).toLocaleString("es-ES"); }
function fmtNum(n) { return Number(n).toLocaleString("es-ES", { maximumFractionDigits: 3 }); }
function durLabel(s) {
if (s < 60) return s + " s";
var m = Math.floor(s / 60), r = s % 60;
return m + " min" + (r ? " " + r + " s" : "");
}
function mmss(s) { var m = Math.floor(s / 60), r = s % 60; return m + ":" + (r < 10 ? "0" : "") + r; }
function mulberry(seed) {
var a = seed | 0;
return function () {
a = (a + 0x6D2B79F5) | 0;
var t = Math.imul(a ^ (a >>> 15), 1 | a);
t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
}
function hashStr(s) {
var h = 0x811c9dc5;
for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
return h >>> 0;
}
function randPick(arr, rng) { return arr[Math.floor(rng() * arr.length)]; }
function randInt(min, max, rng) { return min + Math.floor(rng() * (max - min + 1)); }
function shuffleWith(a, rng) {
var arr = a.slice();
for (var i = arr.length - 1; i > 0; i--) { var j = Math.floor(rng() * (i + 1)); var t = arr[i]; arr[i] = arr[j]; arr[j] = t; }
return arr;
}
function seedFrom(rng) { return Math.floor(rng() * 4294967296); }
function gcd(a, b) { return b ? gcd(b, a % b) : a; }
function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
function plainLetters(w) { return norm(w).replace(/ /g, ""); }
function yearLabel(y) { return y < 0 ? (-y) + " a. C." : String(y); }
function decimalEs(n) { return String(Math.round(n * 1000) / 1000).replace(".", ","); }
function parseNum(raw) {
var s = String(raw).trim().replace(/\s/g, "");
if (!s) return NaN;
if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) s = s.replace(/\./g, "").replace(",", ".");
else if (/^-?\d{1,3}(,\d{3})+$/.test(s) && !/^-?\d,\d{3}$/.test(s)) s = s.replace(/,/g, "");
else s = s.replace(",", ".");
return /^-?\d+(\.\d+)?$/.test(s) ? Number(s) : NaN;
}
function numCandidates(raw) {
var s = String(raw).trim().replace(/\s/g, ""), out = [];
function add(v) { if (isFinite(v) && out.indexOf(v) === -1) out.push(v); }
if (/^-?\d+([.,]\d+)?$/.test(s)) add(Number(s.replace(",", ".")));
if (/^-?\d{1,3}([.,]\d{3})+$/.test(s)) add(Number(s.replace(/[.,]/g, "")));
if (/^-?\d{1,3}(\.\d{3})+,\d+$/.test(s)) add(Number(s.replace(/\./g, "").replace(",", ".")));
if (/^-?\d{1,3}(,\d{3})+\.\d+$/.test(s)) add(Number(s.replace(/,/g, "")));
return out;
}
function leadingNum(txt) {
var m = /-?\d+(?:[.,]\d+)?/.exec(String(txt).replace(/(\d)\.(\d{3})(?!\d)/g, "$1$2"));
return m ? Number(m[0].replace(",", ".")) : NaN;
}
function evalExpr(src) {
var s = String(src).replace(/\s+/g, ""), i = 0;
function peek() { return s.charAt(i); }
function num() {
var m = /^\d+(\.\d+)?/.exec(s.slice(i));
if (!m) throw new Error("num");
i += m[0].length; return Number(m[0]);
}
function atom() {
if (peek() === "(") { i++; var v = expr(); if (peek() !== ")") throw new Error(")"); i++; return v; }
if (peek() === "-") { i++; return -atom(); }
return num();
}
function power() { var b = atom(); if (peek() === "^") { i++; return Math.pow(b, power()); } return b; }
function term() {
var v = power();
while (peek() === "*" || peek() === "/") { var op = s.charAt(i++), r = power(); v = op === "*" ? v * r : v / r; }
return v;
}
function expr() {
var v = term();
while (peek() === "+" || peek() === "-") { var op = s.charAt(i++), r = term(); v = op === "+" ? v + r : v - r; }
return v;
}
try { var out = expr(); return i === s.length ? out : NaN; } catch (e) { return NaN; }
}
function near(a, b) { return Math.abs(a - b) < 1e-9 * Math.max(1, Math.abs(a), Math.abs(b)); }
function seqPredict(t) {
var out = [], n = t.length, i, d = [], ok;
function add(v) { if (isFinite(v) && !out.some(function (x) { return near(x, v); })) out.push(v); }
if (n < 3) return out;
for (i = 1; i < n; i++) d.push(t[i] - t[i - 1]);
ok = d.every(function (x) { return near(x, d[0]); }); if (ok) add(t[n - 1] + d[0]);
if (t.every(function (x) { return x !== 0; })) {
var r = t[1] / t[0];
if (t.every(function (x, k) { return k === 0 || near(x / t[k - 1], r); })) add(t[n - 1] * r);
}
if (n >= 4) {
var dd = []; for (i = 1; i < d.length; i++) dd.push(d[i] - d[i - 1]);
if (dd.every(function (x) { return near(x, dd[0]); })) add(t[n - 1] + d[d.length - 1] + dd[0]);
ok = true; for (i = 2; i < n; i++) if (!near(t[i], t[i - 1] + t[i - 2])) ok = false;
if (ok) add(t[n - 1] + t[n - 2]);
}
if (n >= 5 && !near(d[0], d[1])) {
ok = true; for (i = 2; i < d.length; i++) if (!near(d[i], d[i - 2])) ok = false;
if (ok) add(t[n - 1] + d[d.length - 2]);
}
return out;
}
var ABC = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
var BASE_POINTS = [0, 400, 550, 700, 850, 1000];
function unitsOf(ch) {
var d = ch.data || {};
if (ch.kind === "emparejar") return Math.max(1, Math.ceil((d.parejas || []).length / 2));
var qs = d.preguntas || [], u = qs.length;
if (ch.kind === "ordenar" || ch.kind === "memoria") qs.forEach(function (q) { u += Math.floor(Math.max(0, (q.n || (q.elementos || []).length) - 4) / 2); });
return Math.max(1, u);
}
function maxPoints(d, units) { return BASE_POINTS[Math.max(1, Math.min(5, d))] + Math.min(Math.max(0, units - 1), 5) * 30; }
function score(ch, r) {
var acc = r.total ? Math.min(1, r.correct / r.total) : 0;
var t = r.seconds / ch.duration;
var speed = Math.max(0, Math.min(1, 1 - (t - 0.5) / 1.5));
return { points: Math.round(ch.max_points * acc * (0.8 + 0.2 * speed)), accuracy: Math.round(acc * 100), speed: speed };
}
function tierDifficulty(tier) { return tier === "facil" ? 2 : tier === "normal" ? 3 : tier === "dificil" ? 4 : tier === "experto" ? 5 : 3; }
function tierOf(d) { return d <= 2 ? "facil" : d === 3 ? "normal" : d === 4 ? "dificil" : "experto"; }
function isOpinion(ch) {
var q = ch && ch.data && ch.data.preguntas;
return !!q && q.length > 0 && q.every(function (x) { return x.libre; });
}
function base(cat, kind, difficulty, duration) {
return { cat: cat, kind: kind, difficulty: difficulty, duration: duration, generated: true, v: ENGINE_VERSION };
}
function uniqueOptions(correct, candidates, n, rng, fill) {
var seen = {}, out = [String(correct)]; seen[String(correct)] = 1;
candidates.forEach(function (c) { var s = String(c); if (out.length < n && s !== "" && !seen[s]) { seen[s] = 1; out.push(s); } });
for (var k = 1; out.length < n && fill && k < 60; k++) { var s = String(fill(k)); if (!seen[s]) { seen[s] = 1; out.push(s); } }
return shuffleWith(out, rng);
}
function numDistractors(ans, spread) {
return [ans + 1, ans - 1, ans + spread, ans - spread, ans + 2, ans + 10, ans - 10, ans * 2].filter(function (x) { return x > 0 && x !== ans; });
}
function arithQuestion(tier, rng, avoidOp) {
var a, b, c, ans, q, e, pct, op, t;
if (tier === "facil") {
a = randInt(3, 30, rng); b = randInt(2, 20, rng); op = randInt(0, 1, rng) ? "+" : "−";
if (op === avoidOp) op = op === "+" ? "−" : "+";
if (op === "+") { ans = a + b; q = a + " + " + b + " = ?"; e = a + "+" + b; }
else { if (b > a) { t = a; a = b; b = t; } ans = a - b; q = a + " − " + b + " = ?"; e = a + "-" + b; }
} else if (tier === "normal") {
op = randPick(["+", "−", "×"].filter(function (o) { return o !== avoidOp; }), rng);
if (op === "×") { a = randInt(6, 25, rng); b = randInt(3, 12, rng); ans = a * b; e = a + "*" + b; }
else { a = randInt(12, 99, rng); b = randInt(11, 99, rng); if (op === "−" && b > a) { t = a; a = b; b = t; } ans = op === "+" ? a + b : a - b; e = a + (op === "+" ? "+" : "-") + b; }
q = a + " " + op + " " + b + " = ?";
} else if (tier === "dificil") {
op = randPick(["div", "pct", "mul"].filter(function (o) { return o !== avoidOp; }), rng);
if (op === "div") { b = randInt(3, 15, rng); ans = randInt(4, 25, rng); a = b * ans; q = a + " ÷ " + b + " = ?"; e = a + "/" + b; }
else if (op === "pct") { pct = randPick([10, 20, 25, 30, 40, 50, 75], rng); a = randInt(2, 30, rng) * (100 / gcd(pct, 100)); ans = a * pct / 100; q = "¿Cuál es el " + pct + " % de " + a + "?"; e = a + "*" + pct + "/100"; }
else { a = randInt(12, 40, rng); b = randInt(11, 25, rng); ans = a * b; q = a + " × " + b + " = ?"; e = a + "*" + b; }
} else {
op = randPick(["dos", "cuad", "pct"].filter(function (o) { return o !== avoidOp; }), rng);
if (op === "dos") { a = randInt(6, 19, rng); b = randInt(6, 19, rng); c = randInt(5, Math.min(99, a * b - 1), rng); ans = a * b - c; q = a + " × " + b + " − " + c + " = ?"; e = a + "*" + b + "-" + c; }
else if (op === "cuad") { a = randInt(13, 30, rng); ans = a * a; q = a + "² = ?"; e = a + "^2"; }
else { pct = randPick([12, 15, 35, 45, 65], rng); a = randInt(2, 20, rng) * (100 / gcd(pct, 100)); ans = a * pct / 100; q = "¿Cuál es el " + pct + " % de " + a + "?"; e = a + "*" + pct + "/100"; }
}
return { pregunta: q, respuesta: ans, check: { expr: e }, op: op };
}
function genArithmetic(tier, rng) {
var q = arithQuestion(tier, rng), d = tierDifficulty(tier);
delete q.op;
var ch = base("matematicas", "respuesta_texto", d, 30 + d * 10);
ch.key = "arit:" + q.pregunta;
ch.title = "Cálculo rápido"; ch.excerpt = "Una operación de cálculo mental.";
ch.description = "Resuelve la operación. Escribe solo el número."; ch.solution = q.pregunta.replace("?", fmtNum(q.respuesta)) + ".";
ch.data = { preguntas: [q] };
return ch;
}
function genCalc3(tier, rng) {
var qs = [], last = null, seen = {};
for (var k = 0; qs.length < 3 && k < 20; k++) {
var q = arithQuestion(tier, rng, last);
if (seen[q.pregunta]) continue;
seen[q.pregunta] = 1; last = q.op; delete q.op; qs.push(q);
}
var d = tierDifficulty(tier);
var ch = base("matematicas", "respuesta_texto", d, 25 + d * 14);
ch.key = "calc3:" + qs.map(function (q) { return q.pregunta; }).join("|");
ch.title = "Tres cálculos seguidos"; ch.excerpt = "Tres operaciones de cálculo mental, sin calculadora.";
ch.description = "Resuelve las tres operaciones. Escribe solo el número.";
ch.solution = qs.map(function (q) { return q.pregunta.replace("?", fmtNum(q.respuesta)); }).join(" · ");
ch.data = { preguntas: qs };
return ch;
}
var SEQ_BY_TIER = { facil: ["suma", "resta"], normal: ["suma", "geo", "crec"], dificil: ["crec", "alt", "cuad", "geo"], experto: ["fib", "tri", "alt", "cuad2"] };
function genSequence(cat, tier, rng) {
var pat = randPick(SEQ_BY_TIER[tier] || SEQ_BY_TIER.normal, rng), t = [], next, explain, i, a, b, s, dd, up, dn, k, off;
if (pat === "suma") { a = randInt(1, 20, rng); b = randInt(2, tier === "facil" ? 6 : 12, rng); for (i = 0; i < 5; i++) t.push(a + i * b); next = a + 5 * b; explain = "Se suma " + b + " cada vez."; }
else if (pat === "resta") { b = randInt(2, 9, rng); a = 6 * b + randInt(1, 20, rng); for (i = 0; i < 5; i++) t.push(a - i * b); next = a - 5 * b; explain = "Se resta " + b + " cada vez."; }
else if (pat === "geo") { b = randInt(2, 3, rng); a = randInt(1, 5, rng); for (i = 0; i < 5; i++) t.push(a * Math.pow(b, i)); next = a * Math.pow(b, 5); explain = "Cada número se multiplica por " + b + "."; }
else if (pat === "crec") { a = randInt(1, 15, rng); s = randInt(1, 4, rng); t = [a]; dd = s; for (i = 1; i < 5; i++) { t.push(t[i - 1] + dd); dd++; } next = t[4] + dd; explain = "La diferencia crece de uno en uno: +" + s + ", +" + (s + 1) + ", +" + (s + 2) + "…"; }
else if (pat === "alt") { a = randInt(10, 40, rng); up = randInt(4, 12, rng); dn = randInt(1, up - 1, rng); t = [a]; for (i = 1; i < 6; i++) t.push(i % 2 ? t[i - 1] + up : t[i - 1] - dn); next = t[5] - dn; explain = "Se alterna: +" + up + ", −" + dn + "."; }
else if (pat === "cuad") { a = randInt(1, 6, rng); for (i = 0; i < 5; i++) t.push((a + i) * (a + i)); next = (a + 5) * (a + 5); explain = "Son cuadrados perfectos: " + a + "², " + (a + 1) + "², " + (a + 2) + "²…"; }
else if (pat === "cuad2") { a = randInt(1, 5, rng); off = randInt(1, 6, rng); for (i = 0; i < 5; i++) t.push((a + i) * (a + i) + off); next = (a + 5) * (a + 5) + off; explain = "Cuadrados perfectos más " + off + ": " + a + "² + " + off + ", " + (a + 1) + "² + " + off + "…"; }
else if (pat === "fib") { a = randInt(1, 6, rng); b = randInt(a, 9, rng); t = [a, b]; for (i = 2; i < 6; i++) t.push(t[i - 1] + t[i - 2]); next = t[4] + t[5]; explain = "Cada número es la suma de los dos anteriores."; }
else { k = randInt(1, 4, rng); for (i = 0; i < 5; i++) t.push((k + i) * (k + i + 1)); next = (k + 5) * (k + 6); explain = "Cada término es n × (n + 1): " + k + "×" + (k + 1) + ", " + (k + 1) + "×" + (k + 2) + "…"; }
var diff = t[t.length - 1] - t[t.length - 2];
var cands = shuffleWith([next + 1, next - 1, next + 2, t[t.length - 1] + diff, next + Math.abs(diff), next - 2, next * 2], rng).filter(function (x) { return x > 0 && x !== next; });
var opts = uniqueOptions(next, cands, 4, rng, function (j) { return next + j + 2; });
var d = tierDifficulty(tier);
var ch = base(cat, "secuencia", d, 30 + d * 12);
ch.key = "sec:" + t.join(",");
ch.title = "Sigue la serie"; ch.excerpt = "Encuentra el patrón y continúa la serie.";
ch.description = "Encuentra el patrón y elige el número que sigue."; ch.solution = explain + " El siguiente término es " + next + ".";
ch.data = { preguntas: [{ pregunta: "¿Qué número sigue?", visual: t.join(", ") + ", ?", opciones: opts, correcta: opts.indexOf(String(next)), explica: explain, check: { seq: t } }] };
return ch;
}
function genCapital(tier, rng) {
var d = tierDifficulty(tier), n = tier === "facil" ? 3 : tier === "experto" ? 5 : 4;
var pair = randPick(COUNTRY_CAPITALS, rng), country = pair[0], capital = pair[1];
var reverse = tier !== "facil" && randInt(0, 2, rng) === 0;
var others = shuffleWith(COUNTRY_CAPITALS.filter(function (c) { return c[0] !== country; }), rng);
var correct = reverse ? country : capital;
var opts = uniqueOptions(correct, others.map(function (c) { return reverse ? c[0] : c[1]; }), n, rng);
var ch = base("trivia", "opcion_multiple", d, 25 + d * 8); ch.topic = "geografia";
ch.key = "capital:" + country + (reverse ? ":r" : "");
ch.title = "Capitales del mundo"; ch.excerpt = reverse ? "¿De qué país es capital " + capital + "?" : "¿Sabes la capital de " + country + "?";
ch.description = "Trivia de capitales.";
ch.solution = "La capital de " + country + " es " + capital + ".";
ch.data = { preguntas: [{ pregunta: reverse ? "¿De qué país es capital " + capital + "?" : "¿Cuál es la capital de " + country + "?", opciones: opts, correcta: opts.indexOf(correct), explica: ch.solution }] };
return ch;
}
function genAnagram(tier, rng) {
var bankKey = tier === "experto" ? "dificil" : tier;
var entry = randPick(WORD_BANK[bankKey] || WORD_BANK.normal, rng), word = entry[0];
var letters = plainLetters(word).split(""), shuffled, tries = 0;
do { shuffled = shuffleWith(letters, rng); tries++; } while (shuffled.join("") === letters.join("") && tries < 12);
var d = tierDifficulty(tier);
var ch = base("palabras", "respuesta_texto", d, 30 + word.length * 4);
ch.key = "ana:" + word;
ch.title = "Palabra desordenada"; ch.excerpt = "Reordena las letras y descubre la palabra.";
ch.description = "Anagrama. Los acentos no cuentan.";
ch.solution = "La palabra era " + word.toUpperCase() + ".";
ch.data = { preguntas: [{ pregunta: "Reordena estas letras para formar una palabra:", visual: shuffled.join(" ").toUpperCase(), respuesta: word, acepta: entry[1].slice(), explica: "Era «" + word.toUpperCase() + "»." + (entry[1].length ? " También valía: " + entry[1].join(", ") + "." : "") }] };
return ch;
}
function genFact(topic, tier, rng) {
var bank = FACT_BANKS[topic]; if (!bank) return null;
var n = tier === "facil" ? 2 : tier === "experto" ? 5 : tier === "dificil" ? 4 : 3;
var chosen = shuffleWith(bank.map(function (_, i) { return i; }), rng).slice(0, Math.min(n, bank.length));
var d = tierDifficulty(tier);
var ch = base("trivia", "verdadero_falso", d, 15 + chosen.length * 12); ch.topic = topic;
ch.key = "vf:" + topic + ":" + chosen.slice().sort(function (a, b) { return a - b; }).join("-");
ch.title = "¿Verdad o mentira? " + TOPICS[topic]; ch.excerpt = "Afirmaciones de " + TOPICS[topic].toLowerCase() + ": ¿verdaderas o falsas?";
ch.description = "Marca si cada afirmación es verdadera o falsa.";
ch.solution = chosen.map(function (i) { return bank[i][0] + " → " + (bank[i][1] ? "verdadero" : "falso"); }).join(" · ");
ch.data = { preguntas: chosen.map(function (i) { return { pregunta: bank[i][0], respuesta: bank[i][1] }; }) };
return ch;
}
function genEstimate(bankKey, tier, rng) {
var bank = EST_BANKS[bankKey]; if (!bank) return null;
var n = tier === "facil" ? 1 : 2;
var idxs = shuffleWith(bank.map(function (_, i) { return i; }), rng).slice(0, Math.min(n, bank.length));
var d = tierDifficulty(tier);
var ch = base("estimacion", "estimar", d, 25 + idxs.length * 20);
ch.key = "est:" + bankKey + ":" + idxs.slice().sort(function (a, b) { return a - b; }).join("-");
ch.title = bankKey === "calculo" ? "Calcula a ojo" : "A ojo: estima el dato"; ch.excerpt = "No hace falta acertar exacto, basta con acercarse.";
ch.description = "Escribe tu estimación: cuenta como acierto si caes dentro del margen.";
ch.solution = idxs.map(function (i) { return bank[i][0] + " → " + fmtNum(bank[i][1]); }).join(" · ");
ch.data = { preguntas: idxs.map(function (i) { var q = { pregunta: bank[i][0], respuesta: bank[i][1], tolerancia: bank[i][2] }; if (bank[i][3]) q.check = { expr: bank[i][3] }; return q; }) };
return ch;
}
function genOpinion(tier, rng) {
var i = Math.floor(rng() * OPINION_BANK.length), item = OPINION_BANK[i];
var ch = base("grupo", "opcion_multiple", 1, 30);
ch.key = "op:" + i;
ch.title = "¿Qué prefieres?"; ch.excerpt = "Sin respuestas correctas: para comparar con tus amigos.";
ch.description = "Juego de opinión. No hay acierto ni error, así que no da puntos.";
ch.solution = "No hay solución: es un juego de opinión.";
ch.data = { preguntas: [{ pregunta: item[0], opciones: item[1].slice(), correcta: 0, libre: true }] };
return ch;
}
function genMemory(variant, tier, rng) {
var pool = variant === "colores" ? COLOR_POOL : variant === "cifras" ? ["1", "2", "3", "4", "5", "6", "7", "8", "9"] : EMOJI_POOL;
var n = { facil: 4, normal: 5, dificil: 6, experto: 7 }[tier] || 5;
if (variant === "colores") n = Math.min(n + 1, 7);
var items = shuffleWith(pool, rng).slice(0, n), d = tierDifficulty(tier);
var ch = base("memoria", "memoria", d, 40 + n * 6);
ch.key = "mem:" + items.join("");
ch.title = variant === "colores" ? "Secuencia de colores" : variant === "cifras" ? "Memoriza las cifras" : "Memoria de símbolos";
ch.excerpt = "Memoriza el orden antes de que desaparezca.";
ch.description = "Memoriza la secuencia y repítela en el mismo orden.";
ch.solution = "El orden era: " + items.join(" ") + ".";
ch.data = { preguntas: [{ pregunta: "Memoriza el orden.", elementos: items, mostrar_ms: 1600 + n * 520 }] };
return ch;
}
function genPairs(family, bank, tier, rng, title, excerpt, desc, verb, topic) {
var n = tier === "facil" ? 3 : tier === "normal" ? 4 : tier === "dificil" ? 5 : 6;
var picked = [], usedA = {}, usedB = {};
shuffleWith(bank, rng).forEach(function (p) {
if (picked.length < n && !usedA[p[0]] && !usedB[p[1]]) { usedA[p[0]] = 1; usedB[p[1]] = 1; picked.push(p); }
});
var d = tierDifficulty(tier);
var cat = family === "sinonimos" || family === "antonimos" ? "palabras" : "trivia";
var ch = base(cat, "emparejar", d, 18 + picked.length * 9);
if (topic) ch.topic = topic;
ch.key = family + ":" + picked.map(function (p) { return p[0]; }).sort().join("|");
ch.title = title; ch.excerpt = excerpt; ch.description = desc;
ch.solution = picked.map(function (p) { return p[0] + " → " + p[1]; }).join(" · ");
ch.data = { parejas: picked.map(function (p) { return { a: p[0], b: p[1] }; }), titulo: verb };
return ch;
}
function genCount(tier, rng) {
var len = { facil: 10, normal: 14, dificil: 18, experto: 22 }[tier] || 14;
var kinds = { facil: 2, normal: 3, dificil: 3, experto: 4 }[tier] || 3;
var syms = shuffleWith(COUNT_POOL, rng).slice(0, kinds), target = syms[0], seq = [], i, c = 0;
for (i = 0; i < len; i++) seq.push(randPick(syms, rng));
for (i = 0; i < len; i++) if (seq[i] === target) c++;
for (i = 0; c < 2 && i < len; i++) if (seq[i] !== target) { seq[i] = target; c++; }
var opts = uniqueOptions(c, shuffleWith(numDistractors(c, 3), rng), 4, rng, function (k) { return c + k + 2; });
var d = tierDifficulty(tier);
var ch = base("observacion", "opcion_multiple", d, 15 + len * 2);
ch.key = "contar:" + seq.join("");
ch.title = "Cuenta rápido"; ch.excerpt = "¿Cuántas veces aparece el símbolo?";
ch.description = "Observación pura: cuenta con calma.";
ch.solution = target + " aparece " + c + " veces.";
ch.data = { preguntas: [{ pregunta: "¿Cuántas veces aparece " + target + "?", visual: seq.join(" "), opciones: opts, correcta: opts.indexOf(String(c)), explica: ch.solution, check: { count: target } }] };
return ch;
}
function genIntruder(tier, rng) {
var groups = shuffleWith(EMOJI_GROUPS, rng), A = groups[0], B = groups[1];
var n = tier === "facil" ? 4 : tier === "normal" ? 5 : 6;
var items = shuffleWith(A.e, rng).slice(0, n - 1), intruder = randPick(B.e, rng);
var opts = shuffleWith(items.concat([intruder]), rng);
var d = tierDifficulty(tier);
var ch = base("observacion", "opcion_multiple", d, 20 + n * 3);
ch.key = "intruso:" + opts.slice().sort().join("");
ch.title = "Encuentra el intruso"; ch.excerpt = "Todos tienen algo en común… menos uno.";
ch.description = "Busca el elemento que no pertenece al grupo.";
ch.solution = "Todos son " + A.n + " menos " + intruder + " (" + B.n + ").";
ch.data = { preguntas: [{ pregunta: "¿Cuál no pertenece al grupo?", opciones: opts, correcta: opts.indexOf(intruder), emoji: true, explica: ch.solution }] };
return ch;
}
function genPattern(tier, rng) {
var L = { facil: 2, normal: 3, dificil: 3, experto: 4 }[tier] || 3;
var pool = shuffleWith(rng() < 0.5 ? COLOR_POOL : EMOJI_POOL.slice(0, 12), rng);
var block = pool.slice(0, L), extra = pool.slice(L, L + 2);
var shown = L * 2 + randInt(1, L, rng), seq = [];
for (var i = 0; i < shown; i++) seq.push(block[i % L]);
var next = block[shown % L];
var opts = shuffleWith(block.concat(extra).slice(0, 4), rng);
if (opts.indexOf(next) === -1) opts[0] = next;
var d = tierDifficulty(tier);
var ch = base("observacion", "secuencia", d, 25 + L * 8);
ch.key = "patron:" + seq.join("");
ch.title = "¿Qué sigue?"; ch.excerpt = "Encuentra el bloque que se repite.";
ch.description = "La serie repite un bloque de símbolos. Elige el siguiente.";
ch.solution = "Se repite " + block.join("") + ": sigue " + next + ".";
ch.data = { preguntas: [{ pregunta: "¿Qué símbolo sigue?", visual: seq.join(" ") + " ?", opciones: opts, correcta: opts.indexOf(next), emoji: true, explica: ch.solution, check: { pattern: true } }] };
return ch;
}
function genDays(cat, tier, rng) {
var range = { facil: [2, 9], normal: [10, 30], dificil: [31, 120], experto: [121, 400] }[tier] || [10, 30];
var start = randInt(0, 6, rng), n = randInt(range[0], range[1], rng), past = tier === "experto" && randInt(0, 1, rng) === 1;
var idx = past ? (((start - n) % 7) + 7) % 7 : (start + n) % 7;
var correct = cap(WEEKDAYS[idx]);
var opts = uniqueOptions(correct, shuffleWith([WEEKDAYS[(idx + 1) % 7], WEEKDAYS[(idx + 6) % 7], WEEKDAYS[start], WEEKDAYS[(idx + 2) % 7], WEEKDAYS[(idx + 5) % 7]], rng).map(cap), 4, rng);
var d = tierDifficulty(tier);
var ch = base(cat, "opcion_multiple", d, 25 + d * 10);
ch.key = "dias:" + start + ":" + n + (past ? ":p" : "");
ch.title = "El calendario mental"; ch.excerpt = "Calcula el día de la semana sin mirar el calendario.";
ch.description = "Truco: cada 7 días se repite el mismo día de la semana.";
var expl = n + " días son " + Math.floor(n / 7) + " semanas y " + (n % 7) + " días: " + (past ? "retrocedes " : "avanzas ") + (n % 7) + " desde el " + WEEKDAYS[start] + " → " + WEEKDAYS[idx] + ".";
ch.solution = expl;
ch.data = { preguntas: [{ pregunta: "Si hoy es " + WEEKDAYS[start] + ", ¿qué día de la semana " + (past ? "fue hace " : "será dentro de ") + n + " días?", opciones: opts, correcta: opts.indexOf(correct), explica: expl, check: { dias: { start: start, n: n, past: past } } }] };
return ch;
}
function genAges(cat, tier, rng) {
var names = shuffleWith(NAMES, rng), A = names[0], B = names[1], k, x, S, m = 0, q, ans, expl, askOlder = false;
var mult = { 2: "el doble", 3: "el triple", 4: "el cuádruple" };
if (tier === "facil") { k = 2; x = randInt(4, 15, rng); }
else if (tier === "normal") { k = randInt(2, 3, rng); x = randInt(5, 20, rng); }
else { k = randInt(3, 4, rng); x = randInt(6, 18, rng); }
if (tier === "experto") {
m = randInt(2, 10, rng); S = x + m + k * x + m; ans = x;
q = A + " tiene " + mult[k] + " de años que " + B + ". Dentro de " + m + " años, entre los dos sumarán " + S + ". ¿Cuántos años tiene " + B + " ahora?";
expl = "(x + " + m + ") + (" + k + "x + " + m + ") = " + S + " → " + (k + 1) + "x = " + (S - 2 * m) + " → x = " + x + ".";
} else {
S = x * (k + 1);
askOlder = tier !== "dificil" && randInt(0, 1, rng) === 1;
ans = askOlder ? k * x : x;
q = A + " tiene " + mult[k] + " de años que " + B + ". Entre los dos suman " + S + ". ¿Cuántos años tiene " + (askOlder ? A : B) + "?";
expl = "x + " + k + "x = " + S + " → x = " + x + ": " + B + " tiene " + x + " y " + A + " tiene " + (k * x) + ".";
}
var opts = uniqueOptions(ans, shuffleWith([ans + k, ans - k, x === ans ? k * x : x, ans + 1, ans - 1, S - ans].filter(function (v) { return v > 0 && v !== ans; }), rng), 4, rng, function (j) { return ans + j + 3; });
var d = tierDifficulty(tier);
var ch = base(cat, "opcion_multiple", d, 40 + d * 12);
ch.key = "edades:" + q;
ch.title = "Problema de edades"; ch.excerpt = "Deduce antes de calcular.";
ch.description = "Plantea la ecuación: se resuelve razonando, no adivinando.";
ch.solution = expl;
ch.data = { preguntas: [{ pregunta: q, opciones: opts, correcta: opts.indexOf(String(ans)), explica: expl, check: { edades: { k: k, S: S, m: m, ask: askOlder ? "mayor" : "menor" } } }] };
return ch;
}
function genChronology(tier, rng) {
var n = tier === "facil" ? 3 : tier === "normal" ? 4 : 5, picked = [];
shuffleWith(EVENTS, rng).forEach(function (e) {
if (picked.length < n && picked.every(function (p) { return Math.abs(p[1] - e[1]) >= 8; })) picked.push(e);
});
picked.sort(function (a, b) { return a[1] - b[1]; });
var d = tierDifficulty(tier);
var ch = base("ordenar", "ordenar", d, 25 + n * 12);
ch.key = "crono:" + picked.map(function (p) { return p[1]; }).join(",");
ch.title = "Línea del tiempo"; ch.excerpt = "Ordena los acontecimientos del más antiguo al más reciente.";
ch.description = "Toca dos acontecimientos para intercambiarlos hasta dejarlos en orden.";
ch.solution = picked.map(function (p) { return p[0] + " (" + yearLabel(p[1]) + ")"; }).join(" → ");
ch.data = { preguntas: [{ pregunta: "Ordénalos del más antiguo al más reciente.", elementos: picked.map(function (p) { return p[0]; }), explica: ch.solution, check: { valores: picked.map(function (p) { return p[1]; }) } }] };
return ch;
}
function genPlanets(tier, rng) {
var n = tier === "facil" ? 3 : tier === "normal" ? 4 : tier === "dificil" ? 5 : 6;
var idx = shuffleWith(PLANETS.map(function (_, i) { return i; }), rng).slice(0, n).sort(function (a, b) { return a - b; });
var items = idx.map(function (i) { return PLANETS[i]; }), d = tierDifficulty(tier);
var ch = base("ordenar", "ordenar", d, 20 + n * 10);
ch.key = "planetas:" + items.join(",");
ch.title = "Ordena el sistema solar"; ch.excerpt = "Del más cercano al más lejano del Sol.";
ch.description = "Toca dos planetas para intercambiarlos hasta dejarlos en orden.";
ch.solution = items.join(" → ") + ".";
ch.data = { preguntas: [{ pregunta: "Ordena estos planetas del más cercano al más lejano del Sol.", elementos: items, explica: "Orden completo: " + PLANETS.join(", ") + ".", check: { valores: idx } }] };
return ch;
}
var POWERS = [["2²", 4], ["√49", 7], ["2³", 8], ["3²", 9], ["√100", 10], ["√121", 11], ["2⁴", 16], ["5²", 25], ["3³", 27], ["2⁵", 32], ["6²", 36], ["7²", 49], ["2⁶", 64], ["10²", 100]];
var FRACTIONS = [["1/2", 0.5], ["1/3", 1 / 3], ["2/3", 2 / 3], ["1/4", 0.25], ["3/4", 0.75], ["1/5", 0.2], ["2/5", 0.4], ["3/5", 0.6], ["4/5", 0.8], ["1/8", 0.125], ["3/8", 0.375], ["5/8", 0.625], ["7/8", 0.875], ["3/10", 0.3], ["7/10", 0.7], ["9/10", 0.9]];
function genOrderNumbers(tier, rng) {
var n = tier === "facil" ? 4 : 5, pool = [], picked = [], i, v;
if (tier === "facil") { for (i = 0; i < 40; i++) { v = randInt(2, 99, rng); pool.push([String(v), v]); } }
else if (tier === "normal") { for (i = 0; i < 40; i++) { v = randInt(5, 250, rng) / 100; pool.push([decimalEs(v), v]); } }
else if (tier === "dificil") { pool = shuffleWith(FRACTIONS, rng).slice(0, 8); for (i = 0; i < 4; i++) { v = randInt(5, 95, rng) / 100; pool.push([decimalEs(v), v]); } }
else { pool = shuffleWith(POWERS, rng).slice(0, 8); for (i = 0; i < 4; i++) { v = randInt(3, 60, rng); pool.push([String(v), v]); } }
shuffleWith(pool, rng).forEach(function (p) {
if (picked.length < n && picked.every(function (q) { return Math.abs(q[1] - p[1]) >= 0.02 && q[0] !== p[0]; })) picked.push(p);
});
picked.sort(function (a, b) { return a[1] - b[1]; });
var d = tierDifficulty(tier);
var ch = base("ordenar", "ordenar", d, 25 + n * 10);
ch.key = "numeros:" + picked.map(function (p) { return p[0]; }).join(",");
ch.title = "De menor a mayor"; ch.excerpt = "Ordena los números de menor a mayor.";
ch.description = "Toca dos números para intercambiarlos hasta dejarlos de menor a mayor.";
ch.solution = picked.map(function (p) { return p[0]; }).join(" < ") + ".";
ch.data = { preguntas: [{ pregunta: "Ordena de menor a mayor.", elementos: picked.map(function (p) { return p[0]; }), explica: picked.map(function (p) { return p[0] + (String(p[1]) === p[0] ? "" : " = " + decimalEs(p[1])); }).join(" · "), check: { valores: picked.map(function (p) { return p[1]; }) } }] };
return ch;
}
function genTeamSize(tier, rng) {
var p = randPick(TEAM_SIZES, rng), ans = p[1];
var opts = uniqueOptions(ans, shuffleWith([5, 6, 7, 9, 11, 15], rng), tier === "facil" ? 3 : 4, rng);
var d = tierDifficulty(tier);
var ch = base("trivia", "opcion_multiple", d, 25 + d * 6); ch.topic = "deporte";
ch.key = "equipos:" + p[0];
ch.title = "¿Cuántos en juego?"; ch.excerpt = "Jugadores por equipo en el campo o la pista.";
ch.description = "Reglamento básico de deportes de equipo.";
ch.solution = "En " + p[0] + " juegan " + ans + " por equipo.";
ch.data = { preguntas: [{ pregunta: "¿Cuántos jugadores tiene cada equipo en juego en " + p[0] + "?", opciones: opts, correcta: opts.indexOf(String(ans)), explica: ch.solution }] };
return ch;
}
function hardTier(t) { return t === "experto" ? "experto" : t === "facil" ? "normal" : "dificil"; }
var GENERATORS = {
logica: [
{ id: "dias", kind: "opcion_multiple", daily: true, make: function (t, r) { return genDays("logica", t, r); } },
{ id: "edades", kind: "opcion_multiple", daily: true, make: function (t, r) { return genAges("logica", t, r); } },
{ id: "serie", kind: "secuencia", daily: true, make: function (t, r) { return genSequence("logica", hardTier(t), r); } }
],
matematicas: [
{ id: "arit", kind: "respuesta_texto", make: genArithmetic },
{ id: "calculo", kind: "respuesta_texto", daily: true, make: genCalc3 },
{ id: "serie-num", kind: "secuencia", daily: true, make: function (t, r) { return genSequence("matematicas", t, r); } }
],
palabras: [
{ id: "anagrama", kind: "respuesta_texto", daily: true, make: genAnagram },
{ id: "sinonimos", kind: "emparejar", daily: true, make: function (t, r) { return genPairs("sinonimos", SYNONYMS, t, r, "Sinónimos", "Cada palabra tiene su pareja de significado.", "Vocabulario: une cada palabra con su sinónimo.", "Une cada palabra con su sinónimo"); } },
{ id: "antonimos", kind: "emparejar", daily: true, make: function (t, r) { return genPairs("antonimos", ANTONYMS, t, r, "Contrarios", "Une cada palabra con su opuesto.", "Vocabulario: une cada palabra con su contrario.", "Une cada palabra con su contrario"); } }
],
memoria: [
{ id: "simbolos", kind: "memoria", daily: true, make: function (t, r) { return genMemory("simbolos", t, r); } },
{ id: "colores", kind: "memoria", daily: true, make: function (t, r) { return genMemory("colores", t, r); } },
{ id: "cifras", kind: "memoria", daily: true, make: function (t, r) { return genMemory("cifras", t, r); } }
],
trivia: [
{ id: "capital", kind: "opcion_multiple", daily: true, make: genCapital },
{ id: "continentes", kind: "emparejar", daily: true, make: function (t, r) { return genPairs("continentes", CONTINENTS, t, r, "¿En qué continente está?", "Une cada país con su continente.", "Geografía: cada país con su continente.", "Une cada país con su continente", "geografia"); } },
{ id: "autores", kind: "emparejar", daily: true, make: function (t, r) { return genPairs("autores", AUTHORS, t, r, "Obras y autores", "Une cada obra con quien la creó.", "Literatura y arte: cada obra con su autor.", "Une cada obra con su autor", "arte"); } },
{ id: "directores", kind: "emparejar", daily: true, make: function (t, r) { return genPairs("directores", DIRECTORS, t, r, "¿Quién la dirigió?", "Une cada película con su director.", "Cine: cada película con quien la dirigió.", "Une cada película con su director", "cine"); } },
{ id: "compositores", kind: "emparejar", make: function (t, r) { return genPairs("compositores", COMPOSERS, t, r, "Compositores del mundo", "Une cada compositor con su país.", "Música clásica: cada compositor con su país de origen.", "Une cada compositor con su país", "musica"); } },
{ id: "material", kind: "emparejar", make: function (t, r) { return genPairs("material", SPORT_GEAR, t, r, "Cada deporte, lo suyo", "Une cada deporte con algo típico de él.", "Deporte: cada disciplina con su elemento característico.", "Une cada deporte con su elemento", "deporte"); } },
{ id: "equipos", kind: "opcion_multiple", make: genTeamSize },
{ id: "vf-ciencia", kind: "verdadero_falso", daily: true, make: function (t, r) { return genFact("ciencia", t, r); } },
{ id: "vf-arte", kind: "verdadero_falso", daily: true, make: function (t, r) { return genFact("arte", t, r); } },
{ id: "vf-historia", kind: "verdadero_falso", daily: true, make: function (t, r) { return genFact("historia", t, r); } },
{ id: "vf-cine", kind: "verdadero_falso", daily: true, make: function (t, r) { return genFact("cine", t, r); } },
{ id: "vf-musica", kind: "verdadero_falso", make: function (t, r) { return genFact("musica", t, r); } },
{ id: "vf-deporte", kind: "verdadero_falso", make: function (t, r) { return genFact("deporte", t, r); } },
{ id: "vf-geografia", kind: "verdadero_falso", daily: true, make: function (t, r) { return genFact("geografia", t, r); } }
],
estimacion: [
{ id: "est-ciencia", kind: "estimar", daily: true, make: function (t, r) { return genEstimate("ciencia", t, r); } },
{ id: "est-geografia", kind: "estimar", daily: true, make: function (t, r) { return genEstimate("geografia", t, r); } },
{ id: "est-deporte", kind: "estimar", make: function (t, r) { return genEstimate("deporte", t, r); } },
{ id: "est-calculo", kind: "estimar", daily: true, make: function (t, r) { return genEstimate("calculo", t, r); } }
],
observacion: [
{ id: "contar", kind: "opcion_multiple", daily: true, make: genCount },
{ id: "intruso", kind: "opcion_multiple", daily: true, make: genIntruder },
{ id: "patron", kind: "secuencia", daily: true, make: genPattern }
],
ordenar: [
{ id: "cronologia", kind: "ordenar", daily: true, make: genChronology },
{ id: "planetas", kind: "ordenar", daily: true, make: genPlanets },
{ id: "numeros", kind: "ordenar", daily: true, make: genOrderNumbers }
],
grupo: [
{ id: "opinion", kind: "opcion_multiple", make: genOpinion }
]
};
function genById(cat, id) {
var list = GENERATORS[cat] || [];
for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
return null;
}
function makeGenerated(cat, genId, tier, seed) {
var g = genById(cat, genId);
if (!g || TIERS.indexOf(tier) === -1) return null;
var made = null;
try { made = g.make(tier, mulberry(seed)); } catch (e) { made = null; }
if (!made) return null;
made.cat = cat;
made.family = genId;
made.tier = tier;
made.slug = "g2-" + cat + "-" + genId + "-" + tier + "-" + (seed >>> 0).toString(36);
made.key = made.key || made.slug;
made.max_points = maxPoints(made.difficulty, unitsOf(made));
return made;
}
var LEGACY_GEN = {
numbers: [["matematicas", "arit"], ["matematicas", "serie-num"], ["logica", "edades"]],
geo: [["trivia", "capital"], ["memoria", "simbolos"], ["estimacion", "est-geografia"], ["trivia", "vf-geografia"], ["trivia", "continentes"]],
words: [["palabras", "anagrama"], ["palabras", "sinonimos"], ["palabras", "antonimos"]],
observation: [["memoria", "simbolos"], ["logica", "serie"], ["observacion", "contar"], ["observacion", "intruso"]],
mind: [["memoria", "simbolos"], ["logica", "serie"], ["logica", "dias"], ["logica", "edades"], ["observacion", "intruso"]],
science: [["trivia", "vf-ciencia"], ["estimacion", "est-ciencia"], ["ordenar", "planetas"]],
culture: [["trivia", "vf-arte"], ["trivia", "autores"]],
history: [["trivia", "vf-historia"], ["ordenar", "cronologia"]],
movies: [["trivia", "vf-cine"], ["trivia", "directores"]],
music: [["trivia", "vf-musica"], ["trivia", "compositores"]],
sports: [["trivia", "vf-deporte"], ["estimacion", "est-deporte"], ["trivia", "material"], ["trivia", "equipos"]],
fun: [["grupo", "opinion"]], social: [["grupo", "opinion"]],
hard: [["logica", "serie"], ["logica", "dias"], ["logica", "edades"]]
};
var resolveCache = {};
function resolveChallenge(slug) {
slug = String(slug || "").slice(0, 120);
if (resolveCache[slug] !== undefined) return resolveCache[slug];
var out = null, m;
if (chBySlug[slug]) out = chBySlug[slug];
else if ((m = /^g2-([a-z]+)-([a-z0-9-]+?)-(facil|normal|dificil|experto)-([0-9a-z]{1,7})$/.exec(slug))) {
var ch = makeGenerated(m[1], m[2], m[3], parseInt(m[4], 36));
if (ch && ch.slug === slug && validateChallenge(ch)) out = ch;
} else if ((m = /^g-([a-z]+)-(\d+)-(facil|normal|dificil|experto)-([0-9a-z]{1,7})$/.exec(slug))) {
var map = (LEGACY_GEN[m[1]] || [])[+m[2]];
if (map) {
var ch2 = makeGenerated(map[0], map[1], m[3], parseInt(m[4], 36));
if (ch2 && validateChallenge(ch2)) out = ch2;
}
}
resolveCache[slug] = out;
return out;
}
function needsSeed(ch) { return !!(ch && ch.data && (ch.data.preguntas || []).some(function (q) { return q.pool; })); }
function instantiate(ch, seed) {
if (!needsSeed(ch)) return ch;
var rng = mulberry(seed >>> 0), copy = {};
Object.keys(ch).forEach(function (k) { copy[k] = ch[k]; });
copy.data = { preguntas: ch.data.preguntas.map(function (q) {
var o = {}; Object.keys(q).forEach(function (k) { o[k] = q[k]; });
o.elementos = shuffleWith(q.pool, rng).slice(0, q.n);
return o;
}) };
copy.seed = seed >>> 0;
return copy;
}
function nonEmpty(v) { return v !== null && v !== undefined && String(v).trim() !== ""; }
function allUnique(list) {
var seen = {};
for (var i = 0; i < list.length; i++) { var k = String(list[i]).trim().toLowerCase(); if (seen[k]) return false; seen[k] = 1; }
return true;
}
function weekdayAfter(start, n, past) {
var t = Date.UTC(2024, 0, 1) + (start + (past ? -n : n)) * 86400000;
return (new Date(t).getUTCDay() + 6) % 7;
}
function optionValue(q, k) { return leadingNum(q.opciones[k]); }
function checkProblems(q, ch) {
var c = q.check, p = [], i, hasOpts = Array.isArray(q.opciones);
if (!c) return p;
function expectNumber(val, label) {
if (!isFinite(val)) { p.push(label + ": no se puede calcular"); return; }
if (typeof q.respuesta === "number") { if (!near(q.respuesta, val)) p.push(label + ": la respuesta " + q.respuesta + " no coincide con " + val); return; }
if (hasOpts) {
if (!near(optionValue(q, q.correcta), val)) p.push(label + ": la opción correcta no vale " + val);
q.opciones.forEach(function (_, k) { if (k !== q.correcta && near(optionValue(q, k), val)) p.push(label + ": otra opción también vale " + val); });
}
}
if (c.expr) expectNumber(evalExpr(c.expr), "expr");
if (c.seq) {
var preds = seqPredict(c.seq);
if (!preds.length) p.push("seq: patrón no reconocido");
else {
if (!preds.some(function (v) { return near(v, optionValue(q, q.correcta)); })) p.push("seq: la opción correcta no sigue la serie");
q.opciones.forEach(function (_, k) { if (k !== q.correcta && preds.some(function (v) { return near(v, optionValue(q, k)); })) p.push("seq: otra opción también sigue la serie"); });
}
}
if (c.letters) {
var idx = c.letters.map(function (l) { return ABC.indexOf(l) + 1; });
if (!(idx.every(function (x) { return x >= 1 && x <= 14; }) || idx.every(function (x) { return x >= 15; }))) p.push("letters: la serie cruza la Ñ");
var lp = seqPredict(idx).map(function (v) { return ABC.charAt(v - 1); });
if (lp.indexOf(q.opciones[q.correcta]) === -1) p.push("letters: la opción correcta no sigue la serie");
q.opciones.forEach(function (o, k) { if (k !== q.correcta && lp.indexOf(o) !== -1) p.push("letters: otra opción también sigue la serie"); });
}
if (c.count) {
var n = String(q.visual || "").split(/\s+/).filter(function (t) { return t === c.count; }).length;
expectNumber(n, "count");
}
if (c.pattern) {
var toks = String(q.visual || "").split(/\s+/).filter(Boolean);
if (toks[toks.length - 1] !== "?") p.push("pattern: falta el «?» final");
toks = toks.filter(function (t) { return t !== "?"; });
var period = 0;
for (var L = 1; L <= toks.length / 2 && !period; L++) {
var okL = true;
for (i = L; i < toks.length; i++) if (toks[i] !== toks[i - L]) { okL = false; break; }
if (okL) period = L;
}
if (!period) p.push("pattern: no hay bloque que se repita dos veces");
else if (q.opciones[q.correcta] !== toks[toks.length - period]) p.push("pattern: la opción correcta no continúa el bloque");
}
if (c.dias) {
var wd = weekdayAfter(c.dias.start, c.dias.n, c.dias.past);
if (norm(q.opciones[q.correcta]) !== norm(WEEKDAYS[wd])) p.push("dias: debería ser " + WEEKDAYS[wd]);
}
if (c.edades) {
var e = c.edades, sols = [];
for (var y = 1; y <= 400; y++) if ((y + e.m) + (e.k * y + e.m) === e.S) sols.push(y);
if (sols.length !== 1) p.push("edades: el problema no tiene solución única");
else expectNumber(e.ask === "mayor" ? e.k * sols[0] : sols[0], "edades");
}
if (c.valores) {
if (!Array.isArray(q.elementos) || c.valores.length !== q.elementos.length) p.push("valores: no coinciden con los elementos");
for (i = 1; i < c.valores.length; i++) if (!(c.valores[i] > c.valores[i - 1])) p.push("valores: el orden no es estrictamente creciente");
}
if (c.alfabetico) {
var sorted = q.elementos.slice().sort(function (a, b) { return a.localeCompare(b, "es", { sensitivity: "base" }); });
if (sorted.join("|") !== q.elementos.join("|")) p.push("alfabetico: el orden no es alfabético");
}
if (c.fill) {
if (c.fill.replace("_", q.opciones[q.correcta]) !== c.word) p.push("fill: la letra no completa la palabra");
q.opciones.forEach(function (o, k) { if (k !== q.correcta && c.fill.replace("_", o) === c.word) p.push("fill: otra opción también completa la palabra"); });
}
return p;
}
function anagramProblems(q) {
if (typeof q.respuesta !== "string" || !q.visual || !/^([A-ZÑ] )+[A-ZÑ]$/.test(q.visual)) return [];
var letters = q.visual.replace(/ /g, "").toLowerCase().split("").sort().join("");
return [q.respuesta].concat(q.acepta || []).filter(function (w) { return plainLetters(w).split("").sort().join("") !== letters; })
.map(function (w) { return "anagrama: «" + w + "» no usa las mismas letras"; });
}
function problems(ch) {
var p = [];
try {
if (!ch) return ["reto inexistente"];
if (!nonEmpty(ch.slug)) p.push("sin slug");
if (!/^[a-z0-9-]+$/.test(String(ch.slug || ""))) p.push("slug no válido");
if (!nonEmpty(ch.title)) p.push("sin título");
if (!catBySlug[ch.cat]) p.push("categoría desconocida: " + ch.cat);
if (!KIND_LABELS[ch.kind]) p.push("tipo desconocido: " + ch.kind);
if (!(ch.difficulty >= 1 && ch.difficulty <= 5 && Math.round(ch.difficulty) === ch.difficulty)) p.push("dificultad fuera de rango");
if (!(ch.duration > 0) || !(ch.max_points > 0)) p.push("duración o puntos no válidos");
if (ch.cat === "trivia" && !TOPICS[ch.topic]) p.push("trivia sin tema");
var d = ch.data;
if (!d) return p.concat(["sin datos"]);
if (ch.kind === "emparejar") {
if (!(Array.isArray(d.parejas) && d.parejas.length >= 2)) p.push("menos de 2 parejas");
else {
if (!d.parejas.every(function (x) { return x && nonEmpty(x.a) && nonEmpty(x.b); })) p.push("pareja vacía");
if (!allUnique(d.parejas.map(function (x) { return x.a; })) || !allUnique(d.parejas.map(function (x) { return x.b; }))) p.push("parejas repetidas");
}
return p;
}
if (!Array.isArray(d.preguntas) || !d.preguntas.length) return p.concat(["sin preguntas"]);
d.preguntas.forEach(function (q, qi) {
var tag = "P" + (qi + 1) + ": ";
if (!q || !nonEmpty(q.pregunta)) { p.push(tag + "sin enunciado"); return; }
if (ch.kind === "opcion_multiple" || ch.kind === "secuencia") {
if (!(Array.isArray(q.opciones) && q.opciones.length >= 2 && q.opciones.every(nonEmpty))) p.push(tag + "opciones no válidas");
else if (!allUnique(q.opciones)) p.push(tag + "opciones repetidas");
if (!(typeof q.correcta === "number" && Math.round(q.correcta) === q.correcta && q.correcta >= 0 && q.correcta < (q.opciones || []).length)) p.push(tag + "índice de respuesta no válido");
} else if (ch.kind === "verdadero_falso") {
if (typeof q.respuesta !== "boolean") p.push(tag + "respuesta no booleana");
} else if (ch.kind === "respuesta_texto") {
if (!((typeof q.respuesta === "number" && isFinite(q.respuesta)) || (typeof q.respuesta === "string" && nonEmpty(q.respuesta)))) p.push(tag + "respuesta vacía");
if (q.claves) p.push(tag + "respuesta por palabras clave (ambigua)");
if (typeof q.respuesta === "string" && !(q.visual && /^([A-ZÑ] )+[A-ZÑ]$/.test(q.visual))) p.push(tag + "respuesta libre de texto sin comprobación");
anagramProblems(q).forEach(function (x) { p.push(tag + x); });
} else if (ch.kind === "ordenar") {
if (!(Array.isArray(q.elementos) && q.elementos.length >= 2 && q.elementos.every(nonEmpty) && allUnique(q.elementos))) p.push(tag + "elementos no válidos");
} else if (ch.kind === "memoria") {
if (q.pool) {
if (!(Array.isArray(q.pool) && allUnique(q.pool) && q.n >= 3 && q.n <= q.pool.length)) p.push(tag + "pool de memoria no válido");
} else if (!(Array.isArray(q.elementos) && q.elementos.length >= 2 && q.elementos.every(nonEmpty) && allUnique(q.elementos))) p.push(tag + "elementos no válidos");
} else if (ch.kind === "estimar") {
if (!(typeof q.respuesta === "number" && isFinite(q.respuesta))) p.push(tag + "respuesta no numérica");
if (!(q.tolerancia === undefined || (typeof q.tolerancia === "number" && q.tolerancia >= 0))) p.push(tag + "tolerancia no válida");
if (q.tolerancia && q.tolerancia > Math.abs(q.respuesta) * 0.5) p.push(tag + "margen demasiado amplio");
}
checkProblems(q, ch).forEach(function (x) { p.push(tag + x); });
});
} catch (e) { p.push("error al validar: " + e.message); }
return p;
}
var validCache = {};
function validateChallenge(ch) {
if (!ch) return false;
if (!ch.generated && validCache[ch.slug] !== undefined) return validCache[ch.slug];
var ok = problems(ch).length === 0;
if (!ch.generated) validCache[ch.slug] = ok;
return ok;
}
function sigsOf(ch) {
if (ch.kind === "emparejar") return ["pairs|" + ch.data.parejas.map(function (p) { return norm(p.a) + ">" + norm(p.b); }).sort().join(",")];
return ch.data.preguntas.map(function (q) {
return norm(q.pregunta) + "|" + (q.visual || "") + "|" + (q.opciones || []).map(function (o) { return String(o).toLowerCase(); }).sort().join(",") + "|" + (q.elementos || q.pool || []).slice().sort().join(",");
});
}
function signature(ch) { return hashStr(sigsOf(ch).slice().sort().join("§")).toString(36); }
function dayInTz(d) {
return new Intl.DateTimeFormat("en-CA", { timeZone: CONFIG.tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(d || new Date());
}
function validDay(day) { return /^\d{4}-\d{2}-\d{2}$/.test(String(day)) && !isNaN(Date.parse(day + "T00:00:00Z")) && new Date(day + "T00:00:00Z").toISOString().slice(0, 10) === day; }
function dayNum(day) { var p = day.split("-"); return Math.round(Date.UTC(+p[0], +p[1] - 1, +p[2]) / 86400000); }
function addDay(day, delta) { return new Date((dayNum(day) + delta) * 86400000).toISOString().slice(0, 10); }
function secsToMidnight() {
var parts = new Intl.DateTimeFormat("en-GB", { timeZone: CONFIG.tz, hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).formatToParts(new Date());
var v = {}; parts.forEach(function (p) { v[p.type] = parseInt(p.value, 10); });
return 86400 - ((v.hour % 24) * 3600 + v.minute * 60 + v.second);
}
function pad(n) { return (n < 10 ? "0" : "") + n; }
function clock(s) { return pad(Math.floor(s / 3600)) + ":" + pad(Math.floor((s % 3600) / 60)) + ":" + pad(s % 60); }
function longDate(day) { return new Intl.DateTimeFormat("es-ES", { timeZone: "UTC", day: "numeric", month: "long" }).format(new Date(day + "T12:00:00Z")); }
function shortDate(day) { return new Intl.DateTimeFormat("es-ES", { timeZone: "UTC", day: "numeric", month: "short" }).format(new Date(day + "T12:00:00Z")).replace(".", ""); }
function dailyNumber(day) { return Math.max(1, dayNum(day) - dayNum(CONFIG.launchDay) + 1); }
var DAILY_WEIGHT = { normal: 1, dificil: 1.25, experto: 1.5 };
function dailyOk(ch) {
if (!ch || isOpinion(ch) || !validateChallenge(ch)) return false;
if (ch.kind === "respuesta_texto") return ch.data.preguntas.every(function (q) { return typeof q.respuesta === "number" || anagramProblems(q).length === 0 && /^([A-ZÑ] )+[A-ZÑ]$/.test(q.visual || ""); });
if (ch.kind === "verdadero_falso") return ch.data.preguntas.length >= 3;
return true;
}
var dailyCache = {};
function dailySet(day) {
if (!validDay(day)) return null;
if (dailyCache[day]) return dailyCache[day];
var rng = mulberry(hashStr("retame|reto-del-dia|v2|" + day));
var n = rng() < 0.6 ? 5 : 4;
var tiers = n === 5 ? ["normal", "normal", "dificil", "dificil", "experto"] : ["normal", "dificil", "dificil", "experto"];
var cats = shuffleWith(PUBLIC_CATS.map(function (c) { return c.slug; }), rng).slice(0, n);
if (cats.indexOf("logica") === -1 && cats.indexOf("matematicas") === -1) cats[n - 1] = rng() < 0.5 ? "logica" : "matematicas";
var used = {}, rounds = [];
cats.forEach(function (cat, i) {
var fams = shuffleWith((GENERATORS[cat] || []).filter(function (g) { return g.daily; }), rng), got = null;
for (var f = 0; f < fams.length && !got; f++) {
for (var a = 0; a < 6 && !got; a++) {
var ch = makeGenerated(cat, fams[f].id, tiers[i], seedFrom(rng));
if (!dailyOk(ch)) continue;
if (sigsOf(ch).some(function (s) { return used[s]; })) continue;
got = ch;
}
}
if (!got) {
var statics = CHALLENGES.filter(function (c) { return c.cat === cat && dailyOk(c) && !needsSeed(c); });
if (statics.length) got = statics[Math.floor(rng() * statics.length)];
}
if (got) { sigsOf(got).forEach(function (s) { used[s] = 1; }); rounds.push({ ch: got, tier: tiers[i], weight: DAILY_WEIGHT[tiers[i]] || 1 }); }
});
var set = { day: day, number: dailyNumber(day), rounds: rounds, sig: hashStr(rounds.map(function (r) { return r.ch.slug; }).join("|")).toString(36) };
dailyCache[day] = set;
return set;
}
function dailyScore(set, results) {
var totalW = 0, got = 0;
set.rounds.forEach(function (r, i) {
totalW += r.weight;
var res = results[i];
if (res) got += r.weight * (res.points / r.ch.max_points);
});
return totalW ? Math.round(got / totalW * 1000) : 0;
}
function gradeOf(accuracy) { return accuracy >= 100 ? "v" : accuracy >= 50 ? "~" : "x"; }
var GRADE_EMOJI = { v: "🟩", "~": "🟨", x: "🟥" };
CHALLENGES.forEach(function (c) { c.max_points = maxPoints(c.difficulty, unitsOf(c)); chBySlug[c.slug] = c; });
var PUBLIC_CHALLENGES = CHALLENGES.filter(function (c) { return !catBySlug[c.cat].hidden; });
function href(p) { return (CONFIG.basePath || "") + p; }
function catUrl(cat) { return href("/retos/" + cat + "/"); }
function challengeUrl(ch) {
if (!ch.generated && catBySlug[ch.cat] && !catBySlug[ch.cat].hidden) return href("/retos/" + ch.cat + "/" + ch.slug + "/");
return href("/juegos/?reto=" + encodeURIComponent(ch.slug));
}
function topicLabel(ch) { return ch.topic && TOPICS[ch.topic] ? TOPICS[ch.topic] : ""; }
function dots(n) {
var s = ""; for (var i = 1; i <= 5; i++) s += "<i" + (i <= n ? ' class="on"' : "") + "></i>";
var word = n <= 2 ? "fácil" : n === 3 ? "media" : n === 4 ? "difícil" : "experta";
return '<span class="dots" role="img" aria-label="Dificultad ' + word + ', ' + n + ' de 5">' + s + "</span>";
}
function catTile(cat, size) {
return '<span class="cat-tile' + (size ? " cat-tile-" + size : "") + '" style="--cat:' + cat.color + '">' + icon(cat.icon) + "</span>";
}
function catTag(ch) {
var c = catBySlug[ch.cat];
return '<span class="tag" style="--cat:' + c.color + '">' + icon(c.icon) + esc(c.name) + (topicLabel(ch) ? " · " + esc(topicLabel(ch)) : "") + "</span>";
}
function metaLine(ch) {
return '<div class="meta">' + catTag(ch) + dots(ch.difficulty) +
'<span class="meta-item">' + icon("clock") + "≈ " + durLabel(ch.duration) + "</span>" +
(catBySlug[ch.cat].hidden ? '<span class="meta-item">Sin puntos</span>' : '<span class="meta-item">' + icon("trophy") + "hasta " + fmt(ch.max_points) + " pts</span>") + "</div>";
}
function stageHtml(ch, startLabel, note) {
return '<section class="stage" data-stage aria-label="Zona de juego">' +
'<div class="stage-intro" data-intro>' + metaLine(ch) +
'<div class="actions"><button type="button" class="btn btn-primary btn-lg" data-start>' + icon("play") + esc(startLabel || "Empezar") + "</button></div>" +
'<p class="hint">' + esc(note || "El cronómetro empieza al pulsar. La rapidez solo da hasta un 20 % extra: piensa con calma.") + "</p>" +
'<noscript><p class="hint"><b>Para jugar necesitas activar JavaScript.</b> Puedes leer las preguntas y la solución más abajo.</p></noscript></div>' +
'<div class="hud" data-bar hidden><div class="hud-top">' + catTag(ch) +
(KIND_LABELS[ch.kind] && KIND_LABELS[ch.kind] !== catBySlug[ch.cat].name ? '<span class="hud-kind">' + esc(KIND_LABELS[ch.kind]) + "</span>" : "") +
'<span class="timer" data-timer-pill>' + icon("clock") + '<b data-timer>0</b><span class="sr-only"> segundos</span></span></div>' +
'<div class="hud-progress"><span data-progress-text></span><span class="live-ok" data-live aria-live="polite"></span></div>' +
'<div class="track"><span data-progress-bar></span></div></div>' +
'<div class="stage-body" data-body hidden></div><div data-result hidden></div></section>';
}
function challengeRow(ch) {
var c = catBySlug[ch.cat];
return '<li><a class="row" href="' + challengeUrl(ch) + '" style="--cat:' + c.color + '">' + catTile(c) +
'<span class="row-main"><span class="row-title">' + esc(ch.title) + '</span><span class="row-sub">' + esc(ch.excerpt) + "</span></span>" +
'<span class="row-side">' + dots(ch.difficulty) + '<span class="row-dur">' + durLabel(ch.duration) + '</span><span class="row-best" data-best="' + esc(ch.slug) + '"></span></span></a></li>';
}
function challengeList(items) { return '<ul class="list">' + items.map(challengeRow).join("") + "</ul>"; }
function catCard(cat, mode) {
var n = PUBLIC_CHALLENGES.filter(function (c) { return c.cat === cat.slug; }).length;
var link = mode === "play" ? href("/juegos/?tema=" + cat.slug) : catUrl(cat.slug);
return '<li><a class="cat-card" href="' + link + '" style="--cat:' + cat.color + '">' + catTile(cat, "lg") +
'<span class="cat-name">' + esc(cat.name) + '</span><span class="cat-desc">' + esc(cat.short) + "</span>" +
'<span class="cat-foot">' + (cat.hidden ? "Sin puntos" : n + " retos + generados") + icon("arrow") + "</span></a></li>";
}
function catGrid(mode) { return '<ul class="cat-grid">' + PUBLIC_CATS.map(function (c) { return catCard(c, mode); }).join("") + "</ul>"; }
var PAGE = document.body.getAttribute("data-page") || "";
function siteOrigin() { return CONFIG.siteUrl || location.origin; }
function absUrl(path) { return siteOrigin() + path; }
function $(s, r) { return (r || document).querySelector(s); }
function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
function reducedMotion() { return !!(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches); }
function restartAnim(el, cls) { el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); }
function randomSeed() { return Math.floor(Math.random() * 4294967296); }
var toastTimer = null;
function toast(msg) {
var t = $("[data-toast]"); if (!t) return;
t.textContent = msg; t.hidden = false; restartAnim(t, "anim-rise");
clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.hidden = true; }, 3800);
}
function count(node, target, from) {
if (!node) return;
from = from || 0;
var start = Date.now(), dur = 650;
if (reducedMotion() || typeof requestAnimationFrame !== "function") { node.textContent = fmt(target); return; }
(function step() {
var p = Math.min(1, (Date.now() - start) / dur), e = 1 - Math.pow(1 - p, 3);
node.textContent = fmt(Math.round(from + (target - from) * e));
if (p < 1) requestAnimationFrame(step);
})();
}
function copyText(textValue, button, okLabel) {
var original = button ? button.innerHTML : "";
function done() { if (button) { button.textContent = okLabel || "¡Copiado!"; setTimeout(function () { button.innerHTML = original; }, 2000); } }
function fallback() {
try {
var el = document.createElement("textarea");
el.value = textValue; el.setAttribute("readonly", ""); el.style.position = "fixed"; el.style.opacity = "0";
document.body.appendChild(el); el.select(); el.setSelectionRange(0, 99999);
var okc = document.execCommand("copy"); document.body.removeChild(el);
if (okc) done(); else toast("No se pudo copiar. Mantén pulsado el enlace para copiarlo.");
} catch (e) { toast("No se pudo copiar. Mantén pulsado el enlace para copiarlo."); }
}
if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(textValue).then(done).catch(fallback);
else fallback();
}
function getParams() {
var q = {};
try { new URLSearchParams(location.search).forEach(function (v, k) { q[k] = v; }); } catch (e) { /* navegador antiguo */ }
return q;
}
function track(name, props) {
try {
window.dispatchEvent(new CustomEvent("retame:event", { detail: { name: name, props: props || {} } }));
if (CONFIG.analytics && CONFIG.analytics.enabled && typeof window.retameTrack === "function") window.retameTrack(name, props || {});
} catch (e) { /* nunca rompe el juego */ }
}
var KEY = "retame:v2", OLD_KEY = "retame:v1", mem = null, storageOk = true;
function blank() {
return {
v: 2, history: [], best: {}, streak: { current: 0, best: 0, total_days: 0, last_day: null }, ach: {}, daily: {}, dailyRun: null,
nick: "", duels: 0, duelWins: 0, points: 0, games: 0, seenByCat: {}, recent: [], recentSigs: [], famCount: {}, days: {}, catStats: {},
accSum: 0, accN: 0, logicWins: 0, sessions: 0, bestSession: 0,
records: { bestDaily: 0, bestDailyDay: "", bestDailyAcc: 0, fastestDaily: 0, perfects: 0, bestPoints: 0 }
};
}
function asObj(v) { return v && typeof v === "object" && !Array.isArray(v) ? v : {}; }
function asArr(v) { return Array.isArray(v) ? v : []; }
function asNum(v) { v = Number(v); return isFinite(v) && v >= 0 ? v : 0; }
function asStr(v, max) { return typeof v === "string" ? v.slice(0, max || 200) : ""; }
function sanitize(o) {
var b = blank();
o = asObj(o);
b.history = asArr(o.history).filter(function (h) { return h && typeof h.slug === "string"; }).slice(0, 80).map(function (h) {
return { slug: asStr(h.slug, 120), title: asStr(h.title, 120), cat: asStr(h.cat || h.category, 30), points: asNum(h.points), accuracy: Math.min(100, asNum(h.accuracy)), seconds: asNum(h.seconds), at: asNum(h.at), daily: !!h.daily, grid: asStr(h.grid, 10) };
});
Object.keys(asObj(o.best)).forEach(function (k) { var x = asObj(o.best[k]); b.best[k.slice(0, 120)] = { points: asNum(x.points), seconds: asNum(x.seconds), accuracy: Math.min(100, asNum(x.accuracy)) }; });
var s = asObj(o.streak);
b.streak = { current: asNum(s.current), best: asNum(s.best), total_days: asNum(s.total_days), last_day: validDay(s.last_day) ? s.last_day : null };
Object.keys(asObj(o.ach)).forEach(function (k) { b.ach[k] = asNum(o.ach[k]) || 1; });
Object.keys(asObj(o.daily)).forEach(function (k) {
if (!validDay(k)) return;
var d = asObj(o.daily[k]);
b.daily[k] = { points: asNum(d.points), v: d.v === 2 ? 2 : 1, acc: Math.min(100, asNum(d.acc)), secs: asNum(d.secs), grid: asStr(d.grid, 10) };
});
var run = asObj(o.dailyRun);
if (validDay(run.day) && Array.isArray(run.results)) b.dailyRun = { day: run.day, sig: asStr(run.sig, 20), secs: asNum(run.secs), results: run.results.slice(0, 5).map(function (r) { r = asObj(r); return { points: asNum(r.points), accuracy: Math.min(100, asNum(r.accuracy)), seconds: asNum(r.seconds) }; }) };
b.nick = asStr(o.nick, 24);
["duels", "duelWins", "points", "games", "accSum", "accN", "logicWins", "sessions", "bestSession"].forEach(function (k) { b[k] = asNum(o[k]); });
Object.keys(asObj(o.seenByCat)).forEach(function (k) { b.seenByCat[k] = asArr(o.seenByCat[k]).filter(function (x) { return typeof x === "string"; }).slice(-400); });
b.recent = asArr(o.recent).filter(function (h) { return h && typeof h === "object"; }).slice(-12);
b.recentSigs = asArr(o.recentSigs).filter(function (x) { return typeof x === "string"; }).slice(-500);
Object.keys(asObj(o.famCount)).forEach(function (k) { b.famCount[k] = asNum(o.famCount[k]); });
Object.keys(asObj(o.days)).forEach(function (k) { if (validDay(k)) { var d = asObj(o.days[k]); b.days[k] = { points: asNum(d.points), games: asNum(d.games) }; } });
Object.keys(asObj(o.catStats)).forEach(function (k) { var c = asObj(o.catStats[k]); b.catStats[k] = { g: asNum(c.g), acc: asNum(c.acc), n: asNum(c.n) }; });
var r = asObj(o.records);
Object.keys(b.records).forEach(function (k) { b.records[k] = k === "bestDailyDay" ? asStr(r[k], 10) : asNum(r[k]); });
return b;
}
function migrateV1(o) {
o = asObj(o);
var mapCat = function (c) { return LEGACY_CATS[c] || c; };
asArr(o.history).forEach(function (h) { if (h && h.cat) h.cat = mapCat(h.cat); });
asArr(o.recent).forEach(function (h) { if (h && h.cat) h.cat = mapCat(h.cat); });
var seen = {}, stats = {};
Object.keys(asObj(o.seenByCat)).forEach(function (k) { var n = mapCat(k); seen[n] = (seen[n] || []).concat(asArr(o.seenByCat[k])); });
Object.keys(asObj(o.catStats)).forEach(function (k) {
var n = mapCat(k), c = asObj(o.catStats[k]), t = stats[n] || { g: 0, acc: 0, n: 0 };
t.g += asNum(c.g); t.acc += asNum(c.acc); t.n += asNum(c.n); stats[n] = t;
});
o.seenByCat = seen; o.catStats = stats;
var out = sanitize(o);
Object.keys(out.best).forEach(function (k) { out.records.bestPoints = Math.max(out.records.bestPoints, out.best[k].points); });
out.migratedFrom = 1;
return out;
}
function state() {
if (mem) return mem;
var raw = null;
try { raw = localStorage.getItem(KEY); } catch (e) { storageOk = false; }
if (raw) {
try { mem = sanitize(JSON.parse(raw)); }
catch (e) {
try { localStorage.setItem(KEY + ":corrupto", raw); } catch (e2) { /* sin espacio */ }
mem = blank();
}
return mem;
}
mem = blank();
try {
var old = localStorage.getItem(OLD_KEY);
if (old) { mem = migrateV1(JSON.parse(old)); save(); }
} catch (e) { mem = blank(); }
return mem;
}
function save() { try { localStorage.setItem(KEY, JSON.stringify(mem)); } catch (e) { storageOk = false; } }
function resetAll() {
mem = blank();
try { localStorage.removeItem(KEY); localStorage.removeItem(OLD_KEY); localStorage.removeItem(KEY + ":corrupto"); } catch (e) { /* ignorar */ }
}
function streakNow() {
var s = state().streak, today = dayInTz();
if (!s.last_day) return 0;
return (s.last_day === today || s.last_day === addDay(today, -1)) ? s.current : 0;
}
function updateStreakChip() {
var n = streakNow();
$$("[data-streak]").forEach(function (el) { el.textContent = n; });
var chip = $(".streak-chip");
if (chip) {
chip.classList.toggle("is-on", n > 0); chip.classList.toggle("is-hot", n >= 3);
chip.setAttribute("aria-label", "Racha: " + n + (n === 1 ? " día" : " días") + ". Ver mi progreso");
}
}
function dailyDone(day) { var d = state().daily[day || dayInTz()]; return d && d.v === 2 ? d : null; }
var ACH = [
{ code: "primer_reto", name: "Primer reto", desc: "Completa tu primer reto.", test: function () { return true; } },
{ code: "reto_diario", name: "Cita diaria", desc: "Completa un reto del día.", test: function (x) { return !!x.daily; } },
{ code: "sin_fallos", name: "Sin fallos", desc: "100 % de precisión en un reto.", test: function (x) { return x.res.accuracy === 100 && !x.opinion; } },
{ code: "relampago", name: "Relámpago", desc: "Sin fallos y en menos de la mitad del tiempo orientativo.", test: function (x) { return x.res.accuracy === 100 && !x.opinion && x.ch && x.seconds <= x.ch.duration / 2; } },
{ code: "diario_perfecto", name: "Día redondo", desc: "Todas las pruebas del reto del día sin un fallo.", test: function (x) { return x.daily && x.res.accuracy === 100; } },
{ code: "record", name: "Nuevo récord", desc: "Supera tu propia marca.", test: function (x) { return x.record; } },
{ code: "racha_3", name: "Tres seguidos", desc: "Racha de 3 días.", test: function (x) { return x.st.streak.current >= 3; } },
{ code: "racha_7", name: "Semana redonda", desc: "Racha de 7 días.", test: function (x) { return x.st.streak.current >= 7; } },
{ code: "racha_30", name: "Nivel leyenda", desc: "Racha de 30 días.", test: function (x) { return x.st.streak.current >= 30; } },
{ code: "diez_partidas", name: "Diez partidas", desc: "Juega diez retos.", test: function (x) { return x.st.games >= 10; } },
{ code: "explorador", name: "Explorador", desc: "Juega en seis categorías distintas.", test: function (x) { return Object.keys(x.st.catStats).filter(function (c) { return catBySlug[c] && !catBySlug[c].hidden; }).length >= 6; } },
{ code: "maestro_logica", name: "Maestro de la lógica", desc: "Supera 10 retos de lógica con un 80 % o más.", test: function (x) { return x.st.logicWins >= 10; } },
{ code: "sesion", name: "Sesión completa", desc: "Termina una sesión de 10 retos.", test: function () { return false; } },
{ code: "retador", name: "Retador", desc: "Envía tu primer duelo.", test: function () { return false; } },
{ code: "duelo_ganado", name: "Ganas el duelo", desc: "Supera la marca de quien te retó.", test: function () { return false; } }
];
function unlock(code) {
var st = state();
if (st.ach[code]) return null;
st.ach[code] = Date.now(); save();
for (var i = 0; i < ACH.length; i++) if (ACH[i].code === code) return ACH[i];
return null;
}
function checkAch(x) {
var st = state(), fresh = [];
ACH.forEach(function (a) { if (!st.ach[a.code] && a.test(x)) { st.ach[a.code] = Date.now(); fresh.push(a); } });
return fresh;
}
function bumpStreak() {
var st = state(), today = dayInTz(), s = st.streak, extended = false;
if (s.last_day !== today) {
s.current = (s.last_day === addDay(today, -1)) ? s.current + 1 : 1;
s.last_day = today; s.total_days += 1; s.best = Math.max(s.best, s.current); extended = true;
}
if (extended) track("streak_extended", { streak: s.current });
return s.current;
}
function histEntry(ch) { return { kind: ch.kind, family: famOf(ch), cat: ch.cat, tier: tierOf(ch.difficulty) }; }
function noteRound(ch, res) {
var st = state(), opinion = isOpinion(ch);
var cs = st.catStats[ch.cat] || { g: 0, acc: 0, n: 0 };
cs.g += 1; if (!opinion) { cs.acc += res.accuracy; cs.n += 1; }
st.catStats[ch.cat] = cs;
if (!opinion) { st.accSum += res.accuracy; st.accN += 1; if (res.accuracy === 100) st.records.perfects += 1; }
if (!opinion && res.accuracy >= 80 && ch.cat === "logica") st.logicWins += 1;
st.recent.push(histEntry(ch)); if (st.recent.length > 12) st.recent.splice(0, st.recent.length - 12);
var f = famOf(ch); st.famCount[f] = (st.famCount[f] || 0) + 1;
sigsOf(ch).forEach(function (s) { if (st.recentSigs.indexOf(s) === -1) st.recentSigs.push(s); });
if (st.recentSigs.length > 500) st.recentSigs.splice(0, st.recentSigs.length - 500);
markSeen(ch.cat, keyOf(ch));
}
function addDayPoints(points) {
var st = state(), today = dayInTz(), day = st.days[today] || { points: 0, games: 0 };
day.points += points; day.games += 1; st.days[today] = day;
var keys = Object.keys(st.days).sort();
while (keys.length > 60) delete st.days[keys.shift()];
}
function registerPlay(ch, res, seconds, answers) {
var st = state(), opinion = isOpinion(ch), bestKey = ch.generated ? ch.key : ch.slug;
var prev = st.best[bestKey], record = !opinion && !!prev && res.points > prev.points;
if (!opinion && (!prev || res.points > prev.points)) st.best[bestKey] = { points: res.points, seconds: seconds, accuracy: res.accuracy };
st.history.unshift({ slug: ch.slug, title: ch.title, cat: ch.cat, points: res.points, accuracy: res.accuracy, seconds: seconds, at: Date.now(), grid: gridOf(answers) });
st.history = st.history.slice(0, 80);
st.points += res.points; st.games += 1;
st.records.bestPoints = Math.max(st.records.bestPoints, res.points);
addDayPoints(res.points);
noteRound(ch, res);
var streak = bumpStreak();
var fresh = checkAch({ res: res, seconds: seconds, ch: ch, st: st, opinion: opinion, record: record });
save(); updateStreakChip();
track("challenge_completed", { slug: ch.slug, cat: ch.cat, points: res.points, accuracy: res.accuracy });
return { record: record, streak: streak, fresh: fresh };
}
function gridOf(answers) { return (answers || []).slice(0, 10).map(function (ok) { return ok ? "v" : "x"; }).join(""); }
var STATIC_FAMILY = { opcion_multiple: "trivia", secuencia: "sec", respuesta_texto: "texto", verdadero_falso: "vf", ordenar: "ordenar", emparejar: "parejas", estimar: "estimar", memoria: "memoria" };
function famOf(ch) { return ch.family || STATIC_FAMILY[ch.kind] || ch.kind; }
function keyOf(ch) { return ch.key || ch.slug; }
function tierMatches(difficulty, tierFilter) {
if (!tierFilter || tierFilter === "todas") return true;
if (tierFilter === "facil") return difficulty <= 2;
if (tierFilter === "normal") return difficulty === 3;
if (tierFilter === "dificil") return difficulty === 4;
if (tierFilter === "experto") return difficulty >= 5;
return true;
}
function seenSetFor(cat) {
var st = state();
if (!st.seenByCat[cat]) st.seenByCat[cat] = [];
return st.seenByCat[cat];
}
function markSeen(cat, key) {
var arr = seenSetFor(cat);
if (arr.indexOf(key) === -1) arr.push(key);
if (arr.length > 400) arr.splice(0, arr.length - 400);
}
function sigClash(ch, ctx) { return sigsOf(ch).some(function (s) { return ctx.sigs[s]; }); }
function staleness(ch) {
var glob = state().recentSigs, sigs = sigsOf(ch), n = 0;
sigs.forEach(function (s) { if (glob.indexOf(s) !== -1) n++; });
return sigs.length ? n / sigs.length : 0;
}
function collectCandidates(cat, kindFilter, tierFilter, ctx, relax) {
var seen = seenSetFor(cat), out = [], last = ctx.lastSlug;
CHALLENGES.forEach(function (c) {
if (c.cat !== cat) return;
if (kindFilter !== "todas" && c.kind !== kindFilter) return;
if (!tierMatches(c.difficulty, tierFilter)) return;
if (relax < 2 && ctx.played[c.slug]) return;
if (c.slug === last) return;
if (!relax && seen.indexOf(c.slug) !== -1) return;
if (relax < 2 && sigClash(c, ctx)) return;
if (!validateChallenge(c)) return;
out.push(c);
});
(GENERATORS[cat] || []).forEach(function (g) {
if (kindFilter !== "todas" && g.kind !== kindFilter) return;
for (var a = 0; a < 4; a++) {
var t = (tierFilter && tierFilter !== "todas") ? tierFilter : TIERS[Math.floor(Math.random() * TIERS.length)];
var made = makeGenerated(cat, g.id, t, randomSeed());
if (!made || !validateChallenge(made)) continue;
if (!tierMatches(made.difficulty, tierFilter)) continue;
if (relax < 2 && ctx.played[made.key]) continue;
if (!relax && seen.indexOf(made.key) !== -1) continue;
if (relax < 2 && sigClash(made, ctx)) continue;
out.push(made); break;
}
});
return out;
}
function varietyScore(ch, hist) {
var s = 0, k = ch.kind, f = famOf(ch), c = ch.cat, t = tierOf(ch.difficulty), last = hist.slice(-4);
last.forEach(function (h, i) {
var w = (i + 1) / last.length;
if (h.kind === k) s -= 2.2 * w;
if (h.family === f) s -= 3 * w;
if (h.cat === c) s -= 1.2 * w;
});
var l2 = hist.slice(-2);
if (l2.length === 2 && l2[0].tier === t && l2[1].tier === t) s -= 2;
if (!ch.generated) s += 1.2;
s -= 3 * staleness(ch);
s -= Math.min(1.5, (state().famCount[f] || 0) / 40);
return s + Math.random() * 1.4;
}
function chooseBest(cands, hist) {
var best = null, bs = -1e9;
cands.forEach(function (c) { var s = varietyScore(c, hist); if (s > bs) { bs = s; best = c; } });
return best;
}
function nextChallengeFor(cat, kindFilter, tierFilter, ctx, allowRepeat) {
var cands = collectCandidates(cat, kindFilter, tierFilter, ctx, 0);
if (cands.length) return { ch: chooseBest(cands, ctx.hist), cycle: false };
cands = collectCandidates(cat, kindFilter, tierFilter, ctx, 1);
if (cands.length) { seenSetFor(cat).length = 0; save(); return { ch: chooseBest(cands, ctx.hist), cycle: true }; }
if (allowRepeat) {
cands = collectCandidates(cat, kindFilter, tierFilter, ctx, 2);
if (cands.length) return { ch: chooseBest(cands, ctx.hist), cycle: true };
}
return null;
}
function safeNext(cat, kindFilter, tierFilter, ctx) {
var steps = [[kindFilter, tierFilter], [kindFilter, "todas"], ["todas", tierFilter], ["todas", "todas"]];
for (var pass = 0; pass < 2; pass++) {
for (var i = 0; i < steps.length; i++) {
var r = nextChallengeFor(cat, steps[i][0], steps[i][1], ctx, pass === 1);
if (r) { if (steps[i][0] !== kindFilter) r.relaxedKind = true; return r; }
}
}
var any = CHALLENGES.filter(function (c) { return c.cat === cat && validateChallenge(c); });
return any.length ? { ch: any[Math.floor(Math.random() * any.length)], cycle: true } : null;
}
var SESSION_LEN = 10;
var MODES = [
{ id: "sorpresa", name: "Sorpréndeme", desc: "Mecánicas y dificultad variadas, de menos a más. La forma más divertida.", featured: true },
{ id: "adaptativo", name: "Adaptativo", desc: "Sube si aciertas, baja si fallas." },
{ id: "facil", name: "Fácil", desc: "Para calentar." },
{ id: "normal", name: "Normal", desc: "El punto justo." },
{ id: "dificil", name: "Difícil", desc: "Hay que pensar." },
{ id: "experto", name: "Experto", desc: "Solo para valientes." }
];
function groupFor(slug) {
if (slug === "sorpresa") return { slug: "sorpresa", name: "Sorpréndeme", icon: "sorpresa", color: "#5B21E8", short: "Todas las categorías mezcladas.", cats: PUBLIC_CATS.map(function (c) { return c.slug; }) };
slug = LEGACY_CATS[slug] || slug;
var c = catBySlug[slug];
return c ? { slug: c.slug, name: c.name, icon: c.icon, color: c.color, short: c.short, cats: [c.slug], hidden: c.hidden } : null;
}
function createSession(group, mode, kind) {
return {
group: group, cats: group.cats.slice(), mode: mode || "sorpresa", kind: kind || "todas",
i: 0, total: SESSION_LEN, level: 1, points: 0, correct: 0, answers: 0, seconds: 0, passed: 0,
rounds: [], tiers: [], records: 0, ctx: { played: {}, sigs: {}, hist: state().recent.slice(-3), lastSlug: null }, notices: {}
};
}
function sessionTier(s) {
if (TIERS.indexOf(s.mode) !== -1) return s.mode;
if (s.mode === "adaptativo") return TIERS[Math.max(0, Math.min(3, Math.round(s.level)))];
var p = s.i / s.total, b = Math.min(3, Math.floor(p * 3.6));
var opts = [Math.max(0, b - 1), b, b, Math.min(3, b + 1)], last = s.tiers.slice(-2);
var choices = opts.filter(function (t) { return !(last.length === 2 && last[0] === t && last[1] === t); });
if (!choices.length) choices = opts;
var t = choices[Math.floor(Math.random() * choices.length)];
if (last.length && t === last[last.length - 1] && Math.random() < 0.6) {
var alt = choices.filter(function (x) { return x !== last[last.length - 1]; });
if (alt.length) t = alt[Math.floor(Math.random() * alt.length)];
}
return TIERS[t];
}
function sessionPick(s) {
var tier = sessionTier(s), ctx = s.ctx, cats = s.cats.slice(), pool = [];
if (cats.length > 2) {
var recentCats = ctx.hist.slice(-2).map(function (h) { return h.cat; });
cats = shuffleWith(cats, Math.random).sort(function (a, b) { return (recentCats.indexOf(a) !== -1 ? 1 : 0) - (recentCats.indexOf(b) !== -1 ? 1 : 0); }).slice(0, 4);
}
cats.forEach(function (c) { pool = pool.concat(collectCandidates(c, s.kind, tier, ctx, 0)); });
if (pool.length) return { ch: chooseBest(pool, ctx.hist), tier: tier };
for (var i = 0; i < cats.length; i++) { var r = safeNext(cats[i], s.kind, tier, ctx); if (r) return r; }
return null;
}
function sessionRemember(s, ch) {
var ctx = s.ctx;
ctx.played[ch.slug] = true; ctx.played[keyOf(ch)] = true; ctx.lastSlug = ch.slug;
sigsOf(ch).forEach(function (x) { ctx.sigs[x] = true; });
ctx.hist.push(histEntry(ch));
s.tiers.push(TIERS.indexOf(tierOf(ch.difficulty)));
}
function adaptLevel(s, res, ch, seconds) {
if (s.mode !== "adaptativo" || isOpinion(ch)) return;
var delta = 0, fast = seconds <= ch.duration;
if (res.accuracy >= 90) delta = fast ? 0.6 : 0.4;
else if (res.accuracy >= 70) delta = 0.25;
else if (res.accuracy < 50) delta = -0.5;
s.level = Math.max(0, Math.min(3, s.level + delta));
}
var TAP_GUARD = 220;
function tooSoon(t0) { return Date.now() - t0 < TAP_GUARD; }
function nextLabel(last) { return last ? "Ver resultado" : "Siguiente"; }
function nextBtn(last) { return '<button type="button" class="btn btn-primary btn-block" data-next hidden>' + nextLabel(last) + (last ? "" : icon("arrow")) + "</button>"; }
function setFeedback(fb, ok, badMsg, explica, okMsg) {
fb.className = "feedback " + (ok ? "is-ok" : "is-bad");
fb.innerHTML = "<strong>" + (ok ? esc(okMsg || "¡Correcto!") : "No.") + "</strong>" + (!ok && badMsg ? " " + esc(badMsg) : "") +
(explica ? '<span class="explain">' + esc(explica) + "</span>" : "");
restartAnim(fb, "anim");
}
function qHead(q) {
return '<h2 class="q-text" tabindex="-1">' + esc(q.pregunta) + "</h2>" + (q.visual ? '<div class="q-visual">' + esc(q.visual) + "</div>" : "");
}
function focusQ(host) { var qt = $(".q-text", host); if (qt) qt.focus({ preventScroll: true }); }
function typingTarget(e) { var t = e.target; return t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable); }
var LETTERS = "ABCDEFGH";
function mcq(data, host, control) {
var qs = data.preguntas || [], i = 0;
function paint() {
var q = qs[i], last = i === qs.length - 1, done = false, t0 = Date.now();
control.progress(i, qs.length);
host.innerHTML = qHead(q) +
'<div class="options' + (q.emoji ? " options-2" : "") + '" role="group" aria-label="Respuestas">' +
q.opciones.map(function (t, k) { return '<button type="button" class="option' + (q.emoji ? " option-emoji" : "") + '" data-i="' + k + '">' + (q.emoji ? "" : '<span class="key" aria-hidden="true">' + LETTERS.charAt(k) + "</span>") + "<span>" + esc(t) + '</span><span class="mark" aria-hidden="true"></span></button>'; }).join("") +
'</div><p class="feedback" aria-live="polite"></p><div class="actions">' + nextBtn(last) + "</div>";
var next = $("[data-next]", host), fb = $(".feedback", host), opts = $$(".option", host);
function choose(btn) {
if (done || tooSoon(t0)) return;
done = true;
var chosen = +btn.dataset.i;
if (q.libre) {
control.answer(true);
opts.forEach(function (b) { b.disabled = true; b.classList.add(b === btn ? "is-selected" : "is-dim"); });
fb.className = "feedback is-ok"; fb.innerHTML = "<strong>Anotado.</strong> Compáralo con lo que elegirían tus amigos.";
restartAnim(fb, "anim");
} else {
var correct = +q.correcta, ok = chosen === correct;
control.answer(ok);
opts.forEach(function (b) {
var k = +b.dataset.i; b.disabled = true;
if (k === correct) { b.classList.add("is-ok"); $(".mark", b).innerHTML = icon("check"); }
else if (k === chosen) { b.classList.add("is-bad"); $(".mark", b).innerHTML = icon("x"); }
else b.classList.add("is-dim");
});
setFeedback(fb, ok, "Era: " + q.opciones[correct] + ".", q.explica);
}
next.hidden = false; next.focus();
}
opts.forEach(function (btn) { btn.addEventListener("click", function () { choose(btn); }); });
control.keys(function (e) {
if (done || typingTarget(e)) return;
var k = e.key.toUpperCase(), idx = /^[1-8]$/.test(k) ? +k - 1 : LETTERS.indexOf(k);
if (idx >= 0 && idx < opts.length) { e.preventDefault(); choose(opts[idx]); }
});
next.addEventListener("click", function () { i++; if (i >= qs.length) { control.progress(qs.length, qs.length); control.finish(); } else paint(); });
focusQ(host);
}
paint();
}
function matchAnswer(q, value) {
if (typeof q.respuesta === "number") return numCandidates(value).some(function (n) { return Math.abs(n - q.respuesta) < 1e-9; });
var given = norm(value);
if (!given) return false;
if (norm(q.respuesta) === given) return true;
return (q.acepta || []).some(function (a) { return norm(a) === given; });
}
function inputRound(host, control, opts) {
var qs = opts.qs, i = 0;
function paint() {
var q = qs[i], last = i === qs.length - 1, revealed = false, numeric = opts.numeric(q);
control.progress(i, qs.length);
host.innerHTML = qHead(q) + (opts.note ? '<p class="muted small">' + opts.note(q) + "</p>" : "") +
'<label class="sr-only" for="answer-input">' + esc(opts.label) + "</label>" +
'<input class="text-input" id="answer-input" type="text" inputmode="' + (numeric ? "decimal" : "text") + '" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="' + esc(opts.placeholder(q)) + '" enterkeyhint="done" maxlength="40">' +
'<p class="feedback" aria-live="polite"></p>' +
'<div class="actions"><button type="button" class="btn btn-primary btn-block" data-check>Comprobar</button></div>';
var input = $(".text-input", host), btn = $("[data-check]", host), fb = $(".feedback", host);
function go() {
if (!revealed) {
var r = opts.judge(q, input.value);
if (r === null) { input.focus(); restartAnim(input, "is-bad"); setTimeout(function () { input.classList.remove("is-bad"); }, 450); return; }
revealed = true;
control.answer(r.ok);
input.disabled = true; input.classList.add(r.ok ? "is-ok" : "is-bad");
setFeedback(fb, r.ok, r.bad, r.explain);
btn.innerHTML = nextLabel(last) + (last ? "" : icon("arrow"));
btn.focus();
return;
}
i++;
if (i >= qs.length) { control.progress(qs.length, qs.length); control.finish(); } else paint();
}
btn.addEventListener("click", go);
input.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); if (!e.repeat) go(); } });
input.focus({ preventScroll: true });
}
paint();
}
function text(data, host, control) {
inputRound(host, control, {
qs: data.preguntas || [], label: "Tu respuesta",
numeric: function (q) { return typeof q.respuesta === "number"; },
placeholder: function (q) { return typeof q.respuesta === "number" ? "Escribe el número" : "Escribe la palabra"; },
judge: function (q, v) {
if (!v.trim()) return null;
var shown = typeof q.respuesta === "number" ? fmtNum(q.respuesta) : String(q.respuesta).toUpperCase();
return { ok: matchAnswer(q, v), bad: "Era " + shown + ".", explain: q.explica };
}
});
}
function estimate(data, host, control) {
inputRound(host, control, {
qs: data.preguntas || [], label: "Tu estimación",
numeric: function () { return true; },
note: function (q) { var t = Number(q.tolerancia || 0); return "Cuenta si caes dentro del margen" + (t ? " (±" + esc(fmtNum(t)) + ")" : "") + "."; },
placeholder: function () { return "Tu estimación"; },
judge: function (q, v) {
var vals = numCandidates(v);
if (!vals.length) return null;
var tol = Number(q.tolerancia || 0);
var ok = vals.some(function (x) { return Math.abs(x - Number(q.respuesta)) <= tol + 1e-9; });
return { ok: ok, bad: "El valor es " + fmtNum(q.respuesta) + ".", explain: ok ? "Valor exacto: " + fmtNum(q.respuesta) + "." : q.explica };
}
});
}
function trueFalse(data, host, control) {
var qs = data.preguntas || [], i = 0;
function paint() {
var q = qs[i], last = i === qs.length - 1, done = false, t0 = Date.now();
control.progress(i, qs.length);
host.innerHTML = qHead(q) +
'<div class="options options-2" role="group" aria-label="Respuestas"><button type="button" class="option" data-v="1"><span>Verdadero</span><span class="mark" aria-hidden="true"></span></button><button type="button" class="option" data-v="0"><span>Falso</span><span class="mark" aria-hidden="true"></span></button></div>' +
'<p class="feedback" aria-live="polite"></p><div class="actions">' + nextBtn(last) + "</div>";
var next = $("[data-next]", host), fb = $(".feedback", host), opts = $$(".option", host);
function choose(btn) {
if (done || tooSoon(t0)) return; done = true;
var ok = (btn.dataset.v === "1") === !!q.respuesta;
control.answer(ok);
opts.forEach(function (b) {
b.disabled = true;
if ((b.dataset.v === "1") === !!q.respuesta) { b.classList.add("is-ok"); $(".mark", b).innerHTML = icon("check"); }
else if (b === btn) { b.classList.add("is-bad"); $(".mark", b).innerHTML = icon("x"); }
});
setFeedback(fb, ok, "Era " + (q.respuesta ? "verdadero." : "falso."), q.explica);
next.hidden = false; next.focus();
}
opts.forEach(function (btn) { btn.addEventListener("click", function () { choose(btn); }); });
control.keys(function (e) {
if (done || typingTarget(e)) return;
var k = e.key.toLowerCase();
if (k === "v" || k === "1") { e.preventDefault(); choose(opts[0]); } else if (k === "f" || k === "2") { e.preventDefault(); choose(opts[1]); }
});
next.addEventListener("click", function () { i++; if (i >= qs.length) { control.progress(qs.length, qs.length); control.finish(); } else paint(); });
focusQ(host);
}
paint();
}
function order(data, host, control) {
var qs = data.preguntas || [], i = 0;
function paint() {
var q = qs[i], last = i === qs.length - 1, revealed = false, expected = q.elementos.slice();
var items = shuffleWith(expected, Math.random), selected = -1;
if (items.length > 1 && items.join("|") === expected.join("|")) items.reverse();
control.progress(i, qs.length);
host.innerHTML = qHead(q) + '<p class="muted small">Toca dos elementos para intercambiarlos.</p>' +
'<div class="sortable" data-sortable></div><p class="feedback" aria-live="polite"></p>' +
'<div class="actions"><button type="button" class="btn btn-primary btn-block" data-check>Comprobar</button></div>';
var box = $("[data-sortable]", host), btn = $("[data-check]", host), fb = $(".feedback", host);
function draw(focusIdx, cls) {
box.innerHTML = items.map(function (t, k) {
return '<button type="button" class="sort-item' + (k === selected ? " is-selected" : "") + (cls ? " " + cls : "") + '" data-k="' + k + '"' + (revealed ? " disabled" : "") +
' aria-label="Posición ' + (k + 1) + ": " + esc(t) + (k === selected ? ", seleccionado" : "") + '"><span class="num" aria-hidden="true">' + (k + 1) + "</span>" + esc(t) + "</button>";
}).join("");
$$(".sort-item", box).forEach(function (it) {
it.addEventListener("click", function () {
if (revealed) return;
var k = +it.dataset.k;
if (selected === -1) { selected = k; draw(k); return; }
if (selected === k) { selected = -1; draw(k); return; }
var tmp = items[selected]; items[selected] = items[k]; items[k] = tmp;
selected = -1; draw(k);
});
});
if (focusIdx !== undefined) { var f = $('[data-k="' + focusIdx + '"]', box); if (f) f.focus({ preventScroll: true }); }
}
draw();
btn.addEventListener("click", function () {
if (!revealed) {
revealed = true; selected = -1;
var ok = items.every(function (v, k) { return norm(v) === norm(expected[k]); });
control.answer(ok);
draw(undefined, ok ? "is-ok" : "is-bad");
setFeedback(fb, ok, "El orden correcto: " + expected.join(" → ") + ".", q.explica);
btn.innerHTML = nextLabel(last) + (last ? "" : icon("arrow"));
btn.focus();
return;
}
i++;
if (i >= qs.length) { control.progress(qs.length, qs.length); control.finish(); } else paint();
});
focusQ(host);
}
paint();
}
function pairs(data, host, control) {
var ps = data.parejas || [], done = 0, selected = null, finished = false, t0 = Date.now();
var left = shuffleWith(ps.map(function (p, i) { return { id: i, t: p.a }; }), Math.random);
var right = shuffleWith(ps.map(function (p, i) { return { id: i, t: p.b }; }), Math.random);
host.innerHTML = '<h2 class="q-text" tabindex="-1">' + esc(data.titulo || "Une cada pareja") + "</h2>" +
'<p class="muted small">Toca un elemento de la izquierda y después su pareja de la derecha.</p>' +
'<div class="match"><div class="match-col">' +
left.map(function (p) { return '<button type="button" class="match-item" data-side="l" data-id="' + p.id + '">' + esc(p.t) + "</button>"; }).join("") +
'</div><div class="match-col">' +
right.map(function (p) { return '<button type="button" class="match-item" data-side="r" data-id="' + p.id + '">' + esc(p.t) + "</button>"; }).join("") +
'</div></div><p class="feedback" aria-live="polite"></p>';
var fb = $(".feedback", host);
control.progress(0, ps.length, "0 de " + ps.length + " parejas");
$$(".match-item", host).forEach(function (it) {
it.addEventListener("click", function () {
if (finished || tooSoon(t0) || it.classList.contains("is-done")) return;
if (!selected) { selected = it; it.classList.add("is-selected"); it.setAttribute("aria-pressed", "true"); return; }
if (selected === it) { it.classList.remove("is-selected"); it.removeAttribute("aria-pressed"); selected = null; return; }
if (selected.dataset.side === it.dataset.side) { selected.classList.remove("is-selected"); selected.removeAttribute("aria-pressed"); selected = it; it.classList.add("is-selected"); it.setAttribute("aria-pressed", "true"); return; }
var a = selected, ok = a.dataset.id === it.dataset.id;
selected = null; a.classList.remove("is-selected"); a.removeAttribute("aria-pressed");
control.answer(ok);
if (ok) {
a.classList.add("is-done"); it.classList.add("is-done"); a.disabled = true; it.disabled = true; done++;
fb.className = "feedback is-ok"; fb.innerHTML = "<strong>Pareja correcta.</strong>"; restartAnim(fb, "anim");
control.progress(done, ps.length, done + " de " + ps.length + " parejas");
if (done === ps.length) { finished = true; setTimeout(control.finish, 500); }
} else {
a.classList.add("is-bad"); it.classList.add("is-bad");
fb.className = "feedback is-bad"; fb.innerHTML = "<strong>No.</strong> Esas no van juntas."; restartAnim(fb, "anim");
setTimeout(function () { a.classList.remove("is-bad"); it.classList.remove("is-bad"); }, 600);
}
});
});
focusQ(host);
}
function memoryOrder(data, host, control) {
var qs = data.preguntas || [], i = 0;
function paint() {
var q = qs[i], last = i === qs.length - 1, expected = q.elementos.slice(), ms = q.mostrar_ms || (1800 + 550 * expected.length);
control.progress(i, qs.length, "Memoriza");
host.innerHTML = qHead(q) +
'<div class="memo-row" aria-label="Secuencia: ' + esc(expected.join(" ")) + '">' + expected.map(function (t, k) { return '<span class="memo-item" style="animation-delay:' + (k * 60) + 'ms">' + esc(t) + "</span>"; }).join("") + "</div>" +
'<div class="memo-bar" aria-hidden="true"><span></span></div>' +
'<p class="feedback center" aria-live="polite">Desaparece en <b data-count>' + Math.ceil(ms / 1000) + "</b> s</p>";
var countEl = $("[data-count]", host), remaining = Math.ceil(ms / 1000), bar = $(".memo-bar span", host);
if (bar && !reducedMotion()) { bar.style.transition = "transform " + ms + "ms linear"; requestAnimationFrame(function () { requestAnimationFrame(function () { bar.style.transform = "scaleX(0)"; }); }); }
var tick = setInterval(function () { remaining--; if (countEl) countEl.textContent = Math.max(0, remaining); }, 1000);
var to = setTimeout(function () { clearInterval(tick); reveal(); }, ms);
control.timers.push(function () { clearInterval(tick); clearTimeout(to); });
focusQ(host);
function reveal() {
var picked = [], pool = shuffleWith(expected, Math.random);
if (pool.length > 1 && pool.join("|") === expected.join("|")) pool.reverse();
control.progress(i, qs.length, "Repite el orden");
host.innerHTML = '<h2 class="q-text" tabindex="-1">Ahora, en el mismo orden</h2>' +
'<div class="your-order" data-your aria-live="polite"></div>' +
'<div class="options options-2">' + pool.map(function (t) { return '<button type="button" class="option option-emoji" data-v="' + esc(t) + '">' + esc(t) + "</button>"; }).join("") + "</div>" +
'<p class="feedback" aria-live="polite"></p>' +
'<div class="actions"><button type="button" class="btn btn-ghost btn-sm" data-undo>Deshacer</button>' + nextBtn(last) + "</div>";
var yourBox = $("[data-your]", host), fb2 = $(".feedback", host), next = $("[data-next]", host), undo = $("[data-undo]", host), finished = false, t0 = Date.now();
function renderYour() { yourBox.innerHTML = expected.map(function (_, k) { return '<span class="your-slot">' + (picked[k] !== undefined ? esc(picked[k]) : (k + 1)) + "</span>"; }).join(""); }
renderYour();
$$(".option", host).forEach(function (btn) {
btn.addEventListener("click", function () {
if (btn.disabled || finished || tooSoon(t0)) return;
btn.disabled = true; btn.classList.add("is-selected");
picked.push(btn.dataset.v); renderYour();
if (picked.length === expected.length) {
finished = true; undo.hidden = true;
var ok = picked.every(function (v, k) { return v === expected[k]; });
control.answer(ok);
setFeedback(fb2, ok, "El orden era: " + expected.join(" "), null, "Memoria perfecta.");
next.hidden = false; next.focus();
}
});
});
undo.addEventListener("click", function () {
if (finished || !picked.length) return;
var v = picked.pop();
var b = $$(".option", host).filter(function (x) { return x.dataset.v === v; })[0];
if (b) { b.disabled = false; b.classList.remove("is-selected"); }
renderYour();
});
next.addEventListener("click", function () { i++; if (i >= qs.length) { control.progress(qs.length, qs.length); control.finish(); } else paint(); });
focusQ(host);
}
}
paint();
}
var MECH = { opcion_multiple: mcq, secuencia: mcq, respuesta_texto: text, verdadero_falso: trueFalse, ordenar: order, emparejar: pairs, estimar: estimate, memoria: memoryOrder };
function Game(stage, ch, opts) {
this.stage = stage; this.ch = ch; this.opts = opts || {};
this.intro = $("[data-intro]", stage); this.bar = $("[data-bar]", stage);
this.body = $("[data-body]", stage); this.result = $("[data-result]", stage);
this.correct = 0; this.answered = 0; this.total = 1; this.answers = []; this.timer = null; this.timers = []; this.done = false;
}
Game.prototype.start = function () {
var self = this;
this.intro.hidden = true; this.bar.hidden = false; this.body.hidden = false; this.result.hidden = true;
var live = $("[data-live]", this.bar), pill = $("[data-timer-pill]", this.bar);
var control = {
timers: this.timers,
answer: function (ok) {
self.answered++; self.answers.push(!!ok); if (ok) self.correct++;
if (live && !isOpinion(self.ch)) live.textContent = self.correct + (self.correct === 1 ? " acierto" : " aciertos");
},
progress: function (done, total, label) {
self.total = total;
$("[data-progress-text]", self.bar).textContent = label || ("Pregunta " + Math.min(done + 1, total) + " de " + total);
$("[data-progress-bar]", self.bar).style.width = Math.min(100, (done / total) * 100) + "%";
},
keys: function (fn) {
document.addEventListener("keydown", fn);
self.timers.push(function () { document.removeEventListener("keydown", fn); });
var prev = self.keyFn; if (prev) document.removeEventListener("keydown", prev);
self.keyFn = fn;
},
finish: function () { self.finish(); }
};
(MECH[this.ch.kind] || mcq)(this.ch.data, this.body, control);
this.startedAt = Date.now();
this.timer = setInterval(function () {
var s = Math.floor((Date.now() - self.startedAt) / 1000);
$("[data-timer]", self.bar).textContent = s;
if (pill) pill.classList.toggle("is-over", s > self.ch.duration);
}, 250);
track("challenge_started", { slug: this.ch.slug, cat: this.ch.cat });
};
Game.prototype.stop = function () {
clearInterval(this.timer);
this.timers.forEach(function (fn) { try { fn(); } catch (e) { /* ignorar */ } });
this.timers.length = 0;
};
Game.prototype.finish = function () {
if (this.done) return;
this.done = true; this.stop();
var seconds = Math.max(1, Math.round((Date.now() - this.startedAt) / 1000));
var total = Math.max(this.total, this.answered);
var res = score(this.ch, { correct: this.correct, total: total, seconds: seconds });
if (isOpinion(this.ch)) res.points = 0;
this.bar.hidden = true; this.body.hidden = true;
this.result.hidden = false;
if (this.opts.onDone) this.opts.onDone({ res: res, seconds: seconds, correct: this.correct, total: total, answers: this.answers.slice() }, this);
};
function mountGame(stage, ch, opts, autoStart) {
var g = new Game(stage, ch, opts);
if (autoStart) g.start();
else { var b = $("[data-start]", stage); if (b) b.addEventListener("click", function () { g.start(); }); }
return g;
}
function resultMessage(acc, fast) {
if (acc === 100 && fast) return "Impecable.";
if (acc === 100) return "Perfecto.";
if (acc >= 80) return "Casi perfecto.";
if (acc >= 50) return "Bien jugado.";
if (acc > 0) return "Hecho. Ahora, a por más.";
return "Esta vez no salió.";
}
function squaresHtml(grid, small) {
return '<ul class="squares' + (small ? " small" : "") + '" role="img" aria-label="' + esc(gridLabel(grid)) + '">' + grid.split("").map(function (g, i) {
return '<li class="is-' + (g === "v" ? "v" : g === "~" ? "m" : "x") + '" style="animation-delay:' + (i * 70) + 'ms">' + icon(g === "v" ? "check" : g === "~" ? "target" : "x") + "</li>";
}).join("") + "</ul>";
}
function gridLabel(grid) {
var v = (grid.match(/v/g) || []).length, m = (grid.match(/~/g) || []).length, x = (grid.match(/x/g) || []).length;
return v + " perfectas" + (m ? ", " + m + " a medias" : "") + ", " + x + " falladas";
}
function gridEmoji(grid) { return grid.split("").map(function (g) { return GRADE_EMOJI[g] || "⬜"; }).join(""); }
function statsHtml(items) { return '<ul class="stats">' + items.map(function (x) { return "<li>" + icon(x[0]) + esc(x[1]) + "</li>"; }).join("") + "</ul>"; }
function achHtml(list) { return (list || []).map(function (a, k) { return '<p class="unlocked" style="animation-delay:' + (250 + k * 120) + 'ms">' + icon("trophy") + "Logro desbloqueado: <b>" + esc(a.name) + "</b></p>"; }).join(""); }
function versusHtml(duel, mine, mySecs) {
var theirs = duel.p, win = mine > theirs, tie = mine === theirs;
return '<div class="versus"><div class="side' + (!win && !tie ? " is-winner" : "") + '"><span>' + esc(duel.n) + "</span><b>" + fmt(theirs) + "</b><small>" + duel.s + ' s</small></div><div class="vs">VS</div>' +
'<div class="side' + (win ? " is-winner" : "") + '"><span>' + esc(state().nick || "Tú") + "</span><b>" + fmt(mine) + "</b><small>" + mySecs + " s</small></div></div>" +
'<p class="verdict">' + (tie ? "Empate. Toca desempate." : win ? "Ganas tú." : esc(duel.n) + " gana esta vez.") + "</p>";
}
function nativeShare(data) {
if (!navigator.share) return false;
navigator.share(data).catch(function () { /* cancelado */ });
return true;
}
function mountDuelPanel(panel, spec) {
if (!panel) return;
if (!panel.hidden) { var f0 = $("#duel-nick", panel); if (f0) f0.focus(); return; }
var st = state();
panel.hidden = false;
panel.innerHTML = "<h3>¿Quién se atreve?</h3>" +
'<div class="duel-card"><small>RÉTAME · ' + esc(spec.title) + "</small><b>" + fmt(spec.points) + " puntos</b><p>en " + spec.seconds + " s. ¿Puedes superarlo?</p></div>" +
'<label for="duel-nick">Tu nombre en el duelo <span class="muted">(opcional)</span></label>' +
'<input class="field" id="duel-nick" maxlength="24" autocomplete="nickname" placeholder="Por ejemplo, Ana" value="' + esc(st.nick) + '">' +
'<div class="share-row" data-share-row></div>' +
'<p class="muted small">Quien abra el enlace juega lo mismo que tú y ve quién gana. Tu nombre y tu puntuación viajan dentro del enlace: compártelo solo con quien quieras.</p>';
var nick = $("#duel-nick", panel), row = $("[data-share-row]", panel);
function name() { return (nick.value || "").replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, 24) || "Alguien"; }
function link() { return spec.url(name()); }
function created(channel) {
st.duels += 1; save();
var a = unlock("retador"); if (a) toast("Logro desbloqueado: " + a.name);
track("duel_created", { channel: channel });
track("share_clicked", { channel: channel, what: "duelo" });
}
row.innerHTML =
'<a class="btn btn-wa btn-sm" target="_blank" rel="noopener" data-ch="whatsapp" href="#">' + icon("whatsapp") + "WhatsApp</a>" +
'<a class="btn btn-tg btn-sm" target="_blank" rel="noopener" data-ch="telegram" href="#">' + icon("telegram") + "Telegram</a>" +
'<button type="button" class="btn btn-ghost btn-sm" data-copy>' + icon("copy") + "Copiar</button>" +
(navigator.share ? '<button type="button" class="btn btn-ghost btn-sm" data-native>' + icon("share") + "Más…</button>" : '<a class="btn btn-ghost btn-sm" data-ch="email" href="#">Correo</a>');
function refreshLinks() {
var l = link(), msg = spec.text(name(), l);
var wa = $('[data-ch="whatsapp"]', row), tg = $('[data-ch="telegram"]', row), em = $('[data-ch="email"]', row);
wa.href = "https://wa.me/?text=" + encodeURIComponent(msg);
tg.href = "https://t.me/share/url?url=" + encodeURIComponent(l) + "&text=" + encodeURIComponent(msg.replace(l, "").trim());
if (em) em.href = "mailto:?subject=" + encodeURIComponent("¿Me superas en RÉTAME?") + "&body=" + encodeURIComponent(msg);
}
$$('[data-ch]', row).forEach(function (a) { a.addEventListener("click", function () { refreshLinks(); created(a.dataset.ch); }); });
$("[data-copy]", row).addEventListener("click", function () { var l = link(); copyText(spec.text(name(), l), this, "¡Copiado!"); created("copy"); });
var nat = $("[data-native]", row);
if (nat) nat.addEventListener("click", function () { var l = link(); nativeShare({ title: "RÉTAME", text: spec.text(name(), l).replace(l, "").trim(), url: l }); created("native"); });
nick.addEventListener("input", function () { st.nick = nick.value.trim().slice(0, 24); save(); refreshLinks(); });
refreshLinks();
if (!(window.matchMedia && matchMedia("(pointer: coarse)").matches)) nick.focus({ preventScroll: true });
panel.scrollIntoView({ block: "nearest", behavior: reducedMotion() ? "auto" : "smooth" });
}
function duelQuery(n, p, s, extra) {
var q = "n=" + encodeURIComponent(n) + "&p=" + p + "&s=" + s;
Object.keys(extra || {}).forEach(function (k) { if (extra[k] !== undefined && extra[k] !== "") q += "&" + k + "=" + encodeURIComponent(extra[k]); });
return q;
}
function duelUrl(ch, n, p, s) {
var extra = ch.seed !== undefined ? { k: ch.seed.toString(36) } : {};
if (!ch.generated && catBySlug[ch.cat] && !catBySlug[ch.cat].hidden) return absUrl(challengeUrl(ch)) + "?" + duelQuery(n, p, s, extra);
return absUrl(href("/duelos/")) + "?r=" + encodeURIComponent(ch.slug) + "&" + duelQuery(n, p, s, extra);
}
function parseDuel(q, maxP) {
if (q.n === undefined && q.p === undefined) return null;
var p = parseInt(q.p, 10), s = parseInt(q.s, 10);
var n = String(q.n || "").replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, 24) || "Alguien";
if (!(p >= 0 && p <= maxP) || !(s >= 1 && s <= 7200) || String(p) !== String(q.p).trim()) return { invalid: true };
var duel = { n: n, p: p, s: s };
if (q.g && /^[vx~]{1,10}$/.test(q.g)) duel.g = q.g;
if (q.k && /^[0-9a-z]{1,7}$/.test(q.k)) duel.k = parseInt(q.k, 36);
return duel;
}
function duelBanner(duel, what) {
return '<div class="banner" role="note"><h2>' + esc(duel.n) + " te reta</h2><p>" + esc(duel.n) + " ha sacado <b>" + fmt(duel.p) + " puntos</b> en " + duel.s + " s en " + esc(what) + ". ¿Puedes superarlo?</p>" +
(duel.g ? squaresHtml(duel.g, true) : "") + "</div>";
}
function nextSuggestion(ch) {
var st = state(), played = {};
st.history.forEach(function (h) { played[h.slug] = 1; });
var pool = PUBLIC_CHALLENGES.filter(function (c) { return c.cat === ch.cat && c.slug !== ch.slug && !played[c.slug]; });
if (pool.length) return challengeUrl(pool[Math.floor(Math.random() * pool.length)]);
return href("/juegos/?tema=" + (catBySlug[ch.cat] ? ch.cat : "sorpresa"));
}
function showSingleResult(game, out, ctx) {
var ch = game.ch, res = out.res, opinion = isOpinion(ch), reg = registerPlay(ch, res, out.seconds, out.answers);
var grid = gridOf(out.answers), fast = out.seconds <= ch.duration / 2;
var duel = ctx.duel, html = '<div class="result">';
if (opinion) {
html += '<p class="eyebrow">' + icon("grupo") + "En grupo</p><h2 class=\"result-title\" tabindex=\"-1\">Anotado.</h2>" +
'<p class="result-sub">No hay respuestas correctas: compara lo que has elegido con tus amigos.</p>';
} else {
html += '<p class="eyebrow">' + icon(catBySlug[ch.cat].icon) + esc(catBySlug[ch.cat].name) + '</p><h2 class="result-title" tabindex="-1">' + resultMessage(res.accuracy, fast) + "</h2>" +
'<p class="result-sub">' + esc(ch.title) + "</p>" +
'<div class="score"><b data-count>0</b><span>puntos de ' + fmt(ch.max_points) + "</span></div>" +
(reg.record ? '<p><span class="badge">' + icon("trophy") + "Nuevo récord personal</span></p>" : "") +
squaresHtml(grid, true) +
statsHtml([["target", res.accuracy + " % de precisión"], ["clock", out.seconds + " s"], ["flame", reg.streak + (reg.streak === 1 ? " día" : " días") + " de racha"]]);
}
if (duel && !duel.invalid && !opinion) {
html += versusHtml(duel, res.points, out.seconds);
if (res.points > duel.p) { var w = unlock("duelo_ganado"); if (w) reg.fresh.push(w); state().duelWins += 1; save(); }
track("duel_completed", { won: res.points > duel.p });
}
html += achHtml(reg.fresh);
html += '<div class="actions"><a class="btn btn-primary btn-lg" href="' + (ctx.nextUrl || nextSuggestion(ch)) + '">Jugar otro reto' + icon("arrow") + "</a>" +
(opinion ? "" : '<button type="button" class="btn btn-outline btn-lg" data-duel>' + icon("duel") + (duel && !duel.invalid ? "Retar de vuelta" : "Retar a un amigo") + "</button>") + "</div>" +
'<div class="link-row">' + (opinion ? "" : '<button type="button" class="text-link" data-share>' + icon("share") + "Compartir</button>") +
'<a href="' + href("/progreso/") + '">Ver progreso</a><a href="' + href("/reto-del-dia/") + '">Reto del día</a><a href="' + href("/retos/") + '">Otra categoría</a></div>' +
'<div class="panel" data-panel hidden></div>' +
(ctx.inlineSolution ? '<details class="fold solution"><summary>Ver la solución</summary><div><p>' + esc(ch.solution) + "</p></div></details>" : '<p class="link-row"><a href="#solucion">Ver la solución</a></p>') + "</div>";
game.result.innerHTML = html;
var title = $(".result-title", game.result); if (title) title.focus();
count($("[data-count]", game.result), res.points);
var shareBtn = $("[data-share]", game.result);
if (shareBtn) shareBtn.addEventListener("click", function () {
var url = absUrl(challengeUrl(ch)), txt = "RÉTAME · " + ch.title + "\n" + gridEmoji(grid) + "\n⚡ " + fmt(res.points) + " puntos · 🎯 " + res.accuracy + " %\n¿Puedes superarlo?";
track("share_clicked", { channel: navigator.share ? "native" : "copy", what: "resultado" });
if (!nativeShare({ title: "RÉTAME", text: txt, url: url })) copyText(txt + "\n" + url, shareBtn, "¡Resultado copiado!");
});
var d = $("[data-duel]", game.result);
if (d) d.addEventListener("click", function () {
mountDuelPanel($("[data-panel]", game.result), {
title: ch.title, points: res.points, seconds: out.seconds,
url: function (n) { return duelUrl(ch, n, res.points, out.seconds); },
text: function (n, l) { return (n !== "Alguien" ? n + " te reta en RÉTAME: " : "Te reto en RÉTAME: ") + "«" + ch.title + "».\n" + gridEmoji(grid) + " · " + fmt(res.points) + " puntos en " + out.seconds + " s.\n¿Puedes superarlo?\n" + l; }
});
});
}
function runSession(box, s, hooks) {
var game = null, alive = true;
function modeLabel() {
if (s.mode === "sorpresa") return "Dificultad sorpresa";
if (s.mode === "adaptativo") return "Nivel: " + TIER_LABELS[TIERS[Math.round(s.level)]];
return TIER_LABELS[s.mode];
}
function hud() {
var g = s.group;
return '<div class="session-hud"><div class="hud-row"><span class="hud-title">' + catTile(g) + esc(g.slug === "sorpresa" ? "Sesión sorpresa" : "Sesión de " + g.name) + "</span>" +
(g.hidden ? "" : '<span class="hud-pts"><b data-hud-pts>' + fmt(s.points) + "</b> pts</span>") + "</div>" +
'<div class="track" style="margin-top:10px" role="progressbar" aria-label="Progreso de la sesión" aria-valuemin="0" aria-valuemax="' + s.total + '" aria-valuenow="' + s.i + '"><span style="width:' + Math.round(s.i / s.total * 100) + '%"></span></div>' +
'<div class="hud-row sub"><span>Reto ' + (s.i + 1) + " de " + s.total + " · " + esc(modeLabel()) + '</span><button type="button" class="hud-exit" data-hud-exit>Terminar</button></div></div>';
}
function scrollToBox() {
var y = box.getBoundingClientRect().top + (window.pageYOffset || 0) - 80;
if ((window.pageYOffset || 0) > y) window.scrollTo(0, Math.max(0, y));
}
function round() {
if (!alive) return;
var found = sessionPick(s);
if (!found) { toast("No hemos podido preparar otro reto. Prueba con otra categoría."); end(); return; }
var ch = needsSeed(found.ch) ? instantiate(found.ch, randomSeed()) : found.ch;
if (found.cycle && !s.notices.cycle) { s.notices.cycle = 1; toast("Has visto todo lo de aquí. Empezamos un ciclo nuevo, mezclado de otra forma."); }
else if (found.relaxedKind && !s.notices.kind) { s.notices.kind = 1; toast("Se acabaron los retos de ese tipo: seguimos con otros del mismo tema."); }
sessionRemember(s, ch);
if (game) { game.stop(); game = null; }
box.innerHTML = hud() + stageHtml(ch);
$("[data-hud-exit]", box).addEventListener("click", function () { if (s.rounds.length) end(); else exit(); });
game = mountGame($("[data-stage]", box), ch, { onDone: function (out, g) {
var before = s.points, res = out.res, opinion = isOpinion(ch);
var reg = registerPlay(ch, res, out.seconds, out.answers);
s.points += res.points; s.seconds += out.seconds;
if (!opinion) { s.correct += out.correct; s.answers += out.total; }
if (res.accuracy >= 50) s.passed++;
if (reg.record) s.records++;
s.rounds.push({ ch: ch, points: res.points, seconds: out.seconds, accuracy: res.accuracy, answers: out.answers });
adaptLevel(s, res, ch, out.seconds);
count($("[data-hud-pts]", box), s.points, before);
var fill = $(".session-hud .track span", box); if (fill) fill.style.width = Math.round((s.i + 1) / s.total * 100) + "%";
var isLast = s.i === s.total - 1;
g.result.innerHTML = '<div class="result">' +
(opinion ? '<h2 class="result-title" tabindex="-1">Anotado.</h2>' :
'<h2 class="result-title" tabindex="-1">' + resultMessage(res.accuracy, out.seconds <= ch.duration / 2) + '</h2><div class="score"><b data-count>0</b><span>puntos</span></div>' + squaresHtml(gridOf(out.answers), true) +
statsHtml([["target", res.accuracy + " %"], ["clock", out.seconds + " s"]]) + (reg.record ? '<p><span class="badge">' + icon("trophy") + "Nuevo récord</span></p>" : "")) +
achHtml(reg.fresh) +
'<div class="actions"><button type="button" class="btn btn-primary btn-lg" data-next-reto>' + (isLast ? "Ver resumen" : "Siguiente reto" + icon("arrow")) + "</button></div>" +
'<div class="link-row"><button type="button" class="text-link" data-exit-session>Terminar sesión</button></div>' +
'<details class="fold solution"><summary>Ver la solución</summary><div><p>' + esc(ch.solution) + "</p></div></details></div>";
var t = $(".result-title", g.result); if (t) t.focus();
count($("[data-count]", g.result), res.points);
var used = false;
$("[data-next-reto]", g.result).addEventListener("click", function () { if (used) return; used = true; s.i++; if (s.i >= s.total) end(); else { round(); scrollToBox(); } });
$("[data-exit-session]", g.result).addEventListener("click", end);
} }, true);
}
function end() {
if (game) { game.stop(); game = null; }
if (!alive) return;
var st = state(), n = s.rounds.length;
if (!n) { exit(); return; }
var prec = s.answers ? Math.round(s.correct / s.answers * 100) : null;
var best = s.rounds.filter(function (r) { return !isOpinion(r.ch); }).sort(function (a, b) { return b.points - a.points; })[0];
var full = n >= s.total;
st.sessions += 1;
var bestSession = full && s.points > st.bestSession && st.sessions > 1;
if (full && s.points > st.bestSession) st.bestSession = s.points;
save();
var ach = full ? unlock("sesion") : null;
var title = prec === null ? "Sesión completada." : prec >= 90 ? "Sesión brutal." : prec >= 70 ? "Muy buena sesión." : prec >= 40 ? "Bien jugado." : "A por la próxima.";
box.innerHTML = '<section class="stage"><div class="result">' +
'<p class="eyebrow">' + icon("trophy") + (full ? "Sesión completada" : "Sesión terminada") + "</p>" +
'<h2 class="result-title" tabindex="-1">' + title + "</h2>" +
'<p class="result-sub">' + esc(s.group.slug === "sorpresa" ? "Sesión sorpresa" : s.group.name) + " · " + n + " " + (n === 1 ? "reto" : "retos") + "</p>" +
(s.group.hidden ? "" : '<div class="score"><b data-count>0</b><span>puntos</span></div>') +
(bestSession ? '<p><span class="badge">' + icon("trophy") + "Tu mejor sesión</span></p>" : "") +
squaresHtml(s.rounds.map(function (r) { return isOpinion(r.ch) ? "v" : gradeOf(r.accuracy); }).join("").slice(0, 10), true) +
'<div class="tiles four end-tiles">' +
'<div class="tile"><b>' + s.passed + "/" + n + "</b><span>retos superados</span></div>" +
'<div class="tile"><b>' + (prec === null ? "—" : prec + " %") + "</b><span>precisión</span></div>" +
'<div class="tile"><b>' + mmss(s.seconds) + "</b><span>tiempo jugado</span></div>" +
'<div class="tile"><b class="is-amber">' + icon("flame") + streakNow() + "</b><span>días de racha</span></div></div>" +
(best ? '<p class="muted">Tu mejor reto: «' + esc(best.ch.title) + "» · " + fmt(best.points) + " pts</p>" : "") +
(ach ? achHtml([ach]) : "") +
'<div class="actions"><button type="button" class="btn btn-primary btn-lg" data-again-session>Jugar otra sesión' + icon("repeat") + "</button>" +
(best ? '<button type="button" class="btn btn-outline btn-lg" data-duel>' + icon("duel") + "Retar a un amigo</button>" : "") + "</div>" +
'<div class="link-row"><a href="' + href("/reto-del-dia/") + '">Reto del día</a><a href="' + href("/juegos/") + '">Otra categoría</a><a href="' + href("/progreso/") + '">Ver progreso</a></div>' +
'<div class="panel" data-panel hidden></div></div></section>';
var t = $(".result-title", box); if (t) t.focus();
count($("[data-count]", box), s.points);
$("[data-again-session]", box).addEventListener("click", function () { if (!alive) return; alive = false; hooks.restart(); });
var dbtn = $("[data-duel]", box);
if (dbtn) dbtn.addEventListener("click", function () {
var bc = best.ch;
mountDuelPanel($("[data-panel]", box), {
title: bc.title, points: best.points, seconds: best.seconds,
url: function (nm) { return duelUrl(bc, nm, best.points, best.seconds); },
text: function (nm, l) { return (nm !== "Alguien" ? nm + " te reta en RÉTAME: " : "Te reto en RÉTAME: ") + "«" + bc.title + "», " + fmt(best.points) + " puntos en " + best.seconds + " s. ¿Puedes superarlo?\n" + l; }
});
});
scrollToBox();
track("session_completed", { group: s.group.slug, rounds: n, points: s.points });
}
function exit() { alive = false; if (game) { game.stop(); game = null; } hooks.onExit(); }
track("category_started", { group: s.group.slug, mode: s.mode });
round();
return function () { alive = false; if (game) { game.stop(); game = null; } };
}
function roundTile(r, grade) {
var c = catBySlug[r.ch.cat];
return '<li class="round' + (grade ? " is-" + (grade === "v" ? "v" : grade === "~" ? "m" : "x") : "") + '">' + icon(c.icon) + "<span>" + esc(c.label || c.name) + "</span></li>";
}
function roundsHtml(set, grid, now) {
return '<ul class="rounds' + (set.rounds.length === 4 ? " n4" : "") + '" aria-label="Pruebas de hoy: ' + esc(set.rounds.map(function (r) { return catBySlug[r.ch.cat].name; }).join(", ")) + '">' +
set.rounds.map(function (r, i) { var t = roundTile(r, grid ? grid.charAt(i) : ""); return i === now ? t.replace('class="round', 'class="round is-now') : t; }).join("") + "</ul>";
}
function dailyShareText(set, rec, withStreak) {
var s = streakNow();
return "RÉTAME #" + set.number + " · " + shortDate(set.day) + "\n" + gridEmoji(rec.grid) + "\n⚡ " + fmt(rec.points) + "/1000 · 🎯 " + rec.acc + " %" +
(withStreak && s > 1 ? "\n🔥 Racha: " + s + " días" : "");
}
function dailyDuelUrl(set, n, rec) {
return absUrl(href("/reto-del-dia/")) + "?d=" + set.day + "&" + duelQuery(n, rec.points, rec.secs, { g: rec.grid });
}
function runDaily(box, set, opts) {
opts = opts || {};
var st = state(), today = dayInTz(), official = !opts.practice && !opts.duel && set.day === today;
var results = [], i = 0, totalSecs = 0, game = null, alive = true;
if (official && st.dailyRun && st.dailyRun.day === set.day && st.dailyRun.sig === set.sig) {
results = st.dailyRun.results.slice(0, set.rounds.length); i = results.length; totalSecs = st.dailyRun.secs;
}
function persistRun() {
if (!official) return;
st.dailyRun = { day: set.day, sig: set.sig, secs: totalSecs, results: results.map(function (r) { return { points: r.points, accuracy: r.accuracy, seconds: r.seconds }; }) };
save();
}
function grid() { return results.map(function (r) { return gradeOf(r.accuracy); }).join(""); }
function hud() {
return '<div class="session-hud"><div class="hud-row"><span class="hud-title">' + icon("calendar") + "Reto del día #" + set.number + (opts.practice ? " · práctica" : "") + "</span>" +
'<span class="hud-pts">Prueba <b>' + (i + 1) + "</b> de " + set.rounds.length + "</span></div>" + roundsHtml(set, grid(), i).replace('class="rounds', 'class="rounds rounds-hud') + "</div>";
}
function play() {
if (!alive) return;
if (i >= set.rounds.length) { finish(); return; }
var r = set.rounds[i], ch = r.ch;
if (game) { game.stop(); game = null; }
box.innerHTML = hud() + stageHtml(ch);
game = mountGame($("[data-stage]", box), ch, { onDone: function (out, g) {
var res = out.res;
results.push({ points: res.points, accuracy: res.accuracy, seconds: out.seconds, ch: ch });
totalSecs += out.seconds;
persistRun();
var last = i === set.rounds.length - 1;
var gr = gradeOf(res.accuracy);
g.result.innerHTML = '<div class="result">' + squaresHtml(gr, false) +
'<h2 class="result-title" tabindex="-1">' + (gr === "v" ? "Perfecta." : gr === "~" ? "A medias." : "Fallada.") + "</h2>" +
'<p class="result-sub">Prueba ' + (i + 1) + " de " + set.rounds.length + " · " + res.accuracy + " % · " + out.seconds + " s</p>" +
'<div class="actions"><button type="button" class="btn btn-primary btn-lg" data-next-round>' + (last ? "Ver mi resultado" : "Siguiente prueba" + icon("arrow")) + "</button></div>" +
'<details class="fold solution"><summary>Ver la solución</summary><div><p>' + esc(ch.solution) + "</p></div></details></div>";
var t = $(".result-title", g.result); if (t) t.focus();
var used = false;
$("[data-next-round]", g.result).addEventListener("click", function () { if (used) return; used = true; i++; play(); window.scrollTo(0, Math.max(0, box.getBoundingClientRect().top + window.pageYOffset - 80)); });
} }, true);
}
function finish() {
var acc = Math.round(results.reduce(function (a, r) { return a + r.accuracy; }, 0) / Math.max(1, results.length));
var rec = { points: dailyScore(set, results), acc: acc, secs: Math.max(1, Math.round(totalSecs)), grid: grid(), v: 2 };
var fresh = [], record = false, streak = streakNow();
if (official) {
st.dailyRun = null;
var had = st.daily[set.day];
st.daily[set.day] = rec;
record = st.records.bestDaily > 0 && rec.points > st.records.bestDaily;
if (rec.points > st.records.bestDaily) { st.records.bestDaily = rec.points; st.records.bestDailyDay = set.day; }
st.records.bestDailyAcc = Math.max(st.records.bestDailyAcc, acc);
if (acc === 100 && (!st.records.fastestDaily || rec.secs < st.records.fastestDaily)) st.records.fastestDaily = rec.secs;
if (!had || had.v !== 2) {
results.forEach(function (r, k) { noteRound(set.rounds[k].ch, r); });
st.history.unshift({ slug: "reto-del-dia-" + set.day, title: "Reto del día #" + set.number, cat: "diario", points: rec.points, accuracy: acc, seconds: rec.secs, at: Date.now(), daily: true, grid: rec.grid });
st.history = st.history.slice(0, 80);
st.points += rec.points; st.games += 1; addDayPoints(rec.points);
streak = bumpStreak();
}
fresh = checkAch({ res: { accuracy: acc, points: rec.points }, seconds: rec.secs, st: st, daily: true, record: record });
save(); updateStreakChip();
track("daily_completed", { day: set.day, points: rec.points, accuracy: acc });
}
if (opts.duel && !opts.duel.invalid) {
if (rec.points > opts.duel.p) { var w = unlock("duelo_ganado"); if (w) fresh.push(w); st.duelWins += 1; save(); }
track("duel_completed", { won: rec.points > opts.duel.p, daily: true });
}
renderDailyResult(box, set, rec, { fresh: fresh, record: record, streak: streak, duel: opts.duel, practice: opts.practice, onReplay: opts.onReplay });
}
if (official) track("daily_started", { day: set.day, resumed: i > 0 });
play();
return function () { alive = false; if (game) { game.stop(); game = null; } };
}
function renderDailyResult(box, set, rec, ctx) {
ctx = ctx || {};
var today = dayInTz(), isToday = set.day === today;
var html = '<section class="stage"><div class="result">' +
'<p class="eyebrow">' + icon("calendar") + "Reto del día #" + set.number + " · " + esc(longDate(set.day)) + (ctx.practice ? " · práctica" : "") + "</p>" +
'<h2 class="result-title" tabindex="-1">' + resultMessage(rec.acc, false) + "</h2>" +
'<div class="score"><b data-count>0</b><span>de 1000</span></div>' +
(ctx.record ? '<p><span class="badge">' + icon("trophy") + "Tu mejor reto del día</span></p>" : "") +
squaresHtml(rec.grid, false) +
statsHtml([["target", rec.acc + " % de precisión"], ["clock", mmss(rec.secs)], ["flame", streakNow() + (streakNow() === 1 ? " día" : " días") + " de racha"]]);
if (ctx.duel && !ctx.duel.invalid) html += versusHtml(ctx.duel, rec.points, rec.secs);
html += achHtml(ctx.fresh) +
'<div class="actions"><a class="btn btn-primary btn-lg" href="' + href("/juegos/?tema=sorpresa") + '">Jugar otro reto' + icon("arrow") + "</a>" +
(ctx.practice ? "" : '<button type="button" class="btn btn-outline btn-lg" data-duel>' + icon("duel") + (ctx.duel && !ctx.duel.invalid ? "Retar de vuelta" : "Retar a un amigo") + "</button>") + "</div>" +
'<div class="link-row">' + (ctx.practice ? "" : '<button type="button" class="text-link" data-share>' + icon("share") + "Compartir resultado</button>") +
'<a href="' + href("/progreso/") + '">Ver progreso</a><a href="' + href("/retos/") + '">Explorar categorías</a>' +
(ctx.onReplay ? '<button type="button" class="text-link" data-replay>Repetir para practicar</button>' : "") + "</div>" +
(isToday ? '<p class="done-note">Nuevo reto en <b data-next-daily>' + clock(secsToMidnight()) + "</b><span>Mismo reto para todo el mundo. Mañana, otro.</span></p>" : "") +
'<div class="panel" data-panel hidden></div></div></section>';
box.innerHTML = html;
var t = $(".result-title", box); if (t) t.focus();
count($("[data-count]", box), rec.points);
var nd = $("[data-next-daily]", box);
if (nd) { var iv = setInterval(function () { if (!document.body.contains(nd)) { clearInterval(iv); return; } nd.textContent = clock(secsToMidnight()); }, 1000); }
var sh = $("[data-share]", box);
if (sh) sh.addEventListener("click", function () {
var url = absUrl(href("/reto-del-dia/")), txt = dailyShareText(set, rec, true) + "\n¿Me superas?";
track("share_clicked", { channel: navigator.share ? "native" : "copy", what: "diario" });
if (!nativeShare({ title: "RÉTAME #" + set.number, text: txt, url: url })) copyText(txt + "\n" + url, sh, "¡Resultado copiado!");
});
var d = $("[data-duel]", box);
if (d) d.addEventListener("click", function () {
mountDuelPanel($("[data-panel]", box), {
title: "Reto del día #" + set.number, points: rec.points, seconds: rec.secs,
url: function (n) { return dailyDuelUrl(set, n, rec); },
text: function (n, l) { return dailyShareText(set, rec, true) + "\n" + (n !== "Alguien" ? n + " te reta. " : "") + "¿Puedes superarme?\n" + l; }
});
});
var rp = $("[data-replay]", box);
if (rp) rp.addEventListener("click", ctx.onReplay);
}
function fillBestBadges() {
var st = state();
$$("[data-best]").forEach(function (el) {
var b = st.best[el.getAttribute("data-best")];
if (b) el.textContent = "Tu marca: " + fmt(b.points);
});
}
function mountHome() {
var today = dayInTz(), set = dailySet(today), done = dailyDone(today), st = state();
var ticket = $("[data-ticket]");
if (ticket && set) {
$("[data-ticket-num]", ticket).textContent = "#" + set.number;
$("[data-ticket-date]", ticket).textContent = longDate(today);
var roundsBox = $("[data-ticket-rounds]", ticket);
roundsBox.outerHTML = roundsHtml(set, done ? done.grid : "");
var title = $("[data-ticket-title]", ticket), sub = $("[data-ticket-sub]", ticket), extra = $("[data-ticket-extra]", ticket);
if (done) {
title.textContent = "Hecho por hoy.";
sub.textContent = "Tu resultado está listo para compartir. Mañana, " + (set.rounds.length === 5 ? "más" : "otras") + " pruebas.";
extra.innerHTML = '<div class="ticket-score"><b>' + fmt(done.points) + "</b><span>/ 1000</span></div>";
} else {
var run = st.dailyRun && st.dailyRun.day === today && st.dailyRun.sig === set.sig ? st.dailyRun.results.length : 0;
title.textContent = set.rounds.length + " pruebas. Una puntuación.";
sub.textContent = run ? "Vas por la prueba " + (run + 1) + " de " + set.rounds.length + ". Tu marca te espera." : "Dificultad creciente. Mismo reto para todo el mundo.";
}
var cd = $("[data-countdown]", ticket);
if (cd) {
cd.textContent = clock(secsToMidnight());
setInterval(function () { var s = secsToMidnight(); cd.textContent = clock(s); if (s >= 86399) location.reload(); }, 1000);
}
}
var cta = $("[data-hero-cta]");
if (cta && done) { cta.innerHTML = "Ver mi resultado" + icon("arrow"); }
var box = $("[data-home-stats]");
if (box) {
var flame = streakNow(), achGot = ACH.filter(function (a) { return st.ach[a.code]; }).length;
box.innerHTML = '<div class="tiles four">' +
'<div class="tile"><b class="is-amber">' + icon("flame") + flame + "</b><span>" + (flame === 1 ? "día" : "días") + " de racha</span></div>" +
'<div class="tile"><b>' + icon("trophy") + (st.records.bestDaily ? fmt(st.records.bestDaily) : "—") + "</b><span>mejor reto del día</span></div>" +
'<div class="tile"><b>' + icon("check") + fmt(st.games) + "</b><span>retos completados</span></div>" +
'<div class="tile"><b>' + icon("star") + achGot + "/" + ACH.length + "</b><span>logros</span></div></div>";
}
}
function mountDailyPage() {
var box = $("[data-daily]"); if (!box) return;
var q = getParams(), today = dayInTz(), stop = null;
var day = q.d && validDay(q.d) && dayNum(q.d) <= dayNum(today) && dayNum(q.d) >= dayNum(CONFIG.launchDay) ? q.d : today;
var set = dailySet(day);
if (!set || !set.rounds.length) { box.innerHTML = '<div class="empty"><p><b>No hemos podido preparar el reto.</b> Recarga la página.</p></div>'; return; }
var duel = parseDuel(q, 1000);
if (duel && duel.invalid) { toast("El enlace del duelo no es válido. Juega el reto igualmente."); duel = null; }
var intro = $("[data-daily-intro]");
function startScreen() {
var done = day === today ? dailyDone(today) : null;
if (stop) { stop(); stop = null; }
if (done && !duel) {
renderDailyResult(box, set, done, { onReplay: function () { stop = runDaily(box, set, { practice: true, onReplay: startScreen }); } });
if (intro) intro.hidden = true;
return;
}
var st = state(), resumed = day === today && !duel && st.dailyRun && st.dailyRun.day === day && st.dailyRun.sig === set.sig ? st.dailyRun.results.length : 0;
var label = duel ? "Aceptar el reto" : resumed ? "Continuar: prueba " + (resumed + 1) + " de " + set.rounds.length : "Empezar el reto de hoy";
box.innerHTML = (duel ? duelBanner(duel, "el reto del día #" + set.number) : "") +
'<div class="ticket"><div class="ticket-top"><span class="ticket-badge">' + icon("calendar") + "Reto del día #" + set.number + '</span><span class="ticket-date">' + esc(longDate(day)) + "</span></div>" +
"<h2>" + (day === today ? set.rounds.length + " pruebas. Una puntuación." : "El reto del " + esc(longDate(day)) + ".") + "</h2>" +
"<p>" + (day === today ? "Lógica, memoria, números… de menos a más. Responde con calma: la precisión pesa mucho más que la velocidad." : "Juegas el mismo reto que " + esc(duel ? duel.n : "esa persona") + ". No cuenta como reto de hoy.") + "</p>" +
roundsHtml(set, "") +
'<div class="ticket-foot"><button type="button" class="btn btn-amber btn-lg" data-go>' + icon("play") + esc(label) + "</button>" +
(day === today ? '<div class="countdown"><span>Nuevo reto en</span><b data-countdown>' + clock(secsToMidnight()) + "</b></div>" : "") + "</div></div>";
var cd = $("[data-countdown]", box);
if (cd) { var iv = setInterval(function () { if (!document.body.contains(cd)) { clearInterval(iv); return; } cd.textContent = clock(secsToMidnight()); }, 1000); }
$("[data-go]", box).addEventListener("click", function () {
if (intro) intro.hidden = true;
stop = runDaily(box, set, { duel: duel, onReplay: startScreen });
box.scrollIntoView({ block: "start" });
});
}
startScreen();
}
function mountChallengePage() {
var stageWrap = $("[data-challenge]"); if (!stageWrap) return;
var base0 = resolveChallenge(stageWrap.getAttribute("data-challenge"));
if (!base0 || !validateChallenge(base0)) return;
var q = getParams(), duel = parseDuel(q, base0.max_points);
if (duel && duel.invalid) { toast("El enlace del duelo no es válido. Juega el reto igualmente."); duel = null; }
var ch = needsSeed(base0) ? instantiate(base0, duel && duel.k !== undefined ? duel.k : randomSeed()) : base0;
if (duel) {
var slot = $("[data-duel-banner]");
if (slot) slot.innerHTML = duelBanner(duel, "«" + ch.title + "»");
var startBtn = $("[data-start]", stageWrap); if (startBtn) startBtn.innerHTML = icon("play") + "Aceptar el reto";
track("duel_opened", { slug: ch.slug });
}
mountGame($("[data-stage]", stageWrap), ch, { onDone: function (out, g) { showSingleResult(g, out, { duel: duel }); } });
}
function mountGamesPage() {
var q = getParams(), selector = $("[data-selector]"), box = $("[data-play]");
if (!box) return;
var current = null;
function hideSelector() { if (selector) selector.hidden = true; box.hidden = false; }
if (q.reto) {
var base1 = resolveChallenge(q.reto);
if (!base1 || !validateChallenge(base1)) { toast("Ese reto no existe. Te proponemos otros."); return; }
if (!base1.generated && !catBySlug[base1.cat].hidden) { location.replace(challengeUrl(base1) + location.search.replace(/([?&])reto=[^&]*&?/, "$1").replace(/[?&]$/, "")); return; }
hideSelector();
var ch = needsSeed(base1) ? instantiate(base1, randomSeed()) : base1;
box.innerHTML = '<header class="page-head"><p class="eyebrow">' + icon(catBySlug[ch.cat].icon) + esc(catBySlug[ch.cat].name) + "</p><h1>" + esc(ch.title) + '</h1><p class="lead">' + esc(ch.excerpt) + "</p></header>" + stageHtml(ch);
document.title = ch.title + " — RÉTAME";
mountGame($("[data-stage]", box), ch, { onDone: function (out, g) { showSingleResult(g, out, { inlineSolution: true }); } });
return;
}
var g = q.tema ? groupFor(q.tema) : null;
if (!g) { if (q.tema) toast("Esa categoría no existe. Elige otra."); return; }
hideSelector();
function start(mode, kind) {
if (current) current();
current = runSession(box, createSession(g, mode, kind), {
onExit: function () { current = null; location.href = href("/juegos/"); },
restart: function () { start(mode, kind); }
});
box.scrollIntoView({ block: "start" });
}
if (g.slug === "sorpresa" || g.hidden) { document.title = (g.slug === "sorpresa" ? "Sorpréndeme" : g.name) + " — RÉTAME"; start("sorpresa", "todas"); return; }
document.title = "Jugar: " + g.name + " — RÉTAME";
var kinds = {};
CHALLENGES.forEach(function (c) { if (c.cat === g.slug) kinds[c.kind] = 1; });
(GENERATORS[g.slug] || []).forEach(function (x) { kinds[x.kind] = 1; });
var kindList = Object.keys(kinds), sel = { mode: "sorpresa", kind: "todas" };
box.innerHTML = '<a class="text-link" href="' + href("/juegos/") + '">' + icon("back") + "Cambiar de categoría</a>" +
'<header class="page-head cat-head">' + catTile(g, "xl") + "<div><h1>" + esc(g.name) + '</h1><p class="lead" style="margin:0">' + esc(g.short) + "</p></div></header>" +
'<h2 id="mode-title" style="font-size:1.2rem">¿Cómo lo quieres?</h2>' +
'<div class="mode-grid" role="radiogroup" aria-labelledby="mode-title">' +
MODES.map(function (m) {
var on = m.id === "sorpresa";
return '<button type="button" class="mode-card' + (m.featured ? " is-featured" : "") + '" role="radio" aria-checked="' + on + '" tabindex="' + (on ? 0 : -1) + '" data-mode="' + m.id + '"><b>' + esc(m.name) + (m.featured ? '<span class="pill">Recomendado</span>' : "") + "</b><small>" + esc(m.desc) + "</small></button>";
}).join("") + "</div>" +
(kindList.length > 1 ? '<button type="button" class="text-link" data-adv-toggle aria-expanded="false" aria-controls="adv-panel">Elegir el tipo de reto</button>' +
'<div class="card" id="adv-panel" data-adv hidden><div class="chips" role="group" aria-label="Tipo de reto"><button type="button" class="chip" aria-pressed="true" data-kind="todas">Variado</button>' +
kindList.map(function (k) { return '<button type="button" class="chip" aria-pressed="false" data-kind="' + k + '">' + esc(KIND_LABELS[k] || k) + "</button>"; }).join("") +
'</div><p class="muted small" style="margin:10px 0 0">Si se agotan los de un tipo, seguimos con otros del mismo tema y te avisamos.</p></div>' : "") +
'<div class="actions"><button type="button" class="btn btn-primary btn-lg" data-start-session>' + icon("play") + "Empezar sesión</button></div>" +
'<p class="muted small">' + SESSION_LEN + " retos seguidos, sin repetir. Puedes terminar cuando quieras.</p>";
var cards = $$(".mode-card", box);
function pick(card, focus) {
cards.forEach(function (c) { var on = c === card; c.setAttribute("aria-checked", on ? "true" : "false"); c.tabIndex = on ? 0 : -1; });
sel.mode = card.dataset.mode; if (focus) card.focus();
}
cards.forEach(function (c, i) {
c.addEventListener("click", function () { pick(c); });
c.addEventListener("keydown", function (e) {
var d = (e.key === "ArrowRight" || e.key === "ArrowDown") ? 1 : (e.key === "ArrowLeft" || e.key === "ArrowUp") ? -1 : 0;
if (!d) return; e.preventDefault(); pick(cards[(i + d + cards.length) % cards.length], true);
});
});
var tog = $("[data-adv-toggle]", box), adv = $("[data-adv]", box);
if (tog) tog.addEventListener("click", function () {
var open = adv.hidden; adv.hidden = !open; tog.setAttribute("aria-expanded", open ? "true" : "false");
if (!open) { sel.kind = "todas"; $$("[data-kind]", box).forEach(function (b) { b.setAttribute("aria-pressed", b.dataset.kind === "todas" ? "true" : "false"); }); }
});
$$("[data-kind]", box).forEach(function (b) {
b.addEventListener("click", function () { $$("[data-kind]", box).forEach(function (x) { x.setAttribute("aria-pressed", x === b ? "true" : "false"); }); sel.kind = b.dataset.kind; });
});
$("[data-start-session]", box).addEventListener("click", function () { start(sel.mode, sel.kind); });
}
function mountDuelsPage() {
var q = getParams(), box = $("[data-duel-play]");
if (!box || !q.r) return;
var base2 = resolveChallenge(q.r);
if (!base2 || !validateChallenge(base2)) { toast("Ese duelo ya no existe. Elige otro reto."); return; }
if (!base2.generated && !catBySlug[base2.cat].hidden) { location.replace(challengeUrl(base2) + location.search.replace(/([?&])r=[^&]*&?/, "$1").replace(/[?&]$/, "")); return; }
var duel = parseDuel(q, base2.max_points);
if (duel && duel.invalid) { toast("El enlace del duelo no es válido. Juega el reto igualmente."); duel = null; }
var ch = needsSeed(base2) ? instantiate(base2, duel && duel.k !== undefined ? duel.k : randomSeed()) : base2;
var intro = $("[data-duels-intro]"); if (intro) intro.hidden = true;
box.hidden = false;
box.innerHTML = (duel ? duelBanner(duel, "«" + ch.title + "»") : "") + '<h2>' + esc(ch.title) + '</h2><p class="lead">' + esc(ch.excerpt) + "</p>" + stageHtml(ch, duel ? "Aceptar el reto" : "Empezar");
document.title = (duel ? duel.n + " te reta en RÉTAME" : ch.title + " — RÉTAME");
if (duel) track("duel_opened", { slug: ch.slug });
mountGame($("[data-stage]", box), ch, { onDone: function (out, g) { showSingleResult(g, out, { duel: duel, inlineSolution: true }); } });
}
function mountProgressPage() {
var root = $("[data-progress]"); if (!root) return;
function render() {
var st = state(), s = streakNow(), today = dayInTz();
var achGot = ACH.filter(function (a) { return st.ach[a.code]; }).length;
var prec = st.accN ? Math.round(st.accSum / st.accN) : null;
var favCat = Object.keys(st.catStats).filter(function (c) { return catBySlug[c] && !catBySlug[c].hidden; }).sort(function (a, b) { return st.catStats[b].g - st.catStats[a].g; })[0];
var tiles = '<div class="tiles">' +
'<div class="tile"><b class="is-amber">' + icon("flame") + s + "</b><span>racha actual</span></div>" +
'<div class="tile"><b>' + icon("trophy") + st.streak.best + "</b><span>mejor racha</span></div>" +
'<div class="tile"><b>' + icon("check") + fmt(st.games) + "</b><span>retos completados</span></div>" +
'<div class="tile"><b>' + icon("target") + (prec === null ? "—" : prec + " %") + "</b><span>precisión media</span></div>" +
'<div class="tile"><b>' + icon("bolt") + fmt(st.points) + "</b><span>puntos totales</span></div>" +
'<div class="tile"><b>' + icon("star") + achGot + "/" + ACH.length + "</b><span>logros</span></div></div>";
var records = '<section class="section"><h2>Tus récords</h2><div class="tiles four">' +
'<div class="tile"><b>' + (st.records.bestDaily ? fmt(st.records.bestDaily) : "—") + "</b><span>mejor reto del día" + (st.records.bestDailyDay ? " (" + esc(shortDate(st.records.bestDailyDay)) + ")" : "") + "</span></div>" +
'<div class="tile"><b>' + (st.records.bestDailyAcc ? st.records.bestDailyAcc + " %" : "—") + "</b><span>mejor precisión diaria</span></div>" +
'<div class="tile"><b>' + (st.records.fastestDaily ? mmss(st.records.fastestDaily) : "—") + "</b><span>reto del día perfecto más rápido</span></div>" +
'<div class="tile"><b>' + (st.records.bestPoints ? fmt(st.records.bestPoints) : "—") + "</b><span>mejor puntuación en un reto</span></div>" +
'<div class="tile"><b>' + fmt(st.records.perfects) + "</b><span>retos sin fallos</span></div>" +
'<div class="tile"><b>' + (st.bestSession ? fmt(st.bestSession) : "—") + "</b><span>mejor sesión de 10</span></div>" +
'<div class="tile"><b>' + (favCat ? esc(catBySlug[favCat].name) : "—") + "</b><span>categoría favorita</span></div>" +
'<div class="tile"><b>' + fmt(st.duelWins) + "</b><span>duelos ganados</span></div></div></section>";
var body;
if (!st.games) {
body = tiles + '<div class="empty" style="margin-top:16px"><p><b>Todavía no has jugado.</b> Empieza por el reto de hoy: aquí verás tu racha, tus récords y tus logros.</p><div class="actions" style="margin-top:0"><a class="btn btn-primary" href="' + href("/reto-del-dia/") + '">Jugar el reto de hoy</a></div></div>';
} else {
var days = [], k, LET = ["D", "L", "M", "X", "J", "V", "S"];
for (k = 13; k >= 0; k--) { var dk = addDay(today, -k); days.push({ d: dk, v: (st.days[dk] || {}).points || 0 }); }
var max = Math.max.apply(null, days.map(function (x) { return x.v; }).concat([1]));
var chart = '<div class="chart" role="img" aria-label="Puntos de los últimos 14 días: ' + days.map(function (x) { return fmt(x.v); }).join(", ") + '">' +
days.map(function (x) {
var h = x.v ? Math.max(8, Math.round(x.v / max * 100)) : 4;
return '<div class="chart-col" title="' + x.d + ": " + fmt(x.v) + ' pts"><div class="chart-bar' + (x.v ? "" : " is-zero") + (x.d === today ? " is-today" : "") + '" style="height:' + h + '%"></div><small>' + LET[new Date(x.d + "T12:00:00Z").getUTCDay()] + "</small></div>";
}).join("") + "</div>";
var cats = Object.keys(st.catStats).filter(function (c) { return catBySlug[c] && !catBySlug[c].hidden && st.catStats[c].n > 0; }).sort(function (a, b) { return st.catStats[b].g - st.catStats[a].g; });
var catbars = cats.length ? '<section class="section"><h2>Precisión por categoría</h2><div class="catbars">' + cats.map(function (c) {
var cs = st.catStats[c], p = Math.round(cs.acc / cs.n), cc = catBySlug[c];
return '<div class="cb" style="--cat:' + cc.color + '"><span>' + esc(cc.name) + '</span><div class="cb-track"><div class="cb-fill" style="width:' + p + '%"></div></div><b>' + p + " %</b></div>";
}).join("") + "</div></section>" : "";
var bestList = Object.keys(st.best).map(function (k2) { return { ch: chBySlug[k2] || null, b: st.best[k2] }; }).filter(function (x) { return x.ch && !x.ch.generated; }).sort(function (a, b) { return b.b.points - a.b.points; }).slice(0, 8);
body = tiles + records +
'<section class="section"><h2>Tus últimos 14 días</h2>' + chart + "</section>" + catbars +
(bestList.length ? '<section class="section"><h2>Tus mejores marcas</h2>' + bestList.map(function (x) { return '<div class="table-row"><a href="' + challengeUrl(x.ch) + '">' + esc(x.ch.title) + "</a><b>" + fmt(x.b.points) + " pts</b></div>"; }).join("") + "</section>" : "") +
'<section class="section"><h2>Últimas partidas</h2>' + st.history.slice(0, 10).map(function (h) {
var known = h.daily ? null : resolveChallenge(h.slug);
var link = h.daily ? href("/reto-del-dia/") : known ? challengeUrl(known) : "";
return '<div class="table-row"><div>' + (link ? '<a href="' + link + '">' + esc(h.title) + "</a>" : '<span class="t">' + esc(h.title) + "</span>") +
"<small>" + new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short" }).format(new Date(h.at || Date.now())) + " · " + h.seconds + " s · " + h.accuracy + " %" + "</small></div><b>" + fmt(h.points) + (h.daily ? "/1000" : " pts") + "</b></div>";
}).join("") + "</section>";
}
var ach = '<section class="section"><h2>Logros</h2><div class="ach-grid">' + ACH.map(function (a) {
var got = !!st.ach[a.code];
return '<div class="ach' + (got ? "" : " is-locked") + '"><span class="cat-tile">' + icon(got ? "trophy" : "lock") + "</span><div><b>" + esc(a.name) + "</b><span>" + esc(a.desc) + (got ? "" : " (por conseguir)") + "</span></div></div>";
}).join("") + "</div></section>";
var reset = '<section class="section"><h2>Tus datos</h2><p class="muted">Tu progreso vive solo en este navegador. Si borras los datos del sitio o cambias de dispositivo, empiezas de cero.' + (st.migratedFrom ? " Hemos traído tu progreso de la versión anterior de RÉTAME." : "") + (storageOk ? "" : " <b>Tu navegador no permite guardar datos: el progreso no se conservará al cerrar.</b>") + "</p>" +
'<div data-reset-box><button type="button" class="btn btn-ghost btn-sm" data-reset>Borrar mi progreso</button></div></section>';
root.innerHTML = body + ach + reset;
var rb = $("[data-reset-box]", root);
$("[data-reset]", root).addEventListener("click", function () {
rb.innerHTML = '<p><b>¿Seguro?</b> Se borrarán tu racha, tus puntos, tus récords y tus logros. No se puede deshacer.</p><div class="actions" style="margin-top:0"><button type="button" class="btn btn-primary btn-sm" data-yes>Sí, borrar</button><button type="button" class="btn btn-ghost btn-sm" data-no>Cancelar</button></div>';
$("[data-yes]", rb).addEventListener("click", function () { resetAll(); updateStreakChip(); render(); toast("Progreso borrado."); });
$("[data-no]", rb).addEventListener("click", render);
$("[data-yes]", rb).focus();
});
}
render();
}
function legacyTarget(hash) {
if (!/^#\//.test(hash || "")) return null;
var h = hash.slice(1), qs = "", i = h.indexOf("?");
if (i >= 0) { qs = h.slice(i + 1); h = h.slice(0, i); }
h = h.replace(/\/+$/, "") || "/";
var m, q = qs ? "?" + qs : "";
if (h === "/") return href("/");
if (h === "/reto-del-dia") return href("/reto-del-dia/");
if (h === "/juegos") return href("/juegos/");
if (h === "/sorprendeme") return href("/juegos/?tema=sorpresa");
if ((m = /^\/(?:juegos|categoria)\/([a-z-]+)$/.exec(h))) return href("/juegos/?tema=" + (LEGACY_CATS[m[1]] || m[1]));
if (h === "/catalogo") return href("/retos/");
if ((m = /^\/catalogo\/([a-z-]+)$/.exec(h))) { var nc = LEGACY_CATS[m[1]] || m[1]; return catBySlug[nc] && !catBySlug[nc].hidden ? catUrl(nc) : href("/retos/"); }
if (h === "/acertijos") return catUrl("logica");
if ((m = /^\/(juego|duelo)\/([a-z0-9-]+)$/.exec(h))) {
var ch = resolveChallenge(m[2]);
if (!ch) return href("/retos/");
if (!ch.generated && !catBySlug[ch.cat].hidden) return challengeUrl(ch) + q;
return m[1] === "duelo" ? href("/duelos/?r=" + encodeURIComponent(ch.slug) + (qs ? "&" + qs : "")) : challengeUrl(ch);
}
if (h === "/reta-a-tus-amigos") return href("/duelos/");
if (/^\/(progreso|perfil|ranking|rachas)$/.test(h)) return href("/progreso/");
if (h === "/como-funciona") return href("/como-funciona/");
if (h === "/contacto") return href("/contacto/");
if ((m = /^\/legal\/(privacidad|cookies)$/.exec(h))) return href("/" + m[1] + "/");
return href("/");
}
function adsReady() { return /^ca-pub-\d{10,20}$/.test(CONFIG.adsense.client || ""); }
function loadScript(src, attrs) {
var s = document.createElement("script"); s.async = true; s.src = src;
Object.keys(attrs || {}).forEach(function (k) { s.setAttribute(k, attrs[k]); });
document.head.appendChild(s); return s;
}
function initAds() {
var slots = $$("[data-ad]");
if (!adsReady() || !slots.length) return;
function fill() {
loadScript("https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=" + encodeURIComponent(CONFIG.adsense.client), { crossorigin: "anonymous" });
slots.forEach(function (el) {
var id = (CONFIG.adsense.slots || {})[el.getAttribute("data-ad")];
if (!/^\d{6,}$/.test(id || "")) { el.remove(); return; }
el.innerHTML = '<ins class="adsbygoogle" style="display:block" data-ad-client="' + esc(CONFIG.adsense.client) + '" data-ad-slot="' + esc(id) + '" data-ad-format="auto" data-full-width-responsive="true"></ins>';
try { (window.adsbygoogle = window.adsbygoogle || []).push({}); } catch (e) { /* ignorar */ }
});
}
if (CONFIG.consent.mode === "tcf") {
if (CONFIG.consent.cmpScript) loadScript(CONFIG.consent.cmpScript);
var tries = 0, wait = setInterval(function () {
tries++;
if (typeof window.__tcfapi === "function") {
clearInterval(wait);
window.__tcfapi("addEventListener", 2, function (tc, ok) {
if (ok && tc && (tc.eventStatus === "tcloaded" || tc.eventStatus === "useractioncomplete")) { fill(); fill = function () {}; }
});
} else if (tries > 100) clearInterval(wait);
}, 100);
} else fill();
}
function init() {
var legacy = legacyTarget(location.hash);
if (legacy) { location.replace(legacy); return; }
var toggle = $(".nav-toggle"), nav = $("#main-nav");
if (toggle && nav) {
toggle.addEventListener("click", function () { var open = nav.classList.toggle("is-open"); toggle.setAttribute("aria-expanded", open ? "true" : "false"); });
document.addEventListener("keydown", function (e) { if (e.key === "Escape" && nav.classList.contains("is-open")) { nav.classList.remove("is-open"); toggle.setAttribute("aria-expanded", "false"); toggle.focus(); } });
}
var y = $("[data-year]"); if (y) y.textContent = new Date().getFullYear();
state();
updateStreakChip();
try {
if (PAGE === "home") mountHome();
else if (PAGE === "daily") mountDailyPage();
else if (PAGE === "challenge") mountChallengePage();
else if (PAGE === "games") mountGamesPage();
else if (PAGE === "duels") mountDuelsPage();
else if (PAGE === "progress") mountProgressPage();
} catch (e) {
toast("Algo ha fallado al preparar el juego. Recarga la página.");
if (window.console) console.error(e);
}
fillBestBadges();
initAds();
}
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
