-- CreateEnum
CREATE TYPE "CashSessionStatus" AS ENUM ('ABERTA', 'FECHADA');

-- CreateEnum
CREATE TYPE "CashMovementType" AS ENUM ('SANGRIA', 'SUPRIMENTO');

-- AlterTable
ALTER TABLE "companies" ADD COLUMN     "cash_blind_close" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "sales" ADD COLUMN     "cash_session_id" TEXT;

-- CreateTable
CREATE TABLE "cash_registers" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "establishment_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "cash_registers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_sessions" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "establishment_id" TEXT NOT NULL,
    "cash_register_id" TEXT NOT NULL,
    "operator_id" TEXT NOT NULL,
    "status" "CashSessionStatus" NOT NULL DEFAULT 'ABERTA',
    "opening_amount" DECIMAL(12,2) NOT NULL,
    "opened_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed_at" TIMESTAMP(3),
    "expected_cash" DECIMAL(12,2),
    "counted_cash" DECIMAL(12,2),
    "difference" DECIMAL(12,2),
    "closing_notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cash_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_movements" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "type" "CashMovementType" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "reason" TEXT,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cash_movements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "cash_registers_company_id_idx" ON "cash_registers"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "cash_registers_company_id_establishment_id_name_key" ON "cash_registers"("company_id", "establishment_id", "name");

-- CreateIndex
CREATE INDEX "cash_sessions_company_id_status_idx" ON "cash_sessions"("company_id", "status");

-- CreateIndex
CREATE INDEX "cash_sessions_cash_register_id_status_idx" ON "cash_sessions"("cash_register_id", "status");

-- CreateIndex
CREATE INDEX "cash_sessions_operator_id_status_idx" ON "cash_sessions"("operator_id", "status");

-- CreateIndex
CREATE INDEX "cash_movements_session_id_idx" ON "cash_movements"("session_id");

-- CreateIndex
CREATE INDEX "cash_movements_company_id_idx" ON "cash_movements"("company_id");

-- CreateIndex
CREATE INDEX "sales_cash_session_id_idx" ON "sales"("cash_session_id");

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_cash_session_id_fkey" FOREIGN KEY ("cash_session_id") REFERENCES "cash_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_registers" ADD CONSTRAINT "cash_registers_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_registers" ADD CONSTRAINT "cash_registers_establishment_id_fkey" FOREIGN KEY ("establishment_id") REFERENCES "establishments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_sessions" ADD CONSTRAINT "cash_sessions_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_sessions" ADD CONSTRAINT "cash_sessions_establishment_id_fkey" FOREIGN KEY ("establishment_id") REFERENCES "establishments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_sessions" ADD CONSTRAINT "cash_sessions_cash_register_id_fkey" FOREIGN KEY ("cash_register_id") REFERENCES "cash_registers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_sessions" ADD CONSTRAINT "cash_sessions_operator_id_fkey" FOREIGN KEY ("operator_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "cash_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Permissões do módulo de caixa
-- ---------------------------------------------------------------------------

INSERT INTO "permissions" ("code", "description") VALUES
    ('cash-registers.list', 'Listar caixas'),
    ('cash-registers.create', 'Criar caixa'),
    ('cash-registers.read', 'Ler dados do caixa'),
    ('cash-registers.edit', 'Editar caixa'),
    ('cash-registers.delete', 'Excluir caixa'),
    ('cash.open', 'Abrir sessão de caixa'),
    ('cash.close', 'Fechar sessão de caixa'),
    ('cash.movement', 'Registrar sangria e suprimento'),
    ('cash.list', 'Listar sessões de caixa'),
    ('cash.read', 'Ler dados da sessão de caixa')
ON CONFLICT ("code") DO NOTHING;

-- Template padrão: OWNER e ADMIN recebem tudo
INSERT INTO "role_permissions" ("role", "permission_code")
SELECT r."role", p."code"
FROM (VALUES ('OWNER'::"MembershipRole"), ('ADMIN'::"MembershipRole")) AS r("role")
CROSS JOIN (VALUES
    ('cash-registers.list'), ('cash-registers.create'), ('cash-registers.read'),
    ('cash-registers.edit'), ('cash-registers.delete'),
    ('cash.open'), ('cash.close'), ('cash.movement'), ('cash.list'), ('cash.read')
) AS p("code")
ON CONFLICT ("role", "permission_code") DO NOTHING;

-- Backfill das empresas existentes. Sem isso o ADMIN toma 403 no módulo inteiro.
-- MEMBER fica de fora: o baseline dele é vazio desde 20260728150000 e o operador
-- recebe cash.open/close/movement por perfil de permissão.
INSERT INTO "company_role_permissions" ("company_id", "role", "permission_code")
SELECT c."id", rp."role", rp."permission_code"
FROM "companies" c
CROSS JOIN "role_permissions" rp
WHERE (rp."permission_code" LIKE 'cash.%' OR rp."permission_code" LIKE 'cash-registers.%')
  AND rp."role" <> 'MEMBER'
ON CONFLICT DO NOTHING;
