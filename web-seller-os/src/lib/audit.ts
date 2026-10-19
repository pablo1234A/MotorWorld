import type { AuditAnswer, PsiSummary } from '../data/types';
import { PROBLEM_BY_ID, fillTemplate, sectorOutcome } from '../content/problems';
import { lowerFirst } from './format';

export interface AuditCheck {
  id: string;
  area: string;
  question: string;
  hint: string;
  /** problema del catálogo que se activa si la respuesta es "mal" o "regular" */
  problem: string;
  weight: number;
}

export const AUDIT_AREAS = ['Diseño', 'Móvil', 'Velocidad', 'Confianza', 'Conversión', 'CTA', 'Contacto', 'Estructura', 'Textos', 'Imágenes', 'Redes sociales', 'SEO básico'];

export const AUDIT_CHECKS: AuditCheck[] = [
  { id: 'd1', area: 'Diseño', question: '¿El diseño parece actual (últimos 3 años)?', hint: 'Tipografías, colores y estilo coherentes con hoy.', problem: 'outdated_design', weight: 7 },
  { id: 'd2', area: 'Diseño', question: '¿Transmite la calidad real del negocio?', hint: 'Compárala con su Instagram o el local.', problem: 'outdated_design', weight: 5 },
  { id: 'm1', area: 'Móvil', question: '¿Se ve bien y se lee cómodo en móvil?', hint: 'Ábrela en tu móvil: textos, márgenes, menú.', problem: 'bad_mobile', weight: 9 },
  { id: 'm2', area: 'Móvil', question: '¿Los botones se pulsan fácil con el dedo?', hint: 'Botones de al menos 44 px, sin elementos pegados.', problem: 'bad_mobile', weight: 6 },
  { id: 'v1', area: 'Velocidad', question: '¿Carga en menos de 3 segundos en móvil?', hint: 'Usa el análisis automático o cronométralo con 4G.', problem: 'slow', weight: 8 },
  { id: 'c1', area: 'Confianza', question: '¿Muestra reseñas, testimonios o casos reales?', hint: 'Reseñas de Google, logos de clientes, antes/después.', problem: 'no_trust', weight: 8 },
  { id: 'c2', area: 'Confianza', question: '¿Tiene HTTPS (candado) y aviso legal?', hint: 'Si el navegador dice "No seguro", es un no.', problem: 'no_https', weight: 6 },
  { id: 'cv1', area: 'Conversión', question: '¿Queda claro en 5 segundos qué ofrece y para quién?', hint: 'Lee solo el primer pantallazo.', problem: 'weak_copy', weight: 8 },
  { id: 'cv2', area: 'Conversión', question: '¿Permite reservar, pedir cita o comprar online?', hint: 'Si el negocio lo necesita y no existe, es un no.', problem: 'no_booking', weight: 8 },
  { id: 'cta1', area: 'CTA', question: '¿El botón de acción principal es visible sin hacer scroll?', hint: '"Reservar", "Pedir cita", "Llamar", "Presupuesto".', problem: 'weak_cta', weight: 9 },
  { id: 'cta2', area: 'CTA', question: '¿El CTA se repite a lo largo de la página?', hint: 'Al menos en portada, mitad y final.', problem: 'weak_cta', weight: 5 },
  { id: 'ct1', area: 'Contacto', question: '¿Tiene botón de WhatsApp o click-to-call?', hint: 'En móvil debería ser un toque.', problem: 'no_whatsapp', weight: 7 },
  { id: 'ct2', area: 'Contacto', question: '¿Hay formulario de contacto corto?', hint: 'Máximo 3-4 campos.', problem: 'no_form', weight: 5 },
  { id: 'e1', area: 'Estructura', question: '¿Se encuentra rápido servicios, precios y ubicación?', hint: 'Menú claro, máximo 5-6 opciones.', problem: 'bad_structure', weight: 6 },
  { id: 't1', area: 'Textos', question: '¿Los textos hablan de beneficios para el cliente?', hint: '¿Responden a "qué gano yo"?', problem: 'weak_copy', weight: 6 },
  { id: 't2', area: 'Textos', question: '¿La información está actualizada?', hint: 'Horarios, precios, año del copyright, novedades.', problem: 'outdated_info', weight: 5 },
  { id: 'i1', area: 'Imágenes', question: '¿Usa fotos reales y de buena calidad?', hint: 'Local, equipo, trabajos. Sin bancos de imágenes genéricos.', problem: 'bad_images', weight: 5 },
  { id: 'r1', area: 'Redes sociales', question: '¿Enlaza y aprovecha sus redes sociales?', hint: 'Iconos visibles, feed o enlaces cruzados.', problem: 'no_social', weight: 3 },
  { id: 's1', area: 'SEO básico', question: '¿Aparece en Google buscando "sector + ciudad"?', hint: 'Búscalo en modo incógnito.', problem: 'bad_seo', weight: 7 },
  { id: 's2', area: 'SEO básico', question: '¿Tiene títulos y descripciones correctos?', hint: 'El título de la pestaña debe decir qué y dónde.', problem: 'bad_seo', weight: 4 },
  { id: 's3', area: 'SEO básico', question: '¿Tiene analítica instalada?', hint: 'Google Analytics, Search Console, Meta Pixel…', problem: 'no_analytics', weight: 2 },
];

const VALUE: Record<AuditAnswer, number> = { ok: 1, regular: 0.5, mal: 0, na: -1 };

