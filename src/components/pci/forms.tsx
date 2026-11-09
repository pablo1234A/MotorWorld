"use client";

import { useRouter } from "next/navigation";
import { type ReactNode, useActionState, useId, useState } from "react";

import { SubmitButton } from "@/components/ui/button";
import { Field, SelectField } from "@/components/ui/field";
import {
  fieldErrors,
  FormMessage,
  sentValue,
} from "@/components/ui/form-state";
import {
  AGENT_LABELS,
  CATEGORY_CODES,
  CATEGORY_LABELS,
  type CategoryCode,
  EQUIPMENT_STATUS_LABELS,
  ESTABLISHMENT_LABELS,
  ESTABLISHMENT_TYPES,
  EXTINGUISHER_AGENTS,
  INCIDENT_STATUS_LABELS,
  MOBILITY_LABELS,
  RESULT_LABELS,
  RESULTS,
  SERVICE_TYPE_LABELS,
  SERVICE_TYPES,
  SEVERITY_LABELS,
  SEVERITIES,
  WORK_ORDER_STATUS_LABELS,
  WORK_ORDER_TRANSITIONS,
  type WorkOrderStatus,
} from "@/lib/pci/labels";
import type { ActionState } from "@/server/actions/result";
import {
  deleteDocumentAction,
  uploadDocumentAction,
} from "@/server/modules/documents/actions";
import { sendPciEmailAction } from "@/server/modules/pci-notify/actions";
import {
  createEquipmentAction,
  deleteEquipmentAction,
  findEquipmentAction,
  setActionSettingAction,
  updateEquipmentAction,
} from "@/server/modules/equipment/actions";
import {
  createIncidentAction,
  updateIncidentAction,
} from "@/server/modules/incidents/actions";
import {
  createInstallationAction,
  deleteInstallationAction,
  updateInstallationAction,
} from "@/server/modules/installations/actions";
import {
  amendRecordAction,
  createRecordAction,
  voidRecordAction,
} from "@/server/modules/maintenance/record-actions";
import { saveTechnicianAction } from "@/server/modules/technicians/actions";
import {
  addWorkOrderItemsAction,
  addWorkOrderNoteAction,
  createWorkOrderAction,
  recordItemResultAction,
  removeWorkOrderItemAction,
  setWorkOrderStatusAction,
  updateWorkOrderAction,
} from "@/server/modules/work-orders/actions";

const idle: ActionState = { status: "idle" };
const CONTROL =
  "w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-[15px] focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-ring)]";

function TextArea({
  label,
  name,
  defaultValue,
  errors,
  rows = 3,
  hint,
  required,
}: {
  label: string;
  name: string;
  defaultValue?: string | null;
  errors?: string[];
  rows?: number;
  hint?: string;
  required?: boolean;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <textarea
        id={id}
        name={name}
        rows={rows}
        defaultValue={defaultValue ?? ""}
        required={required}
        aria-invalid={errors?.length ? true : undefined}
        className={CONTROL}
      />
      {errors?.length ? (
        <p className="text-sm text-[var(--danger)]">{errors[0]}</p>
      ) : hint ? (
        <p className="text-sm text-[var(--muted)]">{hint}</p>
      ) : null}
    </div>
  );
}

const v = (
  state: ActionState<unknown>,
  name: string,
  fallback?: string | number | null,
) =>
  sentValue(state, name) ??
  (fallback === null || fallback === undefined ? "" : String(fallback));

// ============================================================ instalaciones

export interface InstallationValues {
  id?: string;
  customerId?: string;
  name?: string;
  establishmentType?: string;
  addressLine1?: string;
  postalCode?: string | null;
  city?: string | null;
  province?: string | null;
  contactName?: string | null;
  contactPhone?: string | null;
  contactEmail?: string | null;
  notes?: string | null;
  status?: string;
}

