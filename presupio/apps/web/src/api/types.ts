// Tipos de las respuestas de la API (fases 1 y 3). Fuente: apps/api/src/modules/** y docs/api.md.
// Las fechas llegan como cadenas ISO 8601.

export type Role = 'owner' | 'admin' | 'member' | 'viewer';
export type QuoteStatus = 'draft' | 'sent' | 'responded' | 'accepted' | 'rejected';
export type ContactChannel = 'email' | 'phone' | 'whatsapp' | 'sms';
export type FollowUpChannel = 'task' | 'email' | 'phone' | 'whatsapp' | 'sms' | 'in_person';
/** sending/sent/failed solo existen en los emails automáticos (source = 'rule'). */
export type FollowUpStatus = 'pending' | 'sending' | 'sent' | 'completed' | 'failed' | 'cancelled' | 'unknown';
export type DeliveryStatus = 'sending' | 'sent' | 'delivered' | 'failed' | 'unknown';
export type FollowUpOutcome = 'no_answer' | 'left_message' | 'contacted' | 'responded' | 'wrong_contact' | 'other';
export type ExclusionReason = 'opt_out_request' | 'rejected' | 'legal' | 'bounced' | 'manual';
export type SubscriptionPlan = 'starter' | 'pro' | 'business';
export type SubscriptionStatus = 'none' | 'trialing' | 'active' | 'past_due' | 'canceled' | 'unpaid' | 'incomplete';
export type Delivery = 'sent' | 'not_configured' | 'failed';

export type Permission =
  | 'company:read'
  | 'company:update'
  | 'settings:update'
  | 'subscription:read'
  | 'members:read'
  | 'members:manage'
  | 'quotes:read'
  | 'quotes:write'
  | 'quotes:reopen'
  | 'contacts:read'
  | 'contacts:write'
  | 'follow_ups:write'
  | 'exclusions:create'
  | 'exclusions:lift'
  | 'activity:read'
  | 'data:export'
  | 'billing:manage';

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

export interface PublicUser {
  id: string;
  email: string;
  fullName: string;
  emailVerified: boolean;
}

export interface MembershipSummary {
  companyId: string;
  companyName: string;
  role: Role;
}

export interface Me {
  user: PublicUser;
  company: { id: string; name: string };
  role: Role;
  permissions: Permission[];
  memberships: MembershipSummary[];
  subscription: {
    plan: SubscriptionPlan | null;
    status: SubscriptionStatus;
    trialEndsAt: string | null;
    currentPeriodEnd: string | null;
    hasActiveAccess: boolean;
  };
}

export interface Company {
  id: string;
  name: string;
  legalName: string | null;
  taxId: string | null;
  phone: string | null;
  website: string | null;
  country: string;
  timezone: string;
  locale: string;
  currency: string;
  createdAt: string;
  updatedAt: string;
}

export interface CompanySettings {
  /** Días tras el envío en que toca cada seguimiento, de menor a mayor (por defecto 3, 7 y 14). */
  followUpScheduleDays: number[];
  allowedWeekdays: number[];
  contactWindowStart: string;
  contactWindowEnd: string;
  defaultChannel: ContactChannel;
  requireManualApproval: boolean;
  legalBasisNote: string | null;
  senderName: string | null;
  replyToEmail: string | null;
  automationEnabled: boolean;
  automationEnabledAt: string | null;
  updatedAt: string;
}

export interface PlanDefinition {
  id: SubscriptionPlan;
  name: string;
  priceCents: number;
  currency: 'EUR';
  interval: 'month';
  /** Intentos de seguimiento al mes (emails automáticos aceptados por el proveedor). */
  monthlyAttemptLimit: number;
  dailyAutomaticEmailLimit: number;
  fairUse: boolean;
}

export type TaxDisplay = 'pending' | 'included' | 'excluded';

export interface SubscriptionInfo {
  subscription: {
    plan: SubscriptionPlan | null;
    status: SubscriptionStatus;
    trialEndsAt: string | null;
    currentPeriodStart: string | null;
    currentPeriodEnd: string | null;
    cancelAtPeriodEnd: boolean;
    hasActiveAccess: boolean;
    pastDueSince: string | null;
    /** Sin plan activo la cuenta es de solo lectura (lo aplica el servidor). */
    readOnly: boolean;
    accessEndedAt: string | null;
    dataRetentionUntil: string | null;
    planDetails: PlanDefinition | null;
    paymentsEnabled: boolean;
    /** Hay una suscripción de pago viva en Stripe (cambios y cancelación por ahí). */
    managedByProvider: boolean;
    hasBillingAccount: boolean;
    taxDisplay: TaxDisplay;
  };
  plans: PlanDefinition[];
}

