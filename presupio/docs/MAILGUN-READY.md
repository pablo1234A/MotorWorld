# Mailgun listo para conectar

> **Estado: no conectado.** No se ha creado ninguna cuenta, no se ha tocado ningún DNS y no se ha enviado ningún email real. Todo el código está probado contra un simulador HTTPS de la API de Mailgun (`automation.test.ts`, `protection.test.ts`, `inbound.test.ts` y la auditoría de carga). Este documento enumera **exactamente** qué crear y en qué orden.
>
> En los ejemplos, `tudominio.es` es tu dominio. Los valores marcados con ⚠ los genera Mailgun: **cópialos de su panel**. La documentación oficial de Mailgun no se pudo abrir desde el entorno de desarrollo (red restringida), así que son los valores habituales, sin comprobar.

## 1. Qué usa Presupio de Mailgun

| Uso | Dominio | Cómo |
|---|---|---|
| Emails de seguimiento automáticos | `envios.tudominio.es` | API HTTP `POST /v3/envios.tudominio.es/messages`, región UE (`https://api.eu.mailgun.net`) |
| Emails de la cuenta (verificación, contraseña, invitaciones, avisos de prueba) | `envios.tudominio.es` | SMTP de Mailgun (`MAIL_TRANSPORT=smtp`) |
| Estado de entrega: entregado, rebote, queja, baja | `envios.tudominio.es` | Webhooks firmados → `POST /api/v1/webhooks/mailgun` |
| Detección de respuestas (opcional) | `respuestas.tudominio.es` | Ruta de recepción → `POST /api/v1/webhooks/inbound/mailgun` |

**Remitente de cada email automático:**

- `From`: `"<Nombre de la empresa>" <seguimiento@envios.tudominio.es>`, es decir, `FOLLOWUP_FROM_EMAIL` con el nombre de cada empresa;
- `Reply-To`: el email de la empresa, así que las respuestas van a su buzón;
- `List-Unsubscribe` y `List-Unsubscribe-Post`: baja de un clic;
- `o:tracking=no`: sin píxeles ni enlaces reescritos.

El `From` usa el subdominio verificado, así que SPF y DKIM quedan **alineados** para DMARC.

**Por qué subdominios:** la reputación de los envíos automáticos queda separada del correo personal de `tudominio.es`. Un problema en `envios.` no afecta al correo de la empresa.

## 2. Cuenta

1. Crea la cuenta de Mailgun en la **región UE**. Una cuenta de EE. UU. usa otra API y otros servidores.
2. Firma el **DPA** (acuerdo de tratamiento de datos): Mailgun trata emails de clientes de tus clientes.
3. Elige el plan por volumen. La prueba de carga midió 17 envíos/s con un worker. El límite real lo pone el plan de Mailgun, no Presupio.
4. Activa la verificación en dos pasos de la cuenta.

## 3. DNS (dominio de envío `envios.tudominio.es`)

Añade el dominio en *Sending → Domains → Add new domain* (región EU). Mailgun mostrará los registros. Créalos en tu proveedor DNS:

| # | Nombre (host) | Tipo | Valor | Para qué |
|---|---|---|---|---|
| 1 | `envios` | TXT | `v=spf1 include:mailgun.org ~all` ⚠ | **SPF**: autoriza a Mailgun a enviar como `envios.tudominio.es` |
| 2 | `<selector>._domainkey.envios` ⚠ (p. ej. `pic._domainkey.envios`) | TXT | `k=rsa; p=MIGfMA0…` ⚠ (clave pública, **cópiala entera**) | **DKIM**: firma de cada email |
| 3 | `envios` | MX, prioridad 10 | `mxa.eu.mailgun.org` ⚠ | **MX**: recepción de rebotes y respuestas al dominio de envío (recomendado) |
| 4 | `envios` | MX, prioridad 10 | `mxb.eu.mailgun.org` ⚠ | MX secundario |
| — | `email.envios` | CNAME | — | Seguimiento de clics: **no hace falta** (`o:tracking=no`). No lo crees |

**Notas:**

- Si `envios` ya tuviera otro registro SPF, **no crees un segundo**: une los `include:` en uno solo. Dos registros SPF invalidan los dos.
- Algunos proveedores DNS añaden el dominio automáticamente: escribe `envios`, no `envios.tudominio.es.tudominio.es`.
- TTL de 300–3600 s mientras configuras.
- Espera a que Mailgun marque el dominio como **Verified**, con todos los registros en verde, antes de seguir.

