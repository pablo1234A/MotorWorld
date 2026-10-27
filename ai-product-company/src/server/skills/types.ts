/**
 * AGENT SKILLS — a skill is a reusable, versionable unit of professional know-how.
 * Agents only load the skills relevant to the task they are executing.
 */
export interface ScoreCriterion {
  criterion: string;
  weight: number;
  description: string;
}

export interface SkillDefinition {
  id: string;
  name: string;
  version: string;
  objective: string;
  knowledge: string[];
  process: string[];
  methodology: string;
  successCriteria: string[];
  commonMistakes: string[];
  constraints: string[];
  scorecard: ScoreCriterion[];
  examples: string[];
}

export function renderSkill(s: SkillDefinition): string {
  const block = (title: string, items: string[]) => (items.length ? `### ${title}\n${items.map((i) => `- ${i}`).join('\n')}\n` : '');
  return [
    `## SKILL: ${s.name} (v${s.version})`,
    `Objetivo: ${s.objective}`,
    `Metodología: ${s.methodology}`,
    block('Conocimiento', s.knowledge),
    block('Proceso', s.process.map((p, i) => `${i + 1}. ${p}`)),
    block('Criterios de éxito', s.successCriteria),
    block('Errores frecuentes a evitar', s.commonMistakes),
    block('Restricciones', s.constraints),
    s.scorecard.length
      ? `### Scorecard\n${s.scorecard.map((c) => `- ${c.criterion} (peso ${c.weight}): ${c.description}`).join('\n')}\n`
      : '',
    block('Ejemplos', s.examples),
  ]
    .filter(Boolean)
    .join('\n');
}
