#!/usr/bin/env python3
"""Genera los blueprints de Make para el sistema de llamadas comerciales IA (NEXO).

Uso:
    python3 build.py --out ../blueprints                      # versión para el repo (secreto redactado)
    python3 build.py --out /tmp/x --secret XXX --datastore 123  # versión desplegable

Los IDs de Make (equipo, webhook, conexión IA) son los de la cuenta del propietario.
"""
import argparse
import json
import pathlib

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parent

HOOK_ID = 3941798
HOOK_URL = "https://hook.eu1.make.com/0x167wyfv35e7hbtzdk54bv1icl9quou"
AI_CONNECTION_ID = 11043344  # "Make's AI Provider (default)"
OWNER_EMAIL = "pablogrcab1023@gmail.com"  # miembro del equipo Make: destino de alertas internas

RESULT_CODES = (
    "HOT_LEAD|WARM_LEAD|FOLLOW_UP|NOT_INTERESTED|WRONG_NUMBER|"
    "NO_ANSWER|CALLBACK_REQUESTED|MEETING_BOOKED"
)
# endedReason de Vapi que significan "no hubo conversación humana"
NO_CONV_RE = "/did.not.answer|busy|voicemail|failed.to.connect|no.answer|unanswered|rejected/"


def mod(mid, module, version, x, y, name, mapper=None, parameters=None, **extra):
    m = {
        "id": mid,
        "module": module,
        "version": version,
        "parameters": parameters or {},
        "mapper": mapper or {},
        "metadata": {"designer": {"x": x, "y": y, "name": name}},
    }
    m.update(extra)
    return m


def set_vars(mid, x, y, name, variables, **extra):
    return mod(mid, "util:SetVariables", 1, x, y, name,
               mapper={"variables": [{"name": k, "value": v} for k, v in variables]}, **extra)


def ds(datastore):
    return {"datastore": datastore} if datastore else {}


def cond(a, o, b=None):
    c = {"a": a, "o": o}
    if b is not None:
        c["b"] = b
    return c


def ignore(mid, x, y):
    return mod(mid, "builtin:Ignore", 1, x, y, "Continuar sin fallar")


def owner_alert(mid, x, y, subject, html):
    """Email interno de Make a un miembro del equipo: no necesita conexión."""
    return mod(mid, "email:ActionSendMeEmail", 7, x, y, "Alerta interna (sin conexión)",
               mapper={"to": OWNER_EMAIL, "subject": subject, "html": html})


def gmail(mid, x, y, name, to, subject, html, onerror):
    return mod(mid, "google-email:sendAnEmail", 4, x, y, name,
               mapper={"to": [to], "subject": subject, "bodyType": "rawHtml", "content": html},
               onerror=onerror)


def scenario_meta(instant=False, sequential=False, dlq=False):
    return {
        "version": 1,
        "instant": instant,
        "scenario": {
            "roundtrips": 1, "maxErrors": 3, "autoCommit": True, "autoCommitTriggerLast": True,
            "sequential": sequential, "confidential": False, "dataloss": False,
            "dlq": dlq, "freshVariables": False,
        },
        "designer": {"orphans": []},
    }


# --------------------------------------------------------------------------------------
# Escenario 1 — Lanzar llamada
# --------------------------------------------------------------------------------------

S1_INTERFACE = {
    "input": [
        {"name": "PHONE_TO_CALL", "type": "text", "required": True,
         "help": "Teléfono del restaurante. Formato internacional (+34612345678). Un móvil/fijo español de 9 cifras se completa con +34."},
        {"name": "CALLER_PHONE", "type": "text", "required": True,
         "help": "Número emisor importado en Vapi (+34...) o su Phone Number ID de Vapi."},
        {"name": "RESTAURANT_NAME", "type": "text", "required": True, "help": "Nombre del restaurante."},
        {"name": "VOICE", "type": "text", "default": "11labs:EXAVITQu4vr4xnSDxMaL:eleven_flash_v2_5",
         "help": "proveedor:voiceId[:modelo]. Ej.: 11labs:<voiceId>:eleven_flash_v2_5 · azure:es-ES-ElviraNeural · azure:es-ES-AlvaroNeural"},
        {"name": "CALL_OBJECTIVE", "type": "text", "multiline": True,
         "default": "Conseguir una demo de 15 minutos con el responsable del restaurante para enseñarle cómo una web nueva le puede traer más reservas directas.",
         "help": "Objetivo concreto de esta llamada."},
        {"name": "RESTAURANT_CONTEXT", "type": "text", "multiline": True,
         "help": "Lo que sabes del restaurante (tipo de cocina, si tiene web, reseñas, problemas vistos...). El agente solo usará esto."},
        {"name": "WEBSITE_OFFER", "type": "text", "multiline": True, "required": True,
         "help": "Qué web ofreces: qué incluye, plazos, diferenciales. El agente NO inventará nada fuera de esto."},
        {"name": "PRICE", "type": "text", "help": "Opcional. Si lo dejas vacío el agente no dará cifras."},
        {"name": "SPECIAL_INSTRUCTIONS", "type": "text", "multiline": True, "help": "Opcional. Instrucciones extra para esta llamada."},
        {"name": "MY_EMAIL", "type": "text", "required": True, "default": OWNER_EMAIL,
         "help": "Email donde recibirás el resultado."},
        {"name": "ALLOW_RECALL", "type": "boolean", "default": False,
         "help": "Saltar la ventana antiduplicados (nunca salta el opt-out ni el límite de intentos)."},
        {"name": "IGNORE_CALL_HOURS", "type": "boolean", "default": False,
         "help": "Solo para pruebas: llamar fuera de la franja horaria configurada."},
    ],
    "output": [],
}

PHONE_DIGITS = "replace(replace(var.input.PHONE_TO_CALL; /[^0-9]/g; emptystring); /^00/; emptystring)"
CALLER_DIGITS = "replace(replace(var.input.CALLER_PHONE; /[^0-9]/g; emptystring); /^00/; emptystring)"
CALLER_ID_EXPR = "ifempty(first(map(5.body; id; number; 2.CALLER_E164)); first(map(5.body; id; id; 2.CALLER_RAW)))"
VOICE_PART = "get(split(2.VOICE; :); {})"


def ts(expr):
    return f"parseNumber(formatDate({expr}; X))"


