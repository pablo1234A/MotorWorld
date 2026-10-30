# Alojamiento listo para contratar

> Dimensionado **a partir de mediciones reales** de la auditoría final (`AUDITORIA-PRODUCCION.md`):
> - API y worker compilados, con `NODE_ENV=production`;
> - PostgreSQL 16 con RLS;
> - base con 284 empresas, 45.903 presupuestos, 18.881 seguimientos y 155.883 entradas de historial;
> - máquina de pruebas de 4 núcleos y 16 GB, donde el generador de carga competía por la misma CPU. **Las cifras son conservadoras.**
>
> No se ha contratado nada ni desplegado nada.

## 1. Resumen

| Pieza | Mínimo (lanzamiento) | Recomendado (hasta ~250 usuarios a la vez) | Medido |
|---|---|---|---|
| **Servidor de aplicación**: API, worker y nginx | 2 vCPU, 2 GB RAM, 25 GB SSD | 2–4 vCPU, 4 GB RAM, 40 GB SSD | API: 230–460 MB de RAM, ~1 núcleo saturada. Worker: 166 MB y 24 % de un núcleo enviando 17 emails/s |
| **PostgreSQL gestionado** (UE, versión 16) | 1 vCPU, 2 GB RAM, 10 GB, PITR 7 días | 2 vCPU, 4 GB RAM, 20 GB, PITR 7–14 días | 139 MB para el volumen de arriba (~3 KB por presupuesto con todo lo asociado). Llegó a 1,1–1,5 núcleos con 250–500 usuarios |
| Sistema operativo | Ubuntu 24.04 LTS o Debian 12 | ídem | — |
| Node.js | 22 (`.nvmrc`) | ídem | 22.22 |
| nginx | ≥ 1.24 | ídem | — |
| Certificado | Let's Encrypt (renovación automática) | ídem | — |

**Coste orientativo:**
- VPS de 2–4 vCPU y 4 GB en la UE: 10–25 €/mes;
- PostgreSQL gestionado pequeño con PITR: 15–40 €/mes.

Compara precios al contratar: cambian.

## 2. Capacidad medida (una API, un proceso Node)

Usuarios virtuales que repiten sin parar: panel completo (8 peticiones en paralelo) → listar → ficha → crear → editar → seguimientos. Entre acciones esperan 5 s (uso intenso) o 1 s (uso extremo). **0 errores en todas las pruebas.**

| Usuarios a la vez | Pausa | Peticiones/s | Panel p50 / p95 | Crear p50 / p95 | CPU API (media) | RAM API | CPU PostgreSQL (media) |
|---|---|---|---|---|---|---|---|
| 50 | 5 s | 10 | 45 / 101 ms | 20 / 30 ms | 10 % | 233 MB | 8 % |
| 100 | 5 s | 19 | 46 / 105 ms | 18 / 25 ms | 15 % | 303 MB | 16 % |
| **250** | 5 s | 45 | **47 / 103 ms** | 18 / 26 ms | 34 % | 312 MB | 38 % |
| 500 | 5 s | 84 | 98 / 532 ms | 25 / 366 ms | 56 % | 334 MB | 68 % |
| 1000 | 5 s | 118 | 4,5 / 6,1 s (saturada) | 0,98 / 6,4 s | 82 % | 461 MB | 98 % |
| 1000, **2 APIs** | 5 s | 133 | 1,2 / 3,9 s | 0,67 / 4,0 s | 48 % + 48 % | 355 MB cada una | 119 % |

CPU en % de un núcleo; 100 % es un núcleo entero.

**Lectura:**

- **Una API atiende 250 usuarios de uso intenso sin degradarse.** Hasta ~500 con colas puntuales (p95 de 0,5 s).
- Un usuario real de Presupio hace muchas menos acciones que este modelo: unas pocas por hora. 250 usuarios intensos a la vez equivalen a varios miles de cuentas.
- **El límite es la CPU.** Con 1000 usuarios en una máquina de 4 núcleos, que además generaba la carga, la máquina estaba al 87–95 %. Una segunda API reparte el trabajo, pero no ayuda si no hay más CPU.
- El perfil de CPU no muestra ningún punto caliente propio: escritura en sockets ~20 %, Kysely ~18 %, Fastify ~6,5 %, GC ~6 %. **No hay una optimización pendiente que cambie el dimensionado.**
- En PostgreSQL, el 65 % del tiempo bajo carga es el contador de límites por IP (una escritura por petición, compartido entre instancias).
  - Se probó como tabla `UNLOGGED` y no mejoró: se descartó.
  - Si la base se convierte en el cuello de botella con varias APIs, la alternativa es mover esos contadores a Redis. No hace falta para el lanzamiento.

