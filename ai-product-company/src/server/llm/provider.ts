import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import type { z } from 'zod';
import type { Database } from '../db.js';
import { AppError, BudgetExceededError, TransientError } from '../core/errors.js';
import { localDate, now } from '../core/ids.js';

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface LlmRequest<T extends z.ZodType> {
  agentId: string;
  taskId?: string | null;
  /** Stable agent prompt (identity + skills). Cached. */
  system: string;
  /** Volatile per-call content (product context, memory, task). */
  user: string;
  history?: ChatTurn[];
  /** Optional JPEG images (base64) attached to the user message — e.g. video frames for QA. */
  images?: string[];
  schema: T;
  effort: 'low' | 'medium' | 'high';
  maxTokens?: number;
}

export interface LlmResult<T> {
  data: T;
  model: string;
  usage: { inputTokens: number; outputTokens: number };
}

/**
 * The agents' brain. One real adapter (Anthropic Claude). When no API key is
 * configured `available` is false and task types run their LOCAL HEURISTIC
 * implementations instead — clearly flagged as INTEGRATION_REQUIRED in the UI.
 */
export interface LlmProvider {
  readonly name: string;
  readonly model: string;
  readonly available: boolean;
  generate<T extends z.ZodType>(req: LlmRequest<T>): Promise<LlmResult<z.infer<T>>>;
}

export class AnthropicProvider implements LlmProvider {
  readonly name = 'anthropic';
  private client: Anthropic | null;

  constructor(apiKey: string | null, readonly model: string) {
    this.client = apiKey ? new Anthropic({ apiKey, maxRetries: 2 }) : null;
  }

  get available() {
    return this.client !== null;
  }

  async generate<T extends z.ZodType>(req: LlmRequest<T>): Promise<LlmResult<z.infer<T>>> {
    if (!this.client) throw new AppError('ANTHROPIC_API_KEY not configured', 'INTEGRATION_REQUIRED', 424);
    const messages: Anthropic.Beta.BetaMessageParam[] = [
      ...(req.history ?? []).map((t) => ({ role: t.role, content: t.content })),
      {
        role: 'user',
        content: req.images?.length
          ? [
              ...req.images.map((data) => ({ type: 'image' as const, source: { type: 'base64' as const, media_type: 'image/jpeg' as const, data } })),
              { type: 'text' as const, text: req.user },
            ]
          : req.user,
      },
    ];
    try {
      const response = await this.client.beta.messages.parse({
        model: this.model,
        max_tokens: req.maxTokens ?? 16000,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        system: [{ type: 'text', text: req.system, cache_control: { type: 'ephemeral' } }],
        messages,
        output_config: { effort: req.effort, format: zodOutputFormat(req.schema) },
      });
      if (response.stop_reason === 'refusal') {
        throw new AppError(`Model declined the request (${response.stop_details?.category ?? 'unspecified'})`, 'LLM_REFUSAL', 422);
      }
      if (response.stop_reason === 'max_tokens') {
        throw new TransientError('Model output truncated (max_tokens) — will retry');
      }
      if (response.parsed_output == null) throw new TransientError('Model returned no parseable structured output');
      return {
        data: response.parsed_output as z.infer<T>,
        model: response.model,
        usage: { inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens },
      };
    } catch (err) {
      if (err instanceof AppError) throw err;
      if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
        throw new AppError(`Anthropic authentication failed: ${err.message}`, 'LLM_AUTH', 401);
      }
      if (err instanceof Anthropic.NotFoundError || err instanceof Anthropic.BadRequestError) {
        throw new AppError(`Anthropic rejected the request: ${err.message}`, 'LLM_BAD_REQUEST', 400);
      }
      if (err instanceof Anthropic.RateLimitError) throw new TransientError(`Anthropic rate limit: ${err.message}`);
      if (err instanceof Anthropic.APIConnectionError) throw new TransientError(`Anthropic connection error: ${err.message}`);
      if (err instanceof Anthropic.APIError) throw new TransientError(`Anthropic API error ${err.status ?? ''}: ${err.message}`);
      // SDK parse/validation failures of the structured output are worth one more try.
      if (err instanceof Anthropic.AnthropicError) throw new TransientError(err.message);
      throw err;
    }
  }
}

/** Wraps the provider with the daily cost guard and usage accounting. */
export class LlmGateway {
  constructor(
    private provider: LlmProvider,
    private db: Database,
    private maxCallsPerDay: () => number,
  ) {}

  get available() {
    return this.provider.available;
  }

  get model() {
    return this.provider.model;
  }

  get engineLabel() {
    return this.provider.available ? `anthropic:${this.provider.model}` : 'local-heuristic';
  }

  callsToday(): number {
    const start = new Date(`${localDate()}T00:00:00`).toISOString();
    return Number(this.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM llm_usage WHERE created_at >= ?', start)?.n ?? 0);
  }

  async generate<T extends z.ZodType>(req: LlmRequest<T>): Promise<LlmResult<z.infer<T>>> {
    if (this.callsToday() >= this.maxCallsPerDay()) {
      throw new BudgetExceededError(`Daily LLM call budget reached (${this.maxCallsPerDay()}). Raise it in Settings or wait until tomorrow.`);
    }
    const res = await this.provider.generate(req);
    this.db.insert('llm_usage', {
      agent_id: req.agentId,
      task_id: req.taskId ?? null,
      model: res.model,
      input_tokens: res.usage.inputTokens,
      output_tokens: res.usage.outputTokens,
      created_at: now(),
    });
    return res;
  }
}
