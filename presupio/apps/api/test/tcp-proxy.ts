import net from 'node:net';

/**
 * Proxy TCP local entre la aplicación y PostgreSQL, SOLO para pruebas: permite simular la
 * caída de la base de datos (cortar todas las conexiones y rechazar las nuevas) y su vuelta,
 * sin detener el servidor PostgreSQL que usan las demás pruebas.
 */
export class TcpProxy {
  private server: net.Server | null = null;
  private readonly sockets = new Set<net.Socket>();
  port = 0;

  constructor(
    private readonly targetHost: string,
    private readonly targetPort: number,
  ) {}

  async start(port = this.port): Promise<number> {
    this.server = net.createServer((client) => {
      const upstream = net.connect(this.targetPort, this.targetHost);
      for (const s of [client, upstream]) {
        this.sockets.add(s);
        s.on('close', () => this.sockets.delete(s));
        s.on('error', () => s.destroy());
      }
      client.pipe(upstream).pipe(client);
    });
    await new Promise<void>((resolve) => this.server!.listen(port, '127.0.0.1', resolve));
    this.port = (this.server.address() as net.AddressInfo).port;
    return this.port;
  }

  /** «Cae» la base de datos: corta las conexiones abiertas y deja de aceptar nuevas. */
  async stop(): Promise<void> {
    for (const s of this.sockets) s.destroy();
    this.sockets.clear();
    await new Promise<void>((resolve) => (this.server ? this.server.close(() => resolve()) : resolve()));
    this.server = null;
  }

  /** URL de conexión igual a la original pero a través del proxy. */
  wrap(url: string): string {
    const u = new URL(url);
    u.hostname = '127.0.0.1';
    u.port = String(this.port);
    return u.toString();
  }
}
