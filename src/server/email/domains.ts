import "server-only";

import { sanitizeProviderMessage } from "./port";

/**
 * Dominios de envío propios del taller (API de dominios de Resend:
 * https://resend.com/docs/api-reference/domains). Región UE (eu-west-1).
 * Sin EMAIL_PROVIDER=resend y RESEND_API_KEY la funcionalidad aparece como
 * "no configurada": no se simula ninguna verificación.
 */

export type DomainStatus = "pending" | "verified" | "failed" | "temporary_failure";

export interface DnsRecord {
  /** Para qué sirve: SPF, DKIM, MX (retorno de rebotes)… */
  record: string;
  type: string;
  name: string;
  value: string;
  priority: number | null;
  ttl: string | null;
  status: string | null;
}

export interface ProviderDomain {
  id: string;
  name: string;
  status: DomainStatus;
  records: DnsRecord[];
}

export class DomainProviderError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "DomainProviderError";
  }
}

export interface DomainPort {
  readonly name: "resend";
  create(domain: string): Promise<ProviderDomain>;
  get(id: string): Promise<ProviderDomain>;
  verify(id: string): Promise<void>;
  remove(id: string): Promise<void>;
}

export function mapDomainStatus(status: unknown): DomainStatus {
  return status === "verified" ? "verified" : status === "failed" ? "failed" : status === "temporary_failure" ? "temporary_failure" : "pending";
}

function toRecord(r: Record<string, unknown>): DnsRecord {
  const str = (v: unknown) => (typeof v === "string" ? v.slice(0, 2000) : v == null ? null : String(v).slice(0, 2000));
  return {
    record: str(r.record) ?? "",
    type: str(r.type) ?? "",
    name: str(r.name) ?? "",
    value: str(r.value) ?? "",
    priority: typeof r.priority === "number" ? r.priority : null,
    ttl: str(r.ttl),
    status: str(r.status),
  };
}

function toDomain(body: Record<string, unknown>): ProviderDomain {
  if (typeof body.id !== "string" || typeof body.name !== "string") throw new DomainProviderError(502, "Respuesta del proveedor no válida");
  return {
    id: body.id,
    name: body.name,
    status: mapDomainStatus(body.status),
    records: Array.isArray(body.records) ? (body.records as Record<string, unknown>[]).map(toRecord) : [],
  };
}

export class ResendDomainsAdapter implements DomainPort {
  readonly name = "resend" as const;

  constructor(
    private readonly apiKey: string,
    private readonly base = "https://api.resend.com",
  ) {}

  private async call(method: string, path: string, body?: unknown): Promise<Record<string, unknown>> {
    let res: Response;
    try {
      res = await fetch(`${this.base}${path}`, {
        method,
        headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(15_000),
      });
    } catch (err) {
      throw new DomainProviderError(503, sanitizeProviderMessage((err as Error).message ?? "Error de red"));
    }
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) throw new DomainProviderError(res.status, sanitizeProviderMessage(String(json.message ?? res.statusText)));
    return json;
  }

  async create(domain: string): Promise<ProviderDomain> {
    return toDomain(await this.call("POST", "/domains", { name: domain, region: "eu-west-1" }));
  }

  async get(id: string): Promise<ProviderDomain> {
    return toDomain(await this.call("GET", `/domains/${encodeURIComponent(id)}`));
  }

  async verify(id: string): Promise<void> {
    await this.call("POST", `/domains/${encodeURIComponent(id)}/verify`);
  }

  async remove(id: string): Promise<void> {
    await this.call("DELETE", `/domains/${encodeURIComponent(id)}`);
  }
}

export function getDomainProvider(env: Record<string, string | undefined> = process.env): DomainPort | null {
  return env.EMAIL_PROVIDER === "resend" && env.RESEND_API_KEY ? new ResendDomainsAdapter(env.RESEND_API_KEY) : null;
}
