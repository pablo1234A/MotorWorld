# Angolatiens: investigación, oportunidad y estrategia

Revisión: 10 de octubre de 2026. Cada dato lleva su fuente y su nivel de verificación:
- **[Oficial]**: leído en la web del fabricante u organismo.
- **[Terceros]**: fuentes secundarias que coinciden entre sí.
- **[Hipótesis]**: criterio profesional sin verificar con datos.

> Desde este entorno no se pudo acceder a varias webs oficiales (make.com, holded.com, tidio.com, n8n.io, chatgpt.com no resolvían DNS). Por eso muchos datos son de nivel [Terceros] y hay que confirmarlos antes de usarlos en campañas.
> No se han consultado volúmenes de búsqueda ni dificultad SEO: no hay herramienta de keywords disponible. **Todas las afirmaciones sobre demanda de búsqueda son [Hipótesis]** hasta validarlas con Google Search Console, Keyword Planner o Semrush/Ahrefs.

## 1. Mercado y competencia

| Tipo de competidor | Ejemplos | Debilidad que aprovechamos |
|---|---|---|
| Directorios globales de IA | Futurepedia, There's An AI For That | En inglés, miles de herramientas sin criterio y nada de contexto español (IVA, RGPD, Verifactu) |
| Medios tecnológicos y de emprendimiento | Xataka, Emprendedores.es, blogs de bancos (BBVA) | Noticias y listas genéricas, sin herramientas interactivas ni pasos de implantación |
| Blogs de software español | Billin, Billeo, Holded, Declarando | Contenido útil pero sesgado hacia su propio producto |
| Agencias y cursos | Upliora, Coderhouse | Contenido promocional; precios que hay que contrastar |
| Iniciativas públicas | IndesIAHub (Comunidad de Madrid), Acelera Pyme | Ámbito regional o institucional, poco práctico para el día a día |

Datos de contexto:
- Según el INE, citado en los resultados de búsqueda, el 21,1 % de las empresas de 10 o más empleados usa IA, frente al 13,4 % de las de menos de 10 [Terceros]. **Lectura**: la microempresa está poco atendida y va por detrás.
- No encontramos un comparador en español centrado en autónomos con precios fechados y con su fuente [Terceros: búsqueda sin resultados]. Que la búsqueda no lo encuentre no demuestra que no exista: es una hipótesis razonable.

## 2. Oportunidad recomendada (subnicho)

**«IA y automatización sin conocimientos técnicos para autónomos y microempresas de servicios en España, organizada por tarea y por oficio.»**

Por qué:
1. **Una necesidad con fecha.** Verifactu obliga a usar sistemas de facturación adaptados: el 1 de enero de 2027 para sociedades y el 1 de julio de 2027 para autónomos [Terceros: El Independiente, Softabase]. Así que hay 9 meses de búsquedas con intención de compra de software de facturación, un producto con programas de afiliación potenciales y alto valor por cliente.
2. **El contexto español como foso.** Los directorios globales no pueden hablar de RGPD con criterio práctico, de Verifactu, de la cuota de autónomos, de WhatsApp como canal principal o del Kit Digital. Nosotros sí.
3. **Páginas por tarea y por oficio.** Búsquedas tipo «IA para peluquerías» o «presupuestos con IA» suelen tener menos competencia que «mejores herramientas IA» [Hipótesis] y convierten mejor porque la intención es concreta.
4. **Utilidades que fidelizan.** Buscador, comparador y calculadoras dan motivos para volver y para enlazarnos, cosa que un artículo no consigue.

Descartado: un blog de noticias de IA (alta competencia, caduca rápido, poco monetizable) y un directorio masivo (contenido escaso que Google penaliza y que es imposible mantener al día).

## 3. Público y propuesta de valor

- **Principal:** autónomos y microempresas de servicios (1 a 9 personas) sin perfil técnico: estética, reformas e instalaciones, clínicas pequeñas, restauración, consultoría y formación.
- **Secundario:** gestorías y asesorías que recomiendan herramientas a sus clientes. Pueden ser prescriptores y fuente de enlaces.
- **Propuesta:** «Qué IA te sirve, cuánto cuesta de verdad y cómo ponerla en marcha esta semana, explicado para tu negocio».

## 4. Programas de afiliación encontrados

