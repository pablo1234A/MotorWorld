import type { z } from 'zod';
import type { Company } from '../../company.js';
import type { AgentDefinition, AgentId, AgentStatus } from '../../agents/types.js';
import type { Product } from '../../products/productService.js';
import type { ProductContext } from '../../products/productContext.js';
import type { Settings } from '../../core/settings.js';
import type { ToolBelt } from '../../tools/registry.js';
import type { Task } from '../taskEngine.js';
import type { WorkflowRun } from '../../workflows/workflowEngine.js';
import type { BrandPalette } from '../../integrations/types.js';

export interface TaskContext {
  c: Company;
  task: Task;
  agent: AgentDefinition;
  product: Product | null;
  productContext: ProductContext | null;
  memoryText: string;
  run: WorkflowRun | null;
  tools: ToolBelt;
  settings: Settings;
  /** Feedback from QA / supervisor / owner for this revision. */
  feedback: string[];
  /** "llm" when Claude produced the output, "local" for the heuristic engine. */
  engine: 'llm' | 'local';
}

export interface TaskOutcome {
  summary: string;
  score?: number | null;
  data?: Record<string, unknown>;
}

export interface TaskTypeDef<S extends z.ZodType = z.ZodType> {
  type: string;
  agent: AgentId;
  label: string;
  description: string;
  /** Skills loaded for this task only (subset of the agent's skills). */
  skills: string[];
  /** Supervisor running the quality gate (null = no gate). */
  reviewer: AgentId | null;
  requiresProduct: boolean;
  /** Pure-code tasks (checks, packaging) never call the LLM. */
  deterministic?: boolean;
  /** Visual state while executing. */
  workingStatus?: AgentStatus;
  schema: S;
  maxTokens?: number;
  /** Task-specific instructions + data for the LLM (user message body). */
  instructions(ctx: TaskContext): Promise<string> | string;
  /** Optional images (base64 JPEG) attached for the LLM — e.g. frames of a rendered video. */
  images?(ctx: TaskContext): Promise<string[]>;
  /** LOCAL HEURISTIC ENGINE — deterministic implementation without an LLM. */
  local(ctx: TaskContext): Promise<z.infer<S>> | z.infer<S>;
  /** Supervisor quality gate: returns issues (empty = pass). */
  gate?(out: z.infer<S>, ctx: TaskContext): string[];
  /** Side effects (save, render, message, memory). */
  apply(ctx: TaskContext, out: z.infer<S>): Promise<TaskOutcome>;
}

export function defineTaskType<S extends z.ZodType>(def: TaskTypeDef<S>): TaskTypeDef<S> {
  return def;
}

/* ───────────── shared helpers for prompts and the local engine ───────────── */

export function first<T>(arr: T[] | undefined, fallback: T): T {
  return arr && arr.length ? arr[0] : fallback;
}

export function at<T>(arr: T[], i: number): T {
  return arr[i % arr.length];
}

export const json = (v: unknown) => JSON.stringify(v, null, 2);

export interface ProductInsights {
  mainPain: string;
  mainDesire: string;
  mainObjection: string;
  mainBenefit: string;
  dominantEmotion: string;
  transformation: string;
  mostSurprisingVisual: string;
  reasonToCare: string;
  hypotheses: string[];
}

/** Rule-based insight extraction used by the local engine (inputs are the owner's data). */
export function deriveInsights(p: Product): ProductInsights {
  const hypotheses: string[] = [];
  const need = (value: string | undefined, label: string, fallback: string) => {
    if (value && value.trim()) return value.trim();
    hypotheses.push(`HIPÓTESIS (${label} no definido): ${fallback}`);
    return fallback;
  };
  const pain = need(p.customerPains[0] ?? p.problemSolved, 'dolor principal', `el problema que ${p.name} resuelve`);
  const desire = need(p.customerDesires[0], 'deseo principal', `conseguir el resultado que promete ${p.name}`);
  const objection = need(p.objections[0], 'objeción principal', '¿funcionará de verdad para mí?');
  const benefit = need(p.benefits[0] ?? p.features[0], 'beneficio principal', `lo que ${p.name} hace por el cliente`);
  const wow = need(p.differentiators[0] ?? p.features[0], 'elemento visual sorprendente', `${p.name} en acción, en primer plano`);
  const emotion = /dolor|cansad|estrés|miedo|frustr|pain|tired/i.test(pain) ? 'alivio' : /estilo|imagen|lucir|look|status/i.test(desire) ? 'orgullo' : 'curiosidad';
  return {
    mainPain: pain,
    mainDesire: desire,
    mainObjection: objection,
    mainBenefit: benefit,
    dominantEmotion: emotion,
    transformation: `ANTES: ${lc(pain)} → DESPUÉS: ${lc(desire)}`,
    mostSurprisingVisual: wow,
    reasonToCare: `Porque ${lc(benefit)} sin ${lc(objection.replace(/[¿?]/g, ''))}`,
    hypotheses,
  };
}