**Cuándo crecer:**

| Señal sostenida (15 min) | Acción |
|---|---|
| p95 de `/api/` > 500 ms o CPU de la API > 70 % | Más vCPU, o una segunda API en otra máquina (§5.4) |
| CPU de PostgreSQL > 70 % | Subir el plan de la base de datos |
| Envíos automáticos vencidos sin enviar más de 10 min | Segundo worker (§6): probado, sin duplicados |

## 3. PostgreSQL

### 3.1 Requisitos

- **Versión 16**, la única probada: es la de las pruebas, la CI y la auditoría. Si el proveedor solo ofrece otra versión, ejecuta antes la batería completa contra ella.
- **Región UE.** Conexión **TLS** (`?sslmode=require`).
- Copias diarias **y PITR** (recuperación a un instante) con un mínimo de 7 días.
- Conexiones: cada proceso abre hasta `DB_POOL_MAX` (por defecto 10).
  - Con 1 API, 1 worker y migraciones, unas 22.
  - Con 2 APIs y 2 workers, unas 42.
  - El plan debe permitir al menos **50**.
  - En la prueba, subir el pool a 20 **no** mejoró nada: deja 10.
- **No hace falta ninguna extensión.** Si el proveedor instala alguna (p. ej. `pg_stat_statements`), no molesta: el migrador y `restore.sh` ya lo contemplan (corregido en esta auditoría).

### 3.2 Roles y base (una vez, con el usuario administrador del proveedor)

```sql
CREATE ROLE presupio_owner WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS PASSWORD '<secreto-owner>';
CREATE ROLE presupio_app   WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS PASSWORD '<secreto-app>';
CREATE DATABASE presupio OWNER presupio_owner ENCODING 'UTF8' TEMPLATE template0;
REVOKE ALL ON DATABASE presupio FROM PUBLIC;
GRANT CONNECT, TEMPORARY ON DATABASE presupio TO presupio_app;
-- Conectado a la base presupio:
ALTER SCHEMA public OWNER TO presupio_owner;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
```

- `presupio_owner` solo lo usan las migraciones (`MIGRATION_DATABASE_URL`).
- La API y el worker usan `presupio_app` (`DATABASE_URL`), sujeto a RLS. El migrador **se niega** a continuar si ese rol es superusuario o tiene `BYPASSRLS`.

## 4. Servidor de aplicación

### 4.1 Preparación

```bash
sudo adduser --system --group --home /srv/presupio presupio
sudo apt install -y nginx certbot python3-certbot-nginx postgresql-client-16
# Node 22 desde NodeSource o el gestor que prefieras (comprobar: node --version → v22.x)
sudo install -d -o root -g presupio -m 0750 /etc/presupio
sudo install -o root -g presupio -m 0640 /dev/null /etc/presupio/runtime.env   # variables y secretos
```

- `postgresql-client-16` aporta `pg_dump` y `pg_restore` para `ops/backup.sh` y `ops/restore.sh`. **Misma versión mayor que el servidor** o superior. Ubuntu 24.04 lo trae en sus repositorios; en Debian 12, añade el repositorio oficial de PostgreSQL (PGDG).
- Cortafuegos: entrada solo por 22 (SSH, mejor restringido por IP o con claves), 80 y 443. La API (3000) **no** se expone: escucha en `127.0.0.1`.

### 4.2 Variables mínimas de producción (`/etc/presupio/runtime.env`)