export function InstallationForm({
  values = {},
  customers,
}: {
  values?: InstallationValues;
  customers?: Array<{ id: string; label: string }>;
}) {
  const editing = Boolean(values.id);
  const [state, action] = useActionState(
    editing ? updateInstallationAction : createInstallationAction,
    idle,
  );
  const e = (n: string) => fieldErrors(state, n);
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <FormMessage state={state} />
      {editing ? <input type="hidden" name="id" value={values.id} /> : null}
      {!editing && customers ? (
        <SelectField
          label="Cliente"
          name="customerId"
          defaultValue={v(state, "customerId", values.customerId)}
          errors={e("customerId")}
          required
        >
          <option value="">Elige el cliente…</option>
          {customers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </SelectField>
      ) : !editing ? (
        <input type="hidden" name="customerId" value={values.customerId} />
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Nombre de la instalación"
          name="name"
          required
          maxLength={160}
          placeholder="Nave 2 · Polígono Sur"
          defaultValue={v(state, "name", values.name)}
          errors={e("name")}
        />
        <SelectField
          label="Tipo de establecimiento"
          name="establishmentType"
          defaultValue={v(
            state,
            "establishmentType",
            values.establishmentType ?? "other",
          )}
        >
          {ESTABLISHMENT_TYPES.map((t) => (
            <option key={t} value={t}>
              {ESTABLISHMENT_LABELS[t]}
            </option>
          ))}
        </SelectField>
      </div>
      <Field
        label="Dirección"
        name="addressLine1"
        required
        maxLength={200}
        defaultValue={v(state, "addressLine1", values.addressLine1)}
        errors={e("addressLine1")}
      />
      <div className="grid gap-4 sm:grid-cols-3">
        <Field
          label="Código postal"
          name="postalCode"
          inputMode="numeric"
          maxLength={5}
          defaultValue={v(state, "postalCode", values.postalCode)}
          errors={e("postalCode")}
        />
        <Field
          label="Municipio"
          name="city"
          maxLength={100}
          defaultValue={v(state, "city", values.city)}
          errors={e("city")}
        />
        <Field
          label="Provincia"
          name="province"
          maxLength={100}
          defaultValue={v(state, "province", values.province)}
          errors={e("province")}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field
          label="Responsable en la instalación"
          name="contactName"
          maxLength={160}
          defaultValue={v(state, "contactName", values.contactName)}
          errors={e("contactName")}
        />
        <Field
          label="Teléfono"
          name="contactPhone"
          type="tel"
          defaultValue={v(state, "contactPhone", values.contactPhone)}
          errors={e("contactPhone")}
        />
        <Field
          label="Correo"
          name="contactEmail"
          type="email"
          defaultValue={v(state, "contactEmail", values.contactEmail)}
          errors={e("contactEmail")}
        />
      </div>
      <TextArea
        label="Observaciones"
        name="notes"
        defaultValue={v(state, "notes", values.notes)}
        errors={e("notes")}
        hint="Accesos, horarios, llaves… No anotes datos de salud ni otros datos especialmente protegidos."
      />
      {editing ? (
        <SelectField
          label="Estado"
          name="status"
          defaultValue={v(state, "status", values.status ?? "active")}
        >
          <option value="active">Activa</option>
          <option value="inactive">
            Inactiva (sin avisos ni nuevas órdenes)
          </option>
        </SelectField>
      ) : null}
      <SubmitButton pendingLabel="Guardando…" className="self-start">
        {editing ? "Guardar cambios" : "Crear instalación"}
      </SubmitButton>
    </form>
  );
}

export function DeleteInstallationButton({
  id,
  name,
}: {
  id: string;
  name: string;
}) {
  const [state, action] = useActionState(deleteInstallationAction, idle);
  return (
    <form
      action={action}
      className="flex flex-col gap-2"
      onSubmit={(ev) => {
        if (
          !window.confirm(
            `¿Enviar «${name}» a la papelera? Se puede restaurar durante 30 días.`,
          )
        )
          ev.preventDefault();
      }}
    >
      <FormMessage state={state} />
      <input type="hidden" name="id" value={id} />
      <SubmitButton
        variant="ghost"
        pendingLabel="Borrando…"
        className="self-start"
      >
        Enviar a la papelera
      </SubmitButton>
    </form>
  );
}

// =================================================================== equipos

export interface EquipmentValues {
  id?: string;
  installationId?: string;
  categoryCode?: CategoryCode;
  typeId?: string | null;
  code?: string;
  manufacturer?: string | null;
  model?: string | null;
  serialNumber?: string | null;
  location?: string | null;
  installedOn?: string | null;
  manufacturedOn?: string | null;
  status?: string;
  notes?: string | null;
  agent?: string | null;
  chargeValue?: number | null;
  chargeUnit?: string | null;
  efficacy?: string | null;
  mobility?: string;
  stampedOn?: string | null;
  putInServiceOn?: string | null;
  retimbradosBefore?: number;
}

export function EquipmentForm({
  values = {},
  installations,
  types,
}: {
  values?: EquipmentValues;
  installations: Array<{ id: string; label: string }>;
  types: Array<{ id: string; categoryCode: string; name: string }>;
}) {
  const editing = Boolean(values.id);
  const [state, action] = useActionState(
    editing ? updateEquipmentAction : createEquipmentAction,
    idle,
  );
  const [category, setCategory] = useState<string>(
    sentValue(state, "categoryCode") ?? values.categoryCode ?? "extinguisher",
  );
  const e = (n: string) => fieldErrors(state, n);
  const isExt = category === "extinguisher";
  return (
    <form action={action} className="flex flex-col gap-5" noValidate>
      <FormMessage state={state} />
      {editing ? <input type="hidden" name="id" value={values.id} /> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          label="Instalación"
          name="installationId"
          defaultValue={v(state, "installationId", values.installationId)}
          errors={e("installationId")}
          required
        >
          <option value="">Elige la instalación…</option>
          {installations.map((i) => (
            <option key={i.id} value={i.id}>
              {i.label}
            </option>
          ))}
        </SelectField>
        {editing ? (
          <>
            <input type="hidden" name="categoryCode" value={category} />
            <div className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium">Categoría</span>
              <span className="rounded-lg bg-[var(--surface-2)] px-3 py-2.5">
                {CATEGORY_LABELS[category as CategoryCode]}
              </span>
            </div>
          </>
        ) : (
          <SelectField
            label="Categoría"
            name="categoryCode"
            value={category}
            onChange={(ev) => setCategory(ev.target.value)}
          >
            {CATEGORY_CODES.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABELS[c]}
              </option>
            ))}
          </SelectField>
        )}
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <SelectField
          label="Tipo"
          name="typeId"
          defaultValue={v(state, "typeId", values.typeId)}
          key={category}
        >
          <option value="">—</option>
          {types
            .filter((t) => t.categoryCode === category)
            .map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
        </SelectField>
        <Field
          label="Código interno"
          name="code"
          maxLength={40}
          defaultValue={v(state, "code", values.code)}
          errors={e("code")}
          hint={
            editing
              ? undefined
              : "Vacío: se asigna uno automático (p. ej. EXT-000001)."
          }
        />
        <Field
          label="Ubicación"
          name="location"
          maxLength={200}
          placeholder="Planta 1, pasillo norte"
          defaultValue={v(state, "location", values.location)}
          errors={e("location")}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field
          label="Fabricante"
          name="manufacturer"
          maxLength={100}
          defaultValue={v(state, "manufacturer", values.manufacturer)}
        />
        <Field
          label="Modelo"
          name="model"
          maxLength={100}
          defaultValue={v(state, "model", values.model)}
        />
        <Field
          label="Número de serie"
          name="serialNumber"
          maxLength={100}
          defaultValue={v(state, "serialNumber", values.serialNumber)}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field
          label="Fecha de fabricación"
          name="manufacturedOn"
          type="date"
          defaultValue={v(state, "manufacturedOn", values.manufacturedOn)}
          errors={e("manufacturedOn")}
        />
        <Field
          label="Fecha de instalación"
          name="installedOn"
          type="date"
          defaultValue={v(state, "installedOn", values.installedOn)}
          errors={e("installedOn")}
        />
        {editing ? (
          <SelectField
            label="Estado"
            name="status"
            defaultValue={v(state, "status", values.status ?? "in_service")}
          >
            {Object.entries(EQUIPMENT_STATUS_LABELS).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </SelectField>
        ) : null}
      </div>
      {isExt ? (
        <fieldset className="flex flex-col gap-4 rounded-xl border border-[var(--border)] p-4">
          <legend className="px-1 text-sm font-semibold">
            Ficha del extintor
          </legend>
          <div className="grid gap-4 sm:grid-cols-3">
            <SelectField
              label="Agente extintor"
              name="agent"
              defaultValue={v(state, "agent", values.agent)}
              errors={e("agent")}
              hint="Si eliges el tipo, se rellena solo."
            >
              <option value="">—</option>
              {EXTINGUISHER_AGENTS.map((a) => (
                <option key={a} value={a}>
                  {AGENT_LABELS[a]}
                </option>
              ))}
            </SelectField>
            <div className="grid grid-cols-[1fr_auto] gap-2">
              <Field
                label="Capacidad"
                name="chargeValue"
                inputMode="decimal"
                defaultValue={v(state, "chargeValue", values.chargeValue)}
                errors={e("chargeValue")}
              />
              <SelectField
                label="Unidad"
                name="chargeUnit"
                defaultValue={v(state, "chargeUnit", values.chargeUnit ?? "kg")}
                errors={e("chargeUnit")}
              >
                <option value="kg">kg</option>
                <option value="l">l</option>
              </SelectField>
            </div>
            <Field
              label="Eficacia"
              name="efficacy"
              placeholder="21A-113B-C"
              maxLength={40}
              defaultValue={v(state, "efficacy", values.efficacy)}
              errors={e("efficacy")}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-4">
            <SelectField
              label="Tipo de extintor"
              name="mobility"
              defaultValue={v(state, "mobility", values.mobility ?? "portable")}
            >
              {Object.entries(MOBILITY_LABELS).map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </SelectField>
            <Field
              label="Fecha de timbrado"
              name="stampedOn"
              type="date"
              defaultValue={v(state, "stampedOn", values.stampedOn)}
              hint="De la placa del recipiente."
            />
            <Field
              label="Puesta en servicio"
              name="putInServiceOn"
              type="date"
              defaultValue={v(state, "putInServiceOn", values.putInServiceOn)}
            />
            <SelectField
              label="Retimbrados ya hechos"
              name="retimbradosBefore"
              defaultValue={v(
                state,
                "retimbradosBefore",
                values.retimbradosBefore ?? 0,
              )}
              hint="Antes de darlo de alta aquí."
            >
              {[0, 1, 2, 3].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </SelectField>
          </div>
        </fieldset>
      ) : null}
      <TextArea
        label="Observaciones"
        name="notes"
        defaultValue={v(state, "notes", values.notes)}
      />
      <div className="flex flex-wrap gap-2">
        <SubmitButton pendingLabel="Guardando…">
          {editing ? "Guardar cambios" : "Crear equipo"}
        </SubmitButton>
        {!editing ? (
          <SubmitButton
            variant="secondary"
            name="intent"
            value="another"
            pendingLabel="Guardando…"
          >
            Guardar y añadir otro
          </SubmitButton>
        ) : null}
      </div>
    </form>
  );
}

export function DeleteEquipmentButton({
  id,
  code,
}: {
  id: string;
  code: string;
}) {
  const [state, action] = useActionState(deleteEquipmentAction, idle);
  return (
    <form
      action={action}
      className="flex flex-col gap-2"
      onSubmit={(ev) => {
        if (
          !window.confirm(
            `¿Enviar el equipo ${code} a la papelera? Se puede restaurar durante 30 días.`,
          )
        )
          ev.preventDefault();
      }}
    >
      <FormMessage state={state} />
      <input type="hidden" name="id" value={id} />
      <SubmitButton
        variant="ghost"
        pendingLabel="Borrando…"
        className="self-start"
      >
        Enviar a la papelera
      </SubmitButton>
    </form>
  );
}

/** Buscar un equipo por código o escaneando su QR (cámara del móvil si el navegador lo permite). */
export function FindEquipmentForm({ autoFocus }: { autoFocus?: boolean }) {
  const router = useRouter();
  const [state, action] = useActionState(findEquipmentAction, idle);
  const [scanning, setScanning] = useState(false);
  const [term, setTerm] = useState("");
  const scan = async () => {
    const Detector = (
      window as unknown as {
        BarcodeDetector?: new (o: { formats: string[] }) => {
          detect: (
            s: CanvasImageSource,
          ) => Promise<Array<{ rawValue: string }>>;
        };
      }
    ).BarcodeDetector;
    if (!Detector || !navigator.mediaDevices?.getUserMedia) {
      window.alert(
        "Este navegador no puede leer códigos QR. Usa la cámara del móvil (abre el enlace del QR) o escribe el código del equipo.",
      );
      return;
    }
    setScanning(true);
    const stream = await navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "environment" } })
      .catch(() => null);
    if (!stream) {
      setScanning(false);
      return;
    }
    const video = document.createElement("video");
    video.srcObject = stream;
    video.setAttribute("playsinline", "true");
    await video.play();
    const detector = new Detector({ formats: ["qr_code"] });
    const started = Date.now();
    try {
      while (Date.now() - started < 20_000) {
        const codes = await detector.detect(video);
        if (codes[0]?.rawValue) {
          const value = codes[0].rawValue;
          const token = value.match(/\/app\/equipos\/qr\/([a-f0-9]{64})/)?.[1];
          if (token) {
            router.push(`/app/equipos/qr/${token}`);
            return;
          }
          setTerm(value);
          break;
        }
        await new Promise((r) => setTimeout(r, 250));
      }
    } finally {
      stream.getTracks().forEach((t) => t.stop());
      setScanning(false);
    }
  };
  return (
    <form action={action} className="flex flex-col gap-2">
      <FormMessage state={state} />
      <div className="flex flex-wrap gap-2">
        <label className="sr-only" htmlFor="find-term">
          Código del equipo
        </label>
        <input
          id="find-term"
          name="term"
          value={term}
          onChange={(ev) => setTerm(ev.target.value)}
          autoFocus={autoFocus}
          placeholder="Código del equipo (EXT-000123) o QR"
          className={`${CONTROL} min-w-0 flex-1`}
        />
        <SubmitButton variant="secondary" pendingLabel="Buscando…">
          Buscar
        </SubmitButton>
        <button
          type="button"
          onClick={scan}
          disabled={scanning}
          className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm font-medium hover:bg-[var(--surface-2)]"
        >
          {scanning ? "Apunta al QR…" : "Escanear QR"}
        </button>
      </div>
    </form>
  );
}

// =============================================================== actuaciones

export interface ActionOption {
  id: string;
  name: string;
  categoryCode: string | null;
}

function MaterialsRows() {
  const [rows, setRows] = useState(1);
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-sm font-medium">Materiales (opcional)</legend>
      {Array.from({ length: rows }, (_, i) => (
        <div
          key={i}
          className="grid grid-cols-[1fr_6rem_5rem] gap-2 sm:grid-cols-[1fr_8rem_6rem_6rem]"
        >
          <input
            name={`materials[${i}][description]`}
            placeholder="Descripción"
            aria-label={`Material ${i + 1}`}
            className={CONTROL}
            maxLength={200}
          />
          <input
            name={`materials[${i}][reference]`}
            placeholder="Referencia"
            aria-label={`Referencia ${i + 1}`}
            className={`${CONTROL} hidden sm:block`}
            maxLength={80}
          />
          <input
            name={`materials[${i}][quantity]`}
            defaultValue="1"
            inputMode="decimal"
            aria-label={`Cantidad ${i + 1}`}
            className={CONTROL}
          />
          <input
            name={`materials[${i}][unit]`}
            placeholder="ud"
            aria-label={`Unidad ${i + 1}`}
            className={CONTROL}
            maxLength={20}
          />
        </div>
      ))}
      {rows < 20 ? (
        <button
          type="button"
          onClick={() => setRows(rows + 1)}
          className="self-start text-sm font-medium text-[var(--accent)]"
        >
          + Añadir material
        </button>
      ) : null}
    </fieldset>
  );
}

