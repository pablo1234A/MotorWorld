/** Tipos de filas de las tablas principales (reflejan las migraciones de supabase/). */

export type SubscriptionStatus =
  | "incomplete"
  | "incomplete_expired"
  | "trialing"
  | "active"
  | "past_due"
  | "canceled"
  | "unpaid"
  | "paused";

export interface ProfileRow {
  id: string;
  email: string;
  full_name: string | null;
  notify_legal_updates: boolean;
  marketing_consent: boolean;
  marketing_consent_at: string | null;
  created_at: string;
}

export interface OrganizationRow {
  id: string;
  owner_id: string;
  business_type: string | null;
  owner_type: "persona_fisica" | "persona_juridica" | null;
  legal_name: string | null;
  trade_name: string | null;
  nif: string | null;
  address_line: string | null;
  postal_code: string | null;
  city: string | null;
  province: string | null;
  country: string;
  contact_email: string | null;
  phone: string | null;
  website_url: string | null;
  activity: string | null;
  stripe_customer_id: string | null;
  created_at: string;
}

export interface ProductRow {
  id: string;
  code: string;
  name: string;
  description: string | null;
  kind: "one_time" | "subscription";
  price_cents: number;
  currency: string;
  billing_interval: "month" | "year" | null;
  stripe_price_id: string | null;
  included_document_types: string[];
  generations_limit: number | null;
  includes_updates: boolean;
  /** Suscripciones: documentos por periodo de facturación (null = ilimitados). */
  documents_per_period: number | null;
  features: string[];
  active: boolean;
  sort_order: number;
}

export interface SubscriptionRow {
  id: string;
  organization_id: string | null;
  product_id: string | null;
  stripe_subscription_id: string;
  stripe_customer_id: string;
  status: SubscriptionStatus;
  amount_cents: number | null;
  currency: string | null;
  billing_interval: string | null;
  current_period_start?: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  cancel_at: string | null;
  canceled_at: string | null;
  ended_at: string | null;
  created_at: string;
}

export interface PurchaseRow {
  id: string;
  organization_id: string | null;
  product_id: string;
  payment_id: string | null;
  status: "active" | "refunded" | "revoked";
  document_types: string[];
  template_version_ids: Record<string, string>;
  generations_limit: number | null;
  generations_used: number;
  created_at: string;
}

export interface PaymentRow {
  id: string;
  organization_id: string | null;
  product_id: string | null;
  kind: "one_time" | "subscription";
  status: "pending" | "succeeded" | "failed" | "refunded" | "partially_refunded" | "disputed";
  amount_cents: number;
  amount_refunded_cents: number;
  currency: string;
  hosted_invoice_url: string | null;
  receipt_url: string | null;
  failure_reason: string | null;
  attempt_count: number | null;
  paid_at: string | null;
  created_at: string;
}

export interface FormResponseRow {
  id: string;
  organization_id: string;
  questionnaire_version: number;
  answers: Record<string, unknown>;
  status: "draft" | "completed";
  current_step: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface TemplateVersionRow {
  id: string;
  template_id: string;
  version_number: number;
  version_label: string;
  status: "draft" | "in_review" | "approved" | "published" | "retired";
  is_demo: boolean;
  content: unknown;
  variables: { key: string }[];
  rules: unknown[];
  changelog: string;
  questionnaire_version: number;
  legal_reviewer_name: string | null;
  legal_reviewer_credentials: string | null;
  legal_reviewed_at: string | null;
  review_reference: string | null;
  review_notes: string | null;
  published_at: string | null;
  created_at: string;
}

export interface DocumentVersionRow {
  id: string;
  document_id: string;
  organization_id: string;
  version_number: number;
  template_version_id: string;
  entitlement_source: "subscription" | "purchase";
  purchase_id: string | null;
  subscription_id: string | null;
  is_demo: boolean;
  html_path: string;
  pdf_path: string;
  content_hash: string;
  generated_at: string;
  revoked_at: string | null;
  revoked_reason: string | null;
}
