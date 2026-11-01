# Pruebas

| Suite | Comando | Qué cubre | Requisitos |
| --- | --- | --- | --- |
| Unitarias | `npm run test:unit` | Cuestionario, condiciones, NIF, motor, HTML/PDF, acciones necesarias, permisos de pago, webhook, descargas, emails, salvaguardas de entorno, seed | Ninguno |
| Base de datos | `npm run test:db` | Migraciones, alta de usuario, RLS entre clientes, privilegios por columna, storage, flujo editorial, generaciones, numeración, límites de frecuencia | PostgreSQL 16 local (`TEST_DATABASE_URL`) |
| E2E pública | `npm run test:e2e:build && npm run test:e2e` | Todas las páginas públicas en escritorio y móvil, desbordamiento, SEO, cabeceras, protección de rutas, validaciones de servidor | Chromium (Playwright) |
| E2E completa | `E2E_FULL=1 E2E_BASE_URL=… npm run test:e2e` | Registro → formulario → vista previa → pago test → generación → descarga → historial → regeneración → portal | Supabase de staging + Stripe test + webhook configurado |

## Recorridos verificados manualmente antes del lanzamiento
Ejecutar en staging con Stripe test:
1. Registro y verificación por email (email real recibido).
2. Completar datos y formulario; salir a mitad y continuar.
3. Vista previa (sin descarga posible antes de pagar).
4. Compra de pago único y de suscripción (tarjeta 4242).
5. Documentos generados automáticamente; descarga PDF y HTML.
6. Historial, cambio de datos, regeneración (límite de 3 en pago único).
7. Portal: cambiar tarjeta, cancelar, reactivar.
8. Impago con `4000 0000 0000 0341` + test clock: email de impago, generación bloqueada, descarga permitida.
9. Reembolso desde Stripe: documentos de esa compra revocados.
10. Un segundo usuario no puede acceder a documentos del primero (probar URL de descarga copiada).
11. Administración: aprobar y publicar una versión, crear aviso, publicar actualización legal.