```bash
NODE_ENV=production
HOST=127.0.0.1
PORT=3000
TRUST_PROXY=loopback                 # nginx en la misma máquina. Nunca un número; nunca true si la API es accesible sin nginx
APP_WEB_URL=https://app.tudominio.es
PUBLIC_API_URL=https://app.tudominio.es
DATABASE_URL=postgres://presupio_app:<secreto>@<host>:5432/presupio?sslmode=require
MIGRATION_DATABASE_URL=postgres://presupio_owner:<secreto>@<host>:5432/presupio?sslmode=require
COOKIE_SECURE=true
LEGAL_TERMS_URL=https://tudominio.es/terminos
LEGAL_PRIVACY_URL=https://tudominio.es/privacidad
OPS_STATUS_TOKEN=<openssl rand -hex 32>
# Correo: MAILGUN-READY.md §8. Pagos: PAYMENTS_ENABLED=false hasta ACTIVAR-PRODUCCION-STRIPE.md.
```

La lista completa está en `PLAN-LANZAMIENTO.md` §8 y `.env.example`.

**La API no arranca, y explica el motivo, si en producción:**
- falta `https`;
- falta alguna URL legal;
- `MAIL_TRANSPORT=log`;
- `TRUST_PROXY` no es válido;
- hay alguna clave live de Stripe.

### 4.3 systemd

```ini
# /etc/systemd/system/presupio-api.service
[Unit]
Description=Presupio API
After=network-online.target
Wants=network-online.target

[Service]
User=presupio
Group=presupio
WorkingDirectory=/srv/presupio/current/presupio
EnvironmentFile=/etc/presupio/runtime.env
ExecStart=/usr/bin/node apps/api/dist/src/server.js
Restart=always
RestartSec=5
# Cierre ordenado: termina las peticiones en curso y cierra el pool.
KillSignal=SIGTERM
TimeoutStopSec=30
LimitNOFILE=65536
UMask=0077
NoNewPrivileges=true
CapabilityBoundingSet=
AmbientCapabilities=
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
PrivateDevices=true
ProtectKernelTunables=true
ProtectKernelModules=true
ProtectKernelLogs=true
ProtectControlGroups=true
ProtectClock=true
ProtectHostname=true
ProtectProc=invisible
RestrictNamespaces=true
RestrictRealtime=true
RestrictSUIDSGID=true
LockPersonality=true
RestrictAddressFamilies=AF_INET AF_INET6 AF_UNIX
SystemCallArchitectures=native
# Sin MemoryDenyWriteExecute: el compilador JIT de V8 (Node) lo necesita.
MemoryMax=1G

[Install]
WantedBy=multi-user.target
```

```ini
# /etc/systemd/system/presupio-worker.service
[Unit]
Description=Presupio worker (envío automático, recuperación, retención)
After=network-online.target
Wants=network-online.target

[Service]
User=presupio
Group=presupio
WorkingDirectory=/srv/presupio/current/presupio
EnvironmentFile=/etc/presupio/runtime.env
ExecStart=/usr/bin/node apps/api/dist/src/worker.js
Restart=always
RestartSec=5
# El worker termina el ciclo en curso al recibir SIGTERM. Si se le mata a mitad, los envíos
# interrumpidos se recuperan a los 15 min sin duplicados (demostrado en la auditoría).
KillSignal=SIGTERM
TimeoutStopSec=120
UMask=0077
NoNewPrivileges=true
CapabilityBoundingSet=
AmbientCapabilities=
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
PrivateDevices=true
ProtectKernelTunables=true
ProtectKernelModules=true
ProtectKernelLogs=true
ProtectControlGroups=true
ProtectClock=true
ProtectHostname=true
ProtectProc=invisible
RestrictNamespaces=true
RestrictRealtime=true
RestrictSUIDSGID=true
LockPersonality=true
RestrictAddressFamilies=AF_INET AF_INET6 AF_UNIX
SystemCallArchitectures=native
# Sin MemoryDenyWriteExecute: el compilador JIT de V8 (Node) lo necesita.
MemoryMax=512M

[Install]
WantedBy=multi-user.target
```

