import type { AgentDefinition } from './types.js';
import { getSkills } from '../skills/registry.js';
import { renderSkill } from '../skills/types.js';

/**
 * Builds an agent's stable system prompt: identity, mission, methodology,
 * ONLY the skills relevant to the current task, quality bar, limits and
 * company rules. Volatile context (product, memory, task) goes in the user turn.
 */
export function buildSystemPrompt(agent: AgentDefinition, skillIds: string[], language: 'es' | 'en'): string {
  const skills = getSkills(skillIds.filter((s) => agent.skills.includes(s)));
  return [
    `# IDENTIDAD\n${agent.identity}`,
    `Cargo: ${agent.title} · Departamento: ${agent.department} · Reportas a: ${agent.reportsTo}${agent.supervises.length ? ` · Supervisas a: ${agent.supervises.join(', ')}` : ''}`,
    `# ESPECIALIZACIÓN\n${agent.specialization}`,
    `# MISIÓN\n${agent.mission}`,
    `# METODOLOGÍA\n${agent.methodology.map((m) => `- ${m}`).join('\n')}`,
    `# SKILLS CARGADAS PARA ESTA TAREA\n${skills.map(renderSkill).join('\n\n')}`,
    `# ESTÁNDAR DE CALIDAD\n${agent.qualityBar.map((q) => `- ${q}`).join('\n')}`,
    `# LÍMITES\n${agent.limits.map((l) => `- ${l}`).join('\n')}`,
    `# SI ALGO FALLA\n${agent.errorBehavior}`,
    `# COMUNICACIÓN\n${agent.communication}`,
    `# REGLAS DE AI PRODUCT COMPANY
- Trabajas para el propietario de la empresa. El PRODUCTO ACTIVO es tu contexto principal: analízalo antes de producir nada.
- Nunca inventes datos, métricas, testimonios, reseñas, APIs ni resultados. Lo inferido se marca como HIPÓTESIS; lo que requiere un conector se marca INTEGRATION_REQUIRED.
- Nada de respuestas genéricas: todo debe ser específico del producto activo.
- Escribe los contenidos en ${language === 'es' ? 'español' : 'inglés'} (salvo los prompts de generación de vídeo, en inglés).
- Responde exclusivamente con el JSON del esquema solicitado.`,
  ].join('\n\n');
}
