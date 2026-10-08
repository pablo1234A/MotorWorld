# Aquiles · Fisioterapia Córdoba (concepto 2026)

Propuesta de nueva web para la Clínica de Fisioterapia Aquiles (Av. Virgen de los Dolores, 17, 14004 Córdoba).

**Todo está en un único archivo: `index.html`** (≈155 KB, con estilos, código, iconos y la columna 3D dentro).
Se abre con doble clic o se sube tal cual a cualquier hosting. Solo necesita internet para las tipografías de Google Fonts.

Contenido del archivo:
- Home: hero con la columna 3D, método, opiniones, cifras, tratamientos, tecnología, equipo, ubicación y formulario de cita.
- "Todos los tratamientos": acordeón con las 10 áreas (las tarjetas abren directamente su área).
- Aviso legal, privacidad y cookies en ventanas modales (`#aviso-legal`, `#privacidad`, `#cookies` también funcionan como enlace directo).

`assets/img/` contiene la imagen para redes sociales (Open Graph), que debe estar publicada en
`https://fisioterapiaencordobaaquiles.com/assets/img/og-aquiles.jpg`.

Esta versión no usa fotografías: los espacios visuales son piezas de diseño (escultura 3D, ilustración de radiofrecuencia,
sombras de olivo, panel de datos del equipo). No se han usado fotos inventadas ni de stock.

## Datos usados y de dónde salen

Todo el contenido se ha contrastado con fuentes públicas (octubre de 2026). No hay precios, resultados ni profesionales inventados.

| Dato | Fuente |
| --- | --- |
| +20 años, +15.000 tratamientos | Web actual de la clínica (un directorio antiguo cita 8.000; se usa la cifra oficial) |
| 4,9/5 y +400 reseñas en Google | Ficha de Google recogida por directorios (405 reseñas, mayo 2026). La web actual dice "+300"; se usa el dato más reciente |
| Método: pruebas médicas → valoración funcional (fisioterapia + osteopatía) → conclusiones y plan acordado | Página "Nuestro método" |
| Ejercicios y hábitos para casa | Home actual |
| Laura Rízquez Castro, fisioterapeuta y directora; Fran, citas y acogida | Reseñas públicas y guía médica de FIATC |
| +15 años de experiencia por fisioterapeuta, formación en universidades españolas, casos en La Paz y Ramón y Cajal | Web actual |
| Atlético de Madrid (Dr. José María Villalón) y Club Estudiantes | Página "Equipo" de la web actual |
| Servicios (deportiva, traumatológica, neurológica Bobath-Vojta, infantil, suelo pélvico, respiratoria/EPOC, osteopatía, ATM, parálisis facial, drenaje linfático, kinesioterapia, punción seca, EPI, kinesiotaping) | Web actual y directorios |
| INDIBA, ondas de choque, magnetoterapia (hasta 12 cm), electroterapia | Web actual |
| Horario L–V 09:00–22:00 | Página de contacto (hay un directorio antiguo con horario partido; se usa el oficial) |
| Bus: línea 5 (paradas 291 y 292) y línea O2 (parada 206, Av. del Aeropuerto) | Web actual; Moovit confirma líneas 5, O1, O2 y 7 en la zona |
| Razón social "Clínica de Fisioterapia y Rehabilitación Aquiles S.L." | Páginas Amarillas |
| Opiniones | Extractos literales de reseñas públicas, sin nombre del paciente |

## Pendiente antes de publicar

1. **Fotografías (opcional).** Si la clínica aporta fotos reales, pueden sumarse al hero, al equipo o a una galería de instalaciones.
2. **Fotos del equipo**: avatares con inicial hasta tener retratos reales y permiso de cada persona. Añadir más profesionales solo con nombre y cargo confirmados.
3. **Reseñas**: confirmar el texto completo de cada extracto en Google y si la clínica quiere mostrar nombres (con permiso).
4. **WhatsApp**: confirmado. Los botones apuntan a `wa.me/34661125257`.
5. **Formulario**: ahora valida y prepara el mensaje para enviarlo por WhatsApp o email. Para recibirlo directamente,
   conectar el `submit` de `#cita` (script al final de `index.html`) a un endpoint (PHP del hosting, Formspree, etc.).
6. **Legal**: completar CIF, datos registrales y autorización sanitaria en los diálogos legales de `index.html` y revisarlo con un profesional.
7. **Redes sociales**: no se han encontrado perfiles oficiales verificables, así que no se enlazan. Añadirlos al footer cuando la clínica los confirme.
8. **Aseguradoras**: hay indicios (guía médica de FIATC) pero no se muestran hasta confirmarlo con la clínica.
9. **Tipografías**: se cargan desde Google Fonts. Para un RGPD más estricto, alojarlas en el propio servidor.
10. **Accesibilidad del local**: no se ha podido verificar; la web invita a llamar antes.

## Decisiones de diseño

- **Paleta**: crema cálido, piedra, salvia y verde oliva profundo. Nada de azul hospitalario.
- **Tipografía**: Instrument Serif (titulares, con cursiva para el matiz emocional) y Figtree (lectura).
- **Naturaleza**: sombras desenfocadas de ramas de olivo, un guiño a Córdoba, en lugar de plantas de stock.
- **Sin fotos**: la sección de instalaciones se ha sustituido por "Tecnología" en el menú, y la ubicación menciona las instalaciones.
- **3D**: una única columna vertebral translúcida dibujada con un shader propio. Se mueve muy poco con el cursor y el scroll,
  sólo se renderiza cuando hace falta (no hay animación permanente) y usa imagen estática con `prefers-reduced-motion` y SVG si no hay WebGL.
- **Detalle de movimiento**: la línea del método se dibuja al hacer scroll y va "alcanzando" cada fase.
- **Conversión**: "Pedir cita" en cabecera, hero, método, tratamientos y sección final; barra fija Llamar / Pedir cita en móvil
  (aparece tras el hero y se oculta en la sección de contacto); botón flotante de WhatsApp; estado "Abierto ahora" con hora de Madrid.
- **SEO local**: un solo H1 por página, títulos y descripciones propios, canonical, Open Graph con imagen, datos estructurados
  `Physiotherapy` (LocalBusiness/MedicalBusiness) con dirección, horario y teléfonos. No se marca `aggregateRating`: Google no admite
  valoraciones propias en fichas de negocio local.