function IncidentFields() {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-dashed border-[var(--border)] p-3">
      <label className="flex items-center gap-2 text-sm font-medium">
        <input
          type="checkbox"
          checked={open}
          onChange={(e) => setOpen(e.target.checked)}
        />
        Registrar también una incidencia
      </label>
      {open ? (
        <div className="grid gap-3 sm:grid-cols-[1fr_10rem]">
          <Field
            label="Incidencia"
            name="incidentTitle"
            maxLength={200}
            placeholder="Manguera agrietada, extintor sin acceso…"
            required
          />
          <SelectField
            label="Gravedad"
            name="incidentSeverity"
            defaultValue="medium"
          >
            {SEVERITIES.map((s) => (
              <option key={s} value={s}>
                {SEVERITY_LABELS[s]}
              </option>
            ))}
          </SelectField>
        </div>
      ) : null}
    </div>
  );
}

export function RecordForm({
  equipmentId,
  actions,
  technicians,
  today,
}: {
  equipmentId: string;
  actions: ActionOption[];
  technicians: Array<{ id: string; fullName: string }>;
  today: string;
}) {
  const [state, action] = useActionState(createRecordAction, idle);
  const e = (n: string) => fieldErrors(state, n);
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <FormMessage state={state} />
      <input type="hidden" name="equipmentId" value={equipmentId} />
      <div className="grid gap-4 sm:grid-cols-3">
        <SelectField
          label="Operación"
          name="actionTypeId"
          defaultValue={v(state, "actionTypeId")}
          errors={e("actionTypeId")}
          required
        >
          <option value="">Elige la operación…</option>
          {actions.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </SelectField>
        <Field
          label="Fecha"
          name="performedOn"
          type="date"
          max={today}
          defaultValue={v(state, "performedOn", today)}
          errors={e("performedOn")}
          required
        />
        <SelectField
          label="Resultado"
          name="result"
          defaultValue={v(state, "result", "compliant")}
        >
          {RESULTS.map((r) => (
            <option key={r} value={r}>
              {RESULT_LABELS[r]}
            </option>
          ))}
        </SelectField>
      </div>
      <TextArea
        label="Observaciones"
        name="observations"
        defaultValue={v(state, "observations")}
        errors={e("observations")}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        {technicians.length ? (
          <SelectField
            label="Técnico"
            name="technicianId"
            defaultValue={v(state, "technicianId")}
          >
            <option value="">—</option>
            {technicians.map((t) => (
              <option key={t.id} value={t.id}>
                {t.fullName}
              </option>
            ))}
          </SelectField>
        ) : null}
        <Field
          label="Próxima actuación recomendada (opcional)"
          name="nextActionRecommendedOn"
          type="date"
          defaultValue={v(state, "nextActionRecommendedOn")}
          errors={e("nextActionRecommendedOn")}
          hint="Solo si la quieres antes que la periodicidad configurada."
        />
      </div>
      <MaterialsRows />
      <IncidentFields />
      <SubmitButton pendingLabel="Registrando…" className="self-start">
        Registrar actuación
      </SubmitButton>
    </form>
  );
}

