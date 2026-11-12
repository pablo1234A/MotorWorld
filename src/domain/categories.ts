import type { AttributeType, AttributeValue } from "./product";

export type CategoryNode = {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
  isCustom: boolean;
};

export type AttributeDefinition = {
  categoryId: string;
  key: string;
  name: string;
  type: AttributeType;
  required: boolean;
  options: string[];
  unit: string | null;
  showInTitle: boolean;
  order: number;
};

export type CategoryCatalog = { categories: CategoryNode[]; attributes: AttributeDefinition[] };

/** Atributo ya resuelto y formateado, listo para el motor de generación. */
export type ResolvedAttribute = { key: string; label: string; value: string; showInTitle: boolean; isBoolean: boolean };

export function findCategory(catalog: CategoryCatalog, id: string | null | undefined): CategoryNode | null {
  if (!id) return null;
  return catalog.categories.find((category) => category.id === id) ?? null;
}

/** Atributos aplicables a una categoría: los de la categoría padre más los propios (los propios prevalecen). */
export function attributesForCategory(catalog: CategoryCatalog, categoryId: string | null | undefined): AttributeDefinition[] {
  const category = findCategory(catalog, categoryId);
  if (!category) return [];
  const own = catalog.attributes.filter((attribute) => attribute.categoryId === category.id);
  const inherited = category.parentId
    ? catalog.attributes.filter((attribute) => attribute.categoryId === category.parentId && !own.some((o) => o.key === attribute.key))
    : [];
  return [...own, ...inherited].sort((a, b) => a.order - b.order || a.name.localeCompare(b.name, "es"));
}

export function categoryPath(catalog: CategoryCatalog, categoryId: string | null | undefined): { category: string | null; subcategory: string | null } {
  const category = findCategory(catalog, categoryId);
  if (!category) return { category: null, subcategory: null };
  if (!category.parentId) return { category: category.name, subcategory: null };
  const parent = findCategory(catalog, category.parentId);
  return { category: parent?.name ?? category.name, subcategory: parent ? category.name : null };
}

const CUSTOM_KEY = /^[a-z][a-z0-9_]{0,59}$/;

export function parseLocaleNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  let text = value.trim().replace(/[^\d.,-]/g, "");
  if (text === "" || text === "-") return null;
  const lastComma = text.lastIndexOf(",");
  const lastDot = text.lastIndexOf(".");
  if (lastComma > -1 && lastDot > -1) {
    // El separador que aparece más a la derecha es el decimal.
    text = lastComma > lastDot ? text.replace(/\./g, "").replace(",", ".") : text.replace(/,/g, "");
  } else if (lastComma > -1) {
    const decimals = text.length - lastComma - 1;
    text = decimals === 3 && text.indexOf(",") === lastComma && text.length > 4 ? text.replace(",", "") : text.replace(/,/g, ".");
    if ((text.match(/\./g) ?? []).length > 1) text = text.replace(/\.(?=.*\.)/g, "");
  } else if (lastDot > -1) {
    const decimals = text.length - lastDot - 1;
    if ((text.match(/\./g) ?? []).length > 1 || (decimals === 3 && text.length > 4)) text = text.replace(/\./g, "");
  }
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

const TRUE_VALUES = new Set(["true", "1", "si", "sí", "yes", "y", "s", "x", "verdadero"]);
const FALSE_VALUES = new Set(["false", "0", "no", "n", "falso"]);

export type AttributeValidation = {
  values: Record<string, AttributeValue>;
  errors: Record<string, string>;
  /** Atributos marcados como obligatorios en la categoría que no se han informado. */
  missingRequired: AttributeDefinition[];
};

/**
 * Normaliza y valida los atributos dinámicos frente a las definiciones de la categoría.
 * Las claves no definidas se conservan como texto libre (atributos personalizados).
 */
export function validateAttributes(definitions: AttributeDefinition[], raw: Record<string, unknown> | null | undefined): AttributeValidation {
  const values: Record<string, AttributeValue> = {};
  const errors: Record<string, string> = {};
  const input = raw ?? {};
  const known = new Map(definitions.map((definition) => [definition.key, definition]));

  for (const [key, value] of Object.entries(input)) {
    if (value === null || value === undefined || value === "") continue;
    const definition = known.get(key);
    if (!definition) {
      if (!CUSTOM_KEY.test(key)) continue;
      const text = String(value).trim().slice(0, 200);
      if (text) values[key] = text;
      continue;
    }
    switch (definition.type) {
      case "number": {
        const parsed = parseLocaleNumber(value);
        if (parsed === null || parsed < 0 || parsed > 1e12) errors[key] = `${definition.name}: introduce un número válido.`;
        else values[key] = parsed;
        break;
      }
      case "boolean": {
        if (typeof value === "boolean") values[key] = value;
        else {
          const text = String(value).trim().toLowerCase();
          if (TRUE_VALUES.has(text)) values[key] = true;
          else if (FALSE_VALUES.has(text)) values[key] = false;
          else errors[key] = `${definition.name}: indica sí o no.`;
        }
        break;
      }
      case "select": {
        const text = String(value).trim();
        const match = definition.options.find((option) => option.toLowerCase() === text.toLowerCase());
        if (match) values[key] = match;
        else errors[key] = `${definition.name}: "${text.slice(0, 40)}" no es una opción válida.`;
        break;
      }
      default: {
        const text = String(value).trim().slice(0, 200);
        if (text) values[key] = text;
      }
    }
  }

  const missingRequired = definitions.filter((definition) => definition.required && values[definition.key] === undefined && !errors[definition.key]);
  return { values, errors, missingRequired };
}

function humanizeKey(key: string): string {
  const text = key.replace(/_/g, " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function formatNumber(value: number, language: "es" | "en"): string {
  return new Intl.NumberFormat(language === "es" ? "es-ES" : "en-US", { maximumFractionDigits: 2 }).format(value);
}

/** Convierte los valores guardados en atributos legibles (con unidad) para el generador. */
export function resolveAttributes(
  definitions: AttributeDefinition[],
  values: Record<string, unknown> | null | undefined,
  language: "es" | "en" = "es",
): ResolvedAttribute[] {
  const input = values ?? {};
  const resolved: ResolvedAttribute[] = [];
  const seen = new Set<string>();

  for (const definition of definitions) {
    const value = input[definition.key];
    seen.add(definition.key);
    if (value === null || value === undefined || value === "") continue;
    if (definition.type === "boolean") {
      const truthy = value === true || TRUE_VALUES.has(String(value).toLowerCase());
      resolved.push({
        key: definition.key,
        label: definition.name,
        value: truthy ? (language === "es" ? "Sí" : "Yes") : "No",
        showInTitle: false,
        isBoolean: true,
      });
      continue;
    }
    // Los años no llevan separador de miles.
    const isYear = definition.key === "anio";
    const text = typeof value === "number" && !isYear ? formatNumber(value, language) : String(value);
    resolved.push({
      key: definition.key,
      label: definition.name,
      value: definition.unit ? `${text} ${definition.unit}` : text,
      showInTitle: definition.showInTitle,
      isBoolean: false,
    });
  }

  for (const [key, value] of Object.entries(input)) {
    if (seen.has(key) || value === null || value === undefined || value === "") continue;
    resolved.push({ key, label: humanizeKey(key), value: String(value), showInTitle: false, isBoolean: typeof value === "boolean" });
  }
  return resolved;
}