## 4. DMARC (dominio principal)

| Nombre | Tipo | Valor inicial |
|---|---|---|
| `_dmarc` (en `tudominio.es`) | TXT | `v=DMARC1; p=none; rua=mailto:dmarc@tudominio.es; adkim=r; aspf=r; pct=100` |

- Se aplica también a los subdominios (`envios.`, `respuestas.`) salvo que tengan su propio `_dmarc`.
- Empieza con `p=none`, que solo genera informes. Tras **2–4 semanas** de informes limpios, sin fuentes desconocidas y con SPF y DKIM alineados, cambia a `p=quarantine`, y más adelante, si quieres, a `p=reject`.
- El buzón de `rua` recibirá informes XML diarios. Usa un buzón dedicado o un servicio de análisis de DMARC.

## 5. Claves (secretos)

| Variable | Dónde se obtiene en Mailgun | Notas |
|---|---|---|
| `MAILGUN_API_KEY` | *API Security → API keys*: clave privada. Si el panel lo permite, limítala al dominio `envios.` | **Secreto**. Solo en el gestor de secretos del alojamiento |
| `MAILGUN_WEBHOOK_SIGNING_KEY` | *Webhooks → HTTP webhook signing key* | **Secreto**. Sin ella, la API **no arranca** en producción |
| `SMTP_USER` / `SMTP_PASSWORD` | *Domain settings → SMTP credentials* de `envios.` (p. ej. `postmaster@envios.tudominio.es`) | **Secreto**. Para los emails de la cuenta |

## 6. Webhooks (dominio `envios.`)

*Sending → Webhooks*, dominio `envios.tudominio.es`. Una URL, la misma para todos:

`https://app.tudominio.es/api/v1/webhooks/mailgun`

| Evento de Mailgun | Qué hace Presupio |
|---|---|
| **Delivered** | El intento pasa a «Entregado» |
| **Permanent failure** | «Rebotado», excluye el email del contacto y lo anota en el historial |
| **Temporary failure** | Nada: reintenta Mailgun |
| **Spam complaints** | Excluye el email («pidió no recibir más mensajes») y cancela los pendientes |
| **Unsubscribes** | Igual que una queja |
| Opened / Clicked | **No los actives**: no se usan ni se miden |

**Qué comprueba Presupio en cada webhook:**

- firma HMAC-SHA256 con `MAILGUN_WEBHOOK_SIGNING_KEY`, comparada en tiempo constante;
- antigüedad máxima de 15 minutos;
- que el `token` no se haya usado antes (no acepta el mismo dos veces);
- respuestas: `401` con firma incorrecta, `{"status":"ignored"}` si el evento no corresponde a ningún envío y `{"status":"duplicate"}` si se repite.

**Comprobación:**

- el botón «Test webhook» del panel debe obtener `200` con `{"status":"ignored"}`;
- si devuelve `401`, la clave de firma de §5 no es la del panel.

## 7. Correo entrante: detección de respuestas (opcional)

Sin esto, Presupio funciona igual: la empresa registra a mano «el cliente respondió».

1. Añade **`respuestas.tudominio.es`** como dominio (región EU) y crea sus MX:

   | Nombre | Tipo | Valor |
   |---|---|---|
   | `respuestas` | MX, prioridad 10 | `mxa.eu.mailgun.org` ⚠ |
   | `respuestas` | MX, prioridad 10 | `mxb.eu.mailgun.org` ⚠ |

2. Crea una **ruta** en *Receiving → Routes* (prioridad 0):
   - expresión: `match_recipient("respuestas\+.*@respuestas.tudominio.es")`;
   - acciones: `forward("https://app.tudominio.es/api/v1/webhooks/inbound/mailgun")` y `stop()`.
3. Variable: `INBOUND_EMAIL_DOMAIN=respuestas.tudominio.es`. Exige `FOLLOWUP_EMAIL_PROVIDER=mailgun` y la clave de firma.
4. Cada empresa ve su dirección `respuestas+<token>@respuestas.tudominio.es` en *Configuración → Envío automático*. Debe crear en su buzón una regla que reenvíe allí las respuestas de sus clientes.

**Límites:**

- mensajes de hasta 10 MB; nginx admite 11 MB en esa ruta (`ops/nginx/presupio-web.conf`);
- Presupio verifica la firma y descarta duplicados por token y por `Message-Id`;
- no cuentan las respuestas automáticas (fuera de la oficina) ni los rebotes;
- **no se guarda el contenido** del mensaje.