export const lc = (s: string) => (s ? s.charAt(0).toLowerCase() + s.slice(1) : s);
export const uc = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
export const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;
export const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

/** Short keyword phrase from a sentence (for 1-second on-screen hooks). */
const STOPWORDS = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'en', 'y', 'o', 'con', 'a', 'al', 'por', 'para', 'sin', 'que', 'un', 'una', 'su', 'sus', 'tu', 'mi', 'se', 'lo', 'of', 'the', 'and', 'to', 'for', 'with', 'in', 'a', 'an']);

export function shortPhrase(s: string, maxWords = 5): string {
  const cleaned = s.replace(/[.¡!¿?]/g, '').trim();
  const w = cleaned.split(/\s+/);
  if (w.length <= maxWords) return cleaned;
  // Cut at the word limit but never end on a dangling connector ("sin dolor de").
  const cut = w.slice(0, maxWords);
  while (cut.length > 2 && STOPWORDS.has(cut[cut.length - 1].toLowerCase())) cut.pop();
  // Prefer a few extra words over a phrase that ends mid-idea.
  const extended = w.slice(0, maxWords + 2);
  if (STOPWORDS.has(w[maxWords - 1]?.toLowerCase() ?? '') && extended.length <= maxWords + 2 && !STOPWORDS.has(extended[extended.length - 1].toLowerCase())) return extended.join(' ');
  return cut.join(' ');
}

const PALETTES: BrandPalette[] = [
  { primary: '#101826', secondary: '#2B3F6C', accent: '#E4572E', text: '#FFFFFF' },
  { primary: '#1B1B1E', secondary: '#4A3B5C', accent: '#F2A541', text: '#FFFFFF' },
  { primary: '#0E2A2A', secondary: '#1F6F5F', accent: '#F4D35E', text: '#FFFFFF' },
  { primary: '#2A0E1C', secondary: '#7A2E4A', accent: '#FFB4A2', text: '#FFFFFF' },
  { primary: '#14213D', secondary: '#3A506B', accent: '#5BC0BE', text: '#FFFFFF' },
  { primary: '#1F1A14', secondary: '#6B4F2A', accent: '#E9C46A', text: '#FFFFFF' },
];

/** Deterministic brand palette (until the owner connects brand assets). Hints from visualStyle. */
export function brandPalette(p: Product): BrandPalette {
  const style = p.visualStyle.toLowerCase();
  if (/verde|green|natural|eco/.test(style)) return PALETTES[2];
  if (/rosa|pink|femenin|beauty|belleza/.test(style)) return PALETTES[3];
  if (/azul|blue|tech|clean|limpio/.test(style)) return PALETTES[4];
  if (/premium|lujo|luxury|dorad|gold/.test(style)) return PALETTES[5];
  let h = 0;
  for (const ch of p.name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETTES[h % PALETTES.length];
}

export function productImagePath(ctx: TaskContext): string | null {
  const img = ctx.product?.images[0];
  return img ? ctx.c.products.assetPath(img) : null;
}

export function videoIdOf(ctx: TaskContext): string {
  const id = ctx.task.input.videoId;
  if (typeof id !== 'string') throw new Error('Task input has no videoId');
  return id;
}

export function feedbackBlock(ctx: TaskContext): string {
  if (!ctx.feedback.length) return '';
  return `\n# FEEDBACK DE REVISIÓN (obligatorio corregirlo)\n${ctx.feedback.map((f) => `- ${f}`).join('\n')}\nCorrige exactamente estos puntos y explica en tus notas cómo lo has hecho.\n`;
}

export type InferSchema<S extends z.ZodType> = z.infer<S>;
