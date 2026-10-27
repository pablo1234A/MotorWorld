# AI PRODUCT COMPANY

Empresa virtual gestionada por 10 agentes de IA especializados que trabajan **alrededor de tu PRODUCTO ACTIVO**.
Tú eres el propietario. ATLAS es el CEO. ALEX es el director. El resto son especialistas con skills, permisos y memoria propios.

```
TÚ → ATLAS (CEO) → ALEX (Director) → NOVA · NEO · REX · MAX · LUNA · EVA · NOAH · IRIS → QA → DELIVERY CENTER → INFORME
```

La oficina visual es solo la interfaz. El núcleo es un sistema real: cola de tareas persistente con máquina de estados, workflows, comunicación entre agentes, memoria por ámbitos, supervisión, permisos, aprobaciones humanas, eventos, logs y un motor de render de vídeo real.

---

## Arranque rápido

Requisitos: **Node ≥ 22.13** (usa el SQLite integrado en Node) y **ffmpeg** (motor de render integrado).

```bash
cd ai-product-company
npm install
cp .env.example .env          # opcional: añade ANTHROPIC_API_KEY
npm run build                 # compila la interfaz
npm start                     # http://127.0.0.1:8787
```

La primera vez la app te pide crear la **cuenta del propietario** (única cuenta con acceso).

Desarrollo con recarga en caliente: `npm run dev` (API en :8787 + Vite en :5173).

### El cerebro de los agentes

| Modo | Cuándo | Qué hace |
|---|---|---|
| **Claude** | `ANTHROPIC_API_KEY` configurada | Cada agente razona con Claude (`LLM_MODEL`, por defecto `claude-opus-5-5`) con su identidad, solo las skills relevantes para la tarea, el contexto del producto filtrado para su rol y su memoria. Salidas estructuradas validadas con esquemas. LUNA recibe fotogramas reales del vídeo renderizado. |
| **Motor heurístico local** | sin API key | Reglas deterministas sobre los datos del producto. Toda la empresa funciona de punta a punta, pero todo lo producido queda etiquetado como `local-heuristic` y la interfaz muestra **INTEGRATION_REQUIRED**. |

Hay un límite diario de llamadas al LLM configurable (control de coste) en *Integraciones y ajustes → Operación*.

---

## Primer escenario de prueba

```bash
npm run scenario              # datos temporales, se borran al terminar
npm run scenario -- --persist # escribe en ./data para verlo luego en la interfaz
```

Crea un producto **ficticio** (PostureFlex, marcado como PRODUCTO DE PRUEBA), lo activa y ejecuta *"Atlas, quiero vender más este producto"*:
ATLAS define objetivos → ALEX lanza 2 pipelines de vídeo + 1 auditoría de tienda → NOVA (65 hooks puntuados) → NEO (blueprint) → REX (planos + raw) → MAX (EDL + render MP4 9:16) → LUNA (checks ffprobe + rúbrica, score 0-100) → ALEX entrega → ATLAS revisa y te informa → informe diario.

## Tests

```bash
npm test          # 23 tests: producto, permisos, memoria, task engine, reintentos/escalado,
                  # pipeline completo con vídeo real, bucle de QA hasta el máximo, revisión del
                  # propietario, auditoría de tienda + aprobaciones, seguridad de la API, chat
npm run typecheck
```

---

## Arquitectura

TypeScript de punta a punta. Backend Fastify + SQLite (`node:sqlite`, sin dependencias nativas). Frontend React + Vite. Tiempo real por Server-Sent Events.

```
src/server/
  agents/        10 agentes: identidad, misión, metodología, skills, herramientas, permisos,
                 campos de producto que reciben, memoria, scorecard, límites, comportamiento de error
  skills/        AGENT SKILLS: objetivo, conocimiento, proceso, metodología, criterios de éxito,
                 errores frecuentes, restricciones, scorecard, ejemplos (cargadas por tarea)
  tools/         ToolBelt: única vía de acción de los agentes; cada herramienta exige un permiso
  permissions/   READ · CREATE · EDIT · DELETE · EXECUTE · APPROVE · PUBLISH + acciones críticas
  products/      PRODUCT CENTER + PRODUCT CONTEXT PROPAGATION (cada agente ve solo lo suyo)
  memory/        GLOBAL · PRODUCT · BRAND · AGENT · TASK · CAMPAIGN · VIDEO (sin mezclar)
  tasks/         TASK ENGINE (máquina de estados, cola, prioridades, dependencias, reintentos,
                 deadlines) + scheduler autónomo + ejecutor con quality gate del supervisor
  tasks/types/   El trabajo real de cada agente: prompt experto + motor local + gate + efectos
  workflows/     WORKFLOW ENGINE: strategy, video_pipeline, store_audit, analytics_review, daily_report
  comms/         Comunicación interna entre agentes + chat propietario ↔ agente
  videos/        Vídeos, versiones, assets y QA
  deliveries/    DELIVERY CENTER
  approvals/     APPROVAL CENTER (aprobar / rechazar / pedir cambios)
  store/         Hallazgos CRO de EVA y su riesgo (NOAH)
  reports/       DAILY COMPANY REPORT + métricas internas reales
  integrations/  Adaptadores independientes (ver abajo)
  core/          EVENT SYSTEM, ACTIVITY LOG, ajustes, errores
  auth/          Cuenta del propietario, sesiones
  api/           API HTTP + SSE + streaming de vídeo
src/web/         Interfaz: Control Center, Oficina, Chat, Product Center, Workflows y tareas,
                 Delivery Center, Approval Center, Daily Reports, Agentes y skills, Memoria,
                 Logs y comunicación, Integraciones y ajustes
```

