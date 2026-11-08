import "server-only";

import { Document, Image, Page, renderToBuffer, StyleSheet, Text, View } from "@react-pdf/renderer";
import { sql } from "kysely";

import { formatDate, formatDateTime } from "@/lib/dates";
import { CATEGORY_SINGULAR, type CategoryCode, RESULT_LABELS, SERVICE_TYPE_LABELS, SEVERITY_LABELS } from "@/lib/pci/labels";
import { withRls } from "@/server/db/client";
import type { ServiceCtx } from "@/server/modules/branches/service";
import { listEquipment } from "@/server/modules/equipment/service";
import { listIncidents } from "@/server/modules/incidents/service";
import { getInstallation } from "@/server/modules/installations/service";
import { getWorkOrder, type WorkOrderDetail } from "@/server/modules/work-orders/service";
import { getObject } from "@/server/storage";

/**
 * PDF de PCI: parte de trabajo de una orden y estado de una instalación.
 * Recogen lo registrado en RevisaYa; NO son certificados oficiales ni actas
 * de inspección (lo dice el propio documento).
 */

const SAFE_COLOR = /^#[0-9a-fA-F]{6}$/;
const DISCLAIMER =
  "Documento generado con RevisaYa a partir de las operaciones registradas por la empresa. No es un certificado oficial ni sustituye a las actas, " +
  "certificados o registros que exija la normativa de protección contra incendios (RD 513/2017).";

const s = StyleSheet.create({
  page: { padding: 36, paddingBottom: 60, fontSize: 9, fontFamily: "Helvetica", color: "#23201e" },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", paddingBottom: 10, borderBottomWidth: 3 },
  logo: { maxHeight: 44, maxWidth: 170, objectFit: "contain" },
  company: { fontSize: 15, fontFamily: "Helvetica-Bold" },
  muted: { color: "#6b6560" },
  title: { fontSize: 16, fontFamily: "Helvetica-Bold", textAlign: "right" },
  boxes: { flexDirection: "row", gap: 12, marginTop: 14 },
  box: { flex: 1, padding: 8, backgroundColor: "#f4f2f0", borderRadius: 3 },
  label: { fontSize: 7.5, color: "#6b6560", marginBottom: 2, textTransform: "uppercase" },
  bold: { fontFamily: "Helvetica-Bold" },
  h2: { fontSize: 11, fontFamily: "Helvetica-Bold", marginTop: 16, marginBottom: 6 },
  th: { flexDirection: "row", borderBottomWidth: 1, paddingBottom: 3, fontFamily: "Helvetica-Bold", fontSize: 8 },
  tr: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: "#d9d4cf", paddingVertical: 4 },
  c1: { width: 70 },
  c2: { width: 90, paddingRight: 4 },
  c3: { flex: 1, paddingRight: 4 },
  c4: { width: 85 },
  c5: { width: 70 },
  signs: { flexDirection: "row", gap: 24, marginTop: 28 },
  sign: { flex: 1, borderTopWidth: 0.5, paddingTop: 4, color: "#6b6560", height: 50 },
  footer: { position: "absolute", left: 36, right: 36, bottom: 22, fontSize: 7, color: "#6b6560" },
});

interface Company {
  name: string;
  legalName: string | null;
  taxId: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  brandColor: string | null;
  logoPath: string | null;
}

async function loadCompany(ctx: ServiceCtx, branchId: string): Promise<Company> {
  return withRls(ctx.auth, async (tx) => {
    const { rows } = await sql<Company>`
      select o.trade_name as name, o.legal_name as "legalName", o.tax_id as "taxId",
             nullif(concat_ws(', ', coalesce(b.address_line1, o.address_line1), coalesce(b.postal_code, o.postal_code), coalesce(b.city, o.city)), '') as address,
             coalesce(b.phone, o.phone) as phone, coalesce(b.email::text, o.email::text) as email,
             o.brand_primary as "brandColor", o.logo_path as "logoPath"
        from organizations o join branches b on b.organization_id = o.id
       where o.id = ${ctx.membership.organizationId} and b.id = ${branchId}
    `.execute(tx);
    return rows[0];
  });
}

async function loadLogo(path: string | null): Promise<{ data: Buffer; format: "png" | "jpg" } | null> {
  if (!path || path.endsWith(".webp")) return null; // el PDF no admite WebP: se muestra el nombre
  const obj = await getObject("org-assets", path).catch(() => null);
  return obj ? { data: obj.body, format: path.endsWith(".png") ? "png" : "jpg" } : null;
}

