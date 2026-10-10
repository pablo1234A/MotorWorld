# Plan de lanzamiento: 30 días

## Semana 1: publicar con garantías
- [ ] Comprar el dominio y actualizar `site.url` en `src/data/site.mjs`.
- [ ] Rellenar los datos del titular (aviso legal y privacidad) y el correo de contacto (`contactEmail`).
- [ ] Desplegar `site/` en un alojamiento estático (Cloudflare Pages o Netlify). Comando de build: `node src/build.mjs`; directorio: `site`.
- [ ] Dar de alta el sitio en Google Search Console y Bing Webmaster Tools y enviar el sitemap.
- [ ] Confirmar en las webs oficiales los precios marcados como «fuentes secundarias» (Make, ChatGPT) y los planes gratuitos.
- [ ] Solicitar la entrada en los programas de afiliación de Make, Hostinger, Tidio y ManyChat. Preguntar a Holded y a otros programas de facturación españoles si tienen programa de partners.

## Semana 2: contenido con intención (Verifactu primero)
- [ ] Guía comparativa «Programas de facturación con Verifactu para autónomos» (Holded y otros 4 o 5), con capturas propias y precios verificados.
- [ ] Guía «Responder reseñas de Google con IA» (se apoya en la plantilla que ya existe).
- [ ] Añadir 2 o 3 herramientas de facturación al catálogo.
- [ ] Probar de verdad 5 herramientas y sustituir su valoración preliminar por una prueba documentada.

## Semana 3: distribución
- [ ] Contactar con 10 gestorías o asesorías: ofrecerles la guía de Verifactu y la calculadora del precio por hora para sus clientes.
- [ ] Publicar en LinkedIn y en grupos de autónomos (respetando sus normas), siempre con contenido útil y no con enlaces sueltos.
- [ ] Crear el primer producto prémium (kit Verifactu o escenarios de Make) y avisar a la lista de espera.
- [ ] Publicar la oferta de servicios de automatización en una página propia.

## Semana 4: medir y ajustar
- [ ] Revisar en Search Console las consultas con impresiones y mejorar el título y la descripción de las páginas con CTR bajo.
- [ ] Una página de oficio nueva, basada en las consultas reales que aparezcan.
- [ ] Revisar los precios del catálogo y actualizar `site.reviewed`.

## Métricas
| Métrica | Herramienta | Por qué |
|---|---|---|
| Impresiones, clics, CTR y posición media por página | Search Console | Validar las hipótesis de palabras clave |
| Páginas indexadas | Search Console | Detectar problemas técnicos |
| Usos del buscador, del comparador y de las calculadoras | Analítica sin cookies (por ejemplo Plausible o Cloudflare Web Analytics) | Medir el valor de las utilidades. Hay que actualizar la política de privacidad al instalarla |
| Clics salientes a la web oficial o de afiliado | La misma analítica | Base para estimar ingresos por afiliación |
| Altas en la lista de espera y contactos de servicios | Correo | Validar productos y servicios |
| Ingresos por fuente | Paneles de afiliación y ventas | Decidir dónde invertir tiempo |