export interface BillingEventSummary {
  id: string;
  eventType: string;
  outcome: 'applied' | 'ignored' | 'stale' | 'unmatched' | 'error' | 'duplicate_subscription';
  subscriptionStatus: SubscriptionStatus | null;
  plan: SubscriptionPlan | null;
  createdAt: string;
}

export interface BillingInfo extends SubscriptionInfo {
  events: BillingEventSummary[];
}

export interface Member {
  userId: string;
  fullName: string;
  email: string;
  role: Role;
  joinedAt: string;
}

export interface Invitation {
  id: string;
  email: string;
  role: Role;
  expiresAt: string;
  createdAt: string;
}

export interface Contact {
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  organization: string | null;
  preferredChannel: ContactChannel | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Exclusion {
  id: string;
  contactId: string | null;
  email: string | null;
  phone: string | null;
  channel: ContactChannel | null;
  reason: ExclusionReason;
  notes: string | null;
  createdAt: string;
  createdByUserId: string | null;
  liftedAt: string | null;
  liftedByUserId: string | null;
  liftReason: string | null;
}

export interface Quote {
  id: string;
  reference: string | null;
  title: string;
  description: string | null;
  amountCents: number | null;
  currency: string;
  status: QuoteStatus;
  statusChangedAt: string;
  sentAt: string | null;
  validUntil: string | null;
  lastFollowUpAt: string | null;
  respondedAt: string | null;
  reactivatedAt: string | null;
  acceptedAt: string | null;
  acceptance: {
    confirmedByUserId: string | null;
    evidence: string | null;
    amountCents: number | null;
    amountSource: 'declared_by_company';
  } | null;
  rejectedAt: string | null;
  rejectionReason: string | null;
  archivedAt: string | null;
  externalSource: string | null;
  externalId: string | null;
  autoFollowUpEnabled: boolean;
  contact: { id: string; fullName: string; email: string | null; phone: string | null; organization: string | null };
  owner: { id: string; fullName: string | null } | null;
  outcome: { responded: boolean; reactivated: boolean; recoveredSale: boolean };
  createdAt: string;
  updatedAt: string;
}

export interface QuoteDetail {
  quote: Quote;
  pendingFollowUps: number;
  allowedTransitions: QuoteStatus[];
}

export interface QuoteSummary {
  byStatus: Record<QuoteStatus, number>;
  responded: number;
  reactivated: number;
  recoveredSales: number;
  recoveredAmountCents: number;
  recoveredAmountSource: 'declared_by_company';
  followUps: { pending: number; overdue: number; completed: number; failed: number; awaitingApproval: number };
}

export interface FollowUp {
  id: string;
  quoteId: string;
  channel: FollowUpChannel;
  status: FollowUpStatus;
  source: 'manual' | 'rule';
  title: string;
  notes: string | null;
  dueAt: string | null;
  assignedUserId: string | null;
  completedAt: string | null;
  completedByUserId: string | null;
  outcome: FollowUpOutcome | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  /** Solo emails automáticos: paso de la secuencia, aprobación e intentos. */
  sequenceStep: number | null;
  approvedAt: string | null;
  approvedByUserId: string | null;
  attemptCount: number;
  sentAt: string | null;
  failureReason: string | null;
  createdByUserId: string | null;
  createdAt: string;
  updatedAt: string;
  quote: { id: string; title: string; status: QuoteStatus };
  contact: { fullName: string };
  assignedUser: { id: string; fullName: string | null } | null;
}

export interface ActivityEntry {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  quoteId: string | null;
  quote: { id: string; title: string | null; reference: string | null } | null;
  metadata: Record<string, unknown>;
  actor: { id: string; fullName: string | null } | null;
  createdAt: string;
}

export interface ContactDetail {
  contact: Contact;
  activeExclusions: Array<{ id: string; channel: ContactChannel | null; reason: ExclusionReason; createdAt: string }>;
  quotes: Array<{
    id: string;
    title: string;
    reference: string | null;
    status: QuoteStatus;
    amountCents: number | null;
    sentAt: string | null;
    archivedAt: string | null;
  }>;
}

// ---------------------------------------------------------------------------
// Envío automático (fase 3)
// ---------------------------------------------------------------------------

export interface AutomationStatus {
  automation: {
    enabled: boolean;
    enabledAt: string | null;
    enabledBy: string | null;
    requireApproval: boolean;
    schedule: number[];
    requirements: { providerConfigured: boolean; replyToEmail: boolean; legalBasisNote: boolean; activePlan: boolean; emailVerified: boolean };
  };
  provider: { name: string; configured: boolean; tracksDelivery: boolean; fromDomain: string | null };
  counts: { scheduled: number; awaitingApproval: number; sending: number; sent30d: number; delivered30d: number; failed: number; unknown: number };
  worker: { healthy: boolean; lastRuns: Array<{ job: string; status: string; startedAt: string; finishedAt: string | null }> };
}

export interface MessageTemplate {
  step: number;
  offsetDays: number;
  version: number;
  subject: string;
  body: string;
  updatedAt: string;
}

export interface TemplateVersion {
  id: string;
  version: number;
  subject: string;
  body: string;
  createdAt: string;
  createdBy: string | null;
}

export interface TemplatePreview {
  subject: string;
  text: string;
  html: string;
  sample: boolean;
}

export interface AutomaticEmailPreview {
  to: string | null;
  replyTo: string | null;
  subject: string;
  body: string;
  text: string;
  approved: boolean;
  templateStep: number;
  templateVersion: number | null;
}

/** Un intento de envío de un email automático (trazabilidad). */
export interface MessageDelivery {
  id: string;
  attemptNumber: number;
  status: DeliveryStatus;
  channel: 'email';
  provider: string;
  providerMessageId: string | null;
  recipient: string;
  subject: string | null;
  bodyText: string | null;
  contentPurgedAt: string | null;
  templateStep: number;
  templateVersion: number;
  errorCode: string | null;
  errorDetail: string | null;
  createdAt: string;
  sentAt: string | null;
  deliveredAt: string | null;
  failedAt: string | null;
}

// ---------------------------------------------------------------------------
// Consumo del plan y métricas (fase 4)
// ---------------------------------------------------------------------------

export type UsageLevel = 'ok' | 'warning' | 'reached' | 'no_plan';

/** Un intento de seguimiento del periodo: contado (enviado) o en curso (reservado). */
export interface AttemptEvent {
  id: string;
  quoteId: string;
  quoteTitle: string;
  quoteReference: string | null;
  contactName: string;
  status: 'counted' | 'reserved';
  sentAt: string | null;
  reservedAt: string | null;
  step: number | null;
}

export interface Usage {
  plan: PlanDefinition | null;
  status: SubscriptionStatus;
  trialEndsAt: string | null;
  hasActiveAccess: boolean;
  period: { start: string; end: string; source: 'calendar_month' | 'provider'; timezone: string };
  attempts: {
    used: number;
    inProgress: number;
    limit: number;
    remaining: number;
    warningAt: number | null;
    limitReachedAt: string | null;
    level: UsageLevel;
  };
  automaticEmails: { today: number; dailyLimit: number };
  /** Informativo: recuperaciones registradas en el periodo (no consumen el plan). */
  recoveriesRecorded: number;
  events: AttemptEvent[];
}

export interface Metrics {
  period: { month: string; start: string; end: string; timezone: string; inProgress: boolean; beforeAccountCreated: boolean };
  quotes: { registered: number; sent: number; pendingNow: number };
  followUps: {
    automaticScheduledNow: number;
    automaticAwaitingApprovalNow: number;
    automaticSent: number;
    automaticDelivered: number;
    automaticFailed: number;
    failedAttempts: number;
    manualContacts: number;
    manualPendingNow: number;
  };
  outcomes: {
    responded: number;
    respondedAfterFollowUp: number;
    respondedAfterAutomaticEmail: number;
    respondedWithoutFollowUp: number;
    accepted: number;
    acceptedAfterFollowUp: number;
    acceptedAfterFollowUpAmountCents: number;
    amountSource: 'declared_by_company';
  };
  attempts: { counted: number };
  recoveries: { recorded: number };
  responseRate: {
    quotesWithFollowUp: number;
    respondedAfterFollowUp: number;
    rate: number | null;
    minSample: number;
    finalAfter: string;
    final: boolean;
  };
}

export interface MetricsMonth {
  month: string;
  quotesSent: number;
  followUpsDone: number;
  respondedAfterFollowUp: number;
  acceptedAfterFollowUp: number;
  attemptsCounted: number;
}
