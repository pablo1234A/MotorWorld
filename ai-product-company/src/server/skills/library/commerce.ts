import type { SkillDefinition } from '../types.js';

export const ecommerceCRO: SkillDefinition = {
  id: 'ecommerce-cro',
  name: 'E-commerce CRO & Product Page Optimization',
  version: '1.0',
  objective: 'Encontrar y priorizar los problemas que impiden convertir visitas en compras, usando el producto activo y la tienda real cuando está conectada.',
  methodology: 'Modelo LIFT (Value Proposition, Relevance, Clarity, Anxiety, Distraction, Urgency) + anatomía de product page + heurísticas mobile-first.',
  knowledge: [
    'Above the fold en móvil: título orientado a beneficio, imagen principal en uso, precio, prueba social y CTA visibles sin scroll.',
    'Ansiedad: envíos, devoluciones, garantía, plazos, métodos de pago y seguridad deben estar visibles antes del checkout.',
    'Objeciones del producto → bloques de respuesta en la página (FAQ, comparativas, demostración).',
    'Oferta: precio ancla, bundles, envío gratis desde umbral, garantía de devolución; coherente con el margen.',
    'Imágenes: hero en uso, detalle, escala/tamaño, antes/después, lifestyle; vídeo de demostración.',
    'Copy: beneficios > características; lenguaje del cliente; específico y verificable.',
    'Checkout: menos campos, pago exprés, sin sorpresas de coste final.',
  ],
  process: [
    'Leer el producto activo (precio, margen, objeciones, beneficios, público).',
    'Leer los datos reales de la página si hay conector (o el snapshot de la URL pública).',
    'Auditar por categorías: oferta, precio, copy, imágenes, CTA, UX, mobile, checkout, confianza, objeciones, información, fricción, claridad.',
    'Formular cada hallazgo como PROBLEM / WHY IT MATTERS / EXPECTED IMPACT / RECOMMENDED ACTION.',
    'Priorizar por impacto esperado y esfuerzo.',
  ],
  successCriteria: ['Hallazgos concretos y accionables.', 'Distinción clara entre lo observado y lo inferido.'],
  commonMistakes: ['Recomendaciones genéricas de "best practices" sin relación con el producto.', 'Afirmar cómo es la tienda sin haberla visto.'],
  constraints: [
    'Si no hay conector ni snapshot de la tienda, los hallazgos se basan en el perfil del producto y se marcan como "basado en perfil de producto".',
    'Nunca aplicar cambios directamente: NOAH clasifica el riesgo y los HIGH RISK requieren al propietario.',
  ],
  scorecard: [
    { criterion: 'Impacto', weight: 3, description: 'Afecta a la conversión de forma directa.' },
    { criterion: 'Evidencia', weight: 2, description: 'Basado en datos observados o en el perfil.' },
    { criterion: 'Accionabilidad', weight: 3, description: 'Se puede implementar tal cual.' },
  ],
  examples: [
    'PROBLEM: la objeción "¿y si no me sirve?" no se responde · WHY: es la objeción nº1 del perfil · IMPACT: alto en ansiedad de compra · ACTION: bloque de garantía de 30 días junto al CTA.',
  ],
};

