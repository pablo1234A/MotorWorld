# Product

<!-- impeccable:product-schema 1 -->

> Fuente: plan maestro de Presupio (PDF, 28/10/2026) e instrucciones del fundador en los prompts de fase. No hubo entrevista: el fundador pidió explícitamente no hacer preguntas innecesarias. Lo marcado *(inferido)* sale del documento, no de una confirmación directa.

## Platform

web

## Stack

Delegado por el fundador. Backend: Node 22 + Fastify + PostgreSQL (fase 1). Frontend: React + Vite + TypeScript (fase 2). Sin app nativa en el MVP (decisión explícita del plan maestro).

## Users

- **Usuario diario:** comercial, gerente o persona que prepara y persigue presupuestos en una empresa española de reformas integrales de vivienda de 5–15 personas. Trabaja entre la oficina (ordenador) y las obras/visitas (móvil). Hoy hace el seguimiento de memoria, con hojas de cálculo o tareas manuales.
- **Comprador:** propietario o gerente de la empresa; quiere ver qué presupuestos se enfrían, cuáles se reactivan y cuáles acaban en venta.

## Product Purpose

Detectar presupuestos enviados que siguen sin respuesta y convertir el seguimiento comercial en un proceso verificable: identificar los elegibles, registrar o proponer el siguiente contacto según reglas autorizadas, detenerse cuando hay respuesta o rechazo, y mostrar qué se ha reactivado y qué ha terminado en venta. Éxito: 3–5 empresas piloto que lo usan de forma recurrente con resultados verificables.

## Positioning

Especializado en reformas integrales (su vocabulario y estados), se integra con lo que la empresa ya usa en lugar de obligarla a cambiar de CRM, separa honestamente respuesta, oportunidad reactivada y venta confirmada, y da control explícito de pausas, límites, exclusiones y supervisión humana. *(Diferenciación pendiente de validar en entrevistas, según el propio plan.)*

## Operating Context

- Presupuestos de importe relevante (miles a decenas de miles de euros), con referencia propia de la empresa.
- Contacto con el cliente por teléfono, email, WhatsApp, SMS o visita.
- Revisión humana obligatoria por defecto. El envío automático (fase 3) solo se activa con proveedor configurado, dirección de respuesta, base legal documentada y confirmación expresa de la empresa; siempre con enlace de baja.
- RGPD/LSSI: lista de exclusión que siempre se respeta.

## Capabilities and Constraints

- Estados reales del presupuesto: borrador, enviado (pendiente de respuesta), respondido, aceptado (venta confirmada con evidencia), rechazado; archivado aparte.
- Roles: propietario, administrador, comercial, lector.
- Multiempresa con aislamiento estricto.
- Planes Starter 27,99 €, Pro 57,99 €, Business 127,99 €/mes; pagos aún no activos (fase 5). IVA y definición de "recuperación" pendientes.
- Sin envío real de mensajes desde Presupio todavía: los seguimientos se registran, no se envían.

## Brand Commitments

- Nombre de trabajo "Presupio" (marca y dominio pendientes de verificación oficial: no invertir en identidad cerrada).
- Todo el texto de la interfaz en español de España, tono profesional y respetuoso.

## Evidence on Hand

No hay clientes, testimonios, cifras ni capturas reales. Nunca inventar métricas, porcentajes, clientes ni resultados. Los datos de demostración (`npm run db:seed`) son ficticios y solo para desarrollo.

## Product Principles

1. No inflar resultados: responder ≠ reactivar ≠ vender. Cada cifra tiene una definición y un origen.
2. Respetar al cliente final: exclusiones y paradas automáticas por encima de cualquier objetivo comercial.
3. Sencillo para gerentes que no quieren aprender una herramienta compleja.
4. Validar antes de prometer: no mostrar como hecho lo que no está confirmado (envíos, integraciones, pagos).

## Accessibility & Inclusion

Accesibilidad básica exigida por el fundador: etiquetas, contraste adecuado, navegación por teclado y mensajes comprensibles. Uso frecuente en móvil (obras y visitas). *(WCAG 2.2 AA como objetivo inferido.)*
