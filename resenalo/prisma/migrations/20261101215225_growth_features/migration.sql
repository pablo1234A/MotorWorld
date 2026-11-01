-- CreateEnum
CREATE TYPE "BillingInterval" AS ENUM ('MONTH', 'YEAR');

-- CreateEnum
CREATE TYPE "Channel" AS ENUM ('EMAIL', 'SMS');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "EmailLogEvent" ADD VALUE 'DELIVERED';
ALTER TYPE "EmailLogEvent" ADD VALUE 'REMINDER_CREATED';

-- AlterTable
ALTER TABLE "automation_rules" ADD COLUMN     "channel" "Channel" NOT NULL DEFAULT 'EMAIL',
ADD COLUMN     "reminder_delay_days" INTEGER NOT NULL DEFAULT 5,
ADD COLUMN     "reminder_enabled" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "businesses" ADD COLUMN     "sms_sender_id" TEXT,
ADD COLUMN     "trial_used_at" TIMESTAMP(3),
ADD COLUMN     "weekly_digest" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "email_jobs" ADD COLUMN     "channel" "Channel" NOT NULL DEFAULT 'EMAIL',
ADD COLUMN     "delivered_at" TIMESTAMP(3),
ADD COLUMN     "is_reminder" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "provider_status" TEXT,
ADD COLUMN     "reminder_of_id" TEXT,
ADD COLUMN     "to_phone" TEXT;

-- AlterTable
ALTER TABLE "email_templates" ADD COLUMN     "reminder_body" TEXT,
ADD COLUMN     "reminder_subject" TEXT,
ADD COLUMN     "sms_body" TEXT;

-- AlterTable
ALTER TABLE "monthly_usage" ADD COLUMN     "alert_100_at" TIMESTAMP(3),
ADD COLUMN     "alert_80_at" TIMESTAMP(3),
ADD COLUMN     "sms_limit" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "sms_reserved" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "sms_sent" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "oauth_states" ADD COLUMN     "purpose" TEXT NOT NULL DEFAULT 'email';

-- AlterTable
ALTER TABLE "plans" ADD COLUMN     "annual_price_cents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "monthly_sms_limit" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "stripe_annual_price_id" TEXT;

-- AlterTable
ALTER TABLE "subscriptions" ADD COLUMN     "billing_interval" "BillingInterval" NOT NULL DEFAULT 'MONTH',
ADD COLUMN     "trial_end" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "review_sources" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'GOOGLE_BUSINESS',
    "google_email" TEXT NOT NULL,
    "access_token_enc" TEXT,
    "refresh_token_enc" TEXT,
    "token_expires_at" TIMESTAMP(3),
    "scopes" TEXT NOT NULL,
    "status" "ConnectionStatus" NOT NULL DEFAULT 'ACTIVE',
    "account_name" TEXT,
    "location_name" TEXT,
    "location_title" TEXT,
    "last_sync_at" TIMESTAMP(3),
    "last_error" TEXT,
    "connected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "review_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reviews" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "source_id" TEXT NOT NULL,
    "external_id" TEXT NOT NULL,
    "reviewer_name" TEXT NOT NULL,
    "star_rating" INTEGER NOT NULL,
    "comment" TEXT,
    "create_time" TIMESTAMP(3) NOT NULL,
    "update_time" TIMESTAMP(3) NOT NULL,
    "reply_comment" TEXT,
    "reply_time" TIMESTAMP(3),
    "attributed_job_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reviews_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "review_sources_business_id_key" ON "review_sources"("business_id");

-- CreateIndex
CREATE UNIQUE INDEX "reviews_external_id_key" ON "reviews"("external_id");

-- CreateIndex
CREATE INDEX "reviews_business_id_create_time_idx" ON "reviews"("business_id", "create_time");

-- CreateIndex
CREATE UNIQUE INDEX "email_jobs_reminder_of_id_key" ON "email_jobs"("reminder_of_id");

-- CreateIndex
CREATE INDEX "email_jobs_status_sent_at_idx" ON "email_jobs"("status", "sent_at");

-- CreateIndex
CREATE UNIQUE INDEX "plans_stripe_annual_price_id_key" ON "plans"("stripe_annual_price_id");

-- AddForeignKey
ALTER TABLE "email_jobs" ADD CONSTRAINT "email_jobs_reminder_of_id_fkey" FOREIGN KEY ("reminder_of_id") REFERENCES "email_jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_sources" ADD CONSTRAINT "review_sources_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "review_sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_attributed_job_id_fkey" FOREIGN KEY ("attributed_job_id") REFERENCES "email_jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