S1_REASONS = " ".join([
    "{{if(length(2.KEY) < 8; TELEFONO_INVALIDO; if(length(2.KEY) > 15; TELEFONO_INVALIDO; emptystring))}}",
    "{{if(length(" + CALLER_ID_EXPR + ") = 0; EMISOR_NO_IMPORTADO_EN_VAPI; emptystring)}}",
    "{{if(length(2.EMAIL) = 0; EMAIL_INVALIDO; if(length(replace(2.EMAIL; /^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$/; emptystring)) = 0; emptystring; EMAIL_INVALIDO))}}",
    "{{if(length(trim(var.input.RESTAURANT_NAME)) = 0; FALTA_RESTAURANT_NAME; emptystring)}}",
    "{{if(length(trim(var.input.WEBSITE_OFFER)) = 0; FALTA_WEBSITE_OFFER; emptystring)}}",
    "{{if(length(trim(1.COMPANY_NAME)) = 0; FALTA_COMPANY_NAME_EN_CONFIG; emptystring)}}",
    "{{if(contains(2.VOICE; :); emptystring; VOICE_FORMATO_INVALIDO)}}",
    "{{if(3.STATUS = STOPPED; CAMPANAS_DETENIDAS_KILL_SWITCH; emptystring)}}",
    # tope de gasto: lo gastado + lo que podría costar esta llamada no puede superar el tope
    "{{if(ifempty(3.SPENT_USD; 0) + parseNumber(1.MAX_CALL_COST_ESTIMATE_USD) > parseNumber(1.MAX_SPEND_USD); TOPE_DE_GASTO_ALCANZADO; emptystring)}}",
    "{{if(4.DO_NOT_CALL = true; NUMERO_EN_LISTA_NO_LLAMAR; emptystring)}}",
    # llamada en curso (doble clic / ejecución duplicada) en los últimos 60 min
    "{{if(" + ts("ifempty(4.DATE; addDays(now; -3650))") + " > " + ts("addMinutes(now; -60)")
    + "; if(4.STATUS = IN_PROGRESS; LLAMADA_EN_CURSO; if(4.STATUS = CALL_REQUESTED; LLAMADA_EN_CURSO; emptystring)); emptystring)}}",
    # ventana antiduplicados: NO_ANSWER -> horas de reintento; resto -> días
    "{{if(var.input.ALLOW_RECALL = true; emptystring; if(4.STATUS = PROVIDER_ERROR; emptystring; if(4.STATUS = ABORTED; emptystring; if("
    + ts("ifempty(4.DATE; addDays(now; -3650))") + " > "
    + ts("addHours(now; 0 - if(4.RESULT = NO_ANSWER; parseNumber(1.NO_ANSWER_RETRY_HOURS); parseNumber(1.DEDUP_DAYS) * 24))")
    + "; LLAMADO_RECIENTEMENTE; emptystring))))}}",
    "{{if(parseNumber(ifempty(4.ATTEMPTS; 0)) >= parseNumber(1.MAX_NO_ANSWER_ATTEMPTS); if(4.RESULT = NO_ANSWER; MAX_INTENTOS_SIN_RESPUESTA; emptystring); emptystring)}}",
    "{{if(var.input.IGNORE_CALL_HOURS = true; emptystring; if(2.DOW = 7; FUERA_DE_HORARIO_DOMINGO; "
    "if(2.HM < parseNumber(1.W1_START); FUERA_DE_HORARIO; if(2.HM <= parseNumber(1.W1_END); emptystring; "
    "if(2.HM < parseNumber(1.W2_START); FUERA_DE_HORARIO; if(2.HM <= parseNumber(1.W2_END); emptystring; FUERA_DE_HORARIO))))))}}",
])

REASONS_LEGEND = (
    "<ul>"
    "<li><b>TELEFONO_INVALIDO</b>: el número a llamar no tiene formato internacional válido.</li>"
    "<li><b>EMISOR_NO_IMPORTADO_EN_VAPI</b>: CALLER_PHONE no existe en Vapi → Phone Numbers.</li>"
    "<li><b>EMAIL_INVALIDO</b>, <b>FALTA_RESTAURANT_NAME</b>, <b>FALTA_WEBSITE_OFFER</b>, <b>VOICE_FORMATO_INVALIDO</b>: revisa el formulario.</li>"
    "<li><b>FALTA_COMPANY_NAME_EN_CONFIG</b>: rellena COMPANY_NAME en el módulo ⚙️ CONFIG.</li>"
    "<li><b>CAMPANAS_DETENIDAS_KILL_SWITCH</b>: el registro CONTROL del data store tiene STATUS = STOPPED.</li>"
    "<li><b>NUMERO_EN_LISTA_NO_LLAMAR</b>: el restaurante pidió no ser llamado (opt-out). No se puede forzar.</li>"
    "<li><b>LLAMADA_EN_CURSO</b>: ya hay una llamada a este número en la última hora.</li>"
    "<li><b>LLAMADO_RECIENTEMENTE</b>: dentro de la ventana antiduplicados (usa ALLOW_RECALL para forzar).</li>"
    "<li><b>MAX_INTENTOS_SIN_RESPUESTA</b>: demasiados intentos seguidos sin respuesta.</li>"
    "<li><b>FUERA_DE_HORARIO</b> / <b>FUERA_DE_HORARIO_DOMINGO</b>: fuera de las franjas configuradas.</li>"
    "<li><b>TOPE_DE_GASTO_ALCANZADO</b>: el gasto acumulado (SPENT_USD del registro CONTROL) más el margen de una "
    "llamada supera MAX_SPEND_USD. Para reanudar: recarga crédito y pon SPENT_USD = 0, o sube el tope en ⚙️ CONFIG.</li>"
    "</ul>"
)


