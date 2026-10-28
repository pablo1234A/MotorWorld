import type { ColumnType, Generated, Insertable, Selectable, Updateable } from 'kysely';

// Tipos de la base de datos en camelCase (Kysely CamelCasePlugin traduce a snake_case).
// Deben mantenerse sincronizados con migrations/*.sql.

export type MembershipRole = 'owner' | 'admin' | 'member' | 'viewer';
export type UserTokenPurpose = 'password_reset' | 'email_verification';
export type QuoteStatus = 'draft' | 'sent' | 'responded' | 'accepted' | 'rejected';
export type ContactChannel = 'email' | 'phone' | 'whatsapp' | 'sms';
export type FollowUpChannel = 'task' | 'email' | 'phone' | 'whatsapp' | 'sms' | 'in_person';
export type FollowUpStatus = 'pending' | 'completed' | 'cancelled';
export type FollowUpOutcome = 'no_answer' | 'left_message' | 'contacted' | 'responded' | 'wrong_contact' | 'other';
export type FollowUpSource = 'manual' | 'rule';
export type ExclusionReason = 'opt_out_request' | 'rejected' | 'legal' | 'bounced' | 'manual';
export type SubscriptionPlan = 'starter' | 'pro' | 'business';
export type SubscriptionStatus = 'none' | 'trialing' | 'active' | 'past_due' | 'canceled' | 'unpaid' | 'incomplete';

type Timestamp = ColumnType<Date, Date | string, Date | string>;
type CreatedAt = ColumnType<Date, Date | string | undefined, never>;
type UpdatedAt = ColumnType<Date, Date | string | undefined, Date | string | undefined>;

export interface UsersTable {
  id: Generated<string>;
  email: string;
  fullName: string;
  passwordHash: string;
  emailVerifiedAt: Timestamp | null;
  termsAcceptedAt: Timestamp;
  lastLoginAt: Timestamp | null;
  passwordChangedAt: Generated<Date>;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

export interface UserTokensTable {
  id: Generated<string>;
  userId: string;
  purpose: UserTokenPurpose;
  tokenHash: string;
  expiresAt: Timestamp;
  usedAt: Timestamp | null;
  createdAt: CreatedAt;
}

export interface CompaniesTable {
  id: Generated<string>;
  name: string;
  legalName: string | null;
  taxId: string | null;
  phone: string | null;
  website: string | null;
  country: Generated<string>;
  timezone: Generated<string>;
  locale: Generated<string>;
  currency: Generated<string>;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

export interface MembershipsTable {
  id: Generated<string>;
  companyId: string;
  userId: string;
  role: MembershipRole;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

export interface InvitationsTable {
  id: Generated<string>;
  companyId: string;
  email: string;
  role: MembershipRole;
  tokenHash: string;
  invitedByUserId: string | null;
  expiresAt: Timestamp;
  acceptedAt: Timestamp | null;
  revokedAt: Timestamp | null;
  createdAt: CreatedAt;
}

export interface SessionsTable {
  id: Generated<string>;
  userId: string;
  companyId: string;
  tokenHash: string;
  userAgent: string | null;
  createdAt: CreatedAt;
  lastSeenAt: Generated<Date>;
  expiresAt: Timestamp;
}

export interface CompanySettingsTable {
  companyId: string;
  firstFollowUpAfterDays: Generated<number>;
  followUpIntervalDays: Generated<number>;
  maxFollowUps: Generated<number>;
  allowedWeekdays: Generated<number[]>;
  contactWindowStart: Generated<string>;
  contactWindowEnd: Generated<string>;
  defaultChannel: Generated<ContactChannel>;
  requireManualApproval: Generated<boolean>;
  legalBasisNote: string | null;
  updatedByUserId: string | null;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

export interface SubscriptionsTable {
  companyId: string;
  plan: SubscriptionPlan | null;
  status: Generated<SubscriptionStatus>;
  trialEndsAt: Timestamp | null;
  currentPeriodStart: Timestamp | null;
  currentPeriodEnd: Timestamp | null;
  cancelAtPeriodEnd: Generated<boolean>;
  provider: string | null;
  providerCustomerId: string | null;
  providerSubscriptionId: string | null;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

export interface ContactsTable {
  id: Generated<string>;
  companyId: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  organization: string | null;
  preferredChannel: ContactChannel | null;
  notes: string | null;
  createdByUserId: string | null;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

export interface ContactExclusionsTable {
  id: Generated<string>;
  companyId: string;
  contactId: string | null;
  email: string | null;
  phone: string | null;
  channel: ContactChannel | null;
  reason: ExclusionReason;
  notes: string | null;
  createdByUserId: string | null;
  createdAt: CreatedAt;
  liftedAt: Timestamp | null;
  liftedByUserId: string | null;
  liftReason: string | null;
}

export interface QuotesTable {
  id: Generated<string>;
  companyId: string;
  contactId: string;
  ownerUserId: string | null;
  reference: string | null;
  title: string;
  description: string | null;
  amountCents: number | null;
  currency: Generated<string>;
  status: Generated<QuoteStatus>;
  statusChangedAt: Generated<Date>;
  sentAt: Timestamp | null;
  validUntil: ColumnType<string, string, string> | null;
  lastFollowUpAt: Timestamp | null;
  respondedAt: Timestamp | null;
  reactivatedAt: Timestamp | null;
  acceptedAt: Timestamp | null;
  acceptanceConfirmedByUserId: string | null;
  acceptanceEvidence: string | null;
  acceptedAmountCents: number | null;
  rejectedAt: Timestamp | null;
  rejectionReason: string | null;
  archivedAt: Timestamp | null;
  externalSource: string | null;
  externalId: string | null;
  createdByUserId: string | null;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

export interface FollowUpsTable {
  id: Generated<string>;
  companyId: string;
  quoteId: string;
  channel: FollowUpChannel;
  status: Generated<FollowUpStatus>;
  source: Generated<FollowUpSource>;
  title: string;
  notes: string | null;
  dueAt: Timestamp | null;
  assignedUserId: string | null;
  completedAt: Timestamp | null;
  completedByUserId: string | null;
  outcome: FollowUpOutcome | null;
  cancelledAt: Timestamp | null;
  cancelReason: string | null;
  dedupeKey: string | null;
  createdByUserId: string | null;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

export interface ActivityLogTable {
  id: Generated<string>;
  companyId: string;
  actorUserId: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  quoteId: string | null;
  metadata: ColumnType<Record<string, unknown>, string, never>;
  createdAt: CreatedAt;
}

export interface Database {
  users: UsersTable;
  userTokens: UserTokensTable;
  companies: CompaniesTable;
  memberships: MembershipsTable;
  invitations: InvitationsTable;
  sessions: SessionsTable;
  companySettings: CompanySettingsTable;
  subscriptions: SubscriptionsTable;
  contacts: ContactsTable;
  contactExclusions: ContactExclusionsTable;
  quotes: QuotesTable;
  followUps: FollowUpsTable;
  activityLog: ActivityLogTable;
}

export type User = Selectable<UsersTable>;
export type Company = Selectable<CompaniesTable>;
export type Contact = Selectable<ContactsTable>;
export type Quote = Selectable<QuotesTable>;
export type NewQuote = Insertable<QuotesTable>;
export type QuoteUpdate = Updateable<QuotesTable>;
export type FollowUp = Selectable<FollowUpsTable>;
export type ContactExclusion = Selectable<ContactExclusionsTable>;
export type CompanySettings = Selectable<CompanySettingsTable>;
export type Subscription = Selectable<SubscriptionsTable>;
export type ActivityEntry = Selectable<ActivityLogTable>;