## 8. Variables del servidor

```bash
# Envío automático de seguimientos
FOLLOWUP_EMAIL_PROVIDER=mailgun
FOLLOWUP_FROM_EMAIL=seguimiento@envios.tudominio.es
MAILGUN_DOMAIN=envios.tudominio.es
MAILGUN_API_BASE=https://api.eu.mailgun.net
MAILGUN_API_KEY=<secreto>
MAILGUN_WEBHOOK_SIGNING_KEY=<secreto>
PUBLIC_API_URL=https://app.tudominio.es

# Emails de la cuenta (SMTP de Mailgun, STARTTLS)
MAIL_TRANSPORT=smtp
MAIL_FROM="Presupio <no-reply@envios.tudominio.es>"
SMTP_HOST=smtp.eu.mailgun.org          # ⚠ el que indique el panel para la región UE
SMTP_PORT=587
SMTP_USER=<secreto>
SMTP_PASSWORD=<secreto>

# Opcional: detección de respuestas
INBOUND_EMAIL_DOMAIN=respuestas.tudominio.es
```

**Validación al arrancar.** La API no arranca y dice el motivo en cualquiera de estos casos:

- proveedor sin remitente;
- Mailgun sin clave o sin dominio;
- `MAILGUN_API_BASE` sin `https` en producción;
- falta la clave de firma en producción;
- `INBOUND_EMAIL_DOMAIN` sin Mailgun.

Reinicia la API **y el worker** tras cambiarlas:

```bash
systemctl restart presupio-api presupio-worker
```

## 9. Comprobación de DNS (desde cualquier terminal)

```bash
dig +short TXT envios.tudominio.es              # SPF: una sola línea v=spf1 … include:mailgun.org
dig +short TXT <selector>._domainkey.envios.tudominio.es   # DKIM: k=rsa; p=…
dig +short MX envios.tudominio.es               # mxa/mxb.eu.mailgun.org
dig +short MX respuestas.tudominio.es           # (si usas detección de respuestas)
dig +short TXT _dmarc.tudominio.es              # v=DMARC1; p=none; …
```

## 10. Prueba controlada (solo direcciones propias)

1. **Email de la cuenta:** registra una empresa de prueba con un buzón propio. Llega el email de verificación y el enlace funciona.
2. **Seguimiento automático:**
   - en la empresa de prueba, activa el envío automático con aprobación;
   - crea un presupuesto con un contacto propio (Gmail y Outlook);
   - aprueba el envío.
3. Comprueba en el buzón:
   - remitente con el nombre de la empresa;
   - `Reply-To` a la empresa;
   - en «Mostrar original», `SPF: PASS`, `DKIM: PASS` y `DMARC: PASS`;
   - no ha llegado a spam.
4. En Presupio, el intento pasa a **Entregado** en menos de un minuto (webhook).
5. **Baja:** el botón «Cancelar suscripción» de Gmail (un clic) y el enlace del pie excluyen el email. El siguiente seguimiento de ese contacto no se envía.
6. **Rebote:** envía a un buzón inexistente de un dominio propio. Pasa a «Rebotado» y el email queda excluido.
7. **Respuesta (si §7):** responde desde el buzón de prueba con la regla de reenvío creada. El presupuesto pasa a «Respondido» y se cancelan sus seguimientos.
8. `GET /api/v1/ops/status` sin las alertas `deliveries_stuck_sending` ni `deliveries_unknown_review`.

## 11. Desconectar (vuelta atrás)

- **Parar los envíos automáticos al instante:**
  - `FOLLOWUP_EMAIL_PROVIDER=disabled` y reinicia el worker;
  - los seguimientos quedan pendientes, no se pierden;
  - las empresas ven que el envío automático no está disponible.
- **Tras restaurar una copia de la base de datos**, arranca **siempre** el worker con `FOLLOWUP_EMAIL_PROVIDER=disabled` hasta revisar los envíos posteriores a la copia (`HOSTING-READY.md` §9). Si no, los emails enviados después de la copia se reenvían, como demostró el simulacro.
- **Desactivar la detección de respuestas:** quita `INBOUND_EMAIL_DOMAIN` y borra la ruta de Mailgun.
- **Cambiar de proveedor:** `FOLLOWUP_EMAIL_PROVIDER=smtp` con cualquier SMTP. Funciona, pero sin confirmación de entrega: el estado máximo es «enviado».
