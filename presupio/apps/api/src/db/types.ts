import type { ColumnType, Generated, Insertable, Selectable, Updateable } from 'kysely';

// Tipos de la base de datos en camelCase (Kysely CamelCasePlugin traduce a snake_case).
// Deben mantenerse sincronizados con migrations/*.sql.

export type MembershipRole = 'owner' | 'admin' | 'member' | 'viewer';
export type UserTokenPurpose = 'password_reset' | 'email_verification';
export type QuoteStatus = 'draft' | 'sent' | 'responded' | 'accepted' | 'rejected';
export type ContactChannel = 'email' | 'phone' | 'whatsapp' | 'sms';
export type FollowUpChannel = 'task' | 'email' | 'phone' | 'whatsapp' | 'sms' | 'in_person';
export type FollowUpStatus = 'pending' | 'sending' | 'sent' | 'completed' | 'failed' | 'cancelled';
export type DeliveryStatus = 'sending' | 'sent' | 'delivered' | 'failed' | 'unknown';
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
  followUpScheduleDays: Generated<number[]>;
  allowedWeekdays: Generated<number[]>;
  contactWindowStart: Generated<string>;
  contactWindowEnd: Generated<string>;
  defaultChannel: Generated<ContactChannel>;
  requireManualApproval: Generated<boolean>;
  legalBasisNote: string | null;
  automationEnabled: Generated<boolean>;
  automationEnabledAt: Timestamp | null;
  automationEnabledByUserId: string | null;
  senderName: string | null;
  replyToEmail: string | null;
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
  pastDueSince: Timestamp | null;
  endedAt: Timestamp | null;
  providerPriceId: string | null;
  providerCheckoutSessionId: string | null;
  providerSyncedAt: Timestamp | null;
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
  autoFollowUpEnabled: Generated<boolean>;
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
  sequenceStep: number | null;
  sequenceKey: string | null;
  approvedAt: Timestamp | null;
  approvedByUserId: string | null;
  approvedTemplateVersionId: string | null;
  approvedSubject: string | null;
  approvedBody: string | null;
  attemptCount: Generated<number>;
  sentAt: Timestamp | null;
  failureReason: string | null;
  createdByUserId: string | null;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

export interface MessageTemplateVersionsTable {
  id: Generated<string>;
  companyId: string;
  step: number;
  version: number;
  subject: string;
  body: string;
  createdByUserId: string | null;
  createdAt: CreatedAt;
}

export interface MessageDeliveriesTable {
  id: Generated<string>;
  companyId: string;
  followUpId: string;
  quoteId: string;
  contactId: string;
  channel: ContactChannel;
  provider: string;
  templateVersionId: string | null;
  templateStep: number | null;
  templateVersion: number | null;
  attemptNumber: number;
  status: Generated<DeliveryStatus>;
  recipient: string;
  subject: string | null;
  bodyText: string | null;
  contentPurgedAt: Timestamp | null;
  providerMessageId: string | null;
  errorCode: string | null;
  errorDetail: string | null;
  unsubscribeTokenHash: string | null;
  createdAt: CreatedAt;
  sentAt: Timestamp | null;
  deliveredAt: Timestamp | null;
  failedAt: Timestamp | null;
  updatedAt: UpdatedAt;
}

export interface WebhookEventsTable {
  id: Generated<string>;
  provider: string;
  tokenHash: string;
  eventType: string;
  deliveryId: string | null;
  receivedAt: CreatedAt;
}

export interface JobRunsTable {
  id: Generated<string>;
  job: string;
  status: Generated<string>;
  startedAt: CreatedAt;
  finishedAt: Timestamp | null;
  stats: ColumnType<Record<string, unknown>, string | undefined, string>;
  error: string | null;
}

// counted / over_limit / no_active_plan: regla anterior (la recuperación consumía el plan).
// recorded: desde la 0005 las recuperaciones son solo una métrica. historical: anteriores a la medición.
export type RecoveryEventStatus = 'counted' | 'over_limit' | 'no_active_plan' | 'historical' | 'recorded';

export interface UsagePeriodsTable {
  companyId: string;
  periodStart: Timestamp;
  periodEnd: Timestamp;
  periodSource: Generated<string>;
  plan: SubscriptionPlan | null;
  recoveryLimit: number;
  recoveriesCounted: Generated<number>;
  recoveriesOverLimit: Generated<number>;
  limitReachedAt: Timestamp | null;
  attemptLimit: Generated<number>;
  attemptsCounted: Generated<number>;
  attemptsReserved: Generated<number>;
  attemptsLimitReachedAt: Timestamp | null;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

export type AttemptStatus = 'reserved' | 'counted' | 'released' | 'unverified' | 'historical';

export interface AttemptEventsTable {
  id: Generated<string>;
  companyId: string;
  followUpId: string;
  quoteId: string;
  deliveryId: string | null;
  status: AttemptStatus;
  periodStart: Timestamp | null;
  reservedAt: Timestamp | null;
  sentAt: Timestamp | null;
  releasedAt: Timestamp | null;
  releaseReason: string | null;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

export type BillingOutcome = 'applied' | 'ignored' | 'stale' | 'unmatched' | 'error' | 'duplicate_subscription';

export interface BillingEventsTable {
  id: Generated<string>;
  companyId: string | null;
  provider: string;
  providerEventId: string;
  eventType: string;
  outcome: BillingOutcome;
  subscriptionStatus: SubscriptionStatus | null;
  plan: SubscriptionPlan | null;
  detail: string | null;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

export type RetentionStage = '30_days' | '7_days' | '1_day';

export interface RetentionNoticesTable {
  id: Generated<string>;
  companyId: string;
  stage: RetentionStage;
  deletionDueAt: Timestamp;
  delivery: 'sent' | 'not_configured' | 'failed' | 'no_recipients';
  recipients: Generated<number>;
  createdAt: CreatedAt;
}

export interface RecoveryEventsTable {
  id: Generated<string>;
  companyId: string;
  quoteId: string;
  followUpId: string | null;
  followUpSource: FollowUpSource | null;
  followUpChannel: FollowUpChannel | null;
  followUpAt: Timestamp | null;
  respondedAt: Timestamp;
  responseStatus: QuoteStatus;
  registeredAt: CreatedAt;
  registeredByUserId: string | null;
  status: RecoveryEventStatus;
  periodStart: Timestamp | null;
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
  messageTemplateVersions: MessageTemplateVersionsTable;
  messageDeliveries: MessageDeliveriesTable;
  webhookEvents: WebhookEventsTable;
  jobRuns: JobRunsTable;
  usagePeriods: UsagePeriodsTable;
  recoveryEvents: RecoveryEventsTable;
  attemptEvents: AttemptEventsTable;
  billingEvents: BillingEventsTable;
  retentionNotices: RetentionNoticesTable;
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
export type MessageDelivery = Selectable<MessageDeliveriesTable>;
export type TemplateVersion = Selectable<MessageTemplateVersionsTable>;
export type UsagePeriod = Selectable<UsagePeriodsTable>;
export type RecoveryEvent = Selectable<RecoveryEventsTable>;
export type AttemptEvent = Selectable<AttemptEventsTable>;
export type BillingEvent = Selectable<BillingEventsTable>;
