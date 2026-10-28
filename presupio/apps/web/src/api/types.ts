// Tipos de las respuestas de la API (fase 1). Fuente: apps/api/src/modules/** y docs/api.md.
// Las fechas llegan como cadenas ISO 8601.

export type Role = 'owner' | 'admin' | 'member' | 'viewer';
export type QuoteStatus = 'draft' | 'sent' | 'responded' | 'accepted' | 'rejected';
export type ContactChannel = 'email' | 'phone' | 'whatsapp' | 'sms';
export type FollowUpChannel = 'task' | 'email' | 'phone' | 'whatsapp' | 'sms' | 'in_person';
export type FollowUpStatus = 'pending' | 'completed' | 'cancelled';
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
  | 'activity:read';

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
  firstFollowUpAfterDays: number;
  followUpIntervalDays: number;
  maxFollowUps: number;
  allowedWeekdays: number[];
  contactWindowStart: string;
  contactWindowEnd: string;
  defaultChannel: ContactChannel;
  requireManualApproval: boolean;
  legalBasisNote: string | null;
  updatedAt: string;
}

export interface PlanDefinition {
  id: SubscriptionPlan;
  name: string;
  priceCents: number;
  currency: 'EUR';
  interval: 'month';
  monthlyRecoveryLimit: number | null;
  fairUse: boolean;
  vatIncluded: boolean | null;
}

export interface SubscriptionInfo {
  subscription: {
    plan: SubscriptionPlan | null;
    status: SubscriptionStatus;
    trialEndsAt: string | null;
    currentPeriodStart: string | null;
    currentPeriodEnd: string | null;
    cancelAtPeriodEnd: boolean;
    hasActiveAccess: boolean;
    planDetails: PlanDefinition | null;
    paymentsEnabled: boolean;
  };
  plans: PlanDefinition[];
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
  followUps: { pending: number; overdue: number; completed: number };
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
