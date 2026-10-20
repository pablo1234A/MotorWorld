# NEXO · Llamadas comerciales con IA para restaurantes (Make + Vapi)

Sistema real construido en Make (zona `eu1`, equipo "My Team", carpeta **NEXO · Llamadas IA Restaurantes**).

```
[1] Lanzar llamada IA (on-demand, formulario)          [2] Resultado → análisis → email (webhook)
  ⚙️ CONFIG ─ 🧹 Normalizar ─ 🛑 Kill switch             🔔 Webhook Vapi (secreto ?k=)
  ─ 🗂️ Historial ─ 📱 Números Vapi ─ ✅ Validaciones      ─ 📥 Extraer informe ─ 🗂️ Campaña
  ─ ¿Se puede llamar?                                     ─ 💾 Guardar bruto (ANTES de la IA)
     ├─ ✅ 📝 Registrar ─ 🧠 Prompt ─ 👋 Saludo            ─ 🤖 IA: clasificar lead  ⟶ (fallo) email de respaldo
     │    ─ 📞 Vapi POST /call (asistente transitorio)    ─ 🏷️ Clasificación final (reglas + IA)
     │    ─ ¿Aceptada? → IN_PROGRESS | PROVIDER_ERROR      ─ 💾 Guardar ─ 📧 Gmail ⟶ (fallo) email interno Make
     └─ ⛔ Email "llamada NO realizada" + motivos          ─ ✅ EMAIL_SENT
                         [3] Vigilante (cada 60 min)
         Llamadas IN_PROGRESS/sin analizar/sin email >15 min → GET /call/{id} → reinyecta en [2]
         CALL_REQUESTED sin confirmar >15 min → ABORTED + alerta
```

| Recurso Make | ID |
|---|---|
| Escenario `NEXO · [1] Lanzar llamada IA` | 8073350 |
| Escenario `NEXO · [2] Resultado → análisis → email` | 8073299 |
| Escenario `NEXO · [3] Vigilante de llamadas` | 8073264 |
| Webhook `NEXO AI Calls — Vapi end-of-call-report` | 3941798 |
| Estructura de datos `AI Calls — Registro de llamadas` | 648927 |
| Carpeta | 407046 |

## Por qué Vapi (y no Retell / Twilio directo)
- El módulo **Vapi → Make an API Call** permite enviar en cada llamada un **asistente transitorio** completo
  (prompt, voz, modelo, transcriptor, webhook): cambiar restaurante, voz u objetivo no requiere tocar Vapi.
- Retell en Make solo lanza agentes preconfigurados; Twilio solo no tiene IA conversacional.
- El análisis/clasificación se hace en **Make (AI Tools → Extract)** porque el `analysisPlan` de Vapi
  devuelve vacío con frecuencia según su propia comunidad. Los `endedReason` de Vapi fuerzan
  `NO_ANSWER` de forma determinista (no contesta, ocupado, buzón, fallo de conexión).
- Twilio no necesita conexión en Make: el número Twilio se **importa en Vapi** (o se compra en Vapi).

## ⛔ REQUIERE CONEXIÓN / acción tuya

1. **Plan de Make**: el plan Free solo admite 1 data store (ocupado por "Ibermedic Leads").
   Tras subir de plan, avisa a Claude: crea el data store con la estructura 648927, lo asigna a los
   14 módulos de data store y crea el registro `CONTROL` (`STATUS = ACTIVE`).
2. **Vapi (API key privada)** y **Gmail** → autorizar aquí:
   https://eu1.make.com/2850220/credentials-requests/inbox?requestId=c1118280-7f77-48a7-a152-6c4482a94712
   Después, en cada módulo Vapi (3) y Gmail (3) selecciona la conexión creada.
3. **Modelo de IA** en el módulo `🤖 Analizar y clasificar el lead` (escenario 2): elige un modelo en el
   desplegable (la conexión "Make's AI Provider" ya está puesta; la API no permite listar modelos).
4. **Número emisor en Vapi**: Vapi → Phone Numbers → *Import Twilio number* (o compra uno). Para llamar
   a España con un número español, Twilio exige el *regulatory bundle* español aprobado.
5. **Activar** el escenario 2 (webhook) y el 3 (vigilante). El 1 se ejecuta con *Run once*.