Activa e inicia los dos servicios:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now presupio-api presupio-worker
```

`MemoryMax` deja margen sobre lo medido: API 461 MB en saturación y worker 166 MB. Si se alcanzara, systemd reinicia el proceso.

**Verificación de las unidades:**
- `systemd-analyze verify` sin errores.
- `systemd-analyze security`: exposición **3,2 («OK»)** en la API y en el worker (7,5 sin el endurecimiento). Medida con `User=root`; con el usuario `presupio`, igual o menor.
- El entorno de la auditoría no tiene systemd como PID 1, así que **no se han podido arrancar**. En staging, comprueba que los dos servicios arrancan y que `/health/ready` responde antes de producción. Si alguna directiva diera problemas con el proveedor, el registro de `journalctl -u` indica cuál.

### 4.4 HTTPS y nginx

1. Copia el frontend compilado (`apps/web/dist`) a `/srv/presupio/web`.
2. Copia `ops/nginx/presupio-web.conf` a `/etc/nginx/sites-available/presupio` y cambia en él:
   - `server_name`;
   - las rutas `ssl_certificate` y `ssl_certificate_key`;
   - `root`.

   **Las cabeceras de seguridad no se editan a mano.** Se generan con:

   ```bash
   node apps/web/server/hosting-config.mjs --nginx
   ```

3. Lo que ya incluye la configuración:
   - redirección de HTTP a HTTPS;
   - HSTS de 1 año (sin `preload`);
   - CSP;
   - `X-Frame-Options: DENY`;
   - `/api/` hacia `127.0.0.1:3000`;
   - `client_max_body_size 11m` solo en `/api/v1/webhooks/inbound/`;
   - caché larga de `/assets/`;
   - `index.html` sin caché.
4. Certificado y comprobación de su renovación:

   ```bash
   sudo certbot --nginx -d app.tudominio.es
   ```

   ```bash
   sudo certbot renew --dry-run
   ```

5. Comprueba las cabeceras:

   ```bash
   curl -sI https://app.tudominio.es/
   ```

   Deben aparecer `strict-transport-security`, `content-security-policy`, `x-frame-options: DENY` y `referrer-policy: no-referrer`.

### 4.5 Dos APIs (cuando haga falta)

Sustituye `proxy_pass http://127.0.0.1:3000;` por un `upstream`:

```nginx
upstream presupio_api { server 127.0.0.1:3000; server 127.0.0.1:3001; keepalive 32; }
# en cada location /api/…:  proxy_pass http://presupio_api;  proxy_http_version 1.1;  proxy_set_header Connection "";
```

Y una segunda unidad, `presupio-api@3001`, con `PORT=3001`.

Probado en la auditoría con dos APIs sobre la misma base:
- los límites por IP se comparten (están en PostgreSQL);
- las sesiones valen en las dos: inicio de sesión en una, uso y cierre en la otra, y la primera rechaza la sesión cerrada (`401`);
- 0 errores con 250–1000 usuarios.

Si la segunda API está en otra máquina, `TRUST_PROXY` debe ser la IP del nginx que le habla.

## 5. Despliegue y actualizaciones

1. **Compilar fuera del servidor** (CI o máquina de compilación, sin secretos de producción):

   ```bash
   npm ci && npm run build
   ```

2. Copiar a `/srv/presupio/releases/<versión>` y enlazar `current` a esa carpeta.
3. **Copia antes de migrar:** `ops/backup.sh` (§8).
4. **Migrar:**

   ```bash
   npm run db:migrate:prod
   ```

   Usa `MIGRATION_DATABASE_URL` y concede los permisos al rol de la aplicación.
5. Reiniciar:

   ```bash
   sudo systemctl restart presupio-api presupio-worker
   ```

6. **Comprobación de humo:**
   - `GET /api/v1/health/ready` → `200`;
   - iniciar sesión con la cuenta interna;
   - `GET /api/v1/ops/status` → `ok`.
7. **Vuelta atrás:** volver a enlazar `current` a la versión anterior y reiniciar.
   - Las migraciones de esta versión solo añaden: tablas, columnas, funciones e índices. Aun así, **no se ha probado** que cada versión anterior funcione con el esquema nuevo: compruébalo en staging antes de cada despliegue con migraciones.
   - Si una migración tuviera que deshacerse, se restaura la copia del paso 3 (§9).

## 6. Worker

