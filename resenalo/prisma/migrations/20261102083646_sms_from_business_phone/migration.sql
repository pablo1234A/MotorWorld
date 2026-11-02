-- AlterTable
ALTER TABLE "businesses" DROP COLUMN "sms_sender_id";

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "phone" TEXT;

-- CreateTable
CREATE TABLE "sms_devices" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'SMSGATE',
    "api_base_url" TEXT NOT NULL,
    "login" TEXT NOT NULL,
    "password_enc" TEXT NOT NULL,
    "device_id" TEXT,
    "device_name" TEXT,
    "phone_number" TEXT,
    "status" "ConnectionStatus" NOT NULL DEFAULT 'ACTIVE',
    "webhook_token" TEXT NOT NULL,
    "webhook_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "last_seen_at" TIMESTAMP(3),
    "last_checked_at" TIMESTAMP(3),
    "last_error" TEXT,
    "connected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sms_devices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sms_devices_business_id_key" ON "sms_devices"("business_id");

-- CreateIndex
CREATE UNIQUE INDEX "sms_devices_webhook_token_key" ON "sms_devices"("webhook_token");

-- AddForeignKey
ALTER TABLE "sms_devices" ADD CONSTRAINT "sms_devices_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

