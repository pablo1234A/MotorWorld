export type Asset = {
  id: string;
  kind: "image" | "video" | "audio" | "other";
  source: string;
  name: string;
  mime: string;
  size_bytes: number;
  width?: number | null;
  height?: number | null;
  duration?: number | null;
  fps?: number | null;
  has_audio?: boolean | null;
  is_favorite: boolean;
  project_id?: string | null;
  parent_id?: string | null;
  generation_id?: string | null;
  meta: Record<string, any>;
  created_at: string;
  url: string;
  download_url: string;
  thumbnail_url?: string | null;
};

export type JobStatus = "queued" | "processing" | "completed" | "failed" | "cancelled";

export type Generation = {
  id: string;
  task: string;
  model_id: string;
  model_name: string;
  provider?: string | null;
  provider_endpoint?: string | null;
  status: JobStatus;
  progress?: number | null;
  status_message: string;
  prompt: string;
  negative_prompt: string;
  params: Record<string, any>;
  inputs: Record<string, string[]>;
  input_asset_ids: string[];
  output_asset_ids: string[];
  outputs: Asset[];
  estimated_cost_usd?: number | null;
  cost_note: string;
  error?: string | null;
  attempts: number;
  attempt_log: { provider: string; ok: boolean; error?: string; at: string }[];
  project_id?: string | null;
  is_saved: boolean;
  is_child: boolean;
  parent_generation_id?: string | null;
  created_at: string;
  started_at?: string | null;
  finished_at?: string | null;
  children?: Generation[];
};

export type ParamSpec = {
  name: string;
  label: string;
  type: "int" | "float" | "enum" | "bool" | "string" | "seed";
  default: any;
  min?: number | null;
  max?: number | null;
  step?: number | null;
  options?: any[] | null;
  help: string;
  advanced: boolean;
};

export type RouteInfo = { provider: string; configured: boolean; requires_key: boolean };

export type Model = {
  id: string;
  name: string;
  family: string;
  category: "image" | "video" | "audio" | "edit" | "utility";
  tasks: string[];
  task_labels: Record<string, string>;
  description: string;
  license: string;
  license_url: string;
  commercial_use: "yes" | "no" | "depends";
  open_weights: boolean;
  params: ParamSpec[];
  supports_negative_prompt: boolean;
  aspect_ratios: string[];
  resolutions: string[];
  durations: number[];
  max_outputs: number;
  limitations: string;
  quality_tier: "draft" | "standard" | "high" | "top";
  routes: { provider: string; endpoints: Record<string, string>; priority: number; price?: { usd: number | null; unit: string; note: string } | null }[];
  route_status: RouteInfo[];
  local_only: boolean;
  tags: string[];
  available: boolean;
  is_free_option: boolean;
  has_local_route: boolean;
};

export type Provider = {
  id: string;
  name: string;
  kind: string;
  homepage: string;
  docs_url: string;
  requires_key: boolean;
  key_env?: string | null;
  signup_url: string;
  configured: boolean;
  key_source?: string | null;
  free_tier: string;
  commercial_note: string;
  byok: boolean;
  health?: { ok: boolean; message: string } | null;
  models: string[];
  setup_hint: string;
};

export type User = { id: string; email: string; display_name: string; preferences: Record<string, any>; is_admin: boolean; created_at: string };

export type Project = {
  id: string;
  name: string;
  description: string;
  kind: string;
  cover_url?: string | null;
  asset_count?: number;
  generation_count?: number;
  film_count?: number;
  timeline_count?: number;
  created_at: string;
  updated_at?: string;
  films?: { id: string; title: string; updated_at: string }[];
  timelines?: { id: string; name: string; updated_at: string }[];
};
