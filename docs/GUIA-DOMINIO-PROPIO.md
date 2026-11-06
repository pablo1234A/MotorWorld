# Guía: enviar los avisos desde el dominio de tu taller

> Para el taller. Es la misma guía que aparece en **Configuración → Correo → Dominio propio**. Las pantallas de cada proveedor de dominios cambian con el tiempo; por eso esta guía explica los pasos comunes y no copia menús concretos.

## Antes de empezar
- Necesitas un **dominio propio** (por ejemplo `tallersur.es`) y acceso al panel donde lo tienes contratado (el "registrador" o el proveedor de DNS: donde pagas el dominio o donde está tu web).
- Con un correo gratuito (Gmail, Hotmail, Outlook…) **no se puede**: esos dominios no son tuyos. En ese caso los avisos salen con el remitente de RevisaYa y el nombre de tu taller, y las respuestas te llegan a tu correo.

## Pasos
1. En RevisaYa, **Configuración → Correo → Dominio propio**, escribe tu dominio y la dirección de envío (por ejemplo `avisos`) y pulsa **Añadir dominio**.
2. RevisaYa te muestra una tabla de **registros DNS** (tipo, nombre, valor y, a veces, prioridad). Copia cada uno **exactamente**.
3. En el panel de tu dominio busca la sección de **DNS** (suele llamarse "Zona DNS", "Gestionar DNS" o "Registros DNS") y crea un registro por cada fila de la tabla:
   - **Tipo**: el mismo (TXT, MX o CNAME).
   - **Nombre / Host**: el de la tabla. Muchos paneles añaden tu dominio al final automáticamente: si la tabla dice `resend._domainkey` y tu panel muestra `.tallersur.es` a continuación, escribe solo `resend._domainkey`.
   - **Valor / Contenido / Destino**: cópialo entero, sin espacios de más ni comillas añadidas.
   - **Prioridad** (solo en MX): la de la tabla.
4. **Recomendado: DMARC.** Si no tienes ya un registro `_dmarc`, crea uno de tipo TXT con nombre `_dmarc` y valor `v=DMARC1; p=none; rua=mailto:tu-correo@tallersur.es`. Si ya tienes uno, no lo dupliques.
5. Vuelve a RevisaYa y pulsa **Comprobar ahora**. Los cambios de DNS tardan desde minutos hasta 72 horas; RevisaYa lo vuelve a comprobar solo cada 30 minutos durante ese tiempo.
6. Cuando aparezca **Verificado**, elige tu dominio en **Remitente de los avisos** y guarda. Envíate una prueba desde **Plantillas**.

## Si algo no funciona
- **Sigue "pendiente" después de 72 horas**: revisa que el nombre no tenga el dominio repetido (`resend._domainkey.tallersur.es.tallersur.es`) y que el valor esté completo.
- **Ya tenías un registro SPF** (TXT que empieza por `v=spf1`) en el mismo nombre: solo puede haber uno. Hay que combinarlos en uno solo; pide ayuda a quien gestione tu dominio o a soporte.
- **Tu correo deja de funcionar**: los registros de RevisaYa usan un subdominio propio y no sustituyen los de tu correo. Si has borrado algún registro existente por error, restáuralo.
- Si quitas los registros más adelante, RevisaYa lo detecta (se comprueba a diario) y vuelve a enviar con el remitente de RevisaYa: tus clientes siguen recibiendo los avisos.
