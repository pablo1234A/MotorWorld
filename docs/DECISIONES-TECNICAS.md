# RevisaYa — Decisiones técnicas

> Registro de decisiones de arquitectura (ADR) y de cuestiones abiertas que requieren aprobación.
> Estado de cada ADR: **Propuesta** (Fase 0, pendiente de aprobación) → **Aceptada** → **Sustituida**.

## 1. Decisiones de arquitectura

| ADR | Decisión | Alternativas descartadas | Motivo | Estado |
|---|---|---|---|---|
| 001 | **Monolito modular en Next.js** (UI + Server Actions + Route Handlers + jobs) con capas `actions → service → repository` | Backend separado (NestJS/Fastify) desde el inicio | Un solo despliegue y un solo lenguaje; los servicios no dependen de Next y podrán extraerse a un worker o a un servicio aparte sin reescribirlos. | Propuesta |
| 002 | **Supabase** (Postgres + Auth + Storage + pg_cron) en **región UE** | Firebase (NoSQL, peor para datos relacionales, RLS y transacciones); Postgres autogestionado | Postgres estándar (sin lock-in del modelo de datos), RLS nativa, backups gestionados, el PDF lo propone. | Propuesta |
| 003 | **Acceso a datos con Kysely** sobre conexión Postgres, aplicando `set local role authenticated` + claims del JWT verificado en cada transacción. El navegador **no** consulta tablas con la Data API: la usa solo para Auth. | supabase-js + funciones RPC para todo lo transaccional | Transacciones reales en TypeScript (importación, presupuestos, límites) **sin perder RLS**; SQL tipado y generado desde la BD; menos superficie de ataque al no exponer las tablas al navegador. | Propuesta |
| 004 | **Multi-tenant en esquema compartido**: `organization_id` + `branch_id` en cada fila, RLS forzada, FK compuestas, tenencia inmutable | Un esquema o una BD por taller | Escala a miles de talleres sin multiplicar migraciones; el aislamiento lo garantiza el motor. | Propuesta |
| 005 | **Sucursal como entidad desde el día uno** (Pro/Max = 1 sucursal automática) | Añadir sucursales al llegar a Business | Evita una migración arriesgada de datos cuando un taller mejora de plan. | Propuesta |
| 006 | **Cola en Postgres** (`FOR UPDATE SKIP LOCKED`, lease, backoff) disparada por `pg_cron` + `pg_net` hacia Route Handlers protegidos | Inngest/Trigger.dev/SQS desde el inicio | Sin servicios extra ni costes al principio; transaccional con los datos; el código de jobs es portable a un worker dedicado. | Propuesta |
| 007 | **Resend** tras `EmailPort`; SES preparado como alternativa; **subdominio compartido** como remitente cuando no hay dominio verificado | SendGrid | API de dominios y webhooks firmados, idempotencia, buena experiencia de desarrollo. SES por coste cuando crezca el volumen. | Propuesta (P1) |
| 008 | **ExcelJS + PapaParse** para importación | Paquete `xlsx` (SheetJS) de npm | La versión de npm de SheetJS está congelada con vulnerabilidades conocidas (prototype pollution, ReDoS); las versiones corregidas solo se distribuyen fuera de npm. | Propuesta |
| 009 | **@react-pdf/renderer** para presupuestos | Playwright/Chromium en serverless | Ligero, sin navegador headless, diseño con componentes. | Propuesta |
| 010 | **decimal.js + `numeric(12,2)`**, redondeo half-up por línea, la BD verifica totales | `number` de JS / céntimos enteros | Exactitud en IVA y totales. | Propuesta |
| 011 | **Cifrado AES-256-GCM en la aplicación** para tokens de Google (clave en el entorno, versionada) | pgsodium / cifrado en BD | La clave nunca está en la BD; Supabase desaconseja pgsodium para nuevos proyectos; rotación sencilla. | Propuesta |
| 012 | **Límites del plan en la BD** (triggers con bloqueo por organización + reserva atómica de correos) y comprobación previa en servicios para dar buenos mensajes | Solo en la aplicación | Coherentes con concurrencia y aunque alguien llame a la API directamente. | Propuesta |
| 013 | **Rate limiting en Postgres** al inicio, interfaz preparada para Redis (Upstash) | Redis desde el día uno | Una dependencia menos al principio. | Propuesta |
| 014 | **Planes en tabla `plans`** sembrada por migración y espejo tipado en `src/server/entitlements` (test que verifica que coinciden) | Constantes solo en código | La BD necesita los límites para los triggers; un único origen evita discrepancias. | Propuesta |
| 015 | **Contenido existente** (`index__1_.html`, web MOTORWORLD) se conserva sin modificar en la raíz; propuesta de moverlo a `legacy/motorworld/` en la Fase 1 | Borrarlo | No tiene relación con RevisaYa, pero no se destruye nada sin autorización. | Propuesta (P14) |

## 2. Cuestiones abiertas: contradicciones, ambigüedades y propuestas

Cada punto incluye una propuesta por defecto. **Ninguna altera precios, límites ni funcionalidades del PDF.**

