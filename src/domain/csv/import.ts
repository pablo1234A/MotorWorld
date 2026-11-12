import type { CategoryCatalog } from "../categories";
import { parseLocaleNumber } from "../categories";
import { CONDITION_CODES, CURRENCIES, type ConditionCode } from "../product";
import { normalizeForCompare, sanitizeLine, sanitizeText } from "../text";
import { toCsv } from "../marketplaces/export";

/** Campos de producto a los que se puede asignar una columna del CSV. */
export const IMPORT_FIELDS = [
  { key: "name", label: "Nombre del producto", required: true, synonyms: ["nombre", "name", "producto", "product", "titulo", "title", "articulo"] },
  { key: "description", label: "Descripción", required: false, synonyms: ["descripcion", "description", "detalle", "detalles", "desc"] },
  { key: "category", label: "Categoría", required: false, synonyms: ["categoria", "category", "tipo de producto", "product type"] },
  { key: "subcategory", label: "Subcategoría", required: false, synonyms: ["subcategoria", "subcategory"] },
  { key: "brand", label: "Marca", required: false, synonyms: ["marca", "brand", "fabricante", "vendor"] },
  { key: "model", label: "Modelo", required: false, synonyms: ["modelo", "model"] },
  { key: "price", label: "Precio", required: false, synonyms: ["precio", "price", "pvp", "importe", "precio venta"] },
  { key: "currency", label: "Moneda", required: false, synonyms: ["moneda", "currency", "divisa"] },
  { key: "cost_price", label: "Coste de adquisición", required: false, synonyms: ["coste", "costo", "cost", "precio coste", "cost price", "precio compra"] },
  { key: "condition", label: "Estado", required: false, synonyms: ["estado", "condition", "condicion", "estado producto"] },
  { key: "sku", label: "SKU / referencia", required: false, synonyms: ["sku", "referencia", "ref", "codigo", "reference"] },
  { key: "location", label: "Ubicación", required: false, synonyms: ["ubicacion", "location", "ciudad", "localidad"] },
  { key: "features", label: "Características (separadas por ; o |)", required: false, synonyms: ["caracteristicas", "features", "especificaciones"] },
  { key: "defects", label: "Defectos", required: false, synonyms: ["defectos", "defects", "desperfectos", "observaciones"] },
] as const;

export type ImportFieldKey = (typeof IMPORT_FIELDS)[number]["key"];
/** Destino de una columna: un campo, un atributo libre ("attr:clave") o ignorar (""). */
export type ColumnMapping = Record<string, string>;

export const IMPORT_LIMITS = { maxFileBytes: 5 * 1024 * 1024, maxColumns: 60, previewRows: 8 };

const ATTR_PREFIX = "attr:";

export function attributeKeyFromHeader(header: string): string {
  const key = normalizeForCompare(header).replace(/\s+/g, "_").replace(/^[^a-z]+/, "").slice(0, 60);
  return key || "atributo";
}

/** Propone un mapeo automático comparando las cabeceras con sinónimos conocidos. */
export function suggestMapping(headers: string[]): ColumnMapping {
  const mapping: ColumnMapping = {};
  const used = new Set<string>();
  for (const header of headers) {
    const normalized = normalizeForCompare(header);
    const field = IMPORT_FIELDS.find((candidate) => !used.has(candidate.key) && candidate.synonyms.some((synonym) => synonym === normalized));
    if (field) {
      mapping[header] = field.key;
      used.add(field.key);
    } else {
      mapping[header] = "";
    }
  }
  return mapping;
}

export function isValidMappingTarget(target: string): boolean {
  if (target === "") return true;
  if (target.startsWith(ATTR_PREFIX)) return /^[a-z][a-z0-9_]{0,59}$/.test(target.slice(ATTR_PREFIX.length));
  return IMPORT_FIELDS.some((field) => field.key === target);
}

const CONDITION_SYNONYMS: Record<string, ConditionCode> = {
  nuevo: "new",
  new: "new",
  "a estrenar": "new",
  precintado: "new",
  "como nuevo": "like_new",
  "like new": "like_new",
  seminuevo: "like_new",
  "muy buen estado": "very_good",
  "muy bueno": "very_good",
  "very good": "very_good",
  "buen estado": "good",
  bueno: "good",
  good: "good",
  usado: "good",
  used: "good",
  aceptable: "acceptable",
  acceptable: "acceptable",
  reacondicionado: "refurbished",
  refurbished: "refurbished",
  "para reparar": "for_parts",
  "para piezas": "for_parts",
  "for parts": "for_parts",
  averiado: "for_parts",
};

