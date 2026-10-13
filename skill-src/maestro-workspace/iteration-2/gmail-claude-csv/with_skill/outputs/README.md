# Clasificador matinal de Gmail con Claude

Cada mañana lee tus correos **no leídos** de Gmail, los clasifica con Claude en **urgente, cliente, factura, spam u otro** y te deja un resumen en `resumenes/resumen_AAAA-MM-DD.csv`, con lo urgente arriba.

- **No toca tu buzón**: abre Gmail en solo lectura. Los correos siguen sin leer, no se mueven y no se borran.
- **No duplica ni paga dos veces**: si lo ejecutas otra vez el mismo día, rehace el CSV del día con las mismas filas y reutiliza lo ya clasificado. Un correo que sigue sin leer al día siguiente vuelve a salir con `nuevo = no`, y no se clasifica de nuevo.
- **Barato**: usa el modelo pequeño de Claude (Haiku), recorta el texto y puede saltarse a Claude con reglas fijas para remitentes conocidos.
- **Si falla, te avisa**: lo apunta en un log y te manda un correo a ti mismo.

---

## 1. Requisitos

- Python **3.10 o superior** (`python3 --version`).
- Una cuenta de Gmail con **verificación en dos pasos** activada, que hace falta para crear la contraseña de aplicación.
- Una **clave de API de Anthropic** con saldo.

## 2. Instalación

```bash
cd /ruta/al/clasificador            # la carpeta con gmail_clasificador.py
python3 -m venv .venv
source .venv/bin/activate           # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env                # Windows: copy .env.example .env
```

## 3. Credenciales (las tres líneas `EDITAR` del `.env`)

**Contraseña de aplicación de Gmail** (`GMAILCLAS_CLAVE_APP`)
1. Activa la verificación en dos pasos en https://myaccount.google.com/signinoptions/twosv
2. Entra en https://myaccount.google.com/apppasswords, escribe un nombre (por ejemplo "Clasificador") y pulsa **Crear**.
3. Copia las 16 letras en `.env`. Da igual si las pegas con espacios o sin ellos.

Si Google dice que la opción no está disponible, puede ser por dos motivos: usas solo llaves de seguridad o Protección Avanzada, o tu cuenta es de empresa (Google Workspace) y el administrador tiene desactivadas las contraseñas de aplicación o IMAP. Si en Gmail ves **Configuración > Reenvío y correo POP/IMAP**, deja IMAP habilitado. Al cambiar la contraseña de Google, las contraseñas de aplicación se revocan y tendrás que crear una nueva.

