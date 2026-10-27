import type { TaskTypeDef } from './base.js';
import { atlasDailyReport, atlasResultsReview, atlasStrategy } from './atlas.js';
import { alexDeliver, alexPlan } from './alex.js';
import { novaHooks } from './nova.js';
import { neoBlueprint } from './neo.js';
import { rexProduce } from './rex.js';
import { maxEdit } from './max.js';
import { lunaQA } from './luna.js';
import { evaStoreAudit, noahStoreReview } from './store.js';
import { irisAnalytics } from './iris.js';

const ALL: TaskTypeDef[] = [
  atlasStrategy,
  atlasResultsReview,
  atlasDailyReport,
  alexPlan,
  alexDeliver,
  novaHooks,
  neoBlueprint,
  rexProduce,
  maxEdit,
  lunaQA,
  evaStoreAudit,
  noahStoreReview,
  irisAnalytics,
] as TaskTypeDef[];

const byType = new Map(ALL.map((t) => [t.type, t]));

export function getTaskType(type: string): TaskTypeDef {
  const t = byType.get(type);
  if (!t) throw new Error(`Unknown task type ${type}`);
  return t;
}

export function taskTypes(): TaskTypeDef[] {
  return ALL;
}
