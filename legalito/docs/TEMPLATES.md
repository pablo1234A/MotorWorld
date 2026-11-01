# Motor documental y plantillas

## Formato de una plantilla

Una versión de plantilla (`template_versions.content`) es un JSON validado por `templateContentSchema` (`src/lib/documents/engine.ts`):

```json
{
  "title": "Política de privacidad",
  "intro": [{ "type": "paragraph", "text": "… {{owner.display_name}} …" }],
  "sections": [
    {
      "id": "finalidades",
      "heading": "Finalidades",
      "when": { "truthy": "data.collects_any" },
      "blocks": [
        { "type": "paragraph", "text": "…" },
        { "type": "list", "items": ["Fijo", { "text": "Condicional", "when": { "truthy": "data.newsletter" } }] },
        { "type": "list", "source": "processors", "itemText": "{{item.name}}: {{item.purpose}}." },
        { "type": "table", "columns": ["A", "B"], "rows": [{ "cells": ["1", "2"], "when": { "truthy": "data.orders" } }] },
        { "type": "table", "columns": ["Cookie", "Proveedor"], "source": "cookies.list", "cellTexts": ["{{item.name}}", "{{item.provider}}"], "empty": "Sin cookies." },
        { "type": "callout", "tone": "info", "text": "…" }
      ]
    }
  ],
  "closing": [{ "type": "paragraph", "text": "Última actualización: {{meta.generated_date}}." }]
}
```

### Condiciones (`when`)
`{ "all": [...] }`, `{ "any": [...] }`, `{ "not": {...} }`, `{ "truthy": "ruta" }`, `{ "falsy": "ruta" }`, `{ "nonEmpty": "ruta" }`, `{ "eq": ["ruta", valor] }`, `{ "in": ["ruta", [valores]] }`, `{ "includes": ["ruta", valor] }`.

### Variables disponibles (`DocumentContext`, `src/lib/documents/context.ts`)
- `owner.*`: `legal_name`, `trade_name`, `display_name`, `nif`, `address_full`, `registry_data`, `is_company`
- `contact.*`: `email`, `phone`, `website`, `domain`
- `business.*`: `type`, `type_label`, `activity`, `is_ecommerce`, `sells_to_consumers`, `ships_goods`
- `professional.*`: `regulated`, `college`, `number`, `title`
- `data.*`: `collects_any`, `contact_form`, `newsletter`, `newsletter_provider`, `accounts`, `orders`, `bookings`, `job_applications`, `comments`, `special_categories`, `minors`, `has_dpo`, `dpo_contact`
- `cookies.*`: `analytics_tool`, `analytics_label`, `uses_analytics`, `uses_advertising`, `advertising_labels`, `uses_embeds`, `has_chat`, `has_nonessential`, `has_cmp`, `cmp_name`, `list[]`, `has_third_party`
- `processors[]` (`name`, `purpose`), `international_transfers`, `meta.generated_date`

Si una variable usada en un bloque incluido no tiene valor, la generación se detiene con «faltan datos».

## Flujo editorial (administración → Plantillas)

1. **Nueva versión**: copia el contenido de la última versión en un borrador.
2. **Editar borrador**: JSON validado; la vista previa usa datos ficticios (tienda online y autónomo).
3. **Enviar a revisión**: el contenido queda inmutable (disparador en BD).
4. **Aprobar**: requiere profesional revisor, fecha, referencia del informe y confirmación. La BD rechaza la aprobación sin estos datos y la de versiones demo.
5. **Publicar**: la versión pasa a producción; la anterior se retira. Los suscriptores generan con la nueva; las compras de pago único conservan su versión.
6. **Actualización legal** (opcional): comunicar el cambio a suscriptores con referencia de revisión.

Historial: cada paso queda en `audit_logs` y se muestra en la ficha de la plantilla.

## Añadir un tipo de documento nuevo

1. `insert into document_types` (sin migración) y crea la plantilla en `templates`.
2. Añádelo a `DOCUMENT_TYPES` en `src/lib/documents/registry.ts` (etiquetas de interfaz).
3. Si necesita datos nuevos, amplía el cuestionario (subiendo `QUESTIONNAIRE_VERSION`) y el contexto.
4. Inclúyelo en `products.included_document_types` desde administración.

## Plantillas de demostración

`src/lib/documents/templates/*.demo.ts` contienen una estructura de referencia (LSSI-CE art. 10, RGPD arts. 13-14, LSSI art. 22.2 y guía de cookies de la AEPD) **no revisada jurídicamente**. Se cargan como `is_demo = true`, los documentos generados con ellas llevan marca «DEMOSTRACIÓN · NO VÁLIDO» y la BD impide publicarlas. Sirven de borrador para el despacho revisor.

El catálogo de cookies (`cookie-catalog.ts`) es orientativo, basado en documentación pública de cada proveedor; los documentos recomiendan contrastarlo con un escaneo real.
