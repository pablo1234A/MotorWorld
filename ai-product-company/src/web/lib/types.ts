/** Shapes returned by the API (kept in sync with src/server). */
export interface AgentState {
  agentId: string;
  status: string;
  currentTaskId: string | null;
  statusNote: string | null;
  lastActiveAt: string | null;
  tasksCompleted: number;
  tasksFailed: number;
  avgScore: number | null;
}

export interface AgentSummary {
  id: string;
  name: string;
  title: string;
  department: string;
  color: string;
  reportsTo: string;
  supervises: string[];
  mission: string;
  state: AgentState;
  currentTask: { id: string; title: string; status: string; type: string; startedAt: string | null } | null;
}

export interface Activity {
  id: number;
  agentId: string | null;
  kind: string;
  action: string;
  taskId: string | null;
  result: string | null;
  error: string | null;
  details: unknown;
  createdAt: string;
}

export interface Message {
  id: string;
  channel: string;
  fromId: string;
  toId: string;
  conversationId: string | null;
  taskId: string | null;
  workflowRunId: string | null;
  kind: string;
  content: string;
  data: { engine?: string; actions?: { type: string; ok: boolean; detail: string }[] } | null;
  createdAt: string;
}

export interface TimelineStep {
  key: string;
  agent: string;
  label: string;
  taskType: string;
  status: string;
  attempts: number;
  taskId: string | null;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  type: string;
  agentId: string;
  supervisorId: string | null;
  priority: string;
  productId: string | null;
  campaignId: string | null;
  workflowRunId: string | null;
  stepKey: string | null;
  deadline: string | null;
  dependsOn: string[];
  status: string;
  input: Record<string, unknown>;
  result: { output?: unknown; summary?: string; score?: number | null; data?: Record<string, unknown> } | null;
  review: { reviewer: string; passed: boolean; issues: string[]; at: string }[];
  error: string | null;
  attempts: number;
  maxAttempts: number;
  revision: number;
  engine: string | null;
  createdBy: string;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

export interface WorkflowRun {
  id: string;
  type: string;
  title: string;
  productId: string | null;
  campaignId: string | null;
  parentRunId: string | null;
  status: string;
  currentStep: string | null;
  cycle: number;
  context: Record<string, unknown>;
  error: string | null;
  createdAt: string;
  completedAt: string | null;
}

export interface Delivery {
  id: string;
  videoId: string;
  productId: string;
  productName: string;
  campaignId: string | null;
  campaignName: string | null;
  title: string;
  status: string;
  videoStatus: string;
  score: number | null;
  hook: string | null;
  createdBy: string;
  posterAsset: string | null;
  finalAsset: string | null;
  rawAsset: string | null;
  revisions: number;
  workflowRunId: string;
  createdAt: string;
  updatedAt: string;
}

export interface Approval {
  id: string;
  kind: string;
  title: string;
  description: string;
  risk: string;
  payload: Record<string, unknown>;
  requestedBy: string;
  status: string;
  ownerNote: string | null;
  relatedType: string | null;
  relatedId: string | null;
  createdAt: string;
  resolvedAt: string | null;
}

export interface Integration {
  id: string;
  name: string;
  category: string;
  kind: string;
  status: string;
  description: string;
  capabilities: string[];
  requiredEnv: string[];
  notes: string[];
  active: boolean;
}

export interface Settings {
  autopilot: boolean;
  autopilotIntervalMinutes: number;
  maxRevisionCycles: number;
  maxTaskAttempts: number;
  dailyReportHour: number;
  maxLlmCallsPerDay: number;
  maxConcurrentTasks: number;
  qaApprovalThreshold: number;
  language: 'es' | 'en';
  defaultVideosPerObjective: number;
}

export interface Metrics {
  videos: { total: number; byStatus: Record<string, number>; reviewed: number; avgScore: number | null; approvedFirstPass: number; revisionRate: number };
  hooksByFamily: { family: string; videos: number; avgScore: number | null }[];
  tasks: { total: number; byStatus: Record<string, number>; failureRate: number; avgMinutesByType: Record<string, number> };
  findings: { total: number; byRisk: Record<string, number>; byStatus: Record<string, number> };
  approvals: { pending: number };
  llm: { engine: string; callsToday: number };
}

export interface Snapshot {
  engine: string;
  llmConnected: boolean;
  activeProduct: { id: string; name: string; status: string; price: number | null; currency: string; image: string | null; marginPct: number | null } | null;
  agents: AgentSummary[];
  tasks: Record<string, number>;
  activeWorkflows: (WorkflowRun & { timeline: TimelineStep[] })[];
  recentWorkflows: WorkflowRun[];
  deliveries: { total: number; byStatus: Record<string, number>; latest: Delivery[] };
  approvals: { pending: number; items: Approval[] };
  errors: { failed: number; blocked: number; agentsInError: string[]; recent: Activity[] };
  performance: Metrics;
  activity: Activity[];
  messages: Message[];
  settings: Settings;
  integrations: { id: string; name: string; category: string; status: string; active: boolean }[];
  busyAgents: string[];
}

export interface ProductAsset {
  id: string;
  kind: 'image' | 'video';
  originalName: string;
  mime: string;
  size: number;
}

export interface Product {
  id: string;
  name: string;
  description: string;
  price: number | null;
  cost: number | null;
  currency: string;
  margin: number | null;
  marginPct: number | null;
  features: string[];
  benefits: string[];
  problemSolved: string;
  targetAudience: string;
  buyerPersona: string;
  customerDesires: string[];
  customerPains: string[];
  objections: string[];
  competitors: string[];
  competitiveAdvantages: string[];
  differentiators: string[];
  brandTone: string;
  visualStyle: string;
  cta: string;
  storeUrl: string;
  additionalInfo: string;
  notes: string;
  status: string;
  isActive: boolean;
  images: ProductAsset[];
  videos: ProductAsset[];
  campaigns: { id: string; name: string; status: string; objective: string }[];
  createdAt: string;
  updatedAt: string;
}

export interface MemoryEntry {
  id: string;
  scope: string;
  scopeId: string;
  kind: string;
  title: string;
  content: string;
  importance: number;
  author: string;
  createdAt: string;
}