/** Interpreta el estado de una celda. Un texto no reconocido se conserva como estado personalizado. */
export function parseCondition(value: string): { condition: ConditionCode; custom: string | null } | null {
  const text = value.trim();
  if (!text) return null;
  const normalized = normalizeForCompare(text);
  if ((CONDITION_CODES as readonly string[]).includes(text) && text !== "custom") return { condition: text as ConditionCode, custom: null };
  const known = CONDITION_SYNONYMS[normalized];
  if (known) return { condition: known, custom: null };
  return { condition: "custom", custom: sanitizeLine(text, 120) };
}

export type ImportedProduct = {
  name: string;
  description: string;
  categoryId: string | null;
  brand: string | null;
  model: string | null;
  price: number | null;
  currency: string;
  costPrice: number | null;
  condition: ConditionCode;
  conditionCustom: string | null;
  sku: string | null;
  location: string | null;
  features: string[];
  defects: string;
  attributes: Record<string, string>;
};

export type RowIssue = { row: number; field: string; message: string };
export type ValidatedRow = { row: number; product: ImportedProduct };
export type ImportValidation = {
  totalRows: number;
  valid: ValidatedRow[];
  errors: RowIssue[];
  warnings: RowIssue[];
  invalidRows: number;
  duplicateRows: number;
};

export type ImportDefaults = { condition: ConditionCode; currency: string };

function resolveCategory(catalog: CategoryCatalog, categoryText: string, subcategoryText: string): string | null | undefined {
  const match = (text: string, parentId?: string | null) => {
    const target = normalizeForCompare(text);
    return catalog.categories.find(
      (category) =>
        (parentId === undefined || category.parentId === parentId) &&
        (normalizeForCompare(category.name) === target || category.slug === target.replace(/\s+/g, "-")),
    );
  };
  if (!categoryText && !subcategoryText) return null;
  const parent = categoryText ? match(categoryText) : undefined;
  if (subcategoryText) {
    const child = parent ? match(subcategoryText, parent.parentId ?? parent.id) ?? match(subcategoryText) : match(subcategoryText);
    if (child) return child.id;
  }
  return parent ? parent.id : undefined;
}

/**
 * Valida y convierte las filas del CSV en productos.
 * - Las filas con errores se excluyen y se informan por número de fila.
 * - Los duplicados dentro del archivo (mismo SKU o mismo nombre+marca+modelo) se excluyen.
 * - El número de fila coincide con el de una hoja de cálculo (la cabecera es la fila 1).
 */
