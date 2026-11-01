import { extractRules, extractVariables, parseTemplateContent } from "./engine";
import { QUESTIONNAIRE_VERSION } from "./questionnaire";
import { DEMO_TEMPLATES } from "./registry";

const lit = (value: string) => `'${value.replace(/'/g, "''")}'`;

/** SQL idempotente que carga las plantillas de demostración como borradores `is_demo`. */
export function buildTemplateSeedSql(): string {
  const out: string[] = [
    "-- =============================================================================",
    "-- ARCHIVO GENERADO por `npm run db:seed:generate`. No editar a mano.",
    "-- Plantillas de DEMOSTRACIÓN (is_demo = true, estado borrador). La base de datos",
    "-- impide aprobarlas o publicarlas: no son documentos jurídicos válidos.",
    "-- =============================================================================",
    "",
  ];
  for (const t of DEMO_TEMPLATES) {
    const content = parseTemplateContent(t.content);
    const variables = extractVariables(content).map((key) => ({ key }));
    const rules = extractRules(content);
    out.push(
      `insert into public.templates (slug, name, document_type, description)`,
      `values (${lit(t.slug)}, ${lit(t.name)}, ${lit(t.documentType)}, ${lit(`Plantilla de ${t.name.toLowerCase()}`)})`,
      `on conflict (slug) do nothing;`,
      "",
      `insert into public.template_versions (template_id, version_label, is_demo, content, variables, rules, changelog, questionnaire_version)`,
      `select t.id, ${lit(t.versionLabel)}, true, ${lit(JSON.stringify(content))}::jsonb, ${lit(JSON.stringify(variables))}::jsonb,`,
      `       ${lit(JSON.stringify(rules))}::jsonb, ${lit(t.changelog)}, ${QUESTIONNAIRE_VERSION}`,
      `  from public.templates t`,
      ` where t.slug = ${lit(t.slug)}`,
      `   and not exists (select 1 from public.template_versions v where v.template_id = t.id and v.version_label = ${lit(t.versionLabel)});`,
      "",
    );
  }
  return out.join("\n");
}
