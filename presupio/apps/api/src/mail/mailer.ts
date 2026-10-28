import nodemailer, { type Transporter } from 'nodemailer';
import type { AppConfig } from '../config.js';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
  /** Plantilla lógica (para logs y pruebas; nunca se registra el contenido). */
  template: string;
}

export type DeliveryResult =
  | { status: 'sent' }
  | { status: 'not_configured' }
  | { status: 'failed'; reason: string };

export interface Mailer {
  readonly configured: boolean;
  send(message: MailMessage): Promise<DeliveryResult>;
}

interface MinimalLogger {
  info(obj: object, msg?: string): void;
  warn(obj: object, msg?: string): void;
  error(obj: object, msg?: string): void;
}

/** Sin proveedor: no se envía nada y se informa de ello. Nunca se finge el envío. */
export class DisabledMailer implements Mailer {
  readonly configured = false;
  constructor(private readonly logger?: MinimalLogger) {}
  async send(message: MailMessage): Promise<DeliveryResult> {
    this.logger?.warn({ template: message.template }, 'Email no enviado: no hay proveedor de correo configurado (MAIL_TRANSPORT)');
    return { status: 'not_configured' };
  }
}

/**
 * Solo para desarrollo local: escribe el email (incluidos los enlaces) en la consola del
 * servidor. Está prohibido en producción (ver config.ts). No cuenta como "enviado".
 */
export class LogMailer implements Mailer {
  readonly configured = false;
  async send(message: MailMessage): Promise<DeliveryResult> {
    console.info(
      `\n[MAIL DEV · no enviado] Para: ${message.to}\nAsunto: ${message.subject}\n\n${message.text}\n[/MAIL DEV]\n`,
    );
    return { status: 'not_configured' };
  }
}

export class SmtpMailer implements Mailer {
  readonly configured = true;
  private readonly transport: Transporter;

  constructor(
    private readonly from: string,
    smtp: NonNullable<AppConfig['mail']['smtp']>,
    private readonly logger?: MinimalLogger,
  ) {
    this.transport = nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.secure,
      requireTLS: !smtp.secure,
      auth: smtp.user ? { user: smtp.user, pass: smtp.password } : undefined,
    });
  }

  async send(message: MailMessage): Promise<DeliveryResult> {
    try {
      await this.transport.sendMail({
        from: this.from,
        to: message.to,
        subject: message.subject,
        text: message.text,
        html: message.html,
      });
      this.logger?.info({ template: message.template }, 'Email enviado');
      return { status: 'sent' };
    } catch (error) {
      // No se registra el destinatario ni el contenido (pueden incluir tokens).
      this.logger?.error({ template: message.template, err: (error as Error).message }, 'Fallo al enviar email');
      return { status: 'failed', reason: 'smtp_error' };
    }
  }
}

/** Para pruebas: guarda los mensajes en memoria. */
export class MemoryMailer implements Mailer {
  readonly configured = true;
  readonly outbox: MailMessage[] = [];
  async send(message: MailMessage): Promise<DeliveryResult> {
    this.outbox.push(message);
    return { status: 'sent' };
  }
  lastTo(to: string): MailMessage | undefined {
    return [...this.outbox].reverse().find((m) => m.to === to);
  }
}

export function createMailer(config: AppConfig, logger?: MinimalLogger): Mailer {
  switch (config.mail.transport) {
    case 'smtp':
      return new SmtpMailer(config.mail.from!, config.mail.smtp!, logger);
    case 'log':
      return new LogMailer();
    default:
      return new DisabledMailer(logger);
  }
}