def build_s1(datastore, secret):
    prompt = (ROOT / "prompts" / "agente_ventas_restaurantes.md").read_text(encoding="utf-8")
    first_message = ("{{2.GREETING}}. Soy {{1.AGENT_NAME}}, asistente virtual de {{1.COMPANY_NAME}}, "
                     "y te aviso de que la llamada se graba. ¿Hablo con el restaurante {{trim(var.input.RESTAURANT_NAME)}}?")
    webhook = f"{HOOK_URL}?k={secret}"

    config = set_vars(1, 0, 0, "⚙️ CONFIG (edita aquí)", [
        ("COMPANY_NAME", "NEXO"),
        ("AGENT_NAME", "Lucía"),
        ("OWNER_NAME", "Pablo"),
        ("DEFAULT_OBJECTIVE", "Conseguir una demo de 15 minutos con el responsable del restaurante."),
        ("DEFAULT_VOICE", "11labs:EXAVITQu4vr4xnSDxMaL:eleven_flash_v2_5"),
        ("DEFAULT_11LABS_MODEL", "eleven_flash_v2_5"),
        ("LLM_PROVIDER", "openai"),
        ("LLM_MODEL", "gpt-4o"),
        ("TRANSCRIBER_MODEL", "nova-2"),
        ("TRANSCRIBER_LANGUAGE", "es"),
        ("MAX_CALL_SECONDS", "480"),
        ("DEDUP_DAYS", "30"),
        ("NO_ANSWER_RETRY_HOURS", "4"),
        ("MAX_NO_ANSWER_ATTEMPTS", "3"),
        ("MAX_SPEND_USD", "9"),                 # tope de gasto total en Vapi
        ("MAX_CALL_COST_ESTIMATE_USD", "1.5"),  # margen: coste máximo estimado de una llamada
        ("W1_START", "1000"), ("W1_END", "1300"),
        ("W2_START", "1630"), ("W2_END", "2000"),
        ("TIMEZONE", "Europe/Madrid"),
        ("NONE", "NO CONFIGURADO"),
        ("WEBHOOK_URL", webhook),
        ("JSON_MODEL_PREFIX", ',"model":"'),
        ("QUOTE", '"'),
    ])

    normalize = set_vars(2, 300, 0, "🧹 Normalizar entrada", [
        ("PHONE", "+{{if(length(" + PHONE_DIGITS + ") = 9; 34; emptystring)}}{{" + PHONE_DIGITS + "}}"),
        ("KEY", "{{if(length(" + PHONE_DIGITS + ") = 9; 34; emptystring)}}{{" + PHONE_DIGITS + "}}"),
        ("CALLER_E164", "+{{if(length(" + CALLER_DIGITS + ") = 9; 34; emptystring)}}{{" + CALLER_DIGITS + "}}"),
        ("CALLER_RAW", "{{trim(var.input.CALLER_PHONE)}}"),
        ("EMAIL", "{{lower(trim(var.input.MY_EMAIL))}}"),
        ("VOICE", "{{replace(ifempty(trim(var.input.VOICE); 1.DEFAULT_VOICE); /[^A-Za-z0-9_:.-]/g; emptystring)}}"),
        ("HM", "{{parseNumber(formatDate(now; HHmm; 1.TIMEZONE))}}"),
        ("DOW", "{{parseNumber(formatDate(now; E; 1.TIMEZONE))}}"),
        ("DAY_NAME", "{{switch(formatDate(now; E; 1.TIMEZONE); 1; lunes; 2; martes; 3; miércoles; 4; jueves; 5; viernes; 6; sábado; domingo)}}"),
        ("NOW_TXT", "{{formatDate(now; DD/MM/YYYY HH:mm; 1.TIMEZONE)}}"),
        ("GREETING", "{{if(parseNumber(formatDate(now; HH; 1.TIMEZONE)) < 14; Buenos días; Buenas tardes)}}"),
    ])

    control = mod(3, "datastore:GetRecord", 1, 600, 0, "🛑 Kill switch (registro CONTROL)",
                  mapper={"key": "CONTROL", "returnWrapped": False}, parameters=ds(datastore))
    history = mod(4, "datastore:GetRecord", 1, 900, 0, "🗂️ Historial del número",
                  mapper={"key": "{{2.KEY}}", "returnWrapped": False}, parameters=ds(datastore))
    phones = mod(5, "vapi:makeApiCall2", 2, 1200, 0, "📱 Números emisores en Vapi",
                 mapper={"method": "GET", "relativeURL": "/phone-number",
                         "qs": [{"key": "limit", "value": "100"}], "headers": []},
                 onerror=[
                     owner_alert(51, 1200, 300, "⚠️ NEXO llamadas: error consultando Vapi",
                                 "<p>No se pudo consultar Vapi antes de llamar a <b>{{2.PHONE}}</b> "
                                 "({{var.input.RESTAURANT_NAME}}). Revisa la conexión de Vapi en Make. "
                                 "<b>No se ha realizado ninguna llamada.</b></p>"),
                     ignore(52, 1500, 300),
                 ])
    validate = set_vars(6, 1500, 0, "✅ Validaciones y reglas", [
        ("CALLER_ID", "{{" + CALLER_ID_EXPR + "}}"),
        ("CALLER_NUMBER", "{{ifempty(first(map(5.body; number; number; 2.CALLER_E164)); first(map(5.body; number; id; 2.CALLER_RAW)))}}"),
        ("V_PROVIDER", "{{" + VOICE_PART.format(1) + "}}"),
        ("V_ID", "{{" + VOICE_PART.format(2) + "}}"),
        ("V_MODEL", "{{if(contains(" + VOICE_PART.format(1) + "; labs); ifempty(" + VOICE_PART.format(3)
         + "; 1.DEFAULT_11LABS_MODEL); " + VOICE_PART.format(3) + ")}}"),
        ("ATTEMPTS_NEXT", "{{parseNumber(ifempty(4.ATTEMPTS; 0)) + 1}}"),
        ("REASONS", S1_REASONS),
    ])

    record = mod(8, "datastore:AddRecord", 1, 2100, -150, "📝 Registrar intento (antes de llamar)",
                 parameters=ds(datastore), mapper={
                     "key": "{{2.KEY}}", "overwrite": True,
                     "data": {
                         "PHONE_NUMBER": "{{2.PHONE}}", "DATE": "{{now}}", "STATUS": "CALL_REQUESTED",
                         "CALL_ID": "", "RESULT": "", "NEXT_ACTION": "Esperando resultado de la llamada",
                         "RESTAURANT_NAME": "{{trim(var.input.RESTAURANT_NAME)}}",
                         "CALLER_PHONE": "{{6.CALLER_NUMBER}}", "MY_EMAIL": "{{2.EMAIL}}",
                         "CALL_OBJECTIVE": "{{ifempty(trim(var.input.CALL_OBJECTIVE); 1.DEFAULT_OBJECTIVE)}}",
                         "WEBSITE_OFFER": "{{trim(var.input.WEBSITE_OFFER)}}",
                         "PRICE": "{{trim(var.input.PRICE)}}",
                         "ATTEMPTS": "{{6.ATTEMPTS_NEXT}}", "DO_NOT_CALL": False, "EMAIL_SENT": False,
                         "LAST_ERROR": "", "UPDATED_AT": "{{now}}",
                     }})
    prompt_json = mod(9, "json:TransformToJSON", 1, 2400, -150, "🧠 Prompt del agente → JSON",
                      mapper={"object": prompt})
    first_json = mod(10, "json:TransformToJSON", 1, 2700, -150, "👋 Primer mensaje → JSON",
                     mapper={"object": first_message})

    body = (
        '{"phoneNumberId":"{{6.CALLER_ID}}",'
        '"customer":{"number":"{{2.PHONE}}","numberE164CheckEnabled":true},'
        '"assistant":{'
        '"name":"NEXO ventas web restaurantes",'
        '"firstMessage":{{10.json}},'
        '"firstMessageMode":"assistant-speaks-first",'
        '"firstMessageInterruptionsEnabled":false,'
        '"model":{"provider":"{{1.LLM_PROVIDER}}","model":"{{1.LLM_MODEL}}","temperature":0.6,"maxTokens":200,'
        '"messages":[{"role":"system","content":{{9.json}}}],'
        '"tools":[{"type":"endCall"}]},'
        '"voice":{"provider":"{{6.V_PROVIDER}}","voiceId":"{{6.V_ID}}"'
        '{{if(length(6.V_MODEL) = 0; emptystring; 1.JSON_MODEL_PREFIX)}}{{6.V_MODEL}}'
        '{{if(length(6.V_MODEL) = 0; emptystring; 1.QUOTE)}} },'
        '"transcriber":{"provider":"deepgram","model":"{{1.TRANSCRIBER_MODEL}}","language":"{{1.TRANSCRIBER_LANGUAGE}}"},'
        '"silenceTimeoutSeconds":25,'
        '"maxDurationSeconds":{{parseNumber(1.MAX_CALL_SECONDS)}},'
        '"backgroundSound":"off",'
        '"backgroundDenoisingEnabled":true,'
        '"messagePlan":{"idleMessages":["¿Sigues ahí?","¿Me oyes bien?"],"idleTimeoutSeconds":8,"idleMessageMaxSpokenCount":2},'
        '"startSpeakingPlan":{"waitSeconds":0.6,"transcriptionEndpointingPlan":{"onPunctuationSeconds":0.2,"onNoPunctuationSeconds":1.2,"onNumberSeconds":0.6}},'
        '"stopSpeakingPlan":{"numWords":1,"voiceSeconds":0.3,"backoffSeconds":1,'
        '"acknowledgementPhrases":["vale","sí","ya","ajá","claro","mhm","ok","bueno"]},'
        '"artifactPlan":{"recordingEnabled":true,"transcriptPlan":{"enabled":true,"assistantName":"Agente","userName":"Restaurante"}},'
        '"serverMessages":["end-of-call-report"],'
        '"server":{"url":"{{1.WEBHOOK_URL}}","timeoutSeconds":20},'
        '"metadata":{"source":"make-nexo","key":"{{2.KEY}}"}'
        '}}'
    )
    call = mod(11, "vapi:makeApiCall2", 2, 3000, -150, "📞 Vapi: crear llamada con agente IA",
               mapper={"method": "POST", "relativeURL": "/call",
                       "headers": [{"key": "Content-Type", "value": "application/json"}],
                       "qs": [], "body": body},
               onerror=[
                   mod(111, "datastore:UpdateRecord", 1, 3000, 150, "Guardar error del proveedor",
                       parameters=ds(datastore), mapper={
                           "key": "{{2.KEY}}", "upsert": True, "overwriteArrays": False,
                           "data": {"STATUS": "PROVIDER_ERROR", "UPDATED_AT": "{{now}}",
                                    "NEXT_ACTION": "Revisar error y relanzar",
                                    "LAST_ERROR": "{{ifempty(11.error.message; Error de Vapi al crear la llamada. Ver historial de ejecuciones de Make)}}"}}),
                   owner_alert(112, 3300, 150, "❌ NEXO: Vapi rechazó la llamada a {{var.input.RESTAURANT_NAME}}",
                               "<p>Vapi devolvió un error al crear la llamada a <b>{{2.PHONE}}</b>. "
                               "Causas típicas: número emisor sin saldo o no verificado, número destino inválido, "
                               "voz/modelo no válido o API key incorrecta.</p><p>Detalle: {{11.error.message}}</p>"),
                   ignore(113, 3600, 150),
               ])

    router2 = mod(12, "builtin:BasicRouter", 1, 3300, -150, "¿Vapi aceptó la llamada?", routes=[
        {"flow": [mod(13, "datastore:UpdateRecord", 1, 3600, -300, "✅ Llamada en curso",
                      parameters=ds(datastore),
                      filter={"name": "Llamada creada",
                              "conditions": [[cond("{{11.body.id}}", "exist"),
                                              cond("{{11.statusCode}}", "number:less", "300")]]},
                      mapper={"key": "{{2.KEY}}", "upsert": True, "overwriteArrays": False,
                              "data": {"STATUS": "IN_PROGRESS", "CALL_ID": "{{11.body.id}}",
                                       "UPDATED_AT": "{{now}}"}})]},
        {"flow": [
            mod(14, "datastore:UpdateRecord", 1, 3600, 0, "❌ Error del proveedor",
                parameters=ds(datastore),
                filter={"name": "Vapi no devolvió ID", "conditions": [[cond("{{11.body.id}}", "notexist")]]},
                mapper={"key": "{{2.KEY}}", "upsert": True, "overwriteArrays": False,
                        "data": {"STATUS": "PROVIDER_ERROR", "UPDATED_AT": "{{now}}",
                                 "NEXT_ACTION": "Revisar error y relanzar",
                                 "LAST_ERROR": "HTTP {{11.statusCode}} {{11.body.error}} {{11.body.message}}"}}),
            owner_alert(15, 3900, 0, "❌ NEXO: Vapi no inició la llamada a {{var.input.RESTAURANT_NAME}}",
                        "<p>HTTP {{11.statusCode}} — {{11.body.error}} — {{11.body.message}}</p>"
                        "<p>Número: {{2.PHONE}} · Emisor: {{6.CALLER_NUMBER}} · Voz: {{2.VOICE}}</p>"),
        ]},
    ])

    rejected_html = (
        "<h2>⛔ Llamada NO realizada</h2>"
        "<p><b>Restaurante:</b> {{var.input.RESTAURANT_NAME}}<br><b>Teléfono:</b> {{2.PHONE}}</p>"
        "<p><b>Motivos:</b> {{trim(6.REASONS)}}</p>"
        "<p><b>Último estado registrado:</b> {{4.STATUS}} · {{4.RESULT}} · {{4.DATE}}</p>"
        "<p>Significado de los códigos:</p>" + REASONS_LEGEND
    )
    router = mod(7, "builtin:BasicRouter", 1, 1800, 0, "¿Se puede llamar?", routes=[
        {"flow": [dict(record, filter={
            "name": "✅ Validación correcta",
            "conditions": [[cond("{{length(trim(6.REASONS))}}", "number:equal", "0"),
                            cond("{{2.PHONE}}", "text:pattern", "^\\+[1-9][0-9]{7,14}$")]]}),
                  prompt_json, first_json, call, router2]},
        {"flow": [gmail(20, 2100, 300, "⛔ Avisar: llamada no realizada", "{{2.EMAIL}}",
                        "⛔ Llamada NO realizada — {{var.input.RESTAURANT_NAME}} — {{trim(6.REASONS)}}",
                        rejected_html,
                        onerror=[owner_alert(21, 2100, 600, "⛔ Llamada NO realizada — {{var.input.RESTAURANT_NAME}}",
                                             rejected_html), ignore(22, 2400, 600)])
                  | {"filter": {"name": "⛔ Bloqueada",
                                "conditions": [[cond("{{length(trim(6.REASONS))}}", "number:greater", "0")],
                                               [cond("{{2.PHONE}}", "text:notpattern", "^\\+[1-9][0-9]{7,14}$")]]}}]},
    ])

    return {
        "name": "NEXO · [1] Lanzar llamada IA",
        "flow": [config, normalize, control, history, phones, validate, router],
        "metadata": scenario_meta(),
        "interface": S1_INTERFACE,
    }


