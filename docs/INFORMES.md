# RevisaYa — Informes (Fase 9)

Código: `supabase/migrations/20261110000100_reports.sql` (funciones `app.report_*` y `app.dashboard_activity`), `src/server/modules/reports/service.ts`, `src/app/app/informes/page.tsx` y `src/app/api/app/reports/[kind]/route.ts` (CSV). Pruebas: `tests/integration/reports.test.ts` y `supabase/tests/database/150_reports.sql`.

## 1. Qué hay en cada plan
| Plan | Qué ve |
|---|---|
| Todos (P16) | En el **Inicio**, los últimos 30 días: avisos enviados, citas pedidas y clientes que han vuelto tras un aviso. |
| Max y superiores (PDF) | **Informes** (`/app/informes`): todo lo de abajo, con filtro por fechas y por taller, y exportación a CSV. |

## 2. Informes (Max)
- **De los avisos a los clientes que vuelven**:
  - avisos enviados y vehículos avisados;
  - citas pedidas desde un aviso (y en total), confirmadas y realizadas;
  - vehículos que **volvieron tras un aviso** (P17): tienen una revisión anotada en el historial en los 90 días siguientes al aviso. Se presenta como coincidencia, no como causalidad.
- **Mes a mes**: avisos, vehículos que volvieron, citas pedidas y correos.
- **Correos a clientes**: enviados, entregados, rebotados, marcados como spam y por tipo. No cuentan los correos de la plataforma al taller (invitaciones, resúmenes, facturación).
- **Listados** paginados y descargables en CSV:
  - *Clientes que no han vuelto*: vehículos activos con un aviso en el periodo y sin ninguna revisión anotada desde entonces, con el contacto y los días desde el aviso;
  - *Revisiones pendientes*: las vencidas y las que vencen en los próximos 30 días;
  - *Correos enviados*: fecha, tipo, destinatario y estado.
- Periodo por defecto: los últimos 90 días. Máximo: 2 años.
- «Entregado» solo se sabe con un proveedor que envía webhooks (Resend). Con SMTP los correos quedan como «Enviado».

## 3. Seguridad
- Las funciones SQL (`SECURITY DEFINER`) deciden el acceso:
  - el taller tiene que ser del usuario;
  - el plan tiene que incluir `reports`;
  - solo entran las sucursales donde el usuario tiene «Ver informes» (`reports.read`); los administradores, todas.
- Cambiar el id del taller o de la sucursal en la petición devuelve «sin permiso» (probado).
- El CSV usa punto y coma, BOM UTF-8 (Excel en español) y neutraliza las fórmulas (`=`, `+`, `-`, `@`). Máximo 5000 filas.


## PCI (plan Max o superior)

Resumen del periodo (equipos por tipo, actuaciones y no conformes, por operación y por técnico, órdenes finalizadas, incidencias) y listados con CSV: **vencimientos** (vencidos y próximos 30 días), **actuaciones**, **estado por instalación** e **incidencias**. Todo con la RLS del usuario (`app.pci_report_*`, `SECURITY INVOKER`). Los informes de vehículos se conservan para las cuentas que tienen vehículos. El inicio muestra a todos los planes contadores PCI y la actividad reciente.
