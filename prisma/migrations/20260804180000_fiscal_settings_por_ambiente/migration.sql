DROP INDEX "fiscal_settings_establishment_id_key";

-- CreateIndex
CREATE UNIQUE INDEX "fiscal_settings_establishment_id_ambiente_key" ON "fiscal_settings"("establishment_id", "ambiente");

-- Checklist explícito de ativação: emitir em produção exige liberação.
ALTER TABLE "fiscal_settings" ADD COLUMN "producao_liberada" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "fiscal_settings" ADD COLUMN "producao_liberada_em" TIMESTAMP(3);
ALTER TABLE "fiscal_settings" ADD COLUMN "producao_liberada_por" TEXT;

-- CreateTable
CREATE TABLE "fiscal_settings_events" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "fiscal_settings_id" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "valor_anterior" TEXT,
    "valor_novo" TEXT,
    "usuario_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fiscal_settings_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "fiscal_settings_events_company_id_idx" ON "fiscal_settings_events"("company_id");

-- CreateIndex
CREATE INDEX "fiscal_settings_events_fiscal_settings_id_idx" ON "fiscal_settings_events"("fiscal_settings_id");

-- AddForeignKey
ALTER TABLE "fiscal_settings_events" ADD CONSTRAINT "fiscal_settings_events_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fiscal_settings_events" ADD CONSTRAINT "fiscal_settings_events_fiscal_settings_id_fkey" FOREIGN KEY ("fiscal_settings_id") REFERENCES "fiscal_settings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
