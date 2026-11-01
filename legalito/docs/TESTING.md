# Pruebas

| Suite | Comando | Qué cubre | Requisitos |
| --- | --- | --- | --- |
| Unitarias | `npm run test:unit` | Cuestionario, condiciones, NIF/NIE/CIF, motor, HTML/PDF, acciones necesarias, permisos de pago, webhook (firma, idempotencia), descargas, emails, salvaguardas de entorno, seed | Ninguno |
| Base de datos (RLS) | `npm run test:db` | Migraciones, alta de usuario, aislamiento entre clientes, privilegios por columna, storage, flujo editorial, generaciones, numeración, límites | PostgreSQL 16 local (`TEST_DATABASE_URL`) |
| Flujos de negocio | `npm run test:db` (`tests/integration/flows.test.ts`) | Formulario → vista previa → checkout → pago → generación → descarga → regeneraciones con límite → reembolso; suscripción (alta, impago y reintento, cancelación, fin); flujo editorial completo; métricas; idempotencia de webhooks y emails | PostgreSQL local |
| E2E pública | `npm run test:e2e:build && npm run test:e2e` | 17 páginas en escritorio y móvil, desbordamiento, **accesibilidad WCAG 2.1 AA (axe)**, SEO, cabeceras de seguridad, protección de rutas, validaciones de servidor | Chromium |
| E2E área privada | `scripts/qa-app.sh build && scripts/qa-app.sh start && scripts/qa-app.sh test` | Servidor Next real + navegador + PostgreSQL con RLS: acceso, formulario completo con validaciones y autoguardado, revisión y edición por pasos, precompra, generación, descarga firmada, copiar HTML, historial, datos, suscripción, soporte, aislamiento entre clientes, las 13 secciones de administración; accesibilidad en cada pantalla | PostgreSQL local |
| E2E completa con servicios reales | `E2E_FULL=1 E2E_BASE_URL=… npm run test:e2e` | Registro → formulario → pago con Stripe test → webhook → descarga → portal | Supabase de staging + Stripe test |

## Arnés de pruebas sin servicios externos

`tests/harness/pg-supabase.ts` implementa el subconjunto de la API de Supabase que usa Legalito sobre PostgreSQL real:
- cada consulta se ejecuta con el rol (`anon`, `authenticated`, `service_role`) y los claims JWT, así que **RLS, privilegios, disparadores y funciones SQL son los reales**;
- reproduce el error de PostgREST por **relación ambigua** en incrustaciones (detectó un bug real que habría roto las descargas);
- almacenamiento en memoria y autenticación mínima.

`tests/harness/app-backend.ts` permite ejecutar **la aplicación completa** contra ese arnés: con `LEGALITO_TEST_BACKEND=1`, `next.config.ts` redirige `@supabase/supabase-js` y `@supabase/ssr` a este módulo (build separado en `.next-qa`). Está bloqueado en producción por partida doble (configuración y módulo). Usuarios de prueba: `cliente@legalito.test`, `suscriptora@legalito.test`, `admin@legalito.test`, contraseña `Legalito-QA-2026`.

Capturas de todas las pantallas privadas: `E2E_SCREENSHOTS_DIR=/ruta scripts/qa-app.sh test`.

## Recorridos a verificar manualmente en staging antes del lanzamiento
1. Registro y verificación por email (email real recibido).
2. Completar el formulario; salir a mitad y continuar.
3. Vista previa (sin descarga posible antes de pagar).
4. Compra de pago único y de suscripción con tarjeta 4242.
5. Documentos generados automáticamente; descarga PDF y HTML; copiar código.
6. Historial, cambio de datos, regeneración (límite de 3 en pago único).
7. Portal de Stripe: cambiar tarjeta, cancelar, reactivar.
8. Impago con `4000 0000 0000 0341` + test clock: email, generación bloqueada, descarga permitida.
9. Reembolso desde Stripe: documentos de esa compra revocados.
10. Un segundo usuario no puede acceder a documentos del primero.
11. Administración: aprobar y publicar una versión, crear aviso, publicar actualización legal.