export function AmendRecordForm({
  record,
}: {
  record: {
    id: string;
    result: string;
    observations: string | null;
    nextActionRecommendedOn: string | null;
  };
}) {
  const [state, action] = useActionState(amendRecordAction, idle);
  return (
    <form action={action} className="flex flex-col gap-3" noValidate>
      <FormMessage state={state} />
      <input type="hidden" name="id" value={record.id} />
      <SelectField label="Resultado" name="result" defaultValue={record.result}>
        {RESULTS.map((r) => (
          <option key={r} value={r}>
            {RESULT_LABELS[r]}
          </option>
        ))}
      </SelectField>
      <TextArea
        label="Observaciones"
        name="observations"
        defaultValue={record.observations}
      />
      <Field
        label="Próxima actuación recomendada"
        name="nextActionRecommendedOn"
        type="date"
        defaultValue={record.nextActionRecommendedOn ?? ""}
      />
      <TextArea
        label="Motivo de la corrección (obligatorio)"
        name="amendmentReason"
        required
        errors={fieldErrors(state, "amendmentReason")}
        rows={2}
      />
      <SubmitButton
        variant="secondary"
        pendingLabel="Guardando…"
        className="self-start"
      >
        Guardar corrección
      </SubmitButton>
    </form>
  );
}

