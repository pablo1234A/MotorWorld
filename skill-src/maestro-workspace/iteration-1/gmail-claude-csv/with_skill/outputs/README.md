# Resumen diario de Gmail con Claude

Cada mañana lee tus correos **no leídos** de Gmail (sin marcarlos como leídos), los clasifica con Claude en
`urgente`, `cliente`, `factura`, `spam` u `otro` y guarda `resumenes/resumen_AAAA-MM-DD.csv` con:

`fecha_resumen; fecha_correo; remitente_nombre; remitente_email; asunto; categoria; prioridad; resumen; accion_sugerida; message_id`

Ordenado por categoría (urgentes primero). Se abre directamente en Excel (UTF-8 con BOM y separador `;`).

## 1. Preparar Gmail (5 min, una sola vez)
1. Activa la verificación en dos pasos: <https://myaccount.google.com/security>.
2. Crea una **contraseña de aplicación**: <https://myaccount.google.com/apppasswords> (nombre: "resumen"). Copia las 16 letras.
3. IMAP ya viene activado en Gmail; si no, Gmail → Configuración → Reenvío y correo POP/IMAP → Habilitar IMAP.

## 2. Instalar (Python 3.9+)
```bash
cd carpeta/del/script
python3 -m venv .venv
source .venv/bin/activate            # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env                 # Windows: copy .env.example .env
```
Edita `.env` con tu correo, la contraseña de aplicación y tu `ANTHROPIC_API_KEY` (<https://console.anthropic.com>).

## 3. Probar
```bash
python gmail_resumen.py --sin-ia     # solo comprueba Gmail: lista los no leídos, no gasta tokens
python gmail_resumen.py --limite 5   # clasifica 5 correos y crea el CSV
```

## 4. Programarlo cada mañana
**macOS / Linux (cron)** — `crontab -e` y añade (todos los días a las 7:55):
```
55 7 * * * cd /ruta/al/script && .venv/bin/python gmail_resumen.py >> resumenes/cron.log 2>&1
```
En macOS, si cron no tiene acceso al disco, dale "Acceso total al disco" a `/usr/sbin/cron` en Ajustes → Privacidad.

**Windows (Programador de tareas)** — en PowerShell:
```powershell
schtasks /Create /SC DAILY /ST 07:55 /TN "Resumen Gmail" /TR "\"C:\ruta\al\script\.venv\Scripts\python.exe\" \"C:\ruta\al\script\gmail_resumen.py\""
```
El equipo debe estar encendido a esa hora (o usa un servidor/VPS con cron).

## Cómo funciona
- **No toca tu bandeja**: abre la carpeta en solo lectura y usa `BODY.PEEK`, así los correos siguen sin leer.
- **No repite trabajo**: guarda los `Message-ID` ya resumidos en `procesados.db`; si un correo sigue sin leer mañana, no se vuelve a pagar. Usa `--todos` para reprocesarlos.
- **Si Claude falla** en un correo, se marca "Revisar a mano" en el CSV y se reintenta al día siguiente.
- **Seguro ante phishing**: el contenido del correo se trata como dato; las instrucciones que contenga se ignoran.
- Log de cada ejecución en `resumenes/gmail_resumen.log`.

## Coste
Por defecto usa `claude-opus-5-5` con esfuerzo `low` y respuesta JSON corta. Para bandejas grandes,
pon `CLASIFICADOR_MODELO=claude-haiku-5-5` en `.env`: la clasificación sigue siendo buena y cuesta una fracción.
Con Opus 5.5 se activa el *fallback* automático del servidor: si el modelo rechaza analizar un correo, la API lo reintenta con otro modelo.
El cuerpo de cada correo se recorta a `MAX_BODY_CHARS` (4000) caracteres.

## Problemas frecuentes
| Error | Solución |
|---|---|
| `Login IMAP fallido` | Usa la contraseña de aplicación, no la normal; comprueba `GMAIL_USER`. |
| `Falta la variable de entorno …` | El `.env` debe estar junto al script y con ese nombre exacto. |
| Correos de otra etiqueta | `IMAP_FOLDER=[Gmail]/All Mail` (o `[Gmail]/Todos`, según el idioma de Gmail, o el nombre de tu etiqueta). |
| Excel muestra todo en una columna | Pon `CSV_DELIMITER=,` en `.env`. |
