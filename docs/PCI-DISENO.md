# Transformación a software de gestión PCI: auditoría y diseño (Fases 0 y 1)

> Producto: plataforma para **empresas mantenedoras de extintores y sistemas de protección contra incendios (PCI)**.
> Se transforma el software real existente, sin crear un proyecto nuevo y sin eliminar funcionalidades.
> Fecha: 2026-11-08.

## 0. Línea base real (antes de tocar nada)

Ejecutada desde una base de datos nueva el 2026-11-08, sobre el commit `9a2a3f2`:

| Prueba | Resultado |
|---|---|
| pgTAP (`pnpm db:test`) | 310/310 |
| Vitest (`pnpm test`, con stripe-mock) | 317/317 (32 archivos) |
| Playwright E2E | 35/35 |
| typecheck, lint, build | OK |
| `pnpm audit` | 0 vulnerabilidades |

## 1. Inventario y decisión por módulo

| Módulo / tabla | Decisión | Motivo |
|---|---|---|
| Auth, 2FA, organizaciones, sucursales, miembros, invitaciones | **Se conserva** | No dependen del sector. |
| Stripe, planes, precios, webhooks, portal | **Se conserva**; solo cambian las descripciones de funcionalidades | Prohibido tocar precios o identificadores. |
| Correo (Resend/SMTP, webhooks, supresión, reputación, plantillas) | **Se conserva y se amplía** con plantillas PCI | Infraestructura sectorial neutra. |
| `customers` | **Se adapta**: tipo (empresa/particular), razón social, CIF/NIF, dirección fiscal, persona de contacto | Un cliente tiene muchas instalaciones; no se duplica. |
| `vehicles`, `maintenance_records`, `maintenance_parts`, `mileage_readings` | **Se conservan como datos heredados** (solo lectura en la API v1 marcada como obsoleta; incluidos en la exportación). Desaparecen de la interfaz | No se convierten datos de coches en equipos PCI (trazabilidad). El producto no tiene clientes reales todavía; aun así no se borra nada. |
| `installations` | **Nueva** | Establecimiento del cliente donde están los equipos. |
| `equipment_categories`, `equipment_types`, `equipment`, `equipment_extinguishers` | **Nuevas** | El equipo PCI pasa a ser la entidad principal. Modelo extensible: categoría (fija, alineada con el RIPCI), tipo (catálogo del sistema + tipos propios del taller) y atributos validados. Los extintores tienen una tabla 1:1 con campos tipados. |
| `maintenance_action_types` + `equipment_action_schedules` | **Nuevas** | Operaciones y periodicidades por categoría, configurables y con referencia normativa. |
| `equipment_maintenance_records` (+ materiales) | **Nueva** | Actuaciones sobre equipos: no se pueden editar en silencio (rectificación con motivo y auditoría, o anulación). |
| `work_orders`, `work_order_items`, `work_order_events` | **Nuevas** | Órdenes con varios equipos de una misma instalación y resultado por equipo. |
| `equipment_incidents` | **Nueva** | Incidencias detectadas. |
| `technicians` | **Nueva** | Perfil operativo; puede vincularse a un miembro del taller. |
| `pci_documents` | **Nueva** | Documentos y fotos (instalación, equipo, orden, actuación, incidencia) en Storage privado con URL firmada. |
| Motor de avisos (`plan_reminders`, `claim_reminders`, dispatcher) | **Se reutiliza**. Nuevo tipo de aviso por instalación (próximas actuaciones de sus equipos). Los avisos por fecha y km de vehículos dejan de planificarse para equipos; el código heredado no se borra | Cola, *leases*, reintentos e idempotencia ya probados. |
| Citas | **Se adaptan**: solicitud de visita técnica, con instalación y tipo de servicio | Mismo flujo público y de confirmación. |
| Presupuestos | **Se adaptan**: instalación asociada y líneas de servicio o material | Mismo IVA, numeración y PDF. |
| Importación | **Se amplía**: plantillas independientes de clientes, instalaciones y equipos, con el mismo flujo (staging, validación, confirmación atómica, informe) | El flujo de vehículos queda como heredado. |
| Informes, inicio, API v1, Google Calendar, privacidad, retención | **Se adaptan** a instalaciones, equipos y órdenes | — |

## 2. Modelo de datos PCI