# --------------------------------------------------------------------------------------
# Escenario 2 — Resultado de la llamada → análisis → clasificación → email
# --------------------------------------------------------------------------------------

AI_FIELDS = [
    ("classification", "string",
     "Clasificación del lead. Responde EXACTAMENTE uno de: HOT_LEAD, WARM_LEAD, FOLLOW_UP, NOT_INTERESTED, WRONG_NUMBER, "
     "NO_ANSWER, CALLBACK_REQUESTED, MEETING_BOOKED. Reglas por prioridad: MEETING_BOOKED = aceptó un día y hora concretos "
     "para demo o reunión. CALLBACK_REQUESTED = pidió que le llamen en otro momento sin entrar en materia. HOT_LEAD = interés "
     "alto y explícito (pregunta precio, plazos o quiere avanzar) pero sin cita cerrada. WARM_LEAD = reconoce un problema o "
     "muestra interés moderado. FOLLOW_UP = pidió información por email o WhatsApp, tiene que consultarlo, no era el decisor "
     "o la conversación quedó a medias. NOT_INTERESTED = rechazo claro. WRONG_NUMBER = no es el restaurante. NO_ANSWER = no "
     "hubo conversación humana (no contesta, buzón de voz, contestador, menú automático o cuelgan al instante)."),
    ("interest_level", "number", "Nivel de interés del interlocutor de 0 a 100 según lo que dijo realmente. 0 si no hubo conversación."),
    ("conversion_probability", "number", "Probabilidad estimada de que acabe comprando, de 0 a 100. Sé conservador."),
    ("summary", "string", "Resumen breve de la llamada en 2 a 4 frases, en español."),
    ("main_need", "string", "Principal necesidad o problema detectado. 'No detectada' si no hay."),
    ("main_objection", "string", "Principal objeción del cliente. 'Ninguna' si no hubo."),
    ("objections", "string", "Todas las objeciones planteadas y cómo respondió el agente, separadas por ' · '."),
    ("customer_key_points", "string", "Lo más importante que dijo el cliente (hechos, citas literales cortas), separado por ' · '."),
    ("recommended_offer", "string", "Qué producto u oferta encaja mejor según la conversación, sin inventar productos que no estén en la oferta."),
    ("next_step", "string", "Próximo paso recomendado, concreto y accionable, con fecha si se acordó."),
    ("meeting_datetime", "string", "Día y hora acordados para la demo/reunión tal y como se dijeron. Vacío si no hay."),
    ("callback_datetime", "string", "Cuándo pidió que se le vuelva a llamar. Vacío si no aplica."),
    ("contact_name_role", "string", "Nombre y cargo del interlocutor o del decisor si se mencionaron."),
    ("contact_details", "string", "Email, móvil o WhatsApp facilitados. Vacío si no se dieron."),
    ("decision_maker", "string", "¿Hablaba con quien decide? 'Sí', 'No' o 'Desconocido'."),
    ("website_status", "string", "Situación de su web actual: si tienen, si está actualizada, móvil, reservas, carta, Google, satisfacción. 'Desconocido' si no se habló."),
    ("do_not_call", "boolean", "true SOLO si el interlocutor pidió explícitamente no volver a ser llamado o ser eliminado de la lista."),
    ("agent_feedback", "string", "Una o dos frases de mejora para el agente de voz (qué hizo bien o mal)."),
]


