-- Migration: Fiscal Module MVP (NF-e / NFC-e)
-- Adds enums, fiscal fields on Company/Product, new fiscal tables,
-- fiscal permissions seed and backfill.

-- ═══════════════════════════════════════════
-- 1. Novos ENUMs
-- ═══════════════════════════════════════════

CREATE TYPE "FiscalDocumentModel" AS ENUM ('NFE', 'NFCE');
CREATE TYPE "FiscalEnvironment" AS ENUM ('HOMOLOGACAO', 'PRODUCAO');
CREATE TYPE "FiscalDocumentStatus" AS ENUM ('NAO_EMITIDO', 'PENDENTE', 'PROCESSANDO', 'AUTORIZADO', 'REJEITADO', 'ERRO', 'CONTINGENCIA', 'CANCELAMENTO_PENDENTE', 'CANCELADO', 'INUTILIZADO');
CREATE TYPE "TaxRegimeCode" AS ENUM ('SIMPLES_NACIONAL', 'SIMPLES_EXCESSO', 'REGIME_NORMAL');
CREATE TYPE "FiscalPaymentCode" AS ENUM ('DINHEIRO', 'CHEQUE', 'CARTAO_CREDITO', 'CARTAO_DEBITO', 'CREDITO_LOJA', 'VALE_ALIMENTACAO', 'VALE_REFEICAO', 'VALE_PRESENTE', 'VALE_COMBUSTIVEL', 'BOLETO', 'PIX', 'SEM_PAGAMENTO', 'OUTRO');

-- ═══════════════════════════════════════════
-- 2. Novas colunas em companies
-- ═══════════════════════════════════════════

ALTER TABLE "companies"
  ADD COLUMN "razao_social" TEXT,
  ADD COLUMN "nome_fantasia" TEXT,
  ADD COLUMN "inscricao_estadual" TEXT,
  ADD COLUMN "inscricao_municipal" TEXT,
  ADD COLUMN "crt" "TaxRegimeCode",
  ADD COLUMN "contribuinte_icms" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "fiscal_config_complete" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "codigo_ibge_municipio" TEXT,
  ADD COLUMN "telefone_fiscal" TEXT,
  ADD COLUMN "email_fiscal" TEXT;

-- ═══════════════════════════════════════════
-- 3. Novas colunas em products (dados fiscais)
-- ═══════════════════════════════════════════

ALTER TABLE "products"
  ADD COLUMN "csosn" TEXT,
  ADD COLUMN "cst_icms" TEXT,
  ADD COLUMN "cst_pis" TEXT,
  ADD COLUMN "cst_cofins" TEXT,
  ADD COLUMN "aliquota_icms" DECIMAL(12,4),
  ADD COLUMN "aliquota_pis" DECIMAL(12,4),
  ADD COLUMN "aliquota_cofins" DECIMAL(12,4),
  ADD COLUMN "fiscal_complete" BOOLEAN NOT NULL DEFAULT false;

-- ═══════════════════════════════════════════
-- 4. Tabela fiscal_settings
-- ═══════════════════════════════════════════

