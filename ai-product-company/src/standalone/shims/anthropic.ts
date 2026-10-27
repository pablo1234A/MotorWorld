/**
 * The browser edition never ships an API key (secrets stay server-side), so the
 * Anthropic SDK is replaced by this stub; agents run on the local heuristic engine.
 */
class AnthropicError extends Error {}
class APIError extends AnthropicError {
  status?: number;
}
export default class Anthropic {
  static AnthropicError = AnthropicError;
  static APIError = APIError;
  static APIConnectionError = class extends APIError {};
  static AuthenticationError = class extends APIError {};
  static PermissionDeniedError = class extends APIError {};
  static NotFoundError = class extends APIError {};
  static BadRequestError = class extends APIError {};
  static RateLimitError = class extends APIError {};
  constructor() {
    throw new Error('Claude is only available in the server edition (API keys never go in the browser).');
  }
}
export function zodOutputFormat(): never {
  throw new Error('Structured outputs require the server edition');
}
