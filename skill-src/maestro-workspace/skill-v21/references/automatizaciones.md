# Automatizaciones y agentes

## Elegir herramienta
- **Sin código / rápido**: n8n (autoalojable, potente, barato), Make (visual), Zapier (más integraciones, más caro).
- **Con código**: scripts Python/Node + cron, GitHub Actions (programado y gratis en repos públicos), Cloudflare Workers / Vercel Cron para endpoints ligeros.
- **Agentes con IA**: Claude API con tool use, Claude Agent SDK o Claude Code en modo headless (`claude -p "..."`) dentro de scripts/CI. MCP para conectar herramientas.

## Diseño de un flujo robusto
1. **Disparador** claro (webhook, horario, evento).
2. **Idempotencia**: procesar dos veces el mismo evento no debe duplicar nada (guarda IDs procesados).
3. **Reintentos con backoff** en llamadas externas; timeouts explícitos.
4. **Validación** de datos de entrada antes de actuar.
5. **Registro**: log de cada ejecución con resultado; alerta (email/Slack/Telegram) solo cuando falla.
6. **Secretos** en variables/credenciales del sistema, nunca en el flujo.
7. **Humano en el bucle** para acciones irreversibles (pagos, envíos masivos, borrados).

## Modelo por defecto en scripts que llaman a Claude (regla fija)
- **Clasificar, extraer, etiquetar, resumir textos cortos → el modelo pequeño y rápido más reciente (familia Haiku)** por defecto. Es varias veces más barato y de sobra para estas tareas.
- Modelo grande solo para razonamiento complejo, redacción delicada o código. Hazlo **configurable** con una variable de entorno (`CLAUDE_MODEL`), con el pequeño como valor por defecto, y explica en el README cuándo cambiarlo.
- Usa un prefijo propio para las variables (`MIAPP_MODELO`), no nombres genéricos que pueda tener ya el entorno.

## Ahorro en flujos con IA
- Prompt caching para instrucciones largas repetidas; Batch API (≈50 % más barato) para trabajos no urgentes.
- Pide salida JSON estructurada; limita `max_tokens`.
- Filtra con código antes de llamar a la IA (no mandes al modelo lo que una regex resuelve).

## Plantillas típicas
- Leads de formulario → enriquecer → CRM → email de bienvenida → aviso a ventas.
- Email entrante → clasificar con IA → responder borrador / etiquetar / crear tarea.
- Contenido: idea → guion → vídeo/imagen → programar en redes.
- Informes: extraer datos (API/Sheets) → resumen con IA → enviar cada lunes.

## Antes de entregar un script
- Ejecútalo con datos de prueba simulados (sin credenciales reales): conexión falsa, respuestas falsas del modelo, segunda ejecución para comprobar que no duplica.
- `README` con: requisitos, `.env.example`, cómo obtener cada credencial (p. ej. contraseña de aplicación de Gmail), cómo programarlo (cron / Programador de tareas de Windows / launchd) y cómo saber si ha fallado.
