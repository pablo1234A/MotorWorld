# Resumen diario de Gmail con Claude

Cada mañana lee los correos **no leídos** de tu bandeja de entrada de Gmail, los clasifica con Claude en **urgente · cliente · factura · spam · otro**, escribe un resumen de una línea de cada uno y lo guarda en `resumenes/resumen_AAAA-MM-DD.csv`.

- **No marca nada como leído** ni mueve ni borra correos: solo lee.
- **No paga dos veces**: si un correo sigue sin leer al día siguiente, reutiliza su clasificación (se guarda en `gmail_claude.db`).
- Si lo ejecutas dos veces el mismo día, el CSV de ese día se sustituye, sin duplicados.

| Columna | Contenido |
|---|---|
| `fecha` | Fecha y hora de recepción |
| `remitente`, `email` | Quién lo envía |
| `asunto` | Asunto |
| `categoria` | urgente, cliente, factura, spam u otro. El CSV viene ordenado en ese orden, con los más recientes primero |
| `resumen` | Una frase con lo esencial (quién, qué quiere, importe o plazo) |
| `nuevo` | `sí` si es la primera vez que aparece en un resumen |

## 1. Instalación (5 minutos)

Necesitas Python 3.10 o superior.

```bash
cd carpeta-donde-esta-el-script
python3 -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env               # Windows: copy .env.example .env
```

Abre `.env` y rellena lo marcado con `EDITAR` (pasos 2 y 3).

## 2. Contraseña de aplicación de Gmail

Gmail no deja entrar por IMAP con tu contraseña normal. Necesitas una **contraseña de aplicación**:

1. Activa la verificación en dos pasos: <https://myaccount.google.com/security>.
2. Entra en <https://myaccount.google.com/apppasswords>, crea una con el nombre "Resumen Gmail" y copia las 16 letras en `GMAILIA_APP_PASSWORD` (da igual si dejas los espacios).
3. IMAP ya viene activado en las cuentas de Gmail actuales. Si te da error de acceso, revisa Gmail > Configuración > *Reenvío y correo POP/IMAP*.

Con una cuenta de empresa (Google Workspace), el administrador puede tener bloqueadas las contraseñas de aplicación: pídele que las permita.

## 3. Clave de Claude (Anthropic)

Crea una clave en <https://console.anthropic.com> > *API Keys* y pégala en `ANTHROPIC_API_KEY`. La cuenta necesita saldo o un método de pago.

Recomendado: rellena `GMAILIA_CONTEXTO` con una frase sobre a qué te dedicas ("Tengo una academia de inglés; mis clientes son alumnos y sus padres"). Sin ese dato, Claude tiene que adivinar qué correos son de clientes.

## 4. Primera prueba

```bash
python gmail_claude_csv.py
```

Al terminar verás algo como:

```
CSV guardado en .../resumenes/resumen_2026-10-13.csv | 23 correos (23 clasificados ahora) | urgente 1 · cliente 4 · factura 3 · spam 6 · otro 9
```

Abre el CSV con Excel o Google Sheets. Con Excel en inglés o con Google Sheets, pon `GMAILIA_SEPARADOR=,`.

## 5. Programarlo cada mañana

El script usa rutas relativas a su propia carpeta, así que da igual desde dónde se lance. Cambia `/ruta/al/script` por la tuya. El ordenador tiene que estar encendido a esa hora.

**Linux (cron)**: ejecuta `crontab -e` y añade esta línea (lunes a domingo a las 7:45):

```
45 7 * * * /ruta/al/script/.venv/bin/python /ruta/al/script/gmail_claude_csv.py
```

**macOS (launchd, se ejecuta al despertar si el Mac estaba dormido)**: guarda esto como `~/Library/LaunchAgents/com.resumen.gmail.plist`

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>com.resumen.gmail</string>
  <key>ProgramArguments</key><array>
    <string>/ruta/al/script/.venv/bin/python</string>
    <string>/ruta/al/script/gmail_claude_csv.py</string>
  </array>
  <key>StartCalendarInterval</key><dict>
    <key>Hour</key><integer>7</integer><key>Minute</key><integer>45</integer>
  </dict>
</dict></plist>
```

y actívalo con `launchctl load ~/Library/LaunchAgents/com.resumen.gmail.plist`.

**Windows (Programador de tareas)**: en una terminal, con una ruta sin espacios:

```
schtasks /Create /TN "Resumen Gmail" /SC DAILY /ST 07:45 /TR "C:\ruta\al\script\.venv\Scripts\python.exe C:\ruta\al\script\gmail_claude_csv.py"
```

Después, en el Programador de tareas > *Resumen Gmail* > Propiedades > Configuración, marca "Ejecutar la tarea lo antes posible si no se inició a su hora".

## 6. ¿Cómo sé si ha fallado?

- Si no aparece el CSV de hoy en `resumenes/`, algo ha fallado.
- `gmail_claude.log` (junto al script) guarda una línea por ejecución. Los fallos empiezan por `ERROR` y explican qué revisar: contraseña de Gmail, clave de Anthropic, conexión o modelo.
- El script termina con código 1 si ha fallado, y con 0 si ha ido bien.
- Si Claude falla con algún correo suelto, ese correo aparece como `otro` con el resumen "(sin clasificar…)" y se vuelve a intentar en la siguiente ejecución.

## 7. Coste y modelo

- Por defecto usa **`claude-haiku-5-5`**, el modelo pequeño y rápido. Para clasificar y resumir es suficiente y cuesta varias veces menos que los grandes. Con 50 correos al día, el gasto es del orden de céntimos al mes. Es una estimación: consulta los precios vigentes en la web de Anthropic.
- `GMAILIA_MAX_CORREOS` (50 por defecto) limita cuántos no leídos se procesan en cada ejecución, empezando por los más recientes. Así, una bandeja con miles de no leídos no dispara el gasto.
- Cambia `GMAILIA_MODELO` a `claude-sonnet-5-5` solo si ves que clasifica mal a menudo, por ejemplo cuando hay muchos correos ambiguos de clientes. Clasificará mejor, pero cuesta unas 20 veces más. Si eliges un modelo antiguo como `claude-haiku-4-5`, deja vacío `GMAILIA_ESFUERZO`.

## 8. Privacidad y seguridad

- El remitente, el asunto y los primeros 3.000 caracteres de cada correo no leído se envían a la API de Anthropic para clasificarlos. Los adjuntos no se envían.
- `.env` contiene tus claves: no lo compartas ni lo subas a Git. En Linux y macOS, protégelo con `chmod 600 .env`.
- Si un correo trae instrucciones dirigidas a la IA, se tratan como texto y no se obedecen. Los asuntos que empiezan por `=`, `+`, `-` o `@` se guardan con un apóstrofo delante para que Excel no los ejecute como fórmula.
- Para revocar el acceso, borra la contraseña de aplicación en <https://myaccount.google.com/apppasswords>.
