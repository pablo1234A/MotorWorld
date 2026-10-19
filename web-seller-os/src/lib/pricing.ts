export interface PriceInput {
  pages: number;
  complexity: 'simple' | 'media' | 'alta';
  customDesign: boolean;
  animations: 'no' | 'sutiles' | 'avanzadas';
  cms: boolean;
  seo: 'no' | 'basico' | 'local' | 'avanzado';
  booking: boolean;
  ecommerce: boolean;
  copywriting: boolean;
  maintenance: boolean;
  domain: boolean;
  hosting: boolean;
  urgency: 'normal' | 'rapida' | 'urgente';
  hourlyRate: number;
  clientTicket: number; // valor medio de un cliente del negocio
  clientsPerMonth: number; // clientes extra estimados al mes
}

export const defaultPriceInput = (hourlyRate = 35): PriceInput => ({
  pages: 5,
  complexity: 'media',
  customDesign: true,
  animations: 'sutiles',
  cms: false,
  seo: 'basico',
  booking: false,
  ecommerce: false,
  copywriting: false,
  maintenance: true,
  domain: true,
  hosting: true,
  urgency: 'normal',
  hourlyRate,
  clientTicket: 0,
  clientsPerMonth: 0,
});

export interface PriceLine {
  label: string;
  hours: number;
}

export function computePrice(i: PriceInput) {
  const lines: PriceLine[] = [];
  const cx = { simple: 0.8, media: 1, alta: 1.5 }[i.complexity];
  lines.push({ label: 'Estrategia, estructura y briefing', hours: 4 });
  lines.push({ label: `Maquetación de ${i.pages} página${i.pages === 1 ? '' : 's'}`, hours: Math.round((3 + i.pages * 2.5) * cx) });
  if (i.customDesign) lines.push({ label: 'Diseño personalizado', hours: Math.round((6 + i.pages * 1.5) * cx) });
  if (i.animations === 'sutiles') lines.push({ label: 'Animaciones sutiles', hours: 3 });
  if (i.animations === 'avanzadas') lines.push({ label: 'Animaciones avanzadas', hours: 10 });
  if (i.cms) lines.push({ label: 'Gestor de contenidos (CMS)', hours: 6 });
  if (i.seo === 'basico') lines.push({ label: 'SEO básico on-page', hours: 3 });
  if (i.seo === 'local') lines.push({ label: 'SEO local + ficha de Google', hours: 7 });
  if (i.seo === 'avanzado') lines.push({ label: 'SEO avanzado por servicio', hours: 14 });
  if (i.booking) lines.push({ label: 'Reservas / citas online', hours: 6 });
  if (i.ecommerce) lines.push({ label: 'Tienda online', hours: 20 });
  if (i.copywriting) lines.push({ label: 'Redacción de textos (copywriting)', hours: 2 + i.pages * 1.5 });
  lines.push({ label: 'Pruebas, revisiones y publicación', hours: Math.round(3 + i.pages * 0.5) });

  const hours = lines.reduce((s, l) => s + l.hours, 0);
  const urgency = { normal: 1, rapida: 1.2, urgente: 1.4 }[i.urgency];
  const base = hours * i.hourlyRate * urgency;
  const round = (n: number) => Math.max(50, Math.round(n / 50) * 50);
  const recommended = round(base);
  const min = round(base * 0.78);
  const premium = round(base * 1.55 + (i.maintenance ? 0 : 0));

  const monthly = (i.maintenance ? Math.round(Math.max(25, recommended * 0.04) / 5) * 5 : 0) + (i.hosting ? 10 : 0);
  const yearlyDomain = i.domain ? 15 : 0;
  const roiMonths = i.clientTicket > 0 && i.clientsPerMonth > 0 ? recommended / (i.clientTicket * i.clientsPerMonth) : null;
  return { lines, hours, recommended, min, premium, monthly, yearlyDomain, urgency, roiMonths };
}

export function priceReasons(i: PriceInput, r: ReturnType<typeof computePrice>): string[] {
  const out: string[] = [];
  out.push(`El proyecto requiere unas ${Math.round(r.hours)} horas de trabajo profesional. Cobrar menos de ${r.min} € significa trabajar por debajo de tu tarifa.`);
  if (r.roiMonths != null) {
    const months = r.roiMonths;
    out.push(
      months <= 1
        ? `Con ${i.clientsPerMonth} cliente(s) extra al mes de ${i.clientTicket} €, la web se paga en menos de un mes. Todo lo demás es beneficio.`
        : `Con ${i.clientsPerMonth} cliente(s) extra al mes de ${i.clientTicket} €, la web se paga en ${months.toFixed(1)} meses y sigue generando durante años.`,
    );
  } else out.push('Rellena el ticket medio del cliente y los clientes extra al mes para mostrar el retorno de la inversión.');
  if (i.customDesign) out.push('Diseño a medida, no una plantilla: transmite la calidad real del negocio y le diferencia de la competencia.');
  if (i.seo !== 'no') out.push('Incluye SEO: la web no solo se ve bien, también trae visitas nuevas desde Google.');
  if (i.booking || i.ecommerce) out.push('Incluye un sistema que genera ingresos directos (reservas o ventas online), no solo una tarjeta de visita.');
  if (i.maintenance) out.push(`El mantenimiento (${r.monthly} €/mes) le quita al cliente preocupaciones técnicas y te da ingresos recurrentes.`);
  if (i.urgency !== 'normal') out.push('La entrega acelerada implica priorizar este proyecto sobre otros: es razonable cobrar un recargo.');
  out.push('Presenta las tres opciones empezando por la premium: el precio recomendado se percibirá como la opción sensata.');
  return out;
}
