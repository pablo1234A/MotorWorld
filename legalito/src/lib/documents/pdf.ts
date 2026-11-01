import { PDFDocument, StandardFonts, rgb, degrees, type PDFFont, type PDFPage } from "pdf-lib";
import type { RenderedBlock, RenderedDocument } from "./engine";
import { demoNotice, type OutputMeta } from "./html";

/**
 * Generación de PDF en servidor con pdf-lib (JavaScript puro, sin navegador
 * ni dependencias nativas: funciona en cualquier entorno Node.js).
 */
const PAGE = { width: 595.28, height: 841.89 }; // A4
const MARGIN = { top: 64, bottom: 64, left: 56, right: 56 };
const CONTENT_WIDTH = PAGE.width - MARGIN.left - MARGIN.right;

const COLOR = {
  primary: rgb(0x1f / 255, 0x3a / 255, 0x5f / 255),
  secondary: rgb(0x2f / 255, 0x5d / 255, 0x8c / 255),
  sand: rgb(0xf4 / 255, 0xf1 / 255, 0xea / 255),
  text: rgb(0.11, 0.14, 0.2),
  muted: rgb(0.42, 0.46, 0.53),
  border: rgb(0.85, 0.87, 0.9),
  warnBg: rgb(1, 0.96, 0.9),
  warnText: rgb(0.48, 0.29, 0),
  watermark: rgb(0.85, 0.35, 0.2),
};

interface Fonts {
  regular: PDFFont;
  bold: PDFFont;
}

class Layout {
  page!: PDFPage;
  y = 0;
  pages: PDFPage[] = [];
  private supported = new Map<string, boolean>();

  constructor(
    private pdf: PDFDocument,
    private fonts: Fonts,
  ) {
    this.newPage();
  }

  newPage() {
    this.page = this.pdf.addPage([PAGE.width, PAGE.height]);
    this.pages.push(this.page);
    this.y = PAGE.height - MARGIN.top;
  }

  ensure(height: number) {
    if (this.y - height < MARGIN.bottom) this.newPage();
  }

  /** Sustituye los caracteres que la fuente estándar (WinAnsi) no puede codificar. */
  sanitize(text: string, font: PDFFont): string {
    let out = "";
    for (const ch of text.normalize("NFC")) {
      let ok = this.supported.get(ch);
      if (ok === undefined) {
        try {
          font.encodeText(ch);
          ok = true;
        } catch {
          ok = false;
        }
        this.supported.set(ch, ok);
      }
      out += ok ? ch : ch === " " ? " " : "?";
    }
    return out;
  }

  wrap(text: string, font: PDFFont, size: number, width: number): string[] {
    const clean = this.sanitize(text, font);
    const lines: string[] = [];
    for (const paragraph of clean.split("\n")) {
      let line = "";
      for (const word of paragraph.split(/\s+/).filter(Boolean)) {
        const candidate = line ? `${line} ${word}` : word;
        if (font.widthOfTextAtSize(candidate, size) <= width) {
          line = candidate;
          continue;
        }
        if (line) lines.push(line);
        // Palabras más largas que la línea (URLs): se parten por caracteres.
        if (font.widthOfTextAtSize(word, size) > width) {
          let chunk = "";
          for (const ch of word) {
            if (font.widthOfTextAtSize(chunk + ch, size) > width) {
              lines.push(chunk);
              chunk = ch;
            } else chunk += ch;
          }
          line = chunk;
        } else line = word;
      }
      lines.push(line);
    }
    return lines;
  }

  text(text: string, opts: { font?: PDFFont; size?: number; color?: ReturnType<typeof rgb>; indent?: number; gapAfter?: number; lineHeight?: number } = {}) {
    const font = opts.font ?? this.fonts.regular;
    const size = opts.size ?? 10.5;
    const lh = opts.lineHeight ?? size * 1.5;
    const indent = opts.indent ?? 0;
    for (const line of this.wrap(text, font, size, CONTENT_WIDTH - indent)) {
      this.ensure(lh);
      this.page.drawText(line, { x: MARGIN.left + indent, y: this.y - size, size, font, color: opts.color ?? COLOR.text });
      this.y -= lh;
    }
    this.y -= opts.gapAfter ?? 6;
  }
}