export function VoidRecordForm({ id }: { id: string }) {
  const [state, action] = useActionState(voidRecordAction, idle);
  return (
    <form action={action} className="flex flex-col gap-3" noValidate>
      <FormMessage state={state} />
      <input type="hidden" name="id" value={id} />
      <TextArea
        label="Motivo de la anulación (obligatorio)"
        name="voidReason"
        required
        errors={fieldErrors(state, "voidReason")}
        rows={2}
      />
      <SubmitButton
        variant="danger"
        pendingLabel="Anulando…"
        className="self-start"
      >
        Anular actuación
      </SubmitButton>
    </form>
  );
}

// ========================================================= órdenes de trabajo

export function WorkOrderCreateForm({
  installationId,
  technicians,
  dueItems,
  allEquipment,
  actions,
  today,
}: {
  installationId: string;
  technicians: Array<{ id: string; fullName: string }>;
  dueItems: Array<{
    equipmentId: string;
    code: string;
    actionTypeId: string;
    actionName: string;
    nextDueOn: string;
    location: string | null;
  }>;
  allEquipment: Array<{
    id: string;
    code: string;
    categoryCode: string;
    location: string | null;
  }>;
  actions: ActionOption[];
  today: string;
}) {
  const [state, action] = useActionState(createWorkOrderAction, idle);
  const e = (n: string) => fieldErrors(state, n);
  return (
    <form action={action} className="flex flex-col gap-5" noValidate>
      <FormMessage state={state} />
      <input type="hidden" name="installationId" value={installationId} />
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          label="Tipo de servicio"
          name="serviceType"
          defaultValue={v(state, "serviceType", "periodic_maintenance")}
        >
          {SERVICE_TYPES.map((t) => (
            <option key={t} value={t}>
              {SERVICE_TYPE_LABELS[t]}
            </option>
          ))}
        </SelectField>
        <SelectField
          label="Técnico asignado"
          name="technicianId"
          defaultValue={v(state, "technicianId")}
        >
          <option value="">Sin asignar</option>
          {technicians.map((t) => (
            <option key={t.id} value={t.id}>
              {t.fullName}
            </option>
          ))}
        </SelectField>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Fecha programada"
          name="scheduledFor"
          type="date"
          min={today}
          defaultValue={v(state, "scheduledFor")}
          errors={e("scheduledFor")}
        />
        <Field
          label="Hora"
          name="scheduledTime"
          type="time"
          defaultValue={v(state, "scheduledTime")}
          errors={e("scheduledTime")}
        />
      </div>
      <TextArea
        label="Descripción del trabajo"
        name="description"
        defaultValue={v(state, "description")}
      />
      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-semibold">Equipos y operaciones</legend>
        {dueItems.length ? (
          <ul className="flex flex-col divide-y divide-[var(--border)] rounded-xl border border-[var(--border)]">
            {dueItems.map((d) => (
              <li
                key={`${d.equipmentId}:${d.actionTypeId}`}
                className="flex items-start gap-3 p-3 text-sm"
              >
                <input
                  type="checkbox"
                  name="items"
                  value={`${d.equipmentId}:${d.actionTypeId}`}
                  defaultChecked
                  className="mt-1"
                  aria-label={`${d.code}: ${d.actionName}`}
                />
                <span className="min-w-0">
                  <span className="font-medium">{d.code}</span> · {d.actionName}
                  <span className="block text-xs text-[var(--muted)]">
                    Prevista el {d.nextDueOn.split("-").reverse().join("/")}
                    {d.location ? ` · ${d.location}` : ""}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-[var(--muted)]">
            Ningún equipo de esta instalación tiene actuaciones previstas en el
            plazo elegido.
          </p>
        )}
        {allEquipment.length ? (
          <details className="rounded-xl border border-[var(--border)] p-3">
            <summary className="cursor-pointer text-sm font-medium">
              Añadir otros equipos de la instalación
            </summary>
            <ul className="mt-2 flex flex-col gap-2">
              {allEquipment.map((eq) => (
                <li
                  key={eq.id}
                  className="grid gap-2 text-sm sm:grid-cols-[10rem_1fr]"
                >
                  <span className="font-medium">
                    {eq.code}
                    {eq.location ? (
                      <span className="block text-xs font-normal text-[var(--muted)]">
                        {eq.location}
                      </span>
                    ) : null}
                  </span>
                  <select
                    name="items"
                    defaultValue=""
                    className={CONTROL}
                    aria-label={`Operación para ${eq.code}`}
                  >
                    <option value="">No incluir</option>
                    {actions
                      .filter(
                        (a) =>
                          a.categoryCode === null ||
                          a.categoryCode === eq.categoryCode,
                      )
                      .map((a) => (
                        <option key={a.id} value={`${eq.id}:${a.id}`}>
                          {a.name}
                        </option>
                      ))}
                  </select>
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </fieldset>
      <SubmitButton pendingLabel="Creando…" className="self-start">
        Crear orden de trabajo
      </SubmitButton>
    </form>
  );
}

export function WorkOrderEditForm({
  order,
  technicians,
}: {
  order: {
    id: string;
    serviceType: string;
    scheduledFor: string | null;
    scheduledTime: string | null;
    technicianId: string | null;
    description: string | null;
    notes: string | null;
  };
  technicians: Array<{ id: string; fullName: string }>;
}) {
  const [state, action] = useActionState(updateWorkOrderAction, idle);
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <FormMessage state={state} />
      <input type="hidden" name="id" value={order.id} />
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          label="Tipo de servicio"
          name="serviceType"
          defaultValue={order.serviceType}
        >
          {SERVICE_TYPES.map((t) => (
            <option key={t} value={t}>
              {SERVICE_TYPE_LABELS[t]}
            </option>
          ))}
        </SelectField>
        <SelectField
          label="Técnico asignado"
          name="technicianId"
          defaultValue={order.technicianId ?? ""}
        >
          <option value="">Sin asignar</option>
          {technicians.map((t) => (
            <option key={t.id} value={t.id}>
              {t.fullName}
            </option>
          ))}
        </SelectField>
        <Field
          label="Fecha programada"
          name="scheduledFor"
          type="date"
          defaultValue={order.scheduledFor ?? ""}
        />
        <Field
          label="Hora"
          name="scheduledTime"
          type="time"
          defaultValue={order.scheduledTime ?? ""}
        />
      </div>
      <TextArea
        label="Descripción"
        name="description"
        defaultValue={order.description}
      />
      <TextArea
        label="Notas internas"
        name="notes"
        defaultValue={order.notes}
      />
      <SubmitButton
        variant="secondary"
        pendingLabel="Guardando…"
        className="self-start"
      >
        Guardar cambios
      </SubmitButton>
    </form>
  );
}

const STATUS_BUTTON: Partial<Record<WorkOrderStatus, string>> = {
  in_progress: "Empezar el trabajo",
  completed: "Finalizar la orden",
  canceled: "Cancelar la orden",
  pending: "Volver a pendiente",
};

export function WorkOrderStatusButtons({
  id,
  status,
  canManage,
  pendingItems,
  hasTechnician,
}: {
  id: string;
  status: WorkOrderStatus;
  canManage: boolean;
  pendingItems: number;
  /** Sin técnico asignado la orden no puede pasar a «En curso» (restricción de la BD). */
  hasTechnician: boolean;
}) {
  const [state, action] = useActionState(setWorkOrderStatusAction, idle);
  const next = WORK_ORDER_TRANSITIONS[status].filter(
    (s) =>
      s in STATUS_BUTTON &&
      (canManage || (s !== "canceled" && s !== "pending")) &&
      (s !== "in_progress" || hasTechnician),
  );
  if (!next.length) return null;
  return (
    <div className="flex flex-col gap-2">
      <FormMessage state={state} />
      <div className="flex flex-wrap gap-2">
        {next.map((s) => (
          <form
            key={s}
            action={action}
            className={s === "completed" ? "w-full" : undefined}
            onSubmit={(ev) => {
              if (
                s === "canceled" &&
                !window.confirm("¿Cancelar la orden? No se podrá reabrir.")
              )
                ev.preventDefault();
              if (s === "completed" && pendingItems > 0) {
                window.alert(
                  `Quedan ${pendingItems} equipo(s) sin resultado. Registra el resultado de cada equipo antes de finalizar.`,
                );
                ev.preventDefault();
              }
            }}
          >
            <input type="hidden" name="id" value={id} />
            <input type="hidden" name="status" value={s} />
            {s === "completed" ? (
              <textarea
                name="completionNotes"
                rows={2}
                maxLength={5000}
                placeholder="Notas de cierre (opcional): trabajos realizados, recomendaciones…"
                aria-label="Notas de cierre"
                className={`${CONTROL} mb-2`}
              />
            ) : null}
            <SubmitButton
              variant={
                s === "canceled" || s === "pending" ? "ghost" : "primary"
              }
              pendingLabel="…"
            >
              {STATUS_BUTTON[s]}
            </SubmitButton>
          </form>
        ))}
      </div>
    </div>
  );
}

/** Resultado de un equipo de la orden (pensado para el móvil del técnico). */
export function ItemResultForm({
  itemId,
  today,
  label,
}: {
  itemId: string;
  today: string;
  label: string;
}) {
  const [state, action] = useActionState(recordItemResultAction, idle);
  const e = (n: string) => fieldErrors(state, n);
  return (
    <form
      action={action}
      className="flex flex-col gap-3"
      noValidate
      aria-label={`Resultado de ${label}`}
    >
      <FormMessage state={state} />
      <input type="hidden" name="itemId" value={itemId} />
      <div className="grid gap-3 sm:grid-cols-2">
        <SelectField label="Resultado" name="result" defaultValue="compliant">
          {RESULTS.map((r) => (
            <option key={r} value={r}>
              {RESULT_LABELS[r]}
            </option>
          ))}
        </SelectField>
        <Field
          label="Fecha"
          name="performedOn"
          type="date"
          max={today}
          defaultValue={today}
          errors={e("performedOn")}
        />
      </div>
      <TextArea
        label="Observaciones"
        name="observations"
        errors={e("observations")}
        rows={2}
      />
      <MaterialsRows />
      <IncidentFields />
      <SubmitButton pendingLabel="Guardando…" className="self-start">
        Guardar resultado
      </SubmitButton>
    </form>
  );
}

/** Añadir equipos a una orden abierta (gestores). */
export function AddWorkOrderItemsForm({
  id,
  equipment,
  actions,
}: {
  id: string;
  equipment: Array<{
    id: string;
    code: string;
    categoryCode: string;
    location: string | null;
  }>;
  actions: ActionOption[];
}) {
  const [state, action] = useActionState(addWorkOrderItemsAction, idle);
  return (
    <form action={action} className="flex flex-col gap-3">
      <FormMessage state={state} />
      <input type="hidden" name="id" value={id} />
      <ul className="flex flex-col gap-2">
        {equipment.map((eq) => (
          <li
            key={eq.id}
            className="grid gap-2 text-sm sm:grid-cols-[10rem_1fr]"
          >
            <span className="font-medium">
              {eq.code}
              {eq.location ? (
                <span className="block text-xs font-normal text-[var(--muted)]">
                  {eq.location}
                </span>
              ) : null}
            </span>
            <select
              name="items"
              defaultValue=""
              className={CONTROL}
              aria-label={`Operación para ${eq.code}`}
            >
              <option value="">No incluir</option>
              {actions
                .filter(
                  (a) =>
                    a.categoryCode === null ||
                    a.categoryCode === eq.categoryCode,
                )
                .map((a) => (
                  <option key={a.id} value={`${eq.id}:${a.id}`}>
                    {a.name}
                  </option>
                ))}
            </select>
          </li>
        ))}
      </ul>
      <SubmitButton
        variant="secondary"
        pendingLabel="Añadiendo…"
        className="self-start"
      >
        Añadir a la orden
      </SubmitButton>
    </form>
  );
}

export function RemoveItemButton({ itemId }: { itemId: string }) {
  const [, action] = useActionState(removeWorkOrderItemAction, idle);
  return (
    <form action={action}>
      <input type="hidden" name="itemId" value={itemId} />
      <button
        type="submit"
        className="text-xs font-medium text-[var(--muted)] hover:text-[var(--danger)]"
      >
        Quitar
      </button>
    </form>
  );
}

export function WorkOrderNoteForm({ id }: { id: string }) {
  const [state, action] = useActionState(addWorkOrderNoteAction, idle);
  return (
    <form action={action} className="flex flex-col gap-2">
      <FormMessage state={state} />
      <input type="hidden" name="id" value={id} />
      <TextArea label="Añadir una nota" name="note" rows={2} />
      <SubmitButton
        variant="secondary"
        pendingLabel="Guardando…"
        className="self-start"
      >
        Añadir nota
      </SubmitButton>
    </form>
  );
}

// ================================================================ incidencias

export function IncidentForm({
  installations,
  equipment,
  defaults = {},
  today,
}: {
  installations: Array<{ id: string; label: string }>;
  equipment?: Array<{ id: string; code: string }>;
  defaults?: {
    installationId?: string;
    equipmentId?: string;
    workOrderId?: string;
  };
  today: string;
}) {
  const [state, action] = useActionState(createIncidentAction, idle);
  const e = (n: string) => fieldErrors(state, n);
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <FormMessage state={state} />
      {defaults.workOrderId ? (
        <input type="hidden" name="workOrderId" value={defaults.workOrderId} />
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          label="Instalación"
          name="installationId"
          defaultValue={v(state, "installationId", defaults.installationId)}
          errors={e("installationId")}
          required
        >
          <option value="">Elige la instalación…</option>
          {installations.map((i) => (
            <option key={i.id} value={i.id}>
              {i.label}
            </option>
          ))}
        </SelectField>
        {equipment?.length ? (
          <SelectField
            label="Equipo (opcional)"
            name="equipmentId"
            defaultValue={v(state, "equipmentId", defaults.equipmentId)}
          >
            <option value="">—</option>
            {equipment.map((q) => (
              <option key={q.id} value={q.id}>
                {q.code}
              </option>
            ))}
          </SelectField>
        ) : defaults.equipmentId ? (
          <input
            type="hidden"
            name="equipmentId"
            value={defaults.equipmentId}
          />
        ) : null}
      </div>
      <div className="grid gap-4 sm:grid-cols-[1fr_10rem_10rem]">
        <Field
          label="Incidencia"
          name="title"
          required
          maxLength={200}
          defaultValue={v(state, "title")}
          errors={e("title")}
        />
        <SelectField
          label="Gravedad"
          name="severity"
          defaultValue={v(state, "severity", "medium")}
        >
          {SEVERITIES.map((s) => (
            <option key={s} value={s}>
              {SEVERITY_LABELS[s]}
            </option>
          ))}
        </SelectField>
        <Field
          label="Detectada el"
          name="detectedOn"
          type="date"
          max={today}
          defaultValue={v(state, "detectedOn", today)}
          errors={e("detectedOn")}
        />
      </div>
      <TextArea
        label="Descripción"
        name="description"
        defaultValue={v(state, "description")}
      />
      <SubmitButton pendingLabel="Registrando…" className="self-start">
        Registrar incidencia
      </SubmitButton>
    </form>
  );
}

export function IncidentUpdateForm({
  incident,
}: {
  incident: {
    id: string;
    status: string;
    severity: string;
    resolution: string | null;
  };
}) {
  const [state, action] = useActionState(updateIncidentAction, idle);
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <FormMessage state={state} />
      <input type="hidden" name="id" value={incident.id} />
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          label="Estado"
          name="status"
          defaultValue={incident.status}
        >
          {Object.entries(INCIDENT_STATUS_LABELS).map(([k, l]) => (
            <option key={k} value={k}>
              {l}
            </option>
          ))}
        </SelectField>
        <SelectField
          label="Gravedad"
          name="severity"
          defaultValue={incident.severity}
        >
          {SEVERITIES.map((s) => (
            <option key={s} value={s}>
              {SEVERITY_LABELS[s]}
            </option>
          ))}
        </SelectField>
      </div>
      <TextArea
        label="Resolución"
        name="resolution"
        defaultValue={incident.resolution}
        errors={fieldErrors(state, "resolution")}
      />
      <SubmitButton
        variant="secondary"
        pendingLabel="Guardando…"
        className="self-start"
      >
        Guardar
      </SubmitButton>
    </form>
  );
}

// ======================================================= documentos y fotos

export function DocumentUploader({
  owner,
  ownerId,
  photos,
}: {
  owner: string;
  ownerId: string;
  photos?: boolean;
}) {
  const [state, action] = useActionState(uploadDocumentAction, idle);
  return (
    <form action={action} className="flex flex-col gap-2">
      <FormMessage state={state} />
      <input type="hidden" name="owner" value={owner} />
      <input type="hidden" name="ownerId" value={ownerId} />
      <label className="text-sm font-medium" htmlFor={`up-${ownerId}`}>
        {photos ? "Añadir fotos o documentos" : "Añadir documentos"}
      </label>
      <input
        id={`up-${ownerId}`}
        type="file"
        name="file"
        multiple
        accept={
          photos
            ? "image/jpeg,image/png,image/webp,application/pdf"
            : "application/pdf,image/jpeg,image/png,image/webp"
        }
        {...(photos ? { capture: "environment" as const } : {})}
        className="text-sm"
      />
      <p className="text-xs text-[var(--muted)]">
        PDF, JPG, PNG o WebP; hasta 10 MB cada uno. Se guardan de forma privada.
      </p>
      <SubmitButton
        variant="secondary"
        pendingLabel="Subiendo…"
        className="self-start"
      >
        Subir
      </SubmitButton>
    </form>
  );
}

export function DocumentList({
  docs,
  canDelete,
}: {
  docs: Array<{
    id: string;
    title: string;
    kind: string;
    sizeBytes: number;
    createdAt: string;
  }>;
  canDelete: boolean;
}) {
  const [, action] = useActionState(deleteDocumentAction, idle);
  if (!docs.length)
    return (
      <p className="text-sm text-[var(--muted)]">Todavía no hay archivos.</p>
    );
  return (
    <ul className="flex flex-col divide-y divide-[var(--border)] text-sm">
      {docs.map((d) => (
        <li key={d.id} className="flex items-center justify-between gap-3 py-2">
          <a
            href={`/api/app/documents/${d.id}`}
            className="min-w-0 truncate font-medium text-[var(--accent)]"
            target="_blank"
            rel="noopener"
          >
            {d.kind === "photo" ? "📷 " : "📄 "}
            {d.title}
          </a>
          <span className="flex shrink-0 items-center gap-3 text-xs text-[var(--muted)]">
            {(d.sizeBytes / 1024).toFixed(0)} KB · {d.createdAt}
            {canDelete ? (
              <form action={action}>
                <input type="hidden" name="id" value={d.id} />
                <button type="submit" className="hover:text-[var(--danger)]">
                  Quitar
                </button>
              </form>
            ) : null}
          </span>
        </li>
      ))}
    </ul>
  );
}

// ==================================================================== técnicos

export function TechnicianForm({
  technician,
  members,
}: {
  technician?: {
    id: string;
    fullName: string;
    phone: string | null;
    email: string | null;
    memberId: string | null;
    qualificationNotes: string | null;
    active: boolean;
  };
  members: Array<{ id: string; label: string }>;
}) {
  const [state, action] = useActionState(saveTechnicianAction, idle);
  return (
    <form action={action} className="flex flex-col gap-3" noValidate>
      <FormMessage state={state} />
      {technician ? (
        <input type="hidden" name="id" value={technician.id} />
      ) : null}
      <div className="grid gap-3 sm:grid-cols-3">
        <Field
          label="Nombre y apellidos"
          name="fullName"
          required
          defaultValue={technician?.fullName ?? ""}
          errors={fieldErrors(state, "fullName")}
        />
        <Field
          label="Teléfono"
          name="phone"
          type="tel"
          defaultValue={technician?.phone ?? ""}
          errors={fieldErrors(state, "phone")}
        />
        <Field
          label="Correo"
          name="email"
          type="email"
          defaultValue={technician?.email ?? ""}
          errors={fieldErrors(state, "email")}
        />
      </div>
      <SelectField
        label="Usuario del panel (para ver sus órdenes en el móvil)"
        name="memberId"
        defaultValue={technician?.memberId ?? ""}
      >
        <option value="">Sin usuario</option>
        {members.map((m) => (
          <option key={m.id} value={m.id}>
            {m.label}
          </option>
        ))}
      </SelectField>
      <Field
        label="Notas de cualificación (opcional)"
        name="qualificationNotes"
        maxLength={1000}
        defaultValue={technician?.qualificationNotes ?? ""}
        hint="Lo que tu empresa quiera anotar (p. ej. carné o formación). RevisaYa no lo verifica."
      />
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="active"
          defaultChecked={technician?.active ?? true}
        />
        Activo
      </label>
      <SubmitButton
        variant={technician ? "secondary" : "primary"}
        pendingLabel="Guardando…"
        className="self-start"
      >
        {technician ? "Guardar" : "Añadir técnico"}
      </SubmitButton>
    </form>
  );
}

// ================================================ configuración de operaciones

export function ActionSettingForm({
  action: a,
}: {
  action: {
    id: string;
    enabled: boolean;
    intervalMonths: number | null;
    defaultIntervalMonths: number | null;
  };
}) {
  const [state, act] = useActionState(setActionSettingAction, idle);
  return (
    <form action={act} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="actionTypeId" value={a.id} />
      <label className="flex flex-col gap-1 text-xs">
        Activa
        <select
          name="enabled"
          defaultValue={a.enabled ? "true" : "false"}
          className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 text-sm"
        >
          <option value="true">Sí</option>
          <option value="false">No</option>
        </select>
      </label>
      {a.defaultIntervalMonths ? (
        <label className="flex flex-col gap-1 text-xs">
          Cada (meses)
          <input
            name="intervalMonths"
            type="number"
            min={1}
            max={a.defaultIntervalMonths}
            defaultValue={a.intervalMonths ?? a.defaultIntervalMonths}
            className="w-20 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 text-sm"
          />
        </label>
      ) : null}
      <SubmitButton
        variant="secondary"
        pendingLabel="…"
        className="px-3 py-1.5"
      >
        Guardar
      </SubmitButton>
      {state.status !== "idle" ? (
        <span className="text-xs text-[var(--muted)]">
          {state.status === "success" ? "Guardado" : state.message}
        </span>
      ) : null}
    </form>
  );
}

export function Section({
  title,
  actions,
  children,
  id,
}: {
  title: string;
  actions?: ReactNode;
  children: ReactNode;
  id?: string;
}) {
  return (
    <section
      id={id}
      className="flex flex-col gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">{title}</h2>
        {actions}
      </div>
      {children}
    </section>
  );
}

export { WORK_ORDER_STATUS_LABELS };

// ============================================================ correos al cliente

/** Botón «enviar al cliente» (próxima actuación, parte, incidencia o estado de la instalación). */
export function SendCustomerEmailButton({
  kind,
  id,
  label,
  confirm,
  hasEmail,
}: {
  kind:
    | "action_upcoming"
    | "service_completed"
    | "incident_detected"
    | "report_sent";
  id: string;
  label: string;
  confirm: string;
  hasEmail: boolean;
}) {
  const [state, action] = useActionState(sendPciEmailAction, idle);
  if (!hasEmail)
    return (
      <p className="text-sm text-[var(--muted)]">
        El cliente no tiene correo: añádelo en su ficha para poder enviárselo.
      </p>
    );
  return (
    <form
      action={action}
      className="flex flex-col gap-2"
      onSubmit={(ev) => {
        if (!window.confirm(confirm)) ev.preventDefault();
      }}
    >
      <FormMessage state={state} />
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="id" value={id} />
      <SubmitButton
        variant="secondary"
        pendingLabel="Enviando…"
        className="self-start"
      >
        {label}
      </SubmitButton>
    </form>
  );
}