## Cómo lanzar una llamada
Escenario 1 → **Run once** → Make pide el formulario:
`PHONE_TO_CALL, CALLER_PHONE, RESTAURANT_NAME, VOICE, CALL_OBJECTIVE, RESTAURANT_CONTEXT, WEBSITE_OFFER,
PRICE, SPECIAL_INSTRUCTIONS, MY_EMAIL` (+ `ALLOW_RECALL`, `IGNORE_CALL_HOURS` para pruebas).

- `VOICE` = `proveedor:voiceId[:modelo]`. Por defecto `11labs:EXAVITQu4vr4xnSDxMaL:eleven_flash_v2_5`
  (voz multilingüe de ElevenLabs; tiene ligero acento no peninsular). Para acento de España: una voz
  castellana de la Voice Library de ElevenLabs (requiere tu key de ElevenLabs en Vapi → Provider Keys)
  o `azure:es-ES-ElviraNeural` / `azure:es-ES-AlvaroNeural`.
- Valores fijos (empresa NEXO, agente Lucía, responsable Pablo, modelo LLM, franjas horarias,
  antiduplicados, intentos) → módulo **⚙️ CONFIG** del escenario 1.

## Reglas de seguridad implementadas
| Regla | Dónde | Por defecto |
|---|---|---|
| Kill switch global | registro `CONTROL` del data store, `STATUS = STOPPED` | ACTIVE |
| Opt-out permanente | la IA detecta "no me llaméis" → `DO_NOT_CALL = true`; nunca se puede forzar | — |
| Antiduplicados | mismo número contactado en los últimos `DEDUP_DAYS` | 30 días |
| Reintento sin respuesta | tras `NO_ANSWER` | 4 h, máx. 3 seguidos |
| Doble ejecución | llamada `CALL_REQUESTED/IN_PROGRESS` en la última hora | bloquea |
| Franjas horarias (Europe/Madrid) | fuera de servicio de cocina | 10:00–13:00 y 16:30–20:00, sin domingos |
| Duración máxima | `maxDurationSeconds` | 8 min |
| Transparencia IA | primer mensaje: "asistente virtual de NEXO" + aviso de grabación; si preguntan, dice que es IA | — |

Revisa la normativa aplicable antes de llamar (en España: art. 66 de la Ley 11/2022 General de
Telecomunicaciones sobre llamadas comerciales no solicitadas, Lista Robinson, RGPD; en la UE, la
obligación de informar de que se habla con una IA del Reglamento de IA). Esto no es asesoramiento legal.

## Registro (data store) — campos
`PHONE_NUMBER, DATE, STATUS, CALL_ID, RESULT, NEXT_ACTION` + `RESTAURANT_NAME, CALLER_PHONE, MY_EMAIL,
CALL_OBJECTIVE, WEBSITE_OFFER, PRICE, ATTEMPTS, ENDED_REASON, DURATION_SEC, INTEREST, CONVERSION_PROB,
SUMMARY, TRANSCRIPT, RECORDING_URL, DO_NOT_CALL, EMAIL_SENT, LAST_ERROR, UPDATED_AT`. Clave = número en dígitos.

`STATUS`: `CALL_REQUESTED → IN_PROGRESS → ENDED_PENDING_ANALYSIS → COMPLETED` · errores: `PROVIDER_ERROR`,
`ABORTED`, `AI_ERROR`.

## Manejo de errores
| Error | Tratamiento |
|---|---|
| Número inválido | normalización E.164 (+34 automático para 9 cifras) + validación → email "NO realizada" |
| Ocupado / no contesta / buzón | `endedReason` → `NO_ANSWER`, reintento según reglas |
| Error del proveedor (Vapi) | estado `PROVIDER_ERROR` + alerta con el detalle HTTP |
| Error de IA | los datos ya están guardados; email de respaldo con transcripción y resumen de Vapi |
| Timeout / llamada colgada | vigilante: `ABORTED` o consulta a Vapi y reprocesa |
| Fallo de webhook | vigilante consulta `GET /call/{id}` y reinyecta el informe en el escenario 2 |
| Email no enviado | respaldo por email interno de Make; el vigilante reintenta si `EMAIL_SENT = false` |
| Webhook falso | filtro por secreto en la URL (`?k=`) |

## Regenerar blueprints
```
python3 builder/build.py --out blueprints                     # versión del repo (secreto redactado)
python3 builder/build.py --out /ruta --secret <SECRETO> --datastore <ID>
```
El prompt del agente vive en `prompts/agente_ventas_restaurantes.md` (con variables de Make).
