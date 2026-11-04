# RevisaYa — Informe de la Fase 0 (auditoría y planificación)

> Fecha: 2026-11-04 · Estado: **completada, pendiente de aprobación**.
> Fuentes: encargo del responsable del proyecto + PDF *"RevisaYa: plan completo del SaaS para talleres mecánicos"* (7 páginas, leído completo).

Índice de documentos: [ARQUITECTURA](ARQUITECTURA.md) · [BASE-DE-DATOS](BASE-DE-DATOS.md) · [SEGURIDAD](SEGURIDAD.md) · [AUTOMATIZACIONES](AUTOMATIZACIONES.md) · [IMPORTACION](IMPORTACION.md) · [INTEGRACIONES](INTEGRACIONES.md) · [API](API.md) · [TESTING](TESTING.md) · [DESPLIEGUE](DESPLIEGUE.md) · [DECISIONES-TECNICAS](DECISIONES-TECNICAS.md) · [ESTADO-DEL-PROYECTO](ESTADO-DEL-PROYECTO.md)

---

## 0. Auditoría del repositorio

| Elemento | Hallazgo |
|---|---|
| Contenido | Un único archivo `index__1_.html` (107 KB): web estática "MOTORWORLD — La enciclopedia del automóvil". **No guarda relación con RevisaYa** ni hay código reutilizable para el SaaS. No se modifica (ver P14). |
| Ramas | `main` y `ccr-6600ba8f-6x4tpv` (rama de trabajo), mismo commit inicial. |
| Herramientas disponibles | Node 22.23, pnpm 10.28, npm 10.9, Docker 29.9, psql 16.15, git 2.43. Supabase CLI no instalada (se usará vía `pnpm dlx supabase` / devDependency). |
| Versiones actuales en npm | next 16.4.5 · @supabase/supabase-js 2.119.0 · stripe 23.1.0 · supabase CLI 3.0.0. |
| Conclusión | Proyecto desde cero, sin deuda técnica que heredar. Docker permite ejecutar Supabase local y probar RLS de verdad en la Fase 1. |

## 1. Análisis de requisitos

### 1.1 Trazabilidad PDF → diseño

| Requisito del PDF | Dónde queda cubierto |
|---|---|
| Registro, elegir plan o prueba de 7 días con tarjeta sin cobro hasta el final | INTEGRACIONES §3 (Checkout con `trial_period_days=7`, `payment_method_collection=always`) |
| Importación Excel/CSV con plantilla, revisión de errores, nada a medias, 2.000 filas | IMPORTACION completo |
| Historial por coche (fecha, km, trabajos, piezas) | BASE-DE-DATOS §3.4 |
| Tarea diaria que envía el aviso con taller, coche, fecha y botón de cita | AUTOMATIZACIONES, INTEGRACIONES §2 |
| Panel con correos enviados y clientes que han pedido cita | ARQUITECTURA §4 (módulos Recordatorios, Correos, Citas) |
| Sin conexión con DGT/ITV; datos introducidos por el taller | Fuera del alcance a propósito; los km por kilometraje se **estiman** (P6) |
| Marca del taller (logo, nombre, colores) en panel y correos | `organizations` + layout de correo |
| Dirección de envío propia con SPF/DKIM/DMARC y guía | INTEGRACIONES §2.2 (+ P1 para talleres sin dominio) |
| Plantillas editables con `{nombre}`, `{modelo}`, `{matricula}`, `{fecha_revision}` | INTEGRACIONES §2.3 |
| Intervalos de aviso; por km en Max | `branch_settings.offsets_days`, `km_reminders_enabled` |
| **Horario de envío y días sin envíos (festivos, fines de semana)** | `send_window_*`, `send_weekdays`, `blackout_dates`; AUTOMATIZACIONES §2 punto 4 |
| Español de España como base | `locale es-ES`, i18n preparado |
| Módulos y plan mínimo (tabla §6 del PDF) | `plans.features` (BASE-DE-DATOS §3.1) |
| Precios y límites (tabla §7 del PDF) | `plans`, sin cambios (ver §1.3) |
| Cancelar desde el panel; datos se conservan un tiempo y luego se borran | INTEGRACIONES §3, SEGURIDAD §6 (P9) |
| Avisos de servicio sin consentimiento específico; publicidad con consentimiento y baja | SEGURIDAD §6 (enlace de baja siempre; promociones fuera de alcance) |
| Servidores en la UE; DPA con cada taller | SEGURIDAD §6, `legal_acceptances` |
| Resumen con los avisos enviados para el taller | `branch_settings.digest_frequency`, job de resúmenes |
| Correo de bienvenida y de primer aviso de prueba | Fase 6 |
| Riesgos: spam, abandono (mostrar clientes que vuelven), datos de terceros, errores de importación | §8 de este informe, P16, P17 |
| WhatsApp (si se añade) | Fuera de alcance; el `EmailPort` sirve de patrón para un futuro `MessagingPort` |

