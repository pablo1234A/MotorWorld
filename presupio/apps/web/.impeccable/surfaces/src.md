---
version: 1
slug: "src"
primary_target: "src"
related_targets: []
---

# Presupio web app (apps/web)

Scope: authenticated product app + auth screens. Mode: Operate.
Audience/job: comercial o gerente de empresa de reformas (5–15 personas) que necesita ver qué presupuestos enviados se enfrían, registrar el siguiente contacto y confirmar resultados sin inflarlos. Oficina (escritorio) y obra (móvil, luz de día).
Constraints: datos reales de la API de la fase 1; nunca cifras inventadas; Presupio registra contactos, no los envía; español de España; WCAG AA básico.

## Direction contract

THESIS: La cartera comercial como un plano catastral: cada presupuesto pendiente es una parcela medible. Rechaza el panel por defecto de tarjetas KPI gigantes con acento único sobre gris.

OWN-WORLD: Cartografía del Catastro. Fondo blanco cartográfico, raíl de navegación en tinta verde catastral profunda, líneas de lindero de 1px, tintas de parcela pálidas como colores de estado (verde reciente, ocre toca seguimiento, ladrillo fuera de secuencia, azul respondido), rótulos de referencia en versalitas con tracking y cifras tabulares. Public Sans en toda la interfaz.

STORY: El usuario entra, ve dónde está el dinero que espera respuesta y cuánto lleva esperando según sus propias reglas, abre la parcela y registra el contacto o el resultado.

FIRST VIEWPORT: Raíl izquierdo (navegación, empresa activa). Cabecera con saludo y acción primaria "Nuevo presupuesto". Franja de estado de cartera (registrados, pendientes, seguimientos realizados, reactivadas, ventas confirmadas) con definición en cada cifra. Debajo, a ancho completo, el Plano de la cartera pendiente con su leyenda; a la derecha/abajo, actividad reciente y seguimientos que vencen.

FORM: Cartografía del Catastro, candidato 7 de 7, seed key 3a468c1e (roll degradado, sin retadores).

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
