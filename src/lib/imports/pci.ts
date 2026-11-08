import { normalizeHeader } from "@/lib/imports/columns";
import { parseDate, type RawValue } from "@/lib/imports/validate";
import {
  AGENT_LABELS,
  CATEGORY_CODES,
  CATEGORY_LABELS,
  CATEGORY_SINGULAR,
  type CategoryCode,
  ESTABLISHMENT_LABELS,
  ESTABLISHMENT_TYPES,
  EXTINGUISHER_AGENTS,
} from "@/lib/pci/labels";

/**
 * Importación PCI (clientes, instalaciones y equipos), cada una con su
 * plantilla. Orden recomendado: clientes → instalaciones → equipos (cada
 * archivo se apoya en lo que ya existe en RevisaYa). Funciones puras.
 */

export const PCI_IMPORT_KINDS = [
  "customers",
  "installations",
  "equipment",
] as const;
export type PciImportKind = (typeof PCI_IMPORT_KINDS)[number];

export const PCI_IMPORT_LABELS: Record<
  PciImportKind,
  { title: string; slug: string; hint: string }
> = {
  customers: {
    title: "Clientes",
    slug: "clientes",
    hint: "Empresas, comunidades y particulares. Se omiten los que ya existen (mismo CIF/NIF o correo).",
  },
  installations: {
    title: "Instalaciones",
    slug: "instalaciones",
    hint: "Cada fila indica su cliente (CIF/NIF, correo o nombre exacto de un cliente ya dado de alta).",
  },
  equipment: {
    title: "Equipos",
    slug: "equipos",
    hint: "Cada fila indica su instalación (nombre exacto) y la categoría del equipo; los extintores, además, su agente.",
  },
};

export interface PciColumn {
  key: string;
  label: string;
  aliases: string[];
  required?: boolean;
  example: string;
  date?: boolean;
}

