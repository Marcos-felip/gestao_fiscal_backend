-- CreateEnum
CREATE TYPE "SaleStatus" AS ENUM ('ORCAMENTO', 'EM_ABERTO', 'CONCLUIDA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDENTE', 'APROVADO', 'RECUSADO', 'ESTORNADO');

-- CreateEnum
CREATE TYPE "FiscalStatus" AS ENUM ('NAO_EMITIDO', 'PROCESSANDO', 'AUTORIZADO', 'REJEITADO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('DINHEIRO', 'CARTAO_CREDITO', 'CARTAO_DEBITO', 'PIX', 'BOLETO', 'OUTRO');

-- CreateEnum
CREATE TYPE "FinancialType" AS ENUM ('RECEBER', 'PAGAR');

-- CreateEnum
CREATE TYPE "FinancialStatus" AS ENUM ('ABERTO', 'PARCIAL', 'PAGO', 'VENCIDO', 'CANCELADO');

-- CreateTable
CREATE TABLE "sales" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "establishment_id" TEXT NOT NULL,
    "customer_id" TEXT,
    "status" "SaleStatus" NOT NULL DEFAULT 'ORCAMENTO',
    "payment_status" "PaymentStatus" NOT NULL DEFAULT 'PENDENTE',
    "fiscal_status" "FiscalStatus" NOT NULL DEFAULT 'NAO_EMITIDO',
    "sale_number" INTEGER NOT NULL,
    "subtotal" DECIMAL(12,2) NOT NULL,
    "discount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total_amount" DECIMAL(12,2) NOT NULL,
    "payment_method" "PaymentMethod",
    "notes" TEXT,
    "sale_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "sales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sale_items" (
    "id" TEXT NOT NULL,
    "sale_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "quantity" DECIMAL(12,4) NOT NULL,
    "unit_price" DECIMAL(12,4) NOT NULL,
    "total" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "sale_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "financial_entries" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "establishment_id" TEXT,
    "type" "FinancialType" NOT NULL,
    "status" "FinancialStatus" NOT NULL DEFAULT 'ABERTO',
    "partner_id" TEXT,
    "sale_id" TEXT,
    "purchase_id" TEXT,
    "category" TEXT,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "paid_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "issue_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "due_date" TIMESTAMP(3) NOT NULL,
    "installment_number" INTEGER NOT NULL DEFAULT 1,
    "installment_total" INTEGER NOT NULL DEFAULT 1,
    "payment_method" "PaymentMethod",
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "financial_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "financial_payments" (
    "id" TEXT NOT NULL,
    "entry_id" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "paid_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "method" "PaymentMethod",
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "financial_payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sales_company_id_idx" ON "sales"("company_id");

-- CreateIndex
CREATE INDEX "sales_company_id_status_idx" ON "sales"("company_id", "status");

-- CreateIndex
CREATE INDEX "sales_company_id_sale_date_idx" ON "sales"("company_id", "sale_date");

-- CreateIndex
CREATE UNIQUE INDEX "sales_company_id_sale_number_key" ON "sales"("company_id", "sale_number");

-- CreateIndex
CREATE INDEX "sale_items_sale_id_idx" ON "sale_items"("sale_id");

-- CreateIndex
CREATE INDEX "financial_entries_company_id_type_status_idx" ON "financial_entries"("company_id", "type", "status");

-- CreateIndex
CREATE INDEX "financial_entries_company_id_due_date_idx" ON "financial_entries"("company_id", "due_date");

-- CreateIndex
CREATE INDEX "financial_payments_entry_id_idx" ON "financial_payments"("entry_id");

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_establishment_id_fkey" FOREIGN KEY ("establishment_id") REFERENCES "establishments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "partners"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_entries" ADD CONSTRAINT "financial_entries_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_entries" ADD CONSTRAINT "financial_entries_establishment_id_fkey" FOREIGN KEY ("establishment_id") REFERENCES "establishments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_entries" ADD CONSTRAINT "financial_entries_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "partners"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_entries" ADD CONSTRAINT "financial_entries_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_entries" ADD CONSTRAINT "financial_entries_purchase_id_fkey" FOREIGN KEY ("purchase_id") REFERENCES "purchases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_payments" ADD CONSTRAINT "financial_payments_entry_id_fkey" FOREIGN KEY ("entry_id") REFERENCES "financial_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Permissões do módulo de vendas
--
-- Os códigos sales.list/create/read/edit/confirm/cancel já existiam no catálogo
-- desde 20260424082316 (sobraram da primeira versão do módulo, removida em
-- 20260516000000). Aqui só falta sales.delete e o backfill nas empresas.
-- ---------------------------------------------------------------------------

INSERT INTO "permissions" ("code", "description") VALUES
    ('sales.delete', 'Deletar venda')
ON CONFLICT ("code") DO NOTHING;

-- Template padrão: cancelar e excluir ficam restritos a OWNER e ADMIN
INSERT INTO "role_permissions" ("role", "permission_code") VALUES
    ('OWNER', 'sales.delete'),
    ('ADMIN', 'sales.delete')
ON CONFLICT ("role", "permission_code") DO NOTHING;

-- Backfill das empresas existentes. Sem isso o ADMIN toma 403 em todo o módulo.
-- MEMBER fica de fora de propósito: o baseline dele é vazio desde
-- 20260728150000 e todo o acesso vem dos perfis de permissão.
INSERT INTO "company_role_permissions" ("company_id", "role", "permission_code")
SELECT c."id", rp."role", rp."permission_code"
FROM "companies" c
CROSS JOIN "role_permissions" rp
WHERE rp."permission_code" LIKE 'sales.%'
  AND rp."role" <> 'MEMBER'
ON CONFLICT DO NOTHING;
