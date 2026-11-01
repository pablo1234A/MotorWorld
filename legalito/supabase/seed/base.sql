-- =============================================================================
-- Legalito · Datos iniciales (idempotente)
-- Tipos de documento, pago único y preguntas frecuentes.
-- Los precios de Stripe (stripe_price_id) se configuran desde administración
-- o con `npm run stripe:setup` en modo test (ver docs/STRIPE.md).
-- =============================================================================

insert into public.document_types (code, name, description, sort_order) values
  ('aviso_legal', 'Aviso legal', 'Información general del titular de la web (art. 10 LSSI-CE).', 1),
  ('privacidad', 'Política de privacidad', 'Información sobre el tratamiento de datos personales (arts. 13 y 14 RGPD).', 2),
  ('cookies', 'Política de cookies', 'Información sobre cookies y tecnologías similares (art. 22.2 LSSI-CE).', 3)
on conflict (code) do update set name = excluded.name, description = excluded.description, sort_order = excluded.sort_order;

insert into public.products (code, name, description, kind, price_cents, currency, billing_interval,
  included_document_types, generations_limit, includes_updates, documents_per_period, features, sort_order)
values
  ('one_time_pack', 'Pago único', 'Genera tus tres documentos una vez y descárgalos cuando quieras.',
   'one_time', 3900, 'eur', null,
   array['aviso_legal', 'privacidad', 'cookies'], 3, false, null,
   '["Aviso legal, política de privacidad y política de cookies", "Descarga en PDF y código HTML", "Acceso permanente a los documentos comprados", "Hasta 3 generaciones para corregir tus datos", "Sin actualizaciones futuras incluidas"]'::jsonb,
   1)
on conflict (code) do nothing;
-- Los planes de suscripción (Básico, Medium, Business) se crean en la migración 20261101000500.

insert into public.faqs (question, answer, category, sort_order)
select * from (values
  ('¿Qué documentos genera Legalito?',
   'Legalito genera tres documentos para tu página web: aviso legal, política de privacidad y política de cookies. Cada uno se construye a partir de tus respuestas al formulario.',
   'documentos', 1),
  ('¿Cómo se adaptan los documentos a mi negocio?',
   'Las plantillas están divididas en bloques. Según tus respuestas (tipo de negocio, si vendes online, si usas formularios, analítica o cookies de terceros, etc.) se incluyen solo los bloques que te corresponden y se completan con tus datos. No se redacta texto libre de forma automática.',
   'documentos', 2),
  ('¿Qué ocurre si cambia mi negocio?',
   'Puedes actualizar tus respuestas en cualquier momento. Con la suscripción regeneras tus documentos dentro del cupo mensual de tu plan (20 en Básico, 50 en Medium e ilimitados en Business), incluso de uno en uno. Con el pago único dispones de un número limitado de regeneraciones para corregir datos con la misma versión de plantilla que compraste.',
   'documentos', 3),
  ('¿Cómo descargo mis documentos?',
   'Desde «Mis documentos» en tu panel puedes descargar cada documento en PDF y en HTML. El HTML está pensado para copiarlo y pegarlo en tu web.',
   'documentos', 4),
  ('¿Qué incluye la suscripción?',
   'Hay tres planes: Básico (5,99 €/mes, hasta 20 documentos al mes), Medium (9,99 €/mes, hasta 50) y Business (19,99 €/mes, ilimitados). Todos incluyen aviso legal, privacidad y cookies, las nuevas versiones de las plantillas cuando se publiquen tras una revisión documentada, el historial de versiones y avisos de cambios relevantes.',
   'suscripcion', 5),
  ('¿Cómo cancelo la suscripción?',
   'Desde «Mi suscripción» en tu panel accedes al portal seguro de Stripe, donde puedes cancelar en cualquier momento. Mantienes el acceso hasta el final del periodo ya pagado y conservas la descarga de los documentos generados.',
   'suscripcion', 6),
  ('¿Legalito sustituye a un abogado?',
   'No. Legalito no es un despacho de abogados ni presta asesoramiento jurídico. Ofrece plantillas estructuradas y reglas de adaptación. Si tu actividad tiene particularidades (datos de salud, menores, sectores regulados) te recomendamos consultar con un profesional.',
   'general', 7),
  ('¿Tener estos documentos significa que mi web cumple la ley?',
   'No necesariamente. Los textos legales son una parte del cumplimiento. Por ejemplo, si usas cookies no necesarias también necesitas un sistema de gestión del consentimiento, y debes aplicar realmente lo que dicen tus políticas.',
   'general', 8),
  ('¿Puedo ver los documentos antes de pagar?',
   'Sí. Al terminar el formulario verás una vista previa de tus documentos. La descarga en PDF y HTML se habilita después de la compra.',
   'pagos', 9),
  ('¿Qué métodos de pago aceptáis?',
   'Los pagos se procesan con Stripe, que admite tarjeta y otros métodos según tu país. Legalito no almacena los datos de tu tarjeta.',
   'pagos', 10)
) as v(question, answer, category, sort_order)
where not exists (select 1 from public.faqs);