export const PCI_COLUMNS: Record<PciImportKind, PciColumn[]> = {
  customers: [
    {
      key: "kind",
      label: "Tipo (empresa o particular)",
      aliases: ["tipo", "tipo de cliente"],
      example: "empresa",
    },
    {
      key: "firstName",
      label: "Nombre",
      aliases: ["nombre", "nombre comercial", "cliente", "nombre del cliente"],
      required: true,
      example: "Comunidad Las Encinas",
    },
    {
      key: "lastName",
      label: "Apellidos",
      aliases: ["apellidos"],
      example: "",
    },
    {
      key: "legalName",
      label: "Razón social",
      aliases: ["razon social", "denominacion social"],
      example: "Comunidad de Propietarios Las Encinas 12",
    },
    {
      key: "taxId",
      label: "CIF / NIF",
      aliases: ["cif", "nif", "cif nif", "nif cif", "dni"],
      example: "",
    },
    {
      key: "email",
      label: "Correo electrónico",
      aliases: ["correo", "email", "e mail", "correo electronico"],
      example: "administracion@encinas.es",
    },
    {
      key: "phone",
      label: "Teléfono",
      aliases: ["telefono", "tel", "movil"],
      example: "600 123 456",
    },
    {
      key: "addressLine1",
      label: "Dirección",
      aliases: ["direccion", "domicilio", "direccion fiscal"],
      example: "Calle Encina 12",
    },
    {
      key: "postalCode",
      label: "Código postal",
      aliases: ["codigo postal", "cp", "c p"],
      example: "28001",
    },
    {
      key: "city",
      label: "Municipio",
      aliases: ["municipio", "localidad", "poblacion", "ciudad"],
      example: "Madrid",
    },
    {
      key: "province",
      label: "Provincia",
      aliases: ["provincia"],
      example: "Madrid",
    },
    {
      key: "contactName",
      label: "Persona de contacto",
      aliases: ["contacto", "persona de contacto"],
      example: "Marta Gil",
    },
    {
      key: "contactRole",
      label: "Cargo del contacto",
      aliases: ["cargo", "cargo del contacto"],
      example: "Administradora de fincas",
    },
    {
      key: "notes",
      label: "Notas",
      aliases: ["notas", "observaciones"],
      example: "",
    },
  ],
  installations: [
    {
      key: "customer",
      label: "Cliente (CIF/NIF, correo o nombre)",
      aliases: ["cliente", "cif cliente", "nif cliente", "correo cliente"],
      required: true,
      example: "administracion@encinas.es",
    },
    {
      key: "name",
      label: "Nombre de la instalación",
      aliases: [
        "instalacion",
        "nombre",
        "nombre instalacion",
        "centro",
        "edificio",
      ],
      required: true,
      example: "Garaje comunitario",
    },
    {
      key: "establishmentType",
      label: "Tipo de establecimiento",
      aliases: ["tipo", "tipo establecimiento", "uso"],
      example: "Aparcamiento",
    },
    {
      key: "addressLine1",
      label: "Dirección",
      aliases: ["direccion", "domicilio"],
      required: true,
      example: "Calle Encina 12",
    },
    {
      key: "postalCode",
      label: "Código postal",
      aliases: ["codigo postal", "cp"],
      example: "28001",
    },
    {
      key: "city",
      label: "Municipio",
      aliases: ["municipio", "localidad", "poblacion"],
      example: "Madrid",
    },
    {
      key: "province",
      label: "Provincia",
      aliases: ["provincia"],
      example: "Madrid",
    },
    {
      key: "contactName",
      label: "Responsable",
      aliases: ["responsable", "contacto"],
      example: "Marta Gil",
    },
    {
      key: "contactPhone",
      label: "Teléfono",
      aliases: ["telefono", "tel"],
      example: "600 123 456",
    },
    {
      key: "contactEmail",
      label: "Correo",
      aliases: ["correo", "email"],
      example: "",
    },
    {
      key: "notes",
      label: "Observaciones",
      aliases: ["observaciones", "notas", "accesos"],
      example: "Llave en conserjería",
    },
  ],
  equipment: [
    {
      key: "installation",
      label: "Instalación",
      aliases: ["instalacion", "nombre instalacion", "centro"],
      required: true,
      example: "Garaje comunitario",
    },
    {
      key: "customer",
      label: "Cliente (si hay instalaciones con el mismo nombre)",
      aliases: ["cliente"],
      example: "",
    },
    {
      key: "category",
      label: "Categoría",
      aliases: ["categoria", "tipo de equipo", "equipo"],
      required: true,
      example: "Extintor",
    },
    {
      key: "code",
      label: "Código interno",
      aliases: ["codigo", "codigo interno", "referencia", "n equipo"],
      example: "",
    },
    {
      key: "type",
      label: "Tipo",
      aliases: ["tipo", "modelo de equipo"],
      example: "",
    },
    {
      key: "location",
      label: "Ubicación",
      aliases: ["ubicacion", "situacion", "emplazamiento"],
      example: "Planta -1, junto al ascensor",
    },
    {
      key: "manufacturer",
      label: "Fabricante",
      aliases: ["fabricante", "marca"],
      example: "",
    },
    { key: "model", label: "Modelo", aliases: ["modelo"], example: "" },
    {
      key: "serialNumber",
      label: "Número de serie",
      aliases: ["numero de serie", "n serie", "serie"],
      example: "",
    },
    {
      key: "manufacturedOn",
      label: "Fecha de fabricación",
      aliases: ["fecha de fabricacion", "fabricacion"],
      example: "",
      date: true,
    },
    {
      key: "installedOn",
      label: "Fecha de instalación",
      aliases: ["fecha de instalacion", "instalado"],
      example: "",
      date: true,
    },
    {
      key: "agent",
      label: "Agente extintor",
      aliases: ["agente", "agente extintor"],
      example: "Polvo ABC",
    },
    {
      key: "chargeValue",
      label: "Capacidad",
      aliases: ["capacidad", "carga", "kg", "kilos"],
      example: "6",
    },
    {
      key: "chargeUnit",
      label: "Unidad (kg o l)",
      aliases: ["unidad"],
      example: "kg",
    },
    {
      key: "efficacy",
      label: "Eficacia",
      aliases: ["eficacia"],
      example: "27A-183B-C",
    },
    {
      key: "stampedOn",
      label: "Fecha de timbrado",
      aliases: ["fecha de timbrado", "timbrado", "fecha timbre"],
      example: "",
      date: true,
    },
    {
      key: "putInServiceOn",
      label: "Puesta en servicio",
      aliases: ["puesta en servicio", "fecha puesta en servicio"],
      example: "",
      date: true,
    },
    {
      key: "retimbradosBefore",
      label: "Retimbrados ya hechos",
      aliases: ["retimbrados", "retimbrados ya hechos", "retimbrados previos"],
      example: "0",
    },
  ],
};

