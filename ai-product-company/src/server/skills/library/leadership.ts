import type { SkillDefinition } from '../types.js';

export const executiveStrategy: SkillDefinition = {
  id: 'executive-strategy',
  name: 'Executive Strategy & Prioritization',
  version: '1.0',
  objective: 'Convertir los objetivos del propietario y la situación real del producto en una estrategia priorizada, medible y ejecutable.',
  methodology: 'Diagnóstico → oportunidades → apuestas priorizadas (ICE) → objetivos con criterio de éxito → delegación → revisión.',
  knowledge: [
    'Un objetivo de negocio ("vender más") se descompone en palancas: tráfico (alcance creativo), conversión (página/oferta), valor medio (bundles/upsell) y retención.',
    'Con un producto nuevo y sin datos, la palanca de mayor aprendizaje es la creativa: varios ángulos de vídeo testeables + eliminar fricción evidente en la página de producto.',
    'ICE = Impact × Confidence × Ease (1-10 cada uno). Prioriza por ICE, pero nunca lances más trabajo del que la empresa puede revisar con calidad.',
    'Toda decisión estratégica debe registrar: contexto, opción elegida, alternativas descartadas y cómo se medirá.',
    'Sin conectores de analytics no existen métricas reales: la estrategia debe incluir cómo se medirá cuando existan, no cifras inventadas.',
  ],
  process: [
    'Leer el producto activo completo y la memoria de decisiones previas.',
    'Diagnosticar: qué sabemos, qué falta (campos vacíos), qué riesgos hay.',
    'Identificar 3-5 oportunidades concretas ligadas a dolores/deseos reales del producto.',
    'Puntuar cada oportunidad con ICE y elegir las apuestas que caben en la capacidad actual.',
    'Formular objetivos con workflow responsable, prioridad, cantidad y criterio de éxito.',
    'Enviar los objetivos a ALEX y registrar las decisiones en memoria global.',
  ],
  successCriteria: [
    'Cada objetivo está ligado a un dolor, deseo u objeción concreto del producto.',
    'Cada objetivo tiene un workflow ejecutable y un criterio de éxito verificable.',
    'Se explicitan las hipótesis y la información que falta.',
  ],
  commonMistakes: [
    'Estrategias genéricas válidas para cualquier producto.',
    'Lanzar demasiados frentes a la vez.',
    'Citar métricas de mercado o de rendimiento que nadie ha medido.',
  ],
  constraints: ['Nunca inventar datos de ventas, mercado o competencia.', 'Las acciones irreversibles se envían al Approval Center.'],
  scorecard: [
    { criterion: 'Especificidad', weight: 3, description: 'Ligada al producto real, no genérica.' },
    { criterion: 'Priorización', weight: 2, description: 'Orden justificado con ICE.' },
    { criterion: 'Ejecutabilidad', weight: 3, description: 'Se puede convertir en tareas sin ambigüedad.' },
    { criterion: 'Honestidad', weight: 2, description: 'Hipótesis marcadas, sin cifras inventadas.' },
  ],
  examples: [
    'Objetivo: "Validar 2 ángulos creativos (dolor de espalda vs. productividad) con 2 vídeos" — workflow video_pipeline, prioridad high, éxito: ambos aprobados por LUNA ≥ 75.',
  ],
};

export const companyOrchestration: SkillDefinition = {
  id: 'company-orchestration',
  name: 'Company Orchestration & Reporting',
  version: '1.0',
  objective: 'Coordinar a toda la empresa, supervisar a ALEX, comunicar con el propietario y producir informes ejecutivos fiables.',
  methodology: 'Comunicación ejecutiva BLUF (Bottom Line Up Front) + informes basados exclusivamente en hechos registrados.',
  knowledge: [
    'BLUF: primero la conclusión, después el porqué, después los detalles.',
    'Un informe ejecutivo responde: qué se hizo, qué resultado tuvo, qué está bloqueado, qué decisión necesito del propietario, qué haremos mañana.',
    'Los errores se comunican siempre, con causa, impacto y siguiente paso.',
  ],
  process: [
    'Revisar el estado real (tareas, entregas, aprobaciones, errores).',
    'Separar hechos (registrados en el sistema) de interpretaciones.',
    'Redactar con BLUF, en el idioma del propietario, sin relleno.',
  ],
  successCriteria: ['Toda cifra del informe procede del sistema.', 'Las decisiones pendientes del propietario quedan explícitas.'],
  commonMistakes: ['Ocultar errores o bloqueos.', 'Informes largos sin conclusión.'],
  constraints: ['No prometer resultados de negocio.', 'No inventar métricas.'],
  scorecard: [
    { criterion: 'Claridad', weight: 3, description: 'Conclusión en la primera línea.' },
    { criterion: 'Fidelidad', weight: 3, description: 'Coincide con los datos del sistema.' },
  ],
  examples: ['"BLUF: 2 vídeos aprobados y en Delivery Center; 1 cambio de tienda HIGH RISK espera tu aprobación."'],
};

export const operationsPlanning: SkillDefinition = {
  id: 'operations-planning',
  name: 'Operations Planning & Delivery Management',
  version: '1.0',
  objective: 'Convertir objetivos estratégicos en planes de trabajo con tareas concretas, responsables, dependencias, prioridades y deadlines.',
  methodology: 'WBS (Work Breakdown Structure) + matriz RACI + camino crítico + control de WIP.',
  knowledge: [
    'Cada entregable tiene un único responsable (R) y un supervisor que lo acepta (A).',
    'El pipeline de vídeo es secuencial: NOVA (hooks) → NEO (blueprint) → REX (producción) → MAX (edición) → LUNA (QA). Su camino crítico es la suma de los cinco pasos.',
    'La auditoría de tienda es EVA (análisis) → NOAH (clasificación de riesgo) → propietario (solo HIGH RISK).',
    'El análisis de rendimiento es IRIS y depende de conectores de datos; sin ellos produce un plan de medición y analiza solo datos internos reales.',
    'Deadlines realistas: hooks 2h, blueprint 2h, producción 4h, edición 3h, QA 1h, auditoría tienda 4h, análisis 4h.',
    'Limitar el WIP: no lanzar más de 3 pipelines de vídeo simultáneos.',
  ],
  process: [
    'Leer el objetivo de ATLAS y el producto activo.',
    'Descomponer en workstreams y asignar al especialista correcto.',
    'Definir dependencias, prioridad y deadline de cada workstream.',
    'Lanzar los workflows correspondientes y avisar a cada agente.',
    'Supervisar progreso, detectar bloqueos y reasignar o escalar.',
  ],
  successCriteria: ['Ningún trabajo sin responsable.', 'Dependencias explícitas.', 'Plan alineado con la capacidad.'],
  commonMistakes: ['Asignar trabajo creativo sin hooks previos.', 'Saltarse el QA.', 'Deadlines irreales.'],
  constraints: ['Solo puede lanzar los workflows permitidos: video_pipeline, store_audit, analytics_review.'],
  scorecard: [
    { criterion: 'Cobertura', weight: 3, description: 'El plan cubre el objetivo completo.' },
    { criterion: 'Secuenciación', weight: 2, description: 'Dependencias correctas.' },
    { criterion: 'Realismo', weight: 2, description: 'Cantidad y plazos razonables.' },
  ],
  examples: [
    '"Para conseguir este objetivo necesito: 1. NOVA → crear hooks · 2. NEO → crear conceptos · 3. REX → producir vídeos · 4. MAX → editar · 5. LUNA → revisar · 6. EVA → revisar la página de producto."',
  ],
};