| Herramienta | Estado | Condiciones públicas | Fuente |
|---|---|---|---|
| Make | Sí | 35 % de las suscripciones durante 12 meses; mínimo 100 $ y 3 usuarios de pago; pago por Wise | [Oficial] help.make.com/affiliate-program |
| Tidio | Sí | Hasta 30 %; la duración varía entre fuentes | [Oficial + Terceros] |
| ManyChat | Sí | Hasta 50 % | [Oficial] manychat.com/affiliate |
| ElevenLabs | Sí | 22 % durante 12 meses; cookie de 90 días | [Oficial + PartnerStack] |
| Fireflies | Sí | Hasta 30 % recurrente durante 12 meses | [Oficial] |
| Gamma | Sí | 30 % del primer año | [Terceros: PartnerStack] |
| Hostinger | Sí | Hasta 60 % (Horizons, página en español). Prohíbe pujar por la marca en SEM | [Oficial + Terceros] |
| Brevo | Sí | Pago fijo por registro y por cliente de pago (las cifras no coinciden) | [Terceros] |
| Notion | Cerrado | No acepta nuevos afiliados | [Oficial] |
| Zapier | No | Solo referidos para su programa de expertos | [Oficial: comunidad] |
| Canva | Sin confirmar | Impact / Canvassador | [Terceros] |
| Holded, n8n | Sin verificar | — | — |
| ChatGPT, Claude, Gemini, Copilot | No consta | — | — |

**Importante:** ninguna de estas condiciones garantiza la aceptación en el programa. En el sitio, todos los enlaces van hoy a la web oficial sin seguimiento (`affiliateUrl: null`).

## 5. Monetización (por orden de prioridad)

1. **Afiliación.** Software de facturación (Verifactu), Make, chatbots y alojamiento web. Se rellena `affiliateUrl` en `src/data/tools.mjs`, y el sitio etiqueta el enlace y añade `rel="sponsored"` automáticamente.
2. **Productos digitales propios** (sección prémium preparada con lista de espera): escenarios de Make listos para importar, guiones de atención por sector y un kit Verifactu (checklist, plantilla de migración y preguntas para el proveedor). Precio orientativo de 9 a 29 € [Hipótesis].
3. **Servicios** de automatización y webs para pymes, con el formulario de contacto como canal de entrada. Es probablemente la vía más rápida hacia los primeros 300 €/mes: un solo proyecto pequeño los cubre [Hipótesis].
4. **Patrocinios** marcados como «Contenido patrocinado».
5. **Publicidad**: solo con tráfico suficiente. Exigiría un banner de consentimiento.

**Cómo llegar a 300 €/mes y después a 3.000 €** (escenario, no previsión): 300 € ≈ 1 o 2 servicios pequeños al mes, o unas pocas decenas de ventas de un recurso de 15 €. 3.000 € exige combinar servicios recurrentes (mantenimiento de automatizaciones), afiliación con tráfico consolidado y un catálogo de productos. Ninguna cifra está garantizada.

## 6. SEO

- **Arquitectura:** `/herramientas/{slug}/` (fichas), `/guias/{slug}/` (tareas), `/negocios/{sector}/` (oficios), `/comparar/`, `/calculadoras/{slug}/`, `/plantillas/`, `/novedades/`. Profundidad máxima de 2 clics.
- **Enlazado interno:** guía → herramientas mencionadas → alternativas → comparador; oficio → guías y herramientas; calculadoras → guías.
- **Técnico:** HTML estático, sin cookies ni terceros, tipografías propias con `font-display: swap` y precarga, sitemap con lastmod, robots.txt, canonical, Open Graph, una sola h1, migas de pan con BreadcrumbList y Article en las guías. No usamos FAQPage ni Review/AggregateRating porque no hay reseñas reales.
- **Contenido:** menos páginas pero útiles. Cada guía nueva debe incluir pasos verificables, capturas propias y la fecha de revisión.

### Grupos de búsqueda para validar [Hipótesis: medir con Search Console o Keyword Planner]
- Verifactu: «verifactu autónomos», «programa facturación verifactu», «verifactu fecha».
- Tarea + IA: «presupuestos con IA», «responder reseñas google ia», «automatizar facturas».
- Oficio + IA: «ia para peluquerías», «ia para fisioterapeutas», «ia para restaurantes».
- Herramienta + intención: «make precio», «make vs zapier», «chatgpt gratis o plus».

## 7. Coste de mantenimiento

| Elemento | Esfuerzo estimado [Hipótesis] |
|---|---|
| Revisar precios de 18 herramientas | 2–3 h al mes |
| Nueva guía de calidad | 4–6 h |
| Novedades | 1 h a la semana, solo si hay algo relevante |
| Alojamiento estático (Cloudflare Pages, Netlify, GitHub Pages) | 0 € en sus planes gratuitos [según las condiciones actuales de cada proveedor] |
| Dominio | Unos 10–15 €/año [Hipótesis] |