def build_s2(datastore, secret):
    m = "1.message"
    ended_at = f"ifempty({m}.call.endedAt; now)"
    started_at = f"ifempty({m}.call.startedAt; {ended_at})"
    no_conv = f"length(replace(ifempty(2.ENDED_REASON; x); {NO_CONV_RE}; emptystring)) < length(ifempty(2.ENDED_REASON; x))"
    ai_cls = "upper(trim(5.information.classification))"

    extract = set_vars(2, 300, 0, "📥 Extraer informe de Vapi", [
        ("CALL_ID", f"{{{{ifempty({m}.call.id; {m}.callId)}}}}"),
        ("KEY", f"{{{{replace(ifempty({m}.call.customer.number; {m}.customer.number); /[^0-9]/g; emptystring)}}}}"),
        ("PHONE", f"+{{{{replace(ifempty({m}.call.customer.number; {m}.customer.number); /[^0-9]/g; emptystring)}}}}"),
        ("ENDED_REASON", f"{{{{ifempty({m}.endedReason; {m}.call.endedReason)}}}}"),
        ("TRANSCRIPT", f"{{{{substring(ifempty({m}.artifact.transcript; ifempty({m}.transcript; {m}.call.artifact.transcript)); 0; 15000)}}}}"),
        ("RECORDING_URL", f"{{{{ifempty({m}.artifact.recordingUrl; ifempty({m}.recordingUrl; {m}.call.artifact.recordingUrl))}}}}"),
        ("DURATION", f"{{{{round(ifempty({m}.durationSeconds; {ts(ended_at)} - {ts(started_at)}))}}}}"),
        ("VAPI_SUMMARY", f"{{{{ifempty({m}.analysis.summary; ifempty({m}.summary; {m}.call.analysis.summary))}}}}"),
        ("COST", f"{{{{ifempty({m}.cost; {m}.call.cost)}}}}"),
        ("SOURCE", f"{{{{ifempty({m}.source; vapi)}}}}"),
    ], filter={"name": "Informe de fin de llamada auténtico",
               "conditions": [[cond(f"{{{{{m}.type}}}}", "text:equal", "end-of-call-report"),
                               cond("{{1.k}}", "text:equal", secret)]]})

    get_rec = mod(3, "datastore:GetRecord", 1, 600, 0, "🗂️ Datos de la campaña",
                  mapper={"key": "{{2.KEY}}", "returnWrapped": False}, parameters=ds(datastore))

    save_raw = mod(4, "datastore:UpdateRecord", 1, 900, 0, "💾 Guardar datos brutos (antes de la IA)",
                   parameters=ds(datastore),
                   filter={"name": "No procesada aún (idempotencia)",
                           "conditions": [[cond("{{3.CALL_ID}}", "text:notequal", "{{2.CALL_ID}}")],
                                          [cond("{{3.EMAIL_SENT}}", "text:notequal", "true")]]},
                   mapper={"key": "{{2.KEY}}", "upsert": True, "overwriteArrays": False, "data": {
                       "PHONE_NUMBER": "{{2.PHONE}}", "CALL_ID": "{{2.CALL_ID}}",
                       "STATUS": "ENDED_PENDING_ANALYSIS", "ENDED_REASON": "{{2.ENDED_REASON}}",
                       "DURATION_SEC": "{{2.DURATION}}", "TRANSCRIPT": "{{2.TRANSCRIPT}}",
                       "RECORDING_URL": "{{2.RECORDING_URL}}", "SUMMARY": "{{2.VAPI_SUMMARY}}",
                       "COST_USD": "{{ifempty(2.COST; 0)}}", "UPDATED_AT": "{{now}}"}})

    # Tope de gasto: suma el coste de la llamada al registro CONTROL una sola vez por llamada
    # (3.COST_USD es el valor previo: si ya existía, esta llamada ya se contó).
    spent_expr = "ifempty(10.SPENT_USD; 0) + if(ifempty(3.COST_USD; -1) = -1; ifempty(2.COST; 0); 0)"
    get_control = mod(10, "datastore:GetRecord", 1, 900, -300, "💰 Gasto acumulado (CONTROL)",
                      mapper={"key": "CONTROL", "returnWrapped": False}, parameters=ds(datastore))
    add_spend = mod(11, "datastore:UpdateRecord", 1, 1050, -300, "💰 Sumar coste de la llamada",
                    parameters=ds(datastore),
                    mapper={"key": "CONTROL", "upsert": True, "overwriteArrays": False,
                            "data": {"SPENT_USD": "{{" + spent_expr + "}}", "UPDATED_AT": "{{now}}"}})

    ai_input = (
        "Eres un director comercial experto en venta consultiva de páginas web para restaurantes. Analiza esta llamada "
        "comercial hecha por un agente de voz IA y extrae la información pedida. Básate SOLO en la transcripción: no "
        "inventes nada; si un dato no aparece, déjalo vacío o indica 'No detectado'. Escribe en español.\n\n"
        "CONTEXTO DE LA CAMPAÑA\n"
        "Restaurante: {{3.RESTAURANT_NAME}}\nObjetivo: {{3.CALL_OBJECTIVE}}\nOferta: {{3.WEBSITE_OFFER}}\n"
        "Precio configurado: {{ifempty(3.PRICE; no configurado)}}\n\n"
        "DATOS TÉCNICOS\nMotivo de fin de llamada (Vapi): {{2.ENDED_REASON}}\nDuración: {{2.DURATION}} segundos\n\n"
        "TRANSCRIPCIÓN (Agente = IA de ventas, Restaurante = interlocutor)\n"
        "{{ifempty(2.TRANSCRIPT; SIN TRANSCRIPCION, no hubo conversacion)}}"
    )
    ai_fail_html = (
        "<h2>⚠️ Llamada terminada — análisis IA no disponible</h2>"
        "<p>La llamada se guardó correctamente, pero el análisis automático falló. Revisión manual necesaria.</p>"
        "<p><b>Restaurante:</b> {{3.RESTAURANT_NAME}}<br><b>Teléfono:</b> {{2.PHONE}}<br>"
        "<b>Duración:</b> {{2.DURATION}} s<br><b>Fin:</b> {{2.ENDED_REASON}}</p>"
        "<p><b>Resumen de Vapi:</b> {{2.VAPI_SUMMARY}}</p>"
        "<p><b>Grabación:</b> {{2.RECORDING_URL}}</p>"
        "<h3>TRANSCRIPCIÓN</h3><div style=\"white-space:pre-wrap;font-family:monospace\">{{escapeHTML(2.TRANSCRIPT)}}</div>"
    )
    analyze = mod(5, "ai-tools:Extract", 2, 1200, 0, "🤖 Analizar y clasificar el lead (IA)",
                  parameters={"makeConnectionId": AI_CONNECTION_ID},
                  mapper={"input": ai_input,
                          "fields": [{"name": n, "type": t, "description": d} for n, t, d in AI_FIELDS]},
                  onerror=[
                      mod(51, "datastore:UpdateRecord", 1, 1200, 300, "Guardar fallo de IA",
                          parameters=ds(datastore),
                          mapper={"key": "{{2.KEY}}", "upsert": True, "overwriteArrays": False,
                                  "data": {"STATUS": "AI_ERROR", "RESULT": "FOLLOW_UP", "EMAIL_SENT": True,
                                           "NEXT_ACTION": "Revisión manual: el análisis IA falló",
                                           "LAST_ERROR": "{{ifempty(5.error.message; Fallo del módulo de IA)}}",
                                           "UPDATED_AT": "{{now}}"}}),
                      gmail(52, 1500, 300, "Email de respaldo (sin IA)", "{{3.MY_EMAIL}}",
                            "Resultado llamada — {{ifempty(3.RESTAURANT_NAME; 2.PHONE)}} — REVISIÓN MANUAL",
                            ai_fail_html,
                            onerror=[owner_alert(53, 1500, 600, "Resultado llamada — {{2.PHONE}} — REVISIÓN MANUAL",
                                                 ai_fail_html), ignore(54, 1800, 600)]),
                      ignore(55, 1800, 300),
                  ])

    classify = set_vars(6, 1500, 0, "🏷️ Clasificación final", [
        ("RESULT", "{{if(" + no_conv + "; NO_ANSWER; ifempty(if(length(replace(" + ai_cls + "; /^(" + RESULT_CODES
         + ")$/; emptystring)) = 0; " + ai_cls + "; FOLLOW_UP); FOLLOW_UP))}}"),
        ("CALL_STATUS", "{{if(length(replace(ifempty(2.ENDED_REASON; x); /busy/; emptystring)) < length(ifempty(2.ENDED_REASON; x)); OCUPADO; "
         "if(length(replace(ifempty(2.ENDED_REASON; x); /voicemail/; emptystring)) < length(ifempty(2.ENDED_REASON; x)); BUZON_DE_VOZ; "
         "if(length(replace(ifempty(2.ENDED_REASON; x); /failed.to.connect|error/; emptystring)) < length(ifempty(2.ENDED_REASON; x)); FALLO_DE_CONEXION; "
         "if(" + no_conv + "; NO_CONTESTA; CONVERSACION))))}}"),
        ("INTEREST", "{{if(" + no_conv + "; 0; round(parseNumber(ifempty(5.information.interest_level; 0))))}}"),
        ("CONVERSION", "{{if(" + no_conv + "; 0; round(parseNumber(ifempty(5.information.conversion_probability; 0))))}}"),
        ("NEXT_ACTION", "{{if(" + no_conv + "; Reintentar en otra franja horaria; ifempty(5.information.next_step; Revisar la llamada manualmente))}}"),
        ("DO_NOT_CALL", "{{if(5.information.do_not_call = true; true; false)}}"),
        ("ATTEMPTS", "{{if(" + no_conv + "; parseNumber(ifempty(3.ATTEMPTS; 1)); 0)}}"),
        ("DURATION_TXT", "{{floor(2.DURATION / 60)}} min {{2.DURATION - floor(2.DURATION / 60) * 60}} s"),
        ("SUMMARY", "{{ifempty(5.information.summary; 2.VAPI_SUMMARY)}}"),
    ])

    save_final = mod(7, "datastore:UpdateRecord", 1, 1800, 0, "💾 Guardar clasificación",
                     parameters=ds(datastore),
                     mapper={"key": "{{2.KEY}}", "upsert": True, "overwriteArrays": False, "data": {
                         "STATUS": "COMPLETED", "RESULT": "{{6.RESULT}}", "NEXT_ACTION": "{{6.NEXT_ACTION}}",
                         "INTEREST": "{{6.INTEREST}}", "CONVERSION_PROB": "{{6.CONVERSION}}",
                         "SUMMARY": "{{6.SUMMARY}}", "DO_NOT_CALL": "{{6.DO_NOT_CALL}}",
                         "ATTEMPTS": "{{6.ATTEMPTS}}", "EMAIL_SENT": False, "LAST_ERROR": "",
                         "UPDATED_AT": "{{now}}"}})

    def row(label, value):
        return (f"<tr><td style=\"padding:6px 12px 6px 0;color:#555;white-space:nowrap;vertical-align:top\"><b>{label}</b></td>"
                f"<td style=\"padding:6px 0\">{value}</td></tr>")

    def block(title, value):
        return (f"<h3 style=\"margin:22px 0 6px;font-size:14px;letter-spacing:.04em;color:#111\">{title}</h3>"
                f"<div style=\"white-space:pre-wrap\">{value}</div>")

    ai = "5.information"
    email_html = (
        "<div style=\"font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;font-size:14px;line-height:1.5;color:#222;max-width:720px\">"
        "<table style=\"border-collapse:collapse\">"
        + row("Restaurante:", "{{ifempty(3.RESTAURANT_NAME; Desconocido)}}")
        + row("Teléfono:", "{{2.PHONE}}")
        + row("Duración:", "{{6.DURATION_TXT}}")
        + row("Resultado:", "<b>{{6.RESULT}}</b> · {{6.CALL_STATUS}}")
        + row("Nivel de interés:", "{{6.INTEREST}} / 100")
        + row("Probabilidad de conversión:", "{{6.CONVERSION}} %")
        + row("Reunión acordada:", f"{{{{ifempty({ai}.meeting_datetime; —)}}}}")
        + row("Volver a llamar:", f"{{{{ifempty({ai}.callback_datetime; —)}}}}")
        + row("Interlocutor:", f"{{{{ifempty({ai}.contact_name_role; —)}}}} · ¿Decisor?: {{{{ifempty({ai}.decision_maker; Desconocido)}}}}")
        + row("Contacto facilitado:", f"{{{{ifempty({ai}.contact_details; —)}}}}")
        + row("No volver a llamar:", "{{if(6.DO_NOT_CALL = true; SÍ, añadido a la lista de exclusión; No)}}")
        + "</table>"
        + block("RESUMEN:", "{{escapeHTML(6.SUMMARY)}}")
        + block("NECESIDAD DETECTADA:", f"{{{{escapeHTML({ai}.main_need)}}}}")
        + block("OBJECIONES:", f"Principal: {{{{escapeHTML({ai}.main_objection)}}}}<br>{{{{escapeHTML({ai}.objections)}}}}")
        + block("QUÉ DIJO EL CLIENTE:", f"{{{{escapeHTML({ai}.customer_key_points)}}}}")
        + block("SITUACIÓN DE SU WEB:", f"{{{{escapeHTML({ai}.website_status)}}}}")
        + block("OFERTA QUE ENCAJA:", f"{{{{escapeHTML({ai}.recommended_offer)}}}}")
        + block("PRÓXIMO PASO:", "<b>{{escapeHTML(6.NEXT_ACTION)}}</b>")
        + block("MEJORA PARA EL AGENTE:", f"{{{{escapeHTML({ai}.agent_feedback)}}}}")
        + block("TRANSCRIPCIÓN:", "<span style=\"font-family:ui-monospace,Menlo,monospace;font-size:12px\">"
                "{{ifempty(escapeHTML(2.TRANSCRIPT); No disponible)}}</span>")
        + "<p style=\"margin-top:24px;color:#777;font-size:12px\">Grabación: {{ifempty(2.RECORDING_URL; no disponible)}}<br>"
          "Call ID: {{2.CALL_ID}} · Fin: {{2.ENDED_REASON}} · Coste Vapi: {{2.COST}} USD · "
          "Gasto acumulado: {{" + spent_expr + "}} USD · Origen: {{2.SOURCE}}</p>"
        "</div>"
    )
    subject = "Resultado llamada — {{ifempty(3.RESTAURANT_NAME; 2.PHONE)}} — {{6.RESULT}}"

    send = gmail(8, 2100, 0, "📧 Email al propietario", "{{3.MY_EMAIL}}", subject, email_html, onerror=[
        owner_alert(81, 2100, 300, subject, "<p style=\"color:#b00\">Aviso: Gmail falló o no hay MY_EMAIL; "
                    "enviado por el email interno de Make.</p>" + email_html),
        mod(82, "datastore:UpdateRecord", 1, 2400, 300, "Marcar enviado por respaldo",
            parameters=ds(datastore),
            mapper={"key": "{{2.KEY}}", "upsert": True, "overwriteArrays": False,
                    "data": {"EMAIL_SENT": True, "LAST_ERROR": "Gmail falló; email enviado por respaldo interno de Make",
                             "UPDATED_AT": "{{now}}"}}),
        ignore(83, 2700, 300),
    ])
    mark_sent = mod(9, "datastore:UpdateRecord", 1, 2400, 0, "✅ Marcar email enviado",
                    parameters=ds(datastore),
                    mapper={"key": "{{2.KEY}}", "upsert": True, "overwriteArrays": False,
                            "data": {"EMAIL_SENT": True, "UPDATED_AT": "{{now}}"}})

    hook = mod(1, "gateway:CustomWebHook", 1, 0, 0, "🔔 Vapi: fin de llamada",
               parameters={"hook": HOOK_ID, "maxResults": 1})
    return {
        "name": "NEXO · [2] Resultado → análisis → email",
        "flow": [hook, extract, get_rec, save_raw, get_control, add_spend, analyze, classify, save_final, send, mark_sent],
        "metadata": scenario_meta(instant=True, sequential=True, dlq=True),
    }


