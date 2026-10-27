import type { SkillDefinition } from './types.js';
import { companyOrchestration, executiveStrategy, operationsPlanning } from './library/leadership.js';
import { creativeStrategy, hookEngineering, productInsight, videoEditing, videoProduction, videoQA } from './library/creative.js';
import { dataIntegrity, ecommerceCRO, performanceAnalytics, storeRiskReview } from './library/commerce.js';

export const SKILLS: SkillDefinition[] = [
  executiveStrategy,
  companyOrchestration,
  operationsPlanning,
  productInsight,
  hookEngineering,
  creativeStrategy,
  videoProduction,
  videoEditing,
  videoQA,
  ecommerceCRO,
  storeRiskReview,
  performanceAnalytics,
  dataIntegrity,
];

const byId = new Map(SKILLS.map((s) => [s.id, s]));

export function getSkill(id: string): SkillDefinition {
  const s = byId.get(id);
  if (!s) throw new Error(`Unknown skill ${id}`);
  return s;
}

export function getSkills(ids: string[]): SkillDefinition[] {
  return ids.map(getSkill);
}
