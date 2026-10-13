# Resumen diario de Gmail con Claude

`gmail_resumen.py` lee los correos **no leídos** de tu bandeja de entrada de Gmail por IMAP, los clasifica con Claude en **urgente / cliente / factura / spam / otro**, y guarda un CSV `resumenes/resumen_AAAA-MM-DD.csv` con fecha, categoría, remitente, asunto, resumen en español, si requiere acción, confianza, si tiene adjuntos y un enlace directo al correo.

Los correos **no se marcan como leídos** (la bandeja se abre en modo solo lectura).

## 1. Preparar Gmail (una sola vez)
1. Activa la verificación en dos pasos en tu cuenta de Google.
2. Crea una contraseña de aplicación en https://myaccount.google.com/apppasswords (nombre: "resumen-gmail"). Copia los 16 caracteres.
3. En Gmail → Configuración → *Reenvío y correo POP/IMAP*, comprueba que IMAP está habilitado.

## 2. Instalar
```bash
cd /ruta/a/esta/carpeta
python3 -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env               # y rellena GMAIL_USER, GMAIL_APP_PASSWORD, ANTHROPIC_API_KEY
chmod 600 .env
```
La clave de Anthropic se obtiene en https://console.anthropic.com/.

## 3. Probar
```bash
python gmail_resumen.py            # genera resumenes/resumen_<hoy>.csv
python gmail_resumen.py -o prueba.csv -v
```
El CSV usa `;` como separador y UTF-8 con BOM para abrirse directamente en Excel en español. Las filas salen ordenadas: urgentes primero, después cliente, factura, spam y otro.

## 4. Programarlo cada mañana

**Linux / macOS (cron)** — `crontab -e` y añade (lunes a viernes a las 7:30):
```cron
30 7 * * 1-5 cd /ruta/a/esta/carpeta && .venv/bin/python gmail_resumen.py >> resumen.log 2>&1
```
(Para todos los días usa `30 7 * * *`.) En macOS, da "Acceso total al disco" a `cron` si falla.

**Windows (Programador de tareas)** — en PowerShell:
```powershell
schtasks /Create /SC DAILY /ST 07:30 /TN "ResumenGmail" `
  /TR "C:\ruta\a\carpeta\.venv\Scripts\python.exe C:\ruta\a\carpeta\gmail_resumen.py"
```
El script carga `.env` desde su propia carpeta, así que funciona aunque se lance desde otro directorio.

## Opciones (en `.env`)
| Variable | Por defecto | Descripción |
|---|---|---|
| `CLAUDE_MODEL` | `claude-haiku-4-5` | Modelo rápido y barato; pon `claude-sonnet-4-5` si quieres más precisión |
| `OUTPUT_DIR` | `resumenes` | Carpeta de salida (relativa al script o absoluta) |
| `MAX_EMAILS` | `100` | Máximo de correos por ejecución (los más recientes) |
| `SINCE_DAYS` | `0` | Solo no leídos de los últimos N días (`1` = desde ayer; `0` = todos) |
| `BODY_CHARS` | `3000` | Caracteres del cuerpo que se envían a Claude |

## Notas
- Coste orientativo con Haiku: unos céntimos por cada 100 correos.
- Privacidad: el remitente, asunto y los primeros `BODY_CHARS` caracteres de cada correo se envían a la API de Anthropic.
- Si un correo no se puede clasificar (error de API), aparece como `otro` con resumen "(no se pudo clasificar)" y el script continúa.
- Para ajustar los criterios de cada categoría, edita `SYSTEM_PROMPT` en el script.