/**
 * Anchos de columna: cada columna recibe al menos el ancho de su palabra más
 * larga (para no partir palabras) y el espacio restante se reparte según la
 * longitud media del contenido.
 */
function columnWidths(columns: string[], rows: string[][], fonts: Fonts, size: number, pad: number): number[] {
  const longestWord = (text: string, font: PDFFont) =>
    Math.max(0, ...text.split(/\s+/).filter(Boolean).map((w) => {
      try {
        return font.widthOfTextAtSize(w, size);
      } catch {
        return w.length * size * 0.6;
      }
    }));
  const cap = CONTENT_WIDTH * 0.34;
  const mins = columns.map((c, i) =>
    Math.min(cap, Math.max(longestWord(c, fonts.bold), ...rows.map((r) => longestWord(r[i] ?? "", fonts.regular))) + pad * 2 + 1),
  );
  const minTotal = mins.reduce((a, b) => a + b, 0);
  if (minTotal >= CONTENT_WIDTH) return mins.map((m) => (m / minTotal) * CONTENT_WIDTH);
  const weights = columns.map((c, i) => {
    const avg = rows.reduce((sum, r) => sum + (r[i]?.length ?? 0), c.length) / (rows.length + 1);
    return Math.min(Math.max(avg, 4), 80);
  });
  const wTotal = weights.reduce((a, b) => a + b, 0);
  const extra = CONTENT_WIDTH - minTotal;
  return mins.map((m, i) => m + (weights[i] / wTotal) * extra);
}

function drawTable(l: Layout, fonts: Fonts, columns: string[], rows: string[][]) {
  const size = 8.5;
  const lh = size * 1.4;
  const pad = 5;
  const widths = columnWidths(columns, rows, fonts, size, pad);

  const drawRow = (cells: string[], header: boolean) => {
    const font = header ? fonts.bold : fonts.regular;
    const wrapped = cells.map((c, i) => l.wrap(c, font, size, widths[i] - pad * 2));
    const height = Math.max(...wrapped.map((w) => w.length)) * lh + pad * 2;
    if (l.y - height < MARGIN.bottom) {
      l.newPage();
      if (!header) drawRow(columns, true);
    }
    let x = MARGIN.left;
    wrapped.forEach((lines, i) => {
      l.page.drawRectangle({
        x,
        y: l.y - height,
        width: widths[i],
        height,
        borderColor: COLOR.border,
        borderWidth: 0.6,
        color: header ? COLOR.sand : undefined,
      });
      lines.forEach((line, j) => {
        l.page.drawText(line, {
          x: x + pad,
          y: l.y - pad - size - j * lh + 1,
          size,
          font,
          color: header ? COLOR.primary : COLOR.text,
        });
      });
      x += widths[i];
    });
    l.y -= height;
  };

  drawRow(columns, true);
  rows.forEach((r) => drawRow(r, false));
  l.y -= 10;
}

function drawBlock(l: Layout, fonts: Fonts, b: RenderedBlock) {
  switch (b.type) {
    case "paragraph":
      l.text(b.text, { gapAfter: 8 });
      return;
    case "heading":
      l.ensure(30);
      l.text(b.text, { font: fonts.bold, size: 11, gapAfter: 4 });
      return;
    case "callout":
      l.text(b.text, { color: b.tone === "warning" ? COLOR.warnText : COLOR.secondary, indent: 10, gapAfter: 8 });
      return;
    case "list":
      b.items.forEach((item, i) => {
        const marker = b.ordered ? `${i + 1}.` : "•";
        const size = 10.5;
        const lines = l.wrap(item, fonts.regular, size, CONTENT_WIDTH - 16);
        lines.forEach((line, j) => {
          l.ensure(size * 1.5);
          if (j === 0) l.page.drawText(marker, { x: MARGIN.left + 2, y: l.y - size, size, font: fonts.regular, color: COLOR.secondary });
          l.page.drawText(line, { x: MARGIN.left + 16, y: l.y - size, size, font: fonts.regular, color: COLOR.text });
          l.y -= size * 1.5;
        });
        l.y -= 2;
      });
      l.y -= 6;
      return;
    case "table":
      drawTable(l, fonts, b.columns, b.rows);
      return;
  }
}

