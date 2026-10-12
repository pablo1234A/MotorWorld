# Agendia — chatbots de reservas con IA en un solo prompt

Pulsa **Crear automatización**, da tres datos y tienes un recepcionista con IA funcionando:

1. **El correo del negocio**: ahí llegan los avisos de cada reserva y cancelación.
2. **Tu Google Calendar**: el bot consulta tus huecos libres en tiempo real y crea las citas en tu agenda.
3. **Una descripción**: servicios, duraciones, precios, horario y cómo quieres que hable el bot, escrito con tus palabras.

La IA (Claude) convierte la descripción en una configuración completa: servicios, horario semanal, reglas de antelación, márgenes, FAQs, tono, mensaje de bienvenida y color de marca. Después genera un chatbot que:

- **Solo ofrece horas que de verdad están libres**: cruza tu horario con lo ocupado en Google Calendar (free/busy).
- **Dice que no cuando no hay hueco** y explica por qué (cerrado, todo reservado, poca antelación…), proponiendo alternativas.
- **Reserva**: crea el evento en tu calendario con los datos del cliente y vuelve a comprobar la disponibilidad justo antes, así no hay dobles reservas aunque dos clientes pidan la misma hora a la vez.
- **Envía emails** desde tu Gmail: la confirmación al cliente (con su código de reserva) y un aviso a tu correo de negocio.
- **Consulta, cambia y cancela** citas con el código y el email del cliente. Al cancelar, borra el evento del calendario.
- Habla en el idioma del cliente y sigue tus reglas ("pide la matrícula", "trata de usted", "para urgencias que llamen"…).

## Puesta en marcha

Necesitas Node.js 20 o posterior.

```bash
cd agendia
npm install
cp .env.example .env     # añade tu ANTHROPIC_API_KEY
npm start                # abre http://localhost:3000
```

Sin credenciales de Google funciona en **modo demo**: las reservas se guardan en un calendario local y los emails aparecen en la pestaña «Correos demo» del panel. Así puedes probar todo el flujo antes de conectar nada.

## Conectar Google Calendar y Gmail

1. En [Google Cloud Console](https://console.cloud.google.com/) crea un proyecto y activa **Google Calendar API** y **Gmail API**.
2. En *Google Auth Platform → Branding/Audience* configura la pantalla de consentimiento. Mientras esté en modo «Testing», añade tu cuenta como usuario de prueba.
3. En *Clients* crea un cliente OAuth de tipo **Aplicación web** con esta URI de redirección autorizada:
   `http://localhost:3000/auth/google/callback` (o `PUBLIC_URL/auth/google/callback` en producción).
4. Copia `GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_SECRET` en `.env` y reinicia.

Permisos que se piden: ver la disponibilidad del calendario, crear y borrar los eventos de las reservas, y enviar emails. Los tokens se guardan **cifrados** (AES-256-GCM) en `data/db.json`.

## Instalar el chatbot en tu web

En la pestaña **Instalar** del panel tienes:

- **Botón flotante**: pega esta línea en cualquier web (WordPress, Wix, Shopify, Webflow, HTML…):
  ```html
  <script src="https://tu-dominio.com/widget.js" data-bot="bot_xxxx" async></script>
  ```
  Opciones: `data-label="Pide cita"`, `data-position="left"`. También puedes abrirlo desde tus propios botones con `Agendia.open()`. Cada reserva lanza el evento `agendia:booking` en tu página, por si quieres medir conversiones.
- **Enlace directo** (`/chat/bot_xxxx`) para Instagram, WhatsApp, Google Business o tu firma de email.

## Panel

- **Resumen**: lo que la IA entendió (servicios, horario, reglas), los supuestos que tomó por su cuenta para que los revises, y un campo **«Ajusta con IA»** para cambiar cosas en lenguaje natural ("los sábados cerramos a las 13:00").
- **Reservas**: próximas citas e historial, con enlace al evento en Google Calendar y botón para cancelar.
- **Ajustes**: editor visual de todo: servicios, tramos horarios por día, festivos, antelación, márgenes, tono, políticas, color…
- **Vista previa**: el chatbot real a la derecha, para probarlo mientras lo configuras.

## Publicarlo en internet

- Define `PUBLIC_URL` (con https) y `ADMIN_PASSWORD`. Sin contraseña, el panel queda abierto.
- El chat público tiene límite de mensajes por IP y por bot para frenar abusos.
- Los datos viven en `data/` (un JSON con escritura atómica). Haz copia de seguridad de esa carpeta o define `DATA_DIR`.

## Arquitectura

```
server.js            API + páginas (Express)
src/ai.js            Prompt → configuración (Claude, salida estructurada con Zod)
src/agent.js         Chatbot: Claude + herramientas (check_availability, create_booking,
                     find_my_bookings, cancel_booking) con esquemas estrictos
src/availability.js  Huecos = horario ∩ ventana de reserva − ocupado (free/busy)
src/bookings.js      Reservas con bloqueo por bot y doble comprobación, emails
src/google.js        OAuth 2.0, Calendar API, Gmail API y calendario demo
src/time.js          Zonas horarias IANA sin dependencias (cambios de hora incluidos)
public/              Panel (SPA), chat y widget incrustable
```

## Tests

```bash
npm test
```

Prueban el cálculo de huecos (jornada partida, festivos, antelación, horario de verano) y un flujo completo de extremo a extremo con la API de Claude simulada: crear la automatización, consultar disponibilidad, reservar, rechazar una doble reserva, enviar los emails y cancelar.