export function auditScore(answers: Record<string, AuditAnswer>): number | null {
  let sum = 0;
  let w = 0;
  for (const c of AUDIT_CHECKS) {
    const a = answers[c.id];
    if (!a || a === 'na') continue;
    sum += VALUE[a] * c.weight;
    w += c.weight;
  }
  if (w === 0) return null;
  return Math.round((sum / w) * 100);
}

export function answeredCount(answers: Record<string, AuditAnswer>) {
  return AUDIT_CHECKS.filter((c) => answers[c.id]).length;
}

export interface AuditFinding {
  problem: string;
  label: string;
  impact: number;
  argument: string;
  fix: string;
  severity: 'crítico' | 'alto' | 'medio';
}

/** Problemas ordenados por impacto comercial. */
export function auditFindings(answers: Record<string, AuditAnswer>, vars: { negocio: string; sector: string; ciudad: string }): AuditFinding[] {
  const map = new Map<string, number>();
  for (const c of AUDIT_CHECKS) {
    const a = answers[c.id];
    if (a !== 'mal' && a !== 'regular') continue;
    const impact = c.weight * (a === 'mal' ? 1 : 0.5);
    map.set(c.problem, (map.get(c.problem) ?? 0) + impact);
  }
  return [...map.entries()]
    .map(([id, impact]) => {
      const p = PROBLEM_BY_ID[id];
      return {
        problem: id,
        label: p.label,
        impact,
        argument: fillTemplate(p.argument, vars),
        fix: p.fix,
        severity: (impact >= 8 ? 'crítico' : impact >= 5 ? 'alto' : 'medio') as AuditFinding['severity'],
      };
    })
    .sort((a, b) => b.impact - a.impact);
}

export function salesPitch(findings: AuditFinding[], score: number, vars: { negocio: string; sector: string; ciudad: string }): string {
  const out = sectorOutcome(vars.sector);
  const n = vars.negocio || 'tu negocio';
  if (findings.length === 0)
    return `He revisado la web de ${n} y está en buen estado (${score}/100). Aquí el argumento no es arreglar, sino crecer: campañas, SEO local por servicio o un sistema de ${out.unit} online. Pregunta qué objetivo tienen este año.`;
  const top = findings.slice(0, 3);
  const [a, b, c] = top;
  let s = `He estado revisando la web de ${n} con calma y le he puesto una nota de ${score} sobre 100. No es para criticar: hay cosas bien hechas. Pero he encontrado ${findings.length === 1 ? 'un punto' : `${findings.length} puntos`} que hacen que gente interesada se vaya sin ${out.verb}.\n\n`;
  s += `El más importante: ${lowerFirst(a.label)}. ${a.argument}\n\n`;
  if (b) s += `Además, ${lowerFirst(b.label)}${c ? ` y ${lowerFirst(c.label)}` : ''}. Cada uno de estos detalles resta ${out.unit} cada semana.\n\n`;
  s += `La buena noticia es que todo tiene solución y no hace falta empezar de cero. Mi propuesta es centrarnos primero en ${lowerFirst(a.fix)} El objetivo: ${out.hook}.\n\n¿Te parece si te enseño en 15 minutos cómo quedaría?`;
  return s;
}

/** Google PageSpeed Insights (API pública, admite CORS). La clave es opcional pero evita límites. */
export async function runPsi(url: string, key?: string): Promise<PsiSummary> {
  const params = new URLSearchParams({ url, strategy: 'mobile' });
  ['performance', 'seo', 'accessibility', 'best-practices'].forEach((c) => params.append('category', c));
  if (key) params.set('key', key);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 60000);
  try {
    const r = await fetch(`https://www.googleapis.com/pagespeedonline/v5/runPagespeed?${params}`, { signal: ctrl.signal });
    if (!r.ok) {
      const j = await r.json().catch(() => null);
      throw new Error(j?.error?.message || `Error ${r.status}`);
    }
    const j = await r.json();
    const cats = j?.lighthouseResult?.categories ?? {};
    const audits = j?.lighthouseResult?.audits ?? {};
    const sc = (k: string) => (cats[k]?.score != null ? Math.round(cats[k].score * 100) : null);
    return {
      performance: sc('performance'),
      seo: sc('seo'),
      accessibility: sc('accessibility'),
      bestPractices: sc('best-practices'),
      lcp: audits['largest-contentful-paint']?.displayValue ?? null,
      cls: audits['cumulative-layout-shift']?.displayValue ?? null,
      fetchedAt: new Date().toISOString(),
    };
  } finally {
    clearTimeout(timer);
  }
}

/** Traduce el resultado técnico a respuestas del checklist (solo lo que se puede medir). */
export function answersFromPsi(psi: PsiSummary, url: string): Record<string, AuditAnswer> {
  const r: Record<string, AuditAnswer> = {};
  const grade = (v: number | null, good: number, ok: number): AuditAnswer | undefined => (v == null ? undefined : v >= good ? 'ok' : v >= ok ? 'regular' : 'mal');
  const v = grade(psi.performance, 85, 50);
  if (v) r.v1 = v;
  const s = grade(psi.seo, 90, 70);
  if (s) r.s2 = s;
  const a = grade(psi.accessibility, 85, 65);
  if (a) r.m2 = a;
  if (/^https:\/\//i.test(url)) {
    const bp = grade(psi.bestPractices, 80, 60);
    r.c2 = bp === 'mal' ? 'regular' : 'ok';
  } else r.c2 = 'mal';
  return r;
}
