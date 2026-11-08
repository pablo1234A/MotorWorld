/**
 * Textos de la interfaz para el modelo PCI (los códigos son los de la base de
 * datos; ver supabase/migrations/20261115000100_pci_core.sql).
 */

export const CATEGORY_CODES = [
  "extinguisher", "bie", "hydrant", "dry_riser", "detection_alarm", "fixed_extinguishing",
  "water_supply", "smoke_control", "luminescent_signage", "other",
] as const;
export type CategoryCode = (typeof CATEGORY_CODES)[number];

export const CATEGORY_LABELS: Record<CategoryCode, string> = {
  extinguisher: "Extintores",
  bie: "Bocas de incendio equipadas (BIE)",
  hydrant: "Hidrantes",
  dry_riser: "Columnas secas",
  detection_alarm: "Detección y alarma",
  fixed_extinguishing: "Sistemas fijos de extinción",
  water_supply: "Abastecimiento de agua",
  smoke_control: "Control de humos y calor",
  luminescent_signage: "Señalización luminiscente",
  other: "Otros equipos",
};
export const CATEGORY_SINGULAR: Record<CategoryCode, string> = {
  extinguisher: "Extintor",
  bie: "BIE",
  hydrant: "Hidrante",
  dry_riser: "Columna seca",
  detection_alarm: "Equipo de detección y alarma",
  fixed_extinguishing: "Sistema fijo de extinción",
  water_supply: "Abastecimiento de agua",
  smoke_control: "Control de humos y calor",
  luminescent_signage: "Señalización luminiscente",
  other: "Equipo",
};

export const EQUIPMENT_STATUSES = ["in_service", "out_of_service", "retired"] as const;
export type EquipmentStatus = (typeof EQUIPMENT_STATUSES)[number];
export const EQUIPMENT_STATUS_LABELS: Record<EquipmentStatus, string> = {
  in_service: "Operativo",
  out_of_service: "Fuera de servicio",
  retired: "Dado de baja",
};

export const EXTINGUISHER_AGENTS = [
  "powder_abc", "powder_bc", "powder_d", "co2", "water", "water_additive", "foam", "wet_chemical_f", "clean_agent", "other",
] as const;
export type ExtinguisherAgent = (typeof EXTINGUISHER_AGENTS)[number];
export const AGENT_LABELS: Record<ExtinguisherAgent, string> = {
  powder_abc: "Polvo ABC",
  powder_bc: "Polvo BC",
  powder_d: "Polvo para metales (clase D)",
  co2: "CO₂",
  water: "Agua",
  water_additive: "Agua con aditivos",
  foam: "Espuma",
  wet_chemical_f: "Clase F (aceites de cocina)",
  clean_agent: "Agente especial",
  other: "Otro",
};
/** Tipo de extintor del catálogo → agente (el mismo código). */
export const AGENT_BY_TYPE_CODE: Partial<Record<string, ExtinguisherAgent>> = {
  powder_abc: "powder_abc", powder_bc: "powder_bc", powder_d: "powder_d", co2: "co2", water: "water",
  water_additive: "water_additive", foam: "foam", wet_chemical_f: "wet_chemical_f", clean_agent: "clean_agent",
};
export const MOBILITY_LABELS = { portable: "Portátil", wheeled: "Móvil (sobre ruedas)" } as const;

export const ESTABLISHMENT_TYPES = [
  "industrial", "commercial", "office", "residential", "educational", "healthcare",
  "public_assembly", "hospitality", "parking", "warehouse", "other",
] as const;
export type EstablishmentType = (typeof ESTABLISHMENT_TYPES)[number];
export const ESTABLISHMENT_LABELS: Record<EstablishmentType, string> = {
  industrial: "Industrial",
  commercial: "Comercial",
  office: "Oficinas",
  residential: "Residencial",
  educational: "Docente",
  healthcare: "Sanitario",
  public_assembly: "Pública concurrencia",
  hospitality: "Hostelería y alojamiento",
  parking: "Aparcamiento",
  warehouse: "Almacén",
  other: "Otro",
};

export const RESULTS = ["compliant", "compliant_with_remarks", "non_compliant", "not_performed"] as const;
export type RecordResult = (typeof RESULTS)[number];
export const RESULT_LABELS: Record<RecordResult, string> = {
  compliant: "Correcto",
  compliant_with_remarks: "Correcto con observaciones",
  non_compliant: "No conforme",
  not_performed: "No realizado",
};

export const ACTION_KIND_LABELS: Record<string, string> = {
  inspection: "Inspección",
  periodic_maintenance: "Mantenimiento periódico",
  recharge: "Recarga",
  retimbrado: "Retimbrado",
  replacement: "Sustitución",
  repair: "Reparación",
  decommission: "Baja",
  other: "Otra actuación",
};

export const SERVICE_TYPES = ["periodic_maintenance", "inspection", "installation", "repair", "corrective", "replacement", "other"] as const;
export type ServiceType = (typeof SERVICE_TYPES)[number];
export const SERVICE_TYPE_LABELS: Record<ServiceType, string> = {
  periodic_maintenance: "Mantenimiento periódico",
  inspection: "Inspección / revisión",
  installation: "Instalación",
  repair: "Reparación",
  corrective: "Mantenimiento correctivo",
  replacement: "Sustitución de equipos",
  other: "Otro servicio",
};

export const WORK_ORDER_STATUSES = ["pending", "scheduled", "assigned", "in_progress", "completed", "canceled"] as const;
export type WorkOrderStatus = (typeof WORK_ORDER_STATUSES)[number];
export const WORK_ORDER_STATUS_LABELS: Record<WorkOrderStatus, string> = {
  pending: "Pendiente",
  scheduled: "Programada",
  assigned: "Asignada",
  in_progress: "En curso",
  completed: "Completada",
  canceled: "Cancelada",
};
/** Transiciones permitidas (las mismas que impone la BD). */
export const WORK_ORDER_TRANSITIONS: Record<WorkOrderStatus, readonly WorkOrderStatus[]> = {
  pending: ["scheduled", "assigned", "in_progress", "canceled"],
  scheduled: ["pending", "assigned", "in_progress", "canceled"],
  assigned: ["scheduled", "in_progress", "canceled"],
  in_progress: ["completed", "canceled"],
  completed: [],
  canceled: [],
};

export const SEVERITIES = ["low", "medium", "high", "critical"] as const;
export type Severity = (typeof SEVERITIES)[number];
export const SEVERITY_LABELS: Record<Severity, string> = { low: "Baja", medium: "Media", high: "Alta", critical: "Crítica" };
export const INCIDENT_STATUSES = ["open", "in_progress", "resolved", "dismissed"] as const;
export type IncidentStatus = (typeof INCIDENT_STATUSES)[number];
export const INCIDENT_STATUS_LABELS: Record<IncidentStatus, string> = {
  open: "Abierta",
  in_progress: "En curso",
  resolved: "Resuelta",
  dismissed: "Descartada",
};

export const CUSTOMER_KIND_LABELS = { company: "Empresa", individual: "Particular / comunidad" } as const;
