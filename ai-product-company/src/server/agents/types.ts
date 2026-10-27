import type { Grant } from '../permissions/permissions.js';
import type { ProductField } from '../products/productContext.js';
import type { MemoryScope } from '../memory/memoryService.js';

export const AGENT_IDS = ['ATLAS', 'ALEX', 'NOVA', 'NEO', 'REX', 'MAX', 'LUNA', 'EVA', 'NOAH', 'IRIS'] as const;
export type AgentId = (typeof AGENT_IDS)[number];

export type Department = 'executive' | 'creative' | 'store' | 'analytics';

export const AGENT_STATUSES = ['IDLE', 'WORKING', 'WAITING', 'REVIEWING', 'ERROR', 'APPROVAL_REQUIRED'] as const;
export type AgentStatus = (typeof AGENT_STATUSES)[number];

export type ChatAction =
  | 'launch_strategy'
  | 'launch_video_pipeline'
  | 'launch_store_audit'
  | 'launch_analytics_review'
  | 'generate_daily_report'
  | 'save_memory';

export interface AgentDefinition {
  id: AgentId;
  name: string;
  title: string;
  department: Department;
  reportsTo: AgentId | 'OWNER';
  supervises: AgentId[];
  color: string;
  /** Who the agent is: background, personality, voice. */
  identity: string;
  specialization: string;
  mission: string;
  methodology: string[];
  skills: string[];
  tools: string[];
  grants: Grant[];
  productFields: ProductField[];
  memoryScopes: MemoryScope[];
  scorecard: { criterion: string; description: string }[];
  qualityBar: string[];
  limits: string[];
  errorBehavior: string;
  communication: string;
  reviewCapability: string;
  effort: 'low' | 'medium' | 'high';
  chatActions: ChatAction[];
}
