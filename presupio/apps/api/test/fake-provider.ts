import type { FollowUpEmailProvider, OutgoingEmail, SendResult } from '../src/automation/providers.js';

/**
 * PROVEEDOR SIMULADO — SOLO PARA PRUEBAS AUTOMATIZADAS.
 * No envía nada ni se conecta a ningún servicio: guarda los mensajes en memoria y devuelve
 * los resultados que indique la prueba. No equivale a una integración real.
 */
export class FakeProvider implements FollowUpEmailProvider {
  readonly name = 'fake';
  readonly configured = true;
  readonly tracksDelivery = false;
  readonly sent: OutgoingEmail[] = [];
  /** Resultados programados (se consumen en orden); sin ellos, el envío "se acepta". */
  private readonly script: Array<SendResult | Error> = [];
  /** Resultado por defecto cuando no hay nada programado. */
  fallback: SendResult | null = null;
  delayMs = 0;
  private gate: Promise<void> | null = null;
  private openGate: (() => void) | null = null;

  constructor(private readonly label = 'fake') {}

  push(...results: Array<SendResult | Error>) {
    this.script.push(...results);
    return this;
  }

  /** Bloquea los envíos hasta llamar a release(): permite "parar el proceso" a mitad de envío. */
  hold() {
    this.gate = new Promise((resolve) => (this.openGate = resolve));
  }

  release() {
    this.openGate?.();
    this.gate = null;
  }

  sentTo(email: string) {
    return this.sent.filter((m) => m.to === email);
  }

  async send(email: OutgoingEmail): Promise<SendResult> {
    this.sent.push(email);
    if (this.gate) await this.gate;
    if (this.delayMs) await new Promise((r) => setTimeout(r, this.delayMs));
    const next = this.script.shift();
    if (next instanceof Error) throw next;
    return next ?? this.fallback ?? { ok: true, providerMessageId: `${this.label}-${this.sent.length}-${email.deliveryId}` };
  }
}
