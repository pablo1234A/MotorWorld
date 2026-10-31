-- Restricciones de integridad adicionales (no expresables en Prisma)
ALTER TABLE "monthly_usage" ADD CONSTRAINT "monthly_usage_non_negative" CHECK ("sent" >= 0 AND "reserved" >= 0 AND "failed" >= 0 AND "email_limit" >= 0);
ALTER TABLE "monthly_usage" ADD CONSTRAINT "monthly_usage_period" CHECK ("period_end" > "period_start");
ALTER TABLE "plans" ADD CONSTRAINT "plans_positive" CHECK ("price_cents" > 0 AND "monthly_email_limit" > 0 AND "vat_rate_bps" >= 0);
ALTER TABLE "automation_rules" ADD CONSTRAINT "automation_rules_delay" CHECK ("delay_minutes" >= 0 AND "delay_minutes" <= 43200);
ALTER TABLE "automation_rules" ADD CONSTRAINT "automation_rules_window" CHECK (
  ("send_window_start" IS NULL AND "send_window_end" IS NULL) OR
  ("send_window_start" BETWEEN 0 AND 23 AND "send_window_end" BETWEEN 1 AND 24 AND "send_window_end" > "send_window_start")
);
ALTER TABLE "businesses" ADD CONSTRAINT "businesses_cooldown" CHECK ("resend_cooldown_days" BETWEEN 0 AND 365);
ALTER TABLE "email_jobs" ADD CONSTRAINT "email_jobs_attempts" CHECK ("attempts" >= 0 AND "max_attempts" BETWEEN 1 AND 10);
ALTER TABLE "customers" ADD CONSTRAINT "customers_email_lower" CHECK ("email" = lower("email"));
ALTER TABLE "users" ADD CONSTRAINT "users_email_lower" CHECK ("email" = lower("email"));
-- Solo puede existir una plantilla por defecto por negocio
CREATE UNIQUE INDEX "email_templates_one_default" ON "email_templates" ("business_id") WHERE "is_default" = true;