### 1.2 Requisitos del encargo que amplían el PDF

Multi-tenant con RLS, roles admin/operario con permisos en backend, citas con página pública y anti-spam, presupuestos PDF con aritmética decimal, Google Calendar con tokens cifrados, informes con datos reales, sucursales aisladas, API con API keys y rate limiting, auditoría, RGPD (exportación, derechos), escalabilidad a más de 10.000 talleres, testing completo y 12 fases. Todo queda recogido en los documentos de diseño.

### 1.3 Planes (verificados, sin cambios)

| Plan | Mensual | Anual | Clientes | Vehículos activos | Correos/mes | Usuarios | Talleres | Extras |
|---|---|---|---|---|---|---|---|---|
| Pro | 39 € | 390 € | 150 | 300 | 500 | 1 | 1 | Clientes, vehículos, historial, importación, recordatorios por fecha, presupuestos PDF |
| Max | 79 € | 790 € | 800 | 2.000 | 3.000 | 3 | 1 | + Google Calendar, recordatorios por km, informes |
| Business | 149 € | 1.490 € | ∞ | ∞ | 15.000 | ∞ | 3 | + soporte prioritario, acompañamiento inicial |
| Excelencia | 249 € | 2.490 € | ∞ | ∞ | 50.000 | ∞ | ∞ | + API, plantillas a medida, dominio incluido, gestor de cuenta |

Comprobado: el anual equivale a 10 mensualidades ("dos meses gratis") en los cuatro planes. El PDF dice que los precios son propuestas a validar con talleres; se respetan **exactamente**. Al vivir en la tabla `plans`, un cambio futuro no requeriría tocar código.

### 1.4 Contradicciones y ambigüedades