CREATE TABLE "fiscal_settings" (
  "id" TEXT NOT NULL,
  "establishment_id" TEXT NOT NULL,
  "company_id" TEXT NOT NULL,
  "ambiente" "FiscalEnvironment" NOT NULL DEFAULT 'HOMOLOGACAO',
  "serie_nfce" INTEGER NOT NULL DEFAULT 1,
  "proximo_numero_nfce" INTEGER NOT NULL DEFAULT 1,
  "codigo_csc" TEXT,
  "id_csc" TEXT,
  "certificado_ref" TEXT,
  "certificado_senha_ref" TEXT,
  "certificado_validade" TIMESTAMP(3),
  "certificado_subject" TEXT,
  "ativo" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  "deleted_at" TIMESTAMP(3),

  CONSTRAINT "fiscal_settings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "fiscal_settings_establishment_id_key" ON "fiscal_settings"("establishment_id");
CREATE INDEX "fiscal_settings_company_id_idx" ON "fiscal_settings"("company_id");

ALTER TABLE "fiscal_settings"
  ADD CONSTRAINT "fiscal_settings_establishment_id_fkey"
    FOREIGN KEY ("establishment_id") REFERENCES "establishments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fiscal_settings"
  ADD CONSTRAINT "fiscal_settings_company_id_fkey"
    FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ═══════════════════════════════════════════
-- 5. Tabela fiscal_documents
-- ═══════════════════════════════════════════

CREATE TABLE "fiscal_documents" (
  "id" TEXT NOT NULL,
  "company_id" TEXT NOT NULL,
  "establishment_id" TEXT NOT NULL,
  "sale_id" TEXT,
  "modelo" "FiscalDocumentModel" NOT NULL,
  "serie" INTEGER NOT NULL,
  "numero" INTEGER NOT NULL,
  "chave_acesso" TEXT,
  "ambiente" "FiscalEnvironment" NOT NULL,
  "status" "FiscalDocumentStatus" NOT NULL DEFAULT 'PENDENTE',
  "protocolo" TEXT,
  "rejeicao_codigo" TEXT,
  "rejeicao_mensagem" TEXT,
  "data_emissao" TIMESTAMP(3),
  "data_autorizacao" TIMESTAMP(3),
  "data_cancelamento" TIMESTAMP(3),
  "valor_total" DECIMAL(15,2),
  "xml_enviado" TEXT,
  "xml_autorizado" TEXT,
  "xml_cancelamento" TEXT,
  "danfe_url" TEXT,
  "qr_code" TEXT,
  "idempotency_key" TEXT,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "engine" TEXT,
  "snapshot" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  "deleted_at" TIMESTAMP(3),

  CONSTRAINT "fiscal_documents_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "fiscal_documents_chave_acesso_key" ON "fiscal_documents"("chave_acesso");
CREATE UNIQUE INDEX "fiscal_documents_sale_id_key" ON "fiscal_documents"("sale_id");
CREATE UNIQUE INDEX "fiscal_documents_idempotency_key_key" ON "fiscal_documents"("idempotency_key");
CREATE INDEX "fiscal_documents_company_id_idx" ON "fiscal_documents"("company_id");
CREATE INDEX "fiscal_documents_company_id_status_idx" ON "fiscal_documents"("company_id", "status");
CREATE INDEX "fiscal_documents_sale_id_idx" ON "fiscal_documents"("sale_id");

ALTER TABLE "fiscal_documents"
  ADD CONSTRAINT "fiscal_documents_company_id_fkey"
    FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "fiscal_documents"
  ADD CONSTRAINT "fiscal_documents_establishment_id_fkey"
    FOREIGN KEY ("establishment_id") REFERENCES "establishments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fiscal_documents"
  ADD CONSTRAINT "fiscal_documents_sale_id_fkey"
    FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ═══════════════════════════════════════════
-- 6. Tabela fiscal_status_history
-- ═══════════════════════════════════════════

CREATE TABLE "fiscal_status_history" (
  "id" TEXT NOT NULL,
  "fiscal_document_id" TEXT NOT NULL,
  "status_from" "FiscalDocumentStatus" NOT NULL,
  "status_to" "FiscalDocumentStatus" NOT NULL,
  "motivo" TEXT,
  "usuario_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "fiscal_status_history_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "fiscal_status_history_fiscal_document_id_idx" ON "fiscal_status_history"("fiscal_document_id");

ALTER TABLE "fiscal_status_history"
  ADD CONSTRAINT "fiscal_status_history_fiscal_document_id_fkey"
    FOREIGN KEY ("fiscal_document_id") REFERENCES "fiscal_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ═══════════════════════════════════════════
-- 7. Tabela fiscal_document_events
-- ═══════════════════════════════════════════

CREATE TABLE "fiscal_document_events" (
  "id" TEXT NOT NULL,
  "fiscal_document_id" TEXT NOT NULL,
  "tipo" TEXT NOT NULL,
  "detalhes" JSONB,
  "usuario_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "fiscal_document_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "fiscal_document_events_fiscal_document_id_idx" ON "fiscal_document_events"("fiscal_document_id");

ALTER TABLE "fiscal_document_events"
  ADD CONSTRAINT "fiscal_document_events_fiscal_document_id_fkey"
    FOREIGN KEY ("fiscal_document_id") REFERENCES "fiscal_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ═══════════════════════════════════════════
-- 8. Permissões fiscais — catálogo
-- ═══════════════════════════════════════════

INSERT INTO "permissions" ("code", "description") VALUES
  ('fiscal.settings.read', 'Visualizar configurações fiscais'),
  ('fiscal.settings.edit', 'Editar configurações fiscais (série, CSC, certificado)'),
  ('fiscal.emit', 'Emitir documento fiscal (NF-e / NFC-e)'),
  ('fiscal.cancel', 'Cancelar documento fiscal'),
  ('fiscal.read', 'Visualizar documentos fiscais e histórico')
ON CONFLICT ("code") DO NOTHING;

-- ═══════════════════════════════════════════
-- 9. Permissões fiscais — template padrão (ADMIN)
-- ═══════════════════════════════════════════

INSERT INTO "role_permissions" ("role", "permission_code") VALUES
  ('ADMIN', 'fiscal.settings.read'),
  ('ADMIN', 'fiscal.settings.edit'),
  ('ADMIN', 'fiscal.emit'),
  ('ADMIN', 'fiscal.cancel'),
  ('ADMIN', 'fiscal.read')
ON CONFLICT DO NOTHING;

-- ═══════════════════════════════════════════
-- 10. Backfill: concede a todas as empresas existentes (ADMIN only)
-- ═══════════════════════════════════════════

INSERT INTO "company_role_permissions" ("company_id", "role", "permission_code")
SELECT c."id", 'ADMIN', p."code"
FROM "companies" c
CROSS JOIN (
  SELECT "code" FROM "permissions"
  WHERE "code" LIKE 'fiscal.%'
) p
ON CONFLICT DO NOTHING;