export const storeRiskReview: SkillDefinition = {
  id: 'store-risk-review',
  name: 'Store Change Risk Review',
  version: '1.0',
  objective: 'Supervisar las recomendaciones de EVA y clasificar el riesgo de cada cambio para que nada peligroso se ejecute sin autorización.',
  methodology: 'Matriz de riesgo: reversibilidad × alcance × impacto en ingresos/legal/marca.',
  knowledge: [
    'LOW RISK: cambios de copy o contenido reversibles, sin efecto en precio, pagos ni promesas legales (p.ej. reordenar bloques, añadir FAQ).',
    'MEDIUM RISK: cambios visibles de oferta o estructura reversibles con impacto moderado (nuevas imágenes, reordenar variantes, bundles sin cambiar precio base).',
    'HIGH RISK: precio, descuentos, políticas de devolución/garantía, checkout, pagos, envíos, claims legales/sanitarios, eliminación de contenido, cualquier cambio irreversible.',
    'Ante la duda, sube el nivel de riesgo.',
  ],
  process: [
    'Revisar cada hallazgo de EVA: ¿es correcto, específico y coherente con el producto?',
    'Clasificar riesgo con justificación.',
    'Rechazar recomendaciones incorrectas o no fundamentadas explicando por qué.',
    'Enviar los HIGH RISK al Approval Center del propietario.',
  ],
  successCriteria: ['Toda recomendación tiene riesgo y justificación.', 'Ningún HIGH RISK queda sin aprobación humana.'],
  commonMistakes: ['Clasificar cambios de precio como bajos.', 'Aprobar recomendaciones vagas.'],
  constraints: ['NOAH no ejecuta cambios: solo revisa y clasifica.'],
  scorecard: [],
  examples: ['"Bajar el precio a 39€" → HIGH RISK (impacto directo en margen e ingresos, requiere al propietario).'],
};

export const performanceAnalytics: SkillDefinition = {
  id: 'performance-analytics',
  name: 'Performance & Creative Analytics',
  version: '1.0',
  objective: 'Analizar ventas, conversión, creatividades, hooks y campañas con datos reales, detectar problemas y oportunidades, y decir explícitamente qué datos faltan.',
  methodology: 'Funnel (impresiones → clics → sesiones → add-to-cart → checkout → compra) + análisis creativo por hook/concepto + calidad interna (scores QA).',
  knowledge: [
    'Métricas clave: CTR, hook rate (3 s views / impresiones), hold rate, CVR, AOV, CAC, ROAS, margen de contribución.',
    'Sin conectores de ventas/ads/analytics, las únicas fuentes reales son los datos internos de la empresa: entregas, scores de QA, hooks seleccionados, revisiones, errores, tiempos de ciclo.',
    'Una conclusión necesita volumen: indicar cuándo la muestra es insuficiente.',
  ],
  process: [
    'Inventariar fuentes de datos conectadas.',
    'Analizar solo datos reales; para lo que falte, definir qué conector y qué métrica se necesitan.',
    'Detectar patrones (p.ej. qué familias de hook pasan QA con mejor score).',
    'Proponer acciones y un plan de medición.',
  ],
  successCriteria: ['Cero métricas inventadas.', 'Cada insight indica su fuente.'],
  commonMistakes: ['Rellenar huecos con benchmarks del sector presentados como datos propios.'],
  constraints: ['NUNCA inventar métricas. Si no hay datos: INTEGRATION_REQUIRED.'],
  scorecard: [],
  examples: ['"Fuente: QA interno (3 vídeos). Los hooks de familia Demostración obtienen 82 de media frente a 71 de Problema (muestra pequeña)."'],
};

export const dataIntegrity: SkillDefinition = {
  id: 'data-integrity',
  name: 'Data Integrity & Honesty',
  version: '1.0',
  objective: 'Garantizar que ningún agente presenta como hecho algo que no ha sido observado o proporcionado.',
  methodology: 'Etiquetado de origen: DATO (del sistema/propietario), HIPÓTESIS (inferencia), INTEGRATION_REQUIRED (falta conector).',
  knowledge: ['La empresa pierde credibilidad con una sola cifra inventada.'],
  process: ['Antes de afirmar algo, comprobar de dónde sale.', 'Etiquetar las inferencias.'],
  successCriteria: ['Todas las afirmaciones son trazables.'],
  commonMistakes: ['Inventar métricas, testimonios, reseñas, competidores o resultados.'],
  constraints: ['Nunca inventar APIs, integraciones, métricas, testimonios ni resultados.'],
  scorecard: [],
  examples: ['"HIPÓTESIS: el público principal compra desde móvil (no hay datos de analytics conectados)."'],
};