export async function renderPdf(doc: RenderedDocument, meta: OutputMeta): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`${doc.title} · ${meta.ownerName}`);
  pdf.setAuthor(meta.ownerName);
  pdf.setSubject(meta.documentTypeName);
  pdf.setCreator("Legalito");
  pdf.setProducer("Legalito");
  pdf.setLanguage("es-ES");
  pdf.setCreationDate(meta.generatedAt);
  pdf.setModificationDate(meta.generatedAt);

  const fonts: Fonts = {
    regular: await pdf.embedFont(StandardFonts.Helvetica),
    bold: await pdf.embedFont(StandardFonts.HelveticaBold),
  };
  const l = new Layout(pdf, fonts);

  const notice = demoNotice(meta);
  if (notice) {
    const lines = l.wrap(notice, fonts.bold, 9, CONTENT_WIDTH - 20);
    const h = lines.length * 13 + 16;
    l.page.drawRectangle({ x: MARGIN.left, y: l.y - h, width: CONTENT_WIDTH, height: h, color: COLOR.warnBg, borderColor: COLOR.watermark, borderWidth: 0.8 });
    lines.forEach((line, i) => l.page.drawText(line, { x: MARGIN.left + 10, y: l.y - 18 - i * 13, size: 9, font: fonts.bold, color: COLOR.warnText }));
    l.y -= h + 18;
  }

  l.text(doc.title, { font: fonts.bold, size: 22, color: COLOR.primary, lineHeight: 28, gapAfter: 4 });
  l.text(meta.ownerName, { size: 10, color: COLOR.muted, gapAfter: 14 });
  l.page.drawLine({ start: { x: MARGIN.left, y: l.y }, end: { x: PAGE.width - MARGIN.right, y: l.y }, thickness: 0.8, color: COLOR.border });
  l.y -= 16;

  doc.intro.forEach((b) => drawBlock(l, fonts, b));
  for (const s of doc.sections) {
    l.ensure(48);
    l.y -= 6;
    l.text(`${s.number}. ${s.heading}`, { font: fonts.bold, size: 13, color: COLOR.primary, lineHeight: 18, gapAfter: 6 });
    s.blocks.forEach((b) => drawBlock(l, fonts, b));
  }
  doc.closing.forEach((b) => drawBlock(l, fonts, b));

  // Pie de página, numeración y marca de agua.
  const total = l.pages.length;
  const footer = l.sanitize(`${doc.title} · ${meta.ownerName}`, fonts.regular);
  const trace = l.sanitize(`Generado con Legalito · Plantilla ${meta.templateVersionLabel}`, fonts.regular);
  l.pages.forEach((page, i) => {
    page.drawLine({ start: { x: MARGIN.left, y: 44 }, end: { x: PAGE.width - MARGIN.right, y: 44 }, thickness: 0.5, color: COLOR.border });
    page.drawText(footer.length > 90 ? `${footer.slice(0, 87)}...` : footer, { x: MARGIN.left, y: 30, size: 8, font: fonts.regular, color: COLOR.muted });
    const label = `Página ${i + 1} de ${total}`;
    page.drawText(label, {
      x: PAGE.width - MARGIN.right - fonts.regular.widthOfTextAtSize(label, 8),
      y: 30,
      size: 8,
      font: fonts.regular,
      color: COLOR.muted,
    });
    page.drawText(trace, { x: MARGIN.left, y: 19, size: 6.5, font: fonts.regular, color: COLOR.muted });
    if (meta.isDemo || meta.isPreview) {
      const mark = l.sanitize(meta.isDemo ? "DEMOSTRACIÓN · NO VÁLIDO" : "VISTA PREVIA", fonts.bold);
      const size = 38;
      const angle = 40;
      const w = fonts.bold.widthOfTextAtSize(mark, size);
      const rad = (angle * Math.PI) / 180;
      page.drawText(mark, {
        x: PAGE.width / 2 - (w / 2) * Math.cos(rad) + (size / 3) * Math.sin(rad),
        y: PAGE.height / 2 - (w / 2) * Math.sin(rad) - (size / 3) * Math.cos(rad),
        size,
        font: fonts.bold,
        color: COLOR.watermark,
        opacity: 0.1,
        rotate: degrees(angle),
      });
    }
  });

  return pdf.save();
}
