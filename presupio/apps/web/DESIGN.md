# Presupio · Sistema de diseño

> Documenta el mundo visual **tal como está construido** en `src/styles/*.css` y `src/components/*`. Si cambias un token, cambia también este archivo.

## Mundo: cartografía catastral

Presupio trata la cartera comercial como un plano: cada presupuesto pendiente es una parcela medible. Del mundo del Catastro se toman solo cuatro cosas: **tipografía, paleta, densidad y un gesto propio**. La navegación y los controles son los estándar de una aplicación web, para que cualquier persona sepa usarla sin aprender nada nuevo.

- **Escena de uso:** oficina con luz de día y obra con el móvil al sol → tema claro, contraste alto y cifras grandes y tabulares.
- **Gesto propio:** el *Plano de la cartera pendiente* (`components/PortfolioMap.tsx`):
  - Es un treemap «squarified»: el área de cada parcela es proporcional al importe del presupuesto.
  - Su tinta indica el tramo de espera, calculado con las reglas de seguimiento de la propia empresa (`bandRules`). Los tramos son *reciente*, *toca seguimiento* y *fuera de secuencia*.
  - Cada parcela es un enlace accesible a la ficha del presupuesto.

## Color (`styles/tokens.css`)

| Rol | Token | Valor | Uso |
|---|---|---|---|
| Fondo | `--paper` | `#f4f6f3` | Fondo de la aplicación (blanco cartográfico) |
| Superficie | `--surface` / `--surface-2` | `#ffffff` / `#edf1ed` | Paneles / cabeceras de tabla, pies de diálogo |
| Tinta | `--ink` · `--ink-2` · `--ink-3` | `#17221e` · `#46564f` · `#5f6e67` | Texto principal · secundario · terciario (≥ 4,5:1) |
| Lindero | `--line` · `--line-input` | `#d9e0db` · `#74867e` | Separadores · borde de controles (≥ 3:1) |
| Raíl | `--rail` · `--rail-2` | `#133a33` · `#1d4b42` | Navegación lateral y barra superior en verde catastral |
| Acción | `--accent` | `#0e6553` | Botón principal, selección y foco. Nunca se usa como decoración |

Las **tintas de parcela** expresan estados. Cada una tiene relleno, lindero y rótulo (texto ≥ 5,8:1 sobre su relleno):

| Estado | Relleno | Rótulo |
|---|---|---|
| Reciente | `#e3efd9` | `#2f5a22` |
| Pendiente / toca seguimiento | `#f7e6b0` | `#6e4f00` |
| Fuera de secuencia | `#f4cdbd` | `#87301a` |
| Respondido | `#d9e6f5` | `#1f4b80` |
| Aceptado | `#cfe8dd` | `#1a5a42` |
| Rechazado | `#e7e4df` | `#524c45` |

El **borrador** usa un lindero discontinuo: es la parcela «en trámite».

## Tipografía

- **Public Sans Variable**, alojada en el propio proyecto (`@fontsource-variable`), sin peticiones a terceros. Una sola familia para toda la interfaz.
- **Escala fija** en rem, con relación aproximada de 1,2. Los tamaños son xs 12, sm 13, md 15 (texto), lg 17, xl 20, 2xl 24 y 3xl 30 px.
- **Pesos:** 400 en el texto, 600 en etiquetas y botones, 650 en títulos y cifras.
- **Rótulos de referencia** (`.ref`): mayúsculas, tracking 0,06em y cifras tabulares, como el número de una parcela.
- **Cifras tabulares** (`.num`, `time`) en importes, fechas y contadores. Los importes agrupan siempre los miles («3.200 €»), como en una factura.
- **Inputs a 16 px** para que iOS no haga zoom.

## Forma, espacio y elevación

- Espaciado en múltiplos de 4 px (`--s-1`…`--s-12`).
- **Radios:** 4 px en rótulos, 6 px en controles y 12 px en paneles.
- **Elevación:** los paneles usan **solo borde**. Solo las capas superpuestas llevan sombra (`--shadow-overlay`): menús, diálogos y avisos.
- **Movimiento:** 120–200 ms con *ease-out*, únicamente para cambios de estado. Respeta `prefers-reduced-motion`.

## Componentes (`src/components`)

| Componente | Notas |
|---|---|
| `Button` | Variantes `primary` · `secondary` · `ghost` · `danger` · `quiet-danger`, en tamaños `md` y `sm`. Estados de carga y deshabilitado |
| `Field` | Une etiqueta, ayuda y error al control real (`aria-describedby`, `aria-invalid`), también dentro de envoltorios |
| `StatusPill` / `.pill` | Rótulo de estado con tinta de parcela y marcador cuadrado; el del borrador es hueco |
| `Panel`, `.kv`, `.rows`, `.table` | Contenedores de información con linderos de 1 px |
| `Dialog` | `<dialog>` nativo. En móvil se convierte en hoja inferior. Solo para acciones que necesitan foco protegido: confirmar una venta, cambiar un estado, registrar un contacto |
| `Menu` | Menú desplegable con teclado (flechas y Escape) |
| `ToastProvider` | Confirmaciones de operaciones confirmadas por el servidor, en `aria-live` |
| `EmptyState`, `Skeleton`, `ErrorAlert` | Estados vacíos que enseñan el siguiente paso, carga con esqueletos y errores con código de referencia |
| `PortfolioMap` | El gesto propio (ver arriba) |

## Estructura y adaptación

- **Escritorio (≥ 1024 px):** raíl lateral fijo de 240 px y contenido con un ancho máximo de 76 rem.
- **Tablet y móvil:** barra superior en verde catastral y navegación inferior de cinco destinos (Panel, Presupuestos, Seguimientos, Contactos, Ajustes), respetando las zonas seguras.
- **Tablas:** se convierten en listas de tarjetas por debajo de 52 rem.

## Reglas del producto que afectan al diseño

- **No se inventan cifras.** Cada indicador lleva su definición, y responder, reactivar y vender se muestran por separado. Los importes aceptados se rotulan como «declarados por tu empresa».
- **Presupio registra contactos, no los envía.** Ningún texto puede sugerir que un mensaje se ha enviado o entregado.
- **Respeto al cliente final.** La lista de exclusión se ve siempre en la ficha del presupuesto y desactiva los canales afectados.

## Accesibilidad verificada (pruebas E2E con axe-core)

- Sin incumplimientos graves ni críticos de WCAG 2.1 A/AA en todas las pantallas, en escritorio y en móvil.
- Navegación por teclado completa.
- Enlace «Saltar al contenido».
- El foco se mueve al contenido al cambiar de pantalla.
- Todos los botones de solo icono tienen etiqueta.
