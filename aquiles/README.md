# Aquiles · Fisioterapia Córdoba (concepto 2026)

Propuesta de nueva web para la Clínica de Fisioterapia Aquiles (Av. Virgen de los Dolores, 17, 14004 Córdoba).
HTML, CSS y JavaScript sin dependencias ni proceso de compilación: se puede subir tal cual a cualquier hosting.

```
aquiles/
├── index.html           Home: hero, método, opiniones, datos, tratamientos, tecnología, equipo, instalaciones, ubicación, cita
├── tratamientos.html    Todos los tratamientos por áreas
├── legal.html           Aviso legal, privacidad y cookies (borrador, ver "Pendiente")
└── assets/
    ├── css/site.css     Estilos y tokens (modo claro y oscuro)
    ├── js/site.js       Menú, animaciones, carrusel, formulario, estado "abierto ahora"
    ├── js/spine.js      Columna 3D en WebGL puro (≈10 KB), con fallback SVG
    └── img/             Favicon, icono iOS e imagen para redes (Open Graph)
```

Para verla en local: `python3 -m http.server` dentro de `aquiles/` y abrir `http://localhost:8000`.

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

1. **Fotografías reales.** Cada hueco fotográfico está marcado con `<!-- FOTO REAL: ... -->` y una etiqueta visible
   "Foto real · …". Para sustituirlo basta con meter un `<img>` dentro del `div.ph` (el CSS ya lo ajusta a `object-fit: cover`):
   ```html
   <div class="ph hero__photo" ...>
     <img src="assets/img/hero.webp" alt="..." width="1600" height="2000" fetchpriority="high">
   </div>
   ```
   y borrar el `<svg class="ph__leaves">` y el `<span class="ph__tag">`. Recomendado: WebP/AVIF, 1600 px de lado mayor,
   `loading="lazy"` en todas menos la del hero. Huecos: hero (tratamiento en cabina), fisioterapia deportiva, equipo INDIBA,
   foto del equipo, cabina, recepción, sala de tecnología, fachada y espacio de tratamiento.
2. **Fotos del equipo**: avatares con inicial hasta tener retratos reales y permiso de cada persona. Añadir más profesionales solo con nombre y cargo confirmados.
3. **Reseñas**: confirmar el texto completo de cada extracto en Google y si la clínica quiere mostrar nombres (con permiso).
4. **WhatsApp**: los botones apuntan a `wa.me/34661125257`. Confirmar que ese número tiene WhatsApp.
5. **Formulario**: ahora valida y prepara el mensaje para enviarlo por WhatsApp o email. Para recibirlo directamente,
   conectar el `submit` de `#cita` en `assets/js/site.js` a un endpoint (PHP del hosting, Formspree, etc.).
6. **Legal**: completar CIF, datos registrales y autorización sanitaria en `legal.html` y revisarlo con un profesional.
7. **Redes sociales**: no se han encontrado perfiles oficiales verificables, así que no se enlazan. Añadirlos al footer cuando la clínica los confirme.
8. **Aseguradoras**: hay indicios (guía médica de FIATC) pero no se muestran hasta confirmarlo con la clínica.
9. **Tipografías**: se cargan desde Google Fonts. Para un RGPD más estricto, alojarlas en el propio servidor.
10. **Accesibilidad del local**: no se ha podido verificar; la web invita a llamar antes.

## Decisiones de diseño

- **Paleta**: crema cálido, piedra, salvia y verde oliva profundo. Nada de azul hospitalario.
- **Tipografía**: Instrument Serif (titulares, con cursiva para el matiz emocional) y Figtree (lectura).
- **Naturaleza**: sombras desenfocadas de ramas de olivo, un guiño a Córdoba, en lugar de plantas de stock.
- **3D**: una única columna vertebral translúcida dibujada con un shader propio. Se mueve muy poco con el cursor y el scroll,
  sólo se renderiza cuando hace falta (no hay animación permanente) y usa imagen estática con `prefers-reduced-motion` y SVG si no hay WebGL.
- **Detalle de movimiento**: la línea del método se dibuja al hacer scroll y va "alcanzando" cada fase.
- **Conversión**: "Pedir cita" en cabecera, hero, método, tratamientos y sección final; barra fija Llamar / Pedir cita en móvil
  (aparece tras el hero y se oculta en la sección de contacto); botón flotante de WhatsApp; estado "Abierto ahora" con hora de Madrid.
- **SEO local**: un solo H1 por página, títulos y descripciones propios, canonical, Open Graph con imagen, datos estructurados
  `Physiotherapy` (LocalBusiness/MedicalBusiness) con dirección, horario y teléfonos. No se marca `aggregateRating`: Google no admite
  valoraciones propias en fichas de negocio local.