```
organizations ─┬─ branches
               ├─ technicians (─ organization_members, opcional)
               └─ customers ─── installations ─┬─ equipment ─┬─ equipment_extinguishers (1:1)
                                               │             ├─ equipment_maintenance_records ─ equipment_record_materials
                                               │             ├─ equipment_action_schedules (vencimientos por operación)
                                               │             ├─ equipment_incidents
                                               │             └─ pci_documents (fotos/documentos)
                                               ├─ work_orders ─┬─ work_order_items (equipo + operación prevista + resultado)
                                               │               └─ work_order_events
                                               └─ pci_documents
equipment_categories (sistema)  ─ equipment_types (sistema o del taller)
maintenance_action_types (sistema o del taller, por categoría, con periodicidad y referencia)
```

**Integridad multiempresa**:
- todas las tablas llevan `organization_id` y `branch_id`;
- las FK son compuestas (`organization_id, branch_id, id`), así que un equipo no puede apuntar a una instalación de otro taller ni de otra sucursal;
- los triggers comprueban que:
  - los equipos de una orden y los de una actuación son de la instalación de esa orden;
  - el técnico es del mismo taller;
  - el tipo de equipo es de la categoría indicada.

## 3. Permisos (servidor + RLS)

- Lectura de clientes, instalaciones, equipos e historial: cualquier miembro, en las sucursales a las que tiene acceso (como hasta ahora, ADR-019).
- **Reutilización de códigos de permiso** (sin romper cuentas existentes):
  - `customers.write` cubre clientes **e instalaciones**;
  - `vehicles.write` / `vehicles.delete` pasan a significar «crear/editar/borrar **equipos PCI**» (el código interno se mantiene por compatibilidad; la etiqueta cambia);
  - `maintenance.write` → registrar actuaciones.
- **Nuevos**:
  - `work_orders.manage`: crear, programar, asignar y cancelar órdenes; ver todas;
  - `work_orders.execute`: técnico, que solo ve y ejecuta **las órdenes asignadas a él**;
  - `incidents.write`: registrar y gestionar incidencias.
- Un técnico sin `work_orders.manage` no ve órdenes ajenas, ni siquiera cambiando el id en la URL o la API (RLS).

## 4. Límites del plan

- Nuevo `plans.max_equipment`, con los **mismos valores** que `max_active_vehicles` (Pro 300, Max 2.000, Business y Excelencia ilimitados). Precios y Stripe no cambian.
- Trigger de sentencia con bloqueo por taller (`assert_within_limit(..., 'equipment')`): no se supera ni con peticiones simultáneas.
- **Decisión comercial pendiente del responsable**: si 300 equipos son pocos para el plan Pro en PCI (una sola instalación puede tener decenas de extintores). Cambiarlo es actualizar la fila del plan, sin tocar los precios.

## 5. Normativa (verificada en el BOE)

Fuente: RD 513/2017 (RIPCI), texto consolidado del BOE (BOE-A-2017-6606, última modificación 03/09/2025), anexo II.

- Las periodicidades se cargan como **catálogo configurable** con su referencia literal:
  - Tabla I: cada 3 y cada 6 meses, por el personal del fabricante, de la mantenedora o del titular;
  - Tabla II: cada año y cada 5 años, solo por el fabricante o una empresa mantenedora.
- **Extintores** (tablas I y II):
  - cada 3 meses: verificaciones del titular o la mantenedora;
  - cada año: «Programa de Mantenimiento Anual» de la UNE 23120, que la mantenedora realiza;
  - cada 5 años: prueba de nivel C (timbrado), según el anexo III del Reglamento de Equipos a Presión (RD 809/2021). Literalmente: «A partir de la fecha de timbrado del extintor (y por tres veces) se procederá al retimbrado».
  - El texto consolidado **no** contiene la frase «vida útil de 20 años» para extintores: el sistema calcula el **fin de retimbrados** (fecha de timbrado + 3 retimbrados de 5 años = 20 años) y lo presenta así, con la cita.
- **Otros sistemas**: BIE, hidrantes, columnas secas, detección y alarma, extinción automática, abastecimiento de agua, control de humos y señalización luminiscente. Se cargan con las periodicidades de las tablas I, II y III, sin mezclar operaciones entre categorías.
- El software **no certifica** el cumplimiento, no emite certificados oficiales y no atribuye habilitaciones. Las actas y los informes que genera son documentos de trabajo de la empresa, que firma su responsable técnico.

## 6. Estrategia de migraciones

- Solo migraciones nuevas e incrementales.
- Las antiguas no se modifican.
- Las restricciones solo se amplían.
- Las columnas existentes no se borran.
- Columnas que pasan a admitir nulos (por ejemplo `reminders.vehicle_id`): ampliación compatible.
- Datos de vehículos: se conservan, son legibles en la API v1 (obsoleta, con cabeceras `Deprecation` y `Sunset`) y se incluyen en la exportación del taller.