# --------------------------------------------------------------------------------------
# Escenario 3 — Vigilante: webhooks perdidos, análisis/email fallidos, llamadas colgadas
# --------------------------------------------------------------------------------------

def build_s3(datastore, secret):
    search = mod(1, "datastore:SearchRecord", 1, 0, 0, "🔎 Llamadas sin cerrar",
                 parameters={**ds(datastore), "limit": 20, "continueWhenNoRes": False},
                 mapper={"filter": [
                     [cond("STATUS", "text:equal", "IN_PROGRESS")],
                     [cond("STATUS", "text:equal", "CALL_REQUESTED")],
                     [cond("STATUS", "text:equal", "ENDED_PENDING_ANALYSIS")],
                     [cond("STATUS", "text:equal", "COMPLETED"), cond("EMAIL_SENT", "boolean:isfalse")],
                 ]})

    stale = cond("{{1.data.UPDATED_AT}}", "date:less", "{{addMinutes(now; -15)}}")
    fresh = cond("{{1.data.DATE}}", "date:greater", "{{addHours(now; -24)}}")

    get_call = mod(3, "vapi:makeApiCall2", 2, 600, -150, "📞 Vapi: estado real de la llamada",
                   filter={"name": "Tiene CALL_ID, parada >15 min, <24 h",
                           "conditions": [[cond("{{1.data.CALL_ID}}", "exist"),
                                           cond("{{1.data.STATUS}}", "text:notequal", "CALL_REQUESTED"),
                                           stale, fresh]]},
                   mapper={"method": "GET", "relativeURL": "/call/{{1.data.CALL_ID}}", "headers": [], "qs": []},
                   onerror=[ignore(31, 600, 150)])
    to_json = mod(4, "json:TransformToJSON", 1, 900, -150, "Llamada → JSON",
                  filter={"name": "La llamada ya terminó",
                          "conditions": [[cond("{{3.body.status}}", "text:equal", "ended")]]},
                  mapper={"object": "{{3.body}}"})
    replay = mod(5, "http:ActionSendData", 3, 1200, -150, "🔁 Reinyectar en el escenario 2",
                 parameters={"handleErrors": True, "useNewZLibDeCompress": True},
                 mapper={"url": f"{HOOK_URL}?k={secret}", "method": "post", "headers": [], "qs": [],
                         "bodyType": "raw", "contentType": "application/json", "parseResponse": False,
                         "serializeUrl": False, "shareCookies": False, "rejectUnauthorized": True,
                         "followRedirect": True, "followAllRedirects": False, "useQuerystring": False,
                         "gzip": True, "useMtls": False,
                         "data": '{"message":{"type":"end-of-call-report","source":"watchdog","call":{{4.json}}}}'},
                 onerror=[ignore(51, 1200, 150)])

    abort = mod(6, "datastore:UpdateRecord", 1, 600, 300, "🧯 Marcar llamada abortada",
                parameters=ds(datastore),
                filter={"name": "Nunca confirmada por Vapi (>15 min)",
                        "conditions": [[cond("{{1.data.STATUS}}", "text:equal", "CALL_REQUESTED"), stale]]},
                mapper={"key": "{{1.key}}", "upsert": True, "overwriteArrays": False,
                        "data": {"STATUS": "ABORTED", "UPDATED_AT": "{{now}}",
                                 "NEXT_ACTION": "Relanzar la llamada si procede",
                                 "LAST_ERROR": "Vapi nunca confirmó la llamada (timeout)"}})
    abort_alert = owner_alert(7, 900, 300, "🧯 NEXO: llamada abortada — {{1.data.RESTAURANT_NAME}}",
                              "<p>La llamada a <b>{{1.data.PHONE_NUMBER}}</b> ({{1.data.RESTAURANT_NAME}}) se registró pero "
                              "Vapi nunca la confirmó. Se ha marcado como ABORTED y puede relanzarse.</p>")

    router = mod(2, "builtin:BasicRouter", 1, 300, 0, "¿Qué le pasa?", routes=[
        {"flow": [get_call, to_json, replay]},
        {"flow": [abort, abort_alert]},
    ])
    return {
        "name": "NEXO · [3] Vigilante de llamadas",
        "flow": [search, router],
        "metadata": scenario_meta(),
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True)
    ap.add_argument("--secret", default="<WEBHOOK_SECRET>")
    ap.add_argument("--datastore", type=int, default=0)
    args = ap.parse_args()
    out = pathlib.Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    for fname, builder in (("s1_lanzar_llamada.json", build_s1),
                           ("s2_resultado_email.json", build_s2),
                           ("s3_vigilante.json", build_s3)):
        bp = builder(args.datastore, args.secret)
        (out / fname).write_text(json.dumps(bp, ensure_ascii=False, indent=2), encoding="utf-8")
        print(out / fname, len(json.dumps(bp)))


if __name__ == "__main__":
    main()