function Header({ company, logo, title, subtitle }: { company: Company; logo: Awaited<ReturnType<typeof loadLogo>>; title: string; subtitle: string }) {
  const color = company.brandColor && SAFE_COLOR.test(company.brandColor) ? company.brandColor : "#c8102e";
  return (
    <View style={[s.header, { borderBottomColor: color }]}>
      <View>
        {/* eslint-disable-next-line jsx-a11y/alt-text -- @react-pdf/renderer: Image no admite alt */}
        {logo ? <Image src={logo} style={s.logo} /> : <Text style={s.company}>{company.name}</Text>}
        <Text style={s.muted}>{[company.legalName, company.taxId].filter(Boolean).join(" · ")}</Text>
        <Text style={s.muted}>{[company.address, company.phone, company.email].filter(Boolean).join(" · ")}</Text>
      </View>
      <View>
        <Text style={s.title}>{title}</Text>
        <Text style={[s.muted, { textAlign: "right" }]}>{subtitle}</Text>
      </View>
    </View>
  );
}

function Footer() {
  return (
    <View style={s.footer} fixed>
      <Text>{DISCLAIMER}</Text>
      <Text render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`} style={{ textAlign: "right" }} />
    </View>
  );
}

// ------------------------------------------------------------ parte de trabajo

function WorkOrderDocument({ o, company, logo, incidents }: { o: WorkOrderDetail; company: Company; logo: Awaited<ReturnType<typeof loadLogo>>; incidents: Array<{ title: string; severity: string; equipmentCode: string | null; status: string }> }) {
  return (
    <Document title={`Parte de trabajo ${o.number}`} author={company.name}>
      <Page size="A4" style={s.page}>
        <Header company={company} logo={logo} title={`Parte de trabajo ${o.number}`} subtitle={SERVICE_TYPE_LABELS[o.serviceType as keyof typeof SERVICE_TYPE_LABELS] ?? o.serviceType} />
        <View style={s.boxes}>
          <View style={s.box}>
            <Text style={s.label}>Cliente</Text>
            <Text style={s.bold}>{o.customerName}</Text>
            {o.customerEmail ? <Text>{o.customerEmail}</Text> : null}
          </View>
          <View style={s.box}>
            <Text style={s.label}>Instalación</Text>
            <Text style={s.bold}>{o.installationName}</Text>
            <Text>{o.installationAddress}</Text>
          </View>
          <View style={s.box}>
            <Text style={s.label}>Servicio</Text>
            <Text>Programada: {o.scheduledFor ? `${formatDate(o.scheduledFor)}${o.scheduledTime ? ` ${o.scheduledTime}` : ""}` : "—"}</Text>
            <Text>Finalizada: {o.completedAt ? formatDateTime(o.completedAt) : "—"}</Text>
            <Text>Técnico: {o.technicianName ?? "—"}</Text>
          </View>
        </View>
        {o.description ? (
          <>
            <Text style={s.h2}>Trabajo solicitado</Text>
            <Text>{o.description}</Text>
          </>
        ) : null}
        <Text style={s.h2}>Equipos y resultado</Text>
        <View style={s.th}>
          <Text style={s.c1}>Equipo</Text>
          <Text style={s.c2}>Tipo / ubicación</Text>
          <Text style={s.c3}>Operación y observaciones</Text>
          <Text style={s.c4}>Resultado</Text>
        </View>
        {o.itemList.map((it) => (
          <View key={it.id} style={s.tr} wrap={false}>
            <Text style={[s.c1, s.bold]}>{it.equipmentCode}</Text>
            <Text style={s.c2}>
              {it.typeName ?? CATEGORY_SINGULAR[it.categoryCode as CategoryCode] ?? it.categoryCode}
              {it.location ? `\n${it.location}` : ""}
            </Text>
            <Text style={s.c3}>
              {it.actionName}
              {it.observations ? `\n${it.observations}` : ""}
            </Text>
            <Text style={s.c4}>{it.status === "pending" ? "Pendiente" : it.result ? RESULT_LABELS[it.result as keyof typeof RESULT_LABELS] ?? it.result : "No realizado"}</Text>
          </View>
        ))}
        {incidents.length ? (
          <>
            <Text style={s.h2}>Incidencias detectadas</Text>
            {incidents.map((x, i) => (
              <Text key={i}>
                · {x.title}
                {x.equipmentCode ? ` (${x.equipmentCode})` : ""} — gravedad {SEVERITY_LABELS[x.severity as keyof typeof SEVERITY_LABELS]?.toLowerCase() ?? x.severity}
              </Text>
            ))}
          </>
        ) : null}
        {o.completionNotes ? (
          <>
            <Text style={s.h2}>Observaciones de cierre</Text>
            <Text>{o.completionNotes}</Text>
          </>
        ) : null}
        <View style={s.signs} wrap={false}>
          <Text style={s.sign}>Firma del técnico</Text>
          <Text style={s.sign}>Recibí: nombre, DNI y firma del cliente</Text>
        </View>
        <Footer />
      </Page>
    </Document>
  );
}

/** Parte de trabajo de una orden (la RLS decide si el usuario la ve). */
export async function workOrderPdf(ctx: ServiceCtx, id: string): Promise<{ body: Buffer; filename: string; order: WorkOrderDetail } | null> {
  const o = await getWorkOrder(ctx, id);
  if (!o) return null;
  const [company, incidents] = await Promise.all([
    loadCompany(ctx, o.branchId),
    withRls(ctx.auth, (tx) =>
      tx
        .selectFrom("equipment_incidents as x")
        .leftJoin("equipment as e", "e.id", "x.equipment_id")
        .select(["x.title", "x.severity", "x.status", "e.code as equipmentCode"])
        .where("x.work_order_id", "=", id)
        .orderBy("x.created_at")
        .execute(),
    ),
  ]);
  const logo = await loadLogo(company.logoPath);
  const body = await renderToBuffer(<WorkOrderDocument o={o} company={company} logo={logo} incidents={incidents} />);
  return { body, filename: `parte-${o.number}.pdf`, order: o };
}

// ------------------------------------------------------ estado de instalación

interface StatusData {
  installation: NonNullable<Awaited<ReturnType<typeof getInstallation>>>;
  equipment: Awaited<ReturnType<typeof listEquipment>>["rows"];
  incidents: Awaited<ReturnType<typeof listIncidents>>["rows"];
  today: string;
}

function InstallationDocument({ d, company, logo }: { d: StatusData; company: Company; logo: Awaited<ReturnType<typeof loadLogo>> }) {
  const i = d.installation;
  const overdue = d.equipment.filter((e) => e.status === "in_service" && e.nextActionOn && e.nextActionOn < d.today).length;
  return (
    <Document title={`Estado de la instalación ${i.name}`} author={company.name}>
      <Page size="A4" style={s.page}>
        <Header company={company} logo={logo} title="Estado de la instalación" subtitle={`A ${formatDate(d.today)}`} />
        <View style={s.boxes}>
          <View style={s.box}>
            <Text style={s.label}>Cliente</Text>
            <Text style={s.bold}>{i.customerName}</Text>
          </View>
          <View style={s.box}>
            <Text style={s.label}>Instalación</Text>
            <Text style={s.bold}>{i.name}</Text>
            <Text>{[i.addressLine1, i.postalCode, i.city].filter(Boolean).join(", ")}</Text>
          </View>
          <View style={s.box}>
            <Text style={s.label}>Resumen</Text>
            <Text>{d.equipment.length} equipos</Text>
            <Text>{overdue} con actuación vencida</Text>
            <Text>{d.incidents.length} incidencias abiertas</Text>
          </View>
        </View>
        <Text style={s.h2}>Equipos</Text>
        <View style={s.th}>
          <Text style={s.c1}>Equipo</Text>
          <Text style={s.c2}>Tipo</Text>
          <Text style={s.c3}>Ubicación</Text>
          <Text style={s.c5}>Última</Text>
          <Text style={s.c5}>Próxima</Text>
        </View>
        {d.equipment.map((e) => (
          <View key={e.id} style={s.tr} wrap={false}>
            <Text style={[s.c1, s.bold]}>{e.code}</Text>
            <Text style={s.c2}>{e.typeName ?? CATEGORY_SINGULAR[e.categoryCode]}</Text>
            <Text style={s.c3}>{e.location ?? "—"}</Text>
            <Text style={s.c5}>{e.lastActionOn ? formatDate(e.lastActionOn) : "—"}</Text>
            <Text style={[s.c5, e.nextActionOn && e.nextActionOn < d.today ? { color: "#b00020", fontFamily: "Helvetica-Bold" } : {}]}>
              {e.status !== "in_service" ? "Fuera de servicio" : e.nextActionOn ? formatDate(e.nextActionOn) : "—"}
            </Text>
          </View>
        ))}
        {d.incidents.length ? (
          <>
            <Text style={s.h2}>Incidencias abiertas</Text>
            {d.incidents.map((x) => (
              <Text key={x.id}>
                · {formatDate(x.detectedOn)} — {x.title}
                {x.equipmentCode ? ` (${x.equipmentCode})` : ""} — gravedad {SEVERITY_LABELS[x.severity as keyof typeof SEVERITY_LABELS]?.toLowerCase() ?? x.severity}
              </Text>
            ))}
          </>
        ) : null}
        <Footer />
      </Page>
    </Document>
  );
}

/** Estado actual de una instalación: equipos, vencimientos e incidencias abiertas. */
export async function installationStatusPdf(ctx: ServiceCtx, id: string, today: string): Promise<{ body: Buffer; filename: string; installation: StatusData["installation"] } | null> {
  const installation = await getInstallation(ctx, id);
  if (!installation) return null;
  const [equipment, incidents, company] = await Promise.all([
    listEquipment(ctx, { installationId: id, page: 1, pageSize: 2000 }),
    listIncidents(ctx, { installationId: id, status: "open", page: 1, pageSize: 200 }),
    loadCompany(ctx, installation.branchId),
  ]);
  const logo = await loadLogo(company.logoPath);
  const body = await renderToBuffer(<InstallationDocument d={{ installation, equipment: equipment.rows, incidents: incidents.rows, today }} company={company} logo={logo} />);
  const slug = installation.name.toLowerCase().normalize("NFD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "instalacion";
  return { body, filename: `estado-${slug}-${today}.pdf`, installation };
}