export function validateImportRows(
  rows: Record<string, string>[],
  mapping: ColumnMapping,
  catalog: CategoryCatalog,
  defaults: ImportDefaults,
): ImportValidation {
  const errors: RowIssue[] = [];
  const warnings: RowIssue[] = [];
  const valid: ValidatedRow[] = [];
  const seenSku = new Map<string, number>();
  const seenIdentity = new Map<string, number>();
  let invalidRows = 0;
  let duplicateRows = 0;

  const columnsFor = (target: string) => Object.entries(mapping).filter(([, value]) => value === target).map(([header]) => header);
  const attributeColumns = Object.entries(mapping).filter(([, value]) => value.startsWith(ATTR_PREFIX));

  rows.forEach((raw, index) => {
    const row = index + 2;
    const rowErrors: RowIssue[] = [];
    const get = (target: ImportFieldKey): string => {
      for (const header of columnsFor(target)) {
        const value = raw[header];
        if (typeof value === "string" && value.trim() !== "") return value.trim();
      }
      return "";
    };

    if (Object.values(raw).every((value) => !value || String(value).trim() === "")) return; // fila vacía

    const name = sanitizeLine(get("name"), 250);
    if (!name) rowErrors.push({ row, field: "name", message: "Falta el nombre del producto (campo obligatorio)." });
    else if (name.length > 200) rowErrors.push({ row, field: "name", message: "El nombre supera los 200 caracteres." });

    const number = (target: "price" | "cost_price", label: string): number | null => {
      const text = get(target);
      if (!text) return null;
      const parsed = parseLocaleNumber(text);
      if (parsed === null || parsed < 0 || parsed > 9_999_999_999) {
        rowErrors.push({ row, field: target, message: `${label}: "${text.slice(0, 30)}" no es un importe válido.` });
        return null;
      }
      return Math.round(parsed * 100) / 100;
    };
    const price = number("price", "Precio");
    const costPrice = number("cost_price", "Coste");

    let currency = get("currency").toUpperCase() || defaults.currency;
    if (currency === "€") currency = "EUR";
    if (currency === "$") currency = "USD";
    if (!(CURRENCIES as readonly string[]).includes(currency)) {
      rowErrors.push({ row, field: "currency", message: `Moneda no admitida: "${currency.slice(0, 10)}". Usa ${CURRENCIES.join(", ")}.` });
    }

    const parsedCondition = parseCondition(get("condition"));
    const condition = parsedCondition?.condition ?? defaults.condition;
    const conditionCustom = parsedCondition?.custom ?? null;

    const categoryId = resolveCategory(catalog, get("category"), get("subcategory"));
    if (categoryId === undefined) {
      warnings.push({ row, field: "category", message: `Categoría no reconocida ("${(get("category") || get("subcategory")).slice(0, 40)}"): el producto se importará sin categoría.` });
    }

    const sku = sanitizeLine(get("sku"), 100) || null;
    if (sku && sku.length > 80) rowErrors.push({ row, field: "sku", message: "El SKU supera los 80 caracteres." });

    const attributes: Record<string, string> = {};
    for (const [header, target] of attributeColumns) {
      const value = sanitizeLine(raw[header], 200);
      if (value) attributes[target.slice(ATTR_PREFIX.length)] = value;
    }

    const brand = sanitizeLine(get("brand"), 120) || null;
    const model = sanitizeLine(get("model"), 120) || null;

    if (rowErrors.length === 0) {
      const identity = normalizeForCompare(`${name}|${brand ?? ""}|${model ?? ""}`);
      const duplicateOf = (sku ? seenSku.get(sku.toLowerCase()) : undefined) ?? (sku ? undefined : seenIdentity.get(identity));
      if (duplicateOf !== undefined) {
        duplicateRows += 1;
        errors.push({ row, field: sku ? "sku" : "name", message: `Duplicado de la fila ${duplicateOf}: se omitirá.` });
        return;
      }
      if (sku) seenSku.set(sku.toLowerCase(), row);
      else seenIdentity.set(identity, row);

      valid.push({
        row,
        product: {
          name,
          description: sanitizeText(get("description"), 10000),
          categoryId: categoryId ?? null,
          brand,
          model,
          price,
          currency,
          costPrice,
          condition,
          conditionCustom,
          sku,
          location: sanitizeLine(get("location"), 160) || null,
          features: get("features").split(/[;|]/).map((feature) => sanitizeLine(feature, 200)).filter(Boolean).slice(0, 30),
          defects: sanitizeText(get("defects"), 3000),
          attributes,
        },
      });
    } else {
      invalidRows += 1;
      errors.push(...rowErrors);
    }
  });

  return { totalRows: rows.length, valid, errors, warnings, invalidRows, duplicateRows };
}

/** Plantilla CSV descargable con cabeceras reconocidas y dos filas de ejemplo. */
export function buildCsvTemplate(): string {
  return toCsv(
    ["nombre", "descripcion", "categoria", "subcategoria", "marca", "modelo", "precio", "moneda", "coste", "estado", "sku", "ubicacion", "caracteristicas", "defectos"],
    [
      ["Bicicleta de montaña 29 pulgadas", "Bicicleta revisada, lista para usar.", "Bicicletas", "", "Orbea", "MX 40", "420", "EUR", "250", "Buen estado", "BIC-001", "Valencia", "Frenos de disco; Horquilla con suspensión", "Arañazo en el cuadro"],
      ["Sofá de tres plazas", "Sofá de tela gris desenfundable.", "Muebles", "Sofás y sillones", "", "", "180", "EUR", "", "Muy buen estado", "SOF-014", "Madrid", "Desenfundable; Tela gris", ""],
    ],
  );
}