- **Una instancia basta.** Con un worker se enviaron **5.000 seguimientos en 294 s** (17/s), con **0 duplicados**, 166 MB y 24 % de CPU.
- **Dos instancias:**
  - 5.000 envíos en 166 s (30/s), 0 duplicados y 0 envíos atascados;
  - los trabajos exclusivos usan bloqueos consultivos y `FOR UPDATE SKIP LOCKED`;
  - envía como mucho 25 por empresa y ciclo, para que ninguna acapare el turno.
- **Caída brusca** (`SIGKILL`) de un worker a mitad de lote:
  - 4.982 enviados, 0 duplicados y 18 envíos interrumpidos;
  - a los 15 min, la recuperación automática reenvió una sola vez los 17 que no habían llegado al proveedor;
  - dejó 1 en «sin verificar», porque sí había salido;
  - total: 5.000 sin duplicados.
- Alternativa sin proceso persistente: `node apps/api/dist/src/worker.js --once` desde un cron cada minuto.
- `WORKER_INTERVAL_SECONDS` vale 60 por defecto.

## 7. Monitorización

| Qué | Cómo | Cada | Alerta si |
|---|---|---|---|
| Disponibilidad | `GET /api/v1/health/ready` (comprueba la base de datos) | 1 min | 2 fallos seguidos |
| Proceso vivo | `GET /api/v1/health` (no toca la base) | 1 min | Fallo |
| Estado operativo | `GET /api/v1/ops/status` con `Authorization: Bearer <OPS_STATUS_TOKEN>` | 5 min | `status ≠ ok`. Alertas: `worker_not_running`, `deliveries_stuck_sending`, `deliveries_unknown_review`, `approved_emails_delayed`, `job_errors_last_24h`, `attempts_reserved_stuck`, `billing_events_failed`, `billing_duplicate_subscription` |
| Latencia | `request_time` del log de nginx | continuo | p95 de `/api/` > 500 ms durante 15 min |
| CPU y RAM | Agente del proveedor o `node_exporter` | 1 min | CPU > 70 % durante 15 min; RAM > 85 % |
| Disco | Agente | 5 min | > 80 % |
| PostgreSQL | Panel del proveedor | 5 min | CPU > 70 %, conexiones > 80 % del máximo, almacenamiento > 80 % |
| Certificado | Caducidad TLS | Diaria | < 14 días |
| Copias | La copia del día existe (proveedor y externa) | Diaria | Falta |
| Registros | JSON de pino (stdout → journald → servicio de logs, 30 días) | continuo | `level ≥ 50` repetidos |

**Comportamiento ante una caída de PostgreSQL, comprobado en el simulacro:**
- la API y el worker **siguen vivos**;
- `/health` responde 200 y `/health/ready` 503;
- se recuperan solos cuando vuelve la base.

Un monitor sobre `/health/ready` avisa de la caída; uno sobre `/health`, de que el proceso ha muerto.

## 8. Copias de seguridad

| Capa | Qué | Frecuencia | Retención |
|---|---|---|---|
| Proveedor | Copias automáticas y **PITR** | Continua | PITR ≥ 7 días; diarias 30 días |
| Externa | `ops/backup.sh`: `pg_dump` en formato custom, SHA-256 y comprobación del índice | Diaria (cron) y **antes de cada migración** | 30 días, cifrada y fuera del proveedor de la base |

Cron diario de la copia externa:

```bash
# /etc/cron.d/presupio-backup (como usuario presupio; BACKUP_DATABASE_URL en un archivo 0600)
15 3 * * * presupio . /etc/presupio/backup.env && /srv/presupio/current/presupio/ops/backup.sh /srv/presupio/backups >> /var/log/presupio-backup.log 2>&1
```

Después, sube la copia cifrada a un almacenamiento externo (p. ej. con `age` o `gpg`, y `rclone`).

**Medido:** copia en caliente de la base de la auditoría (284 empresas y 16.180 presupuestos en ese momento) en **1,24 s, 6,8 MB**. La API y el worker siguieron funcionando durante la copia.

