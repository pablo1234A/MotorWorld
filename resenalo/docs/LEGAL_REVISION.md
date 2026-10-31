# Revisión legal y fiscal antes del lanzamiento

Los textos de `/legal/*` son **borradores** ajustados al funcionamiento real del producto. No garantizan el cumplimiento normativo. Un abogado y un asesor fiscal deben revisar, como mínimo:

## Datos del titular (pendientes)
- Razón social, NIF, domicilio, datos registrales, email de contacto y DPD → variables `LEGAL_*` del `.env`.
- Proveedor de alojamiento, proveedor SMTP y ubicación de los servidores (Política de privacidad, Acuerdo de encargo).

## RGPD / LOPDGDD
- Registro de actividades de tratamiento (art. 30 RGPD) y análisis de riesgos; valorar si procede una EIPD.
- Acuerdo de encargo del tratamiento (art. 28) con los negocios clientes y la lista de subencargados.
- Garantías de transferencias internacionales de Stripe, Google, Microsoft y del hosting.
- Conveniencia de designar un DPD.
- Proceso interno para notificar brechas de seguridad en 72 horas a la AEPD.

## Comunicaciones electrónicas (LSSI-CE art. 21)
- Si las solicitudes de reseña son comunicaciones comerciales y la base de la excepción del art. 21.2 (relación contractual previa). La plataforma exige que el negocio lo confirme, incluye la identificación del remitente y un enlace de baja en cada correo, y aplica las bajas.

## Consumo y reseñas
- Prohibición de reseñas falsas o incentivadas y de la selección de opiniones (Directiva (UE) 2019/2161, TRLGDCU modificado por el RDL 24/2021, políticas de Google). El producto bloquea el lenguaje con incentivos y no filtra opiniones; las condiciones lo prohíben.
- Decidir si se admiten **consumidores** (no solo empresas y profesionales): en ese caso añadir el derecho de desistimiento de 14 días y la información precontractual del TRLGDCU.

## Fiscalidad y facturación
- Facturas de Stripe frente al Reglamento de facturación (RD 1619/2012): numeración, datos fiscales, desglose de IVA.
- **VERI\*FACTU / Reglamento de sistemas informáticos de facturación (RD 1007/2023)**: comprobar la obligación y las fechas aplicables a tu caso, y si Stripe Invoicing cumple o hace falta otro software de facturación.
- Configuración de Stripe Tax: IVA español, inversión del sujeto pasivo B2B en la UE (validación VIES), OSS para consumidores de la UE.
- Modelos 303/390 y 349 (operaciones intracomunitarias).

## Proveedores
- Verificación de la app de Google (ámbito `gmail.send`) y el cumplimiento de la *Google API Services User Data Policy* (uso limitado).
- Condiciones de Microsoft Graph y verificación de editor.

## Cookies
- Hoy solo hay una cookie técnica (`rsn_session`), exenta de consentimiento. Si se añade analítica o marketing, hay que implantar un banner con aceptar y rechazar al mismo nivel antes de cargar esos scripts.
