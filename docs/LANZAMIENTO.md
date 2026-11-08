# RevisaYa — Lista de lanzamiento

Marca cada punto antes de abrir RevisaYa a talleres reales. Lo marcado con ⚠️ **no lo puede hacer el software**: es una decisión o una gestión del responsable.

## 1. Legal y fiscal (PDF §10)
- [ ] ⚠️ Alta de actividad (autónomo o sociedad) y alta en el IVA, con un gestor.
- [ ] ⚠️ Comprobar que el nombre «RevisaYa» está libre (OEPM/EUIPO) y comprar el dominio. Si cambia el nombre: `src/config/brand.ts`.
- [ ] ⚠️ **Revisión por un abogado** de los 5 textos de `/legal/*`, que son borradores. Rellenar `LEGAL_OWNER_*` y volver a desplegar; el aviso «pendiente» desaparece cuando están todos.
- [ ] ⚠️ Confirmar con el gestor que las facturas de Stripe cumplen la normativa española (y VeriFactu cuando aplique).
- [ ] ⚠️ Firmar o aceptar los DPA de los proveedores (Supabase, Vercel, Resend, Stripe, Google, Cloudflare) y confirmar las regiones de la UE.

## 2. Infraestructura (DESPLIEGUE §6)
- [ ] Proyecto de Supabase en la UE, `supabase db push`, Auth configurado: URLs, plantillas, SMTP propio y **TOTP activado**.
- [ ] Vercel con todas las variables. `pnpm check:env` sin ✖.
- [ ] Dominio con HTTPS. `/api/health` → 200.
- [ ] Procesos programados en marcha: plan Pro de Vercel para el dispatcher cada minuto, o un planificador externo. `/api/internal/jobs/status` → 200.
- [ ] Monitor externo de `/api/health` y de `status`, y un *log drain* con alertas para `job_failed` y `email_reputation_alert`.
- [ ] Copia de seguridad semanal programada y **una restauración de prueba hecha**.

## 3. Correo (el riesgo nº 1 del PDF)
- [ ] Dominio de envío compartido verificado en Resend (SPF, DKIM y DMARC) y webhook configurado.
- [ ] Probado en Gmail y Outlook: llega a la bandeja de entrada, no a spam. Prueba también la baja en un clic.
- [ ] Calentamiento progresivo del dominio, con pocos envíos los primeros días.

## 4. Pagos
- [ ] Stripe en **modo TEST**: catálogo creado, webhook y portal configurados, un alta completa con la tarjeta de prueba `4242…`.
- [ ] ⚠️ **Cobros reales**: solo con la autorización expresa del responsable adulto, tras los puntos de §1. Hay que:
  - crear los productos y los precios en modo live (`stripe-sync-catalog` con la clave live);
  - poner `STRIPE_SECRET_KEY=sk_live_…`, el webhook live y `PAYMENTS_LIVE_ENABLED=true` (solo en producción).
  Hasta entonces la aplicación rechaza cualquier clave o evento live.

## 5. Integraciones opcionales
- [ ] Google Calendar: proyecto de Google Cloud, pantalla de consentimiento y **verificación de la app** (ámbito sensible). Hasta entonces, solo usuarios de prueba.
- [ ] Cloudflare Turnstile en la página de citas.

## 6. Producto y pruebas sobre producción
- [ ] Con un taller de prueba, de principio a fin:
  - registro, 2FA, plan, datos y logo;
  - importar la plantilla, activar los avisos y comprobar que llega uno a un correo propio;
  - pedir cita desde el aviso y confirmarla;
  - presupuesto en PDF y exportar los datos.
- [ ] ⚠️ Capturas y vídeo de 3 minutos para la guía de inicio (`/ayuda`).
- [ ] ⚠️ 5–10 talleres piloto (PDF §13) antes de la captación.

## 7. Seguridad
- [ ] 2FA activada en todas las cuentas de administración de la plataforma: Supabase, Vercel, Stripe, Resend, Google, el DNS y GitHub.
- [ ] ⚠️ Prueba de intrusión externa antes de tener muchos clientes de pago (SEGURIDAD §9).
- [ ] Procedimiento de incidentes leído (DESPLIEGUE §8).
