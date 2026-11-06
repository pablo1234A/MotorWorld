import "server-only";

import { Document, Image, Page, renderToBuffer, StyleSheet, Text, View } from "@react-pdf/renderer";

import { formatDate } from "@/lib/dates";
import { formatEuro, formatQuantity, quoteTotals } from "@/lib/quotes/money";
import type { QuoteDetail, QuoteSnapshot } from "@/server/modules/quotes/service";
import { getObject } from "@/server/storage";

/**
 * PDF del presupuesto (PDF §6: "presupuestos básicos en PDF, con IVA"). Con
 * los datos congelados al emitir. No es una factura: lo indica el propio
 * documento. Los borradores llevan la marca "BORRADOR".
 */

const SAFE_COLOR = /^#[0-9a-fA-F]{6}$/;

const s = StyleSheet.create({
  page: { padding: 40, fontSize: 9.5, fontFamily: "Helvetica", color: "#14161a" },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", paddingBottom: 12, borderBottomWidth: 3 },
  logo: { maxHeight: 48, maxWidth: 180, objectFit: "contain" },
  workshopName: { fontSize: 16, fontFamily: "Helvetica-Bold" },
  muted: { color: "#5b616e" },
  title: { fontSize: 18, fontFamily: "Helvetica-Bold", textAlign: "right" },
  boxes: { flexDirection: "row", gap: 16, marginTop: 18 },
  box: { flex: 1, padding: 10, backgroundColor: "#f4f5f7", borderRadius: 4 },
  label: { fontSize: 8, color: "#5b616e", marginBottom: 3, textTransform: "uppercase" },
  bold: { fontFamily: "Helvetica-Bold" },
  table: { marginTop: 18 },
  th: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#14161a", paddingBottom: 4, fontFamily: "Helvetica-Bold", fontSize: 8.5 },
  tr: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: "#d9dce1", paddingVertical: 5 },
  cDesc: { flex: 1, paddingRight: 6 },
  cQty: { width: 50, textAlign: "right" },
  cPrice: { width: 70, textAlign: "right" },
  cTax: { width: 40, textAlign: "right" },
  cTotal: { width: 75, textAlign: "right" },
  totals: { marginTop: 12, marginLeft: "auto", width: 230 },
  totalRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 2 },
  grand: { flexDirection: "row", justifyContent: "space-between", paddingTop: 6, marginTop: 4, borderTopWidth: 1, fontSize: 12, fontFamily: "Helvetica-Bold" },
  notes: { marginTop: 18 },
  footer: { position: "absolute", bottom: 28, left: 40, right: 40, fontSize: 7.5, color: "#5b616e", textAlign: "center" },
  watermark: { position: "absolute", top: 330, left: 90, fontSize: 90, color: "#e6e8ec", transform: "rotate(-30deg)", fontFamily: "Helvetica-Bold" },
});