Son 20, con una propuesta para cada una, en [DECISIONES-TECNICAS §2](DECISIONES-TECNICAS.md#2-cuestiones-abiertas-contradicciones-ambigüedades-y-propuestas). Las más importantes: **P1** (talleres sin dominio propio), **P2** (unicidad de matrícula), **P13** (3 talleres en Business), **P15** (orden de fases) y **P16** (clientes que vuelven en el plan Pro).

## 2. Arquitectura recomendada

Monolito modular **Next.js 16 + TypeScript** sobre **Supabase (PostgreSQL, Auth, Storage, pg_cron) en la UE**, con Kysely para acceso a datos con RLS por transacción, cola de trabajos en Postgres, y adaptadores para Resend/SES, Stripe (TEST), Google Calendar y Turnstile. Detalle y justificación: [ARQUITECTURA](ARQUITECTURA.md) y [DECISIONES-TECNICAS §1](DECISIONES-TECNICAS.md).

## 3. Diagrama de componentes

Ver [ARQUITECTURA §3](ARQUITECTURA.md#3-diagrama-de-componentes) (Mermaid, se ve directamente en GitHub).

## 4–5. Diseño de base de datos y relaciones

45 tablas agrupadas en 11 dominios, diagrama ER, columnas, restricciones, índices, reglas de borrado y matriz RLS: [BASE-DE-DATOS](BASE-DE-DATOS.md). Claves del diseño:

- Tenencia doble (`organization_id` + `branch_id`) con **FK compuestas**: la BD hace imposible relacionar un vehículo con un cliente de otro taller.
- Unicidades que garantizan la idempotencia: recordatorio por evento `(vehículo, tipo, fecha, offset)`, evento de webhook, mensaje del proveedor, número de presupuesto.
- Límites del plan comprobados en triggers con bloqueo y consumo de correos con reserva atómica.

## 6. Sistema de seguridad

Autorización en tres capas (servicio → RLS → restricciones), sesiones verificadas en servidor, secretos fuera del cliente, cifrado de tokens, webhooks firmados e idempotentes, anti-spam en formularios públicos, CSP, auditoría, RGPD (taller = responsable, RevisaYa = encargado) y residencia en la UE: [SEGURIDAD](SEGURIDAD.md).

## 7. Plan de desarrollo

Cada fase termina con: typecheck + lint + build + tests en verde, documentación actualizada y la entrada correspondiente en ESTADO-DEL-PROYECTO. **No se pasa a la siguiente fase sin tu aprobación ni con fallos críticos.**

| Fase | Objetivo | Entregables principales | Criterio de salida | Tamaño |
|---|---|---|---|---|
| 0 | Auditoría y planificación | Este informe y los documentos de diseño | Aprobación de las decisiones y de P1–P17 | — |
| 1 | Infraestructura y BD | Proyecto Next.js + TS estricto, Supabase local, **migraciones** de todo el esquema, RLS, triggers de límites, siembra de `plans`, `.env.example`, CI | pgTAP: aislamiento entre organizaciones y sucursales, límites con concurrencia, FK compuestas, inmutabilidad | L |
| 2 | Backend y autenticación | Registro, login, verificación, recuperación, cambio de contraseña, organizaciones, sucursal primaria, miembros, invitaciones, roles/permisos, guards, errores tipados, auditoría | Tests de permisos (operario ≠ admin), invitaciones por encima del límite rechazadas | L |
| 3 | Clientes, vehículos e historial | Servicios + pantallas mínimas: CRUD, búsqueda, filtros, paginación en servidor, ficha de vehículo, historial, km, cambio de propietario | Integridad, borrado seguro, historial conservado, límites | L |
| 4 | Importación | Plantilla, parseo, staging, corrección, informe de errores, `commit_import` atómico | Importación con errores ⇒ 0 filas; doble confirmación ⇒ 1 sola importación | M |
| 5 | Motor de automatizaciones | planner, dispatcher, reaper, cola, backoff, ventanas de envío, festivos, km estimados, `job_runs`, dead-man switch | Sin duplicados con ejecuciones paralelas; un fallo no detiene el resto; recuperación tras caída | L |
| 6 | Correo | Adaptador Resend, plantillas, vista previa, prueba, dominios + guía, modo compartido, webhooks, supresiones, baja one-click, bienvenida, resúmenes | Envío real en entorno de pruebas y entrega verificada en Gmail/Outlook | L |
| 7 | Citas y presupuestos | Página pública con token, Turnstile, estados, confirmar/rechazar/reprogramar; presupuestos con decimal, numeración, PDF | Solicitud ≠ cita confirmada; totales exactos; numeración sin duplicados en concurrencia | L |
| 8 | Suscripciones y límites | Stripe TEST: checkout con prueba, portal, cambios de plan, cancelación, webhooks, historial de pagos, acceso por estado | Webhook duplicado no duplica; la cancelación se refleja; límites reales por plan | M |
| 9 | Calendar, informes y API | OAuth Google + sincronización, informes con filtros, API v1 con keys, scopes, rate limit y OpenAPI | Sin eventos duplicados; la API no expone datos de otra organización | L |
| 10 | Frontend completo | Sistema de diseño, web pública (inicio, cómo funciona, funcionalidades, precios, FAQ, contacto, legal), pulido del panel, responsive, accesibilidad | E2E de los flujos principales; Lighthouse ≥ 90 en accesibilidad | XL |
| 11 | Seguridad y testing global | Auditoría (IDOR, cabeceras, dependencias, secretos), 2FA admins, pruebas de carga del dispatcher | Sin vulnerabilidades críticas conocidas; los 10 casos críticos en verde | M |
| 12 | Preparación para producción | Entornos staging/prod, backups probados, monitorización, guías, checklist | Checklist de DESPLIEGUE §3 completada (salvo lo que dependa de terceros) | M |

Nota sobre plazos: el PDF plantea un lanzamiento en 8 semanas con un alcance mínimo. El alcance de este encargo (multi-tenant, sucursales, API, Calendar, informes, testing completo) es bastante mayor. **Recomendación**: hacer un piloto con 5–10 talleres al terminar la Fase 8, con las funciones de Pro, y seguir con las Fases 9–12 en paralelo al piloto.

## 8. Riesgos técnicos

| Riesgo | Prob. | Impacto | Mitigación |
|---|---|---|---|
| Correos en spam (riesgo nº 1 del PDF) | Alta | Muy alto | SPF/DKIM/DMARC, subdominio compartido calentado, baja one-click, supresión de rebotes, vigilancia de quejas, pruebas en Gmail/Outlook antes de vender. |
| Talleres sin dominio propio (Gmail) | Alta | Alto | Modo remitente compartido (P1). |
| Fallo de aislamiento entre talleres | Baja | Crítico | RLS forzada + FK compuestas + tests pgTAP en cada CI. |
| Avisos duplicados o perdidos | Media | Alto | Claves únicas, lease + reaper, idempotencia con el proveedor, dead-man switch. |
| Errores de zona horaria y cambio de hora | Media | Medio | `date` para fechas de negocio, cálculo en la zona de la sucursal, tests con cambio de hora en marzo/octubre. |
| Excel reales "sucios" (CSV con `;`, Windows-1252, fechas como número) | Alta | Medio | Detección de separador/codificación, fechas serie de Excel, informe de errores descargable. |
| Kilometraje sin lectura automática | Alta | Medio | Estimación transparente (P6); aviso por fecha como respaldo. |
| Verificación de Google OAuth (semanas) | Media | Medio | Iniciarla pronto (Fase 9); funciona con usuarios de prueba mientras tanto. |
| Límites de dominios por plan del proveedor de correo | Media | Medio | Adaptador SES preparado. |
| Facturación propia (IVA, VeriFactu) y textos legales | Media | Alto | Asesoría fiscal y revisión jurídica antes del primer cobro; Stripe en TEST hasta autorización. |
| Lock-in con Supabase (Auth) | Baja | Medio | Postgres estándar; Auth encapsulado en `src/server/auth`. |
| Límites de serverless (tiempo de ejecución) | Media | Medio | Lotes pequeños con presupuesto de tiempo; worker dedicado cuando la escala lo pida. |
| Alcance grande con pocas manos | Alta | Alto | Fases cerradas con criterios de salida; piloto tras la Fase 8. |

## 9. Dependencias externas

| Servicio | Necesario desde | Acción del responsable |
|---|---|---|
| Supabase (proyectos local/staging/prod, región UE) | Fase 1 (local con Docker; staging en Fase 2) | Crear cuenta y proyecto staging; facilitar claves por variables de entorno seguras. |
| Vercel (u otro hosting) | Fase 2 (previews) | Crear cuenta/proyecto; plan Pro antes de cobrar (Hobby no permite uso comercial). |
| Resend (o SES) | Fase 6 | Cuenta + dominio de RevisaYa verificado (requiere dominio comprado). |
| Stripe (TEST) | Fase 8 | Cuenta en modo test. LIVE solo con autorización del responsable adulto. |
| Google Cloud (OAuth) | Fase 9 | Proyecto, pantalla de consentimiento y solicitud de verificación. |
| Cloudflare Turnstile | Fase 7 | Claves (gratuito). |
| Sentry, healthchecks.io | Fase 5 / 12 | Cuentas (niveles gratuitos al inicio). |
| Dominio `revisaya.*` | Fase 6 | Comprobar marca (OEPM/EUIPO) y disponibilidad, como pide el PDF. |
| Asesoría fiscal y jurídica | Antes del primer cobro | Alta de actividad, IVA, textos legales, DPA. |

## 10. Costes potenciales

Precios orientativos a la fecha de redacción: **compruébalos antes de contratar** (el PDF también lo advierte).

| Concepto | Inicio (0–50 talleres) | Crecimiento (≈500 talleres) | Notas |
|---|---|---|---|
| Supabase | 0 $ (free, solo desarrollo) → **25 $/mes** Pro | 25 $ + cómputo mayor (~50–110 $/mes) | El proyecto de staging añade cómputo (~10 $/mes). PITR es un complemento de pago (del orden de 100 $/mes): recomendable con clientes de pago. |
| Vercel | 0 $ (Hobby, sin uso comercial) → **20 $/usuario/mes** Pro | 20 $ + uso | Alternativa: contenedor en Railway/Fly/Render (~5–20 $/mes). |
| Correo | Resend free (3.000/mes) → **20 $/mes** (50.000) | Resend Scale (~90 $/mes, 100.000) o SES (~0,10 $/1.000) | Con 500 talleres de consumo medio de 1.000 correos = 500.000/mes → SES ≈ 50 $/mes. |
| Stripe | Sin cuota fija | — | Tarjetas EEE ≈ 1,5 % + 0,25 € por cobro + Stripe Billing ≈ 0,7 % del volumen + Stripe Tax ≈ 0,5 % por transacción. Sobre 39 € ≈ 1,3 € por cobro. |
| Google Calendar API | 0 € | 0 € | Cuota gratuita amplia; la verificación OAuth no tiene coste para scopes sensibles. |
| Turnstile | 0 € | 0 € | |
| Sentry | 0 € (Developer) | ~26 $/mes (Team) | |
| Dominio | ~10–15 €/año (.es/.com) | + dominios "incluidos" de Excelencia (P12) | |
| Copia externa (S3/R2, UE) | < 5 €/mes | < 10 €/mes | |
| Asesoría fiscal / gestor | variable (cuota mensual habitual de autónomo) | — | Imprescindible antes del primer cobro. |
| Revisión jurídica de textos legales y DPA | pago único, variable | — | Recomendado por el PDF antes del primer cobro. |
| **Total infraestructura estimada** | **≈ 0 $ en desarrollo · ≈ 70–100 $/mes al lanzar** | **≈ 250–450 $/mes** | Sin contar comisiones de Stripe ni asesoría. |

Referencia: con los 185 talleres de pago del ejemplo del PDF (≈ 10.865 €/mes) la infraestructura sería del orden del 2–3 % de los ingresos, más el ~2,7 % de Stripe.

---

**Siguiente paso**: revisar y aprobar (o corregir) las decisiones ADR-001…015 y las propuestas P1–P17. Con la aprobación empezará la **Fase 1 — Infraestructura y base de datos**.