**Fiabilidad:**
- `backup.sh` fallaba de forma intermitente (7 %, por `SIGPIPE`): **corregido**, 0 fallos en 200 comprobaciones.
- `restore.sh` no restauraba copias con extensiones del proveedor: **corregido**.
- Los dos scripts se prueban en cada CI (`test/backup.test.ts`).

## 9. Recuperación ante desastres (procedimiento probado)

Simulacro real con los scripts del repositorio:
1. con el worker enviando, se hace una copia;
2. se siguen enviando 400 emails más;
3. se detiene PostgreSQL;
4. se borra la base entera.

| Paso | Tiempo medido |
|---|---|
| Restauración (`restore.sh`) | 2,71 s |
| Migración (`db:migrate:prod`) | 0,17 s |
| API lista | 0,87 s |
| **Total desde la caída hasta la API lista** (incluye 8 s de caída simulada) | **16,75 s** |

Datos idénticos a la copia, inicio de sesión correcto y aislamiento entre empresas intacto (`404`).

**Procedimiento:**

1. **Parar** la API y el worker:

   ```bash
   systemctl stop presupio-api presupio-worker
   ```

2. **Restaurar en una base nueva y vacía.**
   - Mejor opción, PITR del proveedor al instante anterior al incidente: pérdida de minutos.
   - Si no hay PITR, crea la base (§3.2) y restaura la copia:

     ```bash
     RESTORE_DATABASE_URL=<owner-base-nueva> ops/restore.sh <copia>.dump
     ```

3. Migrar:

   ```bash
   npm run db:migrate:prod
   ```

   Vuelve a conceder los permisos al rol de la aplicación.
4. Apuntar `DATABASE_URL` y `MIGRATION_DATABASE_URL` a la base restaurada.
5. **Arrancar el worker en modo seguro:**
   - pon `FOLLOWUP_EMAIL_PROVIDER=disabled` en el entorno del worker y arranca la API y el worker;
   - comprobado: **0 envíos** en modo seguro.

   **Por qué:** la base restaurada no sabe nada de los emails enviados después de la copia. En el simulacro, al reactivar el envío se **reenviaron exactamente esos 400**, al mismo destinatario y con el mismo paso. Nunca hubo dos envíos del mismo seguimiento dentro de la base.
6. **Revisar los envíos posteriores a la copia:**
   - en el panel de Mailgun, *Logs*, desde la hora de la copia hasta la caída;
   - marca como enviados, o cancela, los seguimientos afectados antes de reactivar el envío. Con PITR, la ventana es de minutos y suele estar vacía.
7. Reactivar `FOLLOWUP_EMAIL_PROVIDER=mailgun` y reiniciar el worker.
8. Comprobación:
   - `GET /api/v1/health/ready`;
   - `GET /api/v1/ops/status`;
   - inicio de sesión;
   - recuento de presupuestos de una empresa interna.

**Objetivos:**
- pérdida máxima (RPO): minutos con PITR, 24 h solo con la copia diaria;
- recuperación (RTO): **menos de 1 hora** con el procedimiento anterior. La parte técnica son segundos; el resto es la revisión del paso 6.
- **Repite el simulacro en staging** con el proveedor real antes de abrir y luego cada trimestre.

## 10. Lista de comprobación antes de abrir

- [ ] Servidor y PostgreSQL contratados en la UE, con PITR y TLS.
- [ ] Roles y base creados (§3.2); migraciones aplicadas.
- [ ] `runtime.env` completo, `0640 root:presupio`, sin secretos en el repositorio.
- [ ] Servicios systemd activos y reinicio probado: `systemctl restart` y `kill -9` del worker.
- [ ] nginx con HTTPS, cabeceras comprobadas y renovación del certificado probada.
- [ ] `TRUST_PROXY=loopback`, y comprobado que dos IPs distintas tienen límites distintos.
- [ ] Copia diaria externa funcionando y **una restauración de prueba hecha** (§9).
- [ ] Monitores de §7 creados y una alerta de prueba recibida.
- [ ] Correo: `MAILGUN-READY.md` completo.
- [ ] Pagos: `PAYMENTS_ENABLED=false`, o modo de prueba, hasta `ACTIVAR-PRODUCCION-STRIPE.md`.