| # | Tema | Situación | Propuesta | Bloquea |
|---|---|---|---|---|
| P1 | Remitente sin dominio verificado | El PDF dice que el aviso sale "con la dirección del taller, una vez verificado su dominio". Muchos talleres pequeños usan Gmail/Hotmail y **no pueden** verificar ese dominio. Sin alternativa no podrían enviar avisos. | Modo `shared`: `Taller Sur <taller-sur@avisos.revisaya.es>` + `Reply-To` del taller, sin suplantar nunca su dominio. Recomendar el dominio propio en la configuración. | Fase 6 |
| P2 | Unicidad de matrícula | "Evitar duplicados dentro del mismo taller"; con sucursales, ¿taller = sucursal u organización? | Única **por sucursal** (coherente con "datos separados por sucursal"). Alternativa: única por organización. | Fase 1 |
| P3 | Correo vacío en la importación | Mensaje: "obligatoria para avisos por email"; PDF: "correo vacío" aparece como error. | Error por defecto; el taller puede marcar filas como "importar sin correo (no recibirá avisos)". | Fase 4 |
| P4 | Periodo del límite de correos | No se define si es mes natural o ciclo de facturación. | **Mes natural** en la zona horaria del taller, igual para mensual y anual. Cambiar de plan no reinicia el contador. | Fase 1 |
| P5 | Qué cuenta como correo y qué pasa al agotarlo | No definido. | Cuentan recordatorios, confirmaciones de cita y pruebas. Al agotarlo: aviso `skipped/quota_exceeded`, alertas al 80 % y 100 %, reprogramación si se mejora el plan. | Fase 5 |
| P6 | Recordatorios por kilometraje | "Cuando un coche supera los km de la última revisión", pero no hay lectura automática de km. | Estimación por ritmo de km entre lecturas, presentada como estimación; se envía el aviso (fecha o km) que ocurra antes. | Fase 5 |
| P7 | Impago (`past_due`) | No definido. | 7 días de gracia con acceso completo y aviso; después, solo lectura y avisos pausados. | Fase 8 |
| P8 | Seguimiento de aperturas | El PDF quiere medir aperturas en el piloto; el píxel de seguimiento puede requerir consentimiento (LSSI/AEPD). | Desactivado por defecto, activable tras revisión jurídica. Se miden siempre "enviado", "entregado", "cita pedida", "cita confirmada", "cliente que vuelve". | Fase 6 |
| P9 | Retención tras cancelar | "Se conservan un tiempo y luego se borran". | 60 días de conservación (reactivación/exportación) y luego purga, avisando 7 días antes. | Fase 8 |
| P10 | "Plantillas a medida" (Excelencia) frente a "plantillas editables" (todos) | El PDF da plantillas editables a todos los talleres y "plantillas a medida" a Excelencia. | Todos: asunto, texto y botón. Excelencia: diseño HTML a medida por RevisaYa y varias plantillas por tipo. | Fase 6 |
| P11 | IVA en los precios | No se indica si 39 € incluye IVA. | Precios **sin IVA** (B2B) y Stripe Tax añade el IVA. Confirmar con el gestor. | Fase 8 |
| P12 | "Dominio incluido" (Excelencia) | Ambiguo: ¿RevisaYa compra y configura un dominio para el taller? | RevisaYa registra (o configura) un dominio de envío para el taller y gestiona sus registros DNS; coste anual asumido en el precio. | Fase 6 |
| P13 | "Hasta 3 talleres" (Business) | ¿3 en total o principal + 3? | **3 en total**, incluido el principal. | Fase 1 |
| P14 | Archivo MOTORWORLD existente | Web no relacionada en la raíz del repositorio. | Moverlo a `legacy/motorworld/` (o borrarlo si lo autorizas). | Fase 1 |
| P15 | Orden de fases | El encargo deja todo el frontend para la Fase 10. | Cada fase (3–9) incluye **pantallas funcionales mínimas** conectadas al backend para probar de punta a punta; la Fase 10 hace la web pública, el sistema de diseño premium y el pulido. | Fase 3 |
| P16 | Informes (Max) frente a "mostrar cuántos clientes han vuelto" | El PDF reserva *Informes* a Max, pero su riesgo de abandono pide mostrar en el panel cuántos clientes han vuelto (sobre todo a talleres pequeños). | Dashboard básico en **todos** los planes con contadores (avisos enviados, citas pedidas, clientes que han vuelto). Módulo *Informes* (gráficos, filtros por fechas, lista de clientes que no han vuelto, exportación) desde Max. | Fase 9 |
| P17 | Definición de "cliente que vuelve" | Necesaria para no inventar conversiones. | Cliente con un registro de historial en los 90 días siguientes a un aviso entregado para ese vehículo. Se presenta como "volvió tras un aviso", no como causalidad. | Fase 9 |
| P18 | Prueba gratuita | El PDF lo define: 7 días, tarjeta al empezar, sin cobro hasta el final. | Se implementa así, con el plan elegido y sus límites. Una prueba por organización. | — (resuelta) |
| P19 | Matrícula "1234 ABC" con espacio y regla "sin espacios" | Pequeña incoherencia del PDF. | Se normaliza automáticamente; el taller puede escribirla como quiera. | — (resuelta) |
| P20 | Nombre "RevisaYa" | El PDF lo marca como provisional (marca y dominio por comprobar). | El nombre se configura en un único sitio (`src/config/brand.ts`) para poder cambiarlo. | — |