### Estados

- **Tareas:** `PENDING → ASSIGNED → RUNNING → WAITING_REVIEW → (REVISION_REQUIRED → PENDING) → APPROVED → COMPLETED`, más `BLOCKED` y `FAILED`. Transiciones ilegales se rechazan.
- **Agentes:** `WORKING · WAITING · REVIEWING · ERROR · IDLE · APPROVAL_REQUIRED`.
- **Entregas:** `PROCESSING · WAITING_QA · REVISION · APPROVED · DELIVERED` (+ `REJECTED`, `FAILED`).
- **QA (LUNA):** `APPROVED · REVISION_REQUIRED · REJECTED`, score 0-100, cada problema con qué/por qué/cómo/quién. El veredicto lo fuerza la política (umbral y defectos críticos), no solo la opinión del modelo. Máximo de ciclos configurable; al alcanzarlo decide el propietario.

### Autonomía

El scheduler late cada 1,5 s: asigna tareas listas (una por agente, concurrencia configurable), vigila deadlines, reintenta con backoff exponencial y escala errores (agente → ALEX → ATLAS → dashboard; nunca se ocultan). Con **autopilot** activo, ATLAS revisa la empresa periódicamente y lanza objetivos por su cuenta. El informe diario se genera solo a la hora configurada.

### Error handling

1. se registra (task log + activity log + evento) · 2. el agente informa a ALEX · 3. reintento si es seguro · 4. si persiste, `FAILED` y escalado · 5. ALEX informa a ATLAS · 6. aparece en el Control Center.
Falta de integración, presupuesto o permiso → `BLOCKED` (requiere acción del propietario; botón *Reintentar*).

---

## Integraciones

Cada integración es un adaptador independiente en `src/server/integrations/`. La app funciona con todos los conectores externos desconectados.

| Ranura | Estado | Notas |
|---|---|---|
| LLM — Anthropic Claude | CONNECTED con `ANTHROPIC_API_KEY` | Sin key: motor heurístico local (BUILTIN). |
| Generación de vídeo | BUILTIN: *Local Animatic Engine* (ffmpeg) | Animática 9:16 por plano con la foto real del producto. **No es metraje fotorrealista.** Ranura externa: INTEGRATION_REQUIRED (REX ya produce un prompt de generación por plano). |
| Edición / render | BUILTIN: *Local Render Engine* (ffmpeg) | Ejecuta la Edit Decision List de MAX: cortes, zooms, subtítulos, overlays, transiciones, CTA, marca de agua, póster. Ranura externa: INTEGRATION_REQUIRED. |
| Voz / música | INTEGRATION_REQUIRED | El vídeo lleva pista de audio silenciosa; LUNA no penaliza a los agentes por ello. |
| Tienda — página pública | BUILTIN | EVA lee la URL pública del producto (solo lectura, con protección SSRF). |
| Shopify | INTEGRATION_REQUIRED | Con `SHOPIFY_STORE_DOMAIN` + `SHOPIFY_ADMIN_ACCESS_TOKEN`: prueba de conexión de solo lectura (Admin GraphQL). **La escritura en tienda no está implementada a propósito**: los cambios aprobados quedan "pendientes de conector". |
| Analytics / ventas / anuncios | INTEGRATION_REQUIRED | IRIS solo usa datos internos reales; nunca inventa métricas. |
| Publicación | INTEGRATION_REQUIRED | No es necesaria: un vídeo está terminado cuando llega al Delivery Center. Publicar siempre requerirá aprobación. |

Para conectar un motor externo implementa la interfaz correspondiente (`VideoGenerationAdapter`, `RenderAdapter`…) con la API oficial del proveedor y regístralo en `integrations/registry.ts` (los externos tienen preferencia sobre los integrados).

---

## Seguridad

- Cuenta única de propietario, contraseña con scrypt, sesiones aleatorias de 256 bits guardadas con hash, cookie `HttpOnly` + `SameSite=Strict` (`Secure` con `COOKIE_SECURE=true`).
- Todas las rutas `/api` requieren sesión; las que modifican estado exigen la cabecera anti-CSRF.
- Validación de toda entrada con Zod; límite de intentos de login; cabeceras CSP, `X-Frame-Options`, `nosniff`.
- Secretos solo en variables de entorno del servidor; nunca llegan al navegador.
- Los agentes no tienen DELETE ni PUBLISH; las acciones críticas solo se pueden solicitar al Approval Center.
- Los medios se sirven únicamente desde el directorio de datos.

## Variables de entorno

Ver `.env.example`: `PORT`, `HOST`, `DATA_DIR`, `COOKIE_SECURE`, `ANTHROPIC_API_KEY`, `LLM_MODEL`, `FFMPEG_PATH`, `FFPROBE_PATH`, `FONT_FILE`, `SHOPIFY_STORE_DOMAIN`, `SHOPIFY_ADMIN_ACCESS_TOKEN`, `SHOPIFY_API_VERSION`.