export const PCI_EXAMPLE_MARK = "(ejemplo)";

/** Columna de la plantilla para una cabecera del archivo. */
export function pciColumnFor(
  kind: PciImportKind,
  header: unknown,
): string | undefined {
  const h = normalizeHeader(header);
  if (!h) return undefined;
  for (const c of PCI_COLUMNS[kind])
    if (normalizeHeader(c.label) === h || c.aliases.includes(h)) return c.key;
  return undefined;
}

export interface PciIssue {
  column: string;
  message: string;
}

/** Texto de una celda (fechas de Excel → AAAA-MM-DD; números sin formato). */
export function cellText(
  v: RawValue | undefined,
  date = false,
): { ok: true; value: string } | { ok: false } {
  if (v === null || v === undefined) return { ok: true, value: "" };
  if (date) {
    const d = parseDate(v);
    return d.ok ? { ok: true, value: d.value ?? "" } : { ok: false };
  }
  if (v instanceof Date)
    return { ok: true, value: v.toISOString().slice(0, 10) };
  return { ok: true, value: String(v).trim() };
}

const norm = (s: string) => normalizeHeader(s);

export function matchCategory(text: string): CategoryCode | null {
  const t = norm(text);
  if (!t) return null;
  for (const c of CATEGORY_CODES) {
    if (
      t === c ||
      t === norm(CATEGORY_LABELS[c]) ||
      t === norm(CATEGORY_SINGULAR[c])
    )
      return c;
  }
  const words: Array<[RegExp, CategoryCode]> = [
    [/^extint/, "extinguisher"],
    [/^(bie|boca)/, "bie"],
    [/^hidrant/, "hydrant"],
    [/columna/, "dry_riser"],
    [/(deteccion|alarma|detector|pulsador|central)/, "detection_alarm"],
    [
      /(extincion automatica|sistema fijo|rociador|sprinkler)/,
      "fixed_extinguishing",
    ],
    [/(abastecimiento|grupo de presion|aljibe|deposito)/, "water_supply"],
    [/(humo|exutorio|control de humos)/, "smoke_control"],
    [/(senal|luminiscente)/, "luminescent_signage"],
  ];
  for (const [re, c] of words) if (re.test(t)) return c;
  return null;
}

export function matchAgent(text: string): string | null {
  const t = norm(text);
  if (!t) return null;
  for (const a of EXTINGUISHER_AGENTS)
    if (t === a.replace(/_/g, " ") || t === norm(AGENT_LABELS[a])) return a;
  if (/^co ?2$|dioxido/.test(t)) return "co2";
  if (/polvo.*abc|^abc$/.test(t)) return "powder_abc";
  if (/polvo.*bc|^bc$/.test(t)) return "powder_bc";
  if (/espuma|afff/.test(t)) return "foam";
  if (/agua/.test(t)) return /aditiv/.test(t) ? "water_additive" : "water";
  return null;
}

export function matchEstablishment(text: string): string | null {
  const t = norm(text);
  if (!t) return "other";
  for (const e of ESTABLISHMENT_TYPES)
    if (t === e || t === norm(ESTABLISHMENT_LABELS[e])) return e;
  return null;
}
