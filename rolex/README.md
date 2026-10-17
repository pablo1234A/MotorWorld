# Rolex · Submariner — sitio web

Web estática (HTML + CSS + JS sin dependencias) con una experiencia de **triple scroll**:

1. **Ensamblado** — el Submariner completo sobre marfil, con el título monumental detrás.
2. **Desmontaje** — al hacer scroll el fondo desciende al negro abisal (profundímetro 0 → 300 m)
   y el reloj se separa pieza a pieza: bisel, cristal, esfera, agujas, calibre, caja, corona, fondo y brazalete,
   cada una con su ficha técnica.
3. **Anatomía** — la vista explosionada se desplaza a un lado y aparecen las cifras clave y las llamadas a compra/cita.

Después: manifiesto, anatomía interactiva (puntos sobre todas las piezas), colección con cesta y checkout,
historia con scroll horizontal, servicio, reserva de cita con calendario, contacto, newsletter, cookies y páginas legales.

## Estructura

```
rolex/
├── index.html              Página principal
├── aviso-legal.html        LSSI-CE
├── privacidad.html         RGPD / LOPDGDD
├── cookies.html            Política de cookies
├── condiciones.html        Condiciones de venta, envío, desistimiento y garantía
└── assets/
    ├── css/main.css
    ├── js/site.js          Cabecera, menú, cookies, animaciones de entrada (todas las páginas)
    ├── js/main.js          Triple scroll, anatomía, tienda, checkout, reserva, contacto
    └── img/
        ├── submariner.webp       Reloj ensamblado (fondo recortado)
        ├── x-*.webp              Capas de la vista explosionada (transparentes)
        ├── anatomy.webp          Todas las piezas
        └── d-*.webp              Detalles recortados para anatomía e historia
```

## Ver en local

```bash
cd rolex && npx http-server -p 8080
```

## Añadir las nuevas imágenes

- **Referencias de la colección**: en `assets/js/main.js`, objeto `PRODUCTS` (nombre, precio, imagen, ficha técnica)
  y array `FAMILY` (orden de las tarjetas). Ahora en venta: Submariner Date 126610LN (ficha principal),
  GMT-Master II 126710BLRO, Datejust 41 126334, Cosmograph Daytona 126518LN y Datejust 36 con diamantes (personalizado).
  Use `dark: true` si la fotografía tiene fondo negro. Cada tarjeta abre una vista rápida con ficha y selección de talla.
- **Precios**: en el mismo objeto `PRODUCTS` (orientativos, IVA incluido).
- **Boutiques**: array `BOUTIQUES` (se usan en reserva, contacto y checkout).
- **Historia**: imágenes de cada hito en `index.html`, sección `#historia`.

Recomendado: WebP, fondo transparente o blanco para relojes, ~1200 px de alto.

## Formularios

Funcionan sin backend (simulan el envío). Para recibir los datos, indique una URL en
`CONFIG.endpoints` (`main.js`): `booking`, `contact`, `order`, `newsletter`. Se envía un `POST` JSON
(compatible con Formspree, Make, Zapier, una API propia o un CRM).
El checkout no recoge datos de tarjeta: en producción se redirige a la pasarela bancaria (Redsys, Stripe…).

## Textos legales

Los datos marcados en dorado como `[Razón social del titular]`, `[NIF/CIF]`, etc. deben completarse
con los datos reales del titular y revisarse por su asesoría legal antes de publicar.