**Clave de Anthropic** (`ANTHROPIC_API_KEY`)
En la consola de Anthropic (https://console.anthropic.com), ve a **API Keys > Create Key**. Añade saldo en **Billing**.

**Tu dirección** (`GMAILCLAS_USUARIO`): la dirección completa, `nombre@gmail.com`.

## 4. Ajustarlo a tu negocio (opcional, recomendable)

```bash
cp reglas.ejemplo.json reglas.json
```

- `negocio`: describe en una frase a qué te dedicas y qué es urgente **para ti**. Es lo que más mejora la clasificación.
- `clientes`: direcciones o dominios de tus clientes (`"@empresa.com"` o `"empresa.com"` incluyen todo el dominio). Claude recibe la pista "CLIENTE CONOCIDO".
- `fijas`: remitentes que se clasifican **sin llamar a Claude**, por ejemplo las facturas de un proveedor. En esos correos el resumen es el asunto.

Las demás opciones están comentadas en `.env.example`: días hacia atrás, máximo de correos, separador del CSV, carpeta de salida, filtro de Gmail…

## 5. Probarlo

```bash
python gmail_clasificador.py --comprobar   # comprueba Gmail, Claude y la carpeta, sin gastar tokens
python gmail_clasificador.py               # la ejecución de verdad
```

Abre `resumenes/resumen_<fecha de hoy>.csv`. Si no tienes correos sin leer, el CSV sale solo con la cabecera.

Para comprobar el código sin credenciales (con buzón y respuestas de Claude simuladas):

```bash
python -m unittest test_gmail_clasificador -v
```

## 6. Programarlo cada mañana

Los ejemplos lo lanzan a las **7:45**: cambia la hora a tu gusto. El ordenador tiene que estar encendido. Si no lo está, cada sistema se comporta de forma distinta, como se explica en cada caso.

**Linux** (cron): ejecuta `crontab -e` y añade esta línea. Para lanzarlo solo de lunes a viernes, cambia `* * *` por `* * 1-5`.
```
45 7 * * * cd /ruta/al/clasificador && .venv/bin/python gmail_clasificador.py >> cron_salida.txt 2>&1
```
cron no recupera las ejecuciones perdidas: si el equipo estaba apagado a esa hora, ese día no se ejecuta.

**macOS** (launchd, que sí lo lanza al despertar si el Mac estaba dormido): crea `~/Library/LaunchAgents/com.clasificador-gmail.plist` cambiando `TU_USUARIO` y la ruta. Es mejor que la carpeta esté en tu carpeta de usuario y no en Documentos ni Escritorio, porque macOS restringe el acceso a esas dos.
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>com.clasificador-gmail</string>
  <key>ProgramArguments</key><array>
    <string>/Users/TU_USUARIO/clasificador/.venv/bin/python</string>
    <string>/Users/TU_USUARIO/clasificador/gmail_clasificador.py</string>
  </array>
  <key>StartCalendarInterval</key><dict>
    <key>Hour</key><integer>7</integer><key>Minute</key><integer>45</integer>
  </dict>
  <key>StandardErrorPath</key><string>/Users/TU_USUARIO/clasificador/launchd_salida.txt</string>
</dict></plist>
```
```bash
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.clasificador-gmail.plist
```

**Windows** (Programador de tareas): en una terminal, con tus rutas:
```
schtasks /Create /TN "Clasificador Gmail" /SC DAILY /ST 07:45 /TR "\"C:\clasificador\.venv\Scripts\python.exe\" \"C:\clasificador\gmail_clasificador.py\""
```
Después, en el Programador de tareas, abre la tarea y ve a **Propiedades > Configuración**. Marca *"Ejecutar la tarea lo antes posible si no se ha iniciado una ejecución programada"*.

## 7. El CSV

Va separado por `;` y en UTF-8, así Excel en español lo abre bien con doble clic. Para Google Sheets usa `GMAILCLAS_CSV_SEPARADOR=,`.

| Columna | Contenido |
|---|---|
| `fecha` | Fecha y hora del correo (hora local) |
| `categoria` | `urgente`, `cliente`, `factura`, `spam`, `otro` o `sin_clasificar` (no se pudo clasificar: revísalo a mano) |
| `remitente`, `asunto` | Quién y de qué |
| `resumen` | Una frase con lo que pide o informa, con importes y plazos si los hay |
| `adjuntos` | Nombres de los archivos adjuntos (su contenido no se envía a Claude) |
| `nuevo` | `sí` si es la primera mañana en que aparece, `no` si ya salió otro día y sigue sin leer |
| `enlace` | Abre el correo en Gmail (en la primera cuenta con sesión iniciada en el navegador) |

El orden es urgente, sin_clasificar, cliente, factura, otro y spam. Dentro de cada grupo, primero lo más reciente.

## 8. Cómo saber si ha fallado

- **Correo de aviso**: te llega "[Clasificador Gmail] Fallo el dd/mm/aaaa" con el motivo. Se desactiva con `GMAILCLAS_AVISO_FALLO=0`. No puede llegar si lo que falla es el propio acceso a Gmail o la conexión a internet. Por eso, la señal más simple es otra: **si hoy no hay CSV, algo ha ido mal**.
- **Log**: en `gmail_clasificador.log`, junto al script. Cada ejecución deja una línea `OK: N correos (...)` o un `ERROR` con la causa.
- **Filas `sin_clasificar`**: la API de Claude falló con esos correos. Salen arriba en el CSV y se reintentan en la siguiente ejecución.
- **Código de salida** (para quien lo integre en otras herramientas): `0` todo bien · `1` configuración incorrecta · `2` fallo de Gmail, de Claude o inesperado · `3` terminó, pero con correos sin clasificar.

## 9. Modelo y coste

- Por defecto usa `claude-haiku-5-5` con esfuerzo `low`. Es el modelo pequeño y rápido de Claude, y sobra para clasificar y resumir.
- Si confunde correos de tu sector, prueba primero a mejorar `negocio` en `reglas.json`. Después sube a `GMAILCLAS_ESFUERZO=medium`. Si aun así no basta, cambia a `GMAILCLAS_MODELO=claude-sonnet-5-5`, que es más capaz y unas 20 veces más caro por token.
- Si usas `claude-haiku-4-5`, deja `GMAILCLAS_ESFUERZO=` vacío (ese modelo no admite el parámetro).
- Coste orientativo: cada correo supone unos 1.000–1.500 tokens de entrada. Con los precios publicados de Haiku 5.5 en octubre de 2026 (0,10 $ por millón de tokens de entrada y 0,50 $ por millón de salida), unas decenas de correos al día salen por céntimos. Es una estimación y no está medida con tu correo: consulta los precios vigentes y el consumo real en la consola de Anthropic.
- Formas de gastar menos: las reglas `fijas`, `GMAILCLAS_FILTRO_GMAIL=-category:promotions -category:social` (no envía a Claude las pestañas Promociones ni Social) y un `GMAILCLAS_MAX_CARACTERES` más bajo.

## 10. Privacidad y seguridad

- A la API de Anthropic se envían el remitente, el asunto, los nombres de los adjuntos y los primeros 3.000 caracteres del cuerpo, quitando las líneas citadas con `>` de respuestas anteriores. Nunca se envía el contenido de los adjuntos. Si tratas datos sensibles, revisa las condiciones de uso de datos de Anthropic.
- El `.env` contiene claves que dan acceso a tu correo. No lo compartas ni lo subas a git (el `.gitignore` incluido ya lo excluye). En Linux y macOS: `chmod 600 .env`. Puedes revocar la contraseña de aplicación cuando quieras en https://myaccount.google.com/apppasswords.
- El contenido de los correos se trata como datos y no como instrucciones. Claude solo puede responder con una de las 5 categorías y un resumen, y el script no hace nada con tus correos: solo escribe el CSV. En el peor caso, un correo malicioso conseguiría quedar mal clasificado.
- Los asuntos que empiezan por `=`, `+`, `-` o `@` se escriben precedidos de `'`, para que Excel no los ejecute como fórmulas.

## 11. Problemas frecuentes

| Mensaje o síntoma | Solución |
|---|---|
| `Gmail rechazó el inicio de sesión` | Usa la contraseña de aplicación, no la normal. Revisa la verificación en dos pasos y, si tu cuenta es de Workspace, habla con el administrador. |
| `Faltan variables en .env` | El `.env` debe estar en la misma carpeta que el script, con las tres líneas `EDITAR` rellenas. |
| `El modelo '...' no existe` | Revisa `GMAILCLAS_MODELO` o déjalo vacío para usar el modelo por defecto. |
| `Hay N correos no leídos...; se procesan los 200 más recientes` | Sube `GMAILCLAS_MAX_CORREOS` o usa `GMAILCLAS_FILTRO_GMAIL`. |
| En Excel todo sale en una columna | Cambia `GMAILCLAS_CSV_SEPARADOR` (`;` o `,`) según tu configuración regional. |
| Aparece `resumen_<fecha>_HHMMSS.csv` | El CSV del día estaba abierto en Excel y se guardó con otro nombre. |
| El enlace abre otra cuenta de Gmail | Funciona con la primera cuenta con sesión iniciada en el navegador (`u/0`, en `_enlace_gmail` dentro del script). |

## Archivos

| Archivo | Para qué |
|---|---|
| `gmail_clasificador.py` | El script |
| `requirements.txt` | Dependencias (`anthropic`) |
| `.env.example` | Plantilla de configuración: cópiala como `.env` |
| `reglas.ejemplo.json` | Plantilla de contexto, clientes y reglas fijas: cópiala como `reglas.json` |
| `test_gmail_clasificador.py` | Pruebas sin credenciales (buzón y respuestas de Claude simulados) |
| `.gitignore` | Evita subir a git el `.env`, los CSV y los logs |

Se crean al ejecutarlo: `resumenes/` (los CSV y `.clasificador.sqlite`, la memoria de lo ya clasificado; se puede borrar sin problema) y `gmail_clasificador.log`.