function QuoteDocument({ q, snap, logo }: { q: QuoteDetail; snap: QuoteSnapshot; logo: { data: Buffer; format: "png" | "jpg" } | null }) {
  const color = snap.workshop.brandColor && SAFE_COLOR.test(snap.workshop.brandColor) ? snap.workshop.brandColor : "#1f4fd8";
  const totals = quoteTotals(q.items.map((i) => ({ quantity: i.quantity, unitPrice: i.unitPrice, taxRate: Number(i.taxRate) })));
  const w = snap.workshop;
  return (
    <Document title={`Presupuesto ${q.number}`} author={w.name} creator="RevisaYa" producer="RevisaYa" language="es-ES">
      <Page size="A4" style={s.page}>
        {q.status === "draft" ? <Text style={s.watermark}>BORRADOR</Text> : null}
        <View style={[s.header, { borderBottomColor: color }]}>
          <View>
            {/* eslint-disable-next-line jsx-a11y/alt-text -- @react-pdf/renderer: Image no admite alt */}
            {logo ? <Image src={logo} style={s.logo} /> : <Text style={s.workshopName}>{w.name}</Text>}
            <Text style={[s.muted, { marginTop: 6 }]}>{w.legalName ?? w.name}</Text>
            {w.taxId ? <Text style={s.muted}>NIF: {w.taxId}</Text> : null}
            {w.address ? <Text style={s.muted}>{w.address}</Text> : null}
            {w.postalCity ? <Text style={s.muted}>{w.postalCity}</Text> : null}
            {[w.phone, w.email].filter(Boolean).length ? <Text style={s.muted}>{[w.phone, w.email].filter(Boolean).join(" · ")}</Text> : null}
          </View>
          <View>
            <Text style={s.title}>PRESUPUESTO</Text>
            <Text style={{ textAlign: "right", marginTop: 4 }}>
              Nº <Text style={s.bold}>{q.number}</Text>
            </Text>
            <Text style={{ textAlign: "right" }}>Fecha: {formatDate(q.issueDate)}</Text>
            <Text style={{ textAlign: "right" }}>Válido hasta: {formatDate(q.validUntil)}</Text>
          </View>
        </View>

        <View style={s.boxes}>
          <View style={s.box}>
            <Text style={s.label}>Cliente</Text>
            <Text style={s.bold}>{snap.customer.name}</Text>
            {snap.customer.email ? <Text>{snap.customer.email}</Text> : null}
            {snap.customer.phone ? <Text>{snap.customer.phone}</Text> : null}
          </View>
          <View style={s.box}>
            <Text style={s.label}>Vehículo</Text>
            {snap.vehicle ? (
              <>
                <Text style={s.bold}>{snap.vehicle.plate}</Text>
                {snap.vehicle.name ? <Text>{snap.vehicle.name}</Text> : null}
                {snap.vehicle.km != null ? <Text>{snap.vehicle.km.toLocaleString("es-ES")} km</Text> : null}
              </>
            ) : (
              <Text style={s.muted}>Sin vehículo</Text>
            )}
          </View>
        </View>

        <View style={s.table}>
          <View style={s.th} fixed>
            <Text style={s.cDesc}>Concepto</Text>
            <Text style={s.cQty}>Cant.</Text>
            <Text style={s.cPrice}>Precio</Text>
            <Text style={s.cTax}>IVA</Text>
            <Text style={s.cTotal}>Importe</Text>
          </View>
          {q.items.map((i) => (
            <View key={i.position} style={s.tr} wrap={false}>
              <Text style={s.cDesc}>{i.description}</Text>
              <Text style={s.cQty}>{formatQuantity(i.quantity)}</Text>
              <Text style={s.cPrice}>{formatEuro(i.unitPrice)}</Text>
              <Text style={s.cTax}>{Number(i.taxRate)} %</Text>
              <Text style={s.cTotal}>{formatEuro(i.lineSubtotal)}</Text>
            </View>
          ))}
        </View>

        <View style={s.totals} wrap={false}>
          <View style={s.totalRow}>
            <Text>Base imponible</Text>
            <Text>{formatEuro(q.subtotal)}</Text>
          </View>
          {totals.byRate.map((r) => (
            <View key={r.rate} style={s.totalRow}>
              <Text>
                IVA {r.rate} % sobre {formatEuro(r.base)}
              </Text>
              <Text>{formatEuro(r.tax)}</Text>
            </View>
          ))}
          <View style={[s.grand, { borderTopColor: color }]}>
            <Text>Total</Text>
            <Text>{formatEuro(q.total)}</Text>
          </View>
        </View>

        {q.notes ? (
          <View style={s.notes}>
            <Text style={s.label}>Observaciones</Text>
            <Text>{q.notes}</Text>
          </View>
        ) : null}

        <Text style={s.footer} fixed render={({ pageNumber, totalPages }) => `Presupuesto ${q.number} · No es una factura · Página ${pageNumber} de ${totalPages}`} />
      </Page>
    </Document>
  );
}

async function loadLogo(path: string | null): Promise<{ data: Buffer; format: "png" | "jpg" } | null> {
  if (!path || path.endsWith(".webp")) return null; // el PDF no admite WebP: se muestra el nombre
  const obj = await getObject("org-assets", path).catch(() => null);
  if (!obj) return null;
  return { data: obj.body, format: path.endsWith(".png") ? "png" : "jpg" };
}

export async function renderQuotePdf(q: QuoteDetail, snapshot: QuoteSnapshot): Promise<Buffer> {
  const logo = await loadLogo(snapshot.workshop.logoPath);
  return renderToBuffer(<QuoteDocument q={q} snap={snapshot} logo={logo} />);
}
