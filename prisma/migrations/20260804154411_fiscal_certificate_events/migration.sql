-- CreateTable
CREATE TABLE "fiscal_certificate_events" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "fiscal_settings_id" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "subject" TEXT,
    "titular" TEXT,
    "valido_ate" TIMESTAMP(3),
    "subject_anterior" TEXT,
    "usuario_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fiscal_certificate_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "fiscal_certificate_events_company_id_idx" ON "fiscal_certificate_events"("company_id");

-- CreateIndex
CREATE INDEX "fiscal_certificate_events_fiscal_settings_id_idx" ON "fiscal_certificate_events"("fiscal_settings_id");

-- AddForeignKey
ALTER TABLE "fiscal_certificate_events" ADD CONSTRAINT "fiscal_certificate_events_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fiscal_certificate_events" ADD CONSTRAINT "fiscal_certificate_events_fiscal_settings_id_fkey" FOREIGN KEY ("fiscal_settings_id") REFERENCES "fiscal_settings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
